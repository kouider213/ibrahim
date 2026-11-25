/**
 * car-rushes.ts — VRAIES VIDÉOS DES VOITURES pour les pubs (25/11, demande de Kouider)
 * ─────────────────────────────────────────────────────────────────────────────
 * « La qualité est nulle : les voitures sur le côté se déforment, le pneu tourne dans le mauvais sens,
 *   la plaque change. Ça doit être ultra réaliste, incroyable. »
 * → Aucune IA (gratuite ou payante) ne garantit zéro défaut sur une voiture qui roule. Donc la voiture n'est
 *   plus DESSINÉE par l'IA : Kouider (ou Houari) filme chaque voiture une fois au téléphone, il l'envoie sur
 *   Telegram avec « pub Clio », elle est rangée ici ; les pubs coupent dedans (moment le plus fort, mesuré).
 *   L'IA garde tout le reste : hook, motion design, textes, voix, musique, montage, CM.
 * Voiture pas encore filmée → Kling seulement si crédit fal, sinon plan « showroom » sur sa VRAIE photo
 * (aucune déformation possible) — et la pub dit quelles voitures filmer.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { run } from './video-studio.js';

const KEY = process.env.RUSH_KV_KEY || 'pub:rushes';   // clé de test possible (banc)
export interface Rush { id: string; car: string; url: string; dur: number; shot: string; note: string; at: string; uses: number }
interface FleetCar { name: string; url: string; category: string }

/** Les plans à filmer pour chaque voiture (dans cet ordre de priorité). */
export const SHOT_LIST = [
  'La voiture ARRIVE vers toi et passe à côté (toi immobile, téléphone à hauteur de phare, 10 s)',
  'Tu MARCHES autour de la voiture arrêtée, lentement, téléphone bas (un tour complet, 15 s)',
  'Elle roule devant toi : filmé depuis une autre voiture qui la suit ou la double (10 s)',
  'Gros plans : phares allumés, jante, logo, volant, écran / tableau de bord (2 s chacun)',
  'L\'intérieur depuis la porte ouverte, puis le siège conducteur (8 s)',
];
export const FILM_TIPS = 'Téléphone en VERTICAL, en 4K ou 1080p 60 i/s si possible, de jour (fin d\'après-midi = le plus beau) ou de nuit avec les phares, voiture propre. Pas besoin de son.';

async function load(): Promise<Rush[]> {
  const { kvGet } = await import('../integrations/app-store.js');
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Rush[]; } catch { return []; }
}
async function save(l: Rush[]): Promise<void> {
  const { kvSet } = await import('../integrations/app-store.js');
  await kvSet(KEY, JSON.stringify(l.slice(0, 300)));
}
export const listRushes = load;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')
  .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').trim();   // « 500x » = « 500 x »
const sameCar = (a: string, b: string) => norm(a) === norm(b);

/** La voiture visée par la légende (« pub Clio », « rush duster gris », « pour la pub la CLS »). */
export function carFromText(all: FleetCar[], text: string): FleetCar | undefined {
  const t = ` ${norm(text)} `;
  // le nom le plus long qui colle d'abord (« Clio 5 Alpine » avant « Clio »)
  const scored = all.map(c => {
    const words = norm(c.name.replace(/\s+—.*$/, '')).split(' ').filter(Boolean);
    const hit = words.filter(w => t.includes(` ${w} `)).length;
    const nm = norm(c.name.replace(/\s+—.*$/, ''));
    return { c, hit: hit || (t.replace(/ /g, '').includes(nm.replace(/ /g, '')) ? words.length : 0), full: t.includes(` ${nm} `) || t.replace(/ /g, '').includes(nm.replace(/ /g, '')) };
  }).filter(x => x.hit > 0).sort((a, b) => Number(b.full) - Number(a.full) || b.hit - a.hit);
  return scored[0]?.c;
}
/** Plusieurs voitures collent autant (« pub Clio » avec 5 Clio) → la liste à proposer, sinon []. */
export function ambiguousCars(all: FleetCar[], text: string): string[] {
  const t = ` ${norm(text)} `;
  const sc = all.map(c => {
    const words = norm(c.name.replace(/\s+—.*$/, '')).split(' ').filter(Boolean);
    const compact = t.replace(/ /g, '').includes(words.join(''));
    return { n: c.name, hit: compact ? words.length : words.filter(w => t.includes(` ${w} `)).length, all: compact || words.every(w => t.includes(` ${w} `)) };
  }).filter(x => x.hit > 0);
  if (sc.some(x => x.all)) return [];   // un nom complet écrit = pas d'ambiguïté
  const top = Math.max(0, ...sc.map(x => x.hit));
  const best = sc.filter(x => x.hit === top);
  return best.length > 1 ? best.map(x => x.n) : [];
}

