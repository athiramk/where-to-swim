import { describe, expect, it } from "vitest";
import { ninePeriod, rainTotals, type RainReading } from "./rain.ts";

const AEDT = 11 * 3_600_000; // Melbourne is UTC+11 in November
const localStr = (ms: number) => new Date(ms + AEDT).toISOString().replace(/[-:T]/g, "").slice(0, 14); // yyyymmddhhmmss local
const ms = (localFull: string) => {
  const n = (a: number, b: number) => Number(localFull.slice(a, b));
  return Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14)) - AEDT;
};

const NOW = ms("20261110150000");

/**
 * Half-hourly readings from 7 Nov 15:30 to 10 Nov 15:00 (local), like BOM's file. `rainAt` maps a local
 * timestamp to mm that fell in that half hour; the series is turned into BOM-style "rain since 9am" values.
 */
function series(rainAt: Record<string, number> = {}, from = "20261107153000", to = "20261110150000"): RainReading[] {
  const out: RainReading[] = [];
  let cum = 0;
  let period: number | null = null;
  for (let t = ms(from); t <= ms(to); t += 30 * 60_000) {
    const localFull = localStr(t);
    const p = ninePeriod(localFull);
    if (period !== null && p !== period) cum = 0; // 9am reset
    period = p;
    cum = Math.round((cum + (rainAt[localFull] ?? 0)) * 10) / 10;
    out.push({ timeMs: t, localFull, since9am: cum });
  }
  return out;
}

describe("ninePeriod", () => {
  it("puts the 09:00 reading in the earlier period and 09:30 in the next", () => {
    expect(ninePeriod("20261110090000")).toBe(ninePeriod("20261110083000"));
    expect(ninePeriod("20261110093000")).toBe(ninePeriod("20261110150000"));
    expect(ninePeriod("20261110093000")).toBe(ninePeriod("20261110090000") + 1);
  });
});

describe("rainTotals", () => {
  it("returns zeros for a dry spell and reports ~72 h coverage", () => {
    const t = rainTotals(series(), NOW);
    expect(t).toMatchObject({ rain24h: 0, rain72h: 0 });
    expect(t.coverageHours).toBeGreaterThanOrEqual(71);
  });

  it("totals rain inside the last 24 h across the 9am reset", () => {
    const t = rainTotals(series({ "20261109160000": 5, "20261110100000": 3 }), NOW);
    expect(t.rain24h).toBeCloseTo(8, 1); // 5 mm yesterday 4pm + 3 mm this morning
  });

  it("counts rain that fell just before 9am only once", () => {
    const t = rainTotals(series({ "20261110080000": 2 }), NOW);
    expect(t.rain24h).toBeCloseTo(2, 1);
  });

  it("counts rain that falls in the half hour right after the 9am reset", () => {
    const t = rainTotals(series({ "20261110093000": 1.2 }), NOW);
    expect(t.rain24h).toBeCloseTo(1.2, 1);
  });

  it("72 h includes older rain that 24 h excludes", () => {
    const t = rainTotals(series({ "20261108100000": 4 }), NOW);
    expect(t.rain24h).toBe(0);
    expect(t.rain72h).toBeCloseTo(4, 1);
  });

  it("is null when there is too little data", () => {
    expect(rainTotals(series({}, "20261110150000", "20261110150000"), NOW)).toEqual({ rain24h: null, rain72h: null, coverageHours: 0 });
    const short = series({}, "20261110140000", "20261110150000");
    expect(rainTotals(short, NOW).rain24h).toBeNull();
  });

  it("ignores readings where the gauge reported nothing", () => {
    const readings = series({ "20261110100000": 3 });
    readings[readings.length - 4].since9am = null;
    expect(rainTotals(readings, NOW).rain24h).toBeCloseTo(3, 1);
  });
});
