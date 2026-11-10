// Parses BOM's tide table HTML (scripts/getTidesTable.php) into high/low events.
export interface TideEvent {
  type: "high" | "low";
  time: string; // ISO-8601 UTC
  height: number; // metres
}

export function parseTideTable(html: string): TideEvent[] {
  const events: TideEvent[] = [];
  const re = /class="instance (high|low)-tide">[\s\S]*?data-time-utc="([^"]+)"[\s\S]*?class="height [^"]*">\s*(-?[\d.]+)\s*m/g;
  for (const m of html.matchAll(re)) {
    const time = new Date(m[2]);
    const height = Number(m[3]);
    if (Number.isNaN(time.getTime()) || !Number.isFinite(height)) continue;
    events.push({ type: m[1] as "high" | "low", time: time.toISOString(), height });
  }
  return events.sort((a, b) => a.time.localeCompare(b.time));
}
