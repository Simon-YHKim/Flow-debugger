// flow-debugger: self-test for the anchor engine (node only, no browser, no network).
//
// The anchor engine decides what a coding agent is told to edit. Every case below is a
// real shape taken from a real scan of a real app — the prose-in-a-coordinate-slot, the
// Expo router group in the path, the file with no line, the bare filename, the line that
// points at a comment. Each one used to be silently wrong.
//
//   node scripts/self-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('./lib/anchors');

// ---- fixture source tree -------------------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fdbg-'));
const w = (rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf8');
};
w('src/app/(auth)/sign-in.tsx', [
  "import React from 'react';",           // 1
  "import { useSignInForm } from '../../lib/useSignInForm';", // 2
  '',                                      // 3
  '/* the sign-in screen */',              // 4
  'export default function SignIn() {',    // 5
  '  const { handleSubmit } = useSignInForm();', // 6
  '  return <Pressable onPress={handleSubmit} />;', // 7
  '}',                                     // 8
].join('\n') + '\n');
w('src/lib/useSignInForm.ts', [
  "import { supabase } from './client';",  // 1
  '',                                      // 2
  'export function useSignInForm() {',     // 3
  '  const submitSignIn = async () => {',  // 4
  '    await supabase.auth.signInWithPassword({});', // 5
  '  };',                                  // 6
  '  return { handleSubmit: doSubmit };', // 7   (no submitSignIn here: the drift case)
  '}',                                     // 8
].join('\n') + '\n');
w('src/components/Unique.tsx', 'export function UniqueView() { return null; }\n');
w('src/a/Dup.tsx', 'export const Dup = 1;\n');
w('src/b/Dup.tsx', 'export const Dup = 2;\n');
// TWO functions with the same leaf name. Snapping to the nearest MENTION retargeted an anchor
// from the sign-up handler to the ADMIN one, and called it a correction.
w('src/lib/form.ts', [
  "import { handleSubmit } from './pay';",         // 1  a mention, not a definition
  'export function useAdminForm() {',              // 2
  '  const handleSubmit = () => post("/admin");',  // 3  definition A
  '  return { handleSubmit };',                    // 4  a mention
  '}',                                             // 5
  '',                                              // 6
  '// handleSubmit lives below',                   // 7  a comment naming it
  'const LABEL = "handleSubmit";',                 // 8  a string literal
  '',                                              // 9
  'export function useSignUpForm() {',             // 10
  '  const handleSubmit = () => post("/signup");', // 11 definition B
  '  return { handleSubmit };',                    // 12
  '}',                                             // 13
].join('\n') + '\n');
// a dead copy ABOVE the real export — resolve() took the first textual hit
w('src/lib/pay.ts', [
  'function legacyCart() {',                       // 1
  '  const checkout = () => 1;',                   // 2   dead
  '  return checkout;',                            // 3
  '}',                                             // 4
  '',                                              // 5
  'export const checkout = () => 2;',              // 6   production
].join('\n') + '\n');
w('lib/screens/login_screen.dart', 'void handleSubmit() {}\n');
// a screen that hands off to another component in production — the exact trap this tool exists for
w('src/app/legacy-home.tsx', [
  "import { isNewUI } from '../lib/flags';",   // 1
  'export default function Home() {',          // 2
  '  if (isNewUI()) return <NewHomeScreen/>;', // 3
  '  const handleTap = () => save();',         // 4  a real handler — in code production never runs
  '  return <OldBody onPress={handleTap} />;', // 5  a JSX render line
  '}',                                         // 6
].join('\n') + '\n');
// The shape that actually burned a real map: a BARE render line with no handler on it.
// All three of the home screen's actions were anchored to `return <DeepSpaceShell />` — and
// the handlers were not even in that file.
w('src/app/shell-home.tsx', [
  'export default function Home() {',          // 1
  '  const openStar = () => push("/star");',   // 2  the handler
  '  return <DeepSpaceShell />;',              // 3  bare JSX — the scan anchored here
  '}',                                         // 4
].join('\n') + '\n');
// an ordinary loading guard: same SHAPE, not a delegation. Must not be flagged.
w('src/app/guarded.tsx', [
  'export default function Guarded({ loading }) {',  // 1
  '  if (loading) return <View/>;',                  // 2
  '  return <Body onPress={handleTap} />;',          // 3
  '}',                                               // 4
].join('\n') + '\n');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
};
const V = (raw, symbol) => A.validateAnchor(raw, root, { symbol });
const VF = (raw, feature) => A.validateAnchor(raw, root, { feature });   // feature = a label, often a slug

console.log('anchor engine:');

