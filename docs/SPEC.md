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
| UI (ranked cards, details, compass, dark mode, stale banner) | Done; **layout not yet visually verified on a phone by an agent** |
| CI/CD (fetch + build + deploy every 30 min, GitHub Pages) | Done, confirmed working |
| Water quality (EPA) | **Not available.** EPA has no live Beach Report API. UI links to EPA's Beach Report instead. Score treats it as unknown. |
| BOM warnings (strong wind / thunderstorm) | **Not wired.** No feed identified yet. `warnings` is always `null`/empty. |
| Time-ahead view (+3h / tomorrow) | Not built |
| PWA / offline install | Not built |

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
web/index.html           Page shell
web/src/main.ts          UI rendering, data loading, condition assembly
web/src/score.ts         Scoring engine + CONFIG (all tunable numbers)
web/src/score.test.ts    Unit tests (npm test)
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
| Wind, direction, gusts | `https://www.bom.gov.au/fwo/IDV60801/IDV60801.95864.json` (St Kilda Harbour RMYS) | `data[0]` is the newest obs. `wind_dir` is **compass text** ("NNW"), converted to degrees (×22.5). `wind_spd_kmh`, `gust_kmh`, `aifstime_utc` (yyyymmddhhmmss, UTC). **This station has no air temp or rain** (null/"-"). |
| Air temp, rain | Same URL pattern, station `95936` (Melbourne Olympic Park) | `air_temp`; `rain_trace` is **rain since 9am (mm)**, not 24 h. |
| Port Phillip marine forecast | `https://www.bom.gov.au/fwo/IDV10460.xml` | Area `VIC_MW005` "Port Phillip", `forecast-period index=0` (today). Text types `forecast_winds` (knots, prose), `forecast_seas` (e.g. "Below 1 metre."), `forecast_weather`. One value for the whole bay. |
| UV, rain chance | `https://www.bom.gov.au/fwo/IDV10450.xml` | `VIC_ME001` period 0 `uv_alert` ("UV Index predicted to reach 9 [Very High]"); `VIC_PT042` period 0 `probability_of_precipitation` ("30%"). Display only, not scored. |
| Tides | `https://www.bom.gov.au/australia/tides/scripts/getTidesTable.php?type=tide&aac=VIC_TP003&date=YYYY-MM-DD&days=4&region=VIC&offset=false&offsetName=&tz=Australia/Melbourne&tz_js=Australia/Melbourne` | **Undocumented endpoint used by BOM's own tides page**; may change without notice. Returns HTML; `fetcher/tides.ts` (`parseTideTable`) extracts every high/low from `data-time-utc` and the height cell. Fetched from yesterday for 4 days. Site `VIC_TP003` = Melbourne (Williamstown), the primary Port Phillip station (`VIC_TP027` St Kilda is a secondary). Williamstown has **two lows a day of different depth** (about 0.5 m and about 0.22 m). A simpler endpoint `getNextTides.php?aac=VIC_TP003&offset=false&tz=...` gives only the next high/low. |

Equivalent FTP paths exist (`ftp://ftp.bom.gov.au/anon/gen/fwo/IDV10460.xml`) but HTTPS is used because it needs no FTP client.

BOM terms: free for personal / in-organisation use; no redistribution or commercial use without a Registered User agreement. The site is public-but-unlisted and personal; do not market it or add ads. Always keep the attribution string in `data.json`. BOM gives no availability guarantee.

Update cadence: observations ~every 30 minutes (published at :00/:30), forecasts a few times a day, tides are predictions. Polling faster than every 15–30 minutes gains nothing.

### EPA water quality — why it is missing
EPA Victoria's developer portal (portal.api.epa.vic.gov.au) offers only the Environment Monitoring API (air quality). A Beach Report / Yarra Watch API is described by EPA as "in development" with no date. The Beach Report page is a JavaScript app with no documented feed; only a historical enterococci dataset exists on data.vic.gov.au. The owner decided **not** to scrape or estimate. Each beach links to `https://www.epa.vic.gov.au/for-community/summer-water-quality/beach-report`. If EPA ships an API: add `EPA_API_KEY` as a GitHub Actions secret, read `process.env.EPA_API_KEY` in the fetcher, fill `waterQuality` (shape below). Scoring and UI already handle it. Never put the key in the repo or in `data.json`.

