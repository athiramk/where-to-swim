# Where to Swim — Product & Design Specification

Last updated: 2026-11-10. Status: live (v1 plus Phases 1–4 and Mushroom Reef). **Read §0 first if you are picking the project up.**

---

## 0. Start here (for an agent picking this up)

**What it is:** a personal, mobile-first web page that ranks 11 beaches (10 around Port Phillip Bay plus Mushroom Reef at Flinders) by a 0–100 swim score built from Bureau of Meteorology (BOM) data, and says why. It is a static site: a scheduled job fetches BOM data into one `data.json`, and the browser scores the beaches itself.

**Read in this order:** this §0 → §2 (status) → §3 (architecture/commands) → §7 (scoring) → §12 (what the owner wants to revisit) → the rest as needed.

**Five-minute orientation**
```
npm install
npm run fetch      # writes web/public/data.json from live BOM data (Node 22.18+/24)
npm test           # 93 tests, 10 files
npm run dev        # local site (needs data.json from the line above)
npx tsc --noEmit   # typecheck
npm run build      # production build into dist/
```
Beach list/config: `data/beaches.json`. Scoring numbers: `CONFIG` in `web/src/score.ts`. Turning data + beach + time into scoring inputs: `web/src/conditions.ts`. UI: `web/src/main.ts`. Fetching: `fetcher/fetch.ts`.

**Hard rules (do not break these)**
1. **Never commit or push.** The owner does git steps manually. Give them the command instead.
2. **Do not call BOM's app API** (`api.weather.bom.gov.au`). Its notice says "You must not use, copy or share it". Use only the free feeds in §4. (§4 explains.)
3. **Honest `User-Agent` on every BOM/EPA request** (`where-to-swim personal-use app`). Never spoof a browser.
4. **The repo and site are public.** No personal details (owner name, email, account name, website address), no secrets or tokens in any file, `data.json` or chat.
5. **Insert fetched text with `textContent`** (the `el()` helper in `web/src/main.ts`), never `innerHTML`. External links get `rel="noopener noreferrer"`.
6. **Keep all paths relative.** The site is served under a sub-path.
7. **Don't change scoring thresholds/weights without the owner's real-world feedback** (§12). Update tests whenever you change `CONFIG`.
8. **Never add a "Good to know" tip you haven't verified on its source page** (§8.2).
9. **No notifications/alerts.** The owner declined them. No water-quality scraping or estimating (§4, EPA).
10. **Never invent data** (e.g. tide offsets). If a source has nothing, say "unknown" in the UI.
11. If you change the service worker's caching, bump `CACHE` in `web/public/sw.js`.

**Working agreements with the owner**
- End-user text (the README, plans shown for approval) must be **plain, short and non-technical**: no file names, code words or tooling detail. The README is for visitors who find the project on GitHub; it describes features and uses only. Technical detail belongs in this document.
- Be honest about what was and wasn't verified. When something is an estimate, say so in the UI and here.
- When a request is ambiguous or changes what a score means, ask first; don't silently change behaviour.
- Verify facts against source pages/data before putting them in the app; search summaries are not enough.

