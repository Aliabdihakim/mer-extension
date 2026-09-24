import { useEffect, useState } from "react";
import type { ExportItem } from "@meritio/shared";
import { api } from "./api";
import { Brand } from "./Brand";

export function MyCvs({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ExportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api.exports().then((r) => setItems(r.exports)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function download(it: ExportItem) {
    setBusy(it.id);
    try {
      const blob = await api.exportFile(it.id);
      const url = URL.createObjectURL(blob);
      const name = `CV - ${(it.employer || it.adTitle).replace(/[^\p{L}\p{N} ]+/gu, "").trim() || "annons"}.${it.format}`;
      await chrome.downloads.download({ url, filename: name, saveAs: true });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(it: ExportItem) {
    await api.deleteExport(it.id).catch(() => {});
    setItems((list) => (list ?? []).filter((x) => x.id !== it.id));
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

  return (
    <>
      <Brand right={<a onClick={onBack}>← Tillbaka</a>} />
      <h2 style={{ marginTop: 0 }}>Mina CV</h2>
      {error && <p className="error">{error}</p>}
      {items === null && <p className="muted">Laddar…</p>}
      {items && items.length === 0 && (
        <div className="card empty">
          <div className="icon">📁</div>
          <div className="title">Inga nedladdade CV än</div>
          <p className="sub">Varje CV du laddar ner från en annons hamnar här.</p>
        </div>
      )}
      {items && items.map((it) => (
        <div key={it.id} className="card export">
          <div className="export-main">
            <div className="eyebrow">{it.employer || "Annons"} · {fmtDate(it.createdAt)}</div>
            <div className="title small-title">{it.adTitle}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" disabled={busy === it.id} onClick={() => download(it)}>{busy === it.id ? "Hämtar…" : `Ladda ner ${it.format.toUpperCase()}`}</button>
              {it.adUrl && <button className="ghost" onClick={() => chrome.tabs.create({ url: it.adUrl })}>Annonsen</button>}
              <button className="ghost x-btn" title="Ta bort" onClick={() => remove(it)}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
