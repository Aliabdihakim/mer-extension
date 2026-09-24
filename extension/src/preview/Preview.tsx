import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CvParagraphsResponse } from "@meritio/shared";
import { useAdaptation, loadPersistedDoc, savePersistedDoc, type PersistedDoc } from "../shared/adaptationStore";
import { api } from "../sidepanel/api";
import { liveMatch } from "../shared/match";
import { SuperDocEditor, type EditorHandle, type UserChange } from "../editor/SuperDocEditor";
import { Chat } from "./Chat";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function Preview() {
  const params = new URLSearchParams(location.search);
  const adId = params.get("key") ?? params.get("adId");
  const embedded = params.get("embedded") === "1" || window.parent !== window;
  const close = () => (embedded ? window.parent.postMessage({ type: "meritio:close" }, "*") : window.close());
  useEffect(() => { if (embedded) window.parent.postMessage({ type: "meritio:ready" }, "*"); }, [embedded]);

  const { stored, setGap } = useAdaptation(adId);
  const [docx, setDocx] = useState<ArrayBuffer | null>(null);
  const [paras, setParas] = useState<CvParagraphsResponse | null>(null);
  const [persisted, setPersisted] = useState<PersistedDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [showReqs, setShowReqs] = useState(false);
  const [autoOpenChat, setAutoOpenChat] = useState(false);
  useEffect(() => {
    if (!adId || !stored) return;
    const key = `chatShown:${adId}`;
    chrome.storage.session.get(key).then((r) => {
      if (r[key]) return;
      const hasGaps = stored.response.gaps.some((g) => { const d = stored.decisions.gaps[g.id]; return !(d?.status === "added" && d.text.trim()); });
      if (hasGaps) { setAutoOpenChat(true); chrome.storage.session.set({ [key]: true }); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adId, !!stored]);
  const [changes, setChanges] = useState<UserChange[]>([]);
  const editor = useRef<EditorHandle>(null);
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    api.originalDocx().then((b) => b.arrayBuffer()).then(setDocx).catch((e) => setError("Kunde inte hämta ditt CV: " + e.message));
    api.paragraphs().then(setParas).catch((e) => setError("Kunde inte läsa dokumentets stycken: " + e.message));
    if (adId) loadPersistedDoc(adId).then(setPersisted); else setPersisted(null);
  }, [adId]);

  // Resizable split
  const [sideWidth, setSideWidth] = useState<number>(() => { try { return Number(localStorage.getItem("meritio.sideWidth")) || 260; } catch { return 260; } });
  const dragging = useRef(false);
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX, startW = sideWidth;
    const move = (ev: MouseEvent) => { if (!dragging.current) return; setSideWidth(Math.max(200, Math.min(520, startW - (ev.clientX - startX)))); };
    const up = () => { dragging.current = false; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  useEffect(() => { try { localStorage.setItem("meritio.sideWidth", String(sideWidth)); } catch {} }, [sideWidth]);

  const focus = useCallback((id: string) => { setActive(id); editor.current?.goTo(id); }, []);

  async function download(format: "pdf" | "docx") {
    if (!stored || !editor.current) return;
    setDownloading(format);
    try {
      const base64 = await editor.current.exportFinal();
      const blob = await api.exportDocument(stored.response.ad.id, format, base64);
      const url = URL.createObjectURL(blob);
      const employer = stored.response.ad.employer.replace(/[^\p{L}\p{N} ]+/gu, "").trim() || "annons";
      await chrome.downloads.download({ url, filename: `CV - ${employer}.${format}`, saveAs: true });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  const match = useMemo(() => liveMatch(stored), [stored]);

  if (!adId || !stored) {
    return <div className="empty">Ingen anpassning hittades. Klicka på Meritio-knappen på en annons först.</div>;
  }

  const { ad, cv, rewrites, gaps } = stored.response;
  const pct = match.total ? Math.round((match.covered / match.total) * 100) : 0;
  void rewrites;
  const openCount = changes.length;
  const canEdit = !!docx && !!paras && persisted !== undefined;

  return (
    <>
      <div className="topbar">
        <h1>Meritio</h1>
        <span className="ad"><strong>{ad.title}</strong> · {ad.employer}</span>
        {match.total > 0 && (
          <span className="pillwrap">
            <button className={`matchpill ${match.missing + match.partial > 0 ? "warn" : ""}`} onClick={() => setShowReqs((v) => !v)} title="Visa annonsens krav">
              <span className="bar"><i style={{ width: `${pct}%` }} /></span>
              {match.covered} av {match.total} krav <span className="caret">▾</span>
            </button>
            {showReqs && (
              <div className="reqs-pop" onMouseLeave={() => setShowReqs(false)}>
                {stored.response.fit && <p className="fit">{stored.response.fit}</p>}
                <ul className="reqs">
                  {(stored.response.requirements ?? []).map((q) => {
                    const answered = gaps.some((g) => (g.requirementId ?? g.id) === q.id && stored.decisions.gaps[g.id]?.status === "added" && stored.decisions.gaps[g.id]?.text.trim());
                    const st = answered ? "covered" : q.status;
                    return <li key={q.id} className={`req ${st}`} title={q.evidence ? `I ditt CV: ${q.evidence}` : undefined}><i>{st === "covered" ? "✓" : st === "partial" ? "~" : "–"}</i><span>{q.text}{answered && <em> · tillagt</em>}</span></li>;
                  })}
                </ul>
              </div>
            )}
          </span>
        )}
        <span className="spacer" />
        <span className="ad">{stored.loading ? "Fler förslag på väg…" : status ?? (openCount ? `${openCount} öppna ändringar` : "Inga öppna ändringar")}</span>
        {openCount > 0 && <button onClick={() => editor.current?.acceptAll()} title="Acceptera alla spårade ändringar i dokumentet">Acceptera alla</button>}
        <button onClick={() => download("docx")} disabled={!!downloading || !canEdit}>{downloading === "docx" ? "Hämtar…" : "Ladda ner Word"}</button>
        <button className="primary" onClick={() => download("pdf")} disabled={!!downloading || !canEdit}>{downloading === "pdf" ? "Hämtar…" : "Ladda ner PDF"}</button>
        <button className="close" title="Stäng (Esc)" onClick={close}>✕</button>
      </div>

      {error && <p className="error" style={{ padding: "8px 24px" }}>{error}</p>}

      <div className="toolbar-row">
        <div ref={setToolbarEl} className="sd-toolbar" />
        <span className="doc-hint">Förslagen ligger som spårade ändringar i texten, med motiveringen i bubblan. Acceptera eller avvisa dem där. Det du skriver själv spåras på samma sätt.</span>
      </div>

      <div className="layout single">
        <div className="doc">
          {canEdit ? (
            <SuperDocEditor
              ref={editor}
              toolbarEl={toolbarEl}
              docx={docx!} paras={paras!.paragraphs} mapping={paras!.mapping} stored={stored}
              persisted={persisted ?? null}
              onPersist={(d) => savePersistedDoc(adId, d)}
              onChanges={setChanges}
              onStatus={setStatus}
              onError={setError}
            />
          ) : (
            <div className="doc-loading">Öppnar ditt CV…</div>
          )}
        </div>
      </div>
      <Chat adId={ad.id} stored={stored} editor={editor} onError={setError} autoOpen={autoOpenChat} onGapAnswered={(id, d) => setGap(id, d)} />
    </>
  );
}
