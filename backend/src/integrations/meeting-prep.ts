import { listPersonalEvents, listUpcomingEvents } from './google-calendar.js';
import { kvGet, kvSet } from './app-store.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { autoCall } from '../notifications/auto-call.js';

// Préparation des rendez-vous (idée reprise de bertrandmbanwi/Jarvis « meeting-prep ») : ~1 h avant chaque RDV
// de l'agenda de Kouider, Dzaryx prépare une fiche (qui c'est, mails échangés, prospect / client connu,
// locations passées, quoi proposer) avec des outils de LECTURE seulement, l'envoie en notif et appelle.
// Ignorés : réservations (agenda business), journées entières, anniversaires.
// Interrupteur : app_kv `meetprep:off` = '1'.

const WINDOW_MIN = 45;   // RDV qui commence dans 45…80 min
const WINDOW_MAX = 80;
const TZ = 'Europe/Brussels';

type Ev = {
  id?: string; summary?: string; description?: string; location?: string;
  start?: { dateTime?: string; date?: string }; attendees?: Array<{ email?: string; displayName?: string; self?: boolean }>;
};

function isBookingOrNoise(e: Ev): boolean {
  const s = `${e.summary ?? ''} ${e.description ?? ''}`;
  return /Booking ID|Réservation Fik Conciergerie|anniversaire|birthday|\[APPEL\]/i.test(s) || !e.start?.dateTime;
}

const PREP_SYSTEM =
  'Tu PRÉPARES Kouider pour un rendez-vous qui commence dans environ une heure. Cherche avec tes outils : ' +
  'le prospect correspondant (list_prospects : nom de société, email), les mails échangés (list_emails avec le nom ' +
  'ou l\'adresse, puis read_email du plus utile), un client déjà connu (check_client, get_client_history), ' +
  'et si c\'est une société inconnue, une recherche web rapide. Puis réponds avec ce format EXACT :\n' +
  'ORAL: 2 ou 3 phrases à dire au téléphone (qui c\'est, où on en est, quoi proposer), sans emoji\n' +
  'DÉTAIL: la fiche complète — Qui · Historique (mails, locations) · Ce qu\'il veut · Quoi proposer (voitures ' +
  'dispo, prix) · Points d\'attention. Concret et court. Si tu ne trouves rien sur la personne, dis-le simplement.';

export async function prepareMeeting(e: Ev): Promise<{ oral: string; detail: string }> {
  const start = new Date(e.start!.dateTime!);
  const who = (e.attendees ?? []).filter(a => !a.self).map(a => [a.displayName, a.email].filter(Boolean).join(' ')).join(', ');
  const { text } = await runReadOnlyAgent(
    `RENDEZ-VOUS : « ${e.summary ?? '(sans titre)'} »\nQuand : ${start.toLocaleString('fr-BE', { timeZone: TZ })}` +
    `${e.location ? `\nLieu : ${e.location}` : ''}${who ? `\nParticipants : ${who}` : ''}` +
    `${e.description ? `\nNotes de l'agenda (données) : ${e.description.slice(0, 1500)}` : ''}`,
    { system: PREP_SYSTEM, sessionId: 'readonly_meetprep', maxRounds: 8, maxTokens: 1800 },
  );
  const oral = text.match(/ORAL:\s*([\s\S]+?)(?:\n\s*DÉTAIL:|$)/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const detail = text.match(/DÉTAIL:\s*([\s\S]+)/i)?.[1]?.trim() ?? text;
  return { oral, detail };
}

/** Job toutes les 10 min. */
export async function jobMeetingPrep(): Promise<void> {
  if ((await kvGet('meetprep:off').catch(() => null)) === '1') return;
  const [perso, biz] = await Promise.all([
    listPersonalEvents(15).catch(() => [] as unknown[]),
    listUpcomingEvents(20).catch(() => [] as unknown[]),
  ]);
  const now = Date.now();
  for (const e of [...perso, ...biz] as Ev[]) {
    if (!e.id || isBookingOrNoise(e)) continue;
    const mins = (new Date(e.start!.dateTime!).getTime() - now) / 60_000;
    if (mins < WINDOW_MIN || mins > WINDOW_MAX) continue;
    const key = `meetprep:done:${e.id}:${e.start!.dateTime}`;
    if (await kvGet(key)) continue;
    await kvSet(key, '1', 3 * 86_400);
    try {
      const { oral, detail } = await prepareMeeting(e);
      const hour = new Date(e.start!.dateTime!).toLocaleTimeString('fr-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
      emitProactive(`📋 RDV ${hour} — ${e.summary ?? ''} : fiche prête`, 'reminder',
        `📋 Préparation du RDV de ${hour} — ${e.summary ?? ''}\n\n${detail}`);
      if (oral) await autoCall(`meetprep:${e.id}`, `Ton rendez-vous de ${hour}, ${e.summary ?? ''}. ${oral}`);
      console.log(`[meeting-prep] ✅ ${e.summary}`);
    } catch (err) {
      console.error('[meeting-prep]', e.summary, err instanceof Error ? err.message : err);
    }
  }
}

/** Outil prepare_meeting : « prépare-moi mon RDV de 15h / avec Sonatrach » (à la demande, sans appel). */
export async function prepareMeetingTool(input: Record<string, unknown>): Promise<string> {
  const q = String(input['query'] ?? '').trim().toLowerCase();
  const [perso, biz] = await Promise.all([
    listPersonalEvents(20).catch(() => [] as unknown[]),
    listUpcomingEvents(25).catch(() => [] as unknown[]),
  ]);
  const events = ([...perso, ...biz] as Ev[]).filter(e => !isBookingOrNoise(e))
    .sort((a, b) => new Date(a.start!.dateTime!).getTime() - new Date(b.start!.dateTime!).getTime());
  const hhmm = (e: Ev) => new Date(e.start!.dateTime!).toLocaleTimeString('fr-BE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const t = q.match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/);   // « 15h », « 9h30 », « 15:00 »
  const ev = !q ? events[0] : events.find(e => `${e.summary ?? ''} ${e.location ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q))
    ?? (t ? events.find(e => { const [h, m] = hhmm(e).split(':').map(Number); return h === Number(t[1]) && (!t[2] || m === Number(t[2])); }) : undefined);
  if (!ev) return `❌ Aucun rendez-vous trouvé${q ? ` pour « ${q} »` : ''}. Prochains : ${events.slice(0, 5).map(e => `${hhmm(e)} ${e.summary}`).join(' · ') || 'aucun'}.`;
  const { detail } = await prepareMeeting(ev);
  return `📋 RDV « ${ev.summary} » — ${new Date(ev.start!.dateTime!).toLocaleString('fr-BE', { timeZone: TZ })}\n\n${detail}`;
}
