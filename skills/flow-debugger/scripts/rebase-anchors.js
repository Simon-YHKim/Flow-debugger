#!/usr/bin/env node
// flow-debugger: move a map's coordinates forward when the code moved under it.
//
// check-stale tells you the map is out of date. Until now the only cure was a full LLM re-scan of
// every touched screen — expensive, and it throws away coordinates that were verified and are
// still correct, just 40 lines lower than they were.
//
// But we know something: the map records the commit it was built from. So for every anchor we can
// read THE ACTUAL LINE OF CODE it pointed at back then, and look for that same line now. A line
// that moved is still the same line.
//
//   src/screens/Home.tsx:1204  ->  at commit 1e41e34 that line was `  const handleSave = async () => {`
//                              ->  today that text sits at line 1187, once, in the same file
//                              ->  the anchor is 1187. Verified, not guessed.
//
// Rules, in order:
//   1. exact text match, unique in the file            -> take it
//   2. exact text match, several                       -> take the one nearest the old line, but
//                                                         only if it is unambiguously nearest
//   3. whitespace-insensitive match, unique            -> take it
//   4. nothing matches                                 -> LEAVE IT and list it. The line was
//                                                         rewritten or deleted; that screen needs a
//                                                         real re-scan, and pretending otherwise is
//                                                         the failure this whole tool exists to stop.
//
// usage: node rebase-anchors.js <graph.json> <appRoot> [--from <commit>] [--out <graph.json>] [--dry]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { findRefs } = require('./lib/anchors');

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; flags[k] = v; }
  else pos.push(argv[i]);
}
const graphPath = pos[0];
const appRoot = pos[1];
if (!graphPath || !appRoot) {
  console.error('usage: node rebase-anchors.js <graph.json> <appRoot> [--from <commit>] [--out <graph.json>] [--dry]');
  process.exit(2);
}
const outPath = (flags.out && flags.out !== true) ? flags.out : graphPath;

// The base commit: what the map was built from. The fingerprint knows. Ask it before guessing.
let base = (flags.from && flags.from !== true) ? flags.from : null;
if (!base) {
  const fpPath = graphPath.replace(/\.json$/, '.fingerprint.json');
  if (fs.existsSync(fpPath)) {
    try { base = JSON.parse(fs.readFileSync(fpPath, 'utf8')).git.head; } catch (e) { /* fall through */ }
  }
}
if (!base) {
  console.error('I do not know which commit this map was built from, so I cannot know what its');
  console.error('coordinates used to point at. Pass --from <commit>, or rebuild the map.');
  process.exit(2);
}

