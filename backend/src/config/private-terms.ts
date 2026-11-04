/**
 * Noms privés (médicament…) lus depuis l'env PRIVATE_MED_TERMS (« a,b »), jamais écrits dans le code :
 * le dépôt est public. MED_ALT = « |a|b » à coller dans une alternance de regex, ou '' si vide.
 */
const terms = (process.env.PRIVATE_MED_TERMS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export const MED_ALT = terms.length ? '|' + terms.join('|') : '';
