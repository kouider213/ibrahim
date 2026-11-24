// 24/11 Kouider : « un vrai community manager, une vraie équipe solide avec les meilleurs […] le but c'est d'avoir le meilleur réseau TikTok ».
// L'ÉQUIPE TIKTOK de FIK : elle travaille sur des données RÉELLES lues dans TikTok Studio (PC cloud, compte fik_conciergerie) :
//  - nos stats : heures d'activité des followers, audience (pays, villes, âges), vues/likes/partages/enregistrements de chaque vidéo,
//    ce que les gens tapent pour nous trouver ;
//  - l'inspiration : vidéos tendance « Véhicules » (France = 46 % de notre public, + monde) — on reprend les MÉCANIQUES, jamais la vidéo.
// → brief de chaque pub (tiktok-pub.ts teamBrief), meilleurs créneaux (bestPostSlots), réunion d'équipe du dimanche sur Telegram.
import { kvGet, kvSet } from '../integrations/app-store.js';
import { askJson } from '../integrations/pro-doc.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

const KEY = 'tt:growth';
const ORAN_UTC_OFFSET = 1;   // Algérie = UTC+1 toute l'année (Paris aussi l'hiver)

export const TEAM = [
  'CMO (directeur marketing : objectif abonnés + vues + réservations)', 'Chief Brand Officer (image FIK : premium, fiable, chaleureux)',
  'Head of Social Media (calendrier, formats, régularité)', 'Social Media Manager (publication, légendes, hashtags)',
  'Content Director + Creative Director (idées, concepts qui accrochent)', 'Art Director (look, couleurs, cadrage)',
  'Brand Strategist (positionnement : la location sans stress pour la diaspora)', 'Performance Marketing Manager (ce qui convertit en messages WhatsApp)',
  'SEO Specialist (mots-clés que les gens tapent dans la recherche TikTok)', 'Community Manager (commentaires, DM, commentaire épinglé)',
  'Influencer Marketing Manager (créateurs à contacter)', 'PR Manager', 'CRM & Customer Experience (avis clients, fidélité)',
  'Videographer + Video Editor (rythme, hook visuel, durée)', 'Copywriter (hooks, textes à l\'écran)', 'Marketing Data Analyst (chiffres réels)',
];

interface Video { id: string; desc: string; create_time: number; duration?: number; plays?: number; likes?: number; comments?: number; shares?: number; saves?: number }
interface Trend { id: string; desc: string; plays: number; likes: number; author: string }
export interface Analysis {
  summary?: string; winning_patterns?: string[]; hooks_bank?: string[]; formats?: string[];
  ideas?: Array<{ title: string; hook: string; format: string; why: string }>; keywords?: string[]; hashtags?: string[]; avoid?: string[];
  creators?: Array<{ handle: string; why: string }>;
}
export interface Growth {
  at: string; followers?: number; hours?: number[]; slots?: Array<{ day: number; h: number; m: number; prime: boolean; why: string }>;
  audience?: string; videos: Video[]; searches: string[]; trends: Trend[]; analysis: Analysis; views7?: number; followers7?: number;
}

const val = (x: unknown): number => (x && typeof x === 'object' && 'value' in (x as Record<string, unknown>) ? Number((x as { value: unknown }).value) || 0 : 0);
const series = (x: unknown): number[] => (Array.isArray(x) ? x.map(val) : []);

export async function getGrowth(): Promise<Growth | null> {
  try { const r = await kvGet(KEY); return r ? JSON.parse(r) as Growth : null; } catch { return null; }
}

