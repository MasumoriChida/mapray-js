import Context from "./Context";


/**
 * glTF 関連のツール
 *
 * @memberof mapray.gltf
 * @private
 */
class Tool {

    /**
     * @summary glTF データを解析してオブジェクトを構築
     *
     * @param  {object} body       データの本体 (JSON オブジェクト)
     * @param  {object} [options]  オプション集合
     * @param  {string} [options.base_uri = ""]  基底 URI
     * @return {Promise}           読込み Promise (mapray.gltf.Content)
     */
    static
    load( body, options )
    {
        const context = new Context( body, options );
        return context.load();
    }

}


export default Tool;
