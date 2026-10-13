import { Router, type Request, type Response, type NextFunction } from 'express';
import { extractBearerToken, validateToken, identifyMobileActor } from '../../auth/tokens.js';
import { executeTool } from '../../integrations/tool-executor.js';
import { Dzaryx_TOOLS } from '../../integrations/tools.js';

// Outils Dzaryx pour d'autres IA (Claude Code, Cursor, Claude Desktop…) via le serveur MCP de Nexus
// (nexus/mcp_server.py). Idée reprise de bertrandmbanwi/Jarvis (MCP serveur).
// LECTURE SEULE : aucune écriture, aucun envoi, aucune exécution par cette porte. Les actions passent
// toujours par Dzaryx (app, Telegram, appel) avec ses confirmations.

const READ_TOOLS = new Set([
  'list_bookings', 'get_financial_report', 'get_client_profile', 'get_client_brain', 'read_site_file',
  'recall_memory', 'get_weather', 'convert_currency', 'get_weather_alerts', 'get_football', 'get_news',
  'github_read_file', 'github_list_files', 'github_search_code', 'get_payment_status',
  'get_revenue_report', 'get_late_returns', 'get_unpaid_bookings', 'get_finance_dashboard', 'check_anomalies',
  'get_monthly_improvement_report', 'get_learning_evolution', 'get_kouider_preferences', 'check_car_availability',
  'web_search', 'search_images', 'list_personal_events', 'list_emails', 'read_email', 'list_prospects',
  'prospect_replies', 'list_calendar_events', 'get_fleet_status', 'get_car_photo', 'list_properties',
  'get_property_photo', 'list_vehicles_for_sale', 'get_vehicle_sale_photo', 'list_packs', 'list_leads',
  'get_daily_report', 'get_client_history', 'obsidian_read_client', 'obsidian_list_clients', 'obsidian_read_note',
  'health_check_all', 'get_site_analytics', 'list_reviews', 'get_travel_time', 'calculate_delivery_fee',
  'get_vehicle_states', 'get_property_states', 'list_learned_rules', 'suggest_smart_pricing', 'get_car_papers',
  'check_client', 'get_expenses', 'get_vehicle_maintenance',
]);

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
