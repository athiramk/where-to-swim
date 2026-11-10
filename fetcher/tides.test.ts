import { describe, expect, it } from "vitest";
import { parseTideTable } from "./tides.ts";

// Trimmed from a real BOM response (Melbourne (Williamstown), 10 Nov 2026).
const sample = `
<tr><th rowspan="2" class="instance high-tide">High</th>
  <td data-time-utc="2026-11-10T04:51:00Z" data-time-local="2026-11-10T15:51:00+11:00" class="localtime high-tide">3:51 pm</td></tr>
<tr><td class="height high-tide">0.85 m</td></tr>
<tr><th rowspan="2" class="instance low-tide">Low</th>
  <td data-time-utc="2026-11-09T23:54:00Z" data-time-local="2026-11-10T10:54:00+11:00" class="localtime low-tide">10:54 am</td></tr>
<tr><td class="height low-tide">0.50 m</td></tr>`;

describe("parseTideTable", () => {
  it("extracts type, UTC time and height, sorted by time", () => {
    expect(parseTideTable(sample)).toEqual([
      { type: "low", time: "2026-11-09T23:54:00.000Z", height: 0.5 },
      { type: "high", time: "2026-11-10T04:51:00.000Z", height: 0.85 },
    ]);
  });
  it("returns an empty list for unexpected HTML", () => {
    expect(parseTideTable("XML data not found.")).toEqual([]);
  });
});
