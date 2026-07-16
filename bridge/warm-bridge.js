#!/usr/bin/env node
/*
 * InTruth — Warm Bridge for Claude Code
 * ------------------------------------------------------------------
 * A tiny local HTTP server that lets the InTruth browser extension use
 * your Claude *subscription* (via the Claude Code CLI) instead of a paid
 * API key.
 *
 * HOW IT WORKS
 *   Extension  ──POST──▶  this bridge  ──stdin/stdout──▶  claude (CLI)  ──▶  subscription
 *
 * "Warm" = the bridge keeps a small pool of Claude Code processes already
 * spun up and initialized (auth loaded, config parsed, MCP skipped), so the
 * ONLY latency on the request path is the model's own inference — not the
 * ~1-2s cold start of the CLI. Each warm process is used for exactly one
 * request (fresh, independent context) and then replaced by a new spare.
 *
 * The bridge speaks the SAME request/response shape as the Anthropic
 * Messages API, so the extension only has to swap the URL:
 *   IN  : { model, max_tokens, temperature, system, messages:[{role,content}] }
 *   OUT : { content: [ { type:"text", text:"..." } ] }
 *   ERR : { error: { message:"..." } }
 *
 * PREREQUISITES (one time)
 *   1. Install Claude Code and log in once:  claude   (or `claude login`).
 *      The CLI stores your subscription credentials itself; the bridge just
 *      spawns `claude`, which picks them up automatically. No token to manage.
 *   2. node bridge/warm-bridge.js
 *        → on start it does one real round-trip to confirm auth works
 *
 * ENV OVERRIDES (all optional)
 *   BRIDGE_PORT   default 8787
 *   BRIDGE_HOST   default 127.0.0.1
 *   CLAUDE_BIN    default "claude" ("claude.cmd" resolved automatically on win)
 *   POOL_SIZE     default 2   (warm spares kept ready per model)
 *   REQ_TIMEOUT   default 120000 (ms)
 *
 * NOTE: This is a personal / dev tool. It is NOT distributable to other
 * users (they would each need Claude Code + the bridge on their own PC).
 */

'use strict';

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.BRIDGE_PORT || '8787', 10);
const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const POOL_SIZE = parseInt(process.env.POOL_SIZE || '2', 10);
const REQ_TIMEOUT = parseInt(process.env.REQ_TIMEOUT || '120000', 10);
// Startup self-check budget. Must comfortably exceed a cold `claude` launch:
// a single cold round-trip is ~11s, but at boot the pool spawns POOL_SIZE procs
// at once, so under CPU/disk contention the first verify can take much longer.
// This is only the self-check — real requests use REQ_TIMEOUT.
const VERIFY_TIMEOUT = parseInt(process.env.VERIFY_TIMEOUT || '90000', 10);
const IS_WIN = process.platform === 'win32';
// Find the claude binary. On this machine it's an .exe under ~\.local\bin,
// not a .cmd on PATH — so probe the usual spots before falling back to PATH.
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (IS_WIN) {
    const home = process.env.USERPROFILE || os.homedir();
    for (const c of [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude.cmd'),
    ]) {
      try { if (fs.existsSync(c)) return c; } catch (_) {}
    }
    return 'claude.exe'; // last resort: let PATH + shell resolve it
  }
  return 'claude';
}
const CLAUDE_BIN = resolveClaudeBin();
// Only .cmd/.bat shims must go through a shell on Windows; a real .exe is spawned
// directly. Avoiding shell for the .exe silences DEP0190 (args + shell:true) and
// removes the arg-escaping security concern entirely.
const _binExt = path.extname(CLAUDE_BIN).toLowerCase();
const NEEDS_SHELL = IS_WIN && (_binExt === '.cmd' || _binExt === '.bat');
const WORKDIR = os.tmpdir(); // run outside any project → no CLAUDE.md / project MCP

// No token management here: `claude` is already logged in on this machine and
// reads its own stored subscription credentials. The pooled processes inherit
// env: process.env, so they authenticate exactly like `claude` in a terminal.

// Empty MCP config so --strict-mcp-config loads *nothing* (faster init, no plugins).
// Must include an (empty) "mcpServers" record — claude rejects a bare "{}".
const EMPTY_MCP = path.join(os.tmpdir(), 'intruth-empty-mcp.json');
try { fs.writeFileSync(EMPTY_MCP, '{"mcpServers":{}}'); } catch (_) {}

// Track every temp file we create so it gets removed when node exits.
// (WORKDIR is the OS temp *dir* used as cwd — never delete that, only our files.)
const TEMP_FILES = [EMPTY_MCP];
let _cleanedUp = false;
function cleanupTempFiles() {
  if (_cleanedUp) return;
  _cleanedUp = true;
  for (const f of TEMP_FILES) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}
// Runs on any normal or explicit exit; unlinkSync is safe in an 'exit' handler.
process.on('exit', cleanupTempFiles);

