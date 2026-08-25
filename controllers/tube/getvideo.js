const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");
const axios = require("axios");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

// サーバーリスト (表示用等のベース設定)
const serverUrls = ['invidious', 'acethinker', 'freemake', 'siawaseok', 'min-tube2-api'];

// ▼▼▼ メモリキャッシュを確認する専用の順番 ▼▼▼
const memoryCacheCheckOrder = ['siawaseok', 'invidious', 'acethinker', 'freemake', 'min-tube2-api'];

// ▼▼▼ APIごとのキャッシュ生存期間 (秒) ▼▼▼
const apiTtlSettings = {
    'invidious': 18000, // 5時間
    'acethinker': 18000, // 5時間
    'freemake': 600, // 10分
    'siawaseok': 600, // 10分
    'min-tube2-api': 18000 // 5時間
};

// 指定したAPIのTTL(ミリ秒)を返す関数。設定になければデフォルトで600秒(10分)
function getTtlMs(apiName) {
    const seconds = apiTtlSettings[apiName] || 600;
    return seconds * 1000;
}

// 指定したAPIのTTL(秒)を返す関数（Cache-Controlヘッダー用）
function getTtlSec(apiName) {
    return apiTtlSettings[apiName] || 600;
}

// ▼▼▼ メモリキャッシュ & 同時リクエスト防止用変数 ▼▼▼
const videoCache = new Map();      // 取得済みのデータを保存するマップ
const activeRequests = new Map();  // 現在取得中の「処理(Promise)」を保存するマップ

