# Stable software baseline — 2026-10-23

Only stable release channels are used. Versions below were checked against npm,
the Node.js release index, GitHub release metadata and Chrome for Testing's
stable channel. No alpha/beta/RC/dev runtime is shipped.

| Component | Approved version | Role |
| --- | --- | --- |
| Node.js Current | 26.12.1 | Latest stable Node; selected by `.nvmrc` / `.node-version` |
| Node.js LTS | 24.22.1 | Latest LTS alternative; CI also covers current 22.x maintenance releases |
| npm | 12.2.1 | Latest stable package manager; recorded in `packageManager` |
| Codex CLI | 0.164.0 | Latest stable CLI; pinned project installation preferred over global CLI |
| Transformers.js | 4.3.1 | Latest stable browser model library |
| ONNX Runtime Web/Common | 1.30.0 | Latest stable paired JavaScript/WASM inference runtime |
| esbuild | 0.28.2 | Latest stable browser bundle builder |
| Playwright | 1.64.1 | Latest stable browser test runner |
| Chrome for Testing | 156.0.8078.47 | Latest stable browser used for local UI, native MV3 and inference tests |
| actions/checkout | 7.0.1 | Latest stable CI checkout action |
| actions/setup-node | 7.1.0 | Latest stable CI Node setup action |
| actions/upload-artifact | 7.0.2 | Latest stable CI artifact action |

The Playwright package may install an earlier patch of the same stable Chrome
major. Set `CHROMIUM_BIN` to a current stable Chrome/Chromium executable to run
against that exact installation. User browsers are not installed or upgraded by
the extension.

## Why the browser bundle is rebuilt

Upstream Transformers.js 4.3.1 is a stable release, but its universal prebuilt
bundle embeds a `1.31.0-dev...` ONNX dependency. Copying that bundle would violate
this repository's stable-only baseline. `npm run vendor` instead downloads the
approved Transformers **web** distribution, verifies its npm SHA-512 integrity,
and bundles its external ORT imports against stable ONNX Runtime Web/Common
1.30.0. It copies the matching JSEP JavaScript/WASM pair and writes SHA-256
checksums to `realtime-factcheck/src/vendor/versions.json`.

Both real Whisper transcription and MarianMT translation were tested with this
combination in the actual unpacked extension on stable Chrome. The old asyncify
assets are removed; do not mix them with the JSEP pair. Builds use exact package
versions and `package-lock.json`. CI rebuilds and compares committed assets.

## Reproduce and check

```sh
npm ci --ignore-scripts
npm run versions
npm outdated
npm run vendor
npm run lint
npm test
npm exec -- playwright install chromium
npm run test:browser
npm run test:native
npm run test:whisper
npm audit
npm run package
```

`versions` rejects prerelease versions in the lockfile and mismatched installed
top-level packages. `outdated` checks the registry's current stable release tags.
The real model test downloads a public JFK speech sample and Whisper-tiny plus
MarianMT weights. It requires Internet access and makes no Codex calls.

Model repositories (`onnx-community/whisper-{tiny,base,small}` and
`Xenova/opus-mt-{en-it,it-en}`) do not have npm-style stable release channels;
the extension retains these published multilingual ONNX models. Their current
repository metadata was checked; this update does not claim a newer Whisper
architecture or replace multilingual transcription with an English-only model.

`gpt-6-luna` remains the requested model ID, with reasoning `low`. A Codex model's
availability is account-specific and is not implied by the CLI's software version.

Sources:

- https://registry.npmjs.org/@huggingface%2ftransformers/latest
- https://registry.npmjs.org/onnxruntime-web/latest
- https://registry.npmjs.org/@openai%2fcodex/latest
- https://registry.npmjs.org/playwright/latest
- https://registry.npmjs.org/esbuild/latest
- https://registry.npmjs.org/npm/latest
- https://nodejs.org/dist/index.json
- https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json
- https://github.com/actions/checkout/releases/latest
- https://github.com/actions/setup-node/releases/latest
- https://github.com/actions/upload-artifact/releases/latest
