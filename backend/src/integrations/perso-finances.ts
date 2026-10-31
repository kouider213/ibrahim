// FINANCES PERSO DE KOUIDER (31/10/2026, demande de Kouider) : son emploi salarié, son salaire, ses charges fixes,
// ce qu'il met de côté, son revenu d'appoint, son épargne. Tout est dans app_kv `perso:finances` (PRIVÉ — le dépôt est public :
// aucun chiffre ni aucune activité dans le code). Injecté dans son dossier (chat, appels, coach) + compté dans « ma fortune »
// et dans le Miroir du futur. Outil mes_finances.
import { kvJson, kvPut } from './ai-util.js';

const KEY = 'perso:finances';
type Charge = { label: string; amount: number; until?: string /* AAAA-MM = dernier mois payé */ };
export type Finances = {
  job?: string;                 // ex. « employé dans une librairie »
  salary?: number;              // net mensuel €
  extras?: Array<{ label: string; amount: number; per: 'semaine' | 'mois' }>;  // autres rentrées régulières
  charges: Charge[];
  monthlySaving?: number;       // mis de côté chaque mois sur le salaire
  side?: { label: string; dailyMin: number; dailyMax: number; when: string; note?: string };  // revenu d'appoint
  savings?: number;             // épargne totale €
  sideCash?: number;            // ce que le revenu d'appoint a déjà mis de côté €
  notes?: string[];
  updated?: string;
};

export const loadFinances = () => kvJson<Finances>(KEY, { charges: [] });
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const ym = (d = new Date()) => d.toISOString().slice(0, 7);
/** Mensualités restantes à partir du mois prochain (le mois en cours est considéré payé). */
export function monthsLeft(until?: string, from = new Date()): number {
  if (!until) return Infinity;
  const [y, m] = until.split('-').map(Number);
  return Math.max(0, (y! - from.getUTCFullYear()) * 12 + (m! - (from.getUTCMonth() + 1)));
}
const active = (f: Finances) => f.charges.filter(c => !c.until || c.until >= ym());

export function budget(f: Finances) {
  const charges = active(f).reduce((s, c) => s + c.amount, 0);
  const salary = f.salary ?? 0, save = f.monthlySaving ?? 0;
  const extra = (f.extras ?? []).reduce((t, e) => t + (e.per === 'semaine' ? e.amount * 52 / 12 : e.amount), 0);
  return { salary, extra, charges, save, rest: salary + extra - charges - save };
}

/** Dettes restantes (charges avec une fin) — pour « ma fortune ». */
export function debts(f: Finances): Array<{ label: string; eur: number; months: number; amount: number }> {
  return active(f).filter(c => c.until && /crédit|credit|prêt|pret|leasing/i.test(c.label))
    .map(c => { const months = monthsLeft(c.until); return { label: `${c.label} (reste ${months} × ${eur(c.amount)})`, eur: months * c.amount, months, amount: c.amount }; })
    .filter(d => d.months > 0);
}

/** Lignes ajoutées à fortune() : épargne, caisse d'appoint, crédits restants. */
export async function fortuneLines(): Promise<Array<{ label: string; kind: string; eur: number }>> {
  const f = await loadFinances().catch(() => ({ charges: [] } as Finances));
  return [
    ...(f.savings ? [{ label: 'Épargne', kind: 'épargne', eur: f.savings }] : []),
    ...(f.sideCash ? [{ label: `Caisse ${f.side?.label ?? 'appoint'}`, kind: 'épargne', eur: f.sideCash }] : []),
    ...debts(f).map(d => ({ label: d.label, kind: 'dette', eur: -d.eur })),
  ];
}

/** Pour son dossier (contexte privé du cerveau). */
export async function financesText(): Promise<string> {
  const f = await loadFinances().catch(() => null);
  if (!f || (!f.job && !f.salary && !f.side)) return '';
  const b = budget(f);
  return ['FINANCES PERSO DE KOUIDER (STRICTEMENT PRIVÉ : seulement avec lui, en tête-à-tête. Jamais dans un document, PDF, business plan, mail ou message pour quelqu\'un d\'autre, jamais à un client, à Houari, Houari bof ou la famille. Le revenu d\'appoint n\'apparaît JAMAIS dans les chiffres FIK ni dans un dossier banque/partenaire.)',
    f.job ? `- Emploi salarié : ${f.job}. Dans l'agenda, « travail » / « taf » = ce poste (pas FIK). FIK et ses projets sont EN PLUS de ce travail.` : '',
    f.salary ? `- Salaire net : ${eur(f.salary)}/mois.` : '',
    ...(f.extras ?? []).map(e => `- En plus : ${e.label} ${eur(e.amount)}/${e.per}${e.per === 'semaine' ? ` (≈ ${eur(e.amount * 52 / 12)}/mois)` : ''}.`),
    active(f).length ? `- Charges fixes : ${active(f).map(c => `${c.label} ${eur(c.amount)}/mois${c.until ? ` jusqu'à ${c.until.slice(5)}/${c.until.slice(0, 4)} (encore ${monthsLeft(c.until)} mois)` : ''}`).join(' ; ')} — total ${eur(b.charges)}.` : '',
    f.monthlySaving ? `- Met de côté ${eur(f.monthlySaving)}/mois sur le salaire.` : '',
    f.salary ? `- Reste pour les dépenses variables (courses, essence, famille…) : ≈ ${eur(b.rest)}/mois.` : '',
    f.side ? `- Revenu d'appoint (${f.side.label}) : ${eur(f.side.dailyMin)} à ${eur(f.side.dailyMax)} de chiffre d'affaires par jour, ${f.side.when}.${f.side.note ? ` ${f.side.note}` : ''}` : '',
    f.savings ? `- Épargne : ${eur(f.savings)}.` : '',
    f.sideCash ? `- Mis de côté grâce à l'appoint : ≈ ${eur(f.sideCash)}.` : '',
    ...(f.notes ?? []).slice(-5).map(n => `- ${n}`),
    await import('./argent-coach.js').then(m => m.argentText()).catch(() => ''),
    await import('./projets-business.js').then(m => m.projetsText()).catch(() => ''),
    `- Mis à jour le ${f.updated ?? '?'}. S'il annonce une augmentation, une nouvelle charge, une fin de crédit ou un nouveau montant d'épargne → outil mes_finances (set / charge). Ne lui redemande pas ces chiffres.`,
  ].filter(Boolean).join('\n');
}

