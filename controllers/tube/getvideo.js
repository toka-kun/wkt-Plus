const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");
const axios = require("axios");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

// サーバーリスト
const serverUrls = ['invidious', 'siawaseok', 'yudlp', 'ytdlpinstance-vercel', 'min-tube2-api', 'xeroxyt-nt-apiv1', 'simple-yt-stream'];

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;
    const cookies = parseCookies(req);
    const wakames = cookies.playbackMode;
    
    if (wakames == "edu") return res.redirect(`/wkt/yt/edu/${videoId}`);
    if (wakames == "nocookie") return res.redirect(`/wkt/yt/nocookie/${videoId}`);

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }

    const selectedApi = req.query.server;
    let baseUrl = selectedApi || 'invidious'; 
    let apiToUse = selectedApi || 'invidious'; 
    let fallbackMessage = null; 

    try {
        // ▼▼▼ パラメータ指定がない場合の自動キャッシュ検索ロジック ▼▼▼
        if (!selectedApi) {
            let cacheFound = false;

            // 1. まず最優先の siawaseok を単独でチェック (タイムアウト2秒)
            try {
                const siaRes = await axios.get('https://siawaseok.f5.si/api/cache', { timeout: 2000 });
                if (siaRes.data && siaRes.data[videoId]) {
                    apiToUse = 'siawaseok';
                    baseUrl = 'siawaseok';
                    fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                    console.log(`🎯 キャッシュヒット: siawaseok (${videoId})`);
                    cacheFound = true;
                }
            } catch (e) {
                console.log(`ℹ️ siawaseok キャッシュ確認スキップ: ${e.message}`);
            }

            // 2. siawaseok に無かった場合のみ、残り2つを並列でチェック
            if (!cacheFound) {
                const [yudRes, katuoRes] = await Promise.allSettled([
                    axios.get('https://yudlp.vercel.app/cache', { timeout: 2000 }),
                    axios.get('https://ytdlpinstance-vercel.vercel.app/cache', { timeout: 2000 })
                ]);

                // 優先順位2: yudlp (video配列の中に動画IDがあるか)
                if (yudRes.status === 'fulfilled' && yudRes.value.data && yudRes.value.data.video && yudRes.value.data.video.includes(videoId)) {
                    apiToUse = 'yudlp';
                    baseUrl = 'yudlp';
                    fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                    console.log(`🎯 キャッシュヒット: yudlp (${videoId})`);
                } 
                // 優先順位3: ytdlpinstance-vercel (キーが動画ID)
                else if (katuoRes.status === 'fulfilled' && katuoRes.value.data && katuoRes.value.data[videoId]) {
                    apiToUse = 'ytdlpinstance-vercel';
                    baseUrl = 'ytdlpinstance-vercel';
                    fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                    console.log(`🎯 キャッシュヒット: ytdlpinstance-vercel (${videoId})`);
                } 
                // どれにもキャッシュがない場合
                else {
                    console.log(`ℹ️ キャッシュなし: デフォルトの invidious を使用 (${videoId})`);
                }
            }
        }
        // ▲▲▲ ここまで ▲▲▲

        const videoData = await wakamess.getYouTube(videoId, apiToUse);
        const Info = await serverYt.infoGet(videoId);
        
        const watch_next_feed = serverYt.normalizeWatchNextFeed(Info.watch_next_feed);

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
