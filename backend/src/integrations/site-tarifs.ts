import { kvGet, kvSet } from './app-store.js';
import { askJson } from './pro-doc.js';

// ── FIK Sites : grille de prix ────────────────────────────────────────────────────────────────────
// Une grille Algérie (DA) et une grille France (€). Kouider la lit dans l'app (page Sites clients) et la change par
// message (« passe la formule Pro France à 45 € ») ; Dzaryx s'en sert pour régler l'abonnement d'un nouveau client.
// Prix de départ : étude FIK Sites Oran du 21/10 (1 500 / 2 500 DA, achat unique 25 000 DA) et marché français
// (Wix 17-30 €/mois à faire soi-même, agence 800-2 000 € une fois). Stockée dans app_kv `fik:tarifs`.

export type Country = 'DZ' | 'FR';
export interface Pack {
  id: string; country: Country; name: string; currency: string; for: string; includes: string[];
  monthly?: number; yearly?: number;     // abonnement (l'année = 10 mois payés)
  once?: number; renewal?: number;       // achat unique + hébergement/domaine par an
}
export interface PackOption { id: string; country: Country; name: string; currency: string; monthly?: number; once?: number; note: string }
export interface Tarifs { updatedAt: string; packs: Pack[]; options: PackOption[]; offers: Record<Country, string> }

const KEY = 'fik:tarifs';
const BASE_DZ = ['Site d\'une page à son nom, sur téléphone et ordinateur', 'Adresse sur Google Maps, boutons Appeler et WhatsApp', 'Horaires, photos, formulaire de contact', 'Modifications par simple message à FIK'];
const BASE_FR = ['Site à son nom, sur téléphone et ordinateur', 'Plan Google Maps, boutons Appeler et WhatsApp', 'Horaires, photos, formulaire de contact', 'Modifications par simple message à FIK'];
const PRO = ['Tout le pack Vitrine', 'Menu / catalogue avec les prix', 'Réservation ou prise de rendez-vous en ligne', 'Espace client pour tout modifier soi-même', 'Bilan des visites chaque mois'];

// 24/10 : alignés sur le marché (DZ : freelances 20-50 000 DA, Hostynet 22 000 + 8 000/an ; FR : Simplébo 400 € + 60 €/mois, Wix 3-14 €/mois)
// Coût FIK par site ≈ 0,10 €/mois de Claude + Netlify gratuit (~20 mises à jour/mois) ; domaine payé par le client.
export const DEFAULT_TARIFS: Tarifs = {
  updatedAt: '2026-10-24',
  packs: [
    { id: 'vitrine-dz', country: 'DZ', name: 'Vitrine', currency: 'DA', monthly: 1500, yearly: 15000, for: 'commerce de quartier', includes: BASE_DZ },
    { id: 'pro-dz', country: 'DZ', name: 'Pro', currency: 'DA', monthly: 2500, yearly: 25000, for: 'restaurants, cafés, artisans, salons', includes: PRO },
    { id: 'unique-dz', country: 'DZ', name: 'Achat unique', currency: 'DA', once: 30000, renewal: 6000, for: 'ceux qui ne veulent pas d\'abonnement', includes: [...BASE_DZ, 'Payé une fois, puis hébergement + domaine chaque année'] },
    { id: 'vitrine-fr', country: 'FR', name: 'Vitrine', currency: '€', monthly: 29, yearly: 290, for: 'commerce de quartier, artisan', includes: BASE_FR },
    { id: 'pro-fr', country: 'FR', name: 'Pro', currency: '€', monthly: 49, yearly: 490, for: 'restaurants, salons, instituts', includes: PRO },
    { id: 'unique-fr', country: 'FR', name: 'Achat unique', currency: '€', once: 490, renewal: 90, for: 'ceux qui ne veulent pas d\'abonnement', includes: [...BASE_FR, 'Payé une fois, puis hébergement + domaine chaque année'] },
  ],
  options: [
    { id: 'visibilite-dz', country: 'DZ', name: 'Pack visibilité', currency: 'DA', monthly: 1500, note: 'un post Google + Instagram préparé chaque semaine' },
    { id: 'domaine-dz', country: 'DZ', name: 'Nom de domaine', currency: 'DA', note: 'au prix coûtant, payé par le client (≈ 3 500 DA/an en .com)' },
    { id: 'visibilite-fr', country: 'FR', name: 'Pack visibilité', currency: '€', monthly: 29, note: 'un post Google + Instagram préparé chaque semaine' },
    { id: 'domaine-fr', country: 'FR', name: 'Nom de domaine', currency: '€', note: 'au prix coûtant, payé par le client (≈ 12 €/an en .fr ou .com)' },
  ],
  offers: {
    DZ: '1er mois offert pour les 10 premiers commerces d\'Oran (jusqu\'au 31/12/2026), en échange d\'un avis et du droit de montrer le site aux voisins.',
    FR: 'Création offerte, sans engagement : résiliable à tout moment.',
  },
};

