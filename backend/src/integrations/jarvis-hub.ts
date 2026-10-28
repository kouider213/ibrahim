/**
 * JARVIS HUB (27/10/2026) — ce que l'app et l'iPhone demandent au cerveau :
 *  - santé : un Raccourci iPhone envoie chaque matin les données de Santé / Apple Watch (sommeil, pas, cœur au repos,
 *    VFC) → app_kv `health:daily` (privé) ; sommeil court ou cœur anormal → message + journée allégée proposée.
 *  - siri : « Dis Siri, Dzaryx » → le Raccourci dicte la phrase → Dzaryx complet répond (phrase à dire) + une action
 *    iPhone à ouvrir (appel, SMS, WhatsApp, Waze, musique, app) en lien tel:/sms:/wa.me/waze:/music:.
 *  - salle de commande : tout le business sur un écran (TV / PC) : argent, flotte, retours, WhatsApp, alertes, fortune.
 *  - futur : les chiffres de base de la machine à voir le futur (flotte, prix moyen, occupation réelle, coûts).
 *  - briefing 3D : les phrases du briefing que la Carte live dit en survolant chaque endroit.
 */
import { kvJson, kvPut, tg } from './ai-util.js';
import { supabase } from './supabase.js';
import { localNow } from './morning-routine.js';

// ── Santé ────────────────────────────────────────────────────────────────────
export interface HealthDay { date: string; sleep_h?: number; steps?: number; rhr?: number; hrv?: number; active_kcal?: number; weight?: number }
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) && n > 0 ? n : undefined; };

