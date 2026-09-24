import type { Cv, Decisions, GapSuggestion, Rewrite, StoredAdaptation } from "@meritio/shared";

export type Mapping = Record<string, number | number[]>;
export interface Para { index: number; text: string }

/** A paragraph that exists only because of a decision (gap answer or user-written line). */
export interface Inserted {
  id: string;                 // gap id or insert id
  kind: "gap" | "insert";
  after: number;              // original paragraph index it follows
  text: string;
}

export interface DocState {
  /** Current text per original paragraph index (after accepted rewrites, gap appends and user edits). */
  text: Map<number, string>;
  /** Which change ids touch each paragraph (for badges). */
  marks: Map<number, string[]>;
  /** Paragraphs to insert after a given original index, in order. */
  inserts: Map<number, Inserted[]>;
  /** For each change id, the original paragraph index it anchors to (badge placement). */
  anchor: Map<string, number>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function replaceWithin(paragraph: string, original: string, proposed: string): string {
  if (paragraph.includes(original)) return paragraph.replace(original, proposed);
  const loose = new RegExp(original.trim().split(/\s+/).map(escapeRe).join("\\s+"), "i");
  if (loose.test(paragraph)) return paragraph.replace(loose, proposed);
  return proposed;
}

const pos = (m: Mapping, path: string): number | undefined => {
  const v = m[path];
  return typeof v === "number" ? v : Array.isArray(v) ? v[0] : undefined;
};

/**
 * Mirror of the server's applyDocx: compute what every paragraph should say given the decisions.
 * Pending rewrites count as accepted (that's how the review shows them).
 */
export function computeDocState(paras: Para[], mapping: Mapping, stored: StoredAdaptation): DocState {
  const { rewrites, gaps, cv } = stored.response;
  const d: Decisions = stored.decisions;
  const text = new Map<number, string>(paras.map((p) => [p.index, p.text]));
  const marks = new Map<number, string[]>();
  const inserts = new Map<number, Inserted[]>();
  const anchor = new Map<string, number>();
  const mark = (pi: number, id: string) => { marks.set(pi, [...(marks.get(pi) ?? []), id]); anchor.set(id, pi); };
  const pushInsert = (after: number, ins: Inserted) => { inserts.set(after, [...(inserts.get(after) ?? []), ins]); anchor.set(ins.id, after); };

  // 1. rewrites
  for (const r of rewrites) {
    const on = (d.rewrites[r.id] ?? "accepted") !== "rejected";
    const target = mapping[r.path];
    const pi = pos(mapping, r.path);
    if (pi === undefined) continue;
    mark(pi, r.id);
    if (!on) continue;
    if (r.path === "skills" && Array.isArray(target)) {
      const items = r.proposed.split(/\s*,\s*/).filter(Boolean);
      if (items.length === target.length) target.forEach((tpi, k) => text.set(tpi, items[k]));
      continue;
    }
    if (typeof target === "number") text.set(target, replaceWithin(text.get(target) ?? "", r.original, r.proposed));
    else if (Array.isArray(target)) { text.set(target[0], r.proposed); for (const t of target.slice(1)) text.set(t, ""); }
  }

  // 2. gaps
  for (const g of gaps) {
    const gd = d.gaps[g.id];
    const placement = gd?.placement ?? (g.suggestedSection === "experience" ? "experience.0" : g.suggestedSection);
    const on = gd?.status === "added" && !!gd.text.trim();
    const t = gd?.text.trim() ?? "";
    const jobIndex = Number(placement.match(/^experience\.(\d+)$/)?.[1] ?? 0);

    if (placement === "summary") {
      const m = mapping["summary"]; const pi = Array.isArray(m) ? m[m.length - 1] : m;
      if (pi === undefined) continue;
      mark(pi, g.id);
      if (on) text.set(pi, `${text.get(pi) ?? ""} ${t}`.trim());
      continue;
    }
    if (placement === "skills") {
      const m = mapping["skills"];
      if (typeof m === "number") {
        mark(m, g.id);
        if (on) { const cur = text.get(m) ?? ""; text.set(m, cur ? `${cur}, ${t}` : t); }
      } else {
        const lines = Array.isArray(m) ? m : (mapping["skills.lines"] as number[] | undefined);
        if (!lines?.length) continue;
        const last = lines[lines.length - 1];
        anchor.set(g.id, last);
        if (on) pushInsert(last, { id: g.id, kind: "gap", after: last, text: t }); else mark(last, g.id);
      }
      continue;
    }
    const bullets = cv.experience[jobIndex]?.bullets ?? [];
    const last = mapping[`experience.${jobIndex}.bullets.${bullets.length - 1}`];
    if (typeof last !== "number") continue;
    anchor.set(g.id, last);
    if (on) pushInsert(last, { id: g.id, kind: "gap", after: last, text: t }); else mark(last, g.id);
  }

  // 3. user edits
  for (const [k, v] of Object.entries(d.edits ?? {})) {
    const pi = Number(k);
    if (!text.has(pi)) continue;
    text.set(pi, v.trim());
    mark(pi, `edit:${k}`);
  }

  // 4. user inserts
  for (const ins of (d.inserts ?? []).filter((i) => i.text.trim())) {
    pushInsert(ins.after, { id: ins.id, kind: "insert", after: ins.after, text: ins.text.trim() });
  }

  return { text, marks, inserts, anchor };
}

/** Helpers used by the editor to label things. */
export function whereLabel(path: string, cv: Cv): string {
  if (path === "summary") return "Profil";
  if (path.startsWith("skills")) return "Kompetenser";
  const m = path.match(/^experience\.(\d+)/);
  if (m) return cv.experience[+m[1]]?.company ?? "Erfarenhet";
  const e = path.match(/^education\.(\d+)/);
  if (e) return cv.education[+e[1]]?.school ?? "Utbildning";
  return path;
}

export type { Rewrite, GapSuggestion };
