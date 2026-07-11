/* extract-prompt.js — dev/eval tool. Seeds a few representative entries into a BUILT
 * flow-debugger.html and prints the exported prompt (buildStackPrompt), so you can score
 * the real output against evals/prompt-quality.md instead of eyeballing templates.
 *
 * Usage:  NODE_PATH=<dir with playwright> node extract-prompt.js path/to/flow-debugger.html
 * Requires playwright (a dev-only dep; not needed to build the artifact).
 *
 * The seeded ids below are for the 2nd-B scan; adjust actOf()/routes to your target app
 * so the code anchors stay authentic. Bugs attach to a screen's first action; rename to a
 * screen; add-node + a connection exercise the remaining kinds.
 */
const path = require('path');
const { chromium } = require('playwright');
const htmlPath = process.argv[2];
if (!htmlPath) { console.error('usage: node extract-prompt.js <built-html>'); process.exit(1); }
const fileUrl = 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { const m = String(e.message || e); if (!/setPointerCapture|No active pointer/.test(m)) errors.push(m); });
  await page.goto(fileUrl, { waitUntil: 'load' }).catch(() => {});
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const keys = [...nodes.keys()];
    const actOf = route => keys.find(k => { const n = nodes.get(k); return n.type === 'action' && n.screen && n.screen.route === route; });
    const scr = route => 's:' + route;
    const bugA = actOf('/ttfv') || actOf('/sign-in') || keys.find(k => nodes.get(k).type === 'action');
    const bugB = actOf('/sign-in');
    state.bugs = {};
    if (bugA) state.bugs[bugA] = { symptom: '첫 기록을 저장했는데 별이 안 생겨요', expected: '저장하면 화면에 별이 하나 떠야 해요' };
    if (bugB && bugB !== bugA) state.bugs[bugB] = { symptom: '로그인 버튼을 눌러도 아무 반응이 없어요', expected: '이메일/비번 맞으면 홈으로 넘어가야 해요' };
    const anyScreen = keys.find(k => nodes.get(k).type === 'screen');
    state.edits = {}; if (anyScreen) state.edits[anyScreen] = { label: '빠른 담기' };
    state.addedNodes = [{ id: 'user:1', kind: 'screen', label: '알림 설정 화면', desc: '푸시 알림을 켜고 끌 수 있어야 해요' }];
    state.addedEdges = anyScreen ? [{ from: anyScreen, to: 'user:1' }] : [];
    injectAddedNodes();
    return buildStackPrompt();
  });

  console.log(out);
  if (errors.length) console.error('\n[pageErrors]', errors);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
