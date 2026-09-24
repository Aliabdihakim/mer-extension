import { useEffect, useState, useCallback } from "react";
import type { AdaptEvent, AdaptResponse, Decisions, ExtMessage, GapDecision, RewriteDecision, StoredAdaptation } from "@meritio/shared";

/** `adId` here is the adaptation key "source:id". */
const key = (adId: string) => `adaptation:${adId}`;

export async function loadAdaptation(adId: string): Promise<StoredAdaptation | null> {
  const r = await chrome.storage.session.get(key(adId));
  return (r[key(adId)] as StoredAdaptation) ?? null;
}

export async function saveAdaptation(adId: string, value: StoredAdaptation) {
  await chrome.storage.session.set({ [key(adId)]: value });
}

export interface PersistedDoc { docxBase64: string; tcMap: Record<string, string[]> }
const docKey = (adId: string) => `editordoc:${adId}`;
export async function loadPersistedDoc(adId: string): Promise<PersistedDoc | null> {
  const r = await chrome.storage.session.get(docKey(adId));
  return (r[docKey(adId)] as PersistedDoc) ?? null;
}
export async function savePersistedDoc(adId: string, d: PersistedDoc | null) {
  if (d) await chrome.storage.session.set({ [docKey(adId)]: d });
  else await chrome.storage.session.remove(docKey(adId));
}

export function emptyDecisions(): Decisions {
  return { rewrites: {}, gaps: {} };
}

/** Live view of one adaptation, shared across all extension pages via chrome.storage.session. */
export function useAdaptation(adId: string | null) {
  const [stored, setStored] = useState<StoredAdaptation | null>(null);

  useEffect(() => {
    setStored(null);
    if (!adId) return;
    loadAdaptation(adId).then(setStored);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (key(adId) in changes) setStored(changes[key(adId)].newValue ?? null);
    };
    chrome.storage.session.onChanged.addListener(onChange);
    return () => chrome.storage.session.onChanged.removeListener(onChange);
  }, [adId]);

  const setResponse = useCallback(
    async (response: AdaptResponse) => {
      if (adId) await saveAdaptation(adId, { response, decisions: emptyDecisions() });
    },
    [adId],
  );

  /** Apply one streamed event to the stored adaptation. */
  const applyEvent = useCallback(
    async (e: AdaptEvent) => {
      if (!adId) return;
      if (e.type === "start") {
        await saveAdaptation(adId, {
          response: { ad: e.ad, cv: e.cv, requirements: [], matchSummary: { covered: 0, total: 0 }, rewrites: [], gaps: [] },
          decisions: emptyDecisions(),
          loading: true,
        });
        return;
      }
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      if (e.type === "fit") cur.response.fit = e.fit;
      else if (e.type === "requirement") { cur.response.requirements = [...(cur.response.requirements ?? []), e.requirement]; }
      else if (e.type === "match") cur.response.matchSummary = e.matchSummary;
      else if (e.type === "rewrite") cur.response.rewrites.push(e.rewrite);
      else if (e.type === "gap") {
        cur.response.gaps.push(e.gap);
        if (e.gap.prefill && !cur.decisions.gaps[e.gap.id]) {
          cur.decisions.gaps[e.gap.id] = { status: "added", text: e.gap.prefill.text, answer: e.gap.prefill.answer, placement: e.gap.prefill.placement };
        }
      }
      else if (e.type === "done") {
        cur.response = e.result;
        cur.loading = false;
        for (const g of e.result.gaps) {
          if (g.prefill && !cur.decisions.gaps[g.id]) {
            cur.decisions.gaps[g.id] = { status: "added", text: g.prefill.text, answer: g.prefill.answer, placement: g.prefill.placement };
          }
        }
      }
      else if (e.type === "error") { cur.loading = false; }
      await saveAdaptation(adId, cur);
    },
    [adId],
  );

  const setRewrite = useCallback(
    async (id: string, d: RewriteDecision) => {
      if (!adId) return;
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      cur.decisions.rewrites[id] = d;
      await saveAdaptation(adId, cur);
    },
    [adId],
  );

  const setGap = useCallback(
    async (id: string, d: Partial<GapDecision>) => {
      if (!adId) return;
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      const prev: GapDecision = cur.decisions.gaps[id] ?? { status: "pending", text: "" };
      cur.decisions.gaps[id] = { ...prev, ...d };
      await saveAdaptation(adId, cur);
    },
    [adId],
  );

  /** Set (or clear with null) the user's own text for a paragraph. */
  const setEdit = useCallback(
    async (paragraphIndex: number, text: string | null) => {
      if (!adId) return;
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      cur.decisions.edits = cur.decisions.edits ?? {};
      if (text === null) delete cur.decisions.edits[String(paragraphIndex)];
      else cur.decisions.edits[String(paragraphIndex)] = text;
      await saveAdaptation(adId, cur);
    },
    [adId],
  );

  /** Create or update a paragraph the user wrote (id chosen by the editor). Empty/null text removes it. */
  const upsertInsert = useCallback(
    async (id: string, after: number, text: string | null) => {
      if (!adId) return;
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      const list = cur.decisions.inserts ?? [];
      const t = text?.trim() ?? "";
      const existing = list.find((i) => i.id === id);
      if (!t) cur.decisions.inserts = list.filter((i) => i.id !== id);
      else if (existing) cur.decisions.inserts = list.map((i) => (i.id === id ? { ...i, text: t } : i));
      else cur.decisions.inserts = [...list, { id, after, text: t }];
      await saveAdaptation(adId, cur);
    },
    [adId],
  );
  const addInsert = useCallback((after: number, text: string) => upsertInsert(`ins:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`, after, text), [upsertInsert]);
  const updateInsert = useCallback(
    async (id: string, text: string | null) => {
      if (!adId) return;
      const cur = await loadAdaptation(adId);
      if (!cur) return;
      const list = cur.decisions.inserts ?? [];
      cur.decisions.inserts = text === null ? list.filter((i) => i.id !== id) : list.map((i) => (i.id === id ? { ...i, text } : i));
      await saveAdaptation(adId, cur);
    },
    [adId],
  );

  const acceptAll = useCallback(async () => {
    if (!adId) return;
    const cur = await loadAdaptation(adId);
    if (!cur) return;
    for (const r of cur.response.rewrites) if (cur.decisions.rewrites[r.id] !== "rejected") cur.decisions.rewrites[r.id] = "accepted";
    await saveAdaptation(adId, cur);
  }, [adId]);

  return { stored, setResponse, applyEvent, setRewrite, setGap, setEdit, addInsert, upsertInsert, updateInsert, acceptAll };
}

export async function openPreview(adaptationKey: string) {
  const url = chrome.runtime.getURL(`src/preview/index.html?key=${encodeURIComponent(adaptationKey)}`);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: "OPEN_OVERLAY", adId: adaptationKey } satisfies ExtMessage);
      return;
    }
  } catch {}
  chrome.tabs.create({ url });
}
