// Données de la Carte live : statut de chaque voiture + tous les métiers FIK, et la version démo (offre FIK).
import type { Car, Booking, SmartReminder } from '../../services/api.ts';

export type Status = 'dispo' | 'depart' | 'loue' | 'retour' | 'atelier';
export const STATUS: Record<Status, { label: string; body: string; badge: string }> = {
  dispo:   { label: 'Disponible',          body: '#34d399', badge: '#10b981' },
  depart:  { label: 'Départ aujourd\'hui', body: '#fcd34d', badge: '#f59e0b' },
  loue:    { label: 'En location',         body: '#60a5fa', badge: '#3b82f6' },
  retour:  { label: 'Retour aujourd\'hui', body: '#fdba74', badge: '#f97316' },
  atelier: { label: 'Atelier / indispo',   body: '#a1a1aa', badge: '#71717a' },
};

export type ZoneId = 'agence' | 'parking' | 'atelier' | 'ville' | 'vente' | 'port' | 'immo' | 'packs' | 'aeroport' | 'b2b' | 'web';

export interface MapCar {
  id: string; name: string; status: Status; booking: Booking | null;
  due: number; alerts: SmartReminder[]; badge: { t: string; c: string } | null;
  money?: string;      // étiquette argent du mois (mode 💶 de la carte)
}
export interface Item { id: string; label: string; sub?: string }

export interface World {
  brand: string;
  zones: ZoneId[];
  cars: MapCar[];
  sales: Item[];       // véhicules à vendre
  imports: Item[];     // commandes d'import en cours (sur le bateau)
  properties: Item[];  // biens immobiliers
  packs: Item[];       // packs séjour
  pending: number;     // demandes du site en attente
  sites: number;       // sites clients FIK en ligne
  prospects: number;   // sociétés démarchées
  replies: number;     // réponses de prospects
  fresh?: string[];    // nouveautés depuis la dernière visite (car:/sale:/prop:/imp:<id>) → animées
  showMoney?: boolean; // affiche l'étiquette argent au-dessus de chaque voiture
  led?: string;        // panneau LED sur le toit de l'agence (texte défilant)
  targets?: string[];  // missions du jour : flèche dorée au-dessus (id voiture ou zone:<id>)
}

export const ALL_ZONES: ZoneId[] = ['agence', 'parking', 'atelier', 'ville', 'vente', 'port', 'immo', 'packs', 'aeroport', 'b2b', 'web'];

export const ZONE_INFO: Record<ZoneId, { icon: string; title: string; desc: string }> = {
  agence:   { icon: '🏢', title: 'Agence', desc: 'Le QG : demandes du site, réservations à confirmer.' },
  parking:  { icon: '🅿️', title: 'Parking location', desc: 'Voitures prêtes à partir, et les départs du jour.' },
  atelier:  { icon: '🔧', title: 'Atelier', desc: 'Voitures indisponibles : entretien, réparation, nettoyage.' },
  ville:    { icon: '🛣️', title: 'En ville', desc: 'Voitures en location qui roulent, et les retours du jour.' },
  vente:    { icon: '🏷️', title: 'Vente auto', desc: 'Showroom et parking des véhicules d\'occasion à vendre.' },
  port:     { icon: '🚢', title: 'Importation', desc: 'Véhicules commandés et importés jusqu\'en Algérie.' },
  immo:     { icon: '🏠', title: 'Immobilier', desc: 'Appartements, villas et locaux à louer ou à vendre.' },
  packs:    { icon: '🏝️', title: 'Packs séjour', desc: 'Voiture + logement + jet ski, chauffeur… clé en main.' },
  aeroport: { icon: '✈️', title: 'Aéroport & conciergerie', desc: 'Livraison aéroport, accueil, transferts, demandes sur-mesure.' },
  b2b:      { icon: '🏙️', title: 'Entreprises', desc: 'Packs entreprises et démarchage automatique.' },
  web:      { icon: '🌐', title: 'FIK Sites', desc: 'Sites web créés pour les commerces clients.' },
};

const ACTIVE = ['ACCEPTED', 'CONFIRMED', 'ACTIVE', 'COMPLETED'];
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

