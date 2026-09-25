import { useEffect, useRef, useState } from "react";
import type { ChatMessage, GapSuggestion, StoredAdaptation, GapDecision } from "@meritio/shared";
import { api } from "../sidepanel/api";
import type { EditorHandle } from "../editor/SuperDocEditor";

const STARTERS = ["Vilka krav saknar jag helt?", "Gör profiltexten kortare", "Jag har mer erfarenhet som inte står i CV:t"];

interface Props {
  adId: string;
  stored: StoredAdaptation;
  editor: React.RefObject<EditorHandle | null>;
  onError: (e: string) => void;
  onGapAnswered: (gapId: string, d: Partial<GapDecision>) => void;
  /** Open the conversation on first use when there are unanswered gaps. */
  autoOpen: boolean;
}

/** Floating chat bar at the bottom centre. The gap questions live here as chips. */
export function Chat({ adId, stored, editor, onError, onGapAnswered, autoOpen }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  /** Closed with the ✕: focusing the field no longer pops the panel back up until the user sends something. */
  const closedByUser = useRef(false);
  const close = () => { closedByUser.current = true; setOpen(false); };
  void autoOpen;
  /** Gap being answered via the chips flow: which requirement, and where the user chose to put it. */
  const [pending, setPending] = useState<{ gap: GapSuggestion; placement?: string; label?: string } | null>(null);
  const cv = stored.response.cv;
  const placements = [
    ...cv.experience.map((e, i) => ({ value: `experience.${i}`, label: `${e.title}, ${e.company}` })),
    { value: "skills", label: "Kompetenser" },
    ...(cv.summary ? [{ value: "summary", label: "Profil" }] : []),
  ];
  const log = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const openGaps: GapSuggestion[] = stored.response.gaps.filter((g) => { const d = stored.decisions.gaps[g.id]; return !(d?.status === "added" && d.text.trim()) && d?.status !== "skipped"; });

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [messages, busy, open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function send(text: string) {
    const t0 = text.trim();
    if (!t0 || busy || !editor.current) return;
    const answering = pending?.placement ? pending : null;
    const t = answering ? `Angående "${answering.gap.requirement}" (Placering: ${answering.label}): ${t0}` : t0;
    const next: ChatMessage[] = [...messages, { role: "user", content: t }];
    setPending(null);
    closedByUser.current = false;
    setMessages(next); setInput(""); setBusy(true); setOpen(true);
    try {
      const [document, selection] = await Promise.all([editor.current.documentText(), editor.current.selectionText()]);
      const r = await api.chat({ adId, messages: next, document, selection: selection || undefined });
      let reply = r.reply;
      let applied = 0;
      if (r.ops.length) {
        applied = await editor.current.applyOps(r.ops);
        if (applied < r.ops.length) reply += `\n(${r.ops.length - applied} ändring${r.ops.length - applied === 1 ? "" : "ar"} kunde inte placeras i dokumentet.)`;
      }
      // The gap was answered through the chat and the line is already in the document: don't insert it again.
      if (answering && applied > 0) {
        const inserted = r.ops.find((o) => o.type !== "delete") as { text?: string } | undefined;
        onGapAnswered(answering.gap.id, { status: "added", text: inserted?.text ?? t0, answer: t0, placement: answering.placement, viaChat: true });
      }
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      onError((e as Error).message);
      setMessages(next.slice(0, -1));
      setInput(t);
    } finally { setBusy(false); }
  }

  function askAbout(g: GapSuggestion) {
    setOpen(true);
    setPending({ gap: g });
    setMessages((m) => [...m, { role: "assistant", content: `${g.requirement} – var i ditt CV hör det hemma?` }]);
    setInput("");
  }

  function choosePlacement(value: string, label: string) {
    if (!pending) return;
    setPending({ ...pending, placement: value, label });
    const q = value === "skills"
      ? `Okej, under Kompetenser. Vad ska stå? Ett eller två ord räcker, t.ex. "${pending.gap.requirement}".`
      : value === "summary"
        ? "Okej, i profilen. Skriv en kort mening om det, så lägger jag in den."
        : `Okej, under ${label}. Vad gjorde du? En rad räcker, så skriver jag den i din stil.`;
    setMessages((m) => [...m, { role: "user", content: `Placering: ${label}` }, { role: "assistant", content: q }]);
    setTimeout(() => field.current?.focus(), 50);
  }

  return (
    <div className={`chatbar ${open ? "open" : ""}`} ref={box}>
      {open && (
        <div className="chat-pop">
          <div className="chat-head">
            <span className="chat-title"><span className="chat-mark">M</span>Meritio</span>
            <button type="button" className="chat-close" title="Stäng" aria-label="Stäng chatten" onClick={close}>✕</button>
          </div>
          <div className="chat-log" ref={log}>
            {openGaps.length > 0 && (
              <div className="msg assistant gaps">
                Annonsen efterfrågar {openGaps.length === 1 ? "en sak" : `${openGaps.length} saker`} som inte syns i ditt CV. Har du det? Klicka och berätta kort, så skriver jag raden i din stil.
                <div className="chips">
                  {openGaps.map((g) => <button key={g.id} onClick={() => askAbout(g)}>{g.requirement}</button>)}
                </div>
              </div>
            )}
            {messages.length === 0 && (
              <div className="chat-empty">
                {openGaps.length === 0 && <p>Be om ändringar, ställ frågor, eller berätta om erfarenhet som inte står i CV:t. Ändringar visas som spårade ändringar i dokumentet.</p>}
                <div className="chat-starters">{STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
              </div>
            )}
            {messages.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
            {pending && !pending.placement && (
              <div className="chips">
                {placements.map((p) => <button key={p.value} onClick={() => choosePlacement(p.value, p.label)}>{p.label}</button>)}
              </div>
            )}
            {busy && <div className="msg assistant thinking">…</div>}
          </div>
        </div>
      )}
      <form className="chat-pill" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <button type="button" className="chat-icon" title={open ? "Stäng" : "Öppna chatten"} onClick={() => (open ? close() : (closedByUser.current = false, setOpen(true)))}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z"/></svg>
          {openGaps.length > 0 && !open && <span className="dotbadge">{openGaps.length}</span>}
        </button>
        <input ref={field} value={input} placeholder="Fråga Meritio eller be om en ändring…" disabled={busy} onFocus={() => { if (!closedByUser.current) setOpen(true); }} onChange={(e) => setInput(e.target.value)} />
        <button className="chat-send" disabled={busy || !input.trim()} title="Skicka">↑</button>
      </form>
    </div>
  );
}
