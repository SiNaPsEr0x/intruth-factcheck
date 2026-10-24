'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { createRunner, createBridge, readLimitedOutput, checkCli } = require('../bridge/codex-bridge.js');
const { modelId, cleanSources, validateClaims } = require('../realtime-factcheck/src/shared/protocol.js');
const command = { bin: process.execPath, prefix: [path.join(__dirname, 'fixtures/codex.cjs')] };
const payload = { prompt: 'Una frase in italiano: è verificabile?', instructions: 'Check the evidence.', webSearch: false };
const headers = { 'Content-Type': 'application/json', 'X-InTruth-Client': 'extension-v2', Origin: 'chrome-extension://' + 'a'.repeat(32) };

async function start(t, options = {}) {
  const server = createBridge({ runner: createRunner({ command }), readiness: { ready: true }, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.cancelAll(); server.close(); server.closeAllConnections(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('default model and exact identifiers are validated', () => {
  for (const value of [undefined, null, '']) assert.equal(modelId(value), 'gpt-6-luna');
  assert.equal(modelId('gpt-6-luna'), 'gpt-6-luna');
  assert.equal(modelId('custom-model-v1'), 'custom-model-v1');
  assert.throws(() => modelId('--model evil'));
  assert.throws(() => modelId('$(echo secret)'));
  for (const value of [false, 0, [], {}]) assert.throws(() => modelId(value));
});

test('sources reject executable protocols, credentials and duplicates', () => {
  assert.deepEqual(cleanSources(['javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.org', 'https://nasa.gov', 'https://nasa.gov/']), ['https://nasa.gov/']);
  assert.throws(() => validateClaims({ claims: [null] }));
  assert.throws(() => validateClaims({ claims: {} }));
});

test('model output cannot inject internal UI and session properties', () => {
  const claim = { claim: 'Example.', verdict: 'TRUE', confidence: 'HIGH', explanation: 'Evidence.',
    sources: [], speaker: 'Unknown', speaker_confidence: 'LOW', speaker_confidence_explanation: '',
    _fastClaim: 'Another claim', pending: false, verificationFailed: false, lexical: { forged: true } };
  const [clean] = validateClaims({ claims: [claim] });
  assert.deepEqual(Object.keys(clean).sort(), ['claim', 'verdict', 'confidence', 'explanation', 'sources',
    'speaker', 'speaker_confidence', 'speaker_confidence_explanation'].sort());
});

test('output limits count actual bytes read, including multibyte UTF-8', async () => {
  const fs = require('node:fs/promises');
  const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'intruth-output-test-'));
  try {
    const file = path.join(directory, 'answer.json');
    await fs.writeFile(file, 'èè');
    assert.equal(await readLimitedOutput(file, 4), 'èè');
    await assert.rejects(readLimitedOutput(file, 3), /response limit/);
    await fs.writeFile(file, 'x'.repeat(128 * 1024));
    await assert.rejects(readLimitedOutput(file, 64 * 1024), /response limit/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('CLI integration handles stdin, final JSON and actual search events', async () => {
  assert.equal(await checkCli(command), '0.164.0');
  const runner = createRunner({ command });
  const fast = await runner(payload);
  assert.equal(fast.model, 'gpt-6-luna');
  assert.equal(fast.claims[0].verdict, 'TRUE');
  assert.equal(fast.searched, false);
  assert.equal((await runner({ ...payload, webSearch: true })).searched, true);
  await assert.rejects(runner({ ...payload, prompt: 'no-search', webSearch: true }), /did not perform web search/);
  await assert.rejects(runner({ ...payload, prompt: 'invalid' }), /invalid claim/);
  await assert.rejects(runner({ ...payload, prompt: 'fail' }), /Model unavailable/);
});

test('CLI deadlines and cancellation terminate a hung process', async () => {
  await assert.rejects(createRunner({ command, timeout: 100 })({ ...payload, prompt: 'hang' }), /timed out/);
  const controller = new AbortController();
  const result = createRunner({ command })({ ...payload, prompt: 'hang' }, controller.signal);
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(result, /cancelled/);
});

test('HTTP contract round-trips UTF-8 through the Codex adapter', async t => {
  const base = await start(t);
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.service, 'intruth-codex');
  assert.equal(health.ready, true);
  const response = await fetch(base + '/v1/factcheck', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin);
  assert.equal((await response.json()).claims[0].claim, 'La Terra orbita attorno al Sole.');
});

test('HTTP rejects web origins, rebinding, invalid payloads and oversized requests', async t => {
  const base = await start(t);
  const post = (body, extra = {}) => fetch(base + '/v1/factcheck', { method: 'POST', headers: { ...headers, ...extra }, body });
  assert.equal((await post(JSON.stringify(payload), { Origin: 'https://malicious.example' })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const request = http.request(base + '/v1/factcheck', { method: 'POST', headers: { ...headers, Host: 'rebind.example:8787' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject); request.end(JSON.stringify(payload));
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('{}')).status, 400);
  assert.equal((await post(JSON.stringify({ ...payload, model: '--help' }))).status, 400);
  assert.equal((await post('x'.repeat(129 * 1024))).status, 413);
  assert.equal((await post(JSON.stringify(payload), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(base + '/v1/not-found', { method: 'POST', headers, body: '{}' })).status, 404);
});

test('preflight permits extension private-network access and supports pinning', async t => {
  const base = await start(t, { allowedExtensionId: 'a'.repeat(32) });
  const response = await fetch(base + '/v1/factcheck', { method: 'OPTIONS', headers });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-private-network'), 'true');
  assert.equal((await fetch(base + '/health', { headers: { Origin: 'chrome-extension://' + 'b'.repeat(32) } })).status, 403);
});

test('readiness and concurrency failures return distinct HTTP errors', async t => {
  const unavailable = await start(t, { readiness: { ready: false, error: 'Login required.' } });
  assert.equal((await fetch(unavailable + '/v1/factcheck', { method: 'POST', headers, body: JSON.stringify(payload) })).status, 503);
  let release;
  const started = Promise.withResolvers();
  const base = await start(t, { maxConcurrent: 1, runner: () => { started.resolve(); return new Promise(resolve => { release = resolve; }); } });
  const first = fetch(base + '/v1/factcheck', { method: 'POST', headers, body: JSON.stringify(payload) });
  await started.promise;
  const second = await fetch(base + '/v1/factcheck', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(second.status, 429);
  release({ claims: [] });
  assert.equal((await first).status, 200);
});
