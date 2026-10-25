import * as THREE from 'three';
import { ITEMS, byId, WORLDS, OUTFITS, MELODY, NUM_FR, MISSION_ICON, type Item, type MissionKind, type World, type OutfitId } from './data.ts';
import { makeFennec, dressFennec, animateFennec, emojiTexture, photoTexture, makeSprite, skyTexture, pathTexture, makeDecor, makeArch, confetti } from './scene.ts';

// LA GRANDE COURSE DE FENNOU — jeu 3D « à la Subway Surfers » pour le fils de Kouider (≈ 1 an et demi).
// Fennou court tout seul ; l'enfant touche les images. 6 mondes × 6 niveaux + course libre. Chaque niveau fait travailler
// une capacité : vocabulaire (animaux + cris, fruits, véhicules), couleurs, formes, grand/petit, compter, mémoire
// (cache-cache dans les cadeaux), rythme (musique), famille (vraies photos de papa et maman).
// Apprentissage SANS ÉCHEC : s'il ne touche rien, la bonne réponse brille puis Fennou y va tout seul en la nommant.
// Durée limitée par les parents (Fennou s'endort), voix de maman en darija si elle l'a enregistrée dans Fennou.

// ── Réglages partagés avec Fennou (même appareil) ────────────────────────────
interface FennouCfg { name: string; mins: number; speed: number; voice: 'fr' | 'dz' | 'mix' | 'off' }
let cfg: FennouCfg = { name: '', mins: 10, speed: 1, voice: 'fr' };
try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem('fennou') || '{}') }; } catch { /* */ }
const saveCfg = () => { try { localStorage.setItem('fennou', JSON.stringify(cfg)); } catch { /* */ } };
let photos: Record<string, string> = {};
try { photos = JSON.parse(localStorage.getItem('fennou:photos') || '{}'); } catch { /* */ }
const kid = () => cfg.name || 'mon champion';

interface Progress { unlocked: number; stars: Record<number, number>; album: string[]; outfit: OutfitId; stats: Partial<Record<MissionKind, { ok: number; n: number }>>; sound: boolean; plays: number }
const PKEY = 'fennou-run';
let prog: Progress = { unlocked: 0, stars: {}, album: [], outfit: 'none', stats: {}, sound: true, plays: 0 };
try { prog = { ...prog, ...JSON.parse(localStorage.getItem(PKEY) || '{}') }; } catch { /* */ }
const saveProg = () => { try { localStorage.setItem(PKEY, JSON.stringify(prog)); } catch { /* */ } };
const totalStars = () => Object.values(prog.stars).reduce((a, b) => a + b, 0);
const LEVELS = WORLDS.length * 6;

// ── Voix : français (synthèse) ou voix de maman enregistrée dans Fennou (IndexedDB « fennou ») ──
const voices: Record<string, Blob> = {};
void new Promise<void>(res => {
  try {
    const r = indexedDB.open('fennou', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('voices');
    r.onsuccess = () => {
      try {
        const rq = r.result.transaction('voices').objectStore('voices').openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { voices[String(c.key)] = c.value as Blob; c.continue(); } else res(); };
        rq.onerror = () => res();
      } catch { res(); }
    };
    r.onerror = () => res();
  } catch { res(); }
});
let frVoice: SpeechSynthesisVoice | null = null;
const pickVoice = () => { try { const v = speechSynthesis.getVoices(); frVoice = v.find(x => /^fr/i.test(x.lang) && /amelie|audrey|marie|google/i.test(x.name)) || v.find(x => /^fr/i.test(x.lang)) || null; } catch { /* */ } };
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch { /* */ }
let player: HTMLAudioElement | null = null, turn = 0;
function speakFr(text: string) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; if (frVoice) u.voice = frVoice; u.rate = 0.85; u.pitch = 1.3; speechSynthesis.speak(u); } catch { /* */ }
}
function playSeq(keys: string[]) {
  try { speechSynthesis.cancel(); } catch { /* */ }
  if (player) { player.pause(); player = null; }
  const list = keys.filter(k => voices[k]);
  const next = () => { const k = list.shift(); if (!k) return; player = new Audio(URL.createObjectURL(voices[k]!)); player.onended = next; void player.play().catch(() => {}); };
  next();
}
/** say(fr, keys) : keys = mots enregistrés par maman (ex. ['ou', 'chat']) — utilisés si tous existent. */
function say(fr: string, keys: string[] = []) {
  if (cfg.voice === 'off') return;
  const haveDz = keys.length > 0 && keys.every(k => voices[k]);
  const useDz = haveDz && (cfg.voice === 'dz' || (cfg.voice === 'mix' && turn++ % 2 === 1));
  if (useDz) playSeq(keys); else speakFr(fr);
}

