/**
 * PNG tiles built here (no image library), for the specs that answer a tile host themselves: lidar.spec.ts's grey tile,
 * and offline-cache.spec.ts's noisy one, which doesn't compress, so its size is known (about 4 bytes a pixel).
 */
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const t = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(t));
  return Buffer.concat([len, t, sum]);
};

function png(px: number, colourType: 0 | 6, pixel: (i: number) => number): Buffer {
  const bytes = colourType === 6 ? 4 : 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colourType;
  const stride = px * bytes + 1;
  const rows = Buffer.alloc(stride * px);
  for (let y = 0; y < px; y++) {
    rows[y * stride] = 0; // filter: none
    for (let i = 1; i < stride; i++) rows[y * stride + i] = pixel(y * stride + i);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A square grey PNG: the tile every request gets (as Terrarium, a flat 128 m). */
export const greyPng = (px: number): Buffer => png(px, 0, () => 0x80);

/** A square PNG of noise: px × px × 4 bytes or a little more, whatever deflate does. */
export function noisePng(px: number, seed = 1): Buffer {
  let s = seed;
  return png(px, 6, () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s >>> 24;
  });
}