**Owner-only to-dos / reminders (an agent can't do these)**
- **Renew the GitHub access token used by the outside timer before about 2027-02-08** (§9). If it expires, data silently stops refreshing.
- Try the live site on a real phone: layout, dark mode, "Install" / "Add to Home Screen", offline (§2, §8.3).
- Keep the log of "app said X, reality was Y" for tuning (§12).

---

## 1. Purpose

A personal, mobile-first web page that answers: **"Which beach near South Melbourne is best for a swim right now?"**
It ranks 11 beaches by a 0–100 score from BOM wind, sea/swell, temperature, rain, tide, daylight and warnings data, with a Great / Good / Fair / Poor label and a one-line reason.

- **User:** one owner, personal use; the site is public but unlisted. No accounts, no analytics.
- **Trust model:** the owner trusts BOM data. Prefer BOM over third-party sources. Never present guesses as BOM data.
- **Non-goals:** maps, push notifications, user accounts, other cities, commercial use, weather-aware future forecasts (BOM's free feeds have no hourly forecast, see §4), being a safety service (the app is a guide; the footer tells users to check flags and lifesavers).

## 2. Current status

| Area | State |
|---|---|
| BOM data fetcher (wind, temp, rain, bay + coast marine forecasts, UV, tides, warnings) | Done, live |
| Scoring + tide/daylight/storm/warning rules | Done. **93 unit tests in 10 files pass** (`npm test`) |
| UI: ranked cards, compass, details, "Good to know" tips, dark mode, stale banner, "this opens" cues | Done. Checked 2026-11-10 with headless-Chrome screenshots at a true 390 px width, light and dark (§10). **Not yet checked on a real phone** |
| Install to home screen + offline (PWA) | Done. **Not yet tested on a real phone.** Notifications were offered and **declined by the owner** |
| CI/CD: fetch + build + deploy to GitHub Pages every 30 min | Done. Refresh is driven by an **outside timer (cron-job.org)** because GitHub's own schedule never fired; **the timer's token needs renewing about 2027-02-08** (§9) |
| 11 beaches | Done (7 Melbourne-side, Half Moon Bay, Jawbone, Ricketts Point, Mushroom Reef) |
| Low-tide rule | Jawbone, Ricketts Point, Mushroom Reef (Half Moon Bay's rule was lifted) |
| Mushroom Reef (open Bass Strait coast, Flinders) | Done with its own tide site (Flinders Jetty), Bass Strait coast forecast (seas + swell) and Cerberus wind. **Wind is a weak spot: Cerberus is sheltered** (§4) |
| Water quality (EPA) | **Not available.** EPA has no live Beach Report API. Cards link to EPA's Beach Report; the score treats water quality as unknown |
| BOM warnings | Wired (Victorian warnings RSS). **Item titles unverified**: the feed was empty when built |
| Tips ("Good to know") | Done for 4 beaches (Jawbone, Half Moon Bay, Ricketts Point, Mushroom Reef). The 7 Melbourne-side beaches have none yet |
| Weather-aware future view (+3 h / tomorrow) | **Not built, by design** (no free hourly forecast). The tide-and-daylight "best time" window exists |
| End-user `README.md` | Done (plain, non-technical, no site link). Don't add technical content to it |

## 3. Architecture

```
Triggers: outside timer (cron-job.org -> workflow_dispatch, :20 and :50 each hour), push to main,
          manual "Run workflow", and GitHub's own unreliable schedule (§9)
  GitHub Actions: npm ci -> npm test -> npm run fetch -> npm run build -> deploy to GitHub Pages
      fetcher/fetch.ts  ->  web/public/data.json  ->  copied into dist/
Browser loads index.html + data.json (relative URL) and scores each beach client-side.
```

- **No backend server.** The fetcher runs in CI and writes one static `data.json`. The browser never calls BOM (CORS and bot-blocking make that impractical).
- **Scoring runs in the browser** (`web/src/score.ts`), so tuning needs no refetch and it is easy to unit test.
- **Hosting:** GitHub Pages from a public repo, served under the owner's custom domain at `/where-to-swim/`. Everything uses relative paths (`base: "./"`, `fetch("data.json")`).
- **Stack:** Node 24, TypeScript, Vite 6, Vitest 2, fast-xml-parser 4. Vanilla TypeScript UI (no framework). Production bundle ≈ 23 KB JS + 5 KB CSS.

### 3.1 Repository layout

```
README.md                 End-user README (plain, non-technical; keep it that way)
CLAUDE.md                 Short rules for agents; points here
docs/SPEC.md              This document
data/beaches.json         Beach config: the single source of truth for beaches, tips, per-beach data sources
fetcher/fetch.ts          BOM fetcher -> web/public/data.json
fetcher/tides.ts          Parses BOM's tide-table HTML
fetcher/warnings.ts       Parses/filters the BOM Victorian warnings RSS
fetcher/rain.ts           24 h / 72 h rain totals from BOM's half-hourly history
web/index.html            Page shell (manifest/icon/meta links are relative)
web/src/main.ts           UI rendering, data loading, install prompt, service-worker registration
web/src/conditions.ts     Data + beach + time -> scoring inputs (tide verdict, daylight, storm, sea, rain); Data/Beach/Station/Tip types
web/src/score.ts          Scoring engine + CONFIG (all tunable numbers); parseSeaHeight/parseSwellHeight
web/src/tide.ts           Low-tide window logic (lowTideState, nextEvent)
web/src/sun.ts            Sunrise/sunset maths (no API)
web/src/chop.ts           Estimated local chop for bay beaches from wind + fetch
web/src/install.ts        Rules for the install prompt (native button vs iOS hint)
web/src/style.css         Styles (CSS variables, automatic dark mode, phone layout)
web/src/*.test.ts, fetcher/*.test.ts   Unit tests
web/public/               Copied as-is into dist/: manifest.webmanifest, sw.js, icons/ (data.json is generated here but git-ignored)
scripts/make-icons.mjs    One-off, dependency-free icon generator (node scripts/make-icons.mjs)
vite.config.ts            root: web, base: ./, outDir: ../dist; Vitest includes web/src and fetcher tests
.github/workflows/deploy.yml   Fetch + build + deploy
```
Git-ignored: `node_modules/`, `dist/`, `web/public/data.json`, `.DS_Store`.

### 3.2 Commands

| Command | What |
|---|---|
| `npm run fetch` | Fetch BOM data, write `web/public/data.json` (Node runs the `.ts` file directly) |
| `npm run dev` | Vite dev server (run `fetch` first or the page shows a load error). The service worker is not registered in dev |
| `npm test` | Vitest, all 93 tests |
| `npm run typecheck` (`npx tsc --noEmit`) | Typecheck. **Not run in CI** (only `npm test` is) |
| `npm run build` / `npm run preview` | Production build into `dist/` / preview it |

## 4. Data sources (verified 2026-11-10)

All requests send `User-Agent: where-to-swim personal-use app`. BOM returns 403 for requests with no User-Agent; the honest one works for every endpoint below. HTTPS endpoints are used (FTP equivalents exist but need no FTP client this way).

| Data | Endpoint | Used fields / notes |
|---|---|---|
| Wind, direction, gusts | `https://www.bom.gov.au/fwo/IDV60801/IDV60801.<station>.json` for each station named in `data/beaches.json` (fetched as a deduplicated set): **95864** St Kilda Harbour RMYS (primary and the fallback for any beach whose own station is down), **95872** Fawkner Beacon, **95941** Point Cook, **94898** Cerberus | `data[0]` is the newest obs. `wind_dir` is **compass text** ("NNW"), converted to degrees (×22.5). `wind_spd_kmh`, `gust_kmh`, `aifstime_utc` (yyyymmddhhmmss UTC), `weather` (present-weather text, "-" = none). St Kilda Harbour has **no air temp or rain** |
| Air temp, rain | Same pattern, station `95936` (Melbourne Olympic Park) | `air_temp`; `rain_trace` is **rain since 9am (mm)**: it counts up through the day and resets just after the 09:00 reading. The file holds ~144 half-hourly readings (about 3 days); `fetcher/rain.ts` turns them into `rain24h` / `rain72h` |
| Port Phillip marine forecast | `https://www.bom.gov.au/fwo/IDV10460.xml` | Area `VIC_MW005` "Port Phillip", `forecast-period index=0`. Text: `forecast_winds` (knots, prose), `forecast_seas` (e.g. "Below 1 metre."), `forecast_weather`. One value for the whole bay |
| Bass Strait coast marine forecast | `https://www.bom.gov.au/fwo/IDV10200.xml` | Area `VIC_MW002` "Central Coast: Cape Otway to Wilsons Promontory", period 0. Adds `forecast_swell1`, `forecast_swell2`. Stored as `coast`. (`IDV10200` is the open coast, **not** the bay) |
| UV, rain chance | `https://www.bom.gov.au/fwo/IDV10450.xml` | `VIC_ME001` period 0 `uv_alert` ("UV Index predicted to reach 9 [Very High]"); `VIC_PT042` period 0 `probability_of_precipitation`. Display only |
| Tides | `https://www.bom.gov.au/australia/tides/scripts/getTidesTable.php?type=tide&aac=<SITE>&date=YYYY-MM-DD&days=4&region=VIC&offset=false&offsetName=&tz=Australia/Melbourne&tz_js=Australia/Melbourne` | **Undocumented endpoint used by BOM's own tides page**; may change without notice. Returns HTML; `fetcher/tides.ts` (`parseTideTable`) extracts every high/low from `data-time-utc` and the height cell. Fetched from yesterday for 4 days, one table per distinct `tideSite` a beach uses. Sites in use: `VIC_TP003` Melbourne (Williamstown, default), `VIC_TP020` Flinders Jetty |
| Warnings | `https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml` | RSS, updates about every 10 min. `fetcher/warnings.ts` keeps swimming-relevant hazard titles (wind, gale, storm, thunderstorm, wave, surf, tide, tsunami, cyclone, hail, tornado) and drops titles that name only distant Victorian regions. `warnings: []` = none active; `null` = feed unreadable. No marine-specific variant exists (`warnings_marine_vic` is 404). **Real warning titles are unverified (the feed was empty)** |

BOM terms: free for personal / in-organisation use; no redistribution or commercial use without a Registered User agreement. The site is public-but-unlisted and personal; do not market it or add ads. Always keep the attribution string in `data.json`. BOM gives no availability guarantee. Update cadence: observations ~every 30 minutes, forecasts a few times a day, tides are predictions. Polling faster than every 15–30 minutes gains nothing.

### 4.1 Do NOT use BOM's app API (`api.weather.bom.gov.au`)
It offers hourly wind/temperature forecasts, but every response carries: "This application programming interface (API) is owned by the Bureau of Meteorology. You must not use, copy or share it." It is not one of the free feeds the owner's personal-use trust covers. It was discovered during the Phase 3 spike (2026-11-10); one location-search request was made and nothing was built on it. Hourly numeric forecasts are therefore unavailable under the free terms (gridded/digital forecasts need a BOM Registered User agreement). Any "future hours" feature must work from the daily forecast products (`IDV10460`, `IDV10450`, `IDV10200`) plus tides and sunset.

### 4.2 EPA water quality: why it is missing
EPA Victoria's developer portal (`portal.api.epa.vic.gov.au`) offers only the Environment Monitoring API (air quality). A Beach Report / Yarra Watch API is described by EPA as "in development" with no date. The Beach Report page is a JavaScript app with no documented feed; only a historical enterococci dataset exists on data.vic.gov.au. The owner decided **not** to scrape or estimate. Each card links to `https://www.epa.vic.gov.au/for-community/summer-water-quality/beach-report`. If EPA ships an API: add `EPA_API_KEY` as a GitHub Actions secret, read `process.env.EPA_API_KEY` in the fetcher, fill `waterQuality` (shape in §5). Scoring and UI already handle it. Never put the key in the repo or in `data.json`.

### 4.3 Wind stations
Station positions come from each station's page (`https://www.bom.gov.au/products/IDV60801/IDV60801.<id>.shtml`, 0.01° precision). The coordinates inside the observation JSON are rounded to 0.1° and are not usable for distances. Bay stations: St Kilda Harbour 95864 (-37.86, 144.96), Fawkner Beacon 95872 (-37.95, 144.93), Point Cook 95941 (-37.93, 144.76), Frankston Beach 94871 (-38.15, 145.12), Point Wilson 94847, South Channel Island 94853. Inland (not used): Laverton, Moorabbin Airport.
- Seven Melbourne-side beaches: St Kilda Harbour (3–8 km away).
- Jawbone: Point Cook (same west shore).
- Half Moon Bay, Ricketts Point: Fawkner Beacon (8–10 km, open water). Frankston Beach is ~15–19 km away.
- Different stations can disagree (e.g. NE 15 at Fawkner vs NNW 17 at St Kilda at the same moment), so beaches can score differently for reasons beyond orientation.

### 4.4 Open-coast data for Mushroom Reef
Mushroom Reef is at Flinders on the **open Bass Strait coast**, ~80 km from South Melbourne, so Port Phillip data does not apply. A beach in `data/beaches.json` can name its own `tideSite`, `forecast` area (`"bay"` default or `"coast"`) and `lowTideWindowHours`.
- **Sea height for coast beaches** = the larger of the coast `seas` value and the **first clause only** of `forecast_swell1` (`parseSwellHeight`), because swell text often continues with a regional change ("…around 1 metre, increasing to 1 to 2 metres in the west"). The card shows BOM's full wording. There is no local chop model for these beaches (no `fetchKm`): open-ocean swell is not fetch-limited like bay chop.
- **Tides are very different from Williamstown**: on 2026-11-10 Flinders lows were 7:15 am (1.03 m) and 7:10 pm (0.40 m) vs Williamstown's 10:54 am (0.50 m) and 10:50 pm (0.22 m): about 3.5 hours earlier, with a larger range (highs ~2.5 m vs ~0.9 m). **Heights from different sites are not comparable**, so `maxLowTideM: 0.5` (from Parks Victoria's Ricketts Point advice) must not be reused at Flinders. If a beach's own tide-site data is missing, tide is reported **unknown**; it never silently uses Williamstown's times.
- **Wind:** Cerberus (94898, Western Port, about 22 km from the reef) is the nearest reporting station (Rhyll 94892 is ~29 km). **Both are in sheltered Western Port and likely under-read the exposed south-facing reef** (on 2026-11-10 Cerberus read SSE 7 km/h while the coast forecast said E–SE 10–15 knots, i.e. 18–28 km/h). No open-coast station near Flinders appears in BOM's Melbourne observation list. See §12.
- **Bearing/position:** `faces` 180 comes from Parks Victoria's text that the sanctuary "extends offshore to the south". `lat`/`lon` (-38.490, 144.998) are approximate and used for sunrise/sunset only.

### 4.5 Warnings parser: verify on the first real warning
Open the feed when a warning is active, compare the item titles with `fetcher/warnings.test.ts`, and adjust `HAZARD` / `OTHER_REGION` / `OUR_AREA` in `fetcher/warnings.ts` if needed. The filter prefers showing a warning over hiding one.

### 4.6 Tide offsets
`https://www.bom.gov.au/australia/tides/tide_offset_sites.json` is empty (no offset sites), so no official offset is applied for Black Rock / Beaumaris. Their tide times are Williamstown's.

## 5. `data.json` schema (produced by the fetcher)

```jsonc
{
  "fetchedAt": "ISO-8601 UTC",
  "stations": {                                  // one entry per station used by data/beaches.json, plus the weather station
    "95864": { "name": "...", "observedAt": "ISO UTC", "windDirText": "NNW", "windDirDeg": 337.5,
               "windKmh": 19, "gustKmh": 33, "airTemp": null, "rainSince9am": null,
               "rain24h": 0, "rain72h": 0.8, "rainHistoryHours": 72, // null for stations with no rain gauge
               "weather": null }                // BOM present-weather text, e.g. "Thunderstorm"; null if "-"
  },
  "weatherStation": "95936",                     // supplies air temp and rain
  "bay": { "winds": "...", "seas": "Below 1 metre.", "weather": "...", "issuedAt": "ISO UTC" } | null,
  "coast": { "area": "Central Coast: Cape Otway to Wilsons Promontory", "winds": "...", "seas": "Below 1 metre.",
             "swell1": "Southwesterly around 1 metre, increasing to 1 to 2 metres in the west.", "swell2": null,
             "weather": "...", "issuedAt": "ISO UTC" } | null,
  "melbourne": { "uvText": "...", "uvIndex": 9, "rainChancePct": 30 } | null,
  "tides": {                                     // one per tideSite used by a beach; events ~yesterday to +2 days, sorted
    "VIC_TP003": { "site": "Melbourne (Williamstown)", "events": [ { "type": "high"|"low", "time": "ISO UTC", "height": 0.85 } ] },
    "VIC_TP020": { "site": "Flinders Jetty", "events": [ ... ] }
  },
  "tide": { "site": "...", "events": [ ... ] } | null,   // = tides.VIC_TP003; kept for older page versions and the summary line
  "warnings": [],                                // relevant warning titles; null if the feed failed
  "waterQuality": null,                          // { [epaSite]: "Good"|"Fair"|"Poor" } when wired
  "errors": [],                                  // per-source failure messages
  "attribution": "Contains Bureau of Meteorology data. Personal use only."
}
```
The page works out "next high/low" and "is it low tide now" itself from the events (so it still works if `data.json` is a little old).

**Failure policy:** each source is fetched independently (`safe()` in `fetcher/fetch.ts`); a failed source becomes `null` and its message goes in `errors`. The process exits non-zero if **St Kilda Harbour wind or the bay forecast** is missing, so CI keeps the last good deployment instead of publishing a broken page. The UI shows a banner for `errors` and for data older than 60 minutes (`STALE_MIN` in `web/src/main.ts`).

## 6. Beach config (`data/beaches.json`)

Each entry: `id`, `name`, `faces` (compass bearing in degrees: **the direction the beach looks out over the water**), `lat`, `lon` (approximate; used for sunrise/sunset), `windStation` (BOM station id), `epaSite` (EPA's name for the beach or `null`; for future use).
Optional: `fetchKm` (km of open water the wind can blow over straight out from the beach; a **map estimate**; drives the bay chop estimate), `needsLowTide: true`, `maxLowTideM` (only lows at or below this height in metres count as low), `lowTideWindowHours` (default 1.5), `tideSite` (BOM tide AAC; default `VIC_TP003`), `forecast` (`"bay"` default or `"coast"`), `note`, `tips` (list of `{text, source, url}`) and `tipsChecked` (YYYY-MM-DD). `web/src/beaches.test.ts` checks the shape.

| Beach | faces | fetchKm (est.) | Wind station | Low tide only |
|---|---|---|---|---|
| Sandridge | 280 | 6 | 95864 | |
| Port Melbourne | 275 | 8 | 95864 | |
| South Melbourne | 265 | 10 | 95864 | |
| Middle Park | 260 | 14 | 95864 | |
| Albert Park | 255 | 18 | 95864 | |
| St Kilda | 255 | 20 | 95864 | |
| Elwood | 250 | 24 | 95864 | |
| Jawbone Marine Sanctuary (Williamstown, west shore) | 165 | 30 | 95941 | yes, `maxLowTideM` 0.5 |
| Half Moon Bay (Black Rock) | 250 | 30 | 95872 | no (rule lifted 2026-11-10) |
| Ricketts Point Marine Sanctuary (Beaumaris) | 255 | 35 | 95872 | yes, `maxLowTideM` 0.5 |
| Mushroom Reef Marine Sanctuary (Flinders, open coast) | 180 | none (open coast) | 94898 (Cerberus, sheltered) | yes; tide site `VIC_TP020`; `forecast: "coast"`; no height limit |

**Bearings and coordinates are estimates from coastline shape** (except Mushroom Reef's bearing, taken from Parks Victoria's text). Jawbone is on the **west** shore and faces roughly south-east, so "easterly = offshore" does not apply there. Most of the Melbourne-side beaches face west-south-west, so an easterly or north-easterly is offshore (calm) and a westerly/south-westerly is onshore (chop). `fetchKm` values are rough and only matter for onshore winds: check them against a chart. To add a beach, add one JSON entry (candidates: Brighton, Altona); no code change is needed unless it needs a new tide site name (add it to `TIDE_SITE_NAMES` in `fetcher/fetch.ts`).

## 7. Scoring specification (`web/src/score.ts`)

All constants are in the exported `CONFIG`; change numbers there and update tests. Inputs for a beach at a time come from `conditionsFor()` in `web/src/conditions.ts`.

1. `onshore = cos(windFromDeg − beachFaces)`: +1 straight onshore, 0 side-on, −1 offshore.
2. `effectiveWind = windKmh × (1 + 0.4 × onshore)` (offshore ×0.6, side-on ×1.0, onshore ×1.4).
3. Points (sum max 100):

| Component | Max | Rule |
|---|---|---|
| Wind | 40 | Effective km/h: ≤8 → 40; 20 → 20; ≥30 → 0 (linear between). Missing → 20 |
| Sea | 25 | Sea height (m): ≤0.2 → 25; 0.5 → 15; 1.0 → 5; ≥1.5 → 0 (linear between). Missing → 15 |
| Water quality | 25 | Good 25, Fair 15, Poor 0. **Unknown → 15 (currently always unknown)** |
| Comfort | 10 | Air temp 22–32 °C → 10, falling linearly to 0 at 12 °C and at 40 °C. Missing → 5 |

4. **Sea height used for the Sea points**
   - **Bay beaches:** `max(localChop, 0.5 × bayForecastHeight)`. `localChop` (`web/src/chop.ts`) = `1.6e-3 × U × sqrt(F/g)` (U = wind in m/s, F = effective fetch in metres = `fetchKm × max(0, onshore)`, minimum 0.5 km), capped at 2 m. The bay forecast acts as a floor so a stormy forecast still counts when local wind is light. If wind or `fetchKm` is missing, the bay forecast alone is used. This ignores depth and wind duration. Card text e.g. "est. chop 0.3 m (bay forecast: Below 1 metre)".
   - **Open-coast beaches** (`forecast: "coast"`): the larger of the coast seas and the first swell clause (§4.4); no chop model.
   - `parseSeaHeight`: numbers in BOM prose; "below/less than/under N" → 0.6×N; one number → that value; several → midpoint of the low and the maximum. "Below 1 metre." → 0.6 m. `parseSwellHeight` applies it to the first clause only.
5. **Caps** (final score = min(sum, lowest applicable cap)):
   - Poor water quality → 35 (never triggered today: quality is unknown)
   - **After dark** → 20. Daylight = sunrise − 30 min to sunset + 30 min (`CONFIG.twilightMin`), computed per beach from lat/lon (`web/src/sun.ts`). Label e.g. "after dark, sunrise 6:03 am"
   - **Thunderstorm** mentioned in the forecast that covers the beach (bay or coast) or in the current observation's weather (`mentionsThunderstorm`) → 55. The forecast text covers the whole day, so this is a deliberately soft cap
   - Any active warning → 25
   - Gusts > 45 km/h → 40
   - Rain over the last 24 h ≥ 10 mm → 55 (falls back to rain since 9am if the history is short). The card also shows 72 h rain
   - Wind ≥ 25 km/h and `onshore < −0.5` (strong offshore: calm water but swimmers drift out) → 55
   - **Low-tide-only beaches** (`needsLowTide`) when it is not low tide → 35. "Low tide" = within `lowTideWindowHours` (default 1.5 h) of a predicted low **at the beach's own tide site**, counting only lows at or below `maxLowTideM` if set (`lowTideState` in `web/src/tide.ts`). If the tide data doesn't cover "now" (or has no qualifying low) the state is **unknown**: no cap, and "tide" is listed as missing. Other beaches ignore tide
6. **Labels:** 80–100 Great, 60–79 Good, 40–59 Fair, 0–39 Poor.
7. **Unknown inputs** use the neutral values above and are listed in `result.unknown`; the card shows "missing: …".

**Low-tide guidance text.** The verdict names the next low tide that falls in **daylight** (`nextDaylightLowWindow` in `web/src/conditions.ts`; night-time lows are skipped), e.g. "needs low tide (next daylight low tomorrow 11:38 am, 0.5 m)". The card has a "Best time" row with the swim window (low ± `lowTideWindowHours`, clipped to daylight), e.g. "tomorrow 10:08 am–1:08 pm (low 0.5 m at 11:38 am)". Times say "tomorrow" or a weekday when not today (`fmtWhen`). The summary line shows the next daylight low-tide window for the first low-tide beach (Jawbone, Williamstown tides). If the tide data (about yesterday to +2 days) holds no daylight low it says "no daylight low tide in the next 2 days".

**Tide specifics.** Williamstown has two lows a day (about 0.5 m and about 0.22 m); with `maxLowTideM` 0.5 both count. If it were set to 0.4, only the deep low would count, which often falls at night. Black Rock/Beaumaris use Williamstown's times (no official offset, §4.6).

**Where scores land today.** With water quality unknown (15/25) the theoretical maximum is ~90; a calm offshore day with a calm bay forecast scores ~85–87 at a Melbourne-side beach (Great), a typical 15–20 km/h wind gives 60s–70s (Good). Before Phase 2, Great was unreachable; the owner chose to leave the thresholds alone (§12).

**Worked examples (also unit tests):** calm east 9 km/h, 0.2 m sea, Good water, 24 °C → 98 Great; west 20 km/h, 0.5 m chop, Good water → 54 Fair; calm east with Poor water → capped at 35 Poor.

## 8. UI specification

### 8.1 Page
- Mobile-first single column, max width 560 px, 16 px gutters, no horizontal scroll, system fonts.
- **Header:** "Where to swim"; "Updated HH:MM · observations HH:MM" (Australia/Melbourne time).
- **Banners:** stale (data > 60 min old) and source-failure messages.
- **Summary line:** next tide (high/low with heights, Williamstown), sunset, next daylight low-tide window, UV index, rain chance.
- **"Best right now" list** with a one-line hint: "Tap a beach for wind, sea, tide and local tips."
- **Cards**, ranked by score: rank, beach name, label (colour **and** word) and `score/100`, one-line reason (first cap reason, then "Offshore/Onshore/Side-on wind N km/h"), left border coloured by label, and a **chevron** on the right that flips when open (animation only if `prefers-reduced-motion` allows), plus a light hover/press highlight.
- **Expanded card** (`aria-expanded`): wind compass SVG (shaded half-disc = sea side, arrow = direction the wind blows; on phones it sits above the details so values don't wrap), then rows: Wind, Sea, Water quality (link to EPA), Warnings, Daylight, Weather (only when thunderstorms are possible), Tide (needs low) and Best time (low-tide beaches), Air temp, Rain (24 h / 72 h), a points breakdown with missing inputs, then **Good to know** (§8.2).
- **Footer:** attribution, "Scores are a guide and don't include water quality — check the EPA Beach Report and the flags and lifesavers before you swim."
- **Theme:** CSS custom properties; `prefers-color-scheme: dark` handled automatically.
- **Refresh:** `data.json` is fetched on load (with a `?t=` cache-buster) and whenever the tab becomes visible again. No polling.

### 8.2 "Good to know" tips (per beach, from published sources)
Beaches can carry `tips`: short paraphrased facts, each with a `source` name and an `https` `url`, plus `tipsChecked`. The expanded card lists them with a "source ↗" link on each and the note "From official and local-guide pages (checked <date>), not live conditions. Rules and closures can change."
- Currently: Jawbone 5, Half Moon Bay 4, Ricketts Point 4, Mushroom Reef 6. The seven Melbourne-side beaches have none; the section is simply omitted.
- These are **not visitor reviews**: they come from Parks Victoria, Hobsons Bay Council and Melbourne Playgrounds pages. Each fact was verified against the actual page on 2026-11-10 (quotes checked, not search summaries). **Do not add a tip you haven't confirmed on its source page.**
- Mushroom Reef tips come from three Parks Victoria pages (sanctuary page, Flinders Ocean Beach page, snorkelling article). The landslip and toilet items are from an **undated** "Change of Conditions" notice, so the card says "(undated)".
- **Deliberately left out because not verified:** for Mushroom Reef, a search-summary claim of "2 hours either side of low tide" and a mobile-coverage warning (neither is on the pages); that Jawbone's beach is "narrow at low tide or non-existent at high tide" (no official page says it); BeachSafe lifeguard status for Half Moon Bay (page didn't load); Half Moon Bay patrol hours/season (not published on the page used).
- Tips go stale (closures, parking, prices). Re-check them when revisiting and update `tipsChecked`.

### 8.3 Install to home screen (PWA)
- **Manifest** (`web/public/manifest.webmanifest`): `display: standalone`, relative `start_url`/`scope` (`./`), 192/512 icons (+ maskable), theme `#0b7285`. Linked from `web/index.html` with a **relative** href.
- **Icons** (`web/public/icons/`): generated by `scripts/make-icons.mjs` (sun over two waves on a sea-blue gradient; artwork kept inside the central ~70% so it survives maskable cropping). Re-run it to regenerate and commit the PNGs.
- **Service worker** (`web/public/sw.js`; registered from `main.ts` only in production builds via `import.meta.env.PROD`):
  - `data.json` and the page: **network first**, cached copy as offline fallback (online you always get fresh data; offline you see the last data with the "data is N minutes old" banner). `data.json` is cached without its `?t=` query.
  - `/assets/*` (hashed): cache first. Other same-origin GETs: network first. **Cross-origin requests are never touched.**
  - Cache name `where-to-swim-v1`: **bump it if the caching rules change** so old caches are deleted. Installed copies keep the old worker until it updates (close and reopen the app).
- **Install prompt** (`main.ts` + `web/src/install.ts`): where the browser fires `beforeinstallprompt` (Android Chrome, desktop Chrome/Edge) the page shows an **Install** button; "Not now" is remembered in `localStorage` (wrapped in try/catch). iOS Safari has no install event, so iOS shows a hint: Share, then Add to Home Screen. Nothing shows when already running standalone, dismissed, or not installable.
- Needs HTTPS (GitHub Pages is). **Real-phone test still to do:** open the live site, install, launch from the home screen, toggle airplane mode and confirm the last data still shows.

### 8.4 Security and accessibility notes
- All fetched/config text goes in via `textContent`; links use `rel="noopener noreferrer"`.
- Never rely on colour alone (labels are words). Tap targets ≥ 44 px (cards, install buttons, EPA link). Chevron is `aria-hidden`; the card button carries `aria-expanded`.

## 9. CI/CD (`.github/workflows/deploy.yml`)

- **Triggers** (three, because the first proved unreliable):
  1. **Outside timer (the one that works): cron-job.org → `workflow_dispatch`**, every 30 minutes at :20 and :50.
  2. GitHub's own schedule `7,37 * * * *` (UTC). Kept as a free backup (see below).
  3. Push to `main`, and the manual "Run workflow" button in the Actions tab.
- **Steps:** checkout → Node 24 with npm cache → `npm ci` → `npm test` → `npm run fetch` → `npm run build` → upload Pages artifact → `deploy-pages`. (Typecheck is not run in CI.)
- **Concurrency** group `pages` with cancel-in-progress, so overlapping triggers cancel the older run.
- **Pages Source must be "GitHub Actions"** in repo settings. (The very first run failed with a 404 "Ensure GitHub Pages has been enabled" until this was switched on; a one-time setup error.)
- Any push (including docs-only) triggers a fresh fetch and deploy.

### 9.1 GitHub's own schedule did not fire (2026-11-10)
For about 3.3 hours after the repo went live, no `schedule`-triggered runs appeared (history showed only `push` and `workflow_dispatch`), although the workflow was active, `main` contained the `schedule` block, and the repo was public and enabled. Scheduled workflows are best-effort (delayed or dropped under load; new repos can wait a long time), so it is unreliable for a 30-minute refresh. If it ever starts, both sources just overlap harmlessly. Do not rely on it. Check "Actions → filter Event → schedule" to see whether it runs. GitHub may also pause it after 60 days without repo activity; that doesn't affect the outside timer.

### 9.2 Outside timer (cron-job.org), verified working 2026-11-10
A test run returned HTTP 204 and run #8 appeared as a `workflow_dispatch` that succeeded and updated the live data.
- **Request:** `POST https://api.github.com/repos/<owner>/where-to-swim/actions/workflows/deploy.yml/dispatches`, JSON body `{"ref":"main"}`.
- **Headers:** `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`, `X-GitHub-Api-Version: 2022-11-28`.
- **Schedule:** minutes 20 and 50 of every hour.
- **Token:** a GitHub **fine-grained personal access token**, resource owner = the repo owner, *Only select repositories* = `where-to-swim`, permission **Actions: Read and write** and nothing else (Metadata read-only is automatic). It can only start workflows on this one repo. Created 2026-11-10 with a **90-day expiry** (stops working about **2027-02-08**; confirm the exact date on the token's page). **Renew before it expires:** create a new token with the same settings and update the `Authorization` header in the cron-job.org job. If it expires or is wrong, the timer gets 401/403 and the site silently stops updating; the page's "data is N minutes old" banner appears after 60 minutes.
- **Troubleshooting a failed timer run:** 401 = token wrong/expired or missing the `Bearer ` prefix; 403/404 = token lacks Actions access on this repo or URL typo; 422 = body missing/wrong or the workflow has no `workflow_dispatch` trigger (**keep that trigger in `deploy.yml`**).
- **Security:** the token lives on a third-party service (cron-job.org) under the owner's account. It must never be committed, or pasted into chat or any file. If it leaks or is lost, delete it in GitHub (Settings → Developer settings → Fine-grained tokens) and make a new one.
- Alternatives if cron-job.org is ever abandoned: a Cloudflare Worker with a Cron Trigger calling the same endpoint (token as a Worker secret), or the manual "Run workflow" button.

## 10. Gotchas

- Node must be able to run `.ts` files directly (22.18+/24) for `npm run fetch`; imports use explicit `.ts` extensions.
- `web/public/data.json` doesn't exist in a fresh clone; run `npm run fetch` before `npm run dev`.
- Station 95864 has **no temperature or rain**; temp/rain deliberately come from 95936. Only 95936 has a rain gauge in this set.
- `rain_trace` is rain *since 9am*; real 24 h/72 h totals come from the history (`fetcher/rain.ts`: increments, with a reset after the 09:00 reading).
- `IDV10200` = open coast; `IDV10460` = Port Phillip. Don't mix them up.
- All times in `data.json` are UTC ISO; the UI formats to Australia/Melbourne.
- The tides endpoint is undocumented and may break; the fetcher degrades gracefully (`null`; low-tide beaches then show tide as unknown). A beach's wind station falls back to 95864 if its own is down.
- Tide heights/times differ by site; never compare or share thresholds across sites (§4.4).
- BOM's observation JSON coordinates are rounded to 0.1°; use the station page for position.
- **Visual QA without a phone** (done 2026-11-10): `npm run fetch && npm run build`, serve `dist/` under `/where-to-swim/`, and screenshot with `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=... URL`. **Headless Chrome won't lay out narrower than ~500 px** (it crops the picture, making the right side look cut off). For a true phone layout put the page in an `<iframe width="390">` inside a wrapper HTML served from the same origin; a small script in the wrapper can click cards to expand them. `--blink-settings=preferredColorScheme=1` did **not** switch to dark mode; to check dark mode, inject the app's own dark-mode colour values into the iframe. Use only on your own built pages.
- Data refreshes because of the **cron-job.org timer + GitHub token** (§9), not GitHub's own schedule. If the live data goes stale, check: (1) Actions tab for recent `workflow_dispatch` runs, (2) whether the token expired, (3) cron-job.org's job history.
- Never log or commit secrets; no personal details in this public repo.

## 11. Roadmap / open items (suggested order)

1. **Real-phone check** (owner): layout, dark mode, install, offline.
2. **Tips for the seven Melbourne-side beaches** (research from official/local-guide pages; verify each fact as in §8.2).
3. **Mushroom Reef wind:** blend in the coast forecast winds or find a better source (§12).
4. **Warnings parser check** against the first real warning (§4.5).
5. **EPA Beach Report API**, if EPA releases one (§4.2).
6. **Add typecheck to CI** (small).
7. Add beaches (Brighton, Altona…) via `data/beaches.json`.
8. **Tune `CONFIG` and per-beach settings from the owner's real-world feedback** (§12).
9. A weather-aware future view (+3 h / tomorrow) would have to parse the official daily forecast prose (`IDV10460`/`IDV10450`/`IDV10200`) into rough morning/afternoon/evening winds: fragile, must be labelled approximate. Only build it if the owner asks.
10. Using rain as a *water-quality estimate* is **not** wanted (owner declined); ask before building.

Done and not to be redone: warnings feed, 24–72 h rain, local chop, per-beach wind stations, daylight/storm rules, daylight low-tide windows, PWA, tips, Mushroom Reef, README.

## 12. Revisit later, once humans have used it
The owner wants to tune these from real-world experience ("it said X but it was actually Y"). Don't change them without that feedback. Keep a short log of each disagreement (beach, time, app verdict, what it was like) and use it to adjust `CONFIG` in `web/src/score.ts` and `data/beaches.json`.

| Open point | Current setting | Options when revisiting |
|---|---|---|
| **How easy is "Great"?** (owner decision 2026-11-10: leave the scoring alone) | Great is reachable on calm offshore days (~87 at South Melbourne) even with water quality unknown (15/25) | Keep; or require known water quality for Great; or score only known components rescaled to 100 ("water quality not included"); or move the Great threshold from 80. Note Great can appear while water quality is unknown, so the EPA link matters |
| **Which lows count** (owner decision 2026-11-10: both lows) | `maxLowTideM: 0.5` for Jawbone and Ricketts Point | Tighten to 0.4 (only the deep ~0.22 m low); set per beach from experience |
| **Low-tide rule per beach** | Ricketts Point: kept (Parks Victoria: tide height 0.5 m or below for rock pools; low tide for snorkelling visibility). Half Moon Bay: **lifted** (ordinary patrolled beach; no source gives a tide rule). Jawbone: kept but evidence is weak (council: low tide exposes a sand bar with marine life; Parks Victoria gives no tide advice; no source says high tide is bad) | Confirm Jawbone with real visits; consider a soft "best at low tide, fine otherwise" instead of a hard cap of 35 |
| Low-tide window | 1.5 h either side of a low (per-beach override `lowTideWindowHours`) | Widen/narrow per beach |
| Score thresholds and weights | Great 80 / Good 60 / Fair 40; wind 40, sea 25, water 25, comfort 10 | Re-weight from feedback |
| Onshore wind factor | 0.4 (offshore ×0.6, onshore ×1.4) | Tune per beach exposure |
| Sea state (bay) | `max(local chop, 0.5 × bay forecast)`; chop = `1.6e-3·U·sqrt(F/g)` | Check against reality; add depth/duration |
| `fetchKm` per beach | Map estimates (6–35 km) | Measure on a chart; per-direction fetch instead of one number |
| **Mushroom Reef wind** | Cerberus (sheltered, ~22 km); read 7 km/h while the coast forecast said 18–28 km/h | Use the larger of the station reading and the coast forecast wind (knots → km/h) for this beach; or find a better station |
| **Mushroom Reef tide rule** | Both lows count, ±1.5 h, no height limit (lows were 1.03 m and 0.40 m on test day) | Parks Victoria says only "low tide"; add `maxLowTideM` for Flinders if the 1 m low doesn't expose the platform; widen the window |
| **Mushroom Reef swell mapping** | Same sea-points table as the bay (a 1 m swell scores 5/25) | A reef may need its own table; Parks Victoria: best "when there is no swell running" |
| Mushroom Reef bearing/position | 180 (from "extends offshore to the south"); position approximate | Check on a chart |
| Wind stations | St Kilda Harbour (northern 7), Point Cook (Jawbone), Fawkner Beacon (Half Moon Bay, Ricketts Point), Cerberus (Mushroom Reef) | Compare with what it's like at the beach; Frankston Beach is an alternative for the southern two |
| Beach bearings and coordinates | Estimated from coastline shape | Check against maps/lifesavers; Jawbone especially |
| Warnings parser | Filter from assumed titles | Verify on a real warning |
| Daylight margin | 30 min twilight allowance | Reduce to 0 if too generous |

## 13. Decision log

| Decision | Why |
|---|---|
| Static site + scheduled fetcher, no server | Free, simple; BOM can't be called from browsers |
| Scoring in the browser | Tunable without refetch; easy to test |
| HTTPS endpoints, not FTP | No FTP client needed in Node/CI |
| Honest User-Agent | Works on all BOM endpoints; avoids spoofing |
| Public GitHub Pages site | Simplest hosting; owner accepted (personal use, unlisted) |
| Outside timer (cron-job.org) for refresh | GitHub's own schedule never fired in ~3.3 h; token scoped to one repo, 90-day expiry |
| Never use BOM's app API | Its notice says "You must not use, copy or share it" |
| Time view reduced to tides + daylight (owner choice) | BOM's free feeds have no hourly forecast |
| No notifications/alerts (owner choice) | Owner declined; install-to-home-screen only |
| EPA: link only, no scraping/estimate | No official API; owner's choice; avoids unreliable proxies |
| Fail CI if St Kilda wind or bay forecast missing | Keep last good deployment live |
| `textContent` only | Fetched strings can't inject markup |
| Daylight cap 20, storm cap 55, wrong-tide cap 35 | Safety rules override a good-looking weather score |
| No tide offset for Black Rock/Beaumaris | BOM's offsets file is empty; don't invent one |
| Low-tide beaches count lows ≤ 0.5 m (both lows); thresholds untouched | Owner decision 2026-11-10: gather human experience first (§12) |
| Lift the low-tide rule for Half Moon Bay | Owner decision after sources showed no tide guidance; Ricketts Point guidance supports its rule |
| Add sourced "Good to know" tips, verified on the pages | Owner wanted real information on cards; search summaries had unverifiable claims (left out) |
| Mushroom Reef with its own data (Flinders Jetty tides, coast forecast incl. swell) | Port Phillip tide times would be ~3.5 h wrong and the bay forecast has no swell |
| README for end users only: plain, short, non-technical, no site link | Owner's request; the project page is public and the address contains the owner's name |