/** Heures (heure d'Oran) où les followers sont le plus actifs → 2 créneaux par jour, le meilleur = prime. */
function slotsFrom(hours: number[]): Growth['slots'] {
  const order = hours.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v);
  const top = order[0]!;
  const second = order.find(o => Math.abs(o.h - top.h) >= 4 && o.h >= 9) ?? order[1]!;
  const out: NonNullable<Growth['slots']> = [];
  for (let d = 0; d < 7; d++) {
    // on poste 30 min AVANT le pic : la vidéo est poussée quand ils arrivent
    const mk = (h: number) => ({ h: (h + 23) % 24, m: 30 });
    out.push({ day: d, ...mk(second.h), prime: false, why: `2e pic d'activité de tes followers (${second.h}h, données TikTok)` });
    out.push({ day: d, ...mk(top.h), prime: true, why: `tes followers sont les plus actifs à ${top.h}h (heure d'Oran / France), d'après TikTok` });
  }
  return out;
}

/** Lecture complète (≈ 1-2 min sur le PC cloud) + analyse de l'équipe. */
export async function refreshGrowth(): Promise<Growth | string> {
  const { cloudEmit, isCloudPcOnline } = await import('../actions/handlers/cloudpc-relay.js');
  if (!isCloudPcOnline()) return 'PC cloud hors ligne';
  type Raw = { ok: boolean; error?: string; insight?: Record<string, unknown>; videos?: Video[]; searches?: string; trends?: Record<string, Trend[]> };
  const r = await cloudEmit<Raw>('cloud:tt', { action: 'insights' }, 240_000)
    .catch(e => ({ ok: false, error: e instanceof Error ? e.message : String(e) } as Raw));
  if (!r.ok) return r.error ?? 'lecture TikTok impossible';
  const g = await buildGrowth(r);
  await kvSet(KEY, JSON.stringify(g));
  return g;
}

export async function buildGrowth(r: { insight?: Record<string, unknown>; videos?: Video[]; searches?: string; trends?: Record<string, Trend[]> }): Promise<Growth> {
  const ins = r.insight ?? {};
  // heures : un tableau de 24 valeurs (UTC) par jour → moyenne, puis décalage en heure d'Oran
  const days = (Array.isArray(ins['follower_active_history_hours']) ? ins['follower_active_history_hours'] as Array<{ value?: number[] }> : [])
    .map(d => d.value ?? []).filter(v => v.length === 24);
  let hours: number[] | undefined;
  if (days.length) {
    const utc = Array.from({ length: 24 }, (_, h) => Math.round(days.reduce((s, d) => s + d[h]!, 0) / days.length));
    hours = Array.from({ length: 24 }, (_, h) => utc[(h - ORAN_UTC_OFFSET + 24) % 24]!);
  }
  const loc = ins['follower_location_percent'] as { country_percent_list?: Array<{ country_name?: string; country_vv_percent?: number; value?: number; city_percent_list?: Array<{ key: string; value: number }> }> } | undefined;
  const ages = (ins['follower_age_distribution'] as { value?: Array<{ key: string; value: number }> } | undefined)?.value ?? [];
  const gender = (ins['follower_gender_percent'] as { value?: Array<{ key: string; value: number }> } | undefined)?.value ?? [];
  const pct = (v?: number) => `${Math.round((v ?? 0) * 100)} %`;
  const audience = [
    loc?.country_percent_list?.length ? `Pays : ${loc.country_percent_list.slice(0, 5).map(c => `${c.country_name} ${pct(c.value ?? c.country_vv_percent)}`).join(', ')}` : '',
    loc?.country_percent_list?.[0]?.city_percent_list?.length ? `Villes (${loc.country_percent_list[0].country_name}) : ${loc.country_percent_list[0].city_percent_list.filter(c => c.key !== 'Autre').map(c => `${c.key} ${pct(c.value)}`).join(', ')}` : '',
    ages.length ? `Âges : ${ages.map(a => `${a.key} ${pct(a.value)}`).join(', ')}` : '',
    gender.length ? `Sexe : ${gender.filter(g => g.value).map(g => `${g.key === 'Female' ? 'femmes' : 'hommes'} ${pct(g.value)}`).join(', ')}` : '',
  ].filter(Boolean).join(' · ');
  const searches = [...new Set([
    ...String(r.searches ?? '').split('\n').map(s => s.trim()).filter(s => s && !/%$|^Recherches/.test(s)),
    ...((ins['user_search_terms'] as { value?: Array<{ key?: string }> } | undefined)?.value ?? []).map(x => String(x.key ?? '')).filter(Boolean),
  ])].slice(0, 15);
  const vv = series(ins['vv_history']), fol = series(ins['follower_num_history']);
  const trends = Object.values(r.trends ?? {}).flat().filter((t, i, a) => t.desc && a.findIndex(x => x.id === t.id) === i).sort((a, b) => b.plays - a.plays).slice(0, 40);
  const videos = (r.videos ?? []).filter(v => v.id).sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0));
  const g: Growth = {
    at: new Date().toISOString(), followers: val(ins['follower_num']), hours, slots: hours ? slotsFrom(hours) : undefined, audience,
    videos, searches, trends, analysis: {},
    views7: vv.slice(-7).reduce((s, x) => s + x, 0), followers7: fol.length > 7 ? fol[fol.length - 1]! - fol[fol.length - 8]! : undefined,
  };
  g.analysis = await analyse(g).catch(e => { console.warn('[tt-growth] analyse', e instanceof Error ? e.message : e); return {}; });
  return g;
}

