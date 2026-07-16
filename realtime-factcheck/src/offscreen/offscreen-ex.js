// offscreen-ex.js
// Captures tab audio via tabCapture and transcribes it entirely on-device with
// Whisper (ONNX) running on the GPU via WebGPU, using Transformers.js. No cloud
// speech-to-text and no API key: the model is downloaded from HuggingFace on
// first run and cached by the browser, so later sessions load it from cache.

import { env, pipeline, WhisperTextStreamer } from '../vendor/transformers.min.js';

// ── Transformers.js / ONNX Runtime setup ─────────────────────────────────────
// MV3 CSP forbids remote scripts, so the ONNX Runtime Web wasm is vendored
// locally under src/vendor/. Pin the exact files — the "asyncify" build ships
// the WebGPU execution provider and also runs the plain CPU-wasm fallback.
env.allowLocalModels = false; // model weights are fetched from HuggingFace
// Point ORT at the vendored wasm (defensive optional-chaining so a not-yet
// populated backend object can't throw at module load). The bundle only falls
// back to its jsdelivr CDN when wasmPaths is unset, so setting it here wins.
env.backends.onnx ??= {};
env.backends.onnx.wasm ??= {};
env.backends.onnx.wasm.wasmPaths = {
  mjs:  chrome.runtime.getURL('src/vendor/ort-wasm-simd-threaded.asyncify.mjs'),
  wasm: chrome.runtime.getURL('src/vendor/ort-wasm-simd-threaded.asyncify.wasm'),
};
// An offscreen document is not cross-origin isolated, so SharedArrayBuffer is
// unavailable and ORT must stay single-threaded (WebGPU does the heavy lifting).
env.backends.onnx.wasm.numThreads = 1;

// Popup exposes tiny/base/small; map to the multilingual ONNX repos.
const MODEL_IDS = {
  tiny:  'onnx-community/whisper-tiny',
  base:  'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
};

// ── Audio / transcription tuning ─────────────────────────────────────────────
const SAMPLE_RATE        = 16000;
const MAX_WINDOW_S       = 30;                  // Whisper's receptive field
const MAX_SAMPLES        = MAX_WINDOW_S * SAMPLE_RATE;
const INFERENCE_EVERY_MS = 1500;                // cadence of interim passes
const SILENCE_COMMIT_MS  = 2500;                // pause length that ends an utterance
const SILENCE_RMS        = 0.006;               // energy threshold for the VAD
const MIN_INFER_SAMPLES  = SAMPLE_RATE * 0.5;   // need ≥0.5s before transcribing

let transcriber   = null;
let currentModel  = null;
let language      = 'en';

let mediaStream   = null;
let audioContext  = null;
let worklet       = null;
let active        = false;

// rolling Float32 buffer of audio not yet committed as a final utterance
let audio           = new Float32Array(0);
let inferenceTimer  = null;
let busy            = false;

// VAD state
let lastVoiceTime        = 0;
let hasSpeechSinceCommit = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.streamId, msg.language || language, msg.whisperModel)
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        // DOMExceptions stringify to a useless "[object DOMException]" — surface
        // .name/.message so the real cause shows up in the error panel.
        const detail = err && err.name ? `${err.name}: ${err.message}` : String(err);
        console.error('[offscreen] startCapture failed:', detail);
        sendResponse({ ok: false, error: detail });
      });
    return true;
  }

  if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
    sendResponse({ ok: true });
  }
});

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadPipeline(modelId, device) {
  return pipeline('automatic-speech-recognition', modelId, {
    device,
    // fp32 encoder + 4-bit decoder is the standard WebGPU config; on the CPU
    // fallback use a uniform 8-bit quantization to keep it tractable.
    dtype: device === 'webgpu'
      ? { encoder_model: 'fp32', decoder_model_merged: 'q4' }
      : 'q8',
    progress_callback: (p) => {
      chrome.runtime.sendMessage({ type: 'MODEL_PROGRESS', device, ...p }).catch(() => {});
    },
  });
}

async function ensureModel(modelId) {
  if (transcriber && currentModel === modelId) return;
  if (transcriber) { try { await transcriber.dispose?.(); } catch {} transcriber = null; }
  currentModel = modelId;

  const wantGpu = ('gpu' in navigator);
  chrome.runtime.sendMessage({
    type: 'MODEL_PROGRESS', status: 'initiate', device: wantGpu ? 'webgpu' : 'wasm',
  }).catch(() => {});

  try {
    transcriber = await loadPipeline(modelId, wantGpu ? 'webgpu' : 'wasm');
  } catch (err) {
    // WebGPU can be present but fail to acquire an adapter; fall back to CPU wasm.
    if (wantGpu) {
      console.warn('[offscreen] WebGPU load failed, falling back to wasm:', err);
      transcriber = await loadPipeline(modelId, 'wasm');
    } else {
      throw err;
    }
  }

  chrome.runtime.sendMessage({ type: 'MODEL_PROGRESS', status: 'ready' }).catch(() => {});
}

// ── Capture ───────────────────────────────────────────────────────────────────

