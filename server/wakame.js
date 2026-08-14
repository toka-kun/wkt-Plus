const axios = require('axios');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// =========================================
// キャッシュ・ペナルティ設定
// =========================================
const CACHE_DURATION = 60 * 60 * 1000; // リストのキャッシュ期間 (1時間)
const FAIL_WINDOW = 10 * 60 * 1000;    // ★ タイムアウト集計期間 (10分 = 600,000ms)
const BLOCK_DURATION = 30 * 60 * 1000; // ★ ブロック期間 (30分 = 1,800,000ms)
const MAX_FAILURES = 5;                // ブロックまでの連続タイムアウト回数

let apis = null;
let apisLastFetch = 0;

let minTubeApis = null;
let minTubeLastFetch = 0;

let aceThinkerApis = null;
let aceThinkerLastFetch = 0;

// インスタンスのステータス管理
// instanceUrl -> { fails: 連続タイムアウト回数, firstFailTime: 最初のタイムアウト時刻, blockedUntil: ブロック解除時刻 }
const instanceStats = new Map();

const MAX_API_WAIT_TIME = 5000; 
const MAX_TIME = 10000;       // 高速サーバー用 (10秒)
const MAX_TIME_SLOW = 20000;  // 低速サーバー用 (20秒)

// =========================================
// ユーティリティ関数
// =========================================

// 配列をランダムにシャッフルする関数
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// インスタンスがブロックされているか判定する関数
function isBlocked(instance) {
    const stats = instanceStats.get(instance);
    if (!stats) return false;
    
    if (stats.blockedUntil > Date.now()) {
        return true; // ブロック期間中
    }
    return false;
}

// 取得に成功した場合にカウントを減らす関数
function recordSuccess(instance) {
    const stats = instanceStats.get(instance);
    if (stats && stats.fails > 0) {
        // 1回成功するごとにペナルティを1つ減らす（0未満にはしない）
        stats.fails = Math.max(0, stats.fails - 1);
    }
}

// タイムアウトを記録し、条件を満たせばブロックする関数
function recordTimeout(instance) {
    const now = Date.now();
    let stats = instanceStats.get(instance);
    
    if (!stats) {
        stats = { fails: 1, firstFailTime: now, blockedUntil: 0 };
        instanceStats.set(instance, stats);
        return;
    }

    // 最初のタイムアウトから「10分（FAIL_WINDOW）」以上経過していたらカウントリセット
    if (now - stats.firstFailTime > FAIL_WINDOW) {
        stats.fails = 1;
        stats.firstFailTime = now;
    } else {
        stats.fails++;
    }

    // 10分以内に指定回数タイムアウトした場合、指定期間ブロック
    if (stats.fails >= MAX_FAILURES) {
        console.log(`🚫 10分以内に${MAX_FAILURES}回タイムアウトしたため、インスタンスを30分間ブロックします: ${instance}`);
        stats.blockedUntil = now + BLOCK_DURATION;
        stats.fails = 0; // ブロック適用後はカウントをリセットして次回の判定に備える
    }
}

// =========================================
// ① Invidious API からの取得
// =========================================
async function getapis() {
    const now = Date.now();
    if (apis && (now - apisLastFetch < CACHE_DURATION)) {
        return; 
    }
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json');
        apis = await response.data;
        apisLastFetch = now;
        console.log('🔄 Invidiousサーバーリストを更新しました');
    } catch (error) {
        console.error('Invidiousサーバーリストの取得に失敗:', error);
    }
}

async function ggvideo(videoId) {
    const startTime = Date.now();
    await getapis(); 
    if (!apis) throw new Error("InvidiousのAPIリストがありません");

    for (const instance of apis) {
        if (isBlocked(instance)) continue; 

        try {
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_API_WAIT_TIME });
            if (response.data && response.data.formatStreams) {
                console.log(`✅ 使用したAPI (Invidious): ${apiUrl}`);
                recordSuccess(instance); // 成功記録
                return response.data;
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                recordTimeout(instance); // タイムアウト記録
            }
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("Invidious APIで動画を取得できませんでした");
}

