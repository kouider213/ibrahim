/**
 * MES VOYAGES (27/11, Kouider : « je veux pouvoir lui dire via Telegram ou l'app : je veux aller en Algérie en voiture,
 * je prends le bateau en Espagne, la dernière fois ça m'a coûté X €, cette fois je veux de bonnes vacances, 1 mois au
 * total → prépare-moi les lieux, villes à visiter… en PDF, avec des objectifs, avec tout ce que tu sais sur moi (toujours
 * avec ma femme et mon fils) + 30 options auxquelles je n'aurais jamais pensé »).
 *
 * Tâche de fond (1-3 min) : recherche web (bateaux, prix, périodes) → plan JSON (route jour par jour, lieux pour les trois,
 * budget ligne par ligne comparé à la dernière fois, objectifs, check-list) + 30 options → kv perso:voyages → PDF + résumé
 * sur Telegram, page VOYAGES dans l'app. PRIVÉ : aucune donnée de Kouider dans ce fichier (dépôt public).
 */
import { kvJson, kvPut, ai, research, tg, jsonOf, uid } from './ai-util.js';
import { localNow } from './morning-routine.js';

const KEY = 'perso:voyages';
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} €`;

export interface Lieu { name: string; city: string; why: string; for?: string; when?: string; price?: string; day?: number }
export interface Etape { day: string; title: string; text: string; km?: number; hours?: number; sleep?: string }
export interface Ligne { label: string; amount: number; note?: string }
export interface Option { icon: string; title: string; text: string; done?: boolean; no?: boolean }
export interface Voyage {
  id: string; at: number; status: 'preparing' | 'ready' | 'failed'; request: string; title: string;
  dest: string; mode: string; days: number; start?: string | null; lastCost?: number | null; budget?: number | null;
  resume?: string; route?: Etape[]; lieux?: Lieu[]; villes?: Array<{ name: string; nights: number; why: string }>;
  lignes?: Ligne[]; total?: number; objectifs?: Array<{ icon: string; title: string; text: string; done?: boolean }>;
  options?: Option[]; checklist?: Array<{ label: string; done?: boolean; when?: string }>; sources?: string; departImpact?: string; error?: string;
  // 27/11 v2 : modifications, dépenses pendant le voyage, check-list envoyée dans MES TÂCHES
  changes?: Array<{ at: number; text: string }>; spent?: Array<{ id: string; d: string; label: string; amount: number }>; tasksSent?: number; version?: number;
}

export const voyages = () => kvJson<Voyage[]>(KEY, []);
async function save(v: Voyage): Promise<void> {
  const l = await voyages(); const i = l.findIndex(x => x.id === v.id);
  if (i >= 0) l[i] = v; else l.unshift(v);
  await kvPut(KEY, l.slice(0, 30));
}
export async function getVoyage(id: string): Promise<Voyage | null> { return (await voyages()).find(v => v.id === id) ?? null; }
export async function deleteVoyage(id: string): Promise<void> { await kvPut(KEY, (await voyages()).filter(v => v.id !== id)); }

/** Cocher / refuser une option, un objectif ou un point de check-list (app). */
export async function tickVoyage(id: string, kind: 'option' | 'objectif' | 'check', i: number, value: 'done' | 'no' | 'undo'): Promise<Voyage | null> {
  const v = await getVoyage(id); if (!v) return null;
  const list = (kind === 'option' ? v.options : kind === 'objectif' ? v.objectifs : v.checklist) as Array<{ done?: boolean; no?: boolean }> | undefined;
  const it = list?.[i]; if (!it) return v;
  it.done = value === 'done'; if (kind === 'option') it.no = value === 'no';
  await save(v); return v;
}

// ── Options de secours (voyage en voiture + bateau vers l'Algérie, en famille) si l'IA en donne moins de 30 ──
const FALLBACK_ALGERIE: Option[] = [
  { icon: '🛳️', title: 'Réserver le bateau dès l\'ouverture des ventes', text: 'Les places voiture de l\'été partent en premier et les prix montent ensuite : réserve dès l\'ouverture, avec option modifiable.' },
  { icon: '🛏️', title: 'Prendre une cabine pour la traversée', text: 'Une cabine pour les trois = Ibrahim dort, ta femme se repose, tu arrives frais pour conduire en Algérie.' },
  { icon: '🌙', title: 'Traverser la nuit', text: 'Une traversée de nuit = une nuit d\'hôtel en moins et une journée de vacances en plus.' },
  { icon: '📅', title: 'Décaler de quelques jours', text: 'Partir hors des 2 premiers week-ends d\'août : bateau moins cher, moins d\'attente au port et aux frontières.' },
  { icon: '🧾', title: 'Faire la liste des papiers 1 mois avant', text: 'Passeports des trois (dates de validité), carte grise à ton nom, assurance valable en Algérie, permis, copies papier et photos sur le téléphone.' },
  { icon: '🛡️', title: 'Vérifier l\'assurance auto pour l\'Algérie', text: 'Demande à ton assureur si la carte verte couvre l\'Algérie ; sinon prévois l\'assurance frontière au port d\'arrivée.' },
  { icon: '🔧', title: 'Révision de la voiture 2 semaines avant', text: 'Pneus, freins, vidange, clim, batterie : une panne en Espagne ou en Algérie coûte bien plus cher qu\'une révision chez toi.' },
  { icon: '🧳', title: 'Coffre de toit ou valises souples', text: 'Moins de bagages sur les sièges = Ibrahim plus à l\'aise et contrôle plus rapide au port.' },
  { icon: '⛽', title: 'Faire le plein en Espagne plutôt qu\'en France', text: 'Le carburant est en général moins cher en Espagne qu\'en France : roule léger avant la frontière.' },
  { icon: '🛣️', title: 'Badge télépéage', text: 'Un badge pour les autoroutes françaises et espagnoles : pas d\'arrêt aux barrières avec un enfant fatigué.' },
  { icon: '🏨', title: 'Une vraie étape sur la route', text: 'Couper le trajet en 2 jours avec un hôtel avec piscine : la route devient une partie des vacances pour Ibrahim.' },
  { icon: '🎒', title: 'Le sac « voiture » d\'Ibrahim', text: 'Tablette avec dessins animés téléchargés, casque, jeux, goûters, oreiller : 1 sac à portée de main de ta femme.' },
  { icon: '🧊', title: 'Glacière avec repas', text: 'Sandwichs et eau fraîche pour la route et le bateau : tu économises et tu manges halal sans chercher.' },
  { icon: '🕌', title: 'Prévoir les prières sur la route', text: 'Repère les mosquées / salles de prière près des aires (application de prière hors ligne) pour ne pas courir.' },
  { icon: '💶', title: 'Change au bon moment', text: 'Change une partie de tes euros au marché parallèle à Oran (square) plutôt qu\'au port : la différence est grande.' },
  { icon: '📱', title: 'Une puce algérienne à l\'arrivée', text: 'Une puce Djezzy / Mobilis / Ooredoo avec internet dès le premier jour : GPS, WhatsApp clients FIK, Dzaryx.' },
  { icon: '🗺️', title: 'Cartes hors ligne', text: 'Télécharge les cartes de l\'Espagne et de l\'Ouest algérien avant de partir (zones sans réseau).' },
  { icon: '🏖️', title: 'Une semaine plage, une semaine découverte', text: 'Alterner : plage à Oran / Aïn El Turck, puis sorties découverte (Tlemcen, Mostaganem) pour ne pas faire que des visites.' },
  { icon: '📸', title: 'Un album photo des vacances', text: 'Un dossier photo par jour ; au retour, un album imprimé pour Ibrahim (souvenir de ses vacances au bled).' },
  { icon: '👨‍👩‍👦', title: 'Un jour « juste nous trois »', text: 'Entre deux visites famille, un jour par semaine rien que pour vous trois (plage tôt le matin, restaurant le soir).' },
  { icon: '🎁', title: 'Cadeaux pour la famille préparés à l\'avance', text: 'Liste des cadeaux faite en Belgique avec un budget fixe : fini les achats de dernière minute qui font exploser le budget.' },
  { icon: '🏡', title: 'Visiter des maisons / terrains pour ton départ', text: 'Profite d\'être sur place pour voir 3-4 maisons ou quartiers à Oran : ton plan de départ avance pendant les vacances.' },
  { icon: '🚗', title: 'Rencontrer Houari et voir le parc FIK', text: 'Une demi-journée max pour FIK : voitures, photos pour les pubs, clients fidèles — puis tu coupes.' },
  { icon: '💧', title: 'Eau et chaleur', text: 'Toujours de l\'eau dans la voiture, sorties le matin et en fin de journée, crème solaire et casquette pour Ibrahim.' },
  { icon: '🩺', title: 'Trousse médicale', text: 'Paracétamol enfant, pansements, antiseptique, mal des transports pour le bateau, ordonnances en cours.' },
  { icon: '🏦', title: 'Prévenir ta banque', text: 'Signale le voyage à ta banque et garde une deuxième carte séparée en cas de blocage ou de vol.' },
  { icon: '🔁', title: 'Réserver le retour en même temps', text: 'Le retour de fin d\'été est aussi plein que l\'aller : réserve-le avec l\'aller, sinon tu risques de rester bloqué.' },
  { icon: '🧮', title: 'Un budget par semaine en cash', text: 'Divise ton budget sur place en 4 enveloppes (une par semaine) : tu vois tout de suite si tu dépasses.' },
  { icon: '📝', title: 'Note chaque dépense à Dzaryx', text: 'Dis « -50 € essence » pendant le voyage : tu sais à la fin si tu as battu la dernière fois.' },
  { icon: '🌅', title: 'Un dernier jour calme', text: 'Garde le dernier jour avant le bateau du retour sans visite : valises, voiture, repos — tu repars sans stress.' },
];

const SYS = 'Tu es Dzaryx, l\'organisateur de voyages de Kouider. Tu écris en français simple, tutoiement. Tu ne cites que des lieux qui existent vraiment. Les prix sont des ESTIMATIONS (écris « env. ») sauf s\'ils viennent de la recherche. Sa femme ET son fils Ibrahim voyagent TOUJOURS avec lui : chaque proposition doit plaire aux trois. Il est musulman pratiquant (halal, prières). Jamais de bars, alcool, boîtes de nuit.';

/** Lance la préparation en tâche de fond ; renvoie tout de suite. */
export async function startVoyage(input: { request: string; dest?: string; mode?: string; days?: number; start?: string; last_cost?: number; budget?: number }): Promise<Voyage> {
  const v: Voyage = {
    id: uid(), at: Date.now(), status: 'preparing', request: input.request.trim(), title: input.dest ? `Vacances ${input.dest}` : 'Mes vacances',
    dest: input.dest ?? '', mode: input.mode ?? '', days: input.days && input.days > 0 ? Math.round(input.days) : 30, start: input.start ?? null,
    lastCost: input.last_cost && input.last_cost > 0 ? input.last_cost : null, budget: input.budget && input.budget > 0 ? input.budget : null,
  };
  await save(v);
  void buildVoyage(v).catch(async e => { v.status = 'failed'; v.error = (e as Error).message.slice(0, 200); await save(v); await tg(`❌ Le plan de voyage n'a pas pu être préparé (${v.error}). Redis-moi ta demande et je recommence.`); });
  return v;
}

