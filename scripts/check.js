'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let count = 0;
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'dist', 'node_modules', 'vendor', 'fixtures'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.[cm]?js$/.test(entry.name)) {
      // The offscreen document loads this file as an ES module in Chrome.
      const options = file.endsWith('offscreen-ex.js') ? ['--input-type=module', '--check'] : ['--check', file];
      const result = spawnSync(process.execPath, options, {
        input: file.endsWith('offscreen-ex.js') ? fs.readFileSync(file) : undefined, encoding: 'utf8',
      });
      if (result.status !== 0) throw new Error(result.stderr);
      count++;
    }
  }
}
walk(root);
const extension = path.join(root, 'realtime-factcheck');
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
const assets = [manifest.background.service_worker, manifest.action.default_popup,
  ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css]),
  'src/vendor/transformers.min.js', 'src/vendor/ort-wasm-simd-threaded.jsep.mjs',
  'src/vendor/ort-wasm-simd-threaded.jsep.wasm'];
for (const asset of assets) if (!fs.existsSync(path.join(extension, asset))) throw new Error(`Missing extension asset: ${asset}`);
const versions = JSON.parse(fs.readFileSync(path.join(extension, 'src/vendor/versions.json'), 'utf8'));
const { createHash } = require('node:crypto');
for (const [file, expected] of Object.entries(versions.files)) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(extension, 'src/vendor', file))).digest('hex');
  if (actual !== expected) throw new Error(`Vendored runtime checksum mismatch: ${file}`);
}
console.log(`Syntax OK: ${count} JavaScript files. Manifest assets OK.`);
