'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mockRuntime = () => {
  const saved = {}, listeners = [];
  globalThis.__dispatchInTruth = message => listeners.forEach(listener => listener(message));
  globalThis.chrome = {
    storage: { local: {
      get(_keys, callback) { const value = { ...saved }; callback?.(value); return Promise.resolve(value); },
      set(values, callback) { Object.assign(saved, values); callback?.(); return Promise.resolve(); },
      remove(keys) { for (const key of keys) delete saved[key]; return Promise.resolve(); },
    } },
    runtime: {
      getURL: file => location.origin + '/realtime-factcheck/' + file,
      onMessage: { addListener: listener => listeners.push(listener) },
      sendMessage(message, callback) { const result = message.type === 'GET_STATUS' ? { isCapturing: false } : { ok: true }; callback?.(result); return Promise.resolve(result); },
    },
  };
};
async function createServer(port = 8787) {
  const state = { ready: true };
  const server = http.createServer(async (request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, service: 'intruth-codex', protocol: 2, model: 'gpt-6-luna', ready: state.ready }));
      return;
    }
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path.');
      const content = await fs.readFile(file);
      const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.wav': 'audio/wav' };
      const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' };
      if (file.endsWith('offscreen.html')) headers['Content-Security-Policy'] = "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'";
      response.writeHead(200, headers);
      response.end(content);
    } catch { response.writeHead(404); response.end('not found'); }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return { state, base: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
async function launchBrowser() {
  return chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_BIN || undefined,
    args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
  });
}
async function launchNativeExtension({ proxy = false, mockSignIn = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intruth-native-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(directory, {
      headless: true, executablePath: process.env.CHROMIUM_BIN || chromium.executablePath(),
      ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
      ...(proxy && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}),
    });
    if (mockSignIn) await context.route('https://auth.openai.com/authorize?state=fixture', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Simulated official login page</body></html>' }));
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'realtime-factcheck') });
    return { context, id, close: async () => { await context.close(); await fs.rm(directory, { recursive: true, force: true }); } };
  } catch (error) {
    await context?.close(); await fs.rm(directory, { recursive: true, force: true }); throw error;
  }
}
module.exports = { root, createServer, launchBrowser, launchNativeExtension, mockRuntime };
