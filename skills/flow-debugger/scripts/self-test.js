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
// a screen that hands off to another component in production — the exact trap this tool exists for
w('src/app/legacy-home.tsx', [
  "import { isNewUI } from '../lib/flags';",   // 1
  'export default function Home() {',          // 2
  '  if (isNewUI()) return <NewHomeScreen/>;', // 3
  '  return <OldBody onPress={handleTap} />;', // 4  <- a perfectly valid anchor into dead code
  '}',                                         // 5
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
eq('feature slug is not used as a symbol', VF('src/app/(auth)/sign-in.tsx:7', 'survey').status, 'unchecked');
eq('camelCase feature IS used as a symbol', VF('src/app/(auth)/sign-in.tsx:7', 'handleSubmit').status, 'exact');
// a symbol the scan DECLARED is trusted even if it is one lowercase word (`summarize`)
eq('declared lowercase symbol is trusted', V('src/lib/useSignInForm.ts:4 (submitSignIn)').status, 'exact');

// a wrapped path: "DevOnlyRoute(src/x.tsx:18)"
eq('wrapped path unwraps', V('DevOnlyRoute(src/components/Unique.tsx:1)').value, 'src/components/Unique.tsx:1');

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
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
