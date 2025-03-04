const YouTubeJS = require("youtubei.js");

let client;

function setClient(newClient) {
  client = newClient;
}

async function getInfo(id) {
  try {
    let info = await client.getInfo(id);
    console.log(info)

    const templateData = {
      videoId: id,
      channelId: info.secondary_info?.owner?.author?.id || "",
      channelName: info.secondary_info?.owner?.author?.name || "",
      channelImage: info.secondary_info?.owner?.author?.thumbnails?.[0]?.url || "",
      videoTitle: info.primary_info?.title?.text || "",
      videoDes: info.basic_info?.description || "",
      videoViews: info.primary_info?.view_count?.text || "",
      likeCount: info.basic_info?.like_count || 0
    };

    return({ templateData });
  } catch (error) {
    return;
  }
}

module.exports = {
  setClient,
  getInfo
};
