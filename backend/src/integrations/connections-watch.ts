import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { emitProactive } from '../notifications/mobile-push.js';

// SURVEILLANCE DES CONNEXIONS (Kouider 25/10 : WhatsApp déconnecté depuis la veille et « il m'a même pas prévenu »).
// Toutes les 15 min : WhatsApp Business (PC cloud), PC cloud, service Telegram, Gmail, Agenda Google.
// Coupure → message TOUT DE SUITE (Telegram + app, sans passer par le tri anti-bruit), puis rappel toutes les 2 h
// (8h-22h) tant que ce n'est pas réparé, et « ✅ c'est revenu » à la fin. Lecture seule : rien n'est envoyé ailleurs.

interface ConnState { down?: number; fails: number; lastAlert?: number; alerts: number }
const KEY = 'conn:watch';
const REMIND_MS = 2 * 3600_000;

type Check = { id: string; label: string; every?: number; need?: number; how: string; test: () => Promise<{ ok: boolean; info?: string }> };

const CHECKS: Check[] = [
  {
    id: 'whatsapp', label: 'Ton WhatsApp Business', need: 1,
    how: 'Réponds « connecte mon WhatsApp » : je t\'envoie un code à taper dans WhatsApp Business → Paramètres → Appareils connectés → Connecter un appareil → « avec un numéro de téléphone ». Sans ça je ne vois plus tes messages clients.',
    test: async () => {
      const { isCloudPcOnline, cloudEmit } = await import('../actions/handlers/cloudpc-relay.js');
      if (isCloudPcOnline()) {
        const s = await cloudEmit<{ ok: boolean; logged_in?: boolean }>('cloud:wa', { action: 'status' }, 30_000).catch(() => null);
        if (s?.ok) { await kvSet('wa:web:logged_in', s.logged_in ? '1' : '0'); return { ok: !!s.logged_in }; }
      }
      return { ok: (await kvGet('wa:web:logged_in')) !== '0' };
    },
  },
  {
    id: 'cloudpc', label: 'Le PC cloud (WhatsApp, navigateur)', need: 2,
    how: 'Il redémarre normalement tout seul. Si ça dure, demande à Claude Code de regarder (pm2 dzaryx-cloudpc sur le VPS).',
    test: async () => ({ ok: (await import('../actions/handlers/cloudpc-relay.js')).isCloudPcOnline() }),
  },
  {
    id: 'telegram', label: 'Le service Telegram de Dzaryx (messages et appels)', need: 1,
    how: 'Je ne peux plus t\'écrire ni t\'appeler sur Telegram : demande à Claude Code de relancer « dzaryx-tg ».',
    test: async () => {
      const beat = await kvGet('tgcall:heartbeat');
      return { ok: !!beat && Date.now() - Date.parse(beat) < 12 * 60_000 };
    },
  },
  {
    id: 'gmail', label: 'Tes mails (Gmail / contact@)', every: 2 * 3600_000, need: 1,
    how: 'Dis « reconnecte mes mails » ou ouvre le lien d\'autorisation Google que je t\'envoie.',
    test: async () => {
      const { executeTool, isToolFailureResult } = await import('./tool-executor.js');
      const out = await executeTool('list_emails', { max_results: 1 }, 'conn-watch');
      return { ok: !(isToolFailureResult(out, 'list_emails') || /^❌|Il faut d'abord autoriser|reconnect|invalid_grant/i.test(out)), info: out.slice(0, 120) };
    },
  },
  {
    id: 'agenda', label: 'Ton Agenda Google', every: 2 * 3600_000, need: 1,
    how: 'Dis « reconnecte mon agenda » : sans lui, tes séances, rappels et RDV ne s\'écrivent plus.',
    test: async () => {
      const { executeTool, isToolFailureResult } = await import('./tool-executor.js');
      const out = await executeTool('list_calendar_events', {}, 'conn-watch');
      return { ok: !(isToolFailureResult(out, 'list_calendar_events') || /^❌|Il faut d'abord autoriser|reconnect|invalid_grant/i.test(out)), info: out.slice(0, 120) };
    },
  },
];

async function tell(text: string): Promise<void> {
  // Passe devant le tri anti-bruit (digest) : une coupure n'attend jamais le point de 12h30
  emitProactive(text, 'alert', undefined, 'kouider', undefined, true);
  const { queueTelegramMessage } = await import('../notifications/tg-outbox.js');
  await queueTelegramMessage(text, undefined, 'kouider', undefined, true).catch(() => {});
}

const since = (ts: number) => { const h = (Date.now() - ts) / 3600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} jours`; };

export async function jobConnectionsWatch(): Promise<string> {
  const state = JSON.parse((await kvGet(KEY)) ?? '{}') as Record<string, ConnState & { checkedAt?: number }>;
  const { hhmm } = localNow();
  const daytime = hhmm >= '08:00' && hhmm < '22:00';
  const out: string[] = [];
  for (const c of CHECKS) {
    const s = state[c.id] ?? { fails: 0, alerts: 0 };
    if (c.every && s.checkedAt && Date.now() - s.checkedAt < c.every && !s.down) continue;   // contrôles lourds : toutes les 2 h si tout va bien
    s.checkedAt = Date.now();
    const r = await Promise.race([c.test(), new Promise<{ ok: boolean }>(res => setTimeout(() => res({ ok: true }), 60_000))]).catch(() => ({ ok: true }));
    if (r.ok) {
      if (s.down && s.alerts > 0) await tell(`✅ ${c.label} : c'est reconnecté (coupé pendant ${since(s.down)}).`);
      state[c.id] = { fails: 0, alerts: 0, checkedAt: s.checkedAt };
      continue;
    }
    s.fails++;
    s.down ??= Date.now();
    out.push(c.id);
    const first = s.alerts === 0 && s.fails >= (c.need ?? 1);
    const remind = s.alerts > 0 && daytime && Date.now() - (s.lastAlert ?? 0) >= REMIND_MS;
    if (first || remind) {
      // Il se répare seul quand c'est possible (code WhatsApp, lien Google, relance côté VPS) — Kouider 27/10
      const fix = first ? await import('./guardian-ops.js').then(m => m.tryAutoRepair(c.id)).catch(() => '') : '';
      await tell(first
        ? `⚠️ ${c.label} est déconnecté.\n${fix || c.how}`
        : `🔔 Rappel : ${c.label} est toujours déconnecté (depuis ${since(s.down)}).\n${c.how}`);
      s.alerts++; s.lastAlert = Date.now();
    }
    state[c.id] = s;
  }
  await kvSet(KEY, JSON.stringify(state));
  return out.length ? `coupé : ${out.join(', ')}` : 'tout est connecté';
}

/** Pour le dossier de Dzaryx : ce qui est coupé en ce moment (il le dit quand Kouider parle d'un sujet lié). */
export async function connectionsText(): Promise<string> {
  const state = JSON.parse((await kvGet(KEY)) ?? '{}') as Record<string, ConnState>;
  const down = CHECKS.filter(c => state[c.id]?.down && (state[c.id]?.fails ?? 0) >= (c.need ?? 1));
  return down.length ? `CONNEXIONS COUPÉES EN CE MOMENT (rappelle-le-lui s'il parle de ça, et propose de réparer) : ${down.map(c => `${c.label} depuis ${since(state[c.id]!.down!)} — ${c.how}`).join(' | ')}` : '';
}