// ── Sons (synthétisés) ───────────────────────────────────────────────────────
let ac: AudioContext | null = null;
const audio = () => { try { ac = ac ?? new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); if (ac.state === 'suspended') void ac.resume(); } catch { /* */ } return ac; };
function tone(f: number, t0: number, dur: number, type: OscillatorType = 'sine', vol = 0.16, f2?: number) {
  if (!prog.sound) return;
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sChime = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.35, 'triangle', 0.15));
const sPop = (k = 0) => tone(700 + k * 70, 0, 0.12, 'sine', 0.2, 300);
const sSoft = () => tone(420, 0, 0.3, 'sine', 0.08, 360);
const sJump = () => tone(320, 0, 0.22, 'sine', 0.1, 640);
const sFanfare = () => [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.28, 'triangle', 0.16));
let melodyI = 0;
const sNote = () => { tone(MELODY[melodyI % MELODY.length]! * 2, 0, 0.4, 'triangle', 0.2); melodyI++; };
// Petite musique de course douce (boucle), coupée en pause
let musicTimer: ReturnType<typeof setInterval> | null = null;
function music(on: boolean) {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!on) return;
  const bass = [131, 131, 165, 147, 131, 131, 175, 165];
  let i = 0;
  musicTimer = setInterval(() => { tone(bass[i % bass.length]!, 0, 0.25, 'triangle', 0.05); if (i % 2 === 0) tone(1600, 0, 0.03, 'square', 0.012); i++; }, 300);
}

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const show = (id: string) => { for (const s of ['map', 'hud', 'end', 'album', 'closet', 'sleep', 'parents']) $(s).hidden = s !== id && !(id === 'hud' && s === 'hud'); };
const canvas = $('stage') as HTMLCanvasElement;

// ── Three.js ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
const hemi = new THREE.HemisphereLight('#ffffff', '#c9a36b', 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1.5); sun.position.set(-4, 10, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); scene.add(sun); scene.add(sun.target);
const fennec = makeFennec(); scene.add(fennec.root);
dressFennec(fennec, prog.outfit);
const groundTex = pathTexture('#e9c27f', '#f4d9a2');
const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 220), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
strip.rotation.x = -Math.PI / 2; strip.position.z = -90; strip.receiveShadow = true; scene.add(strip);
groundTex.repeat.set(1, 26);
const field = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#e9c27f', roughness: 1 }));
field.rotation.x = -Math.PI / 2; field.position.y = -0.02; scene.add(field);
let starField: THREE.Points | null = null;

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 0.75 ? 72 : 58; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const LANES = [-2.2, 0, 2.2];
let world: World = WORLDS[0]!;
function applyWorld(w: World) {
  world = w;
  scene.background = skyTexture(w.sky[0], w.sky[1]);
  scene.fog = new THREE.Fog(w.fog, 22, 85);
  hemi.color.set(w.light); hemi.groundColor.set(w.ground);
  sun.color.set(w.light); sun.intensity = w.id === 'etoiles' ? 0.8 : 1.5;
  const t = pathTexture(w.ground, w.path); t.repeat.set(1, 26);
  (strip.material as THREE.MeshStandardMaterial).map = t; (strip.material as THREE.MeshStandardMaterial).needsUpdate = true;
  (field.material as THREE.MeshStandardMaterial).color.set(w.ground);
  if (starField) { scene.remove(starField); starField = null; }
  if (w.id === 'etoiles') {
    const g = new THREE.BufferGeometry(); const n = 600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 200; p[i * 3 + 1] = 5 + Math.random() * 60; p[i * 3 + 2] = -Math.random() * 150; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    starField = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.6, fog: false })); scene.add(starField);
  }
  for (const d of decor) scene.remove(d.o);
  decor.length = 0;
  for (let z = -100; z < 10; z += 3.2) spawnDecor(z);
}

// ── Objets du monde ───────────────────────────────────────────────────────────
interface Deco { o: THREE.Object3D }
const decor: Deco[] = [];
function spawnDecor(z: number) {
  for (const side of [-1, 1]) {
    if (Math.random() < 0.25) continue;
    const kind = world.decor[Math.floor(Math.random() * world.decor.length)]!;
    const o = makeDecor(kind, world);
    const far = kind === 'dune' || kind === 'planet' ? 14 + Math.random() * 18 : 7 + Math.random() * 7;
    o.position.set(side * far, 0, z + Math.random() * 2);
    o.rotation.y = Math.random() * Math.PI * 2;
    scene.add(o); decor.push({ o });
  }
}

interface Choice { lane: number; item: Item; sprite: THREE.Sprite; correct: boolean; size: number; box?: THREE.Sprite }
interface Challenge {
  kind: MissionKind; z: number; choices: Choice[]; target: Item | null; prompt: string; keys: string[];
  answered: number | null; asked: boolean; hinted: boolean; resolved: boolean; arch: THREE.Object3D[];
  hidePhase?: number; hider?: THREE.Sprite; swapped?: boolean; big?: boolean;
}
interface Pickup { lane: number; z: number; sprite: THREE.Sprite; kind: 'star' | 'note' | 'obstacle'; taken: boolean; obj?: THREE.Object3D }
let challenges: Challenge[] = [];
let pickups: Pickup[] = [];
let parts: Array<{ m: THREE.Mesh; v: THREE.Vector3; life: number }> = [];
let flyers: Array<{ s: THREE.Sprite; t: number }> = [];

