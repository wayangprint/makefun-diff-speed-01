// solve.js — a faster drop-in for makefun-diff 1.0.0.
//
// Same answers as makefun-diff 1.0.0, byte for byte, for every input: the
// common prefix is kept, then the common suffix of what is left; between them
// Myers's greedy search (furthest x on each diagonal, the deletion winning a
// tie) finds the first script that reaches both ends; the patch lists each
// change run's deletions before its insertions, with up to 3 kept lines of
// context, runs at most 6 kept lines apart sharing a hunk.
//
// The speed comes from three changes of representation, not of rule:
//   1. lines are interned to small integers once per case, so the search
//      compares Int32 ids instead of string contents;
//   2. the search keeps one Int32Array snapshot of V per edit distance and
//      backtracks from it, instead of one linked path object per (d, k) step;
//   3. the patch is built from the interned ids and the texts' own line
//      pieces, joined once, with no new string made for a line the patch
//      never prints.

/** The patch's first word. */
export const FORMAT = 'makefun-diff/1';

/** The kept lines a hunk shows before and after each change run. */
export const CONTEXT = 3;

const KEEP = '=';
const DELETE = '-';
const INSERT = '+';

/** makefun-diff 1.0.0's answer for one case's input: its patch, one string. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  return diffPatch(input.old, input.new);
}

/** The runs of the edit script of the middle of A into the middle of B: [{ kind, count }], in order. */
function myersRuns(A, B, a0, b0, n, m) {
  if (n === 0 && m === 0) return [];
  // V[d] is the furthest x reached with d edits on each diagonal k, after its
  // snake; index k + d, -1 where no path of d edits reaches that diagonal.
  const Vs = [];
  let row = new Int32Array(1);
  let x = 0;
  let y = 0;
  while (x < n && y < m && A[a0 + x] === B[b0 + y]) { x++; y++; }
  row[0] = x;
  Vs.push(row);
  if (x >= n && y >= m) return [{ kind: KEEP, count: x }];
  let D = -1;
  let kEnd = 0;
  for (let d = 1; d <= n + m; d++) {
    row = new Int32Array(2 * d + 1);
    row.fill(-1);
    const prev = Vs[d - 1];
    const prevLen = prev.length;
    let done = false;
    for (let k = -d; k <= d; k += 2) {
      const iDel = k + d - 2; // diagonal k - 1 in the previous row
      const iIns = k + d; // diagonal k + 1 in the previous row
      let xDel = -1;
      let xIns = -1;
      let canDel = false;
      let canIns = false;
      if (iDel >= 0 && iDel < prevLen) {
        const v = prev[iDel];
        if (v !== -1 && v < n) { canDel = true; xDel = v; }
      }
      if (iIns >= 0 && iIns < prevLen) {
        const v = prev[iIns];
        if (v !== -1 && v - k - 1 < m) { canIns = true; xIns = v; }
      }
      if (!canDel && !canIns) continue;
      // Furthest into the old text wins; the deletion wins a tie.
      let xx;
      if (canDel && (!canIns || xDel + 1 >= xIns)) xx = xDel + 1;
      else xx = xIns;
      let yy = xx - k;
      while (xx < n && yy < m && A[a0 + xx] === B[b0 + yy]) { xx++; yy++; }
      row[k + d] = xx;
      if (xx >= n && yy >= m) { D = d; kEnd = k; done = true; break; }
    }
    Vs.push(row);
    if (done) break;
  }
  if (D < 0) throw new Error('makefun-diff: the search ended without reaching both ends');
  // Backtrack from (D, kEnd): the snake at each step, then its one edit.
  const ops = [];
  let k = kEnd;
  for (let d = D; d >= 1; d--) {
    const xEnd = Vs[d][k + d];
    const prev = Vs[d - 1];
    const prevLen = prev.length;
    const iDel = k + d - 2;
    const iIns = k + d;
    let xDel = -1;
    let xIns = -1;
    let canDel = false;
    let canIns = false;
    if (iDel >= 0 && iDel < prevLen) {
      const v = prev[iDel];
      if (v !== -1 && v < n) { canDel = true; xDel = v; }
    }
    if (iIns >= 0 && iIns < prevLen) {
      const v = prev[iIns];
      if (v !== -1 && v - k - 1 < m) { canIns = true; xIns = v; }
    }
    let x0;
    let isDel;
    if (canDel && (!canIns || xDel + 1 >= xIns)) { x0 = xDel + 1; isDel = true; }
    else { x0 = xIns; isDel = false; }
    if (xEnd > x0) ops.push({ kind: KEEP, count: xEnd - x0 });
    ops.push({ kind: isDel ? DELETE : INSERT, count: 1 });
    k = isDel ? k - 1 : k + 1;
  }
  const x0 = Vs[0][0];
  if (x0 > 0) ops.push({ kind: KEEP, count: x0 });
  ops.reverse();
  const runs = [];
  for (const op of ops) {
    const last = runs.length === 0 ? undefined : runs[runs.length - 1];
    if (last !== undefined && last.kind === op.kind) last.count += op.count;
    else runs.push({ kind: op.kind, count: op.count });
  }
  return runs;
}

/** make.fun's own patch of oldText into newText. */
function diffPatch(oldText, newText) {
  const aParts = oldText.split('\n');
  const bParts = newText.split('\n');
  const aLast = aParts.length - 1;
  const bLast = bParts.length - 1;
  const n = aLast + (aParts[aLast] !== '' ? 1 : 0);
  const m = bLast + (bParts[bLast] !== '' ? 1 : 0);

  // Intern each distinct line piece once; a line's id is its piece's id times
  // two, plus one when the line is the last and has no "\n" — so two lines
  // share an id exactly when they are the same code units, newline included.
  const intern = new Map();
  let nextId = 0;
  const idFor = (s) => {
    let id = intern.get(s);
    if (id === undefined) { id = nextId++; intern.set(s, id); }
    return id;
  };
  const A = new Int32Array(n);
  const B = new Int32Array(m);
  for (let i = 0; i < aLast; i++) A[i] = idFor(aParts[i]) * 2;
  if (aParts[aLast] !== '') A[aLast] = idFor(aParts[aLast]) * 2 + 1;
  for (let j = 0; j < bLast; j++) B[j] = idFor(bParts[j]) * 2;
  if (bParts[bLast] !== '') B[bLast] = idFor(bParts[bLast]) * 2 + 1;

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;

  const midRuns = myersRuns(A, B, prefix, prefix, n - prefix - suffix, m - prefix - suffix);
  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  for (const r of midRuns) runs.push(r);
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes.length === 0 ? undefined : changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length === 0 ? undefined : hunks[hunks.length - 1];
    const prev = h === undefined ? undefined : h[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  // A line as the patch writes it, from the text's own pieces: its op, the
  // line, a newline, and "%" on a line of its own when it had none.
  const writeOld = (op, i) => (i < aLast ? `${op}${aParts[i]}\n` : `${op}${aParts[i]}\n%\n`);
  const writeNew = (op, j) => (j < bLast ? `${op}${bParts[j]}\n` : `${op}${bParts[j]}\n%\n`);

  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(writeOld(KEEP, at));
      for (let i = 0; i < c.dels; i++) out.push(writeOld(DELETE, c.o + i));
      for (let i = 0; i < c.ins; i++) out.push(writeNew(INSERT, c.p + i));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(writeOld(KEEP, at));
  }
  return out.join('');
}
