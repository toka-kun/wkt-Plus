const axios = require('axios');

let apis = null;
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
    
    // 【修正】初期ストリーム: itag 18 (360p統合) を最優先
    const formatStreams = videoInfo.formatStreams || [];
    let streamUrl = formatStreams.find(s => String(s.itag) === '18')?.url || formatStreams.reverse()[0]?.url || '';
    
    const audioStreams = videoInfo.adaptiveFormats || [];
    
    // 【修正】音声: itag 251 (Opus) を最優先
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
            fps: stream.fps || null // 【修正】fpsがない場合はnull
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
        
        // 【修正】音声: format_id(itag) が 251 のものを最優先
        const audioStream = streams.find(s => String(s.format_id) === '251' || String(s.itag) === '251') || 
                            streams.find(s => s.vcodec === 'none' && s.acodec === 'opus') || 
                            streams.find(s => s.vcodec === 'none');
        const audioUrl = audioStream?.url || '';

        // 【修正】初期ストリーム: format_id(itag) が 18 の360p統合ファイルを最優先
        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18') || 
                               streams.find(s => s.vcodec !== 'none' && s.acodec !== 'none');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => s.vcodec !== 'none' && s.url);
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null // 【修正】fpsがない場合はnull
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
        
        // 【修正】音声: format_id(itag) が 251 のものを最優先
        const audioStream = streams.find(s => String(s.format_id) === '251' || String(s.itag) === '251') || 
                            streams.find(s => s.vcodec === 'none' && s.acodec === 'opus') || 
                            streams.find(s => s.vcodec === 'none');
        const audioUrl = audioStream?.url || '';

        // 【修正】初期ストリーム: format_id(itag) が 18 の360p統合ファイルを最優先
        const combinedStream = streams.find(s => String(s.format_id) === '18' || String(s.itag) === '18') || 
                               streams.find(s => s.vcodec !== 'none' && s.acodec !== 'none');
        const streamUrl = combinedStream?.url || '';

        const videoStreams = streams.filter(s => s.vcodec !== 'none' && s.url);
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || null // 【修正】fpsがない場合はnull
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
// 🌟 最終振り分け処理（ルーターから呼ばれる）
// =========================================
async function getYouTube(videoId, apiType = 'invidious') {
    if (apiType === 'siatube') {
        return await getSiaTube(videoId);
    } else if (apiType === 'yuzutube') {
        return await getYuZuTube(videoId);
    } else {
        return await getInvidious(videoId);
    }
}

module.exports = { ggvideo, getapis, getYouTube };
