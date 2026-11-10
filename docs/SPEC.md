# Where to Swim — Product & Design Specification

Last updated: 2026-11-10. Status: v1 live. Read this first if you are picking the project up.

## 1. Purpose

A personal, mobile-first web page that answers: **"Which beach near South Melbourne is best for a swim right now?"**
It ranks seven Port Phillip Bay beaches by a 0–100 score built from Bureau of Meteorology (BOM) wind, sea, temperature, rain and tide data, with a Great / Good / Fair / Poor label and a one-line reason.

- **User:** one person, personal use. Not a public product. No accounts, no analytics.
- **Trust model:** the owner trusts BOM data. Prefer BOM over third-party sources. Never present guesses as BOM data.
- **Non-goals (v1):** forecasts of future hours, maps, push notifications, user accounts, other cities, commercial use, safety advice (the app is a guide only; the footer says to check flags and lifesavers).

## 2. Current status

| Area | State |
|---|---|
| BOM data fetcher | Done, live |
| Scoring + 15 unit tests | Done |
| UI (ranked cards, details, compass, dark mode, stale banner) | Done; **layout never visually verified by an agent: do a phone check** |
| CI/CD (fetch + build + deploy every 30 min, GitHub Pages) | Done, confirmed working |
| Water quality (EPA) | **Not available.** EPA has no live Beach Report API. UI links to EPA's Beach Report instead. Score treats it as unknown. |
| BOM warnings (strong wind / thunderstorm) | Wired (Victorian warnings RSS `IDZ00059.warnings_vic.xml`). **Item titles unverified**: the feed was empty when built, so the relevance filter is based on assumed wording. |
| Daylight rule, thunderstorm flag, per-beach low-tide height | Done (Phase 1) |
| 24 h / 72 h rain, local chop estimate, per-beach wind stations | Done (Phase 2) |
| Time view: next daylight low-tide window (tides + daylight only) | Done (Phase 3, reduced scope). No +3h/+6h/tomorrow weather scoring: BOM's free feeds have no hourly forecast (see §4 "Do NOT use BOM's app API") |
| Time-ahead view (+3h / tomorrow) | Not built |
| Install to home screen + offline (PWA) | Done (Phase 4). **Not yet tested on a real phone.** Phone notifications/alerts were offered and **declined by the owner**: do not add them |

## 3. Architecture

```
GitHub Actions (cron 7,37 * * * * UTC, plus push to main, plus manual)
  npm ci -> npm test -> npm run fetch -> npm run build -> deploy to GitHub Pages
      fetcher/fetch.ts  ->  web/public/data.json  ->  copied into dist/
Browser loads index.html + data.json (relative URL), scores each beach client-side.
```

- **No backend server.** The fetcher runs in CI and produces one static `data.json`. The browser never calls BOM (CORS and bot-blocking make that impractical).
- **Scoring runs in the browser** (`web/src/score.ts`) so tuning it needs no refetch and it is easy to unit test.
- **Hosting:** GitHub Pages from a public repo, served under the owner's custom domain at `/where-to-swim/`. Everything uses relative paths (`base: "./"` in Vite; `fetch("data.json")`), so it works at any sub-path. Keep it that way.
- **Stack:** Node 24, TypeScript, Vite 6, Vitest 2, fast-xml-parser 4. Vanilla TS UI (no framework). One runtime dependency-free browser bundle (~9 KB JS).

### Repository layout

