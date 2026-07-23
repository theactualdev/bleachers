// Generates solid-navy PNG app icons with a light "B" glyph — no external deps, valid PNGs.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  const bg = [11, 18, 32]; // #0b1220
  const fg = [96, 165, 250]; // #60a5fa
  const raw = Buffer.alloc(size * (size * 3 + 1));
  // Draw a chunky "B"-ish mark using simple rectangles centred in the icon.
  const inMark = (x, y) => {
    const u = x / size;
    const v = y / size;
    const stemL = u > 0.32 && u < 0.42 && v > 0.28 && v < 0.72;
    const top = v > 0.28 && v < 0.38 && u > 0.32 && u < 0.64;
    const mid = v > 0.47 && v < 0.55 && u > 0.32 && u < 0.62;
    const bot = v > 0.62 && v < 0.72 && u > 0.32 && u < 0.66;
    const rightTop = u > 0.6 && u < 0.7 && v > 0.3 && v < 0.52;
    const rightBot = u > 0.6 && u < 0.7 && v > 0.52 && v < 0.7;
    return stemL || top || mid || bot || rightTop || rightBot;
  };
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = inMark(x, y) ? fg : bg;
      const p = rowStart + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size));
  console.log(`wrote icon-${size}.png`);
}