export async function getTarifs(): Promise<Tarifs> {
  try { return JSON.parse((await kvGet(KEY)) ?? 'null') ?? DEFAULT_TARIFS; } catch { return DEFAULT_TARIFS; }
}

const n = (x: number, cur: string) => `${x.toLocaleString('fr-FR')} ${cur}`;
export function packPrice(p: Pack): string {
  return p.once != null ? `${n(p.once, p.currency)} une fois + ${n(p.renewal ?? 0, p.currency)}/an`
    : `${n(p.monthly ?? 0, p.currency)}/mois ou ${n(p.yearly ?? 0, p.currency)}/an`;
}

export async function tarifsText(country?: Country): Promise<string> {
  const t = await getTarifs();
  return (['DZ', 'FR'] as Country[]).filter(c => !country || c === country).map(c =>
    `${c === 'DZ' ? '🇩🇿 Algérie' : '🇫🇷 France'}\n` +
    t.packs.filter(p => p.country === c).map(p => `• ${p.name} — ${packPrice(p)} (${p.for}) : ${p.includes.join(', ')}`).join('\n') +
    `\nOptions : ${t.options.filter(o => o.country === c).map(o => `${o.name}${o.monthly ? ` +${n(o.monthly, o.currency)}/mois` : ''}${o.once ? ` ${n(o.once, o.currency)}` : ''} (${o.note})`).join(' ; ')}` +
    `\nOffre : ${t.offers[c]}`).join('\n\n') + `\n(grille du ${t.updatedAt})`;
}

/** « passe le Pro France à 45 € », « ajoute une option photos pro à 5 000 DA » → grille modifiée par Claude, vérifiée ici. */
export async function editTarifs(changes: string): Promise<string> {
  const t = await getTarifs();
  const r = await askJson<Tarifs>(
    'Tu modifies la grille de prix FIK Sites selon les consignes de Kouider. Change UNIQUEMENT ce qu\'il demande, garde tout le reste ' +
    'à l\'identique (mêmes id, mêmes textes). Un nouveau pack ou une nouvelle option : id en minuscules « nom-dz » ou « nom-fr ». ' +
    'Réponds UNIQUEMENT avec le JSON complet, même forme : {"packs":[…],"options":[…],"offers":{"DZ":"…","FR":"…"}}',
    `GRILLE ACTUELLE :\n${JSON.stringify({ packs: t.packs, options: t.options, offers: t.offers }, null, 1)}\n\nCONSIGNES :\n${changes}`, 6000).catch(() => null);
  const ok = r && Array.isArray(r.packs) && r.packs.length && r.packs.every(p => p.id && p.name && (p.country === 'DZ' || p.country === 'FR') &&
    (typeof p.monthly === 'number' || typeof p.once === 'number')) && Array.isArray(r.options) && r.offers?.DZ != null && r.offers?.FR != null;
  if (!ok) return '❌ Je n\'ai pas réussi à modifier la grille proprement : redis-moi le changement plus simplement.';
  const next: Tarifs = { updatedAt: new Date().toISOString().slice(0, 10), packs: r.packs, options: r.options, offers: r.offers };
  await kvSet(KEY, JSON.stringify(next));
  return `✅ Grille de prix mise à jour.\n\n${await tarifsText()}`;
}

/** Pays d'un commerce d'après son adresse / téléphone (les démos viennent de Google Maps). */
export function countryOf(address: string, phone?: string | null): Country {
  return /alg[ée]rie|algeria|\bDZ\b|oran|alger|\+213/i.test(`${address} ${phone ?? ''}`) ? 'DZ' : 'FR';
}

/** Pack de la grille : « pro », « vitrine », « unique » + pays → le bon pack. */
export async function findPack(name: string, country: Country): Promise<Pack | null> {
  const t = await getTarifs();
  const q = name.trim().toLowerCase();
  const inCountry = t.packs.filter(p => p.country === country);
  return inCountry.find(p => p.id === q) ?? inCountry.find(p => p.id.startsWith(q) || p.name.toLowerCase().includes(q)) ?? null;
}
