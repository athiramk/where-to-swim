// Tide helpers. Events are BOM high/low predictions (times in ISO UTC).
export interface TideEvent {
  type: "high" | "low";
  time: string;
  height: number;
}

export interface LowTideState {
  inWindow: boolean; // is "now" within windowHours of a low tide?
  nearest: TideEvent; // the low tide closest to now
}

/** First event of the given type after `nowMs`, or null. */
export function nextEvent(events: TideEvent[], type: TideEvent["type"], nowMs: number): TideEvent | null {
  return events.find((e) => e.type === type && new Date(e.time).getTime() > nowMs) ?? null;
}

/**
 * Whether it is currently low tide for swimming purposes.
 * Returns null when the data doesn't bracket "now" (so we can't tell) rather than guessing.
 */
export function lowTideState(events: TideEvent[] | null | undefined, nowMs: number, windowHours: number): LowTideState | null {
  if (!events || events.length === 0) return null;
  const times = events.map((e) => new Date(e.time).getTime());
  if (nowMs < Math.min(...times) || nowMs > Math.max(...times)) return null;
  const lows = events.filter((e) => e.type === "low");
  if (lows.length === 0) return null;
  const dist = (e: TideEvent) => Math.abs(new Date(e.time).getTime() - nowMs);
  const nearest = lows.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  return { inWindow: dist(nearest) <= windowHours * 3_600_000, nearest };
}
