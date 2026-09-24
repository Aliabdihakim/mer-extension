import type { StoredAdaptation } from "@meritio/shared";

/**
 * Match numbers from the requirement verdicts. A gap the user has answered (switched on)
 * counts its requirement as covered. Falls back to the old summary when no requirements exist.
 */
export function liveMatch(stored: StoredAdaptation | null | undefined) {
  if (!stored) return { covered: 0, total: 0, base: 0, filled: 0, partial: 0, missing: 0 };
  const { requirements = [], gaps, matchSummary } = stored.response;
  const answered = new Set(
    gaps.filter((g) => { const d = stored.decisions.gaps[g.id]; return d?.status === "added" && !!d.text.trim(); }).map((g) => g.requirementId ?? g.id),
  );
  if (!requirements.length) {
    const filled = answered.size;
    const total = gaps.length ? matchSummary.covered + gaps.length : matchSummary.total;
    return { covered: Math.min(total, matchSummary.covered + filled), total, base: matchSummary.covered, filled, partial: 0, missing: gaps.length - filled };
  }
  const base = requirements.filter((q) => q.status === "covered").length;
  const filled = requirements.filter((q) => q.status !== "covered" && answered.has(q.id)).length;
  const partial = requirements.filter((q) => q.status === "partial" && !answered.has(q.id)).length;
  const missing = requirements.filter((q) => q.status === "missing" && !answered.has(q.id)).length;
  return { covered: base + filled, total: requirements.length, base, filled, partial, missing };
}
