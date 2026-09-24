import type { AdaptEvent, AdaptRequest, AdaptResponse, AuthRequest, AuthResponse, ChatRequest, ChatResponse, Cv, CvParagraphsResponse, CvParseResponse, Decisions, ExportItem, GapWriteRequest, GapWriteResponse, MeResponse } from "@meritio/shared";
import { API_BASE } from "../config";

interface Tokens { accessToken: string; refreshToken: string; email: string }

export async function getTokens(): Promise<Tokens | null> {
  const { tokens } = await chrome.storage.local.get("tokens");
  return tokens ?? null;
}
export async function setTokens(t: Tokens | null) {
  if (t) await chrome.storage.local.set({ tokens: t });
  else await chrome.storage.local.remove("tokens");
}

async function refresh(): Promise<Tokens | null> {
  const t = await getTokens();
  if (!t) return null;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  });
  if (!res.ok) { await setTokens(null); return null; }
  const next = (await res.json()) as AuthResponse;
  await setTokens(next);
  return next;
}

async function requestBlob(path: string, init: RequestInit = {}, retry = true): Promise<Blob> {
  const t = await getTokens();
  const headers = new Headers(init.headers);
  if (t) headers.set("Authorization", `Bearer ${t.accessToken}`);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && t) {
    const n = await refresh();
    if (n) return requestBlob(path, init, false);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.blob();
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const t = await getTokens();
  const headers = new Headers(init.headers);
  if (t) headers.set("Authorization", `Bearer ${t.accessToken}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && t) {
    const n = await refresh();
    if (n) return request<T>(path, init, false);
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
  get paymentRequired() { return this.status === 402; }
}

export const api = {
  me: () => request<MeResponse>("/me"),
  oauthUrl: (provider: string, redirect: string) =>
    request<{ url: string }>(`/auth/oauth-url?provider=${encodeURIComponent(provider)}&redirect=${encodeURIComponent(redirect)}`),
  login: (body: AuthRequest) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  signup: (body: AuthRequest) => request<AuthResponse>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  getCv: () => request<{ id: string; cv: Cv }>("/cv"),
  uploadCv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<CvParseResponse>("/cv/upload", { method: "POST", body: fd });
  },
  originalPdf: () => requestBlob("/cv/original.pdf"),
  originalDocx: () => requestBlob("/cv/original.docx"),
  paragraphs: () => request<CvParagraphsResponse>("/cv/paragraphs"),
  render: (adId: string, decisions: Decisions, format: "pdf" | "docx", mode: "final" | "review" = "final", save = false) =>
    requestBlob("/cv/render", { method: "POST", body: JSON.stringify({ adId, decisions, format, mode, save }) }),
  exportDocument: (adId: string, format: "pdf" | "docx", docxBase64: string) =>
    requestBlob("/cv/export", { method: "POST", body: JSON.stringify({ adId, format, docxBase64, save: true }) }),
  exports: () => request<{ exports: ExportItem[] }>("/exports"),
  exportFile: (id: string) => requestBlob(`/exports/${id}/file`),
  deleteExport: (id: string) => request<{ ok: true }>(`/exports/${id}`, { method: "DELETE" }),
  saveCv: (cv: Cv) => request<{ id: string }>("/cv", { method: "PUT", body: JSON.stringify({ cv }) }),
  chat: (body: ChatRequest) => request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(body) }),
  saveFact: (body: { requirement: string; answer: string; text: string; placement: string }) =>
    request<{ id: string }>("/facts", { method: "POST", body: JSON.stringify(body) }),
  writeGap: (body: GapWriteRequest) => request<GapWriteResponse>("/gaps/write", { method: "POST", body: JSON.stringify(body) }),
  adapt: (body: AdaptRequest) => request<AdaptResponse>("/adapt", { method: "POST", body: JSON.stringify(body) }),
  /** Streams suggestions as SSE. Resolves when the "done" event has been delivered. */
  adaptStream: async (body: AdaptRequest, onEvent: (e: AdaptEvent) => void, signal?: AbortSignal) => {
    const t = await getTokens();
    const res = await fetch(`${API_BASE}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(t ? { Authorization: `Bearer ${t.accessToken}` } : {}) },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error ?? msg; } catch {}
      throw new ApiError(res.status, msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (line) onEvent(JSON.parse(line.slice(6)) as AdaptEvent);
      }
    }
  },
};