const fmtVid = (v: Video) => `${(v.plays ?? 0).toLocaleString('fr-FR')} vues · ${v.likes ?? 0} j'aime · ${v.saves ?? 0} enregistr. · ${v.shares ?? 0} partages · ${Math.round((v.duration ?? 0) / 1000)} s · ${new Date(v.create_time * 1000).toLocaleDateString('fr-FR')} — « ${v.desc.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)} »`;

async function analyse(g: Growth): Promise<Analysis> {
  const system = `Tu es l'équipe marketing TikTok de FIK Conciergerie (location de voitures à Oran, livraison à l'aéroport, clientèle surtout diaspora algérienne en France). L'équipe : ${TEAM.join(' ; ')}. Vous êtes les meilleurs du métier. Vous travaillez UNIQUEMENT à partir des chiffres fournis. Inspiration ≠ copie : vous reprenez des MÉCANIQUES (structure, type de hook, rythme, format), jamais le texte, la musique ou la vidéo d'un autre. Règles FIK : jamais de prix, jamais de date précise, jamais la Belgique, vouvoiement, pas d'argot. Réponds UNIQUEMENT en JSON valide, en français.`;
  const user = `NOS VIDÉOS (triées par vues) :
${g.videos.slice(0, 15).map(fmtVid).join('\n')}

AUDIENCE : ${g.audience || 'inconnue'} · ${g.followers ?? '?'} abonnés · vues 7 derniers jours : ${g.views7 ?? '?'}
HEURES D'ACTIVITÉ (heure d'Oran, 0→23) : ${g.hours?.join(', ') ?? 'inconnues'}
CE QUE LES GENS TAPENT POUR NOUS TROUVER : ${g.searches.join(' | ') || '—'}

VIDÉOS TENDANCE « Véhicules » (France + monde) — inspiration :
${g.trends.slice(0, 30).map(t => `${t.plays.toLocaleString('fr-FR')} vues · @${t.author} — « ${t.desc.slice(0, 150)} »`).join('\n')}

Rends : {
 "summary": "3 phrases simples pour Kouider : où on en est et LA priorité",
 "winning_patterns": ["5 choses qui marchent CHEZ NOUS, chiffres à l'appui (ex. « sans caution + aéroport = nos 2 meilleures vidéos, 97 k et 71 k vues »)"],
 "hooks_bank": ["12 hooks de 2 à 7 mots, inspirés des mécaniques qui marchent (curiosité, POV diaspora, problème→solution), adaptés à FIK"],
 "formats": ["6 formats repris des tendances, adaptés à FIK, avec la mécanique expliquée en 1 phrase"],
 "ideas": [{"title":"…","hook":"…","format":"…","why":"pourquoi ça va marcher, avec un chiffre"}],
 "keywords": ["8 mots-clés de recherche à mettre dans la légende ET dans le texte à l'écran (SEO TikTok)"],
 "hashtags": ["8 hashtags"],
 "avoid": ["4 choses qui ne marchent pas chez nous, chiffres à l'appui"],
 "creators": [{"handle":"@… (pris dans les tendances, niche voiture/France)","why":"pourquoi une collab"}]
}
"ideas" = 5 idées.`;
  return await askJson<Analysis>(system, user, 3500);
}