```
data/beaches.json        Beach config (single source of truth for beaches)
fetcher/fetch.ts         BOM fetcher -> web/public/data.json (run: npm run fetch)
fetcher/tides.ts         Parses BOM's tide table HTML
fetcher/warnings.ts      Parses/filters the BOM Victorian warnings RSS
fetcher/rain.ts          24 h / 72 h rain totals from BOM's half-hourly history
web/public/manifest.webmanifest, sw.js, icons/   PWA files (copied as-is into dist/)
scripts/make-icons.mjs   One-off, dependency-free icon generator (node scripts/make-icons.mjs)
web/index.html           Page shell
web/src/main.ts          UI rendering, data loading, condition assembly
web/src/score.ts         Scoring engine + CONFIG (all tunable numbers)
web/src/conditions.ts    Data + beach + time -> scoring inputs (tide verdict, daylight, storm, warnings); also the Data/Beach/Station types
web/src/tide.ts          Low-tide window logic (lowTideState, nextEvent)
web/src/sun.ts           Sunrise/sunset maths
web/src/chop.ts          Estimated local chop from wind + fetch
web/src/install.ts       Rules for the install prompt (native Install button vs iOS Share-menu hint)
web/src/*.test.ts        Unit tests (npm test); fetcher/*.test.ts too
web/src/style.css        Styles (CSS variables, auto dark mode)
vite.config.ts           root: web, base: ./, outDir: ../dist
.github/workflows/deploy.yml   Scheduled fetch + deploy
docs/SPEC.md             This document
```

`web/public/data.json`, `dist/` and `node_modules/` are git-ignored; `data.json` is generated in CI on every run.

### Commands

| Command | What |
|---|---|
| `npm run fetch` | Fetch BOM data, write `web/public/data.json` (needs Node 22.18+/24: runs `.ts` directly) |
| `npm run dev` | Vite dev server (run `fetch` first or the page shows a load error) |
| `npm test` | Vitest scoring tests |
| `npx tsc --noEmit` | Typecheck (`npm run typecheck`) |
| `npm run build` | Production build into `dist/` |

## 4. Data sources (verified 2026-11-10)

All requests send `User-Agent: where-to-swim personal-use app`. **Use an honest User-Agent. Do not spoof a browser.** BOM returns 403 for requests with no User-Agent; the honest one works for every endpoint below.

| Data | Endpoint | Used fields / notes |
|---|---|---|
| Wind, direction, gusts | `https://www.bom.gov.au/fwo/IDV60801/IDV60801.<station>.json`. Stations used (listed in `data/beaches.json`, fetched as a deduplicated set): **95864** St Kilda Harbour RMYS (primary; fallback for any beach whose station is down), **95872** Fawkner Beacon (open water mid-bay), **95941** Point Cook (west shore). See "Wind stations" below. | `data[0]` is the newest obs. `wind_dir` is **compass text** ("NNW"), converted to degrees (×22.5). `wind_spd_kmh`, `gust_kmh`, `aifstime_utc` (yyyymmddhhmmss, UTC). **This station has no air temp or rain** (null/"-"). |
| Air temp, rain | Same URL pattern, station `95936` (Melbourne Olympic Park) | `air_temp`; `rain_trace` is **rain since 9am (mm)** (counts up, resets just after the 09:00 reading). The file holds ~144 half-hourly readings (about 3 days); `fetcher/rain.ts` turns them into `rain24h` / `rain72h`. |
| Port Phillip marine forecast | `https://www.bom.gov.au/fwo/IDV10460.xml` | Area `VIC_MW005` "Port Phillip", `forecast-period index=0` (today). Text types `forecast_winds` (knots, prose), `forecast_seas` (e.g. "Below 1 metre."), `forecast_weather`. One value for the whole bay. |
| UV, rain chance | `https://www.bom.gov.au/fwo/IDV10450.xml` | `VIC_ME001` period 0 `uv_alert` ("UV Index predicted to reach 9 [Very High]"); `VIC_PT042` period 0 `probability_of_precipitation` ("30%"). Display only, not scored. |
| Tides | `https://www.bom.gov.au/australia/tides/scripts/getTidesTable.php?type=tide&aac=VIC_TP003&date=YYYY-MM-DD&days=4&region=VIC&offset=false&offsetName=&tz=Australia/Melbourne&tz_js=Australia/Melbourne` | **Undocumented endpoint used by BOM's own tides page**; may change without notice. Returns HTML; `fetcher/tides.ts` (`parseTideTable`) extracts every high/low from `data-time-utc` and the height cell. Fetched from yesterday for 4 days. Site `VIC_TP003` = Melbourne (Williamstown), the primary Port Phillip station (`VIC_TP027` St Kilda is a secondary). Williamstown has **two lows a day of different depth** (about 0.5 m and about 0.22 m). A simpler endpoint `getNextTides.php?aac=VIC_TP003&offset=false&tz=...` gives only the next high/low. |

