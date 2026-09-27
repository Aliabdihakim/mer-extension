import JSZip from "jszip";

/**
 * Fonts as Word resolves them when a run carries none of its own:
 * paragraph style chain → default paragraph style → docDefaults → theme.
 * SuperDoc's query.match only reports fonts set directly on the run, so lines we insert next to
 * text that inherits its font would otherwise fall back to the editor default.
 */
export interface DocFonts {
  /** Font and size (pt) for a paragraph with the given style id (or the default paragraph style). */
  resolve(styleId?: string | null): { fontFamily?: string; fontSizePt?: number };
}

const attr = (xml: string, name: string): string | undefined => xml.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Font and size declared in one w:rPr block, if any. */
function fontsIn(rPr: string | undefined, theme: Record<string, string>): { fontFamily?: string; fontSizePt?: number } {
  if (!rPr) return {};
  const out: { fontFamily?: string; fontSizePt?: number } = {};
  const rFonts = rPr.match(/<w:rFonts\b[^>]*\/?>/)?.[0];
  if (rFonts) {
    const direct = attr(rFonts, "w:ascii") ?? attr(rFonts, "w:hAnsi");
    const themed = attr(rFonts, "w:asciiTheme") ?? attr(rFonts, "w:hAnsiTheme");
    const f = direct ?? (themed ? theme[themed] : undefined);
    if (f) out.fontFamily = decode(f);
  }
  const sz = rPr.match(/<w:sz\b[^>]*w:val="(\d+)"/)?.[1];
  if (sz) out.fontSizePt = Number(sz) / 2;
  return out;
}

/** Theme font slots (minorHAnsi, majorHAnsi, …) → font names. */
function themeFonts(themeXml: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!themeXml) return map;
  const major = themeXml.match(/<a:majorFont>([\s\S]*?)<\/a:majorFont>/)?.[1] ?? "";
  const minor = themeXml.match(/<a:minorFont>([\s\S]*?)<\/a:minorFont>/)?.[1] ?? "";
  const latin = (x: string) => x.match(/<a:latin\b[^>]*typeface="([^"]*)"/)?.[1];
  const mj = latin(major), mn = latin(minor);
  if (mj) { map.majorHAnsi = mj; map.majorAscii = mj; map.majorEastAsia = mj; map.majorBidi = mj; }
  if (mn) { map.minorHAnsi = mn; map.minorAscii = mn; map.minorEastAsia = mn; map.minorBidi = mn; }
  return map;
}

export async function readDocFonts(docx: ArrayBuffer | Uint8Array): Promise<DocFonts> {
  const empty: DocFonts = { resolve: () => ({}) };
  try {
    const zip = await JSZip.loadAsync(docx);
    const stylesXml = await zip.file("word/styles.xml")?.async("string");
    if (!stylesXml) return empty;
    const themeXml = await zip.file("word/theme/theme1.xml")?.async("string");
    const theme = themeFonts(themeXml);

    const docDefaults = fontsIn(stylesXml.match(/<w:rPrDefault>([\s\S]*?)<\/w:rPrDefault>/)?.[1], theme);

    // style id → { own fonts, basedOn }
    const styles = new Map<string, { own: { fontFamily?: string; fontSizePt?: number }; basedOn?: string }>();
    let defaultParagraphStyle: string | undefined;
    for (const m of stylesXml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
      const head = m[1], body = m[2];
      const id = attr(head, "w:styleId");
      if (!id) continue;
      const type = attr(head, "w:type");
      if (type === "paragraph" && /w:default="(1|true)"/.test(head)) defaultParagraphStyle = id;
      const rPr = body.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1];
      styles.set(id, { own: fontsIn(rPr, theme), basedOn: body.match(/<w:basedOn\b[^>]*w:val="([^"]*)"/)?.[1] });
    }

    const chain = (id: string | undefined | null): { fontFamily?: string; fontSizePt?: number } => {
      const out: { fontFamily?: string; fontSizePt?: number } = {};
      const seen = new Set<string>();
      let cur = id ?? undefined;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const s = styles.get(cur);
        if (!s) break;
        if (out.fontFamily === undefined && s.own.fontFamily) out.fontFamily = s.own.fontFamily;
        if (out.fontSizePt === undefined && s.own.fontSizePt) out.fontSizePt = s.own.fontSizePt;
        cur = s.basedOn;
      }
      return out;
    };

    return {
      resolve(styleId) {
        const own = chain(styleId);
        const normal = styleId === defaultParagraphStyle ? {} : chain(defaultParagraphStyle);
        return {
          fontFamily: own.fontFamily ?? normal.fontFamily ?? docDefaults.fontFamily,
          fontSizePt: own.fontSizePt ?? normal.fontSizePt ?? docDefaults.fontSizePt,
        };
      },
    };
  } catch {
    return empty;
  }
}
