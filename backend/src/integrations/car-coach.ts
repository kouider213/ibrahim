import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';

// 🚗 « BONJOUR KOUIDER » EN MONTANT EN VOITURE (Kouider 02/11) : à chaque fois que CarPlay se branche, son coach de vie
// lui dit bonjour, lui fait un court discours de motivation BUSINESS, puis une citation — avant le point pratique (trajet,
// clients…). Citations : uniquement des phrases vérifiées avec leur vraie source (jamais de citation « Internet » douteuse).

export const QUOTES: Array<{ q: string; who: string; src: string }> = [
  { q: 'Avec la difficulté vient la facilité.', who: 'le Coran', src: 'sourate 94, verset 6' },
  { q: 'Allah n\'impose à aucune âme une charge supérieure à sa capacité.', who: 'le Coran', src: 'sourate 2, verset 286' },
  { q: 'Attache ton chameau, puis place ta confiance en Dieu.', who: 'le Prophète, paix sur lui', src: 'hadith rapporté par At-Tirmidhi' },
  { q: 'Le prix, c\'est ce que tu paies. La valeur, c\'est ce que tu obtiens.', who: 'Warren Buffett', src: 'lettre aux actionnaires de Berkshire Hathaway, 2008' },
  { q: 'Règle numéro un : ne jamais perdre d\'argent. Règle numéro deux : ne jamais oublier la règle numéro un.', who: 'Warren Buffett', src: 'citée dans ses interviews et biographies' },
  { q: 'Il faut vingt ans pour bâtir une réputation et cinq minutes pour la détruire.', who: 'Warren Buffett', src: 'citée par Berkshire Hathaway' },
  { q: 'Quelqu\'un est assis à l\'ombre aujourd\'hui parce que quelqu\'un a planté un arbre il y a longtemps.', who: 'Warren Buffett', src: 'citée dans sa biographie « The Snowball »' },
  { q: 'Le gros argent ne se fait pas en achetant ou en vendant, mais en attendant.', who: 'Charlie Munger', src: 'associé de Warren Buffett' },
  { q: 'Reste affamé, reste fou.', who: 'Steve Jobs', src: 'discours de Stanford, 2005' },
  { q: 'Ton temps est limité, ne le gâche pas à vivre la vie de quelqu\'un d\'autre.', who: 'Steve Jobs', src: 'discours de Stanford, 2005' },
  { q: 'La moitié de ce qui sépare les entrepreneurs qui réussissent des autres, c\'est la persévérance pure.', who: 'Steve Jobs', src: 'interview Computerworld, 1995' },
  { q: 'Fais une offre tellement bonne que les gens se sentent bêtes de dire non.', who: 'Alex Hormozi', src: 'livre « $100M Offers »' },
  { q: 'Douleur plus réflexion égale progrès.', who: 'Ray Dalio', src: 'livre « Principes »' },
  { q: 'Les lâches ne sont jamais partis, les faibles sont morts en chemin. Il ne reste que nous.', who: 'Phil Knight, fondateur de Nike', src: 'livre « L\'art de la victoire » (Shoe Dog)' },
  { q: 'Apprends à vendre. Apprends à construire. Si tu sais faire les deux, tu seras inarrêtable.', who: 'Naval Ravikant', src: 'publié en 2018' },
  { q: 'La concurrence, c\'est pour les perdants.', who: 'Peter Thiel', src: 'Wall Street Journal, 2014' },
  { q: 'Ce n\'est pas parce que les choses sont difficiles que nous n\'osons pas, c\'est parce que nous n\'osons pas qu\'elles sont difficiles.', who: 'Sénèque', src: 'Lettres à Lucilius, lettre 104' },
  { q: 'Ce qui fait obstacle à l\'action fait avancer l\'action. Ce qui barre la route devient la route.', who: 'Marc Aurèle', src: 'Pensées, livre 5' },
  { q: 'Si tu n\'es pas têtu, tu abandonnes trop tôt. Si tu n\'es pas flexible, tu te cognes la tête contre le mur.', who: 'Jeff Bezos', src: 'assemblée des actionnaires d\'Amazon, 2011' },
  { q: 'Il n\'y a qu\'un seul patron : le client. Il peut licencier tout le monde dans l\'entreprise, du président jusqu\'en bas, simplement en dépensant son argent ailleurs.', who: 'Sam Walton, fondateur de Walmart', src: 'citée par Walmart' },
];

const LAST_K = 'car:greet:last', USED_K = 'car:quotes:used';

