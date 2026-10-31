// COACH ARGENT (31/10/2026, demande de Kouider) — construit sur ses finances perso (perso-finances.ts, app_kv perso:finances).
// Caisse du jour (ventes cash/carte), commandes de stock, dépenses + garde-fou, bilans semaine/mois, compteur Oran,
// crédit (remboursement anticipé), valeur de son heure, fonds d'urgence, zakat, cagnottes. Tout est PRIVÉ (app_kv) :
// aucune activité ni aucun chiffre dans le dépôt public. Outil mes_finances (actions ci-dessous) + job argent.
import { kvJson, kvPut, tg } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { loadFinances, budget, debts, monthsLeft, type Finances } from './perso-finances.js';

const J = 'perso:journal', S = 'perso:argent';
type Entry = { d: string; t: 'vente' | 'achat' | 'depense'; cat: string; amount: number; mode: 'cash' | 'carte'; note?: string };
type Pot = { name: string; amount: number; deadline?: string; saved: number };
type Settings = { oranDate?: string; oranTarget?: number; creditRate?: number; hoursWeek?: number; overtimeHoursWeek?: number; fikHoursWeek?: number; zakatDate?: string; pots: Pot[]; alerts?: Record<string, boolean> };

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const num = (v: unknown) => { const s = String(v ?? '').trim(); if (!s) return undefined; const n = Number(s.replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : undefined; };
const journal = () => kvJson<Entry[]>(J, []);
const settings = () => kvJson<Settings>(S, { pots: [] });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const sum = (l: Entry[]) => l.reduce((s, e) => s + e.amount, 0);
const sideCat = (f: Finances) => (f.side?.label ?? 'appoint').toLowerCase();
const catOf = (v: unknown, f: Finances) => { const c = String(v ?? '').toLowerCase().trim(); return !c ? sideCat(f) : /fik|loc/.test(c) ? 'fik' : c; };

async function add(e: Entry): Promise<void> {
  const l = await journal();
  l.push(e);
  await kvPut(J, l.filter(x => x.d >= daysAgo(800)));
}

// ── Garde-fou dépenses du mois ───────────────────────────────────────────────
async function spendStatus(): Promise<{ spent: number; limit: number; pct: number }> {
  const [f, l] = await Promise.all([loadFinances(), journal()]);
  const m = localNow().date.slice(0, 7);
  const spent = sum(l.filter(e => e.t === 'depense' && e.d.startsWith(m)));
  const limit = Math.max(1, budget(f).rest);
  return { spent, limit, pct: Math.round(spent / limit * 100) };
}

// ── Stock (commandes) : rythme et prochaine commande ────────────────────────
async function stockInfo(cat: string): Promise<{ last?: string; avgDays?: number; dueIn?: number; margin30: number; sales30: number; buys30: number }> {
  const l = await journal();
  const orders = l.filter(e => e.t === 'achat' && e.cat === cat).map(e => e.d).sort();
  const gaps = orders.slice(1).map((d, i) => (Date.parse(d) - Date.parse(orders[i]!)) / 86_400_000).filter(g => g > 0).slice(-5);
  const avgDays = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : undefined;
  const last = orders.at(-1);
  const since = last ? Math.round((Date.now() - Date.parse(last)) / 86_400_000) : undefined;
  const from = daysAgo(30);
  const sales30 = sum(l.filter(e => e.t === 'vente' && e.cat === cat && e.d >= from));
  const buys30 = sum(l.filter(e => e.t === 'achat' && e.cat === cat && e.d >= from));
  return { last, avgDays, dueIn: avgDays !== undefined && since !== undefined ? avgDays - since : undefined, margin30: sales30 - buys30, sales30, buys30 };
}

// ── Bilans ───────────────────────────────────────────────────────────────────
function block(l: Entry[]): string[] {
  const by = (t: Entry['t']) => { const m = new Map<string, { cash: number; carte: number }>(); for (const e of l.filter(x => x.t === t)) { const v = m.get(e.cat) ?? { cash: 0, carte: 0 }; v[e.mode] += e.amount; m.set(e.cat, v); } return m; };
  const fmt = (m: Map<string, { cash: number; carte: number }>) => [...m].map(([k, v]) => `${k} ${eur(v.cash + v.carte)}${v.carte && v.cash ? ` (cash ${eur(v.cash)} · carte ${eur(v.carte)})` : v.carte ? ' (carte)' : ' (cash)'}`).join(' · ');
  const v = by('vente'), a = by('achat'), d = by('depense');
  return [v.size ? `💵 Ventes : ${fmt(v)}` : '💵 Ventes : rien de noté', ...(a.size ? [`📦 Commandes de stock : ${fmt(a)}`] : []), ...(d.size ? [`🧾 Dépenses : ${fmt(d)}`] : [])];
}

export async function bilanSemaine(): Promise<string> {
  const [l, f] = await Promise.all([journal(), loadFinances()]);
  const w = l.filter(e => e.d > daysAgo(7)), prev = l.filter(e => e.d > daysAgo(14) && e.d <= daysAgo(7));
  if (!w.length) return '';
  const cat = sideCat(f);
  const net = (x: Entry[]) => sum(x.filter(e => e.t === 'vente')) - sum(x.filter(e => e.t === 'achat'));
  const days = new Set(w.filter(e => e.t === 'vente' && e.cat === cat).map(e => e.d)).size;
  const sCat = sum(w.filter(e => e.t === 'vente' && e.cat === cat));
  const sp = await spendStatus();
  const n = net(w), p = net(prev);
  return ['💰 TON ARGENT — LA SEMAINE', ...block(w),
    days ? `📊 ${cat} : ${eur(sCat)} sur ${days} jour${days > 1 ? 's' : ''} (moyenne ${eur(sCat / days)}/jour${f.side ? `, ta fourchette ${eur(f.side.dailyMin)}–${eur(f.side.dailyMax)}` : ''})` : '',
    `= Ce qui est rentré net (ventes − stock) : ${eur(n)}${prev.length ? ` (${n >= p ? '+' : ''}${eur(n - p)} vs la semaine d'avant)` : ''}`,
    `🧾 Dépenses du mois : ${eur(sp.spent)} / ${eur(sp.limit)} (${sp.pct} %)`,
    `👉 L'action de la semaine : ${sp.pct > 85 ? 'freine les dépenses jusqu\'à la fin du mois, ton épargne ne se touche pas.' : n > 0 ? `mets ${eur(Math.round(n * 0.3 / 10) * 10)} (30 % du net) dans ta caisse épargne ce soir.` : 'note chaque vente le jour même, sinon je ne peux pas t\'aider à piloter.'}`].filter(Boolean).join('\n');
}

export async function bilanMois(month?: string): Promise<string> {
  const [l, f] = await Promise.all([journal(), loadFinances()]);
  const m = month ?? (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const x = l.filter(e => e.d.startsWith(m));
  const b = budget(f);
  const ventes = sum(x.filter(e => e.t === 'vente')), achats = sum(x.filter(e => e.t === 'achat')), dep = sum(x.filter(e => e.t === 'depense'));
  const total = b.salary + b.extra + ventes - achats;
  return [`📅 TON VRAI REVENU — ${m.slice(5)}/${m.slice(0, 4)}`,
    `• Salaire ${eur(b.salary)}${b.extra ? ` + heures sup ${eur(b.extra)}` : ''}`,
    ...block(x),
    `= REVENU TOTAL : ${eur(total)} (salaire + heures sup + ventes − stock)`,
    `− Charges fixes ${eur(b.charges)} − dépenses notées ${eur(dep)}`,
    `= Il te reste ${eur(total - b.charges - dep)}, dont ${eur(b.save)} prévus en épargne.`,
    x.length < 5 ? '⚠️ Peu de choses notées ce mois : le chiffre réel est sûrement plus haut. Dis « snus 180 », « 45 essence »… chaque jour.' : ''].filter(Boolean).join('\n');
}

// ── Compteur Oran ────────────────────────────────────────────────────────────
export async function oran(): Promise<string> {
  const [f, s] = await Promise.all([loadFinances(), settings()]);
  const target = s.oranDate ?? '2028-12';
  const now = new Date();
  const months = Math.max(0, monthsLeft(target, now));
  const freed = debts(f).reduce((t, d) => t + d.amount * Math.max(0, months - d.months), 0);   // crédit fini → la mensualité part en épargne
  const base = (f.savings ?? 0) + (f.sideCash ?? 0);
  const proj = base + (f.monthlySaving ?? 0) * months + freed;
  const pct = s.oranTarget ? Math.round(proj / s.oranTarget * 100) : null;
  return [`🇩🇿 COMPTEUR ORAN — départ visé ${target.slice(5)}/${target.slice(0, 4)} (dans ${months} mois)`,
    `• Aujourd'hui : ${eur(base)} (épargne + caisse)`,
    `• + ${eur(f.monthlySaving ?? 0)}/mois × ${months} mois${freed ? ` + ${eur(freed)} grâce à la fin du crédit` : ''}`,
    `= À ton rythme actuel : ≈ ${eur(proj)} le jour du départ, sans compter FIK ni ce que tu gardes de l'appoint.`,
    s.oranTarget ? `🎯 Ton objectif : ${eur(s.oranTarget)} → ${pct} % ${pct! >= 100 ? '✅ tu y es, continue' : `(il manque ${eur(s.oranTarget - proj)} → ${eur((s.oranTarget - proj) / Math.max(1, months))}/mois de plus)`}` : '🎯 Donne-moi ton objectif d\'argent pour partir (« objectif Oran 60 000 ») et je te dis si tu es en avance ou en retard.'].join('\n');
}

// ── Crédit : rembourser en avance ? ─────────────────────────────────────────
export async function credit(rate?: number): Promise<string> {
  const [f, s] = await Promise.all([loadFinances(), settings()]);
  const d = debts(f)[0];
  if (!d) return '✅ Aucun crédit en cours chez moi.';
  const r = rate ?? s.creditRate;
  if (r === undefined) return `🚗 ${d.label}. Pour savoir si tu dois le rembourser en avance, il me faut le TAEG de ton crédit (sur ton contrat ou ton appli bancaire), ex. « mon crédit est à 5,9 % ».`;
  if (rate !== undefined) await kvPut(S, { ...s, creditRate: rate });
  const i = r / 100 / 12, n = d.months;
  const capital = i > 0 ? d.amount * (1 - Math.pow(1 + i, -n)) / i : d.amount * n;
  const fee = capital * (n > 12 ? 0.01 : 0.005);   // Belgique, crédit à la consommation : indemnité max 1 % (0,5 % si < 1 an)
  const saved = d.amount * n - capital - fee;
  const left = (f.savings ?? 0) - capital - fee;
  const verdict = r < 3 ? 'NON : ton crédit coûte moins cher que ce que ton argent peut rapporter ou te protéger. Garde ton épargne.'
    : left < 6000 ? 'PAS MAINTENANT : il te resterait trop peu de côté. Garde au moins 3 mois de dépenses en sécurité.'
      : saved > 400 ? `OUI, ça vaut le coup : tu gagnes ≈ ${eur(saved)} et ${eur(d.amount)}/mois redeviennent libres tout de suite.` : 'BOF : le gain est petit, garde ta liberté (ton argent pour Oran / un business).';
  return [`🚗 Crédit auto — rembourser en avance ?`,
    `• Il reste ${n} × ${eur(d.amount)} = ${eur(d.amount * n)} à payer`, `• Capital à rembourser aujourd'hui ≈ ${eur(capital)} (taux ${r} %) + indemnité ≈ ${eur(fee)}`,
    `• Intérêts économisés ≈ ${eur(saved)}`, `• Il te resterait ≈ ${eur(left)} d'épargne`, `👉 ${verdict}`,
    'Demande le décompte exact à ta banque avant de décider.'].join('\n');
}

// ── Valeur de son heure ──────────────────────────────────────────────────────
export async function heure(): Promise<string> {
  const [f, s] = await Promise.all([loadFinances(), settings()]);
  const h = s.hoursWeek ?? 38;
  const perMonth = h * 52 / 12;
  const lines = [`⏱️ TON HEURE VAUT…`, `• Librairie : ${eur((f.salary ?? 0) / perMonth)}/h net (${h} h/semaine — dis « je fais 36 h » si ce n'est pas ça)`];
  const ot = (f.extras ?? []).find(e => /sup/i.test(e.label));
  if (ot) lines.push(s.overtimeHoursWeek ? `• Heures sup : ${eur(ot.amount / s.overtimeHoursWeek)}/h` : '• Heures sup : dis-moi combien d\'heures sup par semaine pour les 115 € (« 6 h sup »).');
  const cat = sideCat(f);
  const st = await stockInfo(cat);
  const days = new Set((await journal()).filter(e => e.t === 'vente' && e.cat === cat && e.d >= daysAgo(30)).map(e => e.d)).size;
  if (days) lines.push(`• ${cat} : ${eur(st.margin30 / days)} net par jour travaillé (30 j : ventes ${eur(st.sales30)} − stock ${eur(st.buys30)}) — en plus de ton heure de salaire, sur le même temps`);
  const fik = sum((await journal()).filter(e => e.t === 'vente' && e.cat === 'fik' && e.d >= daysAgo(30)));
  if (fik && s.fikHoursWeek) lines.push(`• FIK : ${eur(fik / (s.fikHoursWeek * 52 / 12))}/h (cash noté sur 30 j)`);
  else lines.push('• FIK : dis-moi combien d\'heures par semaine tu passes sur FIK (« FIK 10 h ») et note tes rentrées FIK (« FIK 120 »).');
  lines.push('👉 Règle : ce qui rapporte moins que ton heure de librairie, délègue-le (Houari bof, Dzaryx) ou arrête-le.');
  return lines.join('\n');
}

// ── Fonds d'urgence ──────────────────────────────────────────────────────────
export async function urgence(): Promise<string> {
  const [f, l] = await Promise.all([loadFinances(), journal()]);
  const b = budget(f);
  const dep3 = sum(l.filter(e => e.t === 'depense' && e.d >= daysAgo(90))) / 3;
  const monthNeed = b.charges + Math.max(dep3, b.rest * 0.8);
  const target = monthNeed * 3;
  const have = f.savings ?? 0;
  return [`🛟 FONDS D'URGENCE (3 mois de vie si tout s'arrête)`, `• Il te faut ≈ ${eur(target)} (${eur(monthNeed)}/mois : charges + dépenses)`,
    `• Tu as ${eur(have)} d'épargne → ${have >= target ? `✅ couvert. Garde ${eur(target)} sur un compte à part, qui ne sert JAMAIS pour un business ; le reste (${eur(have - target)}) peut travailler (Oran, or, projet avec Houari bof).` : `il manque ${eur(target - have)} : priorité avant tout investissement.`}`].join('\n');
}

// ── Zakat ────────────────────────────────────────────────────────────────────
export async function zakat(date?: string): Promise<string> {
  const [f, s] = await Promise.all([loadFinances(), settings()]);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) await kvPut(S, { ...s, zakatDate: date });
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const g24eur = g ? g.now / 0.75 / g.eurDzd : 75;   // prix du gramme 24 carats en € (depuis l'or 18 carats au marché algérien)
  const nisab = 85 * g24eur;
  const wealth = (f.savings ?? 0) + (f.sideCash ?? 0);
  const due = wealth >= nisab ? wealth * 0.025 : 0;
  const zd = date ?? s.zakatDate;
  return [`🤲 ZAKAT`, `• Nissab (85 g d'or) ≈ ${eur(nisab)}${g ? ' (or au marché algérien)' : ' (estimation)'}`,
    `• Ton argent épargné : ${eur(wealth)} → ${due ? `zakat ≈ ${eur(due)} (2,5 %) quand une année lunaire est passée sur ce montant` : 'sous le nissab, pas de zakat'}`,
    zd ? `• Ta date de zakat : ${zd.slice(8)}/${zd.slice(5, 7)} — je te le rappelle 3 jours avant.` : '• Donne-moi ta date de zakat (« ma zakat c\'est le 15 mars ») et je te la rappelle chaque année.',
    'Les dettes qui tombent dans l\'année (crédit) peuvent se déduire selon l\'avis de ton imam : demande-lui.'].join('\n');
}

// ── Cagnottes (achat, Aïd, été à Oran…) ─────────────────────────────────────
async function pots(input: Record<string, unknown>): Promise<string> {
  const s = await settings();
  const name = String(input['label'] ?? input['name'] ?? '').trim();
  const op = String(input['op'] ?? (name ? 'add' : 'list'));
  const p = s.pots.find(x => x.name.toLowerCase() === name.toLowerCase());
  const amount = num(input['amount']);
  if (op === 'add' && name) {
    if (p) { if (amount !== undefined) p.amount = amount; } else if (amount !== undefined) s.pots.push({ name, amount, saved: 0, ...(/^\d{4}-\d{2}/.test(String(input['until'] ?? '')) ? { deadline: String(input['until']).slice(0, 7) } : {}) });
    else return '❌ Il me faut le montant de la cagnotte (amount).';
  } else if (op === 'paid' && p && amount !== undefined) p.saved += amount;
  else if (op === 'remove' && p) s.pots = s.pots.filter(x => x !== p);
  await kvPut(S, s);
  if (!s.pots.length) return '🐖 Aucune cagnotte. Ex. « cagnotte été Oran 3 000 € pour juin 2027 », « cagnotte Aïd 500 ».';
  return ['🐖 TES CAGNOTTES', ...s.pots.map(x => { const m = x.deadline ? Math.max(1, monthsLeft(x.deadline)) : 0; const rest = Math.max(0, x.amount - x.saved); return `• ${x.name} : ${eur(x.saved)} / ${eur(x.amount)}${x.deadline ? ` — ${rest ? `${eur(rest / m)}/mois jusqu'à ${x.deadline.slice(5)}/${x.deadline.slice(0, 4)}` : '✅'}` : ''}`; })].join('\n');
}

/** Actions de mes_finances gérées ici. null = pas pour ce module. */
export async function argentTool(action: string, input: Record<string, unknown>): Promise<string | null> {
  const f = await loadFinances();
  const amount = num(input['amount']);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input['date'] ?? '')) ? String(input['date']) : localNow().date;
  const note = input['note'] ? String(input['note']) : undefined;
  switch (action) {
    case 'vente': {
      if (amount === undefined) return '❌ Combien ? (amount)';
      const cat = catOf(input['cat'], f);
      const mode = /carte|cb|virement/i.test(String(input['mode'] ?? '')) ? 'carte' : 'cash';
      await add({ d: date, t: 'vente', cat, amount, mode, ...(note ? { note } : {}) });
      const l = await journal();
      const day = sum(l.filter(e => e.t === 'vente' && e.cat === cat && e.d === date));
      return `✅ ${cat} : +${eur(amount)} (${mode})${day !== amount ? ` — ${eur(day)} aujourd'hui` : ''}.${f.side && cat === sideCat(f) && day < f.side.dailyMin ? ` Un peu sous ta moyenne (${eur(f.side.dailyMin)}).` : ''}`;
    }
    case 'commande': {
      if (amount === undefined) return '❌ Combien ta commande ? (amount)';
      const cat = catOf(input['cat'], f);
      await add({ d: date, t: 'achat', cat, amount, mode: /carte|cb|virement/i.test(String(input['mode'] ?? '')) ? 'carte' : 'cash', ...(note ? { note } : {}) });
      const st = await stockInfo(cat);
      return `📦 Commande ${cat} de ${eur(amount)} notée.${st.avgDays ? ` Tu commandes en moyenne tous les ${st.avgDays} jours : je te le rappelle avant la prochaine.` : ' Dès la 2e commande je connais ton rythme et je te préviens avant d\'en manquer.'}${st.sales30 ? ` Sur 30 j : ventes ${eur(st.sales30)} − stock ${eur(st.buys30)} = ${eur(st.margin30)} net.` : ''}`;
    }
    case 'depense': {
      if (amount === undefined) return '❌ Combien ? (amount)';
      const cat = String(input['cat'] ?? input['label'] ?? 'divers').toLowerCase();
      await add({ d: date, t: 'depense', cat, amount, mode: /cash|liquide|espèce/i.test(String(input['mode'] ?? '')) ? 'cash' : 'carte', ...(note ? { note } : {}) });
      const sp = await spendStatus();
      const s = await settings(); const m = date.slice(0, 7); s.alerts ??= {};
      let warn = '';
      if (sp.pct >= 100 && !s.alerts[`${m}:100`]) { s.alerts[`${m}:100`] = true; warn = `\n🚨 Budget du mois DÉPASSÉ (${eur(sp.spent)} / ${eur(sp.limit)}). Stop aux dépenses non vitales : ne touche pas à tes ${eur(f.monthlySaving ?? 0)} d'épargne.`; }
      else if (sp.pct >= 80 && !s.alerts[`${m}:80`]) { s.alerts[`${m}:80`] = true; warn = `\n⚠️ 80 % du budget du mois déjà dépensé. Il reste ${eur(sp.limit - sp.spent)} jusqu'à la fin du mois.`; }
      if (warn) await kvPut(S, s);
      return `🧾 ${cat} −${eur(amount)}. Ce mois : ${eur(sp.spent)} / ${eur(sp.limit)} (${sp.pct} %).${warn}`;
    }
    case 'annuler': {
      const l = await journal(); const e = l.pop();
      if (!e) return 'Rien à annuler.';
      await kvPut(J, l); return `↩️ Annulé : ${e.t} ${e.cat} ${eur(e.amount)} du ${e.d.slice(8)}/${e.d.slice(5, 7)}.`;
    }
    case 'jour': {
      const l = (await journal()).filter(e => e.d === date);
      return l.length ? [`📒 ${date.slice(8)}/${date.slice(5, 7)}`, ...block(l)].join('\n') : 'Rien de noté ce jour-là.';
    }
    case 'stock': {
      const cat = catOf(input['cat'], f); const st = await stockInfo(cat);
      return `📦 Stock ${cat} : dernière commande ${st.last ? `le ${st.last.slice(8)}/${st.last.slice(5, 7)}` : 'jamais notée'}${st.avgDays ? `, rythme ${st.avgDays} j → ${st.dueIn! <= 0 ? 'à recommander MAINTENANT' : `prochaine dans ≈ ${st.dueIn} j`}` : ''}. 30 j : ventes ${eur(st.sales30)} − stock ${eur(st.buys30)} = ${eur(st.margin30)} net.`;
    }
    case 'semaine': return (await bilanSemaine()) || 'Rien de noté cette semaine. Dis « snus 180 », « commande snus 1000 », « 45 essence »…';
    case 'mois': return bilanMois(/^\d{4}-\d{2}$/.test(String(input['month'] ?? '')) ? String(input['month']) : localNow().date.slice(0, 7));
    case 'oran': {
      const s = await settings();
      const t = num(input['target']); const until = String(input['until'] ?? '');
      if (t !== undefined || /^\d{4}-\d{2}/.test(until)) await kvPut(S, { ...s, ...(t !== undefined ? { oranTarget: t } : {}), ...(/^\d{4}-\d{2}/.test(until) ? { oranDate: until.slice(0, 7) } : {}) });
      return oran();
    }
    case 'credit': return credit(num(input['rate']));
    case 'heures': {
      const s = await settings();
      const h = num(input['hours_week']), o = num(input['overtime_hours']), k = num(input['fik_hours']);
      await kvPut(S, { ...s, ...(h !== undefined ? { hoursWeek: h } : {}), ...(o !== undefined ? { overtimeHoursWeek: o } : {}), ...(k !== undefined ? { fikHoursWeek: k } : {}) });
      return heure();
    }
    case 'heure': return heure();
    case 'urgence': return urgence();
    case 'zakat': return zakat(String(input['date'] ?? '') || undefined);
    case 'cagnotte': return pots(input);
    default: return null;
  }
}

