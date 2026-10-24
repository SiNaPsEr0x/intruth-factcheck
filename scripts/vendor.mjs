// Rebuild the latest approved stable browser stack. Never use TF's dev ORT dependency.
import { readFile, writeFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const versions = { transformers: '4.3.1', onnxruntime: '1.30.0' };
const approvedIntegrity = 'sha512-5+voSeUCFK6PCKlY15dPhNOKq3/zOTxDN7oC+Wy9dFb1QZ0TSQomZRRy7URRK8YRuUoE9fGMQTTPC5d/pWBJhA==';
const directory = await mkdtemp(path.join(tmpdir(), 'intruth-vendor-'));
const target = path.join(root, 'realtime-factcheck/src/vendor');

function tarEntry(archive, wanted) {
  for (let offset = 0; offset + 512 <= archive.length;) {
    const name = archive.subarray(offset, offset + 100).toString().replace(/\0.*$/, '');
    const size = parseInt(archive.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, '').trim() || '0', 8);
    if (!name) break;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid npm tar archive.');
    if (name === wanted) return archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Missing upstream file: ${wanted}`);
}

try {
  if (!process.env.npm_execpath) throw new Error('Run this command with npm run vendor.');
  const packed = spawnSync(process.execPath, [process.env.npm_execpath, 'pack',
    `@huggingface/transformers@${versions.transformers}`, '--ignore-scripts', '--json', '--pack-destination', directory],
  { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (packed.status !== 0) throw new Error(packed.stderr || 'npm pack failed.');
  const metadata = JSON.parse(packed.stdout);
  // npm 12 keys metadata by package name; older npm returns an array.
  const info = Array.isArray(metadata) ? metadata[0] : metadata['@huggingface/transformers'];
  if (!info?.filename) throw new Error('Unexpected npm pack metadata.');
  const tarball = await readFile(path.join(directory, info.filename));
  const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
  if (integrity !== approvedIntegrity) throw new Error('Upstream Transformers package integrity changed. Review before updating.');
  const archive = gunzipSync(tarball);
  const ortRoot = path.dirname(path.dirname(require.resolve('onnxruntime-web')));
  const ortPackage = path.join(ortRoot, 'package.json');
  const ort = JSON.parse(await readFile(ortPackage));
  if (ort.version !== versions.onnxruntime) throw new Error('ONNX Runtime does not match the approved stable version. Run npm ci.');
  await mkdir(target, { recursive: true });
  // The web distribution leaves ORT external. Bundle against stable 1.30.0
  // rather than the 1.31-dev runtime embedded by upstream's universal bundle.
  await build({ stdin: { contents: tarEntry(archive, 'package/dist/transformers.web.min.js').toString(),
    resolveDir: root, sourcefile: 'transformers.web.min.js', loader: 'js' },
    bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'chrome116',
    outfile: path.join(target, 'transformers.min.js'), legalComments: 'inline',
    banner: { js: `/*! Transformers.js ${versions.transformers} + ONNX Runtime Web ${versions.onnxruntime}; see ../../licenses */` } });
  for (const file of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
    await copyFile(path.join(ortRoot, 'dist', file), path.join(target, file));
  }
  await writeFile(path.join(root, 'realtime-factcheck/licenses/TRANSFORMERS-LICENSE.txt'), tarEntry(archive, 'package/LICENSE'));
  // The ORT npm archive omits LICENSE; retain the upstream MIT copy already checked in.
  await readFile(path.join(root, 'realtime-factcheck/licenses/ONNX-RUNTIME-LICENSE.txt'));
  const files = {};
  for (const file of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
    files[file] = createHash('sha256').update(await readFile(path.join(target, file))).digest('hex');
  }
  await writeFile(path.join(target, 'versions.json'), JSON.stringify({ ...versions, transformerPackageIntegrity: integrity,
    policy: 'Stable releases only; web bundle rebuilt against stable ONNX Runtime.', files }, null, 2) + '\n');
  for (const old of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) await rm(path.join(target, old), { force: true });
  console.log(`Vendored Transformers.js ${versions.transformers} + stable ONNX Runtime ${versions.onnxruntime}.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
