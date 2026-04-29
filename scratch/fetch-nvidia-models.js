
const https = require('https');

const apiKey = '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';

const req = https.request({
  hostname: 'integrate.api.nvidia.com',
  port: 443,
  path: '/v1/models',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Raw Response:', data);
    }
  });
});

req.on('error', (e) => console.error(e));
req.end();
