import type { UiLang } from "@meritio/shared";
import { EN } from "./en";

/**
 * Swedish is the source language; every visible string goes through `t()`/`tr()`. English comes from
 * `EN`, keyed by the Swedish text; a missing key falls back to Swedish. The choice lives in
 * chrome.storage.local ("lang") so the side panel, the review page and the content scripts agree,
 * and it mirrors the account setting on the server. React-free so content scripts can import it.
 */
export const LANG_KEY = "lang";
export type Vars = Record<string, string | number>;
export const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

export function tr(lang: UiLang, sv: string, vars?: Vars) { return fill(lang === "en" ? (EN[sv] ?? sv) : sv, vars); }

export async function readLang(): Promise<UiLang> {
  try { const r = await chrome.storage.local.get(LANG_KEY); return r[LANG_KEY] === "en" ? "en" : "sv"; } catch { return "sv"; }
}
export async function writeLang(lang: UiLang) {
  try { await chrome.storage.local.set({ [LANG_KEY]: lang }); } catch {}
}
export const localeOf = (lang: UiLang) => (lang === "en" ? "en-GB" : "sv-SE");
