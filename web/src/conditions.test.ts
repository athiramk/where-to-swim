import { describe, expect, it } from "vitest";
import { conditionsFor, daylightFor, fmtWhen, lowTideFor, type Beach, type Data } from "./conditions.ts";
import { scoreBeach } from "./score.ts";

const t = (iso: string) => Date.parse(iso);

const ordinary: Beach = { id: "sm", name: "South Melbourne", faces: 265, lat: -37.848, lon: 144.942, windStation: "w", epaSite: "South Melbourne" };
const sanctuary: Beach = { ...ordinary, id: "rp", name: "Ricketts Point", needsLowTide: true, maxLowTideM: 0.4 };

const data: Data = {
  fetchedAt: "2026-11-10T03:00:00Z",
  weatherStation: "x",
  stations: {
    w: { name: "W", observedAt: "2026-11-10T03:00:00Z", windDirText: "E", windDirDeg: 90, windKmh: 9, gustKmh: 15, airTemp: null, rainSince9am: null, weather: null },
    x: { name: "X", observedAt: "2026-11-10T03:00:00Z", windDirText: "E", windDirDeg: 90, windKmh: 9, gustKmh: 15, airTemp: 24, rainSince9am: 0, weather: null },
  },
  bay: { winds: null, seas: "Around 0.2 metre.", weather: "Partly cloudy.", issuedAt: "2026-11-09T23:00:00Z" },
  melbourne: null,
  tide: {
    site: "Williamstown",
    events: [
      { type: "low", time: "2026-11-09T23:54:00Z", height: 0.5 },
      { type: "high", time: "2026-11-10T04:51:00Z", height: 0.85 },
      { type: "low", time: "2026-11-10T11:50:00Z", height: 0.22 },
      { type: "high", time: "2026-11-11T05:30:00Z", height: 0.9 },
    ],
  },
  warnings: [],
  waterQuality: { "South Melbourne": "Good" },
  errors: [],
  attribution: "",
};

describe("daylightFor", () => {
  it("is day at 2pm Melbourne and shows the sunset", () => {
    const d = daylightFor(ordinary, t("2026-11-10T03:00:00Z"))!;
    expect(d.isDay).toBe(true);
    expect(d.label).toMatch(/^sunset /);
  });
  it("is dark at 11pm and 3am, with the next sunrise in the label", () => {
    const late = daylightFor(ordinary, t("2026-11-10T12:00:00Z"))!; // 11pm
    const early = daylightFor(ordinary, t("2026-11-09T16:00:00Z"))!; // 3am
    expect(late.isDay).toBe(false);
    expect(late.label).toMatch(/after dark, sunrise/);
    expect(early.isDay).toBe(false);
    expect(early.label).toMatch(/before sunrise/);
  });
});

describe("Phase 2: chop, stations and rain", () => {
  const westerly: Data = {
    ...data,
    stations: {
      ...data.stations,
      w: { ...data.stations.w!, windDirText: "W", windDirDeg: 260, windKmh: 22, gustKmh: 28 },
    },
    bay: { ...data.bay!, seas: "Below 1 metre." },
  };
  const at = t("2026-11-10T03:00:00Z");

  it("a longer-fetch beach gets a bigger estimated chop for the same westerly", () => {
    const short = conditionsFor({ ...ordinary, fetchKm: 6 }, westerly, at);
    const long = conditionsFor({ ...ordinary, fetchKm: 35 }, westerly, at);
    expect(long.seaHeightM!).toBeGreaterThan(short.seaHeightM!);
    expect(long.seaNote).toMatch(/^est\. chop \d\.\d m \(bay forecast: Below 1 metre\)$/);
  });

  it("uses the bay forecast alone when a beach has no fetch estimate", () => {
    const c = conditionsFor(ordinary, westerly, at);
    expect(c.seaHeightM).toBeCloseTo(0.6, 1);
    expect(c.seaNote).toBe("Below 1 metre.");
  });

  it("the bay forecast is a floor: a stormy forecast still counts even with offshore wind", () => {
    const stormySea: Data = { ...data, bay: { ...data.bay!, seas: "2 to 3 metres." } };
    const c = conditionsFor({ ...ordinary, fetchKm: 10 }, stormySea, at);
    expect(c.seaHeightM!).toBeGreaterThanOrEqual(1.2);
  });

  it("falls back to the St Kilda station when a beach's own station is missing", () => {
    const withFallback: Data = { ...data, stations: { ...data.stations, "95864": data.stations.w!, w2: null } };
    const c = conditionsFor({ ...ordinary, windStation: "w2" }, withFallback, at);
    expect(c.windKmh).toBe(9);
  });

  it("uses 24 h rain (not just since 9am) for the heavy-rain cap", () => {
    const wet: Data = { ...data, stations: { ...data.stations, x: { ...data.stations.x!, rainSince9am: 0, rain24h: 14, rain72h: 20 } } };
    const c = conditionsFor(ordinary, wet, at);
    expect(c.rainMm).toBe(14);
    expect(c.rain72hMm).toBe(20);
    const r = scoreBeach(ordinary.faces, c);
    expect(r.score).toBe(55);
    expect(r.reason).toMatch(/heavy rain \(14 mm in 24 h\)/);
  });

  it("falls back to rain since 9am if the history totals are missing", () => {
    const old: Data = { ...data, stations: { ...data.stations, x: { ...data.stations.x!, rainSince9am: 3 } } };
    expect(conditionsFor(ordinary, old, at).rainMm).toBe(3);
  });
});

