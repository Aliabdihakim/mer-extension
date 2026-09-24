import type { Cv } from "./cv.js";
import type { Decisions, GapSuggestion, Rewrite } from "./api.js";

/** Read a value at a dotted path like "experience.0.bullets.2". */
export function getAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

function setAtPath(obj: any, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = value;
}

/** Turn a rewrite's proposed string into the right shape for the target field. */
function coerce(current: unknown, proposed: string): unknown {
  if (Array.isArray(current)) return proposed.split(/\s*,\s*/).filter(Boolean);
  return proposed;
}

/**
 * Build the final CV: master CV + accepted rewrites + accepted gap answers.
 * Pure. Never mutates its input.
 */
export function applyChanges(
  cv: Cv,
  rewrites: Rewrite[],
  gaps: GapSuggestion[],
  decisions: Decisions,
): Cv {
  const out: Cv = structuredClone(cv);

  for (const r of rewrites) {
    if (decisions.rewrites[r.id] !== "accepted") continue;
    const current = getAtPath(out, r.path);
    if (current === undefined) continue;
    setAtPath(out, r.path, coerce(current, r.proposed));
  }

  for (const g of gaps) {
    const d = decisions.gaps[g.id];
    if (!d || d.status !== "added" || !d.text.trim()) continue;
    const text = d.text.trim();
    switch (g.suggestedSection) {
      case "skills":
        out.skills.push(text);
        break;
      case "summary":
        out.summary = `${out.summary.trim()} ${text}`.trim();
        break;
      case "experience":
        if (out.experience[0]) out.experience[0].bullets.push(text);
        break;
    }
  }
  return out;
}

/** Same as applyChanges but treats pending rewrites as accepted, for previewing. */
export function previewDecisions(rewrites: Rewrite[], decisions: Decisions): Decisions {
  const rw = { ...decisions.rewrites };
  for (const r of rewrites) if (!rw[r.id] || rw[r.id] === "pending") rw[r.id] = "accepted";
  return { rewrites: rw, gaps: decisions.gaps };
}
