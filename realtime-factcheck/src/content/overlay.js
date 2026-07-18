// overlay.js

console.log('[overlay] content script loaded');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── I18N — static UI labels only ─────────────────────────────────────────────
// Model-generated content language is handled by TRANSCRIPT_LANGUAGE /
// languageInstruction in the service worker; do NOT duplicate that here.
const I18N = {
  en: {
    unverified: '⚠ unverified',
    newSpeakerQuestion: 'New speaker detected — who is this?',
    skip: 'Skip',
    exportTitle: 'Export session as PDF',
    exportBtn: '↓ Export',
    transcript: 'Transcript',
    claims: 'Claims',
    verdicts: 'Verdicts',
    verdictsEmpty: 'Verdicts will appear here...',
    hedgingLabel: 'Hedging language:',
    hedgingSuffix: '% rate — e.g. "I think", "maybe", "probably"',
    certaintyLabel: 'Certainty markers:',
    certaintySuffixEx: '% rate — e.g. "definitely", "always"',
    fillerLabel: 'Filler words:',
    fillerSuffix: '% rate — e.g. "um", "like", "you know"',
    emotionalLabel: 'Emotional language:',
    rateSuffix: '% rate',
    qualifyingLabel: 'Qualifying words:',
    qualifyingSuffix: '% rate — e.g. "but", "except"',
    firstPersonLabel: 'First-person singular:',
    speechRateLabel: 'Speech rate:',
    rateFast: 'fast',
    rateSlow: 'slow',
    rateModerate: 'moderate',
    source: 'Source',
    verifying: '⟳ verifying...',
    certaintySuffix: ' certainty',
    speakerConviction: 'Speaker conviction: ',
    notAvailable: 'N/A',
    pipelineError: 'An error occurred in the fact-checking pipeline.',
    'verdict_TRUE': 'TRUE',
    'verdict_SUBSTANTIALLY TRUE': 'SUBSTANTIALLY TRUE',
    'verdict_FALSE': 'FALSE',
    'verdict_MISLEADING': 'MISLEADING',
    'verdict_UNVERIFIABLE': 'UNVERIFIABLE',
    'confidence_HIGH': 'HIGH',
    'confidence_MEDIUM': 'MEDIUM',
    'confidence_LOW': 'LOW',
    // PDF / session export
    pdfReportTitle: 'Fact Check Report',
    pdfSessionTitle: 'Fact Check Session',
    pdfNoClaims: 'No claims detected in this session yet.',
    pdfClaimSingular: 'claim',
    pdfClaimPlural: 'claims',
    pdfDetectedSingular: 'detected',
    pdfDetectedPlural: 'detected',
    pdfSummaryTrue: 'True',
    pdfSummarySubTrue: 'Substantially True',
    pdfSummaryFalse: 'False',
    pdfSummaryMisleading: 'Misleading',
    pdfSummaryUnverifiable: 'Unverifiable',
    pdfSources: 'Sources:',
    pdfSource: 'Source',
    pdfUnknown: 'Unknown',
  },
  it: {
    unverified: '⚠ non verificato',
    newSpeakerQuestion: 'Nuovo speaker rilevato — chi è?',
    skip: 'Salta',
    exportTitle: 'Esporta la sessione in PDF',
    exportBtn: '↓ Esporta',
    transcript: 'Trascrizione',
    claims: 'Affermazioni',
    verdicts: 'Verdetti',
    verdictsEmpty: 'I verdetti appariranno qui...',
    hedgingLabel: 'Linguaggio esitante:',
    hedgingSuffix: '% di frequenza — es. "I think", "maybe", "probably"',
    certaintyLabel: 'Marcatori di certezza:',
    certaintySuffixEx: '% di frequenza — es. "definitely", "always"',
    fillerLabel: 'Parole riempitive:',
    fillerSuffix: '% di frequenza — es. "um", "like", "you know"',
    emotionalLabel: 'Linguaggio emotivo:',
    rateSuffix: '% di frequenza',
    qualifyingLabel: 'Parole limitative:',
    qualifyingSuffix: '% di frequenza — es. "but", "except"',
    firstPersonLabel: 'Prima persona singolare:',
    speechRateLabel: 'Velocità di eloquio:',
    rateFast: 'veloce',
    rateSlow: 'lenta',
    rateModerate: 'moderata',
    source: 'Fonte',
    verifying: '⟳ verifica in corso...',
    certaintySuffix: ' di certezza',
    speakerConviction: 'Convinzione dello speaker: ',
    notAvailable: 'N/D',
    pipelineError: 'Si è verificato un errore nella pipeline di fact-checking.',
    'verdict_TRUE': 'VERO',
    'verdict_SUBSTANTIALLY TRUE': 'SOSTANZIALMENTE VERO',
    'verdict_FALSE': 'FALSO',
    'verdict_MISLEADING': 'FUORVIANTE',
    'verdict_UNVERIFIABLE': 'NON VERIFICABILE',
    'confidence_HIGH': 'ALTA',
    'confidence_MEDIUM': 'MEDIA',
    'confidence_LOW': 'BASSA',
    // PDF / esportazione sessione
    pdfReportTitle: 'Report di Fact-Check',
    pdfSessionTitle: 'Sessione di Fact-Check',
    pdfNoClaims: 'Nessuna affermazione rilevata finora in questa sessione.',
    pdfClaimSingular: 'affermazione',
    pdfClaimPlural: 'affermazioni',
    pdfDetectedSingular: 'rilevata',
    pdfDetectedPlural: 'rilevate',
    pdfSummaryTrue: 'Vere',
    pdfSummarySubTrue: 'Sostanzialmente vere',
    pdfSummaryFalse: 'False',
    pdfSummaryMisleading: 'Fuorvianti',
    pdfSummaryUnverifiable: 'Non verificabili',
    pdfSources: 'Fonti:',
    pdfSource: 'Fonte',
    pdfUnknown: 'Sconosciuto',
  },
};