// 通常のメモリキャッシュ検索ロジックを関数化
function getNormalMemoryCache(videoId, selectedApi) {
    if (selectedApi) {
        // API指定がある場合は、そのAPIのキャッシュだけを確認
        const key = `${videoId}_${selectedApi}`;
        const data = videoCache.get(key);
        if (data && (Date.now() - data.timestamp < getTtlMs(selectedApi))) {
            return { data, api: selectedApi, key };
        }
    } else {
        // API指定がない場合、memoryCacheCheckOrderから順番にメモリキャッシュを確認する
        for (const api of memoryCacheCheckOrder) {
            const key = `${videoId}_${api}`;
            const data = videoCache.get(key);
            if (data && (Date.now() - data.timestamp < getTtlMs(api))) {
                return { data, api, key };
            }
        }
    }
    return null;
}

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
    const isTrend = req.query.trend !== undefined; // URLに ?trend パラメータが存在するか
    
    let cachedData = null;
    let hitCacheKey = null;
    let hitApiName = null; // ヒットしたAPIの名前を記憶しておく（CDNのCache-Control設定用）

    // 1. メモリキャッシュの確認 (trend時はリモートキャッシュを優先するためここではスキップ)
    if (!isTrend) {
        const cacheResult = getNormalMemoryCache(videoId, selectedApi);
        if (cacheResult) {
            cachedData = cacheResult.data;
            hitApiName = cacheResult.api;
            hitCacheKey = cacheResult.key;
        }
    }

    // キャッシュが見つかった場合は即座に返す
    if (cachedData) {
        console.log(`🚀 メモリキャッシュヒット (外部通信スキップ): ${hitCacheKey}`);
        const ttlSec = getTtlSec(hitApiName);
        res.setHeader('Cache-Control', `public, s-maxage=${ttlSec}, stale-while-revalidate=30`);
        
        // ★ 保存されているデータをコピーし、サーバー指定の有無でメッセージを出し分ける
        const finalRenderData = { ...cachedData.renderData };
        if (selectedApi) {
            finalRenderData.fallbackMessage = null; // サーバー指定時は出さない
        } else {
            finalRenderData.fallbackMessage = `キャッシュを確認したため、自動的に「${hitApiName}」を使用しました。`;
        }
        
        return res.render('tube/watch.ejs', finalRenderData);
    }

    // 2. 他のリクエストが現在データを取得中なら、APIを叩かずにその完了を待つ (F5連打対策)
    // 待機用のキー。指定があればそのAPI名で、なければ auto で待機グループを作る
    const requestKey = selectedApi ? `${videoId}_${selectedApi}` : `${videoId}_auto`;

    if (activeRequests.has(requestKey)) {
        console.log(`⏳ 同時リクエスト発生: 代表リクエストの取得完了を待機中... (${requestKey})`);
        try {
            // 先行リクエストが解決されるのをここで待つ
            const { renderData, usedApi } = await activeRequests.get(requestKey);
            const ttlSec = getTtlSec(usedApi);
            res.setHeader('Cache-Control', `public, s-maxage=${ttlSec}, stale-while-revalidate=30`);
            
            // ★ 同時待機していたリクエストにも、サーバー指定の有無でメッセージを出し分ける
            const finalRenderData = { ...renderData };
            if (selectedApi) {
                finalRenderData.fallbackMessage = null; // サーバー指定時は出さない
            } else {
                finalRenderData.fallbackMessage = `キャッシュを確認したため、自動的に「${usedApi}」を使用しました。`;
            }
            
            return res.render('tube/watch.ejs', finalRenderData);
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
        let cacheSource = selectedApi ? `${selectedApi} (明示指定)` : "Invidious (デフォルト)";

        // ▼▼▼ 特定条件下での自動キャッシュ検索ロジック ▼▼▼
        if (isTrend) {
            const reqOptions = { timeout: 5000, headers: { "User-Agent": user_agent } };
            // リモートキャッシュを取りに行く
            const [siaRes] = await Promise.allSettled([
                axios.get('https://siatube.com/api/stream/dashboard/status', reqOptions)
            ]);
            
            const siaItems = siaRes.status === 'fulfilled' ? siaRes.value.data?.cache?.items : null;
            const isSiaCached = Array.isArray(siaItems) && siaItems.some(item => item.videoid === videoId);
            
            let remoteHitApi = null;

            // ヒットしたAPIの判定
            if (isSiaCached) {
                remoteHitApi = 'siawaseok';
            }

            if (remoteHitApi) {
                // いずれかのリモートキャッシュがヒットした場合
                apiToUse = remoteHitApi; 
                baseUrl = remoteHitApi;
                fallbackMessage = `キャッシュを確認したため、自動的に「${apiToUse}」を使用しました。`;
                cacheSource = `リモートキャッシュ (${apiToUse})`;
                console.log(`🎯 リモートキャッシュヒット: ${apiToUse} (${videoId})`);

                // ヒットしたAPIのメモリキャッシュが既に存在するか確認
                const localCacheKey = `${videoId}_${apiToUse}`;
                const localCachedData = videoCache.get(localCacheKey);
                
                if (localCachedData && (Date.now() - localCachedData.timestamp < getTtlMs(apiToUse))) {
                    console.log(`🎯 リモートキャッシュヒット後、メモリキャッシュを発見 (${apiToUse}) - ${videoId}`);
                    const finalRenderData = { ...localCachedData.renderData };
                    
                    if (selectedApi && selectedApi === apiToUse) {
                        finalRenderData.fallbackMessage = null;
                    } else {
                        finalRenderData.fallbackMessage = fallbackMessage;
                    }
                    // メモリキャッシュを返して新規取得をスキップ
                    return { renderData: finalRenderData, usedApi: apiToUse };
                }
                
                // メモリキャッシュがなければ、このまま下に進んで新規取得(ヒットしたAPIを使用)

            } else {
                console.log(`ℹ️ リモートキャッシュなし (${videoId})`);
                
                // リモートキャッシュがどれもヒットしなければ、通常通りメモリキャッシュを確認
                const normalCache = getNormalMemoryCache(videoId, selectedApi);
                
                if (normalCache) {
                    console.log(`🎯 リモートキャッシュなし後、通常のメモリキャッシュを発見 (${normalCache.api}) - ${videoId}`);
                    const finalRenderData = { ...normalCache.data.renderData };
                    
                    if (selectedApi) {
                        finalRenderData.fallbackMessage = null;
                    } else {
                        finalRenderData.fallbackMessage = `キャッシュを確認したため、自動的に「${normalCache.api}」を使用しました。`;
                    }
                    // メモリキャッシュを返して新規取得をスキップ
                    return { renderData: finalRenderData, usedApi: normalCache.api };
                }

                // 通常のメモリキャッシュもなければ、デフォルト設定で新規取得へ
                apiToUse = selectedApi || 'invidious';
                baseUrl = selectedApi || 'invidious';
                cacheSource = selectedApi ? `${selectedApi} (明示指定・リモートキャッシュなし)` : "Invidious (リモートキャッシュなし)";
            }

        } else {
            // trendパラメータなしのためリモートキャッシュをスキップ (通常のメモリキャッシュは1.で確認済)
            apiToUse = selectedApi || 'invidious';
            baseUrl = selectedApi || 'invidious';
            cacheSource = selectedApi ? `${selectedApi} (明示指定・リモートキャッシュスキップ)` : "Invidious (通常時・リモートキャッシュスキップ)";
            console.log(`ℹ️ リモートキャッシュスキップ: ${apiToUse} を使用 (${videoId})`);
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
        const cacheTtlMs = getTtlMs(apiToUse);

        // メモリには純粋なデータのみを保存
        videoCache.set(saveCacheKey, {
            timestamp: Date.now(),
            renderData: renderData
        });
        console.log(`💾 メモリキャッシュに新規保存しました [ソース: ${cacheSource}] -> キー: ${saveCacheKey} (TTL: ${cacheTtlMs / 1000}秒)`);

        // APIごとの設定時間が経過後にメモリから自動削除
        setTimeout(() => {
            const currentCache = videoCache.get(saveCacheKey);
            if (currentCache && (Date.now() - currentCache.timestamp >= cacheTtlMs)) {
                videoCache.delete(saveCacheKey);
                console.log(`🗑️ メモリキャッシュの期限が切れたため解放しました: ${saveCacheKey}`);
            }
        }, cacheTtlMs);

        // 同時待機しているリクエストにも、どのAPIが使われたかを伝えるために包んで返す
        return { renderData, usedApi: apiToUse };
    })();

    // 他の同時リクエストが相乗りできるように、現在取得中として Promise を登録
    activeRequests.set(requestKey, fetchPromise);

    try {
        // 取得完了を待って画面を描画
        const { renderData, usedApi } = await fetchPromise;
        const ttlSec = getTtlSec(usedApi);
        // Vercel、NetlifyのCDNキャッシュ用にも、使ったAPIごとのTTL秒数を設定する
        res.setHeader('Cache-Control', `public, s-maxage=${ttlSec}, stale-while-revalidate=30`);
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
        serverUrls: serverUrls, // エラー画面でのリスト表示は元の順番を使用
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

module.exports = router;
