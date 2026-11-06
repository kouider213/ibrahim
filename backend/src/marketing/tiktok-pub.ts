/**
 * tiktok-pub.ts — PUB TIKTOK COMPLÈTE, prête à poster (06/11, demande de Kouider)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Je veux qu'il me crée une vidéo complète : le début en motion design, ensuite nos véhicules,
 *   pour que je la partage directement sur TikTok. Il doit choisir le meilleur hook, la meilleure
 *   heure… le meilleur community manager, monteur et réalisateur. »
 *
 * Réalisateur (IA)  : hook + 2 hooks de secours, texte motion design tiré de SON message, voitures, CTA.
 * Monteur (ffmpeg)  : 0-1,6 s HOOK = le moment le plus fort des plans voitures (mesuré, pas deviné)
 *                     → intro motion design fond noir (typo animée, mots-clés dorés) synchronisée sur la voix
 *                     → les voitures (vraie photo → Kling, nom + atout) → CTA → signature FIK.
 *                     Textes dans la zone sûre TikTok (pas sous la légende ni sous les boutons à droite).
 *                     Musique IA baissée automatiquement quand la voix parle.
 * Community manager : légende, hashtags, commentaire à épingler, réponses types, miniature,
 *                     meilleur créneau (+ rappel Telegram à l'heure), conseils pour la 1re heure.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

import { supabase } from '../integrations/supabase.js';
import { askJson } from '../integrations/pro-doc.js';
import { synthesizeVoice, synthesizeVoiceGemini, synthesizeVoiceFree } from '../notifications/dispatcher.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { emitProactive } from '../notifications/mobile-push.js';
import {
  STUDIO_MODELS, STUDIO_CAMERAS, bestModel, falRun, shotInput, describeSubject, freeShot, markFalEmpty,
  run, probe, ensureFonts, FONT_DIR, assTime, assText, appendOutro, saveJob, launchJob, addSpent,
  type ModelId, type StudioJob, type StudioShot,
} from './video-studio.js';

const W = 1080, H = 1920, FPS = 30;
const GOLD = '&H37AFD4&';                       // #D4AF37 (ASS = BGR)
const HOOK_S = 1.6, CAR_S = 3.2, CTA_S = 2.4;
const MUSIC_MODEL = 'CassetteAI/music-generator';
const DEFAULT_CARS = ['Clio 5 Alpine', 'Mercedes CLS', 'Jumpy 9 Places'];

interface Car { name: string; url: string; category: string }
interface PubPlan {
  title: string; hook: string; alt_hooks: string[]; lines: Array<{ text: string; gold: string[] }>;
  voice_intro: string; voice_cars: string; cta: string; cta_sub: string;
  /** Scènes IA : 1 à 3 voitures de la flotte placées dans un VRAI décor, puis animées (elles roulent). */
  scenes: Array<{ cars: string[]; label: string; scene: string; action: string; camera: string }>;
  music_prompt: string; caption: string; hashtags: string[]; pinned_comment: string; replies: string[];
  cover_text: string; tips: string[];
  /** Angle créatif choisi par l'équipe (id de ANGLES) + décisions expliquées à Kouider. */
  angle: string; team_notes: string[];
}

// ─── Meilleur créneau (public : Oran / Algérie + diaspora en France) ─────────

/** Habitudes TikTok en Algérie : soirée 20h-22h, week-end jeudi soir → samedi, vendredi après la prière.
 *  Heures en heure d'Algérie (UTC+1 toute l'année). Ajuster avec ses vraies stats après quelques posts. */
const SLOTS: Record<number, Array<{ h: number; m: number; prime: boolean; why: string }>> = {
  0: [{ h: 12, m: 30, prime: false, why: 'pause de midi' }, { h: 20, m: 30, prime: true, why: 'soirée, tout le monde scrolle' }],
  1: [{ h: 12, m: 30, prime: false, why: 'pause de midi' }, { h: 20, m: 30, prime: true, why: 'soirée, tout le monde scrolle' }],
  2: [{ h: 12, m: 30, prime: false, why: 'pause de midi' }, { h: 20, m: 30, prime: true, why: 'soirée, tout le monde scrolle' }],
  3: [{ h: 12, m: 30, prime: false, why: 'pause de midi' }, { h: 20, m: 30, prime: true, why: 'soirée, tout le monde scrolle' }],
  4: [{ h: 13, m: 0, prime: false, why: 'fin de semaine' }, { h: 21, m: 0, prime: true, why: 'jeudi soir = début du week-end en Algérie, le meilleur moment de la semaine' }],
  5: [{ h: 15, m: 0, prime: false, why: 'après la prière du vendredi' }, { h: 21, m: 0, prime: true, why: 'vendredi soir, week-end' }],
  6: [{ h: 11, m: 0, prime: false, why: 'samedi matin, week-end' }, { h: 20, m: 30, prime: true, why: 'samedi soir, dernier soir du week-end' }],
};
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function bestPostSlots(now = new Date(), minLeadMin = 40): Array<{ at: Date; label: string; prime: boolean; why: string }> {
  const out: Array<{ at: Date; label: string; prime: boolean; why: string }> = [];
  const alg = new Date(now.getTime() + 3600_000);           // « horloge » d'Alger lue en UTC
  for (let d = 0; d < 4 && out.length < 4; d++) {
    const day = new Date(Date.UTC(alg.getUTCFullYear(), alg.getUTCMonth(), alg.getUTCDate() + d));
    for (const s of SLOTS[day.getUTCDay()]!) {
      const at = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), s.h, s.m) - 3600_000);
      if (at.getTime() < now.getTime() + minLeadMin * 60_000) continue;
      const be = at.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' });
      const dz = `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`;
      const dayLbl = d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : DAYS[day.getUTCDay()]!;
      out.push({ at, prime: s.prime, why: s.why, label: `${dayLbl} à ${dz.replace(':', 'h')} (heure d'Oran${be !== dz ? `, ${be.replace(':', 'h')} chez toi` : ', même heure chez toi'})` });
    }
  }
  return out;
}

// ─── Réalisateur ──────────────────────────────────────────────

export async function fleet(): Promise<Car[]> {
  const { data } = await supabase.from('cars').select('name, image_url, category, available').eq('available', true);
  return ((data ?? []) as Array<{ name: string; image_url: string | null; category: string | null }>)
    .filter(c => c.image_url).map(c => ({ name: c.name, url: c.image_url!, category: c.category ?? '' }));
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function findCar(all: Car[], name: string): Car | undefined {
  const n = norm(name.replace(/\s*\[[^\]]*\]\s*$/, ''));   // le réalisateur recopie « [premium] » de la liste
  if (!n) return undefined;
  return all.find(c => norm(c.name) === n) ?? all.find(c => norm(c.name).includes(n) || n.includes(norm(c.name)));
}

