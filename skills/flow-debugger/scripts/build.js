// flow-debugger: inject data JSON into the HTML template -> one self-contained file.
//
// usage:
//   node build.js <template.html> <graph.json> [glossary.json] [shots.json] <out.html>
//                 [--app-root <dir>] [--strict-anchors]
//   node build.js --template t.html --graph g.json --glossary gl.json --shots s.json \
//                 --out out.html --app-root E:/2ndB
//
//   --app-root <dir>   verify every code anchor in the graph against the real source
//                      tree and embed the verdicts, so the exported bug report can say
//                      which coordinates are CONFIRMED and which are guesses. Strongly
//                      recommended: an unverified file:line is the one failure mode that
//                      makes this tool worse than useless (the agent "fixes" a file that
//                      production never renders).
//   --strict-anchors   fail the build if any anchor is invalid.
//
// glossary/shots are optional; a missing file becomes {}.
const fs = require('fs');
const path = require('path');
const A = require('./lib/anchors');
const R = require('./lib/reach');
const F = require('./lib/fingerprint');
const BE = require('./lib/backend');

// The delegation index is keyed by route + action. build.js and the template MUST agree
// on this string byte-for-byte; they did not (a stray NUL vs a space), and the warning
// silently never fired in any built HTML. self-test.js now asserts both sides match.
const delegKey = (route, action) => String(route || '') + ' ' + String(action || '');

const argv = process.argv.slice(2);
const named = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v.startsWith('--')) {
    const k = v.slice(2);
    if (k === 'strict-anchors') named[k] = true;
    else named[k] = argv[++i];
  } else pos.push(v);
}

let tpl = named.template, graph = named.graph, out = named.out;
let glossary = named.glossary, shots = named.shots;
const appRoot = named['app-root'];

// Positional form: <tpl> <graph> [glossary] [shots] <out>. Fill ONLY the slots a named flag
// did not already fill. The old code re-destructured every slot whenever any one was missing,
// so `build.js tpl g.json gl.json shots.json --out out.html` overwrote shots.json with the
// built HTML and exited 0 — it destroyed the user's input file.
if (!tpl || !graph || !out) {
  let p;
  if (pos.length >= 5) p = { tpl: pos[0], graph: pos[1], glossary: pos[2], shots: pos[3], out: pos[4] };
  else if (pos.length === 4) p = { tpl: pos[0], graph: pos[1], glossary: pos[2], out: pos[3] };
  else if (pos.length === 3) p = { tpl: pos[0], graph: pos[1], out: pos[2] };
  else {
    console.error('usage: node build.js <template.html> <graph.json> [glossary.json] [shots.json] <out.html> [--app-root <dir>] [--strict-anchors]');
    console.error('   or: node build.js --template t --graph g [--glossary gl] [--shots s] --out o [--app-root dir]');
    process.exit(2);
  }
  tpl = tpl || p.tpl; graph = graph || p.graph; out = out || p.out;
  glossary = glossary || p.glossary; shots = shots || p.shots;
}
if (out === graph || out === glossary || out === shots || out === tpl)
  { console.error('ERROR: the output would overwrite an input file (' + out + '). Refusing.'); process.exit(2); }

const rd = (p, def) => { try { return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : def; } catch (e) { return def; } };
const die = m => { console.error('ERROR: ' + m); process.exit(1); };

// --- read + SHAPE-CHECK the optional inputs ----------------------------------
// The 4-arg positional form is ambiguous: `build.js tpl graph shots out` (the natural
// way to skip the glossary) used to load shots.json into the glossary slot and ship a
// map with zero thumbnails and a glossary full of base64 — silently, exit 0. Check the
// shape instead of trusting the position.
const looksLikeShots = o => {
  const v = Object.values(o);
  return v.length > 0 && v.every(x => typeof x === 'string') &&
         v.some(x => x.startsWith('data:') || /\.(png|jpe?g|webp|gif)$/i.test(x));
};
const looksLikeGlossary = o =>
  Object.keys(o).length === 0 || 'apis' in o || 'ai' in o;

