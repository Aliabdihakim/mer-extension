import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "@meritio/shared";
import { api, ApiError, setTokens } from "./api";
import { useCurrentAd, adKey } from "./useCurrentAd";
import { useAdaptation, openPreview } from "../shared/adaptationStore";
import { Login } from "./Login";
import { UploadCv } from "./UploadCv";
import { Brand } from "./Brand";
import { MyCvs } from "./MyCvs";
import { liveMatch } from "../shared/match";

type Gate = { state: "loading" } | { state: "login" } | { state: "ready"; me: MeResponse } | { state: "error"; message: string };

export function App() {
  const [gate, setGate] = useState<Gate>({ state: "loading" });

  const check = useCallback(async () => {
    setGate({ state: "loading" });
    try {
      const me = await api.me();
      setGate({ state: "ready", me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setGate({ state: "login" });
      else setGate({ state: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  if (gate.state === "loading") return <><Brand /><p className="muted">Laddar…</p></>;
  if (gate.state === "login") return <Login onDone={check} />;
  if (gate.state === "error") {
    return (
      <>
        <Brand />
        <div className="card stack">
          <p className="error">Kunde inte nå servern: {gate.message}</p>
          <button onClick={check}>Försök igen</button>
        </div>
      </>
    );
  }
  if (!gate.me.hasCv) return <UploadCv onDone={check} />;
  return <Adapt me={gate.me} onLogout={async () => { await setTokens(null); check(); }} />;
}

function Adapt({ me, onLogout }: { me: MeResponse; onLogout: () => void }) {
  const current = useCurrentAd();
  const adId = current ? adKey(current) : null;
  const { stored, applyEvent } = useAdaptation(adId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showCvs, setShowCvs] = useState(false);
  const [started, setStarted] = useState<string | null>(null);

  // Auto-run on sites with an API (Platsbanken); wait for a click on sites where you skim ads (Indeed).
  const shouldRun = !!current && (!current.manual || started === adId);

  useEffect(() => {
    setError(null);
    if (!current || !adId || !shouldRun) return;
    let cancelled = false;
    const ctrl = new AbortController();
    chrome.storage.session.get(`adaptation:${adId}`).then((r) => {
      const existing = r[`adaptation:${adId}`];
      if (cancelled || (existing && !existing.loading)) return;
      setLoading(true);
      api.adaptStream({ adId: current.adId, source: current.source, ad: current.ad }, (e) => {
        if (cancelled) return;
        if (e.type === "error") setError(e.error);
        applyEvent(e);
      }, ctrl.signal)
        .catch((e: Error) => { if (!cancelled && e.name !== "AbortError") setError(e.message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; ctrl.abort(); };
  }, [adId, shouldRun, applyEvent]);

  if (showUpload) return <UploadCv onDone={() => { setShowUpload(false); chrome.storage.session.clear(); }} onCancel={() => setShowUpload(false)} />;
  if (showCvs) return <MyCvs onBack={() => setShowCvs(false)} />;

  const SITE = import.meta.env.VITE_SITE_URL ?? "http://localhost:3000";
  const daysLeft = me.trialEnds ? Math.max(0, Math.ceil((new Date(me.trialEnds).getTime() - Date.now()) / 86_400_000)) : null;
  const planLine =
    me.plan === "trial" ? (daysLeft === null ? "Provperiod" : `Provperiod · ${daysLeft} dagar kvar`)
    : me.plan === "monthly" ? "Månad" : me.plan === "pass3m" ? "3 månader" : "Ingen aktiv plan";
  const header = (
    <Brand right={<>{me.email.split("@")[0]}{me.stub ? " · stub" : ""}<br /><a href={`${SITE}/konto`} target="_blank" rel="noreferrer">{planLine}</a></>} />
  );
  const paywall = !me.entitled || error?.includes("provperiod");
  const foot = (
    <p className="foot">
      <a onClick={() => setShowCvs(true)}>Mina CV</a>
      <a onClick={() => setShowUpload(true)}>Byt CV</a>
      {!me.stub && <a onClick={onLogout}>Logga ut</a>}
    </p>
  );

  if (paywall) {
    return (
      <>
        {header}
        <div className="card">
          <div className="eyebrow">Provperioden är slut</div>
          <div className="title">Fortsätt anpassa ditt CV</div>
          <p className="sub" style={{ marginTop: 6 }}>99 kr/mån eller 199 kr för 3 månader. Avsluta när du vill.</p>
          <a className="primary big btn-link" href={`${SITE}/konto`} target="_blank" rel="noreferrer">Välj plan</a>
        </div>
        {foot}
      </>
    );
  }

  if (!current || !adId) {
    return (
      <>
        {header}
        <div className="card empty">
          <div className="icon">🔍</div>
          <div className="title">Öppna en annons</div>
          <p className="sub">Gå till en annons på Platsbanken eller Indeed så anpassar Meritio ditt CV till den.</p>
        </div>
        {foot}
      </>
    );
  }

  // Manual sites: show the ad and a start button until the user clicks.
  if (current.manual && !shouldRun && !stored) {
    return (
      <>
        {header}
        <div className="card selected">
          <div className="eyebrow"><span className="dot" /> Vald annons på Indeed</div>
          <div className="title">{current.ad?.title}</div>
          <div className="sub">{current.ad?.employer}{current.ad?.location ? ` · ${current.ad.location}` : ""}</div>
          <p className="sub" style={{ marginTop: 10 }}>Klicka när du vill anpassa ditt CV till den här annonsen.</p>
          <button className="primary big" onClick={() => setStarted(adId)}>Anpassa CV till annonsen</button>
        </div>
        {foot}
      </>
    );
  }

  const data = stored?.response;
  const rewrites = data?.rewrites.length ?? 0;
  const gaps = data?.gaps.length ?? 0;
  const total = rewrites + gaps;
  const match = liveMatch(stored);
  const hasMatch = !!data && match.total > 0;
  const pct = hasMatch ? Math.round((match.covered / match.total) * 100) : 0;
  const streaming = loading || !!stored?.loading;

  return (
    <>
      {header}
      {error && <p className="error">{error}</p>}

      <div className="card">
        {data ? (
          <>
            <div className="eyebrow"><span className="dot" /> {current.source === "indeed" ? "Vald annons på Indeed" : "Annons på Platsbanken"}</div>
            <div className="title">{data.ad.title}</div>
            <div className="sub">{data.ad.employer}{data.ad.location ? ` · ${data.ad.location}` : ""}</div>
          </>
        ) : (
          <>
            <div className="eyebrow">Annons</div>
            <div className="title muted">Läser annonsen…</div>
          </>
        )}

        {hasMatch && (
          <div className="match">
            <div className="row" style={{ marginTop: 0 }}>
              <span className="muted">Matchning</span>
              <span><strong>{match.covered}</strong> <span className="muted">av {match.total} krav</span>{match.filled > 0 && <span className="muted"> · {match.filled} tillagda</span>}</span>
            </div>
            <div className={`bar ${pct < 50 ? "low" : ""}`}><i style={{ width: `${pct}%` }} /></div>
          </div>
        )}

        {data?.fit && <p className="fit">{data.fit}</p>}

        {(total > 0 || hasMatch) && (
          <div className="chips">
            {rewrites > 0 && <span className="chip changes"><i />{rewrites} {rewrites === 1 ? "ändring" : "ändringar"}</span>}
            {match.partial > 0 && <span className="chip partial"><i />{match.partial} delvis</span>}
            {match.missing > 0 && <span className="chip gaps"><i />{match.missing} {match.missing === 1 ? "saknas" : "saknas"}</span>}
          </div>
        )}

        {streaming && (
          <ul className="steps">
            <li className={data ? "done" : "active"}><span className="dot">{data ? "✓" : ""}</span>Läser annonsen</li>
            <li className={hasMatch ? "done" : data ? "active" : ""}><span className="dot">{hasMatch ? "✓" : ""}</span>Jämför med ditt CV</li>
            <li className={total > 0 ? "active" : hasMatch ? "active" : ""}><span className="dot" />Skriver förslag{total > 0 ? ` (${total})` : ""}</li>
          </ul>
        )}

        {!streaming && total === 0 && data && <p className="sub" style={{ marginTop: 10 }}>Inga ändringar föreslagna. Ditt CV täcker annonsen bra som det är.</p>}

        <button className="primary big" onClick={() => openPreview(adId)} disabled={total === 0}>
          {streaming && total > 0 ? "Granska ändringar · fler på väg" : "Granska ändringar"}
        </button>
      </div>
      {foot}
    </>
  );
}