// Map whatever the extension sends to a Claude Code model alias.
function mapModel(m) {
  const s = String(m || '').toLowerCase();
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('sonnet')) return 'sonnet';
  if (s.includes('opus')) return 'opus';
  return 'haiku';
}

// ── Warm process ──────────────────────────────────────────────────────────────
function spawnWarm(model) {
  const args = [
    '-p',
    '--model', model,
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',                       // required by stream-json output in print mode
    '--dangerously-skip-permissions',  // non-interactive: never prompt
    '--strict-mcp-config',
    '--mcp-config', EMPTY_MCP,          // load no MCP servers → fast, clean
  ];

  const child = spawn(CLAUDE_BIN, args, {
    cwd: WORKDIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: NEEDS_SHELL,   // only .cmd/.bat shims need a shell; .exe spawns directly
    env: process.env,
  });

  const proc = { child, model, dead: false, pending: null };
  proc.ready = new Promise((resolve, reject) => {
    proc._resolveReady = resolve;
    proc._rejectReady = reject;
  });

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch (_) { continue; }
      if (ev.type === 'system' && ev.subtype === 'init') {
        proc._resolveReady();
      } else if (ev.type === 'result') {
        if (proc.pending) {
          const p = proc.pending; proc.pending = null;
          if (ev.is_error) p.reject(new Error(ev.result || ev.error || 'claude error'));
          else p.resolve(String(ev.result != null ? ev.result : ''));
        }
      }
    }
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString('utf8'); if (stderr.length > 4000) stderr = stderr.slice(-4000); });

  const fail = (err) => {
    proc.dead = true;
    proc._rejectReady(err);
    if (proc.pending) { const p = proc.pending; proc.pending = null; p.reject(err); }
  };
  child.on('exit', (code) => {
    if (code === 0 && !proc.pending) { proc.dead = true; return; }
    fail(new Error(`claude exited (code ${code}). ${stderr.slice(-600)}`));
  });
  child.on('error', (err) => {
    fail(new Error(`failed to launch "${CLAUDE_BIN}": ${err.message}. Is Claude Code installed and on PATH?`));
  });

  return proc;
}

// Send one user turn, read one result, then let the process exit (single use).
function ask(proc, text) {
  return new Promise((resolve, reject) => {
    proc.pending = { resolve, reject };
    const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n';
    try {
      proc.child.stdin.write(msg);
      proc.child.stdin.end(); // no more turns → claude answers then exits
    } catch (e) {
      proc.pending = null;
      reject(e);
    }
  });
}

// ── Warm pool ──────────────────────────────────────────────────────────────────
const pools = Object.create(null); // model → [proc,...]

function ensurePool(model) {
  const arr = (pools[model] = pools[model] || []);
  while (arr.length < POOL_SIZE) {
    const proc = spawnWarm(model);
    arr.push(proc);
    proc.ready.catch(() => {
      const i = arr.indexOf(proc);
      if (i >= 0) arr.splice(i, 1);
    });
  }
}

async function getWarm(model) {
  ensurePool(model);
  const arr = pools[model];
  const proc = arr.shift();     // take a spare (synchronous, atomic)
  ensurePool(model);            // refill in the background
  await proc.ready;             // usually already initialized
  return proc;
}

// ── One-shot invocation ─────────────────────────────────────────────────────
// Each request spawns its own short-lived `claude -p` (no persistent session).
// This SUPERSEDES the warm pool above: the pooled stream-json session hangs on
// the claude-mem `SessionStart` hook, which never completes in a persistent
// process. `--setting-sources project` skips USER settings (where enabledPlugins
// lives) so that hook never loads — while auth still comes from the keychain,
// which is read independently of settings. Run many of these in parallel.
function spawnOneShot(model, text) {
  const args = [
    '-p', text,
    '--model', model,
    '--output-format', 'json',        // one JSON object: { result, is_error, ... }
    '--dangerously-skip-permissions', // non-interactive: never prompt
    '--setting-sources', 'project',   // skip user settings → no claude-mem hook (it hangs);
                                       // auth (keychain) loads independently → login still works.
                                       // cwd is tmpdir → no project settings either → minimal init.
    '--strict-mcp-config',
    '--mcp-config', EMPTY_MCP,         // load no MCP servers → fast, clean
  ];
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
        cwd: WORKDIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: NEEDS_SHELL,   // only .cmd/.bat shims need a shell; .exe spawns directly
        env: process.env,     // inherit stored subscription credentials
      });
    } catch (e) { return reject(e); }
    let stdout = '', stderr = '';
    try { child.stdin.end(); } catch (_) {}  // empty stdin + EOF → prompt comes from -p, no hang
    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch (_) {}
      if (parsed && parsed.is_error === false && typeof parsed.result === 'string') {
        return resolve(parsed.result);
      }
      const detail = (parsed && parsed.result) || stderr.trim() || `claude exited with code ${code}`;
      reject(new Error(detail));
    });
  });
}

