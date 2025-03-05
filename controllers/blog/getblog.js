import axios from 'axios';
import express from 'express';
import path from 'path';

const router = express.Router();

async function Getblog(blogId, part) {
  try {
    const response = await axios.get(`https://wakameblog.glitch.me/${part}/${blogId}.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

async function GetblogList(part) {
  try {
    const response = await axios.get(`https://wakameblog.glitch.me/${part}.html`);
    return response.data;
  } catch (error) {
    return null;
  }
}

router.get('/blog/:id', async (req, res) => {
  const blogId = req.params.id;
  const blogData = await Getblog(blogId, "blog");
  if (blogData) {
    res.send(blogData);
  } else {
    res.status(500).send('ブログ記事の取得に失敗しました');
  }
});

router.get('/l/:id', async (req, res) => {
  const part = req.params.id;
  const blogData = await GetblogList(part);
  if (blogData) {
    res.send(blogData);
  } else {
    res.status(500).send('ブログ記事の取得に失敗しました');
  }
});

export default router;