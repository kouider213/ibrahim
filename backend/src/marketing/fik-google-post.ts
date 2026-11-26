// 26/11 Kouider « rajoute-les tous » : chaque semaine, la mise à jour de la fiche Google Maps de FIK (comme le pack visibilité
// de FIK Sites, mais pour FIK). Une fiche active (posts récents + photos) remonte dans « location voiture Oran aéroport ».
// Dzaryx n'a pas accès à la fiche : il envoie sur Telegram le texte prêt à coller + la vraie photo de la voiture du jour.
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropic, QUALITY } from '../integrations/anthropic-compat.js';
import { supabase } from '../integrations/supabase.js';
import { kvGet, kvSet } from '../integrations/app-store.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

const HIST = 'gbp:fik:history';   // [{ car, theme, at }] — on ne refait pas la même voiture / le même sujet
type Memo = { car: string; theme: string; at: string };

export async function fikGooglePost(send = true): Promise<string> {
  const history = JSON.parse((await kvGet(HIST).catch(() => null)) ?? '[]') as Memo[];
  const { data } = await supabase.from('cars').select('name, category, seats, fuel, transmission, resale_price, currency, image_url').not('image_url', 'is', null);
  const cars = ((data ?? []) as Array<{ name: string; category: string | null; seats: number | null; fuel: string | null; transmission: string | null; resale_price: number | null; currency: string | null; image_url: string }>);
  if (!cars.length) return '❌ Aucune voiture avec photo.';
  const recent = history.slice(0, Math.min(history.length, Math.max(0, cars.length - 1))).map(h => h.car);
  const car = cars.find(c => !recent.includes(c.name)) ?? cars[0]!;
  const { momentOfYear } = await import('./tiktok-pub.js');
  const moment = momentOfYear();
  const cond = await import('../integrations/night-guard.js').then(m => m.exactConditions()).catch(() => '');
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Algiers', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const user = [
    `Agence : FIK Conciergerie — location de voitures à Oran, remise et retour à l'aéroport d'Oran (Ahmed Ben Bella). Site : fikconciergerie.com`,
    `Voiture de la semaine : ${car.name} — ${car.category ?? ''}, ${car.seats ?? '?'} places, ${car.fuel ?? ''}${car.transmission ? `, ${car.transmission}` : ''}${car.resale_price ? ` — ${car.resale_price} ${car.currency === 'DZD' ? 'DA' : '€'}/jour` : ''}`,
    `Moment de l'année : ${moment.label} (${moment.hints.slice(0, 2).join(' ; ')})`,
    `Conditions EXACTES (n'en cite aucune autre, n'invente rien) :\n${cond.slice(0, 2500)}`,
    `Nous sommes le ${date}.`,
    history.length ? `Sujets déjà faits (à ne pas refaire) : ${history.slice(0, 6).map(h => h.theme).join(' | ')}` : '',
  ].filter(Boolean).join('\n');
  const r = await createAnthropic().messages.create({
    model: 'claude-sonnet-5-5', max_tokens: 700,
    system: `Tu écris la mise à jour de la semaine de la fiche Google Maps (Google Business) de FIK Conciergerie, que Kouider collera lui-même. ` +
      `But : remonter dans les recherches « location voiture Oran », « location voiture aéroport Oran ». Mets naturellement ces mots dans le texte, une seule fois chacun. ` +
      `UN sujet concret (la voiture de la semaine + le moment de l'année : vacances, fêtes, retour au pays). 60 à 100 mots, français simple et chaleureux, ` +
      `finit par une invitation à réserver sur WhatsApp ou sur le site. N'invente AUCUN prix, promo, voiture ou condition absente des infos. ` +
      `Jamais la Belgique ni Bruxelles. Pas de hashtag. Réponds UNIQUEMENT en JSON : {"theme":"sujet en 4 mots","post":"le texte","button":"Réserver|Appeler|En savoir plus"}`,
    messages: [{ role: 'user', content: user }],
  }, QUALITY);
  const raw = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
  const p = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { theme?: string; post?: string; button?: string };
  if (!p.post) throw new Error('post vide');
  if (/belgi|bruxelles/i.test(p.post)) throw new Error('post refusé (Belgique)');
  const text = `📍 Post Google Maps de la semaine (fiche FIK) — ${car.name}\n\n` +
    `1. Ouvre Google Maps → ta fiche FIK Conciergerie → « Ajouter une mise à jour »\n2. Colle ce texte :\n\n${p.post.trim()}\n\n` +
    `3. Ajoute la photo jointe (${car.name}) et le bouton « ${p.button ?? 'Réserver'} » → fikconciergerie.com\n\n` +
    `💡 Un post par semaine + des avis récents = ta fiche remonte sur Google quand quelqu'un cherche une location à Oran.`;
  if (!send) return text;
  await queueTelegramMessage(text, undefined, 'kouider', { url: car.image_url, name: `${car.name.replace(/[^\w-]+/g, '-')}.jpg` }, true);
  await kvSet(HIST, JSON.stringify([{ car: car.name, theme: p.theme ?? car.name, at: new Date().toISOString() }, ...history].slice(0, 20)));
  return `envoyé (${car.name} — ${p.theme})`;
}
