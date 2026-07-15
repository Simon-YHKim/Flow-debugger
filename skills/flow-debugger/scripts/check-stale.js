// flow-debugger: is this map still true?
//
// A map that cannot tell you it is stale will eventually lie to you — and this tool's whole
// claim is that it does not lie. So the map carries a fingerprint of the evidence it was built
// from (the commit, and the content hash of every file it anchored into), and this script
// answers the only question that matters, with a number rather than an opinion:
//
//     what changed under this map since it was made?
//
// Put it in CI. If an anchored file changed and the map did not, the map is drifting and the
// bug reports it generates are handing out coordinates that used to be right.
//
// usage:
//   node check-stale.js <graph.json> <appRoot> [--strict] [--quiet]
//     --strict   exit 1 when stale (use in CI / a pre-commit hook)
const fs = require('fs');
const F = require('./lib/fingerprint');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (const v of argv) { if (v.startsWith('--')) flags[v.slice(2)] = true; else pos.push(v); }
if (pos.length < 2) {
  console.error('usage: node check-stale.js <graph.json> <appRoot> [--strict]');
  process.exit(2);
}
const [graphPath, appRoot] = pos;

let graph;
try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
catch (e) { console.error('cannot read graph: ' + e.message); process.exit(2); }

// the fingerprint lives beside the graph
const fpPath = graphPath.replace(/\.json$/, '') + '.fingerprint.json';
if (!fs.existsSync(fpPath)) {
  console.error('NO FINGERPRINT: ' + fpPath);
  console.error('This map cannot tell you whether it is stale — which means you cannot trust it.');
  console.error('Rebuild it (build.js writes the fingerprint), or run:');
  console.error('  node -e "const F=require(\'./scripts/lib/fingerprint\'),fs=require(\'fs\');' +
                'fs.writeFileSync(\'' + fpPath.replace(/\\/g, '/') + '\',JSON.stringify(F.fingerprint(' +
                'JSON.parse(fs.readFileSync(\'' + graphPath.replace(/\\/g, '/') + '\',\'utf8\')),\'' +
                appRoot.replace(/\\/g, '/') + '\'),null,2))"');
  process.exit(flags.strict ? 1 : 2);
}
const fp = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
const r = F.checkStale(fp, appRoot);

if (!flags.quiet) {
  const c = fp.counts || {};
  console.log('map: ' + (c.screens || '?') + ' screens · ' + (c.actions || '?') + ' actions · anchored into ' +
              (c.anchoredFiles || '?') + ' files');
  if (fp.git) console.log('built from: ' + String(fp.git.head).slice(0, 8) +
    (fp.git.branch ? ' (' + fp.git.branch + ')' : '') + (fp.git.dirty ? ' + uncommitted changes' : '') +
    (fp.git.describedAt ? '  ' + fp.git.describedAt.slice(0, 16) : ''));
  if (r.now) console.log('now:        ' + String(r.now).slice(0, 8) +
    (r.commitsBehind ? '   (' + r.commitsBehind + ' commit(s) later)' : r.sameCommit ? '   (same commit)' : ''));
  console.log('');

  if (!r.stale) {
    console.log('FRESH — every file this map anchors into is byte-identical to when it was built.');
  } else {
    console.log('STALE — ' + (r.changed.length + r.gone.length) + ' of ' + (c.anchoredFiles || '?') +
                ' anchored file(s) changed since this map was built.');
    console.log('The coordinates it hands out may now point at the wrong lines.\n');
    if (r.changed.length) {
      console.log('CHANGED (' + r.changed.length + (r.changed.length > 20 ? ', first 20' : '') + '):');
      r.changed.slice(0, 20).forEach(f => console.log('  ' + f));
    }
    if (r.gone.length) {
      console.log('GONE (' + r.gone.length + '):');
      r.gone.slice(0, 20).forEach(f => console.log('  ' + f));
    }
    console.log('\nRebuild:  node scripts/verify-anchors.js "' + graphPath + '" "' + appRoot + '" --fix "' + graphPath + '"');
    console.log('          node scripts/build.js ... --app-root "' + appRoot + '"');
    console.log('          node scripts/make-handoff.js ...');
    console.log('If the anchors moved a lot, RESCAN those screens (references/scan-prompts.md).');

    // Which SCREENS do these changed files back? Their thumbnails are now stale too —
    // a fresh skeleton with an old picture reads as "nothing changed". Point at exactly
    // the screens to re-shoot, so /flow-update can re-capture only those (--only), cheaply.
    try {
      const screens = Array.isArray(graph.screens) ? graph.screens : [];
      const changedSet = new Set(r.changed.map(f => String(f).replace(/\\/g, '/')));
      const fileOf = a => String(a || '').split(':')[0].replace(/\\/g, '/').trim();
      const affected = [];
      for (const s of screens) {
        if (!s.route) continue;
        const files = [s.rendersInProduction, s.renders]
          .concat((s.actions || []).flatMap(a => [a.file, a.impl]))
          .map(fileOf).filter(Boolean);
        if (files.some(f => changedSet.has(f))) affected.push(s.route);
      }
      const uniq = [...new Set(affected)];
      if (uniq.length) {
        console.log('\nTHUMBNAILS likely stale — ' + uniq.length +
                    ' screen(s) whose source changed (their picture no longer matches):');
        console.log('  ' + uniq.slice(0, 20).join(' ') + (uniq.length > 20 ? ' …' : ''));
        console.log('Re-shoot ONLY those (needs a running web build):');
        console.log('  node scripts/capture-shots.js "' + graphPath + '" <baseUrl> <outDir> --only ' +
                    uniq.slice(0, 20).join(','));
        console.log('  node scripts/embed-shots.js <outDir>/shots-map.json <shots.json>   # then rebuild');
      }
    } catch (e) { /* thumbnail hint is best-effort; never let it break the stale check */ }
  }
}

if (flags.strict && r.stale) process.exit(1);