// a clean coordinate whose symbol is really there
eq('exact: symbol on the line', V('src/lib/useSignInForm.ts:4 (submitSignIn)').status, 'exact');

// the Expo router group used to make the parser bail out to "/sign-in.tsx" and then call
// it an escape from the app root
const g = V('src/app/(auth)/sign-in.tsx:6', 'handleSubmit');
eq('expo route group path resolves', [g.status, g.value], ['exact', 'src/app/(auth)/sign-in.tsx:6']);

// a file with NO line and a symbol in parens (19% of the real map) -> find the line
const r = V('src/lib/useSignInForm.ts (submitSignIn)');
eq('no line -> recovered by symbol', [r.status, r.value], ['resolved', 'src/lib/useSignInForm.ts:4']);

// a drifted line snaps to where the symbol actually is
const n = V('src/lib/useSignInForm.ts:7 (submitSignIn)');
eq('drifted line snaps', [n.status, n.value], ['near', 'src/lib/useSignInForm.ts:4']);

// a line that exists but holds an import / a comment / nothing is not a place to send anyone
eq('import line is weak', V('src/app/(auth)/sign-in.tsx:1').status, 'weak');
eq('comment line is weak', V('src/app/(auth)/sign-in.tsx:4').status, 'weak');
eq('blank line is weak', V('src/app/(auth)/sign-in.tsx:3').status, 'weak');

// the symbol is simply not there -> say so instead of shipping the coordinate as fact
eq('symbol absent', V('src/lib/useSignInForm.ts:8 (SeenLensView)').status, 'absent');

// prose in the coordinate slot is not a coordinate
eq('prose is not a location', V('loadDomainLevels(userId) — 별 밝기 계산').status, 'prose');
eq('router.push is not a file', V("onChatPress → router.push('/secondb')").status, 'prose');

// a bare filename resolves only when it is unique
eq('bare filename, unique', V('Unique.tsx:1').value, 'src/components/Unique.tsx:1');
eq('bare filename, ambiguous', V('Dup.tsx:1').status, 'ambiguous');

// containment: an anchor may not point outside the app
eq('../ escape refused', V('../../../etc/passwd.ts:1').status, 'outside');
eq('missing file', V('src/nope.tsx:1').status, 'missing');

// a lowercase slug is not an identifier — using it as one produced false "absent"
eq('feature slug is not used as a symbol', VF('src/app/(auth)/sign-in.tsx:6', 'survey').status, 'unchecked');
eq('camelCase feature IS used as a symbol', VF('src/app/(auth)/sign-in.tsx:6', 'handleSubmit').status, 'exact');

// A JSX render line is NOT where an action is handled. A real run put all three of the home
// screen's actions on `return <DeepSpaceShell />` — the handlers were not even in that file.
// A BARE render line is never where an action is handled.
eq('a bare JSX render line is refused', V('src/app/shell-home.tsx:3').status, 'weak');
eq('  ...and snaps to the handler when the symbol names one',
   V('src/app/shell-home.tsx:3 (openStar)').value, 'src/app/shell-home.tsx:2');
// …but a JSX line that CARRIES the handler is exactly where the logic lives. Flagging it was a
// false alarm on a correct anchor, and a false alarm costs more trust than a missed one.
eq('a JSX line with an inline handler is real logic',
   V('src/app/(auth)/sign-in.tsx:7', 'handleSubmit').status, 'exact');
// `renders` POINTS AT the render site by definition — the rule must not fire on it
eq('renders is exempt from the non-code rule',
   A.validateAnchor('src/app/shell-home.tsx:3', root, { isRender: true }).status, 'unchecked');

// An `impl` anchor must NOT be compared against the SCREEN handler's name: impl points into a
// lib helper whose function has a different name. A real run produced 15 "function not there"
// warnings this way, and all 15 were false.
const implFP = A.validateGraph([{ route: '/p', actions: [{
  action: 'Save', symbol: 'handleSubmit',                    // the screen's handler
  file: 'src/app/(auth)/sign-in.tsx:6',
  impl: 'src/lib/useSignInForm.ts:4' }] }], root);           // the lib function: submitSignIn
eq('impl is not judged by the screen handler name', implFP.stat.absent, 0);
// a symbol the scan DECLARED is trusted even if it is one lowercase word (`summarize`)
eq('declared lowercase symbol is trusted', V('src/lib/useSignInForm.ts:4 (submitSignIn)').status, 'exact');

// a wrapped path: "DevOnlyRoute(src/x.tsx:18)"
eq('wrapped path unwraps', V('DevOnlyRoute(src/components/Unique.tsx:1)').value, 'src/components/Unique.tsx:1');

