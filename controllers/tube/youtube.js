const axios = require("axios");
const express = require("express");
const router = express.Router();
const serverYt = require("../../server/youtube.js");

// 取得先の設定
//   id   : エンドポイント名（/wkt/yt/<id>）。他のページからも参照されているので変えないこと
//   name : フロントエンドに表示する名前
// Default は固定の取得先を持たず、defaultKey.json で指定されたパラメーターを使う
const fetchConfigs = [
  { id: "edurl",        name: "Default",          isDefault: true },
  { id: "edurl_wakame", name: "wakame",           url: "https://raw.githubusercontent.com/wakame02/wktopu/refs/heads/main/edu.text", type: "text" },
  { id: "edurl_sia",    name: "siawaseok",        url: "https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json", type: "json", key: "params" },
  { id: "edurl_toka1",  name: "Toka_Kun_-1",      url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key1.json", type: "json", key: "result" },
  { id: "edurl_toka2",  name: "Toka_Kun_-2",      url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key2.json", type: "json", key: "result" },
  { id: "edurl_toka3",  name: "Toka_Kun_-3",      url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key3.json", type: "json", key: "result" },
  { id: "edurl_toka4",  name: "Toka_Kun_-4",      url: "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/key4.json", type: "json", key: "result" },
  { id: "edurl_wool1",  name: "woolisbest4520-1", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/1.txt", type: "text" },
  { id: "edurl_wool2",  name: "woolisbest4520-2", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/2.txt", type: "text" },
  { id: "edurl_wool3",  name: "woolisbest4520-3", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/3.txt", type: "text" },
  { id: "edurl_wool4",  name: "woolisbest4520-4", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/4.txt", type: "text" },
  { id: "edurl_wool5",  name: "woolisbest4520-5", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/5.txt", type: "text" },
  { id: "edurl_wool6",  name: "woolisbest4520-6", url: "https://raw.githubusercontent.com/wista-api-project/auto/refs/heads/main/edu/6.txt", type: "text" },
];

// Default として使うパラメーターを指定するファイル（{ "name": "edurl_toka1" } の形式）
const DEFAULT_KEY_URL = "https://raw.githubusercontent.com/toka-kun/Education/refs/heads/main/keys/defaultKey.json";
// defaultKey.json が取得できない・不正な値だった時に使うパラメーター
const FALLBACK_DEFAULT_ID = "edurl_toka1";

// ---- 1時間キャッシュ ----
const CACHE_TTL = 60 * 60 * 1000;
const cache = new Map();   // key -> { value, expires }
const pending = new Map(); // key -> Promise（同時リクエストをまとめる）

// loader の結果を1時間キャッシュする。
// 取得に失敗した時はキャッシュせず、期限切れの古い値があればそれを返す（なければ null）
function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  if (pending.has(key)) return pending.get(key);

  const promise = (async () => {
    try {
      const value = await loader();
      cache.set(key, { value, expires: Date.now() + CACHE_TTL });
      return value;
    } catch (error) {
      console.error(`Error fetching ${key}: ${error.message}`);
      return hit ? hit.value : null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}

function findConfig(id) {
  return fetchConfigs.find(c => c.id === id);
}

// defaultKey.json を読んで、Default が指す実際のパラメーターの設定を返す
async function getDefaultConfig() {
  const name = await cached("defaultKey", async () => {
    const response = await axios.get(DEFAULT_KEY_URL, { timeout: 8000 });
    const value = response.data && response.data.name;
    if (typeof value !== "string" || !value) throw new Error("defaultKey.json に name がありません");
    return value;
  });
  const target = fetchConfigs.find(c => !c.isDefault && (c.id === name || c.name === name));
  return target || findConfig(FALLBACK_DEFAULT_ID);
}

// 汎用的なデータ取得関数
async function getParamData(config) {
  if (config.isDefault) {
    return getParamData(await getDefaultConfig());
  }
  const data = await cached(config.id, async () => {
    const response = await axios.get(config.url, { timeout: 8000 });
    // JSONの場合は指定されたキー（paramsやresult）、テキストの場合はそのまま
    const value = config.type === "json" ? response.data[config.key] : response.data;
    if (!value) throw new Error("値が空です");
    return value;
  });
  return data || ""; // 失敗時は空文字を返す（エラーで止めないため）
}

// 再生に使うパラメーターを決める（?param=ID → Cookie → Default の順）
function pickParamConfig(req) {
  const wanted = req.query.param || (req.cookies && req.cookies.eduParam);
  return findConfig(wanted) || findConfig("edurl");
}

// 1. 各edurl系エンドポイントを自動生成
fetchConfigs.forEach(config => {
  router.get(`/${config.id}`, async (req, res) => {
    const data = await getParamData(config);
    res.send(`${data}`);
  });
});

// 2. /edu/:id の処理（フロントで選んだパラメーターを使う。未選択なら Default）
router.get('/edu/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const paramConfig = pickParamConfig(req);
    const ytinfo = await getParamData(paramConfig);
    const videosrc = `https://www.youtubeeducation.com/embed/${videoId}${ytinfo}&playlist=${videoId}`;
    
    const Info = await serverYt.infoGet(videoId);
    const channels = serverYt.extractChannels(Info);
    const videoInfo = {
      title: Info.primary_info?.title?.text || "",
      channels: channels,
      channelId: channels[0].id,
      channelIcon: channels[0].icon,
      channelName: channels[0].name,
      channelSubsc: channels[0].subsc,
      published: Info.primary_info?.published,
      viewCount: Info.primary_info?.view_count?.short_view_count?.text || Info.primary_info?.view_count?.view_count?.text || "",
      likeCount: Info.primary_info?.menu?.top_level_buttons?.short_like_count || Info.primary_info?.menu?.top_level_buttons?.like_count || Info.basic_info?.like_count || "",
      description: Info.secondary_info?.description?.text || "",
      watch_next_feed: serverYt.normalizeWatchNextFeed(Info.watch_next_feed),
    };

    // フロントの選択欄用（id と name だけ渡す）
    const eduParams = fetchConfigs.map(({ id, name }) => ({ id, name }));
    const defaultParamName = (await getDefaultConfig()).name;

    res.render('tube/umekomi/edu.ejs', {
      videosrc, videoInfo, videoId,
      eduParams,
      currentParamId: paramConfig.id,
      defaultParamName,
    });
  } catch (error) {
    res.status(500).render('tube/mattev', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

// 3. nocookie はそのまま
router.get('/nocookie/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&amp;mute=0&rel=0&playlist=${videoId}`;
    const Info = await serverYt.infoGet(videoId);
    const channels = serverYt.extractChannels(Info);
    const videoInfo = {
      title: Info.primary_info?.title?.text || "",
      channels: channels,
      channelId: channels[0].id,
      channelIcon: channels[0].icon,
      channelName: channels[0].name,
      channelSubsc: channels[0].subsc,
      published: Info.primary_info?.published,
      viewCount: Info.primary_info?.view_count?.short_view_count?.text || Info.primary_info?.view_count?.view_count?.text || "",
      likeCount: Info.primary_info?.menu?.top_level_buttons?.short_like_count || Info.primary_info?.menu?.top_level_buttons?.like_count || Info.basic_info?.like_count || "",
      description: Info.secondary_info?.description?.text || "",
      watch_next_feed: serverYt.normalizeWatchNextFeed(Info.watch_next_feed),
    };
          
    res.render('tube/umekomi/nocookie.ejs', {videosrc, videoInfo, videoId});
  } catch (error) {
    res.status(500).render('tube/mattev', { 
      videoId, 
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

module.exports = router;
