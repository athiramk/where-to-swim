// Fetches BOM data and writes web/public/data.json.
// Run with: npm run fetch   (Node 22.18+/24 runs .ts directly)
import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rainTotals, type RainReading } from "./rain.ts";
import { parseTideTable } from "./tides.ts";
import { relevantWarnings } from "./warnings.ts";

const UA = "where-to-swim personal-use app";
const BOM = "https://www.bom.gov.au";
const PRIMARY_WIND_STATION = "95864"; // St Kilda Harbour RMYS: required, and the fallback when a beach's own station is down
const WEATHER_STATION = "95936"; // Melbourne (Olympic Park) (air temp, rain)
const TIDE_SITE = "VIC_TP003"; // Melbourne (Williamstown): the default tide site for Port Phillip beaches
// Names for the BOM tide sites we use (any beach can name its own `tideSite` in data/beaches.json).
const TIDE_SITE_NAMES: Record<string, string> = { VIC_TP003: "Melbourne (Williamstown)", VIC_TP020: "Flinders Jetty" };

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function compassToDegrees(dir: string | null | undefined): number | null {
  if (!dir) return null;
  const i = COMPASS.indexOf(dir.trim().toUpperCase());
  return i === -1 ? null : i * 22.5;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

async function observation(station: string) {
  const json = JSON.parse(await get(`${BOM}/fwo/IDV60801/IDV60801.${station}.json`));
  const r = json.observations.data[0];
  const issued = String(r.aifstime_utc); // yyyymmddhhmmss UTC
  const observedAt = `${issued.slice(0, 4)}-${issued.slice(4, 6)}-${issued.slice(6, 8)}T${issued.slice(8, 10)}:${issued.slice(10, 12)}:${issued.slice(12, 14)}Z`;
  // History is newest-first, half-hourly (about 3 days). Used to total rain over 24 h / 72 h.
  const readings: RainReading[] = (json.observations.data as any[]).map((x) => {
    const u = String(x.aifstime_utc);
    return {
      timeMs: Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), +u.slice(8, 10), +u.slice(10, 12), +u.slice(12, 14)),
      localFull: String(x.local_date_time_full),
      since9am: num(x.rain_trace),
    };
  });
  const rain = rainTotals(readings, Date.now());
  return {
    name: json.observations.header[0].name as string,
    observedAt,
    windDirText: (r.wind_dir as string) ?? null,
    windDirDeg: compassToDegrees(r.wind_dir),
    windKmh: num(r.wind_spd_kmh),
    gustKmh: num(r.gust_kmh),
    airTemp: num(r.air_temp),
    rainSince9am: num(r.rain_trace),
    rain24h: rain.rain24h,
    rain72h: rain.rain72h,
    rainHistoryHours: rain.coverageHours,
    weather: typeof r.weather === "string" && r.weather !== "-" && r.weather.trim() ? (r.weather as string) : null,
  };
}

// Active Victorian warnings (RSS). Returns titles of swimming-relevant ones; [] = none active.
async function warnings() {
  return relevantWarnings(await get(`${BOM}/fwo/IDZ00059.warnings_vic.xml`));
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (n) => ["area", "forecast-period", "text"].includes(n) });

function periodTexts(doc: any, aac: string, periodIndex = 0): Record<string, string> {
  const areas: any[] = doc.product.forecast.area;
  const area = areas.find((a) => a["@_aac"] === aac);
  if (!area) throw new Error(`area ${aac} not found`);
  const period = area["forecast-period"].find((p: any) => String(p["@_index"]) === String(periodIndex));
  if (!period) throw new Error(`period ${periodIndex} not found in ${aac}`);
  const out: Record<string, string> = {};
  for (const t of period.text ?? []) out[t["@_type"]] = typeof t === "string" ? t : String(t["#text"] ?? "");
  return out;
}

async function bayForecast() {
  const doc = xml.parse(await get(`${BOM}/fwo/IDV10460.xml`));
  const t = periodTexts(doc, "VIC_MW005"); // Port Phillip
  return { winds: t.forecast_winds ?? null, seas: t.forecast_seas ?? null, weather: t.forecast_weather ?? null, issuedAt: doc.product.amoc["issue-time-utc"] as string };
}