export async function direct(message: string, cars: Car[], wanted: string[], seconds: number, brief?: TeamBrief): Promise<PubPlan> {
  const system = `Tu es à la fois le meilleur réalisateur de pubs TikTok, le meilleur monteur motion design et le meilleur community manager du marché algérien (location de voitures, Oran).
Tu réponds UNIQUEMENT avec un JSON valide, sans texte autour.`;
  const user = `Entreprise : FIK Conciergerie — location de voitures à Oran (Algérie), clients locaux et diaspora (France).
${message ? `Message de Kouider (le patron), à transformer en pub — corrige l'orthographe, garde SON sens et ses mots forts :
« ${message} »` : 'Kouider n\'a pas donné de texte : PUB LIBRE, c\'est l\'équipe qui décide du message (donner envie de louer chez FIK, en suivant l\'angle et le moment ci-dessous).'}
${brief ? `\n${brief.text}\n` : ''}
Voitures disponibles (avec vraie photo) : ${cars.map(c => `${c.name} [${c.category}]`).join(' · ')}
${wanted.length ? `Voitures imposées par Kouider : ${wanted.join(', ')}.` : 'Choisis 3 voitures qui se complètent (une sportive/premium, une prestige, une familiale ou SUV).'}
Durée totale visée : ${seconds} s (hook 1,6 s + intro motion design + scènes vidéo IA ${CAR_S} s chacune + CTA ${CTA_S} s).

Rends ce JSON :
{
 "title": "titre court",
 "hook": "texte écran des 1,6 premières secondes : 2 à 5 mots, MAJUSCULES, choc ou curiosité (c'est lui qui empêche le swipe)",
 "alt_hooks": ["2 autres hooks à tester sur un 2e post"],
 "lines": [ { "text": "ligne du motion design, 2 à 6 mots", "gold": ["1 ou 2 mots-clés de la ligne à mettre en doré"] } ],
 "voice_intro": "voix off pendant le motion design : dit les lignes ci-dessus, naturel, fluide",
 "voice_cars": "une phrase courte dite pendant les voitures, qui donne envie (≤ 14 mots)",
 "cta": "appel à l'action, 2 à 4 mots, MAJUSCULES",
 "cta_sub": "sous-ligne du CTA, ex. « Oran · WhatsApp · 7j/7 »",
 "scenes": [ { "cars": ["nom(s) EXACT(s) de la liste : 1 voiture, ou 2-3 voitures ensemble"], "label": "texte écran 2 à 4 mots MAJUSCULES (atout / nom de la gamme)", "scene": "décor en ANGLAIS où on PLACE la/les voiture(s) : lieu précis, heure, lumière, météo, ambiance (ex. Oran seafront corniche at golden hour, Mediterranean sea, palm trees, wet asphalt reflections)", "action": "ce qui se passe en ANGLAIS, la voiture BOUGE vraiment : roule vers la caméra, convoi, virage, phares qui s'allument, freinage… + mouvement caméra (tracking, low angle…), réaliste", "camera": "une valeur parmi : travelling, low_angle, dolly_in, slowmo, handheld, drone" } ],
 "music_prompt": "musique en anglais : ambiance comeback, cinématique puis rythmée, sans voix, tempo",
 "caption": "légende TikTok (sans hashtags) : 1 phrase qui donne envie + question qui fait commenter",
 "hashtags": ["8 hashtags : 3 gros (#fyp…), 3 locaux (#oran #algerie…), 2 de niche (#locationvoiture…)"],
 "pinned_comment": "commentaire à épingler sous la vidéo (relance, question ou info réservation)",
 "replies": ["3 réponses types aux commentaires probables (prix ? dispo ? où ?) — sans jamais donner de prix ni de date"],
 "cover_text": "texte de la miniature, 2 à 4 mots",
 "tips": ["5 conseils concrets pour CE post (1re heure, son tendance, répondre aux commentaires…), adaptés à TikTok Algérie"]
}
Règles :
- 3 à 5 lignes de motion design qui suivent SON message dans son ordre (ou l'angle si pub libre). Phrases très courtes, une idée par ligne.
- Ton pro et chaleureux, vouvoiement, AUCUN argot (jamais « frérot », « wesh », « la famille »…). « Inshallah » autorisé UNE fois si Kouider l'a écrit.
- Jamais de prix, jamais de date, jamais de ville belge.
- 4 scènes (3 à 5) qui ont le potentiel de devenir VIRALES : décors spectaculaires et réels d'Oran/Algérie (corniche au coucher du soleil, front de mer de nuit avec les lumières de la ville, route de Santa Cruz en lacets au-dessus de la mer, port, route du désert…), variés d'une scène à l'autre.
- AU MOINS une scène avec 2 ou 3 voitures ensemble (convoi, alignées, qui arrivent l'une après l'autre) : c'est la flotte FIK.
- La scène la plus spectaculaire en PREMIER (elle sert au hook). Chaque voiture apparaît au moins une fois. Noms EXACTS de la liste.
- Réalisme : pas de cascade impossible, pas de vol, pas de personnes en gros plan ; la voiture garde exactement sa forme et sa couleur.`;
  const raw = await askJson<Partial<PubPlan>>(system, user, 2500);
  return shapePlan(raw);
}

/** Nettoie / borne un plan rendu par une IA (réalisateur ou comité). */
export function shapePlan(raw: Partial<PubPlan>): PubPlan {
  const lines = (raw.lines ?? []).map(l => ({ text: String(l?.text ?? '').trim().slice(0, 60), gold: (l?.gold ?? []).map(String).slice(0, 2) })).filter(l => l.text).slice(0, 5);
  if (!lines.length) throw new Error('le réalisateur IA n\'a pas rendu de texte — réessaie dans une minute');
  return {
    title: String(raw.title ?? 'Pub TikTok FIK').slice(0, 80), hook: String(raw.hook ?? 'FIK EST DE RETOUR').slice(0, 50),
    alt_hooks: (raw.alt_hooks ?? []).map(String).slice(0, 2), lines,
    voice_intro: String(raw.voice_intro ?? lines.map(l => l.text).join('. ')).slice(0, 600), voice_cars: String(raw.voice_cars ?? '').slice(0, 160),
    cta: String(raw.cta ?? 'RÉSERVEZ SUR WHATSAPP').slice(0, 40), cta_sub: String(raw.cta_sub ?? 'FIK Conciergerie · Oran').slice(0, 60),
    scenes: (raw.scenes ?? []).map(c => ({ cars: (Array.isArray(c?.cars) ? c.cars : [c?.cars]).map(String).filter(Boolean).slice(0, 3), label: String(c?.label ?? '').slice(0, 40),
      scene: String(c?.scene ?? '').slice(0, 500), action: String(c?.action ?? '').slice(0, 500), camera: STUDIO_CAMERAS[String(c?.camera)] ? String(c?.camera) : 'travelling' })).filter(c => c.cars.length).slice(0, 5),
    music_prompt: String(raw.music_prompt ?? 'dark cinematic intro building into energetic modern trap beat, 100 bpm, no vocals').slice(0, 300),
    caption: String(raw.caption ?? '').slice(0, 300), hashtags: (raw.hashtags ?? []).map(h => `#${String(h).replace(/^#/, '').replace(/\s+/g, '')}`).slice(0, 10),
    pinned_comment: String(raw.pinned_comment ?? '').slice(0, 300), replies: (raw.replies ?? []).map(String).slice(0, 3),
    cover_text: String(raw.cover_text ?? raw.hook ?? '').slice(0, 40), tips: (raw.tips ?? []).map(String).slice(0, 6),
    angle: String(raw.angle ?? '').slice(0, 40), team_notes: (Array.isArray(raw.team_notes) ? raw.team_notes : []).map(String).map(x => x.slice(0, 220)).slice(0, 6),
  };
}

