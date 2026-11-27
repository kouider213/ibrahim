/**
 * MON ANALYSE (27/11, Kouider : « avec tout ce qu'il sait il me fait une analyse avec des objectifs, ex. si tu fais ça tu vas
 * atteindre ça plutôt… + 20 options »). Tout est CALCULÉ sur ses vraies données (MON ARGENT, plan de départ, stock, FORME,
 * sommeil) — aucun chiffre inventé ; seul « Mon avis » (court) est écrit par l'IA à partir de ces calculs.
 * PRIVÉ : rien de ses montants dans ce fichier (dépôt public).
 */
import { kvJson, kvPut, ai } from './ai-util.js';
import { localNow } from './morning-routine.js';

const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;
const fr1 = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',');
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymAdd = (ym: string, k: number) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
const ymL = (ym: string) => `${MOIS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const dL = (d: string) => `${+d.slice(8, 10)} ${MOIS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const HIST = 'perso:analyse:hist', ENG = 'perso:analyse:engage';

/** « Je le fais » sur une option (app ou Telegram) — Dzaryx s'en sert dans son avis. */
export async function engage(id: string, on: boolean): Promise<Record<string, { at: string }>> {
  const e = await kvJson<Record<string, { at: string }>>(ENG, {});
  if (on) e[id] = { at: localNow().date }; else delete e[id];
  await kvPut(ENG, e); await kvPut('perso:analyse:avis', null).catch(() => {});
  return e;
}

export interface Objectif { id: string; icon: string; title: string; now: string; target: string; pct: number | null; by: string | null; text: string; tone: 'ok' | 'warn' | 'info' }
export interface OptionSi { id: string; icon: string; cat: 'argent' | 'depart' | 'snus' | 'fik' | 'corps' | 'sommeil' | 'famille'; si: string; alors: string; auLieu?: string; gain?: string; effort: 1 | 2 | 3 }

export async function analyseVie() {
  const today = localNow().date;
  const ma = await import('./mon-argent.js');
  const [o, dd, cut, sl, stock] = await Promise.all([
    ma.monArgentOverview(),
    ma.departDetail().catch(() => null),
    import('./forme-cut.js').then(m => m.cutStatus('kouider')).catch(() => null),
    import('./sleep-coach.js').then(m => m.sleepStats()).catch(() => null),
    import('./stock-produits.js').then(m => m.stockOverview()).catch(() => null),
  ]);

  // ── Départ : date réaliste, et « si +X €/mois » (même courbe que la fiche Ton plan de départ) ──
  const curve = dd?.monthly ?? [];
  const need = dd?.total ?? 0;
  const reach = (extra: number) => { for (let i = 0; i < curve.length; i++) if (curve[i]! + extra * i >= need) return i; return null; };
  const i0 = need ? reach(0) : null;
  const nowYm = dd?.now ?? today.slice(0, 7);
  const dateOf = (i: number | null) => (i === null ? 'pas avant 15 ans' : ymL(ymAdd(nowYm, i)));
  const departIf = (extra: number) => { const i = reach(extra); return { label: dateOf(i), gain: i0 !== null && i !== null ? i0 - i : null }; };
  const gainTxt = (g: number | null) => (g === null ? undefined : g > 0 ? `${g} mois plus tôt` : g < 0 ? `${-g} mois plus tard` : 'même date');

  const s = o.snus, marge = s.marginPiece ?? (s.costPiece != null ? 6 - s.costPiece : null);
  const sellDays = 26;   // 6 jours de vente par semaine (pas le lundi)
  const months = o.months6.filter(m => m.amount > 0);
  const avgMonth = months.length ? months.reduce((a, m) => a + m.amount, 0) / months.length : o.month.pace;
  const best = [...o.months6].filter(m => m.ym !== today.slice(0, 7)).sort((a, b) => b.amount - a.amount)[0];   // record = mois PRÉCÉDENTS

  // ── OBJECTIFS ──
  const obj: Objectif[] = [];
  if (dd && need) obj.push({ id: 'depart', icon: '🇩🇿', title: 'Partir vivre à Oran (maison puis voiture payées)', now: eur(dd.have), target: eur(need), pct: dd.pct, by: dd.departLabel,
    text: `À ton rythme actuel tu pars en ${dd.departLabel} (au mieux ${dd.departBest}). Prochain repère : ${eur(dd.next.need)} en ${dd.next.label}${dd.next.missing ? ` — il te manque ${eur(dd.next.missing)}` : ' — déjà atteint'}.`,
    tone: dd.next.missing ? 'warn' : 'ok' });
  {
    const record = Math.max(o.month.prev, best?.amount ?? 0, 1);
    const beaten = o.month.total >= record;
    // record déjà battu → nouvel objectif : +10 % sur le rythme du mois, arrondi à la centaine
    const target = beaten ? Math.ceil(Math.max(o.month.pace, o.month.total) * 1.1 / 100) * 100 : record;
    obj.push({ id: 'mois', icon: '📈', title: beaten ? 'Record battu : viser encore plus haut ce mois' : 'Battre ton meilleur mois', now: eur(o.month.total), target: eur(target), pct: Math.min(100, Math.round(o.month.total / target * 100)), by: 'fin du mois',
      text: beaten ? `Ton ancien record (${eur(record)}) est déjà battu. À ce rythme tu finis vers ${eur(o.month.pace)} ; objectif ${eur(target)} (≈ +10 %), il manque ${eur(Math.max(0, target - o.month.pace))} sur le rythme.`
        : `Ce mois tu vas finir vers ${eur(o.month.pace)} à ce rythme${o.month.pace >= target ? ' : record battu si tu tiens.' : `, il manquerait ${eur(target - o.month.pace)} pour faire ton record.`}`,
      tone: o.month.pace >= target ? 'ok' : 'warn' });
  }
  if (cut?.weight?.current) {
    const w = cut.weight, goal = w.goalKg ?? 75;
    obj.push({ id: 'poids', icon: '💪', title: `Poids : ${fr1(goal)} kg puis recomposition`, now: `${fr1(w.current)} kg`, target: `${fr1(goal)} kg`,
      pct: w.toLose > 0 ? null : 100, by: w.eta ? dL(w.eta) : null,
      text: w.toLose > 0 ? (w.eta ? `À ${fr1(w.rateWeek ?? 0)} kg/semaine, tu y es le ${dL(w.eta)}.` : 'Pas assez de pesées récentes pour calculer la date : pèse-toi 3 matins par semaine.') : 'Objectif de poids atteint : on garde et on construit du muscle (75 kg = plancher).',
      tone: w.toLose > 0 && !w.eta ? 'warn' : 'ok' });
  }
  if (sl && sl.avg7 != null) obj.push({ id: 'sommeil', icon: '😴', title: 'Dormir 7 h par nuit', now: `${fr1(sl.avg7)} h`, target: '7 h', pct: Math.min(100, Math.round(sl.avg7 / 7 * 100)), by: null,
    text: sl.debt > 0 ? `Dette de ${fr1(sl.debt)} h sur 7 nuits${sl.short ? ` (${sl.short} nuit${sl.short > 1 ? 's' : ''} sous 6 h)` : ''}.` : 'Pas de dette de sommeil cette semaine.', tone: sl.avg7 >= 7 ? 'ok' : 'warn' });
  const stockPieces = stock?.totalStock ?? o.extras?.stock?.pieces ?? null;
  const daysLeft = stockPieces != null && s.perDay > 0 ? Math.floor(stockPieces / s.perDay) : null;
  if (stockPieces != null) obj.push({ id: 'stock', icon: '📦', title: 'Jamais de rupture de snus', now: `${stockPieces} pièces`, target: daysLeft != null ? `> ${Math.round(s.perDay * 7)} pièces` : '—',
    pct: daysLeft != null ? Math.min(100, Math.round(daysLeft / 7 * 100)) : null, by: daysLeft != null ? dL(addDays(today, Math.round(daysLeft / 6 * 7))) : null,
    text: daysLeft != null ? `≈ ${daysLeft} jours de vente devant toi (à ${fr1(s.perDay)} pièces/jour).${stock?.reorder?.urgent ? ' Commande conseillée maintenant.' : ''}` : 'Note un comptage pour suivre le stock.', tone: daysLeft != null && daysLeft < 7 ? 'warn' : 'ok' });
  {
    const fik = o.month.bySource.find(x => x.id === 'fik')?.amount ?? 0, share = o.month.total ? Math.round(fik / o.month.total * 100) : 0;
    obj.push({ id: 'fik', icon: '🚗', title: 'FIK = ce qui te fera vivre à Oran', now: `${share} %`, target: '50 %', pct: Math.min(100, share * 2), by: dd?.departLabel ?? null,
      text: `FIK fait ${share} % de ce que tu gagnes hors salaire ce mois. Le snus et les heures sup s'arrêtent au départ : FIK doit porter la moitié avant de partir.`, tone: share >= 50 ? 'ok' : 'warn' });
  }

  // ── 20 OPTIONS « si tu fais ça → tu atteins ça » ──
  const opts: OptionSi[] = [];
  const add = (x: OptionSi) => { if (opts.length < 20) opts.push(x); };
  const dep = (id: string, icon: string, cat: OptionSi['cat'], si: string, perMonth: number, effort: 1 | 2 | 3) => {
    if (!need || perMonth <= 0) return;
    const r = departIf(perMonth);
    add({ id, icon, cat, si, alors: `départ pour Oran en ${r.label}`, auLieu: dd?.departLabel, gain: gainTxt(r.gain) ?? `+${eur(perMonth)}/mois`, effort });
  };
  if (marge) {
    dep('snus1', '🟢', 'snus', 'Tu vends 1 pièce de plus par jour de vente', marge * sellDays, 1);
    dep('snus3', '🟢', 'snus', 'Tu vends 3 pièces de plus par jour (un client fidèle de plus)', marge * sellDays * 3, 2);
  }
  if (s.discount > 0) dep('ristourne', '🏷️', 'snus', `Tu arrêtes les prix à 5 € sauf gros lots (ce mois : ${eur(s.discount)} donnés)`, s.discount, 1);
  dep('dep100', '✂️', 'argent', 'Tu coupes 100 € de dépenses par mois', 100, 1);
  dep('dep250', '✂️', 'argent', 'Tu coupes 250 € par mois (courses en gros, abonnements, extras)', 250, 2);
  dep('hs', '⏱️', 'argent', 'Tu fais 1 dimanche d\'heures sup de plus par mois', 150, 2);
  dep('fik10', '🚗', 'fik', 'FIK loue 10 jours de plus par mois (marge ≈ 8 €/jour)', 80, 2);
  dep('fik30', '🚗', 'fik', 'FIK loue 30 jours de plus par mois (haute saison, parrainage)', 240, 3);
  dep('appart', '🏠', 'fik', 'Tu loues un appartement de plus à Oran (≈ +150 €/mois)', 150, 3);
  if (o.month.pace > avgMonth && avgMonth > 0) dep('rythme', '🚀', 'argent', `Tu gardes le rythme de ce mois (${eur(o.month.pace)}) au lieu de ta moyenne notée des 6 derniers mois (${eur(avgMonth)})`, o.month.pace - avgMonth, 2);
  if (o.balances.aRecuperer > 0) add({ id: 'houari', icon: '🤝', cat: 'fik', si: `Tu récupères les ${eur(o.balances.aRecuperer)} chez Houari`, alors: `${eur(o.balances.cash + o.balances.aRecuperer)} en main (au lieu de ${eur(o.balances.cash)})`, gain: 'argent qui ne dort plus chez quelqu\'un', effort: 1 });
  if (o.balances.cash > 800) { const keep = 400, dep2 = o.balances.cash - keep;
    add({ id: 'depot', icon: '🏦', cat: 'argent', si: `Tu déposes ${eur(dep2)} de cash sur le compte (tu gardes ${eur(keep)} de fond de caisse)`, alors: 'cet argent ne part plus en petites dépenses invisibles', gain: 'le plan reste juste', effort: 1 }); }
  if (marge) { const weekGain = marge * 6 * 2;
    add({ id: 'semaine', icon: '📅', cat: 'snus', si: 'Cette semaine tu vends 2 pièces de plus chaque jour', alors: `+${eur(weekGain)} de bénéfice d'ici dimanche`, gain: `${eur(weekGain * 52)} sur un an`, effort: 1 }); }
  {
    const bw = [...o.weekdays].filter(w => w.n >= 2).sort((a, b) => b.avg - a.avg)[0];
    if (bw) add({ id: 'jourfort', icon: '🎯', cat: 'snus', si: `Tu prépares ton stock la veille du ${bw.name.toLowerCase()} et tu préviens tes fidèles`, alors: `tu sécurises ton meilleur jour (${eur(bw.avg)} en moyenne)`, gain: 'zéro vente ratée faute de stock', effort: 1 });
  }
  if (stock && s.perDay > 0) { const seuil = Math.ceil(s.perDay * ((stock.rhythm?.lead ?? 4) + 3));
    add({ id: 'seuil', icon: '📦', cat: 'snus', si: `Tu recommandes dès qu'il reste ${seuil} pièces`, alors: 'jamais de rupture (délai de livraison + 3 jours de marge couverts)', auLieu: daysLeft != null ? `${daysLeft} jours de stock aujourd'hui` : undefined, effort: 1 }); }
  {
    const noted = o.last30.filter(d => d.amount > 0).length;
    if (noted < 20) add({ id: 'noter', icon: '📝', cat: 'argent', si: 'Tu notes chaque vente le jour même (bouton +1 ou « 3 pièces »)', alors: 'une date de départ juste, pas une estimation', auLieu: `${noted} jours notés sur 30`, effort: 1 });
  }
  if (o.month.pace > 0) { const year = o.month.pace * 12;
    add({ id: 'an', icon: '🗓️', cat: 'argent', si: `Tu tiens le rythme de ce mois (${eur(o.month.pace)}) pendant 12 mois`, alors: `≈ ${eur(year)} gagnés hors salaire sur les 12 prochains mois`, gain: `≈ ${eur(year * 0.3)} d'épargne en plus si tu en gardes 30 %`, effort: 1 }); }
  if (cut?.weight?.current && cut.weight.toLose > 0 && cut.weight.rateWeek && cut.weight.rateWeek > 0.05) {
    const w = cut.weight, base = Math.ceil(w.toLose / w.rateWeek! * 7), fast = Math.ceil(w.toLose / (w.rateWeek! + 0.07) * 7);
    add({ id: 'pas', icon: '🚶', cat: 'corps', si: 'Tu ajoutes 2 000 pas par jour (≈ 80 kcal)', alors: `${fr1(w.goalKg ?? 75)} kg le ${dL(addDays(today, fast))}`, auLieu: dL(addDays(today, base)), gain: `${base - fast} jours plus tôt`, effort: 1 });
  } else if (cut?.weight?.current && cut.weight.toLose > 0) {
    add({ id: 'pesee', icon: '⚖️', cat: 'corps', si: 'Tu te pèses 3 matins par semaine', alors: 'Dzaryx calcule ta vraie date d\'arrivée et ajuste tes calories', effort: 1 });
  }
  if (cut?.protein?.goal) add({ id: 'prot', icon: '🥛', cat: 'corps', si: `Tu atteins ${Math.round(cut.protein.goal)} g de protéines chaque jour`, alors: 'tu perds du gras sans perdre tes charges (bras droit compris)', effort: 1 });
  if (sl && sl.debt > 0) { const nights = Math.ceil(sl.debt / 0.5);
    add({ id: 'dodo', icon: '😴', cat: 'sommeil', si: 'Tu te couches 30 min plus tôt (téléphone posé)', alors: `ta dette de ${fr1(sl.debt)} h est remboursée en ${nights} nuits`, gain: 'plus d\'énergie au travail et à la salle', effort: 2 }); }
  add({ id: 'famille', icon: '👨‍👩‍👦', cat: 'famille', si: 'Tu bloques ton lundi pour ta femme et Ibrahim (aucun client, aucun snus)', alors: 'une vraie journée à trois chaque semaine = 52 souvenirs par an', gain: 'tu tiens le rythme sans t\'user', effort: 1 });
  if (need && i0 !== null) { const i5 = reach(-(avgMonth * 0.1));
    add({ id: 'piege', icon: '⚠️', cat: 'depart', si: 'Tu laisses filer 10 % de plus chaque mois en petites dépenses', alors: `départ en ${dateOf(i5)}`, auLieu: dd?.departLabel, gain: i5 !== null ? `${i5 - i0} mois perdus` : 'départ repoussé de plusieurs années', effort: 1 }); }

  // 27/11 v2 : historique (1 photo par jour) → « il y a 7 jours » sur chaque objectif ; engagements « je le fais »
  const hist = await kvJson<Record<string, Record<string, { now: string; by: string | null; pct: number | null }>>>(HIST, {});
  hist[today] = Object.fromEntries(obj.map(x => [x.id, { now: x.now, by: x.by, pct: x.pct }]));
  const keep = Object.keys(hist).sort().slice(-60);
  await kvPut(HIST, Object.fromEntries(keep.map(k => [k, hist[k]!]))).catch(() => {});
  const ref = keep.filter(k => k <= addDays(today, -7)).pop() ?? (keep[0] !== today ? keep[0] : undefined);
  const before = ref ? { date: ref, items: hist[ref]! } : null;
  const engaged = await kvJson<Record<string, { at: string }>>(ENG, {});
  return { today, objectifs: obj, options: opts.slice(0, 20), depart: dd ? { label: dd.departLabel, best: dd.departBest, slow: dd.departSlow, pct: dd.pct } : null,
    before, engaged,
    // simulateur « et si… » côté app : même courbe que le plan de départ
    sim: dd && need ? { curve: curve.slice(0, 180), need, nowYm, marge: marge ?? 2, fikDay: 8, departLabel: dd.departLabel } : null };
}

/** « Mon avis » : 5-6 lignes écrites à partir des calculs (gardé 6 h). */
export async function analyseAvis(force = false): Promise<string> {
  const key = 'perso:analyse:avis';
  const c = await kvJson<{ at: number; text: string } | null>(key, null);
  if (!force && c && Date.now() - c.at < 6 * 3600_000) return c.text;
  const a = await analyseVie();
  const eng = Object.keys(a.engaged ?? {});
  const facts = [
    ...(eng.length ? [`IL S'EST ENGAGÉ À : ${a.options.filter(o => eng.includes(o.id)).map(o => `${o.si} (depuis le ${a.engaged[o.id]!.at})`).join(' ; ')} — encourage-le sur ça en premier.`] : []),
    ...(a.before ? a.objectifs.filter(x => a.before!.items[x.id] && a.before!.items[x.id]!.now !== x.now).map(x => `Évolution depuis le ${a.before!.date} : ${x.title} ${a.before!.items[x.id]!.now} → ${x.now}`) : []),
    ...a.objectifs.map(x => `${x.title} : ${x.now} → ${x.target}${x.by ? ` (${x.by})` : ''}. ${x.text}`),
    ...a.options.map(x => `SI ${x.si} → ${x.alors}${x.auLieu ? ` au lieu de ${x.auLieu}` : ''}${x.gain ? ` (${x.gain})` : ''}`),
  ].join('\n');
  const text = await ai(`Voici l'analyse CALCULÉE de la vie de Kouider (argent, départ à Oran, snus, FIK, corps, sommeil) :\n${facts}\n\n`
    + 'Écris « Mon avis » : 6 lignes maximum, en français simple, tutoiement. 1) où il en est en une phrase, 2) les 3 options qui changent le plus sa vie pour le moins d\'effort (reprends les chiffres EXACTS ci-dessus, aucun autre), 3) un objectif clair pour les 30 prochains jours, chiffré. Pas de titres markdown, pas de « ### ».',
  { system: 'Tu es Dzaryx, l\'assistant de Kouider. Tu ne cites QUE les chiffres fournis, jamais d\'autres. Sa famille = sa femme ET son fils Ibrahim, qui vivent avec lui. FIK ne possède aucune voiture (elles sont à Houari).', max: 700 }).catch(() => '');
  if (text) await kvPut(key, { at: Date.now(), text });
  return text || c?.text || '';
}

/** Texte pour Telegram (outil mon_analyse). */
export async function analyseTool(input: Record<string, unknown>): Promise<string> {
  if (input['action'] === 'engage' || input['action'] === 'desengage') {
    const a = await analyseVie(); const n = Number(input['n']); const o = a.options[n - 1];
    if (!o) return `Option ${n} introuvable (1 à ${a.options.length}).`;
    await engage(o.id, input['action'] === 'engage');
    return input['action'] === 'engage' ? `✅ Engagé : « ${o.si} » → ${o.alors}. Je te suis dessus.` : `Option ${n} retirée de tes engagements.`;
  }
  return analyseText();
}

export async function analyseText(): Promise<string> {
  const [a, avis] = await Promise.all([analyseVie(), analyseAvis().catch(() => '')]);
  return [
    '🧭 MON ANALYSE',
    '', 'OBJECTIFS',
    ...a.objectifs.map(x => `${x.icon} ${x.title} : ${x.now} → ${x.target}${x.by ? ` · ${x.by}` : ''}${a.before?.items[x.id] && a.before.items[x.id]!.now !== x.now ? ` (le ${a.before.date.slice(8, 10)}/${a.before.date.slice(5, 7)} : ${a.before.items[x.id]!.now})` : ''}\n   ${x.text}`),
    '', '20 OPTIONS — SI TU FAIS ÇA…',
    ...a.options.map((x, i) => `${i + 1}. ${a.engaged[x.id] ? '✅ ' : ''}${x.icon} Si ${x.si.charAt(0).toLowerCase()}${x.si.slice(1)} → ${x.alors}${x.auLieu ? ` (au lieu de ${x.auLieu})` : ''}${x.gain ? ` · ${x.gain}` : ''}`),
    ...(avis ? ['', '💬 MON AVIS', avis] : []),
    '', 'Dis « je m\'engage sur la 3 » pour que je te suive dessus. Tout est aussi dans l\'app : MON ANALYSE (simulateur « et si » compris).',
  ].join('\n');
}