| Warnings | `https://www.bom.gov.au/fwo/IDZ00059.warnings_vic.xml` | RSS, updates about every 10 min (`ttl` 10). `fetcher/warnings.ts` keeps swimming-relevant hazard titles (wind, gale, storm, thunderstorm, waves, surf, tide, tsunami, cyclone, hail, tornado) and drops distant Victorian regions. **Titles of real warnings are unverified** (the feed was empty). `warnings: []` = none active; `null` = feed unreadable. There is no marine-specific variant (`warnings_marine_vic` is 404). |

Equivalent FTP paths exist (`ftp://ftp.bom.gov.au/anon/gen/fwo/IDV10460.xml`) but HTTPS is used because it needs no FTP client.

BOM terms: free for personal / in-organisation use; no redistribution or commercial use without a Registered User agreement. The site is public-but-unlisted and personal; do not market it or add ads. Always keep the attribution string in `data.json`. BOM gives no availability guarantee.

Update cadence: observations ~every 30 minutes (published at :00/:30), forecasts a few times a day, tides are predictions. Polling faster than every 15–30 minutes gains nothing.

### EPA water quality — why it is missing
EPA Victoria's developer portal (portal.api.epa.vic.gov.au) offers only the Environment Monitoring API (air quality). A Beach Report / Yarra Watch API is described by EPA as "in development" with no date. The Beach Report page is a JavaScript app with no documented feed; only a historical enterococci dataset exists on data.vic.gov.au. The owner decided **not** to scrape or estimate. Each beach links to `https://www.epa.vic.gov.au/for-community/summer-water-quality/beach-report`. If EPA ships an API: add `EPA_API_KEY` as a GitHub Actions secret, read `process.env.EPA_API_KEY` in the fetcher, fill `waterQuality` (shape below). Scoring and UI already handle it. Never put the key in the repo or in `data.json`.

### Do NOT use BOM's app API (`api.weather.bom.gov.au`)
It offers hourly wind/temperature forecasts, but every response carries this notice: "This application programming interface (API) is owned by the Bureau of Meteorology. You must not use, copy or share it." It is not one of the free data feeds the owner's personal-use trust covers. Found during the Phase 3 spike (2026-11-10); one location-search request was made and nothing was built on it. Hourly numeric forecasts are therefore not available under the free terms (gridded/digital forecasts need a BOM Registered User agreement). Any "future hours" feature must work from the official daily forecast products (`IDV10460`, `IDV10450`) plus tides and sunset.

### Wind stations (chosen 2026-11-10)
Station positions come from each station's page (`https://www.bom.gov.au/products/IDV60801/IDV60801.<id>.shtml`, 0.01° precision). The coordinates inside the observation JSON are rounded to 0.1° and are not usable for distances. Bay stations available: St Kilda Harbour 95864 (-37.86, 144.96), Fawkner Beacon 95872 (-37.95, 144.93), Point Cook 95941 (-37.93, 144.76), Frankston Beach 94871 (-38.15, 145.12), Point Wilson 94847, South Channel Island 94853. Inland (not used): Laverton, Moorabbin Airport.
- Seven Melbourne-side beaches: St Kilda Harbour (3-8 km away).
- Jawbone: Point Cook (same west shore).
- Half Moon Bay, Ricketts Point: Fawkner Beacon (8-10 km, open water). Frankston Beach is ~15-19 km away.
- Different stations can disagree (e.g. NE 15 at Fawkner vs NNW 17 at St Kilda at the same moment), so expect scores to differ between beaches for reasons other than orientation.

