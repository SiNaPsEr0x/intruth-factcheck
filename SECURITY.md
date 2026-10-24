# Security

The maintained configuration is the default `master` branch. The extension and
bridge are a personal, single-user local tool. They are not a remotely exposed
or multi-user inference service. Report suspected vulnerabilities privately to
the repository owner without posting credentials or sensitive transcripts.

## Automated checks

`Check InTruth Codex` runs on pull requests, default-branch pushes, merge queues,
manual dispatch and daily at 03:17 UTC. The final **Security gate** fails if any
required job fails, is skipped or is cancelled.

| Check | Coverage |
| --- | --- |
| OSV-Scanner 2.7.0 | Full npm lockfile, including development/optional packages, and the committed vendor CycloneDX SBOM |
| npm audit | Known advisories for the entire lockfile, all severities |
| CodeQL security-extended | First-party JavaScript and GitHub Actions; SARIF upload plus an explicit findings gate |
| Gitleaks 8.30.1 | All fetched Git history, with fully redacted findings |
| actionlint 1.7.12 / zizmor 1.31.1 | Workflow syntax, shell snippets, permissions, injection patterns and Dependabot configuration |
| Existing project validation | Node 22/24/26, browser/MV3 simulations, vendor rebuild/checksums and portable ZIP packaging |

Actions are pinned to full commit SHAs. Downloaded scanner binaries have pinned
SHA-256 checksums. Installs disable lifecycle scripts. Privileged maintenance
jobs execute only default-branch code, do not restore PR caches and never check
out or execute a pull-request head or download its artifacts.

`security/vendor.cdx.json` records the versions of Transformers, ONNX Web and
ONNX Common shipped in the browser bundle. `npm run security:sbom` regenerates
it; lint and CI reject stale metadata. This SBOM is not a complete provenance
inventory of every component embedded upstream, and model weights themselves
are not audited by these dependency scanners.

Two exact historical Gitleaks fingerprints in `.gitleaksignore` are reviewed
false positives from minified upstream tokenizer expressions (`unk_token`). No
file, directory, secret rule or future vendor update is broadly exempted.
The three inline zizmor exceptions document the privileged metadata-only merge
trigger and installation of an explicitly pinned npm version.

## Repairs and integration

Dependabot checks npm daily and Actions weekly. A seven-day cooldown applies to
routine version updates; security updates follow GitHub's security-update policy.
ONNX Web/Common updates are grouped. Major updates are proposed but never merged
automatically by this repository's handler.

`Security maintenance` also runs daily at 04:43 UTC, after changes to its own
workflow/scripts on `master`, and after a failed default-branch CI scan. It
applies compatible npm lockfile fixes without `--force` or lifecycle scripts,
tests the result and opens/updates `security/npm-audit-fix`. It explicitly
dispatches CI because PRs created with `GITHUB_TOKEN` do not trigger it normally.
The repository must allow Actions to create PRs. No personal access token or
third-party repair service is required. Dependabot security alerts/fixes also
depend on the repository's GitHub security settings; the scheduled npm repair
and normal Dependabot version updates do not rely on claiming those settings
have been enabled through this configuration.

The separate metadata-only merge handler requires:

- An open same-repository PR from Dependabot, or the designated audit-fix bot/branch.
- Verified signatures and matching bot authors on every commit.
- Every expected quality/security job passing in the completed CI run.
- The tested head SHA unchanged, no blocking latest review, and no commits behind the current default branch.
- Only compatible exact npm versions with package metadata/scripts unchanged, a
  lockfile-only repair, or SHA-only updates of the same Action within its major.

The merge API is given the tested SHA. CI is explicitly dispatched again after
merging. GitHub branch protections and required approvals are respected; the
handler never uses an admin bypass. Conflicts, missing fixes, scanner outages,
new CodeQL findings, major upgrades and coordinated vendor rebuilds stop
integration. Automatic dependency repair does not rewrite arbitrary application
logic or rotate an exposed secret. Code findings require validated patches.

## Source review and validation — 2026-10-24

Reviewed the loopback bridge, subprocess invocation/cancellation, request and
output limits, shared protocol, extension manifest, messaging/session lifecycle,
model pipeline, popup, overlay/export escaping, vendor/build/package scripts,
tests and CI. The bridge continues to bind to IPv4 loopback, rejects webpage
Origins/rebinding Host values, and launches Codex without a shell in an ephemeral
read-only session. Local processes and unpinned extension origins remain in its
trusted boundary. `INTRUTH_EXTENSION_ID` can restrict browser extension origins;
it is not authentication against other processes running as the same user.

Hardened the shared protocol to reject nonstring model identifiers instead of
silently substituting the default, and to copy only the eight allowed claim
fields. Model output can no longer smuggle internal UI/session control
properties through a spread operation. Regression tests cover this boundary and
the merge handler's refusal paths. Portable source ZIPs now include the complete
`.github` configuration.

Initial local checks: the original 17 tests and lint passed, npm audit reported
zero known vulnerabilities; OSV also found no known vulnerabilities in the
lockfile/vendor SBOM. CodeQL subsequently identified four issues: two imprecise assertions in the
browser smoke test, first-occurrence-only PURL encoding, and the output file's
separate size-check/read sequence. The assertions now inspect the parsed DOM,
PURL components use URI encoding, and a bounded stream enforces the output limit
on bytes actually read. No CodeQL rule was disabled to clear these findings.
Expanded validation is recorded in docs/VALIDATION.md.
No exploitable high/critical source issue was established by this review.
This is a scoped source review, not proof that the program has no vulnerabilities.

Real `gpt-6-luna` inference and native web-search probes passed with the current
login on 2026-10-24. Real user-gesture audio capture, hardware WebGPU, Windows and
macOS remain separate runtime checks. CI's Codex responses are simulated; each
installation still needs to verify its own account/model access. Model-generated verdicts, sources, transcripts and downloaded model weights
still require appropriate human review.
