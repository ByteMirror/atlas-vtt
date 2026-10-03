#!/usr/bin/env node

/**
 * Trusted half of the `/review` workflow. It prepares a read-only snapshot of a
 * pull request for the reviewer and publishes the reviewer's verdict. It never
 * runs code from the pull request: files are read as git objects, so checkout
 * hooks, filters and export attributes do not apply.
 *
 *   node scripts/pr-review.js schema
 *   node scripts/pr-review.js prepare <pr> <dir>
 *   node scripts/pr-review.js publish <dir> <result.json>
 *   node scripts/pr-review.js fail <dir>
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONTEXT = 'atlas/pr-review';
const MAX_SNAPSHOT_BYTES = 300 * 1024 * 1024;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const SEVERITIES = ['blocker', 'warning', 'suggestion'];
const ICONS = { blocker: '🔴', warning: '🟡', suggestion: '🟢' };

const TEXT = { type: 'string', minLength: 1, maxLength: 1500 };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'findings', 'checked'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'BLOCKED'] },
    checked: { type: 'string', minLength: 1, maxLength: 2000 },
    findings: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'path', 'line', 'problem', 'scenario', 'fix'],
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          path: { type: 'string' },
          line: { type: 'integer', minimum: 1 },
          problem: TEXT,
          scenario: TEXT,
          fix: TEXT,
        },
      },
    },
  },
};

function sameKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join() === [...keys].sort().join();
}

function isText(value, max) {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

/**
 * Rejects anything but a verdict whose findings point at changed lines and agree
 * with it. `changedLines` maps each changed path to its line count.
 * @param {unknown} result
 * @param {Record<string, number>} changedLines
 * @returns {{verdict: string, checked: string, findings: Array<Record<string, any>>}}
 */
function validateResult(result, changedLines) {
  if (!sameKeys(result, ['verdict', 'findings', 'checked'])) throw new Error('Missing or unexpected result fields');
  if (result.verdict !== 'PASS' && result.verdict !== 'BLOCKED') throw new Error('No explicit verdict');
  if (!isText(result.checked, 2000)) throw new Error('Missing review scope');
  const findings = result.findings;
  if (!Array.isArray(findings) || findings.length > 5) throw new Error('Invalid findings');
  for (const finding of findings) {
    if (!sameKeys(finding, ['severity', 'path', 'line', 'problem', 'scenario', 'fix'])) throw new Error('Malformed finding');
    if (!SEVERITIES.includes(finding.severity)) throw new Error('Unknown severity');
    const lines = Object.hasOwn(changedLines, finding.path) ? changedLines[finding.path] : 0;
    if (!Number.isInteger(finding.line) || finding.line < 1 || finding.line > lines) {
      throw new Error('Finding does not reference a changed file and valid line');
    }
    if (!['problem', 'scenario', 'fix'].every((key) => isText(finding[key], 1500))) throw new Error('Finding lacks concrete evidence');
  }
  if ((result.verdict === 'BLOCKED') !== findings.some((f) => f.severity === 'blocker')) throw new Error('Verdict contradicts findings');
  if (findings.filter((f) => f.severity === 'suggestion').length > 2) throw new Error('Too many suggestions');
  return result;
}

/**
 * @param {string} head
 * @param {string} base
 * @param {{verdict: string, checked: string, findings: Array<Record<string, any>>}} result
 * @returns {string}
 */
function reviewBody(head, base, result) {
  const lines = [`Reviewed head: ${head}`, `Reviewed base: ${base}`, '<!-- atlas-review:v1 -->', '', '**Automated Atlas review**', ''];
  for (const f of result.findings) {
    lines.push(`- \`${f.path}:${f.line}\` — ${ICONS[f.severity]} ${f.problem} Scenario: ${f.scenario} Fix: ${f.fix}`);
  }
  if (result.findings.length === 0) lines.push('No findings.');
  lines.push('', `Checked: ${result.checked}`, '',
    'Source inspection only. Test and build results are reported by Plugin CI.',
    'This review does not approve, modify, merge or release the PR.', '',
    `<!-- atlas-verdict:${result.verdict} -->`);
  return lines.join('\n');
}

function repository() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('GITHUB_REPOSITORY is not set');
  return repo;
}

function gh(endpoint, payload) {
  const args = ['api', endpoint];
  if (payload) args.push('--method', 'POST', '--input', '-');
  const output = execFileSync('gh', args, { input: payload ? JSON.stringify(payload) : undefined, encoding: 'utf8' });
  return JSON.parse(output);
}

function setStatus(head, state, description, url) {
  gh(`repos/${repository()}/statuses/${head}`, { state, context: CONTEXT, description: description.slice(0, 140), target_url: url });
}

function gitIn(dir) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  return (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-C', dir, ...args],
    { env, maxBuffer: 512 * 1024 * 1024 });
}