// ─── L'ÉQUIPE (producteur + stratège + comité de relecture) ───────────────────
// « À chaque fois une NOUVELLE pub, avec une vraie équipe derrière » (Kouider 06/11) :
//  • le producteur lit les DONNÉES (voitures qui dorment, pubs déjà faites, moment de l'année)
//  • le stratège choisit un ANGLE jamais utilisé récemment
//  • le réalisateur écrit, puis le COMITÉ (stratège viral, monteur, CM, directeur artistique, voix off) note et corrige.

const HISTORY_KEY = 'pub:history';
export interface PubMemo { at: string; title: string; angle: string; hook: string; cars: string[]; decors: string[]; brief: string }

export async function pubHistory(): Promise<PubMemo[]> {
  const { kvGet } = await import('../integrations/app-store.js');
  try { return JSON.parse((await kvGet(HISTORY_KEY)) ?? '[]') as PubMemo[]; } catch { return []; }
}
async function remember(m: PubMemo): Promise<void> {
  const { kvGet, kvSet } = await import('../integrations/app-store.js');
  let h: PubMemo[] = [];
  try { h = JSON.parse((await kvGet(HISTORY_KEY)) ?? '[]') as PubMemo[]; } catch { /* vide */ }
  await kvSet(HISTORY_KEY, JSON.stringify([m, ...h].slice(0, 20))).catch(() => {});
}

/** Angles qui marchent sur TikTok, réalisables avec nos scènes IA (voitures dans un décor, qui roulent). */
export const ANGLES: Array<{ id: string; name: string; how: string }> = [
  { id: 'histoire', name: 'Storytelling de marque', how: 'message du patron en motion design (retour, merci, promesse), puis la flotte en action' },
  { id: 'pov_diaspora', name: 'POV diaspora', how: '« POV : tu atterris à Oran et ta voiture t\'attend » — aéroport Es Sénia, route vers la corniche, arrivée famille' },
  { id: 'convoi', name: 'Le convoi FIK', how: 'toute la flotte qui roule ensemble (convoi de mariage, sortie de nuit), plans larges puis détails' },
  { id: '3_moments', name: '3 voitures pour 3 moments', how: 'une voiture = une occasion : mariage (prestige), famille (grand volume), affaires/sortie (sportive)' },
  { id: 'oran_nuit', name: 'Oran by night', how: 'ambiance nocturne : front de mer illuminé, Santa Cruz éclairée, reflets sur bitume mouillé, phares' },
  { id: 'devine', name: 'Devine la voiture', how: 'hook « Devine laquelle tu prends ce week-end » : silhouettes / détails (phares, jantes) puis révélation' },
  { id: 'roadtrip', name: 'Road trip Algérie', how: 'Oran → Santa Cruz → Les Andalouses → route du désert : liberté, grands espaces' },
  { id: 'luxe', name: 'Le luxe accessible', how: 'plans lents très premium sur la voiture de prestige, lumière dorée, détails chromés, calme' },
];

/** Moment de l'année vu d'Oran (dates islamiques ≈, à ±1 jour). */
export function momentOfYear(now = new Date()): { label: string; hints: string[] } {
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const y = now.getUTCFullYear();
  const dow = new Date(now.getTime() + 3600_000).getUTCDay();
  const hints: string[] = [];
  const ev: Array<[number, number, string, string]> = [   // [début MMJJ, fin MMJJ, nom, conseil]
    [1025, 1105, 'Fête de la Révolution (1er novembre)', 'fierté algérienne, drapeau discret possible'],
    [1106, 1218, 'Avant les vacances de Noël en France', 'la diaspora réserve MAINTENANT pour fin décembre : « réservez avant d\'atterrir »'],
    [1219, 1231, 'Vacances de Noël — la diaspora arrive', 'arrivées aéroport, retrouvailles famille, fêtes de fin d\'année'],
    [101, 108, 'Nouvel an / fin des vacances', 'nouvelle année, nouveaux départs'],
    [109, 114, 'Yennayer (12 janvier)', 'fête berbère, tradition'],
  ];
  if (y === 2027) ev.push([125, 207, 'Avant le Ramadan (≈ 8 février 2027)', 'préparer le mois : voitures familiales pour les courses et les visites'],
    [208, 309, 'Ramadan (≈ 8 fév → 9 mars 2027)', 'poster APRÈS le ftour (21h-23h), ton doux, famille, soirées'],
    [310, 316, 'Aïd el-Fitr (≈ 10 mars 2027)', 'visites familiales, grande voiture, élégance'],
    [505, 520, 'Aïd el-Adha (≈ 16 mai 2027)', 'retour au bled, famille, grands volumes']);
  ev.push([601, 630, 'Début de la saison des mariages', 'voiture de mariage, convoi, prestige'],
    [701, 831, 'Été — diaspora + mariages + plages', 'Les Andalouses, corniche, convois de mariage, aéroport'], [702, 706, 'Fête de l\'Indépendance (5 juillet)', 'fierté, Algérie'],
    [901, 920, 'Rentrée', 'dernier mariages, retour des vacances']);
  let label = 'Période normale';
  for (const [a, b, n, h] of ev) if (md >= a && md <= b) { label = n; hints.push(h); }
  hints.push(dow >= 4 && dow <= 6 ? 'on est dans le week-end algérien (jeudi soir → samedi) : sorties, mariages' : 'semaine : déplacements pro, aéroport, préparer le week-end qui arrive');
  return { label, hints };
}

export interface TeamBrief { angle: (typeof ANGLES)[number]; push: Array<{ name: string; why: string }>; moment: ReturnType<typeof momentOfYear>; history: PubMemo[]; text: string }

