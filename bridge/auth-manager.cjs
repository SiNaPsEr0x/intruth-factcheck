'use strict';
// The account-only app-server connection owns OAuth. No tokens cross this module.
const { spawn } = require('node:child_process');
const os = require('node:os');
function loginUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !['auth.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected Codex login URL.');
  return url.href;
}
class AuthManager {
  constructor(command, { rpcTimeout = 15000, loginTimeout = 10 * 60 * 1000 } = {}) {
    this.command = command; this.rpcTimeout = rpcTimeout; this.loginTimeout = loginTimeout;
    this.state = { state: 'checking', ready: false, canLogin: true };
    this.pending = new Map(); this.sequence = 0; this.checkedAt = 0; this.early = new Map();
  }
  snapshot() { return { ...this.state }; }
  async connect() {
    if (this.connection) return this.connection;
    this.connection = (async () => {
      const child = this.child = spawn(this.command.bin, [...this.command.prefix,
        'app-server', '--stdio', '-c', 'project_doc_max_bytes=0',
        '-c', 'features.shell_tool=false', '-c', 'features.apps=false', '-c', 'features.plugins=false',
        '-c', 'features.hooks=false', '-c', 'features.multi_agent=false', '-c', 'features.browser_use=false'],
      { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: process.env, cwd: os.tmpdir() });
      let buffer = '';
      const fail = () => {
        if (this.child !== child) return;
        this.child = null; this.connection = null;
        for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Codex authentication service stopped.')); }
        this.pending.clear(); clearTimeout(this.loginTimer);
        this.state = { state: 'error', ready: false, canLogin: true, error: 'Codex authentication service stopped. Retry sign-in.' };
      };
      child.on('error', fail); child.on('close', fail);
      child.stdin.on('error', fail);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        buffer += data;
        if (Buffer.byteLength(buffer) > 1024 * 1024) { child.kill(); fail(); return; }
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (message.id !== undefined && !message.method) {
            const request = this.pending.get(message.id);
            if (!request) continue;
            clearTimeout(request.timer); this.pending.delete(message.id);
            if (message.error) request.reject(new Error('Codex authentication request failed. Retry sign-in.'));
            else request.resolve(message.result);
          } else if (message.method === 'account/login/completed' && message.params?.loginId) {
            if (this.state.loginId === message.params.loginId) this.completed(message.params);
            else { if (this.early.size >= 4) this.early.clear(); this.early.set(message.params.loginId, message.params); }
          } else if (message.method === 'account/updated' && !message.params?.authMode && this.state.state === 'ready') {
            this.state = { state: 'required', ready: false, canLogin: true }; this.checkedAt = 0;
          } else if (message.method && message.id !== undefined) {
            // This connection never approves tools, reads files, or supplies external tokens.
            this.send({ id: message.id, error: { code: -32601, message: 'Unsupported method.' } });
          }
        }
      });
      await this.request('initialize', { clientInfo: { name: 'intruth', title: 'InTruth', version: '2.2.0' }, capabilities: { experimentalApi: false } });
      this.send({ method: 'initialized', params: {} });
    })();
    try { await this.connection; } catch (error) { this.dispose(); throw error; }
  }
  send(message) {
    if (!this.child || this.child.stdin.destroyed) throw new Error('Codex authentication service is unavailable.');
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex authentication timed out. Retry sign-in.')); }, this.rpcTimeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  async status(force = false) {
    if ((!force && this.state.state === 'error') || this.state.state === 'pending' || (!force && Date.now() - this.checkedAt < 15000)) return this.snapshot();
    if (!this.refreshing) this.refreshing = (async () => {
      try {
        await this.connect();
        const result = await this.request('account/read', { refreshToken: true });
        if (result?.requiresOpenaiAuth !== false && !result?.account) this.state = { state: 'required', ready: false, canLogin: true };
        else this.state = { state: 'ready', ready: true, canLogin: true };
        this.checkedAt = Date.now();
      } catch {
        this.state = { state: 'error', ready: false, canLogin: true, error: 'Unable to check Codex access. Retry sign-in.' };
      }
      return this.snapshot();
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async login() {
    if (this.loggingIn) return this.loggingIn;
    this.loggingIn = (async () => {
      const current = await this.status(true);
      if (current.ready || current.state === 'pending') return current;
      await this.connect();
      const result = await this.request('account/login/start', { type: 'chatgpt' });
      if (result?.type !== 'chatgpt' || typeof result.loginId !== 'string') throw new Error('Unexpected Codex sign-in response.');
      let authUrl;
      try { authUrl = loginUrl(result.authUrl); }
      catch (error) { await this.request('account/login/cancel', { loginId: result.loginId }).catch(() => {}); throw error; }
      this.state = { state: 'pending', ready: false, canLogin: true, loginId: result.loginId, authUrl };
      clearTimeout(this.loginTimer);
      this.loginTimer = setTimeout(() => { this.cancel().catch(() => {}); }, this.loginTimeout);
      const completion = this.early.get(result.loginId); this.early.delete(result.loginId);
      if (completion) await this.completed(completion);
      return this.snapshot();
    })().catch(error => {
      this.state = { state: 'error', ready: false, canLogin: true, error: 'Unable to start Codex sign-in. Retry.' }; throw error;
    }).finally(() => { this.loggingIn = null; });
    return this.loggingIn;
  }
  async completed(completion) {
    clearTimeout(this.loginTimer);
    if (!completion.success) {
      this.state = { state: 'error', ready: false, canLogin: true, error: 'Sign-in was cancelled or failed. Retry when ready.' }; return;
    }
    this.state = { state: 'checking', ready: false, canLogin: true };
    this.checkedAt = 0;
    await this.status(true);
  }
  async cancel() {
    const loginId = this.state.loginId;
    clearTimeout(this.loginTimer);
    this.state = { state: 'error', ready: false, canLogin: true, error: 'Sign-in cancelled. Retry when ready.' };
    if (loginId) await this.request('account/login/cancel', { loginId }).catch(() => {});
    return this.snapshot();
  }
  invalidate() { this.checkedAt = 0; this.state = { state: 'required', ready: false, canLogin: true }; }
  dispose() {
    clearTimeout(this.loginTimer);
    const child = this.child; this.child = null; this.connection = null;
    child?.stdin.destroy(); child?.kill();
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('Authentication service closed.')); }
    this.pending.clear();
  }
}
module.exports = { AuthManager, loginUrl };
