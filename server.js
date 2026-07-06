"use strict";
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first"); // ★追加: IPv6優先解決によるfetch失敗を回避

const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const serverYt = require("./server/youtube.js");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();
let client;
let YouTubeJS;

app.use(compression());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.set("trust proxy", 1);
app.use(cookieParser());

// ★追加: デバッグ用ルート（認証ミドルウェアより前に置く）
app.get('/debug/net', async (req, res) => {
  try {
    const r = await fetch('https://www.youtube.com', { method: 'HEAD' });
    res.send(`status: ${r.status}`);
  } catch (e) {
    res.status(500).send(`error: ${e.message}\ncause: ${JSON.stringify(e.cause)}`);
  }
});

app.use((req, res, next) => {
    if (req.path.startsWith('/debug')) return next(); // ★追加: debugパスは認証除外
    if (req.cookies.loginok !== 'ok' && !req.path.includes('login') && !req.path.includes('back')) {
        return res.redirect('/login');
    } else {
        next();
    }
});

app.get('/', (req, res) => {
  if (req.query.r === 'y') {
    res.render("home/index");
  } else {
    res.redirect('/wkt');
  }
});

app.get('/app', (req, res) => {
  res.render("app/list");
});

app.use("/wkt", require("./routes/wakametube"));
app.use("/game", require("./routes/game"));
app.use("/tools", require("./routes/tools"));
app.use("/other", require("./routes/other"));
app.use("/wakams", require("./routes/music"));
app.use("/blog", require("./routes/blog"));

app.get('/login', (req, res) => {
    res.render('home/login');
});

app.get('/watch', (req, res) => {
  const videoId = req.query.v;
  if (videoId) {
    res.redirect(`/wkt/watch/${videoId}`);
  } else {
    res.redirect(`/wkt/trend`);
  }
});
app.get('/channel/:id', (req, res) => {
  const id = req.params.id;
    res.redirect(`/wkt/c/${id}`);
});
app.get('/channel/:id/join', (req, res) => {
  const id = req.params.id;
  res.redirect(`/wkt/c/${id}`);
});
app.get('/hashtag/:des', (req, res) => {
  const des = req.params.des;
  res.redirect(`/wkt/s?q=${des}`);
});

app.use("/sandbox", require("./routes/sandbox"));

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "そのページは存在しません。",
  });
});
app.on("error", console.error);

async function initInnerTube() {
  try {
    YouTubeJS = await import("youtubei.js");
    client = await YouTubeJS.Innertube.create({ lang: "ja", location: "JP" });
    serverYt.setClient(client);
    console.log("YouTube client initialized successfully");
  } catch (e) {
    // ★変更: causeも出力して原因を特定しやすくする
    console.error("YouTube client initialization failed:", e.message, "cause:", e.cause);
    console.log("Server running without YouTube features. Retrying in 30s...");
    setTimeout(initInnerTube, 30000);
  }
}

process.on("unhandledRejection", console.error);
initInnerTube();

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${PORT}`);
  });
}