describe("Phase 3: daylight low-tide windows", () => {
  // Williamstown-style lows: a deep one at night (0.22 m) and a shallow one in the day (0.5 m), alternating.
  const tideData: Data = {
    ...data,
    tide: {
      site: "W",
      events: [
        { type: "low", time: "2026-11-09T23:54:00Z", height: 0.5 }, // 10:54 am 10 Nov
        { type: "high", time: "2026-11-10T04:51:00Z", height: 0.85 },
        { type: "low", time: "2026-11-10T11:50:00Z", height: 0.22 }, // 10:50 pm 10 Nov (dark)
        { type: "low", time: "2026-11-11T00:38:00Z", height: 0.5 }, // 11:38 am 11 Nov
        { type: "high", time: "2026-11-11T05:30:00Z", height: 0.9 },
        { type: "low", time: "2026-11-11T12:27:00Z", height: 0.22 }, // 11:27 pm 11 Nov (dark)
        { type: "low", time: "2026-11-12T01:16:00Z", height: 0.5 }, // 12:16 pm 12 Nov
      ],
    },
  };
  const twoPm = t("2026-11-10T03:00:00Z");
  const both: Beach = { ...sanctuary, maxLowTideM: 0.5 };
  const deepOnly: Beach = { ...sanctuary, maxLowTideM: 0.4 };

  it("names the next low tide that is in daylight, skipping the night-time one", () => {
    const v = lowTideFor(both, tideData, twoPm)!;
    expect(v.inWindow).toBe(false);
    expect(v.label).toMatch(/^next daylight low tomorrow 11:38\sam, 0\.5 m$/);
    expect(v.bestTime).toMatch(/^tomorrow 10:08\sam–1:08\spm \(low 0\.5 m at 11:38\sam\)$/);
  });

  it("says so when no daylight low is in the data (deep lows only, both at night)", () => {
    const v = lowTideFor(deepOnly, tideData, twoPm)!;
    expect(v.inWindow).toBe(false);
    expect(v.label).toBe("no daylight low tide in the next 2 days");
    expect(v.bestTime).toBeNull();
  });

  it("during the window it is OK, and the window has no 'tomorrow' prefix", () => {
    const v = lowTideFor(both, tideData, t("2026-11-11T00:30:00Z"))!; // 11:30 am 11 Nov
    expect(v.inWindow).toBe(true);
    expect(v.label).toMatch(/^low tide 11:38\sam, 0\.5 m$/);
    expect(v.bestTime).toMatch(/^10:08\sam–1:08\spm/);
  });

  it("the card reason points at the daylight low, not the 10:50 pm one", () => {
    const r = scoreBeach(both.faces, conditionsFor(both, tideData, twoPm));
    expect(r.reason).toMatch(/needs low tide \(next daylight low tomorrow 11:38\sam, 0\.5 m\)/);
    expect(r.reason).not.toMatch(/10:50/);
  });

  it("fmtWhen: today, tomorrow and a later weekday", () => {
    expect(fmtWhen(t("2026-11-10T03:00:00Z"), twoPm)).toMatch(/^2:00\spm$/);
    expect(fmtWhen(t("2026-11-11T01:00:00Z"), twoPm)).toMatch(/^tomorrow 12:00\spm$/);
    expect(fmtWhen(t("2026-11-13T01:00:00Z"), twoPm)).toMatch(/^Fri 12:00\spm$/);
  });
});