export async function receiveHealth(body: Record<string, unknown>): Promise<{ ok: true; note: string }> {
  // Raccourci fait par « Décrire un raccourci » (Apple) : les valeurs arrivent souvent en texte libre (champ data, résumé…)
  // → Haiku en tire les chiffres. Les champs déjà numériques restent prioritaires.
  // Format réel du Raccourci (27/10) : {"data":{"steps":"131\n64\n…","heart_rate_variability":"20.1\n27.0…","resting_heart_rate":"71","sleep":"…"}}
  // → calcul exact : pas = somme, VFC = moyenne, cœur au repos = dernière valeur, sommeil = somme (heures, ou minutes/secondes converties)
  const d0 = (typeof body['data'] === 'object' && body['data']) ? body['data'] as Record<string, unknown> : body;
  const nums = (v: unknown) => String(v ?? '').split(/[\n,;]+/).map(x => Number(x.trim().replace(',', '.'))).filter(x => Number.isFinite(x) && x > 0);
  const pick = (re: RegExp) => Object.entries(d0).find(([k]) => re.test(k))?.[1];
  const stepsL = nums(pick(/step|^pas/i)), hrvL = nums(pick(/variab|hrv|vfc/i)), rhrL = nums(pick(/rest\w*_?(heart|hr|card)|repos|rhr/i)), sleepL = nums(pick(/sleep|sommeil/i));
  // 28/10 : montre = calories actives, poids (balance), entraînements (noms + durées) — Kouider ne dort pas avec sa montre
  const kcalL = nums(pick(/active|actif|calor|kcal/i)), weightL = nums(pick(/weight|poids|body_?mass|masse/i));
  const woRaw = pick(/^(?!.*(dur|time|temps)).*(workout|entra[iî]n|s[ée]ance)/i), woDurL = nums(pick(/dur[ée]e|duration/i));
  if (kcalL.length && body['active_kcal'] == null) body['active_kcal'] = Math.round(kcalL.reduce((a, b) => a + b, 0));
  if (weightL.length && body['weight'] == null) body['weight'] = weightL[weightL.length - 1];
  const workouts = String(woRaw ?? '').split(/\n+/).map(x => x.trim()).filter(x => x && !/^[\d.,\s]+$/.test(x));
  let woMin = woDurL.reduce((a, b) => a + b, 0);
  if (woMin > 600) woMin /= 60;                          // secondes → minutes
  if (stepsL.length || hrvL.length || rhrL.length || sleepL.length) {
    let sl = sleepL.reduce((a, b) => a + b, 0);
    if (sl > 24 * 60) sl /= 3600; else if (sl > 24) sl /= 60;   // secondes ou minutes → heures
    Object.assign(body, {
      ...(stepsL.length ? { steps: Math.round(stepsL.reduce((a, b) => a + b, 0)) } : {}),
      ...(hrvL.length ? { hrv: Math.round(hrvL.reduce((a, b) => a + b, 0) / hrvL.length) } : {}),
      ...(rhrL.length ? { rhr: Math.round(rhrL[rhrL.length - 1]!) } : {}),
      ...(sl > 0 ? { sleep_h: Math.round(sl * 10) / 10 } : {}),
    });
  }
  if (!['sleep_h', 'steps', 'rhr', 'hrv'].some(k => num(body[k]) !== undefined)) {
    const full = JSON.stringify(body);
    await kvPut('health:lastraw', full.slice(0, 60_000), 3 * 86_400).catch(() => {});   // pour comprendre le format du Raccourci (privé)
    // Beaucoup de petits échantillons (pas, phases de sommeil) : on additionne les nombres nous-mêmes quand c'est une liste
    const raw = full.slice(0, 40_000);
    const { ai, jsonOf } = await import('./ai-util.js');
    const o = jsonOf<Record<string, number>>(await ai(`Données de santé d'un iPhone (format libre, français ou anglais) :\n${raw}\n\nExtrais : heures de sommeil de la dernière nuit (total, en heures), nombre de pas d'hier ou du jour, fréquence cardiaque au repos (bpm), variabilité de la fréquence cardiaque (ms). Pour les pas : ADDITIONNE tous les échantillons de pas. Pour le sommeil : additionne les durées « endormi / core / deep / REM » (pas « au lit » ni « éveillé »). Réponds UNIQUEMENT : {"sleep_h":0,"steps":0,"rhr":0,"hrv":0} (0 si absent).`, { max: 200, quality: true }).catch(() => '')) ?? {};
    Object.assign(body, o);
  }
  const date = String(body['date'] ?? localNow().date).slice(0, 10);
  // Le Raccourci peut envoyer le sommeil en heures ou en minutes
  let sleep = num(body['sleep_h'] ?? body['sleep'] ?? body['sommeil']);
  if (sleep && sleep > 24) sleep = Math.round((sleep / 60) * 10) / 10;
  const d: HealthDay = { date, sleep_h: sleep, steps: num(body['steps'] ?? body['pas']), rhr: num(body['rhr'] ?? body['resting_hr'] ?? body['coeur_repos']), hrv: num(body['hrv'] ?? body['vfc']), active_kcal: num(body['active_kcal'] ?? body['calories']), weight: num(body['weight'] ?? body['poids']) };
  const stored = await kvJson<HealthDay[]>('health:daily', []);
  const same = stored.find(x => x.date === date);
  // Plusieurs envois le même jour : on complète, on n'efface pas une valeur déjà reçue
  if (same) for (const k of Object.keys(same) as Array<keyof HealthDay>) if ((d as unknown as Record<string, unknown>)[k] === undefined) (d as unknown as Record<string, unknown>)[k] = same[k];
  const all = stored.filter(x => x.date !== date);
  all.push(d);
  all.sort((a, b) => a.date.localeCompare(b.date));
  await kvPut('health:daily', all.slice(-120));
  const prev = all.slice(-15, -1);
  const avg = (k: keyof HealthDay) => { const v = prev.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const notes: string[] = [];
  if (d.sleep_h && d.sleep_h < 5.5) notes.push(`😴 Nuit courte : ${d.sleep_h} h de sommeil. Je te garde une journée légère (rien de non urgent avant 10h) — dis « journée normale » si tu te sens bien.`);
  const rhr = avg('rhr');
  if (d.rhr && rhr && d.rhr >= rhr + 8) notes.push(`❤️ Cœur au repos à ${d.rhr} (d'habitude ${Math.round(rhr)}) : fatigue, stress ou début de maladie possible. Bois, lève le pied, et consulte si ça dure.`);
  const hrv = avg('hrv');
  if (d.hrv && hrv && d.hrv < hrv * 0.75) notes.push(`📉 VFC basse (${d.hrv} contre ${Math.round(hrv)} d'habitude) : ton corps récupère mal, séance de sport légère aujourd'hui.`);
  // Cœur fatigué → la séance du jour passe en version légère toute seule (s'il n'a pas déjà donné sa forme)
  if (notes.some(n => n.startsWith('❤️') || n.startsWith('📉'))) {
    // Envoi du soir (21h30, sans montre la nuit) → c'est la séance de DEMAIN qui s'allège
    const evening = localNow().hhmm >= '18:00';
    const target = evening ? new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
    const r = await import('./sport-coach.js').then(m => m.setFormFromWatch(target, 2)).catch(() => null);
    if (r && !/pas de séance/i.test(r)) notes.push(`🪶 Ta séance ${evening ? 'de demain' : 'du jour'} passe en version courte et légère (−10 % sur les charges). Dis « forme 4 » si tu te sens bien.`);
  }
  // Séance vue par la montre → cochée dans le coach + FORME
  if (workouts.length) {
    const r = await import('./sport-coach.js').then(m => m.markWatchWorkout(date, woMin, workouts.slice(0, 2).join(' + '))).catch(() => null);
    if (r) notes.push(r);
  }
  // FORME : pas, poids, calories actives du jour
  await import('./forme.js').then(async f => {
    await f.updateDay('kouider', date, x => {
      if (d.steps) x.steps = Math.min(80000, d.steps);
      if (d.weight && d.weight > 30) x.weight = Math.round(d.weight * 10) / 10;
      if (d.active_kcal) x.activeKcal = Math.round(d.active_kcal);
    });
    if (d.weight && d.weight > 30) await f.setFormeProfile({ weightKg: Math.round(d.weight * 10) / 10 }, 'kouider');
  }).catch(() => {});
  if (d.active_kcal && d.active_kcal > 500) notes.push(`🔥 ${Math.round(d.active_kcal)} kcal brûlées : ta cible du jour dans FORME monte un peu (plus de glucides pour récupérer).`);
  if (notes.length) await tg(`🩺 Jarvis santé — ${date}\n${notes.join('\n')}`);
  return { ok: true, note: notes.join(' ') || 'Données reçues, tout va bien.' };
}

/** Bilan du dimanche : la semaine santé (moyennes + évolution vs semaine d'avant). '' si pas de données. */
export async function healthWeekLine(): Promise<string> {
  const all = await kvJson<HealthDay[]>('health:daily', []);
  const today = localNow().date;
  const back = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const w = all.filter(x => x.date > back(7)), p = all.filter(x => x.date > back(14) && x.date <= back(7));
  if (!w.length) return '';
  const avg = (l: HealthDay[], k: keyof HealthDay) => { const v = l.map(x => Number(x[k] ?? 0)).filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  const cmp = (k: keyof HealthDay, unit: string, round = 0, higherBetter = true) => {
    const a = avg(w, k), b = avg(p, k);
    if (!a) return '';
    const diff = b ? a - b : 0, good = higherBetter ? diff >= 0 : diff <= 0;
    return `${a.toFixed(round).replace('.', ',')}${unit}${b && Math.abs(diff) >= (round ? 0.1 : 1) ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(round).replace('.', ',')} ${good ? '✅' : '⚠️'})` : ''}`;
  };
  const parts = [cmp('steps', ' pas/j'), cmp('rhr', ' bpm au repos', 0, false), cmp('hrv', ' ms de VFC'), cmp('active_kcal', ' kcal actives/j')].filter(Boolean);
  const ws = w.filter(x => x.weight).map(x => x.weight!);
  if (ws.length >= 2) parts.push(`poids ${ws[0]} → ${ws[ws.length - 1]} kg`);
  return parts.length ? `🩺 Santé (montre) : ${parts.join(' · ')}` : '';
}

export async function healthText(days = 7): Promise<string> {
  const all = (await kvJson<HealthDay[]>('health:daily', [])).slice(-days);
  if (!all.length) return 'Pas encore de données santé : installe le Raccourci « Dzaryx Santé » (page JARVIS › Santé de l\'app).';
  return `🩺 Santé (${all.length} jours) :\n${all.map(d => `• ${d.date.slice(5)} : ${d.sleep_h ?? '?'} h de sommeil · ${d.steps?.toLocaleString('fr-FR') ?? '?'} pas · cœur ${d.rhr ?? '?'}${d.hrv ? ` · VFC ${d.hrv}` : ''}`).join('\n')}`;
}

// ── Siri ─────────────────────────────────────────────────────────────────────
const SIRI = `[SIRI — Kouider te parle via Siri sur son iPhone (mains libres). Réponds en 1 à 2 phrases courtes, à l'oral.
RÉPONDS À SA QUESTION DANS CE TOUR : cherche d'abord avec tes outils (réservations avec heures et notes, dossier client, WhatsApp du client, mails, agenda, vols), PUIS donne la réponse.
INTERDIT de répondre « je regarde », « je vais vérifier », « je cherche… ? » : il n'y a pas de deuxième tour pour toi, fais-le maintenant. Si l'info n'existe nulle part, dis-le clairement et où tu as cherché, puis propose de la demander (ex. « je demande son heure d'arrivée au client sur WhatsApp ? »).
Si sa demande est une ACTION DE SON IPHONE (appeler quelqu'un, envoyer un SMS, ouvrir WhatsApp avec quelqu'un, itinéraire, musique, ouvrir une app),
ajoute à la toute fin une ligne seule : PHONE_URL: <lien> — tel:+33…, sms:+33…&body=…, https://waze.com/ul?q=…&navigate=yes, music://music.apple.com/search?term=…, ou le lien de l'app.
WHATSAPP = TOUJOURS son WhatsApp BUSINESS via l'outil whatsapp_web (PC cloud), JAMAIS de PHONE_URL wa.me (ça ouvre le WhatsApp perso) :
lire / dernier message / non lus → whatsapp_web (unread ou read) et dis-lui à l'oral qui a écrit et ce qu'il dit ; écrire à quelqu'un → prépare le message avec whatsapp_web et demande son oui avant d'envoyer.
Numéro d'un contact : cherche-le avec tes outils (clients, partenaires, mémoire des gens). Si tu ne le trouves pas, demande-le.
TU AS TOUS TES OUTILS, comme sur Telegram : n'abandonne jamais une demande. La dictée Siri déforme les NOMS (« Mohamed Radar » = peut-être Mohammed Bendaoud, Rahdar…) et coupe parfois la phrase :
cherche le nom approchant (réservations, dossier client, discussions WhatsApp), et si un seul colle, fais-le en disant lequel.
« REGARDE », « VÉRIFIE », « C'EST QUAND », « À QUELLE HEURE » = LECTURE SEULE : list_bookings, dossier, whatsapp_web 'read' (texte) — n'utilise JAMAIS whatsapp_web 'photos' / 'documents' ni get_client_document pour ça (ils ENVOIENT des fichiers sur Telegram), ni air_algerie_* (c'est pour les vols de Kouider, pas des clients).
HEURE D'ARRIVÉE / DE DÉPART / VOL d'un client : regarde la note de sa réservation (list_bookings), puis whatsapp_web 'read' ; si ce n'est pas écrit en texte → whatsapp_web 'look' (lit ses photos — billet, capture d'horaires — sans rien envoyer). Ne dis JAMAIS « il n'a rien envoyé » sans avoir fait 'look'.
PHOTO / PAPIERS d'un client SEULEMENT s'il dit « envoie-moi », « montre-moi », « la photo de » (passeport, permis, carte d'identité, contrat) → get_client_document, puis si rien : whatsapp_web 'photos' ou 'documents' sur sa discussion → ils partent sur son TELEGRAM ; dis « je te l'ai envoyé sur Telegram ».
RÉPONDRE à un client (« réponds-lui que… », « dis-lui… ») → whatsapp_web 'send' sur la discussion dont vous parliez juste avant (sans confirmed), lis-lui le message et demande « je l'envoie ? » ; à son « oui » → confirmed:true. Ne redemande pas de quelle discussion il s'agit si c'est clair d'après le tour précédent.
Le micro se rouvre après ta réponse : c'est une conversation suivie, reprends le fil du tour précédent (« et lui ? », « envoie-le », « non l'autre » se rapportent à ce dont vous parliez).
S'il veut discuter longuement ou en continu → rappelle-lui qu'il peut dire « appelle-moi » : Dzaryx l'appelle sur Telegram (conversation libre, il peut te couper la parole).]`;

// « Dis Siri, Dzaryx » + « appelle-moi / on parle » : une VRAIE conversation = appel Telegram (écoute en continu, il peut
// couper la parole, reprendre, tous les outils) — le Raccourci Siri, lui, ne fait qu'un aller-retour à la fois (28/10)
const CALL_ME_RE = /\b(appelle[- ]?moi|rappelle[- ]?moi maintenant|on (se )?parle|parle[- ]?moi|discut(e|er|ons)|conversation|mode (appel|conversation)|en vocal)\b/i;
// Fin de conversation : le micro ne se rouvre plus
const BYE_RE = /^(merci|c'?est (bon|tout|parfait|ok)|ok merci|stop|arr[eê]te|à plus|a plus|bye|ciao|bonne (nuit|journée|soirée)|rien|non merci|ça ira|ca ira|laisse tomber)\b/i;

const STALL_RE = /^(je (regarde|vais (regarder|vérifier|chercher)|cherche|vérifie|check)|laisse-moi (regarder|vérifier)|un instant)/i;
const SIRI_BUDGET_MS = 13_000;   // le Raccourci coupe vers 17 s (log Railway 28/10 : 499 à 17 s) → « Une erreur s'est produite »

export async function siriTurn(text: string): Promise<{ say: string; url?: string; listen?: boolean }> {
  if (CALL_ME_RE.test(text) && text.length < 120) {
    const { callOwner } = await import('../notifications/voice-call.js');
    await callOwner('Tu m\'as demandé de parler depuis Siri. Je t\'écoute, on reprend où on en était.', 'kouider', { force: true });
    return { say: 'Je t\'appelle sur Telegram, décroche et on parle.' };
  }
  if (BYE_RE.test(text.trim()) && text.trim().length < 40) return { say: 'Avec plaisir, je reste là si tu as besoin.' };
  const { processMessage } = await import('../conversation/orchestrator.js');
  const { stripToolTrace } = await import('./supabase.js');
  const run = async (): Promise<string> => {
    let t = stripToolTrace((await processMessage(`${SIRI}\n${text.slice(0, 1500)}`, 'voice_kouider', true)).text ?? '');
    // « Je regarde… ? » = promesse sans réponse (28/10 11h52) : il n'y a pas de 2e tour sous Siri → on relance une fois
    if (STALL_RE.test(t) && t.length < 220)
      t = stripToolTrace((await processMessage(`${SIRI}\nFais-le MAINTENANT avec tes outils et donne-moi directement la réponse : ${text.slice(0, 1500)}`, 'voice_kouider', true)).text ?? '') || t;
    return t;
  };
  // Le Raccourci abandonne au-delà de ~30 s (28/10 : il redemandait la même chose) → réponse écrite sur Telegram
  const job = run();
  const raw = await Promise.race([job, new Promise<null>(r => setTimeout(() => r(null), SIRI_BUDGET_MS))]);
  if (raw === null) {
    void job.then(t => tg(`🎙️ Réponse à ta question Siri « ${text.slice(0, 80)} » :\n\n${t.replace(/PHONE_URL:\s*\S+/i, '').trim()}`)).catch(() => {});
    return { say: 'Ça me prend un peu plus de temps, je t\'envoie la réponse sur Telegram.' };
  }
  let say = raw || 'Pardon, je n\'ai pas compris.';
  const m = /PHONE_URL:\s*(\S+)/i.exec(say);
  say = say.replace(/PHONE_URL:\s*\S+/i, '').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>|]/g, '').trim();
  // Couper à la fin d'une phrase, jamais au milieu d'un mot (Siri « coupé », 28/10)
  if (say.length > 600) {
    const cut = say.slice(0, 600);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    say = end > 200 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
    void tg(`🎙️ Réponse complète (Siri) :\n\n${raw.replace(/PHONE_URL:\s*\S+/i, '').trim()}`);
    say += ' La suite est sur ton Telegram.';
  }
  // Conversation suivie : le micro se rouvre après CHAQUE réponse (pas seulement après une question) tant qu'il ne dit pas
  // « merci / c'est bon / stop » ou qu'il se tait — Kouider 28/10 : « il doit pouvoir écouter, répondre, reprendre »
  return { say, ...(m ? { url: m[1] } : { listen: true }) };
}

// ── Salle de commande ────────────────────────────────────────────────────────
export async function commandCenter(): Promise<Record<string, unknown>> {
  const today = localNow().date;
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ data: cars }, { data: books }] = await Promise.all([
    supabase.from('cars').select('id, name, available'),
    supabase.from('bookings').select('car_id, client_name, start_date, end_date, status, final_price, total_price, amount_remaining, payment_status, profit, created_at').gte('end_date', `${today.slice(0, 7)}-01`).order('start_date'),
  ]);
  const B = ((books ?? []) as Array<Record<string, unknown>>).filter(b => !/REJECT|CANCEL/i.test(String(b['status'])));
  const C = (cars ?? []) as Array<{ id: string; name: string; available?: boolean }>;
  const fleet = C.map(c => {
    const now = B.find(b => b['car_id'] === c.id && String(b['start_date']).slice(0, 10) <= today && String(b['end_date']).slice(0, 10) >= today);
    const next = B.find(b => b['car_id'] === c.id && String(b['start_date']).slice(0, 10) > today);
    return { name: c.name, status: c.available === false ? 'atelier' : now ? (String(now['end_date']).slice(0, 10) === today ? 'retour' : 'louée') : 'libre', client: now ? String(now['client_name']) : '', until: now ? String(now['end_date']).slice(0, 16) : '', next: next ? String(next['start_date']).slice(0, 10) : '' };
  });
  const month = B.filter(b => String(b['start_date']).slice(0, 10) >= monthStart);
  const revenue = month.reduce((s, b) => s + Number(b['final_price'] ?? b['total_price'] ?? 0), 0);
  const profit = month.reduce((s, b) => s + Number(b['profit'] ?? 0), 0);
  const due = B.filter(b => b['payment_status'] !== 'PAID').reduce((s, b) => s + Number(b['amount_remaining'] ?? 0), 0);
  const [drafts, conn, square, fortune, projects, squad] = await Promise.all([
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./connections-watch.js').then(m => m.connectionsText()).catch(() => ''),
    import('./gold.js').then(m => m.goldMarket()).then(g => g?.eurDzd ?? null).catch(() => null),
    import('./brain-plus.js').then(m => m.fortune()).then(f => f.total).catch(() => null),
    kvJson<Array<{ goal: string; done?: boolean; steps: Array<{ text: string; date: string; done?: boolean }> }>>('projects', []),
    import('./squad.js').then(m => m.getSquad()).catch(() => null),
  ]);
  return {
    at: new Date().toISOString(), fleet, revenue: Math.round(revenue), profit: Math.round(profit), due: Math.round(due),
    occupancy: C.length ? Math.round((fleet.filter(f => f.status === 'louée' || f.status === 'retour').length / C.length) * 100) : 0,
    returnsToday: fleet.filter(f => f.status === 'retour').map(f => `${f.name} — ${f.client}`),
    departuresToday: B.filter(b => String(b['start_date']).slice(0, 10) === today).map(b => `${C.find(c => c.id === b['car_id'])?.name ?? '?'} — ${b['client_name']}`),
    whatsapp: (drafts as Array<{ chat: string; preview: string }>).slice(0, 6),
    alerts: conn ? [conn.replace(/^CONNEXIONS COUPÉES EN CE MOMENT[^:]*:\s*/, '')] : [],
    square, fortune,
    projects: projects.filter(p => !p.done).map(p => ({ goal: p.goal, done: p.steps.filter(s => s.done).length, total: p.steps.length, today: p.steps.find(s => !s.done)?.text ?? '' })),
    squad: squad ? { goal: squad.goal, status: squad.status } : null,
  };
}

