import { randomUUID } from 'crypto';

interface PdfEntry {
  buffer: Buffer;
  filename: string;
  expiresAt: number;
}

const store = new Map<string, PdfEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

export function storePdf(buffer: Buffer, filename: string): string {
  const token = randomUUID();
  store.set(token, { buffer, filename, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getPdf(token: string): PdfEntry | null {
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { store.delete(token); return null; }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of store) { if (now > e.expiresAt) store.delete(k); }
}, 60 * 60 * 1000);
