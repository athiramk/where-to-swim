# Where to Swim

Personal web app ranking South Melbourne-area bay beaches for swimming, using BOM data.
**Read `docs/SPEC.md` first** — it covers architecture, data sources, scoring, UI, CI/CD, gotchas and the roadmap.

## Quick rules
- `npm run fetch` -> `npm run dev`; `npm test`; `npx tsc --noEmit`; `npm run build`.
- Scoring numbers live in `web/src/score.ts` (`CONFIG`); update tests when changing them.
- Use an honest `User-Agent` for BOM requests; never spoof a browser.
- Insert fetched text with `textContent` (the `el()` helper), never `innerHTML`.
- Do NOT call `api.weather.bom.gov.au` (BOM's app API says "You must not use, copy or share it"). Use only the free data feeds listed in `docs/SPEC.md` §4.
- Keep paths relative (the site is served under a sub-path).
- This repo is public: no personal details, secrets or API keys in files or `data.json`.
- Do not commit or push unless asked; the owner does git steps manually.
