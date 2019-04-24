import Entity from "./Entity";
import Primitive from "./Primitive";
import GeoMath from "./GeoMath";
import Mesh from "./Mesh";
import MeshBuffer from "./MeshBuffer";
import Texture from "./Texture";
import ModelMaterial from "./ModelMaterial";
import Tool from "./gltf/Tool";
import NormalTextureInfo from "./gltf/NormalTextureInfo";
import OcclusionTextureInfo from "./gltf/OcclusionTextureInfo";


/**
 * @summary モデルエンティティ
 * @memberof mapray
 * @extends mapray.Entity
 */
class ModelEntity extends Entity {

    /**
     * @param {mapray.Scene} scene        所属可能シーン
     * @param {object}       [opts]       オプション集合
     * @param {object}       [opts.json]  生成情報
     * @param {object}       [opts.refs]  参照辞書
     */
    constructor( scene, opts )
    {
        super( scene );

        this._transform  = GeoMath.setIdentity( GeoMath.createMatrix() );
        this._primitives = [];  // プリミティブ配列
        this._ptoe_array = [];  // 各プリミティブ座標系からエンティティ座標系への変換行列

        if ( opts && opts.json ) {
            var json = opts.json;
            var refs = opts.refs || {};
            ModelEntity._getJsonTransform( json, this._transform );
            this._startLoading( json, refs );
        }
    }


    /**
     * @override
     */
    getPrimitives( stage )
    {
        // Primitive#transform を設定
        var primitives = this._primitives;
        var ptoe_array = this._ptoe_array;
        for ( var i = 0; i < primitives.length; ++i ) {
            var prim = primitives[i];
            var ptoe = ptoe_array[i];
            // prim.transform = this._transform * ptoe
            GeoMath.mul_AA( this._transform, ptoe, prim.transform );
        }

        return this._primitives;
    }


    /**
     * @summary 変換行列を設定
     * @param {mapray.Matrix} matrix  モデル座標系から GOCS への変換行列
     */
    setTransform( matrix )
    {
        GeoMath.copyMatrix( matrix, this._transform );
    }


    /**
     * JSON から変換情報を取得
     * @private
     */
    static _getJsonTransform( json, transform )
    {
        var matrix = json.transform.matrix;
        if ( matrix ) {
            // 直接変換行列
            GeoMath.copyMatrix( matrix, transform );
        }
        else {
            // mapray 球面座標系
            var carto = json.transform.cartographic;
            var  iscs = { longitude: carto[0],
                          latitude:  carto[1],
                          height:    carto[2] };
            GeoMath.iscs_to_gocs_matrix( iscs, transform );
        }
    }


    /**
     * 読み込みを開始
     *
     * @param {object} json  生成情報
     * @param {object} refs  参照辞書
     * @private
     */
    _startLoading( json, refs )
    {
        const model_data = refs[json.ref_model];

        Tool.load( model_data.body, { base_uri: model_data.base_uri } ).
            then( content => { this._onLoadModel( content, json.index ); } );
    }


    /**
     * 読み込み後の処理
     *
     * @param {mapray.gltf.Content} content
     * @param {number}              [index]
     * @private
     */
    _onLoadModel( content, index )
    {
        if ( content.scenes.length == 0 ) return;  // シーンなし

        var si1 = (typeof index == 'number') ? index : content.default_scene_index;
        var si2 = (si1 >= 0) ? si1 : 0;

        const gltf_scene = content.scenes[si2];

        var builder = new Builder( this.scene, gltf_scene.root_nodes );
        this._primitives = builder.primitives;
        this._ptoe_array = this._primitives.map( prim => GeoMath.createMatrix( prim.transform ) );
    }

}


/**
 * mapray.Primitive の配列を構築
 * @memberof mapray
 * @private
 */
class Builder {

    /**
     * @param {mapray.Scene}       scene       シーン
     * @param {mapray.gltf.Node[]} root_nodes  最上位ノード配列
     */
    constructor( scene, root_nodes )
    {
        this._scene      = scene;
        this._glenv      = scene.glenv;
        this._primitives = [];

        this._buffer_map  = new Map();  // gltf.Buffer  -> MeshBuffer
        this._texture_map = new Map();  // gltf.Texture -> Texture

        var identity = GeoMath.setIdentity( GeoMath.createMatrix() );  // シーンからシーンへの変換 (恒等行列)

        for ( var node of root_nodes ) {
            this._addNode( node, identity );
        }
    }


