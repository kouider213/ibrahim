// PLAN ALGÉRIE (01/11/2026, demande de Kouider) : « quand je pourrai quitter la Belgique une fois la maison + la voiture
// payées, quel sera mon salaire chaque mois là-bas avec mes dépenses (école privée du fils…), à partir de quand lancer un
// nouveau business (salle des fêtes, nos propres voitures, notre immobilier…) et combien ça rapportera — chaque détail ».
// Tout est CALCULÉ mois par mois : phase Belgique = projection réaliste (perso-projection), puis vie à Oran avec un budget
// détaillé, puis chaque investissement lancé seulement quand il reste 6 mois de dépenses de côté après l'avoir payé.
// PRIVÉ : ses chiffres viennent d'app_kv (perso:finances.algeriePlan) ; ici seulement des défauts publics sourcés.
import { kvJson, kvPut } from './ai-util.js';
import { kvGet } from './app-store.js';
import { localNow } from './morning-routine.js';
import { buildProjection, fikMonthlyNet, type Projection } from './perso-projection.js';
import { loadFinances } from './perso-finances.js';
import { supabase } from './supabase.js';

/** Réglages du plan (DA sauf mention €). Défauts : sources dans SOURCES, « estimation » = à remplacer par ses prix. */
export interface PlanCfg {
  houseDa: number; houseFeesPct: number; furnitureDa: number; carEur: number; movingEur: number;
  livingDa: number; carRunDa: number; healthDa: number; casnosDaYear: number; catnatDaYear: number; travelEurYear: number;
  maternelleDaMonth: number; primaireDaYear: number; taxPct: number; imprevusPct: number; zakat: boolean; nisabEur: number;
  adblueClients: number; fundMonths: number; settleMonths: number;
  carsN: number; carPriceDa: number; carDaysMonth: number; carPriceDayEur: number; carCostDaYear: number; carDeprecPct: number;
  aptPriceDa: number; aptRentDa: number; aptOccupancy: number; aptChargesPct: number;
  salleInvestDa: number; sallePriceDa: number; salleEventsMonth: number; salleCostsPct: number;
}
export const PLAN_DEFAUT: PlanCfg = {
  houseDa: 40_000_000, houseFeesPct: 7, furnitureDa: 1_500_000, carEur: 20_000, movingEur: 3_000,
  livingDa: 243_000, carRunDa: 18_000, healthDa: 10_000, casnosDaYear: 43_200, catnatDaYear: 15_000, travelEurYear: 1_800,
  maternelleDaMonth: 8_000, primaireDaYear: 450_000, taxPct: 10, imprevusPct: 5, zakat: true, nisabEur: 6_000,
  adblueClients: 0, fundMonths: 6, settleMonths: 3,
  carsN: 2, carPriceDa: 2_400_000, carDaysMonth: 10, carPriceDayEur: 0, carCostDaYear: 120_000, carDeprecPct: 10,
  aptPriceDa: 16_500_000, aptRentDa: 60_000, aptOccupancy: 85, aptChargesPct: 15,
  salleInvestDa: 60_000_000, sallePriceDa: 250_000, salleEventsMonth: 6, salleCostsPct: 40,
};
/** Clés courtes qu'il peut dicter (« salle_prix=300000 ») → champ. */
const ALIAS: Record<string, keyof PlanCfg> = {
  maison: 'houseDa', maison_da: 'houseDa', frais_maison: 'houseFeesPct', meubles: 'furnitureDa', voiture: 'carEur', voiture_eur: 'carEur', demenagement: 'movingEur',
  vie: 'livingDa', vie_da: 'livingDa', voiture_frais: 'carRunDa', sante: 'healthDa', casnos: 'casnosDaYear', catnat: 'catnatDaYear', voyages: 'travelEurYear',
  maternelle: 'maternelleDaMonth', ecole: 'primaireDaYear', ecole_da: 'primaireDaYear', impots: 'taxPct', imprevus: 'imprevusPct', nisab: 'nisabEur',
  adblue_clients: 'adblueClients', clients: 'adblueClients', reserve_mois: 'fundMonths',
  voitures_nb: 'carsN', voitures_prix: 'carPriceDa', voitures_jours: 'carDaysMonth', voitures_prix_jour: 'carPriceDayEur', voitures_frais: 'carCostDaYear',
  appart_prix: 'aptPriceDa', appart_loyer: 'aptRentDa', appart_occupation: 'aptOccupancy',
  salle_invest: 'salleInvestDa', salle_prix: 'sallePriceDa', salle_soirees: 'salleEventsMonth', salle_frais: 'salleCostsPct',
};
export const SOURCES = [
  'Maison : ton prix (4 milliards de centimes = 40 M DA). Frais d\'achat ≈ 7 % = 5 % droits d\'enregistrement + 1 % publicité foncière + notaire (zoomalgerie.com/frais-notaire-achat-immobilier-algerie, demarchesdz.com/notaire-frais).',
  'Vie de famille Oran ≈ 1 600 €/mois au taux officiel, hors loyer (numbeo.com Oran, wise.com Oran) ≈ 243 000 DA.',
  'École : maternelle privée ≈ 7 700 DA/mois en moyenne à Oran (combien-coute.net) ; primaire privée 300 000–600 000 DA/an (vitaminedz.com, guide écoles privées Oran).',
  'CASNOS (sécu + retraite des indépendants) : minimum 43 200 DA/an en 2026 (décret 26-257, upgrowth.dz). CAT-NAT (assurance catastrophes) OBLIGATOIRE pour un propriétaire (ordonnance 03-12).',
  'Voitures de location : prix réel FIK par jour (tes réservations) ; Fiat 500 assemblée à Oran ≈ 2,38 M DA (billetsalgerie.com, 03/2026).',
  'Appartement F3 Oran : ≈ 16,5 M DA loué 75 000 DA/mois dans l\'exemple de jacheteenalgerie.com ; loyers F3 25 000–80 000 DA (zoomalgerie.com) → 60 000 DA retenu ; rendement brut Oran 5–8 %.',
  'Salle des fêtes Oran : 180 000–350 000 DA la soirée (3ersi.com : El Nour 180 000, Cristal 200 000, Kenza 320–350 000). Prix d\'achat/construction d\'une salle : AUCUNE source fiable → 60 M DA = estimation à remplacer.',
  'Change : taux square du jour (gold watch). Crédit immobilier non compté ici : tu as dit maison + voiture PAYÉES avant de partir.',
];

