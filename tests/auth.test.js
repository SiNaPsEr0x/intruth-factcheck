'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const { once } = require('node:events');
const { AuthManager, loginUrl } = require('../bridge/auth-manager.cjs');
const { createBridge } = require('../bridge/codex-bridge.js');
const { extensionId } = require('../bridge/native-config.cjs');
const protocol = require('../realtime-factcheck/src/shared/protocol.js');
const fixture = mode => ({ bin: process.execPath, prefix: [path.join(__dirname, 'fixtures/auth-server.cjs'), mode] });

test('only official HTTPS auth pages can be opened', () => {
  assert.match(loginUrl('https://auth.openai.com/authorize?state=test'), /^https:\/\/auth\.openai\.com\//);
  for (const url of ['http://auth.openai.com/', 'https://auth.openai.com.evil.invalid/', 'javascript:alert(1)', 'https://u:p@auth.openai.com/', 'https://chatgpt.com:8443/']) {
    assert.throws(() => loginUrl(url));
  }
});
test('auth reuses a current login without disclosing account details', async t => {
  const auth = new AuthManager(fixture('existing')); t.after(() => auth.dispose());
  assert.deepEqual(await auth.status(), { state: 'ready', ready: true, canLogin: true });
  assert.equal((await auth.login()).ready, true);
  assert.equal(JSON.stringify(auth.snapshot()).includes('not-returned'), false);
});
test('concurrent login attempts share a flow and readiness changes without restarting the bridge', async t => {
  const auth = new AuthManager(fixture('normal')); t.after(() => auth.dispose());
  assert.equal((await auth.status()).state, 'required');
  const [a, b] = await Promise.all([auth.login(), auth.login()]);
  assert.equal(a.loginId, b.loginId);
  assert.equal(a.state, 'pending');
  for (let attempt = 0; attempt < 50 && !auth.snapshot().ready; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(auth.snapshot(), { state: 'ready', ready: true, canLogin: true });
});
test('cancelled and unsafe login flows do not silently reopen', async t => {
  const auth = new AuthManager(fixture('pending')); const bad = new AuthManager(fixture('bad-url'));
  t.after(() => { auth.dispose(); bad.dispose(); });
  await auth.login(); await auth.cancel();
  assert.equal(auth.snapshot().state, 'error');
  assert.equal(auth.snapshot().authUrl, undefined);
  await assert.rejects(bad.login(), /Unexpected Codex login URL/);
  assert.equal(bad.snapshot().authUrl, undefined);
});
test('auth endpoints require an allowed extension origin and expose no credential-input API', async t => {
  let calls = 0;
  const auth = { status: async () => ({ state: 'required', ready: false, canLogin: true }),
    login: async () => { calls++; return { state: 'pending', ready: false }; }, dispose() {} };
  const id = extensionId();
  const server = createBridge({ auth, runner: async () => ({ claims: [] }), allowedExtensionId: id });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const origin of [undefined, 'https://attacker.invalid', 'chrome-extension://' + 'a'.repeat(32)]) {
    const headers = { 'X-InTruth-Client': 'extension-v2', ...(origin && { Origin: origin }) };
    assert.equal((await fetch(base + '/v1/auth/login', { method: 'POST', headers })).status, 403);
  }
  assert.equal(calls, 0);
  const response = await fetch(base + '/v1/auth/login', { method: 'POST', headers: { Origin: 'chrome-extension://' + id, 'X-InTruth-Client': 'extension-v2' } });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal((await fetch(base + '/v1/auth/login', { method: 'POST',
    headers: { Origin: 'chrome-extension://' + id, 'X-InTruth-Client': 'extension-v2' }, body: '{}' })).status, 400);
  assert.equal(calls, 1);
  assert.equal((await (await fetch(base + '/health')).json()).ready, false);
});
test('extension login coordination opens one tab and stores only the attempt ID', async () => {
  const session = {}, tabs = [];
  const context = vm.createContext({ InTruthProtocol: protocol, URL, AbortSignal,
    chrome: { runtime: { sendNativeMessage: async () => ({ ok: true }) },
      storage: { session: { get: async () => ({ ...session }), set: async value => Object.assign(session, value) } },
      tabs: { create: async value => tabs.push(value) } },
    fetch: async () => Response.json({ state: 'pending', ready: false, loginId: 'same', authUrl: 'https://auth.openai.com/authorize?state=fixture' }) });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../realtime-factcheck/src/shared/connection.js'), 'utf8'), context);
  await vm.runInContext('Promise.all([InTruthConnection.openSignIn(), InTruthConnection.openSignIn()])', context);
  await vm.runInContext('InTruthConnection.openSignIn()', context);
  assert.equal(tabs.length, 1);
  assert.deepEqual(session, { intruthLoginAttempt: 'same' });
});
