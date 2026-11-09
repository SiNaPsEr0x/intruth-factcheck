/* Shared by the extension, bridge and offline tests. No credentials live here. */
(function (root) {
  'use strict';
  const DEFAULT_MODEL = 'gpt-6-luna';
  const BRIDGE_URL = 'http://127.0.0.1:8787';
  const VERDICTS = ['TRUE', 'SUBSTANTIALLY TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIABLE'];
  const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];
  function modelId(value) {
    if (value === undefined || value === null || value === '') return DEFAULT_MODEL;
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(value)) {
      throw new Error('Invalid Codex model identifier.');
    }
    return value;
  }
  const PREFERENCE_KEYS = new Set(['whisperModel', 'transcriptLanguage', 'selectedModel', 'recordingDate',
    'rtfcPanelWidth', 'rtfcFloating', 'rtfcLeft', 'rtfcTop', 'rtfcHeight', 'apiBaseUrl', 'apiKey', 'exaApiKey']);
  // Base URL of an OpenAI-compatible API. https for remote providers; plain http
  // only on the loopback interface (local providers such as Ollama). Credentials
  // in the URL are rejected — the key travels in the Authorization header instead.
  function apiBaseUrl(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.length > 300) throw new Error('Invalid API base URL.');
    let url;
    try { url = new URL(value.trim()); } catch { throw new Error('Invalid API base URL.'); }
    const loopback = url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase());
    if (url.protocol !== 'https:' && !loopback) throw new Error('API base URL must use https (http only on localhost).');
    if (url.username || url.password || url.hash || url.search) throw new Error('API base URL must not contain credentials, query or fragment.');
    return url.href.replace(/\/+$/, '');
  }
  // API keys are opaque secrets: no whitespace/control chars, bounded length.
  // Never logged or included in error messages by callers.
  function apiKey(value) {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.length > 200 || /[\s]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('Invalid API key.');
    }
    return value;
  }
  async function readSettings(storage) {
    // Persist only supported preferences; authentication belongs to Codex.
    const values = await storage.get(null);
    const unused = Object.keys(values).filter(key => !PREFERENCE_KEYS.has(key));
    if (unused.length) await storage.remove(unused);
    return Object.fromEntries(Object.entries(values).filter(([key]) => PREFERENCE_KEYS.has(key)));
  }
  function cleanSources(sources) {
    if (!Array.isArray(sources)) return [];
    const result = new Set();
    for (const source of sources) {
      if (typeof source !== 'string') continue;
      try {
        const url = new URL(source);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        result.add(url.href);
      } catch { /* Ignore invalid model-generated URLs. */ }
      if (result.size === 3) break;
    }
    return [...result];
  }
  // Shared speaker-name heuristic for debate-style titles ("A vs B",
  // "1 Liberal vs 20 Conservatives"). Used by both the content script and the
  // service worker so the two never drift apart.
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
  function validateClaims(value) {
    if (!value || !Array.isArray(value.claims) || value.claims.length > 3) {
      throw new Error('Codex did not return a valid claims object.');
    }
    return value.claims.map(claim => {
      if (!claim || !VERDICTS.includes(claim.verdict) || !CONFIDENCE.includes(claim.confidence) ||
          !CONFIDENCE.includes(claim.speaker_confidence) ||
          !['claim', 'explanation', 'speaker', 'speaker_confidence_explanation'].every(
            key => typeof claim[key] === 'string' && claim[key].length <= 4000) ||
          !claim.claim.trim() || !claim.explanation.trim() || !Array.isArray(claim.sources) ||
          claim.sources.some(url => typeof url !== 'string')) {
        throw new Error('Codex returned an invalid claim or verdict.');
      }
      // Model output must never introduce internal UI/session control fields.
      return { claim: claim.claim, verdict: claim.verdict, confidence: claim.confidence,
        explanation: claim.explanation, sources: cleanSources(claim.sources),
        speaker: claim.speaker, speaker_confidence: claim.speaker_confidence,
        speaker_confidence_explanation: claim.speaker_confidence_explanation };
    });
  }
  const api = { DEFAULT_MODEL, BRIDGE_URL, VERDICTS, CONFIDENCE, modelId, readSettings, cleanSources, validateClaims,
    SPEAKER_PARSE_NOISE, parseSpeakersFromTitle, apiBaseUrl, apiKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InTruthProtocol = api;
})(globalThis);