// ── Partie ───────────────────────────────────────────────────────────────────
interface Run { level: number; world: World; mission: MissionKind; total: number; spawned: number; done: number; ok: number; helped: number; stars: number; dist: number; nextAt: number; finished: boolean; countN: number; startedAt: number; free: boolean; newStickers: string[] }
let run: Run | null = null;
let paused = true;
let lane = 1, laneX = 0, jumpT = 0, happyT = 0;
let speed = 0;
const sessionStart = Date.now();
let wins = 0;

const pool = (w: World, kinds: Item['kind'][]) => w.pool.map(byId).filter(i => kinds.includes(i.kind));
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; };
function nChoices(kind: MissionKind) {
  const s = prog.stats[kind];
  if (!run || run.level < 2) return 2;
  return s && s.n >= 6 && s.ok / s.n >= 0.6 ? 3 : 2;
}

function itemSprite(it: Item, size: number): THREE.Sprite {
  const tex = it.kind === 'family' && photos[it.id] ? photoTexture(photos[it.id]!) : emojiTexture(it.e);
  return makeSprite(tex, size);
}

function makeChallenge(kind: MissionKind, z: number): Challenge {
  const n = nChoices(kind);
  const lanesFor = (k: number) => k === 3 ? [0, 1, 2] : shuffle([[0, 2], [0, 1], [1, 2]])[0]!;
  const ls = lanesFor(n);
  let items: Item[] = [], target: Item | null = null, prompt = '', keys: string[] = [], big = false;
  const ch: Challenge = { kind, z, choices: [], target: null, prompt: '', keys: [], answered: null, asked: false, hinted: false, resolved: false, arch: [] };
  if (kind === 'find' || kind === 'free') {
    const p = shuffle(pool(run!.world, ['animal', 'fruit', 'vehicle'])); items = p.slice(0, n); target = items[Math.floor(Math.random() * n)]!;
    prompt = `Où est ${target.fr} ?`; keys = ['ou', target.id];
  } else if (kind === 'color') {
    items = shuffle(ITEMS.filter(i => i.kind === 'color')).slice(0, n); target = items[Math.floor(Math.random() * n)]!;
    prompt = `Attrape le cœur ${target.fr} !`; keys = ['attrape', target.id];
  } else if (kind === 'shape') {
    items = shuffle(ITEMS.filter(i => i.kind === 'shape')).slice(0, n); target = items[Math.floor(Math.random() * n)]!;
    prompt = `Passe par ${target.fr} !`; keys = ['ou', target.id];
  } else if (kind === 'size') {
    const it = shuffle(pool(run!.world, ['animal', 'fruit', 'vehicle']))[0]!; items = Array(n).fill(it); big = Math.random() < 0.5;
    target = it; prompt = big ? `Le GRAND ${it.fr.replace(/^(le |la |l')/, '')} !` : `Le tout PETIT ${it.fr.replace(/^(le |la |l')/, '')} !`; keys = [big ? 'grand' : 'petit', it.id];
  } else if (kind === 'hide') {
    const it = shuffle(pool(run!.world, ['animal']))[0] ?? byId('lapin'); target = it; items = Array(n).fill(byId('cadeau'));
    prompt = `Où s'est caché ${it.fr} ?`; keys = ['cache', it.id];
  } else if (kind === 'family') {
    items = [byId('papa'), byId('maman')]; if (n === 3) items.push(byId('lapin'));
    items = shuffle(items).slice(0, ls.length); target = items.find(i => i.kind === 'family')!;
    prompt = `Où est ${target.fr} ?`; keys = ['ou', target.id];
  }
  const correctIdx = kind === 'size' ? (big ? 0 : n - 1) : kind === 'hide' ? Math.floor(Math.random() * n) : items.indexOf(target!);
  ls.forEach((l, i) => {
    const it = items[i]!;
    const size = kind === 'size' ? (i === 0 ? 3 : i === n - 1 ? 1.1 : 1.9) : kind === 'hide' ? 1.9 : 2.1;
    const sp = itemSprite(it, size);
    sp.position.set(LANES[l]!, size / 2 + 0.5, z);
    scene.add(sp);
    ch.choices.push({ lane: l, item: it, sprite: sp, correct: i === correctIdx, size });
    if (kind === 'shape') { const a = makeArch(['#ff6f91', '#4fc3f7', '#ffd23f'][i % 3]!); a.position.set(LANES[l]!, 0, z); scene.add(a); ch.arch.push(a); }
  });
  if (kind === 'size') { // ordre des tailles mélangé sur les voies
    const sizes = shuffle(ch.choices.map(c => ({ size: c.size, correct: c.correct })));
    ch.choices.forEach((c, i) => { c.size = sizes[i]!.size; c.correct = sizes[i]!.correct; c.sprite.scale.setScalar(c.size); c.sprite.position.y = c.size / 2 + 0.4; });
  }
  if (kind === 'hide') {
    const hider = itemSprite(target!, 1.4); const c = ch.choices.find(x => x.correct)!;
    hider.position.set(c.sprite.position.x, 3.2, z); scene.add(hider); ch.hider = hider; ch.hidePhase = 0;
    ch.swapped = run!.world.id !== 'desert' && n === 3 ? false : true;   // à partir de la ferme : les cadeaux s'échangent une fois
  }
  ch.target = target; ch.prompt = prompt; ch.keys = keys; ch.big = big;
  return ch;
}

