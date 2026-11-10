import { describe, expect, it } from "vitest";
import { sunTimes } from "./sun.ts";

const MELB = { lat: -37.8136, lon: 144.9631 };
const melbHM = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Melbourne" });
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe("sunTimes", () => {
  it("gives plausible Melbourne times in November (daylight saving)", () => {
    const t = sunTimes(Date.parse("2026-11-10T03:00:00Z"), MELB.lat, MELB.lon)!;
    expect(minutes(melbHM(t.sunrise))).toBeGreaterThan(5 * 60 + 50); // after 5:50am
    expect(minutes(melbHM(t.sunrise))).toBeLessThan(6 * 60 + 20); // before 6:20am
    expect(minutes(melbHM(t.sunset))).toBeGreaterThan(19 * 60 + 55); // after 7:55pm
    expect(minutes(melbHM(t.sunset))).toBeLessThan(20 * 60 + 25); // before 8:25pm
  });

  it("has a shorter day in winter than in summer", () => {
    const len = (iso: string) => {
      const t = sunTimes(Date.parse(iso), MELB.lat, MELB.lon)!;
      return (t.sunset - t.sunrise) / 3_600_000;
    };
    expect(len("2026-06-21T03:00:00Z")).toBeLessThan(10.5);
    expect(len("2026-12-21T03:00:00Z")).toBeGreaterThan(14.5);
  });

  it("picks the same local day from early morning and late evening", () => {
    const morning = sunTimes(Date.parse("2026-11-09T14:30:00Z"), MELB.lat, MELB.lon)!; // 1:30am Melbourne, 10 Nov
    const evening = sunTimes(Date.parse("2026-11-10T12:30:00Z"), MELB.lat, MELB.lon)!; // 11:30pm Melbourne, 10 Nov
    expect(Math.abs(morning.sunset - evening.sunset)).toBeLessThan(60_000);
  });
});
