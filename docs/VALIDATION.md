# Validation record

Environment: Linux, Node.js 24.19.0, installed Codex CLI 0.163.0.

- `npm test`: **17 passing** offline Node tests cover provider migration, URL/output validation,
  CLI stdin/final-result integration, native-search requirement, model failure,
  deadlines/cancellation, HTTP/CORS/Host/body limits, readiness, concurrency,
  evidence-based verdict changes, missing sources, session isolation and export
  replacement. The CLI used in these tests is a fixture, not a real model.
- `npm run package`: both extension/source ZIPs were created and checked with an independent ZIP reader (entry CRC checks). The source archive includes Codex configuration and CI workflow.
- `npm run lint`: checks non-vendored JavaScript syntax (including the offscreen
  ES module) and required manifest/runtime assets.
- `npm run check`: the installed CLI version and local login status passed.
- `REQ_TIMEOUT=45000 npm run verify`: a real Codex inference was attempted and
  failed because the environment's saved access token could not be refreshed
  after logout/account change. No model response was obtained. Log in locally
  and repeat `npm run verify` before relying on model availability.

The presence of a `gpt-6-luna` default is not proof of public availability or
account entitlement. No other model was substituted after the failed check.

`python tests/browser-smoke.py`: **passed** in Chromium 154.0.8037.57, testing
actual popup/overlay DOM, default model/readiness, independent pending-card
updates, HTML escaping, HTML report download and stop. Chrome extension APIs
and the bridge are simulated. Loading an unpacked extension through the browser
was attempted but rejected by this environment's administrator policy, so native
MV3 registration/tabCapture was not established. No policy was changed.

The audio unit tests also cover retaining new speech while a full rolling window
is being decoded and suppressing decoder output after capture stops.

Still requiring manual end-to-end verification: real tab audio and Whisper
model download/inference on the user's hardware; a working Codex account's Luna
model access; real native web search with the model; Windows/macOS installation,
process-tree termination and platform-specific WebGPU behavior.
