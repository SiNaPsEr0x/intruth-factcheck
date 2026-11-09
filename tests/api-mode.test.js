'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createApiRunner, createBridge } = require('../bridge/codex-bridge.js');
const { apiBaseUrl, apiKey, modelId } = require('../realtime-factcheck/src/shared/protocol.js');

const claim = { claim: 'Example factual claim.', verdict: 'TRUE', confidence: 'HIGH', explanation: 'Evidence.',
  sources: [], speaker: 'Unknown', speaker_confidence: 'MEDIUM', speaker_confidence_explanation: 'Plain assertion.' };
const payload = { prompt: 'Check this claim.', instructions: 'Return JSON.', webSearch: false, model: 'custom-model-v1' };

test('apiBaseUrl accepts https and loopback http only, without credentials', () => {
  assert.equal(apiBaseUrl(''), '');
  assert.equal(apiBaseUrl(undefined), '');
  assert.equal(apiBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
  assert.equal(apiBaseUrl('https://api.mistral.ai/v1/'), 'https://api.mistral.ai/v1');
  assert.equal(apiBaseUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1');
  assert.equal(apiBaseUrl('http://localhost:11434'), 'http://localhost:11434');
  assert.throws(() => apiBaseUrl('http://api.example.com/v1'), /https/);
  assert.throws(() => apiBaseUrl('https://user:pass@api.example.com/v1'), /credentials/);
  assert.throws(() => apiBaseUrl('https://api.example.com/v1?x=1'), /credentials/);
  assert.throws(() => apiBaseUrl('javascript:alert(1)'), /https/);
  assert.throws(() => apiBaseUrl('not a url'));
  assert.throws(() => apiBaseUrl(42));
});

test('apiKey rejects whitespace, control chars and non-strings', () => {
  assert.equal(apiKey(''), '');
  assert.equal(apiKey('sk-test-123_ABC'), 'sk-test-123_ABC');
  assert.throws(() => apiKey('sk abc'));
  assert.throws(() => apiKey('sk\nabc'));
  assert.throws(() => apiKey('x'.repeat(201)));
  assert.throws(() => apiKey(123));
});

async function mockApi(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); server.closeAllConnections(); });
  return `http://127.0.0.1:${server.address().port}/v1`;
}

test('createApiRunner calls chat/completions with bearer key and validates claims', async (t) => {
  let seen;
  const base = await mockApi(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      const claims = [{ ...claim, sources: ['https://nasa.gov/x', 'http://127.0.0.1:9/secret', 'javascript:alert(1)'] }];
      const content = JSON.stringify({ claims });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  const runner = createApiRunner({ baseUrl: base, key: 'sk-test-123' });
  const result = await runner({ ...payload, webSearch: true });
  assert.equal(seen.url, '/v1/chat/completions');
  assert.equal(seen.auth, 'Bearer sk-test-123');
  assert.equal(seen.body.model, 'custom-model-v1');
  assert.equal(seen.body.response_format.type, 'json_object');
  assert.equal(seen.body.messages[0].role, 'system');
  assert.equal(result.searched, true);
  assert.equal(result.model, 'custom-model-v1');
  assert.deepEqual(result.claims[0].sources, ['https://nasa.gov/x']); // loopback/non-http sources stripped
});

test('createApiRunner rejects invalid config and API errors without leaking the key', async (t) => {
  assert.throws(() => createApiRunner({ baseUrl: '', key: 'sk-x' }), /base URL/);
  assert.throws(() => createApiRunner({ baseUrl: 'https://api.example.com/v1', key: '' }), /API key/);
  const base = await mockApi(t, (_req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'rate limited' } }));
  });
  const runner = createApiRunner({ baseUrl: base, key: 'sk-secret-do-not-leak' });
  await assert.rejects(runner(payload), error => {
    assert.match(error.message, /rate limited/);
    assert.ok(!error.message.includes('sk-secret-do-not-leak'));
    return true;
  });
  const bad = await mockApi(t, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }));
  });
  await assert.rejects(createApiRunner({ baseUrl: bad, key: 'sk-x' })(payload));
});

test('Exa web search grounds sources to URLs actually returned by the search', async (t) => {
  let exaSeen;
  const exaBase = await mockApi(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      exaSeen = { url: req.url, key: req.headers['x-api-key'], body: JSON.parse(body) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ results: [
        { url: 'https://nasa.gov/earth', title: 'NASA Earth', text: 'Earth orbits the Sun.' },
        { url: 'http://127.0.0.1:9/internal', title: 'local', text: 'must be dropped' },
      ] }));
    });
  });
  const base = await mockApi(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      assert.match(parsed.messages[1].content, /Web search results \(Exa\)/);
      assert.match(parsed.messages[1].content, /(?:^|\n)- https:\/\/nasa\.gov\/earth( |—|\n)/);
      const claims = [{ ...claim, sources: ['https://nasa.gov/earth', 'https://hallucinated.example/fake'] }];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims }) } }] }));
    });
  });
  const runner = createApiRunner({ baseUrl: base, key: 'sk-test', exaKey: 'exa-secret', exaBaseUrl: exaBase });
  const result = await runner({ ...payload, webSearch: true, searchQuery: 'Earth orbits the Sun' });
  assert.equal(exaSeen.url, '/v1/search');
  assert.equal(exaSeen.key, 'exa-secret');
  assert.equal(exaSeen.body.query, 'Earth orbits the Sun');
  assert.equal(result.searched, true);
  // Only the Exa-returned public URL is credited; the hallucinated one is dropped.
  assert.deepEqual(result.claims[0].sources, ['https://nasa.gov/earth']);
});

test('without an Exa key, webSearch keeps model-cited public sources only', async (t) => {
  const base = await mockApi(t, (_req, res) => {
    const claims = [{ ...claim, sources: ['https://nasa.gov/x', 'http://127.0.0.1:9/secret'] }];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims }) } }] }));
  });
  const runner = createApiRunner({ baseUrl: base, key: 'sk-test' });
  const result = await runner({ ...payload, webSearch: true, searchQuery: 'q' });
  assert.equal(result.searched, true);
  assert.deepEqual(result.claims[0].sources, ['https://nasa.gov/x']);
});

test('bridge uses payload.api credentials and skips the Codex login requirement', async (t) => {
  const base = await mockApi(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      assert.equal(req.headers.authorization, 'Bearer sk-bridge-test');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims: [claim] }) } }] }));
    });
  });
  // readiness.ready = false: without api credentials this would be a 503.
  const server = createBridge({ runner: () => { throw new Error('CLI runner must not be used'); }, readiness: { ready: false } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.cancelAll(); server.close(); server.closeAllConnections(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-InTruth-Client': 'extension-v2', Origin: 'chrome-extension://' + 'a'.repeat(32) };

  const ok = await fetch(url + '/v1/factcheck', { method: 'POST', headers,
    body: JSON.stringify({ ...payload, api: { baseUrl: base, key: 'sk-bridge-test' } }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).claims[0].verdict, 'TRUE');

  const noApi = await fetch(url + '/v1/factcheck', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(noApi.status, 503);

  const badApi = await fetch(url + '/v1/factcheck', { method: 'POST', headers,
    body: JSON.stringify({ ...payload, api: { baseUrl: 'http://evil.example.com', key: 'sk-x' } }) });
  assert.equal(badApi.status, 400);
  assert.match((await badApi.json()).error.message, /https/);
});
