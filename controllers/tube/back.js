import axios from "axios";
import express from "express";
import http from 'http';
import miniget from 'miniget';

const router = express.Router();

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

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

router.get("/vi*", (req, res) => {
    let stream = miniget(`https://i.ytimg.com/${req.url.split("?")[0]}`, {
        headers: {
            "user-agent": user_agent
        }
    });
    stream.on('error', err => {
        console.log(err);
        res.status(500).send(err.toString());
    });
    stream.pipe(res);
});

router.get('/comment/:id', async (req, res) => {
    const videoId = req.params.id;
    try {
        const response = await axios.get(`https://wakamecomment.glitch.me/api/wakame/${videoId}`);
        const cm = response.data;

        res.render('tube/back/comment', { cm });
    } catch (error) {
        res.status(500).render('error', { 
            videoId, 
            error: 'コメントを取得できません', 
            details: error.message 
        });
    }
});

export default router;
