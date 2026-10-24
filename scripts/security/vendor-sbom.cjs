'use strict';
// These packages are shipped inside the browser bundle, outside npm's lockfile.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const vendor = require('../../realtime-factcheck/src/vendor/versions.json');
const packages = [['@huggingface/transformers', vendor.transformers],
  ['onnxruntime-web', vendor.onnxruntime], ['onnxruntime-common', vendor.onnxruntime]];
const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6', version: 1,
  components: packages.map(([name, version]) => ({ type: 'library', name, version,
    purl: `pkg:npm/${name.split('/').map(encodeURIComponent).join('/')}@${version}` })) };
const content = JSON.stringify(sbom, null, 2) + '\n';
const target = path.join(root, 'security/vendor.cdx.json');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content) throw new Error('Vendor SBOM is stale. Run npm run security:sbom.');
  console.log('Vendor SBOM matches the distributed Transformers/ONNX versions.');
} else fs.writeFileSync(target, content);
