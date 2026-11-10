// Turns fetched data + a beach + a point in time into scoring inputs. Pure (no DOM), so it is easy to test.
import { estimateChopM } from "./chop.ts";
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
  /** Open-water distance (km) the wind can blow over straight out from the beach; used to estimate local chop. */
  fetchKm?: number;
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
  /** Rain totals from the half-hourly history (null if the history is too short). */
  rain24h?: number | null;
  rain72h?: number | null;
  rainHistoryHours?: number;
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
/** St Kilda Harbour: used when a beach's own wind station is unavailable. */
export const FALLBACK_WIND_STATION = "95864";

export function fmtTime(when: string | number): string {
  return new Date(when).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
}

const melbDay = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

/** "2:30 pm" if today, "tomorrow 2:30 pm" if tomorrow, otherwise "Fri 2:30 pm" (Melbourne time). */
export function fmtWhen(whenMs: number, nowMs: number): string {
  const time = fmtTime(whenMs);
  const day = melbDay(whenMs);
  if (day === melbDay(nowMs)) return time;
  if (day === melbDay(nowMs + 86_400_000)) return `tomorrow ${time}`;
  return `${new Date(whenMs).toLocaleDateString("en-AU", { weekday: "short", timeZone: TZ })} ${time}`;
}

/** Lows that count for this beach (respecting `maxLowTideM`) after `atMs`, soonest first. */
function qualifyingLows(beach: Beach, events: TideEvent[], atMs: number): TideEvent[] {
  return events
    .filter((e) => e.type === "low" && new Date(e.time).getTime() > atMs && (beach.maxLowTideM == null || e.height <= beach.maxLowTideM))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * The next low tide that falls in daylight, with the swim window around it (low tide ± the window, clipped to daylight).
 * Returns null if no daylight low is in the tide data.
 */
export function nextDaylightLowWindow(beach: Beach, d: Data, atMs: number): { low: TideEvent; startMs: number; endMs: number } | null {
  const events = d.tide?.events;
  if (!events) return null;
  const halfMs = CONFIG.lowTideWindowHours * 3_600_000;
  for (const low of qualifyingLows(beach, events, atMs - halfMs)) {
    const lowMs = new Date(low.time).getTime();
    if (!daylightFor(beach, lowMs)?.isDay) continue;
    const sun = sunTimes(lowMs, beach.lat, beach.lon);
    const tw = CONFIG.twilightMin * 60_000;
    const startMs = Math.max(lowMs - halfMs, sun ? sun.sunrise - tw : -Infinity);
    const endMs = Math.min(lowMs + halfMs, sun ? sun.sunset + tw : Infinity);
    if (endMs > atMs) return { low, startMs, endMs };
  }
  return null;
}

/** Tide verdict for a low-tide-only beach, plus when the next daylight swim window is. */
export function lowTideFor(
  beach: Beach,
  d: Data,
  atMs: number,
): { inWindow: boolean; label: string; bestTime: string | null } | null {
  const state = lowTideState(d.tide?.events, atMs, CONFIG.lowTideWindowHours, beach.maxLowTideM);
  if (!state) return null;
  const win = nextDaylightLowWindow(beach, d, atMs);
  const bestTime = win
    ? `${fmtWhen(win.startMs, atMs)}–${fmtTime(win.endMs)} (low ${win.low.height} m at ${fmtTime(win.low.time)})`
    : null;
  if (state.inWindow) return { inWindow: true, label: `low tide ${fmtTime(state.nearest.time)}, ${state.nearest.height} m`, bestTime };
  return {
    inWindow: false,
    label: win ? `next daylight low ${fmtWhen(new Date(win.low.time).getTime(), atMs)}, ${win.low.height} m` : "no daylight low tide in the next 2 days",
    bestTime,
  };
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
  const wind = d.stations[beach.windStation] ?? d.stations[FALLBACK_WIND_STATION];
  const wx = d.stations[d.weatherStation];
  const forecastM = parseSeaHeight(d.bay?.seas);
  // Local chop from wind + fetch differs between beaches; the bay forecast is a floor (half of it) so a stormy
  // forecast still counts. Falls back to the forecast alone if wind or fetch is missing.
  const localM = estimateChopM(wind?.windKmh, wind?.windDirDeg, beach.faces, beach.fetchKm);
  const seaHeightM = localM == null ? forecastM : Math.max(localM, 0.5 * (forecastM ?? 0));
  const seaNote =
    localM == null ? (d.bay?.seas ?? null) : `est. chop ${localM.toFixed(1)} m${d.bay?.seas ? ` (bay forecast: ${d.bay.seas.replace(/\.$/, "")})` : ""}`;
  return {
    needsLowTide: !!beach.needsLowTide,
    lowTide: beach.needsLowTide ? lowTideFor(beach, d, atMs) : undefined,
    daylight: daylightFor(beach, atMs),
    storm: mentionsThunderstorm(d.bay?.weather) || mentionsThunderstorm(wind?.weather) || mentionsThunderstorm(wx?.weather),
    windFromDeg: wind?.windDirDeg ?? null,
    windKmh: wind?.windKmh ?? null,
    gustKmh: wind?.gustKmh ?? null,
    seaHeightM,
    seaNote,
    waterQuality: (beach.epaSite && d.waterQuality?.[beach.epaSite]) || null,
    warnings: d.warnings ?? [],
    airTempC: wx?.airTemp ?? null,
    rainMm: wx?.rain24h ?? wx?.rainSince9am ?? null,
    rain72hMm: wx?.rain72h ?? null,
  };
}
