// Swim score. All tunable numbers live in CONFIG.
export const CONFIG = {
  weights: { wind: 40, sea: 25, water: 25, comfort: 10 },
  onshoreFactor: 0.4, // effective wind = speed * (1 + factor * onshore); offshore=-1 -> 0.6x, onshore=+1 -> 1.4x
  windPoints: [[8, 40], [20, 20], [30, 0]] as [number, number][], // [effective km/h, points]
  seaPoints: [[0.2, 25], [0.5, 15], [1.0, 5], [1.5, 0]] as [number, number][], // [metres, points]
  caps: { poorWater: 35, warning: 25, gust: 40, heavyRain: 55, strongOffshore: 55, wrongTide: 35, dark: 20, storm: 55 },
  lowTideWindowHours: 1.5, // "low tide" = within this many hours of a predicted low
  twilightMin: 30, // still counts as daylight this many minutes before sunrise / after sunset
  gustCapKmh: 45,
  heavyRainMm: 10,
  strongOffshoreKmh: 25,
  neutralWater: 15,
  neutralSea: 15,
  neutralComfort: 5,
  labels: [[80, "Great"], [60, "Good"], [40, "Fair"], [0, "Poor"]] as [number, Label][],
};

export type Label = "Great" | "Good" | "Fair" | "Poor";
export type WaterQuality = "Good" | "Fair" | "Poor" | null;

export interface Conditions {
  windFromDeg: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  seaHeightM: number | null;
  waterQuality: WaterQuality;
  warnings: string[];
  airTempC: number | null;
  rainMm: number | null;
  /** Beach is only worth visiting at low tide (e.g. marine sanctuaries, rock pools). */
  needsLowTide?: boolean;
  /** Tide state now; null = unknown. `label` is shown in the cap reason, e.g. "next low 5:40pm". */
  lowTide?: { inWindow: boolean; label: string } | null;
  /** Daylight at this beach at the time being scored; `label` explains it (e.g. "after dark, sunrise 6:06am"). */
  daylight?: { isDay: boolean; label: string } | null;
  /** Thunderstorms mentioned in the forecast or current weather. */
  storm?: boolean;
}

/** True if BOM weather text mentions thunderstorms ("thunderstorm", "thunder", "storms"). */
export function mentionsThunderstorm(text: string | null | undefined): boolean {
  return !!text && /thunder/i.test(text);
}

export interface Result {
  score: number;
  label: Label;
  onshore: number | null; // -1 offshore .. +1 onshore
  effectiveWindKmh: number | null;
  points: { wind: number; sea: number; water: number; comfort: number };
  caps: string[]; // human-readable reasons for any cap applied
  unknown: string[]; // inputs that were missing
  reason: string;
}

/** Piecewise-linear lookup; clamps outside the table. Table sorted by x ascending. */
export function interpolate(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
}

/** cos(angle between wind-from direction and the direction the beach faces). +1 = straight onshore. */
export function onshoreComponent(windFromDeg: number, beachFacesDeg: number): number {
  return Math.cos(((windFromDeg - beachFacesDeg) * Math.PI) / 180);
}

/** Parse BOM sea text such as "Below 1 metre.", "Around 1 metre.", "1 to 1.5 metres". Returns metres or null. */
export function parseSeaHeight(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length === 0) return null;
  const below = /\b(below|less than|under)\b/i.test(text);
  const low = below ? nums[0] * 0.6 : nums[0];
  if (nums.length === 1) return low;
  return (low + Math.max(...nums)) / 2;
}

export function labelFor(score: number): Label {
  for (const [min, label] of CONFIG.labels) if (score >= min) return label;
  return "Poor";
}

