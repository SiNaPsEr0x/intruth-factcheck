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

## Security automation update — 2026-10-24

- **24 tests passed** locally on Node 24.22.1: the original 17 plus claim-field
  isolation, byte-bounded output and five security/merge-policy regression tests.
- Lint, stable-version checks, the vendor rebuild (no artifact/checksum changes),
  both portable ZIPs and their security-configuration contents passed.
- `npm audit`: **0 known vulnerabilities**; OSV-Scanner 2.7.0 scanned 54 lockfile
  packages and three vendor-SBOM entries with **0 known vulnerabilities**.
- Gitleaks 8.30.1 scanned all 25 existing commits. The two historic tokenizer
  false positives are narrowly identified in `.gitleaksignore`; no other secret
  findings remained. actionlint 1.7.12 and offline zizmor 1.31.1 passed.
- GitHub Actions also passed Node 22/24/26 tests and browser/UI plus native MV3
  smoke checks. Local Chrome execution in this session was blocked by the host's
  socket restrictions; browser results come from the hosted GitHub runner.
- Full GitHub security-gate results are linked from PR #7. The first run caught
  a ShellCheck warning in the new aggregate gate; the expression was corrected
  and the entire pipeline was rerun.

CodeQL's first JavaScript scan found four issues. All four were corrected:
DOM-based smoke assertions replace imprecise HTML/URL regex checks, PURL names use
component encoding, and Codex output is read through a byte-bounded stream
instead of a separate pathname size-check/read pair. No CodeQL rule was disabled.

**Live `npm run check`, `npm run verify` and `npm run verify:web` passed** for
`gpt-6-luna` in the current session on 2026-10-24. The last probe requires an
actual native web-search event plus a source-backed schema-valid claim. These
current results supersede the earlier session's expired-login limitation;
other installations must still verify their own account. Hardware WebGPU,
full real-tab audio capture and Windows/macOS validation remain outstanding.
See SECURITY.md for scan scope, automation prerequisites and integration policy.


## Automatic setup/sign-in — 2.2.0, 2026-10-24

The local suite now contains **30 passing tests**, including managed OAuth
readiness, a shared login attempt, cancellation, credential-free extension state,
official URL validation and rejection of unauthorized/credential-body requests.
A real account-only app-server probe reused the current Codex login successfully;
no real account was logged out and no fresh interactive login was forced.

The hosted Chrome smoke uses the actual installed Native Messaging launcher and
loopback bridge. It starts without `npm start`, simulates a missing Codex login,
opens exactly one intercepted official-page URL and automatically enables the
popup after a simulated login-completed event. UI/native MV3 checks also pass.
These tests establish integration behavior, not a real interactive OAuth exchange.

The CI matrix also runs tests, lint and real user-level helper registration and
removal on macOS and Windows. Line endings are pinned with `.gitattributes` so
vendor checksums and POSIX launchers survive Windows checkouts. The Windows
bootstrap's actual PowerShell command is parsed by PowerShell; POSIX bootstrap
syntax and executable source-ZIP attributes are checked. Download digests are
pinned to the official Node 24.22.1 release checksum list.

The exact public extension key exception was tested by inserting a synthetic
secret in the same manifest: that additional finding remains detectable. No
real credential is allowlisted. npm audit/OSV reported no known dependency
vulnerabilities. Complete platform/browser/security results: PR #8 and its checks.
Hardware audio capture/WebGPU still require the user's local environment.
