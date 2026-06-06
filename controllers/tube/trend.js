const axios = require("axios");
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // 1. ajgpw のデータ取得処理
    const base64Promise = axios.get("https://raw.githubusercontent.com/ajgpw/youtubedata/refs/heads/main/trend-base64.json")
      .then(res => res.data)
      .catch(err => {
        console.error('base64データの取得に失敗しました:', err.message);
        return [];
      });

    // 2. Invidious インスタンスからのデータ取得処理
    const invPromise = (async () => {
      try {
        // インスタンスのリストを取得
        const instancesRes = await axios.get("https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json");
        const instances = instancesRes.data;

        if (Array.isArray(instances)) {
          // 上から順番に試行するループ
          for (const instance of instances) {
            try {
              // yes.json のフォーマットが文字列、配列、オブジェクトのどれでも対応できるようにURLを抽出
              let baseUrl = typeof instance === 'string' ? instance : 
                            (Array.isArray(instance) ? instance[0] : 
                             (instance.uri || instance.domain || ""));
              
              if (!baseUrl) continue;
              
              // URLの整形 (http補完と末尾のスラッシュ削除)
              if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
              baseUrl = baseUrl.replace(/\/$/, '');

              const apiUrl = `${baseUrl}/api/v1/trending?type=Livestreams&region=JP`;
              
              // 応答がないインスタンスで無限待ちしないよう5秒（5000ms）のタイムアウトを設定
              const invRes = await axios.get(apiUrl, { timeout: 5000 });
              
              // 取得に成功した場合、そのデータを返して処理を終了
              if (invRes.data) {
                return invRes.data; 
              }
            } catch (e) {
              // このインスタンスでエラーやタイムアウトが発生した場合は次のループ（次のインスタンス）へ進む
              continue;
            }
          }
        }
      } catch (err) {
        console.error('Invidiousインスタンスリストの取得に失敗しました:', err.message);
      }
      return []; // 全てのインスタンスで失敗した場合は空配列
    })();

    // 3. 2つのリクエストを並列で実行し、全て完了するまで待機
    const [topVideos_base64, topVideos_inv] = await Promise.all([
      base64Promise,
      invPromise
    ]);

    // 4. 取得したデータをEJSテンプレートに渡す
    res.render("tube/trend.ejs", {
      topVideos_base64,
      topVideos_inv
    });

  } catch (error) {
    console.error('予期せぬエラーが発生しました:', error);
    // エラー時も変数が未定義にならないように空の配列を渡す
    res.render("tube/trend.ejs", { 
      topVideos_base64: [], 
      topVideos_inv: [] 
    });
  }
});

module.exports = router;
