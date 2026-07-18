// popup.js

const toggleBtn   = document.getElementById('toggleBtn');
const statusEl    = document.getElementById('status');
const anthropicEl = document.getElementById('anthropicKey');
const whisperEl   = document.getElementById('whisperModel');
const keyHint     = document.getElementById('keyHint');
const keysSection = document.getElementById('keysSection');
const languageEl  = document.getElementById('languageSelect');
const langFlagEl  = document.getElementById('langFlag');
const modelEl     = document.getElementById('modelSelect');
const useBridgeEl = document.getElementById('useBridge');
const apiKeyField = document.getElementById('apiKeyField');
const cacheListEl  = document.getElementById('cacheList');
const cacheTotalEl = document.getElementById('cacheTotal');
const cacheClearEl = document.getElementById('cacheClearBtn');
const bridgeWarningEl = document.getElementById('bridgeWarning');

// ── I18N — popup UI labels follow the browser language (it/en) ───────────────
// Content language (transcript/verdicts) is handled elsewhere; this is UI only.
const POPUP_LANG = (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
const P_I18N = {
  en: {
    statusInactive: 'Inactive',
    statusLive: 'Live • Fact-checking active',
    btnStart: 'Start Fact-Checking',
    btnStop: 'Stop Fact-Checking',
    hintBridge: 'Using local subscription bridge.',
    bridgeWarnText: '⚠ Bridge not running — start it (see README).',
    hintEnterKey: 'Enter your Anthropic API key to start.',
    hintKeySaved: 'Key saved.',
    hintNeedKey: 'Please enter your Anthropic API key.',
    failedStart: 'Failed to start: ',
    unknownError: 'unknown error',
    cacheChecking: 'Checking cache…',
    cacheNone: 'No models downloaded yet.',
    cacheUnavailable: 'Cache unavailable.',
    cacheTotal: 'Total: ',
    cacheClear: 'Clear cache',
    labelModel: 'Model',
    optHaiku: 'Haiku — fastest, cheapest',
    optSonnet: 'Sonnet — balanced',
    optOpus: 'Opus — most capable',
    useBridge: 'Use local subscription (warm bridge)',
    bridgeHint: 'Runs Claude via your subscription — start <code>warm-bridge.js</code> first.',
    labelWhisper: 'Transcription (local, WebGPU)',
    optTiny: 'Tiny — fastest, least accurate',
    optBase: 'Base — balanced (recommended)',
    optSmall: 'Small — most accurate, heavier',
    whisperHint: 'Runs Whisper in your browser via WebGPU — no key, no cloud. First run downloads the model (cached afterwards).',
    labelCache: 'Downloaded models',
    labelApiKey: 'Anthropic API Key',
    labelLanguage: 'Language',
  },
  it: {
    statusInactive: 'Inattivo',
    statusLive: 'Live • Fact-checking attivo',
    btnStart: 'Avvia il Fact-Checking',
    btnStop: 'Ferma il Fact-Checking',
    hintBridge: 'Bridge locale (abbonamento) in uso.',
    bridgeWarnText: '⚠ Bridge non avviato — avvialo (vedi README).',
    hintEnterKey: 'Inserisci la tua API key Anthropic per iniziare.',
    hintKeySaved: 'Chiave salvata.',
    hintNeedKey: 'Inserisci la tua API key Anthropic.',
    failedStart: 'Avvio non riuscito: ',
    unknownError: 'errore sconosciuto',
    cacheChecking: 'Controllo della cache…',
    cacheNone: 'Nessun modello scaricato.',
    cacheUnavailable: 'Cache non disponibile.',
    cacheTotal: 'Totale: ',
    cacheClear: 'Svuota cache',
    labelModel: 'Modello',
    optHaiku: 'Haiku — il più veloce ed economico',
    optSonnet: 'Sonnet — bilanciato',
    optOpus: 'Opus — il più capace',
    useBridge: 'Usa abbonamento locale (warm bridge)',
    bridgeHint: 'Esegue Claude con il tuo abbonamento — avvia prima <code>warm-bridge.js</code>.',
    labelWhisper: 'Trascrizione (locale, WebGPU)',
    optTiny: 'Tiny — il più veloce, meno accurato',
    optBase: 'Base — bilanciato (consigliato)',
    optSmall: 'Small — il più accurato, più pesante',
    whisperHint: 'Esegue Whisper nel browser via WebGPU — niente chiavi, niente cloud. Al primo avvio scarica il modello (poi resta in cache).',
    labelCache: 'Modelli scaricati',
    labelApiKey: 'API Key Anthropic',
    labelLanguage: 'Lingua',
  },
};
function pt(key) { return (P_I18N[POPUP_LANG] || P_I18N.en)[key] ?? P_I18N.en[key] ?? key; }
// Translate every static element marked with data-i18n in popup.html
for (const el of document.querySelectorAll('[data-i18n]')) {
  const k = el.dataset.i18n;
  if (k === 'bridgeHint') el.innerHTML = pt(k); // static string containing <code>
  else el.textContent = pt(k);
}

const LANG_FLAGS = {
  auto: '🌐',
  en: '🇺🇸', es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', it: '🇮🇹',
  pt: '🇧🇷', nl: '🇳🇱', hi: '🇮🇳', ja: '🇯🇵', zh: '🇨🇳',
  ar: '🇸🇦', ko: '🇰🇷', ru: '🇷🇺', pl: '🇵🇱', sv: '🇸🇪', tr: '🇹🇷',
};

function updateFlag() {
  langFlagEl.textContent = LANG_FLAGS[languageEl.value] || '🌐';
}

let isActive = false;

// ── Load saved key and language ───────────────────────────────────────────────

chrome.storage.local.get(['anthropicKey', 'whisperModel', 'transcriptLanguage', 'selectedModel', 'useBridge'], (data) => {
  if (data.anthropicKey) { anthropicEl.value = data.anthropicKey; anthropicEl.classList.add('saved'); }
  whisperEl.value = data.whisperModel || 'base';
  languageEl.value = data.transcriptLanguage || 'auto';
  if (data.selectedModel) modelEl.value = data.selectedModel;
  useBridgeEl.checked = !!data.useBridge;
  updateFlag();
  updateBridgeUI();
  updateHint();
});

// ── Save key on change ────────────────────────────────────────────────────────

anthropicEl.addEventListener('input', () => {
  anthropicEl.classList.remove('saved');
  updateHint();
});
anthropicEl.addEventListener('change', () => {
  chrome.storage.local.set({ anthropicKey: anthropicEl.value.trim() });
  anthropicEl.classList.add('saved');
  updateHint();
});

whisperEl.addEventListener('change', () => {
  chrome.storage.local.set({ whisperModel: whisperEl.value });
});

// ── Save language on change ───────────────────────────────────────────────────

languageEl.addEventListener('change', () => {
  chrome.storage.local.set({ transcriptLanguage: languageEl.value });
  updateFlag();
});

// ── Save model + bridge on change ─────────────────────────────────────────────

modelEl.addEventListener('change', () => {
  chrome.storage.local.set({ selectedModel: modelEl.value });
});

useBridgeEl.addEventListener('change', () => {
  chrome.storage.local.set({ useBridge: useBridgeEl.checked });
  updateBridgeUI();
  updateHint();
});

// ── Bridge reachability check (blinking warning if bridge mode is on but the
// local warm-bridge.js process isn't running) ────────────────────────────────
const BRIDGE_HEALTH_URL = 'http://127.0.0.1:8787/health';
let bridgePollTimer = null;

async function isBridgeReachable() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(BRIDGE_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshBridgeWarning() {
  if (!useBridgeEl.checked) { bridgeWarningEl.hidden = true; return; }
  bridgeWarningEl.hidden = await isBridgeReachable();
}

function updateBridgeUI() {
  // In bridge mode the extension talks to the local warm bridge using your
  // subscription, so the API key field is not required.
  apiKeyField.style.display = useBridgeEl.checked ? 'none' : 'flex';

  if (useBridgeEl.checked) {
    refreshBridgeWarning();
    if (!bridgePollTimer) bridgePollTimer = setInterval(refreshBridgeWarning, 4000);
  } else {
    bridgeWarningEl.hidden = true;
    if (bridgePollTimer) { clearInterval(bridgePollTimer); bridgePollTimer = null; }
  }
}

function updateHint() {
  // Transcription runs on-device (Whisper via WebGPU) and needs no key. Only the
  // Claude credentials gate starting, unless the local subscription bridge is on.
  if (useBridgeEl.checked) {
    keyHint.textContent = pt('hintBridge');
    keyHint.className = 'key-hint ok';
    toggleBtn.disabled = false;
    return;
  }
  if (!anthropicEl.value.trim()) {
    keyHint.textContent = pt('hintEnterKey');
    keyHint.className = 'key-hint';
    toggleBtn.disabled = isActive ? false : true;
  } else {
    keyHint.textContent = pt('hintKeySaved');
    keyHint.className = 'key-hint ok';
    toggleBtn.disabled = false;
  }
}

// ── Downloaded Whisper models (Transformers.js browser cache) ────────────────
// Transformers.js stores model files in the Cache Storage of the extension
// origin under the name "transformers-cache". The popup shares that origin, so
// it can list the entries, sum their sizes and wipe the cache directly.

const TRANSFORMERS_CACHE = 'transformers-cache';

function formatBytes(n) {
  if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  if (n >= 1024 * 1024)        return (n / (1024 * 1024)).toFixed(1) + ' MB';
  if (n >= 1024)               return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

// "https://huggingface.co/onnx-community/whisper-base/resolve/main/…" → "whisper-base"
function modelNameFromUrl(url) {
  const m = url.match(/huggingface\.co\/([^/]+)\/([^/]+)\//);
  if (m) return m[2];
  return 'other';
}

async function entrySize(cache, request) {
  const res = await cache.match(request);
  if (!res) return 0;
  const len = res.headers.get('Content-Length');
  if (len && +len > 0) return +len;
  try { return (await res.blob()).size; } catch { return 0; }
}

async function refreshCacheInfo() {
  try {
    const hasCache = await caches.has(TRANSFORMERS_CACHE);
    if (!hasCache) {
      cacheListEl.innerHTML = '<div class="cache-empty">' + pt('cacheNone') + '</div>';
      cacheTotalEl.textContent = '';
      cacheClearEl.hidden = true;
      return;
    }

    const cache    = await caches.open(TRANSFORMERS_CACHE);
    const requests = await cache.keys();
    if (requests.length === 0) {
      cacheListEl.innerHTML = '<div class="cache-empty">' + pt('cacheNone') + '</div>';
      cacheTotalEl.textContent = '';
      cacheClearEl.hidden = true;
      return;
    }

    const byModel = new Map(); // name → { bytes, files }
    let total = 0;
    for (const req of requests) {
      const size = await entrySize(cache, req);
      const name = modelNameFromUrl(req.url);
      const cur  = byModel.get(name) || { bytes: 0, files: 0 };
      cur.bytes += size;
      cur.files += 1;
      byModel.set(name, cur);
      total += size;
    }

    cacheListEl.innerHTML = '';
    [...byModel.entries()]
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .forEach(([name, info]) => {
        const row = document.createElement('div');
        row.className = 'cache-row';
        const label = document.createElement('span');
        label.className = 'cache-name';
        label.textContent = name;
        const size = document.createElement('span');
        size.className = 'cache-size';
        size.textContent = formatBytes(info.bytes);
        row.append(label, size);
        cacheListEl.appendChild(row);
      });

    cacheTotalEl.textContent = pt('cacheTotal') + formatBytes(total);
    cacheClearEl.hidden = false;
  } catch (err) {
    cacheListEl.innerHTML = '<div class="cache-empty">' + pt('cacheUnavailable') + '</div>';
    cacheTotalEl.textContent = '';
    cacheClearEl.hidden = true;
    console.error('[popup] cache info failed:', err);
  }
}

cacheClearEl.addEventListener('click', async () => {
  cacheClearEl.disabled = true;
  try {
    await caches.delete(TRANSFORMERS_CACHE);
  } finally {
    cacheClearEl.disabled = false;
    refreshCacheInfo();
  }
});

refreshCacheInfo();

// ── Status ────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
  if (res?.isCapturing) setActive(true);
});

function setActive(active) {
  isActive = active;
  toggleBtn.textContent  = active ? pt('btnStop') : pt('btnStart');
  toggleBtn.className    = 'toggle-btn' + (active ? ' active' : '');
  statusEl.textContent   = active ? pt('statusLive') : pt('statusInactive');
  statusEl.className     = 'status' + (active ? ' active' : '');
  // hide key fields while active
  keysSection.style.display = active ? 'none' : 'flex';
  if (!active) updateHint();
}

// ── Toggle ────────────────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', async () => {
  if (isActive) {
    chrome.runtime.sendMessage({ type: 'STOP_FACTCHECK' });
    setActive(false);
    return;
  }

  const anthropicKey = anthropicEl.value.trim();
  const useBridge    = useBridgeEl.checked;

  if (!useBridge && !anthropicKey) {
    keyHint.textContent = pt('hintNeedKey');
    keyHint.className   = 'key-hint error';
    return;
  }

  // save key, Whisper model, language, Claude model and bridge preference then start
  await new Promise(r => chrome.storage.local.set({
    anthropicKey,
    whisperModel: whisperEl.value,
    transcriptLanguage: languageEl.value,
    selectedModel: modelEl.value,
    useBridge,
  }, r));

  chrome.runtime.sendMessage({ type: 'START_FACTCHECK' }, (res) => {
    if (res?.ok) {
      setActive(true);
    } else {
      keyHint.textContent = pt('failedStart') + (res?.error || pt('unknownError'));
      keyHint.className   = 'key-hint error';
    }
  });
});