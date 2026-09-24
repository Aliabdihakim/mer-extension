/**
 * Fonts for the editor.
 *
 * CVs are mostly written in Word's defaults (Calibri, Cambria, Arial, Times New Roman, Georgia).
 * Macs and Linux lack Calibri and Cambria, so we ship metric-compatible open fonts and map the
 * Word names onto them only when the real font is not installed. The mapping is display-only:
 * the exported file keeps the original font names.
 */
const url = (file: string) => chrome.runtime.getURL(`fonts/${file}`);

const faces = (family: string, base: string) => ({
  family,
  faces: [
    { url: url(`${base}-Regular.ttf`), weight: 400, style: "normal" },
    { url: url(`${base}-Bold.ttf`), weight: 700, style: "normal" },
    { url: url(`${base}-Italic.ttf`), weight: 400, style: "italic" },
    { url: url(`${base}-BoldItalic.ttf`), weight: 700, style: "italic" },
  ],
});

export const bundledFamilies = [
  faces("Carlito", "Carlito"),
  faces("Caladea", "Caladea"),
  faces("Liberation Sans", "LiberationSans"),
  faces("Liberation Serif", "LiberationSerif"),
  faces("Liberation Mono", "LiberationMono"),
];

/** Word font -> metric-compatible substitute. */
const substitutes: Record<string, string> = {
  Calibri: "Carlito",
  "Calibri Light": "Carlito",
  Cambria: "Caladea",
  Arial: "Liberation Sans",
  Helvetica: "Liberation Sans",
  "Segoe UI": "Liberation Sans",
  Verdana: "Liberation Sans",
  Tahoma: "Liberation Sans",
  "Times New Roman": "Liberation Serif",
  Times: "Liberation Serif",
  Garamond: "Liberation Serif",
  "Book Antiqua": "Liberation Serif",
  "Courier New": "Liberation Mono",
  Consolas: "Liberation Mono",
};

function installed(family: string): boolean {
  try { return document.fonts.check(`12px "${family}"`); } catch { return false; }
}

/** Map only the fonts this machine doesn't have. */
export function fontMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [word, sub] of Object.entries(substitutes)) if (!installed(word)) map[word] = sub;
  return map;
}

/** Rows for the toolbar's font dropdown: common CV fonts first, then our bundled substitutes. */
export const fontOptions = [
  "Calibri", "Cambria", "Arial", "Helvetica", "Times New Roman", "Georgia", "Garamond", "Verdana", "Tahoma", "Trebuchet MS",
  "Segoe UI", "Book Antiqua", "Palatino", "Courier New", "Carlito", "Caladea", "Liberation Sans", "Liberation Serif",
].map((label) => ({ label, key: label.toLowerCase().replace(/\s+/g, "-") }));
