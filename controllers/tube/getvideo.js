const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

// サーバーリスト
const serverUrls = ['invidious', 'siawaseok', 'yudlp', 'xeroxyt-nt-apiv1', 'min-tube2-api'];

// ... (上部の設定などはそのまま) ...

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;
    const cookies = parseCookies(req);
    const wakames = cookies.playbackMode;
    
    if (wakames == "edu") return res.redirect(`/wkt/yt/edu/${videoId}`);
    if (wakames == "nocookie") return res.redirect(`/wkt/yt/nocookie/${videoId}`);

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }

    const selectedApi = req.query.server || 'invidious';
    let baseUrl = selectedApi; 
    let apiToUse = selectedApi; // 実際に動画取得に使うAPI
    let fallbackMessage = null; // EJSに渡すアラートメッセージ

    try {
        // ▼▼▼ 追加：キャッシュ状況による負荷チェックと自動フォールバック ▼▼▼
        if (selectedApi === 'siawaseok') {
            try {
                const cacheRes = await axios.get('https://siawaseok.f5.si/api/cache', { timeout: 3000 });
                // JSONのキー（動画ID）の数をカウントして5000件を超えているかチェック
                if (cacheRes.data && Object.keys(cacheRes.data).length > 5000) {
                    apiToUse = 'invidious';
                    baseUrl = 'invidious'; // プルダウンの表示もInvidiousに戻す
                    fallbackMessage = "現在、このサイトに高い負荷がかかっていてサーバーへのリクエストがキャンセルされたため、自動的にInvidious APIを使用しました。";
                    console.log("SiaTube制限超過: 5000件以上のためInvidiousへフォールバック");
                }
            } catch (e) {
                console.error("SiaTube負荷チェック失敗:", e.message);
            }
        } else if (selectedApi === 'yudlp') {
            try {
                const cacheRes = await axios.get('https://yudlp.vercel.app/cache', { timeout: 3000 });
                // video配列の長さをカウントして10件を超えているかチェック
                if (cacheRes.data && cacheRes.data.video && cacheRes.data.video.length > 10) {
                    apiToUse = 'invidious';
                    baseUrl = 'invidious';
                    fallbackMessage = "現在、このサイトに高い負荷がかかっていてサーバーへのリクエストがキャンセルされたため、自動的にInvidious APIを使用しました。";
                    console.log("YuZuTube制限超過: 10件以上のためInvidiousへフォールバック");
                }
            } catch (e) {
                console.error("YuZuTube負荷チェック失敗:", e.message);
            }
        }
        // ▲▲▲ ここまで追加 ▲▲▲

        // ★第2引数に、負荷チェック後のAPI(apiToUse)を渡す
        const videoData = await wakamess.getYouTube(videoId, apiToUse);
        const Info = await serverYt.infoGet(videoId);
        
        let watch_next_feed = Info.watch_next_feed || [];
        if (!watch_next_feed || watch_next_feed.length === 0) {
            try {
                const invData = await wakamess.ggvideo(videoId);
                if (invData && invData.recommendedVideos) {
                    watch_next_feed = invData.recommendedVideos.map(vid => ({
                        type: "Video",
                        id: vid.videoId,
                        title: { text: vid.title },
                        author: { id: vid.authorId, name: vid.author, thumbnails: [] },
                        short_view_count: { text: vid.viewCountText || '不明' }
                    }));
                }
            } catch (e) {
                console.error("関連動画フォールバック失敗:", e.message);
            }
        }

        const videoInfo = {
            title: Info.primary_info.title.text || "",
            channelId: Info.secondary_info.owner.author.id || "",
            channelIcon: Info.secondary_info.owner.author.thumbnails[0].url || '',
            channelName: Info.secondary_info.owner.author.name || "",
            channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
            published: Info.primary_info.published,
            viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
            likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
            description: Info.secondary_info.description.text || "",
            watch_next_feed: watch_next_feed,
        };
        
        // ★ fallbackMessage をEJSに渡すように追加
        res.render('tube/watch.ejs', { videoData, videoInfo, videoId, baseUrl, fallbackMessage });
        
    } catch (error) {
        const shufServerUrls = shuffleArray([...serverUrls]);
        res.status(500).render('tube/mattev.ejs', { 
            videoId, baseUrl, 
            serverUrls: shufServerUrls,
            error: '動画を取得できませんでした。サーバーを変更して再試行してください。', 
            details: error.message 
        });
    }
});

function parseCookies(request) {
    const list = {};
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            let parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    return list;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = router;
