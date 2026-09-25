import type { Cv } from "./cv.js";

/** Normalised job ad, regardless of source site. */
export type AdSource = "platsbanken" | "indeed";

export interface JobAd {
  id: string;
  source: AdSource;
  title: string;
  employer: string;
  location?: string;
  description: string;
  requirements: string[];
  url: string;
}

/**
 * A change the model proposes to text that already exists in the CV.
 * `path` is a JSON-pointer-ish path into the Cv, e.g. "summary" or "experience.0.bullets.2".
 */
export interface Rewrite {
  id: string;
  path: string;
  original: string;
  proposed: string;
  /** One-line summary, kept for compatibility. */
  reason: string;
  /** What the change adds or emphasises. */
  adds?: string;
  /** What it removes, shortens or moves down. */
  removes?: string;
  /** Why, in terms of the ad. */
  why?: string;
}

/**
 * Something the ad asks for that the CV does not cover.
 * Never applied automatically; the user must accept and write their own line.
 */
export interface GapSuggestion {
  id: string;
  requirement: string;
  question: string; // e.g. "Annonsen efterfrågar Kubernetes. Har du erfarenhet av detta?"
  suggestedSection: "skills" | "summary" | "experience";
  /** The requirement this gap answers, when known. */
  requirementId?: string;
}

/** One requirement from the ad, with a verdict against the CV. */
export interface Requirement {
  id: string;
  /** The requirement in the ad's own words, including qualifiers ("minst fyra år", "över 400 klienter"). */
  text: string;
  status: "covered" | "partial" | "missing";
  /** Where in the CV it is (or partly is) covered, quoted. */
  evidence?: string;
}

export interface AdaptResponse {
  ad: JobAd;
  /** The master CV the adaptation was based on. */
  cv: Cv;
  /** One-line honest verdict on fit, e.g. "Systemtekniker-roll. 2 av 8 krav täcks, 5 saknas helt." */
  fit?: string;
  requirements: Requirement[];
  matchSummary: { covered: number; total: number };
  rewrites: Rewrite[];
  gaps: GapSuggestion[];
}

/** An ad read from the page by the content script (sites without an API). */
export interface ScrapedAd {
  title: string;
  employer: string;
  location?: string;
  description: string;
  url: string;
}

export interface AdaptRequest {
  adId: string;
  source?: AdSource;
  /** Required for sources without an API (e.g. indeed). */
  ad?: ScrapedAd;
}

/** What the content script knows about the ad on screen. */
export interface CurrentAd {
  adId: string;
  source: AdSource;
  url: string;
  ad?: ScrapedAd;
  /** True when the user must click to run (sites where one skims many ads quickly). */
  manual: boolean;
}

export interface PdfRequest {
  cv: Cv;
  template: "clean" | "compact";
}

/** Messages passed inside the extension (content script <-> worker <-> side panel). */
export type ExtMessage =
  | { type: "AD_DETECTED"; ad: CurrentAd }
  | { type: "AD_GONE" }
  | { type: "OPEN_PANEL"; ad: CurrentAd }
  | { type: "GET_CURRENT_AD" }
  | { type: "CURRENT_AD"; ad: CurrentAd | null }
  | { type: "OPEN_OVERLAY"; adId: string }
  | { type: "OPEN_PREVIEW_TAB"; key: string }
  | { type: "CLOSE_OVERLAY" };

/** What the user decided about each proposed change. Stored in the extension. */
export type RewriteDecision = "pending" | "accepted" | "rejected";
export interface GapDecision {
  status: "pending" | "writing" | "added" | "skipped";
  /** Final text that goes into the CV (written by Meritio, editable by the user). */
  text: string;
  /** The user's own words about their experience. */
  answer?: string;
  /** Where it goes: "skills" | "summary" | "experience.<index>" */
  placement?: string;
  /** Answered in the chat; the line was inserted by the chat itself, so the editor must not insert it again. */
  viaChat?: boolean;
}

export interface GapWriteRequest {
  adId: string;
  gapId: string;
  answer: string;
  placement: string;
}
export interface GapWriteResponse { text: string }
export interface Decisions {
  rewrites: Record<string, RewriteDecision>;
  gaps: Record<string, GapDecision>;
  /** The user's own edits, keyed by paragraph index in the document: full new paragraph text. */
  edits?: Record<string, string>;
  /** New paragraphs the user wrote, inserted after a given paragraph (styled like it). */
  inserts?: { id: string; after: number; text: string }[];
}

/** The document's paragraphs and where each CV field lives, for direct editing. */
export interface CvParagraphsResponse {
  paragraphs: { index: number; text: string }[];
  mapping: Record<string, number | number[]>;
}
export interface StoredAdaptation {
  response: AdaptResponse;
  decisions: Decisions;
  /** True while suggestions are still streaming in. */
  loading?: boolean;
}

/** Server-sent events from POST /adapt with Accept: text/event-stream. */
export type AdaptEvent =
  | { type: "start"; ad: JobAd; cv: Cv }
  | { type: "fit"; fit: string }
  | { type: "requirement"; requirement: Requirement }
  | { type: "match"; matchSummary: AdaptResponse["matchSummary"] }
  | { type: "rewrite"; rewrite: Rewrite }
  | { type: "gap"; gap: GapSuggestion }
  | { type: "done"; result: AdaptResponse }
  | { type: "error"; error: string };

/** Auth (the API proxies Supabase so the extension needs no Supabase config). */
export interface AuthRequest { email: string; password: string }
export interface AuthResponse { accessToken: string; refreshToken: string; email: string }
export interface MeResponse {
  stub: boolean;
  email: string;
  hasCv: boolean;
  plan: "monthly" | "pass3m" | "none";
  /** Whether the user may adapt and download right now. */
  entitled: boolean;
  /** Inside the free days of a subscription (card on file, nothing charged yet). */
  trialing: boolean;
  trialEnds?: string | null;
  planEnds?: string | null;
}

/** CV upload: file in, parsed structured CV out (not saved until PUT /cv). */
export interface CvParseResponse { cv: Cv; warnings: string[] }

/** A downloaded CV, listed in the extension under "Mina CV". */
export interface ExportItem {
  id: string;
  adTitle: string;
  employer: string;
  adUrl: string;
  format: "pdf" | "docx";
  createdAt: string;
}

/** One operation the assistant wants applied in the document (the browser applies it as a tracked change). */
export type ChatOp =
  | { type: "replace"; find: string; text: string; note?: string }
  | { type: "insertAfter"; anchor: string; text: string; note?: string }
  | { type: "delete"; find: string; note?: string };

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface ChatRequest {
  adId: string;
  messages: ChatMessage[];
  /** Plain text of the document as it currently reads (so the assistant sees the user's edits too). */
  document: string;
  /** Text the user has selected, if any. */
  selection?: string;
}

export interface ChatResponse {
  reply: string;
  ops: ChatOp[];
}
