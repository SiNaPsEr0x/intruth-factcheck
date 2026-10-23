'use strict';
// Produce portable ZIPs with Node's standard library, including on Windows.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function files(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'dist', '__pycache__'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    const name = prefix + entry.name;
    return entry.isDirectory() ? files(file, name + '/') : [{ file, name }];
  });
}
function zip(entries, target) {
  let offset = 0;
  const records = [], central = [];
  for (const { file, name } of entries) {
    const data = fs.readFileSync(file), compressed = zlib.deflateRawSync(data);
    const filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    local.copy(directory, 8, 6, 30);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    records.push(local, filename, compressed);
    offset += local.length + filename.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(target, Buffer.concat([...records, index, end]));
  console.log(path.relative(root, target));
}
fs.mkdirSync(dist, { recursive: true });
zip([...files(path.join(root, 'realtime-factcheck')), { file: path.join(root, 'LICENSE'), name: 'LICENSE' },
  { file: path.join(root, 'NOTICE.md'), name: 'NOTICE.md' }], path.join(dist, 'intruth-codex-extension.zip'));
zip([...files(root, 'intruth-codex/'),
  { file: path.join(root, '.codex/config.toml'), name: 'intruth-codex/.codex/config.toml' },
  { file: path.join(root, '.gitignore'), name: 'intruth-codex/.gitignore' },
  { file: path.join(root, '.github/workflows/check.yml'), name: 'intruth-codex/.github/workflows/check.yml' }], path.join(dist, 'intruth-codex-source.zip'));
