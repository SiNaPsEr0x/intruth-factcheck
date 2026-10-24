#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { HOST, extensionId } = require('../bridge/native-config.cjs');
const root = path.resolve(__dirname, '..');
function destinations(platform = process.platform, home = os.homedir()) {
  if (platform === 'darwin') return ['Google/Chrome', 'Google/ChromeForTesting', 'Chromium', 'Microsoft Edge']
    .map(name => path.join(home, 'Library/Application Support', name, 'NativeMessagingHosts', HOST + '.json'));
  if (platform === 'linux') return ['google-chrome', 'google-chrome-for-testing', 'chromium', 'microsoft-edge']
    .map(name => path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), name, 'NativeMessagingHosts', HOST + '.json'));
  return [];
}
function dataDirectory() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || os.homedir(), 'InTruth');
  return process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/InTruth') : path.join(os.homedir(), '.local/share/intruth');
}
function run(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, shell: false, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error('Setup command failed. See the message above.');
}
async function install({ directory = dataDirectory(), skipDependencies = false, unregister = false } = {}) {
  const files = process.platform === 'win32' ? [path.join(directory, HOST + '.json')] : destinations();
  if (unregister) {
    for (const file of files) await fs.rm(file, { force: true });
    if (process.platform === 'win32') for (const browser of ['Google\\Chrome', 'Chromium', 'Microsoft\\Edge']) {
      spawnSync('reg.exe', ['DELETE', `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${HOST}`, '/f'], { shell: false, windowsHide: true, stdio: 'ignore' });
    }
    console.log('Automatic browser startup removed. Codex credentials were preserved.'); return;
  }
  // Reinstalling a running helper replaces its code only after a graceful stop.
  try { await fetch('http://127.0.0.1:8787/v1/helper/stop', { method: 'POST',
    headers: { Origin: `chrome-extension://${extensionId()}`, 'X-InTruth-Client': 'extension-v2' }, signal: AbortSignal.timeout(1000) }); } catch { /* No existing helper. */ }
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const file of ['package.json', 'package-lock.json', 'LICENSE', 'NOTICE.md', 'realtime-factcheck/manifest.json', 'realtime-factcheck/src/shared/protocol.js']) {
    const target = path.join(directory, file); await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(root, file), target);
  }
  await fs.cp(path.join(root, 'bridge'), path.join(directory, 'bridge'), { recursive: true });
  if (!skipDependencies) {
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js');
    await fs.access(npm);
    run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  }
  const launcher = path.join(directory, process.platform === 'win32' ? 'start-native.cmd' : 'start-native');
  const script = path.join(directory, 'bridge/native-launcher.cjs');
  if (process.platform === 'win32') {
    // Reject metacharacters rather than interpolating them into a command wrapper.
    if (/[\r\n"%!^&|<>]/.test(process.execPath + script)) throw new Error('Choose a Windows installation path without command metacharacters.');
    await fs.writeFile(launcher, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  } else {
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    await fs.writeFile(launcher, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} "$@"\n`, { mode: 0o700 });
    await fs.chmod(launcher, 0o700);
  }
  const manifest = JSON.stringify({ name: HOST, description: 'InTruth automatic local Codex launcher', path: launcher,
    type: 'stdio', allowed_origins: [`chrome-extension://${extensionId()}/`] }, null, 2) + '\n';
  for (const file of files) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, manifest, { mode: 0o600 }); }
  if (process.platform === 'win32') for (const browser of ['Google\\Chrome', 'Chromium', 'Microsoft\\Edge']) {
    run('reg.exe', ['ADD', `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${HOST}`, '/ve', '/t', 'REG_SZ', '/d', files[0], '/f'], directory);
  }
  console.log('InTruth helper installed. Load/reload realtime-factcheck in Chrome and open InTruth.');
  console.log('The browser will start the helper and ask for ChatGPT sign-in only when needed.');
}
module.exports = { destinations, dataDirectory, install };
if (require.main === module) install({ unregister: process.argv.includes('--uninstall') }).catch(error => { console.error(error.message); process.exitCode = 1; });
