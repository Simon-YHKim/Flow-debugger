#!/usr/bin/env node
// Self-test for the thumbnail/stale scripts: stamp-shots.js, flag-changed-screens.js.
// Spawns the real scripts against a temp fixture and asserts behaviour — including the CWD-relative
// path resolution that once made stamp-shots silently overlay nothing. node only, no deps.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const HERE = __dirname;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-shots-'));
const sha16 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const W = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const node = process.execPath;
const run = (script, args, opts = {}) => execFileSync(node, [path.join(HERE, script), ...args], { encoding: 'utf8', ...opts });

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};

// ---- fixture: one screen backed by one source file, a fingerprint, a built-style html ----------
const src = 'src/Screen.tsx';
W(src, 'export default function Screen(){return null}\n');                       // current content
const graph = {
  app: 'Test', generatedFrom: 'screenmap.test.json',
  screens: [
    { route: '/x', rendersInProduction: src + ':1', actions: [] },
    { route: '/y', rendersInProduction: 'src/Other.tsx:1', actions: [] },
  ],
};
W('src/Other.tsx', 'export default function Other(){return null}\n');
const mapPath = W('docs/flow-map.json', JSON.stringify(graph));
// fingerprint records a DIFFERENT hash for the screen file -> it counts as "changed"
W('docs/flow-map.fingerprint.json', JSON.stringify({
  git: { head: 'deadbeefcafe0000' },
  files: { [src]: 'ffffffffffffffff', 'src/Other.tsx': sha16('export default function Other(){return null}\n') },
}));
// built-style html carrying the two constants the scripts splice
const htmlPath = W('docs/flow-debugger.html',
  'X<script>const SHOTS = ({"/x":"data:image/jpeg;base64,OLD","/y":"data:image/jpeg;base64,KEEP"})||{};\n' +
  'const STALE = ({})||{};</script>Y');

// ============================================================ flag-changed-screens
console.log('flag-changed-screens:');
const flagOut = run('flag-changed-screens.js', [mapPath, root, '--stamp', htmlPath]);
eq('detects the changed screen /x', /STALE SCREENS \(1\)/.test(flagOut) && /\/x/.test(flagOut), true);
eq('does NOT flag the unchanged screen /y', /\/y/.test(flagOut.split('STALE SCREENS')[1] || ''), false);
{
  const h = fs.readFileSync(htmlPath, 'utf8');
  const stale = JSON.parse(h.slice(h.indexOf('const STALE = (') + 'const STALE = ('.length, h.indexOf(')||{}', h.indexOf('const STALE = ('))));
  eq('stamps STALE with /x only', Object.keys(stale), ['/x']);
}

// ============================================================ stamp-shots (incl. CWD-relative path)
console.log('stamp-shots:');
// capture-shots writes map paths relative to the CWD it ran in, NOT to the map file. Reproduce that:
W('out/x.png', 'PNGDATA-NEW');
const shotsMap = W('out/shots-map.json', JSON.stringify({ '/x': 'out/x.png' }));   // path is CWD-relative
const stampOut = run('stamp-shots.js', [htmlPath, shotsMap], { cwd: root });        // run FROM the repo root
eq('overlays exactly 1 shot (resolves CWD-relative path)', /overlaid 1 /.test(stampOut), true);
{
  const h = fs.readFileSync(htmlPath, 'utf8');
  const shots = JSON.parse(h.slice(h.indexOf('const SHOTS = (') + 'const SHOTS = ('.length, h.indexOf(')||{}', h.indexOf('const SHOTS = ('))));
  eq('refreshes /x thumbnail', shots['/x'], 'data:image/png;base64,' + Buffer.from('PNGDATA-NEW').toString('base64'));
  eq('preserves the untouched /y thumbnail', shots['/y'], 'data:image/jpeg;base64,KEEP');
}

// ============================================================ motion GIF encoder (lib/gif)
console.log('gif encoder (--motion):');
try {
  const { PNG } = require('pngjs');
  const { encodeGif } = require('./lib/gif');
  const frame = shift => { const p = new PNG({ width: 40, height: 30 }); for (let i = 0; i < 40 * 30; i++) { const o = i * 4; p.data[o] = (i * 3 + shift) % 256; p.data[o + 1] = (i * 5) % 256; p.data[o + 2] = 120; p.data[o + 3] = 255; } return PNG.sync.write(p); };
  const gif = encodeGif([frame(0), frame(80), frame(160)], { width: 40, delay: 200 });
  eq('produces a GIF89a', gif.slice(0, 6).toString('ascii'), 'GIF89a');
  eq('loops (NETSCAPE2.0 app extension)', gif.includes(Buffer.from('NETSCAPE2.0')), true);
  eq('downscales past target width', require('./lib/gif').resizeRGBA(Buffer.alloc(80 * 60 * 4), 80, 60, 40).w, 40);
} catch (e) { eq('gif encoder loads (needs gifenc+pngjs)', String(e.message).split('\n')[0], '<installed>'); }

// ---- teardown ----
try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
