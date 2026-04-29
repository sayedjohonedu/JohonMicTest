const https = require('https');

const apiKey = "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";

const body = JSON.stringify({
  model: "z-ai/glm4.7",
  messages: [{"role": "user", "content": "Say 'connected' and nothing else."}],
  max_tokens: 50,
  temperature: 0.1
});

const req = https.request({
  hostname: 'integrate.api.nvidia.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${apiKey}`
  }
}, (res) => {
  console.log('Status Code:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
});

req.setTimeout(60000, () => {
  console.log('Timeout 60s hit');
  req.destroy();
});
req.on('error', (e) => console.error('Error:', e));
req.write(body);
req.end();
