const axios = require('axios');

let apis = null;
let xeroxApis = null;
let minTubeApis = null;
let aceThinkerApis = null;
const MAX_API_WAIT_TIME = 5000; 
const MAX_TIME = 10000;       // 高速サーバー用 (10秒)
const MAX_TIME_SLOW = 20000;  // 低速サーバー用 (20秒)

// 配列をランダムにシャッフルする関数
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// =========================================
// ① Invidious API からの取得
// =========================================
async function getapis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/Invidious/yes.json');
        apis = await response.data;
    } catch (error) {
        console.error('Invidiousサーバーリストの取得に失敗:', error);
    }
}

async function ggvideo(videoId) {
    const startTime = Date.now();
    if (!apis) await getapis();
    if (!apis) throw new Error("InvidiousのAPIリストがありません");

    for (const instance of apis) {
        try {
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_API_WAIT_TIME });
            if (response.data && response.data.formatStreams) {
                console.log(`✅ 使用したAPI (Invidious): ${apiUrl}`);
                return response.data;
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
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
        throw new Error("SenninTube Plus APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ★ AceThinker API からの取得
// =========================================
async function getAceThinkerApis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/AceThinker/yes.json');
        aceThinkerApis = await response.data;
    } catch (error) {
        console.error('AceThinkerサーバーリストの取得に失敗:', error);
    }
}

async function getAceThinker(videoId) {
    const startTime = Date.now();
    if (!aceThinkerApis) await getAceThinkerApis();
    if (!aceThinkerApis || aceThinkerApis.length === 0) throw new Error("AceThinkerのAPIリストがありません");

    const shuffledApis = shuffleArray([...aceThinkerApis]);

    for (const instance of shuffledApis) {
        try {
            const apiUrl = `${instance}/api/dlapinewv2.php?url=https://www.youtube.com/watch?v=${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME }); 
            const resData = response.data.res_data;
            
            if (resData && resData.formats) {
                console.log(`✅ 使用したAPI (AceThinker): ${apiUrl}`);
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
        throw new Error("Freemake APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// ④ XeroxYT-NT API からの取得 (低速・ランダム)
// =========================================
async function getXeroxApis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/XeroxYT-NT/yes.json');
        xeroxApis = await response.data;
    } catch (error) {
        console.error('XeroxYT-NTサーバーリストの取得に失敗:', error);
    }
}

async function getXeroxNT(videoId) {
    const startTime = Date.now();
    if (!xeroxApis) await getXeroxApis();
    if (!xeroxApis || xeroxApis.length === 0) throw new Error("Xerox-NTのAPIリストがありません");

    const shuffledApis = shuffleArray([...xeroxApis]);

    for (const instance of shuffledApis) {
        try {
            const apiUrl = `${instance}/stream?id=${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME_SLOW }); 
            const data = response.data;
            
            if (data && data.streamingUrl) {
                console.log(`✅ 使用したAPI (XeroxYT-NT): ${apiUrl}`);
                
                const streamUrls = (data.formats || []).map(f => ({
                    url: f.url,
                    resolution: f.quality || (f.height ? f.height + 'p' : 'Auto'),
                    container: f.container || 'mp4',
                    fps: null
                }));
                
                // 元々単独URLだったものを配列として格納
                const audioUrls = data.audioUrl ? [{ url: data.audioUrl, name: 'Default Audio', container: 'Auto' }] : [];

                return {
                    stream_url: data.streamingUrl, 
                    audioUrls: audioUrls,
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
        }
        if (Date.now() - startTime >= MAX_TIME_SLOW) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("XeroxYT-NT APIで動画を取得できませんでした");
}

// =========================================
// ⑤ MIN-Tube2 API からの取得 (高速・ランダム)
// =========================================
async function getMinTube2Apis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json');
        minTubeApis = await response.data;
    } catch (error) {
        console.error('MIN-Tube2サーバーリストの取得に失敗:', error);
    }
}

async function getMinTube2(videoId) {
    const startTime = Date.now();
    if (!minTubeApis) await getMinTube2Apis();
    if (!minTubeApis || minTubeApis.length === 0) throw new Error("MIN-Tube2のAPIリストがありません");

    const shuffledApis = shuffleArray([...minTubeApis]);

    for (const instance of shuffledApis) {
        try {
            const apiUrl = `${instance}/api/video/${videoId}`;
            const response = await axios.get(apiUrl, { timeout: MAX_TIME }); 
            const data = response.data;
            
            if (data && data.stream_url) {
                console.log(`✅ 使用したAPI (MIN-Tube2): ${apiUrl}`);
                const streamUrls = [];
                if (data.highstreamUrl && data.highstreamUrl !== data.stream_url) {
                    streamUrls.push({ url: data.highstreamUrl, resolution: 'High Quality', container: 'mp4', fps: null });
                }

                // 元々単独URLだったものを配列として格納
                const audioUrls = data.audioUrl ? [{ url: data.audioUrl, name: 'Default Audio', container: 'Auto' }] : [];

                return {
                    stream_url: data.stream_url, 
                    audioUrls: audioUrls, 
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`❌ エラー: ${instance} - ${error.message}`);
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
        throw new Error("Wista Stream APIからの取得に失敗: " + error.message);
    }
}

// =========================================
// 🌟 最終振り分け処理
// =========================================
async function getYouTube(videoId, apiType = 'invidious') {
    let result;
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
