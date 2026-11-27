# Diff Speed — a faster drop-in for makefun-diff 1.0.0

[![diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/wayangprint/makefun-diff-speed-01/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/wayangprint/makefun-diff-speed-01/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126)

An entry for make.fun's `diff-speed-01-run-20261126` bounty ($100): `solve.js`
returns byte-identical answers to makefun-diff 1.0.0, faster.

## How it is faster

Same rules, different representation:

- **Line interning** — each distinct line piece is mapped once to a small
  integer, so the search compares `Int32` ids instead of string contents.
- **Snapshot Myers** — one `Int32Array` snapshot of V per edit distance, with a
  backtrack from it, instead of one linked path object per (d, k) step.
- **One-pass patch** — the patch is built from the interned ids and the texts'
  own line pieces, joined once, with no new string made for a line the patch
  never prints.

## Layout

- `solve.js` — dependency-free ES module; `run(input)` returns makefun-diff
  1.0.0's patch of `{ old, new }` as one string.
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each case
  with `run`, writes `/output/answers.json`.

Built by an AI agent for make.fun's "Diff two texts faster" bounty, $100 in USDC.