/** Bloc injecté dans le brief de chaque pub (équipe data + trend scout). */
export async function growthContext(): Promise<string> {
  const g = await getGrowth();
  if (!g) return '';
  const a = g.analysis ?? {};
  const age = Math.round((Date.now() - Date.parse(g.at)) / 86_400_000);
  return [
    `📊 DONNÉES TIKTOK RÉELLES DE FIK (il y a ${age} j) — l'équipe s'en sert, elle n'invente pas :`,
    g.audience ? `• Public : ${g.audience}.` : '',
    g.videos[0] ? `• Nos 3 meilleures vidéos : ${g.videos.slice(0, 3).map(fmtVid).join(' | ')}` : '',
    a.winning_patterns?.length ? `• Ce qui marche chez nous : ${a.winning_patterns.join(' ; ')}` : '',
    a.avoid?.length ? `• À éviter : ${a.avoid.join(' ; ')}` : '',
    g.searches.length ? `• Mots tapés pour nous trouver (à mettre dans la légende ET à l'écran) : ${g.searches.slice(0, 8).join(', ')}` : '',
    a.keywords?.length ? `• Mots-clés SEO TikTok : ${a.keywords.join(', ')}` : '',
    a.hooks_bank?.length ? `• Banque de hooks (inspiration, à adapter) : ${a.hooks_bank.slice(0, 8).map(h => `« ${h} »`).join(' · ')}` : '',
    a.formats?.length ? `• Formats tendance à adapter (mécanique, jamais copie) : ${a.formats.slice(0, 4).join(' ; ')}` : '',
  ].filter(Boolean).join('\n');
}

/** Créneaux appris (heure d'Oran) pour bestPostSlots — null tant qu'on n'a pas de données. */
export async function learnedSlots(): Promise<Record<number, Array<{ h: number; m: number; prime: boolean; why: string }>> | null> {
  const g = await getGrowth();
  if (!g?.slots?.length) return null;
  const out: Record<number, Array<{ h: number; m: number; prime: boolean; why: string }>> = {};
  for (const s of g.slots) (out[s.day] ??= []).push({ h: s.h, m: s.m, prime: s.prime, why: s.why });
  for (const d of Object.keys(out)) out[Number(d)]!.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  return out;
}

