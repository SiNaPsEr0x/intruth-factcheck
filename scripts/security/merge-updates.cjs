'use strict';
const assert = require('node:assert/strict');
const WORKFLOW = '.github/workflows/check.yml';
const FIX_BRANCH = 'security/npm-audit-fix';
const BOT = 'dependabot[bot]';
const FIX_BOT = 'github-actions[bot]';
function compatibleVersion(oldVersion, newVersion) {
  const pattern = /^(\d+)\.(\d+)\.(\d+)$/;
  const old = pattern.exec(oldVersion), next = pattern.exec(newVersion);
  if (!old || !next) return false;
  const a = old.slice(1).map(Number), b = next.slice(1).map(Number);
  return a[0] === b[0] && (a[0] !== 0 || a[1] === b[1]) &&
    (b[1] > a[1] || (b[1] === a[1] && b[2] >= a[2]));
}
function safeManifest(before, after) {
  before = structuredClone(before); after = structuredClone(after);
  for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const old = before[kind] || {}, next = after[kind] || {};
    if (Object.keys(old).sort().join('\n') !== Object.keys(next).sort().join('\n')) return false;
    for (const name of Object.keys(old)) {
      if (old[name] !== next[name] && !compatibleVersion(old[name], next[name])) return false;
    }
    delete before[kind]; delete after[kind];
  }
  try { assert.deepEqual(before, after); return true; } catch { return false; }
}
function safeActionPatch(patch) {
  if (typeof patch !== 'string') return false;
  const removed = [], added = [];
  for (const line of patch.split('\n')) {
    if (!/^[+-]/.test(line)) continue;
    const match = /^[-+]\s*(?:-\s*)?uses:\s*([\w./-]+)@[a-f0-9]{40}\s+#\s*v(\d+)(?:[^\n]*)$/.exec(line);
    if (!match) return false;
    (line[0] === '+' ? added : removed).push({ name: match[1], major: match[2] });
  }
  return removed.length > 0 && removed.length === added.length && removed.every((action, index) => action.name === added[index].name && action.major === added[index].major);
}
async function mergeUpdates({ github, context, core }) {
  const { owner, repo } = context.repo;
  const event = context.payload.workflow_run;
  if (!event || event.event === 'push' || !['pull_request', 'workflow_dispatch'].includes(event.event) ||
      event.head_repository?.full_name !== `${owner}/${repo}` || event.conclusion !== 'success') return;
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: event.id });
  if (run.path !== WORKFLOW || run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== event.head_sha) return;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { owner, repo, run_id: run.id, filter: 'latest', per_page: 100 });
  const required = ['check (22)', 'check (24)', 'check (26)', 'browser', 'audit', 'osv / osv-scan',
    'codeql (javascript-typescript)', 'codeql (actions)', 'secrets', 'workflow-security', 'Security gate'];
  if (jobs.some(job => job.conclusion !== 'success') || required.some(name => !jobs.some(job => job.name === name && job.conclusion === 'success'))) {
    core.info('The complete security/quality gate has not passed.'); return;
  }
  const { data: metadata } = await github.rest.repos.get({ owner, repo });
  const baseRef = metadata.default_branch;
  const pulls = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', base: baseRef, per_page: 100 });
  for (const candidate of pulls) {
    if (candidate.head.sha !== run.head_sha || candidate.head.repo?.full_name !== `${owner}/${repo}`) continue;
    const dependabot = candidate.user.login === BOT && candidate.head.ref.startsWith('dependabot/');
    const auditFix = candidate.user.login === FIX_BOT && candidate.head.ref === FIX_BRANCH;
    if ((!dependabot && !auditFix) || candidate.draft) continue;
    const pull_number = candidate.number;
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
    if (pr.head.sha !== run.head_sha || pr.base.ref !== baseRef || !pr.mergeable || pr.mergeable_state !== 'clean') continue;
    const commits = await github.paginate(github.rest.pulls.listCommits, { owner, repo, pull_number, per_page: 100 });
    if (!commits.length || commits.some(commit => commit.author?.login !== pr.user.login || !commit.commit.verification?.verified)) {
      core.info(`PR #${pull_number}: every commit must be signed by its automation bot.`); continue;
    }
    const files = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number, per_page: 100 });
    const npmOnly = files.length > 0 && files.every(file => ['package.json', 'package-lock.json'].includes(file.filename) && file.status === 'modified');
    const actionsOnly = dependabot && files.length > 0 && files.every(file =>
      /^\.github\/workflows\/[\w-]+\.ya?ml$/.test(file.filename) && file.status === 'modified' && safeActionPatch(file.patch));
    if (!npmOnly && !actionsOnly) continue;
    if (auditFix && files.some(file => file.filename !== 'package-lock.json')) continue;
    if (npmOnly) {
      const read = async ref => {
        const { data } = await github.rest.repos.getContent({ owner, repo, path: 'package.json', ref });
        return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
      };
      if (!safeManifest(await read(pr.base.sha), await read(pr.head.sha))) {
        core.info(`PR #${pull_number}: manifest changes or a breaking update require human review.`); continue;
      }
    }
    const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number, per_page: 100 });
    const latest = new Map();
    for (const review of reviews) if (['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) latest.set(review.user.login, review.state);
    if ([...latest.values()].includes('CHANGES_REQUESTED')) continue;
    const { data: current } = await github.rest.repos.getBranch({ owner, repo, branch: baseRef });
    const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${current.commit.sha}...${pr.head.sha}` });
    if (comparison.behind_by !== 0 || comparison.status !== 'ahead') {
      core.info(`PR #${pull_number}: rebase onto the latest ${baseRef} and rerun all checks.`); continue;
    }
    // The SHA precondition prevents merging an untested replacement commit.
    const { data: result } = await github.rest.pulls.merge({ owner, repo, pull_number, sha: run.head_sha, merge_method: 'squash' });
    if (!result.merged) throw new Error(`GitHub refused to merge PR #${pull_number}.`);
    core.info(`Merged verified dependency update PR #${pull_number}.`);
    // GITHUB_TOKEN merges do not trigger push workflows; dispatch the default-branch scan.
    await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: 'check.yml', ref: baseRef });
  }
}
module.exports = mergeUpdates;
module.exports.compatibleVersion = compatibleVersion;
module.exports.safeManifest = safeManifest;
module.exports.safeActionPatch = safeActionPatch;