function spawnRow(z: number, kind: 'star' | 'note') {
  const l = Math.floor(Math.random() * 3);
  for (let i = 0; i < 4; i++) {
    const sp = makeSprite(emojiTexture(kind === 'note' ? '🎵' : '🌟'), 1.1);
    sp.position.set(LANES[l]!, 1, z - i * 2.2); scene.add(sp);
    pickups.push({ lane: l, z: z - i * 2.2, sprite: sp, kind, taken: false });
  }
}
function spawnObstacle(z: number) {
  const l = Math.floor(Math.random() * 3);
  const o = makeDecor(world.id === 'etoiles' ? 'crystal' : world.id === 'ville' ? 'flower' : 'rock', world); o.scale.setScalar(0.6);
  o.position.set(LANES[l]!, 0, z); scene.add(o);
  pickups.push({ lane: l, z, sprite: new THREE.Sprite(), kind: 'obstacle', taken: false, obj: o });
}

function clearRun() {
  for (const c of challenges) { for (const ch of c.choices) scene.remove(ch.sprite); c.arch.forEach(a => scene.remove(a)); if (c.hider) scene.remove(c.hider); }
  for (const p of pickups) { scene.remove(p.sprite); if (p.obj) scene.remove(p.obj); }
  for (const f of flyers) scene.remove(f.s);
  for (const p of parts) scene.remove(p.m);
  challenges = []; pickups = []; flyers = []; parts = [];
}

function startLevel(level: number, free = false) {
  clearRun();
  const w = free ? WORLDS[Math.floor(Math.random() * WORLDS.length)]! : WORLDS[Math.floor(level / 6)]!;
  const mission: MissionKind = free ? 'free' : w.missions[level % 6]!;
  applyWorld(w);
  run = { level, world: w, mission, total: free ? 12 : mission === 'collect' || mission === 'music' ? 6 : 7 + Math.floor(level / 8), spawned: 0, done: 0, ok: 0, helped: 0, stars: 0, dist: 0, nextAt: 4, finished: false, countN: 0, startedAt: Date.now(), free, newStickers: [] };
  lane = 1; laneX = 0; melodyI = 0;
  show('hud'); $('hud').hidden = false;
  $('h-world').textContent = MISSION_ICON[mission];
  renderDots();
  setTarget(null);
  paused = false; speed = 0;
  music(true);
  const intro: Record<MissionKind, string> = {
    collect: `C'est parti ${kid()} ! On attrape les étoiles et on compte !`, find: 'C\'est parti ! Trouve les bons amis !', color: 'Les couleurs ! Écoute bien !',
    shape: 'Les formes ! Passe par la bonne porte !', size: 'Grand ou petit ? Regarde bien !', hide: 'Cache-cache ! Regarde où ils se cachent !',
    music: 'De la musique ! Attrape les notes !', family: 'Où est la famille ? On cherche papa et maman !', free: 'Course libre ! Allez Fennou !',
  };
  say(intro[mission], ['attrape']);
}

function renderDots() {
  if (!run) return;
  const total = run.mission === 'collect' || run.mission === 'music' ? 0 : run.total;
  $('h-dots').innerHTML = total ? Array.from({ length: total }, (_, i) => `<i class="${i < run!.done ? 'on' : ''}"></i>`).join('') : `<b class="cnt">🌟 ${run.countN}</b>`;
}
function setTarget(c: Challenge | null) {
  const b = $('h-target');
  if (!c || !c.target) { b.hidden = true; return; }
  b.hidden = false;
  const it = c.target;
  const pic = c.kind === 'hide' ? `<span class="q">${it.e}<small>❓</small></span>`
    : it.kind === 'family' && photos[it.id] ? `<img src="${photos[it.id]}" alt="">`
    : c.kind === 'size' ? `<span style="font-size:${c.big ? 64 : 30}px">${it.e}</span>` : `<span>${it.e}</span>`;
  b.innerHTML = `${pic}<em>🔊</em>`;
  b.onclick = () => say(c.prompt, c.keys);
}