### BOM warnings
No warnings product exists among the `IDV*.xml` FTP files; the usable feed is the RSS at `/fwo/IDZ00059.warnings_vic.xml` (see table). **Verify the parser the first time a real warning is issued**: open the feed, compare item titles with `fetcher/warnings.test.ts`, and adjust `HAZARD` / `OTHER_REGION` / `OUR_AREA` in `fetcher/warnings.ts` if needed.

### BOM tide offsets
`https://www.bom.gov.au/australia/tides/tide_offset_sites.json` is empty (no offset sites), so no official offset is applied for Black Rock / Beaumaris. Tide times are Williamstown's.

## 5. `data.json` schema (produced by the fetcher)

```jsonc
{
  "fetchedAt": "ISO-8601 UTC",
  "stations": {
    "95864": { "name": "...", "observedAt": "ISO UTC", "windDirText": "NNW", "windDirDeg": 337.5,
               "windKmh": 19, "gustKmh": 33, "airTemp": null, "rainSince9am": null,
               "rain24h": 0, "rain72h": 0.8, "rainHistoryHours": 72, // null / 0 for stations with no rain gauge
               "weather": null /* BOM present-weather text, e.g. "Thunderstorm"; null if "-" */ },
    "95872": { "...": "one entry per station used by data/beaches.json, plus the weather station" }
  },
  "weatherStation": "95936",                    // which station supplies temp/rain
  "bay": { "winds": "...", "seas": "Below 1 metre.", "weather": "...", "issuedAt": "ISO UTC" } | null,
  "melbourne": { "uvText": "...", "uvIndex": 9, "rainChancePct": 30 } | null,
  "tide": { "site": "Melbourne (Williamstown)",
            "events": [ { "type": "high"|"low", "time": "ISO UTC", "height": 0.85 }, ... ] } | null,
            // ~yesterday to +2 days, sorted. The page works out "next high/low" and "is it low tide now" itself.
  "warnings": [],                               // string[] of relevant warning titles; null if the feed failed
  "waterQuality": null,                         // { [epaSite]: "Good"|"Fair"|"Poor" } when wired
  "errors": [],                                 // per-source failure messages
  "attribution": "Contains Bureau of Meteorology data. Personal use only."
}
```

Failure policy: each source is fetched independently (`safe()` in `fetch.ts`); a failed source becomes `null` and its message goes in `errors`. The process exits non-zero if **wind obs or the bay forecast** is missing, so CI keeps the last good deployment instead of publishing a broken page. The UI shows a banner for `errors` and for data older than 60 minutes (`STALE_MIN`).

## 6. Beach config (`data/beaches.json`)

Each entry: `id`, `name`, `faces` (compass bearing, degrees, **the direction the beach looks out over the water**), `lat`, `lon` (approximate, display only), `windStation` (BOM station id), `epaSite` (EPA's name for the beach, or `null` if EPA doesn't cover it; for future use), optional `fetchKm` (km of open water the wind can blow over straight out from the beach, a **map estimate** used for the local chop estimate), optional `needsLowTide: true`, optional `maxLowTideM` (only lows at or below this height, in metres, count as low), optional `note`.

| Beach | faces | fetchKm (est.) | Wind station | Low tide only |
|---|---|---|---|---|
| Sandridge | 280 | 6 | 95864 | |
| Port Melbourne | 275 | 8 | 95864 | |
| South Melbourne | 265 | 10 | 95864 | |
| Middle Park | 260 | 14 | 95864 | |
| Albert Park | 255 | 18 | 95864 | |
| St Kilda | 255 | 20 | 95864 | |
| Elwood | 250 | 24 | 95864 | |
| Jawbone Marine Sanctuary (Williamstown, west shore) | 165 | 30 | 95941 | yes |
| Half Moon Bay (Black Rock) | 250 | 30 | 95872 | yes |
| Ricketts Point Marine Sanctuary (Beaumaris) | 255 | 35 | 95872 | yes |

