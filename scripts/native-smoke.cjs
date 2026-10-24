'use strict';
// Real MV3, CORS, storage, messaging, worker pipeline and CLI subprocess fixture.
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { createBridge, createRunner } = require('../bridge/codex-bridge.js');
const { root, launchNativeExtension } = require('./browser-helpers.cjs');

(async () => {
  const bridge = createBridge({ runner: createRunner({ command: { bin: process.execPath, prefix: [path.join(root, 'tests/fixtures/codex.cjs')] } }),
    readiness: { ready: true, cliVersion: '0.164.0' } });
  bridge.listen(8787, '127.0.0.1'); await once(bridge, 'listening');
  let native;
  try {
    native = await launchNativeExtension();
    const { context, id } = native;
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
    await popup.waitForFunction(() => !document.querySelector('#toggleBtn').disabled);
    assert.equal(await popup.locator('#modelSelect').inputValue(), 'gpt-6-luna');
    await popup.locator('#recordingDate').fill('2020-01-01');
    await popup.locator('#recordingDate').dispatchEvent('change');
    const saved = await popup.evaluate(() => chrome.storage.local.get('recordingDate'));
    assert.equal(saved.recordingDate, '2020-01-01');
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html',
      body: '<html><head><title>Alpha vs Beta</title></head><body><video></video></body></html>' }));
    const page = await context.newPage(); await page.goto('https://www.youtube.com/watch?v=intruth-native');
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    // Reading URL filters requires a user-granted activeTab; IDs of the active
    // test tab remain available without adding a broad tabs permission.
    await page.bringToFront();
    const tab = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    await worker.evaluate(async tabId => {
      activeTabId = tabId; isCapturing = true;
      await chrome.tabs.sendMessage(tabId, { type: 'START_FACTCHECK' });
      onNewSentence('The Earth orbits the Sun.', null);
      onNewSentence('This is a factual statement.', null);
    }, tab);
    await page.locator('.rtfc-verdict:not(.rtfc-verdict--pending)').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.rtfc-verdict').count(), 1);
    assert.equal(await page.locator('.rtfc-sources a').count(), 1);
    await worker.evaluate(() => stopFactCheck());
    await page.locator('#rtfc-panel').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log(`Native MV3 smoke passed: Chrome ${context.browser().version()}; actual extension registration, storage, local bridge, content scripts, worker pipeline and stop; Codex CLI simulated.`);
  } finally {
    await native?.close(); bridge.cancelAll(); bridge.closeAllConnections(); await new Promise(resolve => bridge.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