    /**
     * @summary mapray.Primitive の配列を取得
     * <p>transform プロパティはプリミティブ座標系からエンティティ座標系への変換になっている。</p>
     * @type {mapray.Primitive[]}
     * @readonly
     */
    get primitives() { return this._primitives; }


    /**
     * ノードを追加
     *
     * @param {mapray.gltf.Node} node  追加対象のノード
     * @param {mapray.Matrix}    ptos  親ノード座標系からシーン座標系への変換
     * @private
     */
    _addNode( node, ptos )
    {
        var ntos = Builder._getNodeToScene( node, ptos );

        if ( node.mesh !== null ) {
            for ( var primitive of node.mesh.primitives ) {
                // プリミティブを追加
                this._primitives.push( this._createPrimitive( primitive, ntos ) );
            }
        }

        // 子孫の処理
        for ( var child of node.children ) {
            this._addNode( child, ntos );
        }
    }


    /**
     * node 座標系からシーン座標系の変換行列を取得
     *
     * @param  {mapray.gltf.Node} node  追加対象のノード
     * @param  {mapray.Matrix}    ptos  親ノード座標系からシーン座標系への変換行列
     * @return {mapray.Matrix}          node 座標系からシーン座標系の変換行列
     * @private
     */
    static
    _getNodeToScene( node, ptos )
    {
        var ntos = ptos;  // node 座標系からシーン座標系の変換

        var ntop = node.matrix;  // node 座標系から親ノード座標系の変換
        if ( ntop !== null ) {
            ntos = GeoMath.createMatrix();
            GeoMath.mul_AA( ptos, ntop, ntos );
        }

        return ntos;
    }


    /**
     * プリミティブを生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @param {mapray.Matrix}          ntos   ノード座標系からシーン座標系への変換
     * @return {mapray.Primitive}             出力プリミティブ
     * @private
     */
    _createPrimitive( iprim, ntos )
    {
        var     mesh = this._createMesh( iprim );
        var material = this._createMaterial( iprim );
        var    oprim = new Primitive( this._glenv, mesh, material, GeoMath.createMatrix( ntos ) );

        oprim.pivot      = this._createMeshPivot( iprim );
        oprim.bbox       = this._createBoundingBox( iprim );
        oprim.properties = this._createProperties( iprim );

        return oprim;
    }


    /**
     * メッシュを生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {mapray.Mesh}                  メッシュ
     * @private
     */
    _createMesh( iprim )
    {
        var init = new Mesh.Initializer( Builder._convertPrimitiveMode( iprim ), Builder._calcNumVertices( iprim ) );

        var attributes = iprim.attributes;
        for ( var name in attributes ) {
            this._addAttribToInit( init, name, attributes[name] );
        }

        var indices = iprim.indices;
        if ( indices !== null ) {
            this._addIndexToInit( init, indices );
        }

        return new Mesh( this._glenv, init );
    }


    /**
     * 描画モードに変換
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {mapray.Mesh.DrawMode}         描画モード
     * @private
     */
    static
    _convertPrimitiveMode( iprim )
    {
        return Builder._DrawMode[iprim.mode];
    }


    /**
     * 頂点数を計算
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {number}                       頂点数
     * @private
     */
    static
    _calcNumVertices( iprim )
    {
        var attributes = iprim.attributes;

        var counts = [];

        for ( var name in attributes ) {
            var accessor = attributes[name];
            counts.push( accessor.count );
        }

        return Math.min.apply( null, counts );
    }


    /**
     * 頂点属性をイニシャライザに追加
     *
     * @param {mapray.Mesh.Initializer} init      追加先
     * @param {string}                  name      属性名
     * @param {mapray.gltf.Accessor}    accessor  アクセサ
     * @private
     */
    _addAttribToInit( init, name, accessor )
    {
        var buffer = this._findMeshBuffer( accessor.bufferView.buffer, MeshBuffer.Target.ATTRIBUTE );

        var num_components = Builder._NumComponents[accessor.type];
        var component_type = Builder._ComponentType[accessor.componentType];

        var options = {
            normalized:  accessor.normalized,
            byte_stride: accessor.bufferView.byteStride,
            byte_offset: accessor.bufferView.byteOffset + accessor.byteOffset
        };

        var id = Builder._VertexAttribId[name] || name;

        init.addAttribute( id, buffer, num_components, component_type, options );
    }


