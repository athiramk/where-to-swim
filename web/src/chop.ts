// Estimated local wave ("chop") height for a beach, from wind and how far the wind can blow over open water to it.
// Port Phillip is shallow and fetch-limited, so waves are driven by wind speed and fetch (SMB-style relationship):
//   Hs = 1.6e-3 * U * sqrt(F / g)      U = wind m/s, F = fetch m, g = 9.81
// This is a rough estimate (it ignores depth and duration). It lets beaches differ for the same wind, which the single
// bay-wide BOM sea forecast can't. `fetchKm` per beach is a map estimate in data/beaches.json.
import { onshoreComponent } from "./score.ts";

const G = 9.81;
const MIN_FETCH_KM = 0.5; // even offshore wind makes a little ripple at the shore
const MAX_CHOP_M = 2;

/** Effective open-water distance (km) for this wind direction: full fetch straight onshore, tapering to the minimum. */
export function effectiveFetchKm(windFromDeg: number, beachFacesDeg: number, fetchKm: number): number {
  const onshore = onshoreComponent(windFromDeg, beachFacesDeg);
  return Math.max(MIN_FETCH_KM, fetchKm * Math.max(0, onshore));
}

/** Estimated chop height in metres, or null if the inputs are missing. */
export function estimateChopM(
  windKmh: number | null | undefined,
  windFromDeg: number | null | undefined,
  beachFacesDeg: number,
  fetchKm: number | null | undefined,
): number | null {
  if (windKmh == null || windFromDeg == null || fetchKm == null) return null;
  const u = windKmh / 3.6;
  const f = effectiveFetchKm(windFromDeg, beachFacesDeg, fetchKm) * 1000;
  const hs = 1.6e-3 * u * Math.sqrt(f / G);
  return Math.round(Math.min(MAX_CHOP_M, hs) * 100) / 100;
}
