// flow-debugger: capture one screenshot per route from a locally-running web build.
//
// The thumbnails are how a non-developer recognises a screen — and until now nothing in
// this repo produced them. `embed-shots.js` consumed a `shots-map.json` that a human had
// to make by hand, by a process that was never written down. This is that process.
//
// usage:
//   node capture-shots.js <graph.json> <baseUrl> <outDir>
//        [--base-path /app] [--wait 1200] [--width 390] [--height 844]
//        [--auth-url <url> --email <id> --password <pw>]
//        [--only /route,/route2] [--limit 20] [--jpeg [quality=72]]
//        [--auto-motion [threshold=0.01]]   # AUTO: probe 2 frames/screen; moving screens become GIFs
//        [--motion /route,/route2]          # force these routes to GIF (with --frames/--frame-gap/--gif-width)
//        [--tap "text=탭해서||button:has-text(시작)"]  # intro gates/banners: click these when present, then re-open the route
//        [--retry 1]                        # re-try a route whose capture came out blank/errored
//
// writes  <outDir>/<slug>.png ...  ,  <outDir>/shots-map.json  ({route: pngPath}),
// and     <outDir>/capture-report.json — per-route QUALITY verdict (ok/blank/duplicate/redirected/
//         gated/error, final path, luminance stats). A wrong picture that "succeeded" is worse than
//         a missing one — the 2ndB intro gate once turned 65 different screens into the same robot
//         frame and every one reported success. The report is how that never hides again.
// then:   node embed-shots.js <outDir>/shots-map.json Output/shots.json
//
// Routes with dynamic segments (/record/[id], /:id) are skipped — there is no id to use.
// See references/capture-shots.md.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v.startsWith('--')) { const k = v.slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  else pos.push(v);
}
if (pos.length < 3) {
  console.error('usage: node capture-shots.js <graph.json> <baseUrl> <outDir> [--base-path /app] [--auth-url U --email E --password P] [--wait ms] [--width w] [--height h] [--only /a,/b] [--limit N]');
  process.exit(2);
}
const [graphPath, baseUrl, outDir] = pos;
const basePath = (flags['base-path'] && flags['base-path'] !== true) ? String(flags['base-path']).replace(/\/$/, '') : '';
const wait = parseInt(flags.wait, 10) || 1200;
const width = parseInt(flags.width, 10) || 390;
const height = parseInt(flags.height, 10) || 844;

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('playwright is not installed. Run  npm install  in skills/flow-debugger.'); process.exit(2); }

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const only = (flags.only && flags.only !== true) ? String(flags.only).split(',').map(s => s.trim()) : null;
const isDynamic = r => /\[[^\]]+\]|:\w+|\*/.test(r);

let routes = [...new Set(graph.map(s => s.route).filter(Boolean))];
const skipped = routes.filter(isDynamic);
routes = routes.filter(r => !isDynamic(r));
if (only) routes = routes.filter(r => only.includes(r));
if (flags.limit) routes = routes.slice(0, parseInt(flags.limit, 10));

const slug = r => (r === '/' ? 'index' : r.replace(/^\/+/, '').replace(/[^\w.-]+/g, '_')) || 'index';
fs.mkdirSync(outDir, { recursive: true });

// --tap: selectors (|| separated) for intro gates / one-time overlays / cookie banners. When one is
// present after navigation, click it — an undismissed gate silently replaces EVERY screen with the
// gate's own picture (the exact 2ndB failure). Checked after login and after every route open.
const tapSels = (flags.tap && flags.tap !== true) ? String(flags.tap).split('||').map(s => s.trim()).filter(Boolean) : [];
const maxRetry = (flags.retry !== undefined && flags.retry !== true) ? parseInt(flags.retry, 10) : 1;

