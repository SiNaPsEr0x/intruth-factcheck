# Architecture

## Components

| Path | Responsibility |
| --- | --- |
| `realtime-factcheck/manifest.json` | MV3, supported video sites, local bridge and model download permissions |
| `src/offscreen/offscreen-ex.js` | Tab audio, Whisper WebGPU/CPU, interim/final transcripts, optional on-device it/en translation |
| `src/offscreen/pcm-worklet.js` | 16 kHz floating-point audio batches; no provider integration |
| `src/shared/protocol.js` | Model defaults/migration, claim validation, source URL normalization; shared browser/Node contract |
| `src/background/service-worker-ex.js` | Session lifecycle, transcript windows, bounded request queue, preliminary and web passes |
| `src/popup/*` | Model/language/recording-date settings, bridge readiness, Whisper cache management |
| `src/content/overlay.*` | Transcript, pending/final cards, speaker context, resizing/dragging |
| `src/content/session-export.js` | Final verdict log and self-contained HTML report |
| `bridge/codex-bridge.js` | Loopback HTTP server, version/login checks, isolated CLI subprocess lifecycle |
| `bridge/claims.schema.json` | Structured final output contract for Codex |
| `src/vendor/*` | Retained compatible Transformers.js/ONNX runtime assets |

`src/` in this table means `realtime-factcheck/src/`. No build is needed to load
the extension; no npm package is needed to run the bridge.

## Protocol v2

`GET http://127.0.0.1:8787/health` returns:

```json
{"ok":true,"service":"intruth-codex","protocol":2,"model":"gpt-6-luna","inflight":0,"ready":true,"cliVersion":"0.163.0"}
```

`ready` means CLI/version and local login status passed, not that a live model
request succeeded. An unavailable login includes `ready:false` and an `error`.

`POST /v1/factcheck` requires JSON and `X-InTruth-Client: extension-v2`:

```json
{"model":"gpt-6-luna","prompt":"Transcript and context","instructions":"Evaluation rules","webSearch":false}
```

The response contains `claims`, `model`, and `searched`. Claims have the exact
fields specified in the schema. HTTP errors use `{"error":{"message":"..."}}`:
400 invalid input, 403 rejected Host/Origin, 413 body limit, 415 wrong content
headers, 429 concurrency limit, 503 CLI not ready, 502 inference/search failure.
The old Anthropic-shaped `/v1/messages` endpoint is removed.

Native `codex exec --json` events establish whether a web-search item completed;
merely asking the model to search is insufficient. The final response is read
from `--output-last-message`, with `--output-schema` plus local validation.
This proves tool use, not the correctness or provenance of every generated URL.

## Process and session lifecycle

Each request gets a unique temporary directory and fresh ephemeral Codex turn.
Prompts go through stdin; no shell is used for launching commands. Runtime flags
set read-only sandboxing, no interactive approval, disabled shell/plugins/apps/
hooks/multi-agent/browser integration, and `web_search=disabled|live`. Codex
credentials are inherited through its normal login mechanism; they are never
copied into the extension. User configuration is intentionally ignored during
inference to avoid project hooks and custom tools.

The bridge runs at most two subprocesses by default. The extension also limits
parallelism to two, bounds its queue to 16, and prioritizes preliminary analyses.
Each web pass verifies one claim. No automatic retry or model fallback creates
hidden extra requests. Deadlines, disconnects and shutdown cancel subprocesses;
process trees are terminated on supported POSIX/Windows hosts. Windows process
tree handling and native macOS behavior still require platform smoke tests.

The service worker increments a session generation on start/stop, aborts running
fetches, rejects queued work and ignores replies from older generations. Closing
or navigating the active tab ends capture. Overlay cards use the original full
claim as their key, so concurrent updates do not replace unrelated pending cards.
Late answers replace timed-out cards and upsert the export entry.

Audio buffers track absolute sample positions so a full rolling window does not
lose new speech that arrives during inference. A capture generation suppresses
stale transcript results. Real audio quality/latency still needs manual testing.

## Trust boundaries

The server binds only to IPv4 loopback and rejects web page Origins and nonlocal
Host values. Extension Origins can optionally be pinned to a single extension
ID. This is a personal local service, not a multi-user authenticated server.
Transcripts, page titles and search results are untrusted evidence; the prompt
explicitly forbids following their instructions. These controls reduce accidental
execution and exposure but do not certify a complete security isolation boundary.

The recording date is user-supplied or explicit `dateCreated` metadata; upload or
page-update times are not treated as recording dates. Model conclusions require
human source review. Generated source links are limited to credential-free HTTP(S).
