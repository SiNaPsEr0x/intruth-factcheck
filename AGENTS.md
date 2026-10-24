# InTruth development with Codex

This repository contains a Chrome Manifest V3 extension and a local Node.js bridge.
Read README.md and docs/ARCHITECTURE.md before changing runtime behavior.

- Prefer Node.js 26.12.1 stable or 24.22.1 LTS and npm 12.2.1. Run `npm ci` for
  pinned CLI/build/browser tools. The bridge itself uses Node built-ins only.
- Use only stable package releases; do not ship upstream prerelease ORT builds.
  Rebuild the web bundle with `npm run vendor` and keep checksums/lockfile aligned.
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
  `npm run test:browser` and `npm run test:native` for popup/overlay/export
  changes after installing Chromium with the pinned JavaScript Playwright.
  They need a free local port 8787.
  `npm run test:whisper` tests real ASR/translation and needs model-download access.
- `npm run verify` sends a real inference request using the current Codex login.
  Offline tests and browser simulations do not establish live model access.
- Preserve LICENSE and the author attribution in NOTICE.md.
