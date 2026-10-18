// Import en vrac des locations : Kouider colle un texte (notes, WhatsApp, Excel copié) ou envoie la photo
// de son carnet → Claude en sort une liste de locations rattachées aux vraies voitures du parc.
// Rien n'est créé ici : l'app montre la liste, Kouider corrige / décoche, puis crée via POST /api/bookings.
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropic } from './anthropic-compat.js';
import { supabase } from './supabase.js';

export interface ParsedRental {
  car_id: string | null; car_name: string; client_name: string; client_phone: string;
  start_date: string; end_date: string; final_price: number | null; currency: 'EUR' | 'DZD';
  paid: boolean | null; paid_amount: number | null; note: string;
}

const anthropic = createAnthropic();
type ImgMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const IMG = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function parseRentals(input: { text?: string; imageBase64?: string; mime?: string }): Promise<ParsedRental[]> {
  const { data: cars } = await supabase.from('cars').select('id, name');
  const fleet = (cars ?? []) as Array<{ id: string; name: string }>;
  const today = new Date().toISOString().slice(0, 10);

  const system =
    `Tu extrais des LOCATIONS DE VOITURES à partir de notes d'un loueur à Oran (Algérie). Aujourd'hui : ${today}.\n` +
    `Voitures du parc (id → nom) :\n${fleet.map(c => `- ${c.id} → ${c.name}`).join('\n')}\n\n` +
    `Réponds UNIQUEMENT par un tableau JSON, sans texte autour. Un objet par location :\n` +
    `{"car_id": id du parc ou null si aucune ne correspond, "car_name": nom lu, "client_name": "", "client_phone": "" ,` +
    ` "start_date": "AAAA-MM-JJ", "end_date": "AAAA-MM-JJ", "final_price": total ou null, "currency": "EUR" ou "DZD",` +
    ` "paid": true/false/null, "paid_amount": montant déjà versé si partiel sinon null, "note": "ce qui est incertain"}\n` +
    `Règles : n'invente rien (null / "" si absent). Année absente → l'année la plus logique (pas dans le futur lointain).` +
    ` Prix en DA/dinars → DZD, sinon EUR. Si seul un prix par jour est donné, total = prix/jour × jours (tranches de 24 h : du 3 au 7 = 4 jours).` +
    ` « payé », « réglé », « ok » → paid true ; « reste », « doit » → false. Rapproche les noms approximatifs (« clio » → la Clio du parc).`;

  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageBase64) {
    const mime = (IMG.has(input.mime ?? '') ? input.mime : 'image/jpeg') as ImgMime;
    content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: input.imageBase64 } });
  }
  content.push({ type: 'text', text: input.text?.trim() ? `Notes :\n${input.text.trim().slice(0, 12000)}` : 'Lis les locations sur cette photo.' });

  const r = await anthropic.messages.create({ model: 'claude-sonnet-5-5', max_tokens: 4000, system, messages: [{ role: 'user', content }] });
  const raw = r.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('');
  const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
  let rows: Array<Record<string, unknown>> = [];
  try { rows = JSON.parse(json) as Array<Record<string, unknown>>; } catch { throw new Error('Je n\'ai pas réussi à lire des locations dans ce texte.'); }

  const ids = new Set(fleet.map(c => c.id));
  return rows.filter(x => x && typeof x === 'object').map(x => {
    const id = typeof x['car_id'] === 'string' && ids.has(x['car_id']) ? x['car_id'] : null;
    const price = Number(x['final_price']);
    const s = String(x['start_date'] ?? ''), e = String(x['end_date'] ?? '');
    return {
      car_id: id,
      car_name: id ? fleet.find(c => c.id === id)!.name : String(x['car_name'] ?? ''),
      client_name: String(x['client_name'] ?? '').trim(),
      client_phone: String(x['client_phone'] ?? '').replace(/[^\d+]/g, ''),
      start_date: DATE.test(s) ? s : '', end_date: DATE.test(e) ? e : (DATE.test(s) ? s : ''),
      final_price: Number.isFinite(price) && price > 0 ? price : null,
      currency: x['currency'] === 'DZD' ? 'DZD' : 'EUR',
      paid: typeof x['paid'] === 'boolean' ? x['paid'] : null,
      paid_amount: Number(x['paid_amount']) > 0 ? Number(x['paid_amount']) : null,
      note: String(x['note'] ?? ''),
    } satisfies ParsedRental;
  }).slice(0, 200);
}

// ── Offre FIK « Carte live » : lien de démo public personnalisé pour un prospect ──
// La démo tourne dans l'app publiée (?demo=carte) avec des données fictives : aucune donnée AutoLux n'y est.
const APP = 'https://kouider213.github.io/ibrahim/';
const KINDS = ['location', 'vente', 'garage', 'immo', 'transport'] as const;

export function carteDemoLink(input: Record<string, unknown>): string {
  const company = String(input['company'] ?? '').trim().slice(0, 40);
  const k = String(input['kind'] ?? 'location').toLowerCase();
  const kind = (KINDS as readonly string[]).includes(k) ? k : 'location';
  const url = `${APP}?demo=carte&k=${kind}${company ? `&n=${encodeURIComponent(company)}` : ''}`;
  return `Démo Carte live${company ? ` pour ${company}` : ''} : ${url}\n\n` +
    `Message prêt à envoyer :\n« Bonjour${company ? ` ${company}` : ''}, voici à quoi ressemblerait votre activité en direct, vue comme un jeu : ` +
    `chaque véhicule ou bien est à sa place (disponible, loué, à l'atelier, en vente…), les retards et paiements à encaisser sautent aux yeux, ` +
    `et on peut l'afficher en plein écran sur un PC ou une télé à l'agence. Ouvrez le lien sur téléphone ou PC (données d'exemple). ` +
    `On la branche sur vos vraies données en quelques jours. — FIK Conciergerie »\n\n` +
    `Prix : à fixer par Kouider (aucun tarif enregistré pour cette offre).`;
}