async function context(): Promise<string> {
  const kd = await import('./kouider-dossier.js');
  const [fam, dossier, money] = await Promise.all([
    kd.familyText().catch(() => ''),
    import('./app-store.js').then(m => m.kvGet('kouider:dossier')).catch(() => null),
    import('./mon-argent.js').then(async m => { const o = await m.monArgentOverview(); return { total: o.balances.total, depart: o.depart?.label ?? null, monthAvg: o.month.prev }; }).catch(() => null),
  ]);
  return [
    'CE QUE TU SAIS DE KOUIDER (privé, pour personnaliser — ne recopie pas ces lignes dans le plan) :',
    (dossier ?? '').slice(0, 2500), fam,
    'Il vit en Belgique (Bruxelles) avec sa femme et son fils Ibrahim. Projet : s\'installer à Oran plus tard (maison puis voiture). Il a une agence de location FIK à Oran (voitures de son associé Houari).',
    'Il parle darija oranaise et français. Voiture perso : un SUV (Audi Q3).',
    money ? `Argent : il économise pour son départ à Oran (départ prévu ${money.depart ?? '—'}) — chaque euro dépensé en vacances le recule un peu.` : '',
  ].filter(Boolean).join('\n');
}

export async function buildVoyage(v: Voyage, notify = true): Promise<void> {
  const ctx = await context();
  const today = localNow().date;
  const mods = (v.changes ?? []).map(c => `- ${c.text}`).join('\n');
  const ask = `Demande de Kouider (${today}) : « ${v.request} »${mods ? `\nMODIFICATIONS QU'IL A DEMANDÉES ENSUITE (prioritaires, à respecter) :\n${mods}` : ''}\nDurée totale : ${v.days} jours.${v.start ? ` Départ : ${v.start}.` : ''}${v.lastCost ? ` La dernière fois ce voyage lui a coûté ${eur(v.lastCost)}.` : ''}${v.budget ? ` Budget voulu : ${eur(v.budget)}.` : ''}`;

  // 1) Recherche web : transport (bateau, route, prix actuels), périodes, nouveautés
  const facts = v.sources && v.changes?.length ? v.sources : await research(`${ask}\n\nCherche sur le web les infos PRATIQUES et RÉCENTES pour ce voyage en famille (2 adultes + 1 enfant${/voiture|bateau|ferry/i.test(v.request) ? ' + 1 voiture' : ''}) : `
    + 'compagnies et lignes possibles (ex. bateaux Espagne → Algérie : ports, durée, prix aller-retour famille + voiture en été, dates d\'ouverture des ventes), distances et péages par la route, '
    + 'formalités (papiers, assurance auto, douane), et 10 lieux / activités récentes pour une famille à destination. Réponds par une liste de faits courts avec la source (site) de chacun.',
  { system: SYS, rounds: 6, max: 1800, sessionId: 'voyage' }).catch(() => '');
  v.sources = facts.slice(0, 4000);

  // 2) Le plan (JSON) et 3) les 30 options — en même temps
  const planP = ai(`${ctx}\n\n${ask}\n\nFAITS TROUVÉS SUR LE WEB :\n${facts || '(aucun — estime prudemment)'}\n\n`
    + 'Prépare le plan complet de ces vacances. Réponds UNIQUEMENT en JSON :\n'
    + '{"title":"titre court","dest":"pays/ville","mode":"voiture+bateau|avion|…","resume":"3-4 phrases : l\'idée du voyage et pourquoi il plaira aux trois",'
    + '"route":[{"day":"J1","title":"Bruxelles → Bordeaux","text":"ce qu\'on fait, pause, astuce","km":800,"hours":8,"sleep":"où dormir"}] (TOUT le séjour, jour par jour ou par blocs de quelques jours, aller ET retour),'
    + '"villes":[{"name":"Oran","nights":12,"why":"…"}],'
    + '"lieux":[{"name":"lieu réel","city":"ville","why":"pourquoi c\'est bien","for":"pour qui : Ibrahim / ta femme / vous trois","when":"meilleur moment","price":"env. …","day":5}] (au moins 20 lieux : plages, parcs, nature, patrimoine, restaurants familiaux, activités pour enfant, sur la route ET sur place),'
    + '"lignes":[{"label":"Bateau aller-retour (famille + voiture, cabine)","amount":1200,"note":"env., source"}] (TOUT le budget : route aller/retour carburant+péages, hôtels d\'étape, bateau, assurance, nourriture, sorties, cadeaux, imprévus ; PAS de ligne TOTAL),'
    + '"objectifs":[{"icon":"🎯","title":"objectif chiffré","text":"comment l\'atteindre"}] (5 à 7 objectifs : budget à ne pas dépasser vs la dernière fois, moments en famille, repos, découvertes, avancer son projet de maison à Oran sans gâcher les vacances…),'
    + '"checklist":[{"label":"Réserver le bateau","when":"dès maintenant"}] (15 à 25 points dans l\'ordre du temps)}',
  { system: SYS, quality: true, max: 7000 });
  const optP = ai(`${ctx}\n\n${ask}\n\nFAITS TROUVÉS SUR LE WEB :\n${facts.slice(0, 2500) || '(aucun)'}\n\n`
    + 'Donne 30 OPTIONS / IDÉES auxquelles Kouider n\'aurait JAMAIS pensé pour rendre ce voyage meilleur, moins cher, plus facile ou plus inoubliable pour lui, sa femme et Ibrahim '
    + '(astuces de réservation, confort sur la route et le bateau, sécurité, argent et change, papiers, santé, souvenirs pour Ibrahim, moments à deux pour le couple, famille sur place, profiter du séjour pour son futur départ à Oran, éviter les pièges). '
    + 'Pas de banalités (« prends de la crème solaire » interdit sauf idée vraiment spéciale). Réponds UNIQUEMENT en JSON : {"options":[{"icon":"emoji","title":"titre court","text":"1-2 phrases concrètes"}]}',
  { system: SYS, quality: true, max: 4500 });
  const [planR, optR] = await Promise.all([planP.catch(() => ''), optP.catch(() => '')]);
  const plan = jsonOf<Partial<Voyage> & { lignes?: Ligne[] }>(planR);
  if (!plan) throw new Error('le cerveau n\'a pas rendu de plan lisible');
  const opts = (jsonOf<{ options?: Option[] }>(optR)?.options ?? []).filter(o => o?.title && o?.text);
  const algerie = /alg[eé]r|oran|bled/i.test(`${v.request} ${plan.dest ?? ''}`);
  const seen = new Set(opts.map(o => o.title.toLowerCase()));
  if (algerie) for (const f of FALLBACK_ALGERIE) if (opts.length < 30 && !seen.has(f.title.toLowerCase())) opts.push({ ...f });

  const prevCheck = new Map((v.checklist ?? []).map(c => [c.label.toLowerCase(), c.done]));
  const prevObj = new Map((v.objectifs ?? []).map(c => [c.title.toLowerCase(), c.done]));
  Object.assign(v, {
    title: plan.title || v.title, dest: plan.dest || v.dest, mode: plan.mode || v.mode, resume: plan.resume ?? '',
    route: (plan.route ?? []).slice(0, 40), villes: (plan.villes ?? []).slice(0, 10), lieux: (plan.lieux ?? []).slice(0, 40),
    lignes: (plan.lignes ?? []).filter(l => l && Number.isFinite(+l.amount) && +l.amount > 0 && !/^\s*(sous-)?total/i.test(String(l.label ?? ''))).map(l => ({ ...l, amount: Math.round(+l.amount) })),
    objectifs: (plan.objectifs ?? []).slice(0, 8), checklist: (plan.checklist ?? []).slice(0, 30), options: opts.slice(0, 30),
  });
  for (const c of v.checklist ?? []) if (prevCheck.get(c.label.toLowerCase())) c.done = true;
  for (const c of v.objectifs ?? []) if (prevObj.get(c.title.toLowerCase())) c.done = true;
  v.version = (v.version ?? 0) + 1;
  v.total = (v.lignes ?? []).reduce((s, l) => s + l.amount, 0);
  // Ce que le voyage change à son départ à Oran (même courbe que MON ARGENT) — calculé, pas inventé
  if (v.total) {
    const dd = await import('./mon-argent.js').then(m => m.departDetail()).catch(() => null);
    const ref = v.lastCost ?? null;
    if (dd && ref && ref > v.total) {
      const saved = ref - v.total;
      v.departImpact = `En dépensant ${eur(v.total)} au lieu de ${eur(ref)}, tu gardes ${eur(saved)} : c'est ≈ ${Math.max(1, Math.round(saved / Math.max(1, (dd.monthly[12]! - dd.monthly[0]!) / 12) * 30))} jours d'épargne de ton plan de départ.`;
    } else if (ref && ref <= v.total) v.departImpact = `Ce plan (${eur(v.total)}) dépasse la dernière fois (${eur(ref)}) : regarde les options « moins cher » pour descendre en dessous.`;
  }
  v.status = 'ready';
  await save(v);
  if (!notify) return;

  // PDF + résumé Telegram
  try {
    const pdf = await voyagePdf(v);
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    await queueTelegramFile(pdf.toString('base64'), `Voyage-${(v.dest || 'vacances').replace(/[^\w-]+/g, '_')}.pdf`, `🧳 ${v.title} — le plan complet en PDF`);
  } catch (e) { console.warn('[voyage] pdf', e); }
  await tg(`${(v.version ?? 1) > 1 ? '✏️ Plan modifié comme tu l\'as demandé.\n\n' : ''}${voyageText(v, true)}`);
}

