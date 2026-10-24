# InTruth Codex upgrade guide

## Automatic setup (2.2.0)

1. Extract the updated project and run `Install-InTruth.cmd` on Windows or
   `Install-InTruth.command` on macOS/Linux once, on the browser's computer.
2. Load or reload the `realtime-factcheck` folder in Chrome.
3. Open InTruth. The local helper starts automatically and reuses the Codex
   session. If sign-in is required, complete it on the official ChatGPT page;
   the popup becomes ready automatically.

The extension's stable ID is `ihohghmjebpjjlehnbdknchigighdlke`. An older unpacked
installation may need to be removed and loaded again, which can reset extension
preferences. Codex credentials remain managed outside the extension. Close a
manually running 2.1 bridge once to release port 8787 before using automatic startup.

Only supported model, transcription, language, recording-date and panel-layout
preferences are retained in extension storage. Model identifiers are passed
exactly as entered; the initial default is `gpt-6-luna` with `low` reasoning.

## Runtime and verification

- Codex CLI is the inference provider, using protocol v2 and schema-validated claims.
- Managed sign-in and token refresh belong to Codex; no credential is pasted into the popup.
- Inference runs in a read-only, ephemeral session with shell, apps, plugins and hooks disabled.
- Native web-search completion and usable sources are required for verified results.
- Failed or missing verification remains UNVERIFIABLE/LOW; evidence can correct any preliminary verdict.
- Concurrency, request/output limits, bounded queues and session-generation checks protect the pipeline.
- Transcript buffering preserves new speech; claim matching retains numbers and Unicode text.
- Reports retain final verdicts and sources, including corrected late results.

The `bridge/warm-bridge.js` entry point remains compatible with manual startup.
Use `npm run check` for local CLI readiness and the explicit `verify` / `verify:web`
commands to test real model and search access. Browser fixtures do not establish
account entitlement. Hardware audio capture and WebGPU need a local check.

## Stable browser stack (2.1.0)

The pinned stack uses Codex CLI 0.164.0, Transformers.js 4.3.1, stable ONNX Runtime
Web/Common 1.30.0, npm 12.2.1 and Playwright 1.64.1. The web bundle is rebuilt
against the stable runtime with verified package integrity, artifact checksums
and matching JavaScript/WASM assets. See SOFTWARE.md and VALIDATION.md.

CI covers Node 22/24/26, Windows/macOS setup, browser/MV3 integration, portable
ZIPs and security scans. The original license and author attribution remain in
LICENSE and NOTICE.md. Supported browsing stays limited to YouTube/Jubilee.