async function pickQuote() {
  const used = await kvJson<number[]>(USED_K, []);
  const free = QUOTES.map((_, i) => i).filter(i => !used.includes(i));
  const pool = free.length ? free : QUOTES.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)]!;
  await kvPut(USED_K, (free.length ? used : []).concat(i).slice(-QUOTES.length + 1));
  return QUOTES[i]!;
}

/** Style JARVIS (Kouider 02/11 : « je veux qu'il me parle comme le vrai Jarvis ») : majordome IA calme, précis, élégant,
 *  vouvoiement, une pointe d'humour — heure, météo réelle, état de la journée, puis motivation business et citation.
 *  Court si déjà dit il y a moins de 30 min (arrêt rapide). */
export async function carGreeting(pos: { lat?: number; lng?: number } = {}): Promise<string> {
  const { hhmm } = localNow();
  const h = Number(hhmm.slice(0, 2));
  const hello = h < 5 || h >= 18 ? 'Bonsoir Kouider.' : 'Bonjour Kouider.';
  const last = await kvJson<number>(LAST_K, 0);
  if (Date.now() - last < 30 * 60_000) return 'Re-bonjour Kouider. Content de vous revoir à bord.';
  await kvPut(LAST_K, Date.now());
  let here: { lat: number; lng: number } | null = Number.isFinite(pos.lat) && pos.lat ? { lat: pos.lat!, lng: pos.lng! } : null;
  if (!here) { const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null); if (loc && Date.now() - Date.parse(loc.updated_at) < 6 * 3600_000) here = { lat: loc.lat, lng: loc.lng }; }
  const [quote, off, hard, coach, meteo] = await Promise.all([
    pickQuote(),
    import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false),
    import('./kouider-dossier.js').then(m => m.isHardDay()).catch(() => false),
    import('./grand-coach.js').then(m => m.grandCoachText()).catch(() => ''),
    here ? import('./forme-runs-pro.js').then(m => m.weatherAt(here!.lat, here!.lng, Date.now())).catch(() => null) : Promise.resolve(null),
  ]);
  const time = `Il est ${hhmm.replace(':', ' heures ').replace(/ 00$/, '')}`;
  const weather = meteo ? `, ${Math.round(meteo.temp)} degrés dehors, ${meteo.label.toLowerCase()}${meteo.rain ? ', prudence sur la route' : ''}` : '';
  const tone = hard ? 'Il a demandé une JOURNÉE DURE : doux, rassurant, aucune pression business.'
    : off ? 'Jour de congé (famille) : rappelle le sens de ce qu\'il construit (sa famille, sa liberté, l\'Algérie), sans lui donner de travail.'
    : 'Journée de travail : motive-le sur son business (FIK, ses clients, son objectif du mois, devenir un grand businessman en Algérie) avec UNE priorité concrète pour aujourd\'hui.';
  const speech = await ai(`Tu es JARVIS, l'intelligence artificielle majordome de Kouider (comme le Jarvis d'Iron Man) : voix calme, phrases précises et élégantes, VOUVOIEMENT, assurance tranquille, une petite pointe d'humour fin. Kouider vient de monter dans sa voiture ; tu lui as déjà dit bonjour, l'heure et la météo.
Dis maintenant 3 phrases courtes maximum (15 secondes à l'oral) : un mot sur l'état des choses façon Jarvis (ex. « Tous les systèmes sont opérationnels. »), puis un discours de motivation de coach de vie et de coach business. ${tone}
Ne redis pas bonjour, ni son prénom en premier mot. Il CONDUIT : aucune action à faire au téléphone maintenant (dis « en arrivant » si besoin). Pas d'emoji, pas de liste, pas de citation (elle vient après). N'invente aucun chiffre ni nom : seulement ce qui est dans le contexte, sinon reste général.
Contexte (Grand Coach) : ${coach.slice(0, 1500)}`, { max: 220 }).catch(() => '');
  const fallback = off ? 'Tous les systèmes sont opérationnels. Profitez des vôtres aujourd\'hui, c\'est pour eux que vous construisez tout cela.' : 'Tous les systèmes sont opérationnels. Une seule priorité aujourd\'hui, monsieur : un pas concret pour votre entreprise. Les grands se construisent dans la régularité.';
  return [`${hello} ${time}${weather}.`, (speech || fallback).trim(), `Citation du jour : ${quote.q} ${quote.who[0]!.toUpperCase()}${quote.who.slice(1)}, ${quote.src}.`].join(' ');
}
