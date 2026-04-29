
const https = require('https');

const apiKey = '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';
const endpoint = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Models to test
const models = [
  'nvidia/nemotron-4-340b-instruct',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.3-70b-instruct'
];

async function testModel(model) {
  console.log(`\n--- Testing Model: ${model} ---`);
  
  const body = JSON.stringify({
    model: model,
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 10,
    temperature: 0.3
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
      console.log(`Status Code: ${res.statusCode}`);
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode === 200) {
            console.log('SUCCESS: ', parsed.choices[0].message.content);
          } else {
            console.log('FAILURE:', JSON.stringify(parsed, null, 2));
          }
        } catch (e) {
          console.log('Raw Response (non-JSON):', raw);
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error('Request Error:', e.message);
      resolve();
    });

    req.setTimeout(15000, () => {
      console.log('Request timed out after 15s');
      req.destroy();
      resolve();
    });

    req.write(data);
    req.end();
  });
}

async function runTests() {
  for (const model of models) {
    await testModel(model);
  }
}

runTests();
