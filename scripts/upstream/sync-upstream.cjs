'use strict';
// Mirrors the upstream creator's branch onto this fork so `master` never drifts.
// The mirror is a pointer move through the GitHub API: no upstream commit is
// checked out, built or executed, and the script itself spawns no subprocess.
const UPSTREAM_REPOSITORY = 'rpanigrahi222/intruth-factcheck';
const UPSTREAM_BRANCH = 'master';
const MIRROR_BRANCH = 'master';
const API = 'https://api.github.com';

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function slug(value, name) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) throw new Error(`${name} must look like owner/repository, got ${JSON.stringify(value)}.`);
  return value;
}

function fullSha(value, name) {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(`${name} must be a full 40-character commit SHA.`);
  return value;
}

async function githubRequest({ token, method = 'GET', path, body }) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'intruth-upstream-mirror',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 404) return { status: 404, data: null };
  if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed: ${response.status} ${await response.text()}`);
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

// Reads the upstream head, then moves the mirror branch to the same commit.
// Every value that reaches a request body is validated; a mismatch after the
// write is an error rather than a silent drift.
async function syncUpstream({ request, log = () => {}, env = {} }) {
  const token = text(env.GITHUB_TOKEN ?? '', 'GITHUB_TOKEN');
  const mirror = slug(text(env.GITHUB_REPOSITORY ?? '', 'GITHUB_REPOSITORY'), 'GITHUB_REPOSITORY');
  const upstream = slug(env.UPSTREAM_REPOSITORY ? text(env.UPSTREAM_REPOSITORY, 'UPSTREAM_REPOSITORY') : UPSTREAM_REPOSITORY, 'UPSTREAM_REPOSITORY');
  const upstreamBranch = env.UPSTREAM_BRANCH ? text(env.UPSTREAM_BRANCH, 'UPSTREAM_BRANCH') : UPSTREAM_BRANCH;
  const mirrorBranch = env.UPSTREAM_MIRROR_BRANCH ? text(env.UPSTREAM_MIRROR_BRANCH, 'UPSTREAM_MIRROR_BRANCH') : MIRROR_BRANCH;
  if (upstream === mirror && upstreamBranch === mirrorBranch) {
    throw new Error('The upstream source and the mirror branch are the same ref; refusing to write.');
  }
  log(`Checking ${upstream}@${upstreamBranch} against ${mirror}@${mirrorBranch}.`);

  const head = await request({ token, path: `/repos/${upstream}/commits/${encodeURIComponent(upstreamBranch)}` });
  if (!head || head.status === 404 || !head.data) throw new Error(`Upstream ${upstream}@${upstreamBranch} is not readable.`);
  const target = fullSha(head.data.sha, 'upstream head');
  const summary = String(head.data.commit?.message ?? '').split('\n')[0].slice(0, 140);

  const current = await request({ token, path: `/repos/${mirror}/branches/${encodeURIComponent(mirrorBranch)}` });
  const previous = current.status === 404 ? null : fullSha(current.data?.commit?.sha, 'mirror head');
  if (previous === target) {
    log(`${mirror}@${mirrorBranch} already matches upstream ${target}. Nothing to do.`);
    return { updated: false, previous, sha: target, upstream, upstreamBranch, mirror, mirrorBranch, summary };
  }

  if (previous === null) {
    log(`Creating ${mirror}@${mirrorBranch} at upstream ${target}.`);
    await request({
      token, method: 'POST', path: `/repos/${mirror}/git/refs`,
      body: { ref: `refs/heads/${mirrorBranch}`, sha: target },
    });
  } else {
    log(`Moving ${mirror}@${mirrorBranch} from ${previous} to upstream ${target}.`);
    await request({
      token, method: 'PATCH', path: `/repos/${mirror}/git/refs/heads/${encodeURIComponent(mirrorBranch)}`,
      body: { sha: target, force: true },
    });
  }

  const verified = await request({ token, path: `/repos/${mirror}/branches/${encodeURIComponent(mirrorBranch)}` });
  const actual = verified.status === 404 ? null : verified.data?.commit?.sha;
  if (actual !== target) throw new Error(`Mirror verification failed: expected ${target}, found ${actual}.`);
  log(`Verified ${mirror}@${mirrorBranch} at ${target} (${summary}).`);
  return { updated: true, previous, sha: target, upstream, upstreamBranch, mirror, mirrorBranch, summary };
}

module.exports = { syncUpstream, githubRequest, UPSTREAM_REPOSITORY, UPSTREAM_BRANCH, MIRROR_BRANCH };

if (require.main === module) {
  syncUpstream({ request: githubRequest, log: message => console.log(message), env: process.env })
    .then(result => {
      const summaryFile = process.env.GITHUB_STEP_SUMMARY;
      if (!summaryFile) return;
      const state = result.updated ? 'updated' : 'already current';
      const line = `Upstream mirror ${state}: \`${result.upstream}@${result.upstreamBranch}\` -> \`${result.mirror}@${result.mirrorBranch}\` at \`${result.sha}\` (${result.summary || 'no message'})\n`;
      require('node:fs').appendFileSync(summaryFile, line);
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
