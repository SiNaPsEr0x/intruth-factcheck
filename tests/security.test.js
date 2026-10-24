'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeManifest, safeActionPatch, compatibleVersion } = require('../scripts/security/merge-updates.cjs');
const { securityFindings } = require('../scripts/security/check-sarif.cjs');
test('automatic manifest updates preserve commands and reject breaking/pre-release upgrades', () => {
  const before = { scripts: { test: 'node --test' }, devDependencies: { tool: '1.2.3' } };
  assert.equal(safeManifest(before, { ...before, devDependencies: { tool: '1.3.0' } }), true);
  assert.equal(safeManifest(before, { ...before, scripts: { test: 'echo bypass' } }), false);
  for (const version of ['2.0.0', '1.3.0-rc.1', 'latest', '^1.3.0', 'https://evil.invalid/tool.tgz']) {
    assert.equal(safeManifest(before, { ...before, devDependencies: { tool: version } }), false);
  }
  assert.equal(safeManifest(before, { ...before, devDependencies: { tool: '1.3.0', extra: '1.0.0' } }), false);
  assert.equal(compatibleVersion('0.164.0', '0.165.0'), false);
  assert.equal(compatibleVersion('0.164.0', '0.164.1'), true);
});
test('automatic action updates allow only SHA replacements of the same action', () => {
  const old = 'a'.repeat(40), next = 'b'.repeat(40);
  const patch = `@@ -1 +1 @@\n-      - uses: actions/checkout@${old} # v7\n+      - uses: actions/checkout@${next} # v7.0.2`;
  assert.equal(safeActionPatch(patch), true);
  assert.equal(safeActionPatch(patch.replace('+' + '      - uses: actions/checkout', '+      - uses: evil/checkout')), false);
  assert.equal(safeActionPatch(patch + '\n+      - run: echo malicious'), false);
  assert.equal(safeActionPatch(patch.replace(next, 'v7')), false);
  assert.equal(safeActionPatch(patch.replace('# v7.0.2', '# v8.0.0')), false);
  assert.equal(safeActionPatch(undefined), false);
});
test('CodeQL security results fail the gate even when a rule uses note severity', () => {
  const report = { version: '2.1.0', runs: [{ tool: { driver: { rules: [{ id: 'security-rule', properties: { tags: ['security'] } }] } },
    results: [{ ruleId: 'security-rule', level: 'note' }] }] };
  assert.equal(securityFindings(report).length, 1);
  assert.throws(() => securityFindings({ version: '2.1.0', runs: [] }));
  assert.throws(() => securityFindings({ version: '2.1.0', runs: [{ tool: {} }] }));
});

function mergeFixture() {
  const sha = 'a'.repeat(40), base = 'b'.repeat(40), bot = 'dependabot[bot]';
  const candidate = { number: 42, user: { login: bot }, draft: false,
    head: { sha, ref: 'dependabot/npm_and_yarn/tool-1.2.4', repo: { full_name: 'owner/repo' } } };
  const pr = { ...candidate, base: { sha: base, ref: 'master' }, mergeable: true, mergeable_state: 'clean' };
  const run = { id: 123, path: '.github/workflows/check.yml', status: 'completed', conclusion: 'success', head_sha: sha };
  const jobs = ['setup-platforms (windows-latest)', 'setup-platforms (macos-latest)', 'check (22)', 'check (24)', 'check (26)', 'browser', 'audit', 'osv / osv-scan',
    'codeql (javascript-typescript)', 'codeql (actions)', 'secrets', 'workflow-security', 'Security gate']
    .map(name => ({ name, conclusion: 'success' }));
  const state = { pr, jobs, behind: 0, commits: [{ author: { login: bot }, commit: { verification: { verified: true } } }],
    files: [{ filename: 'package-lock.json', status: 'modified' }], reviews: [], merged: [], dispatched: [] };
  const list = value => async () => value();
  const response = value => async () => ({ data: value() });
  const github = { paginate: (fn, options) => fn(options), rest: {
    actions: { getWorkflowRun: response(() => run), listJobsForWorkflowRun: list(() => state.jobs),
      createWorkflowDispatch: async options => state.dispatched.push(options) },
    repos: { get: response(() => ({ default_branch: 'master' })),
      getBranch: response(() => ({ commit: { sha: base } })),
      compareCommitsWithBasehead: response(() => ({ status: 'ahead', behind_by: state.behind })),
      getContent: response(() => ({ content: Buffer.from(JSON.stringify({ scripts: { test: 'node --test' } })).toString('base64') })) },
    pulls: { list: list(() => [candidate]), get: response(() => state.pr), listCommits: list(() => state.commits),
      listFiles: list(() => state.files), listReviews: list(() => state.reviews),
      merge: async options => { state.merged.push(options); return { data: { merged: true } }; } },
  } };
  const context = { repo: { owner: 'owner', repo: 'repo' }, payload: { workflow_run: {
    ...run, event: 'pull_request', head_repository: { full_name: 'owner/repo' } } } };
  return { state, github, context, core: { info() {} } };
}
test('automatic merge binds signed bot updates to the tested SHA and reruns default-branch CI', async () => {
  const fixture = mergeFixture();
  await require('../scripts/security/merge-updates.cjs')(fixture);
  assert.equal(fixture.state.merged.length, 1);
  assert.equal(fixture.state.merged[0].sha, fixture.context.payload.workflow_run.head_sha);
  assert.equal(fixture.state.dispatched[0].ref, 'master');
});
test('automatic merge rejects incomplete checks, stale heads, unsigned commits, foreign code and review vetoes', async () => {
  const changes = [
    f => { f.state.jobs.pop(); },
    f => { f.state.jobs[0].conclusion = 'skipped'; },
    f => { f.state.behind = 1; },
    f => { f.state.pr = { ...f.state.pr, head: { ...f.state.pr.head, sha: 'c'.repeat(40) } }; },
    f => { f.state.commits[0].commit.verification.verified = false; },
    f => { f.state.commits[0].author.login = 'another-user'; },
    f => { f.state.files.push({ filename: 'bridge/codex-bridge.js', status: 'modified' }); },
    f => { f.state.reviews.push({ user: { login: 'reviewer' }, state: 'CHANGES_REQUESTED' }); },
    f => { f.context.payload.workflow_run.head_repository.full_name = 'attacker/repo'; },
  ];
  for (const change of changes) {
    const fixture = mergeFixture(); change(fixture);
    await require('../scripts/security/merge-updates.cjs')(fixture);
    assert.equal(fixture.state.merged.length, 0, change.toString());
  }
});
