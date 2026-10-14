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

export function buildCars(cars: Car[], bookings: Booking[], reminders: SmartReminder[], dueById: Map<string, number>): MapCar[] {
  const t = ymd(new Date());
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
