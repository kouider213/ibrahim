/**
 * 🩺 CONSEILLER SANTÉ & COMPLÉMENTS PERSONNEL (11/11, Kouider : « je veux pouvoir lui demander tout et n'importe quoi,
 * comme le document médical, quelle protéine / créatine prendre, quel complément serait bien pour moi, avec toutes les
 * infos qu'il a sur moi, santé etc. — il doit savoir me répondre parfaitement »).
 * Avant : « quelle créatine prendre ? » ne déclenchait rien (ni créatine ni complément dans les mots reconnus) → réponse
 * générique, sans son poids, sa sèche, sa prise de sang, son traitement (interactions !), son budget ni le halal.
 * Ici : le code rassemble TOUT son dossier santé et le pose à côté de la question, avec les règles de prudence.
 * Données santé = app_kv uniquement (repo public) : rien n'est écrit ici en dur.
 */
import { localNow } from './morning-routine.js';

const SUPP = /quelles? prot[ée]ines?|prot[ée]ines? (je |dois[- ]je |à |a )?(dois |devrais )?(prendre|acheter)|cr[ée]atine|whey|prot[ée]ines? en poudre|poudre de prot|isolat|cas[ée]ine|gainer|bcaa|eaa|glutamine|pr[ée][- ]?workout|pre[- ]?work|booster|br[ûu]leur|fat ?burner|compl[ée]ments?|suppl[ée]ments?|vitamines?|vit\.? ?[a-e]\d?\b|magn[ée]sium|zinc|om[ée]ga|fer\b|ashwagandha|maca|ginseng|tribulus|collag[èe]ne|caf[ée]ine en|multivit|probiotique|m[ée]latonine|électrolytes?|elecrolytes?/i;
const HEALTH = /ma sant[ée]|mes analyses|ma prise de sang|mon bilan (sanguin|de sant[ée])|mes r[ée]sultats|cholest[ée]rol|testost[ée]rone|glyc[ée]mie|tension|carence|fatigue chronique|j'ai mal|mal (au|aux|à la|a la)|douleur|sympt[ôo]me|maladie|m[ée]decin|docteur|pharmacien|ordonnance|est-ce (que c'est )?(dangereux|grave|normal)|effets? secondaires?|interaction|c'est bon pour (moi|ma sant[ée])|r[ée]cup[ée]ration|courbatures?|crampes?|insomnie|digestion|ballonn/i;
const ASK = /\?|quel|quelle|c'est quoi|\bquoi\b|meilleur|mieux|\bou\b|lequel|laquelle|combien|comment|est-ce|tu me (conseill|recommand)|conseille|recommande|je (dois|devrais|peux)|faut[- ]il|c'est (bien|bon|utile|mieux)|vaut[- ]il|pour moi|explique|dis[- ]moi|ton avis|t'en penses|tu en penses/i;
const NOT = /\b(client|voiture|location|r[ée]serv|clio|houari|whatsapp|mail|facture|devis|prospect)\b/i;

