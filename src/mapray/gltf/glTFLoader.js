import Node from "./Node";
import Buffer from "./Buffer";
import Image from "./Image";
import BufferSplitter from "./BufferSplitter";
import BitVector from "../BitVector";


/**
 * glTF データを読み込む
 *
 * @memberof mapray.gltf
 * @private
 */
class glTFLoader {

    /**
     * <p>options.index がない場合、シーン索引は model.body.scene を選択する。
     *    model.body.scene が定義されていなければ 0 を選択する。</p>
     *
     * @param  {mapray.ModelData} model      モデルデータ
     * @param  {object}           [options]  オプション
     * @param  {number}                                [options.index]     シーン索引
     * @param  {mapray.gltf.glTFLoader.FinishCallback} [options.callback]  終了コールバック関数
     */
    constructor( model, options )
    {
        var opts = options || {};

        this._root_nodes = [];

        // glTF バージョンを確認
        var version = this._load_version( model.body );
        if ( version.major < 2 ) {
            throw new Error( "glTF version error" );
        }

        var context = new Context( this, model, opts );
        this._load_root_nodes( context, opts );
        context.onFinishLoadBody();
    }


    /**
     * 最上位ノードの配列
     * @type {mapray.gltf.Node[]}
     * @readonly
     */
    get root_nodes()
    {
        return this._root_nodes;
    }


    /**
     * glTF バージョンを解析
     *
     * @param  {object} gjson  glTF 最上位オブジェクト
     * @return {object}        { major: メジャー番号, minor: マイナー番号 }
     * @private
     */
    _load_version( gjson )
    {
        // asset.schema

        var   asset = gjson.asset;    // 必須
        var version = asset.version;  // 必須

        var version_array = /^(\d+)\.(\d+)/.exec( version );
        var major_version = Number( version_array[1] );
        var minor_version = Number( version_array[2] );

        return { major: major_version,
                 minor: minor_version };
    }


    /**
     * @summary 最上位の gltf.Node 配列を生成
     *
     * <p>ノードの配列を this._root_nodes に設定する。</p>
     *
     * @param  {mapray.gltf.Context} ctx   読み込みコンテキスト
     * @param  {object}              opts  オプション
     * @param  {object}              [opts.index]  シーン索引
     * @return {array}  gltf.Node の配列
     * @private
     */
    _load_root_nodes( ctx, opts )
    {
        var scene = this._load_scene( ctx, opts );
        var node_indices = scene.nodes || [];
        var node_objects = [];

        for ( const node_index of node_indices ) {
            node_objects.push( new Node( ctx, node_index ) );
        }

        this._root_nodes = node_objects;
    }


    /**
     * glTF の scene オブジェクトを取得
     *
     * @param  {mapray.gltf.Context} ctx   読み込みコンテキスト
     * @param  {object}              opts  オプション
     * @param  {object}              [opts.index]  シーン索引
     * @return {object}  { nodes: 最上位ノードのインデックスの配列 }
     * @private
     */
    _load_scene( ctx, opts )
    {
        var  gjson = ctx.gjson;
        var scenes = gjson.scenes || [];
        var  index = 0;

        if ( opts.index !== undefined ) {
            index = opts.index;
        }
        else if ( gjson.scene !== undefined ) {
            index = gjson.scene;
        }

        if ( index >= 0 && index < scenes.length ) {
            // specification/2.0/schema/scene.schema.json
            return scenes[index];
        }
        else {
            throw new Error( "glTF scene (" + index + ") does not exist" );
        }
    }

}


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
 * コンテキストでの Buffer 管理アイテム
 *
 * @memberof mapray.gltf
 * @private
 */
class BufferEntry {

    /**
     * @param {mapray.gltf.Buffer} buffer  バッファ
     */
    constructor( buffer )
    {
        this._buffer = buffer;
        this._attrib_accessors = [];
        this._index_accessors  = [];
    }


    /**
     * 管理対象のバッファを取得
     *
     * @type {mapray.gltf.Buffer}
     * @readonly
     */
    get buffer() { return this._buffer; }


    /**
     * 頂点属性で使われている Accessor インスタンスを追加
     */
    addAttributeAccessor( accessor )
    {
        this._attrib_accessors.push( accessor );
    }


