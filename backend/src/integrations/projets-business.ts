// PROJETS BUSINESS (31/10/2026, demande de Kouider) : il décrit un projet (avec Houari bof, etc.), dit ce que ça coûte et
// ses prix → Dzaryx calcule les chiffres EXACTS (marge par client, part de chacun, rentabilisation, scénarios) puis fait
// l'étude de marché complète (recherche web + ses vraies finances + études déjà faites) en PDF sur Telegram.
// Données dans app_kv `projets` (privé). Outil projet_business.
import { kvJson, kvPut, research, uid } from './ai-util.js';

const KEY = 'projets';
type Cur = 'EUR' | 'DZD';
type Offer = { name: string; priceMin: number; priceMax: number; cur: Cur; techMin: number; techMax: number; techCur: Cur; note?: string };
type Cost = { label: string; amount: number; cur: Cur; kind: 'invest' | 'mensuel' | 'par_client' };
export type Projet = { id: string; name: string; partner?: string; country?: string; desc: string; offers: Offer[]; costs: Cost[]; myShare: number; notes: string[]; studies: Array<{ at: string; title: string }>; created: string };

const load = () => kvJson<Projet[]>(KEY, []);
const save = (l: Projet[]) => kvPut(KEY, l);
const num = (v: unknown) => { const s = String(v ?? '').trim(); if (!s) return undefined; const n = Number(s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : undefined; };
const curOf = (v: unknown): Cur => /da|dzd|dinar/i.test(String(v ?? '')) ? 'DZD' : 'EUR';
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const da = (n: number) => `${(Math.round(n / 100) * 100).toLocaleString('fr-FR')} DA`;

async function rate(): Promise<number> {
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  return g?.eurDzd ?? 275;
}
function find(l: Projet[], q: unknown): Projet | undefined {
  const s = String(q ?? '').toLowerCase().trim();
  if (!s) return l.at(-1);
  return l.find(p => p.id === s) ?? l.find(p => p.name.toLowerCase().includes(s) || s.includes(p.name.toLowerCase()));
}

/** Les chiffres exacts, calculés (jamais inventés). */
export async function chiffres(p: Projet): Promise<string> {
  const r = await rate();
  const toE = (n: number, c: Cur) => (c === 'DZD' ? n / r : n);
  const invest = p.costs.filter(c => c.kind === 'invest').reduce((s, c) => s + toE(c.amount, c.cur), 0);
  const monthly = p.costs.filter(c => c.kind === 'mensuel').reduce((s, c) => s + toE(c.amount, c.cur), 0);
  const perClient = p.costs.filter(c => c.kind === 'par_client').reduce((s, c) => s + toE(c.amount, c.cur), 0);
  const lines = [`📐 ${p.name.toUpperCase()} — LES CHIFFRES (taux ${r} DA/€)`];
  if (!p.offers.length) lines.push('⚠️ Aucun prix encore : dis-moi « prix AdBlue 40 000 DA, technicien 150 à 200 € ».');
  const margins: number[] = [];
  for (const o of p.offers) {
    const pMin = toE(o.priceMin, o.cur), pMax = toE(o.priceMax, o.cur);
    const tMin = toE(o.techMin, o.techCur), tMax = toE(o.techMax, o.techCur);
    const mLow = pMin - tMax - perClient, mHigh = pMax - tMin - perClient;
    margins.push((mLow + mHigh) / 2);
    lines.push(`• ${o.name} : prix client ${o.cur === 'DZD' ? `${da(o.priceMin)}–${da(o.priceMax)}` : `${eur(o.priceMin)}–${eur(o.priceMax)}`} (${eur(pMin)}–${eur(pMax)}) − technicien ${eur(tMin)}–${eur(tMax)}${perClient ? ` − frais ${eur(perClient)}` : ''} = marge ${eur(mLow)} à ${eur(mHigh)} par client → ta part (${p.myShare} %) ${eur(mLow * p.myShare / 100)} à ${eur(mHigh * p.myShare / 100)}${mLow <= 0 ? '  ⚠️ au prix bas tu PERDS de l\'argent' : ''}`);
  }
  lines.push(`• Mise de départ : ${invest ? eur(invest) : 'pas encore donnée'}${p.costs.filter(c => c.kind === 'invest').map(c => ` · ${c.label} ${c.cur === 'DZD' ? da(c.amount) : eur(c.amount)}`).join('')}`);
  if (monthly) lines.push(`• Frais par mois : ${eur(monthly)}`);
  const avg = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  if (avg > 0) {
    if (invest) lines.push(`• Rentabilisé après ≈ ${Math.ceil(invest / avg)} client(s)`);
    if (monthly) lines.push(`• Frais du mois couverts dès ${Math.ceil(monthly / avg)} client(s)/mois`);
    lines.push('• Scénarios (marge moyenne, après technicien) :');
    for (const n of [5, 10, 20, 40]) { const tot = n * avg - monthly; lines.push(`   ${n} clients/mois → ${eur(tot)} à partager → toi ${eur(tot * p.myShare / 100)}/mois${p.partner ? ` · ${p.partner} ${eur(tot * (100 - p.myShare) / 100)}` : ''}`); }
    const f = await import('./perso-finances.js').then(m => m.loadFinances()).catch(() => null);
    if (f?.salary) { const ten = (10 * avg - monthly) * p.myShare / 100; lines.push(`• À 10 clients/mois, ta part = ${Math.round(ten / f.salary * 100)} % de ton salaire de librairie.`); }
  }
  return lines.join('\n');
}

async function etude(p: Projet): Promise<string> {
  const { startDossierJob, writeDossier } = await import('./pro-doc.js');
  const title = `Étude de marché — ${p.name}`;
  p.studies.push({ at: new Date().toISOString(), title });
  const l = await load(); const i = l.findIndex(x => x.id === p.id); if (i >= 0) { l[i] = p; await save(l); }
  return startDossierJob(title, async () => {
    const [nums, fin, fort] = await Promise.all([
      chiffres(p),
      import('./perso-finances.js').then(async m => { const f = await m.loadFinances(); const b = m.budget(f); return `Salarié (${f.job ?? '?'}) : ${eur(b.salary + b.extra)}/mois avec heures sup ; charges fixes ${eur(b.charges)} ; épargne ${eur(f.savings ?? 0)} ; il met ${eur(b.save)}/mois de côté ; reste pour vivre ${eur(b.rest)}/mois. Temps libre limité (travail salarié + FIK + famille, congés lundi et jeudi).`; }).catch(() => ''),
      import('./argent-coach.js').then(m => m.urgence()).catch(() => ''),
    ]);
    const market = await research(
      `Étude de marché RÉELLE et récente (cite tes sources) pour ce projet : « ${p.name} » — ${p.desc}. Pays / ville : ${p.country ?? 'Algérie (Oran)'}.\n` +
      `Cherche : 1) la demande (quels véhicules, quels clients : particuliers, utilitaires, flottes, taxis, transport ; saisons), 2) les concurrents réels et LEURS PRIX (Ouedkniss, Facebook, garages, préparateurs), 3) le matériel nécessaire et son vrai prix (PC, interface OBD, logiciel / application de lecture-copie des calculateurs, abonnements, travail à distance avec un technicien à l'étranger), 4) les risques : légaux et réglementaires (contrôle technique, normes antipollution, garantie constructeur, responsabilité en cas de casse moteur, douane / matériel), risques pour le technicien en Belgique, risques de paiement, 5) comment trouver les premiers clients vite et sans local. Réponds en français, chiffres en DA et en €.`,
      { rounds: 6, max: 5000 }).catch(() => 'Recherche web indisponible : marché à vérifier sur le terrain.');
    const material = [
      `PROJET : ${p.name}${p.partner ? ` — associé : ${p.partner}` : ''}`, `MODÈLE DÉCRIT PAR KOUIDER : ${p.desc}`,
      ...p.notes.map(n => `NOTE : ${n}`),
      `PARTAGE DU BÉNÉFICE : Kouider ${p.myShare} %${p.partner ? ` / ${p.partner} ${100 - p.myShare} %` : ''}`,
      '', 'CHIFFRES CALCULÉS (exacts, à reprendre tels quels, ne pas en inventer d\'autres) :', nums,
      '', 'SITUATION FINANCIÈRE DE KOUIDER (à utiliser pour la partie « est-ce que je peux me le permettre », sans jamais citer d\'activité d\'appoint) :', fin, fort,
      '', 'RECHERCHE DE MARCHÉ :', market,
    ].join('\n');
    // Mode gratuit : les cerveaux gratuits saturent parfois juste après la recherche (31/10 : 503) → 3 essais espacés
    const brief = 
      `Étude de marché + business plan pour Kouider et ${p.partner ?? 'son associé'} : marché et demande, concurrents et prix, offre et prix conseillés, chiffres (marge par client, part de chacun, rentabilisation, scénarios 5/10/20/40 clients), matériel à acheter (liste + prix), fonctionnement pas à pas (client → mécanicien → technicien à distance → paiement), risques (légaux, techniques, paiement) et comment s'en protéger, plan des 30 premiers jours sans local, verdict franc (go / go sous conditions / pas maintenant) et ce que ça change pour ses finances.`;
    for (let k = 0; ; k++) {
      try { return await writeDossier(title, brief, material); }
      catch (e) { if (k >= 3 || !/503|overload|gratuit|429|rate/i.test(String(e instanceof Error ? e.message : e))) throw e; await new Promise(r => setTimeout(r, (k + 1) * 120_000)); }
    }
  });
}

export async function projetTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const l = await load();
  if (action === 'list') return l.length ? ['💼 TES PROJETS', ...l.map(p => `• ${p.name}${p.partner ? ` (avec ${p.partner})` : ''} — ${p.offers.length} offre(s), ${p.costs.length} coût(s)${p.studies.length ? `, étude du ${p.studies.at(-1)!.at.slice(8, 10)}/${p.studies.at(-1)!.at.slice(5, 7)}` : ''}`)].join('\n') : '💼 Aucun projet. Dis « nouveau projet … avec Houari bof » et décris-le.';
  if (action === 'create') {
    const name = String(input['name'] ?? '').trim();
    if (!name) return '❌ Il me faut un nom (name).';
    const p: Projet = { id: uid(), name, desc: String(input['desc'] ?? ''), offers: [], costs: [], myShare: num(input['share']) ?? 50, notes: [], studies: [], created: new Date().toISOString().slice(0, 10),
      ...(input['partner'] ? { partner: String(input['partner']) } : {}), ...(input['country'] ? { country: String(input['country']) } : {}) };
    l.push(p); await save(l);
    return `✅ Projet « ${name} » créé${p.partner ? ` avec ${p.partner}` : ''} (partage ${p.myShare} / ${100 - p.myShare}). Dis-moi tes prix et ce que ça coûte, puis « fais l'étude ».`;
  }
  const p = find(l, input['project']);
  if (!p) return '❌ Je ne trouve pas ce projet. Dis « mes projets ».';
  if (action === 'update') {
    if (input['desc']) p.desc = String(input['desc']);
    if (input['partner']) p.partner = String(input['partner']);
    if (input['country']) p.country = String(input['country']);
    const sh = num(input['share']); if (sh !== undefined) p.myShare = sh;
    if (input['note']) p.notes.push(String(input['note']));
  } else if (action === 'offre') {
    const name = String(input['label'] ?? '').trim();
    if (!name) return '❌ Le nom de la prestation (label).';
    const pMin = num(input['price_min'] ?? input['price']), pMax = num(input['price_max'] ?? input['price']);
    const tMin = num(input['tech_min'] ?? input['tech']), tMax = num(input['tech_max'] ?? input['tech']);
    const o = p.offers.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (String(input['op'] ?? '') === 'remove') p.offers = p.offers.filter(x => x !== o);
    else if (o) Object.assign(o, { ...(pMin !== undefined ? { priceMin: pMin, priceMax: pMax ?? pMin, cur: curOf(input['currency']) } : {}), ...(tMin !== undefined ? { techMin: tMin, techMax: tMax ?? tMin, techCur: curOf(input['tech_currency'] ?? 'EUR') } : {}) });
    else if (pMin !== undefined) p.offers.push({ name, priceMin: pMin, priceMax: pMax ?? pMin, cur: curOf(input['currency']), techMin: tMin ?? 0, techMax: tMax ?? tMin ?? 0, techCur: curOf(input['tech_currency'] ?? 'EUR') });
    else return '❌ Le prix client (price ou price_min/price_max, currency DA ou €).';
  } else if (action === 'cout') {
    const label = String(input['label'] ?? '').trim();
    if (!label) return '❌ Quoi (label) ?';
    const c = p.costs.find(x => x.label.toLowerCase() === label.toLowerCase());
    const amount = num(input['amount']);
    if (String(input['op'] ?? '') === 'remove') p.costs = p.costs.filter(x => x !== c);
    else if (amount === undefined) return '❌ Combien (amount) ?';
    else { const kind = (['invest', 'mensuel', 'par_client'].includes(String(input['kind'])) ? input['kind'] : 'invest') as Cost['kind']; if (c) Object.assign(c, { amount, cur: curOf(input['currency']), kind }); else p.costs.push({ label, amount, cur: curOf(input['currency']), kind }); }
  } else if (action === 'etude') return etude(p);
  else if (action === 'remove') { await save(l.filter(x => x !== p)); return `🗑️ Projet « ${p.name} » supprimé.`; }
  if (action !== 'show' && action !== 'chiffres') await save(l);
  return [`💼 ${p.name}${p.partner ? ` — avec ${p.partner}` : ''}`, p.desc ? `📝 ${p.desc}` : '', ...p.notes.slice(-6).map(n => `• ${n}`), '', await chiffres(p)].filter(Boolean).join('\n');
}

export async function projetsText(): Promise<string> {
  const l = await load().catch(() => []);
  if (!l.length) return '';
  return `PROJETS BUSINESS EN COURS (outil projet_business ; « combien ça me coûte », « fais l'étude », nouveaux prix → offre / cout ; privé) : ${l.map(p => `${p.name}${p.partner ? ` avec ${p.partner}` : ''} (${p.offers.length} offres, ${p.costs.length} coûts)`).join(' ; ')}.`;
}
