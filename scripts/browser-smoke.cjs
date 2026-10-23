'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { root, createServer, launchBrowser, mockRuntime } = require('./browser-helpers.cjs');

(async () => {
  const server = await createServer();
  let browser;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intruth-ui-'));
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(mockRuntime);
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const popup = await context.newPage();
    await popup.goto(server.base + '/realtime-factcheck/src/popup/popup.html');
    await popup.waitForFunction(() => !document.querySelector('#toggleBtn').disabled);
    assert.equal(await popup.locator('#modelSelect').inputValue(), 'gpt-6-luna');
    assert.equal(await popup.locator('input[type=password]').count(), 0);
    server.state.ready = false;
    await popup.evaluate(() => refreshBridgeWarning());
    assert.equal(await popup.locator('#toggleBtn').isDisabled(), true);
    server.state.ready = true;
    await popup.evaluate(() => refreshBridgeWarning());
    assert.equal(await popup.locator('#toggleBtn').isEnabled(), true);
    await context.route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html',
      body: '<html><head><title>Alpha vs Beta</title></head><body><video></video></body></html>' }));
    const page = await context.newPage();
    await page.goto('https://www.youtube.com/watch?v=intruth-test');
    await page.addStyleTag({ path: path.join(root, 'realtime-factcheck/src/content/overlay.css') });
    for (const script of ['shared/protocol.js', 'content/lexical-features.js', 'content/session-export.js', 'content/overlay.js']) {
      await page.addScriptTag({ path: path.join(root, 'realtime-factcheck/src', script) });
    }
    const send = message => page.evaluate(value => globalThis.__dispatchInTruth(value), message);
    await send({ type: 'START_FACTCHECK' });
    await page.locator('#rtfc-panel').waitFor();
    const common = { confidence: 'HIGH', explanation: 'Preliminary <script>alert(1)</script>', sources: [], speaker: 'Alpha',
      speaker_confidence: 'MEDIUM', speaker_confidence_explanation: 'Direct assertion.', model: 'gpt-6-luna' };
    await send({ type: 'NEW_VERDICT', results: [{ ...common, claim: 'Claim A', verdict: 'TRUE', pending: true },
      { ...common, claim: 'Claim B', verdict: 'FALSE', pending: true }] });
    await send({ type: 'UPDATE_VERDICTS', results: [{ ...common, claim: 'Claim B revised', _fastClaim: 'Claim B',
      verdict: 'TRUE', pending: false, sources: ['https://example.org/source'] }] });
    assert.equal(await page.locator('.rtfc-verdict--pending').count(), 1);
    assert.equal(await page.locator('.rtfc-verdict').count(), 2);
    assert.equal(await page.locator('#rtfc-panel script').count(), 0);
    await send({ type: 'UPDATE_VERDICTS', results: [{ ...common, claim: 'Claim A', _fastClaim: 'Claim A',
      verdict: 'UNVERIFIABLE', pending: false, verificationFailed: true }] });
    assert.equal(await page.locator('.rtfc-verdict--pending').count(), 0);
    const downloading = page.waitForEvent('download');
    await page.locator('#rtfc-export').click();
    const download = await downloading;
    const report = path.join(directory, 'report.html');
    await download.saveAs(report);
    const text = await fs.readFile(report, 'utf8');
    assert.match(text, /gpt-6-luna/); assert.match(text, /https:\/\/example.org\/source/); assert.doesNotMatch(text, /<script>/);
    await send({ type: 'STOP_FACTCHECK' });
    assert.equal(await page.locator('#rtfc-panel').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Browser UI smoke passed: Chrome ${browser.version()}, Playwright ${require('playwright/package.json').version}; extension APIs and bridge simulated.`);
  } finally {
    await browser?.close(); await server.close(); await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
