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
    appendAudio(new Float32Array(MAX_SAMPLES).fill(0.1));
    hasSpeechSinceCommit = true; lastVoiceTime = Date.now() - 3000;`, context);
  return { context, decoder, messages };
}

test('speech arriving during a full-window inference is retained for the next pass', async () => {
  const { context, decoder, messages } = audioContext();
  const inference = vm.runInContext('runInference()', context);
  vm.runInContext('appendAudio(new Float32Array(16000).fill(0.1))', context);
  decoder.resolve({ text: 'The previous utterance.' });
  await inference;
  assert.equal(vm.runInContext('audioSize', context), 16000);
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

test('ring buffer retains newest PCM samples in order without reallocating', () => {
  const { context } = audioContext();
  vm.runInContext('audioSize = 0; audioWrite = 0; audioEndSample = 0;', context);
  const buffer = vm.runInContext('audio', context);
  vm.runInContext('appendAudio(new Float32Array(MAX_SAMPLES - 4).fill(0.2))', context);
  vm.runInContext('appendAudio(new Float32Array([1, 2, 3, 4, 5, 6]))', context);
  assert.strictEqual(vm.runInContext('audio', context), buffer);
  assert.equal(vm.runInContext('audioSize', context), vm.runInContext('MAX_SAMPLES', context));
  assert.deepEqual(Array.from(vm.runInContext('snapshotAudio().slice(-6)', context)), [1, 2, 3, 4, 5, 6]);
  assert.ok(Array.from(vm.runInContext('snapshotAudio().slice(0, 2)', context)).every(value => Math.abs(value - 0.2) < 1e-6));
});

test('final transcript retains original speech separately from displayed translation', async () => {
  const { context, decoder, messages } = audioContext();
  const pending = vm.runInContext('runInference()', context);
  decoder.resolve({ text: 'The previous utterance.' });
  await pending;
  const final = messages.find(message => message.type === 'TRANSCRIPT_RESULT' && message.isFinal);
  assert.equal(final.text, 'The previous utterance.');
  assert.equal(final.originalText, 'The previous utterance.');
});