function exportRevision(git, revision, target) {
  const entries = [];
  let total = 0;
  for (const entry of git('ls-tree', '-rlz', '--full-tree', revision).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [mode, kind, oid, size] = entry.slice(0, tab).split(/\s+/);
    const name = entry.slice(tab + 1);
    const parts = name.split('/');
    if (path.posix.isAbsolute(name) || parts.some((p) => p === '..' || p === '.git')
        || !['100644', '100755'].includes(mode) || kind !== 'blob') {
      throw new Error('Source contains unsafe paths, links or submodules; review it by hand');
    }
    total += Number(size);
    if (total > MAX_SNAPSHOT_BYTES) throw new Error('Source snapshot exceeds 300 MiB');
    entries.push([parts, oid]);
  }
  for (const [parts, oid] of entries) {
    const dest = path.join(target, ...parts);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, git('cat-file', 'blob', oid));
  }
}

function lineCount(file) {
  const text = fs.readFileSync(file);
  let lines = 0;
  for (const byte of text) if (byte === 10) lines += 1;
  return Math.max(1, lines + (text.length > 0 && text[text.length - 1] !== 10 ? 1 : 0));
}

function prepare(pr, dir) {
  const repo = repository();
  const pull = gh(`repos/${repo}/pulls/${pr}`);
  if (pull.state !== 'open') throw new Error('Only open pull requests are reviewed');
  // A pull request's base.sha is updated lazily; the base branch's tip is the base.
  const job = { pr, head: pull.head.sha, base: baseTip(repo, pull.base.ref), baseRef: pull.base.ref, url: pull.html_url };
  const cache = path.join(dir, 'repo.git');
  fs.mkdirSync(cache, { recursive: true });
  const git = gitIn(cache);
  git('init', '--bare', '-q');
  git('fetch', '-q', '--no-tags', `https://github.com/${repo}.git`,
    `+refs/pull/${pr}/head:refs/atlas/pr`, `+refs/heads/${job.baseRef}:refs/atlas/base`);
  if (git('rev-parse', 'refs/atlas/pr').toString().trim() !== job.head) throw new Error('PR changed during source fetch');
  if (git('rev-parse', 'refs/atlas/base').toString().trim() !== job.base) throw new Error('Base changed during source fetch');
  const mergeBase = git('merge-base', job.head, job.base).toString().trim();
  exportRevision(git, job.head, path.join(dir, 'workspace', 'source'));
  exportRevision(git, mergeBase, path.join(dir, 'workspace', 'before'));
  const diff = git('diff', '--no-ext-diff', '--no-textconv', '--find-renames', mergeBase, job.head);
  if (diff.length > MAX_DIFF_BYTES) throw new Error('Diff exceeds 2 MiB; split the PR or review it by hand');
  fs.writeFileSync(path.join(dir, 'workspace', 'changes.diff'), diff);
  job.changedLines = {};
  for (const name of git('diff', '--name-only', '-z', mergeBase, job.head).toString('utf8').split('\0').filter(Boolean)) {
    const file = ['source', 'before'].map((side) => path.join(dir, 'workspace', side, name)).find((f) => fs.existsSync(f));
    if (file) job.changedLines[name] = lineCount(file);
  }
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job));
  setStatus(job.head, 'pending', 'Automated source review in progress', job.url);
}

function baseTip(repo, ref) {
  return gh(`repos/${repo}/branches/${encodeURIComponent(ref)}`).commit.sha;
}

function readJob(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8'));
}

function unchanged(job) {
  const pull = gh(`repos/${repository()}/pulls/${job.pr}`);
  return pull.state === 'open' && pull.head.sha === job.head && pull.base.ref === job.baseRef
    && baseTip(repository(), job.baseRef) === job.base;
}

function publish(dir, resultFile) {
  const job = readJob(dir);
  const response = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  if (response.is_error || response.subtype !== 'success') throw new Error('Reviewer did not complete successfully');
  const result = validateResult(response.structured_output, job.changedLines);
  if (!unchanged(job)) {
    setStatus(job.head, 'pending', 'PR changed during the review; comment /review again', job.url);
    return;
  }
  const review = gh(`repos/${repository()}/pulls/${job.pr}/reviews`,
    { commit_id: job.head, body: reviewBody(job.head, job.base, result), event: 'COMMENT' });
  setStatus(job.head, result.verdict === 'PASS' ? 'success' : 'failure', `Automated review: ${result.verdict}`, review.html_url);
}

function fail(dir) {
  const file = path.join(dir, 'job.json');
  if (!fs.existsSync(file)) return;
  const job = readJob(dir);
  const run = `${process.env.GITHUB_SERVER_URL}/${repository()}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  setStatus(job.head, 'error', 'Review unavailable; never treated as a pass. Comment /review to retry', run);
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === 'schema') return void process.stdout.write(JSON.stringify(SCHEMA));
  if (command === 'prepare' && /^[1-9]\d*$/.test(args[0] ?? '') && args[1]) return prepare(Number(args[0]), args[1]);
  if (command === 'publish' && args.length === 2) return publish(args[0], args[1]);
  if (command === 'fail' && args.length === 1) return fail(args[0]);
  throw new Error('Usage: pr-review.js schema | prepare <pr> <dir> | publish <dir> <result.json> | fail <dir>');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Model output and git output may contain source; report the reason only.
    console.error(`pr-review: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = { SCHEMA, validateResult, reviewBody };
