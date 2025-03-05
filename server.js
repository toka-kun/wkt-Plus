import express from "express";
import cluster from "cluster";
import os from "os";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import toolsRouter from "./routes/tools.js";
import blogRouter from "./routes/blog.js";
import wktRouter from "./routes/wakametube.js";
import gameRouter from "./routes/game.js";
import sandboxRouter from "./routes/sandbox.js";

import { getVideoInfo } from "./server/youtube.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const numClusters = os.cpus().length;

if (cluster.isPrimary) {
  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    cluster.fork();
  });
} else {
  const app = express();

  app.use(compression());
  app.use(express.static(path.join(__dirname, "public")));
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.set("trust proxy", 1);

  app.get("/", (req, res) => {
    res.render("home/index");
  });
  

app.get("/info", async (req, res) => {
  const videoId = "beFiVQcwVY8";
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId parameter" });
  }

  try {
    const info = await getVideoInfo(videoId);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});  
  
  

  app.get("/app", (req, res) => {
    res.render("app/list");
  });

  app.use("/tools", toolsRouter);
  app.use("/blog", blogRouter);
  app.use("/wkt", wktRouter);
  app.use("/game", gameRouter);

  app.get("/watch", (req, res) => {
    const videoId = req.query.v;
    res.redirect(videoId ? `/wkt/watch/${videoId}` : "/wkt/trend");
  });
  app.get("/channel/:id", (req, res) => {
    res.redirect(`/wkt/c/${req.params.id}`);
  });
  app.get("/channel/:id/join", (req, res) => {
    res.redirect(`/wkt/c/${req.params.id}`);
  });
  app.get("/hashtag/:des", (req, res) => {
    res.redirect(`/wkt/s?q=${req.params.des}`);
  });
  app.use("/sandbox", sandboxRouter);

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}
