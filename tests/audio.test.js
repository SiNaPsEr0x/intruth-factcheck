'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function audioContext() {
  const messages = [];
  const decoder = Promise.withResolvers();
  const transcriber = () => decoder.promise;
  transcriber.tokenizer = {};
  const context = vm.createContext({
    env: { backends: {} }, navigator: { language: 'en', userAgent: 'test' },
    pipeline() {}, WhisperTextStreamer: class {},
    chrome: { runtime: { getURL: value => value, onMessage: { addListener() {} },
      sendMessage: async message => { messages.push(message); } } },
    setInterval: () => 0, clearInterval() {}, console: { log() {}, warn() {}, error() {} },
    mockTranscriber: transcriber,
  });
  const source = fs.readFileSync(path.join(__dirname, '../realtime-factcheck/src/offscreen/offscreen-ex.js'), 'utf8');
  vm.runInContext(source.replace(/^import .*;\r?\n/m, ''), context);
  vm.runInContext(`active = true; language = 'en'; transcriber = mockTranscriber;
    audio = new Float32Array(MAX_SAMPLES); audioEndSample = MAX_SAMPLES;
    hasSpeechSinceCommit = true; lastVoiceTime = Date.now() - 3000;`, context);
  return { context, decoder, messages };
}

test('speech arriving during a full-window inference is retained for the next pass', async () => {
  const { context, decoder, messages } = audioContext();
  const inference = vm.runInContext('runInference()', context);
  vm.runInContext('appendAudio(new Float32Array(16000).fill(0.1))', context);
  decoder.resolve({ text: 'The previous utterance.' });
  await inference;
  assert.equal(vm.runInContext('audio.length', context), 16000);
  assert.equal(vm.runInContext('hasSpeechSinceCommit', context), true);
  assert.ok(messages.some(message => message.type === 'TRANSCRIPT_RESULT' && message.isFinal));
});

test('stopping audio capture suppresses a late decoder result', async () => {
  const { context, decoder, messages } = audioContext();
  const inference = vm.runInContext('runInference()', context);
  vm.runInContext('stopCapture()', context);
  decoder.resolve({ text: 'A result from the old capture.' });
  await inference;
  assert.equal(messages.filter(message => message.type === 'TRANSCRIPT_RESULT').length, 0);
});