/** RÉUNION DE L'ÉQUIPE TIKTOK (dimanche 18h, ou « réunion TikTok ») : chiffres, plan de la semaine, idées → Telegram + bouton « crée la 1re vidéo ». */
export async function weeklyMeeting(refresh = true): Promise<string> {
  let g: Growth | string | null = refresh ? await refreshGrowth() : await getGrowth();
  if (typeof g === 'string' || !g) {
    const old = await getGrowth();
    if (!old) return `❌ Réunion TikTok impossible : ${typeof g === 'string' ? g : 'pas encore de données'}.`;
    g = old;
  }
  const a = g.analysis ?? {};
  const { listWaDemandes, WA_CLOSED } = await import('../integrations/wa-demandes.js');
  const tt = (await listWaDemandes('tiktok')).filter(d => !WA_CLOSED.has(d.status));
  const best = g.slots?.filter(s => s.prime)[0];
  const lines = [
    `🎬 RÉUNION DE TON ÉQUIPE TIKTOK`,
    '',
    `📊 Data Analyst : ${g.followers ?? '?'} abonnés${g.followers7 !== undefined ? ` (${g.followers7 >= 0 ? '+' : ''}${g.followers7} cette semaine)` : ''} · ${g.views7 ?? '?'} vues en 7 jours.`,
    g.videos[0] ? `   Ta meilleure vidéo : ${fmtVid(g.videos[0])}` : '',
    g.audience ? `   Ton public : ${g.audience}.` : '',
    '',
    a.summary ? `🧭 CMO : ${a.summary}` : '',
    a.winning_patterns?.length ? `\n✅ Ce qui marche chez nous :\n${a.winning_patterns.slice(0, 4).map(x => `• ${x}`).join('\n')}` : '',
    a.avoid?.length ? `\n⛔ À arrêter :\n${a.avoid.slice(0, 3).map(x => `• ${x}`).join('\n')}` : '',
    best ? `\n⏰ Head of Social Media : poste vers ${best.h}h${String(best.m).padStart(2, '0')} (heure d'Oran = heure de France) — ${best.why}.` : '',
    a.ideas?.length ? `\n💡 Creative Director — les vidéos de la semaine :\n${a.ideas.slice(0, 3).map((i, n) => `${n + 1}. ${i.title} — hook « ${i.hook} » (${i.format}). ${i.why}`).join('\n')}` : '',
    a.keywords?.length ? `\n🔎 SEO : mets ces mots dans tes légendes et à l'écran : ${a.keywords.slice(0, 6).join(', ')}.` : '',
    `\n💬 Community Manager : ${tt.length ? `${tt.length} message(s) / commentaire(s) TikTok attendent une réponse (page DEMANDES → 🎵 TikTok).` : 'aucun message TikTok en attente 👍'} Réponds dans la 1re heure après chaque post.`,
    a.creators?.length ? `\n🤝 Influencer Manager : créateurs à contacter pour une collab : ${a.creators.slice(0, 3).map(c => `${c.handle} (${c.why})`).join(' · ')}.` : '',
  ].filter(x => x !== '').join('\n');
  await queueTelegramMessage(lines.slice(0, 3900), undefined, 'kouider', undefined, true).catch(() => {});
  const idea = a.ideas?.[0];
  if (idea) {
    const { createDecision } = await import('../integrations/conscience.js');
    await createDecision(`🎬 L'équipe propose de créer la vidéo n°1 : « ${idea.title} » (hook « ${idea.hook} »).`, [
      { label: '🎬 Oui, crée-la', tool: 'video_studio', input: { action: 'pub_tiktok', idea: `${idea.title}. Hook : « ${idea.hook} ». Format : ${idea.format}. ${idea.why}` } },
      { label: 'Pas cette semaine', say: 'OK, je garde les idées pour plus tard.' },
    ]).catch(() => {});
  }
  return lines;
}

/** Outil equipe_tiktok : reunion | stats | idees | actualiser */
export async function teamTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'reunion');
  if (a === 'reunion') return weeklyMeeting(input['refresh'] !== false);
  if (a === 'actualiser') { const g = await refreshGrowth(); return typeof g === 'string' ? `❌ ${g}` : `✅ Stats TikTok mises à jour : ${g.followers} abonnés, ${g.videos.length} vidéos analysées, ${g.trends.length} vidéos tendance étudiées.`; }
  const g = await getGrowth();
  if (!g) return 'Pas encore de stats TikTok : dis « actualise les stats TikTok » (1-2 min).';
  if (a === 'idees') {
    const x = g.analysis ?? {};
    return [`💡 Idées de l'équipe :`, ...(x.ideas ?? []).map((i, n) => `${n + 1}. ${i.title} — hook « ${i.hook} » (${i.format}) : ${i.why}`),
      x.hooks_bank?.length ? `\nHooks : ${x.hooks_bank.map(h => `« ${h} »`).join(' · ')}` : ''].join('\n');
  }
  return await growthContext();
}

/** Job quotidien 4h30 : stats fraîches pour les pubs du jour ; dimanche 18h : réunion. */
export async function jobGrowthRefresh(): Promise<void> { await refreshGrowth().catch(e => console.warn('[tt-growth]', e)); }
export async function jobWeeklyMeeting(): Promise<void> { await weeklyMeeting(true).catch(e => console.warn('[tt-growth] réunion', e)); }
