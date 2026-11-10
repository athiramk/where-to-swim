import { describe, expect, it } from "vitest";
import { isRelevantWarning, parseWarningsRss, relevantWarnings } from "./warnings.ts";

const empty = `<?xml version="1.0"?><rss><channel><title>Weather Warnings for Victoria</title></channel></rss>`;
// Illustrative items (not real BOM titles: the live feed was empty when this was written).
const sample = `<rss><channel><title>Weather Warnings for Victoria</title>
<item><title><![CDATA[Strong Wind Warning for Port Phillip]]></title></item>
<item><title>Severe Thunderstorm Warning for Melbourne &amp; surrounds</title></item>
<item><title>Strong Wind Warning for Gippsland Coast</title></item>
<item><title>Fire Weather Warning for Central district</title></item>
<item><title>Frost Warning for North Central</title></item>
</channel></rss>`;

describe("parseWarningsRss", () => {
  it("returns nothing for an empty feed (the channel title is not a warning)", () => {
    expect(parseWarningsRss(empty)).toEqual([]);
  });
  it("reads item titles, decoding CDATA and entities", () => {
    expect(parseWarningsRss(sample).map((w) => w.title)).toEqual([
      "Strong Wind Warning for Port Phillip",
      "Severe Thunderstorm Warning for Melbourne & surrounds",
      "Strong Wind Warning for Gippsland Coast",
      "Fire Weather Warning for Central district",
      "Frost Warning for North Central",
    ]);
  });
});

describe("relevance", () => {
  it("keeps swimming-relevant hazards for our area", () => {
    expect(relevantWarnings(sample)).toEqual([
      "Strong Wind Warning for Port Phillip",
      "Severe Thunderstorm Warning for Melbourne & surrounds",
    ]);
  });
  it("drops distant regions and non-swimming hazards", () => {
    expect(isRelevantWarning("Strong Wind Warning for Gippsland Coast")).toBe(false);
    expect(isRelevantWarning("Fire Weather Warning for Central district")).toBe(false);
    expect(isRelevantWarning("Total Fire Ban")).toBe(false);
  });
});
