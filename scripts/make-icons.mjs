// One-off icon generator (no dependencies): writes PNG icons into web/public/icons/.
// Run with: node scripts/make-icons.mjs
// Design: teal-blue sea gradient, a sun, two wave lines. All artwork sits inside the central ~70% so the same
// image works as a "maskable" icon (phones may crop the corners into a circle/squircle).
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../web/public/icons");
const SS = 3; // supersampling per axis, for smooth edges

const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const TOP = hex("#1aa3bb");
const BOTTOM = hex("#0a5566");
const SUN = hex("#ffd166");
const FOAM = hex("#ffffff");

/** Colour (r,g,b) at normalised point (x,y) in 0..1. */
function shade(x, y) {
  let c = [mix(TOP[0], BOTTOM[0], y), mix(TOP[1], BOTTOM[1], y), mix(TOP[2], BOTTOM[2], y)];
  const blend = (col, a) => { c = [mix(c[0], col[0], a), mix(c[1], col[1], a), mix(c[2], col[2], a)]; };

  // sun
  if (Math.hypot(x - 0.5, y - 0.37) <= 0.115) blend(SUN, 1);

  // two waves, x limited to the safe zone
  if (x >= 0.22 && x <= 0.78) {
    for (let k = 0; k < 2; k++) {
      const centre = 0.6 + 0.12 * k + 0.028 * Math.sin(2 * Math.PI * (x * 1.6 + k * 0.3));
      if (Math.abs(y - centre) <= 0.021) blend(FOAM, k === 0 ? 0.97 : 0.7);
    }
  }
  return c;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const c = shade((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, o = (j * size + i) * 4;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n); px[o + 3] = 255;
    }
  }
  return px;
}

function png(size) {
  const raw = render(size);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) {
    rows[j * (size * 4 + 1)] = 0; // filter: none
    raw.copy(rows, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(resolve(OUT, name), png(size));
  console.log("wrote", name);
}

// Matching SVG favicon (same artwork).
writeFileSync(resolve(OUT, "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1aa3bb"/><stop offset="1" stop-color="#0a5566"/></linearGradient></defs>
  <rect width="100" height="100" rx="18" fill="url(#s)"/>
  <circle cx="50" cy="37" r="11.5" fill="#ffd166"/>
  <path d="M22 60 Q 31.5 54 41 60 T 60 60 T 78 60" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M22 72 Q 31.5 66 41 72 T 60 72 T 78 72" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4.2" stroke-linecap="round"/>
</svg>
`);
console.log("wrote icon.svg");
