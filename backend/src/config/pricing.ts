export interface VehiclePricing {
  name:         string;
  houariPrice:  number;
  kouiderPrice: number;
  benefit:      number;
}

export const VEHICLE_PRICING: VehiclePricing[] = [
  { name: 'Jumpy 9p',      houariPrice: 44, kouiderPrice: 55, benefit: 11 },
  { name: 'Berlingo',      houariPrice: 44, kouiderPrice: 55, benefit: 11 },
  { name: 'Jogger',        houariPrice: 37, kouiderPrice: 50, benefit: 13 },
  { name: 'Sandero',       houariPrice: 22, kouiderPrice: 35, benefit: 13 },
  { name: 'Clio 5',        houariPrice: 37, kouiderPrice: 45, benefit:  8 },
  { name: 'Clio 5 Alpine', houariPrice: 44, kouiderPrice: 50, benefit:  6 },
  { name: 'Clio 4 v1',     houariPrice: 18, kouiderPrice: 35, benefit: 17 },
  { name: 'Clio 4 v2',     houariPrice: 24, kouiderPrice: 35, benefit: 11 },
  { name: 'i10',           houariPrice: 19, kouiderPrice: 25, benefit:  6 },
  { name: 'Fiat 500',      houariPrice: 24, kouiderPrice: 35, benefit: 11 },
  { name: 'R.Duster',      houariPrice: 31, kouiderPrice: 45, benefit: 14 },
  { name: 'D.Duster',      houariPrice: 44, kouiderPrice: 50, benefit:  6 },
  { name: 'Creta',         houariPrice: 24, kouiderPrice: 45, benefit: 21 },
  { name: 'Fiat 500 XL',   houariPrice: 37, kouiderPrice: 45, benefit:  8 },
];

export function getPricingForVehicle(vehicleName: string): VehiclePricing | undefined {
  const name = vehicleName.toLowerCase();
  return VEHICLE_PRICING.find(p => name.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name));
}

export function formatPricingTable(): string {
  return VEHICLE_PRICING.map(p =>
    `${p.name.padEnd(14)} | Houari: ${p.houariPrice}€ | Kouider: ${p.kouiderPrice}€ | Bénéfice: ${p.benefit}€`,
  ).join('\n');
}
