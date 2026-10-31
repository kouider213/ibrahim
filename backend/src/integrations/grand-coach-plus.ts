import { kvJson, kvPut, ai, tg } from './ai-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';
import { SAGES } from './grand-coach-sages.js';

// GRAND COACH + (Kouider 31/10 : « boost au maximum, qu'il m'accompagne toute la journée, 20 trucs auxquels on n'aurait
// jamais pensé »). Les sections s'ajoutent aux messages existants du Grand Coach (pas de message en plus quand c'est possible).
//  1 vocal du coach (texte du matin à écouter en voiture)   2 compte à rebours de ta liberté
//  3 arrivée au travail (GPS) → mission de la pause          4 sas de décompression avant la maison (GPS)
//  5 lettre du Kouider de 2036 (1er du mois)                 6 pré-mortem du mardi (inversion de Munger)
//  7 bocal des victoires (auto + « j'ai gagné… »)            8 anti-procrastination 16h (2 minutes) + report au lendemain
//  9 score de parole envers toi-même (samedi)               10 technique de négociation du jour (Voss, Cialdini…)
// 11 gym du vendeur : une objection, il note ta réponse     12 les Principes de Kouider (chaque échec → une règle)
// 13 lettres à Ibrahim : une question de vie par semaine    14 mentor du mois
// 15 toi contre toi il y a 30 jours                         16 liste « j'arrête de… » du mercredi
// 17 défi épargne 52 semaines                               18 baraka du vendredi
// 19 un geste pour ta femme (mardi, samedi)                20 le coach sait se taire (conduite, ne pas déranger, budget)

type Row = Record<string, unknown>;
const S = (v: unknown) => String(v ?? '');
const N = (v: unknown) => Number(v ?? 0) || 0;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fmtD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayIdx = (d: string) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 86_400_000);

const K = {
  wins: 'gc:wins', principles: 'gc:principles', ibrahim: 'gc:ibrahim', saving: 'gc:saving', gps: 'gc:gpsday', stop: 'gc:stop',
  drill: (d: string) => `gc:drill:${d}`, failSeen: 'gc:failseen', count: (d: string) => `gc:count:${d}`,
};

// ── 20. Le coach sait se taire ───────────────────────────────────────────────
const DAILY_BUDGET = 7;
/** true = on peut parler maintenant. Conduite / « ne me dérange pas » → on attend (le job réessaie au quart d'heure suivant). */
export async function canSpeak(important = false): Promise<boolean> {
  const dnd = await import('../notifications/dnd.js').then(m => m.dndAllowsMessage()).catch(() => true);
  if (!dnd) return false;
  const st = await kvJson<{ drive?: { lastMove: number } }>('gps:state', {});
  if (st.drive && Date.now() - st.drive.lastMove < 4 * 60_000) return false;   // il conduit : on attend qu'il soit garé
  if (important) return true;
  return N(await kvJson<number>(K.count(localNow().date), 0)) < DAILY_BUDGET;
}
export async function spoke(): Promise<void> {
  const k = K.count(localNow().date);
  await kvPut(k, N(await kvJson<number>(k, 0)) + 1, 2 * 86_400);
}