/** Le producteur : données réelles → voitures à pousser, angle neuf, moment, pubs déjà faites. */
export async function teamBrief(all: Car[], message: string): Promise<TeamBrief> {
  const history = await pubHistory();
  const moment = momentOfYear();
  // voitures qui dorment le plus (dernière location terminée) et les moins vues dans nos pubs
  const push: Array<{ name: string; why: string; score: number }> = [];
  try {
    const { data: cars } = await supabase.from('cars').select('id, name').eq('available', true);
    const { data: bk } = await supabase.from('bookings').select('car_id, start_date, end_date, status').in('status', ['CONFIRMED', 'COMPLETED', 'ACTIVE']);
    const today = new Date().toISOString().slice(0, 10);
    const in21 = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    for (const c of (cars ?? []) as Array<{ id: string; name: string }>) {
      if (!all.some(x => x.name === c.name)) continue;
      const mine = ((bk ?? []) as Array<{ car_id: string; start_date: string; end_date: string }>).filter(b => b.car_id === c.id);
      const booked = mine.filter(b => b.end_date >= today && b.start_date <= in21).length;
      const lastEnd = mine.map(b => b.end_date).filter(d => d <= today).sort().pop();
      const idle = lastEnd ? Math.round((Date.parse(today) - Date.parse(lastEnd)) / 86_400_000) : 99;
      const seen = history.slice(0, 6).filter(h => h.cars.some(n => norm(n) === norm(c.name))).length;
      push.push({ name: c.name, score: (booked ? -40 : 20) + Math.min(idle, 60) - seen * 15,
        why: `${booked ? 'déjà réservée dans les 3 semaines' : 'aucune réservation dans les 3 prochaines semaines'}, ${idle >= 99 ? 'aucune location enregistrée' : `dernière location il y a ${idle} j`}${seen ? `, vue dans ${seen} pub(s) récente(s)` : ', pas encore mise en avant en pub'}` });
    }
  } catch (e) { console.warn('[pub] producteur :', e instanceof Error ? e.message : e); }
  push.sort((a, b) => b.score - a.score);
  const used = history.slice(0, 3).map(h => h.angle);
  const t = norm(message);
  const asked = ANGLES.find(a => (a.id === 'pov_diaspora' && /\b(pov|diaspora|aeroport|atterri)/.test(t)) || (a.id === 'convoi' && /\b(convoi|flotte|mariage)/.test(t))
    || (a.id === 'oran_nuit' && /\b(nuit|soir)\b/.test(t)) || (a.id === 'devine' && /\bdevine/.test(t)) || (a.id === 'roadtrip' && /\b(road ?trip|desert|voyage)/.test(t))
    || (a.id === 'histoire' && /\b(retour|excuse|desole|merci|absence|annonce)/.test(t)));
  const fresh = ANGLES.filter(a => !used.includes(a.id));
  const angle = asked ?? fresh[Math.floor(Math.random() * fresh.length)] ?? ANGLES[0]!;
  const top = push.slice(0, 3);
  const text = [
    `ANGLE CRÉATIF imposé par le stratège : « ${angle.name} » — ${angle.how}.`,
    `MOMENT : ${moment.label} — ${moment.hints.join(' ; ')}.`,
    top.length ? `VOITURES À POUSSER (données réelles des réservations) : ${top.map(p => `${p.name} (${p.why})`).join(' · ')}. Mets-les en avant, au moins la 1re.` : '',
    history.length ? `PUBS DÉJÀ FAITES (NE RÉPÈTE NI le hook, NI les décors, NI la structure) :
${history.slice(0, 6).map(h => `- ${h.at.slice(0, 10)} « ${h.title} » angle ${h.angle} · hook « ${h.hook} » · décors : ${h.decors.join(' / ').slice(0, 160)}`).join('\n')}` : 'Première pub de la série.',
  ].filter(Boolean).join('\n');
  return { angle, push: top, moment, history, text };
}

/** Le comité de relecture : note la pub comme une équipe d'agence et rend la version corrigée. */
export async function review(plan: PubPlan, brief: TeamBrief, message: string): Promise<{ plan: PubPlan; scores: Record<string, number>; verdict: string }> {
  const system = `Tu es le COMITÉ de relecture d'une agence TikTok qui fait des vidéos virales en Algérie : un stratège viral, un monteur, un community manager, un directeur artistique et un comédien voix off. Tu réponds UNIQUEMENT avec un JSON valide.`;
  const user = `Brief de l'équipe :
${brief.text}

Message du patron : « ${message || '(aucun — pub libre, l\'équipe décide)'} »

Projet du réalisateur :
${JSON.stringify(plan)}

Note chaque point sur 10 puis CORRIGE tout ce qui est sous 8 :
- hook : arrête-t-il le scroll en moins d'1 seconde (curiosité, choc, POV, question) ? 2 à 5 mots.
- retention : enchaînement sans temps mort (scène la plus forte en 1er, phrases courtes, chaque plan apporte du neuf, payoff à la fin) ?
- originalite : différent des pubs déjà faites (hook, décors, structure) ?
- visuel : décors réels d'Oran spectaculaires et variés, actions réalistes où les voitures BOUGENT, au moins une scène multi-voitures ?
- voix : texte de voix off écrit pour être DIT (rythme, respiration, ≤ 2,5 mots/s, chaleureux, vouvoiement, zéro argot) ?
- cta : clair, une seule action (WhatsApp) ?
- cm : légende qui fait commenter, hashtags pertinents, commentaire épinglé utile ?
Règles inchangées : jamais de prix, jamais de date, jamais de Belgique, noms de voitures EXACTS.
Rends : { "scores": {"hook":0,"retention":0,"originalite":0,"visuel":0,"voix":0,"cta":0,"cm":0}, "verdict": "1 phrase", "plan": { …le projet COMPLET corrigé, MÊMES clés, + "angle": "${brief.angle.id}", + "team_notes": ["3 à 5 décisions expliquées simplement au patron : pourquoi ce hook, pourquoi cette voiture, pourquoi cet ordre, ce qui a été coupé"] } }`;
  try {
    const r = await askJson<{ scores?: Record<string, number>; verdict?: string; plan?: Partial<PubPlan> }>(system, user, 3500);
    const fixed = r.plan ? shapePlan({ ...plan, ...r.plan }) : plan;
    if (!fixed.scenes.length) fixed.scenes = plan.scenes;
    return { plan: fixed, scores: r.scores ?? {}, verdict: String(r.verdict ?? '').slice(0, 240) };
  } catch (e) {
    console.warn('[pub] comité :', e instanceof Error ? e.message : e);
    return { plan, scores: {}, verdict: '' };
  }
}

// ─── Monteur ──────────────────────────────────────────────────

function assHeader(): string[] {
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Zone sûre TikTok : marge droite 170 (boutons), bas 520 (légende), haut 300 (onglets)
    'Style: Kin,Montserrat Black,104,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,5,90,170,0,1',
    'Style: Hook,Montserrat Black,118,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,8,6,5,90,170,0,1',
    'Style: CarName,Montserrat Black,58,&H0037AFD4,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,6,0,1,4,3,1,90,170,640,1',
    'Style: CarLbl,Montserrat Black,86,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,6,4,1,90,170,540,1',
    'Style: Cta,Montserrat Black,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,90,170,0,1',
    'Style: Small,Montserrat Black,40,&H30FFFFFF,&H30FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,10,0,1,0,0,5,90,170,0,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
}
const ev = (l: string[], s: number, e: number, style: string, text: string, layer = 0) =>
  l.push(`Dialogue: ${layer},${assTime(Math.max(0, s))},${assTime(Math.max(s + 0.05, e))},${style},,0,0,0,,${text}`);
