'use strict';

/**
 * llm-client.js — Shared LLM communication layer
 * Extracted from ipc-handlers.js so both translator AND AI dictation can use it.
 */

async function callLlmRaw({ text, profile, systemPrompt, systemInstructions, messages: prebuiltMessages, temperature }) {
  const { provider, model, modelName, apiKey, baseUrl } = profile;

  const messages = prebuiltMessages || [];
  if (!prebuiltMessages) {
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    if (systemInstructions) messages.push({ role: 'system', content: systemInstructions });
    messages.push({ role: 'user', content: text });
  }

  const temp = temperature !== undefined ? temperature : 0.3;

  try {
    // Anthropic uses a different format
    if (provider === 'anthropic') {
      const body = JSON.stringify({
        model: model || modelName,
        max_tokens: 4096,
        system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
        messages: messages.filter(m => m.role === 'user'),
      });
      const result = await httpPost('https://api.anthropic.com/v1/messages', body, {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      });
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch (err) {
        return { error: `Invalid JSON response from Anthropic: ${result.substring(0, 100)}` };
      }
      if (parsed.error) return { error: parsed.error.message };
      return { text: parsed.content[0].text.trim() };
    }

    // Gemini uses a different format
    if (provider === 'gemini') {
      const sysText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
      const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
      const fullText = (sysText ? sysText + '\n\n' : '') + userText;
      const body = JSON.stringify({ contents: [{ parts: [{ text: fullText }] }] });
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || modelName}:generateContent?key=${apiKey}`;
      const result = await httpPost(url, body, {});
      let parsed;
      try {
        parsed = JSON.parse(result);
      } catch (err) {
        return { error: `Invalid JSON response from Gemini: ${result.substring(0, 100)}` };
      }
      if (parsed.error) return { error: parsed.error.message };
      return { text: parsed.candidates[0].content.parts[0].text.trim() };
    }

    // OpenAI-compatible (openai, mistral, groq, openrouter, nvidia, custom/ollama)
    const ENDPOINTS = {
      openai:     'https://api.openai.com/v1/chat/completions',
      mistral:    'https://api.mistral.ai/v1/chat/completions',
      groq:       'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      nvidia:     'https://integrate.api.nvidia.com/v1/chat/completions',
      custom:     (baseUrl || '').replace(/\/$/, '') + '/chat/completions',
    };
    const endpoint = ENDPOINTS[provider] || ENDPOINTS.custom;
    const body = JSON.stringify({ model: model || modelName, messages, max_tokens: 4096, temperature: temp });
    const result = await httpPost(endpoint, body, { Authorization: `Bearer ${apiKey}` });
    
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (err) {
      // Handle cases where the endpoint returns non-JSON (like "404 page not found")
      return { error: `Invalid JSON response from provider: ${result.substring(0, 100)}` };
    }

    if (parsed.error) return { error: parsed.error.message || JSON.stringify(parsed.error) };
    
    // Nvidia NIM and some others might return standard HTTP errors with a detail field
    if (parsed.detail || parsed.status) {
      let errorMsg = parsed.detail || parsed.title || `API Error: ${parsed.status}`;
      if (parsed.status === 404 && parsed.detail && parsed.detail.includes('Not found for account')) {
        errorMsg = `NVIDIA NIM: This model is not available for your account. Please try a different model (e.g., Llama 3.3).`;
      }
      return { error: errorMsg };
    }

    if (!parsed.choices || !parsed.choices[0]) {
      return { error: `Unexpected API response: ${result.substring(0, 200)}` };
    }
    
    const msg = parsed.choices[0].message;
    const content = msg.content || msg.reasoning_content || '';
    return { text: content.trim() };

  } catch (e) {
    console.error('LLM call error:', e);
    return { error: e.message || 'AI request failed' };
  }
}

function httpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? require('https') : require('http');
    const data = Buffer.from(body, 'utf8');
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        ...extraHeaders,
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(data);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

module.exports = { callLlmRaw, httpPost, httpGet };
