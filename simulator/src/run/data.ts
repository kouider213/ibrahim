// LA GRANDE COURSE DE FENNOU — données du jeu (mondes, objets, missions).
// Pensé pour un tout-petit (≈ 1-2 ans) qui ne lit pas : tout passe par l'image, la voix et le son ; jamais d'échec.

export interface Item { id: string; e: string; fr: string; say?: string; kind: 'animal' | 'fruit' | 'vehicle' | 'color' | 'shape' | 'family' | 'thing' }

export const ITEMS: Item[] = [
  // Animaux (avec leur cri)
  { id: 'chat', e: '🐱', fr: 'le chat', say: 'Miaou !', kind: 'animal' },
  { id: 'chien', e: '🐶', fr: 'le chien', say: 'Ouaf ouaf !', kind: 'animal' },
  { id: 'canard', e: '🦆', fr: 'le canard', say: 'Coin coin !', kind: 'animal' },
  { id: 'vache', e: '🐮', fr: 'la vache', say: 'Meuuuh !', kind: 'animal' },
  { id: 'mouton', e: '🐑', fr: 'le mouton', say: 'Bêêê !', kind: 'animal' },
  { id: 'poule', e: '🐔', fr: 'la poule', say: 'Cot cot codet !', kind: 'animal' },
  { id: 'cheval', e: '🐴', fr: 'le cheval', say: 'Hiiii !', kind: 'animal' },
  { id: 'chameau', e: '🐪', fr: 'le chameau', say: 'Le chameau du désert !', kind: 'animal' },
  { id: 'lion', e: '🦁', fr: 'le lion', say: 'Roaaar !', kind: 'animal' },
  { id: 'lapin', e: '🐰', fr: 'le lapin', say: 'Hop hop hop !', kind: 'animal' },
  { id: 'elephant', e: '🐘', fr: "l'éléphant", say: 'Pouet pouet !', kind: 'animal' },
  { id: 'singe', e: '🐵', fr: 'le singe', say: 'Ouh ouh ah ah !', kind: 'animal' },
  { id: 'poisson', e: '🐟', fr: 'le poisson', say: 'Bloup bloup !', kind: 'animal' },
  { id: 'oiseau', e: '🐦', fr: "l'oiseau", say: 'Cui cui !', kind: 'animal' },
  { id: 'grenouille', e: '🐸', fr: 'la grenouille', say: 'Croa croa !', kind: 'animal' },
  { id: 'ours', e: '🐻', fr: "l'ours", say: 'Grrr !', kind: 'animal' },
  { id: 'tortue', e: '🐢', fr: 'la tortue', say: 'Tout doucement…', kind: 'animal' },
  { id: 'papillon', e: '🦋', fr: 'le papillon', say: 'Il vole, il vole !', kind: 'animal' },
  // Fruits
  { id: 'pomme', e: '🍎', fr: 'la pomme', say: 'Miam, croc !', kind: 'fruit' },
  { id: 'banane', e: '🍌', fr: 'la banane', say: 'Miam !', kind: 'fruit' },
  { id: 'fraise', e: '🍓', fr: 'la fraise', say: 'Miam miam !', kind: 'fruit' },
  { id: 'orange', e: '🍊', fr: "l'orange", say: 'Miam !', kind: 'fruit' },
  { id: 'raisin', e: '🍇', fr: 'le raisin', say: 'Miam !', kind: 'fruit' },
  { id: 'pasteque', e: '🍉', fr: 'la pastèque', say: 'Miam, ça rafraîchit !', kind: 'fruit' },
  // Véhicules (avec leur bruit)
  { id: 'voiture', e: '🚗', fr: 'la voiture', say: 'Vroum vroum !', kind: 'vehicle' },
  { id: 'avion', e: '✈️', fr: "l'avion", say: 'Vvvvvoum !', kind: 'vehicle' },
  { id: 'bateau', e: '⛵', fr: 'le bateau', say: 'Il flotte sur la mer !', kind: 'vehicle' },
  { id: 'train', e: '🚂', fr: 'le train', say: 'Tchou tchou !', kind: 'vehicle' },
  { id: 'bus', e: '🚌', fr: 'le bus', say: 'Tut tut !', kind: 'vehicle' },
  { id: 'velo', e: '🚲', fr: 'le vélo', say: 'Dring dring !', kind: 'vehicle' },
  { id: 'fusee', e: '🚀', fr: 'la fusée', say: 'Trois, deux, un… décollage !', kind: 'vehicle' },
  // Couleurs (cœurs) et formes
  { id: 'rouge', e: '❤️', fr: 'rouge', kind: 'color' }, { id: 'bleu', e: '💙', fr: 'bleu', kind: 'color' },
  { id: 'jaune', e: '💛', fr: 'jaune', kind: 'color' }, { id: 'vert', e: '💚', fr: 'vert', kind: 'color' },
  { id: 'rond', e: '🔴', fr: 'le rond', kind: 'shape' }, { id: 'carre', e: '🟦', fr: 'le carré', kind: 'shape' },
  { id: 'triangle', e: '🔺', fr: 'le triangle', kind: 'shape' }, { id: 'etoile', e: '⭐', fr: "l'étoile", kind: 'shape' },
  // Famille (vraies photos si les parents les ont mises dans Fennou)
  { id: 'papa', e: '👨', fr: 'papa', say: 'Papa t\'aime !', kind: 'family' },
  { id: 'maman', e: '👩', fr: 'maman', say: 'Maman t\'aime !', kind: 'family' },
  // Objets de course
  { id: 'cadeau', e: '🎁', fr: 'le cadeau', kind: 'thing' }, { id: 'note', e: '🎵', fr: 'la musique', kind: 'thing' },
  { id: 'piece', e: '🌟', fr: "l'étoile", kind: 'thing' },
];
export const byId = (id: string) => ITEMS.find(i => i.id === id)!;

