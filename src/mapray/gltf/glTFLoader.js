import Context from "./Context";
import Scene from "./Scene";


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
     * @param  {mapray.gltf.glTFLoader.FinishCallback} [options.callback]  終了コールバック関数
     */
    constructor( model, options )
    {
        var opts = options || {};

        this._scenes              = [];
        this._default_scene_index = -1;

        // glTF バージョンを確認
        var version = this._loadVersion( model.body );
        if ( version.major < 2 ) {
            throw new Error( "glTF version error" );
        }

        var context = new Context( this, model, opts );
        this._loadScenes( context );
        this._loadDefaultSceneIndex( context );
        context.onFinishLoadBody();
    }


    /**
     * 最上位ノードの配列
     * @type {mapray.gltf.Node[]}
     * @readonly
     */
    get root_nodes()
    {
        return this._scenes[0].root_nodes;
    }


    /**
     * @summary シーンの配列
     *
     * @type {mapray.gltf.Scene[]}
     * @readonly
     */
    get scenes()
    {
        return this._scenes;
    }


    /**
     * @summary 既定シーンの索引
     * @desc
     * <p>既定シーンの索引を返す。ただし既定シーンがないときは -1 を返す。</p>
     * @type {number}
     * @readonly
     */
    get default_scene_index()
    {
        return this._default_scene_index;
    }


    /**
     * glTF バージョンを解析
     *
     * @param  {object} gjson  glTF 最上位オブジェクト
     * @return {object}        { major: メジャー番号, minor: マイナー番号 }
     * @private
     */
    _loadVersion( gjson )
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
     * @summary すべてのシーンを読み込む
     *
     * <p>シーンを読み込み、オブジェクトを this._scenes の配列に設定する。</p>
     *
     * @param {mapray.gltf.Context} ctx  読み込みコンテキスト
     * @private
     */
    _loadScenes( ctx )
    {
        const num_scenes = (ctx.gjson.scenes || []).length;
        const     scenes = [];

        for ( let index = 0; index < num_scenes; ++index ) {
            scenes.push( new Scene( ctx, index ) );
        }

        this._scenes = scenes;
    }


    /**
     * @summary 既定シーンの索引を読み込む
     *
     * <p>既定シーンの索引を解析し、this._default_scene_index に設定する。</p>
     *
     * @param {mapray.gltf.Context} ctx  読み込みコンテキスト
     * @private
     */
    _loadDefaultSceneIndex( ctx )
    {
        if ( typeof ctx.gjson.scene == 'number' ) {
            this._default_scene_index = ctx.gjson.scene;
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


export default glTFLoader;
