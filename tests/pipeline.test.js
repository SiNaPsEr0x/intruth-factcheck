'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const protocol = require('../realtime-factcheck/src/shared/protocol.js');
const claim = { claim: 'Example factual claim.', verdict: 'TRUE', confidence: 'HIGH', explanation: 'Preliminary evidence.',
  sources: [], speaker: 'Unknown', speaker_confidence: 'MEDIUM', speaker_confidence_explanation: 'Plain assertion.' };
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function worker(fetch) {
  const messages = [], stored = { retiredSetting: 'unused-value', rtfcPanelWidth: 420 };
  const event = () => ({ addListener() {} });
  const chrome = {
    storage: { local: {
      get: async () => ({ ...stored }),
      set: async values => Object.assign(stored, values),
      remove: async keys => { for (const key of keys) delete stored[key]; },
    } },
    runtime: { onConnect: event(), onStartup: event(), onMessage: event(),
      sendMessage: async () => ({ ok: true }), getPlatformInfo() {} },
    tabs: { sendMessage: async (tab, message) => { messages.push({ tab, ...message }); }, onRemoved: event(), onUpdated: event() },
    offscreen: { getContexts: async () => [] },
  };
  chrome.runtime.getContexts = async () => [];
  const context = vm.createContext({ InTruthProtocol: protocol, chrome, importScripts() {}, fetch,
    navigator: { language: 'it' }, URL, AbortController, AbortSignal, structuredClone,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, console: { log() {}, error() {}, warn() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../realtime-factcheck/src/background/service-worker-ex.js'), 'utf8'), context);
  vm.runInContext('activeTabId = 1; isCapturing = true;', context);
  return { context, messages, stored };
}

async function runEvaluation(context) {
  await vm.runInContext('evaluateClaims("Transcript evidence.", "Debate", "", {}, null, null, sessionId)', context);
  for (let i = 0; i < 15; i++) await nextTurn();
}

test('web evidence can correct a TRUE preliminary verdict to FALSE', async () => {
  const { context, messages } = worker(async (_url, options) => {
    const request = JSON.parse(options.body);
    return Response.json({ claims: [request.webSearch ? { ...claim, verdict: 'FALSE', sources: ['https://example.org/evidence'] } : claim], searched: request.webSearch });
  });
  await runEvaluation(context);
  assert.equal(messages.find(message => message.type === 'NEW_VERDICT').results[0].pending, true);
  const final = messages.find(message => message.type === 'UPDATE_VERDICTS').results[0];
  assert.equal(final.verdict, 'FALSE');
  assert.equal(final.pending, false);
  assert.equal(final._fastClaim, claim.claim);
});

test('web failure produces UNVERIFIABLE instead of silently confirming the preliminary answer', async () => {
  const { context, messages } = worker(async (_url, options) => {
    if (JSON.parse(options.body).webSearch) return Response.json({ error: { message: 'Model unavailable.' } }, { status: 502 });
    return Response.json({ claims: [claim], searched: false });
  });
  await runEvaluation(context);
  const final = messages.find(message => message.type === 'UPDATE_VERDICTS').results[0];
  assert.equal(final.verdict, 'UNVERIFIABLE');
  assert.equal(final.confidence, 'LOW');
  assert.equal(final.verificationFailed, true);
  assert.ok(messages.some(message => message.type === 'PIPELINE_ERROR'));
});

test('no usable source means the answer remains unverified', async () => {
  const { context, messages } = worker(async (_url, options) => Response.json({ claims: [claim], searched: JSON.parse(options.body).webSearch }));
  await runEvaluation(context);
  assert.equal(messages.find(message => message.type === 'UPDATE_VERDICTS').results[0].verdict, 'UNVERIFIABLE');
});

test('late results from a stopped session cannot reach a new tab', async () => {
  const webStarted = Promise.withResolvers(), reply = Promise.withResolvers();
  const { context, messages } = worker(async (_url, options) => {
    if (JSON.parse(options.body).webSearch) { webStarted.resolve(); return reply.promise; }
    return Response.json({ claims: [claim], searched: false });
  });
  await vm.runInContext('evaluateClaims("Evidence", "Video", "", {}, null, null, sessionId)', context);
  await webStarted.promise;
  await vm.runInContext('stopFactCheck()', context);
  vm.runInContext('activeTabId = 2; isCapturing = true;', context);
  reply.resolve(Response.json({ claims: [{ ...claim, sources: ['https://example.org/'] }], searched: true }));
  for (let i = 0; i < 10; i++) await nextTurn();
  assert.equal(messages.filter(message => message.type === 'UPDATE_VERDICTS').length, 0);
});

test('settings retain supported preferences and discard unused fields', async () => {
  const { context, stored } = worker();
  stored.whisperModel = 'small';
  await vm.runInContext('loadSettings()', context);
  assert.equal(stored.selectedModel, 'gpt-6-luna');
  assert.equal(stored.retiredSetting, undefined);
  assert.equal(stored.rtfcPanelWidth, 420);
  assert.equal(vm.runInContext('WHISPER_MODEL', context), 'small');
});

test('different numerical claims and non-Latin claims are not discarded as duplicates', () => {
  const { context } = worker();
  assert.equal(vm.runInContext('isDuplicate("Inflation is currently 2%.")', context), false);
  assert.equal(vm.runInContext('isDuplicate("Inflation is currently 3%.")', context), false);
  assert.equal(vm.runInContext('isDuplicate("Inflation is currently 2%.")', context), true);
  assert.equal(vm.runInContext('isDuplicate("東京の人口は1400万人です")', context), false);
  assert.equal(vm.runInContext('isDuplicate("大阪の人口は275万人です")', context), false);
});

test('session export replaces a timed-out entry with its late verified answer', () => {
  const context = vm.createContext({ InTruthProtocol: protocol });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../realtime-factcheck/src/content/session-export.js'), 'utf8'), context);
  context.first = { ...claim, verdict: 'UNVERIFIABLE', verificationFailed: true };
  context.final = { ...claim, claim: 'Reworded verified claim.', _fastClaim: claim.claim, sources: ['javascript:alert(1)', 'https://example.org/'] };
  vm.runInContext('startSession(); logVerdict(first); logVerdict(final);', context);
  assert.equal(vm.runInContext('sessionLog.length', context), 1);
  assert.equal(vm.runInContext('sessionLog[0].verdict', context), 'TRUE');
  assert.equal(vm.runInContext('sessionLog[0].sources.length', context), 1);
});