    /**
     * インデックスをイニシャライザに追加
     *
     * @param {mapray.Mesh.Initializer} init      追加先
     * @param {mapray.gltf.Accessor}    accessor  アクセサ
     * @private
     */
    _addIndexToInit( init, accessor )
    {
        var buffer = this._findMeshBuffer( accessor.bufferView.buffer, MeshBuffer.Target.INDEX );

        var num_indices = accessor.count;
        var        type = Builder._ComponentType[accessor.componentType];

        var options = {
            byte_offset: accessor.bufferView.byteOffset + accessor.byteOffset
        };

        init.addIndex( buffer, num_indices, type, options );
    }


    /**
     * MeshBuffer インスタンスを検索
     *
     * @param  {mapray.gltf.Buffer}       buffer  入力バッファ
     * @param  {mapray.MeshBuffer.Target} target  使用目的
     * @return {mapray.MeshBuffer}
     * @private
     */
    _findMeshBuffer( buffer, target )
    {
        var meshBuffer = this._buffer_map.get( buffer );
        if ( meshBuffer === undefined ) {
            meshBuffer = new MeshBuffer( this._glenv, buffer.binary, { target: target } );
            this._buffer_map.set( buffer, meshBuffer );
        }

        return meshBuffer;
    }


    /**
     * マテリアルを生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {mapray.EntityMaterial}        マテリアル
     * @private
     */
    _createMaterial( iprim )
    {
        var scene = this._scene;
        if ( !scene._ModelEntity_model_material ) {
            // scene にマテリアルをキャッシュ
            scene._ModelEntity_model_material = new ModelMaterial( scene.glenv );
        }
        return scene._ModelEntity_model_material;
    }


    /**
     * メッシュ基点を生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {?mapray.Vector3}              メッシュ基点
     * @private
     */
    _createMeshPivot( iprim )
    {
        var pivot = null;
        var  bbox = this._createBoundingBox( iprim );

        if ( bbox !== null ) {
            pivot = GeoMath.createVector3();
            // 境界箱の中点
            for ( var i = 0; i < 3; ++i ) {
                pivot[i] = (bbox[0][i] + bbox[1][i]) / 2;
            }
        }

        return pivot;
    }


    /**
     * 境界箱を生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {?mapray.Vector3[]}            境界箱
     * @private
     */
    _createBoundingBox( iprim )
    {
        var bbox = null;

        var attrib = iprim.attributes['POSITION'];
        if ( attrib !== undefined ) {
            var min = attrib.min;
            var max = attrib.max;
            if ( min !== null && max !== null ) {
                bbox = [GeoMath.createVector3( min ), GeoMath.createVector3( max )];
            }
        }

        return bbox;
    }


    /**
     * プロパティを生成
     *
     * @param  {mapray.gltf.Primitive} iprim  入力プリミティブ
     * @return {object}                       プロパティ
     * @private
     */
    _createProperties( iprim )
    {
        var material = iprim.material;

        if ( material === null ) {
            // 既定のマテリアル
            return {
                pbrMetallicRoughness: {
                    baseColorFactor:          GeoMath.createVector4f( [1.0, 1.0, 1.0, 1.0] ),
                    baseColorTexture:         null,
                    metallicFactor:           1.0,
                    roughnessFactor:          1.0,
                    metallicRoughnessTexture: null
                },
                doubleSided:      false,
                alphaMode:        "OPAQUE",
                alphaCutoff:      0.5,
                emissiveFactor:   GeoMath.createVector3f( [0.0, 0.0, 0.0] ),
                emissiveTexture:  null,
                normalTexture:    null,
                occlusionTexture: null
            };
        }
        else {
            const pbrMR = material.pbrMetallicRoughness;

            return {
                pbrMetallicRoughness: {
                    baseColorFactor:          GeoMath.createVector4f( pbrMR.baseColorFactor ),
                    baseColorTexture:         this._createTextureParam( pbrMR.baseColorTexture ),
                    metallicFactor:           pbrMR.metallicFactor,
                    roughnessFactor:          pbrMR.roughnessFactor,
                    metallicRoughnessTexture: this._createTextureParam( pbrMR.metallicRoughnessTexture )
                },
                doubleSided:      material.doubleSided,
                alphaMode:        material.alphaMode,
                alphaCutoff:      material.alphaCutoff,
                emissiveFactor:   GeoMath.createVector3f( material.emissiveFactor ),
                emissiveTexture:  this._createTextureParam( material.emissiveTexture ),
                normalTexture:    this._createTextureParam( material.normalTexture ),
                occlusionTexture: this._createTextureParam( material.occlusionTexture )
            };
        }
    }