export function voyageText(v: Voyage, short = false): string {
  if (v.status === 'preparing') return `⏳ Je prépare « ${v.title} » (recherche des bateaux, lieux, budget) : je t'envoie le plan et le PDF dans 3 à 5 minutes.`;
  if (v.status === 'failed') return `❌ « ${v.title} » : ${v.error ?? 'échec'}.`;
  const L: string[] = [`🧳 ${v.title.toUpperCase()}`, v.resume ?? ''];
  if (v.total) L.push('', `💶 Budget prévu : ${eur(v.total)}${v.lastCost ? ` (dernière fois : ${eur(v.lastCost)} → ${v.total < v.lastCost ? `${eur(v.lastCost - v.total)} de moins` : `${eur(v.total - v.lastCost)} de plus`})` : ''}`);
  if (v.departImpact) L.push(v.departImpact);
  if (v.villes?.length) L.push('', '📍 ' + v.villes.map(c => `${c.name} (${c.nights} nuits)`).join(' · '));
  if (v.objectifs?.length) L.push('', '🎯 OBJECTIFS', ...v.objectifs.map(o => `${o.icon ?? '•'} ${o.title}`));
  const lieux = (v.lieux ?? []).slice(0, short ? 8 : 40);
  if (lieux.length) L.push('', '🏖️ À VISITER', ...lieux.map(l => `• ${l.name} (${l.city}) — ${l.why}`));
  if (!short && v.options?.length) L.push('', '💡 30 OPTIONS', ...v.options.map((o, i) => `${i + 1}. ${o.title} — ${o.text}`));
  L.push('', short ? `Tout le reste (route jour par jour, ${v.lieux?.length ?? 0} lieux, ${v.options?.length ?? 0} options, check-list) : dans le PDF et dans l'app › Plus › MES VOYAGES.` : '');
  return L.filter(x => x !== undefined).join('\n').trim();
}

