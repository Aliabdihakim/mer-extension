import type { CurrentAd, ExtMessage } from "@meritio/shared";

const BUTTON_ID = "meritio-adapt-btn";
const OVERLAY_ID = "meritio-overlay";

export function send(msg: ExtMessage) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

export function injectButton(getAd: () => CurrentAd | null) {
  if (document.getElementById(BUTTON_ID)) return;
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.innerHTML = `<span style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.22);font-weight:800;font-size:13px;margin-right:8px">M</span>Anpassa CV till annonsen`;
  Object.assign(btn.style, {
    position: "fixed", right: "24px", bottom: "24px", zIndex: "2147483647",
    display: "inline-flex", alignItems: "center", padding: "10px 18px 10px 10px",
    borderRadius: "999px", border: "none", background: "linear-gradient(135deg, #1d4ed8, #4f46e5)", color: "#fff",
    font: "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    boxShadow: "0 8px 24px rgba(29,78,216,.35)", cursor: "pointer", transition: "transform .15s, box-shadow .15s",
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener("mouseenter", () => { btn.style.transform = "translateY(-1px)"; btn.style.boxShadow = "0 12px 28px rgba(29,78,216,.4)"; });
  btn.addEventListener("mouseleave", () => { btn.style.transform = ""; btn.style.boxShadow = "0 8px 24px rgba(29,78,216,.35)"; });
  btn.addEventListener("click", () => { const ad = getAd(); if (ad) send({ type: "OPEN_PANEL", ad }); });
  document.body.appendChild(btn);
}

export function removeButton() {
  document.getElementById(BUTTON_ID)?.remove();
}

let readyTimer: number | undefined;

export function openOverlay(key: string) {
  closeOverlay();
  // If the site's CSP blocks our frame, the review page never reports ready: fall back to a tab.
  window.clearTimeout(readyTimer);
  readyTimer = window.setTimeout(() => {
    if (!overlayReady && document.getElementById(OVERLAY_ID)) {
      console.warn("[meritio] overlay did not load (blocked by the page?), opening in a tab instead");
      closeOverlay();
      send({ type: "OPEN_PREVIEW_TAB", key });
    }
  }, 2000);
  overlayReady = false;
  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  Object.assign(root.style, {
    position: "fixed", inset: "0", zIndex: "2147483646", background: "rgba(15, 23, 42, .55)", backdropFilter: "blur(2px)",
    display: "flex", alignItems: "center", justifyContent: "center",
  } satisfies Partial<CSSStyleDeclaration>);
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL(`src/preview/index.html?key=${encodeURIComponent(key)}&embedded=1`);
  Object.assign(frame.style, {
    width: "min(96vw, 1700px)", height: "94vh", border: "0", borderRadius: "14px", background: "#e8ecf3", boxShadow: "0 24px 80px rgba(0,0,0,.45)",
  } satisfies Partial<CSSStyleDeclaration>);
  frame.allow = "clipboard-write";
  root.addEventListener("click", (e) => { if (e.target === root) closeOverlay(); });
  root.appendChild(frame);
  document.body.appendChild(root);
  document.documentElement.style.overflow = "hidden";
  window.addEventListener("keydown", onEsc);
}

let overlayReady = false;

export function closeOverlay() {
  window.clearTimeout(readyTimer);
  document.getElementById(OVERLAY_ID)?.remove();
  document.documentElement.style.overflow = "";
  window.removeEventListener("keydown", onEsc);
}
function onEsc(e: KeyboardEvent) { if (e.key === "Escape") closeOverlay(); }

export function listenForOverlay() {
  chrome.runtime.onMessage.addListener((msg: ExtMessage) => {
    if (msg.type === "OPEN_OVERLAY") { console.log("[meritio] open overlay", msg.adId); openOverlay(msg.adId); }
    if (msg.type === "CLOSE_OVERLAY") closeOverlay();
  });
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "meritio:close") closeOverlay();
    if (e.data && e.data.type === "meritio:ready") { overlayReady = true; window.clearTimeout(readyTimer); }
  });
}

/** Run `fn` on URL changes and DOM mutations, coalesced. */
export function watch(fn: () => void) {
  let scheduled = false;
  const tick = () => { if (scheduled) return; scheduled = true; setTimeout(() => { scheduled = false; fn(); }, 150); };
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", tick);
  fn();
}
