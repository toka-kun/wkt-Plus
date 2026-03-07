const axios = require('axios');

let apis = null;
let xeroxApis = null;
let minTubeApis = null;
const MAX_API_WAIT_TIME = 5000; 
const MAX_TIME = 10000;

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
            const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
            if (response.data && response.data.formatStreams) return response.data;
        } catch (error) {
            console.error(`エラー: ${instance} - ${error.message}`);
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("Invidiousで動画を取得できませんでした");
}

async function getInvidious(videoId) {
    const videoInfo = await ggvideo(videoId);
    
    const formatStreams = videoInfo.formatStreams || [];
    let streamUrl = formatStreams.find(s => String(s.itag) === '18')?.url || formatStreams.reverse()[0]?.url || '';
    
    const audioStreams = videoInfo.adaptiveFormats || [];
    const audioUrl = audioStreams.find(s => String(s.itag) === '251')?.url || 
                     audioStreams.find(s => s.container === 'm4a')?.url || '';

    let highstreamUrl = audioStreams
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution === '1080p')
        .map(stream => stream.url)[0];
        
    const streamUrls = audioStreams
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution)
        .map(stream => ({
            url: stream.url,
            resolution: stream.resolution,
            container: stream.container,
            fps: stream.fps || null
        }));
        
    if (videoInfo.hlsUrl) streamUrl = `/wkt/live/s/${videoId}`;
    
    return { stream_url: streamUrl, highstreamUrl, audioUrl, streamUrls };
}

// =========================================
// ② SiaTube API からの取得
// =========================================
async function getSiaTube(videoId) {
    try {
        const response = await axios.get(`https://siawaseok.f5.si/api/streams/${videoId}`, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        const audioStream = streams.find(s => String(s.format_id) === '251' || String(s.itag) === '251') || 
                            streams.find(s => s.vcodec === 'none' && s.acodec === 'opus') || 
                            streams.find(s => s.vcodec === 'none');
        const audioUrl = audioStream?.url || '';

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18') || 
                               streams.find(s => s.vcodec !== 'none' && s.acodec !== 'none');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => s.vcodec !== 'none' && s.acodec === 'none' && s.url);
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
            highstreamUrl: streamUrls.find(s => s.resolution === '1080p')?.url || streamUrls[0]?.url || '',
            audioUrl: audioUrl,
            streamUrls: streamUrls
        };
    } catch (error) {
        throw new Error("SiaTubeからの取得に失敗: " + error.message);
    }
}

// =========================================
// ③ YuZuTube API からの取得
// =========================================
async function getYuZuTube(videoId) {
    try {
        const response = await axios.get(`https://yudlp.vercel.app/stream/${videoId}`, { timeout: MAX_TIME });
        const streams = Array.isArray(response.data) ? response.data : (response.data.formats || []);
        
        const audioStream = streams.find(s => String(s.format_id) === '251' || String(s.itag) === '251') || 
                            streams.find(s => s.resolution === 'audio only');
        const audioUrl = audioStream?.url || '';

        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => s.resolution !== 'audio only' && !['18', '22'].includes(String(s.format_id || s.itag)) && s.url);
        
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
            highstreamUrl: streamUrls.find(s => s.resolution === '1080p')?.url || streamUrls[0]?.url || '',
            audioUrl: audioUrl,
            streamUrls: streamUrls
        };
    } catch (error) {
        throw new Error("YuZuTubeからの取得に失敗: " + error.message);
    }
}

// =========================================
// ④ XeroxYT-NT API からの取得 (新規追加)
// =========================================
async function getXeroxApis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/xeroxyt-nt/yes.json');
        xeroxApis = await response.data;
    } catch (error) {
        console.error('Xerox-NTサーバーリストの取得に失敗:', error);
    }
}

async function getXeroxNT(videoId) {
    const startTime = Date.now();
    if (!xeroxApis) await getXeroxApis();
    if (!xeroxApis || xeroxApis.length === 0) throw new Error("Xerox-NTのAPIリストがありません");

    for (const instance of xeroxApis) {
        try {
            const response = await axios.get(`${instance}/stream?id=${videoId}`, { timeout: MAX_TIME });
            const data = response.data;
            
            if (data && data.streamingUrl) {
                // 画質配列を共通フォーマットに整形
                const streamUrls = (data.formats || []).map(f => ({
                    url: f.url,
                    resolution: f.quality || (f.height ? f.height + 'p' : ''),
                    container: f.container || 'mp4',
                    fps: null // Xerox APIにfpsデータが無いためnull
                }));

                return {
                    stream_url: data.streamingUrl, 
                    highstreamUrl: streamUrls.find(s => s.resolution === '1080p')?.url || data.streamingUrl,
                    audioUrl: data.audioUrl || '',
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`エラー: ${instance} - ${error.message}`);
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("Xerox-NTで動画を取得できませんでした");
}

// =========================================
// ⑤ MIN-Tube2 API からの取得 (新規追加)
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

    for (const instance of minTubeApis) {
        try {
            const response = await axios.get(`${instance}/api/video/${videoId}`, { timeout: MAX_TIME });
            const data = response.data;
            
            if (data && data.stream_url) {
                // UIの画質選択プルダウンを壊さないように、配列を自作してあげる
                const streamUrls = [];
                if (data.stream_url) {
                    streamUrls.push({ url: data.stream_url, resolution: '通常画質', container: 'mp4', fps: null });
                }
                if (data.highstreamUrl) {
                    streamUrls.push({ url: data.highstreamUrl, resolution: '高画質', container: 'mp4', fps: null });
                }

                return {
                    stream_url: data.stream_url, 
                    highstreamUrl: data.highstreamUrl || data.stream_url,
                    audioUrl: data.audioUrl || '',
                    streamUrls: streamUrls
                };
            }
        } catch (error) {
            console.error(`エラー: ${instance} - ${error.message}`);
        }
        if (Date.now() - startTime >= MAX_TIME) throw new Error("接続がタイムアウトしました");
    }
    throw new Error("MIN-Tube2で動画を取得できませんでした");
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
    } else if (apiType === 'xeroxyt-nt-apiv1') {
        result = await getXeroxNT(videoId);
    } else if (apiType === 'min-tube2-api') {
        result = await getMinTube2(videoId);
    } else {
        result = await getInvidious(videoId);
    }

    // ① 取得した音声が manifest.googlevideo.com から始まっていたら null にする
    if (result.audioUrl && result.audioUrl.startsWith('https://manifest.googlevideo.com/')) {
        result.audioUrl = null;
    }

    // ② 取得した映像(stream_url)が manifest.googlevideo.com から始まっていたら Proxy を追加
    if (result.stream_url && result.stream_url.startsWith('https://manifest.googlevideo.com/')) {
        const encodedUrl = encodeURIComponent(result.stream_url);
        const proxyUrl = `https://proxy-siawaseok.duckdns.org/proxy/m3u8?url=${encodedUrl}`;

        // ライブ配信の場合は映像のみリストが空かもしれないので初期化
        if (!result.streamUrls) result.streamUrls = [];
        
        // Proxy版を追加
        result.streamUrls.unshift({
            url: proxyUrl,
            resolution: 'Proxy (HLS)',
            container: 'proxy',
            fps: null
        });
        
        // 元のマニフェストURLも自動画質として追加
        result.streamUrls.unshift({
            url: result.stream_url,
            resolution: 'Auto (HLS)',
            container: 'm3u8',
            fps: null
        });
    }

    return result;
}