// ── Machine à voir le futur : chiffres de base ───────────────────────────────
export async function futureBase(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: cars }, { data: books }, { data: exp }] = await Promise.all([
    supabase.from('cars').select('resale_price, base_price'),
    supabase.from('bookings').select('start_date, end_date, status, final_price, profit').gte('end_date', since),
    supabase.from('cash_entries').select('amount, kind, entry_date').gte('entry_date', since),
  ]);
  const C = (cars ?? []) as Array<{ resale_price: number; base_price: number }>;
  const B = ((books ?? []) as Array<{ start_date: string; end_date: string; status: string; final_price?: number; profit?: number }>).filter(b => !/REJECT|CANCEL/i.test(b.status));
  const days = B.reduce((s, b) => s + Math.max(1, Math.round((Date.parse(b.end_date) - Date.parse(b.start_date)) / 86_400_000)), 0);
  const price = C.length ? C.reduce((s, c) => s + Number(c.resale_price || 0), 0) / C.length : 35;
  const margin = C.length ? C.reduce((s, c) => s + (Number(c.resale_price || 0) - Number(c.base_price || 0)), 0) / C.length : price * 0.3;
  const costs = ((exp ?? []) as Array<{ amount: number; kind: string }>).filter(e => e.kind === 'expense').reduce((s, e) => s + Math.abs(Number(e.amount || 0)), 0) / 3;
  return { cars: C.length, price: Math.round(price), marginPerDay: Math.round(margin), occupancy: C.length ? Math.min(95, Math.round((days / (C.length * 90)) * 100)) : 0, monthlyCosts: Math.round(costs) };
}