**Bearings and coordinates are estimates from coastline shape**, not surveyed. Jawbone is on the **west** shore and faces roughly south-east, so the usual "easterly = offshore" intuition does not apply there. **`fetchKm` values are rough map estimates and should be checked against a chart**; they only matter for onshore winds. To add a beach, add one JSON entry (candidates: Brighton, Altona). No code change needed. `needsLowTide` beaches were requested by the owner as "worth visiting only at low tide and in good weather" (Flinders was considered and dropped: it is on Western Port, outside this data).

## 7. Scoring specification (`web/src/score.ts`)

All constants are in the exported `CONFIG`. Change numbers there and update tests.

**Idea:** beaches face west, so an easterly (from the land) is *offshore* = calm; a westerly/south-westerly is *onshore* = chop.

1. `onshore = cos(windFromDeg − beachFaces)`: +1 straight onshore, 0 side-on, −1 offshore.
2. `effectiveWind = windKmh × (1 + 0.4 × onshore)` (offshore ×0.6, side-on ×1.0, onshore ×1.4).
3. Points (sum max 100):

| Component | Max | Rule |
|---|---|---|
| Wind | 40 | Effective km/h: ≤8 → 40; 20 → 20; ≥30 → 0 (linear between) |
| Sea | 25 | Bay sea height (m) parsed from text: ≤0.2 → 25; 0.5 → 15; 1.0 → 5; ≥1.5 → 0. Missing → 15 |
| Water quality | 25 | Good 25, Fair 15, Poor 0. **Unknown → 15 (currently always unknown)** |
| Comfort | 10 | Air temp 22–32 °C → 10; falling linearly to 0 at 12 °C and 40 °C. Missing → 5 |

   **Sea height used for the Sea points** = `max(localChop, 0.5 × bayForecastHeight)`. `localChop` (`web/src/chop.ts`) = `1.6e-3 × U × sqrt(F/g)` with U = wind in m/s and F = effective fetch in metres (`fetchKm × max(0, onshore)`, minimum 0.5 km), capped at 2 m. The bay forecast acts as a floor so a stormy forecast still counts when the local wind is light. If wind or `fetchKm` is missing, the bay forecast alone is used. The card shows e.g. "est. chop 0.3 m (bay forecast: Below 1 metre)". This ignores water depth and wind duration.
4. **Caps** (final score = min(sum, lowest applicable cap)):
   - Poor water quality → 35
   - **After dark** → 20 (daylight = sunrise − 30 min to sunset + 30 min, `CONFIG.twilightMin`; computed per beach from lat/lon in `web/src/sun.ts`; label e.g. "after dark, sunrise 6:03am")
   - **Thunderstorm** mentioned in the bay forecast or current obs weather (`mentionsThunderstorm`) → 55. The bay text covers the whole day, so this is a deliberately soft cap
   - Any active warning → 25
   - Gusts > 45 km/h → 40
   - Rain over the last 24 h ≥ 10 mm → 55 (falls back to rain since 9am if the history is too short). The card also shows 72 h rain for context
   - Wind ≥ 25 km/h and `onshore < −0.5` (strong offshore: calm water but swimmers drift out) → 55
   - **Low-tide-only beaches** (`needsLowTide`) when it is not low tide → 35. "Low tide" = within `CONFIG.lowTideWindowHours` (1.5 h) of any predicted low (`web/src/tide.ts`, `lowTideState`). If the tide data doesn't cover "now" the state is unknown: no cap, and "tide" is listed as missing. The reason line then reads e.g. "needs low tide (next daylight low tomorrow 11:38 am, 0.5 m)". Other beaches ignore tide.
   - **Guidance text:** the verdict names the next low tide that falls in **daylight** (`nextDaylightLowWindow` in `web/src/conditions.ts`; night-time lows are skipped), and the card has a "Best time" row with the swim window (low ± `lowTideWindowHours`, clipped to daylight), e.g. "tomorrow 10:08 am–1:08 pm (low 0.5 m at 11:38 am)". The summary line shows the next daylight low-tide window. Times say "tomorrow" or a weekday when not today (`fmtWhen`). If the tide data (about yesterday to +2 days) holds no daylight low it says "no daylight low tide in the next 2 days".
   - Williamstown has two lows a day (about 0.5 m and about 0.22 m). Beaches with `maxLowTideM` (currently **0.5 for the three sanctuaries, so both daily lows count**) only count lows at or below that height. If it is later set lower (e.g. 0.4), only the deep low counts, which often falls at night, so those beaches could go many days with no daylight qualifying low. Tune `maxLowTideM` per beach in `data/beaches.json`. **Revisit with real-world feedback** (see §12). Tide times are Williamstown's; no official offset is available.
   - **Today's best case is ~85 in calm conditions**: with water quality unknown (15/25) and the bay-forecast floor keeping sea points at ~21/25, a score of 80 or more is possible but only on a very calm day, so Great is rare. The owner chose to **leave this as is for now** (see §12).

