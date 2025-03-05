import { Innertube } from "youtubei.js";

let yt;

async function initInnertube() {
  if (!yt) {
    yt = await Innertube.create({
      lang: "ja",
      location: "JP",
    });
    console.log("Innertube initialized!");
  }
}

async function getVideoInfo(videoId) {
  if (!yt) await initInnertube(); 

  try {
    const info = await yt.getInfo(videoId);
    return {
      title: info.basic_info.title,
      author: info.basic_info.author,
      lengthSeconds: info.basic_info.duration,
      views: info.basic_info.view_count,
      likes: info.basic_info.likes,
      description: info.basic_info.short_description,
      thumbnail: info.basic_info.thumbnail?.[0]?.url,
      uploadDate: info.basic_info.upload_date,
    };
  } catch (error) {
    console.error("Failed to get video info:", error);
    throw new Error("Failed to fetch video information.");
  }
}

export { getVideoInfo };