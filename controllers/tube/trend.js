const axios = require("axios");
const express = require("express");
const router = express.Router();

// ▼▼▼ キャッシュ設定 ▼▼▼
const TTL_SEC = 600; // 10分
const TTL_MS = TTL_SEC * 1000;

let trendCache = null;      // 取得済みのデータを保存する変数
let activeRequest = null;   // 現在取得中の「処理(Promise)」を保存する変数

// 配列をランダムにシャッフルする関数
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

router.get("/", async (req, res) => {
    try {
        // 1. メモリキャッシュの確認
        if (trendCache && (Date.now() - trendCache.timestamp < TTL_MS)) {
            console.log("🚀 メモリキャッシュヒット (Trend)");
            res.setHeader('Cache-Control', `public, s-maxage=${TTL_SEC}, stale-while-revalidate=30`);
            return res.render("tube/trend.ejs", trendCache.data);
        }

        // 2. 他のリクエストが現在データを取得中なら、APIを叩かずにその完了を待つ (同時リクエスト防止)
        if (activeRequest) {
            console.log("⏳ 同時リクエスト発生: Trendの取得完了を待機中...");
            const data = await activeRequest;
            res.setHeader('Cache-Control', `public, s-maxage=${TTL_SEC}, stale-while-revalidate=30`);
            return res.render("tube/trend.ejs", data);
        }

        // 3. 自分自身が最初のリクエストなら、取得処理（Promise）を作成して代表になる
        const fetchPromise = (async () => {
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
                    let instances = instancesRes.data;

                    if (Array.isArray(instances)) {
                        // ★ インスタンスをランダムな順番にする
                        instances = shuffleArray([...instances]);

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
                                    console.log(`✅ Trend(Live)取得成功: ${baseUrl}`);
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

            const renderData = {
                topVideos_base64,
                topVideos_shell,
                topVideos_inv
            };

            // 5. 取得したデータをメモリキャッシュに保存
            trendCache = {
                timestamp: Date.now(),
                data: renderData
            };
            console.log(`💾 Trendのメモリキャッシュを新規保存しました (TTL: ${TTL_SEC}秒)`);

            return renderData;
        })();

        // 他の同時リクエストが相乗りできるように、現在取得中として Promise を登録
        activeRequest = fetchPromise;

        // 取得完了を待って画面を描画
        const data = await fetchPromise;
        res.setHeader('Cache-Control', `public, s-maxage=${TTL_SEC}, stale-while-revalidate=30`);
        res.render("tube/trend.ejs", data);

    } catch (error) {
        console.error('予期せぬエラーが発生しました:', error);
        res.render("tube/trend.ejs", { 
            topVideos_base64: [], 
            topVideos_shell: [],
            topVideos_inv: [] 
        });
    } finally {
        // 成功しても失敗しても、「取得中」のマークは解除する
        activeRequest = null;
    }
});

module.exports = router;
