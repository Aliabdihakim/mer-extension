import type { CurrentAd, ScrapedAd } from "@meritio/shared";
import { injectButton, listenForOverlay, removeButton, send, watch } from "./core";

/**
 * Indeed: the list stays on the left and the selected ad renders in a right-hand pane.
 * The selected ad's id is in the URL (?vjk=... on search pages, ?jk=... on /viewjob).
 * Ads are read from the pane, since Indeed has no public API. Indeed changes its markup often,
 * so every lookup has generic fallbacks.
 */
let current: CurrentAd | null = null;
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function adIdFromUrl(): string | null {
  const u = new URL(location.href);
  return u.searchParams.get("vjk") || u.searchParams.get("jk") || null;
}

function first(root: ParentNode, sels: string[]): HTMLElement | null {
  for (const s of sels) {
    const el = root.querySelector<HTMLElement>(s);
    if (el && el.innerText?.trim()) return el;
  }
  return null;
}

/** The container holding the open ad. */
function descriptionEl(root: ParentNode = document): HTMLElement | null {
  return first(root, ["#jobDescriptionText", '[data-testid="jobsearch-JobComponent-description"]', '[class*="JobComponent-description"]', '[id*="jobDescription"]']);
}

function pane(): HTMLElement | null {
  const known = first(document, [
    "#jobsearch-ViewjobPaneWrapper",
    ".jobsearch-ViewJobLayout-jobDisplay",
    '[data-testid="jobsearch-ViewJobLayout"]',
    ".jobsearch-JobComponent",
    "#viewJobSSRRoot",
    ".jobsearch-ViewJobLayout",
  ]);
  if (known) return known;
  // Only the description block is recognisable: climb a few levels so the header is included.
  const desc = descriptionEl();
  if (!desc) return null;
  let el: HTMLElement | null = desc;
  for (let i = 0; i < 6 && el?.parentElement; i++) {
    el = el.parentElement;
    if (el.querySelector("h1, h2") && !desc.contains(el.querySelector("h1, h2"))) return el;
  }
  return desc.parentElement;
}

const SECTION_LABELS = new Set([
  "jobbinformation", "anställningsform", "förmåner", "fullständig jobbeskrivning", "jobbeskrivning", "job details", "benefits",
  "full job description", "job type", "pay", "lön", "skift och schema", "plats", "location", "shift and schedule", "profile insights",
  "jobbinsikter", "så här matchar jobbinformationen din profil",
]);

/** The ad title: the selected list card is most reliable; otherwise the biggest heading in the pane that isn't a section label. */
function readTitle(root: ParentNode): string {
  const fromCard = cardTitle(selectedCard());
  if (fromCard) return fromCard;
  const marked = first(root, ['[data-testid="jobsearch-JobInfoHeader-title"]', ".jobsearch-JobInfoHeader-title", 'h1[class*="JobInfoHeader"]', 'h2[class*="JobInfoHeader"]']);
  if (marked) return marked.innerText.trim();
  // Headings inside the job text belong to the employer's own sections ("Om tjänsten"), never the title.
  const desc = descriptionEl(root) ?? descriptionEl();
  let bestText = "";
  let bestSize = -1;
  root.querySelectorAll<HTMLElement>("h1, h2").forEach((h) => {
    if (desc && desc.contains(h)) return;
    const t = h.innerText.trim();
    if (!t || SECTION_LABELS.has(norm(t))) return;
    const size = parseFloat(getComputedStyle(h).fontSize) || 0;
    if (size > bestSize) { bestSize = size; bestText = t; }
  });
  if (bestText) return bestText;
  // Last resort: the tab title, "Software Engineer (Backend) - Stockholm - Indeed.com".
  const dt = document.title.trim();
  const part = dt.split(/\s[-|–]\s/)[0]?.trim() ?? "";
  if (part && !/^(indeed|jobb|jobs|job search|lediga jobb)/i.test(part) && !/indeed/i.test(part)) return part;
  return "";
}

