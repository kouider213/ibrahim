import http from 'http';
import { globeData } from './integrations/globe-data.js';
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const u = new URL(req.url!, 'http://x'); const kind = u.pathname.split('/').pop()!;
  try { const r = await globeData(kind, Object.fromEntries(u.searchParams)); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(r)); }
  catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: String(e) })); }
}).listen(5199);