### BOM warnings — open item
No warnings product was found among the 54 Victorian `IDV*.xml` FTP products. Candidates to investigate: BOM warnings RSS/summary pages, or Victoria marine/strong-wind warning products under other prefixes (e.g. `IDZ*`, `IDV21*`/`IDV36*`). Unverified. When found, populate `warnings: string[]` in `data.json`; scoring already caps at 25 if non-empty.

## 5. `data.json` schema (produced by the fetcher)

```jsonc
{
  "fetchedAt": "ISO-8601 UTC",
  "stations": {
    "95864": { "name": "...", "observedAt": "ISO UTC", "windDirText": "NNW", "windDirDeg": 337.5,
               "windKmh": 19, "gustKmh": 33, "airTemp": null, "rainSince9am": null },
    "95936": { "...": "same shape, airTemp and rainSince9am populated" }
  },
  "weatherStation": "95936",                    // which station supplies temp/rain
  "bay": { "winds": "...", "seas": "Below 1 metre.", "weather": "...", "issuedAt": "ISO UTC" } | null,
  "melbourne": { "uvText": "...", "uvIndex": 9, "rainChancePct": 30 } | null,
  "tide": { "site": "Melbourne (Williamstown)",
            "events": [ { "type": "high"|"low", "time": "ISO UTC", "height": 0.85 }, ... ] } | null,
            // ~yesterday to +2 days, sorted. The page works out "next high/low" and "is it low tide now" itself.
  "warnings": null,                             // string[] when wired
  "waterQuality": null,                         // { [epaSite]: "Good"|"Fair"|"Poor" } when wired
  "errors": [],                                 // per-source failure messages
  "attribution": "Contains Bureau of Meteorology data. Personal use only."
}
```

Failure policy: each source is fetched independently (`safe()` in `fetch.ts`); a failed source becomes `null` and its message goes in `errors`. The process exits non-zero if **wind obs or the bay forecast** is missing, so CI keeps the last good deployment instead of publishing a broken page. The UI shows a banner for `errors` and for data older than 60 minutes (`STALE_MIN`).

## 6. Beach config (`data/beaches.json`)

Each entry: `id`, `name`, `faces` (compass bearing, degrees, **the direction the beach looks out over the water**), `lat`, `lon` (approximate, display only), `windStation` (BOM station id), `epaSite` (EPA's name for the beach, or `null` if EPA doesn't cover it; for future use), optional `needsLowTide: true`, optional `note`.

| Beach | faces | Low tide only |
|---|---|---|
| Sandridge | 280 | |
| Port Melbourne | 275 | |
| South Melbourne | 265 | |
| Middle Park | 260 | |
| Albert Park | 255 | |
| St Kilda | 255 | |
| Elwood | 250 | |
| Jawbone Marine Sanctuary (Williamstown, west shore) | 165 | yes |
| Half Moon Bay (Black Rock) | 250 | yes |
| Ricketts Point Marine Sanctuary (Beaumaris) | 255 | yes |

**Bearings and coordinates are estimates from coastline shape**, not surveyed. Jawbone is on the **west** shore and faces roughly south-east, so the usual "easterly = offshore" intuition does not apply there. All beaches currently use wind station 95864 (St Kilda Harbour), which is a stand-in for the three south/west additions: a closer verified station would be better. To add a beach, add one JSON entry (candidates: Brighton, Altona). No code change needed. `needsLowTide` beaches were requested by the owner as "worth visiting only at low tide and in good weather" (Flinders was considered and dropped: it is on Western Port, outside this data).

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

4. **Caps** (final score = min(sum, lowest applicable cap)):
   - Poor water quality → 35
   - Any active warning → 25
   - Gusts > 45 km/h → 40
   - Rain since 9am ≥ 10 mm → 55
   - Wind ≥ 25 km/h and `onshore < −0.5` (strong offshore: calm water but swimmers drift out) → 55
   - **Low-tide-only beaches** (`needsLowTide`) when it is not low tide → 35. "Low tide" = within `CONFIG.lowTideWindowHours` (1.5 h) of any predicted low (`web/src/tide.ts`, `lowTideState`). If the tide data doesn't cover "now" the state is unknown: no cap, and "tide" is listed as missing. The reason line then reads "needs low tide (next low 10:50pm, 0.22 m)". Other beaches ignore tide.
   - Known limitation: Williamstown has two lows a day (about 0.5 m and about 0.22 m); both currently count as "low". A per-beach maximum low height (e.g. ≤ 0.4 m) may suit marine sanctuaries better. Tide times are Williamstown's; Black Rock and Beaumaris differ by a short offset that is not applied.

