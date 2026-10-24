"use strict";
const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const serverYt = require("./server/youtube.js");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();

app.use(compression());
app.use(express.static(path.join(__dirname, "public")));
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

// 起動と同時にYouTubeクライアントの準備を始めておく(ここでは待たない)。
// アクセスが来たときは server/youtube.js 側が「準備が終わるまで待つ」ので、
// 準備中のアクセスで失敗することはない。
function warmUpYouTube() {
  serverYt.getClient()
    .then(() => console.log("YouTube client initialized successfully"))
    .catch((e) => {
      console.error("YouTube client initialization failed:", e.message, "cause:", e.cause);
      if (require.main === module) {
        // 常駐サーバー(Render/Railwayなど)では、30秒後に準備をやり直す
        console.log("Retrying YouTube client initialization in 30s...");
        setTimeout(warmUpYouTube, 30000);
      }
      // サーバーレス(Vercel/Netlify)では、次のアクセス時に自動でやり直される
    });
}

process.on("unhandledRejection", console.error);
warmUpYouTube();

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${PORT}`);
  });
}