function readAd(): ScrapedAd | null {
  const p = pane();
  const root: ParentNode = p ?? document;
  const card = selectedCard();

  const title = readTitle(root) || "Annons på Indeed";
  const employer =
    card?.querySelector<HTMLElement>('[data-testid="company-name"], .companyName, [class*="companyName"]')?.innerText.trim() ||
    first(root, ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]', '[data-testid="jobsearch-CompanyInfoContainer"] a', '[class*="companyName"]', '[class*="CompanyName"]'])?.innerText.trim() ||
    "";
  const location =
    card?.querySelector<HTMLElement>('[data-testid="text-location"], .companyLocation, [class*="companyLocation"]')?.innerText.trim() ||
    first(root, ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="jobsearch-JobInfoHeader-companyLocation"]', '[class*="companyLocation"]', '[class*="CompanyLocation"]'])?.innerText.trim() ||
    "";
  const descEl = descriptionEl(root) ?? descriptionEl();

  let description = descEl?.innerText.trim() ?? "";
  if (!description && p) description = p.innerText.replace(title, "").trim();

  console.log("[meritio] indeed read:", { pane: !!p, card: !!card, title: title.slice(0, 60), employer: employer.slice(0, 40), descLen: description.length });
  if (!title || description.length < 50) return null;
  return { title, employer: employer.replace(/\s*\d\.\d.*$/s, "").trim(), location: location || undefined, description: description.slice(0, 20000), url: adUrl() };
}

function adUrl(): string {
  const id = adIdFromUrl();
  return id ? `${location.origin}/viewjob?jk=${id}` : location.href;
}

/** The selected card in the results list, so we can confirm the pane shows the same ad. */
function selectedCard(): HTMLElement | null {
  const id = adIdFromUrl();
  return (
    (id && document.querySelector<HTMLElement>(`[data-jk="${id}"]`)) ||
    document.querySelector<HTMLElement>(".vjs-highlight, [data-testid='slider_item'][aria-pressed='true'], .jobsearch-ResultsList .result[aria-pressed='true']") ||
    null
  );
}
function cardTitle(card: HTMLElement | null): string {
  if (!card) return "";
  const el = card.querySelector<HTMLElement>("h2 span[title], a.jcs-JobTitle span, .jobTitle, [class*='jobTitle'], [class*='JobTitle'], h2, a[data-jk]");
  const t = el?.getAttribute("title")?.trim() || el?.innerText?.trim() || card.querySelector("a[data-jk]")?.getAttribute("aria-label")?.trim() || "";
  return t.replace(/^(nytt|new)\s*/i, "").trim();
}

/** Small marker on the selected list card so it's obvious which ad Meritio is looking at. */
function markCard(card: HTMLElement | null) {
  document.querySelectorAll(".meritio-card-mark").forEach((m) => m.remove());
  if (!card) return;
  const m = document.createElement("span");
  m.className = "meritio-card-mark";
  m.textContent = "M";
  m.title = "Meritio tittar på den här annonsen";
  Object.assign(m.style, {
    position: "absolute", top: "8px", right: "8px", zIndex: "5", width: "22px", height: "22px", borderRadius: "7px",
    background: "linear-gradient(135deg, #1d4ed8, #4f46e5)", color: "#fff", font: "800 12px system-ui, sans-serif",
    display: "grid", placeItems: "center", boxShadow: "0 2px 8px rgba(29,78,216,.35)",
  } satisfies Partial<CSSStyleDeclaration>);
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  card.appendChild(m);
}

let pendingSince = 0;

listenForOverlay();
watch(() => {
  const adId = adIdFromUrl();
  if (!adId) {
    if (current) { current = null; removeButton(); markCard(null); send({ type: "AD_GONE" }); }
    return;
  }
  injectButton(() => current);

  const ad = readAd();
  if (!ad) return; // pane still loading; the observer fires again on the next mutation

  // New id in the URL but the pane may still show the previous ad. Accept the pane only when
  // its title matches the selected list card (or after a short grace period, if no card is found).
  if (current?.adId !== adId) {
    const card = selectedCard();
    const ct = cardTitle(card);
    const matches = ct ? norm(ad.title).includes(norm(ct)) || norm(ct).includes(norm(ad.title)) : false;
    const stale = current?.ad?.description === ad.description;
    if (!matches && (stale || !ct)) {
      if (!pendingSince) pendingSince = Date.now();
      if (Date.now() - pendingSince < 2500) { setTimeout(() => window.dispatchEvent(new Event("popstate")), 300); return; }
    }
    pendingSince = 0;
    markCard(card);
  } else if (current.ad?.title === ad.title && current.ad?.description.length === ad.description.length) {
    return;
  }

  current = { adId, source: "indeed", url: ad.url, ad, manual: true };
  send({ type: "AD_DETECTED", ad: current });
});
console.log("[meritio] indeed content script loaded on", location.href);