// Open-coast (Bass Strait) marine forecast for "Central Coast: Cape Otway to Wilsons Promontory" (VIC_MW002).
// Covers Flinders. Unlike the bay forecast it includes swell, which matters at exposed reefs such as Mushroom Reef.
async function coastForecast() {
  const doc = xml.parse(await get(`${BOM}/fwo/IDV10200.xml`));
  const t = periodTexts(doc, "VIC_MW002");
  return {
    area: "Central Coast: Cape Otway to Wilsons Promontory",
    winds: t.forecast_winds ?? null,
    seas: t.forecast_seas ?? null,
    swell1: t.forecast_swell1 ?? null,
    swell2: t.forecast_swell2 ?? null,
    weather: t.forecast_weather ?? null,
    issuedAt: doc.product.amoc["issue-time-utc"] as string,
  };
}

async function melbourneForecast() {
  const doc = xml.parse(await get(`${BOM}/fwo/IDV10450.xml`));
  const metro = periodTexts(doc, "VIC_ME001");
  const city = periodTexts(doc, "VIC_PT042");
  const uvMatch = /UV Index predicted to reach (\d+)/i.exec(metro.uv_alert ?? "");
  const rain = /(\d+)%/.exec(city.probability_of_precipitation ?? "");
  return { uvText: metro.uv_alert ?? null, uvIndex: uvMatch ? Number(uvMatch[1]) : null, rainChancePct: rain ? Number(rain[1]) : null };
}

// All highs/lows from yesterday to +2 days (Melbourne dates). The page works out "now" itself from these events,
// so it can still tell whether it is low tide even if data.json is a little old.
async function tides(aac: string) {
  const melbDate = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }); // YYYY-MM-DD
  const params = new URLSearchParams({
    type: "tide", aac, date: melbDate(-1), days: "4", region: "VIC", offset: "false", offsetName: "",
    tz: "Australia/Melbourne", tz_js: "Australia/Melbourne",
  });
  const events = parseTideTable(await get(`${BOM}/australia/tides/scripts/getTidesTable.php?${params}`));
  if (events.length === 0) throw new Error("no tide events parsed");
  return { site: TIDE_SITE_NAMES[aac] ?? aac, events };
}

// Each source is independent: one failing should not blank the whole page.
async function safe<T>(label: string, fn: () => Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${label}: ${(e as Error).message}`);
    console.error(`! ${label} failed:`, (e as Error).message);
    return null;
  }
}

async function main() {
  const errors: string[] = [];
  // Every wind station the beaches use (data/beaches.json), plus the primary and the temp/rain station.
  const beaches = JSON.parse(await readFile(resolve(dirname(fileURLToPath(import.meta.url)), "../data/beaches.json"), "utf8")) as { windStation: string; tideSite?: string }[];
  const tideSites = [...new Set([TIDE_SITE, ...beaches.map((b) => b.tideSite).filter((x): x is string => !!x)])];
  const ids = [...new Set([PRIMARY_WIND_STATION, WEATHER_STATION, ...beaches.map((b) => b.windStation)])];
  const [stationList, bay, coast, melb, tideList, warn] = await Promise.all([
    Promise.all(ids.map((id) => safe(`obs ${id}`, () => observation(id), errors))),
    safe("bay forecast", bayForecast, errors),
    safe("coast forecast", coastForecast, errors),
    safe("melbourne forecast", melbourneForecast, errors),
    Promise.all(tideSites.map((aac) => safe(`tides ${aac}`, () => tides(aac), errors))),
    safe("warnings", warnings, errors),
  ]);

  const data = {
    fetchedAt: new Date().toISOString(),
    stations: Object.fromEntries(ids.map((id, i) => [id, stationList[i]])),
    weatherStation: WEATHER_STATION,
    bay,
    coast, // Bass Strait coast marine forecast (seas + swell), used by open-coast beaches
    melbourne: melb,
    tide: tideList[tideSites.indexOf(TIDE_SITE)], // default site (Williamstown); kept for older page versions
    tides: Object.fromEntries(tideSites.map((aac, i) => [aac, tideList[i]])), // one entry per tide site used by a beach
    warnings: warn, // null = feed unreadable; [] = none active (BOM Victoria warnings RSS, IDZ00059)
    waterQuality: null, // EPA Beach Report not wired up yet (needs API key)
    errors,
    attribution: "Contains Bureau of Meteorology data. Personal use only.",
  };

  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../web/public/data.json");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data, null, 2));
  console.log(`wrote ${out}${errors.length ? ` (${errors.length} source(s) failed)` : ""}`);
  // Core data missing -> non-zero exit, so CI keeps the last good deployment instead of publishing a broken page.
  const wind = stationList[ids.indexOf(PRIMARY_WIND_STATION)];
  if (!wind || !bay) process.exitCode = 1;
}

main();
