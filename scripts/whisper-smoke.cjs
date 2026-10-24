'use strict';
// Real browser ASR, real public speech sample. Does not call Codex or tabCapture.
const assert = require('node:assert/strict');
const { launchNativeExtension } = require('./browser-helpers.cjs');

(async () => {
  let native;
  const started = Date.now();
  try {
    native = await launchNativeExtension({ proxy: true });
    const { context, id } = native;
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    page.on('requestfailed', request => console.error('Whisper network:', new URL(request.url()).hostname, request.failure()?.errorText));
    await page.goto(`chrome-extension://${id}/src/offscreen/offscreen.html`);
    const inference = page.evaluate(async () => {
      // Wait for the production module's runtime configuration (local WASM paths).
      await import(chrome.runtime.getURL('src/offscreen/offscreen-ex.js'));
      const { env, pipeline, read_audio } = await import(chrome.runtime.getURL('src/vendor/transformers.min.js'));
      const transcribe = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        device: 'wasm', dtype: 'q8',
      });
      const sample = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
      const audio = await read_audio(sample, 16000);
      const response = await transcribe(audio, { language: 'en', task: 'transcribe' });
      await transcribe.dispose();
      const translate = await pipeline('translation', 'Xenova/opus-mt-en-it', { device: 'wasm', dtype: 'q8' });
      const translation = await translate('The Earth orbits the Sun.');
      await translate.dispose();
      return { text: response.text, translation: translation[0].translation_text,
        samples: audio.length, wasmThreads: env.backends.onnx.wasm.numThreads };
    });
    let timer;
    const result = await Promise.race([inference, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Whisper/translation smoke exceeded 240 seconds.')), 240000);
    })]).finally(() => clearTimeout(timer));
    assert.match(result.text, /country|fellow|americans/i, 'Whisper did not recognize the reference speech.');
    assert.ok(result.samples > 16000);
    assert.match(result.translation, /terra|sole/i, 'The Italian translation did not preserve the reference statement.');
    console.log(JSON.stringify({ passed: true, nativeExtension: true, browser: context.browser().version(), device: 'wasm', elapsedSeconds: Math.round((Date.now() - started) / 1000), ...result }, null, 2));
  } finally { await native?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
