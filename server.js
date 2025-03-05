"use strict";
const cluster = require("cluster");
const os = require("os");

if (!process.env.NO_CLUSTERS && cluster.isPrimary) {
  const numClusters = process.env.CLUSTERS || (os.availableParallelism ? os.availableParallelism() : (os.cpus().length || 2))

  console.log(`Primary ${process.pid} is running. Will fork ${numClusters} clusters.`);

  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Forking another one....`);
    cluster.fork();
  });
  
  return true;
}

const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const YouTubeJS = require("youtubei.js");

let app = express();
let client;

app.use(compression());
app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("trust proxy", 1);

app.get('/', (req, res) => {
  res.render("home/index");
});

app.get('/app', (req, res) => {
  res.render("app/list");
});

app.use("/tools", require("./routes/tools"));
app.use("/blog", require("./routes/blog"));
app.use("/wkt", require("./routes/wakametube"));
app.use("/game", require("./routes/game"));

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

app.get("/umekomiapi/:id", async (req, res) => {
  try {
    let id = req.params.id || req.query.v;
    let info = await client.getInfo(id);
    res.json({
      videoId: id,
      channelId: info.secondary_info.owner.author.id,
      channelName: info.secondary_info.owner.author.name,
      channelImage: info.secondary_info.owner.author.thumbnails[0].url || '',
      videoTitle: info.primary_info.title.text,
      videoDes: info.secondary_info.description.text,
      videoViews: info.primary_info.view_count.text,
      likeCount: info.basic_info.like_count || 0
    });
  } catch (error) {
    util.sendError(res, error);
  }
});

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not available.",
  });
});

app.on("error", console.error);

async function initInnerTube() {
  try {
    client = await YouTubeJS.Innertube.create({ lang: "ja", location: "JP"});
  } catch (e) {
    console.error(e);
    setTimeout(initInnerTube, 10000);
  };
};
process.on("unhandledRejection", console.error);
initInnerTube();