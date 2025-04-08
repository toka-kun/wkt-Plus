const express = require("express");
const router = express.Router();
const axios = require("axios");
const path = require("path");
const http = require('http');
const serverYt = require("../../server/youtube.js");
const wakamess = require("../../server/wakame.js");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;
    const cookies = parseCookies(req);
    const wakames = cookies.playbackMode;
    if (wakames == "edu") {
        return res.redirect(`/wkt/yt/edu/${videoId}`);
    }
    if (wakames == "nocookie") {
        return res.redirect(`/wkt/yt/nocookie/${videoId}`);
    }
    let server = req.query.server || '0';
    const serverUrls = [
	'https://watawata8.glitch.me',
	'https://watawata37.glitch.me',
        'https://watawatawata.glitch.me',
        'https://manawa.glitch.me',
        'https://wakeupe.glitch.me',
        'https://hortensia.glitch.me',
        'https://wata27.glitch.me',
        'https://wakameme.glitch.me',
	'direct'
        ];
    let baseUrl;
    if (server == "0") {
	if (wakames == "direct") {
           server = "direct";
        } else {
           const randomIndex = Math.floor(Math.random() * serverUrls.length);
           baseUrl = serverUrls[randomIndex];
	}
    } else {
        baseUrl = `https://${server}.glitch.me`;
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }
    try {
      let videoData;
      if (server === "direct" || baseUrl === "direct") {
        videoData = await wakamess.getYouTube(videoId);
	baseUrl = `https://direct.glitch.me`;
      }else{
	try{
         const response = await axios.get(`${baseUrl}/api/${videoId}`, {
            headers: {
                'User-Agent': user_agent
            }});
	 if(response.data && response.data.stream_url){
		 videoData = await response.data;
	 }else{
		 baseUrl = `https://directk.glitch.me`;
                 videoData = await wakamess.getYouTube(videoId);
	 }
	} catch (nestedError) {
         console.log(nestedError.message);
	 baseUrl = `https://directk.glitch.me`;
         videoData = await wakamess.getYouTube(videoId);
        }
      }
      const Info = await serverYt.infoGet(videoId);
      const videoInfo = {
        title: Info.primary_info.title.text || "",
        channelId: Info.secondary_info.owner.author.id || "",
        channelIcon: Info.secondary_info.owner.author.thumbnails[0].url || '',
        channelName: Info.secondary_info.owner.author.name || "",
        channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
        published: Info.primary_info.published,
        viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
        likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
        description: Info.secondary_info.description.text || "",
        watch_next_feed: Info.watch_next_feed || "",
      };
      res.render('tube/watch.ejs', { videoData, videoInfo, videoId, baseUrl });
  } catch (error) {
      const shufServerUrls = shuffleArray([...serverUrls]);
      res.status(500).render('tube/mattev.ejs', { 
      videoId, baseUrl, 
      serverUrls: shufServerUrls,
      error: '動画を取得できません', 
      details: error.message 
    });
  }
});

function parseCookies(request) {
    const list = {};
    const cookieHeader = request.headers.cookie;

    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            let parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }

    return list;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


module.exports = router;
