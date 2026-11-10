# Where to Swim

Personal web app ranking 11 beaches (South Melbourne to Flinders) for swimming, using Bureau of Meteorology (BOM) data.
**Read `docs/SPEC.md` first, starting at §0 "Start here".** It covers the hard rules, architecture, data sources, scoring, UI, CI/CD, gotchas, roadmap and the owner's decisions.

## Quick rules
- `npm run fetch` -> `npm run dev`; `npm test` (93 tests); `npx tsc --noEmit`; `npm run build`.
- Scoring numbers live in `web/src/score.ts` (`CONFIG`); update tests when changing them. Don't change thresholds without the owner's real-world feedback (SPEC §12).
- Beaches, tips and per-beach data sources live in `data/beaches.json`. Only add a tip you've verified on its source page.
- Use an honest `User-Agent` for BOM requests; never spoof a browser.
- Do NOT call `api.weather.bom.gov.au` (BOM's app API says "You must not use, copy or share it"). Use only the free data feeds listed in SPEC §4.
- Insert fetched text with `textContent` (the `el()` helper), never `innerHTML`.
- Keep paths relative (the site is served under a sub-path).
- This repo is public: no personal details, secrets, tokens or API keys in files, `data.json` or chat.
- Do not commit or push unless asked; the owner does git steps manually.
- `README.md` is for end users only: plain, short, non-technical (no file names or code words). Put technical notes in the SPEC.
- No notifications/alerts and no water-quality scraping or estimating (owner decisions).
- Owner reminder: the outside timer's GitHub token expires about 2027-02-08 (SPEC §9.2).
