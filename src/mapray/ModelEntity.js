import Entity from "./Entity";
import GeoMath from "./GeoMath";


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
     *
     * @throws Error  ModelContainer からモデルが見つからなかった
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
            this._setupPrimitives( json, refs );
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
     * this._primitives と this._ptoe_array を設定
     *
     * @param {object} json  生成情報
     * @param {object} refs  参照辞書
     *
     * @throws Error
     *
     * @private
     */
    _setupPrimitives( json, refs )
    {
        var  container = refs[json.ref_model];
        var primitives = container.createPrimitives( json.index );
        if ( primitives ) {
            this._primitives = primitives;
            this._ptoe_array = primitives.map( prim => GeoMath.createMatrix( prim.transform ) );
        }
        else {
            // ModelContainer からモデルが見つからなかった
            throw new Error( "model is not found in ModelContiner" );
        }
    }

}


export default ModelEntity;