async function runOnce(model, text, retry = 1) {
  try {
    return await spawnOneShot(model, text);
  } catch (e) {
    // Retrying an auth failure just fails again the same way — don't waste a round-trip.
    if (retry > 0 && !looksLikeAuthError((e && e.message) || e)) {
      return runOnce(model, text, retry - 1);
    }
    throw e;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`request timed out after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); },
                 (e) => { clearTimeout(t); reject(e); });
  });
}

// Extract the user text from an Anthropic-style messages array.
function extractUser(messages) {
  if (!Array.isArray(messages)) return '';
  const last = [...messages].reverse().find((m) => m.role === 'user') || messages[messages.length - 1];
  if (!last) return '';
  const c = last.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p.text || '')).join('\n');
  return '';
}

// ── HTTP server ────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url.startsWith('/health')) {
    const counts = {};
    for (const k of Object.keys(pools)) counts[k] = pools[k].length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, warm: counts }));
    return;
  }

  if (req.method !== 'POST') { res.writeHead(404); res.end('not found'); return; }

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
  req.on('end', async () => {
    const t0 = Date.now();
    try {
      const payload = JSON.parse(body || '{}');
      const model = mapModel(payload.model);
      const system = payload.system || '';
      const user = extractUser(payload.messages);
      // System prompt is folded into the turn because the warm pool is generic
      // (per-request system prompts can't be pre-bound to a pooled process).
      const text = (system ? system + '\n\n---\n\n' : '') + user;

      const result = await withTimeout(runOnce(model, text), REQ_TIMEOUT);
      // Strip code fences the same way the extension does downstream (harmless).
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: result }] }));
      log(`${model}  ${Date.now() - t0}ms  ${result.length}c`);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' }); // extension expects 200 + {error}
      res.end(JSON.stringify({ error: { message: String((e && e.message) || e) } }));
      log(`ERROR  ${Date.now() - t0}ms  ${(e && e.message) || e}`);
    }
  });
});

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

// ── Startup / self-check ──────────────────────────────────────────────────────
const SCRIPT = path.relative(process.cwd(), __filename) || __filename;

function looksLikeAuthError(m) {
  return /401|403|unauthor|forbidden|expired|invalid[_\s-]*token|token[_\s-]*invalid|authenticat|not\s+logged|setup-token|api[_\s-]*key|oauth|credential/i
    .test(String(m || ''));
}

// One tiny real round-trip through the pool to confirm auth actually works.
async function bootstrap() {
  log('Verifying Claude authentication…');
  try {
    const reply = await withTimeout(runOnce('haiku', 'Reply with exactly: OK'), VERIFY_TIMEOUT);
    log(`✓ Auth OK — Claude replied "${reply.trim().slice(0, 20)}". Ready.`);
  } catch (e) {
    const m = (e && e.message) || String(e);
    if (looksLikeAuthError(m)) {
      log('✗ Claude auth FAILED — `claude` is not logged in on this machine.');
      log('   Log in once in a terminal:  claude   (or `claude login`), then restart the bridge.');
    } else if (/timed out/i.test(m)) {
      log(`⚠ Warm-up self-check timed out after ${VERIFY_TIMEOUT}ms (auth looks fine).`);
      log('   The bridge is UP and serving; real requests use REQ_TIMEOUT. Cold start is just slow —');
      log('   raise VERIFY_TIMEOUT if this keeps happening, or run `claude` once to warm the CLI cache.');
    } else {
      log('✗ Claude check FAILED (not an auth error): ' + m);
      log('   Auth looks fine — this is likely a network or CLI issue.');
    }
  }
}

const [CMD] = process.argv.slice(2);

if (CMD === 'check' || CMD === 'verify') {
  withTimeout(runOnce('haiku', 'Reply with exactly: OK'), VERIFY_TIMEOUT)
    .then((r) => { console.log('✓ Auth OK — Claude replied:', r.trim()); process.exit(0); })
    .catch((e) => {
      console.error('✗ Auth FAILED:', (e && e.message) || e);
      console.error('  Make sure `claude` is logged in:  claude   (or `claude login`).');
      process.exit(1);
    });
} else {
  server.listen(PORT, HOST, () => {
    log(`InTruth warm bridge listening on http://${HOST}:${PORT}`);
    log(`claude bin: ${CLAUDE_BIN}   mode: one-shot -p (parallel)   cwd: ${WORKDIR}`);
    bootstrap(); // verify auth works
  });
}

function shutdown(signal) {
  log(`shutting down… (${signal})`);
  for (const k of Object.keys(pools)) for (const p of pools[k]) { try { p.child.kill(); } catch (_) {} }
  cleanupTempFiles();          // remove temp files before we go
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(sig, () => shutdown(sig)); } catch (_) {}
}
