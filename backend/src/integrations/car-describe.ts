// 24/11 Kouider : « il doit avoir une description pour tous les véhicules ».
// Description de location écrite sans IA (0 €, instantanée) à partir de la fiche :
// utilisée quand une voiture est ajoutée sans description (app PARC, Dzaryx, partenaires).
// Le site la traduit tout seul en EN/AR.

export interface CarSpecs {
  name: string;
  category?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  seats?: number | null;
}

const INTRO: Record<string, string> = {
  citadine: 'Compacte, économique et facile à garer : idéale pour circuler dans Oran et ses environs.',
  berline: 'Confortable et bien équipée : parfaite pour les longs trajets comme pour la ville.',
  suv: 'Position de conduite haute, espace et confort : à l\'aise en ville comme sur les routes de l\'Ouest algérien.',
  familiale: 'Spacieuse avec un grand coffre : pensée pour les familles, les bagages et les trajets à plusieurs.',
  premium: 'Élégante et soignée : pour un séjour ou un événement où chaque détail compte.',
  utilitaire: 'Pratique et robuste : pour transporter du monde ou du matériel sans souci.',
};

export function carDescription(c: CarSpecs): string {
  const cat = (c.category ?? '').toLowerCase().trim();
  const intro = INTRO[cat] ?? 'Fiable et confortable : une voiture simple et agréable pour tous vos déplacements.';
  const fuel = (c.fuel ?? '').toLowerCase();
  const box = (c.transmission ?? '').toLowerCase();
  const pts = [
    c.seats ? `${c.seats} places` : '',
    fuel.includes('diesel') ? 'Moteur diesel, très économique sur la route' : fuel.includes('hybr') ? 'Motorisation hybride, très sobre' : fuel.includes('elec') || fuel.includes('élec') ? '100 % électrique' : fuel ? 'Moteur essence' : '',
    box.startsWith('auto') ? 'Boîte automatique' : box ? 'Boîte manuelle' : '',
    'Climatisation',
    'Véhicule nettoyé et vérifié avant chaque location',
  ].filter(Boolean);
  return [
    `${c.name.trim()} — ${intro}`,
    '',
    pts.map(p => `• ${p}`).join('\n'),
    '',
    'Récupération et retour à l\'aéroport d\'Oran, sans caution, confirmation rapide sur WhatsApp.',
  ].join('\n');
}