const LANG = (navigator.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';

function t(key) {
  const table = I18N[LANG] || I18N.en;
  return table[key] ?? I18N.en[key] ?? key;
}

// display-only translation for enum values coming from the model
// (verdict / confidence); falls back to the raw value if unknown
function tEnum(prefix, value) {
  if (value === null || value === undefined || value === '') return t('notAvailable');
  const key = prefix + '_' + String(value).toUpperCase();
  const table = I18N[LANG] || I18N.en;
  return table[key] ?? I18N.en[key] ?? value;
}

let panel = null;
let transcriptFeedEl = null;
let interimEl = null;
let claimFeedEl = null;
let verdictListEl = null;
let transcriptCollapsed = false;
const pendingCards    = new Map();
const pendingCardTimes = new Map();

// expire pending cards after 90 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, time] of pendingCardTimes) {
    if (now - time > 90000) {
      const card = pendingCards.get(key);
      if (card) {
        card.classList.remove('rtfc-verdict--pending');
        const verifying = card.querySelector('.rtfc-verifying');
        if (verifying) verifying.textContent = t('unverified');
      }
      pendingCards.delete(key);
      pendingCardTimes.delete(key);
    }
  }
}, 15000);

let lastTranscriptTimestamp = '';
const sentenceTimestamps   = [];
const MAX_TIMESTAMP_BUFFER = 10;

// ── Speaker state ────────────────────────────────────────────────────────────
let speakers = [];

// ── Speaker colors ────────────────────────────────────────────────────────────
const SPEAKER_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#f97316',
];
const speakerColorMap = new Map();

function getSpeakerColor(name) {
  if (!speakerColorMap.has(name)) {
    const idx = speakerColorMap.size % SPEAKER_COLORS.length;
    speakerColorMap.set(name, SPEAKER_COLORS[idx]);
  }
  return speakerColorMap.get(name);
}

// ── Speaker parsing ───────────────────────────────────────────────────────────
const SPEAKER_PARSE_NOISE = new Set(['debate','presidential','vp','vice','2024','2023','2022','2021','2020','2019','2016','surrounded','tonight','live','full','official']);

function parseSpeakersFromTitle(title) {
  if (!title) return [];
  const clean = title.split('|')[0].trim();

  // 'N role vs N role' — e.g. '1 Liberal vs 20 Conservatives'
  const roleMatch = clean.match(/(\d+)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:vs?\.?|versus)\s+(\d+)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (roleMatch) {
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return [cap(roleMatch[2]), cap(roleMatch[4])];
  }

  // 'Name vs N Description' — second side starts with digit, e.g. 'Dean Withers vs 20 MAGA Women'
  const nameVsGroupMatch = clean.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:vs?\.?|versus)\s+(\d+)\s+(.+)/i);
  if (nameVsGroupMatch) {
    const name = nameVsGroupMatch[1].trim().split(' ').pop();
    const groupWords = nameVsGroupMatch[3].trim().split(/\s+/);
    const group = groupWords.filter(w => !SPEAKER_PARSE_NOISE.has(w.toLowerCase())).pop() || groupWords.pop();
    return [name, group];
  }

  // split on vs/and — take last non-noise capitalized word from each side
  const vsSplit = clean.split(/\s+(?:vs?\.?|versus|and|&)\s+/i);
  if (vsSplit.length >= 2) {
    const lastName = part => {
      const words = part.trim().split(/\s+/);
      for (let i = words.length - 1; i >= 0; i--) {
        if (/^[A-Z]/.test(words[i]) && !SPEAKER_PARSE_NOISE.has(words[i].toLowerCase())) return words[i];
      }
      return null;
    };
    const a = lastName(vsSplit[0]);
    const b = lastName(vsSplit[1]);
    if (a && b) return [a, b];
  }

  return [];
}

let lastActiveSpeaker = null; // track most recently labeled speaker

function normalizeSpeakerName(name) {
  if (!name) return name;
  // if name matches a known speaker's last name or full name, return the canonical last name
  for (const speaker of speakers) {
    const lastName = speaker.trim().split(' ').pop().toLowerCase();
    if (name.toLowerCase() === speaker.toLowerCase()) return speaker; // exact match
    if (name.toLowerCase().includes(lastName)) return speaker;        // last name match
  }
  return name; // unknown speaker — return as-is
}

function getClaimSpeaker(claimText) {
  if (!speakers.length) return 'Other';
  const lower = claimText.toLowerCase();

  // direct name match
  for (const speaker of speakers) {
    if (lower.includes(speaker.toLowerCase())) return speaker;
  }

  // partial name match (handles "Vice President Harris" → "Harris")
  for (const speaker of speakers) {
    const parts = speaker.toLowerCase().split(' ');
    if (parts.some(p => p.length > 3 && lower.includes(p))) return speaker;
  }

  // fallback: use last active speaker for vague references
  if (lastActiveSpeaker) return lastActiveSpeaker;

  return 'Other';
}

