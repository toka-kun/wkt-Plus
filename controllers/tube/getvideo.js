const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");
const axios = require("axios");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

// サーバーリスト (この順番でメモリキャッシュを探しに行きます)
const serverUrls = ['invidious', 'acethinker', 'siawaseok', 'yudlp', 'ytdlpinstance-vercel', 'senninytdlp', 'min-tube2-api', 'xeroxyt-nt-apiv1', 'simple-yt-stream', 'freemake'];

// ▼▼▼ 10分間のメモリキャッシュ & 同時リクエスト防止用変数 ▼▼▼
const videoCache = new Map();      // 取得済みのデータを保存するマップ
const activeRequests = new Map();  // 現在取得中の「処理(Promise)」を保存するマップ
const CACHE_TTL = 10 * 60 * 1000;  // 10分 (600,000ms)

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
    
    let cachedData = null;
    let hitCacheKey = null;

    // 1. メモリキャッシュの確認
    if (selectedApi) {
        // API指定がある場合は、そのAPIのキャッシュだけを確認
        hitCacheKey = `${videoId}_${selectedApi}`;
        const data = videoCache.get(hitCacheKey);
        if (data && (Date.now() - data.timestamp < CACHE_TTL)) {
            cachedData = data;
        }
    } else {
        // API指定がない場合、Invidiousから順番にメモリキャッシュを確認する
        for (const api of serverUrls) {
            const key = `${videoId}_${api}`;
            const data = videoCache.get(key);
            if (data && (Date.now() - data.timestamp < CACHE_TTL)) {
                hitCacheKey = key;
                cachedData = data;
                break; // 最初に見つかった有効なキャッシュを使用する
            }
        }
    }

    // キャッシュが見つかった場合は即座に返す
    if (cachedData) {
        console.log(`🚀 メモリキャッシュヒット (外部通信スキップ): ${hitCacheKey}`);
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=30');
        return res.render('tube/watch.ejs', cachedData.renderData);
    }

    // 2. 他のリクエストが現在データを取得中なら、APIを叩かずにその完了を待つ (F5連打対策)
    // 待機用のキー。指定があればそのAPI名で、なければ auto で待機グループを作る
    const requestKey = selectedApi ? `${videoId}_${selectedApi}` : `${videoId}_auto`;

    if (activeRequests.has(requestKey)) {
        console.log(`⏳ 同時リクエスト発生: 代表リクエストの取得完了を待機中... (${requestKey})`);
        try {
            // 先行リクエストが解決されるのをここで待つ
            const renderData = await activeRequests.get(requestKey);
            res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=30');
            return res.render('tube/watch.ejs', renderData);
        } catch (error) {
            // 先行リクエストが失敗した場合はこちらもエラー画面を返す
            return renderError(res, videoId, selectedApi || 'invidious', error);
        }
    }

    // 3. 自分自身が最初のリクエストなら、取得処理（Promise）を作成して代表になる
    const fetchPromise = (async () => {
        let baseUrl = selectedApi || 'invidious'; 
        let apiToUse = selectedApi || 'invidious'; 
        let fallbackMessage = null; 

        // ログ出力でどのルートを通ったか明確にするための変数
        let cacheSource = selectedApi ? `${selectedApi} (明示指定)` : "Invidious (デフォルト)";

        // ▼▼▼ パラメータ指定がない場合の自動キャッシュ検索ロジック ▼▼▼
        if (!selectedApi) {
            const reqOptions = { timeout: 5000, headers: { "User-Agent": user_agent } };
            // メモリキャッシュになかったので、リモートキャッシュを取りに行く
            const [siaRes, yudRes, katuoRes, senninRes] = await Promise.allSettled([
                axios.get('https://siawaseok.f5.si/api/cache', reqOptions),
                axios.get('https://yudlp.vercel.app/cache', reqOptions),
                axios.get('https://ytdlpinstance-vercel.vercel.app/cache', reqOptions),
                axios.get('https://senninytdlp-42jz.vercel.app/cache', reqOptions)
            ]);

            if (siaRes.status === 'fulfilled' && siaRes.value.data && siaRes.value.data[videoId]) {
                apiToUse = 'siawaseok'; baseUrl = 'siawaseok';
                fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                cacheSource = "リモートキャッシュ (siawaseok)";
                console.log(`🎯 リモートキャッシュヒット: siawaseok (${videoId})`);
            } else if (yudRes.status === 'fulfilled' && yudRes.value.data && yudRes.value.data.video && yudRes.value.data.video.includes(videoId)) {
                apiToUse = 'yudlp'; baseUrl = 'yudlp';
                fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                cacheSource = "リモートキャッシュ (yudlp)";
                console.log(`🎯 リモートキャッシュヒット: yudlp (${videoId})`);
            } else if (katuoRes.status === 'fulfilled' && katuoRes.value.data && katuoRes.value.data[videoId]) {
                apiToUse = 'ytdlpinstance-vercel'; baseUrl = 'ytdlpinstance-vercel';
                fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                cacheSource = "リモートキャッシュ (ytdlpinstance-vercel)";
                console.log(`🎯 リモートキャッシュヒット: ytdlpinstance-vercel (${videoId})`);
            } else if (senninRes.status === 'fulfilled' && senninRes.value.data && senninRes.value.data[videoId]) {
                apiToUse = 'senninytdlp'; baseUrl = 'senninytdlp';
                fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                cacheSource = "リモートキャッシュ (senninytdlp)";
                console.log(`🎯 リモートキャッシュヒット: senninytdlp (${videoId})`);
            } else {
                // リモートキャッシュにもなかった場合、デフォルトのInvidiousを新たに取得しに行く
                cacheSource = "Invidious (リモートキャッシュなし)";
                console.log(`ℹ️ リモートキャッシュなし: デフォルトの invidious を使用 (${videoId})`);
            }
        }
        // ▲▲▲ ここまで ▲▲▲

        const videoData = await wakamess.getYouTube(videoId, apiToUse);
        const Info = await serverYt.infoGet(videoId);
        
        const watch_next_feed = serverYt.normalizeWatchNextFeed(Info.watch_next_feed);
        const channels = serverYt.extractChannels(Info);
        const videoInfo = {
            title: Info.primary_info.title.text || "",
            channels: channels,
            channelId: channels[0].id,
            channelIcon: channels[0].icon,
            channelName: channels[0].name,
            channelSubsc: channels[0].subsc,
            published: Info.primary_info.published,
            viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
            likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
            description: Info.secondary_info.description.text || "",
            watch_next_feed: watch_next_feed,
        };
        
        const renderData = { videoData, videoInfo, videoId, baseUrl, fallbackMessage };

        // ★ 指定なしでアクセスしてきても、最終的に使ったAPI名をキーにして保存する
        const saveCacheKey = `${videoId}_${apiToUse}`;

        videoCache.set(saveCacheKey, {
            timestamp: Date.now(),
            renderData: renderData
        });
        console.log(`💾 メモリキャッシュに新規保存しました [ソース: ${cacheSource}] -> キー: ${saveCacheKey}`);

        // 10分経過後にメモリから自動削除
        setTimeout(() => {
            const currentCache = videoCache.get(saveCacheKey);
            if (currentCache && (Date.now() - currentCache.timestamp >= CACHE_TTL)) {
                videoCache.delete(saveCacheKey);
                console.log(`🗑️ メモリキャッシュの期限が切れたため解放しました: ${saveCacheKey}`);
            }
        }, CACHE_TTL);

        return renderData;
    })();

    // 他の同時リクエストが相乗りできるように、現在取得中として Promise を登録
    activeRequests.set(requestKey, fetchPromise);

    try {
        // 取得完了を待って画面を描画
        const renderData = await fetchPromise;
        // Vercel、NetlifyのCDNキャッシュ用
        res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=30');
        res.render('tube/watch.ejs', renderData);
    } catch (error) {
        return renderError(res, videoId, selectedApi || 'invidious', error);
    } finally {
        // 成功しても失敗しても、「取得中」リストからは必ず削除する
        activeRequests.delete(requestKey);
    }
});

// エラー画面描画用の共通関数
function renderError(res, videoId, baseUrl, error) {
    res.status(500).render('tube/mattev.ejs', { 
        videoId, baseUrl, 
        serverUrls: serverUrls,
        error: '動画を取得できませんでした。サーバーを変更して再試行してください。', 
        details: error.message 
    });
}

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

// 念のため残す（旧わかめtubeではエラー画面に表示されるサーバー一覧をシャッフルするために使用）
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = router;
