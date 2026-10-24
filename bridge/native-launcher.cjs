#!/usr/bin/env node
'use strict';
// Native messaging starts only the pinned loopback bridge, never arbitrary commands.
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const { extensionId } = require('./native-config.cjs');
async function ping() {
  return new Promise(resolve => {
    const request = http.get('http://127.0.0.1:8787/ping', { timeout: 800 }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; if (body.length > 4096) response.destroy(); });
      response.on('end', () => { try { const data = JSON.parse(body); resolve(data.service === 'intruth-codex' && data.protocol === 2); } catch { resolve(false); } });
      response.on('error', () => resolve(false));
    });
    request.on('error', () => resolve(false)); request.on('timeout', () => { request.destroy(); resolve(false); });
  });
}
async function ensureBridge(origin) {
  if (typeof origin !== 'string' || origin.replace(/\/$/, '') !== `chrome-extension://${extensionId()}`) throw new Error('Unauthorized extension.');
  if (await ping()) return;
  const child = spawn(process.execPath, [path.join(__dirname, 'codex-bridge.js')], {
    shell: false, detached: true, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, BRIDGE_PORT: '8787', INTRUTH_EXTENSION_ID: extensionId() }, cwd: path.resolve(__dirname, '..'),
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await ping()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('InTruth helper did not start. Run the installer again.');
}
function frame(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  if (os.endianness() === 'LE') header.writeUInt32LE(bytes.length); else header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}
async function main() {
  const origin = process.argv[2];
  let buffer = Buffer.alloc(0), expected, done = false;
  const timer = setTimeout(() => process.stdin.destroy(new Error('Native request timed out.')), 20000);
  timer.unref();
  for await (const chunk of process.stdin) {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 8196) throw new Error('Native message too large.');
    if (expected === undefined && buffer.length >= 4) {
      expected = os.endianness() === 'LE' ? buffer.readUInt32LE() : buffer.readUInt32BE();
      if (!expected || expected > 8192) throw new Error('Invalid native message length.');
    }
    if (expected !== undefined && buffer.length >= expected + 4) {
      if (done || buffer.length !== expected + 4) throw new Error('Unexpected native message.');
      const request = JSON.parse(buffer.subarray(4).toString('utf8'));
      if (request?.type !== 'START_BRIDGE' || Object.keys(request).length !== 1) throw new Error('Unsupported native request.');
      done = true;
      try { await ensureBridge(origin); process.stdout.write(frame({ ok: true })); }
      catch { process.stdout.write(frame({ ok: false, error: 'Install or update the InTruth local helper.' })); }
      clearTimeout(timer);
      break;
    }
  }
}
module.exports = { frame, ping, ensureBridge };
if (require.main === module) main().catch(() => { process.stdout.write(frame({ ok: false, error: 'Invalid native request.' })); process.exitCode = 1; });