console.log('\nadversarial (every case here is one a skeptic used to break the engine):');

// A1 — a symbol on an IMPORT or COMMENT line must never be "exact". `\bhandleSubmit\b` matches
// the import that brings it in; the weak check used to sit INSIDE the no-symbol branch, so
// supplying a symbol bypassed it. One such anchor was live in the real 2nd-B map, reported ✔.
eq('symbol on an import line is not exact', V('src/lib/form.ts:1 (handleSubmit)').status, 'weak');
eq('symbol in a comment is not exact', V('src/lib/form.ts:7 (handleSubmit)').status, 'weak');

// A2/A3 — a same-name symbol defined twice must NOT be snapped to whichever is nearest.
// Snapping line 8 used to retarget the anchor into useAdminForm.
const amb = V('src/lib/form.ts:8 (handleSubmit)');
eq('ambiguous same-name symbol refuses to snap', amb.status, 'absent');
eq('  ...and explains why', /군데/.test(amb.why || ''), true);

// A4 — resolve() must find the DEFINITION, not the first textual mention (a dead copy)
eq('resolve finds the export, not the dead copy above it',
   V('src/lib/pay.ts (checkout)').value, 'src/lib/pay.ts:6');

// A5 — an extension the whitelist forgot must never DESTROY a correct anchor
const dartFixed = [{ route: '/l', actions: [{ action: 'Sign in', symbol: 'handleSubmit',
  file: 'lib/screens/login_screen.dart:1 (handleSubmit)' }] }];
A.applyVerdicts(dartFixed, root);
eq('a .dart anchor survives --fix', dartFixed[0].actions[0].file, 'lib/screens/login_screen.dart:1 (handleSubmit)');

// A6 — even a genuinely broken anchor keeps its text, moved out of the coordinate slot
const gone = [{ route: '/x', actions: [{ action: 'a', file: 'src/nope.tsx:1' }] }];
A.applyVerdicts(gone, root);
eq('a broken anchor is not erased without trace',
   [gone[0].actions[0].file, gone[0].actions[0].fileNote], [undefined, 'src/nope.tsx:1']);

console.log('\ngraph repair:');
const graph = [{
  route: '/sign-in', group: 'auth', renders: 'src/app/(auth)/sign-in.tsx:5',
  actions: [
    { action: 'Sign in', feature: 'email-login', symbol: 'handleSubmit',
      file: 'src/app/(auth)/sign-in.tsx:6',
      impl: 'src/lib/useSignInForm.ts (submitSignIn)' },
    { action: 'On load', feature: 'session-check',
      file: 'src/app/(auth)/sign-in.tsx:1',
      impl: "readSession(userId) — 저장된 세션을 확인" },
  ],
}];
const before = A.validateGraph(JSON.parse(JSON.stringify(graph)), root);
eq('before: 1 prose + 1 weak', [before.stat.prose, before.stat.weak], [1, 1]);

const fixed = JSON.parse(JSON.stringify(graph));
const rep = A.applyVerdicts(fixed, root);
eq('line recovered on repair', fixed[0].actions[0].impl, 'src/lib/useSignInForm.ts:4 (submitSignIn)');
eq('anchor gains its symbol so it re-verifies', fixed[0].actions[0].file, 'src/app/(auth)/sign-in.tsx:6 (handleSubmit)');
eq('prose moved out of impl', fixed[0].actions[1].impl, undefined);
eq('prose kept as a note', fixed[0].actions[1].implNote, 'readSession(userId) — 저장된 세션을 확인');
eq('repair reports itself', [rep.fixed.length, rep.moved.length, rep.dropped.length], [2, 1, 0]);

// the repaired anchor must STILL verify — a repair that erases its own evidence is not one
const after = A.validateGraph(fixed, root);
eq('repaired graph re-verifies exact', after.stat.exact >= 1, true);
eq('repaired graph has no prose', after.stat.prose, 0);

console.log('\ndelegation trap:');
// an anchor into a delegating file with no `renders` is the "build is green, screen unchanged"
// bug. It validates perfectly — only reading the file catches it.
const trap = [{ route: '/home', group: 'g', actions: [
  { action: 'Tap', feature: 'tap', symbol: 'handleTap', file: 'src/app/legacy-home.tsx:4' }] }];
const t1 = A.lintDelegation(trap, root);
eq('trap detected', [t1.length, t1[0] && t1[0].delegatesTo], [1, 'NewHomeScreen']);
// a loading guard is NOT a delegation. Flagging it would cry wolf on a correct anchor,
// and a false alarm costs more trust than a missed one.
eq('loading guard is not a trap',
   A.lintDelegation([{ route: '/g', actions: [{ action: 'x', file: 'src/app/guarded.tsx:3' }] }], root).length, 0);