const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : undefined; };

export async function financesTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'show');
  const other = await import('./argent-coach.js').then(m => m.argentTool(action, input));
  if (other !== null) return other;
  const f = await loadFinances();
  if (action === 'set') {
    if (input['job']) f.job = String(input['job']);
    for (const [k, field] of [['salary', 'salary'], ['monthly_saving', 'monthlySaving'], ['savings', 'savings'], ['side_cash', 'sideCash']] as const) {
      const n = num(input[k]); if (n !== undefined) (f as Record<string, unknown>)[field] = n;
    }
    if (f.side) { const a = num(input['side_min']), z = num(input['side_max']); if (a !== undefined) f.side.dailyMin = a; if (z !== undefined) f.side.dailyMax = z; }
    if (input['note']) f.notes = [...(f.notes ?? []), String(input['note'])].slice(-20);
  } else if (action === 'extra') {
    const label = String(input['label'] ?? '').trim() || 'rentrée en plus';
    const l = (f.extras ?? []).filter(e => e.label.toLowerCase() !== label.toLowerCase());
    const amount = num(input['amount']);
    if (String(input['op'] ?? 'set') !== 'remove') { if (amount === undefined) return '❌ Il me faut le montant (amount).'; l.push({ label, amount, per: /sem/i.test(String(input['per'] ?? '')) ? 'semaine' : 'mois' }); }
    f.extras = l;
  } else if (action === 'charge') {
    const label = String(input['label'] ?? '').trim();
    if (!label) return '❌ Il me faut le nom de la charge (label).';
    const i = f.charges.findIndex(c => c.label.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(c.label.toLowerCase()));
    if (String(input['op'] ?? 'set') === 'remove') { if (i >= 0) f.charges.splice(i, 1); }
    else {
      const amount = num(input['amount']);
      const until = /^\d{4}-\d{2}$/.test(String(input['until'] ?? '')) ? String(input['until']) : undefined;
      if (i >= 0) Object.assign(f.charges[i]!, { ...(amount !== undefined ? { amount } : {}), ...(until ? { until } : {}) });
      else if (amount !== undefined) f.charges.push({ label, amount, ...(until ? { until } : {}) });
      else return '❌ Il me faut le montant mensuel (amount).';
    }
  }
  if (action !== 'show' && action !== 'budget') { f.updated = new Date().toISOString().slice(0, 10); await kvPut(KEY, f); }
  if (!f.job && !f.salary && !f.charges.length) return '💶 Je n\'ai encore rien sur tes finances perso. Dis-moi ton salaire, tes charges fixes et ce que tu mets de côté.';
  const b = budget(f);
  const freed = debts(f).map(d => `fin de ${d.label.split(' (')[0]} dans ${d.months} mois → +${eur(d.amount)}`);
  return [`💶 Tes finances perso${action === 'show' || action === 'budget' ? '' : ' (mis à jour ✅)'}`,
    f.job ? `• Travail : ${f.job}` : '',
    `• Salaire net : ${eur(b.salary)}/mois`,
    ...(f.extras ?? []).map(e => `• + ${e.label} : ${eur(e.amount)}/${e.per}${e.per === 'semaine' ? ` (≈ ${eur(e.amount * 52 / 12)}/mois)` : ''}`),
    ...active(f).map(c => `• − ${c.label} : ${eur(c.amount)}${c.until ? ` (jusqu'à ${c.until.slice(5)}/${c.until.slice(0, 4)}, encore ${monthsLeft(c.until)} mois)` : ''}`),
    f.monthlySaving ? `• − Mis de côté : ${eur(f.monthlySaving)}` : '',
    `= Reste pour vivre (courses, essence, imprévus) : ${eur(b.rest)}/mois`,
    f.side ? `• Appoint (${f.side.label}) : ${eur(f.side.dailyMin)}–${eur(f.side.dailyMax)} de CA/jour, ${f.side.when}` : '',
    f.savings ? `• Épargne : ${eur(f.savings)}` : '',
    f.sideCash ? `• De côté grâce à l'appoint : ${eur(f.sideCash)}` : '',
    f.monthlySaving && f.savings ? `📈 À ce rythme : ${eur(f.savings + f.monthlySaving * 12)} dans 1 an, ${eur(f.savings + f.monthlySaving * 24)} dans 2 ans (sans compter FIK ni l'appoint).` : '',
    ...freed.map(x => `🔓 ${x}/mois de libre`),
  ].filter(Boolean).join('\n');
}
