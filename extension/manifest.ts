import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Meritio",
  description: "Anpassa ditt CV till jobbannonsen med ett klick – i din egen Word-fil, layouten rörs aldrig.",
  version: "0.1.1",
  icons: { "16": "icons/icon16.png", "32": "icons/icon32.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
  action: { default_title: "Meritio", default_icon: { "16": "icons/icon16.png", "32": "icons/icon32.png" } },
  permissions: ["sidePanel", "storage", "downloads", "tabs", "identity"],
  host_permissions: ["https://arbetsformedlingen.se/*", "https://*.indeed.com/*"],
  background: { service_worker: "src/background/worker.ts", type: "module" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  web_accessible_resources: [
    { resources: ["src/preview/index.html", "assets/*", "fonts/*", "icons/*"], matches: ["https://arbetsformedlingen.se/*", "https://*.indeed.com/*"] },
  ],
  content_scripts: [
    {
      matches: ["https://arbetsformedlingen.se/platsbanken/*"],
      js: ["src/content/platsbanken.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://*.indeed.com/*"],
      js: ["src/content/indeed.ts"],
      run_at: "document_idle",
    },
  ],
});