type Inv = { key: 'cars' | 'apt' | 'salle'; label: string; cost: number; at: string | null; fullNet: number; payback: number | null; note: string };
export interface PlanMonth { m: string; inc: Record<string, number>; exp: Record<string, number>; salary: number; liquid: number }
export interface Plan {
  cfg: PlanCfg; rate: number; now: string; moveAt: string | null; moveAtNoBiz: string | null; upfront: Array<[string, number]>; upfrontTotal: number; fundAtMove: number;
  belgium: Projection; months: PlanMonth[]; invs: Inv[]; child: { name: string; birth: string } | null; bizName: string | null; adblueClients: number;
  perClient: number; share: number; fikDayPrice: number; fikDaysYear: number; warnings: string[];
}

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const daFmt = (n: number) => n >= 1_000_000 ? `${(Math.round(n / 100_000) / 10).toLocaleString('fr-FR')} M DA` : `${(Math.round(n / 1000) * 1000).toLocaleString('fr-FR')} DA`;
const ymAdd = (ym: string, n: number) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymLabel = (ym: string) => `${MOIS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const monthsBetween = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const SALLE_SAISON = [0.5, 0.5, 0.7, 0.8, 1.0, 1.4, 1.6, 1.6, 1.3, 1.0, 0.8, 0.8];   // mariages : l'été, moyenne = 1

async function loadCfg(): Promise<Partial<PlanCfg>> {
  const f = await loadFinances() as { algeriePlan?: Partial<PlanCfg> };
  return f.algeriePlan ?? {};
}
/** « salle_prix=300000, voiture=25000 » ou objet → réglages. */
export function parseReglages(v: unknown): Partial<PlanCfg> {
  const out: Partial<PlanCfg> = {};
  const pairs: Array<[string, unknown]> = typeof v === 'object' && v ? Object.entries(v as Record<string, unknown>)
    : String(v ?? '').split(/[,;\n]/).map(x => x.split(/[=:]/)).filter(x => x.length === 2).map(([k, val]) => [k!.trim(), val!.trim()]);
  for (const [k, val] of pairs) {
    const key = (ALIAS[k.toLowerCase().replace(/\s+/g, '_')] ?? (k in PLAN_DEFAUT ? k : undefined)) as keyof PlanCfg | undefined;
    if (!key) continue;
    if (key === 'zakat') { (out as Record<string, unknown>)[key] = !/^(0|non|false|no)$/i.test(String(val)); continue; }
    const n = Number(String(val).replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = n;
  }
  return out;
}

async function childInfo(): Promise<{ name: string; birth: string } | null> {
  try {
    const p = JSON.parse((await kvGet('kouider:travel:profile')) ?? 'null') as { family?: Array<{ name: string; birth: string }> } | null;
    const fam = (p?.family ?? []).filter(x => /^\d{4}-\d{2}/.test(x.birth ?? ''));
    const kid = fam.sort((a, b) => b.birth.localeCompare(a.birth))[0];
    if (kid && +kid.birth.slice(0, 4) >= 2018) return { name: kid.name, birth: kid.birth.slice(0, 7) };
  } catch { /* pas de profil */ }
  return null;
}

/** Prix réel FIK par jour + jours loués sur 12 mois (pour les voitures à vous). */
async function fikRental(): Promise<{ price: number; daysYear: number }> {
  const from = ymAdd(localNow().date.slice(0, 7), -12);
  const { data } = await supabase.from('bookings').select('start_date, end_date, client_price_per_day, status')
    .in('status', ['CONFIRMED', 'ACTIVE', 'COMPLETED']).gte('start_date', `${from}-01`);
  const rows = (data ?? []) as Array<{ start_date: string; end_date: string; client_price_per_day: number | null }>;
  const priced = rows.filter(r => Number(r.client_price_per_day) > 0);
  const days = rows.reduce((s, r) => s + Math.max(0, Math.round((Date.parse(r.end_date) - Date.parse(r.start_date)) / 864e5)), 0);
  return { price: priced.length ? priced.reduce((s, r) => s + Number(r.client_price_per_day), 0) / priced.length : 35, daysYear: days };
}

export async function buildPlan(input: { projet?: string; offer?: string; clients?: number; reglages?: Partial<PlanCfg> } = {}): Promise<Plan> {
  const cfg: PlanCfg = { ...PLAN_DEFAUT, ...(await loadCfg()), ...(input.reglages ?? {}) };
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const rate = g?.eurDzd ?? 275;
  const E = (da: number) => da / rate;
  const now = localNow().date.slice(0, 7);
  const warnings: string[] = [];
  const until = `${+now.slice(0, 4) + 14}-12`;

  // Phase Belgique : la projection réaliste (70 % du cash gardé), avec le projet business s'il y en a un
  const projets = await kvJson<Array<{ name: string }>>('projets', []);
  const projet = input.projet ?? (projets.length ? '' : undefined);
  const clients = input.clients ?? (cfg.adblueClients > 0 ? cfg.adblueClients : undefined);
  const belgium = await buildProjection(until, { projet, offer: input.offer ?? (projet !== undefined ? 'adblue' : undefined), clients });
  const noBiz = belgium.base ? belgium.base[1]!.curve : belgium.scenarios[1]!.curve;
  const real = belgium.scenarios[1]!.curve;
  warnings.push(...belgium.warnings);
  const biz = belgium.biz;
  const adblueClients = biz?.clients ?? 0;
  const fik = await fikMonthlyNet().catch(() => ({ months: [], avg: 0, withData: 0 }));
  const rent = await fikRental().catch(() => ({ price: 35, daysYear: 0 }));
  const dayPrice = cfg.carPriceDayEur > 0 ? cfg.carPriceDayEur : rent.price;
  const child = await childInfo();

  // Dépenses d'un mois à Oran
  const ageAt = (m: string) => child ? monthsBetween(child.birth, m) / 12 : -1;
  const expenses = (m: string, liquid: number, bizProfit: number): Record<string, number> => {
    const a = ageAt(m);
    const school = a >= 6 ? E(cfg.primaireDaYear) / 12 : a >= 3 ? E(cfg.maternelleDaMonth) : 0;
    const base: Record<string, number> = {
      'Vie de famille (courses, factures, transport…)': E(cfg.livingDa),
      [`École privée ${child?.name ?? 'du fils'}`]: school,
      'Ta voiture (assurance, entretien, essence)': E(cfg.carRunDa),
      'Santé (médecin, pédiatre, mutuelle)': E(cfg.healthDa),
      'CASNOS (sécu + retraite indépendant)': E(cfg.casnosDaYear) / 12,
      'Maison : CAT-NAT + assurance': E(cfg.catnatDaYear) / 12,
      'Voyages en Belgique (famille, papiers)': cfg.travelEurYear / 12,
    };
    const sub = Object.values(base).reduce((s, v) => s + v, 0);
    base['Imprévus'] = sub * cfg.imprevusPct / 100;
    base['Impôts des business (IFU, à vérifier)'] = Math.max(0, bizProfit) * cfg.taxPct / 100;
    if (cfg.zakat) base['Zakat (2,5 %/an de l\'épargne)'] = liquid > cfg.nisabEur ? liquid * 0.025 / 12 : 0;
    return base;
  };

  // Ce qu'il faut AVANT de partir : maison + frais + meubles + voiture + déménagement + réserve
  const upfront: Array<[string, number]> = [
    [`Maison ${daFmt(cfg.houseDa)}`, E(cfg.houseDa)],
    [`Frais d'achat (notaire, enregistrement ${cfg.houseFeesPct} %)`, E(cfg.houseDa) * cfg.houseFeesPct / 100],
    [`Meubles + électroménager ${daFmt(cfg.furnitureDa)}`, E(cfg.furnitureDa)],
    ['Ta voiture', cfg.carEur],
    ['Déménagement + billets', cfg.movingEur],
  ];
  const upfrontTotal = upfront.reduce((s, [, v]) => s + v, 0);
  const firstMonthExp = (m: string) => Object.entries(expenses(m, 0, 0)).filter(([k]) => !/Zakat|Impôts/.test(k)).reduce((s, [, v]) => s + v, 0);
  const months0 = belgium.months;
  const findMove = (curve: number[]) => { for (let k = 0; k < months0.length; k++) { const m = months0[k]!.m; if (curve[k]! >= upfrontTotal + cfg.fundMonths * firstMonthExp(m)) return m; } return null; };
  const moveAt = findMove(real), moveAtNoBiz = biz ? findMove(noBiz) : null;
  const fundAtMove = moveAt ? cfg.fundMonths * firstMonthExp(moveAt) : 0;

  // Phase Oran, mois par mois, avec les investissements lancés quand on peut se les payer
  const months: PlanMonth[] = [];
  const invs: Inv[] = [
    { key: 'cars', label: `${cfg.carsN} voitures de location à vous (FIK)`, cost: E(cfg.carsN * cfg.carPriceDa), at: null, fullNet: 0, payback: null, note: '' },
    { key: 'apt', label: 'Un appartement F3 à louer', cost: E(cfg.aptPriceDa) * (1 + cfg.houseFeesPct / 100), at: null, fullNet: 0, payback: null, note: '' },
    { key: 'salle', label: 'Une salle des fêtes (mariages)', cost: E(cfg.salleInvestDa), at: null, fullNet: 0, payback: null, note: '' },
  ];
  const carNet = cfg.carsN * (cfg.carDaysMonth * dayPrice - E(cfg.carCostDaYear) / 12 - E(cfg.carPriceDa) * cfg.carDeprecPct / 100 / 12);
  const aptNet = E(cfg.aptRentDa) * cfg.aptOccupancy / 100 * (1 - cfg.aptChargesPct / 100);
  const salleNet = (sz: number) => E(cfg.sallePriceDa) * cfg.salleEventsMonth * sz * (1 - cfg.salleCostsPct / 100);
  invs[0]!.fullNet = carNet; invs[1]!.fullNet = aptNet; invs[2]!.fullNet = salleNet(1);
  invs[0]!.note = `${cfg.carDaysMonth} jours loués/mois par voiture à ${eur(dayPrice)}/jour (ton prix FIK réel), − assurance/entretien ${daFmt(cfg.carCostDaYear)}/an et usure ${cfg.carDeprecPct} %/an par voiture. Aujourd'hui FIK loue ≈ ${rent.daysYear} jours/an au total.`;
  invs[1]!.note = `Loyer ${daFmt(cfg.aptRentDa)}/mois, occupé ${cfg.aptOccupancy} % du temps, − ${cfg.aptChargesPct} % (entretien, charges, impôt foncier). Le loyer rembourse lentement, MAIS l'appartement reste à toi (il garde sa valeur, souvent elle monte) : c'est surtout une façon de protéger ton argent.`;
  invs[2]!.note = `${cfg.salleEventsMonth} soirées/mois en moyenne (plus l'été, moins l'hiver) à ${daFmt(cfg.sallePriceDa)}, − ${cfg.salleCostsPct} % de frais (personnel, électricité, ménage, sécurité). Démarrage sur 6 mois.`;
  if (moveAt) {
    let liquid = real[months0.findIndex(x => x.m === moveAt)]! - upfrontTotal;
    const end = ymAdd(moveAt, 10 * 12);
    const fikByMonth = (m: string) => { const x = fik.months.find(f => f.m.slice(5) === m.slice(5) && f.n > 0); return x ? x.net : fik.avg; };
    for (let m = moveAt; m <= end; m = ymAdd(m, 1)) {
      const k = monthsBetween(moveAt, m);
      // lancement : après l'installation, si après paiement il reste la réserve
      for (const inv of invs) {
        if (inv.at || k < cfg.settleMonths || inv.cost <= 0) continue;
        if (invs.some(o => o !== inv && !o.at && o.cost < inv.cost)) continue;   // le moins cher d'abord
        if (liquid - inv.cost >= cfg.fundMonths * firstMonthExp(m)) { inv.at = m; liquid -= inv.cost; }
      }
      const inc: Record<string, number> = { 'FIK (voitures de Houari)': fikByMonth(m) };
      if (biz) inc[biz.name] = adblueClients * biz.perClient * biz.share / 100 - biz.monthly;
      const since = (inv: Inv) => inv.at && m >= inv.at ? monthsBetween(inv.at, m) : -1;
      const c = since(invs[0]!); if (c >= 0) inc['Tes voitures de location'] = carNet * Math.min(1, (c + 1) / 2);
      const a = since(invs[1]!); if (a >= 1) inc['Loyer appartement'] = aptNet;
      const s = since(invs[2]!); if (s >= 0) inc['Salle des fêtes'] = salleNet(SALLE_SAISON[+m.slice(5, 7) - 1]!) * Math.min(1, (s + 1) / 6);
      const incT = Object.values(inc).reduce((x, y) => x + y, 0);
      const exp = expenses(m, liquid, incT);
      const salary = incT - Object.values(exp).reduce((x, y) => x + y, 0);
      liquid += salary;
      months.push({ m, inc, exp, salary, liquid });
    }
    for (const inv of invs) if (inv.at && inv.fullNet > 0) inv.payback = Math.ceil(inv.cost / inv.fullNet);
    if (months.some(x => x.liquid < 0)) warnings.push('À un moment ton épargne passe sous zéro à Oran : il faut plus de clients ou moins de dépenses avant de partir.');
  } else warnings.push(`Avec ces chiffres, maison + voiture + réserve (${eur(upfrontTotal)} + 6 mois) ne sont pas atteints avant ${ymLabel(until)}.`);
  if (!child) warnings.push('Date de naissance du fils inconnue (profil voyage) : école non comptée. Dis-la à Dzaryx (air_algerie_watch profile).');
  if (cfg.salleInvestDa === PLAN_DEFAUT.salleInvestDa) warnings.push('Salle des fêtes : coût d\'achat/construction = estimation (aucun prix fiable trouvé). Donne un vrai prix (salle_invest).');
  return { cfg, rate, now, moveAt, moveAtNoBiz, upfront, upfrontTotal, fundAtMove, belgium, months, invs, child, bizName: biz?.name ?? null, adblueClients,
    perClient: biz?.perClient ?? 0, share: biz?.share ?? 0, fikDayPrice: dayPrice, fikDaysYear: rent.daysYear, warnings };
}

