const express = require("express");
const router = express.Router();

// Yahoo!リアルタイム検索
const API = "https://search.yahoo.co.jp/realtime/api/v1";
const PAGE_SIZE = 40;
const TTL = 30 * 1000;
const MAX_CACHE = 100;
const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

// メモリキャッシュのみ。Vercel/Netlifyでは再起動で消えるので効きは弱い。
const cache = new Map();

async function getJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < TTL) return hit.data;

  const r = await fetch(url, {
    headers: { "User-Agent": user_agent, "Accept": "application/json", "Accept-Language": "ja" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const data = await r.json();

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(url, { time: Date.now(), data });
  return data;
}

async function send(res, url) {
  try {
    const data = await getJson(url);
    res.set("Cache-Control", "private, max-age=15").json(data);
  } catch (e) {
    console.error("X fetch error:", e.message);
    res.status(502).json({ error: "Yahoo!リアルタイム検索から取得できませんでした。" });
  }
}

// 画面
router.get("/", (req, res) => {
  res.render("other/x/home");
});

// 検索 (キーワード / id:ユーザー名)
router.get("/api/search", (req, res) => {
  const p = String(req.query.p || "").trim().slice(0, 100);
  if (!p) return res.status(400).json({ error: "検索語を入力してください。" });
  const start = Math.min(Math.max(parseInt(req.query.start, 10) || 0, 0), 1000);
  send(res, `${API}/pagination?p=${encodeURIComponent(p)}&results=${PAGE_SIZE}&start=${start}`);
});

// ベストポスト (検索で一番注目されている投稿1件。md=h)
router.get("/api/best", (req, res) => {
  const p = String(req.query.p || "").trim().slice(0, 100);
  if (!p) return res.status(400).json({ error: "検索語を入力してください。" });
  send(res, `${API}/pagination?p=${encodeURIComponent(p)}&results=1&start=0&md=h`);
});

// ツイート詳細と返信
router.get("/api/tweet/:id", (req, res) => {
  const id = req.params.id;
  if (!/^\d{1,25}$/.test(id)) return res.status(400).json({ error: "ツイートIDが正しくありません。" });
  send(res, `${API}/modal?tweetId=${id}&results=${PAGE_SIZE}&start=0`);
});

// トレンド (Yahoo検索のピックアップランキング)
// mhdinfo で匿名の eappid をもらい、それを付けて pickup_ranking を取得する。eappid は使い回し、失効したら1回だけ取り直す
const TREND_TTL = 5 * 60 * 1000;
const ID_TTL = 30 * 60 * 1000;
let eappid = null, eappidTime = 0, trendCache = null;
const trendHeaders = { "User-Agent": user_agent, "Accept": "application/json", "Accept-Language": "ja", "Referer": "https://search.yahoo.co.jp/" };

async function getEappid(force) {
  if (!force && eappid && Date.now() - eappidTime < ID_TTL) return eappid;
  const r = await fetch("https://mhd.yahoo.co.jp/v1/mhdinfo?v=3", { headers: trendHeaders, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`mhdinfo HTTP ${r.status}`);
  const j = await r.json();
  if (!j.eappid) throw new Error("mhdinfo に eappid がありません");
  eappid = j.eappid;
  eappidTime = Date.now();
  return eappid;
}

async function getTrends() {
  if (trendCache && Date.now() - trendCache.time < TREND_TTL) return trendCache.data;
  let lastError;
  for (let i = 0; i < 2; i++) {
    try {
      const id = await getEappid(i === 1);
      const r = await fetch(`https://external-datahub-search.yahooapis.jp/v1/hub/pickup_ranking?grant_from=no&.src=ush&eappid=${encodeURIComponent(id)}`, { headers: trendHeaders, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`pickup_ranking HTTP ${r.status}`);
      const rank = (await r.json()).PickUpBurstRanking || {};
      const items = [...new Set((rank.Result || []).map((x) => x.Title).filter(Boolean))];
      const data = { updated: rank.LastUpdateTime || "", items };
      trendCache = { time: Date.now(), data };
      return data;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

router.get("/api/trends", async (req, res) => {
  try {
    res.set("Cache-Control", "private, max-age=60").json(await getTrends());
  } catch (e) {
    console.error("X trends error:", e.message);
    res.status(502).json({ error: "トレンドを取得できませんでした。" });
  }
});

module.exports = router;
