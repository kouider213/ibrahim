import { supabase } from '../integrations/supabase.js';
import { kvGet } from '../integrations/app-store.js';

export interface VehiclePricing {
  name:         string;
  houariPrice:  number;
  kouiderPrice: number;
  benefit:      number;
  /** Prix client minimum accepté si le client demande une ristourne (jamais affiché sur le site). */
  discountFloor?: number;
}

export const VEHICLE_PRICING: VehiclePricing[] = [
  { name: 'Jumpy 9 Places', houariPrice: 44, kouiderPrice: 55, benefit: 11 },
  { name: 'Jumpy 9p',      houariPrice: 44, kouiderPrice: 55, benefit: 11 },
  { name: 'Berlingo',      houariPrice: 44, kouiderPrice: 55, benefit: 11 },
  { name: 'Jogger',        houariPrice: 37, kouiderPrice: 50, benefit: 13 },
  { name: 'Sandero',       houariPrice: 22, kouiderPrice: 35, benefit: 13 },
  { name: 'Clio 5',        houariPrice: 37, kouiderPrice: 45, benefit:  8 },
  { name: 'Clio 5 Alpine', houariPrice: 44, kouiderPrice: 50, benefit:  6 },
  { name: 'Clio 4 Essence', houariPrice: 16, kouiderPrice: 30, benefit: 14, discountFloor: 25 },
  { name: 'Clio 4 Diesel', houariPrice: 24, kouiderPrice: 35, benefit: 11 },
  { name: 'i10',           houariPrice: 16, kouiderPrice: 30, benefit: 14, discountFloor: 25 },
  { name: 'Fiat 500',      houariPrice: 24, kouiderPrice: 35, benefit: 11 },
  { name: 'R.Duster',      houariPrice: 31, kouiderPrice: 45, benefit: 14 },
  { name: 'D.Duster',      houariPrice: 44, kouiderPrice: 50, benefit:  6 },
  { name: 'Creta',         houariPrice: 24, kouiderPrice: 45, benefit: 21 },
  { name: 'Fiat 500 XL',   houariPrice: 37, kouiderPrice: 45, benefit:  8 },
];

// La table « cars » est la SEULE source des prix : site, admin, partenaires, simulateur et cette grille.
// La liste ci-dessus ne sert que de secours si la base est injoignable ; elle est remplacée
// (en place, mêmes références) au démarrage, toutes les 2 min et après chaque update_car.
// Prix plancher de ristourne : app_kv « pricing:discount_floors » = { car_id: prix € }.
export const DISCOUNT_FLOORS_KEY = 'pricing:discount_floors';

export async function refreshPricing(): Promise<void> {
  try {
    const { data, error } = await supabase.from('cars').select('id, name, base_price, resale_price').order('name');
    if (error || !data?.length) return;
    let floors: Record<string, number> = {};
    try { floors = JSON.parse((await kvGet(DISCOUNT_FLOORS_KEY)) ?? '{}') as Record<string, number>; } catch { /* aucun plancher */ }
    const rows: VehiclePricing[] = (data as { id: string; name: string; base_price: number | null; resale_price: number | null }[])
      .filter(c => c.base_price != null && c.resale_price != null)
      .map(c => ({
        name: c.name, houariPrice: Number(c.base_price), kouiderPrice: Number(c.resale_price),
        benefit: Number(c.resale_price) - Number(c.base_price),
        ...(floors[c.id] != null ? { discountFloor: Number(floors[c.id]) } : {}),
      }));
    if (rows.length) VEHICLE_PRICING.splice(0, VEHICLE_PRICING.length, ...rows);
  } catch { /* on garde la grille précédente */ }
}

void refreshPricing();
setInterval(() => { void refreshPricing(); }, 2 * 60_000).unref?.();

export function getPricingForVehicle(vehicleName: string): VehiclePricing | undefined {
  const name = vehicleName.toLowerCase();
  return VEHICLE_PRICING.find(p => name.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name));
}

export function formatPricingTable(): string {
  return VEHICLE_PRICING.map(p =>
    `${p.name.padEnd(14)} | Houari: ${p.houariPrice}€ | Kouider: ${p.kouiderPrice}€ | Bénéfice: ${p.benefit}€${p.discountFloor ? ` | Ristourne SEULEMENT si le client la demande : ${p.discountFloor}€ minimum` : ''}`,
  ).join('\n');
}
