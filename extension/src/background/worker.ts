import type { CurrentAd, ExtMessage } from "@meritio/shared";

let currentAd: CurrentAd | null = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg: ExtMessage, sender, sendResponse) => {
  switch (msg.type) {
    case "AD_DETECTED":
      currentAd = msg.ad;
      chrome.storage.session.set({ currentAd });
      break;
    case "AD_GONE":
      currentAd = null;
      chrome.storage.session.set({ currentAd: null });
      break;
    case "OPEN_PANEL": {
      currentAd = msg.ad;
      chrome.storage.session.set({ currentAd });
      const tabId = sender.tab?.id;
      if (tabId !== undefined) chrome.sidePanel.open({ tabId }).catch((e) => console.warn("sidePanel.open", e));
      break;
    }
    case "OPEN_PREVIEW_TAB":
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/preview/index.html?key=${encodeURIComponent(msg.key)}`) });
      break;
    case "GET_CURRENT_AD":
      sendResponse({ type: "CURRENT_AD", ad: currentAd } satisfies ExtMessage);
      return true;
  }
  return false;
});
