// flow-debugger: verify (and repair) every code anchor in a screenmap against the real
// source tree. This is the step that makes the exported bug report trustworthy.
//
// Without it, the file:line a non-developer hands to a coding agent is unverified model
// output — and a coordinate that points at a legacy file production never renders is
// worse than no coordinate at all: the agent "fixes" it, the build goes green, and the
// screen does not change.
//
// What it does, per anchor: pull the real file out of the text -> resolve a bare filename
// against the tree -> find the line BY the named symbol when the scan gave none -> check
// the line is in range -> confirm the symbol is actually there (snapping a drifted line).
// Prose that was never a location ("loadDomainLevels(userId) — 별 밝기 계산") is moved out
// of the anchor field instead of masquerading as a coordinate.
//
// usage:
//   node verify-anchors.js <graph.json> <appRoot> [--fix <out.json>] [--strict]
//                          [--json <report.json>] [--no-snap] [--quiet]
//     --fix <out>  write the repaired graph (in place is fine: --fix <graph.json>)
//     --strict     exit 1 if any anchor is broken or suspect (CI / pre-release)
const fs = require('fs');
const A = require('./lib/anchors');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v === '--fix' || v === '--json') flags[v.slice(2)] = argv[++i];
  else if (v.startsWith('--')) flags[v.slice(2)] = true;
  else pos.push(v);
}
if (pos.length < 2) {
  console.error('usage: node verify-anchors.js <graph.json> <appRoot> [--fix <out.json>] [--strict] [--json <report.json>] [--no-snap]');
  process.exit(2);
}
const [graphPath, appRoot] = pos;
const snap = !flags['no-snap'];
const quiet = !!flags.quiet;

let graph;
try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
catch (e) { console.error('cannot read graph: ' + e.message); process.exit(2); }
if (!Array.isArray(graph)) { console.error('graph must be a JSON array of screens'); process.exit(2); }
try { if (!fs.statSync(appRoot).isDirectory()) throw 0; }
catch (e) { console.error('appRoot is not a directory: ' + appRoot); process.exit(2); }

const { findings, stat } = A.validateGraph(graph, appRoot, { snap });
const pct = n => stat.total ? ((n / stat.total) * 100).toFixed(1) + '%' : '-';
const weakN = stat.weak || 0;
const trusted = stat.exact + stat.near + stat.resolved + stat.fileonly + stat.unchecked + (stat.weak||0);
const broken = stat.missing + stat.ambiguous + stat.range + stat.outside + stat.unparsable;

if (!quiet) {
  console.log('anchors: ' + stat.total + ' checked against ' + appRoot + '\n');
  console.log('  TRUSTWORTHY      ' + trusted + ' (' + pct(trusted) + ')');
  console.log('    exact          ' + stat.exact + '   the named function is on that line');
  console.log('    snapped        ' + stat.near + '   the line had drifted; moved to the function');
  console.log('    line recovered ' + stat.resolved + '   no line was given; found it by the function name');
  console.log('    file only      ' + stat.fileonly + '   real file, line unknown (honest, still useful)');
  console.log('    unchecked      ' + stat.unchecked + '   file+line real, no function name to compare');
  console.log('    weak           ' + stat.weak + '   real line, but it is blank / an import / a comment');
  console.log('  SUSPECT          ' + stat.absent + ' (' + pct(stat.absent) + ')   file+line real, but the function is NOT there');
  console.log('  NOT A LOCATION   ' + stat.prose + ' (' + pct(stat.prose) + ')   prose in a file:line slot' + (flags.fix ? ' -> moved to a note' : ''));
  console.log('  BROKEN           ' + broken + ' (' + pct(broken) + ')   missing ' + stat.missing +
    ' · ambiguous ' + stat.ambiguous + ' · past EOF ' + stat.range + ' · outside root ' + stat.outside + ' · unparsable ' + stat.unparsable);

  const show = (title, pred, fmt, limit) => {
    const arr = findings.filter(pred); if (!arr.length) return;
    console.log('\n' + title + ' (' + arr.length + (arr.length > (limit || 20) ? ', first ' + (limit || 20) : '') + '):');
    arr.slice(0, limit || 20).forEach(f => console.log('  ' + fmt(f)));
  };
  const at = f => `${f.route}${f.action ? ' :: ' + f.action : ''} .${f.field}`;
  show('WEAK — the line is real but is not code', f => f.status === 'weak',
    f => `${at(f)} = ${f.raw}  — ${f.why}`, 12);
  show('SUSPECT — the anchor may point at the wrong place', f => f.status === 'absent',
    f => `${at(f)} = ${f.raw}\n      ${f.why}`);
  show('BROKEN' + (flags.fix ? ' — dropped in --fix' : ''),
    f => !f.ok && f.status !== 'prose', f => `[${f.status}] ${at(f)} = ${f.raw}  — ${f.why || ''}`);
  show('NOT A LOCATION' + (flags.fix ? ' — moved to <field>Note in --fix' : ''),
    f => f.status === 'prose', f => `${at(f)} = ${String(f.raw).slice(0, 90)}`, 10);
  show('REPAIRED', f => f.ok && f.value && f.value !== f.raw,
    f => `${at(f)}\n      ${String(f.raw).slice(0, 70)}\n      -> ${f.value}   (${f.why})`, 15);
}

// The trap this tool exists to prevent: an anchor into a file that hands off to another
// component. Real file, real line, and editing it changes nothing on screen.
const deleg = A.lintDelegation(graph, appRoot);
if (!quiet && deleg.length) {
  console.log('\nDELEGATION TRAP (' + deleg.length + ') — the anchored file renders something ELSE in production,');
  console.log('and no `renders` is recorded. An agent sent here edits a body the user never sees:');
  deleg.slice(0, 15).forEach(d => console.log(`  ${d.route}${d.action ? ' :: ' + d.action : ''}\n      ${d.file}  ->  delegates to <${d.delegatesTo}/>`));
  console.log('  fix: RESCAN these screens for `renders` (references/scan-prompts.md "RESCAN / PATCH").');
}

if (flags.json) {
  fs.writeFileSync(flags.json, JSON.stringify({ appRoot, stat, findings, delegation: deleg }, null, 2), 'utf8');
  if (!quiet) console.log('\nreport -> ' + flags.json);
}

if (flags.fix) {
  const fixed = JSON.parse(JSON.stringify(graph));
  const r = A.applyVerdicts(fixed, appRoot, { snap });
  fs.writeFileSync(flags.fix, JSON.stringify(fixed, null, 2), 'utf8');
  if (!quiet) {
    console.log('\nrepaired graph -> ' + flags.fix);
    console.log('  ' + r.fixed.length + ' anchor(s) corrected (line found / snapped / path resolved)');
    console.log('  ' + r.moved.length + ' prose "anchor(s)" moved to a note field — they were never locations');
    console.log('  ' + r.dropped.length + ' broken anchor(s) dropped — an empty field beats a wrong one');
  }
}

if (flags.strict && (broken + stat.absent) > 0) {
  console.error('\nSTRICT: ' + broken + ' broken + ' + stat.absent + ' suspect anchor(s). Run --fix, or re-scan those screens.');
  process.exit(1);
}
