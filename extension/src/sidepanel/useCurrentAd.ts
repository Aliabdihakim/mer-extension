import { useEffect, useState } from "react";
import type { CurrentAd, ExtMessage } from "@meritio/shared";

/** Tracks which ad the user is looking at, live, via the service worker. */
export function useCurrentAd() {
  const [ad, setAd] = useState<CurrentAd | null>(null);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: "GET_CURRENT_AD" } satisfies ExtMessage)
      .then((res: ExtMessage) => { if (res?.type === "CURRENT_AD") setAd(res.ad); })
      .catch(() => {});
    const onChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ("currentAd" in changes) setAd(changes.currentAd.newValue ?? null);
    };
    chrome.storage.session.onChanged.addListener(onChange);
    return () => chrome.storage.session.onChanged.removeListener(onChange);
  }, []);

  return ad;
}

export const adKey = (ad: { source: string; adId: string }) => `${ad.source}:${ad.adId}`;
