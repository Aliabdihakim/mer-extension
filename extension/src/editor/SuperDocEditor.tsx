import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { SuperDoc, DOCX } from "superdoc";
import type { StoredAdaptation, GapSuggestion, Rewrite } from "@meritio/shared";
import type { Mapping, Para } from "./docState";
import { bundledFamilies, fontMap, fontOptions } from "./fonts";

/** One of the user's own tracked changes, as listed for the sidebar. */
export interface UserChange { id: string; type: string; text: string }

export interface EditorHandle {
  /** Final document (all open tracked changes accepted, reason comments removed) as base64 DOCX. */
  exportFinal(): Promise<string>;
  /** Accept every open tracked change. */
  acceptAll(): Promise<void>;
  /** Scroll to the tracked change(s) of a suggestion or gap, or a user change id. */
  goTo(id: string): Promise<void>;
  /** Reject (remove) one of the user's own tracked changes. */
  removeUserChange(id: string): Promise<void>;
}

interface Props {
  docx: ArrayBuffer;
  paras: Para[];
  mapping: Mapping;
  stored: StoredAdaptation;
  /** Persisted review state from an earlier session (base64 DOCX + id map), if any. */
  persisted?: { docxBase64: string; tcMap: Record<string, string[]> } | null;
  onPersist: (state: { docxBase64: string; tcMap: Record<string, string[]> }) => void;
  /** All open tracked changes in the document (suggestions and the user's own). */
  onChanges: (changes: UserChange[]) => void;
  onStatus: (s: string | null) => void;
  onError: (e: string) => void;
  /** Where the formatting toolbar renders (an element owned by the page). */
  toolbarEl?: HTMLElement | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The CV in SuperDoc. Suggestions and gap answers become real Word tracked changes;
 * the user's typing is tracked too (suggesting mode). Export "final" applies everything that is on.
 */
export const SuperDocEditor = forwardRef<EditorHandle, Props>(function SuperDocEditor(p, ref) {
  const host = useRef<HTMLDivElement>(null);
  const sd = useRef<SuperDoc | null>(null);
  const docRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  /** suggestion/gap id -> tracked change ids it produced */
  const tcMap = useRef<Record<string, string[]>>({});
  /** gap id -> the text+placement currently applied (to know when to re-apply) */
  const gapApplied = useRef<Record<string, string>>({});
  const propsRef = useRef(p);
  propsRef.current = p;
  const busy = useRef(Promise.resolve());
  const queue = (fn: () => Promise<void>) => { busy.current = busy.current.then(fn).catch((e) => propsRef.current.onError(String((e as Error).message ?? e))); return busy.current; };

  // ---- mount once
  useEffect(() => {
    if (!host.current) return;
    let destroyed = false;
    const source = p.persisted ? b64ToBytes(p.persisted.docxBase64) : new Uint8Array(p.docx);
    if (p.persisted) tcMap.current = { ...p.persisted.tcMap };
    const instance = new SuperDoc({
      selector: host.current,
      document: { data: new Blob([source as BlobPart], { type: DOCX }), type: DOCX, name: "cv.docx" },
      documentMode: "suggesting",
      user: { name: "Du", email: "you@meritio.app" },
      fonts: { families: bundledFamilies, map: fontMap() },
      ui: { toolbar: { container: p.toolbarEl ?? undefined, fontOptions } },
      onReady: () => {
        if (destroyed) return;
        docRef.current = instance.activeEditor?.doc ?? null;
        setReady(true);
      },
      onContentError: ({ error }: any) => propsRef.current.onError("Kunde inte öppna dokumentet: " + (error?.message ?? String(error))),
      onException: ({ error }: any) => console.error("[meritio] superdoc", error),
      onEditorUpdate: () => schedulePersist(),
    } as any);
    sd.current = instance;
    return () => { destroyed = true; try { instance.destroy(); } catch {} sd.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- persist + user-change listing, debounced
  const persistTimer = useRef<number>();
  const schedulePersist = () => {
    window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => queue(async () => {
      const doc = docRef.current; if (!doc) return;
      await refreshUserChanges();
      const r = await doc.export.toDocx({ mode: "review-preserving" });
      propsRef.current.onPersist({ docxBase64: r.contentBase64, tcMap: tcMap.current });
    }), 1200);
  };

  const listChanges = async (): Promise<any[]> => {
    const doc = docRef.current; if (!doc) return [];
    const r = await doc.trackChanges.list({ limit: 500, in: "all" });
    return (r?.items ?? []).map((it: any) => ({ ...it, id: it.id ?? it.address?.entityId }));
  };

  const refreshUserChanges = async () => {
    const items = await listChanges();
    const alive = new Set(items.map((i) => i.id));
    // suggestions/gaps whose tracked changes were decided in the document: forget them (decisions are final)
    for (const [sid, ids] of Object.entries(tcMap.current)) {
      if (ids.length && !ids.some((id) => alive.has(id))) { delete tcMap.current[sid]; }
    }
    propsRef.current.onChanges(items.map((i) => ({ id: i.id, type: i.type, text: i.insertedText || i.excerpt || "" })));
  };

  // ---- applying suggestions as tracked changes
  const findText = async (pattern: string) => {
    const doc = docRef.current;
    const m = await doc.query.match({ select: { type: "text", pattern, caseSensitive: true }, require: "first" });
    const it = m?.items?.[0];
    return it && it.matchKind === "text" ? it : null;
  };

  /** Run a mutation and return the tracked-change ids it created. */
  const tracked = async (fn: () => Promise<unknown>): Promise<string[]> => {
    const before = new Set((await listChanges()).map((i) => i.id));
    await fn();
    return (await listChanges()).map((i) => i.id).filter((id) => !before.has(id));
  };

  const applyRewrite = async (r: Rewrite) => {
    const doc = docRef.current;
    let it = await findText(r.original);
    if (!it) {
      // Whitespace/punctuation differences: find the paragraph by content and replace its visible text.
      const b = await findBlock(r.original);
      if (!b) { propsRef.current.onError(`Förslag för ${r.path} kunde inte placeras: texten hittades inte.`); return; }
      const vis = visibleText(b).trim();
      const m = await doc.query.match({ select: { type: "text", pattern: vis.slice(0, 120), caseSensitive: true }, require: "first", within: { kind: "block", nodeType: b.type === "heading" || b.type === "listItem" ? b.type : "paragraph", nodeId: b.nodeId } });
      const first = m?.items?.[0];
      if (!first || first.matchKind !== "text") { propsRef.current.onError(`Förslag för ${r.path} kunde inte placeras.`); return; }
      // select from the match start to the end of the paragraph's last words
      const tail = await doc.query.match({ select: { type: "text", pattern: vis.split(/\s+/).slice(-3).join(" "), caseSensitive: true }, require: "first", within: { kind: "block", nodeType: b.type === "heading" || b.type === "listItem" ? b.type : "paragraph", nodeId: b.nodeId } });
      const last = tail?.items?.[0];
      it = { ...first, target: { ...first.target, end: last && last.matchKind === "text" ? last.target.end : first.target.end } };
    }
    const ids = await tracked(() => doc.replace({ target: it!.target, text: r.proposed }, { changeMode: "tracked" }));
    tcMap.current[r.id] = ids;
    // The reason travels with the change as a comment on it (stripped from the final export).
    const reason = "Motivering: " + [r.why || r.reason, r.adds && `Lyfter fram ${lc(r.adds)}`, r.removes && `tonar ner ${lc(r.removes)}`].filter(Boolean).join(". ").replace(/\.\./g, ".");
    if (ids[0] && reason) { try { await doc.comments.create({ trackedChangeId: ids[0], text: reason }); } catch (e) { console.warn("[meritio] comment", e); } }
  };

  const rejectIds = async (ids: string[]) => {
    const doc = docRef.current;
    if (!ids.length) return;
    try { await doc.trackChanges.decide({ decision: "reject", target: { kind: "ids", ids } }); }
    catch { for (const id of ids) { try { await doc.trackChanges.decide({ decision: "reject", target: { kind: "id", id } }); } catch {} } }
  };

  /** Text of the original paragraph a gap should attach to. */
  const gapAnchor = (g: GapSuggestion, placement: string): { text: string; mode: "append" | "after" } | null => {
    const { paras, mapping, stored } = propsRef.current;
    const cv = stored.response.cv;
    const textOf = (pi: number) => paras.find((x) => x.index === pi)?.text ?? "";
    if (placement === "summary") { const m = mapping["summary"]; const pi = Array.isArray(m) ? m[m.length - 1] : m; return pi === undefined ? null : { text: textOf(pi), mode: "append" }; }
    if (placement === "skills") {
      const m = mapping["skills"];
      if (typeof m === "number") return { text: textOf(m), mode: "append" };
      const lines = Array.isArray(m) ? m : (mapping["skills.lines"] as number[] | undefined);
      if (!lines?.length) return null;
      return { text: textOf(lines[lines.length - 1]), mode: "after" };
    }
    const job = Number(placement.match(/^experience\.(\d+)$/)?.[1] ?? 0);
    const bullets = cv.experience[job]?.bullets ?? [];
    const last = mapping[`experience.${job}.bullets.${bullets.length - 1}`];
    return typeof last === "number" ? { text: textOf(last), mode: "after" } : null;
  };

  /** What a block currently reads on screen (inserted text kept, deleted text dropped). */
  const visibleText = (b: any): string => {
    if (!Array.isArray(b?.textSpans)) return String(b?.text ?? "");
    return b.textSpans.filter((sp: any) => !(sp.trackedChanges ?? []).some((t: any) => /del/i.test(String(t.type)))).map((sp: any) => sp.text).join("");
  };
  const toks = (t: string) => norm(t).split(" ").filter((x) => x.length >= 3);

  /** The block that best matches `anchorText`, in whatever state it is in now. */
  const findBlock = async (anchorText: string): Promise<any | null> => {
    const doc = docRef.current;
    const blocks = ((await doc.extract({})).blocks ?? []) as any[];
    const want = new Set(toks(anchorText));
    if (!want.size) return null;
    let best: { b: any; s: number } | null = null;
    for (const b of blocks) {
      const have = toks(String(b.text ?? ""));
      if (!have.length) continue;
      const hit = have.filter((t) => want.has(t)).length;
      const score = hit / Math.max(want.size, have.length);
      if (score > (best?.s ?? 0.45)) best = { b, s: score };
    }
    return best?.b ?? null;
  };

  const applyGap = async (g: GapSuggestion, text: string, placement: string) => {
    const doc = docRef.current;
    const a = gapAnchor(g, placement);
    if (!a || !a.text) { propsRef.current.onError(`Kunde inte placera raden för "${g.requirement}": hittar ingen plats i dokumentet.`); return; }
    const block = await findBlock(a.text);
    if (!block) { propsRef.current.onError(`Kunde inte placera raden för "${g.requirement}": stycket hittades inte.`); return; }
    const blockAddr = { kind: "block", nodeType: block.type === "heading" || block.type === "listItem" ? block.type : "paragraph", nodeId: block.nodeId };
    let ids: string[] = [];
    if (a.mode === "append") {
      // Insert at the end of the paragraph: find its last words on screen and use the end of that match.
      const vis = visibleText(block).trim();
      const tailWords = vis.split(/\s+/).slice(-4).join(" ");
      const m = await doc.query.match({ select: { type: "text", pattern: tailWords, caseSensitive: true }, require: "first", within: blockAddr });
      const it = m?.items?.[0];
      if (!it || it.matchKind !== "text") { propsRef.current.onError(`Kunde inte placera raden för "${g.requirement}": slutet av stycket hittades inte.`); return; }
      const sep = placement === "skills" ? ", " : " ";
      const point = it.target.end;
      ids = await tracked(() => doc.insert({ target: { kind: "selection", start: point, end: point }, value: sep + text }, { changeMode: "tracked" }));
    } else {
      let node: any = null;
      try { node = (await doc.getNodeById({ nodeId: block.nodeId })).node; } catch {}
      const clone = cloneParagraphWithText(node, text);
      ids = await tracked(() =>
        clone
          ? doc.insert({ target: blockAddr, placement: "after", content: clone }, { changeMode: "tracked" })
          : doc.insert({ target: blockAddr, placement: "after", value: `<p>${escapeHtml(text)}</p>`, type: "html" }, { changeMode: "tracked" }),
      );
      if (!clone) console.warn("[meritio] gap inserted without style copy; anchor node kind:", node?.kind);
    }
    if (!ids.length) { propsRef.current.onError(`Raden för "${g.requirement}" kunde inte läggas in.`); return; }
    tcMap.current[g.id] = ids;
    gapApplied.current[g.id] = `${placement}|${text}`;
  };

  // ---- sync decisions -> document
  const lastSynced = useRef<string>("");
  /** Suggestions already put into the document (this session or a persisted one). */
  const applied = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ready) return;
    const { stored } = p;
    const key = JSON.stringify({ g: stored.decisions.gaps, n: stored.response.rewrites.length + stored.response.gaps.length, ids: stored.response.rewrites.map((r) => r.id) });
    if (key === lastSynced.current) return;
    lastSynced.current = key;
    queue(async () => {
      propsRef.current.onStatus("Uppdaterar dokumentet…");
      if (propsRef.current.persisted) {
        // Resumed: everything in the persisted map was applied earlier; anything decided since is simply gone.
        for (const id of Object.keys(propsRef.current.persisted.tcMap)) applied.current.add(id);
        for (const id of Object.keys(propsRef.current.persisted.tcMap)) if (id.startsWith("gap")) gapApplied.current[id] = gapApplied.current[id] ?? "persisted";
      }
      // Suggestions go into the document once. Deciding them is done in the document (accept/reject bubbles).
      for (const r of stored.response.rewrites) {
        if (applied.current.has(r.id)) continue;
        applied.current.add(r.id);
        await applyRewrite(r);
      }
      for (const g of stored.response.gaps) {
        const gd = stored.decisions.gaps[g.id];
        const on = gd?.status === "added" && !!gd.text.trim();
        const placement = gd?.placement ?? (g.suggestedSection === "experience" ? "experience.0" : g.suggestedSection);
        const want = on ? `${placement}|${gd!.text.trim()}` : "";
        const have = gapApplied.current[g.id] ?? "";
        if (have === "persisted") { if (on) { gapApplied.current[g.id] = want; continue; } }
        if (want !== have) {
          if (tcMap.current[g.id]?.length) { await rejectIds(tcMap.current[g.id]); delete tcMap.current[g.id]; delete gapApplied.current[g.id]; }
          if (on) await applyGap(g, gd!.text.trim(), placement);
        }
      }
      propsRef.current.onStatus(null);
      schedulePersist();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.stored]);

  useImperativeHandle(ref, () => ({
    async exportFinal() {
      await busy.current;
      // SuperDoc.export strips comments ("clean") and applies open tracked changes (final).
      try {
        const blob = await sd.current!.export({ exportType: ["docx"], commentsType: "clean", isFinalDoc: true, triggerDownload: false });
        if (blob && blob.size > 0) return bytesToB64(new Uint8Array(await blob.arrayBuffer()));
      } catch (e) { console.warn("[meritio] SuperDoc.export failed, falling back", e); }
      const r = await docRef.current.export.toDocx({ mode: "final" });
      return r.contentBase64 as string;
    },
    async acceptAll() {
      await queue(async () => {
        try { await docRef.current.trackChanges.decide({ decision: "accept", target: { kind: "all", story: "all" } }); }
        catch { await docRef.current.trackChanges.decide({ decision: "accept", target: { kind: "all" } }); }
        await refreshUserChanges();
      });
      schedulePersist();
    },
    async goTo(id) {
      const ids = tcMap.current[id] ?? [id];
      const items = await listChanges();
      const it = items.find((i) => ids.includes(i.id));
      if (!it) return;
      try { await sd.current?.navigateTo(it.navigationTarget ?? it.address); } catch { try { await sd.current?.scrollToElement(it.id); } catch {} }
    },
    async removeUserChange(id) {
      await queue(async () => { await rejectIds([id]); await refreshUserChanges(); });
      schedulePersist();
    },
  }), []);

  return (
    <div className="sd-editor">
      {!ready && <div className="doc-loading">Öppnar ditt CV…</div>}
      <div ref={host} className="sd-host" />
    </div>
  );
});

// ---- helpers
const lc = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, "") : t);
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

/** A paragraph shaped like `node` (same style, list membership, first run's formatting) containing only `text`. */
function cloneParagraphWithText(node: any, text: string): any | null {
  if (!node || (node.kind !== "paragraph" && node.kind !== "heading")) return null;
  const body = node.kind === "paragraph" ? node.paragraph : node.heading;
  const firstRun = (body?.inlines ?? []).find((i: any) => i.kind === "run");
  const run = { kind: "run", run: { text, ...(firstRun?.run?.styleRef ? { styleRef: firstRun.run.styleRef } : {}), ...(firstRun?.run?.props ? { props: firstRun.run.props } : {}) } };
  const { id, paragraphIds, ...rest } = node;
  void id; void paragraphIds;
  if (node.kind === "paragraph") return { ...rest, paragraph: { ...body, inlines: [run], resolved: undefined, provenance: undefined } };
  return { ...rest, heading: { ...body, inlines: [run], resolved: undefined, provenance: undefined } };
}
