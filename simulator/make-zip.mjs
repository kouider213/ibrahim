// Creates a zip with POSIX paths (forward slashes) for Netlify
import { createWriteStream, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dir, 'dist');
const outZip = join(__dir, 'dist.zip');

// Minimal ZIP implementation using Node.js built-ins
// Uses archiver-like approach with zlib deflate

import { deflateRawSync } from 'zlib';

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function writeUint32LE(buf, val, off) {
  buf[off] = val & 0xFF; buf[off+1] = (val>>8)&0xFF; buf[off+2] = (val>>16)&0xFF; buf[off+3] = (val>>24)&0xFF;
}
function writeUint16LE(buf, val, off) {
  buf[off] = val & 0xFF; buf[off+1] = (val>>8)&0xFF;
}

function getAllFiles(dir) {
  const files = [];
  function walk(d) {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(dir);
  return files;
}

const files = getAllFiles(distDir);
const entries = [];

for (const filePath of files) {
  const relPath = relative(distDir, filePath).replace(/\\/g, '/'); // POSIX path
  const data = readFileSync(filePath);
  const compressed = deflateRawSync(data, { level: 9 });
  const useDeflate = compressed.length < data.length;
  const fileData = useDeflate ? compressed : data;
  const crc = crc32(data);
  const nameBytes = Buffer.from(relPath, 'utf8');

  // Local file header
  const localHeader = Buffer.alloc(30 + nameBytes.length);
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  writeUint16LE(localHeader, 20, 4);  // version needed
  writeUint16LE(localHeader, 0, 6);   // flags
  writeUint16LE(localHeader, useDeflate ? 8 : 0, 8); // compression
  writeUint16LE(localHeader, 0, 10);  // mod time
  writeUint16LE(localHeader, 0, 12);  // mod date
  writeUint32LE(localHeader, crc, 14);
  writeUint32LE(localHeader, fileData.length, 18);
  writeUint32LE(localHeader, data.length, 22);
  writeUint16LE(localHeader, nameBytes.length, 26);
  writeUint16LE(localHeader, 0, 28);
  nameBytes.copy(localHeader, 30);

  entries.push({ relPath, nameBytes, localHeader, fileData, crc, compSize: fileData.length, origSize: data.length, useDeflate });
}

// Build ZIP
const chunks = [];
const offsets = [];
let offset = 0;

for (const e of entries) {
  offsets.push(offset);
  chunks.push(e.localHeader);
  chunks.push(e.fileData);
  offset += e.localHeader.length + e.fileData.length;
}

// Central directory
const cdChunks = [];
let cdSize = 0;

for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  const cd = Buffer.alloc(46 + e.nameBytes.length);
  cd.writeUInt32LE(0x02014b50, 0); // central dir signature
  writeUint16LE(cd, 20, 4);   // version made by
  writeUint16LE(cd, 20, 6);   // version needed
  writeUint16LE(cd, 0, 8);    // flags
  writeUint16LE(cd, e.useDeflate ? 8 : 0, 10); // compression
  writeUint16LE(cd, 0, 12);   // mod time
  writeUint16LE(cd, 0, 14);   // mod date
  writeUint32LE(cd, e.crc, 16);
  writeUint32LE(cd, e.compSize, 20);
  writeUint32LE(cd, e.origSize, 24);
  writeUint16LE(cd, e.nameBytes.length, 28);
  writeUint16LE(cd, 0, 30);   // extra length
  writeUint16LE(cd, 0, 32);   // comment length
  writeUint16LE(cd, 0, 34);   // disk start
  writeUint16LE(cd, 0, 36);   // internal attrs
  writeUint32LE(cd, 0, 38);   // external attrs
  writeUint32LE(cd, offsets[i], 42); // local header offset
  e.nameBytes.copy(cd, 46);
  cdChunks.push(cd);
  cdSize += cd.length;
}

// EOCD
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
writeUint16LE(eocd, 0, 4);
writeUint16LE(eocd, 0, 6);
writeUint16LE(eocd, entries.length, 8);
writeUint16LE(eocd, entries.length, 10);
writeUint32LE(eocd, cdSize, 12);
writeUint32LE(eocd, offset, 16);
writeUint16LE(eocd, 0, 20);

const out = Buffer.concat([...chunks, ...cdChunks, eocd]);
import { writeFileSync } from 'fs';
writeFileSync(outZip, out);
console.log(`ZIP created: ${outZip} (${(out.length/1024).toFixed(1)} KB, ${entries.length} files)`);
for (const e of entries) console.log(' /', e.relPath);
