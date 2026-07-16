#!/usr/bin/env node
// Stop hook: when a session that used the flow-debugger changed screen code, keep the flow chart
// current — badge the changed screens ON the chart, and rebase the map's file:line coordinates when
// the screenmap is present. Silent when the flow-debugger isn't set up here or nothing changed.
// Never commits; only touches the working tree. Best-effort: any failure degrades, never throws.
//
// Registered as a global Stop hook; the repo guard below makes it a no-op everywhere else.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// consume stdin (hook payload) so the pipe closes cleanly; we don't need it
try { readFileSync(0); } catch { /* no stdin */ }

const repo = process.cwd();
const html = join(repo, 'docs/flow-debugger.html');
const fpPath = join(repo, 'docs/flow-map.fingerprint.json');
const mapPath = join(repo, 'docs/flow-map.json');

// GUARD: only act where the flow-debugger is actually set up
if (!existsSync(html) || !existsSync(fpPath) || !existsSync(mapPath)) process.exit(0);

// locate the deployed flow-debugger scripts
const SCRIPTS = [
  join(homedir(), '.claude/skills/flow-debugger/scripts'),
  process.env.CLAUDE_PLUGIN_ROOT && join(process.env.CLAUDE_PLUGIN_ROOT, 'skills/flow-debugger/scripts'),
].filter(Boolean).find(existsSync);
if (!SCRIPTS) process.exit(0);

// STALENESS: same hash as check-flow-map-fresh (sha256, CRLF-normalised, first 16 hex)
let fp;
try { fp = JSON.parse(readFileSync(fpPath, 'utf8')); } catch { process.exit(0); }
const files = fp.files || {};
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
let changed = 0, gone = 0;
for (const [rel, was] of Object.entries(files)) {
  try { if (sha(readFileSync(join(repo, rel), 'utf8').replace(/\r\n/g, '\n')) !== was) changed++; }
  catch { gone++; }
}
if (!changed && !gone) process.exit(0);   // FRESH — nothing to do, stay silent

const node = process.execPath;
const run = (script, args) => execFileSync(node, [join(SCRIPTS, script), ...args],
  { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const notes = [];

// 1) BADGE the changed screens ON the chart (reliable; updates the committed html in the working tree)
try {
  const r = run('flag-changed-screens.js', [mapPath, repo, '--stamp', html]);
  const m = r.match(/STALE SCREENS \((\d+)\)/);
  notes.push(`화면 ${m ? m[1] : '?'}개에 '바뀜' 배지 표시`);
} catch (e) { notes.push('배지 실패: ' + String(e.message).split('\n')[0]); }

// 2) COORDINATE FIX — rebase the screenmap's file:line when it's present (Output/ is gitignored, so
//    this leaves NO committed churn; a later /flow-update or build picks up the corrected coordinates)
// Pick the screenmap that actually produced the committed map: prefer a fingerprint-commit match
// (same build), then generatedFrom, then the newest — never a stray derived array (e.g. graph-array).
try {
  const dir = join(repo, 'Output/flow-debugger');
  const docHead = fp.git && fp.git.head;
  let gen = ''; try { gen = JSON.parse(readFileSync(mapPath, 'utf8')).generatedFrom || ''; } catch { /* no field */ }
  let best = null;
  if (existsSync(dir)) {
    const cands = readdirSync(dir).filter(f =>
      /^screenmap.*\.json$/.test(f) && !f.includes('.fingerprint.') &&
      existsSync(join(dir, f.replace(/\.json$/, '.fingerprint.json'))));
    const scored = cands.map(f => {
      let head = null;
      try { head = JSON.parse(readFileSync(join(dir, f.replace(/\.json$/, '.fingerprint.json')), 'utf8')).git.head; } catch { /* unreadable */ }
      let mtime = 0; try { mtime = statSync(join(dir, f)).mtimeMs; } catch { /* gone */ }
      return { f, headMatch: !!(head && docHead && head === docHead), isGen: f === gen, mtime };
    });
    scored.sort((a, b) => (b.headMatch - a.headMatch) || (b.isGen - a.isGen) || (b.mtime - a.mtime));
    if (scored[0]) best = join(dir, scored[0].f);
  }
  if (best) {
    const r = run('rebase-anchors.js', [best, repo]);
    const rewritten = /재작성|rewritten|LEAVE|재스캔/i.test(r) ? ' (일부 재작성 → /flow-update 필요)' : '';
    notes.push('좌표 rebase 완료(' + best.split(/[\\/]/).pop() + ')' + rewritten);
  } else {
    notes.push('좌표 자동수정 건너뜀(이 세션에 스크린맵 없음)');
  }
} catch (e) { notes.push('좌표 rebase 건너뜀(스크린맵 확인 필요 → /flow)'); }

process.stdout.write(
  '[flow-debugger] 화면 코드가 바뀌어 흐름도를 갱신했어요 — ' + notes.join(' · ') +
  '. 렌더까지 완전 갱신은 `/flow`, 좌표만이면 `/flow-update`. (자동 커밋은 하지 않음)\n');
process.exit(0);
