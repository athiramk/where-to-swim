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

  it("the three researched beaches have tips", () => {
    for (const id of ["jawbone", "half-moon-bay", "ricketts-point"]) expect(byId(id).tips!.length).toBeGreaterThanOrEqual(3);
  });
});
