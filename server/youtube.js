import { Innertube, UniversalCache } from "youtubei.js";

let yt;

async function initInnerTube() {
  try {
    yt = await Innertube.create({ location: process.env.GEOLOCATION || "US", cache: new UniversalCache(true, process.env.CACHE_DIR || "./.cache") });
    
  } catch (e) {
    console.error(process.pid, "--- Failed to initialize InnerTube. Trying again in 10 seconds....");
    console.error(e);

    setTimeout(initInnerTube, 10000);
  };
};

async function getVideoInfo(videoId) {
  console.log(videoId)
  if (!yt) await initInnerTube();

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