export type MissionKind = 'collect' | 'find' | 'color' | 'shape' | 'size' | 'hide' | 'music' | 'family' | 'free';
export const MISSION_ICON: Record<MissionKind, string> = { collect: '🌟', find: '🔍', color: '🌈', shape: '🔺', size: '🐘', hide: '🎁', music: '🎵', family: '👨‍👩‍👦', free: '🏃' };

export interface World {
  id: string; name: string; sky: [string, string]; ground: string; path: string; fog: string; light: string;
  decor: Array<'palm' | 'cactus' | 'dune' | 'pine' | 'rock' | 'flower' | 'mushroom' | 'house' | 'tree' | 'water' | 'boat' | 'planet' | 'crystal' | 'lamp'>;
  pool: string[];                       // ce qu'on y rencontre
  missions: MissionKind[];              // une par niveau (6 niveaux)
}

export const WORLDS: World[] = [
  { id: 'desert', name: 'Le désert', sky: ['#7ec8f2', '#fde2b0'], ground: '#e9c27f', path: '#f4d9a2', fog: '#f7dfb4', light: '#fff1d6',
    decor: ['dune', 'palm', 'cactus', 'rock'], pool: ['chameau', 'lion', 'lapin', 'cheval', 'oiseau', 'tortue', 'pasteque', 'orange'],
    missions: ['collect', 'find', 'color', 'find', 'hide', 'family'] },
  { id: 'oasis', name: "L'oasis", sky: ['#6fc6ff', '#c9f3e3'], ground: '#9fd38a', path: '#e8d7a8', fog: '#cdeedd', light: '#f2fff6',
    decor: ['palm', 'water', 'flower', 'rock'], pool: ['canard', 'grenouille', 'poisson', 'papillon', 'chameau', 'oiseau', 'banane', 'raisin'],
    missions: ['find', 'shape', 'collect', 'size', 'music', 'hide'] },
  { id: 'ferme', name: 'La ferme', sky: ['#8fd3ff', '#fff3c4'], ground: '#8cc66a', path: '#d9b98a', fog: '#e3f2cf', light: '#fffbe8',
    decor: ['tree', 'house', 'flower', 'pine'], pool: ['vache', 'mouton', 'poule', 'cheval', 'chien', 'chat', 'canard', 'lapin', 'pomme', 'fraise'],
    missions: ['find', 'color', 'hide', 'find', 'family', 'size'] },
  { id: 'plage', name: "La plage d'Oran", sky: ['#4fb6ff', '#bdeaff'], ground: '#f3dca5', path: '#fbeccb', fog: '#cfefff', light: '#ffffff',
    decor: ['palm', 'boat', 'water', 'rock'], pool: ['poisson', 'bateau', 'oiseau', 'tortue', 'canard', 'pasteque', 'orange', 'avion'],
    missions: ['collect', 'find', 'music', 'shape', 'hide', 'find'] },
  { id: 'ville', name: 'La ville', sky: ['#93c9ff', '#e8f1ff'], ground: '#a9b6c2', path: '#d8dde3', fog: '#e4ebf3', light: '#ffffff',
    decor: ['house', 'tree', 'lamp', 'flower'], pool: ['voiture', 'bus', 'velo', 'train', 'avion', 'chien', 'chat', 'oiseau', 'pomme', 'banane'],
    missions: ['find', 'color', 'size', 'hide', 'music', 'family'] },
  { id: 'etoiles', name: 'Les étoiles', sky: ['#120c3a', '#3a2c7a'], ground: '#2c2466', path: '#5b4fb0', fog: '#2a2160', light: '#c9c0ff',
    decor: ['planet', 'crystal', 'rock', 'mushroom'], pool: ['fusee', 'avion', 'lion', 'ours', 'singe', 'elephant', 'papillon', 'oiseau'],
    missions: ['find', 'shape', 'hide', 'color', 'size', 'collect'] },
];

// Tenues de Fennou débloquées avec les étoiles gagnées
export const OUTFITS = [
  { id: 'none', e: '🦊', name: 'Fennou', stars: 0 },
  { id: 'scarf', e: '🧣', name: 'L\'écharpe', stars: 4 },
  { id: 'hat', e: '🎉', name: 'Le chapeau de fête', stars: 10 },
  { id: 'glasses', e: '🕶️', name: 'Les lunettes', stars: 18 },
  { id: 'cape', e: '🦸', name: 'La cape de héros', stars: 28 },
  { id: 'crown', e: '👑', name: 'La couronne', stars: 40 },
  { id: 'space', e: '🧑‍🚀', name: 'Le casque d\'astronaute', stars: 60 },
] as const;
export type OutfitId = typeof OUTFITS[number]['id'];

// Mélodie « Frère Jacques » (missions musique) — fréquences
export const MELODY = [262, 294, 330, 262, 262, 294, 330, 262, 330, 349, 392, 330, 349, 392, 392, 440, 392, 349, 330, 262, 392, 440, 392, 349, 330, 262, 262, 196, 262, 262, 196, 262];
export const NUM_FR = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
