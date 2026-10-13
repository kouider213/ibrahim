import { randomUUID } from 'crypto';
import { Cron } from 'croner';
import { kvGet, kvSet, claimJobRun } from './app-store.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// Missions permanentes (idée reprise d'OpenClaw « standing orders ») : Kouider confie une mission à la voix
// (« chaque lundi à 9h, regarde les prix des loueurs concurrents à Oran et dis-moi si je suis trop cher »).
// Dzaryx l'exécute seul à l'heure dite avec des outils de LECTURE seulement (readonly-agent) : il ne modifie
// et n'envoie rien, il rapporte et propose. Résultat → notif (et appel si demandé ou si c'est important).
// Stockage : app_kv `missions` (liste JSON). Vérification toutes les 5 min (job `missions`).

export type MissionDelivery = 'notif' | 'call' | 'call_if_important';
export interface Mission {
  id: string;
  title: string;
  instruction: string;
  cron: string;            // 5 champs, heure de Bruxelles
  when: string;            // en clair : « chaque lundi à 9h »
  delivery: MissionDelivery;
  always_report: boolean;  // false = silence quand il n'y a rien à signaler
  active: boolean;
  owner: 'kouider' | 'houari';
  created_at: string;
  last_run?: string;
  last_result?: string;
}

const KEY = 'missions';
const TZ = 'Europe/Brussels';
const MAX_MISSIONS = 15;
const MIN_INTERVAL_MS = 55 * 60_000;   // pas plus d'une exécution par heure

export async function loadMissions(): Promise<Mission[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Mission[]; } catch { return []; }
}
async function saveMissions(list: Mission[]): Promise<void> {
  await kvSet(KEY, JSON.stringify(list));
}

function checkCron(cron: string): string | null {
  try {
    const c = new Cron(cron, { timezone: TZ, paused: true });
    const [a, b] = c.nextRuns(2);
    c.stop();
    if (!a || !b) return 'horaire invalide';
    if (b.getTime() - a.getTime() < MIN_INTERVAL_MS) return 'pas plus d\'une fois par heure';
    return null;
  } catch (err) {
    return `horaire invalide (${err instanceof Error ? err.message : String(err)})`;
  }
}

function nextRunText(cron: string): string {
  const c = new Cron(cron, { timezone: TZ, paused: true });
  const n = c.nextRun();
  c.stop();
  return n ? n.toLocaleString('fr-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '?';
}

function find(list: Mission[], ref: string): Mission | undefined {
  const r = ref.trim().toLowerCase();
  return list.find(m => m.id === ref) ?? list.find(m => m.title.toLowerCase() === r)
    ?? list.find(m => m.title.toLowerCase().includes(r) || m.instruction.toLowerCase().includes(r));
}

// ── Outils ────────────────────────────────────────────────────────────────────
export async function createMissionTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const instruction = String(input['instruction'] ?? '').trim();
  const cron = String(input['cron'] ?? '').trim();
  const when = String(input['when'] ?? '').trim();
  if (!instruction || !cron || !when) return '❌ instruction, cron et when requis.';
  const bad = checkCron(cron);
  if (bad) return `❌ ${bad}. Exemple : « 0 9 * * 1 » = chaque lundi à 9h.`;
  const list = await loadMissions();
  if (list.filter(m => m.active).length >= MAX_MISSIONS) return `❌ Déjà ${MAX_MISSIONS} missions actives : arrêtes-en une d'abord.`;
  const delivery = (['notif', 'call', 'call_if_important'].includes(String(input['delivery'])) ? input['delivery'] : 'call_if_important') as MissionDelivery;
  const m: Mission = {
    id: randomUUID().slice(0, 8),
    title: String(input['title'] ?? instruction.slice(0, 50)).trim(),
    instruction, cron, when, delivery,
    always_report: input['always_report'] === true,
    active: true,
    owner: sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider',
    created_at: new Date().toISOString(),
  };
  list.push(m);
  await saveMissions(list);
  const how = { notif: 'par notification', call: 'par appel', call_if_important: 'par notification, et par appel si c\'est important' }[delivery];
  return `✅ Mission « ${m.title} » créée : ${when} (prochaine fois : ${nextRunText(cron)}). Je te réponds ${how}`
    + `${m.always_report ? '' : ', seulement s\'il y a quelque chose à signaler'}. Je ne modifie et n'envoie rien tout seul : je rapporte et je propose.`;
}

export async function listMissionsTool(): Promise<string> {
  const list = await loadMissions();
  if (!list.length) return 'Aucune mission permanente. Exemple : « chaque lundi à 9h, regarde les prix des concurrents ».';
  return list.map(m => `${m.active ? '🟢' : '⏸️'} ${m.title} — ${m.when}${m.active ? ` (prochaine : ${nextRunText(m.cron)})` : ' (en pause)'}`
    + `${m.last_run ? `\n   Dernière fois ${new Date(m.last_run).toLocaleString('fr-BE', { timeZone: TZ })} : ${(m.last_result ?? '').slice(0, 160)}` : ''}`).join('\n');
}

