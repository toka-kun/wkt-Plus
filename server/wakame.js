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
        
    // ★ライブ配信対応（hlsUrlがあればそれをメインにする）
    if (videoInfo.hlsUrl) streamUrl = videoInfo.hlsUrl; 
    
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

        // ★ ライブ配信判定 (manifest または .m3u8 で判定)
        const isLive = streams.some(s => s.url && (s.url.includes('manifest') || s.url.includes('.m3u8')));
        const videoStreams = streams.filter(s => {
            if (!s.url || s.vcodec === 'none') return false;
            if (isLive) return true; // ライブなら除外しない！
            return s.acodec === 'none'; // 通常なら映像のみ
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

        // ★ ライブ配信判定 (manifest または .m3u8 で判定)
        const isLive = streams.some(s => s.url && (s.url.includes('manifest') || s.url.includes('.m3u8')));
        const videoStreams = streams.filter(s => {
            if (!s.url || s.resolution === 'audio only') return false;
            if (isLive) return true; // ライブなら除外しない！
            return !['18', '22'].includes(String(s.format_id || s.itag)); // 通常なら統合ストリームを除外
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
            highstreamUrl: streamUrls.find(s => s.resolution === '1080p')?.url || streamUrls[0]?.url || '',
            audioUrl: audioUrl,
            streamUrls: streamUrls
        };
    } catch (error) {
        throw new Error("YuZuTubeからの取得に失敗: " + error.message);
    }
}

// =========================================
// ④ XeroxYT-NT API からの取得
// =========================================
async function getXeroxApis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/apis/XeroxYT-NT/yes.json');
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
                    fps: null
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
// ⑤ MIN-Tube2 API からの取得
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
// ⑥ Wista Stream API からの取得
// =========================================
async function getWistaStream(videoId) {
    try {
        const response = await axios.get(`https://simple-yt-stream.onrender.com/api/video/${videoId}`, { timeout: MAX_TIME });
        const streams = response.data.streams || [];
        
        const audioStream = streams.find(s => String(s.format_id) === '251') || 
                            streams.find(s => String(s.format_id) === '140') ||
                            streams.find(s => s.quality === 'medium' || s.quality === 'low');
        const audioUrl = audioStream?.url || '';

        const combinedStream = streams.find(s => String(s.format_id) === '18');
        const streamUrl = combinedStream?.url || '';

        // ★ ライブ配信判定 (manifest または .m3u8 で判定)
        const isLive = streams.some(s => s.url && (s.url.includes('manifest') || s.url.includes('.m3u8')));
        const videoStreams = streams.filter(s => {
            if (!s.url || !s.quality) return false;
            if (isLive) return true; // ライブなら除外しない！
            // 通常なら映像のみ (統合ストリーム18等を除外) 
            return s.quality.includes('p') && String(s.format_id) !== '18' && String(s.format_id) !== '22';
        });
        
        const streamUrls = videoStreams.map(s => {
            return {
                url: s.url,
                resolution: s.quality,
                container: s.ext || 'mp4',
                fps: s.fps || null
            };
        });

        return {
            stream_url: streamUrl || streamUrls[0]?.url || '',
            highstreamUrl: streamUrls.find(s => s.resolution === '1080p')?.url || streamUrls.find(s => s.resolution === '720p')?.url || streamUrls[0]?.url || '',
            audioUrl: audioUrl,
            streamUrls: streamUrls
        };
    } catch (error) {
        throw new Error("Wista Streamからの取得に失敗: " + error.message);
    }
}


// =========================================
// 🌟 最終振り分け処理 (全API共通マニフェスト対応)
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
    } else if (apiType === 'simple-yt-stream') {
        result = await getWistaStream(videoId);
    } else {
        result = await getInvidious(videoId);
    }

    // ★ 全API共通: ライブ配信かどうかの判定 (manifest または .m3u8 で判定)
    const isLive = result.stream_url && (result.stream_url.includes('manifest') || result.stream_url.includes('.m3u8'));

    if (isLive) {
        result.audioUrl = null; // ライブ時は別音声を無効化して本体の音声に任せる

        if (result.streamUrls && result.streamUrls.length > 0) {
            const newStreamUrls = [];
            const seenResolutions = new Set(); 

            result.streamUrls.forEach(stream => {
                let resName = stream.resolution || 'Auto';
                // カッコやfpsなどのゴミテキストを綺麗に消す
                resName = resName.replace(/ \(.+\)/g, '').trim();

                if (!seenResolutions.has(resName)) {
                    seenResolutions.add(resName);
                    newStreamUrls.push({
                        url: stream.url,
                        resolution: resName, 
                        container: 'm3u8',
                        fps: stream.fps
                    });
                }
            });
            result.streamUrls = newStreamUrls; 
        } else {
            // リストが空だった場合の保険
            result.streamUrls = [{
                url: result.stream_url,
                resolution: 'Auto',
                container: 'm3u8',
                fps: null
            }];
        }
    } else {
        // 通常動画で、もし音声URLに manifest や .m3u8 が紛れ込んでいたら消す
        if (result.audioUrl && (result.audioUrl.includes('manifest') || result.audioUrl.includes('.m3u8'))) {
            result.audioUrl = null;
        }
    }

    return result;
}

module.exports = { ggvideo, getapis, getYouTube };
