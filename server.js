"use strict";
const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const serverYt = require("./server/youtube.js");
const cookieParser = require("cookie-parser");

const app = express();

app.use(compression());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));

// ② ログインなしで開けるページ。
//    public 配下のファイル(css/js/robots.txt など)は上の express.static が先に返すので、ここに来るのは /login だけ。
const PUBLIC_PATHS = new Set(["/login", "/login/", "/favicon.ico"]);

function isPublicPath(p) {
    // 末尾スラッシュや大文字小文字の揺れ(/Login)でもログイン画面を開けるようにする
    return PUBLIC_PATHS.has(p) || PUBLIC_PATHS.has(p.toLowerCase()) || p.toLowerCase().replace(/\/+$/, "") === "/login";
}

// 他のサイトからの呼び出しを拒否する (他サイトのJavaScript、画像・フォーム送信など)。
// 他サイトからの「ページ移動」(リンクで開く・iframeに埋め込む。どちらもGET)だけは許可する。
// CORSは使わないので、他サイトのJavaScriptはこのサイトの中身を読めない。
function isCrossSite(req) {
    const site = req.get("sec-fetch-site");
    if (site) return site === "cross-site";
    const origin = req.get("origin"); // Sec-Fetch-* を送らない古いブラウザ向けの確認
    if (!origin) return false;
    try { return new URL(origin).host !== req.get("host"); } catch (e) { return true; }
}
app.use((req, res, next) => {
    // ログイン画面と public 配下は、他サイトからのリンク・iframe でも開けるようにする
    // (ここを塞ぐと、ログインしていない人が /login すら開けず 403 forbidden になる)
    if (isPublicPath(req.path)) return next();
    const dest = req.get("sec-fetch-dest");
    const isPage = req.get("sec-fetch-mode") === "navigate" && (dest === "document" || dest === "iframe" || dest === "frame") && (req.method === "GET" || req.method === "HEAD");
    if (isCrossSite(req) && !isPage) return res.status(403).json({ error: "forbidden" });
    next();
});
app.set("trust proxy", 1);
app.use(cookieParser());

// 「アドレスバーで開いた」「リンクをクリックした」など、画面を表示するためのリクエストかどうか
function isPageNavigation(req) {
    if (req.get("sec-fetch-mode") === "navigate") return true; // ブラウザのページ移動
    const dest = req.get("sec-fetch-dest");
    if (dest === "document" || dest === "iframe" || dest === "frame") return true; // iframe 埋め込み
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    if (req.get("x-requested-with") === "XMLHttpRequest") return false; // 古い fetch ライブラリ
    // Sec-Fetch-* を送らない環境(古いブラウザ・bot・curl)は Accept で判断する。
    // "*/*" はページ移動とも API とも取れるので、API 扱い(401)にする
    return /\btext\/html\b/i.test(req.get("accept") || "");
}

// ① ログイン確認: 上の express.static が返す public 配下のファイルと /login だけは、ログインなしで使える。
//    それ以外はすべてログインが必要で、未ログインなら /login へ飛ばす。
app.use((req, res, next) => {
    if (isPublicPath(req.path)) return next();
    if (req.cookies.loginok === "ok") return next();

    // リダイレクトや 401 をブラウザ/CDN にキャッシュさせない
    res.set("Cache-Control", "no-store");

    // 画面内の通信(fetch・画像・API)には 401 を返す (リダイレクトすると HTML が返って JSON 解析で壊れるため)
    if (!isPageNavigation(req)) return res.status(401).json({ error: "login required" });

    // ページを見ようとしている場合は /login へ (ログイン画面側は一切変更しない)
    res.redirect(302, "/login");
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