export function isHealthQuestion(q: string): boolean {
  const t = q.replace(/^\s*\[[\s\S]*?\]\s*/, '').replace(/[’`]/g, "'").trim();
  if (t.length < 8 || t.length > 600 || NOT.test(t)) return false;
  if (/\bj'?ai (tr[eè]s |trop |encore )?mal\b|\bdouleur|\bsympt[ôo]me|\bje me sens (mal|faible|bizarre)|\bvertige|naus[ée]e/i.test(t)) return true;   // symptôme dit sans question
  return (SUPP.test(t) || HEALTH.test(t)) && ASK.test(t);
}


/** Tout ce qu'on sait sur sa santé, source par source (jamais inventé : une ligne absente = donnée inconnue). */
export async function healthDossier(): Promise<string> {
  const today = localNow().date;
  const [prof, snap, labs, lib, libLog, sleep] = await Promise.all([
    import('./forme.js').then(m => m.getFormeProfile('kouider')).catch(() => null),
    import('./forme-cut.js').then(m => m.formeSnapshot()).catch(() => ''),
    import('./vitalite.js').then(m => m.readLabs()).catch(() => []),
    import('./liberte.js').then(m => m.getLib()).catch(() => null),
    import('./liberte.js').then(m => m.readLibLog()).catch(() => []),
    import('./sleep-coach.js').then(m => m.sleepContextLine()).catch(() => ''),
  ]);
  const lines: string[] = [];
  if (prof) lines.push(`PROFIL : homme ${prof.age ?? '?'} ans, ${prof.heightCm ?? '?'} cm, ${prof.weightKg ?? '?'} kg, cible ${prof.targetKg ?? '?'} kg (PLANCHER, jamais dessous), objectif « ${prof.goal} » (sèche puis recomposition : ventre plat, abdos, bras, pecs), ${prof.sessionsPerWeek} séances/sem à ${prof.gym}, courses chez ${(prof.stores ?? []).join(' / ')}, budget nourriture ${prof.budgetWeek} €/sem, ${prof.mealsPerDay} repas/j. MUSULMAN : tout doit être HALAL (gélules en gélatine de porc interdites → gélules végétales / certifié halal ; pas d'alcool dans les extraits).`);
  if (snap) lines.push(snap);
  if (sleep) lines.push(`SOMMEIL : ${sleep}`);
  const last = labs.length ? labs[labs.length - 1]! : null;
  if (last) {
    const bad = last.items.filter(i => i.flag === 'bas' || i.flag === 'haut');
    lines.push(`PRISE DE SANG du ${last.date} (normes du labo) : ${last.items.map(i => `${i.name} ${i.value ?? '?'} ${i.unit}${i.flag !== 'normal' && i.flag !== '?' ? ` [${i.flag.toUpperCase()}]` : ''}`).join(' · ')}${bad.length ? ` → HORS NORMES : ${bad.map(i => `${i.name} ${i.flag}`).join(', ')}` : ' → tout dans les normes'}.`);
  } else lines.push('PRISE DE SANG : aucune enregistrée (s\'il en a une, il peut l\'envoyer en photo/PDF avec « ma prise de sang »).');
  if (lib) {
    const taken = libLog.filter(l => l.kind === 'prise' && l.at.slice(0, 10) === today).reduce((s, l) => s + (l.n ?? 0), 0);
    lines.push(`TRAITEMENT (PRIVÉ, jamais à voix haute en voiture) : il prend ${lib.med || 'un antidouleur'} (opioïde/antalgique) en BAISSE PROGRESSIVE avec son programme Liberté (${taken} demi(s) aujourd'hui). ⚠️ INTERACTIONS : rien de sérotoninergique (millepertuis, 5-HTP, tryptophane, SAMe), pas de sédatifs ni de plantes « calmantes » fortes (kava, valériane à haute dose, ashwagandha pendant la baisse), pas de mélatonine sans avis du pharmacien ; constipation fréquente avec ce traitement → fibres, eau, magnésium citrate possible après avis.`);
  }
  lines.push('DOS : à ménager (exercices et conseils sans risque pour le dos).');
  return lines.join('\n');
}

// 13/11 Kouider : « les compléments que je dois prendre, trouve-moi les meilleurs et pas chers, que je puisse tous les commander au même endroit
// et commencer » → le code cherche les boutiques / prix AVANT le cerveau (le gratuit oubliait web_search) ; réponse = UN panier dans UNE boutique.
const BUY = /command|achet|acheter|o[ùu] (les )?(trouver|prendre|acheter)|pas ch[eè]re?s?|moins ch[eè]re?s?|meilleur prix|prix|budget|m[êe]me endroit|m[êe]me site|m[êe]me magasin|un seul (site|magasin|endroit)|panier|livr|commencer/i;
async function shopSearch(): Promise<string> {
  const { multiProviderWebSearch } = await import('./web-search-provider.js');
  const y = localNow().date.slice(0, 4);
  const qs = [`site pas cher compléments sport livraison Belgique créatine monohydrate whey isolat vitamine D3 prix ${y}`,
    `créatine monohydrate whey isolat vitamine D3 magnésium oméga 3 halal prix comparatif Belgique ${y}`];
  const rs = await Promise.all(qs.map(q => Promise.race([multiProviderWebSearch(q, 'health-shop').catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 9000))])));
  return rs.filter(r => r && r.results_count > 0 && !/^NO_DATA/.test(r.text)).map(r => r!.text.slice(0, 1800)).join('\n---\n');
}

export async function healthAdvisorHint(userMessage: string): Promise<string> {
  if (!isHealthQuestion(userMessage)) return '';
  const supp = SUPP.test(userMessage);
  const buy = supp && BUY.test(userMessage);
  const [dossier, shops] = await Promise.all([healthDossier().catch(() => ''), buy ? shopSearch().catch(() => '') : Promise.resolve('')]);
  return [
    `CONSEILLER SANTÉ PERSONNEL (Kouider veut une réponse PARFAITE et faite pour LUI, pas un article générique) :`,
    `• Réponds d'abord DIRECTEMENT à sa question en 1-2 phrases (ex. « Oui, prends de la créatine monohydrate, 3 à 5 g par jour »).`,
    `• Puis « **Pour toi** » : relie CHAQUE conseil à SES données ci-dessous (poids, sèche et plancher de poids, protéines visées, séances, sommeil, valeurs de SA prise de sang, son traitement). Cite ses vrais chiffres. N'invente aucune valeur absente.`,
    supp ? `• Compléments : pour chacun → forme exacte (ex. créatine MONOHYDRATE, whey ISOLAT), dose en g ou mg, moment de prise, durée, ce que ça apporte VRAIMENT (niveau de preuve : solide / moyen / faible), prix indicatif, et ce qu'il faut vérifier sur l'étiquette (certifié halal, gélules végétales, label anti-dopage type Informed Sport si possible). Calcule les doses avec SON poids (ex. protéines : ses grammes visés par jour du dossier − ce qu'il mange déjà → combien de doses de whey). Dis aussi clairement ce qui est INUTILE pour lui (boosters de testo, brûleurs de graisse, BCAA si protéines suffisantes…) et pourquoi.` : '',
    `• S'il demande où acheter / quelle marque / un prix actuel : appelle web_search (Belgique, magasins ou sites qui livrent en Belgique) et donne 2-3 options concrètes avec prix et source — jamais de marque inventée.`,
    buy ? `• IL VEUT COMMANDER : fais SA liste de compléments utiles POUR LUI (pas plus de 4-5, d'abord ce qui corrige sa prise de sang et sert sa sèche ; rien d'inutile), puis choisis UNE SEULE boutique (site qui livre en Belgique) où il trouve TOUT, la moins chère parmi les sérieuses d'après les RÉSULTATS ci-dessous. Donne le **panier** : produit exact (forme, dosage, taille du pot), prix unitaire, combien de temps dure le pot, TOTAL du panier et coût par mois, lien de la boutique, et s'il existe un code promo / une promo visible dans les résultats. Un prix absent des résultats = « prix à vérifier sur le site », jamais inventé. Termine par « **Pour commencer** » : quoi prendre dès la réception, à quelle heure, avec quoi (repas, eau), et ce qu'il doit demander à son médecin AVANT (vit D à haute dose, tout ce qui touche à la testostérone, interactions avec son traitement).` : '',
    buy ? (shops ? `RÉSULTATS RECHERCHE BOUTIQUES / PRIX (faite par le code — n'utilise que ça pour les prix et les noms de boutique ; relance web_search si un produit manque) :\n${shops}` : `RECHERCHE BOUTIQUES : rien trouvé. Appelle web_search (« créatine monohydrate prix Belgique », etc.) avant de citer une boutique ou un prix.`) : '',
    `• Sécurité : vérifie chaque conseil contre SON TRAITEMENT et SA prise de sang ; si un produit peut interagir ou si une valeur est hors normes, dis-le clairement et ajoute « **À demander à ton pharmacien / médecin** » avec la question exacte à poser. Jamais de produit dopant, de diurétique, ni de dose au-dessus des limites officielles.`,
    `• Document médical, analyse, symptôme : explique simplement ce que veulent dire SES valeurs (normes du labo), ce qui est bien, ce qui est à surveiller, et quoi faire concrètement (alimentation, sport, sommeil, quand consulter). Si c'est urgent (douleur thoracique, essoufflement, sang, malaise) → dis-lui d'appeler le 112 / son médecin tout de suite.`,
    `• Finis par **Ton plan** : 3-4 actions précises (quoi acheter, quand prendre, quoi suivre dans FORME) + sources sérieuses (ISSN, EFSA, HAS, études) en fin de message.`,
    `• Format Telegram : **gras** et puces « • », pas de « ### », pas de tableaux. Tutoie-le.`,
    dossier ? `\nSON DOSSIER SANTÉ (données réelles, à utiliser) :\n${dossier}` : '',
  ].filter(Boolean).join('\n');
}