async function getInvidious(videoId) {
    const videoInfo = await ggvideo(videoId);
    
    const formatStreams = videoInfo.formatStreams || [];
    
    const defaultStream = formatStreams.find(s => String(s.itag) === '18' && s.url) || 
                          formatStreams.find(s => String(s.itag) === '22' && s.url) || 
                          formatStreams.find(s => s.container === 'mp4' && s.url && !s.url.includes('manifest') && !s.url.includes('.m3u8')) ||
                          formatStreams.find(s => s.url && !s.url.includes('manifest') && !s.url.includes('.m3u8'));
                          
    let streamUrl = defaultStream ? defaultStream.url : '';
    
    if (!streamUrl && videoInfo.hlsUrl) {
        streamUrl = videoInfo.hlsUrl; 
    }
    
    if (!streamUrl) {
        try {
            const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const getlateApiUrl = `https://getlate.dev/api/tools/youtube-live-downloader?url=${encodeURIComponent(targetUrl)}&formatId=1`;
            
            const redirectResponse = await axios.get(getlateApiUrl, {
                timeout: 3000,
                maxRedirects: 0,
                validateStatus: status => status >= 200 && status < 400
            });

            if (redirectResponse.headers && redirectResponse.headers.location) {
                streamUrl = redirectResponse.headers.location;
                console.log(`✅ getlate API からリダイレクト先を取得しました: ${streamUrl.substring(0, 50)}...`);
            } else if (redirectResponse.request && redirectResponse.request.res && redirectResponse.request.res.responseUrl) {
                streamUrl = redirectResponse.request.res.responseUrl;
                console.log(`✅ getlate API から最終URLを取得しました: ${streamUrl.substring(0, 50)}...`);
            }
        } catch (error) {
            console.error(`❌ getlate API の取得でエラーが発生しました: ${error.message}`);
        }
    }

    const adaptiveFormats = videoInfo.adaptiveFormats || [];
    
    // 音声URL取得処理（bitrateから直接kbpsを算出。audioQuality等の分岐フォールバックは削除）
    const audioUrls = adaptiveFormats
        .filter(stream => !stream.resolution && (stream.container === 'webm' || stream.container === 'm4a') && stream.url)
        .map(stream => {
            // Invidious は bitrate を 1000 で割った値を kbps としてそのまま表示する。
            // 例: 1308765 -> 130.8765kbps
            const bitrate = Number(stream.bitrate);
            const kbps = Number.isFinite(bitrate) ? (bitrate / 1000).toString() : '';
            return {
                url: stream.url,
                name: kbps ? `${kbps}kbps` : 'Unknown',
                container: stream.container
            };
        });

    const streamUrls = adaptiveFormats
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution && stream.url)
        .map(stream => {
            let name = String(stream.resolution || '').trim();

            // resolution が 1920x1080 のような形式なら短辺を p 表記にする。
            const match = name.match(/^(\d+)x(\d+)$/);
            if (match) {
                name = `${Math.min(Number(match[1]), Number(match[2]))}p`;
            }

            if (/^\d+p$/.test(name) && stream.fps) {
                name += String(stream.fps);
            }

            return {
                url: stream.url,
                name: name || 'Unknown',
                container: stream.container
            };
        });
        
    return { stream_url: streamUrl, audioUrls, streamUrls };
}

