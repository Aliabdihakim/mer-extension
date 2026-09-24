import { useState } from "react";
import type { Cv, GapDecision, GapSuggestion } from "@meritio/shared";
import { api } from "../sidepanel/api";
import type { Cv as CvType } from "@meritio/shared";

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
  );
}

function placementOptions(cv: CvType) {
  return [
    ...cv.experience.map((e, i) => ({ value: `experience.${i}`, label: `${e.title}, ${e.company}` })),
    { value: "skills", label: "Kompetenser" },
    ...(cv.summary ? [{ value: "summary", label: "Profiltext" }] : []),
  ];
}

interface Props {
  label: string;
  gap: GapSuggestion;
  decision?: GapDecision;
  cv: Cv;
  adId: string;
  active: boolean;
  onChange: (d: Partial<GapDecision>) => void;
  onHover: () => void;
  onClick: () => void;
}

export function GapCard({ label, gap: g, decision, cv, adId, active, onChange, onHover, onClick }: Props) {
  const status = decision?.status ?? "pending";
  const on = status === "added" && !!decision?.text.trim();
  const answer = decision?.answer ?? "";
  const placement = decision?.placement ?? (g.suggestedSection === "experience" ? "experience.0" : g.suggestedSection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  async function write() {
    setBusy(true);
    setError(null);
    try {
      const { text } = await api.writeGap({ adId, gapId: g.id, answer, placement });
      onChange({ text, status: "added", placement });
      api.saveFact({ requirement: g.requirement, answer, text, placement }).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id={`card-${g.id}`} className={`change gap ${on ? "on" : "off"} ${active ? "active" : ""} ${status === "skipped" ? "skipped" : ""}`} onMouseEnter={onHover} onClick={onClick}>
      <div className="change-head">
        <span className={`num gap ${on ? "on" : "off"}`}>{label}</span>
        <span className="where">Saknas i ditt CV</span>
        {on && <Switch on={on} onChange={(v) => onChange({ status: v ? "added" : "pending" })} />}
      </div>

      <p className="text"><strong>{g.requirement}</strong></p>
      {on ? (
        <p className="why-text remembered">✓ {g.prefill ? "Förifyllt från tidigare svar och tillagt i dokumentet." : "Tillagt i dokumentet som spårad ändring."}</p>
      ) : (
        <p className="why-text">{g.question}</p>
      )}

      {status === "pending" && (
        <div className="row" onClick={stop}>
          <button className="primary" onClick={() => onChange({ status: "writing" })}>Ja, det har jag</button>
          <button onClick={() => onChange({ status: "skipped" })}>Nej</button>
        </div>
      )}

      {status === "skipped" && (
        <p className="muted small" onClick={stop}>Hoppas över. <a onClick={() => onChange({ status: "pending" })}>Ångra</a></p>
      )}

      {(status === "writing" || status === "added") && (
        <div className="gap-form" onClick={stop}>
          <label className="lbl">Var hör det hemma?</label>
          <select value={placement} onChange={(e) => onChange({ placement: e.target.value })}>
            {placementOptions(cv).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <label className="lbl">Berätta med egna ord</label>
          <textarea
            rows={3}
            placeholder={placement === "skills" ? "T.ex. \"Python, skript och testautomatisering i två år\"" : "Vad gjorde du, med vilka verktyg, och vad blev resultatet? Stolpar räcker."}
            value={answer}
            onChange={(e) => onChange({ answer: e.target.value })}
          />
          <div className="row">
            <button className="primary" disabled={busy || answer.trim().length < 3} onClick={write}>
              {busy ? "Formulerar…" : on ? "Formulera om" : "Låt Meritio formulera"}
            </button>
            {!on && <button onClick={() => onChange({ status: "pending" })}>Avbryt</button>}
          </div>
          {error && <p className="error">{error}</p>}

          {on && (
            <>
              <label className="lbl">Raden som läggs in <span className="muted">(du kan justera)</span></label>
              <textarea rows={2} className="result" value={decision!.text} onChange={(e) => onChange({ text: e.target.value })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
