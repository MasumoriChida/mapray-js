import BufferEntry from "./BufferEntry";
import ImageEntry from "./ImageEntry";
import Buffer from "./Buffer";
import Image from "./Image";


/**
 * glTF 読み込みコンテキスト
 *
 * @memberof mapray.gltf
 * @private
 */
class Context {

    /**
     * @param {mapray.gltf.glTFLoader} loader  ローダー
     * @param {mapray.ModelData}       model   モデルデータ
     * @param {object}                 opts    オプション
     * @param {mapray.gltf.glTFLoader.FinishCallback} [opts.callback]  終了コールバック関数
     */
    constructor( loader, model, opts )
    {
        this._loader   = loader;
        this._gjson    = model.body;
        this._base_uri = model.base_uri;
        this._callback = opts.callback  || defaultFinishCallback;

        this._buffer_entries = [];  // 共有用バッファの管理 (疎配列)
        this._image_entries  = [];  // 共有用イメージの管理 (疎配列)

        this._load_count    = 0;
        this._load_failed   = false;
        this._body_finished = false;
    }


    /**
     * glTF 最上位オブジェクト
     * @type {object}
     * @readonly
     */
    get gjson() { return this._gjson; }


    /**
     * glTF でのリソース URI からリクエストする URI を解決
     *
     * @param  {string} uri  glTF でのリソース URI
     * @return {string}      リクエストする URI
     * @see https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#uris
     */
    solveResourceUri( uri )
    {
        var re_dat = /^data:/;
        var re_abs = /^[a-z][-+.0-9a-z]*:\/\//;

        if ( re_dat.test( uri ) || re_abs.test( uri ) ) {
            // uri がデータ URI または絶対 URI のときは
            // そのまま uri をリクエスト
            return uri;
        }
        else {
            // それ以外のときは uri を相対 URI と解釈し
            // 基底 URI と結合した URI をリクエスト
            var     last = this._base_uri.lastIndexOf( '/' );
            var base_uri = (last >= 0) ? this._base_uri.substr( 0 , last + 1 ) : "";
            return base_uri + uri;
        }
    }


    /**
     * fetch の初期化オブジェクトを取得
     *
     * @return {object}  fetch() に与える init オブジェクト
     */
    makeBufferFetchParams()
    {
        return {
        };
    }


    /**
     * バッファを検索
     * @param  {number} index        バッファ索引
     * @return {mapray.gltf.Buffer}  gltf.Buffer オブジェクト
     */
    findBuffer( index )
    {
        if ( this._buffer_entries[index] === undefined ) {
            this._buffer_entries[index] = new BufferEntry( new Buffer( this, index ) );
        }

        return this._buffer_entries[index].buffer;
    }


    /**
     * イメージを検索
     * @param  {number} index       イメージ索引
     * @return {mapray.gltf.Image}  gltf.Image オブジェクト
     */
    findImage( index )
    {
        if ( this._image_entries[index] === undefined ) {
            this._image_entries[index] = new ImageEntry( new Image( this, index ) );
        }

        return this._image_entries[index].image;
    }


    /**
     * gltf.Accessor を追加
     *
     * @param {mapray.gltf.Accessor} accessor  アクセサオブジェクト
     * @param {string}               usage     用途 ("ATTRIBUTE" | "INDEX")
     */
    addAccessor( accessor, usage )
    {
        var entry = this._buffer_entries[accessor.bufferView.buffer.index];

        switch ( usage ) {
        case "ATTRIBUTE":
            entry.addAttributeAccessor( accessor );
            break;
        case "INDEX":
            entry.addIndexAccessor( accessor );
            break;
        }
    }


    /**
     * gltf.TextureInfo を追加
     *
     * @param {mapray.gltf.TextureInfo} info  テクスチャ情報
     */
    addTextureInfo( info )
    {
        var image = info.texture.source;
        var entry = this._image_entries[image.index];
        entry.addTextureInfo( info );
    }


    /**
     * バイナリを読み込み始めたときの処理
     */
    onStartLoadBuffer()
    {
        this._load_count += 1;
    }


    /**
     * バイナリを読み込み終わったときの処理
     *
     * @param {boolean} failed  失敗したか？
     */
    onFinishLoadBuffer( failed )
    {
        if ( failed ) {
            this._load_failed = true;
        }
        this._load_count -= 1;
        this._onFinishLoadSomething();
    }


    /**
     * 画像を読み込み始めたときの処理
     */
    onStartLoadImage()
    {
        this._load_count += 1;
    }


    /**
     * 画像を読み込み終わったときの処理
     *
     * @param {boolean} failed  失敗したか？
     */
    onFinishLoadImage( failed )
    {
        if ( failed ) {
            this._load_failed = true;
        }
        this._load_count -= 1;
        this._onFinishLoadSomething();
    }


    /**
     * glTF 本体を読み込み終わったときの処理
     */
    onFinishLoadBody()
    {
        this._body_finished = true;
        this._onFinishLoadSomething();
    }


    /**
     * 何かを読み込み終わったときの処理
     * @private
     */
    _onFinishLoadSomething()
    {
        if ( this._body_finished && (this._load_count == 0) ) {
            var is_success = !this._load_failed;

            // 外部ファイルも含めてすべて読み込み終わった
            if ( is_success ) {
                // すべて正常に読み終わった
                this._rewriteBuffersForByteOrder();
                this._splitBuffersAndRebuildAccessors();
                this._rebuildTextureInfo();
            }
            else {
                // どこかで失敗した
                console.error( "glTF failed" );
            }

            this._callback( this._loader, is_success );
        }
    }


    /**
     * すべてのバッファのバイトオーダーを書き換える
     * @private
     */
    _rewriteBuffersForByteOrder()
    {
        for ( const entry of this._buffer_entries ) {
            if ( entry !== undefined ) {
                entry.rewriteByteOrder();
            }
        }
    }


    /**
     * バッファを分割し、Accessor を再構築
     * @private
     */
    _splitBuffersAndRebuildAccessors()
    {
        for ( const entry of this._buffer_entries ) {
            if ( entry !== undefined ) {
                entry.splitBufferAndRebuildAccessors();
            }
        }
    }


    /**
     * テクスチャ情報を再構築
     * @private
     */
    _rebuildTextureInfo()
    {
        for ( const entry of this._image_entries ) {
            if ( entry !== undefined ) {
                entry.rebuildTextureInfo();
            }
        }
    }

}


/**
 * @summary 既定の終了コールバック
 *
 * @memberof mapray.gltf
 * @private
 */
function defaultFinishCallback( loader, isSuccess )
{
}


export default Context;
