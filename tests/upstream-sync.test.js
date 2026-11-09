'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syncUpstream, UPSTREAM_REPOSITORY } = require('../scripts/upstream/sync-upstream.cjs');

const SHA_NEW = 'a'.repeat(40);
const SHA_OLD = 'b'.repeat(40);
const env = {
  GITHUB_TOKEN: 'test-token',
  GITHUB_REPOSITORY: 'owner/fork',
  UPSTREAM_REPOSITORY: UPSTREAM_REPOSITORY,
  UPSTREAM_BRANCH: 'master',
  UPSTREAM_MIRROR_BRANCH: 'master',
};

// Records every request so a test can assert nothing was written.
function fixture({ head = SHA_NEW, mirror = { status: 200, data: { commit: { sha: SHA_OLD } } }, missingMirror = false, afterWrite = SHA_NEW } = {}) {
  const calls = [];
  const request = async ({ method = 'GET', path, body }) => {
    calls.push({ method, path, body });
    if (path.startsWith('/repos/' + UPSTREAM_REPOSITORY + '/commits/')) {
      return { status: 200, data: { sha: head, commit: { message: 'post-eval changes for latency\n\nbody' } } };
    }
    if (path === '/repos/owner/fork/branches/master') {
      return calls.filter(call => call.method !== 'GET').length === 0
        ? (missingMirror ? { status: 404, data: null } : mirror)
        : { status: 200, data: { commit: { sha: afterWrite } } };
    }
    if (path === '/repos/owner/fork/git/refs') return { status: 201, data: {} };
    if (path.startsWith('/repos/owner/fork/git/refs/heads/')) return { status: 200, data: {} };
    throw new Error(`unexpected path ${path}`);
  };
  return { calls, request, writes: () => calls.filter(call => call.method !== 'GET') };
}

test('upstream mirror moves master to the upstream head and verifies it', async () => {
  const f = fixture();
  const result = await syncUpstream({ request: f.request, env });
  assert.equal(result.updated, true);
  assert.equal(result.previous, SHA_OLD);
  assert.equal(result.sha, SHA_NEW);
  const writes = f.writes();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.equal(writes[0].path, '/repos/owner/fork/git/refs/heads/master');
  assert.deepEqual(writes[0].body, { sha: SHA_NEW, force: true });
});

test('upstream mirror is a no-op when the fork already matches', async () => {
  const f = fixture({ mirror: { status: 200, data: { commit: { sha: SHA_NEW } } } });
  const result = await syncUpstream({ request: f.request, env });
  assert.equal(result.updated, false);
  assert.equal(f.writes().length, 0);
});

test('upstream mirror creates the mirror branch when it is missing', async () => {
  const f = fixture({ missingMirror: true });
  const result = await syncUpstream({ request: f.request, env });
  assert.equal(result.updated, true);
  const writes = f.writes();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'POST');
  assert.deepEqual(writes[0].body, { ref: 'refs/heads/master', sha: SHA_NEW });
});

test('upstream mirror fails loudly when the mirror does not land on the upstream SHA', async () => {
  const f = fixture({ afterWrite: SHA_OLD });
  await assert.rejects(() => syncUpstream({ request: f.request, env }), /verification failed/);
});

test('upstream mirror refuses unreadable upstream, invalid SHAs and self-targeting refs', async () => {
  const unreadable = fixture();
  const missing = async ({ path, method = 'GET', body }) => {
    if (path.startsWith('/repos/' + UPSTREAM_REPOSITORY + '/commits/')) return { status: 404, data: null };
    return unreadable.request({ path, method, body });
  };
  await assert.rejects(() => syncUpstream({ request: missing, env }), /not readable/);
  assert.equal(unreadable.writes().length, 0);

  for (const head of ['abc', 'master', 'A'.repeat(40), 'a'.repeat(39)]) {
    const f = fixture({ head });
    await assert.rejects(() => syncUpstream({ request: f.request, env }), /full 40-character commit SHA/);
    assert.equal(f.writes().length, 0);
  }

  const self = fixture();
  await assert.rejects(
    () => syncUpstream({ request: self.request, env: { ...env, GITHUB_REPOSITORY: UPSTREAM_REPOSITORY } }),
    /refusing to write/,
  );
  assert.equal(self.writes().length, 0);

  const noToken = fixture();
  await assert.rejects(() => syncUpstream({ request: noToken.request, env: { ...env, GITHUB_TOKEN: '' } }), /GITHUB_TOKEN/);
  assert.equal(noToken.writes().length, 0);
});

test('upstream mirror never passes an unvalidated repository to a request path', async () => {
  const f = fixture();
  for (const value of ['owner/fork/../../evil', 'owner', '', 'own er/fork']) {
    await assert.rejects(() => syncUpstream({ request: f.request, env: { ...env, GITHUB_REPOSITORY: value } }), /GITHUB_REPOSITORY/);
  }
  assert.equal(f.calls.length, 0);
});
