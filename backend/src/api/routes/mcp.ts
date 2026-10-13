import { Router, type Request, type Response, type NextFunction } from 'express';
import { extractBearerToken, validateToken, identifyMobileActor } from '../../auth/tokens.js';
import { executeTool } from '../../integrations/tool-executor.js';
import { Dzaryx_TOOLS } from '../../integrations/tools.js';
import { READ_TOOLS } from '../../integrations/readonly-agent.js';

// Outils Dzaryx pour d'autres IA (Claude Code, Cursor, Claude Desktop…) via le serveur MCP de Nexus
// (nexus/mcp_server.py). Idée reprise de bertrandmbanwi/Jarvis (MCP serveur).
// LECTURE SEULE : aucune écriture, aucun envoi, aucune exécution par cette porte. Les actions passent
// toujours par Dzaryx (app, Telegram, appel) avec ses confirmations.

// Liste blanche partagée avec les missions et la préparation de RDV : integrations/readonly-agent.ts

// Kouider seulement : token mobile de Kouider ou token de l'agent PC (Nexus)
function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) { res.status(401).json({ error: 'Missing authorization token' }); return; }
  if (validateToken(token, 'pc-agent') || identifyMobileActor(token)?.id === 'kouider') { next(); return; }
  res.status(403).json({ error: 'Invalid token' });
}

const router = Router();

// GET /api/mcp/tools — outils en lecture seule
router.get('/tools', requireOwner, (_req, res) => {
  const tools = Dzaryx_TOOLS
    .filter(t => READ_TOOLS.has(t.name))
    .map(t => ({ name: t.name, description: t.description ?? '', input_schema: t.input_schema }));
  res.json({ tools });
});

// POST /api/mcp/call { name, input } — uniquement un outil de READ_TOOLS
router.post('/call', requireOwner, async (req, res) => {
  const { name, input } = req.body as { name?: string; input?: Record<string, unknown> };
  if (!name || !READ_TOOLS.has(name)) { res.status(400).json({ error: 'tool not allowed (read-only)' }); return; }
  try {
    const out = await executeTool(name, input ?? {}, 'mcp_kouider');
    res.json({ text: out.slice(0, 20000) });
  } catch (err) {
    console.error('[mcp] call:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'tool failed' });
  }
});

export default router;