const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
/** Moyenne d'un bloc de 12 mois (lisse la saison des mariages / de FIK). */
function yearAvg(p: Plan, fromIdx: number) { const blk = p.months.slice(fromIdx, fromIdx + 12); return { salary: avg(blk.map(x => x.salary)), blk }; }

export const MISSED = [
  'Frais de notaire et d\'enregistrement : ≈ 7 % du prix de la maison en plus (déjà comptés).',
  'CAT-NAT : assurance catastrophes OBLIGATOIRE pour un propriétaire en Algérie (comptée).',
  'CASNOS : sans salaire, c\'est toi qui paies ta sécu et ta retraite d\'indépendant (comptée). Tes années travaillées en Belgique restent acquises pour ta pension belge plus tard : garde tes fiches.',
  'Allocations familiales belges pour ton fils : elles s\'arrêtent quand vous quittez la Belgique (pas comptées dans tes rentrées actuelles, donc rien à enlever, mais c\'est une perte).',
  'Change : les euros changés au square donnent ≈ 2× plus qu\'au taux officiel, mais l\'argent liquide doit être déclaré à la douane (au-delà de 1 000 € en Algérie) — sinon saisie possible.',
  'Ta voiture : acheter sur place OU importer (règles et taxes douanières pour une voiture de moins de 3 ans) — compare avant de payer.',
  'Registre du commerce + impôt (IFU) pour la salle, les voitures et les locations : obligatoires pour assurer et encaisser légalement (impôts comptés à 10 %, à vérifier avec un comptable).',
  'Assurance tous risques des voitures de location et caution client : un accident sans assurance peut coûter une voiture entière.',
  'Une réserve de 6 mois de dépenses reste TOUJOURS de côté : aucun investissement n\'est lancé s\'il la fait passer dessous.',
  'Papiers du fils et de ta femme (nationalité, inscription école, carnet de vaccination) à préparer 6 mois avant.',
  'Garder un compte en Belgique (euros) pour les voyages, les achats en ligne et ta pension belge plus tard.',
  'Le snus s\'arrête en partant : c\'est la plus grosse rentrée d\'aujourd\'hui, elle n\'existe plus à Oran.',
];