// luminance stats + a coarse perceptual hash from a PNG buffer — how we tell a real screen from a
// blank one, and two routes that landed on the SAME screen (a gate/redirect) from real captures.
let PNGDEC = null; try { ({ PNG: PNGDEC } = require('pngjs')); } catch (e) { /* quality checks degrade gracefully */ }
function probeStats(pngBuf) {
  if (!PNGDEC) return null;
  try {
    const p = PNGDEC.sync.read(pngBuf);
    const { data, width: w, height: h } = p;
    let sum = 0, sum2 = 0; const G = 24; const grid = new Float64Array(G * G); const gc = new Float64Array(G * G);
    const stepX = Math.max(1, Math.floor(w / 96)), stepY = Math.max(1, Math.floor(h / 96));
    let n = 0;
    for (let y = 0; y < h; y += stepY) for (let x = 0; x < w; x += stepX) {
      const o = (y * w + x) * 4;
      const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
      sum += lum; sum2 += lum * lum; n++;
      const gi = Math.min(G - 1, Math.floor(y * G / h)) * G + Math.min(G - 1, Math.floor(x * G / w));
      grid[gi] += lum; gc[gi]++;
    }
    const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    let phash = '';
    for (let i = 0; i < G * G; i++) phash += Math.min(15, Math.round((grid[i] / (gc[i] || 1)) / 16)).toString(16);
    return { mean: +mean.toFixed(1), std: +std.toFixed(1), phash: require('crypto').createHash('sha1').update(phash).digest('hex').slice(0, 12) };
  } catch (e) { return null; }
}
const isBlank = st => !!st && (st.std < 4 || (st.std < 6 && st.mean < 8));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const pageErrors = { n: 0 };
  page.on('pageerror', () => { pageErrors.n++; });   // counted per route into the report; never fatal

  // click through any gate/overlay currently covering the screen (up to 3 stacked layers)
  async function tapGates() {
    let tapped = 0;
    for (let round = 0; round < 3; round++) {
      let hit = false;
      for (const s of tapSels) {
        const el = await page.$(s).catch(() => null);
        if (el) { await el.click().catch(() => {}); await page.waitForTimeout(800); hit = true; tapped++; break; }
      }
      if (!hit) break;
    }
    return tapped;
  }

  async function signIn() {
    console.log('signing in ...');
    await page.goto(String(flags['auth-url']), { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(wait);
    const type = async (sels, val) => { for (const s of sels) { const el = await page.$(s); if (el) { await el.fill(String(val)); return true; } } return false; };
    await type(['input[type=email]', 'input[name=email]', 'input[placeholder*="메일"]', 'input[placeholder*="mail"]'], flags.email);
    await type(['input[type=password]', 'input[name=password]', 'input[placeholder*="비밀"]'], flags.password || '');
    for (const s of ['button[type=submit]', 'button:has-text("로그인")', 'button:has-text("Sign in")']) {
      const b = await page.$(s); if (b) { await b.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(wait * 2);
    const tapped = await tapGates();
    console.log('  -> ' + page.url() + (tapped ? '  (gate tapped x' + tapped + ')' : ''));
  }
  if (flags['auth-url'] && flags.email) await signIn();

  // --jpeg [quality]: emit small JPEGs instead of PNGs. Thumbnails are embedded base64 in the HTML,
  // which gets committed; JPEG keeps that file (and every git blob of it) an order of magnitude
  // smaller — the right default for CI that commits refreshed shots on every change.
  const jpeg = !!flags.jpeg;
  const quality = (flags.jpeg && flags.jpeg !== true) ? parseInt(flags.jpeg, 10) : 72;
  const ext = jpeg ? '.jpg' : '.png';

  // --motion <routes>: some screens can't be told in one frame (loading→loaded, star fields,
  // carousels). For those, grab several frames over time and encode ONE animated GIF (pure JS) that
  // plays in the card <img>. GIFs are heavy, so it's opt-in per route; every other route stays a still.
  const motionSet = (flags.motion && flags.motion !== true) ? String(flags.motion).split(',').map(s => s.trim()).filter(Boolean) : [];
  const mFrames = parseInt(flags.frames, 10) || 8;
  const mGap = parseInt(flags['frame-gap'], 10) || 350;
  const gifWidth = parseInt(flags['gif-width'], 10) || 240;
  // --auto-motion [threshold]: probe two frames per screen and, if enough pixels moved, it's a
  // DYNAMIC screen → capture a GIF automatically — no hand-maintained route list. --motion still
  // force-GIFs specific routes. Default threshold 0.01 (1% of pixels moved).
  const autoMotion = ('auto-motion' in flags) && flags['auto-motion'] !== false;
  const motionThreshold = (typeof flags['auto-motion'] === 'string') ? (parseFloat(flags['auto-motion']) || 0.01) : 0.01;
  let gif = null;
  if (motionSet.length || autoMotion) { try { gif = require('./lib/gif'); } catch (e) { console.error('motion needs gifenc+pngjs (npm install in skills/flow-debugger) — falling back to stills.'); } }

  const map = {}; const report = {}; const seenHash = {};   // phash -> first route (duplicate = same SCREEN twice)
  const normPath = p => { let s = String(p || '').replace(/\/+$/, '') || '/'; return s; };

  for (const r of routes) {
    const url = baseUrl.replace(/\/$/, '') + basePath + (r === '/' ? '/' : r);
    const wantPath = normPath(basePath + (r === '/' ? '/' : r));
    const forced = !!gif && motionSet.includes(r);
    const row = { status: 'error', tries: 0, finalPath: null, mean: null, std: null, kb: null, fmt: null, dupOf: null, pageErrors: 0, tapped: 0, note: null };
    report[r] = row;

    for (let attempt = 0; attempt <= maxRetry; attempt++) {
      row.tries = attempt + 1;
      const errBase = pageErrors.n;
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        if (resp && resp.status() >= 400) throw new Error('HTTP ' + resp.status());
        await page.waitForTimeout(Math.round(wait * (attempt ? 1.6 : 1)));
        // a gate/overlay here replaces the screen with its own picture — tap through, then RE-OPEN
        // the route (tapping may itself navigate somewhere else, e.g. an intro pushing home).
        row.tapped = await tapGates();
        if (row.tapped) {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(wait);
          await tapGates();
        }
        row.finalPath = normPath(new URL(page.url()).pathname);

        // bounced to the sign-in page? the session dropped (token race/expiry) — sign back in and
        // retry the route instead of "successfully" capturing the login screen 45 times.
        const authPath = (flags['auth-url'] && flags.email) ? normPath(new URL(String(flags['auth-url'])).pathname) : null;
        if (authPath && wantPath !== authPath && row.finalPath === authPath && attempt < maxRetry) {
          process.stdout.write('a'); await signIn(); continue;
        }

        // quality probe (always a PNG) — the still we may reuse, and the evidence we judge by
        let a = await page.screenshot({ type: 'png' });
        let st = probeStats(a);
        if (isBlank(st) && attempt < maxRetry) { process.stdout.write('b'); continue; }   // blank → retry round

        // still vs GIF (auto-motion probes a second frame)
        let b2 = null, isMotion = forced;
        if (gif && (forced || autoMotion)) {
          await page.waitForTimeout(mGap);
          b2 = await page.screenshot({ type: 'png' });
          if (!forced) isMotion = gif.frameDiff(a, b2) >= motionThreshold;
        }
        let file;
        if (isMotion) {
          const frames = [a, b2];
          for (let i = 2; i < mFrames; i++) { await page.waitForTimeout(mGap); frames.push(await page.screenshot({ type: 'png' })); }
          file = path.join(outDir, slug(r) + '.gif');
          fs.writeFileSync(file, gif.encodeGif(frames, { width: gifWidth, delay: mGap }));
          row.fmt = 'gif';
        } else {
          file = path.join(outDir, slug(r) + ext);
          if (!jpeg) fs.writeFileSync(file, a);
          else await page.screenshot({ path: file, type: 'jpeg', quality });
          row.fmt = jpeg ? 'jpg' : 'png';
        }
        map[r] = file;
        row.kb = Math.round(fs.statSync(file).size / 1024);
        if (st) { row.mean = st.mean; row.std = st.std; }
        row.pageErrors = pageErrors.n - errBase;

        // verdict — priority: blank > redirected > duplicate > ok. All are REPORTED, none hidden.
        if (isBlank(st)) { row.status = 'blank'; process.stdout.write('B'); }
        else if (row.finalPath !== wantPath) { row.status = 'redirected'; row.note = '→ ' + row.finalPath; process.stdout.write('R'); }
        else if (st && seenHash[st.phash] && seenHash[st.phash] !== r) { row.status = 'duplicate'; row.dupOf = seenHash[st.phash]; process.stdout.write('D'); }
        else { row.status = row.fmt === 'gif' ? 'ok-motion' : 'ok'; process.stdout.write(row.fmt === 'gif' ? 'g' : '.'); }
        if (st && !seenHash[st.phash]) seenHash[st.phash] = r;
        break;
      } catch (e) {
        row.note = String(e.message).split('\n')[0];
        if (attempt >= maxRetry) { row.status = 'error'; process.stdout.write('x'); }
      }
    }
  }
  await browser.close();

  const mapPath = path.join(outDir, 'shots-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');
  const counts = {};
  for (const r of Object.values(report)) counts[r.status] = (counts[r.status] || 0) + 1;
  fs.writeFileSync(path.join(outDir, 'capture-report.json'), JSON.stringify({ summary: counts, basePath, routes: report }, null, 1), 'utf8');

  console.log('\n\ncaptured ' + Object.keys(map).length + '/' + routes.length + ' routes -> ' + mapPath);
  console.log('quality: ' + JSON.stringify(counts) + '  -> ' + path.join(outDir, 'capture-report.json'));
  if (skipped.length) console.log('skipped ' + skipped.length + ' dynamic route(s): ' + skipped.slice(0, 8).join(', ') + (skipped.length > 8 ? ' …' : ''));
  const bad = Object.entries(report).filter(([, v]) => v.status !== 'ok' && v.status !== 'ok-motion');
  if (bad.length) {
    console.log('NOT-OK ' + bad.length + ' — these thumbnails should NOT be trusted as the screen:');
    bad.slice(0, 20).forEach(([r, v]) => console.log('  · ' + r + '  [' + v.status + ']' + (v.dupOf ? ' same screen as ' + v.dupOf : '') + (v.note ? ' ' + v.note : '')));
    if (tapSels.length === 0) console.log('  (an intro gate/overlay? pass --tap "text=<gate text>" so the capturer clicks through it)');
  }
  console.log('\nnext: node embed-shots.js "' + mapPath + '" Output/shots.json');
})();