describe("Open-coast beach (Mushroom Reef): own tide site, own forecast, swell", () => {
  const mushroom: Beach = {
    ...sanctuary, id: "mr", name: "Mushroom Reef", faces: 180, lat: -38.49, lon: 144.998,
    maxLowTideM: undefined, tideSite: "VIC_TP020", forecast: "coast",
  };
  const coastData: Data = {
    ...data,
    coast: {
      area: "Central Coast", winds: "East to southeasterly 10 to 15 knots.", seas: "Below 1 metre.",
      swell1: "Southwesterly around 1 metre, increasing to 1 to 2 metres in the west.", swell2: null, weather: "Partly cloudy.", issuedAt: "2026-11-09T23:00:00Z",
    },
    tides: {
      // Williamstown: low at 11:38 am on 11 Nov. Flinders: low at 7:15 am that day (about 3.5 h earlier, and deeper/higher range).
      VIC_TP003: { site: "Williamstown", events: [
        { type: "high", time: "2026-11-10T14:00:00Z", height: 0.9 },
        { type: "low", time: "2026-11-11T00:38:00Z", height: 0.5 },
        { type: "high", time: "2026-11-11T05:30:00Z", height: 0.9 },
      ] },
      VIC_TP020: { site: "Flinders Jetty", events: [
        { type: "high", time: "2026-11-10T13:14:00Z", height: 2.1 },
        { type: "low", time: "2026-11-10T20:15:00Z", height: 1.03 }, // 7:15 am 11 Nov
        { type: "high", time: "2026-11-11T02:15:00Z", height: 2.61 },
      ] },
    },
  };
  const sevenAm = t("2026-11-10T20:00:00Z"); // 7:00 am 11 Nov, daylight

  it("sea height is the larger of the coast seas and the FIRST swell clause (not the regional '1 to 2 m in the west')", () => {
    const c = conditionsFor(mushroom, coastData, sevenAm);
    expect(c.seaHeightM).toBe(1); // seas 0.6 m, swell 1 m
    // The number uses only the first swell clause, but the card shows BOM's full wording so nothing is hidden.
    expect(c.seaNote).toBe("Coast forecast: seas Below 1 metre; swell Southwesterly around 1 metre, increasing to 1 to 2 metres in the west");
  });

  it("an ordinary Port Phillip beach still uses the bay forecast, not the coast swell", () => {
    const c = conditionsFor(ordinary, coastData, sevenAm);
    expect(c.seaHeightM!).toBeLessThan(0.5);
  });

  it("uses Flinders' tide times: in the low-tide window at 7:00 am when Williamstown's low is 4+ hours away", () => {
    expect(conditionsFor(mushroom, coastData, sevenAm).lowTide).toMatchObject({ inWindow: true });
    const williamstownBeach: Beach = { ...sanctuary, maxLowTideM: 0.5 }; // default Williamstown site; its 0.5 m low counts
    expect(conditionsFor(williamstownBeach, coastData, sevenAm).lowTide).toMatchObject({ inWindow: false });
  });

  it("does not silently use Williamstown's tides when the beach's own tide site is missing", () => {
    const noFlinders: Data = { ...coastData, tides: { VIC_TP003: coastData.tides!.VIC_TP003 } };
    const c = conditionsFor(mushroom, noFlinders, sevenAm);
    expect(c.lowTide).toBeNull();
    expect(scoreBeach(mushroom.faces, c).unknown).toContain("tide");
  });

  it("a per-beach window overrides the default 1.5 h", () => {
    const at = t("2026-11-10T22:45:00Z"); // 2.5 h after the Flinders low
    expect(conditionsFor(mushroom, coastData, at).lowTide).toMatchObject({ inWindow: false });
    expect(conditionsFor({ ...mushroom, lowTideWindowHours: 3 }, coastData, at).lowTide).toMatchObject({ inWindow: true });
  });

  it("thunderstorms in the COAST forecast cap this beach but not a bay beach", () => {
    const stormy: Data = { ...coastData, coast: { ...coastData.coast!, weather: "The chance of a thunderstorm." } };
    expect(conditionsFor(mushroom, stormy, sevenAm).storm).toBe(true);
    expect(conditionsFor(ordinary, stormy, sevenAm).storm).toBe(false);
  });

  it("a big swell makes the sea points small (so 'good tide' alone doesn't make it Good)", () => {
    const bigSwell: Data = { ...coastData, coast: { ...coastData.coast!, seas: "2 metres.", swell1: "Southwesterly 3 metres." } };
    const calm = scoreBeach(mushroom.faces, conditionsFor(mushroom, coastData, sevenAm));
    const rough = scoreBeach(mushroom.faces, conditionsFor(mushroom, bigSwell, sevenAm));
    expect(rough.points.sea).toBe(0);
    expect(rough.score).toBeLessThan(calm.score);
  });
});

