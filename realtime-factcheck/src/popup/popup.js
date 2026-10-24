const { DEFAULT_MODEL, BRIDGE_URL, readSettings, modelId } = InTruthProtocol;
// popup.js

const toggleBtn   = document.getElementById('toggleBtn');
const statusEl    = document.getElementById('status');
const whisperEl   = document.getElementById('whisperModel');
const keyHint     = document.getElementById('keyHint');
const keysSection = document.getElementById('keysSection');
const languageEl  = document.getElementById('languageSelect');
const langFlagEl  = document.getElementById('langFlag');
const modelEl     = document.getElementById('modelSelect');
const recordingDateEl = document.getElementById('recordingDate');
const cacheListEl  = document.getElementById('cacheList');
const cacheTotalEl = document.getElementById('cacheTotal');
const cacheClearEl = document.getElementById('cacheClearBtn');
const bridgeWarningEl = document.getElementById('bridgeWarning');
const authBtn = document.getElementById('authBtn');

// ── I18N — popup UI labels follow the browser language (it/en) ───────────────
// Content language (transcript/verdicts) is handled elsewhere; this is UI only.
const POPUP_LANG = (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
const P_I18N = {
  en: {
    statusInactive: 'Inactive',
    statusLive: 'Live • Fact-checking active',
    btnStart: 'Start Fact-Checking',
    btnStop: 'Stop Fact-Checking',
    hintBridge: 'Codex connected. Ready to start.',
    bridgeWarnText: 'Install the InTruth local helper once, then reopen this popup. See README → Automatic setup.',
    authPending: 'Complete sign-in in the ChatGPT tab. Connection updates automatically.',
    authRequired: 'Opening secure ChatGPT sign-in…',
    authRetry: 'Sign in with ChatGPT',
    authReopen: 'Reopen sign-in',
    authFailed: 'Unable to sign in. Retry with the button below.',
    failedStart: 'Failed to start: ',
    unknownError: 'unknown error',
    cacheChecking: 'Checking cache…',
    cacheNone: 'No models downloaded yet.',
    cacheUnavailable: 'Cache unavailable.',
    cacheTotal: 'Total: ',
    cacheClear: 'Clear cache',
    labelModel: 'Codex model',
    bridgeHint: 'Connects automatically. Sign in on the official ChatGPT page when prompted.',
    labelWhisper: 'Transcription (local, WebGPU)',
    optTiny: 'Tiny — fastest, least accurate',
    optBase: 'Base — balanced (recommended)',
    optSmall: 'Small — most accurate, heavier',
    whisperHint: 'Runs Whisper in your browser via WebGPU — no key, no cloud. First run downloads the model (cached afterwards).',
    labelCache: 'Downloaded models',
    labelLanguage: 'Language',
    labelDate: 'Recording date (optional)',
  },
  it: {
    statusInactive: 'Inattivo',
    statusLive: 'Live • Fact-checking attivo',
    btnStart: 'Avvia il Fact-Checking',
    btnStop: 'Ferma il Fact-Checking',
    hintBridge: 'Codex collegato. Pronto per iniziare.',
    bridgeWarnText: 'Installa una sola volta l’assistente locale InTruth, poi riapri questo popup. Vedi README → Installazione automatica.',
    authPending: 'Completa l’accesso nella scheda ChatGPT. Il collegamento si aggiorna automaticamente.',
    authRequired: 'Apertura dell’accesso sicuro ChatGPT…',
    authRetry: 'Accedi a ChatGPT',
    authReopen: 'Riapri accesso',
    authFailed: 'Accesso non riuscito. Riprova con il pulsante qui sotto.',
    failedStart: 'Avvio non riuscito: ',
    unknownError: 'errore sconosciuto',
    cacheChecking: 'Controllo della cache…',
    cacheNone: 'Nessun modello scaricato.',
    cacheUnavailable: 'Cache non disponibile.',
    cacheTotal: 'Totale: ',
    cacheClear: 'Svuota cache',
    labelModel: 'Modello Codex',
    bridgeHint: 'Si collega automaticamente. Quando richiesto, accedi sulla pagina ufficiale ChatGPT.',
    labelWhisper: 'Trascrizione (locale, WebGPU)',
    optTiny: 'Tiny — il più veloce, meno accurato',
    optBase: 'Base — bilanciato (consigliato)',
    optSmall: 'Small — il più accurato, più pesante',
    whisperHint: 'Esegue Whisper nel browser via WebGPU — niente chiavi, niente cloud. Al primo avvio scarica il modello (poi resta in cache).',
    labelCache: 'Modelli scaricati',
    labelLanguage: 'Lingua',
    labelDate: 'Data di registrazione (facoltativa)',
  },
};
function pt(key) { return (P_I18N[POPUP_LANG] || P_I18N.en)[key] ?? P_I18N.en[key] ?? key; }
// Translate every static element marked with data-i18n in popup.html
for (const el of document.querySelectorAll('[data-i18n]')) {
  const k = el.dataset.i18n;
  el.textContent = pt(k);
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

let bridgeReady = false;
let settingsReady = false;
let starting = false;

async function initializeSettings() {
  const data = await readSettings(chrome.storage.local);
  whisperEl.value = data.whisperModel || 'base';
  languageEl.value = data.transcriptLanguage || 'auto';
  recordingDateEl.value = data.recordingDate || '';
  try { modelEl.value = modelId(data.selectedModel); } catch { modelEl.value = DEFAULT_MODEL; }
  updateFlag();
  settingsReady = true;
  updateHint();
}
initializeSettings().catch(error => { keyHint.textContent = error.message; });

whisperEl.addEventListener('change', () => chrome.storage.local.set({ whisperModel: whisperEl.value }));
recordingDateEl.addEventListener('change', () => chrome.storage.local.set({ recordingDate: recordingDateEl.value }));
languageEl.addEventListener('change', () => {
  chrome.storage.local.set({ transcriptLanguage: languageEl.value });
  updateFlag();
});
modelEl.addEventListener('change', async () => {
  try {
    modelEl.value = modelId(modelEl.value.trim());
    await chrome.storage.local.set({ selectedModel: modelEl.value });
    updateHint();
  } catch (error) {
    keyHint.textContent = error.message;
    toggleBtn.disabled = !isActive;
  }
});

let checkingBridge = false;
let automaticLoginRequested = false;
async function requestSignIn(retry = false) {
  authBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'AUTH_CODEX', retry });
    if (!result?.ok) throw new Error('Sign-in failed.');
  } catch { bridgeWarningEl.textContent = pt('authFailed'); }
  finally { authBtn.disabled = false; }
}
authBtn.addEventListener('click', () => requestSignIn(true));
async function refreshBridgeWarning() {
  if (checkingBridge) return;
  checkingBridge = true;
  let detail = '';
  try {
    const health = await InTruthConnection.health();
    bridgeReady = health.ready === true;
    const state = health.auth?.state;
    authBtn.hidden = bridgeReady || !health.auth?.canLogin;
    authBtn.textContent = pt(state === 'pending' ? 'authReopen' : 'authRetry');
    detail = state === 'pending' ? pt('authPending') : state === 'required' ? pt('authRequired') : state === 'error' ? pt('authFailed') : health.error || '';
    if (!automaticLoginRequested && ['required', 'pending'].includes(state)) {
      automaticLoginRequested = true;
      await requestSignIn();
    }
  } catch { bridgeReady = false; authBtn.hidden = true; }
  bridgeWarningEl.hidden = bridgeReady;
  bridgeWarningEl.textContent = detail || pt('bridgeWarnText');
  updateHint();
  checkingBridge = false;
}