const runBuild = (v: Voyage) => void buildVoyage(v).catch(async e => { v.status = 'failed'; v.error = (e as Error).message.slice(0, 200); await save(v); await tg(`❌ Le plan de voyage n'a pas pu être préparé (${v.error}).`); });

/** « Change le plan : moins cher / ajoute Tlemcen / 3 semaines au lieu d'1 mois » → nouveau plan (mêmes recherches, 1-2 min). */
export async function modifyVoyage(id: string, instruction: string): Promise<Voyage | null> {
  const v = await getVoyage(id); if (!v || v.status === 'preparing') return v;
  const text = instruction.trim().slice(0, 600); if (!text) return v;
  const m = text.match(/(\d+)\s*(jours?|semaines?|mois)\b/i);
  if (m && /au lieu|plutôt|seulement|que|durée|reste/i.test(text)) v.days = Math.round(+m[1]! * (/sem/i.test(m[2]!) ? 7 : /mois/i.test(m[2]!) ? 30 : 1));
  v.changes = [...(v.changes ?? []), { at: Date.now(), text }].slice(-10);
  v.status = 'preparing'; await save(v); runBuild(v);
  return v;
}

/** 30 nouvelles options (sans reprendre les anciennes). */
export async function moreOptions(id: string): Promise<Voyage | null> {
  const v = await getVoyage(id); if (!v || v.status !== 'ready') return v;
  const old = (v.options ?? []).map(o => o.title).join(' ; ');
  const r = await ai(`${await context()}\n\nVoyage : « ${v.request} » (${v.title}, ${v.days} jours).\nOptions déjà proposées (NE PAS les reprendre ni les reformuler) : ${old}\n\n`
    + 'Donne 30 NOUVELLES options auxquelles il n\'aurait jamais pensé, encore plus originales (moments inoubliables pour Ibrahim, surprises pour sa femme, économies malignes, sécurité, souvenirs, gens à voir, choses à rapporter, préparer son futur à Oran). JSON uniquement : {"options":[{"icon":"emoji","title":"…","text":"…"}]}',
  { system: SYS, quality: true, max: 4500 }).catch(() => '');
  const n = (jsonOf<{ options?: Option[] }>(r)?.options ?? []).filter(o => o?.title && o?.text);
  if (!n.length) throw new Error('pas de nouvelles options cette fois, réessaie dans un moment');
  const kept = (v.options ?? []).filter(o => o.done);   // celles qu'il a gardées restent en tête
  v.options = [...kept, ...n].slice(0, 30 + kept.length); await save(v);
  return v;
}

