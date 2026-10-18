// PARTENAIRES de Kouider (Houari, Karim…) : qui ils sont et tout ce qu'ils lui proposent
// (véhicules, immobilier, services, activités…), avec photos, prix payé au partenaire et prix client.
// Stockage : app_kv « partners:v1 » (pas d'accès SQL pour une nouvelle table).
// Un véhicule peut être lié à une voiture du PARC (cars) : ses prix/photos/dispo viennent alors de cars
// (resale_price = client, base_price = partenaire) et une modification ici met à jour le parc et le site.
// Un bien peut être publié dans properties (site immobilier) ; le prix partenaire reste ici.
import { randomBytes } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { env } from '../config/env.js';
import { redis } from '../queue/queue.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME ?? '',
  api_key:    env.CLOUDINARY_API_KEY    ?? '',
  api_secret: env.CLOUDINARY_API_SECRET ?? '',
});

export const OFFER_TYPES = ['vehicle', 'property', 'service', 'activity', 'other'] as const;
export type OfferType = typeof OFFER_TYPES[number];
export const OFFER_LABEL: Record<OfferType, string> = { vehicle: 'Véhicule', property: 'Immobilier', service: 'Service', activity: 'Activité', other: 'Autre' };
export const PARTNER_STATUS = ['actif', 'en discussion', 'en pause', 'terminé'] as const;

export interface Offer {
  id: string; type: OfferType; title: string; description?: string; photos: string[];
  owner_price: number | null;          // ce que Kouider paie au partenaire
  client_price: number | null;         // ce que Kouider fait payer au client
  unit: string;                        // jour, nuit, mois, personne, prestation, heure…
  currency: 'EUR' | 'DZD';
  capacity?: number | null;            // places, personnes, chambres…
  location?: string; conditions?: string; available: boolean;
  car_id?: string | null; property_id?: string | null;
  created_at: string; updated_at: string;
}
export interface Partner {
  id: string; name: string; role?: string; status: typeof PARTNER_STATUS[number];
  phone?: string; whatsapp?: string; email?: string; city?: string; address?: string;
  payment_terms?: string;              // ex. « paiement à la fin de chaque location, cash »
  commission_pct?: number | null;      // si le partenaire travaille à la commission
  deposit?: string; contract?: string; since?: string; rating?: number | null; notes?: string;
  offers: Offer[]; created_at: string; updated_at: string;
}
export type PartnerView = Partner & { stats: { offers: number; byType: Partial<Record<OfferType, number>>; avgMarginPct: number | null } };

const KEY = 'partners:v1';
const now = () => new Date().toISOString();
const newId = () => randomBytes(6).toString('hex');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 2000) => (v == null ? undefined : String(v).trim().slice(0, max) || undefined);

async function load(): Promise<Partner[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Partner[]; } catch { return []; }
}
async function save(list: Partner[]): Promise<void> { await kvSet(KEY, JSON.stringify(list)); }

export function findPartner(list: Partner[], q: string): Partner | null {
  const n = norm(q);
  if (!n) return null;
  return list.find(p => p.id === q) ?? list.find(p => norm(p.name) === n) ?? list.find(p => norm(p.name).startsWith(n))
    ?? list.find(p => norm(p.name).includes(n)) ?? null;
}
function findOffer(p: Partner, q: string): Offer | null {
  const n = norm(q);
  return p.offers.find(o => o.id === q) ?? p.offers.find(o => norm(o.title) === n) ?? p.offers.find(o => norm(o.title).includes(n)) ?? null;
}