// ── Boucle ────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const TS = Math.min(8, Number(new URLSearchParams(location.search).get('ts')) || 1);   // ?ts=4 : accéléré (tests)
let t = 0;
const ray = new THREE.Raycaster();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(TS > 1 ? 0.25 : 0.05, clock.getDelta()) * TS; t += dt;
  const target = run && !paused && !run.finished ? 8.5 * cfg.speed * (0.9 + Math.min(run.level, 30) * 0.008) : run?.finished ? 3 : 0;
  // On ralentit quand une question arrive : le petit a le temps de chercher
  const asking = challenges.some(c => c.asked && !c.resolved && c.answered == null);
  speed += ((asking ? target * 0.55 : target) - speed) * Math.min(1, dt * 2);
  const dz = speed * dt;
  if (run && !paused) update(dz, dt);
  // Fennou
  laneX += (LANES[lane]! - laneX) * Math.min(1, dt * 9);
  fennec.root.position.x = laneX;
  fennec.root.rotation.y = Math.PI + (LANES[lane]! - laneX) * -0.25;
  jumpT = Math.max(0, jumpT - dt * 1.8); happyT = Math.max(0, happyT - dt);
  animateFennec(fennec, t, Math.min(1, speed / 6), Math.sin(Math.min(1, jumpT) * Math.PI) * (jumpT > 0 ? 1 : 0), happyT);
  // Sol qui défile
  const map = (strip.material as THREE.MeshStandardMaterial).map; if (map) map.offset.y += dz / (220 / 26);
  for (const d of decor) { d.o.position.z += dz; if (d.o.position.z > 12) d.o.position.z -= 112; }
  if (starField) starField.rotation.y += dt * 0.01;
  // Effets
  for (const p of parts) { p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 5; p.m.rotation.y += dt * 4; if (p.life <= 0) scene.remove(p.m); }
  parts = parts.filter(p => p.life > 0);
  for (const f of flyers) { f.t += dt * 2.2; f.s.position.lerp(new THREE.Vector3(fennec.root.position.x, 2.6, 0.4), Math.min(1, f.t)); f.s.scale.multiplyScalar(1 - dt * 1.2); if (f.t >= 1.3) scene.remove(f.s); }
  flyers = flyers.filter(f => f.t < 1.3);
  // Caméra
  camera.position.set(laneX * 0.55, 4.2, 7.2);
  camera.lookAt(laneX * 0.35, 1.2, -6);
  sun.position.set(laneX - 4, 10, 6); sun.target.position.set(laneX, 0, 0);
  renderer.render(scene, camera);
}

function update(dz: number, dt: number) {
  const r = run!;
  r.dist += dz;
  // Apparitions
  if (!r.finished && r.dist >= r.nextAt) {
    const isRows = r.mission === 'collect' || r.mission === 'music';
    if (r.spawned < r.total) {
      if (isRows) spawnRow(-50, r.mission === 'music' ? 'note' : 'star');
      else {
        const kind: MissionKind = r.mission === 'free' ? shuffle(['find', 'color', 'shape', 'size', 'hide', 'family'] as MissionKind[])[0]! : r.mission;
        challenges.push(makeChallenge(kind, -60));
        if (Math.random() < 0.6) spawnRow(-60 + 16, 'star');
        if (r.level >= 3 && Math.random() < 0.4) spawnObstacle(-60 + 26);
      }
      r.spawned++;
      r.nextAt = r.dist + (isRows ? 14 : 26);
    } else if (!challenges.some(c => !c.resolved) && !pickups.some(p => !p.taken && p.kind !== 'obstacle' && p.z < 1)) {
      finishLevel();
    }
  }
  // Ramassables
  for (const p of pickups) {
    p.z += dz; p.sprite.position.z = p.z; if (p.obj) p.obj.position.z = p.z;
    p.sprite.position.y = 1 + Math.sin(t * 4 + p.z) * 0.15;
    if (!p.taken && p.z > -0.8 && p.z < 0.8) {
      if (p.kind === 'obstacle') { if (p.lane === lane) { jumpT = 1; sJump(); } p.taken = true; continue; }
      if (p.lane === lane || Math.abs(LANES[p.lane]! - laneX) < 0.9) {
        p.taken = true; scene.remove(p.sprite);
        if (p.kind === 'note') sNote(); else sPop(r.countN % 8);
        if (r.mission === 'collect' || r.mission === 'free' || r.mission === 'music') {
          r.countN++;
          if (r.mission === 'collect') { const n = ((r.countN - 1) % 10); say(NUM_FR[n]!.charAt(0).toUpperCase() + NUM_FR[n]!.slice(1) + ' !', [`n${n + 1}`]); }
          renderDots();
        }
      }
    }
    if (p.z > 10) { scene.remove(p.sprite); if (p.obj) scene.remove(p.obj); }
  }
  pickups = pickups.filter(p => p.z <= 10);
  // Défis
  for (const c of challenges) {
    c.z += dz;
    for (const ch of c.choices) { ch.sprite.position.z = c.z; if (!c.resolved) ch.sprite.position.y = ch.size / 2 + 0.45 + Math.sin(t * 3 + ch.lane) * 0.12; }
    c.arch.forEach(a => { a.position.z = c.z; });
    // Cache-cache : l'animal saute dans son cadeau, puis (plus tard) les cadeaux s'échangent
    if (c.kind === 'hide' && c.hider) {
      const cor = c.choices.find(x => x.correct)!;
      if (c.hidePhase === 0 && c.z > -50) { c.hidePhase = 1; say(`${c.target!.fr.charAt(0).toUpperCase() + c.target!.fr.slice(1)} se cache !`, [c.target!.id]); }
      if (c.hidePhase === 1) { c.hider.position.y -= dt * 2.4; c.hider.position.z = c.z; c.hider.position.x = cor.sprite.position.x; if (c.hider.position.y < 1.2) { c.hidePhase = 2; scene.remove(c.hider); sPop(3); } }
      if (c.hidePhase === 2 && !c.swapped && c.z > -38) {
        c.swapped = true;
        const other = c.choices.find(x => !x.correct)!;
        [cor.lane, other.lane] = [other.lane, cor.lane];
      }
      for (const ch of c.choices) ch.sprite.position.x += (LANES[ch.lane]! - ch.sprite.position.x) * Math.min(1, dt * 1.6);
    }
    if (!c.asked && c.z > -28 && (c.kind !== 'hide' || c.hidePhase === 2)) { c.asked = true; say(c.prompt, c.keys); setTarget(c); }
    if (c.asked && !c.hinted && c.answered == null && c.z > -11) { c.hinted = true; say(`${c.target!.kind === 'color' ? 'Le ' + c.target!.fr : c.target!.fr.charAt(0).toUpperCase() + c.target!.fr.slice(1)}… c'est où ?`, c.keys); }
    if (c.hinted && c.answered == null) { const cor = c.choices.find(x => x.correct)!; cor.sprite.scale.setScalar(cor.size * (1 + Math.abs(Math.sin(t * 6)) * 0.25)); }
    if (c.answered == null && !c.resolved && c.z > -4.5) { lane = c.choices.find(x => x.correct)!.lane; }   // Fennou y va tout seul : jamais d'échec
    if (!c.resolved && c.z > -0.6) resolve(c);
    if (c.z > 10) { for (const ch of c.choices) scene.remove(ch.sprite); c.arch.forEach(a => scene.remove(a)); }
  }
  challenges = challenges.filter(c => c.z <= 10);
}