// ── Speaker ID confirmation ──────────────────────────────────────────────────

const confirmedSpeakerMap = {}; // { speakerId: 'Harris' }
const pendingSpeakerIds   = new Set(); // IDs waiting for confirmation

function showSpeakerBanner(speakerId, sample) {
  const sid = String(speakerId);
  if (pendingSpeakerIds.has(sid)) return;
  if (sid in confirmedSpeakerMap) return;
  // if speakers not yet parsed from title, retry once after 1s
  if (!speakers.length) {
    setTimeout(() => showSpeakerBanner(speakerId, sample), 1000);
    return;
  }
  pendingSpeakerIds.add(sid);

  const banner = document.createElement('div');
  banner.className = 'rtfc-speaker-banner';
  banner.innerHTML =
    '<div class="rtfc-speaker-banner-text">' + escapeHtml(t('newSpeakerQuestion')) + '</div>' +
    '<div class="rtfc-speaker-banner-sample">"' + escapeHtml(sample) + '..."</div>' +
    '<div class="rtfc-speaker-banner-buttons">' +
      speakers.map(name =>
        '<button class="rtfc-speaker-banner-btn" data-name="' + escapeHtml(name) + '" data-id="' + sid + '">' + escapeHtml(name) + '</button>'
      ).join('') +
      '<button class="rtfc-speaker-banner-btn rtfc-speaker-banner-btn--skip" data-id="' + sid + '">' + escapeHtml(t('skip')) + '</button>' +
    '</div>';

  banner.querySelectorAll('.rtfc-speaker-banner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const id   = btn.dataset.id; // already a string — matches confirmedSpeakerMap keys
      if (name) {
        confirmedSpeakerMap[id] = name;
        chrome.runtime.sendMessage({
          type: 'SPEAKER_NAMES',
          speakerIdToName: { [id]: name },
        });
      }
      pendingSpeakerIds.delete(id);
      if (!name) confirmedSpeakerMap[id] = null;
      banner.remove();
      // retroactively tag all existing grounded cards now that we have more info
      retryTagAllCards();
    });
  });

  // insert above verdicts
  const verdictsSection = panel?.querySelector('#rtfc-verdicts-section');
  if (verdictsSection) verdictsSection.insertAdjacentElement('beforebegin', banner);
}

// ── Speaker confirmation state ───────────────────────────────────────────────

function allSpeakersConfirmed() {
  // true only when every speaker parsed from the title has been confirmed (or skipped) by the user
  // speaker IDs 0, 1, 2... are assigned in order of first appearance — matches speakers array indices
  if (!speakers.length) return false;
  return speakers.every((_, i) => String(i) in confirmedSpeakerMap);
}
function retryTagAllCards() {
  // retroactively tag all grounded cards once speakers are confirmed
  if (!verdictListEl) return;
  verdictListEl.querySelectorAll('.rtfc-verdict:not(.rtfc-verdict--pending)').forEach(card => {
    const sid = card.dataset.speakerid;
    if (sid === undefined) return;
    const rawName = confirmedSpeakerMap[sid];
    if (!rawName) return; // skipped or not confirmed
    const name = normalizeSpeakerName(rawName);
    // add or update tag
    let tag = card.querySelector('.rtfc-speaker-tag');
    if (tag) {
      tag.textContent = name;
      tag.style.background = getSpeakerColor(name);
    } else {
      const color = getSpeakerColor(name);
      tag = document.createElement('div');
      tag.className = 'rtfc-speaker-tag';
      tag.style.background = color;
      tag.textContent = name;
      card.insertBefore(tag, card.firstChild);
    }
  });
}

// ── Speaker editor ───────────────────────────────────────────────────────────

function sendSpeakerMap() {
  // speaker IDs are assigned in order of first appearance
  // We map ID 0 → speakers[0], ID 1 → speakers[1], etc.
  const speakerIdToName = {};
  speakers.forEach((name, i) => { speakerIdToName[i] = name; });
  chrome.runtime.sendMessage({ type: 'SPEAKER_NAMES', speakerIdToName });
}

function renderSpeakerEditor() {
  const el = panel?.querySelector('#rtfc-speaker-editor');
  if (!el || !speakers.length) return;

  el.innerHTML = speakers.map((name, i) => {
    const color = getSpeakerColor(name);
    return '<span class="rtfc-speaker-chip" style="border-color:' + color + ';color:' + color + '" data-idx="' + i + '">' +
      '<input class="rtfc-speaker-chip-input" value="' + escapeHtml(name) + '" data-idx="' + i + '" style="color:' + color + '" />' +
    '</span>';
  }).join('');

  el.querySelectorAll('.rtfc-speaker-chip-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const oldName = speakers[idx];
      const newName = e.target.value.trim() || oldName;
      if (newName === oldName) return;

      // update color map
      if (speakerColorMap.has(oldName)) {
        speakerColorMap.set(newName, speakerColorMap.get(oldName));
        speakerColorMap.delete(oldName);
      }

      speakers[idx] = newName;
      e.target.style.color = getSpeakerColor(newName);
      e.target.closest('.rtfc-speaker-chip').style.borderColor = getSpeakerColor(newName);
      e.target.closest('.rtfc-speaker-chip').style.color = getSpeakerColor(newName);
      sendSpeakerMap(); // update service worker with new names

      // re-render all verdict cards to update speaker tags
      const cards = verdictListEl?.querySelectorAll('.rtfc-speaker-tag');
      if (cards) {
        cards.forEach(tag => {
          if (tag.textContent === oldName) {
            tag.textContent = newName;
            tag.style.background = getSpeakerColor(newName);
          }
        });
      }
    });
    // select all on focus for easy editing
    input.addEventListener('focus', e => e.target.select());
  });
}