// ── Briefing 3D (Carte live) ─────────────────────────────────────────────────
export async function briefing3d(): Promise<Record<string, string>> {
  const { listAgendaRange } = await import('./google-calendar.js');
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 0, 0);
  const evs = ((await listAgendaRange(now.toISOString(), end.toISOString()).catch(() => null)) ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>;
  const agenda = evs.length ? `Aujourd'hui : ${evs.slice(0, 4).map(e => `${e.start?.dateTime ? `${e.start.dateTime.slice(11, 16).replace(':', 'h')} ` : ''}${e.summary ?? ''}`).join(', ')}.` : 'Ton agenda est libre aujourd\'hui.';
  const trips = await kvJson<Array<{ who: string; kind: string; title: string; from?: string; to?: string; departAt: number }>>('trips:v1', []);
  const nextTrip = trips.filter(t => t.who === 'kouider' && t.kind === 'flight' && t.departAt > Date.now()).sort((a, b) => a.departAt - b.departAt)[0];
  const g = await import('./gold.js').then(m => m.goldMarket()).catch(() => null);
  const pred = await kvJson<{ text?: string } | null>('predictions:last', null);
  const proj = (await kvJson<Array<{ goal: string; done?: boolean; steps: Array<{ text: string; date: string; done?: boolean }> }>>('projects', [])).filter(p => !p.done);
  return {
    me: agenda,
    aeroport: nextTrip ? `Prochain vol : ${nextTrip.title || `${nextTrip.from ?? ''} vers ${nextTrip.to ?? ''}`}, le ${new Date(nextTrip.departAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.` : '',
    agence: [g?.eurDzd ? `L'euro est à ${Math.round(g.eurDzd)} dinars au square.` : '', proj.length ? `Projet ${proj[0]!.goal} : ${proj[0]!.steps.find(s => !s.done)?.text ?? 'presque fini'}.` : ''].filter(Boolean).join(' '),
    futur: pred?.text ? `Ma prédiction : ${pred.text.replace(/\*\*/g, '').split('\n').find(l => l.includes('🔮'))?.replace(/🔮/g, '').slice(0, 220) ?? ''}` : '',
  };
}
