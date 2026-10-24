'use strict';
// Real Chrome Native Messaging -> automatic local bridge -> fixture Codex auth.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { install, destinations } = require('./install-helper.cjs');
const { root, launchNativeExtension } = require('./browser-helpers.cjs');
const { extensionId } = require('../bridge/native-config.cjs');
(async () => {
  if (process.platform !== 'linux') throw new Error('This browser smoke is configured for Linux CI.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intruth-helper-test-'));
  const originals = new Map();
  for (const file of destinations()) { try { originals.set(file, await fs.readFile(file)); } catch { originals.set(file, null); } }
  const previous = process.env.CODEX_BIN;
  process.env.CODEX_BIN = path.join(root, 'tests/fixtures/codex.cjs');
  process.env.INTRUTH_AUTH_FIXTURE_MODE = 'browser';
  let native;
  try {
    await install({ directory, skipDependencies: true });
    native = await launchNativeExtension({ mockSignIn: true, nativeManifest: destinations().find(file => file.includes('google-chrome-for-testing')) });
    assert.equal(native.id, extensionId());
    const popup = await native.context.newPage();
    await popup.goto(`chrome-extension://${native.id}/src/popup/popup.html`);
    try {
      await popup.waitForFunction(() => !document.querySelector('#toggleBtn').disabled, null, { timeout: 25000 });
    } catch (error) {
      console.log(await popup.evaluate(async () => {
        let native; try { native = await chrome.runtime.sendNativeMessage('com.intruth.codex', { type: 'START_BRIDGE' }); } catch (failure) { native = failure.message; }
        return { warning: document.querySelector('#bridgeWarning').textContent, native };
      }));
      throw error;
    }
    const health = await (await fetch('http://127.0.0.1:8787/health')).json();
    assert.equal(health.auth.state, 'ready');
    assert.equal(health.ready, true);
    assert.equal(native.context.pages().filter(page => page.url().startsWith('https://auth.openai.com/')).length, 1);
    const saved = await popup.evaluate(() => chrome.storage.session.get(null));
    assert.deepEqual(Object.keys(saved), ['intruthLoginAttempt']);
    console.log('Automatic helper smoke passed: Chrome launched the installed native host and bridge without npm start; missing fixture login opened one official-page tab and completion enabled the popup automatically.');
  } finally {
    await native?.close();
    try { await fetch('http://127.0.0.1:8787/v1/helper/stop', { method: 'POST',
      headers: { Origin: 'chrome-extension://' + extensionId(), 'X-InTruth-Client': 'extension-v2' } }); } catch { /* Startup may have failed. */ }
    for (const [file, content] of originals) { if (content) await fs.writeFile(file, content); else await fs.rm(file, { force: true }); }
    delete process.env.INTRUTH_AUTH_FIXTURE_MODE;
    if (previous === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
