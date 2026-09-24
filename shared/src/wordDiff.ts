/** Minimal word-level LCS diff. Good enough for short CV fields; swap for `diff` package later. */
export type DiffPart = { kind: "same" | "del" | "ins"; text: string };

/** Words compare equal ignoring trailing punctuation, so "PostgreSQL," and "PostgreSQL" don't count as a change. */
const key = (w: string) => w.replace(/[,.;:!?]+$/, "").toLowerCase();

export function wordDiff(a: string, b: string): DiffPart[] {
  const aw = a.split(/\s+/).filter(Boolean);
  const bw = b.split(/\s+/).filter(Boolean);
  const n = aw.length, m = bw.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = key(aw[i]) === key(bw[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const out: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    // "same" keeps the new token so punctuation follows the new text.
    if (key(aw[i]) === key(bw[j])) { out.push({ kind: "same", text: bw[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: "del", text: aw[i] }); i++; }
    else { out.push({ kind: "ins", text: bw[j] }); j++; }
  }
  while (i < n) out.push({ kind: "del", text: aw[i++] });
  while (j < m) out.push({ kind: "ins", text: bw[j++] });
  return out;
}

/**
 * A diff that is mostly churn (e.g. a reordered list) is unreadable word by word.
 * Then show the whole old text struck and the whole new text added.
 */
export function readableDiff(a: string, b: string): DiffPart[] {
  const parts = wordDiff(a, b);
  const same = parts.filter((p) => p.kind === "same").length;
  const total = Math.max(1, parts.length);
  if (same / total < 0.5 && a.trim() && b.trim()) return [{ kind: "del", text: a.trim() }, { kind: "ins", text: b.trim() }];
  return parts;
}