describe("conditionsFor + scoreBeach (end to end)", () => {
  it("an ordinary beach at 2pm in calm easterly weather is Great", () => {
    const r = scoreBeach(ordinary.faces, conditionsFor(ordinary, data, t("2026-11-10T03:00:00Z")));
    expect(r.label).toBe("Great");
  });
  it("the same beach at 11pm is Poor because it is dark", () => {
    const r = scoreBeach(ordinary.faces, conditionsFor(ordinary, data, t("2026-11-10T12:00:00Z")));
    expect(r.label).toBe("Poor");
    expect(r.reason).toMatch(/after dark/);
  });
  it("a sanctuary at 2pm is Poor because the tide isn't low; the only deep low is at night, so it says no daylight low", () => {
    const r = scoreBeach(sanctuary.faces, conditionsFor(sanctuary, data, t("2026-11-10T03:00:00Z")));
    expect(r.label).toBe("Poor");
    expect(r.reason).toMatch(/needs low tide \(no daylight low tide in the next 2 days\)/);
  });
  it("a sanctuary at low tide in daylight can be Great (tide window uses the deep low only)", () => {
    // 11:50Z is the 0.22 m low (10:50pm local = dark), so test the window logic via a daytime low instead.
    const daytime: Data = { ...data, tide: { site: "W", events: [
      { type: "low", time: "2026-11-09T22:00:00Z", height: 0.5 },
      { type: "low", time: "2026-11-10T02:30:00Z", height: 0.22 }, // 1:30pm local
      { type: "high", time: "2026-11-10T08:00:00Z", height: 0.9 },
    ] } };
    const r = scoreBeach(sanctuary.faces, conditionsFor(sanctuary, daytime, t("2026-11-10T03:00:00Z")));
    expect(r.label).toBe("Great");
  });
  it("thunderstorms in the bay forecast cap the score", () => {
    const stormy: Data = { ...data, bay: { ...data.bay!, weather: "The chance of a thunderstorm in the afternoon." } };
    const r = scoreBeach(ordinary.faces, conditionsFor(ordinary, stormy, t("2026-11-10T03:00:00Z")));
    expect(r.score).toBeLessThanOrEqual(55);
    expect(r.reason).toMatch(/thunderstorms/);
  });
  it("an active warning caps the score; an unreadable warnings feed does not", () => {
    const warned: Data = { ...data, warnings: ["Strong Wind Warning for Port Phillip"] };
    expect(scoreBeach(ordinary.faces, conditionsFor(ordinary, warned, t("2026-11-10T03:00:00Z"))).score).toBe(25);
    const unknown: Data = { ...data, warnings: null };
    expect(scoreBeach(ordinary.faces, conditionsFor(ordinary, unknown, t("2026-11-10T03:00:00Z"))).label).toBe("Great");
  });
});
