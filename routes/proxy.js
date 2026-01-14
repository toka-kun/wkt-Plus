// proxy-router-with-shadow.js
const axios = require("axios");
const express = require("express");
const router = express.Router();

// (既存の wakamepp 取得用関数はそのまま残します)
async function Getproxy(id, ff) {
  try {
    const response = await axios.get(`https://wakamepp.glitch.me/${ff}/${id}.html`, {
      timeout: 5000,
      responseType: 'arraybuffer',
      maxContentLength: 10 * 1024 * 1024
    });
    return { data: response.data, headers: response.headers, status: response.status };
  } catch (error) {
    // upstream のステータスがあれば伝播する
    if (error.response) {
      return { error: true, status: error.response.status, headers: error.response.headers, data: error.response.data };
    }
    return { error: true, status: 502, message: error.message };
  }
}

async function GetproxyList() {
  try {
    const response = await axios.get(`https://wakamepp.glitch.me/list.html`, {
      timeout: 5000,
      responseType: 'arraybuffer',
      maxContentLength: 10 * 1024 * 1024
    });
    return { data: response.data, headers: response.headers, status: response.status };
  } catch (error) {
    if (error.response) {
      return { error: true, status: error.response.status, headers: error.response.headers, data: error.response.data };
    }
    return { error: true, status: 502, message: error.message };
  }
}

// --- ここから shadow.html をそのまま返す実装 ---
const SHADOW_RAW_URL = 'https://raw.githubusercontent.com/myproxy0107-hash/new-yu-yu/refs/heads/main/templates/shadow.html';

// テンプレートを取得してそのまま返すヘルパー
async function fetchShadowTemplate() {
  try {
    // テキストとして取得（HTML なので text が適切）
    const resp = await axios.get(SHADOW_RAW_URL, { timeout: 5000, responseType: 'text' });
    return { data: resp.data, headers: resp.headers, status: resp.status };
  } catch (err) {
    if (err.response) {
      return { error: true, status: err.response.status, headers: err.response.headers, data: err.response.data };
    }
    return { error: true, status: 502, message: err.message };
  }
}
// --- ここまで ---

// ルート：list を返す（既存の挙動）
router.get("/", async (req, res) => {
  const result = await GetproxyList();
  if (result && !result.error && result.status === 200) {
    // 元ヘッダに content-type があればそのまま転送（最低限 html/text）
    if (result.headers && result.headers['content-type']) {
      res.set('Content-Type', result.headers['content-type']);
    }
    return res.send(Buffer.from(result.data));
  } else {
    const status = result && result.status ? result.status : 500;
    return res.status(status).send('ブログ記事の取得に失敗しました');
  }
});

// 新ルート：/templates/shadow で GitHub の raw をそのまま返す
router.get('/templates/shadow', async (req, res) => {
  const tpl = await fetchShadowTemplate();
  if (tpl && !tpl.error && tpl.status === 200) {
    // raw.githubusercontent の場合 content-type が text/plain になっていることがあるので
    // 明示的に HTML として返す（そのまま表示させたいとのことなので）
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(tpl.data);
  } else {
    const status = tpl && tpl.status ? tpl.status : 502;
    return res.status(status).send('テンプレートの取得に失敗しました');
  }
});

// 既存ルート：/:ff/:id のまま（必要であればこちらを shadow に向けるなど調整可能）
router.get('/:ff/:id', async (req, res) => {
  const id = req.params.id;
  const ff = req.params.ff;

  // もし全ての templates/shadow リクエストをここに来るようにしたい場合は、
  // ここで条件を見て fetchShadowTemplate() を呼ぶことも可能です。
  // 例: if (ff === 'templates' && id === 'shadow') { ... }

  const result = await Getproxy(id, ff);
  if (result && !result.error && result.status === 200) {
    if (result.headers && result.headers['content-type']) {
      res.set('Content-Type', result.headers['content-type']);
    }
    return res.send(Buffer.from(result.data));
  } else {
    const status = result && result.status ? result.status : 500;
    return res.status(status).send('Proxyが見つかりません。');
  }
});

module.exports = router;
