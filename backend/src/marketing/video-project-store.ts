import type { SceneSpec } from './scene-assembler.js';

export interface VideoProject {
  id:           string;
  title:        string;
  scenario:     string;
  carName:      string;
  carImageUrl:  string | null;
  carId?:       string;
  voiceScript:  string;
  scenes:       SceneSpec[];
  hashtags:     string[];
  caption:      string;
  style:        string;
  pendingId:    string;
  finalBuffer:  Buffer | null;
  audioBuffer:  Buffer | null;
  provider:     string;
  version:      number;
  createdAt:    string;
}

const _projects   = new Map<string, VideoProject>();
let _latestId: string | null = null;

export function saveVideoProject(
  project: Omit<VideoProject, 'id' | 'createdAt'>,
): VideoProject {
  const id   = `vproj_${Date.now()}`;
  const full = { ...project, id, createdAt: new Date().toISOString() };
  _projects.set(id, full);
  _latestId = id;
  if (_projects.size > 5) {
    const oldest = [..._projects.keys()][0];
    _projects.delete(oldest);
  }
  return full;
}

export function getLatestVideoProject(): VideoProject | null {
  if (!_latestId) return null;
  return _projects.get(_latestId) ?? null;
}

export function updateVideoProject(
  id: string,
  patch: Partial<Pick<VideoProject, 'finalBuffer' | 'audioBuffer' | 'scenes' | 'version' | 'pendingId' | 'provider'>>,
): void {
  const p = _projects.get(id);
  if (p) Object.assign(p, patch);
}

// ── Pre-built storyboards ─────────────────────────────────────────────────────

interface Storyboard {
  title:       string;
  voiceScript: string;
  scenes:      SceneSpec[];
  hashtags:    string[];
}

export function buildClientSearchStoryboard(
  carName: string,
  priceDisplay: string,
  whatsappNumber = '+213 XX XX XX XX',
): Storyboard {
  return {
    title:       'Client qui galere puis trouve Fik Conciergerie',
    voiceScript: `Location Oran cet ete - ne perdez pas votre temps a chercher une voiture au dernier moment. Entre ceux qui ne repondent pas les prix trop eleves et les vehicules plus disponibles ca devient vite complique. Avec Fik Conciergerie vous nous contactez sur WhatsApp on vous repond rapidement et votre ${carName} vous attend a Oran. Livraison possible a l'aeroport. Reservez avant qu'il ne soit trop tard.`,
    hashtags:    ['#locationvoiture', '#oran', '#algerie', '#fikconcierge', '#mre', '#tiktokalgerie', '#aeroportoran', '#locationauto'],
    scenes: [
      {
        type:        'ui_phone_search',
        label:       'Hook - Recherche',
        duration:    3,
        ui_title:    'location voiture oran',
        ui_lines:    ['location voiture oran', 'location oran aeroport', 'voiture oran sans caution', 'location pas cher oran'],
        overlayText: 'Tu arrives a Oran et aucune voiture disponible ?',
      },
      {
        type:        'ui_problem',
        label:       'Galere',
        duration:    3,
        ui_lines:    ['Personne ne repond.', 'Prix trop eleves.', 'Plus de disponibilite.', 'Pas serieux.'],
        overlayText: 'La galere classique...',
      },
      {
        type:        'ui_tiktok',
        label:       'Decouverte TikTok',
        duration:    3,
        ui_title:    'location voiture oran',
        ui_lines:    ['@fikconcierge', `Location Voiture Oran - ${priceDisplay}`, 'Livraison Aeroport', 'Reponse rapide WhatsApp'],
        overlayText: 'Puis il tombe sur Fik Conciergerie.',
      },
      {
        type:        'ui_whatsapp',
        label:       'WhatsApp',
        duration:    4,
        ui_lines:    ['Bonjour avez-vous une voiture', 'disponible ce weekend ?', '|||', 'Oui bien sur ! Quel modele ?', `${carName} disponible - ${priceDisplay}`],
        overlayText: 'Reponse rapide uniquement via WhatsApp.',
      },
      {
        type:        'car_reveal',
        label:       'Voiture prete',
        duration:    5,
        overlayText: `${carName} prete - Livraison aeroport`,
        prompt:      `Cinematic reveal of a clean ${carName} at Oran Ahmed Ben Bella airport arrivals area. Palm trees, clear blue sky, modern terminal in background. Smooth slow camera pull-back. Professional automotive advertisement quality. Real filmed footage look.`,
      },
      {
        type:        'ui_cta',
        label:       'CTA Final',
        duration:    4,
        ui_lines:    ['FIK CONCIERGERIE', 'Location Voiture Oran', 'Livraison Aeroport', `WhatsApp ${whatsappNumber}`, 'Reservez maintenant'],
      },
    ],
  };
}

