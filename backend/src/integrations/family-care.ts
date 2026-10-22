import { kvGet, kvSet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { setHardDay } from './kouider-dossier.js';

// SOIN DE LA FAMILLE (Kouider 22/10, après une nuit aux urgences avec son fils) :
// - carnet santé de la famille (date, symptômes, ce qu'ont dit les médecins) → tout l'historique à montrer au pédiatre ;
// - rappel de contrôle (« prendre RDV chez le pédiatre ») quelques jours après ;
// - « journée dure » : tout s'allège pour la journée (voir kouider-dossier.isHardDay) ;
// - urgence avec un enfant : numéros utiles + pharmacies proches sur Telegram.
// VIE PRIVÉE : dépôt PUBLIC → aucun prénom ni info santé ici, tout est dans app_kv `kouider:family:health`.

const KEY = 'kouider:family:health';
interface HealthEntry { date: string; who: string; what: string; outcome?: string }

async function readCarnet(): Promise<HealthEntry[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as HealthEntry[]; } catch { return []; }
}

const fmt = (e: HealthEntry) => `• ${e.date.split('-').reverse().join('/')} — ${e.who} : ${e.what}${e.outcome ? `\n  → ${e.outcome}` : ''}`;

const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Belgique (Kouider vit à Bruxelles). Numéros publics.
const URGENCE_NUMBERS = [
  '🚑 112 — urgence vitale (respire mal, lèvres bleues, ne réagit plus, convulsions)',
  '🩺 1733 — médecin de garde (nuit, week-end)',
  '💊 0903 99 000 ou pharmacie.be — pharmacie de garde',
  '☠️ 070 245 245 — Centre Antipoisons (24h/24, gratuit)',
];

export async function familyCareTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'list');
  const today = localNow().date;

  if (action === 'add') {
    const who = String(input['who'] ?? '').trim(), what = String(input['what'] ?? '').trim();
    if (!who || !what) return '❌ Pour qui, et qu\'est-ce qui s\'est passé ?';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : today;
    const outcome = String(input['outcome'] ?? '').trim();
    const carnet = await readCarnet();
    carnet.push({ date, who: who.slice(0, 40), what: what.slice(0, 300), ...(outcome ? { outcome: outcome.slice(0, 300) } : {}) });
    carnet.sort((a, b) => a.date.localeCompare(b.date));
    await kvSet(KEY, JSON.stringify(carnet.slice(-200)));
    let rem = '';
    const days = Number(input['followup_days']);
    if (days >= 1 && days <= 30) {
      // Samedi / dimanche → lundi : le pédiatre ne répond pas le week-end
      let day = plusDays(today, days);
      const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (wd === 6 || wd === 0) day = plusDays(day, wd === 6 ? 2 : 1);
      const { executeTool } = await import('./tool-executor.js');
      const r = await executeTool('schedule_reminder', {
        message: `🩺 Pense à prendre RDV chez le médecin / pédiatre pour ${who} (contrôle après : ${what.slice(0, 80)}). Je peux te sortir le carnet santé pour le RDV.`,
        at_date: day, at_time: '10:00',
      }, sessionId ?? 'voice_kouider').catch(() => '');
      rem = /error|❌/i.test(String(r)) ? ' Rappel de contrôle PAS programmé (erreur).' : ` Rappel « prendre RDV » programmé le ${day.split('-').reverse().join('/')} à 10h.`;
    }
    return `✅ Noté dans le carnet santé (privé).${rem}`;
  }

  if (action === 'list') {
    const who = String(input['who'] ?? '').trim().toLowerCase();
    const list = (await readCarnet()).filter(e => !who || e.who.toLowerCase().includes(who));
    if (!list.length) return 'Carnet santé vide pour l\'instant.';
    const text = `📒 Carnet santé${who ? ` — ${input['who']}` : ''}\n\n${list.slice(-30).map(fmt).join('\n')}`;
    if (input['send'] === true) await queueTelegramMessage(text);
    return input['send'] === true ? `${text}\n\n(envoyé sur Telegram)` : text;
  }

  if (action === 'hard_day') {
    const off = input['off'] === true;
    await setHardDay(!off, String(input['why'] ?? ''));
    return off
      ? '✅ Journée normale : tout reprend comme d\'habitude.'
      : '✅ Journée dure activée pour aujourd\'hui : pas de conseiller business ni de prospection, appels non urgents gardés pour demain, récap réduit à l\'urgent. Propose-lui de décaler ce qui peut l\'être (agenda).';
  }

  if (action === 'urgence') {
    const { getLocation } = await import('./location.js');
    const { nearby } = await import('./presence.js');
    const loc = await getLocation('kouider').catch(() => null);
    const fresh = loc && Date.now() - Date.parse(loc.updated_at) < 60 * 60_000 ? { lat: loc.lat, lng: loc.lng } : null;
    const pharma = fresh ? await nearby('pharmacie', fresh).catch(() => '') : '';
    const text = [`🆘 Numéros utiles\n${URGENCE_NUMBERS.join('\n')}`,
      pharma ? `\n💊 Pharmacies près de toi (vérifie la garde sur pharmacie.be) :\n${pharma}` : '',
      '\nSi ton enfant respire mal, a les lèvres bleues ou ne réagit plus : appelle le 112 tout de suite.'].filter(Boolean).join('\n');
    await queueTelegramMessage(text);
    return `✅ Envoyé sur Telegram :\n${text}`;
  }

  return '❌ Action inconnue (add, list, hard_day, urgence).';
}
