/**
 * CoreRouter — Phase 3
 * Routes each request to the right specialized agent.
 * Falls back to full tool set if no agent matches.
 */
import { AGENT_REGISTRY, AGENT_MAP, type AgentDefinition } from './agent-registry.js';
import { Dzaryx_TOOLS } from '../integrations/tools.js';
import type { Message } from '../integrations/claude-api.js';

// ── Route decision ─────────────────────────────────────────────────────────────
export interface AgentRoute {
  agent:      AgentDefinition | null;  // null = use full tool set (general)
  agentTools: typeof Dzaryx_TOOLS;
  label:      string;
}

// Mails : seul l'agent Général a list_emails/read_email/send_email. Sans ce raccourci,
// « dis-moi si j'ai reçu un email » partait en Finance (« reçu ») → « pas d'accès à ta messagerie ».
const MAIL_RE = /\b(e-?mails?|mails?|gmail|courriels?|bo[iî]te\s+(?:mail|de\s+r[eé]ception)|pi[eè]ces?\s+jointes?|PJ)\b/i;

// Outils toujours disponibles, quel que soit l'agent : retrouver ce qu'on s'est dit, rappels d'événement,
// mode privé / mémoire (« quel prix j'avais donné à Karim » peut partir en Finance → il lui faut search_conversations).
const ALWAYS_TOOLS = ['search_conversations', 'create_intention', 'list_intentions', 'set_private_mode', 'show_my_memory',
  'assign_task', 'complete_task', 'list_team_tasks', 'save_procedure', 'create_goal',
  'browser_task', 'browser_reply', 'browser_status',
  // Mails partout : « envoie-moi le reçu Anthropic » part en Finance (« reçu ») sans le mot « mail » → sinon il passait par le navigateur
  'list_emails', 'read_email', 'read_email_thread', 'read_email_attachment', 'manage_emails', 'draft_email', 'send_email', 'connect_gmail',
  // « fais un document sur toi » part souvent vers l'Agent Clients (mot « document ») : docs + vraie liste partout
  'list_my_capabilities', 'business_mentor', 'kouider_dossier', 'life_coach', 'family_care', 'papa_time', 'whatsapp_web', 'run_self_test', 'get_upcoming_seasons', 'cloud_pc', 'watch_page', 'web_routine', 'air_algerie_search', 'air_algerie_watch', 'gold_watch', 'create_google_doc', 'send_doc_pdf', 'business_simulator', 'partners', 'create_google_sheet', 'create_presentation_doc', 'create_demo_site', 'get_demo_site', 'carte_live_demo_link', 'create_client_site', 'manage_client_site',
  // « à quelle heure j'arrive à la salle avec la voiture ? » part vers l'Agent Réservations (mot « voiture ») : position live + trafic partout
  'get_my_location', 'get_travel_time', 'morning_routine', 'sport_coach', 'gps_assistant', 'travel', 'list_agenda_events', 'update_agenda_event'];
export const withAlways = (names: string[]) => Dzaryx_TOOLS.filter(t => names.includes(t.name) || ALWAYS_TOOLS.includes(t.name));

export function routeToAgent(text: string): AgentRoute {
  if (MAIL_RE.test(text)) {
    const general = AGENT_MAP.get('general');
    if (general) {
      const agentTools = withAlways(general.toolNames);
      console.log(`[core-router] → ${general.name} (mail, ${agentTools.length} tools)`);
      return { agent: general, agentTools, label: general.name };
    }
  }
  // Check agents in priority order
  for (const agent of AGENT_REGISTRY) {
    if (agent.keywords.test(text)) {
      const agentTools = withAlways(agent.toolNames);
      console.log(`[core-router] → ${agent.name} (${agentTools.length} tools)`);
      return { agent, agentTools, label: agent.name };
    }
  }

  // No match → general agent with all tools
  console.log(`[core-router] → General (${Dzaryx_TOOLS.length} tools)`);
  return { agent: null, agentTools: Dzaryx_TOOLS, label: '🤖 Dzaryx' };
}

// ── Force route to a specific agent by id ────────────────────────────────────
export function forceAgent(agentId: string): AgentRoute {
  const agent = AGENT_MAP.get(agentId) ?? null;
  if (!agent) return { agent: null, agentTools: Dzaryx_TOOLS, label: '🤖 Dzaryx' };
  const agentTools = withAlways(agent.toolNames);
  return { agent, agentTools, label: agent.name };
}

// ── Build systemExtra for a routed agent ─────────────────────────────────────
export function buildAgentSystem(route: AgentRoute, baseExtra?: string): string {
  const parts: string[] = [];
  if (route.agent?.systemExtra) parts.push(route.agent.systemExtra);
  if (baseExtra) parts.push(baseExtra);
  return parts.join('\n\n');
}

// ── Detect if message references a previous agent context ────────────────────
export function detectAgentFromHistory(messages: Message[]): AgentDefinition | null {
  // Look at last 8 messages (user + assistant) to infer active domain
  // User messages matter: "Créer une réservation" sets context even if
  // the assistant follow-up asks "quel âge?" (no booking keywords in assistant text)
  const recent = [...messages]
    .slice(-8)
    .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).slice(0, 300));

  const combined = recent.join(' ');
  for (const agent of AGENT_REGISTRY) {
    if (agent.keywords.test(combined)) return agent;
  }
  return null;
}
