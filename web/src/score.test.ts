import { describe, expect, it } from "vitest";
import { labelFor, onshoreComponent, parseSeaHeight, scoreBeach, type Conditions } from "./score.ts";

const base: Conditions = {
  windFromDeg: 90, // easterly
  windKmh: 9,
  gustKmh: 15,
  seaHeightM: 0.2,
  waterQuality: "Good",
  warnings: [],
  airTempC: 24,
  rainMm: 0,
};
const FACES_WEST = 270;

describe("onshoreComponent", () => {
  it("is -1 for an easterly on a west-facing beach", () => expect(onshoreComponent(90, 270)).toBeCloseTo(-1));
  it("is +1 for a westerly on a west-facing beach", () => expect(onshoreComponent(270, 270)).toBeCloseTo(1));
  it("is ~0 for a southerly (along the shore)", () => expect(Math.abs(onshoreComponent(180, 270))).toBeLessThan(1e-9));
});

describe("parseSeaHeight", () => {
  it("handles BOM phrasing", () => {
    expect(parseSeaHeight("Below 1 metre.")).toBeCloseTo(0.6);
    expect(parseSeaHeight("Around 1 metre.")).toBe(1);
    expect(parseSeaHeight("1 to 1.5 metres.")).toBeCloseTo(1.25);
    expect(parseSeaHeight("Calm")).toBeNull();
    expect(parseSeaHeight(null)).toBeNull();
  });
});

describe("scoreBeach (worked examples)", () => {
  it("calm easterly, clean water is Great", () => {
    const r = scoreBeach(FACES_WEST, base);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.label).toBe("Great");
  });

  it("20 km/h westerly with chop is Fair", () => {
    const r = scoreBeach(FACES_WEST, { ...base, windFromDeg: 270, windKmh: 20, seaHeightM: 0.5 });
    expect(r.label).toBe("Fair");
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.score).toBeLessThan(60);
  });

  it("poor water quality caps the score at 35 even in perfect weather", () => {
    const r = scoreBeach(FACES_WEST, { ...base, waterQuality: "Poor" });
    expect(r.score).toBe(35);
    expect(r.label).toBe("Poor");
    expect(r.caps[0]).toMatch(/water quality/);
  });

  it("easterly beats westerly at the same speed", () => {
    const east = scoreBeach(FACES_WEST, { ...base, windFromDeg: 90, windKmh: 18 });
    const west = scoreBeach(FACES_WEST, { ...base, windFromDeg: 270, windKmh: 18 });
    expect(east.score).toBeGreaterThan(west.score);
  });

  it("a warning caps at 25", () => {
    expect(scoreBeach(FACES_WEST, { ...base, warnings: ["Strong wind"] }).score).toBe(25);
  });

  it("gusts over 45 km/h cap at 40", () => {
    expect(scoreBeach(FACES_WEST, { ...base, gustKmh: 50 }).score).toBe(40);
  });

  it("heavy rain caps at 55", () => {
    expect(scoreBeach(FACES_WEST, { ...base, rainMm: 12 }).score).toBe(55);
  });

  it("strong offshore wind is capped at 55", () => {
    const r = scoreBeach(FACES_WEST, { ...base, windKmh: 28, gustKmh: 35 });
    expect(r.score).toBeLessThanOrEqual(55);
  });

  it("missing inputs are neutral and reported as unknown", () => {
    const r = scoreBeach(FACES_WEST, { ...base, waterQuality: null, seaHeightM: null });
    expect(r.unknown).toEqual(["sea state", "water quality"]);
    expect(r.score).toBeGreaterThan(0);
  });

  it("different beach orientations change the result for the same wind", () => {
    const wnw = { ...base, windFromDeg: 292.5, windKmh: 18 }; // WNW wind
    const faceWest = scoreBeach(270, wnw).score;
    const faceSouthWest = scoreBeach(225, wnw).score;
    expect(faceWest).toBeLessThan(faceSouthWest);
  });
});

describe("labelFor", () => {
  it("uses the agreed thresholds", () => {
    expect(labelFor(100)).toBe("Great");
    expect(labelFor(80)).toBe("Great");
    expect(labelFor(79)).toBe("Good");
    expect(labelFor(60)).toBe("Good");
    expect(labelFor(59)).toBe("Fair");
    expect(labelFor(40)).toBe("Fair");
    expect(labelFor(39)).toBe("Poor");
  });
});
