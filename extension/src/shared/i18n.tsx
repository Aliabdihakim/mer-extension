import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UiLang } from "@meritio/shared";
import { LANG_KEY, fill, tr, readLang, writeLang, localeOf, type Vars } from "./lang";

export { tr, readLang, writeLang, localeOf, LANG_KEY };

type Ctx = { lang: UiLang; setLang: (l: UiLang) => void; t: (sv: string, vars?: Vars) => string };
const LangContext = createContext<Ctx>({ lang: "sv", setLang: () => {}, t: (s, v) => fill(s, v) });

/** Provides the UI language to React trees (side panel, review page). */
export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("sv");
  useEffect(() => {
    readLang().then(setLangState);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes[LANG_KEY]) setLangState(changes[LANG_KEY].newValue === "en" ? "en" : "sv");
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: UiLang) => { setLangState(l); writeLang(l); }, []);
  const t = useCallback((sv: string, vars?: Vars) => tr(lang, sv, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() { return useContext(LangContext); }