eq('anchor itself still validates (that is the point)',
   A.validateAnchor('src/app/legacy-home.tsx:4', root, { symbol: 'handleTap' }).status, 'exact');
// recording the real render file clears it
trap[0].renders = 'src/components/Unique.tsx:1';
eq('renders clears the trap', A.lintDelegation(trap, root).length, 0);

fs.rmSync(root, { recursive: true, force: true });

// ============================================================ stale / backend / generality
// These three are the reason the plugin can be trusted on someone else's codebase, so they are
// tested on a synthetic app that looks nothing like the one it was built for.
const F = require('./lib/fingerprint');
const BE = require('./lib/backend');
const RE = require('./lib/reach');

const app2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fdbg2-'));
const w2 = (rel, body) => { const q = path.join(app2, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, body, 'utf8'); };
// a Next.js + Prisma + OpenAI app — a different ecosystem in every dimension
w2('src/app/checkout/page.tsx', ['export default function Checkout() {', '  const pay = () => post();', '  return <Body onPress={pay} />;', '}'].join('\n') + '\n');
w2('src/lib/orders.ts', [
  "import { prisma } from './db';",
  "import { summarise } from './ai';",
  'export async function placeOrder(input) {',
  '  const o = await prisma.order.create({ data: input });',
  '  await summarise(o.note);',
  '  return o;',
  '}',
].join('\n') + '\n');
w2('src/lib/ai.ts', [
  "import OpenAI from 'openai';",
  'const client = new OpenAI();',
  'export async function summarise(text) {',
  '  return client.chat.completions.create({ model: "gpt-4o", messages: [] });',
  '}',
].join('\n') + '\n');
w2('src/app/api/orders/route.ts', [
  "import { prisma } from '@/lib/db';",
  'export async function POST(req) {',
  '  const session = await getServerSession();',
  '  return prisma.order.create({ data: {} });',
  '}',
].join('\n') + '\n');
w2('prisma/schema.prisma', 'model Order {\n  id Int @id\n}\nmodel User {\n  id Int @id\n}\n');

console.log('\ngenerality (a Next + Prisma + OpenAI app — nothing like the one this was built for):');
const helpers2 = RE.indexHelpers(app2);
// the AI gateway is DISCOVERED from the import, not named in advance
eq('AI gateway found without knowing its name', !!(helpers2.summarise && helpers2.summarise.ai), true);
eq('and it propagates to the caller', !!(helpers2.placeOrder && helpers2.placeOrder.ai), true);
eq('Prisma writes are seen as DB calls',
   (helpers2.placeOrder && helpers2.placeOrder.apis || []).some(x => /^db:order:create$/.test(x)), true);

const g2 = [{ route: '/checkout', group: 'g', actions: [
  { action: 'Pay', symbol: 'pay', file: 'src/app/checkout/page.tsx:2', apis: ['db:order:create', 'rest:POST:/api/orders'] }] }];
const be = BE.scanBackend(app2, g2);
eq('Next route handler found', !!be.handlers['/api/orders'], true);
eq('  ...and its auth guard noticed', be.handlers['/api/orders'].guarded, true);
eq('Prisma schema tables found', Object.keys(be.tables).sort(), ['Order', 'User']);
eq('a db: tag links to its table', (be.links['db:order:create'] || {}).table, 'order');

console.log('\nstale detection (a map that cannot say it is stale will lie to you):');
const fp2 = F.fingerprint(g2, app2, '2026-01-01T00:00:00Z');
eq('fingerprint records the anchored file', Object.keys(fp2.files), ['src/app/checkout/page.tsx']);
eq('fresh right after building', F.checkStale(fp2, app2).stale, false);
fs.appendFileSync(path.join(app2, 'src/app/checkout/page.tsx'), '// touched\n');
const st2 = F.checkStale(fp2, app2);
eq('an edit to an anchored file makes it STALE', [st2.stale, st2.changed], [true, ['src/app/checkout/page.tsx']]);