async function startCapture(streamId, lang = 'en', modelSize) {
  if (active) stopCapture();
  active = true;
  language = lang;

  // A tabCapture stream ID is single-use and short-lived; an empty/expired one
  // makes getUserMedia throw an opaque DOMException. Fail fast with a clear reason.
  if (!streamId) {
    active = false;
    throw new Error('No tab stream ID — getMediaStreamId returned empty (tab busy or no active-tab permission?).');
  }

  const modelId = MODEL_IDS[modelSize] || MODEL_IDS.base;
  try {
    await ensureModel(modelId);
  } catch (err) {
    active = false;
    throw new Error(`Whisper model load failed: ${err.name || 'Error'} — ${err.message || err}`);
  }
  if (!active) return; // stopped while the model was still loading

  // get tab audio stream
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
  } catch (err) {
    active = false;
    throw new Error(`getUserMedia(tab) failed: ${err.name || 'Error'} — ${err.message || err}`);
  }

  await startAudioPipeline();
  startInferenceLoop();
}

async function startAudioPipeline() {
  audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = audioContext.createMediaStreamSource(mediaStream);

  // reconnect to destination so the user still hears the video
  source.connect(audioContext.destination);

  // AudioWorklet delivers Float32 mono @16kHz batches on the audio thread.
  await audioContext.audioWorklet.addModule('pcm-worklet.js');
  worklet = new AudioWorkletNode(audioContext, 'pcm-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  });

  worklet.port.onmessage = (e) => {
    if (!active) return;
    appendAudio(new Float32Array(e.data)); // e.data is a transferred ArrayBuffer
  };

  source.connect(worklet);
  // keep the node pulled by the render graph; its output stays silent
  worklet.connect(audioContext.destination);
  console.log('[offscreen] audio pipeline started (AudioWorklet → Whisper)');
}

function appendAudio(chunk) {
  // energy-based VAD: track when we last heard speech
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  const rms = Math.sqrt(sum / chunk.length);
  if (rms > SILENCE_RMS) {
    lastVoiceTime = Date.now();
    hasSpeechSinceCommit = true;
  }

  // append to the rolling buffer, capping at MAX_SAMPLES (drop oldest)
  const merged = new Float32Array(audio.length + chunk.length);
  merged.set(audio, 0);
  merged.set(chunk, audio.length);
  audio = merged.length > MAX_SAMPLES ? merged.slice(merged.length - MAX_SAMPLES) : merged;
}

// ── Inference loop (sliding window + VAD commit) ──────────────────────────────

function startInferenceLoop() {
  lastVoiceTime = Date.now();
  hasSpeechSinceCommit = false;
  inferenceTimer = setInterval(() => { runInference().catch(() => {}); }, INFERENCE_EVERY_MS);
}

async function runInference() {
  if (!active || busy) return;
  if (audio.length < MIN_INFER_SAMPLES) return;
  if (!hasSpeechSinceCommit) return; // only silence since last commit — nothing to do

  const silenceMs = Date.now() - lastVoiceTime;
  const bufferFull = audio.length >= MAX_SAMPLES * 0.95;
  // Commit a final when the speaker pauses long enough, or the 30s window is
  // about to overflow (long monologue with no pause).
  const shouldCommit = hasSpeechSinceCommit && (silenceMs >= SILENCE_COMMIT_MS || bufferFull);

  busy = true;
  const snapshot = audio; // transcribe the current window
  try {
    let streamed = '';
    const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
      skip_prompt: true,
      callback_function: (token) => {
        streamed += token;
        // stream partial text as interim while decoding (skip during a commit —
        // the final text is emitted once below)
        if (!shouldCommit) {
          chrome.runtime.sendMessage({
            type: 'TRANSCRIPT_RESULT', text: streamed.trim(),
            isFinal: false, interim: true, speaker: null,
          }).catch(() => {});
        }
      },
    });

    const out = await transcriber(snapshot, {
      language,
      task: 'transcribe',
      streamer,
    });
    const text = (out?.text ?? streamed).trim();

    if (shouldCommit) {
      if (text) {
        // Whisper does not diarize; speaker is null and Claude attributes it
        // from the surrounding context (speaker names / page title).
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPT_RESULT', text, isFinal: true, interim: false, speaker: null,
        }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'UTTERANCE_END' }).catch(() => {});
      }
      // drop the committed window but keep any audio that streamed in during
      // inference (snapshot is a prefix of the current buffer); reset the VAD.
      audio = audio.length > snapshot.length ? audio.slice(snapshot.length) : new Float32Array(0);
      hasSpeechSinceCommit = false;
      lastVoiceTime = Date.now();
    } else if (text) {
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPT_RESULT', text, isFinal: false, interim: true, speaker: null,
      }).catch(() => {});
    }
  } catch (err) {
    const detail = err && err.name ? `${err.name}: ${err.message}` : String(err);
    console.error('[offscreen] inference error:', detail);
    chrome.runtime.sendMessage({ type: 'PIPELINE_ERROR', message: 'Transcription error: ' + detail }).catch(() => {});
  } finally {
    busy = false;
  }
}

function stopCapture() {
  active = false;
  if (inferenceTimer) { clearInterval(inferenceTimer); inferenceTimer = null; }
  audio = new Float32Array(0);
  busy = false;
  hasSpeechSinceCommit = false;

  if (worklet) {
    worklet.disconnect();
    worklet = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  // keep `transcriber` loaded so a restart reuses the warm model
  console.log('[offscreen] stopped');
}
