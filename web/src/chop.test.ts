import { describe, expect, it } from "vitest";
import { effectiveFetchKm, estimateChopM } from "./chop.ts";

describe("effectiveFetchKm", () => {
  it("is the full fetch straight onshore", () => expect(effectiveFetchKm(270, 270, 10)).toBeCloseTo(10));
  it("tapers off-axis and bottoms out at 0.5 km for offshore wind", () => {
    expect(effectiveFetchKm(315, 270, 10)).toBeCloseTo(7.07, 1);
    expect(effectiveFetchKm(90, 270, 10)).toBe(0.5);
    expect(effectiveFetchKm(180, 270, 10)).toBe(0.5); // side-on: no fetch over water to this beach
  });
});

describe("estimateChopM", () => {
  it("gives a plausible bay chop: 20 km/h onshore over 9 km is about 0.3 m", () => {
    expect(estimateChopM(20, 270, 270, 9)).toBeGreaterThan(0.2);
    expect(estimateChopM(20, 270, 270, 9)).toBeLessThan(0.4);
  });
  it("is tiny for an offshore wind", () => {
    expect(estimateChopM(20, 90, 270, 9)!).toBeLessThan(0.1);
  });
  it("is bigger with more fetch for the same onshore wind", () => {
    expect(estimateChopM(25, 250, 250, 35)!).toBeGreaterThan(estimateChopM(25, 250, 250, 6)!);
  });
  it("grows with wind speed and is capped at 2 m", () => {
    expect(estimateChopM(40, 270, 270, 20)!).toBeGreaterThan(estimateChopM(10, 270, 270, 20)!);
    expect(estimateChopM(200, 270, 270, 200)).toBe(2);
  });
  it("is null when an input is missing", () => {
    expect(estimateChopM(null, 270, 270, 9)).toBeNull();
    expect(estimateChopM(20, null, 270, 9)).toBeNull();
    expect(estimateChopM(20, 270, 270, undefined)).toBeNull();
  });
});
