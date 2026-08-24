// One-off generator for favicon.ico and apple-touch-icon.png.
// Rasterizes the same geometry as public/icon.svg (diagonal blue gradient,
// white house silhouette) so every icon stays pixel-identical across sizes.
// Usage: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// House outline from public/icon.svg: M256 128 L116 240 h40 v144 h72 v-96 h56
// v96 h72 V240 h40 z
const HOUSE = [
  [256, 128], [116, 240], [156, 240], [156, 384], [228, 384], [228, 288],
  [284, 288], [284, 384], [356, 384], [356, 240], [396, 240],
];

function pointInHouse(x, y) {
  let inside = false;
  for (let i = 0, j = HOUSE.length - 1; i < HOUSE.length; j = i++) {
    const [xi, yi] = HOUSE[i];
    const [xj, yj] = HOUSE[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Renders the icon at `size` px into raw RGBA bytes, 4x supersampled. */
function render(size) {
  const scale = size / 512;
  const data = Buffer.alloc(size * size * 4);
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Gradient along the x+y diagonal, matching the SVG linearGradient
      // from (0,0) #0a84ff to (1,1) #2770ca.
      let r = 0, g = 0, b = 0;
      {
        const cx = (px + 0.5) / size, cy = (py + 0.5) / size;
        const t = Math.min(1, Math.max(0, (cx + cy) / 2));
        r = 0x0a + (0x27 - 0x0a) * t;
        g = 0x84 + (0x70 - 0x84) * t;
        b = 0xff + (0xca - 0xff) * t;
      }
      let coverage = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / scale);
          const y = ((py + (sy + 0.5) / SS) / scale);
          if (pointInHouse(x, y)) coverage++;
        }
      }
      const alpha = coverage / (SS * SS);
      const offset = (py * size + px) * 4;
      data[offset] = Math.round(r * (1 - alpha) + 255 * alpha);
      data[offset + 1] = Math.round(g * (1 - alpha) + 255 * alpha);
      data[offset + 2] = Math.round(b * (1 - alpha) + 255 * alpha);
      data[offset + 3] = 255;
    }
  }
  return data;
}

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Multi-size ICO with embedded PNG images (supported by all modern browsers). */
function encodeIco(sizes) {
  const pngs = sizes.map((size) => ({ size, png: encodePng(size, render(size)) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const images = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);  // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
    images.push(png);
  }
  return Buffer.concat([header, ...entries, ...images]);
}

mkdirSync(join(root, "app"), { recursive: true });
writeFileSync(join(root, "app", "favicon.ico"), encodeIco([16, 32, 48]));
writeFileSync(join(root, "public", "apple-touch-icon.png"), encodePng(180, render(180)));
writeFileSync(join(root, "public", "icon-512.png"), encodePng(512, render(512)));
console.log("Wrote app/favicon.ico (16/32/48), public/apple-touch-icon.png (180), public/icon-512.png");
