/* Shared extension-only helper. Credentials stay in the local Codex process. */
(function (root) {
  'use strict';
  const URL_BASE = root.InTruthProtocol.BRIDGE_URL;
  let wakeup;
  async function wake() {
    if (!wakeup) wakeup = (async () => {
      try { await chrome.runtime.sendNativeMessage('com.intruth.codex', { type: 'START_BRIDGE' }); }
      catch { /* Existing manually-started bridges remain supported. */ }
    })();
    await wakeup;
  }
  async function health() {
    await wake();
    const response = await fetch(URL_BASE + '/health', { signal: AbortSignal.timeout(35000) });
    const result = await response.json();
    if (!response.ok || result.service !== 'intruth-codex' || result.protocol !== 2) throw new Error('InTruth helper unavailable.');
    return result;
  }
  async function signIn() {
    await wake();
    const response = await fetch(URL_BASE + '/v1/auth/login', {
      method: 'POST', headers: { 'X-InTruth-Client': 'extension-v2' }, signal: AbortSignal.timeout(35000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error('Unable to start Codex sign-in. Update or restart the InTruth helper.');
    return result;
  }
  function officialLoginUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password ||
        !['auth.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected login address.');
    return url.href;
  }
  let signingIn;
  async function openSignIn(retry = false) {
    if (signingIn) return signingIn;
    signingIn = (async () => {
      const result = await signIn();
      if (result.state === 'pending' && result.authUrl && result.loginId) {
        const url = officialLoginUrl(result.authUrl);
        const previous = await chrome.storage.session.get('intruthLoginAttempt');
        if (retry || previous.intruthLoginAttempt !== result.loginId) {
          await chrome.storage.session.set({ intruthLoginAttempt: result.loginId });
          await chrome.tabs.create({ url });
        }
      }
      return { state: result.state, ready: result.ready };
    })().finally(() => { signingIn = null; });
    return signingIn;
  }
  root.InTruthConnection = { wake, health, openSignIn, officialLoginUrl };
})(globalThis);