// t = jour affiché (barre de temps) : statut de chaque voiture ce jour-là.
// L'atelier reste l'état actuel (on ne sait pas quand une réparation finit).
export function buildCars(cars: Car[], bookings: Booking[], reminders: SmartReminder[], dueById: Map<string, number>, t = ymd(new Date())): MapCar[] {
  const live = bookings.filter(b => ACTIVE.includes((b.status ?? '').toUpperCase()) && b.start_date <= t && b.end_date >= t);
  return cars.map<MapCar>(car => {
    const mine = live.filter(b => (b.car_id ? b.car_id === car.id : norm(b.cars?.name) === norm(car.name)));
    const running = mine.find(b => b.start_date < t || (b.start_date === t && b.end_date === t)) ?? mine.find(b => b.end_date === t);
    const leaving = mine.find(b => b.start_date === t && b !== running);
    const booking = running ?? leaving ?? null;
    const status: Status = running ? (running.end_date === t ? 'retour' : 'loue') : leaving ? 'depart' : car.available ? 'dispo' : 'atelier';
    const due = booking ? (dueById.get(booking.id) ?? 0) : 0;
    const alerts = reminders.filter(r => norm(r.car_name) === norm(car.name));
    const badge = badgeOf(status, due, alerts) ?? (status === 'atelier' && car.maintenance_note?.startsWith('🔧') ? { t: '🔧', c: '#52525b' } : null);
    return { id: car.id, name: car.name, status, booking, due, alerts, badge };
  });
}

export const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return ymd(x); };

// ── Argent du mois ────────────────────────────────────────────────────────────
// Même règle que le serveur (finance.ts) : jours inclus (départ + retour), prix client/jour = client_price_per_day
// sinon final_price / jours ; bénéfice = (prix client − prix propriétaire) × jours, UNIQUEMENT si le prix
// propriétaire est saisi sur la location (jamais pris du catalogue) → sinon « bénéfice inconnu ».
export type Cur = '€' | 'DA';
export interface Money { ca: Record<Cur, number>; profit: Record<Cur, number>; due: Record<Cur, number>; days: number; rentals: number; noOwner: number }
const zero = (): Money => ({ ca: { '€': 0, 'DA': 0 }, profit: { '€': 0, 'DA': 0 }, due: { '€': 0, 'DA': 0 }, days: 0, rentals: 0, noOwner: 0 });
const span = (a: string, b: string) => Math.max(0, Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000) + 1);

export function monthMoney(cars: Car[], bookings: Booking[], month: string /* YYYY-MM */): { byCar: Map<string, Money>; total: Money } {
  const m0 = `${month}-01`;
  const m1 = addDays(addDays(m0, 32).slice(0, 7) + '-01', -1);
  const byCar = new Map<string, Money>(cars.map(c => [c.id, zero()]));
  const total = zero();
  for (const b of bookings) {
    if (!ACTIVE.includes((b.status ?? '').toUpperCase()) || b.end_date < m0 || b.start_date > m1) continue;
    const car = cars.find(c => (b.car_id ? c.id === b.car_id : norm(c.name) === norm(b.cars?.name)));
    const days = b.nb_days && b.nb_days > 0 ? b.nb_days : span(b.start_date, b.end_date);
    const inMonth = Math.min(days, span(b.start_date < m0 ? m0 : b.start_date, b.end_date > m1 ? m1 : b.end_date));
    const cur: Cur = (b as Booking & { currency?: string }).currency === 'DZD' ? 'DA' : '€';
    const cppd = b.client_price_per_day && b.client_price_per_day > 0 ? b.client_price_per_day : b.final_price != null ? b.final_price / days : null;
    const oppd = b.owner_price_per_day && b.owner_price_per_day > 0 ? b.owner_price_per_day : null;
    const paid = Number(b.paid_amount ?? (b.payment_status === 'PAID' ? b.final_price : 0)) || 0;
    const due = b.payment_status === 'PAID' || b.final_price == null ? 0 : Math.max(0, b.final_price - paid);
    for (const acc of car ? [byCar.get(car.id)!, total] : [total]) {
      acc.rentals++; acc.days += inMonth; acc.due[cur] += due;
      if (cppd != null) acc.ca[cur] += cppd * inMonth;
      if (cppd != null && oppd != null) acc.profit[cur] += (cppd - oppd) * inMonth; else acc.noOwner++;
    }
  }
  const round = (o: Money) => { (['ca', 'profit', 'due'] as const).forEach(k => { o[k]['€'] = Math.round(o[k]['€']); o[k]['DA'] = Math.round(o[k]['DA']); }); };
  byCar.forEach(round); round(total);
  return { byCar, total };
}
export const fmtMoney = (r: Record<Cur, number>) => (['€', 'DA'] as const).filter(c => r[c]).map(c => `${r[c].toLocaleString('fr-FR')} ${c}`).join(' + ') || '0 €';
// Étiquette courte au-dessus de la voiture : CA du mois, ou « dort » si aucun jour loué
export const moneyTag = (m: Money | undefined) => (!m || !m.days ? '💤 0 jour' : `${fmtMoney(m.ca)}${m.due['€'] || m.due['DA'] ? ' · reste' : ''}`);