/** Photos : base64 ou URL → URLs Cloudinary (les URL https sont gardées telles quelles). */
export async function uploadPhotos(photos: unknown, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const p of (Array.isArray(photos) ? photos : []).slice(0, 15)) {
    const s = String(p ?? '');
    if (/^https?:\/\//.test(s)) { out.push(s); continue; }
    if (s.length < 100) continue;
    const up = await cloudinary.uploader.upload(s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`, { folder });
    out.push(up.secure_url);
  }
  return out;
}

/** Photos jointes dans le chat (cache 15 min de /api/cars/session-photos) — vidé après usage. */
export async function takeSessionPhotos(sessionId?: string): Promise<string[]> {
  if (!sessionId) return [];
  const key = `session:photos:${sessionId}`;
  try {
    const raw = await redis.get(key);
    if (!raw) return [];
    await redis.del(key).catch(() => {});
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

// ── Lecture (offres liées au parc / à l'immobilier = données fraîches) ─────
type CarRow = { id: string; name: string; category: string | null; base_price: number | null; resale_price: number | null; image_url: string | null; available: boolean | null; seats: number | null; fuel: string | null; transmission: string | null };

export async function listPartners(): Promise<PartnerView[]> {
  const list = await load();
  const carIds = list.flatMap(p => p.offers.map(o => o.car_id).filter(Boolean)) as string[];
  const cars = new Map<string, CarRow>();
  const photos = new Map<string, string[]>();
  if (carIds.length) {
    const { data } = await supabase.from('cars').select('id, name, category, base_price, resale_price, image_url, available, seats, fuel, transmission').in('id', carIds);
    for (const c of (data ?? []) as CarRow[]) cars.set(c.id, c);
    const { data: ph } = await supabase.from('car_photos').select('car_id, url, position').in('car_id', carIds).order('position');
    for (const r of (ph ?? []) as { car_id: string; url: string }[]) photos.set(r.car_id, [...(photos.get(r.car_id) ?? []), r.url]);
  }
  return list.map(p => {
    const offers = p.offers.map(o => {
      const c = o.car_id ? cars.get(o.car_id) : undefined;
      if (!c) return o;
      const ph = photos.get(c.id) ?? [];
      return {
        ...o, title: c.name, owner_price: c.base_price, client_price: c.resale_price, available: c.available !== false, currency: 'EUR' as const,
        capacity: c.seats ?? o.capacity, photos: [...new Set([...(c.image_url ? [c.image_url] : []), ...ph, ...o.photos])],
        description: o.description || [c.category, c.fuel, c.transmission].filter(Boolean).join(' · '),
      };
    });
    const margins = offers.filter(o => o.client_price && o.owner_price != null).map(o => (o.client_price! - o.owner_price!) / o.client_price! * 100);
    const byType: Partial<Record<OfferType, number>> = {};
    for (const o of offers) byType[o.type] = (byType[o.type] ?? 0) + 1;
    return { ...p, offers, stats: { offers: offers.length, byType, avgMarginPct: margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null } };
  });
}

// ── Écriture ────────────────────────────────────────────────────────────────
function partnerFields(b: Record<string, unknown>): Partial<Partner> {
  const f: Partial<Partner> = {};
  const set = <K extends keyof Partner>(k: K, v: Partner[K] | undefined) => { if (v !== undefined) f[k] = v; };
  set('name', str(b['name'], 80));
  set('role', str(b['role'], 120));
  if (b['status'] && PARTNER_STATUS.includes(b['status'] as Partner['status'])) f.status = b['status'] as Partner['status'];
  for (const k of ['phone', 'whatsapp', 'email', 'city', 'address', 'payment_terms', 'deposit', 'contract', 'since', 'notes'] as const) {
    if (k in b) f[k] = str(b[k]) ?? '';
  }
  if ('commission_pct' in b) f.commission_pct = num(b['commission_pct']);
  if ('rating' in b) { const r = num(b['rating']); f.rating = r == null ? null : Math.max(1, Math.min(5, Math.round(r))); }
  return f;
}

export async function upsertPartner(b: Record<string, unknown>, id?: string): Promise<Partner> {
  const list = await load();
  const fields = partnerFields(b);
  if (id) {
    const p = list.find(x => x.id === id);
    if (!p) throw new Error('Partenaire introuvable');
    Object.assign(p, fields, { updated_at: now() });
    await save(list);
    return p;
  }
  if (!fields.name) throw new Error('Le nom du partenaire est obligatoire');
  if (findPartner(list, fields.name) && norm(findPartner(list, fields.name)!.name) === norm(fields.name)) throw new Error(`« ${fields.name} » existe déjà`);
  const p: Partner = { id: newId(), status: 'actif', offers: [], created_at: now(), updated_at: now(), ...fields, name: fields.name };
  list.push(p);
  await save(list);
  return p;
}

export async function deletePartner(id: string): Promise<void> {
  const list = await load();
  await save(list.filter(p => p.id !== id));
}

function offerFields(b: Record<string, unknown>): Partial<Offer> {
  const f: Partial<Offer> = {};
  if (b['type'] && OFFER_TYPES.includes(b['type'] as OfferType)) f.type = b['type'] as OfferType;
  if ('title' in b) f.title = str(b['title'], 120) ?? '';
  for (const k of ['description', 'location', 'conditions'] as const) if (k in b) f[k] = str(b[k]) ?? '';
  if ('owner_price' in b) f.owner_price = num(b['owner_price']);
  if ('client_price' in b) f.client_price = num(b['client_price']);
  if ('capacity' in b) f.capacity = num(b['capacity']);
  if (b['unit']) f.unit = String(b['unit']).trim().slice(0, 30);
  if (b['currency'] === 'DZD' || b['currency'] === 'EUR') f.currency = b['currency'];
  if ('available' in b) f.available = b['available'] !== false && b['available'] !== 'false';
  return f;
}

const DEFAULT_UNIT: Record<OfferType, string> = { vehicle: 'jour', property: 'nuit', service: 'prestation', activity: 'personne', other: 'prestation' };

/** Ajoute une offre. add_to_fleet (véhicule) → nouvelle voiture dans le PARC + site ; publish_site (bien) → site immobilier. */
export async function addOffer(partnerId: string, b: Record<string, unknown>, extraPhotos: string[] = []): Promise<{ partner: Partner; offer: Offer; linked?: string }> {
  const list = await load();
  const p = list.find(x => x.id === partnerId);
  if (!p) throw new Error('Partenaire introuvable');
  const f = offerFields(b);
  const type = f.type ?? 'other';
  if (!f.title) throw new Error("Le nom de l'offre est obligatoire (ex. « Clio 5 », « Villa Aïn Turck », « Tournée sur la corniche »)");
  const id = newId();
  const photos = [...extraPhotos, ...(await uploadPhotos(b['photos'], `partners/${p.id}/${id}`))];
  const offer: Offer = {
    id, type, title: f.title, description: f.description, photos, owner_price: f.owner_price ?? null, client_price: f.client_price ?? null,
    unit: f.unit ?? DEFAULT_UNIT[type], currency: f.currency ?? 'EUR', capacity: f.capacity ?? null, location: f.location, conditions: f.conditions,
    available: f.available ?? true, car_id: null, property_id: null, created_at: now(), updated_at: now(),
  };
  let linked: string | undefined;
  if (type === 'vehicle' && (b['add_to_fleet'] === true || b['add_to_fleet'] === 'true')) {
    const { data, error } = await supabase.from('cars').insert({
      name: offer.title, category: str(b['category'], 30) ?? 'citadine', available: offer.available,
      base_price: offer.owner_price ?? 0, resale_price: offer.client_price ?? 0, description: offer.description ?? null,
      seats: num(b['seats']) ?? offer.capacity ?? 5, fuel: str(b['fuel'], 20) ?? null, transmission: str(b['transmission'], 20) ?? null,
      image_url: photos[0] ?? null, created_at: now(),
    }).select('id').single();
    if (error) throw new Error(`Ajout au parc impossible : ${error.message}`);
    offer.car_id = (data as { id: string }).id;
    if (photos.length) await supabase.from('car_photos').insert(photos.map((url, i) => ({ car_id: offer.car_id, url, position: i })));
    linked = 'ajoutée au PARC et au site';
  }
  if (type === 'property' && (b['publish_site'] === true || b['publish_site'] === 'true')) {
    const { data, error } = await supabase.from('properties').insert({
      title: offer.title, name: offer.title, type: str(b['property_type'], 30) ?? 'appartement', transaction: 'location', status: 'disponible',
      price: offer.client_price, price_type: offer.unit === 'mois' ? 'mois' : offer.unit, currency: offer.currency,
      city: str(b['city'], 60) ?? 'Oran', district: offer.location ?? null, description: offer.description ?? null,
      conditions: offer.conditions ?? null, image_url: photos[0] ?? null, notes: `Partenaire : ${p.name}`,
      monthly_rent: offer.unit === 'mois' ? offer.client_price : null,
    }).select('id').single();
    if (error) throw new Error(`Publication immobilier impossible : ${error.message}`);
    offer.property_id = (data as { id: string }).id;
    if (photos.length) await supabase.from('property_photos').insert(photos.map((url, i) => ({ property_id: offer.property_id, url, position: i })));
    linked = 'publié sur le site (immobilier)';
  }
  p.offers.push(offer);
  p.updated_at = now();
  await save(list);
  return { partner: p, offer, linked };
}

export async function updateOffer(partnerId: string, offerId: string, b: Record<string, unknown>, extraPhotos: string[] = []): Promise<Offer> {
  const list = await load();
  const p = list.find(x => x.id === partnerId);
  const o = p?.offers.find(x => x.id === offerId);
  if (!p || !o) throw new Error('Offre introuvable');
  const f = offerFields(b);
  const added = [...extraPhotos, ...(await uploadPhotos(b['photos'], `partners/${p.id}/${o.id}`))];
  if (Array.isArray(b['remove_photos'])) { const rm = new Set((b['remove_photos'] as unknown[]).map(String)); o.photos = o.photos.filter(u => !rm.has(u)); }
  Object.assign(o, f, { photos: [...o.photos, ...added], updated_at: now() });
  if (o.car_id) {
    // Véhicule du parc : la source de vérité reste cars (site + app + Carte live)
    const upd: Record<string, unknown> = {};
    if (f.owner_price !== undefined) upd['base_price'] = f.owner_price ?? 0;
    if (f.client_price !== undefined) upd['resale_price'] = f.client_price ?? 0;
    if (f.title) upd['name'] = f.title;
    if (f.available !== undefined) upd['available'] = f.available;
    if (Object.keys(upd).length) {
      const { error } = await supabase.from('cars').update(upd).eq('id', o.car_id);
      if (error) throw new Error(error.message);
    }
    if (added.length) {
      const { data: last } = await supabase.from('car_photos').select('position').eq('car_id', o.car_id).order('position', { ascending: false }).limit(1);
      const start = last?.length ? Number((last[0] as { position: number }).position) + 1 : 0;
      await supabase.from('car_photos').insert(added.map((url, i) => ({ car_id: o.car_id, url, position: start + i })));
    }
  }
  if (o.property_id) {
    const upd: Record<string, unknown> = {};
    if (f.client_price !== undefined) upd['price'] = f.client_price;
    if (f.title) { upd['title'] = f.title; upd['name'] = f.title; }
    if (f.available !== undefined) upd['status'] = f.available ? 'disponible' : 'loué';
    if (Object.keys(upd).length) await supabase.from('properties').update(upd).eq('id', o.property_id);
  }
  p.updated_at = now();
  await save(list);
  return o;
}

/** Retire l'offre du partenaire. La voiture/le bien lié reste sur le site sauf remove_linked=true. */
export async function deleteOffer(partnerId: string, offerId: string, removeLinked = false): Promise<void> {
  const list = await load();
  const p = list.find(x => x.id === partnerId);
  const o = p?.offers.find(x => x.id === offerId);
  if (!p || !o) throw new Error('Offre introuvable');
  if (removeLinked && o.car_id) await supabase.from('cars').delete().eq('id', o.car_id);
  if (removeLinked && o.property_id) await supabase.from('properties').delete().eq('id', o.property_id);
  p.offers = p.offers.filter(x => x.id !== offerId);
  p.updated_at = now();
  await save(list);
}

/** Rattache des voitures existantes du PARC à un partenaire (ex. les 15 voitures de Houari). */
export async function linkCars(partnerId: string, carIds: string[]): Promise<number> {
  const list = await load();
  const p = list.find(x => x.id === partnerId);
  if (!p) throw new Error('Partenaire introuvable');
  const taken = new Set(list.flatMap(x => x.offers.map(o => o.car_id)).filter(Boolean));
  const { data } = await supabase.from('cars').select('id, name, seats').in('id', carIds);
  let n = 0;
  for (const c of (data ?? []) as { id: string; name: string; seats: number | null }[]) {
    if (taken.has(c.id)) continue;
    p.offers.push({ id: newId(), type: 'vehicle', title: c.name, photos: [], owner_price: null, client_price: null, unit: 'jour', currency: 'EUR',
      capacity: c.seats, available: true, car_id: c.id, property_id: null, created_at: now(), updated_at: now() });
    n++;
  }
  p.updated_at = now();
  await save(list);
  return n;
}

// ── Outil Dzaryx « partners » ───────────────────────────────────────────────
const money = (n: number | null | undefined, cur = 'EUR') => (n == null ? '?' : `${Math.round(n * 10) / 10} ${cur === 'DZD' ? 'DA' : '€'}`);
export function offerLine(o: Offer): string {
  const m = o.client_price != null && o.owner_price != null ? o.client_price - o.owner_price : null;
  return `• [${OFFER_LABEL[o.type]}] ${o.title}${o.available ? '' : ' (indisponible)'} — partenaire ${money(o.owner_price, o.currency)} · client ${money(o.client_price, o.currency)} /${o.unit}${m != null ? ` · marge ${money(m, o.currency)}${o.client_price ? ` (${Math.round(m / o.client_price * 100)} %)` : ''}` : ''}${o.capacity ? ` · ${o.capacity} pers./places` : ''}${o.location ? ` · ${o.location}` : ''}${o.photos.length ? ` · ${o.photos.length} photo(s)` : ''}${o.car_id ? ' · dans le PARC' : ''}${o.property_id ? ' · sur le site' : ''}`;
}
function partnerText(p: PartnerView): string {
  const info = [p.role, p.city, p.phone && `📞 ${p.phone}`, p.whatsapp && `WhatsApp ${p.whatsapp}`, p.email, p.payment_terms && `Paiement : ${p.payment_terms}`,
    p.commission_pct != null && `Commission ${p.commission_pct} %`, p.deposit && `Caution : ${p.deposit}`, p.contract && `Contrat : ${p.contract}`, p.since && `Depuis ${p.since}`,
    p.rating && `${'★'.repeat(p.rating)}`].filter(Boolean).join(' · ');
  return `🤝 ${p.name} (${p.status})${info ? `\n${info}` : ''}${p.notes ? `\nNotes : ${p.notes}` : ''}\n${p.offers.length ? p.offers.map(offerLine).join('\n') : 'Aucune offre enregistrée.'}${p.stats.avgMarginPct != null ? `\nMarge moyenne : ${p.stats.avgMarginPct} %` : ''}`;
}

export async function partnersTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const action = String(input['action'] ?? 'list');
  try {
    const list = await listPartners();
    const who = String(input['partner'] ?? input['name'] ?? '').trim();
    const p = who ? findPartner(list, who) as PartnerView | null : null;
    const needP = () => { if (!p) throw new Error(who ? `Partenaire « ${who} » introuvable. Partenaires : ${list.map(x => x.name).join(', ') || 'aucun'}.` : 'Précise le partenaire (partner).'); return p; };
    switch (action) {
      case 'list':
        if (!list.length) return 'Aucun partenaire enregistré. Ajoute-en un avec action add_partner (ou dans l\'app : page PARTENAIRES).';
        return list.map(x => `🤝 ${x.name} (${x.status}) — ${x.role ?? ''} ${x.city ?? ''} · ${x.stats.offers} offre(s) : ${Object.entries(x.stats.byType).map(([t, n]) => `${n} ${OFFER_LABEL[t as OfferType].toLowerCase()}${n > 1 && t !== 'property' ? 's' : ''}`).join(', ') || '—'}${x.stats.avgMarginPct != null ? ` · marge moy. ${x.stats.avgMarginPct} %` : ''}`).join('\n');
      case 'show': return partnerText(needP());
      case 'add_partner': {
        const np = await upsertPartner(input);
        return `✅ Partenaire « ${np.name} » ajouté. Ajoute ses offres (véhicules, biens, services, activités) avec action add_offer, ou dans l'app : page PARTENAIRES.`;
      }
      case 'update_partner': {
        const up = await upsertPartner(input['new_name'] ? { ...input, name: input['new_name'] } : { ...input, name: undefined }, needP().id);
        return `✅ Fiche de ${up.name} mise à jour.`;
      }
      case 'remove_partner': {
        if (input['confirm'] !== true) return `⚠️ Supprimer ${needP().name} et ses ${p!.offers.length} offre(s) de la liste des partenaires ? (les voitures/biens restent sur le site). Rappelle avec confirm=true après le oui de Kouider.`;
        await deletePartner(needP().id);
        return `🗑️ ${p!.name} retiré des partenaires.`;
      }
      case 'add_offer': {
        const photos = await takeSessionPhotos(sessionId);
        const r = await addOffer(needP().id, input, photos);
        return `✅ Ajouté chez ${r.partner.name}${r.linked ? ` (${r.linked})` : ''} :\n${offerLine(r.offer)}`;
      }
      case 'update_offer': {
        const o = findOffer(needP(), String(input['offer'] ?? input['title'] ?? ''));
        if (!o) return `❌ Offre introuvable chez ${p!.name}. Offres : ${p!.offers.map(x => x.title).join(', ')}.`;
        const photos = await takeSessionPhotos(sessionId);
        const body = { ...input }; delete body['title'];
        if (input['new_title']) body['title'] = input['new_title'];
        const u = await updateOffer(p!.id, o.id, body, photos);
        return `✅ Offre mise à jour${u.car_id ? ' (parc et site aussi)' : ''} :\n${offerLine(u)}`;
      }
      case 'remove_offer': {
        const o = findOffer(needP(), String(input['offer'] ?? input['title'] ?? ''));
        if (!o) return `❌ Offre introuvable chez ${p!.name}.`;
        if (input['confirm'] !== true) return `⚠️ Retirer « ${o.title} » de chez ${p!.name}${o.car_id || o.property_id ? (input['remove_linked'] === true ? ' ET du site' : ' (elle reste sur le site)') : ''} ? Rappelle avec confirm=true après le oui de Kouider.`;
        await deleteOffer(p!.id, o.id, input['remove_linked'] === true);
        return `🗑️ « ${o.title} » retiré de chez ${p!.name}.`;
      }
      case 'link_cars': {
        const names = Array.isArray(input['cars']) ? (input['cars'] as unknown[]).map(String) : [];
        const { data } = await supabase.from('cars').select('id, name');
        const all = (data ?? []) as { id: string; name: string }[];
        const ids = names.length && !names.includes('all') ? all.filter(c => names.some(n => norm(c.name).includes(norm(n)))).map(c => c.id) : all.map(c => c.id);
        const n = await linkCars(needP().id, ids);
        return `✅ ${n} voiture(s) du parc rattachée(s) à ${p!.name}.`;
      }
      case 'search': {
        const q = norm(String(input['query'] ?? ''));
        const type = input['type'] as OfferType | undefined;
        const hits = list.flatMap(x => x.offers.filter(o => (!type || o.type === type) && (!q || norm(`${o.title} ${o.description ?? ''} ${o.location ?? ''}`).includes(q))).map(o => `${offerLine(o)} — chez ${x.name}${x.phone ? ` (${x.phone})` : ''}`));
        return hits.length ? hits.slice(0, 40).join('\n') : 'Aucune offre trouvée chez les partenaires.';
      }
      default: return `❌ action inconnue : ${action}`;
    }
  } catch (err) {
    return `❌ Partenaires : ${err instanceof Error ? err.message : String(err)}`;
  }
}
