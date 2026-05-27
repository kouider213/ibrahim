#!/usr/bin/env node
/**
 * Generates PWA icons for the simulator.
 * No external dependencies — uses Node built-in zlib.
 */
import { deflateSync, createDeflate } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../simulator/public/icons');
mkdirSync(OUT, { recursive: true });

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size) {
  // Draw a dark icon with cyan "D" letter feel (solid fill + border circle)
  // RGBA color type (6)
  const pixels = Buffer.allocUnsafe(size * size * 4);

  const cx = size / 2, cy = size / 2, r = size / 2;
  const innerR = r - size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist > r) {
        // Transparent outside circle
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0;
      } else if (dist > innerR) {
        // Cyan border ring
        pixels[idx] = 0; pixels[idx+1] = 212; pixels[idx+2] = 255; pixels[idx+3] = 255;
      } else {
        // Dark background #0a0f1a
        pixels[idx] = 10; pixels[idx+1] = 15; pixels[idx+2] = 26; pixels[idx+3] = 255;
      }
    }
  }

  // Draw a stylized "D" in the center using cyan
  const letterH = size * 0.5, letterW = size * 0.28;
  const lx = cx - letterW * 0.4, ly = cy - letterH / 2;
  const thickness = size * 0.07;
  const dr = letterH * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > innerR) continue;

      const idx = (y * size + x) * 4;

      // Vertical bar of D
      if (x >= lx && x <= lx + thickness && y >= ly && y <= ly + letterH) {
        pixels[idx] = 0; pixels[idx+1] = 212; pixels[idx+2] = 255; pixels[idx+3] = 255;
        continue;
      }

      // Top bar
      if (y >= ly && y <= ly + thickness && x >= lx && x <= cx + letterW * 0.2) {
        pixels[idx] = 0; pixels[idx+1] = 212; pixels[idx+2] = 255; pixels[idx+3] = 255;
        continue;
      }

      // Bottom bar
      if (y >= ly + letterH - thickness && y <= ly + letterH && x >= lx && x <= cx + letterW * 0.2) {
        pixels[idx] = 0; pixels[idx+1] = 212; pixels[idx+2] = 255; pixels[idx+3] = 255;
        continue;
      }

      // Right curve of D (arc)
      const rdx = x - (lx + thickness / 2);
      const rdy = y - cy;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
      if (rdist >= dr - thickness * 0.8 && rdist <= dr + thickness * 0.3 && rdx > 0) {
        pixels[idx] = 0; pixels[idx+1] = 212; pixels[idx+2] = 255; pixels[idx+3] = 255;
      }
    }
  }

  // Build PNG
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Build raw scanlines with filter byte 0
  const raw = Buffer.allocUnsafe(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    pixels.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = deflateSync(raw);

  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const png = makePNG(size);
  writeFileSync(path.join(OUT, `icon-${size}.png`), png);
  console.log(`✅ icon-${size}.png (${png.length} bytes)`);
}

console.log('Icons generated in simulator/public/icons/');
