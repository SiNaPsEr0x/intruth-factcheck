# Migration from the Claude version

The complete tracked application surface was reviewed: bridge/reproduction code,
MV3 manifest, service worker, offscreen transcription, worklet, popup, overlay,
lexical features, export, styles, vendored assets, README, ignore rules and license.
Vendor bundles were inspected for integration/version and preserved, not audited
line by line or upgraded.

| Before | After |
| --- | --- |
| Anthropic browser API or optional Claude Code bridge | Codex CLI bridge is the only inference path |
| Claude Haiku/Sonnet/Opus | Explicit `gpt-6-luna` default; exact custom IDs supported |
| Browser API-key field and stored key | Codex login; legacy key removed from local extension storage |
| Anthropic Messages request/response emulation | Dedicated InTruth protocol v2 and schema-validated claims |
| Claude `WebSearch`/`WebFetch` flags | Codex native `web_search=live`, with completed search event required |
| Permission bypass and user-specific Windows repro | Read-only inference without shell launch; portable CLI resolver; obsolete repro removed |
| Startup paid inference with optimistic auth messages | Local CLI/login check; separate explicit live `verify` |
| Deduplication lost short numbers and non-Latin text | Unicode/numeric-preserving keys and stricter similarity |
| Unbounded parallel processes | Concurrency/body/output limits and bounded extension queue |
| TRUE answers protected from contrary web evidence | Evidence can correct any preliminary verdict |
| Failed grounding kept preliminary certainty | Failed/missing evidence becomes UNVERIFIABLE/LOW |
| First arbitrary pending card could receive another claim's update | Full original claim key, per-card update, export upsert |
| Pending failures could disappear from reports | Timed-out checks finalize as unverified; late answers update the same log entry |
| Claims could arrive after switching sessions | Generation guards, fetch cancellation, queue rejection |
| Whisper buffer slicing by snapshot length | Absolute sample positions preserve incoming speech under rolling-buffer overflow |
| Implicitly assigning title participant order to speaker IDs | Participant context without claiming audio diarization |
| Upload/update date treated as event date | Optional user recording date; explicit creation metadata only |
| Remote Google Fonts and Anthropic host permission | System font fallback; unnecessary host permissions removed |
| No build/test workflow | Node offline tests, syntax/manifest checks, optional real-Chromium smoke and portable ZIP packaging |

The original `bridge/warm-bridge.js` command remains as a short compatibility
entry point; it invokes the new Codex implementation. Replace old shortcuts with
`npm start` when convenient. Old Claude environment overrides are no longer used.

The original license and author attribution are retained. The extension remains
focused on the originally supported YouTube/Jubilee sites; no all-sites browsing
permission was added.
