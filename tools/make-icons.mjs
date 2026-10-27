// Generates the PNG app icons with no dependencies (iOS needs PNG, not SVG).
// Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [17, 18, 20];
const LINE = [236, 236, 238];
const DIM = [110, 112, 120];
const MARK = [245, 158, 11];
const SS = 4; // supersampling for anti-aliasing

// Shapes in a 0..1 coordinate space, drawn back to front.
const shapes = [
  { type: 'rrect', x: 0.27, y: 0.26, w: 0.46, h: 0.075, color: DIM },
  { type: 'rrect', x: 0.27, y: 0.4625, w: 0.50, h: 0.075, color: LINE },
  { type: 'rrect', x: 0.27, y: 0.665, w: 0.36, h: 0.075, color: DIM },
  { type: 'tri', pts: [[0.14, 0.43], [0.14, 0.57], [0.22, 0.5]], color: MARK },
  { type: 'tri', pts: [[0.86, 0.43], [0.86, 0.57], [0.78, 0.5]], color: MARK },
];

function inRRect(px, py, s) {
  const r = s.h / 2;
  const cx = Math.min(Math.max(px, s.x + r), s.x + s.w - r);
  const cy = s.y + r;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r && py >= s.y && py <= s.y + s.h;
}

function inTri(px, py, [a, b, c]) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px, py];
  const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function colorAt(x, y) {
  let col = BG;
  for (const s of shapes) {
    if (s.type === 'rrect' ? inRRect(x, y, s) : inTri(x, y, s.pts)) col = s.color;
  }
  return col;
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  return png(size, size, raw);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, out), render(size));
  console.log('wrote public/icons/' + name);
}