export async function updateMissionTool(input: Record<string, unknown>): Promise<string> {
  const list = await loadMissions();
  const m = find(list, String(input['mission'] ?? ''));
  if (!m) return `❌ Mission introuvable. Missions : ${list.map(x => x.title).join(', ') || 'aucune'}.`;
  if (input['delete'] === true) {
    await saveMissions(list.filter(x => x.id !== m.id));
    return `🗑️ Mission « ${m.title} » supprimée.`;
  }
  if (typeof input['cron'] === 'string') {
    const bad = checkCron(input['cron']);
    if (bad) return `❌ ${bad}.`;
    m.cron = input['cron'];
    m.when = String(input['when'] ?? m.when);
  }
  if (typeof input['instruction'] === 'string') m.instruction = input['instruction'];
  if (typeof input['active'] === 'boolean') m.active = input['active'];
  if (typeof input['always_report'] === 'boolean') m.always_report = input['always_report'];
  if (['notif', 'call', 'call_if_important'].includes(String(input['delivery']))) m.delivery = input['delivery'] as MissionDelivery;
  await saveMissions(list);
  return `✅ Mission « ${m.title} » : ${m.active ? `active, ${m.when}` : 'en pause'}.`;
}

export async function runMissionNowTool(input: Record<string, unknown>): Promise<string> {
  const list = await loadMissions();
  const m = find(list, String(input['mission'] ?? ''));
  if (!m) return '❌ Mission introuvable.';
  const r = await executeMission(m, true);
  return r ?? 'Rien à signaler.';
}

// ── Exécution ─────────────────────────────────────────────────────────────────
const MISSION_SYSTEM =
  'Tu exécutes une MISSION PERMANENTE confiée par Kouider. Fais-la vraiment avec tes outils (recherche web, ' +
  'réservations, finances, flotte, mails pro, agenda, prospects…), puis réponds avec ce format EXACT :\n' +
  'IMPORTANT: oui|non   (oui seulement si Kouider doit agir ou décider vite)\n' +
  'ORAL: 1 ou 2 phrases courtes à dire au téléphone, sans chiffre inutile, sans emoji\n' +
  'DÉTAIL: le rapport complet, concret, avec tes propositions d\'action\n' +
  'S\'il n\'y a vraiment rien à signaler, réponds seulement : RIEN À SIGNALER — et une demi-phrase.';

/** Renvoie le texte envoyé à Kouider (ou null si rien à signaler et silence demandé). */
export async function executeMission(m: Mission, manual = false): Promise<string | null> {
  const { text } = await runReadOnlyAgent(
    `MISSION « ${m.title} » (${m.when}) :\n${m.instruction}\n\nDate et heure : ${new Date().toLocaleString('fr-BE', { timeZone: TZ })}.`,
    { system: MISSION_SYSTEM, sessionId: `mission_${m.id}`, maxRounds: 10, maxTokens: 2000 },
  );
  const list = await loadMissions();
  const cur = list.find(x => x.id === m.id);
  if (cur) { cur.last_run = new Date().toISOString(); cur.last_result = text.slice(0, 500); await saveMissions(list); }

  const nothing = /^RIEN\s+[ÀA]\s+SIGNALER/i.test(text.trim());
  if (nothing && !m.always_report && !manual) { console.log(`[missions] ${m.title} : rien à signaler`); return null; }
  const important = /IMPORTANT:\s*oui/i.test(text);
  const oral = text.match(/ORAL:\s*(.+)/i)?.[1]?.trim();
  const detail = text.match(/DÉTAIL:\s*([\s\S]+)/i)?.[1]?.trim() ?? text.replace(/^IMPORTANT:.*$/im, '').replace(/^ORAL:.*$/im, '').trim();
  const msg = `🎯 Mission « ${m.title} »\n\n${detail}`;
  if (!manual) {
    emitProactive(`🎯 ${m.title} : ${(oral ?? detail).slice(0, 140)}`, important ? 'alert' : 'info', msg, m.owner);
    if (m.owner === 'kouider' && oral && (m.delivery === 'call' || (m.delivery === 'call_if_important' && important))) {
      const day = new Date().toISOString().slice(0, 13);
      await autoCall(`mission:${m.id}:${day}`, `Mission ${m.title}. ${oral}`);
    }
  }
  return msg;
}

/** Job toutes les 5 min : exécute les missions dont l'heure est passée depuis la dernière exécution. */
export async function jobMissions(): Promise<void> {
  const now = Date.now();
  for (const m of (await loadMissions()).filter(x => x.active)) {
    try {
      const c = new Cron(m.cron, { timezone: TZ, paused: true });
      const due = c.nextRun(new Date(m.last_run ?? m.created_at));
      c.stop();
      if (!due || due.getTime() > now) continue;
      if (now - due.getTime() > 6 * 3_600_000) {      // serveur arrêté longtemps : on saute, pas de rattrapage en rafale
        const list = await loadMissions();
        const cur = list.find(x => x.id === m.id);
        if (cur) { cur.last_run = new Date().toISOString(); await saveMissions(list); }
        continue;
      }
      if (!(await claimJobRun(`mission:${m.id}`, due.toISOString().slice(0, 16)).catch(() => true))) continue;
      console.log(`[missions] ▶ ${m.title}`);
      await executeMission(m);
    } catch (err) {
      console.error(`[missions] ${m.title}:`, err instanceof Error ? err.message : err);
    }
  }
}
