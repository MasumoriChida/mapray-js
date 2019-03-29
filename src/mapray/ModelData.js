/**
 * @summary モデルデータ
 * @classdesc
 * <p>{@link mapray.ModelEntity} を構築するためのモデルデータを表現するクラスである。</p>
 * <p>body は複製されず参照のみが記憶される。<p>
 * @memberof mapray
 * @private
 * @see mapray.ModelEntity
 */
class ModelData {

    /**
     * @param {object} body             モデルデータ本体 (JSON)
     * @param {object} [opts]           オプション
     * @param {string} [opts.base_uri]  相対 URI のための 基底 URI
     */
    constructor( body, opts )
    {
        this._body     = body;
        this._base_uri = "";
        this._setupOptions( opts || {} );
    }


    /**
     * @summary モデルデータ本体 (JSON)
     * @type {object}
     * @readonly
     */
    get body() { return this._body; }


    /**
     * @summary 基底 URI
     * @type {string}
     * @readonly
     */
    get base_uri() { return this._base_uri; }


    /**
     * @private
     */
    _setupOptions( opts )
    {
        // 基底 URI
        if ( typeof opts.base_uri == 'string' ) {
            this._base_uri = opts.base_uri;
        }
    }

}


export default ModelData;
