const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');
const undici = require("undici");
const bodyParser = require("body-parser");
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

const isNetlify = !!process.env.NETLIFY;

function redirectNetlifyImage(res, url) {
  return res.redirect(
    `/.netlify/images?url=${encodeURIComponent(url)}`
  );
}

router.get('/suggest', (req, res) => {
    const keyword = req.query.keyword;
    const options = {
        hostname: 'www.google.com',
        path: `/complete/search?client=youtube&hl=ja&ds=yt&q=${encodeURIComponent(keyword)}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    };
    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            const jsonString = data.substring(data.indexOf('['), data.lastIndexOf(']') + 1);

            try {
                const suggestionsArray = JSON.parse(jsonString);
                const suggestions = suggestionsArray[1].map(i => i[0]);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.json(suggestions);
            } catch (error) {
                console.error('JSON parse error:', error);
                res.status(500).send({ error: 'えらー。あらら' });
            }
        });
    });
    request.on('error', (error) => {
        console.error('Request error:', error);
        res.status(500).send({ error: 'えらー。あらら' });
    });
    request.end();
});

// ★ サムネイル取得（NetlifyのCDN委譲＋フォールバックの完全ハイブリッド化）
router.get("/vi*", async (req, res) => {
  const range = req.headers.range;
  const urlPath = req.url.split("?")[0];
  const parts = urlPath.split("/");
  
  let videoId = "";
  let requestedQuality = "";
  
  // /vi/動画ID/画質.jpg の形式からIDと画質を抽出
  if (parts.length >= 4 && parts[1] === "vi") {
    videoId = parts[2];
    requestedQuality = parts[3];
  }
  
  // フォールバックする順番
  const fallbackList = ['maxresdefault.jpg', 'sddefault.jpg', 'hqdefault.jpg', 'mqdefault.jpg', 'default.jpg'];
  const qualitiesToTry = [];
  
  // まず最初に要求された画質を試す
  if (requestedQuality) {
    qualitiesToTry.push(requestedQuality);
  }
  
  // 指定された順番でフォールバックリストを追加 (重複排除)
  fallbackList.forEach(q => {
    if (!qualitiesToTry.includes(q)) {
      qualitiesToTry.push(q);
    }
  });
  
  let headersForwarded = false;
  
  for (const quality of qualitiesToTry) {
    const targetUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/${quality}` : `https://i.ytimg.com${urlPath}`;
    
    try {
      const request = await undici.request(targetUrl, {
        headers: {
          "User-Agent": user_agent,
          ...(range && { range })
        },
        maxRedirections: 4
      });
      
      // 画像が存在した場合 (200 OK または 206 Partial Content)
      if (request.statusCode === 200 || request.statusCode === 206) {
        
        // 【Netlify環境の場合】
        if (isNetlify) {
          await request.body.dump();
          return redirectNetlifyImage(res, targetUrl);
        }

        // 【ローカルなどの通常環境の場合】
        res.status(request.statusCode);
        if (!headersForwarded) {
          for (const h of ["Accept-Ranges", "Content-Type", "Content-Range", "Content-Length", "Cache-Control"]) {
            const headerValue = request.headers[h.toLowerCase()];
            if (headerValue) res.setHeader(h, headerValue);
          }
          headersForwarded = true;
        }
        request.body.pipe(res);
        request.body.on('error', err => {
          console.error(err);
          if (!res.headersSent) res.status(500).send(err.toString());
        });
        return; // 成功したので終了
      } else {
        await request.body.dump();
      }
    } catch (err) {
      console.error(`Fetch failed for ${targetUrl}:`, err.message);
    }
  }
  
  // 見つからなかった場合は404などを返す
  if (!res.headersSent) res.status(404).send('Not Found');
});

router.get(["/yt3/*", "/ytc/*"], async (req, res) => {
  // Netlifyでは画像CDNへ委譲 (netlify.tomlで許可されているため動作します)
  if (isNetlify) {
    let url;
    if (req.url.startsWith("/yt3/")) {
      url = "https://yt3.ggpht.com" + req.url.slice(4);
    } else {
      url = "https://yt3.ggpht.com" + req.url;
    }
    return redirectNetlifyImage(res, url);
  }
  
  let url = req.url.startsWith("/yt3/") ? req.url.slice(4) : req.url;
  const range = req.headers.range;
  try {
    const request = await undici.request("https://yt3.ggpht.com" + url, {
      headers: {
        "User-Agent": user_agent,
        range
      },
      maxRedirections: 4
    })
    res.status(request.statusCode);
    for (const h of ["Accept-Ranges", "Content-Type", "Content-Range", "Content-Length", "Cache-Control"]) {
      const headerValue = request.headers[h.toLowerCase()];
      if (headerValue) res.setHeader(h, headerValue);
    }
    request.body.pipe(res);
  } catch (err) {
    res.destroy();
  }
});

router.get('/comment/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const cm = await serverYt.getComments(id);
        res.render('tube/back/comment', { cm });
   } catch (error) {
        res.status(500).render('error', { 
      id, 
      error: 'コメントを取得できません', 
      details: error.message 
    });
  }
});

router.get('/next/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const videoInfo = await serverYt.infoGet(id);
        res.render('tube/back/next', { videoInfo });
   } catch (error) {
        res.status(500).render('error', { 
      id, 
      error: 'コメントを取得できません', 
      details: error.message 
    });
  }
});

router.get("/info/:id", async (req, res) => {
  try {
		res.json(await serverYt.infoGet(req.params.id));
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "youtube.js Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get("/nextvideo/:id", async (req, res) => {
  try {
    const info = await serverYt.infoGet(req.params.id)
    if(info.watch_next_feed){
      res.json(info.watch_next_feed);
    }
    
    throw new Error(`Failed to get nextvideo`);
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "youtube.js Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get('/stream/api/:id', async (req, res) => {
  try {
    const videoData = await wakamess.getYouTube(req.params.id);
    res.json(videoData);
  } catch (error) {
    res.json(error);
  }
});

router.get("/search", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 1);
    try {
		res.render("tube/back/search.ejs", {
			res: await serverYt.search(query),
			query: query,
			page
		});
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "ytsr Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get("/wakame/refresh", async (req, res) => {
  try {
    await serverYt.getapis();
		res.json("ok");
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

module.exports = router;
