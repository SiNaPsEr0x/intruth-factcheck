/* Shared by the extension, bridge and offline tests. No credentials live here. */
(function (root) {
  'use strict';
  const DEFAULT_MODEL = 'gpt-6-luna';
  const BRIDGE_URL = 'http://127.0.0.1:8787';
  const VERDICTS = ['TRUE', 'SUBSTANTIALLY TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIABLE'];
  const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];
  const LEGACY_MODELS = /^(haiku|sonnet|opus|claude.*)$/i;
  function modelId(value) {
    if (!value || LEGACY_MODELS.test(value)) return DEFAULT_MODEL;
    if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(value)) {
      throw new Error('Invalid Codex model identifier.');
    }
    return value;
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
      return { ...claim, sources: cleanSources(claim.sources) };
    });
  }
  const api = { DEFAULT_MODEL, BRIDGE_URL, VERDICTS, CONFIDENCE, modelId, cleanSources, validateClaims };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InTruthProtocol = api;
})(globalThis);