// ── 1. Vocal du coach ────────────────────────────────────────────────────────
export async function sendVoice(text: string, caption = '🎧 Ton coach en audio — à écouter en voiture ou en t\'habillant.'): Promise<boolean> {
  const { synthesizeVoiceGemini } = await import('../notifications/dispatcher.js');
  const buf = await synthesizeVoiceGemini(text.replace(/[*_#]/g, '').slice(0, 1800)).catch(() => null);
  if (!buf) return false;
  const { sendAudio } = await import('./my-voice.js');
  await sendAudio(buf, caption, `coach-${localNow().date}.${buf.subarray(0, 4).toString() === 'RIFF' ? 'wav' : 'mp3'}`);
  return true;
}

// ── 2. Compte à rebours de ta liberté ────────────────────────────────────────
export async function countdown(): Promise<string> {
  const goals = await kvJson<Array<{ name: string; deadline: string; metric: string }>>('lifegps', []);
  const dep = goals.find(g => /belgique|partir|d[ée]part/i.test(g.name))?.deadline ?? '2028-12-31';
  const today = localNow().date;
  const left = Math.max(0, Math.round((Date.parse(dep) - Date.parse(today)) / 86_400_000));
  const weeks = Math.floor(left / 7);
  return `⏳ Compte à rebours : ${left} jours avant ton départ de Belgique (${weeks} semaines, ${weeks} samedis). Chaque journée gâchée en est une de moins pour préparer ta vie à Oran.`;
}

// ── 3 + 4. GPS : arrivée au travail, sas avant la maison ─────────────────────
export async function onGps(here: string | undefined, p: { lat: number; lng: number }, known: Array<{ id: string; lat: number; lng: number }>, driving: boolean): Promise<void> {
  const { date, hhmm } = localNow();
  const st = await kvJson<{ date: string; work?: boolean; home?: boolean }>(K.gps, { date });
  if (st.date !== date) { st.date = date; st.work = false; st.home = false; }
  const off = await import('./kouider-dossier.js').then(m => m.isDayOff()).catch(() => false);
  if (here === 'work' && !st.work && hhmm >= '05:00' && hhmm <= '11:00' && !off) {
    st.work = true; await kvPut(K.gps, st, 2 * 86_400);
    const b = await kvJson<{ items: Array<{ text: string; done?: boolean }> } | null>(`gc:big3:${date}`, null);
    const first = b?.items.find(i => !i.done)?.text;
    if (await canSpeak()) { await tg(`🏢 Bien arrivé au travail. Ta mission pour la pause : ${first ?? 'une action FIK de 10 minutes'}.\nIci tu gagnes ta sécurité, à Oran tu construis ta liberté. Les deux comptent aujourd'hui. 💪`); await spoke(); }
    return;
  }
  const home = known.find(k => k.id === 'home');
  if (home && driving && !st.home && hhmm >= '15:30' && hhmm <= '22:30') {
    const km = Math.hypot((p.lat - home.lat) * 111, (p.lng - home.lng) * 111 * Math.cos(p.lat * Math.PI / 180));
    if (km < 3 && km > 0.4) {
      st.home = true; await kvPut(K.gps, st, 2 * 86_400);
      // Message déposé maintenant, lu à l'arrivée (il conduit : pas de notification bruyante attendue ; court)
      await tg('🏠 Sas de décompression : dans 5 minutes tu es chez toi. Laisse FIK et le travail dans la voiture. 3 grandes respirations. Ce soir tu es papa et mari d\'abord — Ibrahim ne se souviendra pas de tes chiffres, il se souviendra de toi.');
      await spoke();
    }
  }
}

// ── 5. Lettre du Kouider de 2036 ─────────────────────────────────────────────
export async function letter2036(): Promise<string> {
  const [vision, wins, b] = await Promise.all([kvJson<Record<string, string> | null>('gc:vision', null), kvJson<Array<{ date: string; text: string }>>(K.wins, []), kvJson<{ n: number }>('gc:streak', { n: 0 })]);
  return ai(`Écris une lettre de Kouider en 2036 (10 ans plus tard, devenu le businessman qu'il voulait être en Algérie) au Kouider d'aujourd'hui (${localNow().date}).\nSa vision : ${vision ? JSON.stringify(vision) : 'grand businessman indépendant à Oran, famille heureuse, bien financièrement'}.\nSes victoires récentes : ${wins.slice(-6).map(w => w.text).join(' ; ') || 'il démarre'}. Série d'actions : ${b.n} j.\n12 à 16 lignes, « Cher moi de 2026 », tutoiement, concret (Oran, FIK, Ibrahim qui grandit, sa femme), ce qu'il a bien fait, l'erreur à ne pas faire, et un encouragement. N'invente pas de chiffres précis de fortune.`, { max: 700 });
}

// ── 6. Pré-mortem ────────────────────────────────────────────────────────────
export async function premortem(): Promise<string> {
  const t = await ai(`Pré-mortem (méthode d'inversion de Charlie Munger) pour la semaine de Kouider (FIK Conciergerie à Oran + FIK Sites, travaille en Belgique, sport le matin, papa). Imagine que dimanche soir la semaine a été RATÉE. Donne les 3 causes les plus probables et pour chacune la parade (une ligne chacune, format « ❌ cause → ✅ parade »). Rien d'autre.`, { max: 220 }).catch(() => '');
  return t ? `🔮 Pré-mortem de la semaine (Munger : « dis-moi où je vais mourir, que je n'y aille jamais ») :\n${t}` : '';
}

// ── 7. Bocal des victoires ───────────────────────────────────────────────────
export async function addWin(text: string, date = localNow().date): Promise<string> {
  const l = await kvJson<Array<{ date: string; text: string }>>(K.wins, []);
  if (!l.some(w => w.date === date && w.text === text)) l.push({ date, text: text.slice(0, 160) });
  await kvPut(K.wins, l.slice(-300));
  return `🫙 Ajouté à ton bocal des victoires (${l.length}). Goggins : dans les jours durs, on plonge la main dedans.`;
}
export async function collectWins(): Promise<void> {
  const date = localNow().date;
  const { data } = await supabase.from('bookings').select('client_name, final_price, total_price, status, created_at').gte('created_at', `${date}T00:00:00`);
  for (const b of (data ?? []) as Row[]) if (!/REJECT|CANCEL/i.test(S(b['status']))) await addWin(`Réservation ${S(b['client_name']).split(' ')[0]} (${Math.round(N(b['final_price'] ?? b['total_price']))} €)`, date);
  const big = await kvJson<{ items: Array<{ done?: boolean }> } | null>(`gc:big3:${date}`, null);
  if (big && big.items.every(i => i.done)) await addWin('3 actions qui rapportent faites sur 3', date);
}
export async function winsPick(n = 3): Promise<string> {
  const l = await kvJson<Array<{ date: string; text: string }>>(K.wins, []);
  if (!l.length) return '';
  const pick = [...l].sort(() => Math.random() - 0.5).slice(0, n);
  return `🫙 Rappelle-toi :\n${pick.map(w => `• ${fmtD(w.date)} — ${w.text}`).join('\n')}`;
}

// ── 8. Anti-procrastination ──────────────────────────────────────────────────
export async function antiProcrastination(): Promise<string> {
  const date = localNow().date;
  const b = await kvJson<{ items: Array<{ text: string; done?: boolean; carried?: number }> } | null>(`gc:big3:${date}`, null);
  const stuck = b?.items.find(i => !i.done);
  if (!stuck) return '';
  const step = await ai(`Kouider repousse cette action : « ${stuck.text} »${stuck.carried ? ` (déjà reportée ${stuck.carried} fois)` : ''}. Règle des 2 minutes : donne UNE toute première étape ridicule, faisable en 2 minutes sur son téléphone, qui lance l'action. Une phrase à l'impératif.`, { max: 70 }).catch(() => '');
  return `⏰ 16h — « ${stuck.text} » attend encore.${stuck.carried ? ` C'est la ${stuck.carried + 1}e journée.` : ''}\nJuste 2 minutes : ${step.trim() || 'ouvre la conversation et écris la première phrase.'}\nLe reste viendra tout seul. Réponds « fait » quand c'est lancé.`;
}

// ── 9. Score de parole ───────────────────────────────────────────────────────
export async function wordScore(): Promise<string> {
  const today = localNow().date;
  let done = 0, total = 0;
  for (let i = 0; i < 7; i++) { const b = await kvJson<{ items: Array<{ done?: boolean }> } | null>(`gc:big3:${addDays(today, -i)}`, null); if (b) { total += b.items.length; done += b.items.filter(x => x.done).length; } }
  const d = await kvJson<{ days: Record<string, boolean> } | null>('gc:defi', null);
  const defi = d ? Object.values(d.days).filter(Boolean).length : 0;
  const it = await kvJson<{ items: Array<{ done?: boolean }> } | null>('life:intentions', null);
  const iDone = it?.items.filter(x => x.done).length ?? 0, iTot = it?.items.length ?? 0;
  const all = total + (d ? 7 : 0) + iTot, ok = done + defi + iDone;
  if (!all) return '🤝 Score de parole : pas encore de promesse à mesurer cette semaine. Il démarre avec tes 3 actions du jour.';
  const pct = all ? Math.round(ok / all * 100) : 0;
  return `🤝 Ta parole envers toi-même cette semaine : ${pct} % (actions ${done}/${total}${d ? `, défi ${defi}/7` : ''}${iTot ? `, intentions ${iDone}/${iTot}` : ''}).\n${pct >= 80 ? 'Un homme de parole. C\'est la base de toute confiance — la tienne d\'abord.' : pct >= 50 ? 'Correct. Promets-toi moins, mais tiens tout.' : 'Tu te promets plus que tu ne tiens. Cette semaine : une seule promesse par jour, tenue à 100 %.'}`;
}

// ── 10 + 11. Négociation du jour / gym du vendeur ────────────────────────────
const TECHNIQUES = [
  'le miroir (Chris Voss) : répéter les 2-3 derniers mots du client sur un ton de question', 'l\'étiquette (Voss) : « On dirait que le prix vous inquiète… »',
  'la question calibrée (Voss) : « Comment je peux faire pour que ça marche pour vous ? »', 'l\'audit des accusations (Voss) : annoncer soi-même ce que le client pense de négatif',
  'la réciprocité (Cialdini) : donner un petit plus avant de demander', 'la rareté (Cialdini) : « il me reste une seule voiture ces dates-là » (seulement si c\'est vrai)',
  'la preuve sociale (Cialdini) : avis Google, photos de clients contents', 'l\'ancrage : annoncer d\'abord l\'offre premium, puis la standard',
  'les 3 options (bon / mieux / premium) : le client choisit entre tes offres, pas entre toi et un concurrent', 'le silence : après ton prix, ne dis plus rien',
  'la meilleure solution de rechange (BATNA) : savoir à l\'avance ce que tu fais s\'il dit non', 'donner une raison (« parce que… ») : une demande avec une raison passe beaucoup mieux',
  'l\'engagement progressif (Cialdini) : obtenir un petit oui (les dates) avant le grand (l\'acompte)', 'échanger, jamais donner : une remise contre quelque chose (plus de jours, paiement d\'avance, un avis)',
];
const OBJECTIONS = [
  'C\'est trop cher, l\'agence d\'à côté fait moins.', 'Je dois en parler à ma femme, je vous rappelle.', 'Vous pouvez enlever la caution ?',
  'Je vous paie tout à l\'arrivée, pas d\'acompte.', 'Votre voiture a déjà combien de kilomètres ?', 'Un ami m\'a dit qu\'on peut louer moins cher sur Facebook.',
  'Je veux la voiture mais seulement 2 jours, à prix semaine.', 'Pour un site internet, mon neveu peut me le faire gratuitement.', 'Je n\'ai pas besoin d\'un site, j\'ai Facebook.',
  'Je reviens vers vous la semaine prochaine.', 'Si je prends 15 jours, vous me faites combien ?', 'Vous êtes en Belgique, comment je sais que c\'est sérieux ?',
];
export async function negociation(): Promise<string> {
  const date = localNow().date;
  if (dayIdx(date) % 2 === 0) {
    const t = TECHNIQUES[Math.floor(dayIdx(date) / 2) % TECHNIQUES.length]!;
    const ex = await ai(`Technique de négociation : ${t}. Donne UN exemple concret en 2 lignes : un client de FIK Conciergerie (location de voitures à Oran, souvent la diaspora) dit quelque chose, et ce que Kouider répond avec cette technique (en français, naturel).`, { max: 140 }).catch(() => '');
    return `🤝 Technique de négo du jour : ${t}.${ex ? `\n${ex.trim()}` : ''}\nÀ essayer avec le prochain client.`;
  }
  const o = OBJECTIONS[Math.floor(dayIdx(date) / 2) % OBJECTIONS.length]!;
  await kvPut(K.drill(date), o, 2 * 86_400);
  return `🥊 Gym du vendeur : un client te dit « ${o} »\nTu réponds quoi ? Écris-moi ta réponse, je te la note sur 10.`;
}
export async function gradeObjection(answer: string): Promise<string> {
  const date = localNow().date;
  const o = (await kvJson<string | null>(K.drill(date), null)) ?? (await kvJson<string | null>(K.drill(addDays(date, -1)), null)) ?? OBJECTIONS[0]!;
  return ai(`Objection client (location de voitures FIK à Oran / FIK Sites) : « ${o} »\nRéponse de Kouider : « ${answer} »\nNote sur 10, puis en 4 lignes max : ce qui est bien, ce qui manque, et LA réponse idéale (naturelle, honnête, qui garde le client). Tutoiement, encourageant.`, { max: 320 });
}

// ── 12. Les Principes de Kouider ─────────────────────────────────────────────
export async function failuresToLearn(): Promise<string> {
  const seen = await kvJson<string[]>(K.failSeen, []);
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data } = await supabase.from('bookings').select('id, client_name, status, updated_at').gte('updated_at', since).or('status.ilike.%REJECT%,status.ilike.%CANCEL%');
  const fresh = ((data ?? []) as Row[]).filter(b => !seen.includes(S(b['id'])));
  if (!fresh.length) return '';
  await kvPut(K.failSeen, [...seen, ...fresh.map(b => S(b['id']))].slice(-200));
  return `📖 Ray Dalio : douleur + réflexion = progrès.\nLa réservation de ${fresh.map(b => S(b['client_name']).split(' ')[0]).join(', ')} n'a pas abouti. Qu'est-ce que tu en retiens, en une règle ? (ex. « toujours demander l'acompte sous 24 h »). Réponds-moi : je l'ajoute aux Principes de Kouider.`;
}
export async function addPrinciple(text: string): Promise<string> {
  const l = await kvJson<Array<{ date: string; text: string }>>(K.principles, []);
  l.push({ date: localNow().date, text: text.slice(0, 220) });
  await kvPut(K.principles, l);
  return `📖 Principe n°${l.length} ajouté : « ${text} ». Ton propre livre de règles grandit — comme Dalio.`;
}
export async function principles(): Promise<string> {
  const l = await kvJson<Array<{ date: string; text: string }>>(K.principles, []);
  return l.length ? `📖 LES PRINCIPES DE KOUIDER (${l.length})\n${l.map((p, i) => `${i + 1}. ${p.text}`).join('\n')}` : '📖 Pas encore de principe. Chaque fois que quelque chose rate, je te demanderai la règle que tu en tires.';
}

// ── 13. Lettres à Ibrahim ────────────────────────────────────────────────────
const IBRAHIM_Q = [
  'Quel a été le jour le plus dur de ta vie, et qu\'est-ce qui t\'a fait tenir ?', 'Pourquoi as-tu créé FIK ?', 'Qu\'est-ce que ton propre père t\'a appris sans le dire ?',
  'Qu\'est-ce que l\'argent ne peut pas acheter, d\'après toi ?', 'Comment as-tu rencontré sa maman ?', 'Quelle erreur aimerais-tu qu\'il ne fasse jamais ?',
  'Qu\'est-ce qu\'Oran représente pour toi ?', 'Ta plus grande fierté, à part lui ?', 'Comment choisir ses amis ?', 'Qu\'as-tu ressenti le jour de sa naissance ?',
  'Qu\'est-ce qu\'un homme de parole ?', 'Que faire quand tout le monde doute de toi ?', 'Ton meilleur souvenir d\'enfance ?', 'Ce que tu aurais aimé savoir à 20 ans ?',
  'Comment traiter les gens qui travaillent pour toi ?', 'Qu\'est-ce que la foi t\'apporte ?', 'Pourquoi le sport chaque matin ?', 'Quel est le vrai sens de la réussite ?',
  'Comment gérer la colère ?', 'Qu\'est-ce que la Belgique t\'a appris ?', 'Que faire de son premier salaire ?', 'Comment rester humble quand ça marche ?',
];
export async function ibrahimQuestion(): Promise<string> {
  const l = await kvJson<Array<{ q: string; a?: string; date: string }>>(K.ibrahim, []);
  const q = IBRAHIM_Q.find(x => !l.some(e => e.q === x)) ?? IBRAHIM_Q[dayIdx(localNow().date) % IBRAHIM_Q.length]!;
  l.push({ q, date: localNow().date });
  await kvPut(K.ibrahim, l);
  return `✉️ Lettre à Ibrahim (une question par semaine — le jour de ses 18 ans, il aura le livre de ta vie) :\n« ${q} »\nRéponds quand tu veux, même en vocal, avec tes mots.`;
}
export async function ibrahimAnswer(text: string): Promise<string> {
  const l = await kvJson<Array<{ q: string; a?: string; date: string }>>(K.ibrahim, []);
  const e = [...l].reverse().find(x => !x.a) ?? (l.push({ q: 'Libre', date: localNow().date }), l[l.length - 1]!);
  e.a = text.slice(0, 4000);
  await kvPut(K.ibrahim, l);
  return `✉️ Gardé pour Ibrahim (${l.filter(x => x.a).length} lettre(s)). Un jour, ce sera son trésor.`;
}
export async function ibrahimBook(): Promise<string> {
  const l = (await kvJson<Array<{ q: string; a?: string; date: string }>>(K.ibrahim, [])).filter(x => x.a);
  return l.length ? `✉️ LETTRES À IBRAHIM (${l.length})\n\n${l.map(x => `— ${x.q} (${fmtD(x.date)})\n${x.a}`).join('\n\n')}` : 'Aucune lettre encore. La première question arrive dimanche.';
}

// ── 14. Mentor du mois ───────────────────────────────────────────────────────
export function mentorOfMonth(date = localNow().date) {
  return SAGES[(+date.slice(0, 4) * 12 + +date.slice(5, 7)) % SAGES.length]!;
}

// ── 15. Toi contre toi il y a 30 jours ───────────────────────────────────────
export async function versus30(): Promise<string> {
  const today = localNow().date;
  const count = async (from: string, to: string) => {
    const { data } = await supabase.from('bookings').select('final_price, total_price, status, created_at').gte('created_at', `${from}T00:00:00`).lt('created_at', `${to}T00:00:00`);
    const l = ((data ?? []) as Row[]).filter(b => !/REJECT|CANCEL/i.test(S(b['status'])));
    let act = 0;
    for (let d = from; d < to; d = addDays(d, 1)) { const b = await kvJson<{ items: Array<{ done?: boolean }> } | null>(`gc:big3:${d}`, null); act += b?.items.filter(x => x.done).length ?? 0; }
    return { n: l.length, ca: l.reduce((s, b) => s + N(b['final_price'] ?? b['total_price']), 0), act };
  };
  const [now, before] = await Promise.all([count(addDays(today, -30), addDays(today, 1)), count(addDays(today, -60), addDays(today, -30))]);
  const wins = (await kvJson<Array<{ date: string }>>(K.wins, [])).filter(w => w.date > addDays(today, -30)).length;
  const a = (x: number, y: number) => (x > y ? '📈' : x < y ? '📉' : '➡️');
  return [`🪞 Toi contre toi il y a 30 jours (le seul adversaire qui compte)`, `${a(now.n, before.n)} Réservations : ${now.n} (avant ${before.n})`,
    `${a(now.ca, before.ca)} CA réservé : ${Math.round(now.ca)} € (avant ${Math.round(before.ca)} €)`, `${a(now.act, before.act)} Actions qui rapportent faites : ${now.act} (avant ${before.act})`,
    `🫙 Victoires notées ce mois : ${wins}`].join('\n');
}

// ── 16. Liste « j'arrête de… » ───────────────────────────────────────────────
export async function stopDoing(add?: string): Promise<string> {
  const l = await kvJson<string[]>(K.stop, []);
  if (add) { l.push(add.slice(0, 140)); await kvPut(K.stop, l.slice(-20)); return `🛑 Noté dans ta liste « j'arrête de… » : ${add}`; }
  return `🛑 Mercredi = liste « J'ARRÊTE DE… » (Jobs : se concentrer, c'est dire non à 1 000 choses).\n${l.length ? `Tes arrêts en cours :\n${l.slice(-5).map(x => `• ${x}`).join('\n')}\n` : ''}Quelle chose tu arrêtes cette semaine pour gagner du temps ou de l'énergie ? (une seule, réponds-moi)`;
}

// ── 17. Défi épargne 52 semaines ─────────────────────────────────────────────
interface Saving { start: string; base: number; cur: string; paid: number[] }
export async function saving(input: Row): Promise<string> {
  const op = S(input['op'] || 'status');
  let s = await kvJson<Saving | null>(K.saving, null);
  if (op === 'start') {
    s = { start: localNow().date, base: N(input['amount']) || 5, cur: S(input['currency']) || '€', paid: [] };
    await kvPut(K.saving, s);
    return `🐷 Défi épargne 52 semaines lancé : semaine 1 = ${s.base} ${s.cur}, semaine 2 = ${s.base * 2} ${s.cur}… semaine 52 = ${s.base * 52} ${s.cur}. Total au bout d'un an : ${s.base * 1378} ${s.cur}. Chaque vendredi je te rappelle la somme.`;
  }
  if (!s) return '🐷 Défi épargne 52 semaines pas lancé. Dis « lance le défi épargne à 5 € » (ou 500 DA) — semaine n = n × la somme, ≈ 1 378 × la somme au bout d\'un an.';
  const week = Math.min(52, Math.floor((Date.parse(localNow().date) - Date.parse(s.start)) / (7 * 86_400_000)) + 1);
  if (op === 'paid') { if (!s.paid.includes(week)) s.paid.push(week); await kvPut(K.saving, s); }
  const total = s.paid.reduce((x, w) => x + w * s!.base, 0);
  return `🐷 Épargne 52 semaines — semaine ${week} : mets ${week * s.base} ${s.cur} de côté${s.paid.includes(week) ? ' ✅ (fait)' : ''}. Déjà épargné : ${total} ${s.cur} (${s.paid.length} semaines).`;
}

// ── 18. Baraka du vendredi ───────────────────────────────────────────────────
export function baraka(): string {
  const ideas = ['une petite sadaqa (même 1 €, ou payer un café à quelqu\'un)', 'appeler ta mère ou ton père, juste pour prendre des nouvelles', 'remercier quelqu\'un qui t\'a aidé cette semaine (Houari ?)', 'un message à un ami que tu n\'as pas vu depuis longtemps'];
  return `🤲 Baraka du vendredi : « la sadaqa ne diminue jamais une richesse ». Aujourd'hui : ${ideas[dayIdx(localNow().date) % ideas.length]}.`;
}

// ── 19. Un geste pour ta femme ───────────────────────────────────────────────
export async function geste(): Promise<string> {
  const t = await ai(`Propose UN petit geste concret pour qu'un mari (Kouider, papa d'un garçon de 1 an et demi, très occupé par son travail et son entreprise) montre aujourd'hui à sa femme qu'il pense à elle : moins de 10 min, sans dépenser beaucoup, pas un cliché. Une phrase à l'impératif. Ne propose pas de lui écrire à sa place.`, { max: 70 }).catch(() => '');
  return `💌 Geste du jour pour ta femme : ${t.trim() || 'envoie-lui un message à midi juste pour lui dire que tu penses à elle.'}`;
}

/** Sections ajoutées au message du matin selon le jour (pas de message en plus). */
export async function morningSections(weekday: number): Promise<string[]> {
  const out: string[] = [await countdown().catch(() => '')];
  if (weekday === 2) out.push(await premortem().catch(() => ''));
  if (weekday === 3) out.push(await stopDoing().catch(() => ''));
  if (weekday === 5) out.push(baraka(), await saving({}).then(t => (t.includes('pas lancé') ? '' : t)).catch(() => ''));
  return out.filter(Boolean);
}
export async function middaySections(weekday: number): Promise<string[]> {
  const out = [await negociation().catch(() => '')];
  if (weekday === 2 || weekday === 6) out.push(await geste().catch(() => ''));
  return out.filter(Boolean);
}