export function planText(p: Plan): string {
  const L: string[] = [`🇩🇿 PLAN ALGÉRIE — calculé sur tes vrais chiffres (taux ${Math.round(p.rate)} DA/€)`];
  L.push(`• À payer avant de partir : ${eur(p.upfrontTotal)} (maison ${daFmt(p.cfg.houseDa)} + frais ${p.cfg.houseFeesPct} % + meubles + voiture ${eur(p.cfg.carEur)} + déménagement) + ${p.cfg.fundMonths} mois de dépenses d'avance (${eur(p.fundAtMove)}).`);
  L.push(p.moveAt ? `• Tu peux quitter la Belgique en ${ymLabel(p.moveAt)}${p.bizName ? ` (avec ${p.bizName} à ${p.adblueClients} clients/mois ; sans : ${p.moveAtNoBiz ? ymLabel(p.moveAtNoBiz) : 'pas avant 15 ans'})` : ''}, maison et voiture PAYÉES, sans crédit.` : '• Départ pas possible avec ces chiffres (voir le document).');
  if (p.moveAt && p.months.length) {
    const y1 = yearAvg(p, 0);
    L.push(`• Ton « salaire » à Oran la 1re année : ${eur(y1.salary)}/mois en moyenne (ce qui reste après TOUTES les dépenses, école comprise).`);
    for (const inv of p.invs) L.push(inv.at ? `• ${inv.label} : lancé en ${ymLabel(inv.at)} (${eur(inv.cost)}) → +${eur(inv.fullNet)}/mois à plein régime, remboursé en ${inv.payback ?? '?'} mois.` : `• ${inv.label} : pas possible dans les 10 ans avec ces chiffres (${eur(inv.cost)}, rapporterait ${eur(inv.fullNet)}/mois).`);
    const last = yearAvg(p, Math.max(0, p.months.length - 12));
    L.push(`• Dans 10 ans (${ymLabel(p.months.at(-1)!.m)}) : ${eur(last.salary)}/mois de salaire, ${eur(p.months.at(-1)!.liquid)} d'épargne + la maison et tes biens.`);
  }
  for (const w of p.warnings) L.push(`⚠️ ${w}`);
  return L.join('\n');
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function planPdf(p: Plan): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 45 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  const rawText = doc.text.bind(doc) as (...a: unknown[]) => typeof doc;
  (doc as unknown as { text: (...a: unknown[]) => typeof doc }).text = (t: unknown, ...rest: unknown[]) =>
    rawText(typeof t === 'string' ? t.replace(/≈ ?/g, 'env. ').replace(/−/g, '-').replace(/→/g, '->').replace(/⚠️? ?/g, '(!) ').replace(/🇩🇿 ?/g, '').replace(/[  ]/g, ' ') : t, ...rest);
  const NAVY = '#0B2545', GREEN = '#1B6B3A', GREY = '#666666', RED = '#C73E1D';
  const COLORS = ['#1B998B', '#2E86AB', '#F18F01', '#6A4C93', '#C73E1D', '#B8860B'];
  const H = (t: string) => { doc.moveDown(0.7).fontSize(15).fillColor(NAVY).text(t).moveDown(0.3); };
  const P = (t: string, size = 10, color = '#222') => doc.fontSize(size).fillColor(color).text(t, { lineGap: 2 });
  const row = (cells: string[], cols: number[], y: number, opts: { bold?: boolean; color?: string; fill?: string } = {}) => {
    if (opts.fill) doc.rect(42, y - 2, 511, 13).fill(opts.fill);
    cells.forEach((c, i) => doc.fontSize(8.5).fillColor(opts.color ?? '#222').text(c, cols[i]!, y, { width: (cols[i + 1] ?? 553) - cols[i]! - 4, align: i ? 'right' : 'left' }));
    return y + 14;
  };

  // Page 1 : le départ
  doc.rect(0, 0, doc.page.width, 90).fill(GREEN);
  doc.fillColor('#fff').fontSize(22).text('Ton plan Algérie', 45, 26);
  doc.fontSize(10).fillColor('#E8D9A8').text(`Départ, vie à Oran, nouveaux business — calculé le ${localNow().date.split('-').reverse().join('/')} par Dzaryx · document privé`, 45, 58);
  doc.y = 108; doc.x = 45;
  H('Quand tu peux quitter la Belgique');
  if (p.moveAt) {
    doc.roundedRect(45, doc.y, 505, 46, 6).fill('#EAF5EE');
    const y = doc.y;
    doc.fillColor(GREEN).fontSize(20).text(ymLabel(p.moveAt), 58, y + 8);
    doc.fillColor('#333').fontSize(9).text(`maison + voiture PAYÉES, sans crédit, avec ${p.cfg.fundMonths} mois de dépenses d'avance${p.bizName ? `\n(avec ${p.bizName} à ${p.adblueClients} clients/mois ; sans : ${p.moveAtNoBiz ? ymLabel(p.moveAtNoBiz) : 'pas avant 15 ans'})` : ''}`, 230, y + 9, { width: 310 });
    doc.y = y + 56; doc.x = 45;
  } else P('Pas possible avec ces chiffres : voir les avertissements page suivante.', 11, RED);
  P(`Jusque-là tu restes en Belgique (salaire, heures sup, snus, FIK${p.bizName ? `, ${p.bizName}` : ''}) et tu gardes 70 % du cash — la projection réaliste.`, 9.5, GREY);
  H('Ce qu\'il faut avoir payé avant de partir');
  {
    const cols = [45, 420]; let y = doc.y;
    for (const [i, [l, v]] of p.upfront.entries()) y = row([l, eur(v)], cols, y, { fill: i % 2 ? undefined : '#F4F6F8' });
    y = row([`Réserve : ${p.cfg.fundMonths} mois de dépenses à Oran`, eur(p.fundAtMove)], cols, y);
    y = row(['TOTAL à avoir de côté', eur(p.upfrontTotal + p.fundAtMove)], cols, y + 2, { color: NAVY, fill: '#FFF6DD' });
    doc.y = y + 6; doc.x = 45;
  }
  // Graphique : épargne de maintenant à 10 ans après le départ
  H('Ton épargne, de maintenant à 10 ans après le départ');
  {
    const real = p.belgium.scenarios[1]!.curve;
    const kMove = p.moveAt ? p.belgium.months.findIndex(x => x.m === p.moveAt) : real.length - 1;
    const pre = real.slice(0, kMove + 1).map((v, i) => ({ m: i ? p.belgium.months[i - 1]!.m : p.now, v }));
    const post = p.months.map(x => ({ m: x.m, v: x.liquid }));
    const pts = [...pre, ...post];
    const gx = 75, gy = doc.y + 5, gw = 460, gh = 150, n = Math.max(1, pts.length - 1);
    const vals = [...pts.map(x => x.v), p.upfrontTotal + p.fundAtMove]; const max = Math.max(...vals) * 1.08, min = Math.min(0, ...vals);
    const Y = (v: number) => gy + gh - (v - min) / (max - min) * gh;
    doc.lineWidth(0.5).strokeColor('#DDD');
    for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; doc.moveTo(gx, Y(v)).lineTo(gx + gw, Y(v)).stroke(); doc.fontSize(7).fillColor(GREY).text(`${Math.round(v / 1000)} k€`, gx - 36, Y(v) - 4, { width: 32, align: 'right' }); }
    doc.lineWidth(2).strokeColor(GREEN); pts.forEach((x, k) => { const X = gx + k / n * gw; if (k === 0) doc.moveTo(X, Y(x.v)); else doc.lineTo(X, Y(x.v)); }); doc.stroke();
    const mark = (m: string, label: string, col: string, dy: number) => { const k = pts.findIndex(x => x.m === m); if (k < 0) return; const X = gx + k / n * gw; doc.lineWidth(0.8).strokeColor(col).dash(3, { space: 3 }).moveTo(X, gy).lineTo(X, gy + gh).stroke().undash(); doc.fontSize(7).fillColor(col).text(label, X + 3, gy + dy, { width: 90 }); };
    if (p.moveAt) mark(p.moveAt, `départ ${ymLabel(p.moveAt)}`, RED, 2);
    p.invs.forEach((inv, i) => { if (inv.at) mark(inv.at, inv.key === 'cars' ? 'voitures' : inv.key === 'apt' ? 'appartement' : 'salle', COLORS[i + 1]!, 14 + i * 11); });
    pts.forEach((x, k) => { if (x.m.endsWith('-01') && +x.m.slice(0, 4) % 2 === 0) doc.fontSize(7).fillColor(GREY).text(x.m.slice(0, 4), gx + k / n * gw - 15, gy + gh + 4, { width: 30, align: 'center' }); });
    doc.y = gy + gh + 18; doc.x = 45;
    P('Le grand creux = l\'achat de la maison, de la voiture et des meubles. Les maisons et biens achetés ne sont pas dans la courbe (seulement l\'argent).', 8.5, GREY);
  }

  // Page 2 : ta vie à Oran — ton salaire chaque mois
  if (p.moveAt && p.months.length) {
    doc.addPage();
    H('Ta vie à Oran : ton salaire chaque mois (1re année)');
    const y1 = yearAvg(p, 0).blk;
    const keysInc = [...new Set(y1.flatMap(x => Object.keys(x.inc)))], keysExp = [...new Set(y1.flatMap(x => Object.keys(x.exp)))];
    const A = (blk: PlanMonth[], f: (x: PlanMonth) => number) => avg(blk.map(f));
    const cols = [45, 330, 440]; let y = doc.y;
    y = row(['Ce qui rentre (moyenne par mois)', 'en DA', 'en €'], cols, y, { color: NAVY });
    for (const k of keysInc) { const v = A(y1, x => x.inc[k] ?? 0); y = row([k, daFmt(v * p.rate), eur(v)], cols, y); }
    const incT = A(y1, x => Object.values(x.inc).reduce((a, b) => a + b, 0));
    y = row(['Total rentrées', daFmt(incT * p.rate), eur(incT)], cols, y, { color: GREEN, fill: '#EAF5EE' });
    y += 6; y = row(['Ce qui sort (moyenne par mois)', 'en DA', 'en €'], cols, y, { color: NAVY });
    for (const k of keysExp) { const v = A(y1, x => x.exp[k] ?? 0); if (v > 0.5) y = row([k, daFmt(v * p.rate), eur(v)], cols, y); }
    const expT = A(y1, x => Object.values(x.exp).reduce((a, b) => a + b, 0));
    y = row(['Total dépenses', daFmt(expT * p.rate), eur(expT)], cols, y, { color: RED, fill: '#FBEDEA' });
    y += 4; y = row(['TON SALAIRE (ce qui reste)', daFmt((incT - expT) * p.rate), eur(incT - expT)], cols, y, { color: NAVY, fill: '#FFF6DD' });
    doc.y = y + 8; doc.x = 45;
    if (p.child) {
      const a3 = ymAdd(p.child.birth, 36), a6 = ymAdd(p.child.birth, 72);
      P(`École de ${p.child.name} : maternelle privée dès ${ymLabel(a3)} (${daFmt(p.cfg.maternelleDaMonth)}/mois), primaire privée dès ${ymLabel(a6)} (${daFmt(p.cfg.primaireDaYear)}/an) — comptées automatiquement selon son âge.`, 9.5);
    }
    if (p.bizName) P(`Chaque client ${p.bizName} de plus par mois = +${eur(p.perClient * p.share / 100)}/mois pour toi (tu en comptes ${p.adblueClients}).`, 9.5);
    P(`Le salaire varie selon les mois : FIK et les mariages rapportent surtout l'été.`, 9, GREY);

    // Évolution année par année
    H('Année par année après le départ');
    {
      const cols2 = [45, 120, 205, 290, 375, 460]; let y2 = doc.y;
      y2 = row(['Année', 'Rentrées/mois', 'Dépenses/mois', 'Salaire/mois', 'Épargne fin', 'Biens'], cols2, y2, { color: NAVY });
      for (let i = 0; i < p.months.length; i += 12) {
        const blk = p.months.slice(i, i + 12); if (!blk.length) break;
        const inc = avg(blk.map(x => Object.values(x.inc).reduce((a, b) => a + b, 0))), exp = avg(blk.map(x => Object.values(x.exp).reduce((a, b) => a + b, 0)));
        const lastM = blk.at(-1)!.m;
        const assets = p.upfront[0]![1] + p.invs.filter(v => v.at && v.at <= lastM).reduce((s, v) => s + v.cost, 0);
        y2 = row([`${i / 12 + 1} (${blk[0]!.m.slice(0, 4)})`, eur(inc), eur(exp), eur(inc - exp), eur(blk.at(-1)!.liquid), eur(assets)], cols2, y2, { fill: (i / 12) % 2 ? undefined : '#F4F6F8' });
      }
      doc.y = y2 + 4; doc.x = 45;
      P('Biens = prix payé pour la maison + les investissements (sans plus-value ni usure).', 8.5, GREY);
    }
  }

  // Page 3 : les nouveaux business
  doc.addPage();
  H('Tes nouveaux business : quand et combien');
  P(`Règle : rien n'est lancé avant ${p.cfg.settleMonths} mois d'installation, le moins cher d'abord, et seulement si après l'avoir payé il te reste ${p.cfg.fundMonths} mois de dépenses de côté.`, 9.5, GREY);
  for (const [i, inv] of p.invs.entries()) {
    doc.moveDown(0.5);
    const y = doc.y;
    doc.roundedRect(45, y, 505, 20, 5).fill(i === 0 ? '#E8F4F8' : i === 1 ? '#F3EEF8' : '#FFF6DD');
    doc.fillColor(NAVY).fontSize(11.5).text(inv.label, 55, y + 5, { width: 300 });
    doc.fillColor(inv.at ? GREEN : RED).fontSize(10).text(inv.at ? `lancé en ${ymLabel(inv.at)}` : 'pas dans les 10 ans', 340, y + 6, { width: 200, align: 'right' });
    doc.y = y + 26; doc.x = 45;
    P(`Coût : ${eur(inv.cost)} (${daFmt(inv.cost * p.rate)}) · rapporte ${eur(inv.fullNet)}/mois net à plein régime${inv.payback ? ` · remboursé en ${inv.payback} mois (${(inv.payback / 12).toFixed(1).replace('.', ',')} ans)` : ''}.`, 10);
    P(inv.note, 9, GREY);
    if (inv.at) {
      const k = p.months.findIndex(x => x.m === inv.at); const before = k > 0 ? yearAvg(p, Math.max(0, k - 12)).salary : 0; const after = yearAvg(p, k + 6).salary;
      P(`Ton salaire moyen passe de ${eur(before)}/mois à ${eur(after)}/mois après le lancement.`, 10, GREEN);
    }
  }
  H('Et si… (tu peux changer chaque chiffre)');
  for (const t of [
    `Plus de jours loués par voiture : chaque jour de plus par mois et par voiture = +${eur(p.fikDayPrice * p.cfg.carsN)}/mois.`,
    `Salle des fêtes : chaque soirée de plus par mois = +${eur(p.cfg.sallePriceDa / p.rate * (1 - p.cfg.salleCostsPct / 100))}/mois.`,
    `Pour changer : dis à Dzaryx « plan Algérie avec salle à 8 milliards et 10 soirées par mois » ou « voitures 3, 15 jours par mois ».`,
  ]) P(`• ${t}`, 9.5);
  H('Autres idées à étudier avec Dzaryx');
  for (const t of [
    'Garder les voitures de location chez Houari ET en acheter : FIK continue pendant que tes voitures s\'ajoutent.',
    'Louer la maison en été (diaspora) si vous êtes en voyage, ou un studio sur le toit / au rez-de-chaussée.',
    'Location courte durée (diaspora l\'été) au lieu d\'un loyer à l\'année : plus cher par nuit, plus de travail.',
    'Package mariage : salle + voitures de cortège FIK + photographe = plus cher par soirée, un seul client.',
    'AdBlue / reprogrammation : former un mécanicien pour faire plus de clients sans ton temps.',
  ]) P(`• ${t}`, 9.5);

  // Page 4 : ce à quoi tu n'as pas pensé + hypothèses
  doc.addPage();
  H('Ce à quoi tu n\'avais peut-être pas pensé');
  for (const t of MISSED) P(`• ${t}`, 9.5);
  H('Avertissements');
  for (const w of p.warnings) P(`(!) ${w}`, 9.5, RED);
  H('D\'où viennent les chiffres');
  for (const s of SOURCES) P(`• ${s}`, 8.5, '#333');
  P(`• Estimations Dzaryx (à remplacer par tes prix) : meubles ${daFmt(p.cfg.furnitureDa)}, déménagement ${eur(p.cfg.movingEur)}, ta voiture au quotidien ${daFmt(p.cfg.carRunDa)}/mois, santé ${daFmt(p.cfg.healthDa)}/mois, CAT-NAT + habitation ${daFmt(p.cfg.catnatDaYear)}/an, voyages ${eur(p.cfg.travelEurYear)}/an, impôts business ${p.cfg.taxPct} %, imprévus ${p.cfg.imprevusPct} %.`, 8.5, '#333');
  P(`• Phase Belgique : ${p.belgium.hypotheses.join(' ')}`, 8.5, '#333');
  doc.moveDown(0.8); P('Document privé, pour toi seul. Montants en euros d\'aujourd\'hui (pas d\'inflation). Dis à Dzaryx un chiffre qui change et il refait tout le plan.', 8, GREY);
  doc.end();
  return done;
}

