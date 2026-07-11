# Prompt-quality eval — is the exported prompt actually good?

The whole point of flow-debugger is that a non-developer's notes become a prompt an AI
can act on. So the exported prompt (dock **전체 복사**, 버그 신고서, 수정 요청) is the
product. This eval measures how actionable it is and proves the templates improve it,
instead of asserting it.

## Rubric (score each item 0/1/2, max 12/item)

| # | Criterion | A "2" has… |
|---|---|---|
| C1 | Grounding | a concrete code anchor (route / file:line / api tag) |
| C2 | Single clear intent | exactly what to change and why, unambiguous |
| C3 | Acceptance criteria | a checkable "done-when" |
| C4 | Constraints | design pattern to follow / what must not break / scope fence |
| C5 | Context framing | enough repo/stack/placement context to act |
| C6 | Ambiguity removal | no filler; vague verbs ("고쳐/만들어/반영") are qualified |

## Method

1. Build 5 authentic fixtures from real target-app data (a bug, a rename, an add-node,
   a connection, a memo) — see `evals/fixtures/`.
2. Render them through the **current** templates (`buildStackPrompt`), score with an
   independent judge panel (3 diverse lenses: coding-agent actionability, rubric scorer,
   adversarial gap-finder). Two judges read the real repo.
3. Harden the templates, re-render the **same** fixtures via the live HTML
   (`scripts/extract-prompt.js` seeds state and calls `buildStackPrompt()`), and re-score
   with a fresh **blind** judge on the same rubric.
4. Ground-truth A/B: feed one fixture (the login bug) to two coding agents on the real
   repo — one with the old prompt, one with the hardened prompt — read-only, propose a
   diff, and compare outcomes.

## Result (2026-07-11, target app = 2nd-B)

| | Grand total | % | Safely executable (coding-agent view) |
|---|---|---|---|
| **Before** | 28 / 60 | 46.7% | 1 of 5 |
| **After (hardened)** | 53 / 60 | 88.3% | 4 of 5 |

Biggest lifts: **C4 Constraints 0.0 → 2.0** (added scope fences, "don't break", cost gate),
**C3 Acceptance 1.4 → 1.8** (explicit done-when per item), **C6 1.0 → 1.8** (filler verbs
replaced with verify-first instructions).

### Ground-truth A/B (login bug — the "misleading anchor" trap)

The scan anchored the login bug to `sign-in.tsx:72`, which is the **legacy** component
production never renders (deep-space delegation); the real logic is `useSignInForm.ts`.

- **Old prompt →** agent traced correctly but, unable to reproduce a hard failure, **shipped
  a speculative diff** changing auth logic for a symptom that may not be a bug.
- **Hardened prompt →** following the "reproduce first / don't guess / ask if ambiguous"
  rails, it **stopped and asked one disambiguating question**, surfacing that the "bug" is
  likely intended progressive-disclosure UX, not a defect.

Finding: on a capable model the anchor-trap is partly self-correcting (both found the right
file), but the hardened prompt's decisive value is **preventing a confident wrong change on
an under-specified request** — exactly what a non-developer needs.

## What templates CAN'T fix (data-level — addressed in the scan prompt)

The anchor still points at the screen-mount line, not the real handler, and carries no
stack framing. Templates now tell the AI to *verify* the anchor, which mitigates it, but the
coordinate itself is imprecise. Fixed at the source in `references/scan-prompts.md`: SCAN now
requires anchoring `file` to the real handler, adds optional `impl` (real logic location) and
`renders` (the production-rendered variant), and captures a `stack` line. `codeRef` consumes
`impl`/`renders` when present (backward-compatible). Regenerating a target app's scan with the
improved prompt closes the residual C1/C5 gap.

## Re-running

`node scripts/extract-prompt.js <built-html>` seeds the 5 fixtures and prints the exported
prompt; paste it to a judge with the rubric above. Keep the fixtures grounded in the target
app's real data so anchors are authentic.
