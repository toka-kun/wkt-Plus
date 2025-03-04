"use strict";
const express = require("express");
let app = express();
const cluster = require("cluster");
const os = require("os");
const compression = require("compression");
const numClusters = os.cpus().length;
if (cluster.isMaster) {
  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    cluster.fork();
  });
} else {
  app.use(compression());
  app.use(express.static(__dirname + "/public"));
  app.set("view engine", "ejs");
  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}

const path = require("path");
const bodyParser = require("body-parser");

app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("trust proxy", 1);

app.get('/', (req, res) => {
  res.render("home/index");
});

app.get('/app', (req, res) => {
  res.render("app/list");
});

app.get("/tst/:id", (req, res) => {
  res.render(`tst/${req.params.id}`);
});

const mentionWebhook = require('./server/youtube');
app.get("/tstr/:id", async (req, res) => {
  const p = await mentionWebhook.getInfo();
  console.log(p)
  res.render(`tst/${req.params.id}`);
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