const gold = (text: string, words: string[]) => {
  let t = assText(text.toUpperCase());
  for (const w of words.filter(Boolean)) {
    const W2 = assText(w.toUpperCase()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|\\s)(${W2})(?=$|[\\s.,!?…])`), `$1{\\c${GOLD}}$2{\\c&HFFFFFF&}`);
  }
  return t;
};
const goldBar = (x: number, y: number, w: number, delayMs: number) =>
  `{\\an7\\pos(${x},${y})\\p1\\c${GOLD}\\bord0\\shad0\\fscx0\\t(${delayMs},${delayMs + 350},\\fscx100)}m 0 0 l ${w} 0 l ${w} 7 l 0 7{\\p0}`;
const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-maxrate', '9M', '-bufsize', '18M', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
/** Limite Supabase + Telegram = 50 Mo : au-dessus de 45 Mo on ré-encode au débit qui tient dans ~38 Mo. */
export async function fitSize(dir: string, file: string, dur: number, maxMb = 45): Promise<string> {
  const size = (await fs.stat(file)).size;
  if (size <= maxMb * 1e6) return file;
  const kbps = Math.max(2500, Math.floor((38e6 * 8) / Math.max(dur, 1) / 1000) - 220);
  const out = path.join(dir, 'final-small.mp4');
  await run(['-i', file, '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.3)}k`, '-bufsize', `${kbps * 2}k`,
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '160k', out]);
  console.log(`[pub] vidéo ${(size / 1e6).toFixed(1)} Mo → ${((await fs.stat(out)).size / 1e6).toFixed(1)} Mo`);
  return out;
}
const FIT = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`;
/** Étalonnage « pub premium » : plus de contraste, noirs profonds, vignette → raccord avec le motion design noir. */
const GRADE = 'eq=contrast=1.14:brightness=-0.035:saturation=1.08,vignette=angle=PI/4.2';

/** Le moment le plus « fort » d'un plan (là où ça bouge le plus), pour les 1,6 premières secondes. */
export async function strongestWindow(file: string, win: number): Promise<{ start: number; score: number }> {
  const log = await run(['-i', file, '-vf', "scale=180:320,select='gte(scene,0)',metadata=print", '-an', '-f', 'null', '-']).catch(e => String(e));
  const pts: Array<[number, number]> = [];
  let t = -1;
  for (const line of log.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(line); if (m) t = Number(m[1]);
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line); if (s && t >= 0) pts.push([t, Number(s[1])]);
  }
  const dur = (await probe(file)).duration || 5;
  let best = { start: Math.min(1, Math.max(0, dur - win)), score: 0 };
  for (let st = 0.5; st + win <= dur - 0.1; st += 0.1) {
    const sc = pts.filter(([x]) => x >= st && x < st + win).reduce((a, [, v]) => a + v, 0);
    if (sc > best.score) best = { start: st, score: sc };
  }
  return best;
}

async function tts(text: string, myVoice: boolean): Promise<Buffer | null> {
  if (!text.trim()) return null;
  if (myVoice) {
    try { const { speakAsKouider } = await import('../integrations/my-voice.js'); return await speakAsKouider(text, 'fr'); }
    catch (e) { console.warn('[pub] ma voix indisponible → voix studio :', e instanceof Error ? e.message : e); }
  }
  return (await synthesizeVoice(text).catch(() => null)) ?? (await synthesizeVoiceGemini(text).catch(() => null)) ?? (await synthesizeVoiceFree(text).catch(() => null));
}

async function writeAudio(dir: string, name: string, buf: Buffer | null): Promise<{ file: string; dur: number } | null> {
  if (!buf) return null;
  const f = path.join(dir, `${name}.${buf.subarray(0, 4).toString() === 'RIFF' ? 'wav' : 'mp3'}`);
  await fs.writeFile(f, buf);
  const dur = (await probe(f)).duration;
  return dur > 0 ? { file: f, dur } : null;
}

/** Montage complet (hook → motion design → voitures → CTA → signature) + mixage + miniature. Exporté pour le banc de test. */
export async function buildPubVideo(o: {
  dir: string; plan: PubPlan; ok: Array<{ car: Car; file: string; label: string }>; wins: Array<{ start: number; score: number }>; hi: number;
  vIntro: { file: string; dur: number } | null; vCars: { file: string; dur: number } | null; musicFile: string | null;
}): Promise<{ final: string; finalDur: number; cover: string }> {
  const { dir, plan, ok, wins, hi, vIntro, vCars, musicFile } = o;
  await ensureFonts();
    const segs: string[] = [];
    const seg = async (name: string, args: string[]) => { const f = path.join(dir, `${name}.mp4`); await run([...args, '-an', ...ENC, f]); segs.push(f); };

    // 3a. HOOK : plan le plus fort + punch-in + flash + texte qui claque
    {
      const a = assHeader();
      ev(a, 0, HOOK_S, 'Hook', `{\\an5\\pos(500,860)\\fscx165\\fscy165\\t(0,160,\\fscx100\\fscy100)}${assText(plan.hook.toUpperCase())}`);
      const f = path.join(dir, 'hook.ass'); await fs.writeFile(f, a.join('\n') + '\n');
      await seg('s0', ['-ss', wins[hi]!.start.toFixed(2), '-t', String(HOOK_S), '-i', ok[hi]!.file, '-vf',
        `${FIT},${GRADE},zoompan=z='1.12-0.08*on/${HOOK_S * FPS}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},` +
        `eq=brightness='if(lt(t,0.12),0.35*(1-t/0.12),0)':eval=frame,ass='${esc(f)}':fontsdir='${esc(FONT_DIR)}'`]);
    }

    // 3b. MOTION DESIGN fond noir, calé sur la voix
    const lineW = plan.lines.map(l => l.text.split(/\s+/).length + 1.5);
    const introDur = Math.max(plan.lines.length * 1.5, (vIntro?.dur ?? 0) + 0.5);
    {
      const a = assHeader();
      ev(a, 0, introDur, 'Small', `{\\an5\\pos(500,420)\\fad(300,0)}FIK CONCIERGERIE`);
      let t = 0; const sum = lineW.reduce((x, y) => x + y, 0);
      plan.lines.forEach((l, i) => {
        const d = (lineW[i]! / sum) * introDur;
        ev(a, t, t + d, 'Kin', `{\\an5\\pos(500,900)\\fad(90,140)\\blur10\\fscx140\\fscy140\\t(0,240,\\blur0\\fscx100\\fscy100)}${gold(l.text, l.gold)}`);
        ev(a, t, t + d, 'Kin', goldBar(320, 1040, 360, 120), 1);
        t += d;
      });
      const f = path.join(dir, 'intro.ass'); await fs.writeFile(f, a.join('\n') + '\n');
      // fond noir vivant : léger halo doré qui respire + grain fin
      // calculé en 270×480 puis agrandi (geq en 1080×1920 = trop lent)
      const G = `exp(-((X-135)*(X-135)+(Y-225)*(Y-225))/(2*(75+15*sin(T*2))*(75+15*sin(T*2))))`;
      await seg('s1', ['-f', 'lavfi', '-i', `color=c=0x050505:s=270x480:r=${FPS}:d=${introDur.toFixed(2)}`, '-vf',
        `format=rgb24,geq=r='5+22*${G}':g='5+17*${G}':b='5+5*${G}',scale=${W}:${H}:flags=bicubic,` +
        `noise=alls=6:allf=t,format=yuv420p,ass='${esc(f)}':fontsdir='${esc(FONT_DIR)}'`]);
    }

    // 3c. VOITURES : nom doré + atout, entrée glissée, punch-in lent
    const carsDur = Math.max(ok.length * CAR_S, (vCars?.dur ?? 0) + 0.4);
    const perCar = carsDur / ok.length;
    for (const [i, x] of ok.entries()) {
      const a = assHeader();
      ev(a, 0.05, perCar, 'CarName', `{\\move(-400,1280,90,1280,0,220)}${assText(x.car.name.replace(/\s+—.*$/, '').toUpperCase())}`);
      ev(a, 0.15, perCar, 'CarLbl', `{\\move(-600,1380,90,1380,0,260)}${assText(x.label.toUpperCase())}`);
      const f = path.join(dir, `car${i}.ass`); await fs.writeFile(f, a.join('\n') + '\n');
      // le monteur coupe chaque scène sur SON passage le plus fort (mesuré) ; pour la scène du hook, la suite du hook (pas deux fois la même image)
      const st = i === hi ? Math.max(0, Math.min(wins[hi]!.start + HOOK_S, 5 - perCar))
        : (await strongestWindow(x.file, perCar).catch(() => ({ start: 0.4, score: 0 }))).start;
      await seg(`s2_${i}`, ['-ss', st.toFixed(2), '-i', x.file, '-vf',
        `${FIT},${GRADE},tpad=stop_mode=clone:stop_duration=${perCar.toFixed(2)},trim=duration=${perCar.toFixed(2)},` +
        `zoompan=z='1.0+0.06*on/${Math.round(perCar * FPS)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},` +
        `ass='${esc(f)}':fontsdir='${esc(FONT_DIR)}'`]);
    }

    // 3d. CTA
    {
      const a = assHeader();
      ev(a, 0, CTA_S, 'Cta', `{\\an5\\pos(500,880)\\fad(120,0)\\fscx120\\fscy120\\t(0,200,\\fscx100\\fscy100)}${gold(plan.cta, [plan.cta.split(/\s+/).pop() ?? ''])}`);
      ev(a, 0.25, CTA_S, 'Kin', goldBar(300, 990, 400, 250), 1);
      ev(a, 0.35, CTA_S, 'Small', `{\\an5\\pos(500,1080)\\fad(200,0)}${assText(plan.cta_sub.toUpperCase())}`);
      const f = path.join(dir, 'cta.ass'); await fs.writeFile(f, a.join('\n') + '\n');
      await seg('s3', ['-f', 'lavfi', '-i', `color=c=0x050505:s=${W}x${H}:r=${FPS}:d=${CTA_S}`, '-vf', `noise=alls=6:allf=t,format=yuv420p,ass='${esc(f)}':fontsdir='${esc(FONT_DIR)}'`]);
    }

    const vid = path.join(dir, 'video.mp4');
    await run([...segs.flatMap(s => ['-i', s]), '-filter_complex', `${segs.map((_, i) => `[${i}:v]`).join('')}concat=n=${segs.length}:v=1:a=0[v]`, '-map', '[v]', ...ENC, vid]);
    const total = HOOK_S + introDur + carsDur + CTA_S;

    // ── 4. Son : voix (intro + voitures) + musique baissée sous la voix ──
    const ins = ['-i', vid, '-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo'];
    const parts: string[] = [], vo: string[] = ['[1:a]'];
    let k = 2;
    for (const [v, at] of [[vIntro, HOOK_S + 0.2], [vCars, HOOK_S + introDur + 0.15]] as const) {
      if (!v) continue;
      ins.push('-i', v.file); const ms = Math.round(at * 1000);
      parts.push(`[${k}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=1.5[v${k}]`); vo.push(`[v${k}]`); k++;
    }
    parts.push(`${vo.join('')}amix=inputs=${vo.length}:normalize=0:duration=first[voice]`);
    if (musicFile) {
      ins.push('-stream_loop', '-1', '-i', musicFile);
      parts.push(`[${k}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(2)},volume=0.55,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[mu]`,
        '[voice]asplit=2[vk][vm]', '[mu][vk]sidechaincompress=threshold=0.03:ratio=9:attack=15:release=350[duck]',
        '[vm][duck]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[a]');
    } else parts.push('[voice]loudnorm=I=-14:TP=-1.5:LRA=11[a]');
    const mixed = path.join(dir, 'mixed.mp4');
    await run([...ins, '-filter_complex', parts.join(';'), '-map', '0:v', '-map', '[a]', '-t', total.toFixed(2), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', mixed]);
    let final = mixed, finalDur = total;
    try { ({ final, total: finalDur } = await appendOutro(dir, mixed, total)); } catch (e) { console.warn('[pub] signature FIK :', e instanceof Error ? e.message : e); }

    // ── 5. Miniature (moment fort + texte) ──
    const cover = path.join(dir, 'cover.jpg');
    {
      const a = assHeader();
      ev(a, 0, 5, 'Hook', `{\\an5\\pos(500,900)}${gold(plan.cover_text, [plan.cover_text.split(/\s+/).pop() ?? ''])}`);
      const f = path.join(dir, 'cover.ass'); await fs.writeFile(f, a.join('\n') + '\n');
      await run(['-ss', (wins[hi]!.start + HOOK_S / 2).toFixed(2), '-i', ok[hi]!.file, '-frames:v', '1', '-vf', `${FIT},ass='${esc(f)}':fontsdir='${esc(FONT_DIR)}'`, '-q:v', '3', cover]).catch(() => {});
    }

    return { final, finalDur, cover };
}

type Scene = { cars: Car[]; label: string; scene: string; action: string; camera: string };

/** Image de départ de la scène : les VRAIES voitures (leurs photos) placées dans le décor (Nano Banana, plusieurs photos à la fois),
 *  sinon FLUX Kontext gratuit (1 voiture), sinon la photo d'origine. */
export async function keyframe(sc: Scene, allowPaid: boolean): Promise<{ url: string; cost: number }> {
  const names = sc.cars.map(c => c.name.replace(/\s+—.*$/, '')).join(', ');
  const prompt = `${sc.cars.length > 1 ? `Place these ${sc.cars.length} exact cars (one from each reference photo: ${names}) together` : `Place this exact car (${names})`} in a new scene: ${sc.scene}. ` +
    `Each car must stay IDENTICAL to its reference photo: same make and model, same body colour and finish, same wheels, same headlights and grille, correct proportions. ` +
    `Remove the original parking/garage background completely. Number plates plain without readable text. Photorealistic high-end automotive commercial photograph, natural reflections and shadows on the ground, cinematic lighting, sharp focus, vertical 9:16 framing with the car(s) fully visible, no text, no logos, no people close-up.`;
  if (allowPaid) {
    try {
      const r = await falRun('fal-ai/nano-banana/edit', { prompt, image_urls: sc.cars.map(c => c.url), num_images: 1, output_format: 'jpeg', aspect_ratio: '9:16' }, 300_000);
      const u = (r['images'] as Array<{ url: string }> | undefined)?.[0]?.url;
      if (u) return { url: u, cost: 0.04 };
    } catch (e) { console.warn('[pub] décor Nano Banana :', e instanceof Error ? e.message : e); }
  }
  try {
    const { editImageUrl } = await import('./ai-edit.js');
    return { url: (await editImageUrl(sc.cars[0]!.url, prompt, 'gratuit')).url, cost: 0 };
  } catch (e) { console.warn('[pub] décor gratuit :', e instanceof Error ? e.message : e); }
  return { url: sc.cars[0]!.url, cost: 0 };
}

async function renderPub(job: StudioJob, plan: PubPlan, scenes: Scene[], model: ModelId, myVoice: boolean, slots: ReturnType<typeof bestPostSlots>, team = ''): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `pub-${job.id}-`));
  const free = model === 'gratuit';
  const rate = STUDIO_MODELS[model].perSec;
  try {
    await ensureFonts();
    // ── 1. Plans voitures (vraie photo → vidéo IA), voix et musique en parallèle ──
    job.status = 'shots'; job.step = `Plans des voitures (${STUDIO_MODELS[model].label})…`; job.progress = 5; await saveJob(job);
    const voiceP = Promise.all([tts(plan.voice_intro, myVoice), tts(plan.voice_cars, myVoice)]);
    const musicP = free ? Promise.resolve(null) : falRun(MUSIC_MODEL, { prompt: plan.music_prompt, duration: 40 }, 240_000)
      .then(r => (r['audio_file'] as { url?: string } | undefined)?.url ?? null).catch(e => { console.warn('[pub] musique:', e.message); return null; });
    const clips: Array<string | null> = new Array(scenes.length).fill(null);
    let falEmpty = false, cursor = 0;
    const worker = async () => {
      while (cursor < scenes.length) {
        const i = cursor++;
        const sc = scenes[i]!;
        const car = { name: sc.cars.map(c => c.name).join(' + ') };
        // 1) les vraies voitures dans le décor  2) elles roulent (Kling)
        const kf = await keyframe(sc, !free && !falEmpty);
        job.costUsd += kf.cost;
        const subject = await describeSubject(kf.url);
        const shot: StudioShot = { prompt: `${sc.action || 'the car drives slowly toward the camera, headlights on'}. Setting: ${sc.scene}. Ultra realistic automotive commercial, natural motion blur, real physics, vertical 9:16`, camera: sc.camera, duration: 5, use_image: true };
        if (!free && !falEmpty) {
          try {
            const { endpoint, input } = shotInput(model, shot, kf.url, false, subject);
            const res = await falRun(endpoint, input);
            const url = (res['video'] as { url?: string } | undefined)?.url;
            if (!url) throw new Error('pas de vidéo');
            const f = path.join(dir, `car${i}.mp4`);
            await fs.writeFile(f, Buffer.from((await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 120_000 })).data));
            clips[i] = f; job.costUsd += 5 * rate;
          } catch (e) {
            const m = e instanceof Error ? e.message : String(e);
            console.error(`[pub] voiture ${car.name}:`, m);
            if (/crédit|refusé|balance|exhausted|locked|402|403/i.test(m)) { falEmpty = true; await markFalEmpty(); }
          }
        }
        if (!clips[i]) clips[i] = await freeShot(shot, kf.url, dir, i, 7, subject).catch(() => null);
        job.shotsDone++; job.progress = 5 + Math.round((job.shotsDone / job.shotsTotal) * 55);
        job.step = `Scènes vidéo IA : ${job.shotsDone}/${job.shotsTotal}`; await saveJob(job);
      }
    };
    await Promise.all(free ? [worker()] : [worker(), worker()]);
    const ok = scenes.map((sc, i) => ({ car: { name: sc.cars.length > 1 ? 'LA FLOTTE FIK' : sc.cars[0]!.name, url: '', category: '' }, file: clips[i], label: sc.label }))
      .filter((x): x is { car: Car; file: string; label: string } => !!x.file);
    if (!ok.length) throw new Error('aucun plan voiture n\'a pu être généré');

    // ── 2. Le moment fort pour le hook ──
    job.status = 'montage'; job.step = 'Je choisis le moment le plus fort pour le hook…'; job.progress = 62; await saveJob(job);
    const wins = await Promise.all(ok.map(x => strongestWindow(x.file, HOOK_S)));
    const hi = wins.reduce((b, w, i) => (w.score > wins[b]!.score ? i : b), 0);

    const [vIntroBuf, vCarsBuf] = await voiceP;
    const vIntro = await writeAudio(dir, 'v_intro', vIntroBuf);
    const vCars = await writeAudio(dir, 'v_cars', vCarsBuf);
    job.step = 'Montage : hook, motion design, voitures, CTA, mixage…'; job.progress = 70; await saveJob(job);
    const musicUrl = await musicP;
    let musicFile: string | null = null;
    if (musicUrl) {
      musicFile = path.join(dir, 'music.wav');
      await fs.writeFile(musicFile, Buffer.from((await axios.get<ArrayBuffer>(musicUrl, { responseType: 'arraybuffer', timeout: 60_000 })).data));
      job.costUsd += 0.02;
    }
    const { final, finalDur, cover } = await buildPubVideo({ dir, plan, ok, wins, hi, vIntro, vCars, musicFile });
    // ── 6. Livraison : vidéo + pack community manager sur Telegram, rappel à la bonne heure ──
    job.step = 'Envoi…'; job.progress = 95; await saveJob(job);
    const name = `studio/pub-${job.id}.mp4`;
    const sendable = await fitSize(dir, final, finalDur);
    const { error } = await supabase.storage.from('videos').upload(name, await fs.readFile(sendable), { contentType: 'video/mp4', upsert: true, cacheControl: '3600' });
    if (error) throw new Error(`upload Supabase : ${error.message}`);
    const url = supabase.storage.from('videos').getPublicUrl(name).data.publicUrl;
    const caption = `${plan.caption}\n\n${plan.hashtags.join(' ')}`.trim();
    job.costUsd = Math.round(job.costUsd * 100) / 100;
    await addSpent(job.costUsd);
    Object.assign(job, { status: 'done', step: 'Terminé ✅', progress: 100, url, caption });
    await saveJob(job);

    const prime = slots.find(s => s.prime) ?? slots[0];
    const missed = scenes.length - ok.length;
    await queueTelegramMessage(`🎬 Ta pub TikTok « ${plan.title} » est prête — ${Math.round(finalDur)} s, ${free ? '0 €' : `≈ ${job.costUsd.toFixed(2)} $`}${missed ? ` (⚠️ ${missed} scène(s) ratée(s), montage fait sans)` : ''}`,
      undefined, 'kouider', { url, name: 'pub-tiktok-fik.mp4' });
    let cov: string | undefined;
    try { cov = (await fs.readFile(cover)).toString('base64'); } catch { /* pas de miniature */ }
    if (cov) await queueTelegramMessage(`🖼️ Miniature à choisir comme couverture sur TikTok : « ${plan.cover_text} »`, cov);
    await queueTelegramMessage([
      '📲 PACK TIKTOK — copie-colle',
      '',
      '✍️ Légende :', caption,
      '',
      plan.pinned_comment ? `📌 Commentaire à épingler juste après la publication :\n${plan.pinned_comment}\n` : '',
      prime ? `⏰ Meilleur moment pour poster : ${prime.label} — ${prime.why}.${slots.filter(s => s !== prime).slice(0, 2).map(s => `\n   Autre créneau : ${s.label}`).join('')}\n   Je te préviens à l'heure.\n` : '',
      `🎣 Hook utilisé : « ${plan.hook} » (pris sur le moment le plus fort des vidéos de voitures).${plan.alt_hooks.length ? `\n   Hooks de secours pour un 2e post : ${plan.alt_hooks.map(h => `« ${h} »`).join(' · ')}` : ''}`,
      '',
      team ? team : '',
      plan.replies.length ? `💬 Réponses toutes prêtes aux commentaires :\n${plan.replies.map(r => `• ${r}`).join('\n')}\n` : '',
      plan.tips.length ? `🧠 Conseils pour ce post :\n${plan.tips.map(t => `• ${t}`).join('\n')}` : '',
      '',
      'ℹ️ Les heures viennent des habitudes TikTok en Algérie (soirée, week-end jeudi→samedi). Après 3 ou 4 posts, envoie-moi tes stats TikTok et je les ajuste à TON public.',
    ].filter(x => x !== '').join('\n').replace(/\n{3,}/g, '\n\n'));
    emitProactive(`🎬 Pub TikTok « ${plan.title} » prête (page MONTAGE)`, 'info', `🎬 Pub TikTok prête : ${url}\n\n${caption}`);

    if (prime) {
      try {
        const { executeTool } = await import('../integrations/tool-executor.js');
        const at = prime.at;
        const d = at.toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
        const t = at.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' });
        await executeTool('schedule_reminder', { message: `📲 C'est l'heure de poster ta pub TikTok « ${plan.title} » ! La vidéo, la miniature et la légende sont dans Telegram. Après la publication : épingle le commentaire et réponds aux premiers commentaires pendant 30 min.`, at_date: d, at_time: t, timezone: 'Europe/Brussels' }, 'telegram_kouider');
      } catch (e) { console.warn('[pub] rappel :', e instanceof Error ? e.message : e); }
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error(`[pub] job ${job.id}:`, m);
    job.costUsd = Math.round(job.costUsd * 100) / 100;
    if (job.costUsd) await addSpent(job.costUsd);
    Object.assign(job, { status: 'error', step: 'Échec', error: m.slice(0, 400) });
    await saveJob(job);
    await queueTelegramMessage(`❌ La pub TikTok « ${plan.title} » a échoué : ${m.slice(0, 200)}`).catch(() => {});
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Outil ────────────────────────────────────────────────────

export async function tiktokPubTool(input: Record<string, unknown>, actor = 'kouider'): Promise<string> {
  // message vide = PUB LIBRE : l'équipe choisit tout (angle, voiture à pousser, texte)
  const message = String(input['idea'] ?? input['message'] ?? '').trim();
  const all = await fleet();
  if (!all.length) return '❌ Aucune voiture disponible avec photo dans la flotte.';
  const wantedRaw = (Array.isArray(input['car_names']) ? input['car_names'] : String(input['car_names'] ?? input['car_name'] ?? '').split(/[,;]+/)).map(String).map(s => s.trim()).filter(Boolean);
  const wanted = wantedRaw.map(n => findCar(all, n)?.name).filter((x): x is string => !!x);
  const seconds = Math.min(40, Math.max(18, Number(input['seconds']) || 26));
  const brief = await teamBrief(all, message);
  const draft = await direct(message, all, wanted, seconds, brief);
  const rv = await review(draft, brief, message);
  const plan = rv.plan;
  plan.angle = brief.angle.id;
  let scenes: Scene[] = plan.scenes.map(sc => ({ ...sc, cars: sc.cars.map(n => findCar(all, n)).filter((c): c is Car => !!c)
    .filter((c, i, a) => a.findIndex(x => x.name === c.name) === i) })).filter(sc => sc.cars.length);
  if (!scenes.length) {
    const cars = (wanted.length ? wanted : DEFAULT_CARS).map(n => findCar(all, n)).filter((c): c is Car => !!c);
    scenes = cars.map(c => ({ cars: [c], label: c.category.toUpperCase(), scene: 'Oran seafront corniche at golden hour, Mediterranean sea, palm trees', action: 'the car drives slowly toward the camera, headlights on', camera: 'travelling' }));
  }
  const model = await bestModel();
  const slots = bestPostSlots();
  const now = new Date().toISOString();
  const est = Math.round((scenes.length * (5 * STUDIO_MODELS[model].perSec + (model === 'gratuit' ? 0 : 0.04)) + (model === 'gratuit' ? 0 : 0.02)) * 100) / 100;
  const job: StudioJob = {
    id: randomUUID().slice(0, 8), planId: 'pub', title: plan.title, model, status: 'queued', step: 'En file…', progress: 2,
    estimateUsd: est, costUsd: 0, shotsDone: 0, shotsTotal: scenes.length, createdAt: now, updatedAt: now, actor,
  };
  const sc = Object.entries(rv.scores).filter(([, v]) => typeof v === 'number');
  const team = [
    `🎬 Les choix de l'équipe :`,
    `• Angle : ${brief.angle.name} — ${brief.angle.how}.`,
    `• Moment : ${brief.moment.label} (${brief.moment.hints[0]}).`,
    brief.push[0] ? `• Voiture à pousser : ${brief.push[0].name} — ${brief.push[0].why}.` : '',
    ...plan.team_notes.map(n => `• ${n}`),
    sc.length ? `• Note du comité : ${sc.map(([k, v]) => `${k} ${v}/10`).join(' · ')}${rv.verdict ? ` — ${rv.verdict}` : ''}` : '',
  ].filter(Boolean).join('\n') + '\n';
  await launchJob(job, () => renderPub(job, plan, scenes, model, input['my_voice'] === true, slots, team));
  await remember({ at: now, title: plan.title, angle: brief.angle.id, hook: plan.hook, cars: [...new Set(scenes.flatMap(x => x.cars.map(c => c.name)))],
    decors: scenes.map(x => x.scene.slice(0, 80)), brief: message.slice(0, 300) });
  const prime = slots.find(s => s.prime);
  return `🎬 Pub TikTok lancée (job ${job.id}, ${STUDIO_MODELS[model].label}, ${model === 'gratuit' ? '0 €' : `≈ ${est.toFixed(2)} $`}, prête dans 5 à 12 min sur Telegram + page MONTAGE).
Hook (1,6 s, sur le moment le plus fort) : « ${plan.hook} »
Motion design fond noir : ${plan.lines.map(l => `« ${l.text} »`).join(' → ')}
Angle : ${brief.angle.name} · moment : ${brief.moment.label}${brief.push[0] ? ` · voiture poussée : ${brief.push[0].name} (${brief.push[0].why})` : ''}.
Scènes vidéo IA (vraies voitures placées dans le décor, qui roulent) : ${scenes.map(sc => `${sc.cars.map(c => c.name).join(' + ')} — ${sc.scene.slice(0, 60)}`).join(' | ')} → CTA « ${plan.cta} » → signature FIK.
Il recevra : la vidéo, la miniature, la légende + hashtags, le commentaire à épingler, les réponses types et un rappel au meilleur moment${prime ? ` (${prime.label})` : ''}.
Dis-lui tout ça simplement, sans détails techniques.`;
}
