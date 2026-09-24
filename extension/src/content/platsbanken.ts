import type { CurrentAd } from "@meritio/shared";
import { injectButton, listenForOverlay, removeButton, send, watch } from "./core";

const AD_URL = /\/platsbanken\/annonser\/(\d+)/;
let current: CurrentAd | null = null;

listenForOverlay();
watch(() => {
  const m = location.pathname.match(AD_URL);
  const adId = m ? m[1] : null;
  if (adId === (current?.adId ?? null)) return;
  if (!adId) { current = null; removeButton(); send({ type: "AD_GONE" }); return; }
  current = { adId, source: "platsbanken", url: location.href, manual: false };
  injectButton(() => current);
  send({ type: "AD_DETECTED", ad: current });
});
console.log("[meritio] platsbanken content script loaded");