/** Contexte court pour le cerveau (ajouté au bloc finances du dossier). */
export async function argentText(): Promise<string> {
  const [f, sp] = await Promise.all([loadFinances(), spendStatus()]);
  if (!f.salary) return '';
  const st = await stockInfo(sideCat(f));
  return `- Mois en cours : dépenses notées ${eur(sp.spent)} / ${eur(sp.limit)} (${sp.pct} %).${st.last ? ` Dernière commande ${sideCat(f)} le ${st.last.slice(8)}/${st.last.slice(5, 7)}${st.dueIn !== undefined ? ` (prochaine ≈ ${st.dueIn} j)` : ''}.` : ''}
- Quand il dit « snus 180 » / « j'ai vendu pour 150 » → mes_finances vente ; « FIK 120 cash » → vente cat fik ; « commande snus 1000 » / « j'ai recommandé pour 1000 » → commande ; « 45 essence », « 120 courses » → depense (cat) ; « je peux m'acheter X à Y € ? » → regarde le garde-fou et l'épargne, réponds franchement ; « compteur Oran » → oran ; « rembourser mon crédit ? » → credit ; « mon heure vaut combien » → heure ; zakat, fonds d'urgence, cagnottes → actions du même nom.`;
}

// ── Job (*/15) : soirée « combien aujourd'hui ? », stock, bilan dimanche, bilan du 1er, zakat ──
export async function jobArgent(): Promise<void> {
  const f = await loadFinances().catch(() => null);
  if (!f?.salary) return;
  const { date, hhmm, weekday } = localNow();
  const plus = await import('./grand-coach-plus.js');
  const once = async (k: string, make: () => Promise<string>, important = false) => {
    const key = `argent:sent:${k}:${date}`;
    if (await kvJson<string | null>(key, null)) return;
    if (!(await plus.canSpeak(important))) return;
    const t = await make().catch(() => '');
    await kvPut(key, '1', 2 * 86_400);
    if (t) { await tg(t); await plus.spoke(); }
  };
  const between = (a: string, b: string) => hhmm >= a && hhmm < b;
  // 20h30 : il a travaillé (GPS) ou jour de semaine hors congé, et rien noté → on demande
  if (between('20:30', '22:00') && weekday !== 0) {
    const gps = await kvJson<{ date: string; work?: boolean }>('gc:gpsday', { date: '' });
    const off = await import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false);
    const worked = (gps.date === date && gps.work) || !off;
    const cat = sideCat(f);
    const noted = (await journal()).some(e => e.d === date && e.t === 'vente' && e.cat === cat);
    if (worked && !noted) await once('soir', async () => {
      const st = await stockInfo(cat);
      return `💵 Combien de ${cat} aujourd'hui ? Réponds juste « ${cat} 170 » (et « FIK 100 » si tu as encaissé pour FIK).${st.dueIn !== undefined && st.dueIn <= 2 ? `\n📦 Ton stock : d'habitude tu recommandes tous les ${st.avgDays} j, la dernière fois c'était le ${st.last!.slice(8)}/${st.last!.slice(5, 7)} → pense à recommander.` : ''}`;
    });
  }
  if (weekday === 0 && between('18:00', '20:00')) await once('semaine', bilanSemaine);
  if (date.endsWith('-01') && between('09:30', '12:00')) await once('mois', async () => `${await bilanMois()}\n\n${await oran()}`, true);
  const s = await settings();
  if (s.zakatDate && between('10:00', '12:00')) {
    const next = new Date(`${date.slice(0, 4)}${s.zakatDate.slice(4)}T12:00:00Z`);
    const d = Math.round((next.getTime() - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
    if (d === 3) await once('zakat', () => zakat(), true);
  }
}