/** Infos vidéo (durée, taille affichée après rotation). */
export async function videoInfo(src: string): Promise<{ dur: number; w: number; h: number }> {
  const out = await run(['-i', src, '-f', 'null', '-t', '0.01', '-']).catch(e => String(e));
  const d = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(out);
  const s = /Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(out);
  const rot = /rotat(?:e|ion)[^\n]*?(-?\d+(?:\.\d+)?)/i.exec(out);
  let w = Number(s?.[1] ?? 0), h = Number(s?.[2] ?? 0);
  if (rot && Math.abs(Math.round(Number(rot[1]))) % 180 === 90) [w, h] = [h, w];
  return { dur: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0, w, h };
}

/** Ajoute une vraie vidéo d'une voiture (lien déjà dans le stockage FIK). Vérifie que c'est bien cette voiture et que c'est utilisable. */
export async function addRush(text: string, url: string, frames: string[] = []): Promise<string> {
  const { fleet } = await import('./tiktok-pub.js');
  const all = await fleet();
  const amb = ambiguousCars(all, text);
  if (amb.length) return `❓ Laquelle ? ${amb.join(' · ')}. Renvoie la vidéo avec le nom complet (ex. « pub ${amb[0]} »).`;
  const car = carFromText(all, text);
  if (!car) return `❓ Je n'ai pas reconnu la voiture dans « ${text.slice(0, 60)} ». Renvoie la vidéo avec par exemple « pub ${all[0]?.name ?? 'Clio'} ». Voitures : ${all.map(c => c.name).join(', ')}.`;
  const info = await videoInfo(url).catch(() => ({ dur: 0, w: 0, h: 0 }));
  if (info.dur && info.dur < 2) return '❌ Vidéo trop courte (moins de 2 s) : filme au moins 5 secondes.';
  let shot = 'autre', note = '', match = true;
  if (frames.length) {
    try {
      const dir = await fs.mkdtemp(path.join((await import('os')).tmpdir(), 'rush-'));
      const files: string[] = [];
      const ref = path.join(dir, 'ref.jpg');
      await fs.writeFile(ref, Buffer.from((await axios.get<ArrayBuffer>(car.url, { responseType: 'arraybuffer', timeout: 30_000 })).data));
      files.push(ref);
      for (const [i, b] of frames.slice(0, 3).entries()) { const f = path.join(dir, `f${i}.jpg`); await fs.writeFile(f, Buffer.from(b, 'base64')); files.push(f); }
      const grid = path.join(dir, 'grid.jpg');
      await run([...files.flatMap(f => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]scale=-2:400,setsar=1[i${i}]`).join(';')};${files.map((_, i) => `[i${i}]`).join('')}hstack=inputs=${files.length}`, '-frames:v', '1', grid]);
      const { readDocVision } = await import('../integrations/llm-router.js');
      const ans = await readDocVision(`Image 1 (left) = reference photo of the car "${car.name}". The other images = frames of a phone video meant for an advert.
Reply ONLY JSON: {"same_model": true/false (same make/model/colour as the reference, plate may differ), "shot": one of "arrive"|"walkaround"|"tracking"|"details"|"interior"|"static"|"other", "usable": true/false (sharp enough, car clearly visible, not mostly ground/sky), "note": "very short French note on what is filmed"}`,
        (await fs.readFile(grid)).toString('base64'), 'image/jpeg', 200);
      const j = JSON.parse(/\{[\s\S]*\}/.exec(ans)?.[0] ?? '{}') as { same_model?: boolean; shot?: string; usable?: boolean; note?: string };
      shot = String(j.shot ?? 'autre'); note = String(j.note ?? '').slice(0, 120); match = j.same_model !== false;
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      if (j.usable === false) return `⚠️ Vidéo de la ${car.name} pas utilisable pour une pub (${note || 'floue ou voiture mal visible'}). Refais-la plus près, téléphone stable.`;
    } catch (e) { console.warn('[rushes] contrôle :', e instanceof Error ? e.message : e); }
  }
  const l = await load();
  const r: Rush = { id: randomUUID().slice(0, 6), car: car.name, url, dur: Math.round(info.dur * 10) / 10, shot, note, at: new Date().toISOString(), uses: 0 };
  await save([r, ...l]);
  const mine = [r, ...l].filter(x => sameCar(x.car, car.name));
  const shots = new Set(mine.map(x => x.shot));
  const missing = [['arrive', 'elle qui arrive vers toi'], ['walkaround', 'le tour de la voiture'], ['tracking', 'filmée en roulant'], ['details', 'gros plans phares/jantes/volant']]
    .filter(([k]) => !shots.has(k!)).map(([, v]) => v);
  return `✅ Vidéo rangée pour les pubs : ${car.name}${note ? ` — ${note}` : ''} (${r.dur || '?'} s${info.w && info.w > info.h ? ', à l\'horizontale : je la recadre' : ''}).` +
    `${match ? '' : `\n⚠️ Elle ne ressemble pas tout à fait à la photo de la ${car.name} : si ce n'est pas elle, dis « supprime la dernière vidéo de pub ».`}` +
    `\nLa ${car.name} a maintenant ${mine.length} vidéo(s) réelle(s) : les pubs l'utilisent à la place de l'IA.` +
    (missing.length ? `\nPour une pub encore plus forte, il manque : ${missing.join(', ')}.` : '');
}