export function scoreBeach(beachFacesDeg: number, c: Conditions): Result {
  const unknown: string[] = [];
  const caps: { max: number; why: string }[] = [];

  // Wind
  let onshore: number | null = null;
  let effective: number | null = null;
  let windPts: number;
  if (c.windFromDeg != null && c.windKmh != null) {
    onshore = onshoreComponent(c.windFromDeg, beachFacesDeg);
    effective = c.windKmh * (1 + CONFIG.onshoreFactor * onshore);
    windPts = interpolate(CONFIG.windPoints, effective);
    if (c.windKmh >= CONFIG.strongOffshoreKmh && onshore < -0.5) caps.push({ max: CONFIG.caps.strongOffshore, why: "strong offshore wind" });
  } else {
    unknown.push("wind");
    windPts = CONFIG.weights.wind / 2;
  }
  if (c.gustKmh != null && c.gustKmh > CONFIG.gustCapKmh) caps.push({ max: CONFIG.caps.gust, why: `gusts ${Math.round(c.gustKmh)} km/h` });

  // Sea state
  let seaPts: number;
  if (c.seaHeightM != null) seaPts = interpolate(CONFIG.seaPoints, c.seaHeightM);
  else {
    unknown.push("sea state");
    seaPts = CONFIG.neutralSea;
  }

  // Water quality
  let waterPts: number;
  if (c.waterQuality === "Good") waterPts = 25;
  else if (c.waterQuality === "Fair") waterPts = 15;
  else if (c.waterQuality === "Poor") {
    waterPts = 0;
    caps.push({ max: CONFIG.caps.poorWater, why: "poor water quality" });
  } else {
    unknown.push("water quality");
    waterPts = CONFIG.neutralWater;
  }

  // Comfort: air temp 22-32 is ideal, falling to 0 at 12 and 40
  let comfortPts: number;
  if (c.airTempC != null) {
    comfortPts = interpolate([[12, 0], [22, 10]], c.airTempC);
    if (c.airTempC > 32) comfortPts = interpolate([[32, 10], [40, 0]], c.airTempC);
  } else {
    unknown.push("air temperature");
    comfortPts = CONFIG.neutralComfort;
  }

  // Rain / warnings
  if (c.rainMm != null && c.rainMm >= CONFIG.heavyRainMm) caps.push({ max: CONFIG.caps.heavyRain, why: `heavy rain (${c.rainMm} mm)` });
  if (c.warnings.length > 0) caps.push({ max: CONFIG.caps.warning, why: `warning: ${c.warnings[0]}` });
  if (c.daylight && !c.daylight.isDay) caps.push({ max: CONFIG.caps.dark, why: c.daylight.label });
  if (c.storm) caps.push({ max: CONFIG.caps.storm, why: "thunderstorms possible" });
  if (c.needsLowTide) {
    if (c.lowTide == null) unknown.push("tide");
    else if (!c.lowTide.inWindow) caps.push({ max: CONFIG.caps.wrongTide, why: `needs low tide (${c.lowTide.label})` });
  }

  const sum = windPts + seaPts + waterPts + comfortPts;
  const cap = caps.length ? Math.min(...caps.map((x) => x.max)) : 100;
  const score = Math.round(Math.max(0, Math.min(sum, cap)));
  const applied = caps.filter((x) => x.max < sum).map((x) => x.why);

  return {
    score,
    label: labelFor(score),
    onshore,
    effectiveWindKmh: effective,
    points: { wind: Math.round(windPts), sea: Math.round(seaPts), water: Math.round(waterPts), comfort: Math.round(comfortPts) },
    caps: applied,
    unknown,
    reason: buildReason(onshore, c, applied),
  };
}

function buildReason(onshore: number | null, c: Conditions, caps: string[]): string {
  const parts: string[] = [];
  if (caps.length) parts.push(caps[0]);
  if (onshore != null && c.windKmh != null) {
    const kind = onshore < -0.3 ? "Offshore" : onshore > 0.3 ? "Onshore" : "Side-on";
    parts.push(`${kind} wind ${Math.round(c.windKmh)} km/h`);
  }
  return parts.join(" · ");
}
