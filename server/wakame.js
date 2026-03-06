const axios = require('axios');

let apis = null;
const MAX_API_WAIT_TIME = 5000; 
const MAX_TIME = 10000;

// =========================================
// ① Invidious API からの取得（デフォルト）
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
    let streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
    const audioStreams = videoInfo.adaptiveFormats || [];
    
    let highstreamUrl = audioStreams
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution === '1080p')
        .map(stream => stream.url)[0];
        
    const audioUrl = audioStreams
        .filter(stream => stream.container === 'm4a' && stream.audioQuality === 'AUDIO_QUALITY_MEDIUM')
        .map(stream => stream.url)[0];
        
    const streamUrls = audioStreams
        .filter(stream => (stream.container === 'webm' || stream.container === 'mp4') && stream.resolution)
        .map(stream => ({
            url: stream.url,
            resolution: stream.resolution,
            container: stream.container,
            fps: stream.fps || 30
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
        
        // ★修正: vcodec が 'none' (映像なし) のものを音声として判定
        const audioOnlyStreams = streams.filter(s => s.vcodec === 'none' || s.resolution === 'audio only');
        const opusAudio = audioOnlyStreams.find(s => s.acodec === 'opus');
        const audioUrl = opusAudio ? opusAudio.url : (audioOnlyStreams[0]?.url || '');

        // ★修正: 映像を含むフォーマットを取得
        const videoStreams = streams.filter(s => s.vcodec !== 'none' && s.url);
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            // "3840x2160" のような形式から "2160p" を抽出
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || 30
            };
        });

        return {
            stream_url: streamUrls[0]?.url || '',
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
        
        // ★修正: 音声の判定をより確実に
        const audioOnlyStreams = streams.filter(s => s.vcodec === 'none' || s.resolution === 'audio only');
        const audioUrl = audioOnlyStreams[0]?.url || '';

        // ★修正: 映像を含むフォーマットを取得
        const videoStreams = streams.filter(s => s.vcodec !== 'none' && s.url);
        const streamUrls = videoStreams.map(s => {
            let res = s.resolution || '';
            if (res.includes('x')) res = res.split('x')[1] + 'p';
            return {
                url: s.url,
                resolution: res,
                container: s.ext || 'mp4',
                fps: s.fps || 30
            };
        });

        return {
            stream_url: streamUrls[0]?.url || '',
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
