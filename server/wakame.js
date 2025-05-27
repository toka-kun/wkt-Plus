const axios = require('axios');
const bodyParser = require('body-parser');

let apis = null;
const MAX_API_WAIT_TIME = 3000; 
const MAX_TIME = 10000;

async function getapis() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/inv.json');
        apis = await response.data;
        console.log('データを取得しました:', apis);
    } catch (error) {
        console.error('データの取得に失敗しました:', error);
        await getapisgit();
    }
}

async function getapisgit() {
    try {
        const response = await axios.get('https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/inv.json');
        apis = await response.data;
        console.log('データを取得しました:', apis);
    } catch (error) {
        console.error('データの取得に失敗しました:', error);
    }
}

async function ggvideo(videoId) {
  const startTime = Date.now();
  const instanceErrors = new Set();
  for (let i = 0; i < 20; i++) {
    if (Math.floor(Math.random() * 20) === 0) {
        await getapis();
    }
  }
  if(!apis){
    await getapisgit();
  }
  for (const instance of apis) {
    try {
      const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      console.log(`使ってみたURL: ${instance}/api/v1/videos/${videoId}`);
      
      if (response.data && response.data.formatStreams) {
        return response.data; 
      } else {
        console.error(`formatStreamsが存在しない: ${instance}`);
      }
    } catch (error) {
      console.error(`エラーだよ: ${instance} - ${error.message}`);
      instanceErrors.add(instance);
    }

    if (Date.now() - startTime >= MAX_TIME) {
      throw new Error("接続がタイムアウトしました");
    }
  }
  throw new Error("動画を取得する方法が見つかりません");
}

async function getYouTube (videoId) {
  try {
    const videoInfo = await ggvideo(videoId);
    const formatStreams = videoInfo.formatStreams || [];
    const streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
    const audioStreams = videoInfo.adaptiveFormats || [];
    let highstreamUrl = audioStreams
      .filter(stream => stream.container === 'webm' && stream.resolution === '1080p')
      .map(stream => stream.url)[0];
    const audioUrl = audioStreams
      .filter(stream => stream.container === 'm4a' && stream.audioQuality === 'AUDIO_QUALITY_MEDIUM')
      .map(stream => stream.url)[0];
    const streamUrls = audioStreams
      .filter(stream => stream.container === 'webm' && stream.resolution)
      .map(stream => ({
        url: stream.url,
        resolution: stream.resolution,
      }));
    
    const templateData = {
      stream_url: streamUrl,
      highstreamUrl: highstreamUrl,
      audioUrl: audioUrl,
      videoId: videoId,
      channelId: videoInfo.authorId,
      channelName: videoInfo.author,
      channelImage: videoInfo.authorThumbnails?.[videoInfo.authorThumbnails.length - 1]?.url || '',
      videoTitle: videoInfo.title,
      videoDes: videoInfo.descriptionHtml,
      videoViews: videoInfo.viewCount,
      likeCount: videoInfo.likeCount,
      streamUrls: streamUrls
    };
          
    return(templateData);
  } catch (error) {
    return error;
  }
}

module.exports = { 
  ggvideo, 
  getapis,
  getYouTube
};