function resolve(c: Challenge) {
  const r = run!;
  c.resolved = true;
  setTarget(null);
  const picked = c.choices.find(x => x.lane === lane) ?? c.choices.find(x => x.correct)!;
  const cor = c.choices.find(x => x.correct)!;
  const st = (prog.stats[c.kind] ??= { ok: 0, n: 0 });
  r.done++;
  const kidOk = c.answered != null && picked.correct;
  if (c.answered != null) { st.n++; if (kidOk) st.ok++; }
  if (kidOk) { r.ok++; wins++; } else r.helped++;
  const it = c.target!;
  const name = it.kind === 'color' ? `Le cœur ${it.fr}` : it.fr.charAt(0).toUpperCase() + it.fr.slice(1);
  if (picked.correct) {
    happyT = 1.2; jumpT = 1; sChime();
    if (c.kind === 'hide') { cor.sprite.material.map = emojiTexture(it.e); cor.sprite.material.needsUpdate = true; }
    say(kidOk ? `Bravo ! ${name} ! ${it.say ?? ''}` : `${name} ! ${it.say ?? ''}`, kidOk ? ['bravo', it.id] : [it.id]);
    parts.push(...confetti(scene, new THREE.Vector3(cor.sprite.position.x, 2, 0), kidOk ? 40 : 15));
    const s = cor.sprite.clone(); scene.add(s); flyers.push({ s, t: 0 }); scene.remove(cor.sprite);
  } else {
    sSoft();
    say(`Oh ! Ça, c'est ${picked.item.kind === 'color' ? 'le cœur ' + picked.item.fr : picked.item.fr}. ${name}, c'est là-bas !`, [it.id]);
  }
  // Album d'autocollants
  if (['animal', 'fruit', 'vehicle'].includes(it.kind) && !prog.album.includes(it.id)) { prog.album.push(it.id); r.newStickers.push(it.id); }
  saveProg();
  renderDots();
}

function finishLevel() {
  const r = run!;
  r.finished = true;
  const rate = r.done ? r.ok / r.done : r.countN >= 12 ? 1 : 0.6;
  r.stars = r.mission === 'collect' || r.mission === 'music' ? (r.countN >= 18 ? 3 : r.countN >= 10 ? 2 : 1) : rate >= 0.8 ? 3 : rate >= 0.5 ? 2 : 1;
  if (!r.free) {
    prog.stars[r.level] = Math.max(prog.stars[r.level] ?? 0, r.stars);
    if (r.level >= prog.unlocked) prog.unlocked = Math.min(LEVELS, r.level + 1);
  }
  prog.plays++;
  saveProg();
  music(false);
  sFanfare();
  parts.push(...confetti(scene, new THREE.Vector3(laneX, 2, -1), 90));
  happyT = 3;
  setTimeout(() => showEnd(r), 1400);
}

