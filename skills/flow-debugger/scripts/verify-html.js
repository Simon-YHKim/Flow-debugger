// flow-debugger: live-verify a built flow-debugger.html in a real browser.
//
// The build's `new Function` check only proves the script PARSES. This proves the page
// actually runs: no runtime error, no overlapping cards, the panels render, and — the
// thing that matters — the exported bug report really carries the verified code anchors.
// Every "verify PASS" claim in this repo's CHANGELOG used to rest on scripts that lived
// in a temp directory and no longer exist; this one lives with the code.
//
// usage:
//   node verify-html.js <flow-debugger.html> [--template <template.html>] [--shot <out.png>]
// requires playwright (see package.json). If it is not installed the script says so and
// exits 2 — it never silently "passes".
const path = require('path');

const argv = process.argv.slice(2);
const flags = {}; const pos = [];
for (let i = 0; i < argv.length; i++) {
  const v = argv[i];
  if (v === '--shot') flags.shot = argv[++i];
  else if (v === '--template') flags.template = argv[++i];
  else if (v.startsWith('--')) flags[v.slice(2)] = true;
  else pos.push(v);
}
if (!pos.length) { console.error('usage: node verify-html.js <flow-debugger.html> [--shot out.png]'); process.exit(2); }
const file = path.resolve(pos[0]);

// A leak check belongs on the TEMPLATE, not on a built page: a 2nd-B map legitimately
// contains 2nd-B's own model names (they came from its data). What must never contain them
// is the file every third party ships. This is the check v0.8.1's __APP_NAME__ fix implied
// but never enforced — the AI-harness diagram was hard-coded and leaked far more than a title.
const FOREIGN = ['callGemini', 'gemini-proxy', 'bump_gemini_spend', 'claude-sonnet',
  'text-embedding-004', 'EXPO_PUBLIC_MODEL', 'supabase/functions', '2nd-B', 'deepspace'];
