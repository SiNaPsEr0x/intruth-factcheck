'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const vendor = require('../realtime-factcheck/src/vendor/versions.json');
const lock = require('../package-lock.json');
for (const [name, info] of Object.entries(lock.packages)) {
  if (/(?:^|-)(alpha|beta|rc|dev|next|nightly|canary|preview)(?:[.\d-]|$)/i.test(info.version || '')) {
    throw new Error(`Pre-release dependency is not allowed: ${name}@${info.version}`);
  }
}
for (const [name, expected] of Object.entries(pkg.devDependencies)) {
  const actual = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  if (actual !== expected) throw new Error(`Run npm ci: ${name} is ${actual}, expected ${expected}.`);
}
console.log(JSON.stringify({ policy: 'Stable releases only', node: process.version,
  npm: process.env.npm_config_user_agent?.match(/\bnpm\/([^\s]+)/)?.[1] || 'Run via npm for npm version',
  expectedPackageManager: pkg.packageManager,
  dependencies: pkg.devDependencies, browserRuntime: { transformers: vendor.transformers, onnxruntime: vendor.onnxruntime } }, null, 2));