const parseObj = (p, label) => {
  if (!p) return {};
  const t = rd(p, null);
  if (t == null) { console.warn('warn: ' + label + ' not found, using {} -> ' + p); return {}; }
  try { const o = JSON.parse(t); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object'); return o; }
  catch (e) { die(label + ' is not a JSON object (' + p + '): ' + e.message); }
};

const glossaryObj = parseObj(glossary, 'glossary');
const shotsObj = parseObj(shots, 'shots');

if (glossary && looksLikeShots(glossaryObj) && !looksLikeGlossary(glossaryObj)) {
  die('the glossary slot got what looks like a SHOTS file (' + glossary + ').\n' +
      '       Pass both, or use named flags: --glossary <f> --shots <f>.\n' +
      '       (glossary = {"apis":{...},"ai":{...}}, shots = {"/route":"data:image/..."})');
}
if (shots && !looksLikeShots(shotsObj) && Object.keys(shotsObj).length && looksLikeGlossary(shotsObj)) {
  die('the shots slot got what looks like a GLOSSARY file (' + shots + '). Use named flags.');
}

const graphText = fs.readFileSync(graph, 'utf8');
let graphObj;
try { graphObj = JSON.parse(graphText); } catch (e) { die('graph is not valid JSON: ' + e.message); }
if (!Array.isArray(graphObj)) die('graph must be a JSON array of screens');

// --- sidecars ----------------------------------------------------------------
const stackText = rd(graph.replace(/\.json$/, '.stack.txt'), '');
const appName = (rd(graph.replace(/\.json$/, '.appname.txt'), '').trim() || '앱');
const modeRaw = rd(graph.replace(/\.json$/, '.mode.txt'), '').trim();
const mode = ['ui', 'backend', 'cli'].includes(modeRaw) ? modeRaw : 'ui';
// optional hand-authored AI harness (how this app's AI is actually wired end to end).
// Absent -> the page derives an honest harness from the AI calls in the graph itself.
const harnessText = rd(graph.replace(/\.json$/, '.harness.json'), 'null');

// --- ANCHOR AUDIT (the precision gate) ---------------------------------------
// Without this the file:line in the bug report is unverified LLM output. With it the
// report can label each coordinate CONFIRMED / drifted / unverified — and the agent
// knows which ones to trust.
let audit = { checked: false, index: {}, stat: null };
let stamp = null;   // what this map rests on (commit + anchored-file count)
let backend = null; // what is BEHIND the screens: server handlers, tables, RLS
if (appRoot) {
  try { if (!fs.statSync(appRoot).isDirectory()) throw new Error('not a directory'); }
  catch (e) { die('--app-root is not a directory: ' + appRoot); }
  const r = A.validateGraph(graphObj, appRoot, { snap: false });   // report only; never mutate the shipped data
  const s = r.stat;
  // The anchor can be perfectly valid and still send an agent to a body production never
  // renders. Only reading the file catches that, so the verdict travels into the page too.
  const deleg = A.lintDelegation(graphObj, appRoot);
  const delegIndex = {};
  deleg.forEach(d => { delegIndex[delegKey(d.route, d.action)] = d.delegatesTo; });
  // REACHABILITY. A scan once read a screen correctly, saw its save button was a no-op, and
  // told a non-developer "your data is being lost". The route is wrapped in DevOnlyRoute and
  // redirects in production — nobody can reach that button. The code was right and the
  // conclusion was false, because "what does this do" and "can a user get here" are different
  // questions. 4 of that run's 21 bug claims were this. Ask the second question, in a script.
  const gates = R.scanGates(appRoot, graphObj);
  // A map that cannot tell you it is stale will eventually lie to you. Record the exact evidence
  // it was built from — the commit, and the content hash of every file it anchors into — so
  // check-stale.js can answer "what changed under this map?" with a number, not an opinion.
  // What is behind the screen. Without this the "system flow" stops at the tag: a screen calls
  // edge:gemini-proxy and then nothing — what it does, which tables it writes, whether RLS will
  // refuse it, all invisible.
  backend = BE.scanBackend(appRoot, graphObj);
  if (backend.counts.handlers || backend.counts.tables)
    console.log('backend: ' + backend.counts.handlers + ' handler(s) · ' + backend.counts.tables +
                ' table(s) · ' + backend.counts.linked + ' tag(s) linked');
  const fp = F.fingerprint(graphObj, appRoot, new Date().toISOString());
  const fpPath = graph.replace(/.json$/, '') + '.fingerprint.json';
  try { fs.writeFileSync(fpPath, JSON.stringify(fp, null, 2), 'utf8'); } catch (e) { /* read-only dir */ }
  stamp = { git: fp.git, at: fp.at, files: fp.counts.anchoredFiles };
  console.log('fingerprint: ' + (fp.git ? String(fp.git.head).slice(0, 8) + (fp.git.dirty ? '+dirty' : '') : 'no git') +
              ' · ' + fp.counts.anchoredFiles + ' anchored files  -> ' + fpPath);
  audit = { checked: true, index: r.index, stat: s, delegation: delegIndex, gates, appRoot: path.resolve(appRoot) };
  const nGates = Object.keys(gates).length;
  if (nGates) {
    console.warn('  ! GATED SCREENS: ' + nGates + ' screen(s) may not open in production —');
    console.warn('    a "bug" reported there may be invisible to real users. The map marks them.');
    Object.entries(gates).slice(0, 6).forEach(([r2, g]) => console.warn('      ' + r2 + '  [' + g.gate + ']  ' + g.evidence));
  }
  if (deleg.length) {
    console.warn('  ! DELEGATION TRAP: ' + deleg.length + ' anchor(s) land in a file that renders something ELSE');
    console.warn('    in production, and no `renders` is recorded. The report warns on each.');
    [...new Set(deleg.map(d => d.file + ' -> <' + d.delegatesTo + '/>'))].slice(0, 5)
      .forEach(x => console.warn('      ' + x));
  }
  const confirmed = s.exact + s.near + s.resolved + s.fileonly + s.unchecked;
  const broken = s.missing + s.ambiguous + s.range + s.outside + s.unparsable + s.absent + s.prose;
  console.log('anchors: ' + s.total + ' checked · confirmed ' + confirmed + ' · weak ' + s.weak +
              ' · unusable ' + broken + '  (exact ' + s.exact + ', line-recovered ' + s.resolved + ', prose ' + s.prose + ')');
  if (broken || s.weak) {
    console.warn('  ! ' + (broken + s.weak) + ' anchor(s) are wrong, weak, or not locations at all — the report marks each one.');
    console.warn('  ! repair them first:  node verify-anchors.js "' + graph + '" "' + appRoot + '" --fix "' + graph + '"');
  }
  if (named['strict-anchors'] && broken > 0) die(broken + ' unusable anchor(s) (--strict-anchors)');
} else {
  console.warn('warn: no --app-root, so code anchors are NOT verified. The exported bug report will');
  console.warn('      label every coordinate as unverified. Pass --app-root <appdir> to check them.');
}

// --- inject -------------------------------------------------------------------
let html = fs.readFileSync(tpl, 'utf8');
html = html.replace('__GRAPH_JSON__', graphText);
html = html.replace('__GLOSSARY_JSON__', JSON.stringify(glossaryObj));
html = html.replace('__SHOTS_JSON__', JSON.stringify(shotsObj));
html = html.replace('__STACK_JSON__', JSON.stringify(stackText.trim()));
html = html.replace('__HARNESS_JSON__', harnessText.trim() || 'null');
html = html.replace('__ANCHORS_JSON__', JSON.stringify(audit));
html = html.replace('__STAMP_JSON__', JSON.stringify(stamp));
html = html.replace('__BACKEND_JSON__', JSON.stringify(backend));
html = html.split('__APP_NAME__').join(appName);
html = html.split('__MODE__').join(mode);

for (const t of ['__GRAPH_JSON__', '__GLOSSARY_JSON__', '__SHOTS_JSON__', '__STACK_JSON__',
                 '__HARNESS_JSON__', '__ANCHORS_JSON__', '__STAMP_JSON__', '__BACKEND_JSON__',
                 '__APP_NAME__', '__MODE__']) {
  if (html.includes(t)) die('token not replaced: ' + t);
}
fs.writeFileSync(out, html, 'utf8');

// self-verify the embedded script parses (catches data that breaks the page)
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) { try { new Function(m[1]); } catch (e) { die('JS SYNTAX ERROR: ' + e.message); } }
console.log('built ' + out + ' (' + (html.length / 1048576).toFixed(2) + ' MB), JS OK' +
            (audit.checked ? ', anchors verified' : ', anchors UNVERIFIED'));