// ── Error toast ──────────────────────────────────────────────────────────────

function showError(message) {
  if (!panel) return;
  const existing = panel.querySelector('.rtfc-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'rtfc-error-toast';
  toast.innerHTML =
    '<span class="rtfc-error-icon">⚠</span>' +
    '<span class="rtfc-error-msg">' + escapeHtml(message) + '</span>' +
    '<button class="rtfc-error-close">✕</button>';

  toast.querySelector('.rtfc-error-close').addEventListener('click', () => toast.remove());
  panel.querySelector('#rtfc-header').insertAdjacentElement('afterend', toast);

  // auto-dismiss after 8 seconds unless it's a fatal error
  if (!message.includes('failed') && !message.includes('key')) {
    setTimeout(() => toast.remove(), 8000);
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function createPanel() {
  if (panel) return;

  panel = document.createElement('div');
  panel.id = 'rtfc-panel';
  panel.innerHTML = [
    '<div class="rtfc-resize-handle rtfc-rz-n"  data-dir="n"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-s"  data-dir="s"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-w"  data-dir="w"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-e"  data-dir="e"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-nw" data-dir="nw"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-ne" data-dir="ne"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-sw" data-dir="sw"></div>',
    '<div class="rtfc-resize-handle rtfc-rz-se" data-dir="se"></div>',
    '<div id="rtfc-header">',
      '<span><span class="rtfc-dot"></span>InTruth</span>',
      '<div class="rtfc-header-actions">',
        '<button id="rtfc-export" title="' + escapeHtml(t('exportTitle')) + '">' + escapeHtml(t('exportBtn')) + '</button>',
        '<button id="rtfc-close">✕</button>',
      '</div>',
    '</div>',
    '<div id="rtfc-body">',
      '<div id="rtfc-transcript-section">',
        '<div class="rtfc-section-header">',
          '<span class="rtfc-section-label">' + escapeHtml(t('transcript')) + '</span>',
          '<button class="rtfc-toggle-btn" id="rtfc-transcript-toggle">▾</button>',
        '</div>',
        '<div id="rtfc-transcript-feed"></div>',
        '<p id="rtfc-interim"></p>',
      '</div>',
      '<div id="rtfc-claims-section">',
        '<div class="rtfc-section-header">',
          '<span class="rtfc-section-label">' + escapeHtml(t('claims')) + '</span>',
        '</div>',
        '<ul id="rtfc-claim-feed"></ul>',
      '</div>',
      '<div id="rtfc-verdicts-section">',
        '<div class="rtfc-section-header">',
          '<span class="rtfc-section-label">' + escapeHtml(t('verdicts')) + '</span>',
          '<div id="rtfc-speaker-editor"></div>',
        '</div>',
        '<div id="rtfc-verdicts">',
          '<p class="rtfc-empty">' + escapeHtml(t('verdictsEmpty')) + '</p>',
        '</div>',
      '</div>',
    '</div>',
  ].join('');

  document.body.appendChild(panel);

  transcriptFeedEl = panel.querySelector('#rtfc-transcript-feed');
  interimEl        = panel.querySelector('#rtfc-interim');
  claimFeedEl      = panel.querySelector('#rtfc-claim-feed');
  verdictListEl    = panel.querySelector('#rtfc-verdicts');

  panel.querySelector('#rtfc-close').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_FACTCHECK' });
    removePanel();
  });

  panel.querySelector('#rtfc-export').addEventListener('click', () => exportPDF());

  makeResizable(panel);
  makeDraggable(panel);

  panel.querySelector('#rtfc-transcript-toggle').addEventListener('click', () => {
    transcriptCollapsed = !transcriptCollapsed;
    transcriptFeedEl.style.display = transcriptCollapsed ? 'none' : '';
    interimEl.style.display = transcriptCollapsed ? 'none' : '';
    panel.querySelector('#rtfc-transcript-toggle').textContent = transcriptCollapsed ? '▸' : '▾';
  });
}

function removePanel() {
  panel?.remove();
  panel = null;
  transcriptFeedEl = null;
  interimEl = null;
  claimFeedEl = null;
  verdictListEl = null;
  transcriptCollapsed = false;
  pendingCards.clear();
  pendingCardTimes.clear();
  speakers = [];
  speakerColorMap.clear();
  sentenceTimestamps.length = 0;
  lastTranscriptTimestamp = '';
  lastActiveSpeaker = null;
  Object.keys(confirmedSpeakerMap).forEach(k => delete confirmedSpeakerMap[k]);
  pendingSpeakerIds.clear();
}

// ── Transcript ────────────────────────────────────────────────────────────────
// Smart autoscroll: only follow new text if the user is already pinned at the
// bottom of the feed; if they scrolled up to read/select, leave them alone.
function feedPinnedToBottom() {
  if (!transcriptFeedEl) return true;
  return transcriptFeedEl.scrollHeight - transcriptFeedEl.scrollTop - transcriptFeedEl.clientHeight < 24;
}

// Persistent inline "ghost" span at the tail of the feed: interim text streams
// here and is replaced in place by the committed sentence (no separate line,
// no layout jumps).
function getInterimGhost() {
  if (!transcriptFeedEl) return null;
  let ghost = transcriptFeedEl.querySelector('.rtfc-interim-ghost');
  if (!ghost) {
    ghost = document.createElement('span');
    ghost.className = 'rtfc-interim-ghost';
    transcriptFeedEl.appendChild(ghost);
  }
  return ghost;
}

function addTranscriptText(text) {
  if (!transcriptFeedEl) return;
  const pinned = feedPinnedToBottom();
  const span = document.createElement('span');
  span.textContent = text + ' ';
  span.className = 'rtfc-transcript-word';
  const ghost = getInterimGhost();
  transcriptFeedEl.insertBefore(span, ghost); // committed text goes before the ghost tail
  if (pinned) transcriptFeedEl.scrollTop = transcriptFeedEl.scrollHeight;
}

function updateInterim(text) {
  const ghost = getInterimGhost();
  if (!ghost) return;
  const pinned = feedPinnedToBottom();
  ghost.textContent = text;
  if (pinned) transcriptFeedEl.scrollTop = transcriptFeedEl.scrollHeight;
}

function clearInterim() {
  const ghost = getInterimGhost();
  if (ghost) ghost.textContent = '';
}

// Status line (fixed-height #rtfc-interim bar): model loading / transient info.
function updateStatusLine(text) {
  if (!interimEl) return;
  interimEl.textContent = text;
}

function clearStatusLine() {
  if (!interimEl) return;
  interimEl.textContent = '';
}

// ── Claims ────────────────────────────────────────────────────────────────────
function addClaimBullet(claim) {
  if (!claimFeedEl) return;
  const li = document.createElement('li');
  li.className = 'rtfc-claim-bullet rtfc-claim-bullet--pending';
  li.dataset.claim = claim.toLowerCase().slice(0, 40);
  li.textContent = claim;
  claimFeedEl.appendChild(li);
  return li;
}

function applyVerdictToBullet(claim, verdict, confidence) {
  if (!claimFeedEl) return;
  const color = colorForVerdict(verdict, confidence);
  const claimWords = new Set(claim.toLowerCase().split(/\s+/).filter(w => w.length >= 4));
  const bullets = claimFeedEl.querySelectorAll('.rtfc-claim-bullet');
  let bestLi = null, bestScore = 0;
  for (const li of bullets) {
    const bulletWords = (li.textContent || '').toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const overlap = bulletWords.filter(w => claimWords.has(w)).length;
    const score = overlap / Math.max(claimWords.size, bulletWords.length);
    if (score > bestScore) { bestScore = score; bestLi = li; }
  }
  if (bestLi && bestScore >= 0.3) {
    bestLi.className = 'rtfc-claim-bullet rtfc-claim-bullet--' + color;
  }
}

// ── Verdicts ──────────────────────────────────────────────────────────────────
function colorForVerdict(verdict, confidence) {
  if (confidence === 'LOW')              return 'yellow';
  if (verdict === 'TRUE')                return 'green';
  if (verdict === 'SUBSTANTIALLY TRUE')  return 'teal';
  if (verdict === 'FALSE')               return 'red';
  if (verdict === 'MISLEADING')          return 'yellow';
  if (verdict === 'UNVERIFIABLE')        return 'grey';
  return 'grey';
}

function buildLexicalRows(lexical) {
  if (!lexical) return '';
  const rows = [];
  const r = lexical.rates || {};
  if (r.hedging > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('hedgingLabel')) + '</span> ' + r.hedging + escapeHtml(t('hedgingSuffix')) + '</div>');
  if (r.certainty > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('certaintyLabel')) + '</span> ' + r.certainty + escapeHtml(t('certaintySuffixEx')) + '</div>');
  if (r.filler > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('fillerLabel')) + '</span> ' + r.filler + escapeHtml(t('fillerSuffix')) + '</div>');
  if (r.emotional > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('emotionalLabel')) + '</span> ' + r.emotional + escapeHtml(t('rateSuffix')) + '</div>');
  if (r.exclusive > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('qualifyingLabel')) + '</span> ' + r.exclusive + escapeHtml(t('qualifyingSuffix')) + '</div>');
  if (r.firstPersonSg > 0)
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('firstPersonLabel')) + '</span> ' + r.firstPersonSg + escapeHtml(t('rateSuffix')) + '</div>');
  if (lexical.wordsPerSecond != null) {
    const rateDesc = lexical.wordsPerSecond > 3.5 ? t('rateFast') : lexical.wordsPerSecond < 2 ? t('rateSlow') : t('rateModerate');
    rows.push('<div class="rtfc-conviction-row"><span class="rtfc-conviction-label">' + escapeHtml(t('speechRateLabel')) + '</span> ' + lexical.wordsPerSecond + ' w/s (' + escapeHtml(rateDesc) + ')</div>');
  }
  return rows.join('');
}