/** Dépense notée pendant le voyage (« voyage -60 essence ») ; amount < 0 interdit, remove = id. */
export async function voyageSpend(id: string, amount: number, label: string, remove?: string): Promise<Voyage | null> {
  const v = await getVoyage(id); if (!v) return null;
  if (remove) v.spent = (v.spent ?? []).filter(x => x.id !== remove);
  else { if (!(amount > 0)) throw new Error('Montant ?'); v.spent = [...(v.spent ?? []), { id: uid(), d: localNow().date, label: (label || 'Dépense').slice(0, 60), amount: Math.round(amount * 100) / 100 }]; }
  await save(v); return v;
}
export function spentInfo(v: Voyage): { spent: number; left: number; perDay: number | null; daysLeft: number | null } {
  const spent = (v.spent ?? []).reduce((a, x) => a + x.amount, 0), left = (v.total ?? 0) - spent;
  let daysLeft: number | null = null;
  // « par jour » seulement PENDANT le voyage (avant le départ ça n'a pas de sens)
  const today = localNow().date;
  if (v.start && v.start <= today) { const end = new Date(`${v.start}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + v.days); const n = Math.ceil((end.getTime() - Date.parse(`${today}T12:00:00Z`)) / 86_400_000); daysLeft = n > 0 ? n : null; }
  return { spent: Math.round(spent), left: Math.round(left), perDay: daysLeft ? Math.round(left / daysLeft) : null, daysLeft };
}

/** Voyage en cours aujourd'hui (start ≤ date < start + days) → la dépense y est ajoutée ; renvoie la ligne « budget voyage » ou ''. */
export async function activeTripSpend(amount: number, label: string, date: string): Promise<string> {
  const v = (await voyages()).find(x => x.status === 'ready' && x.start && x.start <= date && (() => { const e = new Date(`${x.start}T12:00:00Z`); e.setUTCDate(e.getUTCDate() + x.days); return date < e.toISOString().slice(0, 10); })());
  if (!v) return '';
  const r = await voyageSpend(v.id, amount, label); if (!r) return '';
  const si = spentInfo(r);
  return `🧳 Budget « ${r.title} » : ${eur(si.spent)} dépensés sur ${eur(r.total ?? 0)} → reste ${eur(si.left)}${si.perDay ? ` (${eur(si.perDay)}/jour)` : ''}.`;
}

/** Date de départ (AAAA-MM-JJ) — sert au compte à rebours, à l'épargne par semaine et aux dates des tâches. */
export async function setVoyageStart(id: string, start: string): Promise<Voyage | null> {
  const v = await getVoyage(id); if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('Date AAAA-MM-JJ');
  v.start = start; await save(v); return v;
}

/** Check-list → MES TÂCHES (datée depuis la date de départ : « 1 mois avant », « la veille »…). */
const dueFrom = (when: string | undefined, start: string | null | undefined, today: string): string | null => {
  const w = (when ?? '').toLowerCase();
  if (/maintenant|tout de suite|dès|aujourd|immédiat/.test(w)) return today;
  if (!start) return null;
  const add = (n: number) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); const x = d.toISOString().slice(0, 10); return x < today ? today : x; };
  const m = w.match(/(\d+)\s*(jours?|j|semaines?|mois)\s*avant/);
  if (m) return add(-Math.round(+m[1]! * (/sem/.test(m[2]!) ? 7 : /mois/.test(m[2]!) ? 30 : 1)));
  if (/veille/.test(w)) return add(-1);
  if (/semaine avant|une semaine/.test(w)) return add(-7);
  if (/mois avant|un mois/.test(w)) return add(-30);
  if (/jour j|départ|le jour/.test(w)) return add(0);
  return null;
};
export async function checklistToTasks(id: string): Promise<{ added: number; v: Voyage | null }> {
  const v = await getVoyage(id); if (!v?.checklist?.length) return { added: 0, v };
  const { tacheAdd } = await import('./taches.js');
  const today = localNow().date; let added = 0;
  for (const c of v.checklist.filter(x => !x.done)) {
    const r = await tacheAdd({ text: `${c.label} (voyage)`, due: dueFrom(c.when, v.start, today), cat: 'famille', source: 'app' }).catch(() => null);
    if (r && !('dup' in r)) added++;
  }
  v.tasksSent = Date.now(); await save(v);
  return { added, v };
}

/** Outil Telegram / app : voyage */
export async function voyageTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'plan');
  if (a === 'list') { const l = await voyages(); return l.length ? l.map((v, i) => `${i + 1}. ${v.title} — ${v.status === 'ready' ? `${eur(v.total ?? 0)}, ${v.days} j` : v.status}`).join('\n') : 'Aucun voyage préparé.'; }
  const pick = async () => { const l = await voyages(); const n = Number(input['n']); return Number.isFinite(n) && n >= 1 ? l[n - 1] ?? null : l[0] ?? null; };
  if (a === 'show') { const v = await pick(); return v ? voyageText(v) : 'Aucun voyage préparé.'; }
  if (['modifier', 'options', 'depense', 'taches', 'date'].includes(a)) {
    const v = await pick(); if (!v) return 'Aucun voyage préparé : décris-moi d\'abord le voyage.';
    if (a === 'modifier') { const t = String(input['instruction'] ?? input['request'] ?? '').trim(); if (!t) return 'Qu\'est-ce que je change dans le plan ?'; await modifyVoyage(v.id, t); return `✏️ Je refais « ${v.title} » avec ta modification (1 à 3 min) : nouveau PDF sur Telegram et dans l'app.`; }
    if (a === 'options') { const r = await moreOptions(v.id); return `💡 30 nouvelles options pour « ${v.title} » :\n${(r?.options ?? []).filter(o => !o.done).map((o, i) => `${i + 1}. ${o.title} — ${o.text}`).join('\n')}`; }
    if (a === 'depense') { const r = await voyageSpend(v.id, Number(input['amount']), String(input['label'] ?? '')); const si = spentInfo(r!); return `🧾 Noté pour « ${v.title} » : ${eur(Number(input['amount']))}. Dépensé ${eur(si.spent)} sur ${eur(r!.total ?? 0)} → reste ${eur(si.left)}${si.perDay ? `, soit ${eur(si.perDay)} par jour pour les ${si.daysLeft} jours restants` : ''}.`; }
    if (a === 'date') { await setVoyageStart(v.id, String(input['start'] ?? '')); return `📅 Départ noté : ${String(input['start'])}. Compte à rebours et épargne par semaine dans l'app.`; }
    const r = await checklistToTasks(v.id); return `✅ ${r.added} point${r.added > 1 ? 's' : ''} de la check-list ajouté${r.added > 1 ? 's' : ''} à MES TÂCHES${v.start ? ' (datés depuis ton départ)' : ' (donne-moi la date de départ pour les dater)'}.`;
  }
  if (a === 'pdf') {
    const v = await pick(); if (!v || v.status !== 'ready') return 'Aucun plan prêt.';
    const pdf = await voyagePdf(v);
    const { queueTelegramFile } = await import('../actions/handlers/nexus-relay.js');
    await queueTelegramFile(pdf.toString('base64'), `Voyage-${(v.dest || 'vacances').replace(/[^\w-]+/g, '_')}.pdf`, `🧳 ${v.title}`);
    return `📄 PDF de « ${v.title} » envoyé.`;
  }
  const request = String(input['request'] ?? input['text'] ?? '').trim();
  if (!request) return 'Dis-moi le voyage : où, comment (voiture, bateau, avion), combien de temps, et ce que ça t\'a coûté la dernière fois.';
  const v = await startVoyage({ request, dest: input['dest'] as string | undefined, mode: input['mode'] as string | undefined, days: Number(input['days']) || undefined,
    start: input['start'] as string | undefined, last_cost: Number(input['last_cost']) || undefined, budget: Number(input['budget']) || undefined });
  return voyageText(v);
}

// ── PDF ──
export const mapsUrl = (l: { name: string; city: string }) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name} ${l.city}`)}`;
const latin = (t: unknown) => String(t ?? '').replace(/≈ ?/g, 'env. ').replace(/[−–—]/g, '-').replace(/→/g, '->').replace(/[’‘]/g, "'").replace(/[«»]/g, '"')
  .replace(/[   ]/g, ' ').replace(/[^\x00-\xFF€]/g, '').replace(/ {2,}/g, ' ').trim();