5. **Labels:** 80–100 Great, 60–79 Good, 40–59 Fair, 0–39 Poor.
6. **Sea text parsing** (`parseSeaHeight`): numbers in BOM prose; "below/less than/under N" → 0.6×N; one number → that value; several → midpoint of low and the maximum. "Below 1 metre." → 0.6 m. The forecast is bay-wide and coarse; "Below 1 metre" is a very common value (0.6 m). It is now used only as a floor (half its value) under the local chop estimate, so sea points are typically ~21 in calm conditions.
7. **Unknown inputs** use neutral values and are listed in `result.unknown`; the UI shows "missing: …".

Because water quality is unknown (15/25), the practical maximum today is ~90, but a score of 80+ is reachable on a perfect day only if wind, sea and comfort all max out. The scoring is a guide; tune it against experience (the owner plans to report disagreements like "said Great but was choppy").

Worked examples (also tests): calm east 9 km/h, 0.2 m, Good water, 24 °C → 98 Great; west 20 km/h, 0.5 m chop, Good water → 54 Fair; calm east with Poor water → capped 35 Poor.

## 8. UI specification

- Mobile-first single column, max width 560 px, 16 px side gutters, no horizontal scroll. System fonts.
- **Header:** "Where to swim", "Updated HH:MM · observations HH:MM" (Australia/Melbourne time).
- **Banners:** stale (data > 60 min old) and source-failure messages.
- **Summary line:** next tide high/low with heights, UV index, rain chance.
- **Cards**, ranked by score descending: rank number, beach name, label (colour + word, never colour alone) and `score/100`, one-line reason (first cap reason, then "Offshore/Onshore/Side-on wind N km/h"), left border coloured by label.
- **Tap a card** to expand (`aria-expanded`): wind compass SVG (shaded half-disc = sea side, arrow = direction the wind blows), then rows for Wind, Sea (estimated chop plus the bay forecast), Water quality (link to EPA), Warnings, Daylight, Tide (low-tide beaches), Air temp, Rain (24 h / 72 h), and a points breakdown with missing inputs.
- **Footer:** attribution, "scores don't include water quality or warnings", EPA Beach Report link.
- **Theme:** CSS custom properties, `prefers-color-scheme: dark` handled automatically. Score colours: green/lime/amber/red with dark-mode variants.
- **Refresh:** `data.json` is fetched on load (with `?t=` cache-buster) and when the tab becomes visible again. No polling.
- **Security:** all fetched text is inserted with `textContent` via the `el()` helper — never `innerHTML`. Keep it that way. External links use `rel="noopener noreferrer"`.

## 8b. Install to home screen (PWA)