    /**
     * テクスチャパラメータを生成
     *
     * @param  {mapray.gltf.TextureInfo} texinfo  TextureInfo インスタンス
     * @return {object}  テクスチャパラメータ
     * @private
     */
    _createTextureParam( texinfo )
    {
        if ( texinfo === null ) {
            return null;
        }

        var param = {
            texture:  this._findTexture( texinfo.texture ),
            texCoord: texinfo.texCoord
        };

        if ( texinfo instanceof NormalTextureInfo ) {
            param.scale = texinfo.scale;
        }
        else if ( texinfo instanceof OcclusionTextureInfo ) {
            param.strength = texinfo.strength;
        }

        return param;
    }


    /**
     * テクスチャパラメータを生成
     *
     * @param  {mapray.gltf.Texture} itexture  glTF テクスチャ
     * @return {mapray.Texture}               テクスチャ
     * @private
     */
    _findTexture( itexture )
    {
        var otexture = this._texture_map.get( itexture );

        if ( otexture === undefined ) {
            var  sampler = itexture.sampler;
            var       gl = this._glenv.context;
            var tex_opts = {
                mag_filter: (sampler.magFilter !== undefined) ? sampler.magFilter : gl.LINEAR,
                min_filter: (sampler.minFilter !== undefined) ? sampler.minFilter : gl.LINEAR_MIPMAP_LINEAR,
                wrap_s:     sampler.wrapS,
                wrap_t:     sampler.wrapT,
                flip_y:     false  // glTF のテクスチャ座標は左上が原点なので画像を反転しない
            };
            otexture = new Texture( this._glenv, itexture.source.image, tex_opts );
            this._texture_map.set( itexture, otexture );
        }

        return otexture;
    }

}


// gltf.Primitive.mode -> mapray.Mesh.DrawMode
Builder._DrawMode = {
    0: Mesh.DrawMode.POINTS,
    1: Mesh.DrawMode.LINES,
    2: Mesh.DrawMode.LINE_LOOP,
    3: Mesh.DrawMode.LINE_STRIP,
    4: Mesh.DrawMode.TRIANGLES,
    5: Mesh.DrawMode.TRIANGLE_STRIP,
    6: Mesh.DrawMode.TRIANGLE_FAN
};


// gltf.Accessor.type -> 要素数
Builder._NumComponents = {
    'SCALAR': 1,
    'VEC2':   2,
    'VEC3':   3,
    'VEC4':   4
};


// gltf.Accessor.componentType -> mapray.Mesh.ComponentType
Builder._ComponentType = {
    5120: Mesh.ComponentType.BYTE,
    5121: Mesh.ComponentType.UNSIGNED_BYTE,
    5122: Mesh.ComponentType.SHORT,
    5123: Mesh.ComponentType.UNSIGNED_SHORT,
    5125: Mesh.ComponentType.UNSIGNED_INT,
    5126: Mesh.ComponentType.FLOAT
};


// gltf.Primitive.attributes のキー -> 頂点属性 ID
Builder._VertexAttribId = {
    'POSITION':   "a_position",
    'NORMAL':     "a_normal",
    'TANGENT':    "a_tangent",
    'TEXCOORD_0': "a_texcoord",
    'TEXCOORD_1': "a_texcoord1",
    'COLOR_0':    "a_color"
};


export default ModelEntity;
