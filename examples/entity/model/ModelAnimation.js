// JavaScript source code
var GeoMath = mapray.GeoMath;

class ModelAnimation extends mapray.RenderCallback {

    constructor(container) {
        super();

        // Access Tokenを設定
        var accessToken = "<your access token here>";

        // Viewerを作成する
        new mapray.Viewer(container, {
            render_callback: this,
            image_provider: this.createImageProvider(),
            dem_provider: new mapray.CloudDemProvider(accessToken)
        });

        this.animation_Path = [{ longitude: 135.759309, latitude: 35.024954, height: 50.0 },//モデルを移動させるパス。場所は鳥丸通の鳥丸下長者町交差点付近
                               { longitude: 135.759309, latitude: 35.026257, height: 50.0 },//場所は鳥丸通と一条通の交差点付近
                               { longitude: 135.759309, latitude: 35.026257, height: 50.0 },//場所は鳥丸通と一条通の交差点付近
                               { longitude: 135.757438, latitude: 35.026257, height: 50.0 }];//場所は一条通の京都市立上京中学校前付近
        this.model_Pos = { longitude: 0, latitude: 0, height: 0 };//モデルの球面座標
        this.model_Angle = 0;//モデルの向いている向き
        this.isLoadedModel = false;//モデルをロードできたか
        this.move_Correction = 0.00007;//移動量の補正値
        this.ratio_Increment = 0.15;    //毎フレームの線形補間割合増加分
        this.ratio = 0.0;            //線形補間の割合
        this.angle_Animation_Interval = [0, 0, 90, 90];//角度アニメーションの変化量データ
        this.animation_Index = 0;

        this.SetCamera();

        this.LoadScene();
    }

    onStart()  // override
    {
        // 初期の割合
        this.ratio = 0.0;
    }

    //フレーム毎に呼ばれるメソッド
    onUpdateFrame(delta_time)  // override
    {
        if (this.isLoadedModel == false) {
            return;
        }

        // 次の線形補間の割合
        this.ratio += this.ratio_Increment * delta_time;

        if (this.ratio > 1.0) {
            this.ratio = 0.0;
            this.animation_Index += 1;
        }

        if (this.animation_Index == this.animation_Path.length - 1) {
            this.animation_Index = 0
        }

        this.model_Pos.longitude = this.animation_Path[this.animation_Index].longitude * (1 - this.ratio) + this.animation_Path[this.animation_Index + 1].longitude * this.ratio;
        this.model_Pos.latitude = this.animation_Path[this.animation_Index].latitude * (1 - this.ratio) + this.animation_Path[this.animation_Index + 1].latitude * this.ratio;
        this.model_Pos.height = this.animation_Path[this.animation_Index].height * (1 - this.ratio) + this.animation_Path[this.animation_Index + 1].height * this.ratio;

        this.model_Angle = this.angle_Animation_Interval[this.animation_Index] * (1 - this.ratio) + this.angle_Animation_Interval[this.animation_Index + 1] * this.ratio;

        this.SetModelTransform();
    }

    // 画像プロバイダを生成
    createImageProvider() {
        return new mapray.StandardImageProvider("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/", ".jpg", 256, 2, 18);
    }

    SetCamera() {
        // カメラ位置の設定

        // 球面座標系（経度、緯度、高度）で視点を設定。座標は京都御所前
        var home_pos = { longitude: 135.759366, latitude: 35.025891, height: 50.0 };

        // 球面座標から地心直交座標へ変換
        var home_view_to_gocs = mapray.GeoMath.iscs_to_gocs_matrix(home_pos, mapray.GeoMath.createMatrix());

        // 視線方向を定義
        var cam_pos = mapray.GeoMath.createVector3([-400, 10, 400]);
        var cam_end_pos = mapray.GeoMath.createVector3([0, 0, 0]);
        var cam_up = mapray.GeoMath.createVector3([0, 0, 1]);

        //ビュー変換行列を作成
        var view_to_home = mapray.GeoMath.createMatrix();
        mapray.GeoMath.lookat_matrix(cam_pos, cam_end_pos, cam_up, view_to_home);

        // カメラの位置と視線方向からカメラの姿勢を変更
        var view_to_gocs = this.viewer.camera.view_to_gocs;
        mapray.GeoMath.mul_AA(home_view_to_gocs, view_to_home, view_to_gocs);

        // カメラのnear  farの設定
        this.viewer.camera.near = 30;
        this.viewer.camera.far = 500000;
    }

    LoadScene() {
        var scene_File_URL = "https://storage.googleapis.com/mapray-examples/model/bus/bus.json";
        //シーンを読み込む
        var loader = new mapray.SceneLoader(this.viewer.scene, scene_File_URL, {
            transform: (url, type) => this.onTransform(url, type),
            callback: (loader, isSuccess) => {
                this.onLoadScene(loader, isSuccess);
            }
        });
    }

    onTransform(url, type) {
        return {
            url: url,
            credentials: mapray.CredentialMode.SAME_ORIGIN,
            headers: {}
        };
    }

    onLoadScene(loader, isSuccess) {
        if (isSuccess) {
            this.isLoadedModel = true;

            this.SetModelTransform();
        }
    }

    SetModelTransform() {
        //モデルの回転行列を求める
        var turn_mat = mapray.GeoMath.rotation_matrix([0, 0, 1], this.model_Angle, mapray.GeoMath.createMatrix());
        //モデルの球面座標を地心座標に変換する
        var model_pos_Gocs = mapray.GeoMath.iscs_to_gocs_matrix(this.model_Pos, mapray.GeoMath.createMatrix());

        //モデルの地心座標に回転行列をかける
        var turned_pos_Gocs = mapray.GeoMath.mul_AA(model_pos_Gocs, turn_mat, mapray.GeoMath.createMatrix());

        //sceneのEntityに初期座標をセットする
        var entity = this.viewer.scene.getEntity(0);
        entity.setTransform(turned_pos_Gocs);


    }
}