// =========================================
// ② SiaTube API からの取得
// =========================================
async function getSiaTube(videoId) {
    try {
        const apiUrl = `https://siatube.com/api/stream/${videoId}?origin=siatube`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });

        console.log(`✅ 使用したAPI (SiaTube): ${apiUrl}`);

        const data = response.data || {};
        const streamsObj = data.streams || {};

        const muxed = Array.isArray(streamsObj.muxed) ? streamsObj.muxed : [];
        const videoOnly = Array.isArray(streamsObj.videoOnly) ? streamsObj.videoOnly : [];

        // audioByLanguage は { langCode: { language, streams: [...] } } 形式
        const rawAudioByLanguage = streamsObj.audioByLanguage || {};
        const audioGroups = Object.values(rawAudioByLanguage).filter(
            v => v && Array.isArray(v.streams)
        );
        const audioList = audioGroups.flatMap(v => v.streams);

        // m3u8 は data.m3u8.list に入る
        const m3u8List = Array.isArray(data.m3u8?.list) ? data.m3u8.list : [];

        // 画質ラベルを「小さい方の辺 + fps」に統一する
        // 例: 256x138 + 30fps -> 138p30
        const formatResolutionLabel = (item) => {
            const fps = item?.fps ?? null;

            let smallSide = null;

            if (typeof item?.resolution === 'string' && item.resolution.includes('x')) {
                const [w, h] = item.resolution.split('x').map(n => Number(n));
                if (Number.isFinite(w) && Number.isFinite(h)) {
                    smallSide = Math.min(w, h);
                }
            }

            if (!smallSide && Number.isFinite(item?.width) && Number.isFinite(item?.height)) {
                smallSide = Math.min(Number(item.width), Number(item.height));
            }

            if (!smallSide && Number.isFinite(item?.height)) {
                smallSide = Number(item.height);
            }

            if (!smallSide && Number.isFinite(item?.quality)) {
                smallSide = Number(item.quality);
            }

            if (!smallSide) {
                return fps ? `unknownp${fps}` : 'unknown';
            }

            return fps ? `${smallSide}p${fps}` : `${smallSide}p`;
        };

        // ① メイン再生用ストリーム
        const combinedStream =
            muxed.find(s => String(s.formatId || s.itag) === '18') ||
            muxed[0];

        const streamUrl = combinedStream?.streamUrl || combinedStream?.url || '';

        // ② 音声ストリーム
        const audioUrls = audioList
            .filter(s => s?.streamUrl || s?.url)
            .map(s => {
                const url = s.streamUrl || s.url;
                const ext = s.ext || s.audioExt || 'm4a';
                const bitrate = s.abr ?? (s.tbr ? Number(s.tbr) : null);
                const lang = s.language?.code || s.language?.name || null;

                return {
                    url,
                    name: bitrate != null ? `${bitrate}kbps` : (s.quality || 'Unknown'),
                    container: ext,
                    language: lang,
                    formatId: s.formatId || null,
                    quality: s.quality ?? null
                };
            });

        // ③ 映像 / HLS ストリーム
        const combinedVideoStreams = [...videoOnly, ...m3u8List];
        const streamUrls = combinedVideoStreams
            .filter(s => s?.streamUrl || s?.url)
            .map(s => {
                const url = s.streamUrl || s.url;

                const isM3u8 =
                    s.isM3u8 === true ||
                    s.protocol === 'm3u8_native' ||
                    s.mediaType === 'hls' ||
                    (typeof url === 'string' && (url.includes('.m3u8') || url.includes('manifest')));

                return {
                    url,
                    name: formatResolutionLabel(s),
                    container: isM3u8 ? 'm3u8' : (s.ext || 'mp4'),
                    formatId: s.formatId || null,
                    quality: s.quality ?? null
                };
            });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls,
            streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: siawaseok_${videoId} - ${error.message}`);
        
        let waitTimeMessage = "";
        try {
            // エラー時に status.json を取得して待ち時間を計算
            const statusResponse = await axios.get('https://siatube.com/api/stream/status', { timeout: 3000 });
            const statusData = statusResponse.data;
            
            if (statusData && statusData.processing && Array.isArray(statusData.processing.ids)) {
                const ids = statusData.processing.ids;
                const myIndex = ids.indexOf(videoId);
                
                if (myIndex !== -1) {
                    // 現在処理中（先頭）のIDの経過時間 (秒) を計算
                    let longestProcessingTimeSec = 0;
                    if (statusData.processing.longest && statusData.processing.longest.durationMs) {
                        longestProcessingTimeSec = statusData.processing.longest.durationMs / 1000;
                    }

                    let estimatedWaitTime = 0;
                    
                    if (myIndex === 0) {
                        // 自分が一番前（現在まさに処理中）の場合
                        estimatedWaitTime = Math.max(0, 5 - longestProcessingTimeSec);
                    } else {
                        // 先頭のIDの残り予想時間 (既に5秒以上経過していれば0秒として扱う)
                        const firstItemRemaining = Math.max(0, 5 - longestProcessingTimeSec);
                        
                        // 自分より前にいる「先頭以外のID」の処理時間 (1件あたり5秒)
                        const othersWaitTime = (myIndex - 1) * 5;
                        
                        // 合計の待ち時間を計算
                        estimatedWaitTime = firstItemRemaining + othersWaitTime;
                    }
                    
                    // 四捨五入
                    estimatedWaitTime = Math.round(estimatedWaitTime);
                    
                    waitTimeMessage = ` (待ち時間: 約${estimatedWaitTime}秒)`;
                }
            }
        } catch (statusError) {
            console.error(`⚠️ ステータス取得失敗: ${statusError.message}`);
        }

        throw new Error(`SiaTube APIからの取得に失敗: ${error.message}${waitTimeMessage}`);
    }
}

// =========================================
// ③ AceThinker API からの取得
// =========================================
async function getAceThinkerApis() {
    const now = Date.now();
    if (aceThinkerApis && (now - aceThinkerLastFetch < CACHE_DURATION)) return;

    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/AceThinker/yes.json');
        aceThinkerApis = await response.data;
        aceThinkerLastFetch = now;
        console.log('🔄 AceThinkerサーバーリストを更新しました');
    } catch (error) {
        console.error('AceThinkerサーバーリストの取得に失敗:', error);
    }
}

async function getAceThinker(videoId) {
    const startTime = Date.now();
    await getAceThinkerApis();
    if (!aceThinkerApis || aceThinkerApis.length === 0) throw new Error("AceThinkerのAPIリストがありません");

    const shuffledApis = shuffleArray([...aceThinkerApis]);

    for (const instance of shuffledApis) {
        if (isBlocked(instance)) continue; 

        try {
            const apiUrl = `${instance}/api/dlapinewv2.php?url=https://www.youtube.com/watch?v=${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME }); 
            const resData = response.data.res_data;
            
            if (resData && resData.formats) {
                console.log(`✅ 使用したAPI (AceThinker): ${apiUrl}`);
                recordSuccess(instance); // 成功記録
                
                const formats = resData.formats;
                const combinedStream = formats.find(f => f.acodec !== 'none' && f.vcodec !== 'none');
                const streamUrl = combinedStream?.url || '';

                const audioUrls = formats
                    .filter(f => f.vcodec === 'none')
                    .map(f => ({
                        url: f.url,
                        name: f.quality || 'Unknown',
                        container: f.ext || 'unknown'
                    }));

                const streamUrls = formats
                    .filter(f => f.acodec === 'none')
                    .map(f => ({
                        url: f.url,
                        name: f.quality || 'Unknown',
                        container: f.ext || 'mp4'
                    }));

                return {
                    stream_url: streamUrl || streamUrls[0]?.url || '',
                    audioUrls: audioUrls,
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                recordTimeout(instance); // タイムアウト記録
            }
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("AceThinker APIで動画を取得できませんでした");
}

