import Context from "./Context";
import Node from "./Node";


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
