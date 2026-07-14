// flow-debugger: a map that cannot tell you it is stale will eventually lie to you.
//
// Every claim this tool makes is a claim about source code at a moment in time. The moment the
// app changes, the map starts drifting — silently. The bug report keeps handing out file:line
// coordinates that used to be right. The handoff keeps saying "this screen renders X" after
// someone moved it. Nothing in the artifact knows.
//
// This is the same discipline the anchor tiers enforce, turned on the map itself: **say what
// you actually checked, and when.** A fingerprint records the exact evidence the map was built
// from — the commit, and the content hash of every file it anchored into. `check-stale.js` then
// answers one question with a number, not an opinion: what changed under this map?
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const A = require('./anchors');

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function gitInfo(appRoot) {
  const run = (...args) => {
    try {
      return execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) { return null; }
  };
  const head = run('rev-parse', 'HEAD');
  if (!head) return null;
  return {
    head,
    branch: run('rev-parse', '--abbrev-ref', 'HEAD'),
    dirty: !!run('status', '--porcelain'),
    describedAt: run('log', '-1', '--format=%cI', 'HEAD'),
  };
}

// Every file the map points into. These are exactly the files whose change can make the map wrong.
function anchoredFiles(graph, appRoot) {
  const out = new Set();
  const take = raw => {
    if (!raw) return;
    const v = A.validateAnchor(raw, appRoot, {});
    if (v && v.ok && v.rel) out.add(v.rel);
  };
  for (const s of (graph || [])) {
    take(s.renders);
    for (const a of (s.actions || [])) { take(a.file); take(a.impl); take(a.renders); }
  }
  return [...out].sort();
}

// -> {git, files:{rel: hash}, counts, at}
// `at` is passed in (not read from the clock) so a caller can keep it deterministic.
function fingerprint(graph, appRoot, at) {
  const files = {};
  for (const rel of anchoredFiles(graph, appRoot)) {
    try { files[rel] = sha(fs.readFileSync(path.join(appRoot, rel), 'utf8').replace(/\r\n/g, '\n')); }
    catch (e) { files[rel] = 'MISSING'; }
  }
  return {
    git: gitInfo(appRoot),
    at: at || null,
    counts: {
      screens: (graph || []).length,
      actions: (graph || []).reduce((n, s) => n + ((s.actions || []).length), 0),
      anchoredFiles: Object.keys(files).length,
    },
    files,
  };
}

// What changed under the map since it was built?
// -> {stale, changed:[], gone:[], added:[], commitsBehind:number|null, sameCommit:bool}
function checkStale(fp, appRoot) {
  const changed = [], gone = [];
  for (const [rel, was] of Object.entries((fp && fp.files) || {})) {
    let now;
    try { now = sha(fs.readFileSync(path.join(appRoot, rel), 'utf8').replace(/\r\n/g, '\n')); }
    catch (e) { gone.push(rel); continue; }
    if (now !== was) changed.push(rel);
  }
  const nowGit = gitInfo(appRoot);
  let commitsBehind = null, sameCommit = null;
  if (fp && fp.git && fp.git.head && nowGit && nowGit.head) {
    sameCommit = fp.git.head === nowGit.head;
    if (!sameCommit) {
      try {
        const n = execFileSync('git', ['rev-list', '--count', `${fp.git.head}..HEAD`],
          { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        commitsBehind = parseInt(n, 10);
      } catch (e) { commitsBehind = null; }
    } else commitsBehind = 0;
  }
  return {
    stale: changed.length > 0 || gone.length > 0,
    changed, gone, commitsBehind, sameCommit,
    builtFrom: fp && fp.git ? fp.git.head : null,
    now: nowGit ? nowGit.head : null,
  };
}

module.exports = { fingerprint, checkStale, anchoredFiles, gitInfo, sha };