// =========================================
// ④ Freemake API からの取得
// =========================================
async function getFreemake(videoId) {
    try {
        const apiUrl = `https://downloader.freemake.com/api/videoinfo/${videoId}`;
        
        const headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": "https://www.freemake.com",
            "Referer": "https://www.freemake.com/jp/free_video_downloader/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
            "X-Analytics-Header": "UA-18256617-1",
            "X-CF-Country": "JP",
            "X-Experiments": "ss641.disabled;ss644_360p.disabled;ss656.disabled;ss661.enabled;cs210.media_element",
            "X-Processing-Id": uuid(),
            "X-Remote-Host": "www.freemake.com",
            "X-Request-Attempt": "1",
            "X-Session-Id": String(Math.floor(Math.random() * 2000000000)),
            "X-User-Browser": "Chrome",
            "X-User-Id": uuid(),
            "X-User-Platform": "Windows x86_64"
        };

        // axiosリクエストに headers を追加
        const response = await axios.get(apiUrl, { 
            timeout: MAX_TIME,
            headers: headers
        });
        
        const data = response.data;

        if (!data) {
            throw new Error("データが空です");
        }

        console.log(`✅ 使用したAPI (Freemake): ${apiUrl}`);
        const qualities = data.qualities || [];

        const combinedStream = qualities.find(q => q.qualityInfo && String(q.qualityInfo.itag) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = qualities.filter(q => q.qualityInfo && Number(q.qualityInfo.audioBitrate) === 0);
        const streamUrls = videoStreams.map(q => ({
            url: q.url,
            name: q.qualityInfo.qualityLabel || 'Unknown',
            container: q.qualityInfo.format || 'mp4'
        }));

        const audioStreams = qualities.filter(q => q.qualityInfo && Number(q.qualityInfo.audioBitrate) !== 0 && String(q.qualityInfo.itag) !== '18');
        const audioUrls = audioStreams.map(q => ({
            url: q.url,
            name: q.qualityInfo.audioBitrate ? `${q.qualityInfo.audioBitrate}kbps` : 'Unknown',
            container: q.qualityInfo.format || 'mp4'
        }));

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: freemake_${videoId} - ${error.message}`);
        throw new Error("Freemake APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ⑤ MIN-Tube2 API からの取得
// =========================================
async function getMinTube2Apis() {
    const now = Date.now();
    if (minTubeApis && (now - minTubeLastFetch < CACHE_DURATION)) return;

    try {
        const response = await axios.get('https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json');
        minTubeApis = await response.data;
        minTubeLastFetch = now;
        console.log('🔄 MIN-Tube2サーバーリストを更新しました');
    } catch (error) {
        console.error('MIN-Tube2サーバーリストの取得に失敗:', error);
    }
}

async function getMinTube2(videoId) {
    const startTime = Date.now();
    await getMinTube2Apis();
    if (!minTubeApis || minTubeApis.length === 0) throw new Error("MIN-Tube2のAPIリストがありません");

    const shuffledApis = shuffleArray([...minTubeApis]);

    for (const instance of shuffledApis) {
        if (isBlocked(instance)) continue; 

        try {
            const apiUrl = `${instance}/api/video/${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME }); 
            const data = response.data;
            
            if (data && data.stream_url) {
                console.log(`✅ 使用したAPI (MIN-Tube2): ${apiUrl}`);
                recordSuccess(instance); // 成功記録

                const streamUrls = [];
                if (data.highstreamUrl && data.highstreamUrl !== data.stream_url) {
                    streamUrls.push({ url: data.highstreamUrl, name: 'High Quality', container: 'mp4' });
                }

                const audioContainer = (() => {
                    try {
                        const pathname = new URL(data.audioUrl).pathname;
                        const match = pathname.match(/\.([a-z0-9]+)$/i);
                        return match ? match[1].toLowerCase() : 'm4a';
                    } catch (_) {
                        return 'm4a';
                    }
                })();
                const audioUrls = data.audioUrl ? [{ url: data.audioUrl, name: 'medium', container: audioContainer }] : [];

                return {
                    stream_url: data.stream_url, 
                    audioUrls: audioUrls, 
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
            if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                recordTimeout(instance); // タイムアウト記録
            }
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("MIN-Tube2 APIで動画を取得できませんでした");
}

// =========================================
// 🌟 最終振り分け処理
// =========================================
async function getYouTube(videoId, apiType = 'invidious') {
    let result;
    try {
        if (apiType === 'siawaseok') {
            result = await getSiaTube(videoId);
        } else if (apiType === 'acethinker') {
            result = await getAceThinker(videoId);
        } else if (apiType === 'freemake') {
            result = await getFreemake(videoId);
        } else if (apiType === 'min-tube2-api') {
            result = await getMinTube2(videoId);
        } else {
            result = await getInvidious(videoId);
        }
    } catch (error) {
        // APIの最終エラーログを 待機用キー (apiType_videoId) の形式でコンソールに出力
        console.error(`❌ エラー: ${apiType}_${videoId} - ${error.message}`);
        throw error; // 呼び出し元（ルーター側など）にエラーを上申する
    }

    if (result.streamUrls && result.streamUrls.length > 0) {
        const newStreamUrls = [];
        const seenUrls = new Set();

        if (result.stream_url) {
            seenUrls.add(result.stream_url);
        }

        result.streamUrls.forEach(stream => {
            const name = String(stream.name || 'Unknown').trim() || 'Unknown';
            let containerType = stream.container || 'mp4';

            if (stream.url && (stream.url.includes('.m3u8') || stream.url.includes('manifest'))) {
                containerType = 'm3u8';
            }

            if (stream.url && !seenUrls.has(stream.url)) {
                seenUrls.add(stream.url);
                newStreamUrls.push({
                    url: stream.url,
                    name,
                    container: containerType
                });
            }
        });

        result.streamUrls = newStreamUrls;
    } else {
        result.streamUrls = [];
    }

    // 音声リストの中に manifest や .m3u8 が紛れ込んでいるものを除外
    if (result.audioUrls && result.audioUrls.length > 0) {
        result.audioUrls = result.audioUrls.filter(a => !(a.url.includes('manifest') || a.url.includes('.m3u8')));
    }

    return result;
}

module.exports = { ggvideo, getapis, getYouTube };
