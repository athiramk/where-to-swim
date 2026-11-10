import { describe, expect, it } from "vitest";
import { lowTideState, nextEvent, type TideEvent } from "./tide.ts";

const t = (iso: string) => new Date(iso).getTime();
const events: TideEvent[] = [
  { type: "low", time: "2026-11-09T23:54:00Z", height: 0.5 },
  { type: "high", time: "2026-11-10T04:51:00Z", height: 0.85 },
  { type: "low", time: "2026-11-10T11:50:00Z", height: 0.22 },
  { type: "high", time: "2026-11-11T05:30:00Z", height: 0.9 },
];

describe("lowTideState", () => {
  it("is in the window within 1.5 h of a low (before or after)", () => {
    expect(lowTideState(events, t("2026-11-10T11:00:00Z"), 1.5)?.inWindow).toBe(true);
    expect(lowTideState(events, t("2026-11-10T13:00:00Z"), 1.5)?.inWindow).toBe(true);
  });
  it("is outside the window near high tide", () => {
    const s = lowTideState(events, t("2026-11-10T04:51:00Z"), 1.5);
    expect(s?.inWindow).toBe(false);
    expect(s?.nearest.height).toBeDefined();
  });
  it("returns null when the data doesn't cover now, instead of guessing", () => {
    expect(lowTideState(events, t("2026-12-01T00:00:00Z"), 1.5)).toBeNull();
    expect(lowTideState([], t("2026-11-10T00:00:00Z"), 1.5)).toBeNull();
    expect(lowTideState(null, t("2026-11-10T00:00:00Z"), 1.5)).toBeNull();
  });
});

describe("lowTideState with a maximum low height", () => {
  it("ignores the shallow 0.5 m low when only lows <= 0.4 m count", () => {
    // Exactly at the 0.5 m low: normally 'in window', but not for a 0.4 m limit.
    expect(lowTideState(events, t("2026-11-09T23:54:00Z"), 1.5)?.inWindow).toBe(true);
    expect(lowTideState(events, t("2026-11-10T00:00:00Z"), 1.5, 0.4)?.inWindow).toBe(false);
  });
  it("still counts the deep 0.22 m low", () => {
    expect(lowTideState(events, t("2026-11-10T11:50:00Z"), 1.5, 0.4)?.inWindow).toBe(true);
  });
  it("is unknown when no low qualifies", () => {
    expect(lowTideState(events, t("2026-11-10T06:00:00Z"), 1.5, 0.1)).toBeNull();
  });
  it("nextEvent skips shallow lows when a limit is given", () => {
    expect(nextEvent(events, "low", t("2026-11-09T22:00:00Z"))?.height).toBe(0.5);
    expect(nextEvent(events, "low", t("2026-11-09T22:00:00Z"), 0.4)?.height).toBe(0.22);
  });
});

describe("nextEvent", () => {
  it("finds the next high and low after now", () => {
    expect(nextEvent(events, "high", t("2026-11-10T06:00:00Z"))?.time).toBe("2026-11-11T05:30:00Z");
    expect(nextEvent(events, "low", t("2026-11-10T06:00:00Z"))?.height).toBe(0.22);
    expect(nextEvent(events, "low", t("2026-11-12T00:00:00Z"))).toBeNull();
  });
});
