import { Client } from 'youtubei';
const yt = new Client()

async function getVideoInfo(videoId) {
  try {
    const info = await yt.getVideo(videoId);
    return info;
  } catch (error) {
    console.error("Failed to get video info:", error);
    throw new Error("Failed to fetch video information.");
  }
}


export { getVideoInfo };
