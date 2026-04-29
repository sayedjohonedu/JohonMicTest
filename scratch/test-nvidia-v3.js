
const https = require('https');

const apiKey = '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';
const endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';

const modelsToTest = [
  'meta/llama-3.1-405b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.3-70b-instruct',
  'z-ai/glm4.7',
  'deepseek-ai/deepseek-v3',
  'mistralai/mistral-large-2-instruct',
  'google/gemma-2-27b-it',
  'microsoft/phi-3.5-moe-instruct'
];

async function testModel(model) {
  const body = JSON.stringify({
    model: model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 10
  });

  const data = Buffer.from(body, 'utf8');

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'integrate.api.nvidia.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${apiKey}`
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[OK] ${model}`);
        } else {
          console.log(`[FAIL ${res.statusCode}] ${model}`);
        }
        resolve();
      });
    });

    req.on('error', () => {
      console.log(`[ERROR] ${model}`);
      resolve();
    });

    req.setTimeout(5000, () => {
      console.log(`[TIMEOUT] ${model}`);
      req.destroy();
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('Testing NVIDIA models...');
  for (const model of modelsToTest) {
    await testModel(model);
  }
}

run();