    /**
     * インデックスで使われている Accessor インスタンスを追加
     */
    addIndexAccessor( accessor )
    {
        this._index_accessors.push( accessor );
    }


    /**
     * バイナリをマシンのバイトオーダーに合わせて書き換え
     */
    rewriteByteOrder()
    {
        var modmap = new BitVector( Math.ceil( this._buffer.byteLength / 2 ) );

        for ( const accessor of this._getUnitedOriginalAccessors() ) {
            accessor.modifyByteOrder( modmap );
        }
    }


    /**
     * バッファを分割し、Accessor を再構築
     */
    splitBufferAndRebuildAccessors()
    {
        this._splitBufferAndRebuildAccessors( this._attrib_accessors );
        this._splitBufferAndRebuildAccessors( this._index_accessors );
    }


    /**
     * バッファを分割し、Accessor を再構築
     *
     * @param {iterable.<mapray.gltf.Accessor>} accessors  入力 Accessor 反復子
     */
    _splitBufferAndRebuildAccessors( accessors )
    {
        var splitter = new BufferSplitter();

        for ( const accessor of BufferEntry._getOriginalAccessors( accessors ) ) {
            splitter.update( accessor );
        }

        splitter.close( this._buffer );

        for ( const accessor of accessors ) {
            splitter.rebuildAccessor( accessor );
        }
    }


    /**
     * バッファを参照ている原初 Accessor の反復子
     *
     * @return {iterable.<mapray.gltf.Accessor>}  原初 Accessor 反復子
     * @private
     */
    _getUnitedOriginalAccessors()
    {
        return BufferEntry._getOriginalAccessors( this._attrib_accessors.concat( this._index_accessors ) );
    }


    /**
     * 原初 Accessor の反復子を取得
     *
     * @param  {iterable.<mapray.gltf.Accessor>} accessors  入力 Accessor 反復子
     * @return {iterable.<mapray.gltf.Accessor>}            原初 Accessor 反復子
     * @private
     */
    static
    _getOriginalAccessors( accessors )
    {
        var orig_accessors = new Map();

        for ( const accessor of accessors ) {
            const key = accessor.index;
            if ( !orig_accessors.has( key ) ) {
                orig_accessors.set( key, accessor );
            }
        }

        return orig_accessors.values();
    }

}


/**
 * コンテキストでの Image 管理アイテム
 *
 * @memberof mapray.gltf
 * @private
 */
class ImageEntry {

    /**
     * @param {mapray.gltf.Image} image  イメージ
     */
    constructor( image )
    {
        this._image           = image;
        this._texinfo_objects = [];
    }


    /**
     * イメージを取得
     * @type {mapray.gltf.Texture}
     * @readonly
     */
    get image() { return this._image; }


    /**
     * TextureInfo インスタンスを追加
     *
     * @param {mapray.gltf.TextureInfo} info  追加する TextureInfo インスタンス
     */
    addTextureInfo( info )
    {
        this._texinfo_objects.push( info );
    }


    /**
     * テクスチャ情報を再構築
     */
    rebuildTextureInfo()
    {
        var texinfo_objects = this._texinfo_objects;

        if ( texinfo_objects.length <= 1 ) {
            // イメージが複数の TextureInfo から参照されないので
            // 何も変更しない
            return;
        }

        // この画像を使っている代表テクスチャ
        var representative_texture = texinfo_objects[0].texture;

        // この画像を使っている (テクスチャ情報内の) テクスチャを
        // 代表テクスチャに置き換える
        for ( var i = 1; i < texinfo_objects.length; ++i ) {
            texinfo_objects[i].texture = representative_texture;
        }
    }

}


/**
 * @summary 終了コールバック
 * @callback FinishCallback
 * @desc
 * <p>シーンの読み込みが終了したときに呼び出される関数の型である。</p>
 * @param {mapray.gltf.glTFLoader} loader     読み込みを実行したローダー
 * @param {boolean}                isSuccess  成功したとき true, 失敗したとき false
 * @memberof mapray.gltf.glTFLoader
 * @private
 */


function defaultFinishCallback( loader, isSuccess )
{
}


export default glTFLoader;