export async function deleteRush(id?: string): Promise<string> {
  const l = await load();
  const r = id ? l.find(x => x.id === id) : l[0];
  if (!r) return 'Aucune vidéo de pub à supprimer.';
  await save(l.filter(x => x !== r));
  return `🗑️ Vidéo supprimée (${r.car}${r.note ? ` — ${r.note}` : ''}).`;
}

/** Résumé pour Kouider + pour le réalisateur IA. */
export async function rushesSummary(all: FleetCar[]): Promise<{ text: string; filmed: string[]; missing: string[] }> {
  const l = await load();
  const filmed = all.filter(c => l.some(r => sameCar(r.car, c.name))).map(c => c.name);
  const missing = all.filter(c => !filmed.includes(c.name)).map(c => c.name);
  const lines = filmed.map(n => { const m = l.filter(r => sameCar(r.car, n)); return `• ${n} : ${m.length} vidéo(s) (${[...new Set(m.map(r => r.shot))].join(', ')})`; });
  return {
    filmed, missing,
    text: `🎥 VRAIES VIDÉOS POUR LES PUBS\n${lines.length ? lines.join('\n') : 'Aucune voiture filmée pour l\'instant.'}\n` +
      (missing.length ? `\nPas encore filmées : ${missing.join(', ')}.\n` : '') +
      `\n📋 À filmer pour chaque voiture :\n${SHOT_LIST.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n💡 ${FILM_TIPS}\n\n➡️ Envoie chaque vidéo sur Telegram avec la légende « pub » + le nom de la voiture (ex. « pub Clio »).`,
  };
}

// ─── Utilisation dans la pub ────────────────────────────────────────────────