function showEnd(r: Run) {
  paused = true;
  show('end'); $('end').hidden = false;
  $('e-stars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= r.stars ? 'on' : ''}" style="animation-delay:${i * 0.25}s">⭐</span>`).join('');
  $('e-text').textContent = r.stars === 3 ? `Super ${kid()} !` : r.stars === 2 ? 'Bravo !' : 'Bien joué !';
  $('e-stickers').innerHTML = r.newStickers.map(id => `<span class="sticker">${byId(id).e}</span>`).join('');
  const nextOutfit = OUTFITS.find(o => o.stars > totalStars() - r.stars && o.stars <= totalStars());
  $('e-outfit').innerHTML = nextOutfit ? `<span class="sticker">${nextOutfit.e}</span> Nouvelle tenue pour Fennou !` : '';
  say(`${$('e-text').textContent} ${r.newStickers.length ? 'Un nouvel ami dans ton album !' : ''}`, ['bravo']);
  if (Date.now() - sessionStart > cfg.mins * 60_000) setTimeout(sleep, 3500);
}

// ── Carte des mondes ──────────────────────────────────────────────────────────
function renderMap() {
  const ts = totalStars();
  $('m-stars').textContent = `⭐ ${ts}`;
  $('m-worlds').innerHTML = WORLDS.map((w, wi) => {
    const lv = Array.from({ length: 6 }, (_, i) => wi * 6 + i);
    const locked = wi * 6 > prog.unlocked;
    return `<section class="world ${locked ? 'locked' : ''}" style="--a:${w.sky[0]};--b:${w.sky[1]}">
      <h2>${['🏜️', '🌴', '🐄', '🌊', '🏙️', '🪐'][wi]} ${w.name}</h2>
      <div class="levels">${lv.map(l => {
        const st = prog.stars[l] ?? 0, open = l <= prog.unlocked, cur = l === prog.unlocked;
        return `<button class="lvl ${open ? '' : 'off'} ${cur ? 'cur' : ''}" data-l="${l}" ${open ? '' : 'disabled'}><b>${MISSION_ICON[w.missions[l % 6]!]}</b><small>${open ? '⭐'.repeat(st) || '·' : '🔒'}</small></button>`;
      }).join('')}</div></section>`;
  }).join('');
  $('m-worlds').querySelectorAll<HTMLButtonElement>('.lvl').forEach(b => b.addEventListener('click', () => { audio(); startLevel(Number(b.dataset.l)); }));
  $('m-fennec').textContent = OUTFITS.find(o => o.id === prog.outfit)?.e ?? '🦊';
  requestAnimationFrame(() => document.querySelector('.lvl.cur')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}
function toMap() {
  clearRun(); run = null; paused = true; music(false);
  applyWorld(WORLDS[Math.min(WORLDS.length - 1, Math.floor(prog.unlocked / 6))]!);
  show('map'); $('map').hidden = false; renderMap();
}

// ── Album, placard, sommeil, parents ──────────────────────────────────────────
function renderAlbum() {
  const list = ITEMS.filter(i => ['animal', 'fruit', 'vehicle'].includes(i.kind));
  $('a-count').textContent = `${prog.album.length} / ${list.length}`;
  $('a-grid').innerHTML = list.map(i => `<button class="st ${prog.album.includes(i.id) ? '' : 'no'}" data-i="${i.id}">${prog.album.includes(i.id) ? i.e : '❔'}</button>`).join('');
  $('a-grid').querySelectorAll<HTMLButtonElement>('.st').forEach(b => b.addEventListener('click', () => {
    const it = byId(b.dataset.i!);
    if (!prog.album.includes(it.id)) { say('Celui-là, on le trouvera en jouant !'); return; }
    b.classList.remove('bounce'); void b.offsetWidth; b.classList.add('bounce'); sPop(2);
    say(`${it.fr.charAt(0).toUpperCase() + it.fr.slice(1)} ! ${it.say ?? ''}`, [it.id]);
  }));
}
function renderCloset() {
  const ts = totalStars();
  $('c-grid').innerHTML = OUTFITS.map(o => `<button class="st ${ts >= o.stars ? '' : 'no'} ${prog.outfit === o.id ? 'sel' : ''}" data-o="${o.id}">${o.e}<small>${ts >= o.stars ? '' : `⭐ ${o.stars}`}</small></button>`).join('');
  $('c-grid').querySelectorAll<HTMLButtonElement>('.st').forEach(b => b.addEventListener('click', () => {
    const o = OUTFITS.find(x => x.id === b.dataset.o)!;
    if (ts < o.stars) { say('Encore des étoiles et Fennou pourra la mettre !'); return; }
    prog.outfit = o.id; saveProg(); dressFennec(fennec, o.id); sChime(); say(`${o.name} ! Trop beau Fennou !`); renderCloset();
  }));
}
function report() {
  const min = (Date.now() - sessionStart) / 60_000;
  if (min >= 0.5) try { parent.postMessage({ type: 'fennou:session', game: 'La grande course', minutes: Math.max(1, Math.round(min)), wins }, '*'); } catch { /* */ }
}
function sleep() {
  clearRun(); run = null; paused = true; music(false);
  show('sleep'); $('sleep').hidden = false;
  say(`Fennou est fatigué… Il va faire dodo. Bravo ${kid()}, à demain !`);
  report();
}

// Coin parents : appui long de 2 secondes (le petit ne peut pas sortir tout seul)
function longPress(el: HTMLElement, ms: number, fn: () => void) {
  let tm: ReturnType<typeof setTimeout> | null = null;
  const start = (e: Event) => { e.preventDefault(); el.classList.add('hold'); tm = setTimeout(() => { el.classList.remove('hold'); fn(); }, ms); };
  const stop = () => { el.classList.remove('hold'); if (tm) clearTimeout(tm); tm = null; };
  el.addEventListener('pointerdown', start); el.addEventListener('pointerup', stop); el.addEventListener('pointerleave', stop); el.addEventListener('pointercancel', stop);
}
function openParents() {
  paused = true; music(false);
  show('parents'); $('parents').hidden = false;
  ($('p-mins') as HTMLSelectElement).value = String(cfg.mins);
  ($('p-speed') as HTMLSelectElement).value = String(cfg.speed);
  ($('p-voice') as HTMLSelectElement).value = cfg.voice;
  ($('p-sound') as HTMLInputElement).checked = prog.sound;
  const s = Object.entries(prog.stats).map(([k, v]) => `${MISSION_ICON[k as MissionKind]} ${Math.round(v!.ok / Math.max(1, v!.n) * 100)} % (${v!.n})`).join(' · ');
  $('p-stats').textContent = `${prog.plays} niveaux joués · ${totalStars()} étoiles · ${prog.album.length} autocollants. Réussite sans aide : ${s || '—'}`;
}
$('p-mins').addEventListener('change', e => { cfg.mins = Number((e.target as HTMLSelectElement).value); saveCfg(); });
$('p-speed').addEventListener('change', e => { cfg.speed = Number((e.target as HTMLSelectElement).value); saveCfg(); });
$('p-voice').addEventListener('change', e => { cfg.voice = (e.target as HTMLSelectElement).value as FennouCfg['voice']; saveCfg(); });
$('p-sound').addEventListener('change', e => { prog.sound = (e.target as HTMLInputElement).checked; saveProg(); });
$('p-close').addEventListener('click', () => { if (run && !run.finished) { show('hud'); $('hud').hidden = false; paused = false; music(true); } else toMap(); });
$('p-map').addEventListener('click', toMap);
$('p-fennou').addEventListener('click', () => { report(); location.href = '../fennou.html'; });
$('p-quit').addEventListener('click', () => { report(); try { parent.postMessage({ type: 'fennou:exit' }, '*'); } catch { /* */ } });
$('p-reset').addEventListener('click', () => { if (!confirm('Effacer la progression (étoiles, album, tenues) ?')) return; prog = { unlocked: 0, stars: {}, album: [], outfit: 'none', stats: {}, sound: true, plays: 0 }; saveProg(); dressFennec(fennec, 'none'); toMap(); });
$('p-awake').addEventListener('click', () => { toMap(); });
document.querySelectorAll<HTMLElement>('.lock').forEach(el => longPress(el, 2000, openParents));

$('m-play').addEventListener('click', () => { audio(); startLevel(Math.min(prog.unlocked, LEVELS - 1)); });
$('m-free').addEventListener('click', () => { audio(); startLevel(prog.unlocked, true); });
$('m-album').addEventListener('click', () => { show('album'); $('album').hidden = false; renderAlbum(); say('Ton album !'); });
$('m-closet').addEventListener('click', () => { show('closet'); $('closet').hidden = false; renderCloset(); say('Habille Fennou !'); });
document.querySelectorAll<HTMLElement>('.back').forEach(b => b.addEventListener('click', toMap));
$('e-next').addEventListener('click', () => { if (Date.now() - sessionStart > cfg.mins * 60_000) { sleep(); return; } const r = run; if (r?.free) startLevel(r.level, true); else startLevel(Math.min(prog.unlocked, LEVELS - 1)); });
$('e-map').addEventListener('click', toMap);

// ── Toucher l'écran pendant la course ─────────────────────────────────────────
canvas.addEventListener('pointerdown', e => {
  audio();
  if (!run || paused || run.finished) return;
  const v = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(v, camera);
  // 1) Il touche une image d'un défi → Fennou y va
  const open = challenges.filter(c => !c.resolved && c.z > -40);
  const sprites = open.flatMap(c => c.choices.map(ch => ch.sprite));
  const hit = ray.intersectObjects(sprites, false)[0];
  if (hit) {
    for (const c of open) {
      const ch = c.choices.find(x => x.sprite === hit.object);
      if (ch) { lane = ch.lane; c.answered = ch.lane; sPop(ch.lane); ch.sprite.scale.setScalar(ch.size * 1.25); setTimeout(() => ch.sprite.scale.setScalar(ch.size), 180); return; }
    }
  }
  // 2) Il touche une étoile / note → Fennou va sur sa voie (la note joue tout de suite)
  const ph = ray.intersectObjects(pickups.filter(p => !p.taken && p.kind !== 'obstacle').map(p => p.sprite), false)[0];
  if (ph) { const p = pickups.find(x => x.sprite === ph.object)!; lane = p.lane; if (p.kind === 'note') sNote(); else sPop(1); return; }
  // 3) Ailleurs : gauche / droite de l'écran, au milieu = saut
  const third = e.clientX / innerWidth;
  const before = lane;
  if (third < 0.36) lane = Math.max(0, lane - 1); else if (third > 0.64) lane = Math.min(2, lane + 1); else { jumpT = 1; sJump(); }
  if (lane !== before) { sPop(lane); for (const c of open) if (c.asked && c.answered == null && c.z > -14) c.answered = lane; }
});

// Pause automatique si l'appli passe en arrière-plan
document.addEventListener('visibilitychange', () => { if (document.hidden && run && !paused) { paused = true; music(false); } else if (!document.hidden && run && !run.finished && $('parents').hidden) { paused = false; music(true); } });

applyWorld(WORLDS[Math.min(WORLDS.length - 1, Math.floor(prog.unlocked / 6))]!);
toMap();
loop();