/** Outil : mes_finances action 'algerie'. reglages = « clé=valeur » (retenus) ; essai = true pour tester sans enregistrer. */
export async function algeriePlanTool(input: Record<string, unknown>): Promise<string> {
  const reg = parseReglages(input['reglages']);
  // champs directs déjà connus de l'outil
  const direct: Array<[string, keyof PlanCfg]> = [['maison_da', 'houseDa'], ['voiture_eur', 'carEur'], ['vie_da', 'livingDa'], ['ecole_da', 'primaireDaYear']];
  for (const [k, field] of direct) { const n = Number(String(input[k] ?? '').replace(/[^\d.]/g, '')); if (String(input[k] ?? '').trim() && Number.isFinite(n) && n > 0) (reg as Record<string, unknown>)[field] = n; }
  if (Object.keys(reg).length && input['essai'] !== true && input['essai'] !== 'true') {
    const f = await loadFinances() as Awaited<ReturnType<typeof loadFinances>> & { algeriePlan?: Partial<PlanCfg> };
    f.algeriePlan = { ...(f.algeriePlan ?? {}), ...reg };
    await kvPut('perso:finances', f);
  }
  const p = await buildPlan({
    projet: input['projet'] !== undefined && String(input['projet']).trim() ? String(input['projet']) : undefined,
    offer: input['offer'] ? String(input['offer']) : undefined,
    clients: Number(input['clients']) || undefined,
    reglages: reg,
  });
  const text = planText(p);
  const pdf = await planPdf(p);
  if (input['send'] !== false) {
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    await queueTelegramFile(pdf.toString('base64'), 'Plan-Algerie.pdf', `🇩🇿 Ton plan Algérie : départ${p.moveAt ? ` en ${ymLabel(p.moveAt)}` : ''}, ton salaire à Oran, tes nouveaux business — tout calculé, sources incluses.`);
  }
  return `${text}\n\n📄 PDF complet (4 pages, graphiques, budget détaillé, business, sources) envoyé sur Telegram.`;
}
