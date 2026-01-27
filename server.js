"use strict";
const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const YouTubeJS = require("youtubei.js");
const serverYt = require("./server/youtube.js");
const cors = require('cors');
const cookieParser = require('cookie-parser');

let app = express();
let client;

app.use(compression());
app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.set("trust proxy", 1);
app.use(cookieParser());

app.use((req, res, next) => {
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
app.use("/pp", require("./routes/proxy"));
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
// --- ここから下を server.js の末尾に上書きしてください ---

async function initInnerTube() {
    try {
        client = await YouTubeJS.Innertube.create({ lang: "ja", location: "JP" });
        serverYt.setClient(client);
        console.log("YouTube Client initialized.");
    } catch (e) {
        console.error("YouTube Client Init Error:", e);
        // エラーでもリトライしつつサーバー自体は落とさないようにする
        setTimeout(initInnerTube, 10000);
    }
}

process.on("unhandledRejection", console.error);

// サーバー起動処理
initInnerTube();

// Vercel等のServerless環境のためにappをエクスポートする（必須）
module.exports = app;

// ローカルやKoyeb（通常のサーバー）で実行された場合のみポートをリッスンする
// Vercelではここは実行されず、module.exports = app が使われます
if (require.main === module) {
    const listener = app.listen(process.env.PORT || 3000, () => {
        console.log(process.pid, "Ready.", listener.address().port);
    });
}