function buildCard(result) {
  const color = colorForVerdict(result.verdict, result.confidence);
  const convictionColor = result.speaker_confidence === 'HIGH' ? 'green'
                        : result.speaker_confidence === 'LOW'  ? 'red'
                        : 'yellow';

  const card = document.createElement('div');
  card.className = 'rtfc-verdict rtfc-verdict--' + color + (result.pending ? ' rtfc-verdict--pending' : '');
  card.dataset.claim = result.claim.toLowerCase().slice(0, 40);
  if (result.dominantSpeakerId !== null && result.dominantSpeakerId !== undefined) {
    card.dataset.speakerid = String(result.dominantSpeakerId);
  }
  card._resultData = result;

  const sourcesHTML = (result.sources ?? []).map((url, i) => {
    const isUrl = url.startsWith('http://') || url.startsWith('https://');
    return isUrl
      ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(t('source')) + ' ' + (i + 1) + '</a>'
      : '<span class="rtfc-source-text">' + escapeHtml(url) + '</span>';
  }).join('');

  const lexicalRows = buildLexicalRows(result.lexical);

  // speaker tag — only show when ALL speakers have been confirmed by user
  // prevents wrong tags on cards detected before diarization stabilized
  let speakerTag = '';
  if (!result.pending && allSpeakersConfirmed() && result.dominantSpeakerId !== null && result.dominantSpeakerId !== undefined) {
    const confirmedName = confirmedSpeakerMap[result.dominantSpeakerId];
    if (confirmedName) {
      const name = normalizeSpeakerName(confirmedName);
      const color = getSpeakerColor(name);
      speakerTag = '<div class="rtfc-speaker-tag" style="background:' + color + '">' + escapeHtml(name) + '</div>';
    }
  }

  card.innerHTML = [
    speakerTag,
    '<div class="rtfc-verdict-header">',
      '<span class="rtfc-badge rtfc-badge--' + color + '">' + escapeHtml(tEnum('verdict', result.verdict)) + '</span>',
      result.pending ? '<span class="rtfc-verifying">' + escapeHtml(t('verifying')) + '</span>' : '',
      '<span class="rtfc-confidence-right">' + escapeHtml(tEnum('confidence', result.confidence)) + escapeHtml(t('certaintySuffix')) + '</span>',
      '<span class="rtfc-timestamp">' + escapeHtml(result._timestamp || '') + '</span>',
    '</div>',
    '<p class="rtfc-claim">"' + escapeHtml(result.claim) + '"</p>',
    '<p class="rtfc-explanation">' + escapeHtml(result.explanation) + '</p>',
    '<div class="rtfc-speaker-confidence">',
      '<button class="rtfc-speaker-toggle">',
        '<span class="rtfc-speaker-dot rtfc-speaker-dot--' + convictionColor + '"></span>',
        escapeHtml(t('speakerConviction')) + escapeHtml(tEnum('confidence', result.speaker_confidence)),
        '<span class="rtfc-speaker-arrow">▾</span>',
      '</button>',
      '<div class="rtfc-speaker-explanation" style="display:none">',
        (result.speaker_confidence_explanation
          ? '<div class="rtfc-conviction-row rtfc-conviction-row--model">' + escapeHtml(result.speaker_confidence_explanation) + '</div>'
          : ''),
        lexicalRows,
      '</div>',
    '</div>',
    (sourcesHTML && sourcesHTML.trim()) ? '<div class="rtfc-sources">' + sourcesHTML + '</div>' : '',
  ].join('');

  const toggleBtn = card.querySelector('.rtfc-speaker-toggle');
  const reasons   = card.querySelector('.rtfc-speaker-explanation');
  const arrow     = card.querySelector('.rtfc-speaker-arrow');
  toggleBtn.addEventListener('click', () => {
    const open = reasons.style.display === 'none';
    reasons.style.display = open ? 'block' : 'none';
    arrow.textContent = open ? '▴' : '▾';
  });

  return card;
}