// ---- drift repair: detecting staleness is only half of it -------------------------------------
// Real drift is mostly innocent: someone adds an import and every line below moves down by one.
// A map that must be fully re-scanned for that is a map nobody re-scans. So: the anchor's line of
// code is looked up at the commit the map was built from, and found again where it lives now.
console.log('\ndrift repair (the code moved; the coordinates follow it):');
const { execFileSync } = require('child_process');
const app3 = fs.mkdtempSync(path.join(os.tmpdir(), 'fdbg3-'));
const g3run = (...a) => execFileSync('git', a, { cwd: app3, encoding: 'utf8', stdio: 'pipe' });
const w3 = (rel, body) => { const q = path.join(app3, rel); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, body, 'utf8'); };
w3('src/Home.tsx', ['import React from "react";', '', 'export function Home() {', '  const handleSave = () => save();', '  return <B onPress={handleSave} />;', '}'].join('\n') + '\n');
g3run('init', '-q'); g3run('config', 'user.email', 't@t'); g3run('config', 'user.name', 't');
g3run('add', '-A'); g3run('commit', '-qm', 'base');
const baseSha = g3run('rev-parse', 'HEAD').trim();

// the drift: two lines added at the top. handleSave is now at 6, not 4.
w3('src/Home.tsx', ['import React from "react";', 'import { save } from "./api";', '', '', 'export function Home() {', '  const handleSave = () => save();', '  return <B onPress={handleSave} />;', '}'].join('\n') + '\n');
const g3path = path.join(app3, 'map.json');
fs.writeFileSync(g3path, JSON.stringify([{ route: '/', group: 'g', renders: 'src/Home.tsx:3',
  actions: [{ action: 'Save', symbol: 'handleSave', file: 'src/Home.tsx:4', impl: 'src/Home.tsx:4' }] }]), 'utf8');

// line 4 is now blank, so this lands in `weak`, not `absent` — either way it no longer holds
const beforeFix = A.validateGraph(JSON.parse(fs.readFileSync(g3path, 'utf8')), app3, { snap: false });
eq('after the drift the old anchor no longer holds', beforeFix.stat.absent + beforeFix.stat.weak > 0, true);

execFileSync(process.execPath, [path.join(__dirname, 'rebase-anchors.js'), g3path, app3, '--from', baseSha], { encoding: 'utf8', stdio: 'pipe' });
const g3after = JSON.parse(fs.readFileSync(g3path, 'utf8'));
eq('the anchor followed its line of code', g3after[0].actions[0].file, 'src/Home.tsx:6');
eq('the render anchor followed too', g3after[0].renders, 'src/Home.tsx:5');
eq('and now it verifies clean', A.validateGraph(g3after, app3, { snap: false }).stat.absent, 0);

// a line that was REWRITTEN, not moved, must not be guessed at
w3('src/Home.tsx', ['import React from "react";', 'import { save } from "./api";', '', '', 'export function Home() {', '  const onSaveClicked = () => save();', '  return <B onPress={onSaveClicked} />;', '}'].join('\n') + '\n');
fs.writeFileSync(g3path, JSON.stringify([{ route: '/', group: 'g',
  actions: [{ action: 'Save', symbol: 'handleSave', file: 'src/Home.tsx:4' }] }]), 'utf8');
let rebaseExit = 0;
try { execFileSync(process.execPath, [path.join(__dirname, 'rebase-anchors.js'), g3path, app3, '--from', baseSha], { encoding: 'utf8', stdio: 'pipe' }); }
catch (e) { rebaseExit = e.status; }
eq('a rewritten line is reported, not invented', rebaseExit, 1);
eq('and the anchor is left alone rather than moved somewhere wrong',
  JSON.parse(fs.readFileSync(g3path, 'utf8'))[0].actions[0].file, 'src/Home.tsx:4');

// a file that MOVED is not a file that is gone — the anchor follows it to its new path.
// put the base content back (so the moved file's line still matches), then git-mv and commit.
w3('src/Home.tsx', ['import React from "react";', '', 'export function Home() {', '  const handleSave = () => save();', '  return <B onPress={handleSave} />;', '}'].join('\n') + '\n');
fs.mkdirSync(path.join(app3, 'src/screens'), { recursive: true });   // this git does not auto-create the mv target dir
g3run('mv', '-f', 'src/Home.tsx', 'src/screens/Home.tsx');     // same content, new path (one commit records the rename)
g3run('add', '-A'); g3run('commit', '-qm', 'move Home');
fs.writeFileSync(g3path, JSON.stringify([{ route: '/', group: 'g',
  actions: [{ action: 'Save', symbol: 'handleSave', file: 'src/Home.tsx:4' }] }]), 'utf8');
execFileSync(process.execPath, [path.join(__dirname, 'rebase-anchors.js'), g3path, app3, '--from', baseSha], { encoding: 'utf8', stdio: 'pipe' });
eq('the anchor followed the file to its new path',
  JSON.parse(fs.readFileSync(g3path, 'utf8'))[0].actions[0].file, 'src/screens/Home.tsx:4');

fs.rmSync(app2, { recursive: true, force: true });
fs.rmSync(app3, { recursive: true, force: true });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