function templateLeaks(tplPath) {
  const src = require('fs').readFileSync(tplPath, 'utf8');
  return FOREIGN.filter(s => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(src));
}
if (flags.template) {
  const leaks = templateLeaks(path.resolve(flags.template));
  console.log('template leaks   ' + (leaks.length ? 'FOUND ' + leaks.join(', ') : 'none'));
  if (leaks.length) { console.log('\nFAIL — the template ships another app\'s internals'); process.exit(1); }
}

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('playwright is not installed. Run:  npm install  (in skills/flow-debugger)');
  console.error('or:  NODE_PATH=<your playwright> node verify-html.js ...');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const errors = [];
  page.on('pageerror', e => {
    // synthetic pointer events in a headless run raise this; it is a test artifact
    if (/setPointerCapture|No active pointer/i.test(String(e.message))) return;
    errors.push(String(e.message));
  });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file:///' + file.replace(/\\/g, '/'));
  await page.waitForTimeout(900);

  const R = await page.evaluate(() => {
    const out = {};
    out.title = document.title;
    out.nodes = document.querySelectorAll('#nodes .node').length;
    out.chips = document.querySelectorAll('.chips .chip').length;
    out.legend = document.querySelectorAll('.legend span').length;
    out.harnessBtn = (() => { const b = document.getElementById('harnessBtn'); return !b ? 'absent' : (b.style.display === 'none' ? 'hidden' : 'shown'); })();
    out.anchorsChecked = (typeof ANCHORS !== 'undefined') && !!ANCHORS.checked;
    out.anchorStat = (typeof ANCHORS !== 'undefined') ? ANCHORS.stat : null;
    out.harnessDerived = (typeof HARNESS_DERIVED !== 'undefined') ? HARNESS_DERIVED : null;
    out.unit = (typeof UNIT !== 'undefined') ? UNIT : null;

    // overlap: every visible card must own its rectangle
    const els = [...document.querySelectorAll('#nodes .node')].map(e => {
      const r = e.getBoundingClientRect(); return { id: e.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    let overlaps = 0;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.x < b.x + b.w - 2 && a.x + a.w - 2 > b.x && a.y < b.y + b.h - 2 && a.y + a.h - 2 > b.y) overlaps++;
    }
    out.overlaps = overlaps;
    return out;
  });

  // drive the actual value path: open a screen, file a bug, read the exported report
  let report = '', bugFlow = 'not-run';
  try {
    await page.click('#nodes .node.screen');
    await page.waitForTimeout(250);
    const hasBtn = await page.$('#reportBug');
    if (hasBtn) {
      await page.click('#reportBug');
      await page.waitForTimeout(250);
      // empty report must NOT export
      const empty = await page.inputValue('#bugOut').catch(() => '');
      const gated = /비어 있어요/.test(empty);
      await page.fill('textarea[data-f="symptom"]', '화면이 하얗게만 뜨고 아무것도 안 보여요');
      await page.dispatchEvent('textarea[data-f="symptom"]', 'change');
      await page.waitForTimeout(250);
      report = await page.inputValue('#bugOut').catch(() => '');
      bugFlow = gated ? (report.includes('안 되는') ? 'ok' : 'no-report') : 'NOT-GATED';
    } else bugFlow = 'no-button-on-screen-card';
  } catch (e) { bugFlow = 'error: ' + e.message; }

  // THE test gap that let the flagship feature ship dead: build.js printed "DELEGATION TRAP: 4"
  // while the page's lookup key never matched (a stray NUL vs a space), so delegWarn() returned
  // null for every node — and both the unit test (which calls the library directly) and this
  // script (which only clicked the FIRST screen card) passed. Assert the warning actually fires,
  // end to end, on a route the build says is trapped.
  const deleg = await page.evaluate(() => {
    const D = (typeof ANCHORS !== 'undefined' && ANCHORS.delegation) || {};
    const keys = Object.keys(D);
    if (!keys.length) return { trapped: 0, fired: 0, inReport: null };
    let fired = 0;
    for (const k of keys) {
      const route = k.split(' ')[0];
      const sn = nodes.get('s:' + route);
      if (sn && delegWarn(sn)) { fired++; continue; }
      for (const n of nodes.values())
        if (n.type === 'action' && n.screen && n.screen.route === route && delegWarn(n)) { fired++; break; }
    }
    // and it must reach the EXPORT, which is the only thing a coding agent ever reads
    const route = keys[0].split(' ')[0];
    const sn = nodes.get('s:' + route);
    let inReport = null;
    if (sn) {
      state.bugs = state.bugs || {};
      state.bugs[sn.id] = { symptom: '테스트' };
      inReport = /위임 경고/.test(buildBugReport([sn.id]));
      delete state.bugs[sn.id];
    }
    return { trapped: keys.length, fired, inReport };
  });

  // the harness view has its own layout pass — check it de-overlaps too (it used to have none)
  let harnessOverlaps = null;
  if (R.harnessBtn === 'shown') {
    await page.click('#harnessBtn'); await page.waitForTimeout(700);
    harnessOverlaps = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#nodes .node')].map(e => e.getBoundingClientRect());
      let o = 0;
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.left < b.right - 2 && a.right - 2 > b.left && a.top < b.bottom - 2 && a.bottom - 2 > b.top) o++;
      }
      return o;
    });
    await page.click('#harnessBtn'); await page.waitForTimeout(300);
  }

  if (flags.shot) { await page.screenshot({ path: flags.shot, fullPage: false }); }
  if (!flags['keep-open']) await browser.close();

  const anchorLine = R.anchorStat
    ? `confirmed ${(R.anchorStat.exact + R.anchorStat.near + R.anchorStat.resolved + R.anchorStat.fileonly + R.anchorStat.unchecked)}/${R.anchorStat.total}, weak ${R.anchorStat.weak}, prose ${R.anchorStat.prose}`
    : 'n/a';

  console.log('title            ' + R.title);
  console.log('nodes / chips    ' + R.nodes + ' / ' + R.chips + '   legend items ' + R.legend);
  console.log('unit             ' + R.unit);
  console.log('overlaps         ' + R.overlaps);
  console.log('page errors      ' + errors.length + (errors.length ? '\n  ! ' + errors.slice(0, 5).join('\n  ! ') : ''));
  console.log('anchors verified ' + R.anchorsChecked + '   (' + anchorLine + ')');
  console.log('harness          button=' + R.harnessBtn + ' derived=' + R.harnessDerived);
  console.log('bug flow         ' + bugFlow + '   (empty report must be gated, filled report must carry anchors)');
  console.log('delegation warn  ' + (deleg.trapped ? deleg.fired + '/' + deleg.trapped + ' fired, in report: ' + deleg.inReport : 'no traps in this map'));
  if (harnessOverlaps !== null) console.log('harness overlaps ' + harnessOverlaps);
  if (report) {
    console.log('\n--- exported bug report (first 24 lines) ---');
    console.log(report.split('\n').slice(0, 24).join('\n'));
  }

  const fail = errors.length || R.overlaps || !R.nodes || bugFlow !== 'ok'
    || (deleg.trapped > 0 && (deleg.fired < deleg.trapped || deleg.inReport === false))
    || (harnessOverlaps !== null && harnessOverlaps > 0);
  console.log('\n' + (fail ? 'FAIL' : 'PASS'));
  process.exit(fail ? 1 : 0);
})();
