# Validation record — version 2.1.0, 2026-10-23

Stable baseline: Node.js **26.12.1**, npm **12.2.1**, Codex CLI **0.164.0**,
Transformers.js **4.3.1**, ONNX Runtime Web/Common **1.30.0**, Playwright
**1.64.1** and Chrome for Testing **156.0.8078.47**, Linux.
Exact sources and the stable-only build policy are in SOFTWARE.md.

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Passed | Lockfile installs the pinned stable dependency graph |
| `npm run versions` / `npm outdated` | Passed / no outdated packages | Installed direct packages match pins; registry stable releases checked; no prereleases in lockfile |
| `npm test` | **17 passed** | CLI adapter, protocol, failure/cancellation, queue/concurrency, evidence updates, audio buffering, session isolation, numeric/Unicode deduplication and export |
| `npm run lint` | Passed | JavaScript/ESM/CJS syntax, manifest assets and vendor SHA-256 checksums |
| `npm run vendor` | Passed | Approved upstream npm SHA-512 verified; web-only Transformers bundled against stable ORT; matching JSEP pair copied |
| `npm run test:browser` | Passed | Actual browser DOM for popup/overlay/export; Chrome APIs and bridge simulated |
| `npm run test:native` | Passed | Actual unpacked MV3 registration, popup, extension storage, local bridge CORS, content scripts, worker pipeline and stop; only Codex CLI responses simulated |
| `npm run test:whisper` | **Passed with real inference** | Actual extension origin and CSP; real Whisper-tiny q8 CPU/WASM transcription and MarianMT en→it translation |
| `npm audit` | **0 reported vulnerabilities** | Registry advisory check for the installed/locked npm dependencies at test time |
| `npm run check` | Passed | Latest CLI executable and local stored-login status; not a live model access guarantee |
| `npm run verify` | **Blocked by authentication** | CLI 0.164.0 reported that this environment's saved token cannot be refreshed after logout/account change; no model reply obtained |

The real inference smoke test processed **176,000 audio samples at 16 kHz**
and recognized the public reference speech as:

> And so my fellow Americans ask not what your country can do for you, ask what
> you can do for your country.

The real translation returned:

> La Terra orbita intorno al Sole.

These two operations completed together in approximately **13 seconds** on this
machine using one WASM thread. This is a sample measurement, not a latency
promise. The tests loaded the packaged JavaScript/WASM files through the real
extension origin, not a remote inference service.

The previous system Chromium could not load an unpacked extension under its
administrator policy. No policy was changed: the new, isolated stable Chrome for
Testing installation used for this update successfully loaded the extension.
The native smoke test uses a temporary browser profile with the explicit CDP
extension-debugging option and deletes that profile afterward.

GitHub Actions is configured for latest maintained Node 22/24/26 patches, npm
12.2.1, a reproducible vendor build comparison, ZIP artifacts and UI/native MV3
browser tests. The network/model-download Whisper test is an explicit local
check, not part of every CI run. CI uses Playwright's bundled stable browser;
local checks above used the latest stable Chrome patch through `CHROMIUM_BIN`.

## Remaining checks requiring the user's local setup

- Run `npm exec -- codex login`, then `npm run verify` and `npm run verify:web`.
  The requested `gpt-6-luna` ID has not produced a real response here. Neither
  its account entitlement nor real native web-search results are established by
  simulated CLI tests. No fallback model was used.
- Start a session from the extension action while a real video is playing.
  User-gesture/activeTab tabCapture behavior and the complete audio→Codex chain
  have not been exercised with a real Codex session in this environment.
- Hardware WebGPU, Windows/macOS CLI installation and process-tree termination
  still need platform-specific checks. Real inference above establishes CPU/WASM
  compatibility, not a test of every GPU or Whisper model size.

Original version 2.0.0's tests and credential failure were retained as historical
context in the PR; this record describes the updated 2.1.0 files and checks.