export async function voyagePdf(v: Voyage): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'A4', margin: 45 });
  const chunks: Buffer[] = []; doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(res => doc.on('end', () => res(Buffer.concat(chunks))));
  const NAVY = '#0B2545', GOLD = '#B8860B', GREY = '#68707A', INK = '#20262E', GREEN = '#1B998B';
  const L = 45, W = 505;
  const header = () => { doc.rect(0, 0, doc.page.width, 70).fill(NAVY); doc.fillColor('#fff').fontSize(19).text(latin(v.title), L, 20, { width: W, lineBreak: false });
    doc.fontSize(9.5).fillColor('#E8D9A8').text(latin(`Préparé par Dzaryx le ${new Date(v.at).toLocaleDateString('fr-FR')} · ${v.days} jours · document privé`), L, 46, { width: W, lineBreak: false }); doc.y = 88; };
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - 55) { doc.addPage(); header(); } };
  const H = (t: string) => { ensure(60); doc.moveDown(0.6); doc.fontSize(14).fillColor(NAVY).text(latin(t), L, doc.y, { width: W }); doc.moveTo(L, doc.y + 2).lineTo(L + W, doc.y + 2).strokeColor(GOLD).lineWidth(1).stroke(); doc.moveDown(0.5); };
  const P = (t: string, o: { size?: number; color?: string; bold?: boolean; indent?: number } = {}) => { ensure(28); doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size ?? 10).fillColor(o.color ?? INK).text(latin(t), L + (o.indent ?? 0), doc.y, { width: W - (o.indent ?? 0), lineGap: 2 }); doc.font('Helvetica'); };
  header();
  if (v.resume) P(v.resume, { size: 11 });
  if (v.total) { doc.moveDown(0.5); P(`Budget prévu : ${eur(v.total)}${v.lastCost ? `   (dernière fois : ${eur(v.lastCost)})` : ''}`, { bold: true, size: 12, color: v.lastCost && v.total > v.lastCost ? '#C73E1D' : GREEN }); }
  if (v.departImpact) P(v.departImpact, { color: GREY });
  if (v.objectifs?.length) { H('Objectifs du voyage'); v.objectifs.forEach((o, i) => { P(`${i + 1}. ${o.title}`, { bold: true }); if (o.text) P(o.text, { indent: 14, color: GREY }); }); }
  if (v.villes?.length) { H('Les villes'); v.villes.forEach(c => P(`${c.name} — ${c.nights} nuit${c.nights > 1 ? 's' : ''} : ${c.why}`)); }
  if (v.route?.length) { H('Le programme, jour par jour'); v.route.forEach(r => { P(`${r.day} · ${r.title}${r.km ? `  (${r.km} km${r.hours ? `, ${r.hours} h` : ''})` : ''}`, { bold: true }); P(`${r.text}${r.sleep ? ` Nuit : ${r.sleep}.` : ''}`, { indent: 14, color: GREY }); }); }
  if (v.lieux?.length) { H('Lieux à visiter (pour vous trois)'); P('Touche le nom d\'un lieu pour l\'ouvrir dans Google Maps.', { size: 8.5, color: GREY }); v.lieux.forEach(l => { ensure(40); doc.font('Helvetica-Bold').fontSize(10).fillColor('#2E86AB').text(latin(`${l.name} — ${l.city}${l.price ? ` · ${l.price}` : ''}`), L, doc.y, { width: W, link: mapsUrl(l), underline: true }); doc.font('Helvetica'); P(`${l.why}${l.for ? ` (${l.for})` : ''}${l.when ? ` Meilleur moment : ${l.when}.` : ''}`, { indent: 14, color: GREY }); }); }
  if (v.lignes?.length) { H('Le budget ligne par ligne'); v.lignes.forEach(l => P(`${l.label} : ${eur(l.amount)}${l.note ? `  (${l.note})` : ''}`)); P(`TOTAL : ${eur(v.total ?? 0)}`, { bold: true }); P('Montants estimés : vérifie les prix au moment de réserver. Lieux et restaurants : vérifie horaires et ouverture avant d\'y aller.', { size: 8.5, color: GREY }); }
  if (v.options?.length) { H(`${v.options.length} options auxquelles tu n'aurais pas pensé`); v.options.forEach((o, i) => { P(`${i + 1}. ${o.title}`, { bold: true }); P(o.text, { indent: 14, color: GREY }); }); }
  if (v.spent?.length) { const si = spentInfo(v); H('Dépenses pendant le voyage'); v.spent.forEach(x => P(`${x.d.slice(8, 10)}/${x.d.slice(5, 7)} · ${x.label} : ${eur(x.amount)}`)); P(`Dépensé ${eur(si.spent)} · reste ${eur(si.left)}${si.perDay ? ` · ${eur(si.perDay)} par jour` : ''}`, { bold: true }); }
  if (v.checklist?.length) { H('Check-list'); v.checklist.forEach(c => P(`[  ]  ${c.label}${c.when ? `  — ${c.when}` : ''}`)); }
  doc.end();
  return done;
}