const W = 1080, H = 1920, FPS = 30;
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
/** Vidéo verticale 1080×1920 : verticale = recadrage plein écran ; horizontale = la vidéo entière au centre sur un fond flou d'elle-même. */
const vertical = (landscape: boolean) => landscape
  ? `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:2,eq=brightness=-0.08[bg];[b]scale=${W}:-2[fg];[bg][fg]overlay=0:(H-h)/2,fps=${FPS},setsar=1`
  : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1`;

/** Passage le plus vivant d'une vidéo (mouvement mesuré), sans les 0,3 premières/dernières secondes (tremblement du bouton). */
async function liveliest(file: string, dur: number, win: number): Promise<number> {
  if (dur <= win + 0.6) return Math.max(0, (dur - win) / 2);
  const log = await run(['-i', file, '-vf', "scale=160:-2,select='gte(scene,0)',metadata=print", '-an', '-f', 'null', '-']).catch(e => String(e));
  const pts: Array<[number, number]> = []; let t = -1;
  for (const line of log.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(line); if (m) t = Number(m[1]);
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line); if (s && t >= 0) pts.push([t, Number(s[1])]);
  }
  let best = 0.3, bs = -1;
  for (let st = 0.3; st + win <= dur - 0.3; st += 0.2) {
    // mouvement fort mais pas de coupure / secousse (score > 0.35 = saut d'image)
    const v = pts.filter(([x, y]) => x >= st && x < st + win && y < 0.35).reduce((a, [, y]) => a + y, 0);
    if (v > bs) { bs = v; best = st; }
  }
  return best;
}

/** Plan de la scène tiré des VRAIES vidéos : 1 voiture = son meilleur passage ; plusieurs = coupes rapides voiture après voiture.
 *  null si une des voitures n'a pas encore de vidéo. */
export async function rushClip(cars: Array<{ name: string }>, dir: string, i: number, seconds = 5): Promise<string | null> {
  const l = await load();
  const picks: Rush[] = [];
  for (const c of cars) {
    const m = l.filter(r => sameCar(r.car, c.name)).sort((a, b) => a.uses - b.uses || Date.parse(b.at) - Date.parse(a.at));
    if (!m.length) return null;
    picks.push(m[0]!);
  }
  const each = seconds / picks.length;
  const parts: string[] = [];
  for (const [k, r] of picks.entries()) {
    const src = path.join(dir, `rush${i}_${k}_src.mp4`);
    await fs.writeFile(src, Buffer.from((await axios.get<ArrayBuffer>(r.url, { responseType: 'arraybuffer', timeout: 180_000, maxContentLength: 300e6 })).data));
    const info = await videoInfo(src);
    const st = await liveliest(src, info.dur || seconds, Math.min(each, Math.max(1, (info.dur || seconds) - 0.6)));
    const out = path.join(dir, `rush${i}_${k}.mp4`);
    // vidéo plus courte que le passage voulu : léger ralenti plutôt qu'une image figée
    const slow = info.dur && info.dur - 0.6 < each ? Math.min(2, each / Math.max(0.8, info.dur - 0.6)) : 1;
    await run(['-ss', st.toFixed(2), '-t', (each / slow + 0.1).toFixed(2), '-i', src, '-an', '-vf',
      `${vertical(info.w > info.h)}${slow > 1.01 ? `,setpts=${slow.toFixed(3)}*PTS,minterpolate=fps=${FPS}:mi_mode=blend` : ''},trim=duration=${each.toFixed(2)}`, ...ENC, out]);
    await fs.rm(src, { force: true }).catch(() => {});
    parts.push(out);
  }
  let file = parts[0]!;
  if (parts.length > 1) {
    file = path.join(dir, `rush${i}.mp4`);
    await run([...parts.flatMap(p => ['-i', p]), '-filter_complex', `${parts.map((_, k) => `[${k}:v]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`, '-map', '[v]', ...ENC, file]);
  }
  const used = new Set(picks.map(p => p.id));
  await save(l.map(r => (used.has(r.id) ? { ...r, uses: r.uses + 1 } : r))).catch(() => {});
  return file;
}

/** Voiture pas encore filmée et pas de crédit IA : plan « showroom » sur sa VRAIE photo (aucune déformation possible) —
 *  photo nette sur fond flou d'elle-même, lente poussée caméra, reflet lumineux qui balaie la carrosserie. */
export async function photoClip(cars: FleetCar[], dir: string, i: number, seconds = 5): Promise<string> {
  const each = seconds / cars.length;
  const parts: string[] = [];
  for (const [k, c] of cars.entries()) {
    const img = path.join(dir, `photo${i}_${k}.jpg`);
    await fs.writeFile(img, Buffer.from((await axios.get<ArrayBuffer>(c.url, { responseType: 'arraybuffer', timeout: 60_000 })).data));
    const n = Math.round(each * FPS);
    const out = path.join(dir, `photo${i}_${k}.mp4`);
    // reflet : bande claire en diagonale qui traverse l'image une fois
    const sweep = `geq=lum='min(255,lum(X,Y)+36*exp(-pow((X+Y*0.6-(T/${each.toFixed(2)})*(W*1.9)+W*0.3)/(W*0.07),2)))':cb='cb(X,Y)':cr='cr(X,Y)'`;
    await run(['-loop', '1', '-framerate', String(FPS), '-t', each.toFixed(2), '-i', img, '-filter_complex',
      `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.12[bg];` +
      `[b]scale=${Math.round(W * 1.0)}:-2[fg];[bg][fg]overlay=0:(H-h)/2,` +
      `zoompan=z='1.0+0.10*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,${sweep},setsar=1[v]`,
      '-map', '[v]', '-frames:v', String(n), ...ENC, out]);
    parts.push(out);
  }
  if (parts.length === 1) return parts[0]!;
  const file = path.join(dir, `photo${i}.mp4`);
  await run([...parts.flatMap(p => ['-i', p]), '-filter_complex', `${parts.map((_, k) => `[${k}:v]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`, '-map', '[v]', ...ENC, file]);
  return file;
}