const git = (args) => execFileSync('git', args, { cwd: appRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// A file that was MOVED between the base commit and now is not gone — the anchor should follow it
// to its new home. git already tracked the rename; we just read it out once. oldPath -> newPath.
const renameMap = new Map();
try {
  const out = git(['diff', '-M90%', '--name-status', `${base}`, 'HEAD']);
  for (const line of out.split('\n')) {
    const m = line.match(/^R\d+\t(.+)\t(.+)$/);
    if (m) renameMap.set(m[1].replace(/\\/g, '/'), m[2].replace(/\\/g, '/'));
  }
} catch (e) { /* not a git range we can diff; renames simply won't be followed */ }

const blobCache = new Map();
function oldFile(rel) {
  if (blobCache.has(rel)) return blobCache.get(rel);
  let txt = null;
  try { txt = git(['show', `${base}:${rel}`]).replace(/\r\n/g, '\n').split('\n'); } catch (e) { txt = null; }
  blobCache.set(rel, txt);
  return txt;
}
const nowCache = new Map();
function nowFile(rel) {
  if (nowCache.has(rel)) return nowCache.get(rel);
  let txt = null;
  try { txt = fs.readFileSync(path.join(appRoot, rel), 'utf8').replace(/\r\n/g, '\n').split('\n'); } catch (e) { txt = null; }
  nowCache.set(rel, txt);
  return txt;
}

const norm = s => String(s).replace(/\s+/g, ' ').trim();
const stat = { same: 0, moved: 0, lost: 0, skipped: 0, nofile: 0, renamed: 0 };
const moved = [];
const lost = [];
const renamed = [];

function rebaseRef(raw) {
  const refs = findRefs(raw);
  if (!refs.length) return null;
  const r = refs[0];
  if (!r.path || !r.line) return null;
  r.file = r.path;
  const before = oldFile(r.file);
  // the file may have been renamed since the base commit — if so, read it at its new path
  const newPath = renameMap.get(r.file) || r.file;
  const after = nowFile(newPath);
  if (!before || !after) { stat.nofile++; return null; }

  const renamedTo = (newPath !== r.file) ? newPath : null;
  const oldTxt = before[r.line - 1];
  if (oldTxt == null || !norm(oldTxt)) {
    // blank line: nothing to trace by content. But if the FILE moved, the path is still wrong.
    if (renamedTo) { stat.renamed++; renamed.push(`${r.file} -> ${renamedTo} (line ${r.line} unchanged)`); return raw.replace(r.file, renamedTo); }
    stat.skipped++; return null;
  }

  if (after[r.line - 1] != null && after[r.line - 1] === oldTxt) {
    // the line is exactly where it was. If the file was renamed, follow the path; else nothing to do.
    if (renamedTo) { stat.renamed++; renamed.push(`${r.file} -> ${renamedTo} (line ${r.line} unchanged)`); return raw.replace(r.file, renamedTo); }
    stat.same++; return null;
  }

  const exact = [];
  const loose = [];
  for (let i = 0; i < after.length; i++) {
    if (after[i] === oldTxt) exact.push(i + 1);
    else if (norm(after[i]) === norm(oldTxt)) loose.push(i + 1);
  }
  const pick = (cands) => {
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) {
      const byDist = cands.map(l => [Math.abs(l - r.line), l]).sort((a, b) => a[0] - b[0]);
      // "nearest" only means something when it is CLEARLY nearest. Two candidates equidistant, or
      // a second one almost as close, means the line is boilerplate and we would be flipping a coin.
      if (byDist.length === 1 || byDist[1][0] - byDist[0][0] >= 3) return byDist[0][1];
    }
    return null;
  };
  const hit = pick(exact) || (exact.length ? null : pick(loose));
  if (!hit) {
    stat.lost++;
    lost.push(`${r.file}:${r.line}  ${norm(oldTxt).slice(0, 60)}`);
    return null;
  }
  if (renamedTo) { stat.renamed++; renamed.push(`${r.file}:${r.line} -> ${renamedTo}:${hit}`); }
  else stat.moved++;
  moved.push(`${r.file}:${r.line} -> ${renamedTo ? renamedTo + ':' : ':'}${hit}   ${norm(oldTxt).slice(0, 52)}`);
  // only path+line change — anything else in the field (a symbol tail, a wrapper) stays as it is
  return raw.replace(`${r.file}:${r.line}`, `${newPath}:${hit}`);
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
if (!Array.isArray(graph)) {
  console.error(`이 파일은 스크린맵 그래프(화면 배열)가 아닙니다: ${graphPath}`);
  console.error(`rebase 는 스캔 그래프(screenmap.*.json)에 씁니다 — flow-map.json(조회용 구조)이 아니라.`);
  process.exit(2);
}
for (const s of graph) {
  for (const key of ['renders', 'file', 'impl']) {
    if (typeof s[key] === 'string') { const v = rebaseRef(s[key]); if (v) s[key] = v; }
  }
  for (const a of (s.actions || [])) {
    for (const key of ['file', 'impl']) {
      if (typeof a[key] === 'string') { const v = rebaseRef(a[key]); if (v) a[key] = v; }
    }
  }
}

console.log(`map built at ${base} · rebased onto the working tree`);
console.log(`  unchanged     ${stat.same}\tthe line is still exactly where it was`);
console.log(`  moved         ${stat.moved}\tsame line of code, new line number`);
if (stat.renamed) console.log(`  followed rename ${stat.renamed}\tthe file itself moved; the anchor followed it`);
console.log(`  rewritten     ${stat.lost}\tthe line itself is gone — these need a real re-scan`);
if (stat.skipped) console.log(`  untraceable   ${stat.skipped}\tanchored at a blank line to begin with`);
if (stat.nofile) console.log(`  file gone     ${stat.nofile}`);

if (renamed.length) { console.log('\nfollowed renames:'); renamed.slice(0, 15).forEach(m => console.log('  ' + m)); if (renamed.length > 15) console.log(`  … +${renamed.length - 15}`); }
if (moved.length) { console.log('\nmoved:'); moved.slice(0, 25).forEach(m => console.log('  ' + m)); if (moved.length > 25) console.log(`  … +${moved.length - 25}`); }
if (lost.length) {
  console.log('\nREWRITTEN — I will not guess at these. Re-scan the screens that own them:');
  lost.slice(0, 25).forEach(m => console.log('  ' + m));
  if (lost.length > 25) console.log(`  … +${lost.length - 25}`);
}

if (flags.dry) { console.log('\n--dry: nothing written'); process.exit(0); }
fs.writeFileSync(outPath, JSON.stringify(graph, null, 2), 'utf8');
console.log(`\nrebased graph -> ${outPath}`);
console.log('now run: node scripts/verify-anchors.js ' + path.basename(outPath) + ' <appRoot> --strict');
process.exit(stat.lost ? 1 : 0);
