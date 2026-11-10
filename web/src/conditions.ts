// Turns fetched data + a beach + a point in time into scoring inputs. Pure (no DOM), so it is easy to test.
import { CONFIG, mentionsThunderstorm, parseSeaHeight, type Conditions } from "./score.ts";
import { sunTimes } from "./sun.ts";
import { lowTideState, nextEvent, type TideEvent } from "./tide.ts";

export interface Beach {
  id: string;
  name: string;
  faces: number;
  lat: number;
  lon: number;
  windStation: string;
  epaSite: string | null;
  needsLowTide?: boolean;
  /** For low-tide beaches: only lows at or below this height (m) count as "low". */
  maxLowTideM?: number;
  note?: string;
}

export interface Station {
  name: string;
  observedAt: string;
  windDirText: string | null;
  windDirDeg: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  airTemp: number | null;
  rainSince9am: number | null;
  weather?: string | null;
}

export interface Data {
  fetchedAt: string;
  stations: Record<string, Station | null>;
  weatherStation: string;
  bay: { winds: string | null; seas: string | null; weather: string | null; issuedAt: string } | null;
  melbourne: { uvText: string | null; uvIndex: number | null; rainChancePct: number | null } | null;
  tide: { site: string; events: TideEvent[] } | null;
  warnings: string[] | null; // null = couldn't read the feed; [] = none active
  waterQuality: Record<string, "Good" | "Fair" | "Poor"> | null;
  errors: string[];
  attribution: string;
}

export const TZ = "Australia/Melbourne";

export function fmtTime(when: string | number): string {
  return new Date(when).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

/** Tide verdict for a low-tide-only beach, e.g. { inWindow: false, label: "next low 10:50pm, 0.22 m" }. */
export function lowTideFor(beach: Beach, d: Data, atMs: number): { inWindow: boolean; label: string } | null {
  const state = lowTideState(d.tide?.events, atMs, CONFIG.lowTideWindowHours, beach.maxLowTideM);
  if (!state) return null;
  if (state.inWindow) return { inWindow: true, label: `low tide ${fmtTime(state.nearest.time)}, ${state.nearest.height} m` };
  const next = nextEvent(d.tide!.events, "low", atMs, beach.maxLowTideM);
  return { inWindow: false, label: next ? `next low ${fmtTime(next.time)}, ${next.height} m` : "tide is not low" };
}

/** Is it daylight (allowing the twilight margin) at this beach, and a short label saying why. */
export function daylightFor(beach: Beach, atMs: number): { isDay: boolean; label: string } | null {
  const today = sunTimes(atMs, beach.lat, beach.lon);
  if (!today) return null;
  const tw = CONFIG.twilightMin * 60_000;
  if (atMs < today.sunrise - tw) return { isDay: false, label: `before sunrise ${fmtTime(today.sunrise)}` };
  if (atMs > today.sunset + tw) {
    const tomorrow = sunTimes(atMs + 86_400_000, beach.lat, beach.lon);
    return { isDay: false, label: tomorrow ? `after dark, sunrise ${fmtTime(tomorrow.sunrise)}` : "after dark" };
  }
  return { isDay: true, label: `sunset ${fmtTime(today.sunset)}` };
}

export function conditionsFor(beach: Beach, d: Data, atMs: number = Date.now()): Conditions {
  const wind = d.stations[beach.windStation];
  const wx = d.stations[d.weatherStation];
  return {
    needsLowTide: !!beach.needsLowTide,
    lowTide: beach.needsLowTide ? lowTideFor(beach, d, atMs) : undefined,
    daylight: daylightFor(beach, atMs),
    storm: mentionsThunderstorm(d.bay?.weather) || mentionsThunderstorm(wind?.weather) || mentionsThunderstorm(wx?.weather),
    windFromDeg: wind?.windDirDeg ?? null,
    windKmh: wind?.windKmh ?? null,
    gustKmh: wind?.gustKmh ?? null,
    seaHeightM: parseSeaHeight(d.bay?.seas),
    waterQuality: (beach.epaSite && d.waterQuality?.[beach.epaSite]) || null,
    warnings: d.warnings ?? [],
    airTempC: wx?.airTemp ?? null,
    rainMm: wx?.rainSince9am ?? null,
  };
}
