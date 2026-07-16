#!/usr/bin/env node
/*
 * InTruth — Local Claude Bridge for Claude Code
 * ------------------------------------------------------------------
 * A tiny local HTTP server that lets the InTruth browser extension use
 * your Claude *subscription* (via the Claude Code CLI) instead of a paid
 * API key.
 *
 * HOW IT WORKS
 *   Extension  ──POST──▶  this bridge  ──▶  claude -p (CLI)  ──▶  subscription
 *
 * Each incoming request spawns its own short-lived `claude -p` process
 * (a "one-shot" invocation with a fresh, independent context) and returns
 * that process's reply. Requests are independent and can run in parallel.
 *
 * (Historical note: an earlier version kept a warm *pool* of persistent
 * Claude Code processes to shave the CLI's cold-start latency. That design
 * was dropped because the pooled stream-json session hangs on a
 * claude-mem `SessionStart` hook that never completes in a persistent
 * process. The one-shot path below is what actually runs.)
 *
 * The bridge speaks the SAME request/response shape as the Anthropic
 * Messages API, so the extension only has to swap the URL:
 *   IN  : { model, max_tokens, temperature, system, messages:[{role,content}], web_search }
 *   OUT : { content: [ { type:"text", text:"..." } ] }
 *   ERR : { error: { message:"..." } }
 *
 *   NOTE: `max_tokens` and `temperature` are accepted but IGNORED — the
 *   `claude -p` CLI does not expose either, so only `model`, `system`, and
 *   the last user message from `messages` are used.
 *
 *   WEB SEARCH: set `web_search: true` (or pass an Anthropic-style `tools`
 *   array containing a web_search tool) to let Claude use its NATIVE
 *   WebSearch/WebFetch tools during the turn — the same mechanism as typing
 *   "cerca con internet" in a normal `claude -p` prompt. When off (default)
 *   those tools are explicitly disallowed so knowledge-only calls stay fast.
 *   This replaces the old external Serper/SerpAPI search entirely.
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
 *   CLAUDE_BIN    default "claude" ("claude.exe" resolved automatically on win)
 *   REQ_TIMEOUT   default 120000 (ms)
 *   VERIFY_TIMEOUT default 90000 (ms, startup self-check only)
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
const REQ_TIMEOUT = parseInt(process.env.REQ_TIMEOUT || '120000', 10);
// Startup self-check budget. Must comfortably exceed a cold `claude` launch:
// the first invocation after boot can be slow under CPU/disk contention.
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
// reads its own stored subscription credentials. The spawned processes inherit
// env: process.env, so they authenticate exactly like `claude` in a terminal.

// Empty MCP config so --strict-mcp-config loads *nothing* (faster init, no plugins).
// Must include an (empty) "mcpServers" record — claude rejects a bare "{}".
const EMPTY_MCP = path.join(os.tmpdir(), 'intruth-empty-mcp.json');
try {
  fs.writeFileSync(EMPTY_MCP, '{"mcpServers":{}}');
} catch (e) {
  // Surface loudly: without this file every request fails with an opaque
  // "--mcp-config: no such file" from claude instead of a clear cause here.
  log(`⚠ could not write empty MCP config at ${EMPTY_MCP}: ${(e && e.message) || e}`);
}

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

// ── One-shot invocation ─────────────────────────────────────────────────────
// Each request spawns its own short-lived `claude -p` (no persistent session).
// `--setting-sources project` skips USER settings (where enabledPlugins lives)
// so the claude-mem `SessionStart` hook — which hangs a persistent session —
// never loads; auth still comes from the keychain, read independently of
// settings. cwd is tmpdir → no project settings either → minimal init.
// Pass an AbortSignal to kill the child early (e.g. on request timeout) so a
// slow/hung `claude` process is reaped instead of orphaned.
// `opts.webSearch` toggles Claude's native WebSearch/WebFetch tools for this
// one call: on → allow them (grounded fact verification); off → disallow them
// (fast, knowledge-only pass). Web search is a BUILT-IN Claude Code tool, not
// an MCP server, so it still works with the empty --mcp-config below.
function spawnOneShot(model, text, signal, opts = {}) {
  const args = [
    '-p', text,
    '--model', model,
    '--output-format', 'json',        // one JSON object: { result, is_error, ... }
    '--dangerously-skip-permissions', // non-interactive: never prompt
    '--setting-sources', 'project',   // skip user settings → no claude-mem hook (it hangs);
                                       // auth (keychain) loads independently → login still works.
    '--strict-mcp-config',
    '--mcp-config', EMPTY_MCP,         // load no MCP servers → fast, clean
    // Gate the native web tools per request. Enabling them lets Claude search
    // the internet itself ("cerca con internet") instead of us handing it
    // pre-fetched Serper snippets; disabling them keeps the fast pass offline.
    opts.webSearch ? '--allowedTools'    : '--disallowedTools',
    'WebSearch,WebFetch',
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

    // Kill the child if the caller aborts (timeout). 'exit' still fires after a
    // kill, so the normal exit handler settles the promise.
    const onAbort = () => { try { child.kill('SIGKILL'); } catch (_) {} };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const cleanupSignal = () => {
      if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) {} }
    };

    let stdout = '', stderr = '';
    try { child.stdin.end(); } catch (_) {}  // empty stdin + EOF → prompt comes from -p, no hang
    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8');
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    child.on('error', (e) => { cleanupSignal(); reject(e); });
    child.on('exit', (code) => {
      cleanupSignal();
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

async function runOnce(model, text, signal, opts = {}, retry = 1) {
  try {
    return await spawnOneShot(model, text, signal, opts);
  } catch (e) {
    // Don't retry once aborted (timeout) or on an auth failure — both just fail
    // again the same way and waste a round-trip.
    if (retry > 0 && !(signal && signal.aborted) && !looksLikeAuthError((e && e.message) || e)) {
      return runOnce(model, text, signal, opts, retry - 1);
    }
    throw e;
  }
}

// Run a one-shot with a hard deadline; on expiry, abort (which kills the child)
// and surface a clean timeout error instead of a "claude exited" message.
async function runWithTimeout(model, text, ms, opts = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  try {
    return await runOnce(model, text, controller.signal, opts);
  } catch (e) {
    if (timedOut) throw new Error(`request timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
let inflight = 0; // requests currently being served (reported by /health)

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mode: 'one-shot', inflight }));
    return;
  }

  if (req.method !== 'POST') { res.writeHead(404); res.end('not found'); return; }

  let body = '';
  let tooLarge = false;
  req.on('data', (c) => {
    body += c;
    if (body.length > 5e6 && !tooLarge) {
      tooLarge = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'request body too large' } }));
      req.destroy();
    }
  });
  req.on('end', async () => {
    if (tooLarge) return; // already responded
    const t0 = Date.now();
    inflight++;
    try {
      const payload = JSON.parse(body || '{}');
      const model = mapModel(payload.model);
      const system = payload.system || '';
      const user = extractUser(payload.messages);
      // System prompt is folded into the user turn because `claude -p` takes a
      // single prompt argument (no separate system channel).
      const text = (system ? system + '\n\n---\n\n' : '') + user;

      // Enable native web search when asked — either an explicit `web_search`
      // flag or an Anthropic-style `tools` array carrying a web_search tool.
      const webSearch = payload.web_search === true ||
        (Array.isArray(payload.tools) &&
          payload.tools.some((tl) => /web[_-]?search/i.test((tl && (tl.type || tl.name)) || '')));

      const result = await runWithTimeout(model, text, REQ_TIMEOUT, { webSearch });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: result }] }));
      log(`${model}${webSearch ? ' +web' : ''}  ${Date.now() - t0}ms  ${result.length}c`);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' }); // extension expects 200 + {error}
      res.end(JSON.stringify({ error: { message: String((e && e.message) || e) } }));
      log(`ERROR  ${Date.now() - t0}ms  ${(e && e.message) || e}`);
    } finally {
      inflight--;
    }
  });
});

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

// ── Startup / self-check ──────────────────────────────────────────────────────
function looksLikeAuthError(m) {
  return /401|403|unauthor|forbidden|expired|invalid[_\s-]*token|token[_\s-]*invalid|authenticat|not\s+logged|setup-token|api[_\s-]*key|oauth|credential/i
    .test(String(m || ''));
}

// One tiny real round-trip to confirm auth actually works.
async function bootstrap() {
  log('Verifying Claude authentication…');
  try {
    const reply = await runWithTimeout('haiku', 'Reply with exactly: OK', VERIFY_TIMEOUT);
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
  runWithTimeout('haiku', 'Reply with exactly: OK', VERIFY_TIMEOUT)
    .then((r) => { console.log('✓ Auth OK — Claude replied:', r.trim()); process.exit(0); })
    .catch((e) => {
      console.error('✗ Auth FAILED:', (e && e.message) || e);
      console.error('  Make sure `claude` is logged in:  claude   (or `claude login`).');
      process.exit(1);
    });
} else {
  server.listen(PORT, HOST, () => {
    log(`InTruth bridge listening on http://${HOST}:${PORT}`);
    log(`claude bin: ${CLAUDE_BIN}   mode: one-shot -p (parallel)   cwd: ${WORKDIR}`);
    bootstrap(); // verify auth works
  });
}

function shutdown(signal) {
  log(`shutting down… (${signal})`);
  cleanupTempFiles();          // remove temp files before we go
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(sig, () => shutdown(sig)); } catch (_) {}
}