- **Manifest** (`web/public/manifest.webmanifest`): `display: standalone`, `start_url` and `scope` are `./` (relative, so it works under any sub-path), icons 192/512 (+ maskable), theme colour `#0b7285`. Linked from `web/index.html` with a *relative* href (no leading slash).
- **Icons** (`web/public/icons/`): generated by `scripts/make-icons.mjs` (sun over two waves on a sea-blue gradient, artwork kept inside the central ~70% so it survives maskable cropping). Re-run the script to regenerate; commit the PNGs.
- **Service worker** (`web/public/sw.js`, registered from `main.ts` only in production builds, `import.meta.env.PROD`, so `npm run dev` is not cached):
  - `data.json` and the page: **network first**, cached copy as the offline fallback (so online you always get fresh data; offline you see the last data with the "data is N minutes old" banner). `data.json` is cached without its `?t=` cache-buster query.
  - `/assets/*` (hashed): cache first. Other same-origin GETs: network first. **Cross-origin requests are never touched.**
  - Cache name `where-to-swim-v1`: bump it if the caching rules change so old caches are deleted on activate.
- **Install prompt** (`main.ts` + `install.ts`): where the browser fires `beforeinstallprompt` (Android Chrome, desktop Chrome/Edge) the page shows an **Install** button ("Not now" is remembered in `localStorage`, wrapped in try/catch). iOS Safari has no install event, so iOS shows a hint: Share, then Add to Home Screen. Nothing is shown when already running standalone, dismissed, or not installable.
- Needs HTTPS (GitHub Pages is). Installability on a real device has not been checked yet; test: open the live URL on the phone, use the Install button (Android) or Share, Add to Home Screen (iPhone), launch from the home screen, then toggle airplane mode and confirm the last data still shows.

## 9. CI/CD (`.github/workflows/deploy.yml`)

- Triggers: schedule `7,37 * * * *` (UTC; GitHub often delays 5–15 min), push to `main`, manual `workflow_dispatch`.
- Steps: checkout → Node 24 with npm cache → `npm ci` → `npm test` → `npm run fetch` → `npm run build` → upload Pages artifact → `deploy-pages`.
- Concurrency group `pages` with cancel-in-progress.
- GitHub may pause scheduled workflows after 60 days without repo activity on a public repo. If data goes stale, check the Actions tab first.
- Pages Source must be "GitHub Actions" in repo settings.

## 10. Gotchas for the next agent

- Node must support running `.ts` directly (22.18+/24) for `npm run fetch`; imports use explicit `.ts` extensions.
- `web/public/data.json` does not exist in a fresh clone; run `npm run fetch` before `npm run dev`.
- Station 95864 has **no temperature or rain**; temp/rain deliberately come from 95936.
- `rain_trace` is rain *since 9am*. Real 24 h / 72 h totals are derived from the half-hourly history in `fetcher/rain.ts` (increments, with the reset after the 09:00 reading). Only the weather station (Olympic Park) has a rain gauge in this set; St Kilda Harbour and Fawkner Beacon report none.
- `IDV10200` is the *open-coast* marine forecast, not the bay. Use `IDV10460` for Port Phillip.
- Time zone: all times in `data.json` are UTC ISO; the UI formats to Australia/Melbourne.
- The tides endpoint is undocumented and may break; the fetcher degrades gracefully (`tide: null`, and low-tide beaches show tide as unknown).
- Vitest also runs `fetcher/**/*.test.ts` (see `vite.config.ts`).
- If you change caching behaviour in `web/public/sw.js`, bump `CACHE` (`where-to-swim-v1`). Users' installed copies keep the old worker until it updates.
- Never log or commit secrets. Do not put personal details (name, email, domain) in this public repo.

## 11. Roadmap / open items (suggested order)

1. Visual QA on a real phone (layout, compass orientation, dark mode, tap targets); fix issues.
2. ~~Warnings feed~~ done; verify against a real warning (see §4).
3. ~~Time switcher~~ reduced (owner choice 2026-11-10): done as tides + daylight only (next daylight low-tide window). A weather-aware future view (+3 h / +6 h / tomorrow) would have to parse the official daily forecast prose in `IDV10460`/`IDV10450` into rough morning/afternoon/evening winds (fragile; label as approximate). BOM's hourly app API is off limits (§4).
4. ~~24–72 h rainfall~~ done and used for the heavy-rain cap. Using it as a *water-quality estimate* is still not done (owner declined; ask before building).
5. EPA Beach Report API when released (see §4).
6. ~~PWA~~ done (install button + offline); verify on a real phone. Notifications were declined.
7. ~~Per-beach wind stations~~ done (Phase 2); revisit after real use.
8. Add beaches (Brighton etc.) via `beaches.json`.
9. Tune `CONFIG` from the owner's real-world feedback.