function findPendingCard(claim, fastClaim) {
  // try exact match on fast claim first — grounded claim text may differ from fast pass
  if (fastClaim) {
    const fastKey = fastClaim.toLowerCase().slice(0, 40);
    if (pendingCards.has(fastKey)) return pendingCards.get(fastKey);
  }

  const key = claim.toLowerCase().slice(0, 40);
  if (pendingCards.has(key)) return pendingCards.get(key);

  const claimWords = new Set(claim.toLowerCase().split(/\s+/).filter(w => w.length >= 4));
  let bestCard = null, bestScore = 0;
  for (const [cardKey, card] of pendingCards) {
    const cardWords = cardKey.split(/\s+/).filter(w => w.length >= 4);
    const overlap = cardWords.filter(w => claimWords.has(w)).length;
    const score = overlap / Math.max(claimWords.size, cardWords.length);
    if (score > bestScore) { bestScore = score; bestCard = card; }
  }
  if (bestScore >= 0.4) return bestCard;
  return verdictListEl?.querySelector('.rtfc-verdict--pending');
}

function getVideoTimestamp() {
  const video = document.querySelector('video');
  if (!video) return '';
  const s = Math.floor(video.currentTime);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
  return String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

function getClaimTimestamp(claim) {
  if (!sentenceTimestamps.length) return lastTranscriptTimestamp || getVideoTimestamp();
  const claimWords = new Set(claim.toLowerCase().split(/\s+/).filter(w => w.length >= 4));
  let bestMatch = null, bestScore = 0;
  for (const entry of sentenceTimestamps) {
    const sentWords = entry.text.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const overlap = sentWords.filter(w => claimWords.has(w)).length;
    const score = overlap / Math.max(claimWords.size, sentWords.length);
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }
  return bestScore >= 0.3 ? bestMatch.timestamp : (lastTranscriptTimestamp || getVideoTimestamp());
}

function addVerdict(result) {
  if (!verdictListEl) return;
  verdictListEl.querySelector('.rtfc-empty')?.remove();
  applyVerdictToBullet(result.claim, result.verdict, result.confidence);
  if (!result._timestamp) result._timestamp = getClaimTimestamp(result.claim);
  if (result.dominantSpeakerId !== null && result.dominantSpeakerId !== undefined) {
    result.dominantSpeakerId = String(result.dominantSpeakerId);
  }
  const card = buildCard(result);
  if (result.pending) {
    const key = result.claim.toLowerCase().slice(0, 40);
    pendingCards.set(key, card);
    pendingCardTimes.set(key, Date.now());
  } else {
    logVerdict(result);
  }
  verdictListEl.prepend(card);
}

function updateVerdict(result) {
  const existing = findPendingCard(result.claim, result._fastClaim);
  // always inherit timestamp from the pending card — it was set at detection time
  // never re-derive from sentenceTimestamps which may no longer contain the original sentence
  if (existing && existing._resultData?._timestamp) {
    result._timestamp = existing._resultData._timestamp;
  } else if (!result._timestamp) {
    result._timestamp = getClaimTimestamp(result.claim);
  }
  // normalize dominantSpeakerId to string for consistent confirmedSpeakerMap lookup
  if (result.dominantSpeakerId !== null && result.dominantSpeakerId !== undefined) {
    result.dominantSpeakerId = String(result.dominantSpeakerId);
  }
  const newCard = buildCard(result);
  if (existing) {
    existing.replaceWith(newCard);
    for (const [k, v] of pendingCards) {
      if (v === existing) { pendingCards.delete(k); pendingCardTimes.delete(k); break; }
    }
  } else {
    verdictListEl?.querySelector('.rtfc-empty')?.remove();
    verdictListEl?.prepend(newCard);
  }
  applyVerdictToBullet(result.claim, result.verdict, result.confidence);
  logVerdict(result);
}

// Switch the panel from the docked (right-anchored, full-height) layout to a
// floating window, freezing its current geometry so it no longer spans the
// viewport. Shared by the resize and drag handlers.
function enterFloating(panel) {
  if (panel.classList.contains('rtfc-floating')) return;
  const rect = panel.getBoundingClientRect();
  const h = Math.min(rect.height, Math.round(window.innerHeight * 0.8));
  panel.classList.add('rtfc-floating');
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.height = h + 'px';
  panel.style.left = Math.round(rect.left) + 'px';
  panel.style.top = Math.round(rect.top) + 'px';
}

// Resize from any edge/corner. Each handle keeps the opposite edge anchored:
// dragging the left edge moves the left edge (right stays put), dragging the
// top edge moves the top (bottom stays put), etc. Vertical resizing detaches
// the panel into floating mode, since docked panels always span the viewport.
function makeResizable(panel) {
  const MIN_W = 280, MIN_H = 200;
  const maxW = () => Math.round(window.innerWidth * 0.7);
  const maxH = () => Math.round(window.innerHeight * 0.95);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // Restore persisted width.
  chrome.storage.local.get('rtfcPanelWidth', ({ rtfcPanelWidth }) => {
    if (rtfcPanelWidth) {
      panel.style.setProperty('--rtfc-width', clamp(rtfcPanelWidth, MIN_W, maxW()) + 'px');
    }
  });

  const persist = () => {
    const rect = panel.getBoundingClientRect();
    const data = { rtfcPanelWidth: Math.round(rect.width) };
    if (panel.classList.contains('rtfc-floating')) {
      data.rtfcFloating = true;
      data.rtfcLeft = Math.round(rect.left);
      data.rtfcTop = Math.round(rect.top);
      data.rtfcHeight = Math.round(rect.height);
    }
    chrome.storage.local.set(data);
  };

  panel.querySelectorAll('.rtfc-resize-handle').forEach((handle) => {
    const dir = handle.dataset.dir || '';
    const west = dir.includes('w'), east = dir.includes('e');
    const north = dir.includes('n'), south = dir.includes('s');
    const vertical = north || south;
    let active = false, r0 = null;

    handle.addEventListener('pointerdown', (e) => {
      active = true;
      // Height is only adjustable once the panel is detached from the edges.
      if (vertical) enterFloating(panel);
      r0 = panel.getBoundingClientRect();
      handle.classList.add('rtfc-resizing');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!active) return;
      const floating = panel.classList.contains('rtfc-floating');

      // Horizontal axis — anchor the edge we're not dragging.
      if (east) {
        panel.style.setProperty('--rtfc-width', clamp(e.clientX - r0.left, MIN_W, maxW()) + 'px');
      } else if (west) {
        let w = clamp(r0.right - e.clientX, MIN_W, maxW());
        if (floating) {
          let left = r0.right - w;
          if (left < 0) { left = 0; w = r0.right; }
          panel.style.left = left + 'px';
        }
        panel.style.setProperty('--rtfc-width', w + 'px');
      }

      // Vertical axis — only meaningful while floating.
      if (floating && south) {
        panel.style.height = clamp(e.clientY - r0.top, MIN_H, maxH()) + 'px';
      } else if (floating && north) {
        let h = clamp(r0.bottom - e.clientY, MIN_H, maxH());
        let top = r0.bottom - h;
        if (top < 0) { top = 0; h = r0.bottom; }
        panel.style.top = top + 'px';
        panel.style.height = h + 'px';
      }
    });

    const end = (e) => {
      if (!active) return;
      active = false;
      handle.classList.remove('rtfc-resizing');
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      persist();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}

// Detach the panel from the right edge and let it be moved anywhere by
// grabbing the header. Position + floating state persist across sessions.
function makeDraggable(panel) {
  const header = panel.querySelector('#rtfc-header');
  if (!header) return;

  // Clamp the panel fully inside the viewport.
  function moveTo(left, top) {
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    panel.style.left = Math.min(Math.max(0, left), maxLeft) + 'px';
    panel.style.top = Math.min(Math.max(0, top), maxTop) + 'px';
  }

  // Restore a persisted floating position (and height, if resized).
  chrome.storage.local.get(['rtfcFloating', 'rtfcLeft', 'rtfcTop', 'rtfcHeight'], (d) => {
    if (d.rtfcFloating && typeof d.rtfcLeft === 'number' && typeof d.rtfcTop === 'number') {
      enterFloating(panel);
      if (typeof d.rtfcHeight === 'number') {
        const h = Math.min(Math.max(d.rtfcHeight, 200), Math.round(window.innerHeight * 0.95));
        panel.style.height = h + 'px';
      }
      moveTo(d.rtfcLeft, d.rtfcTop);
    }
  });

  let isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  header.addEventListener('pointerdown', (e) => {
    // Don't start a drag from the export/close controls.
    if (e.target.closest('button')) return;
    isDragging = true;
    enterFloating(panel);
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    header.classList.add('rtfc-dragging');
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  header.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    moveTo(startLeft + (e.clientX - startX), startTop + (e.clientY - startY));
  });

  header.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    header.classList.remove('rtfc-dragging');
    try { header.releasePointerCapture(e.pointerId); } catch (_) {}
    const rect = panel.getBoundingClientRect();
    chrome.storage.local.set({
      rtfcFloating: true,
      rtfcLeft: Math.round(rect.left),
      rtfcTop: Math.round(rect.top),
    });
  });

  // Keep a floating panel on-screen if the window is resized.
  window.addEventListener('resize', () => {
    if (panel.classList.contains('rtfc-floating')) {
      const rect = panel.getBoundingClientRect();
      moveTo(rect.left, rect.top);
    }
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  console.log('[overlay] message received:', msg.type);
  switch (msg.type) {

    case 'START_FACTCHECK':
      createPanel();
      startSession();
      speakers = parseSpeakersFromTitle(document.title || '');
      speakerColorMap.clear();
      chrome.runtime.sendMessage({
        type:  'PAGE_TITLE',
        title: document.title || '',
        date:  (() => {
          const el = document.querySelector('meta[itemprop="uploadDate"]') ||
                     document.querySelector('meta[property="og:updated_time"]');
          return el ? new Date(el.content).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
        })(),
      });
      renderSpeakerEditor();
      break;

    case 'STOP_FACTCHECK':
      stopSession();
      removePanel();
      break;

    case 'TRANSCRIPT_RESULT':
      if (msg.interim) {
        updateInterim(msg.text);
      } else if (msg.isFinal) {
        const ts = getVideoTimestamp();
        lastTranscriptTimestamp = ts;
        sentenceTimestamps.push({ text: msg.text, timestamp: ts });
        if (sentenceTimestamps.length > MAX_TIMESTAMP_BUFFER) sentenceTimestamps.shift();
        clearInterim();
        // strip [Speaker N] prefix before displaying
        const displayText = msg.text.replace(/^\[.*?\]\s*/, '');
        addTranscriptText(displayText);
        // track which speaker is active from label
        const labelMatch = msg.text.match(/^\[(.+?)\]/);
        if (labelMatch && speakers.includes(labelMatch[1])) {
          lastActiveSpeaker = labelMatch[1];
        }
      }
      break;

    case 'NEW_SPEAKER':
      if (panel) showSpeakerBanner(msg.speakerId, msg.sample || '');
      break;

    case 'PIPELINE_ERROR':
      showError(msg.message || t('pipelineError'));
      break;

    case 'MODEL_PROGRESS':
      // show transcription-model download/load progress in the interim line; it
      // is transient and gets replaced by real interim transcripts once ready.
      if (msg.status === 'ready') {
        clearStatusLine();
      } else if (typeof msg.progress === 'number' && msg.progress < 100) {
        const pct = Math.round(msg.progress);
        const name = (msg.file || '').split('/').pop() || 'model';
        updateStatusLine(`⬇ Loading transcription model (${name}) — ${pct}%`);
      } else if (msg.status === 'initiate' || msg.status === 'download') {
        updateStatusLine('⬇ Loading transcription model…');
      }
      break;

    case 'NEW_VERDICT':
      if (msg.results) {
        for (const result of msg.results) {
          addClaimBullet(result.claim);
          addVerdict(result);
        }
      }
      break;

    case 'UPDATE_VERDICTS':
      if (msg.results) {
        for (const result of msg.results) {
          updateVerdict(result);
        }
      }
      break;
  }
});