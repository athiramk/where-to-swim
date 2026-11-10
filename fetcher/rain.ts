// Rain totals from BOM's half-hourly observation history.
// BOM's `rain_trace` is the rain (mm) SINCE 9am local, counting up through the day. The reading stamped 09:00 still
// belongs to the previous 9am-to-9am period and the next reading (09:30) starts again from ~0. We turn that into
// increments, so we can total any window (24 h, 72 h).
export interface RainReading {
  /** Observation time, epoch ms (UTC). */
  timeMs: number;
  /** Local date-time as BOM prints it, "yyyymmddhhmmss" (used to find the 9am reset). */
  localFull: string;
  /** rain_trace in mm, or null when the gauge reported nothing. */
  since9am: number | null;
}

export interface RainTotals {
  rain24h: number | null;
  rain72h: number | null;
  /** Hours of history actually covered (the 72 h figure is partial if this is less than 72). */
  coverageHours: number;
}

/** Which 9am-to-9am period a local timestamp falls in (the 09:00:00 reading still belongs to the earlier one). */
export function ninePeriod(localFull: string): number {
  const n = (a: number, b: number) => Number(localFull.slice(a, b));
  const asUtc = Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14));
  return Math.floor((asUtc - 9 * 3_600_000 - 1000) / 86_400_000);
}

export function rainTotals(readings: RainReading[], nowMs: number): RainTotals {
  const rs = readings.filter((r) => r.since9am != null).sort((a, b) => a.timeMs - b.timeMs);
  if (rs.length < 2) return { rain24h: null, rain72h: null, coverageHours: 0 };

  const increments: { timeMs: number; mm: number }[] = [];
  for (let i = 1; i < rs.length; i++) {
    const prev = rs[i - 1];
    const cur = rs[i];
    const sameBucket = ninePeriod(prev.localFull) === ninePeriod(cur.localFull);
    const mm = sameBucket ? Math.max(0, cur.since9am! - prev.since9am!) : cur.since9am!;
    increments.push({ timeMs: cur.timeMs, mm });
  }

  const coverageHours = (rs[rs.length - 1].timeMs - rs[0].timeMs) / 3_600_000;
  const sumSince = (hours: number) =>
    Math.round(increments.filter((x) => x.timeMs > nowMs - hours * 3_600_000).reduce((s, x) => s + x.mm, 0) * 10) / 10;

  return {
    rain24h: coverageHours >= 23 ? sumSince(24) : null,
    rain72h: coverageHours >= 24 ? sumSince(72) : null,
    coverageHours: Math.round(coverageHours),
  };
}