## 12. Revisit later, once humans have used it
The owner wants to tune these using real-world experience ("it said X but it was actually Y"). Do not change them without that feedback. Keep a short log of each disagreement (beach, time, app verdict, what it was really like) and use it to adjust `CONFIG` in `web/src/score.ts` and `data/beaches.json`.

| Open point | Current setting | Options when revisiting |
|---|---|---|
| **How easy is "Great"?** (owner decision 2026-11-10: leave the scoring as is) | Before Phase 2 Great was unreachable (best ~78). Phase 2 (local chop estimate, bay forecast only a floor) made it reachable: a calm offshore day scores ~87 at South Melbourne even with water quality unknown (15/25). Verified 2026-11-10 | Keep; or require known water quality for Great; or score only known components rescaled to 100 ("water quality not included"); or move the Great threshold from 80. Decide after real use. Note Great can now appear while water quality is unknown, so the EPA link matters |
| **Which lows count for the sanctuaries** (decided 2026-11-10: both lows) | `maxLowTideM: 0.5` for Jawbone, Half Moon Bay, Ricketts Point | Tighten to 0.4 so only the deep low (about 0.22 m) counts; or set per beach from experience; or add tide offsets/heights per site |
| Low-tide window | `lowTideWindowHours: 1.5` either side of a low | Widen/narrow per beach; some sanctuaries may be fine for longer |
| Score thresholds and weights | Great 80 / Good 60 / Fair 40; wind 40, sea 25, water 25, comfort 10 | Re-weight from feedback |
| Onshore wind factor | 0.4 (offshore ×0.6, onshore ×1.4) | Tune per beach exposure |
| Sea state | `max(local chop estimate, 0.5 × bay forecast)`; chop = `1.6e-3·U·sqrt(F/g)` | Check against reality; add depth/duration; weight forecast differently |
| `fetchKm` per beach | Map estimates (6-35 km) | Measure properly on a chart; use per-sector fetch instead of one number |
| Wind stations | St Kilda Harbour (northern 7), Point Cook (Jawbone), Fawkner Beacon (Half Moon Bay, Ricketts Point) | Compare with what it is actually like at the beach; Frankston Beach is an alternative for the southern two |
| Beach bearings and coordinates | Estimated from coastline shape | Check against maps/lifesavers; Jawbone especially |
| Warnings parser | Filter written from assumed titles | Verify when BOM issues a real warning |
| Daylight margin | 30 min twilight allowance | Reduce to 0 if it feels too generous |

## 13. Decision log

| Decision | Why |
|---|---|
| Static site + scheduled fetcher, no server | Free, simple, BOM can't be called from browsers |
| Scoring in the browser | Tunable without refetch; easy to test |
| HTTPS endpoints, not FTP | No FTP client needed in Node/CI |
| Honest User-Agent | Works on all BOM endpoints; avoids spoofing |
| Public GitHub Pages site | Simplest hosting; owner accepted (personal use, unlisted) |
| EPA: link only, no scraping/estimate | No official API; owner's choice; avoids unreliable proxies |
| Fail CI if wind or bay forecast missing | Keep last good deployment live |
| `textContent` only | Fetched strings can't inject markup |
| Daylight cap 20, storm cap 55, wrong-tide cap 35 | Safety rules override a good-looking weather score |
| No tide offset for Black Rock/Beaumaris | BOM's offsets file is empty; don't invent one |
| Leave scoring thresholds alone; sanctuary lows ≤ 0.5 m (both lows) | Owner decision 2026-11-10: gather human experience first (§12). Phase 2 then made "Great" reachable on calm offshore days; flagged to the owner |
