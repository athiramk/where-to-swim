import { describe, expect, it } from "vitest";
import { conditionsFor, daylightFor, type Beach, type Data } from "./conditions.ts";
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
  it("a sanctuary at 2pm is Poor because the tide isn't low, and names the next deep low", () => {
    const r = scoreBeach(sanctuary.faces, conditionsFor(sanctuary, data, t("2026-11-10T03:00:00Z")));
    expect(r.label).toBe("Poor");
    expect(r.reason).toMatch(/needs low tide \(next low .*0\.22 m\)/);
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