export function badgeOf(status: Status, due: number, alerts: SmartReminder[]) {
  return alerts.some(a => a.priority === 'HIGH') ? { t: '!', c: '#ef4444' }
    : due > 0 ? { t: '€', c: '#f59e0b' }
    : status === 'retour' ? { t: '↩', c: STATUS.retour.badge }
    : status === 'depart' ? { t: '🔑', c: STATUS.depart.badge }
    : alerts.length ? { t: '•', c: '#fb923c' } : null;
}

// ── Démo publique (offre FIK) : données fictives, aucune donnée réelle ───────
export type DemoKind = 'location' | 'vente' | 'garage' | 'immo' | 'transport';
const DEMO_ZONES: Record<DemoKind, ZoneId[]> = {
  location:  ['agence', 'parking', 'atelier', 'ville', 'aeroport'],
  vente:     ['agence', 'vente', 'atelier', 'port', 'ville'],
  garage:    ['agence', 'parking', 'atelier', 'ville'],
  immo:      ['agence', 'immo', 'ville'],
  transport: ['agence', 'parking', 'atelier', 'ville', 'aeroport', 'port'],
};
const MODELS = ['Clio 5', 'Sandero', '208', 'Golf 8', 'Tucson', 'Berlingo', 'Duster', 'Polo', 'Corolla', 'i20', 'Kangoo', 'C3', 'Megane', 'Picanto', 'Jumpy', 'Accent', 'Yaris', 'Fiesta'];
const NAMES = ['Karim B.', 'Sofia M.', 'Yacine T.', 'Nadia K.', 'Omar L.', 'Lina H.', 'Rachid D.', 'Meriem A.'];

export function demoWorld(kind: DemoKind, brand: string): World {
  const today = ymd(new Date());
  const add = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const plan: Status[] = kind === 'immo' ? []
    : ['loue', 'loue', 'loue', 'loue', 'loue', 'retour', 'depart', 'depart', 'dispo', 'dispo', 'dispo', 'dispo', 'dispo', 'atelier', 'atelier', 'loue', 'dispo', 'retour'];
  const cars = plan.map<MapCar>((status, i) => {
    const out = status === 'loue' || status === 'retour' || status === 'depart';
    const booking = out ? {
      id: `demo-b${i}`, client_name: NAMES[i % NAMES.length]!, client_phone: null,
      start_date: status === 'depart' ? today : add(-2 - (i % 3)), end_date: status === 'retour' ? today : add(2 + (i % 4)),
      final_price: 300 + i * 20, payment_status: i % 4 === 0 ? 'PARTIAL' : 'PAID', status: 'CONFIRMED',
      client_price_per_day: null, owner_price_per_day: null, profit_kouider: null, nb_days: null,
    } as Booking : null;
    const due = i % 4 === 0 && booking ? 120 : 0;
    const alerts: SmartReminder[] = i === 3 ? [{ id: 'demo-a', type: 'late', priority: 'HIGH', client_name: NAMES[3]!, car_name: MODELS[3]!, date: today, message: 'Retour prévu hier, client injoignable', action: '' } as unknown as SmartReminder] : [];
    return { id: `demo-${i}`, name: MODELS[i % MODELS.length]!, status, booking, due, alerts, badge: badgeOf(status, due, alerts) };
  });
  const it = (p: string, labels: string[], sub?: (i: number) => string): Item[] => labels.map((label, i) => ({ id: `${p}${i}`, label, sub: sub?.(i) }));
  return {
    brand: brand || 'VOTRE ENTREPRISE',
    zones: DEMO_ZONES[kind],
    cars,
    sales: kind === 'vente' ? it('s', ['Golf 7 2019', 'Tucson 2021', '208 GT 2022', 'Clio 4 2018', 'Duster 2020', 'Passat 2017', 'Kia Sportage 2021'], i => `${(9500 + i * 1400).toLocaleString('fr-FR')} €`) : [],
    imports: kind === 'vente' || kind === 'transport' ? it('i', ['Audi A3 · Allemagne', 'Toyota RAV4 · Belgique', 'Golf 8 · France'], () => 'En mer') : [],
    properties: kind === 'immo' ? it('p', ['F3 Hay Badr', 'Villa Canastel', 'F4 Front de mer', 'Local commercial', 'Studio centre', 'F2 Akid Lotfi'], i => (i % 2 ? 'À vendre' : 'À louer')) : [],
    packs: [], pending: 4, sites: 0, prospects: 0, replies: 0,
  };
}