5. **Labels:** 80–100 Great, 60–79 Good, 40–59 Fair, 0–39 Poor.
6. **Sea text parsing** (`parseSeaHeight`): numbers in BOM prose; "below/less than/under N" → 0.6×N; one number → that value; several → midpoint of low and the maximum. "Below 1 metre." → 0.6 m. The forecast is bay-wide and coarse; "Below 1 metre" is a very common value, so sea points are usually ~13.
7. **Unknown inputs** use neutral values and are listed in `result.unknown`; the UI shows "missing: …".

Because water quality is unknown (15/25), the practical maximum today is ~90, but a score of 80+ is reachable on a perfect day only if wind, sea and comfort all max out. The scoring is a guide; tune it against experience (the owner plans to report disagreements like "said Great but was choppy").

Worked examples (also tests): calm east 9 km/h, 0.2 m, Good water, 24 °C → 98 Great; west 20 km/h, 0.5 m chop, Good water → 54 Fair; calm east with Poor water → capped 35 Poor.

## 8. UI specification

- Mobile-first single column, max width 560 px, 16 px side gutters, no horizontal scroll. System fonts.
- **Header:** "Where to swim", "Updated HH:MM · observations HH:MM" (Australia/Melbourne time).
- **Banners:** stale (data > 60 min old) and source-failure messages.
- **Summary line:** next tide high/low with heights, UV index, rain chance.
- **Cards**, ranked by score descending: rank number, beach name, label (colour + word, never colour alone) and `score/100`, one-line reason (first cap reason, then "Offshore/Onshore/Side-on wind N km/h"), left border coloured by label.
- **Tap a card** to expand (`aria-expanded`): wind compass SVG (shaded half-disc = sea side, arrow = direction the wind blows), then rows for Wind, Sea (bay), Water quality (link to EPA), Warnings, Air temp, Rain since 9am, and a points breakdown with missing inputs.
- **Footer:** attribution, "scores don't include water quality or warnings", EPA Beach Report link.
- **Theme:** CSS custom properties, `prefers-color-scheme: dark` handled automatically. Score colours: green/lime/amber/red with dark-mode variants.
- **Refresh:** `data.json` is fetched on load (with `?t=` cache-buster) and when the tab becomes visible again. No polling.
- **Security:** all fetched text is inserted with `textContent` via the `el()` helper — never `innerHTML`. Keep it that way. External links use `rel="noopener noreferrer"`.

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
- `rain_trace` is rain *since 9am*, not the last 24 h. The "heavy rain" cap uses it; a true 24–72 h rain total would be a better water-quality proxy and is a possible improvement.
- `IDV10200` is the *open-coast* marine forecast, not the bay. Use `IDV10460` for Port Phillip.
- Time zone: all times in `data.json` are UTC ISO; the UI formats to Australia/Melbourne.
- The tides endpoint is undocumented and may break; the fetcher degrades gracefully (`tide: null`, and low-tide beaches show tide as unknown).
- Vitest also runs `fetcher/**/*.test.ts` (see `vite.config.ts`).
- Never log or commit secrets. Do not put personal details (name, email, domain) in this public repo.

## 11. Roadmap / open items (suggested order)

1. Visual QA on a real phone (layout, compass orientation, dark mode, tap targets); fix issues.
2. Find a BOM warnings feed and wire `warnings`.
3. Time switcher (+3 h / +6 h / tomorrow) — would use forecast periods in `IDV10460` and BOM's wind forecast; needs a way to turn forecast prose into numbers.
4. 24–72 h rainfall from BOM as an optional *clearly-labelled estimate* for water quality (owner declined for now; ask before building).
5. EPA Beach Report API when released (see §4).
6. PWA (manifest, offline cache of last `data.json`).
7. Per-beach nearest wind station (e.g. Fawkner Beacon / Williamstown for northern beaches) once their station ids are verified.
8. Add beaches (Brighton etc.) via `beaches.json`.
9. Tune `CONFIG` from the owner's real-world feedback.

## 12. Decision log

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
