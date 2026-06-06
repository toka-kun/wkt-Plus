const axios = require("axios");
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // 1. ajgpw のデータ取得処理 (急上昇・ゲーム・音楽)
    const base64Promise = axios.get("https://raw.githubusercontent.com/ajgpw/youtubedata/refs/heads/main/trend-base64.json")
      .then(res => res.data)
      .catch(err => {
        console.error('base64データの取得に失敗しました:', err.message);
        return [];
      });

    // 2. Shell Shockers データの取得処理
    const shellPromise = axios.get("https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/shellTrend.json")
      .then(res => res.data)
      .catch(err => {
        console.error('shellデータの取得に失敗しました:', err.message);
        return [];
      });

    // 3. Invidious インスタンスからのデータ取得処理 (ライブ)
    const invPromise = (async () => {
      try {
        const instancesRes = await axios.get("https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json");
        const instances = instancesRes.data;

        if (Array.isArray(instances)) {
          for (const instance of instances) {
            try {
              let baseUrl = typeof instance === 'string' ? instance : 
                            (Array.isArray(instance) ? instance[0] : 
                             (instance.uri || instance.domain || ""));
              
              if (!baseUrl) continue;
              
              if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
              baseUrl = baseUrl.replace(/\/$/, '');

              const apiUrl = `${baseUrl}/api/v1/trending?type=Livestreams&region=JP`;
              
              const invRes = await axios.get(apiUrl, { timeout: 5000 });
              
              if (invRes.data) {
                return invRes.data; 
              }
            } catch (e) {
              continue;
            }
          }
        }
      } catch (err) {
        console.error('Invidiousインスタンスリストの取得に失敗しました:', err.message);
      }
      return []; 
    })();

    // 4. 3つのリクエストを並列で実行
    const [topVideos_base64, topVideos_shell, topVideos_inv] = await Promise.all([
      base64Promise,
      shellPromise,
      invPromise
    ]);

    // 5. 取得したデータをEJSに渡す
    res.render("tube/trend.ejs", {
      topVideos_base64,
      topVideos_shell,
      topVideos_inv
    });

  } catch (error) {
    console.error('予期せぬエラーが発生しました:', error);
    res.render("tube/trend.ejs", { 
      topVideos_base64: [], 
      topVideos_shell: [],
      topVideos_inv: [] 
    });
  }
});

module.exports = router;
