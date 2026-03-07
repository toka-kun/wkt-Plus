"use strict";
const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const serverYt = require("./server/youtube.js");
const cors = require('cors');
const cookieParser = require('cookie-parser');

let app = express();
let client;
let YouTubeJS;

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

const listener = app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(process.pid, "Ready.", listener.address().port);
});

async function initInnerTube() {
  try {
    YouTubeJS = await import("youtubei.js");
    client = await YouTubeJS.Innertube.create({ lang: "ja", location: "JP"});
    serverYt.setClient(client);
    console.log("YouTube client initialized successfully");
  } catch (e) {
    console.error("YouTube client initialization failed:", e.message);
    console.log("Server running without YouTube features. Retrying in 30s...");
    setTimeout(initInnerTube, 30000);
  }
}

process.on("unhandledRejection", console.error);
initInnerTube();
