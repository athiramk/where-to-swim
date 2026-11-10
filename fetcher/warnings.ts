// Parses BOM's Victorian weather-warnings RSS (https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml).
// NOTE: the feed was empty when this was written, so item titles are not yet verified against a real warning.
// The relevance filter below is deliberately simple and conservative (it prefers showing a warning over hiding one).
export interface Warning {
  title: string;
}

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();

export function parseWarningsRss(xml: string): Warning[] {
  const out: Warning[] = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = /<title>([\s\S]*?)<\/title>/.exec(item[1]);
    if (t) out.push({ title: decode(t[1]) });
  }
  return out;
}

// Hazards that matter for swimming; fire, frost, driving, agriculture etc. are ignored.
const HAZARD = /(wind|gale|storm|thunderstorm|wave|surf|tide|tsunami|cyclone|hail|tornado)/i;
// Titles that name only distant parts of Victoria (and not ours) are ignored.
const OTHER_REGION = /(gippsland|north east|north-east|north central|mallee|wimmera|alpine|east coast|west coast|south west)/i;
const OUR_AREA = /(port phillip|melbourne|central|western port|bay)/i;

export function isRelevantWarning(title: string): boolean {
  if (!HAZARD.test(title)) return false;
  if (OTHER_REGION.test(title) && !OUR_AREA.test(title)) return false;
  return true;
}

export function relevantWarnings(xml: string): string[] {
  return parseWarningsRss(xml).map((w) => w.title).filter(isRelevantWarning);
}
