// Fetches BOM data and writes web/public/data.json.
// Run with: npm run fetch   (Node 22.18+/24 runs .ts directly)
import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTideTable } from "./tides.ts";
import { relevantWarnings } from "./warnings.ts";

const UA = "where-to-swim personal-use app";
const BOM = "https://www.bom.gov.au";
const WIND_STATION = "95864"; // St Kilda Harbour RMYS (wind, gusts)
const WEATHER_STATION = "95936"; // Melbourne (Olympic Park) (air temp, rain)
const TIDE_SITE = "VIC_TP003"; // Melbourne (Williamstown)

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
  return {
    name: json.observations.header[0].name as string,
    observedAt,
    windDirText: (r.wind_dir as string) ?? null,
    windDirDeg: compassToDegrees(r.wind_dir),
    windKmh: num(r.wind_spd_kmh),
    gustKmh: num(r.gust_kmh),
    airTemp: num(r.air_temp),
    rainSince9am: num(r.rain_trace),
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
async function tides() {
  const melbDate = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }); // YYYY-MM-DD
  const params = new URLSearchParams({
    type: "tide", aac: TIDE_SITE, date: melbDate(-1), days: "4", region: "VIC", offset: "false", offsetName: "",
    tz: "Australia/Melbourne", tz_js: "Australia/Melbourne",
  });
  const events = parseTideTable(await get(`${BOM}/australia/tides/scripts/getTidesTable.php?${params}`));
  if (events.length === 0) throw new Error("no tide events parsed");
  return { site: "Melbourne (Williamstown)", events };
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
  const [wind, weather, bay, melb, tide, warn] = await Promise.all([
    safe("wind obs", () => observation(WIND_STATION), errors),
    safe("weather obs", () => observation(WEATHER_STATION), errors),
    safe("bay forecast", bayForecast, errors),
    safe("melbourne forecast", melbourneForecast, errors),
    safe("tides", tides, errors),
    safe("warnings", warnings, errors),
  ]);

  const data = {
    fetchedAt: new Date().toISOString(),
    stations: { [WIND_STATION]: wind, [WEATHER_STATION]: weather },
    weatherStation: WEATHER_STATION,
    bay,
    melbourne: melb,
    tide,
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
  if (!wind || !bay) process.exitCode = 1;
}

main();
