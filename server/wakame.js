const axios = require('axios');

// =========================================
// キャッシュ・ペナルティ設定
// =========================================
const CACHE_DURATION = 60 * 60 * 1000; // リストのキャッシュ期間 (1時間 = 3,600,000ms)
const BLOCK_DURATION = 10 * 60 * 1000; // タイムアウト集計期間＆ブロック期間 (10分 = 600,000ms)
const MAX_FAILURES = 10;               // ブロックまでの連続タイムアウト回数

let apis = null;
let apisLastFetch = 0;

let xeroxApis = null;
let xeroxLastFetch = 0;

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

// 取得に成功した場合にカウントをリセットする関数
function recordSuccess(instance) {
    const stats = instanceStats.get(instance);
    if (stats && stats.fails > 0) {
        stats.fails = 0; // 1回でも成功したら連続タイムアウトをリセット
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

    // 最初のタイムアウトから10分以上経過していたら期間リセット
    if (now - stats.firstFailTime > BLOCK_DURATION) {
        stats.fails = 1;
        stats.firstFailTime = now;
    } else {
        stats.fails++;
    }

    // 10分以内に10回連続でタイムアウトした場合、10分間ブロック
    if (stats.fails >= MAX_FAILURES) {
        console.log(`🚫 10分以内に10回タイムアウトしたため、インスタンスを10分間ブロックします: ${instance}`);
        stats.blockedUntil = now + BLOCK_DURATION;
        stats.fails = 0; // ブロック適用後はカウントをリセット
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
    
    const adaptiveFormats = videoInfo.adaptiveFormats || [];
    
    const audioUrls = adaptiveFormats
        .filter(stream => !stream.resolution && (stream.container === 'webm' || stream.container === 'm4a') && stream.url)
        .map(stream => {
            let qualityLabel = '';
            if (stream.audioQuality) {
                qualityLabel = stream.audioQuality.replace('AUDIO_QUALITY_', '');
            } else if (stream.audioBitrate) {
                qualityLabel = `${stream.audioBitrate}kbps`;
            }

            return {
                url: stream.url,
                name: qualityLabel ? `${stream.container} (${qualityLabel})` : stream.container,
                container: stream.container
            };
        });

    const streamUrls = adaptiveFormats
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution && stream.url)
        .map(stream => ({
            url: stream.url,
            resolution: stream.resolution,
            container: stream.container,
            fps: stream.fps || null
        }));
        
    if (!streamUrl && videoInfo.hlsUrl) {
        streamUrl = videoInfo.hlsUrl; 
    }
    
    return { stream_url: streamUrl, audioUrls, streamUrls };
}

// =========================================
// ② SiaTube API からの取得
// =========================================
async function getSiaTube(videoId) {
    try {
        const apiUrl = `https://siawaseok.f5.si/api/streams/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        console.log(`✅ 使用したAPI (SiaTube): ${apiUrl}`);

        const audioUrls = streams
            .filter(s => s.vcodec === 'none' && (s.ext === 'webm' || s.ext === 'm4a'))
            .map(s => ({
                url: s.url,
                name: s.abr ? `${s.ext} (${s.abr}kbps)` : s.ext,
                container: s.ext
            }));

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18') || 
                               streams.find(s => s.vcodec !== 'none' && s.acodec !== 'none');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => {
            if (!s.url || s.vcodec === 'none') return false;
            if (s.url.includes('.m3u8') || s.url.includes('manifest')) return true;
            return s.acodec === 'none';
        });

        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: siawaseok_${videoId} - ${error.message}`);
        throw new Error("SiaTube APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ③ YuZuTube API からの取得
// =========================================
async function getYuZuTube(videoId) {
    try {
        const apiUrl = `https://yudlp.vercel.app/stream/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        console.log(`✅ 使用したAPI (YuZuTube): ${apiUrl}`);

        const audioUrls = streams
            .filter(s => s.resolution === 'audio only' && (s.ext === 'webm' || s.ext === 'm4a'))
            .map(s => ({
                url: s.url,
                name: s.abr ? `${s.ext} (${s.abr}kbps)` : s.ext,
                container: s.ext
            }));

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => {
            if (!s.url || s.resolution === 'audio only' || s.vcodec === 'none') return false;
            if (s.url.includes('.m3u8') || s.url.includes('manifest')) return true;
            return !['18', '22'].includes(String(s.format_id || s.itag));
        });
        
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: yudlp_${videoId} - ${error.message}`);
        throw new Error("YuZuTube APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ★ KatuoTube API からの取得
// =========================================
async function getKatuoTube(videoId) {
    try {
        const apiUrl = `https://ytdlpinstance-vercel.vercel.app/stream/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        console.log(`✅ 使用したAPI (KatuoTube): ${apiUrl}`);

        const audioUrls = streams
            .filter(s => (s.resolution === 'audio only' || s.vcodec === 'none') && (s.ext === 'webm' || s.ext === 'm4a'))
            .map(s => ({
                url: s.url,
                name: s.abr ? `${s.ext} (${s.abr}kbps)` : s.ext,
                container: s.ext
            }));

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => {
            if (!s.url || s.resolution === 'audio only' || s.vcodec === 'none') return false;
            if (s.url.includes('.m3u8') || s.url.includes('manifest')) return true;
            return !['18', '22'].includes(String(s.format_id || s.itag));
        });
        
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: ytdlpinstance-vercel_${videoId} - ${error.message}`);
        throw new Error("KatuoTube APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ★ SenninTube Plus API からの取得
// =========================================
async function getSenninTube(videoId) {
    try {
        const apiUrl = `https://senninytdlp-42jz.vercel.app/stream/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        console.log(`✅ 使用したAPI (SenninTube Plus): ${apiUrl}`);

        const audioUrls = streams
            .filter(s => (s.resolution === 'audio only' || s.vcodec === 'none') && (s.ext === 'webm' || s.ext === 'm4a'))
            .map(s => ({
                url: s.url,
                name: s.abr ? `${s.ext} (${s.abr}kbps)` : s.ext,
                container: s.ext
            }));

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => {
            if (!s.url || s.resolution === 'audio only' || s.vcodec === 'none') return false;
            if (s.url.includes('.m3u8') || s.url.includes('manifest')) return true;
            return !['18', '22'].includes(String(s.format_id || s.itag));
        });
        
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: senninytdlp_${videoId} - ${error.message}`);
        throw new Error("SenninTube Plus APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ★ AceThinker API からの取得
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
                        name: f.quality ? `${f.ext} (${f.quality})` : f.ext,
                        container: f.ext
                    }));

                const streamUrls = formats
                    .filter(f => f.acodec === 'none')
                    .map(f => ({
                        url: f.url,
                        resolution: f.quality || '',
                        container: f.ext || 'mp4',
                        fps: null
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
// ★ Freemake API からの取得（予備）
// =========================================
async function getFreemake(videoId) {
    try {
        const apiUrl = `https://downloader.freemake.com/api/videoinfo/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME });
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
            resolution: q.qualityInfo.qualityLabel || '',
            container: q.qualityInfo.format || 'mp4',
            fps: null
        }));

        const audioStreams = qualities.filter(q => q.qualityInfo && Number(q.qualityInfo.audioBitrate) !== 0 && String(q.qualityInfo.itag) !== '18');
        const audioUrls = audioStreams.map(q => ({
            url: q.url,
            name: q.qualityInfo.audioBitrate ? `${q.qualityInfo.format} (${q.qualityInfo.audioBitrate}kbps)` : q.qualityInfo.format,
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
// ④ XeroxYT-NT API からの取得 (低速・ランダム)
// =========================================
async function getXeroxApis() {
    const now = Date.now();
    if (xeroxApis && (now - xeroxLastFetch < CACHE_DURATION)) return;

    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/XeroxYT-NT/yes.json');
        xeroxApis = await response.data;
        xeroxLastFetch = now;
        console.log('🔄 XeroxYT-NTサーバーリストを更新しました');
    } catch (error) {
        console.error('XeroxYT-NTサーバーリストの取得に失敗:', error);
    }
}

async function getXeroxNT(videoId) {
    const startTime = Date.now();
    await getXeroxApis();
    if (!xeroxApis || xeroxApis.length === 0) throw new Error("Xerox-NTのAPIリストがありません");

    const shuffledApis = shuffleArray([...xeroxApis]);

    for (const instance of shuffledApis) {
        if (isBlocked(instance)) continue; 

        try {
            const apiUrl = `${instance}/stream?id=${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME_SLOW }); 
            const data = response.data;
            
            if (data && data.streamingUrl) {
                console.log(`✅ 使用したAPI (XeroxYT-NT): ${apiUrl}`);
                recordSuccess(instance); // 成功記録
                
                const streamUrls = (data.formats || []).map(f => ({
                    url: f.url,
                    resolution: f.quality || (f.height ? f.height + 'p' : 'Auto'),
                    container: f.container || 'mp4',
                    fps: null
                }));
                
                const audioUrls = data.audioUrl ? [{ url: data.audioUrl, name: 'Default Audio', container: 'Auto' }] : [];

                return {
                    stream_url: data.streamingUrl, 
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
        if (Date.now() - startTime >= MAX_TIME_SLOW) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("XeroxYT-NT APIで動画を取得できませんでした");
}

// =========================================
// ⑤ MIN-Tube2 API からの取得 (高速・ランダム)
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
                    streamUrls.push({ url: data.highstreamUrl, resolution: 'High Quality', container: 'mp4', fps: null });
                }

                const audioUrls = data.audioUrl ? [{ url: data.audioUrl, name: 'Default Audio', container: 'Auto' }] : [];

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
// ⑥ Wista Stream API からの取得 (低速)
// =========================================
async function getWistaStream(videoId) {
    try {
        const apiUrl = `https://simple-yt-stream.onrender.com/api/video/${videoId}`;
        const response = await axios.get(apiUrl, { timeout: MAX_TIME_SLOW });
        const streams = response.data.streams || [];
        
        console.log(`✅ 使用したAPI (Wista Stream): ${apiUrl}`);

        const audioUrls = streams
            .filter(s => s.fps === null)
            .map(s => ({
                url: s.url,
                name: s.quality ? `${s.ext} (${s.quality})` : s.ext,
                container: s.ext
            }));

        const combinedStream = streams.find(s => String(s.format_id) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => {
            if (!s.url || !s.quality) return false;
            if (s.url.includes('.m3u8') || s.url.includes('manifest')) return true;
            return s.quality.includes('p') && String(s.format_id) !== '18' && String(s.format_id) !== '22';
        });
        
        const streamUrls = videoStreams.map(s => {
            let res = s.quality || '';
            let fpsVal = s.fps || null;
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: fpsVal
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            audioUrls: audioUrls,
            streamUrls: streamUrls
        };
    } catch (error) {
        console.error(`❌ エラー: simple-yt-stream_${videoId} - ${error.message}`);
        throw new Error("Wista Stream APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// 🌟 最終振り分け処理
// =========================================
async function getYouTube(videoId, apiType = 'invidious') {
    let result;
    try {
        if (apiType === 'siawaseok') {
            result = await getSiaTube(videoId);
        } else if (apiType === 'yudlp') {
            result = await getYuZuTube(videoId);
        } else if (apiType === 'ytdlpinstance-vercel') {
            result = await getKatuoTube(videoId);
        } else if (apiType === 'senninytdlp') {
            result = await getSenninTube(videoId);
        } else if (apiType === 'acethinker') {
            result = await getAceThinker(videoId);
        } else if (apiType === 'freemake') {
            result = await getFreemake(videoId);
        } else if (apiType === 'xeroxyt-nt-apiv1') {
            result = await getXeroxNT(videoId);
        } else if (apiType === 'min-tube2-api') {
            result = await getMinTube2(videoId);
        } else if (apiType === 'simple-yt-stream') {
            result = await getWistaStream(videoId);
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
            let resName = stream.resolution || 'Auto';
            resName = resName.replace(/ \(.+\)/g, '').trim();

            if (stream.fps && resName.endsWith(stream.fps.toString())) {
                resName = resName.slice(0, -stream.fps.toString().length);
            }

            let containerType = stream.container || 'mp4';
            if (stream.url && (stream.url.includes('.m3u8') || stream.url.includes('manifest'))) {
                containerType = 'm3u8';
            }

            if (stream.url && !seenUrls.has(stream.url)) {
                seenUrls.add(stream.url);
                newStreamUrls.push({
                    url: stream.url,
                    resolution: resName, 
                    container: containerType,
                    fps: stream.fps
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
