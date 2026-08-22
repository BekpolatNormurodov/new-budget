const http = require('http');
const axios = require('axios');

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/v2/vote/captcha-2') {
    try {
      const obRes = await axios.get('https://new.openbudget.uz/api/v2/vote/captcha-2', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      const cookie = obRes.headers['set-cookie'] ? (Array.isArray(obRes.headers['set-cookie']) ? obRes.headers['set-cookie'].join('; ') : obRes.headers['set-cookie']) : '';
      if (cookie) {
        res.setHeader('set-cookie', cookie);
      }
      res.writeHead(obRes.status);
      return res.end(JSON.stringify(obRes.data));
    } catch (err) {
      console.error('Captcha fetch error:', err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    let body = {};
    try {
      if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (e) {}

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': 'https://new.openbudget.uz',
      'Referer': 'https://new.openbudget.uz/',
    };
    if (req.headers['cookie']) headers['Cookie'] = req.headers['cookie'];

    try {
      const obRes = await axios.post('https://new.openbudget.uz' + req.url, body, {
        headers,
        validateStatus: () => true,
        timeout: 10000,
      });
      res.writeHead(obRes.status);
      return res.end(JSON.stringify(obRes.data));
    } catch (err) {
      console.error('Post error to', req.url, ':', err.message);
      res.writeHead(500);
      return res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(5055, '127.0.0.1', () => {
  console.log('🚀 Local Uzbek Gateway running on 127.0.0.1:5055');
});
