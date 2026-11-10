import { describe, expect, it } from "vitest";
import rawBeaches from "../../data/beaches.json";
import type { Beach } from "./conditions.ts";

const beaches = rawBeaches as Beach[];
const byId = (id: string) => beaches.find((b) => b.id === id)!;

describe("data/beaches.json", () => {
  it("has unique ids and sensible fields for every beach", () => {
    expect(new Set(beaches.map((b) => b.id)).size).toBe(beaches.length);
    for (const b of beaches) {
      expect(b.faces).toBeGreaterThanOrEqual(0);
      expect(b.faces).toBeLessThan(360);
      expect(b.windStation).toMatch(/^\d{5}$/);
      expect(b.lat).toBeLessThan(-37);
      expect(b.lon).toBeGreaterThan(144);
    }
  });

  it("low-tide rule: Jawbone and Ricketts Point need it; Half Moon Bay does not (lifted 2026-11-10)", () => {
    expect(byId("jawbone").needsLowTide).toBe(true);
    expect(byId("ricketts-point").needsLowTide).toBe(true);
    expect(byId("half-moon-bay").needsLowTide).toBeFalsy();
    expect(byId("half-moon-bay").maxLowTideM).toBeUndefined();
  });

  it("Mushroom Reef uses its own tide site, the open-coast forecast and a verified south-facing bearing", () => {
    const m = byId("mushroom-reef");
    expect(m.needsLowTide).toBe(true);
    expect(m.tideSite).toBe("VIC_TP020"); // Flinders Jetty
    expect(m.forecast).toBe("coast");
    expect(m.faces).toBe(180);
    expect(m.fetchKm).toBeUndefined(); // open coast: swell from the forecast, not the bay chop model
  });

  it("tide sites look like BOM AACs and forecast areas are known", () => {
    for (const b of beaches) {
      if (b.tideSite) expect(b.tideSite).toMatch(/^VIC_TP\d{3}$/);
      if (b.forecast) expect(["bay", "coast"]).toContain(b.forecast);
    }
  });

  it("every tip has text, a named source and an https link, and tipped beaches say when they were checked", () => {
    for (const b of beaches) {
      for (const t of b.tips ?? []) {
        expect(t.text.length).toBeGreaterThan(10);
        expect(t.source.length).toBeGreaterThan(2);
        expect(t.url).toMatch(/^https:\/\//);
      }
      if (b.tips?.length) expect(b.tipsChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the researched beaches have tips", () => {
    for (const id of ["jawbone", "half-moon-bay", "ricketts-point", "mushroom-reef"]) expect(byId(id).tips!.length).toBeGreaterThanOrEqual(3);
  });
});
