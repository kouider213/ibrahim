/**
 * 06/11 — FAITS DU MONDE faits par le CODE. La règle du prompt (« web_search d'abord ») était suivie une fois sur deux par les
 * cerveaux gratuits (banc : banques belges → aucune recherche, grève → recherche « novembre 2024 », devises → pas de source).
 * Pour une question d'actu / loi / économie, le code cherche lui-même AVANT le cerveau et lui pose les résultats à côté de la question.
 */
import { multiProviderWebSearch } from './web-search-provider.js';

const WORLD = /\b(actu|actualit|news|info(s)? du jour|gr[eè]ve|loi\b|lois\b|d[ée]cret|douane|devise|inflation|[ée]conomi|banque|bancaire|crise|r[ée]cession|dette|guerre|conflit|[ée]lection|pr[ée]sident|gouvernement|ministre|p[ée]trole|carburant|essence|gasoil|bourse|crypto|bitcoin|hack|pirat|cyber|[ée]pid[ée]mie|virus|vaccin|visa|imp[ôo]t|taxe|tva|smic|retraite|ch[ôo]mage|sanction|nouvelle r[èe]gle|interdit|autoris[ée])/i;
const ASK = /\?|est.?ce|c'?est quoi|combien|peu(t|vent)|quel|quand|pourquoi|comment|\bsi\b|vrai|il y a|y a.?t.?il|dis.?moi|explique/i;
// business / perso → la base ou ses outils, jamais internet ; taux Square et or ont leurs propres outils
const OWN = /r[ée]sa\b|r[ée]serv|location|loue|client|flotte|fik|caisse|b[ée]n[ée]fice|mes finances|mon salaire|ma s[ée]ance|calorie|square|\bor\b|gold|liber|m[ée]dica|vol\b|billet d'avion|air alg[ée]rie/i;

export function isWorldQuestion(msg: string): boolean {
  const m = msg.trim();
  return m.length >= 12 && m.length <= 600 && WORLD.test(m) && ASK.test(m) && !OWN.test(m);
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Consigne + résultats à mettre à côté de la question, ou '' si ce n'est pas une question du monde. */
export async function worldFactsHint(msg: string): Promise<string> {
  if (!isWorldQuestion(msg)) return '';
  const now = new Date();
  const today = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' });
  const query = `${msg.replace(/\s+/g, ' ').slice(0, 200)} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const r = await Promise.race([
    multiProviderWebSearch(query, 'world-facts').catch(() => null),
    new Promise<null>(res => setTimeout(() => res(null), 9000)),
  ]);
  const found = r && r.results_count > 0 && !/^NO_DATA/.test(r.text);
  const rules = `Nous sommes le ${today}. Question sur le monde (actu / loi / économie) : réponds à partir des RÉSULTATS ci-dessous, pas de ta mémoire. `
    + `Donne le PAYS, la DATE et la SOURCE (nom du site) de chaque fait. Une info d'un autre pays ou ancienne : dis-le clairement, ne la présente pas comme nouvelle ni comme algérienne/belge. `
    + `Sépare « ce qui est sûr (source) » de « mon avis ». N'invente aucun chiffre, date, numéro de téléphone ni événement passé absent des résultats. `
    + `Tu peux relancer web_search avec une meilleure requête (année ${now.getFullYear()}) si les résultats ne répondent pas.`;
  if (!found) return `${rules}\nRÉSULTATS : aucun (recherche vide). Si web_search ne trouve rien non plus : dis « je n'ai pas de source sûre » et ne donne que des principes généraux, sans chiffres ni dates inventés.`;
  return `${rules}\nRÉSULTATS RECHERCHE INTERNET (faite par le code, ${r!.source}) :\n${r!.text.slice(0, 3500)}`;
}
