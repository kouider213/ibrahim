// PRIX D'UNE VOITURE en phrase normale (05/11/2026, banc « comme Kouider ») : « la Clio 4 diesel on la loue combien par
// jour ? » → le cerveau gratuit ne cherchait pas et répondait « je n'ai pas accès aux données en temps réel ».
// Le prix est dans la flotte (cars.resale_price = prix client/jour, cars.base_price = prix Houari/jour) : lu par le CODE.
import { supabase } from './supabase.js';

type CarRow = { name: string; base_price: number | null; resale_price: number | null; available: boolean | null; currency?: string | null };
const PRICE_Q = /\b(combien|prix|tarif|co[uû]te?|à combien|a combien|on la (loue|fait|met)|on le (loue|fait))\b/i;
const NOT_PRICE = /(gagn|rapport|b[ée]n[ée]f|profit|\bkm\b|kilom|\bplein\b|d.essence|vendre|vente|achet|r[ée]par|garage|assurance|amende|r[ée]servations?|combien de clients?|billet|vol\b|dispo|libre|r[ée]serv|semaine|week|mois|envoie|envoyer|dis[- ]lui|dis à|transmets|[ée]cris|whatsapp|mail|pr[ée]viens|plac|investi|int[ée]r[eê]ts?|%|pour ?cent|par an\b|cr[ée]dit|pr[eê]t\b|total|au prix de|\bdu \d{1,2}\b|\bau \d{1,2}\b|jusqu)/i;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Voitures citées dans le message : le plus de mots du nom retrouvés (« Clio » = toutes les Clio, « clio 4 diesel » = une). */
function carsIn(msg: string, cars: CarRow[]): CarRow[] {
  const split = (s: string) => norm(s).replace(/(\d)([a-z])/g, '$1 $2').split(' ').filter(w => w && !['essence', 'places', 'mariage', 'renault', 'dacia'].includes(w));
  const m = new Set(split(msg));
  const scored = cars.map(c => { const w = split(c.name); const hits = w.filter(x => m.has(x)).length; return { c, hits, all: hits === w.length }; })
    .filter(x => x.hits > 0);
  // 04/11 banc : « si je place 10000 euros à 4 % » → le « 4 » de « Clio 4 » suffisait → prix des Clio. Il faut un mot du nom (pas un chiffre).
  const named = scored.filter(x => split(x.c.name).some(w => /[a-z]/.test(w) && m.has(w)));
  scored.length = 0; scored.push(...named);
  if (!scored.length) return [];
  const exact = scored.filter(x => x.all);
  const pool = exact.length ? exact : scored;
  const best = Math.max(...pool.map(x => x.hits));
  return pool.filter(x => x.hits === best).map(x => x.c);
}

export async function carPriceAnswer(raw: string): Promise<string | null> {
  const msg = raw.replace(/^\s*\[[\s\S]*?\]\s*/, '').trim();
  if (msg.length > 160 || !PRICE_Q.test(msg) || NOT_PRICE.test(msg)) return null;
  const { data } = await supabase.from('cars').select('name, base_price, resale_price, available, currency');
  const cars = (data ?? []) as CarRow[];
  const hit = carsIn(msg, cars);
  if (!hit.length || hit.length > 6) return null;
  const line = (c: CarRow) => {
    const cur = c.currency === 'DZD' ? 'DA' : '€';
    const client = c.resale_price != null ? `${c.resale_price} ${cur}/jour au client` : 'prix client pas encore rempli';
    const houari = c.base_price != null ? ` · ${c.base_price} ${cur}/jour pour Houari` : '';
    const marge = c.resale_price != null && c.base_price != null ? ` → ${Math.round((c.resale_price - c.base_price) * 100) / 100} ${cur} de marge/jour` : '';
    return `🚗 ${c.name} : ${client}${houari}${marge}${c.available === false ? ' (⚠️ retirée du parc / atelier)' : ''}`;
  };
  return `${hit.map(line).join('\n')}\n(prix enregistrés dans la flotte)`;
}

// « Quelle voiture rapporte le plus ? » (05/11 banc : « je n'ai aucune donnée » alors que chaque résa a son bénéfice)
const BEST_Q = /(quelle|quel)\s+(voiture|caisse|auto|v[ée]hicule|mod[eè]le)\b[^?]{0,40}(rapport|rentab|gagn|marche le mieux|plus lou[ée]|plus de (b[ée]n[ée]f|clients|r[ée]serv))|voitures? la plus rentable|classement des voitures|top (des )?voitures/i;
export async function bestCarAnswer(raw: string): Promise<string | null> {
  const msg = raw.replace(/^\s*\[[\s\S]*?\]\s*/, '').trim();
  if (msg.length > 200 || !BEST_Q.test(msg)) return null;
  const [{ data: cars }, { data: bks }] = await Promise.all([
    supabase.from('cars').select('id, name'),
    supabase.from('bookings').select('car_id, start_date, end_date, final_price, client_price_per_day, owner_price_per_day, profit_kouider, rented_by, status').limit(2000),
  ]);
  const name = new Map(((cars ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]));
  const { rentalDays } = await import('./finance.js');
  const per = new Map<string, { n: number; days: number; ca: number; profit: number; known: number }>();
  for (const b of (bks ?? []) as Array<Record<string, any>>) {
    if (/REJECT|CANCEL/i.test(String(b.status ?? ''))) continue;
    const days = rentalDays(b.start_date, b.end_date);
    const p = b.profit_kouider != null ? Number(b.profit_kouider)
      : b.client_price_per_day != null && b.owner_price_per_day != null && !/houari/i.test(String(b.rented_by ?? '')) ? (Number(b.client_price_per_day) - Number(b.owner_price_per_day)) * days : null;
    const k = per.get(b.car_id) ?? { n: 0, days: 0, ca: 0, profit: 0, known: 0 };
    k.n++; k.days += days; k.ca += Number(b.final_price ?? 0) || 0; if (p != null) { k.profit += p; k.known++; }
    per.set(b.car_id, k);
  }
  if (!per.size) return '📊 Aucune réservation enregistrée pour l\'instant : je ne peux pas encore dire quelle voiture rapporte le plus.';
  const rows = [...per.entries()].sort((a, b) => b[1].profit - a[1].profit || b[1].ca - a[1].ca);
  const medal = ['🥇', '🥈', '🥉'];
  const lines = rows.slice(0, 8).map(([id, k], i) => `${medal[i] ?? '▫️'} ${name.get(id) ?? 'voiture inconnue'} : ${Math.round(k.profit)} € de bénéfice · ${k.n} résa · ${k.days} jours · ${Math.round(k.ca)} € de CA${k.known < k.n ? ` (bénéfice connu sur ${k.known}/${k.n})` : ''}`);
  return `📊 Tes voitures classées par bénéfice réel (toutes les résas enregistrées) :\n${lines.join('\n')}`;
}
