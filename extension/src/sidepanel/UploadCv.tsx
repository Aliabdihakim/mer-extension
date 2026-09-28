import { useState } from "react";
import type { Cv } from "@meritio/shared";
import { api } from "./api";
import { Brand } from "./Brand";
import { useLang } from "../shared/i18n";

export function UploadCv({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const { t } = useLang();
  const [parsed, setParsed] = useState<{ cv: Cv; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError(t("Bara Word-filer (.docx). Har du PDF? Öppna den i Word eller Google Docs och spara som .docx."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setParsed(await api.uploadCv(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function showOriginal() {
    const blob = await api.originalPdf();
    chrome.tabs.create({ url: URL.createObjectURL(blob) });
  }

  if (!parsed) {
    return (
      <>
        <Brand />
        <div className="card stack">
          <div>
            <div className="title">{t("Ladda upp ditt CV")}</div>
            <div className="sub">{t("Som Word-fil. Vi ändrar bara texten, aldrig layout, typsnitt eller färger.")}</div>
          </div>
          <label className="drop">
            <input type="file" accept=".docx" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} hidden />
            <span className="icon">{busy ? "⏳" : "📄"}</span>
            <strong>{busy ? t("Läser in ditt CV…") : t("Välj Word-fil (.docx)")}</strong>
            <span className="small muted">{busy ? t("Tar ungefär tio sekunder") : t("eller släpp filen här")}</span>
          </label>
          {error && <p className="error">{error}</p>}
          {onCancel && <button className="ghost" onClick={onCancel}>{t("Avbryt")}</button>}
        </div>
        <p className="foot">{t("Har du bara PDF? Öppna den i Word eller Google Docs och spara som .docx.")}</p>
      </>
    );
  }

  const { cv, warnings } = parsed;
  const bullets = cv.experience.reduce((n, e) => n + e.bullets.length, 0);

  return (
    <>
      <Brand />
      <div className="card stack">
        <div>
          <div className="title">{t("Ditt CV är sparat")}</div>
          <div className="sub">{t("Dokumentet sparas som det är. Det här hittade vi i det:")}</div>
        </div>
        <ul className="facts">
          <li><strong>{cv.contact.fullName || t("Namn saknas")}</strong></li>
          <li>{t("{n} anställningar med {b} punkter", { n: cv.experience.length, b: bullets })}</li>
          <li>{t("{n} kompetenser", { n: cv.skills.length })}</li>
          <li>{t("{n} utbildningar", { n: cv.education.length })}</li>
          <li className={cv.summary ? "" : "off"}>{cv.summary ? t("Profiltext") : t("Ingen profiltext")}</li>
        </ul>
        {warnings.map((w, i) => <p key={i} className="warn">{w}</p>)}
        <button className="primary" onClick={onDone}>{t("Klar")}</button>
        <div className="row" style={{ marginTop: 0 }}>
          <button className="ghost" onClick={showOriginal}>{t("Visa mitt CV")}</button>
          <button className="ghost" onClick={() => setParsed(null)}>{t("Annan fil")}</button>
        </div>
      </div>
    </>
  );
}
