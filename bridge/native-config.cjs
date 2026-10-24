'use strict';
const { createHash, createPublicKey } = require('node:crypto');
const manifest = require('../realtime-factcheck/manifest.json');
const HOST = 'com.intruth.codex';
function extensionId() {
  const bytes = Buffer.from(manifest.key, 'base64');
  createPublicKey({ key: bytes, type: 'spki', format: 'der' });
  return createHash('sha256').update(bytes).digest('hex').slice(0, 32)
    .split('').map(nibble => String.fromCharCode(97 + parseInt(nibble, 16))).join('');
}
module.exports = { extensionId, HOST };
