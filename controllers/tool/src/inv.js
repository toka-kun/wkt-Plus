const axios = require("axios");
const express = require("express");
const router = express.Router();

const PORT = 3000;
const MAX_API_WAIT_TIME = 5000;
const videoId = "beFiVQcwVY8";

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

async function fetchStreamUrls(videoId, invidiousapis) {
  // すべてのリクエストをPromiseの配列としてマッピング
  const promises = invidiousapis.map(async (instance) => {
    try {
      const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      const data = response.data;
      
      if (data) {
        if (data.formatStreams && data.formatStreams.length > 0) {
          // formatStreamsがある場合
          let streamUrl = data.formatStreams.reverse().map(stream => stream.url)[0];
          return { success: true, api: instance, streamUrl };
        } else if (data.adaptiveFormats && data.adaptiveFormats.length > 0) {
          // formatStreamsがなく、adaptiveFormatsがある場合
          let streamUrl = data.adaptiveFormats.reverse().map(stream => stream.url)[0];
          return { success: true, api: instance, streamUrl };
        } else {
          // どちらも存在しない場合
          console.error(`ストリームが存在しない: ${instance}`);
          return { success: false, api: instance, reason: "formatStreams も adaptiveFormats も存在しません" };
        }
      } else {
        return { success: false, api: instance, reason: "レスポンスデータが空です" };
      }
    } catch (error) {
      console.error(`エラー: ${instance} - ${error.message}`);
      return { success: false, api: instance, reason: error.message };
    }
  });

  // Promise.allで並列に全てのリクエストを処理して結果を待つ
  const results = await Promise.all(promises);

  // 成功したURLとエラーになったURLを振り分ける
  const successUrls = [];
  const errorUrls = [];

  for (const result of results) {
    if (result.success) {
      successUrls.push({ api: result.api, streamUrl: result.streamUrl });
    } else {
      errorUrls.push({ api: result.api, reason: result.reason });
    }
  }

  return { successUrls, errorUrls };
}

router.post("/check", async (req, res) => {
  const urls = req.body.urls;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "APIのURLを入力してください。" });
  }

  // 正規表現 [^\s"',\]]+ を使い、JSON由来の記号などが混入してもURLだけを抽出する
  const invidiousapis = urls.map(url => url.match(/https?:\/\/[^\s"',\]]+/g)).filter(Boolean).flat();
  
  if (invidiousapis.length === 0) {
    return res.status(400).json({ error: "APIのURLを入力してください。" });
  }

  try {
    const { successUrls, errorUrls } = await fetchStreamUrls(videoId, invidiousapis);
    
    res.json({ successUrls, errorUrls });
  } catch (error) {
    res.status(500).json({ error: "エラーが発生しました: " + error.message });
  }
});

module.exports = router;
