# InTruth development with Codex

This repository contains a Chrome Manifest V3 extension and a local Node.js bridge.
Read README.md and docs/ARCHITECTURE.md before changing runtime behavior.

- Use Node.js 22 or newer. Runtime and unit tests have no npm dependencies.
- The inference provider is Codex CLI, model `gpt-6-luna`, reasoning `low` by default.
  Pass explicit model IDs unchanged. Do not invent a `latest` or `light` alias.
- Keep authentication in Codex CLI. Never add credentials to extension storage,
  source files, fixtures, logs or archives.
- The bridge must remain loopback-only. Do not enable shell execution or use
  approval/sandbox bypass flags in inference subprocesses.
- Keep the shared protocol, bridge JSON schema and extension contract aligned.
- Preliminary answers may be corrected in either direction by web evidence.
  Missing searches, missing sources and failed verification remain unverified.
- Protect session boundaries: stop cancels queued and running inference, and
  replies from old sessions must never be delivered to a new tab.
- Whisper/ONNX assets are vendored. Do not reformat minified bundles or update
  them independently of their compatible runtime and license notices.
- Run `npm test` and `npm run lint` after runtime changes. Run
  `python tests/browser-smoke.py` for popup/overlay/export changes when Chromium
  and Python Playwright are available. It needs a free local port 8787.
- `npm run verify` sends a real inference request using the current Codex login.
  Offline tests and browser simulations do not establish live model access.
- Preserve LICENSE and the author attribution in NOTICE.md.
