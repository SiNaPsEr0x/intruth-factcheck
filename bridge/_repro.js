'use strict';
// Faithful repro of spawnWarm + ask from warm-bridge.js, with instrumentation.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe');
const WORKDIR = os.tmpdir();
const EMPTY_MCP = path.join(os.tmpdir(), 'intruth-empty-mcp.json');
fs.writeFileSync(EMPTY_MCP, '{"mcpServers":{}}');

const t0 = Date.now();
const T = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';

const args = [
  '-p',
  '--model', 'haiku',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--strict-mcp-config',
  '--mcp-config', EMPTY_MCP,
];

console.log(T(), 'spawning', CLAUDE_BIN);
const child = spawn(CLAUDE_BIN, args, { cwd: WORKDIR, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });

let buf = '';
let initSeen = false;
let asked = false;
const seen = {};
child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (_) { console.log(T(), 'UNPARSEABLE_LINE len=' + line.length, line.slice(0, 80)); continue; }
    const key = ev.type + '/' + (ev.subtype || '');
    seen[key] = (seen[key] || 0) + 1;
    if (ev.type === 'system' && ev.subtype === 'init') {
      if (!initSeen) {
        initSeen = true;
        console.log(T(), 'INIT seen -> now writing user turn');
        const msg = JSON.stringify({ type: 'user', message: { role: 'user', content: 'Reply with exactly: OK' } }) + '\n';
        try { child.stdin.write(msg); child.stdin.end(); asked = true; console.log(T(), 'wrote+ended stdin'); }
        catch (e) { console.log(T(), 'stdin write ERROR', e.message); }
      }
    } else if (ev.type === 'result') {
      console.log(T(), 'RESULT', 'is_error=' + ev.is_error, 'result=' + JSON.stringify((ev.result || '').slice(0, 60)));
    } else {
      console.log(T(), 'evt', key);
    }
  }
});
let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
child.on('exit', (code) => { console.log(T(), 'EXIT code=' + code); console.log('SEEN=', JSON.stringify(seen)); if (stderr) console.log('STDERR=', stderr.slice(-400)); process.exit(0); });
child.on('error', (e) => { console.log(T(), 'SPAWN_ERROR', e.message); process.exit(1); });

setTimeout(() => { console.log(T(), 'HARD TIMEOUT 55s — initSeen=' + initSeen + ' asked=' + asked); console.log('SEEN=', JSON.stringify(seen)); if (stderr) console.log('STDERR=', stderr.slice(-400)); try { child.kill(); } catch (_) {} process.exit(2); }, 55000);