export function buildAirportArrivalStoryboard(
  carName: string,
  priceDisplay: string,
  whatsappNumber = '+213 XX XX XX XX',
): Storyboard {
  return {
    title:       'Client arrive aeroport - Fik Conciergerie l\'attend',
    voiceScript: `Vous arrivez a l'aeroport d'Oran ? Fik Conciergerie vous attend avec votre ${carName} propre et prete. Livraison directe a l'aeroport Ahmed Ben Bella. Service rapide serieux et transparent. Reservez votre vehicule maintenant sur WhatsApp.`,
    hashtags:    ['#locationvoiture', '#oran', '#aeroportoran', '#fikconcierge', '#algerie', '#mre', '#tiktokalgerie'],
    scenes: [
      {
        type:        'car_airport',
        label:       'Hook - Voiture aeroport',
        duration:    5,
        overlayText: 'Vous arrivez a Oran ?',
        prompt:      `Cinematic shot at Oran Ahmed Ben Bella International Airport Algeria. A clean well-presented ${carName} parked at arrivals. Modern white terminal visible, palm trees, blue sky. Camera slowly orbits the vehicle. Professional and welcoming atmosphere. Real filmed commercial.`,
      },
      {
        type:        'ui_phone_search',
        label:       'Recherche aeroport',
        duration:    3,
        ui_title:    'location voiture aeroport oran',
        ui_lines:    ['location aeroport oran', 'voiture livraison aeroport', 'fik conciergerie oran', 'location rapide oran'],
        overlayText: 'Il cherche une solution rapide...',
      },
      {
        type:        'ui_whatsapp',
        label:       'Contact WhatsApp',
        duration:    4,
        ui_lines:    ['Bonjour j\'arrive a 14h a l\'aeroport', 'avez-vous un vehicule ?', '|||', 'Oui nous vous attendons !', `${carName} confirmee - ${priceDisplay}`],
        overlayText: 'Reponse immediate - voiture confirmee.',
      },
      {
        type:        'car_reveal',
        label:       'Livraison',
        duration:    5,
        overlayText: `Livraison directe aeroport - ${priceDisplay}`,
        prompt:      `A customer with luggage walks out of Oran airport terminal and finds a ${carName} waiting for them, clean and ready. Staff member hands over keys. Professional service atmosphere. Golden hour warm light. Real filmed commercial quality.`,
      },
      {
        type:        'ui_cta',
        label:       'CTA Final',
        duration:    4,
        ui_lines:    ['FIK CONCIERGERIE', 'Livraison Aeroport Oran', `${carName} - ${priceDisplay}`, `WhatsApp ${whatsappNumber}`, 'Reservez maintenant'],
      },
    ],
  };
}

export function buildFleetRevealStoryboard(
  carName: string,
  priceDisplay: string,
): Storyboard {
  return {
    title:       'Presentation vehicule Fik Conciergerie',
    voiceScript: `Fik Conciergerie vous presente le ${carName} disponible a Oran. Vehicule soigne entretenu et livre directement a votre adresse ou a l'aeroport. Prix transparent. Reponse rapide sur WhatsApp. La location de voiture simple et serieuse a Oran.`,
    hashtags:    ['#locationvoiture', '#oran', '#fikconcierge', '#algerie', '#flotte', '#premium', '#tiktokalgerie'],
    scenes: [
      {
        type:        'car_reveal',
        label:       'Reveal cinematique',
        duration:    6,
        overlayText: carName,
        prompt:      `Dramatic cinematic reveal of a ${carName}. Camera starts very close on door handle or front grille detail, slowly pulls back to reveal the full vehicle. Soft studio-quality lighting, clean professional environment. Premium automotive advertisement. Real filmed footage.`,
      },
      {
        type:        'car_drive',
        label:       'Drive Oran',
        duration:    5,
        overlayText: `Disponible a Oran - ${priceDisplay}`,
        prompt:      `Smooth tracking shot of a ${carName} driving on a coastal road in Oran Algeria with Mediterranean sea visible. Camera follows at side angle, smooth gimbal motion. Warm afternoon sunlight. Professional automotive feel. Real filmed car commercial.`,
      },
      {
        type:        'ui_cta',
        label:       'CTA',
        duration:    4,
        ui_lines:    ['FIK CONCIERGERIE', carName, priceDisplay, 'WhatsApp - Reponse rapide', 'Location Oran'],
      },
    ],
  };
}

export function buildCornicheDriveStoryboard(
  carName: string,
  priceDisplay: string,
): Storyboard {
  return {
    title:       'Balade Corniche Oran - Lifestyle',
    voiceScript: `La liberte ca se conduit. Le ${carName} sur la Corniche d'Oran disponible des maintenant avec Fik Conciergerie. Location a ${priceDisplay}. Service livraison disponible. Reservez sur WhatsApp.`,
    hashtags:    ['#locationvoiture', '#oran', '#corniche', '#fikconcierge', '#algerie', '#lifestyle', '#tiktokalgerie'],
    scenes: [
      {
        type:        'car_drive',
        label:       'Corniche',
        duration:    6,
        overlayText: `${carName} - Corniche d'Oran`,
        prompt:      `Cinematic tracking shot of a ${carName} driving along the Corniche d'Oran Algeria with the Mediterranean Sea visible. Rocky coastline, crystal blue water, clear Algerian sky. Smooth gimbal camera follow at medium distance. Golden hour warm tones. Premium lifestyle advertisement.`,
      },
      {
        type:        'car_reveal',
        label:       'Reveal coucher soleil',
        duration:    5,
        overlayText: `Fik Conciergerie - ${priceDisplay}`,
        prompt:      `A ${carName} parked on the Corniche d'Oran overlooking the Mediterranean Sea at sunset. Camera slowly orbits the vehicle at low angle. Warm golden orange tones reflected on the bodywork. Lifestyle automotive photography quality.`,
      },
      {
        type:        'ui_cta',
        label:       'CTA',
        duration:    4,
        ui_lines:    ['FIK CONCIERGERIE', `${carName}`, priceDisplay, 'Corniche Oran', 'WhatsApp - Reservez'],
      },
    ],
  };
}
