import "./style.css";
import rawBeaches from "../../data/beaches.json";
import { scoreBeach, type Result } from "./score.ts";
import { conditionsFor, daylightFor, fmtTime, type Beach, type Data, type Station } from "./conditions.ts";
import { nextEvent } from "./tide.ts";
import type { Conditions } from "./score.ts";

const beaches = rawBeaches as Beach[];

const STALE_MIN = 60;
const app = document.getElementById("app")!;
const EPA_BEACH_REPORT_URL = "https://www.epa.vic.gov.au/for-community/summer-water-quality/beach-report";
const ageMin = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60_000;

/** Build a DOM element; text goes in via textContent so fetched strings can't inject markup. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { class?: string; text?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  for (const k of kids) e.append(k);
  return e;
}

function compass(beach: Beach, windFromDeg: number | null): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-50 -50 100 100");
  svg.setAttribute("class", "compass");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", windFromDeg == null ? "Wind unknown" : `Wind from ${Math.round(windFromDeg)} degrees; beach faces ${beach.faces} degrees`);
  const add = (name: string, attrs: Record<string, string>, text?: string) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  add("circle", { class: "ring", r: "38" });
  // Sea wedge: the half-disc on the side the beach faces (towards the water).
  const f = ((beach.faces - 90) * Math.PI) / 180;
  const p = (a: number) => `${(38 * Math.cos(a)).toFixed(1)},${(38 * Math.sin(a)).toFixed(1)}`;
  add("path", { class: "sea", d: `M ${p(f - Math.PI / 2)} A 38 38 0 0 1 ${p(f + Math.PI / 2)} Z` });
  add("text", { x: "0", y: "-41" }, "N");
  if (windFromDeg != null) {
    // Arrow points the way the wind blows (from -> to).
    add("g", { transform: `rotate(${(windFromDeg + 180) % 360})` });
    const g = svg.lastChild as SVGElement;
    const line = document.createElementNS(NS, "line");
    for (const [k, v] of Object.entries({ x1: "0", y1: "26", x2: "0", y2: "-18", class: "arrow" })) line.setAttribute(k, v);
    const head = document.createElementNS(NS, "polygon");
    head.setAttribute("points", "0,-30 -7,-16 7,-16");
    head.setAttribute("class", "arrow");
    g.append(line, head);
  }
  return svg;
}

function row(dl: HTMLElement, label: string, value: string | null, unknownNote = "not available") {
  dl.append(el("dt", { text: label }), value ? el("dd", { text: value }) : el("dd", { class: "unknown", text: unknownNote }));
}

function epaLink(): HTMLAnchorElement {
  const a = el("a", { class: "epa-link", text: "Check EPA Beach Report ↗" });
  a.href = EPA_BEACH_REPORT_URL;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function card(beach: Beach, r: Result, c: Conditions, d: Data, rank: number): HTMLElement {
  const wind = d.stations[beach.windStation];
  const btn = el("button", {}, el("span", { class: "rank", text: String(rank) }), el("span", { class: "name", text: beach.name }),
    el("span", { class: "badge" }, el("div", { class: "label", text: r.label }), el("div", { class: "num", text: `${r.score}/100` })),
    el("span", { class: "reason", text: r.reason || "Limited data" }));
  btn.setAttribute("aria-expanded", "false");

  const dl = el("dl");
  row(dl, "Wind", c.windKmh != null ? `${wind?.windDirText ?? "?"} ${Math.round(c.windKmh)} km/h${c.gustKmh != null ? `, gusts ${Math.round(c.gustKmh)}` : ""}` : null);
  row(dl, "Sea (bay)", d.bay?.seas ?? null);
  if (c.waterQuality) row(dl, "Water quality", c.waterQuality);
  else dl.append(el("dt", { text: "Water quality" }), el("dd", {}, epaLink()));
  row(dl, "Warnings", d.warnings === null ? null : d.warnings.length ? d.warnings.join("; ") : "none active (BOM Victoria)", "unavailable (couldn't read BOM feed)");
  if (c.daylight) row(dl, "Daylight", c.daylight.label);
  if (c.storm) row(dl, "Weather", "thunderstorms possible");
  if (beach.needsLowTide) row(dl, "Tide (needs low)", c.lowTide ? `${c.lowTide.inWindow ? "OK — " : "wait — "}${c.lowTide.label}` : null);
  row(dl, "Air temp", c.airTempC != null ? `${c.airTempC}°C` : null);
  row(dl, "Rain since 9am", c.rainMm != null ? `${c.rainMm} mm` : null);
  const detail = el("div", { class: "detail" },
    el("div", { class: "detail-top" }, compass(beach, c.windFromDeg), dl),
    el("div", { class: "points", text: `Points — wind ${r.points.wind}/40, sea ${r.points.sea}/25, water ${r.points.water}/25, comfort ${r.points.comfort}/10` +
      (r.unknown.length ? ` · missing: ${r.unknown.join(", ")}` : "") }));
  detail.hidden = true;
  btn.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
    btn.setAttribute("aria-expanded", String(!detail.hidden));
  });
  return el("article", { class: `card ${r.label}` }, btn, detail);
}

function render(d: Data) {
  const ranked = beaches
    .map((b) => { const c = conditionsFor(b, d); return { b, c, r: scoreBeach(b.faces, c) }; })
    .sort((x, y) => y.r.score - x.r.score);

  const oldest = Math.max(ageMin(d.fetchedAt), ...Object.values(d.stations).filter((s): s is Station => !!s).map((s) => ageMin(s.observedAt)));
  const header = el("header", {}, el("h1", { text: "Where to swim" }),
    el("p", { class: "asof", text: `Updated ${fmtTime(d.fetchedAt)} · observations ${fmtTime(Object.values(d.stations).find((s) => s)?.observedAt ?? d.fetchedAt)}` }));
  const out: Node[] = [header];
  if (oldest > STALE_MIN) out.push(el("div", { class: "banner", text: `Data is ${Math.round(oldest)} minutes old — conditions may have changed.` }));
  if (d.errors.length) out.push(el("div", { class: "banner", text: `Some sources failed: ${d.errors.join("; ")}` }));

  const bits: string[] = [];
  if (d.tide) {
    const hi = nextEvent(d.tide.events, "high", Date.now());
    const lo = nextEvent(d.tide.events, "low", Date.now());
    const parts = [hi && `high ${hi.height} m ${fmtTime(hi.time)}`, lo && `low ${lo.height} m ${fmtTime(lo.time)}`].filter(Boolean);
    if (parts.length) bits.push(`Next tide: ${parts.join(", ")}`);
  }
  const sun = daylightFor(beaches[0], Date.now());
  if (sun) bits.push(sun.label);
  if (d.melbourne?.uvIndex != null) bits.push(`UV ${d.melbourne.uvIndex}`);
  if (d.melbourne?.rainChancePct != null) bits.push(`Rain chance ${d.melbourne.rainChancePct}%`);
  if (bits.length) out.push(el("div", { class: "summary" }, ...bits.map((t) => el("span", { text: t }))));

  out.push(el("div", { class: "section-title", text: "Best right now" }));
  ranked.forEach(({ b, c, r }, i) => out.push(card(b, r, c, d, i + 1)));
  const note = el("footer", { text: `${d.attribution} Scores are a guide and don't include water quality — check the ` });
  const link = epaLink();
  link.textContent = "EPA Beach Report";
  note.append(link, " and the flags and lifesavers before you swim.");
  out.push(note);
  app.replaceChildren(...out);
}

async function load() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(String(res.status));
    render((await res.json()) as Data);
  } catch (e) {
    app.replaceChildren(el("p", { class: "error", text: `Couldn't load conditions (${(e as Error).message}). Run "npm run fetch" to create data.json.` }));
  }
}
load();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
