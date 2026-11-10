// Sunrise/sunset from latitude/longitude (NOAA / Wikipedia "Sunrise equation"). Pure maths, no API.
// Accurate to a few minutes, which is plenty for a "is it dark?" rule.
const RAD = Math.PI / 180;
const J2000 = 2451545.0;

export interface SunTimes {
  sunrise: number; // epoch ms (UTC)
  sunset: number; // epoch ms (UTC)
}

/**
 * Sunrise/sunset for the solar day nearest to `dateMs` at the given place (lon: east is positive).
 * Returns null where the sun doesn't rise or set that day (polar regions).
 */
export function sunTimes(dateMs: number, lat: number, lon: number): SunTimes | null {
  const jd = dateMs / 86_400_000 + 2440587.5;
  const n = Math.round(jd - J2000 + lon / 360); // whole days since J2000 whose local solar noon is nearest to dateMs
  const jStar = n - lon / 360; // mean solar noon (days since J2000)
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360; // ecliptic longitude
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDelta = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const delta = Math.asin(sinDelta);
  const cosOmega = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDelta) / (Math.cos(lat * RAD) * Math.cos(delta));
  if (cosOmega < -1 || cosOmega > 1) return null;
  const omega = Math.acos(cosOmega) / RAD; // half day length in degrees
  const toMs = (j: number) => (j - 2440587.5) * 86_400_000;
  return { sunrise: toMs(jTransit - omega / 360), sunset: toMs(jTransit + omega / 360) };
}