function updateHint() {
  toggleBtn.disabled = starting || (!isActive && (!bridgeReady || !settingsReady));
  keyHint.textContent = bridgeReady ? pt('hintBridge') : '';
  keyHint.className = 'key-hint' + (bridgeReady ? ' ok' : '');
}
refreshBridgeWarning();
const bridgePollTimer = setInterval(refreshBridgeWarning, 2000);
window.addEventListener('pagehide', () => clearInterval(bridgePollTimer));

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
  starting = true;
  updateHint();
  try {
    if (isActive) {
      const response = await chrome.runtime.sendMessage({ type: 'STOP_FACTCHECK' });
      if (!response?.ok) throw new Error(response?.error || pt('unknownError'));
      setActive(false);
      return;
    }
    const selectedModel = modelId(modelEl.value.trim());
    await chrome.storage.local.set({ whisperModel: whisperEl.value,
      transcriptLanguage: languageEl.value, selectedModel, recordingDate: recordingDateEl.value });
    const response = await chrome.runtime.sendMessage({ type: 'START_FACTCHECK' });
    if (!response?.ok) throw new Error(response?.error || pt('unknownError'));
    setActive(true);
  } catch (error) {
    keyHint.textContent = pt('failedStart') + error.message;
    keyHint.className = 'key-hint error';
  } finally {
    starting = false;
    toggleBtn.disabled = !isActive && (!bridgeReady || !settingsReady);
  }
});
