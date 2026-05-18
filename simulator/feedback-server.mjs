// Tiny feedback receiver — listens on :4567, writes to feedback-inbox.json
// Usage: node feedback-server.mjs

import { createServer } from 'http';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const PORT = 4567;
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'feedback-inbox.json');

if (!existsSync(FILE)) writeFileSync(FILE, '[]', 'utf8');

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/feedback') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const entry = { ...JSON.parse(body), receivedAt: new Date().toISOString() };
        const list = JSON.parse(readFileSync(FILE, 'utf8'));
        list.push(entry);
        writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
        console.log(`[feedback] ${entry.category}: ${entry.text?.slice(0, 80)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400); res.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => console.log(`[feedback-server] http://localhost:${PORT}`));
