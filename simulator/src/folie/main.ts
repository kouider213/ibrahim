import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeBean, animateBean, dressHat, COLORS, type Bean, type Costume, type Hat, type Pattern, type BeanPose } from './bean.ts';
import { buildRound, textTex, type Round, type RoundKind } from './course.ts';
import { audioUnlock, sfx, music, setMuted, isMuted, duck, setTempo } from '../games/audio.ts';
import { exitGame, fromHub, bootIdentity, games, online, local, otherOf, rng, serverNow, syncClock, vibrate, type Room, type Uid } from '../games/net.ts';
import { getDeviceToken } from '../services/api.ts';

// LA GRANDE FOLIE — jeu de fête façon Fall Guys / Stumble Guys pour Kouider et Fatima : 20 haricots (vous + des
// adversaires joués par l'ordi), 3 manches éliminatoires (course d'obstacles, tuiles qui fondent, saute-barre),
// une seule couronne. Vraie physique (Rapier) : on se bouscule, on glisse, on vole, on tombe dans la gelée.

bootIdentity({ name: 'La Grande Folie', short: 'Folie', color: '#5b8cff', icon: '/ibrahim/icons/folie-512.png' });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const AR: Record<string, string> = { play: 'العب', duo: 'معًا', shop: 'الأزياء', 'QUALIFIÉ !': 'تأهلت!', 'ÉLIMINÉ': 'خرجت', 'Manche': 'الجولة', Qualifiés: 'المتأهلون', 'En vie': 'الأحياء', 'VICTOIRE !': 'فوز!', Couronnes: 'تيجان', Pièces: 'قطع', Rejouer: 'العب مجددًا', Menu: 'القائمة', Couleur: 'اللون', 'Couleur 2': 'اللون 2', Motif: 'النقش', Chapeau: 'القبعة', Fermer: 'إغلاق', Prêt: 'جاهز', 'En attente…': 'في الانتظار…', Quitter: 'خروج', 'te défie à LA GRANDE FOLIE !': 'يتحداك في الجنون الكبير!', 'Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.': 'افتح اللعبة من التطبيق للعب معًا.', Spectateur: 'متفرج' };
const t = (s: string) => (lang === 'ar' ? AR[s] ?? s : s);
function applyLang() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { const k = el.dataset.t!; el.dataset.fr ??= el.textContent ?? ''; el.textContent = lang === 'ar' ? AR[k] ?? el.dataset.fr : el.dataset.fr; }); $('bLang').textContent = lang === 'ar' ? 'FR' : 'ع'; }

// ── Sauvegarde ───────────────────────────────────────────────────────────────
const HATS: Array<{ id: Hat; e: string; price: number }> = [{ id: 'none', e: '—', price: 0 }, { id: 'cap', e: '🧢', price: 0 }, { id: 'scarf', e: '🧕', price: 0 }, { id: 'cat', e: '🐱', price: 300 }, { id: 'bunny', e: '🐰', price: 400 }, { id: 'flower', e: '🌸', price: 500 }, { id: 'chef', e: '👨‍🍳', price: 600 }, { id: 'fez', e: '🎩', price: 800 }, { id: 'horns', e: '😈', price: 1000 }, { id: 'halo', e: '😇', price: 1500 }, { id: 'crown', e: '👑', price: 5000 }];
const PATS: Array<{ id: Pattern; e: string; price: number }> = [{ id: 'plain', e: 'Uni', price: 0 }, { id: 'stripes', e: 'Rayures', price: 0 }, { id: 'dots', e: 'Pois', price: 200 }, { id: 'half', e: 'Deux tons', price: 200 }, { id: 'stars', e: 'Étoiles', price: 500 }, { id: 'zigzag', e: 'Zigzag', price: 700 }];
interface Save { costume: Costume; owned: string[]; kudos: number; crowns: number; quality: 'high' | 'low' }
const isFemme = (() => { try { return !!localStorage.getItem('forme:token') && !getDeviceToken(); } catch { return false; } })();
const save: Save = { costume: isFemme ? { body: '#c38bff', body2: '#ffffff', pattern: 'dots', hat: 'scarf', face: '#fde7d4' } : { body: '#ff6fa5', body2: '#ffffff', pattern: 'stripes', hat: 'cap', face: '#fde7d4' }, owned: [], kudos: 0, crowns: 0, quality: 'high', ...local.json<Partial<Save>>('folie', {}) };
const persist = () => local.save('folie', save);
const BOTS = ['Tonton Bourek', 'Mamie Chorba', 'Petit Fennec', 'Ammi Moh', 'Lalla Mimi', 'Dz Ninja', 'Sardine', 'Loubia Boy', 'Baklawa', 'Mhajeb Queen', 'Didou', 'Yasmina', 'Rayan', 'Inès', 'Bilel', 'Zlabia', 'Hmida', 'Kalb Lbhar', 'Chamia', 'Cheb Haricot', 'Mesfouf', 'Tamina'];

// ── Rendu ────────────────────────────────────────────────────────────────────
await RAPIER.init();
const renderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>('stage'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, save.quality === 'high' ? 2 : 1.25)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92; renderer.shadowMap.enabled = save.quality === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.32;
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { t: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform float t; varying vec3 vP; void main(){ float y = vP.y; vec3 top = vec3(0.12,0.32,0.95), mid = vec3(0.38,0.7,1.0), low = vec3(0.98,0.62,0.9); vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0,0.7,y)) : mix(mid, low, smoothstep(0.0,-0.3,y)); float a = atan(vP.x, vP.z); float rays = smoothstep(0.6,1.0, sin(a*14.0 + t*0.2)) * 0.05 * smoothstep(0.0,0.6,y); gl_FragColor = vec4(c + rays, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat));
scene.fog = new THREE.Fog('#7fb2ff', 110, 380);
const hemi = new THREE.HemisphereLight('#ffffff', '#9a7cff', 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!; for (let i = 0; i < 16; i++) { const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } return new THREE.CanvasTexture(c); })();
const clouds = new THREE.Group(); scene.add(clouds); for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.95, fog: false, depthWrite: false })); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 200; s.position.set(Math.cos(a) * d, -30 + Math.random() * 90, Math.sin(a) * d); s.scale.set(60 + Math.random() * 60, 26 + Math.random() * 20, 1); clouds.add(s); }
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.4, 0.9); composer.addPass(bloom); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ── Joueurs ──────────────────────────────────────────────────────────────────
interface P {
  id: string; name: string; human: boolean; remote: boolean; bean: Bean; body: RAPIER.RigidBody | null; col: RAPIER.Collider | null;
  state: 'play' | 'qual' | 'out' | 'spec'; ground: boolean; jumpCd: number; dive: number; tumble: number; yaw: number; lastV: THREE.Vector3; cp: number;
  ai: { lane: number; skill: number; jumpT: number; tx: number; tz: number; retarget: number; stuck: number; fakeDoors: Set<number> }; finish: number; tx: number; ty: number; tz: number; pose: BeanPose; land: boolean;
}
let world: RAPIER.World = new RAPIER.World({ x: 0, y: -28, z: 0 });
let round: Round | null = null; let players: P[] = []; let roundIdx = 0; let roundT = -4; let quota = 0; let qualified = 0; let seed = 1;
type Mode = 'menu' | 'intro' | 'play' | 'end' | 'over';
let mode: Mode = 'menu'; let duoRoom: Room | null = null; let names: Record<Uid, string> = { kouider: 'Kouider', femme: 'Fatima' }; let me: Uid = 'kouider';
const SEQ: RoundKind[] = ['race', 'tiles', 'jump'];
const me$ = () => players.find(p => p.human && !p.remote)!;

function costumeFor(i: number, R: ReturnType<typeof rng>): Costume { const pats: Pattern[] = ['plain', 'stripes', 'dots', 'half', 'stars', 'zigzag']; const hats: Hat[] = ['none', 'cap', 'cat', 'bunny', 'flower', 'chef', 'horns', 'fez', 'none', 'none']; return { body: COLORS[(i * 5 + Math.floor(R() * 12)) % 12]!, body2: COLORS[(i * 7 + 3) % 12]!, pattern: R.pick(pats), hat: R.pick(hats), face: '#fde7d4' }; }
function makeBody(x: number, y: number, z: number, kinematic: boolean) {
  const bd = (kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic().lockRotations().setCcdEnabled(true).setLinearDamping(0.2)).setTranslation(x, y, z);
  const body = world.createRigidBody(bd); body.userData = { bean: true };
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.31, 0.46).setFriction(0.15).setRestitution(0.05).setDensity(1.2), body);
  return { body, col };
}
function spawnPlayers(list: Array<{ id: string; name: string; human: boolean; remote: boolean; costume: Costume }>) {
  for (const p of players) scene.remove(p.bean.root); players = [];
  const R = rng(seed ^ 0xabc);
  list.forEach((d, i) => {
    const sp = round!.spawn[i % round!.spawn.length]!;
    const bean = makeBean(d.costume, d.human ? d.name : undefined, d.remote ? '#ffe14d' : '#ffffff'); scene.add(bean.root);
    const { body, col } = makeBody(sp.x, sp.y, sp.z, d.remote);
    players.push({ ...d, bean, body, col, state: 'play', ground: false, jumpCd: 0, dive: 0, tumble: 0, yaw: Math.PI, lastV: new THREE.Vector3(), cp: 0, ai: { lane: (R() - 0.5) * 9, skill: 0.72 + R() * 0.28, jumpT: R() * 2, tx: 0, tz: 0, retarget: 0, stuck: 0, fakeDoors: new Set() }, finish: 0, tx: sp.x, ty: sp.y, tz: sp.z, pose: 'idle', land: false });
  });
}
function newWorld() { world.free(); world = new RAPIER.World({ x: 0, y: -28, z: 0 }); }

// ── Entrées ──────────────────────────────────────────────────────────────────
const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }; const cam = { yaw: 0, pitch: 0.42, dragId: -1, lx: 0 }; const keys = new Set<string>(); let wantJump = false, wantDive = false;
addEventListener('pointerdown', e => {
  audioUnlock(); if ((e.target as HTMLElement).closest('button, .sheet')) return; if (mode !== 'play') return;
  if (e.clientX < innerWidth * 0.5 && !joy.on) { joy.on = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; const j = $('joy'); j.hidden = false; j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; $('joyK').style.transform = 'translate(-50%,-50%)'; }
  else if (cam.dragId < 0) { cam.dragId = e.pointerId; cam.lx = e.clientX; }
});
addEventListener('pointermove', e => {
  if (joy.on && e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), mx = 56; if (d > mx) { dx *= mx / d; dy *= mx / d; } joy.x = dx / mx; joy.y = dy / mx; $('joyK').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; }
  if (e.pointerId === cam.dragId) { cam.yaw -= (e.clientX - cam.lx) * 0.008; cam.lx = e.clientX; }
});
const up = (e: PointerEvent) => { if (e.pointerId === joy.id) { joy.on = false; joy.x = joy.y = 0; $('joy').hidden = true; } if (e.pointerId === cam.dragId) cam.dragId = -1; };
addEventListener('pointerup', up); addEventListener('pointercancel', up);
addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') wantJump = true; if (e.key.toLowerCase() === 'e' || e.key === 'Shift') wantDive = true; });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
$('bJump').addEventListener('pointerdown', e => { e.stopPropagation(); wantJump = true; });
$('bDive').addEventListener('pointerdown', e => { e.stopPropagation(); wantDive = true; });

// ── Interface ────────────────────────────────────────────────────────────────
function toast(s: string) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }
function big(b: string, s = '', bad = false, ms = 1800) { const d = document.createElement('div'); d.className = 'big'; d.innerHTML = `<div><b class="${bad ? 'bad' : ''}">${b}</b>${s ? `<span class="out">${s}</span>` : ''}</div>`; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
function sheet(h: string) { $('sheet').innerHTML = h ? `<div class="sheet"><div class="card">${h}</div></div>` : ''; }
const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = () => { audioUnlock(); sfx.click(); fn(); }; };
let menuBean: Bean | null = null; let podium: THREE.Group | null = null;
function renderMenu() {
  $('mCrowns').textContent = String(save.crowns); $('mKudos').textContent = save.kudos.toLocaleString('fr-FR'); $('bSound').textContent = isMuted() ? '🔇' : '🔊'; $('bExit').hidden = !embedded && !fromHub();
}
async function refreshBoard() { if (!online()) return; try { const b = await games.board(); names = b.names; me = b.me; const r = b.board.folie ?? {}; $('duel').hidden = false; $('duel').innerHTML = `<div class="chip">${names.kouider} <b>👑 ${r.kouider?.best ?? 0}</b></div><div class="chip">${names.femme} <b>👑 ${r.femme?.best ?? 0}</b></div>`; } catch { /* */ } }
function showMenu() {
  mode = 'menu'; sheet(''); $('menu').hidden = false; $('hud').hidden = true; $('ctrl').hidden = true;
  if (round) { scene.remove(round.group); round = null; } for (const p of players) scene.remove(p.bean.root); players = []; newWorld();
  if (!podium) { podium = new THREE.Group(); const top = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.8, 48), new THREE.MeshPhysicalMaterial({ color: '#ffe14d', roughness: 0.35, clearcoat: 0.7 })); top.position.y = -0.4; top.receiveShadow = true; podium.add(top); const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.18, 12, 48), new THREE.MeshPhysicalMaterial({ color: '#ff6fa5', clearcoat: 0.8, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; podium.add(ring); const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.2, 6, 32), new THREE.MeshPhysicalMaterial({ color: '#8b8cff', roughness: 0.4 })); base.position.y = -3.8; podium.add(base); }
  scene.add(podium);
  if (menuBean) scene.remove(menuBean.root); menuBean = makeBean(save.costume); scene.add(menuBean.root);
  music(true, 'rush'); setTempo(116); duck(0.4); renderMenu(); void refreshBoard();
}
on('bSound', () => { setMuted(!isMuted()); renderMenu(); });
on('bLang', () => { lang = lang === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('jeux:lang', lang); } catch { /* */ } applyLang(); });
on('bExit', exitGame);
on('bPlay', () => startShow(Math.floor(Math.random() * 1e9), false));
on('bDuo', () => void openDuo()); on('bShop', showShop);
function showShop() {
  const c = save.costume; const own = (k: string, price: number) => price === 0 || save.owned.includes(k);
  sheet(`<h2>👕 Costumes</h2><div class="lead">🪙 ${save.kudos.toLocaleString('fr-FR')}</div>
    <div class="lbl">${t('Couleur')}</div><div class="sw">${COLORS.map(x => `<button data-c="${x}" class="${c.body === x ? 'on' : ''}" style="background:${x}"></button>`).join('')}</div>
    <div class="lbl">${t('Couleur 2')}</div><div class="sw">${COLORS.map(x => `<button data-c2="${x}" class="${c.body2 === x ? 'on' : ''}" style="background:${x}"></button>`).join('')}</div>
    <div class="lbl">${t('Motif')}</div><div class="sw t">${PATS.map(p => `<button data-p="${p.id}" class="${c.pattern === p.id ? 'on' : ''} ${own('p:' + p.id, p.price) ? '' : 'lock'}">${p.e}${own('p:' + p.id, p.price) ? '' : ` · 🪙${p.price}`}</button>`).join('')}</div>
    <div class="lbl">${t('Chapeau')}</div><div class="sw t">${HATS.map(h => `<button data-h="${h.id}" class="${c.hat === h.id ? 'on' : ''} ${own('h:' + h.id, h.price) ? '' : 'lock'}">${h.e}${own('h:' + h.id, h.price) ? '' : ` 🪙${h.price}`}</button>`).join('')}</div>
    <button class="btn y" id="sClose" style="width:100%">✓</button>`);
  const apply = () => { persist(); if (menuBean) scene.remove(menuBean.root); menuBean = makeBean(save.costume); scene.add(menuBean.root); sfx.click(); showShop(); };
  document.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(b => b.onclick = () => { save.costume.body = b.dataset.c!; apply(); });
  document.querySelectorAll<HTMLButtonElement>('[data-c2]').forEach(b => b.onclick = () => { save.costume.body2 = b.dataset.c2!; apply(); });
  const buy = (k: string, price: number) => { if (own(k, price)) return true; if (save.kudos < price) { sfx.wrong(); toast(`🪙 ${price}`); return false; } save.kudos -= price; save.owned.push(k); sfx.power(); return true; };
  document.querySelectorAll<HTMLButtonElement>('[data-p]').forEach(b => b.onclick = () => { const p = PATS.find(x => x.id === b.dataset.p)!; if (buy('p:' + p.id, p.price)) { save.costume.pattern = p.id; apply(); } });
  document.querySelectorAll<HTMLButtonElement>('[data-h]').forEach(b => b.onclick = () => { const h = HATS.find(x => x.id === b.dataset.h)!; if (buy('h:' + h.id, h.price)) { save.costume.hat = h.id; apply(); } });
  on('sClose', () => { sheet(''); renderMenu(); });
}

// ── Déroulé d'une partie ─────────────────────────────────────────────────────
let roster: Array<{ id: string; name: string; human: boolean; remote: boolean; costume: Costume }> = [];
let remoteCostume: Costume | null = null;
function startShow(sd: number, duo: boolean) {
  seed = sd; roundIdx = 0; const R = rng(seed);
  const myName = online() ? names[me] : (isFemme ? 'Fatima' : 'Kouider');
  roster = [{ id: 'me', name: myName, human: true, remote: false, costume: save.costume }];
  if (duo && duoRoom) roster.push({ id: 'them', name: names[otherOf(duoRoom.me)], human: true, remote: true, costume: remoteCostume ?? { body: '#4fd1ff', body2: '#ffffff', pattern: 'dots', hat: 'none', face: '#fde7d4' } });
  const bots = [...BOTS].sort(() => R() - 0.5);
  while (roster.length < 20) { const i = roster.length; roster.push({ id: `b${i}`, name: bots[i % bots.length]!, human: false, remote: false, costume: costumeFor(i, R) }); }
  if (menuBean) { scene.remove(menuBean.root); menuBean = null; } if (podium) scene.remove(podium);
  startRound();
}
function startRound() {
  const kind = SEQ[roundIdx]!; newWorld(); if (round) scene.remove(round.group);
  const alive = roster.length; round = buildRound(world, scene, kind, rng(seed + roundIdx * 7919), alive);
  quota = kind === 'race' ? Math.max(1, Math.round(alive * 0.6)) : kind === 'tiles' ? Math.max(1, Math.round(alive * 0.5)) : 1; qualified = 0;
  spawnPlayers(roster); roundT = -4.2; mode = 'intro'; $('menu').hidden = true; $('hud').hidden = false; $('ctrl').hidden = false; sheet('');
  cam.yaw = kind === 'race' ? 0 : 0;
  const card = document.createElement('div'); card.className = 'card-round'; card.innerHTML = `<div><small>${t('Manche')} ${roundIdx + 1} / ${SEQ.length}</small><h2>${lang === 'ar' ? round.nameAr : round.name}</h2><p>${lang === 'ar' ? round.goalAr : round.goal}</p></div>`; document.body.appendChild(card);
  sfx.power(); duck(0.3);
  setTimeout(() => { card.remove(); countdown(); }, 2600);
}
function countdown() { let n = 3; const tick = () => { if (n > 0) { big(String(n), '', false, 800); sfx.tick(); n--; setTimeout(tick, 550); } else { big('GO !', '', false, 900); sfx.go(); mode = 'play'; roundT = 0; music(true, 'rush'); setTempo(round?.kind === 'jump' ? 132 : 124); duck(0.45); } }; tick(); }
function qualify(p: P) {
  if (p.state !== 'play') return; p.state = 'qual'; qualified++; p.finish = roundT;
  if (p.human && !p.remote) { big(t('QUALIFIÉ !'), `${qualified} / ${quota}`); sfx.win(); confetti(); vibrate([30, 40, 30]); save.kudos += 40 + Math.max(0, quota - qualified) * 5; persist(); }
  if (p.body) { world.removeRigidBody(p.body); p.body = null; p.col = null; }
  if (round?.kind === 'race') p.bean.root.visible = false;
  if (qualified >= quota) endRound();
}
function eliminate(p: P) {
  if (p.state !== 'play') return; p.state = 'out';
  if (p.body) { world.removeRigidBody(p.body); p.body = null; p.col = null; } p.bean.root.visible = false;
  if (p.human && !p.remote) { big(t('ÉLIMINÉ'), '', true, 2200); sfx.lose(); vibrate(120); }
  if (round && round.kind !== 'race') { const alive = players.filter(x => x.state === 'play').length; if (alive <= quota) endRound(); }
}
function endRound() {
  if (mode !== 'play') return; mode = 'end';
  const kind = round!.kind;
  // ceux encore en jeu : qualifiés (survie) ou éliminés (course)
  for (const p of players) if (p.state === 'play') { if (kind === 'race') p.state = 'out'; else { p.state = 'qual'; qualified++; } }
  const meP = me$(); const iQual = meP.state === 'qual';
  if (duoRoom) void games.room('state', { state: netState(), score: roundIdx }).catch(() => {});
  setTimeout(() => {
    if (kind === 'jump' || players.filter(p => p.state === 'qual').length <= 1) { finale(); return; }
    roster = roster.filter(r => players.find(p => p.id === r.id)?.state === 'qual' || (r.human && duoRoom && iQual === false && false));
    if (!roster.some(r => r.id === 'me')) {
      // éliminé : on montre la suite en spectateur si l'autre humain continue, sinon résultats
      if (roster.some(r => r.id === 'them')) { roster.push({ id: 'me', name: names[me], human: true, remote: false, costume: save.costume }); spectating = true; }
      else { over(false); return; }
    }
    roundIdx++; startRound();
  }, 2600);
}
let spectating = false;
function finale() {
  const winner = players.find(p => p.state === 'qual') ?? players.find(p => p.state === 'play');
  const iWin = winner?.id === 'me' && !spectating;
  over(iWin, winner?.name);
}
async function over(win: boolean, winnerName?: string) {
  mode = 'over'; $('ctrl').hidden = true; $('joy').hidden = true;
  if (win) { save.crowns++; save.kudos += 500; big('👑', t('VICTOIRE !'), false, 3000); confetti(); sfx.win(); } else sfx.lose();
  persist(); spectating = false;
  if (online()) void games.score('folie', save.crowns).catch(() => {});
  setTimeout(() => {
    sheet(`<h2>${win ? '👑 ' + t('VICTOIRE !') : winnerName ? `👑 ${winnerName}` : t('ÉLIMINÉ')}</h2><div class="lead">${t('Manche')} ${roundIdx + 1} / ${SEQ.length}</div>
      <div class="res"><div>${t('Couronnes')}<b>👑 ${save.crowns}</b></div><div>${t('Pièces')}<b>🪙 ${save.kudos.toLocaleString('fr-FR')}</b></div></div>
      <div style="display:grid;gap:10px"><button class="btn y" id="oAgain">↻ ${t('Rejouer')}</button><button class="btn w" id="oMenu">${t('Menu')}</button></div>`);
    on('oAgain', () => { if (duoRoom) { void games.room('rematch').then(v => { duoRoom = v.room; showMenu(); lobby(); }).catch(() => showMenu()); } else startShow(Math.floor(Math.random() * 1e9), false); });
    on('oMenu', async () => { if (duoRoom) { try { await games.room('leave'); } catch { /* */ } duoRoom = null; } showMenu(); });
  }, win ? 2600 : 1400);
}

// ── Simulation ───────────────────────────────────────────────────────────────
const RAYDIR = { x: 0, y: -1, z: 0 };
function grounded(p: P) {
  if (!p.body) return false; const tr = p.body.translation();
  const hit = world.castRay(new RAPIER.Ray({ x: tr.x, y: tr.y - 0.7, z: tr.z }, RAYDIR), 0.22, true, undefined, undefined, p.col ?? undefined, p.body);
  if (hit && round?.kind === 'tiles' && mode === 'play') { const tile = round.tiles.find(tt => tt.col.handle === hit.collider.handle); if (tile && tile.state === 0) { tile.state = 1; tile.t = 0; } }
  return !!hit;
}
function control(p: P, dx: number, dz: number, jump: boolean, dive: boolean, dt: number) {
  const b = p.body; if (!b) return; const v = b.linvel();
  const was = p.ground; p.ground = grounded(p);
  if (p.ground && !was && v.y < -6) { p.bean.squash = 1; if (p.human && !p.remote) sfx.land(); }
  // choc reçu (obstacle) → culbute
  const dv = Math.hypot(v.x - p.lastV.x, v.z - p.lastV.z);
  if (dv > 9 && p.tumble <= 0 && p.dive <= 0) { p.tumble = 1.1; if (p.human && !p.remote) { vibrate(60); sfx.crash(); } }
  p.tumble = Math.max(0, p.tumble - dt); p.dive = Math.max(0, p.dive - dt); p.jumpCd = Math.max(0, p.jumpCd - dt);
  let nvx = v.x, nvz = v.z, nvy = v.y;
  if (p.tumble <= 0 && p.dive <= 0) {
    const sp = 7.6 * (p.human ? 1 : p.ai.skill * 0.95 + 0.06); const acc = p.ground ? 46 : 16;
    const tx = dx * sp, tz = dz * sp; const ddx = tx - v.x, ddz = tz - v.z; const dl = Math.hypot(ddx, ddz), mx = acc * dt;
    if (dl > mx) { nvx = v.x + ddx / dl * mx; nvz = v.z + ddz / dl * mx; } else { nvx = tx; nvz = tz; }
    if (Math.hypot(dx, dz) > 0.1) p.yaw = Math.atan2(dx, dz);
    if (jump && p.ground && p.jumpCd <= 0) { nvy = 10.5; p.jumpCd = 0.25; p.ground = false; if (p.human && !p.remote) sfx.jump(); }
    if (dive && p.jumpCd <= 0) { const f = 10.5; nvx = Math.sin(p.yaw) * f; nvz = Math.cos(p.yaw) * f; nvy = p.ground ? 5 : Math.max(v.y, 2.5); p.dive = 0.75; p.jumpCd = 0.6; if (p.human && !p.remote) sfx.slide(); }
  }
  if (p.dive > 0) p.col?.setHalfHeight(0.04); else p.col?.setHalfHeight(0.31);
  b.setLinvel({ x: nvx, y: nvy, z: nvz }, true); p.lastV.set(nvx, nvy, nvz);
}
function botThink(p: P, dt: number): [number, number, boolean, boolean] {
  const tr = p.body!.translation(); const r = round!; const A = p.ai; let dx = 0, dz = 0, jump = false, dive = false;
  A.jumpT -= dt; A.retarget -= dt;
  if (r.kind === 'race') {
    A.lane += (Math.random() - 0.5) * dt * 2; A.lane = Math.max(-5, Math.min(5, A.lane));
    // portes : vise une porte pas encore reconnue comme fausse
    const row = r.doors.filter(d => d.mesh.position.z < tr.z && d.mesh.position.z > tr.z - 7 && d.open === 0);
    if (row.length) { let best = row[0]!, bd = 1e9; for (const d of row) { if (A.fakeDoors.has(d.body.handle)) continue; const dd = Math.abs(d.mesh.position.x - tr.x) + (d.real ? 0 : 0.3); if (dd < bd) { bd = dd; best = d; } } A.lane = best.mesh.position.x; if (Math.abs(best.mesh.position.z - tr.z) < 1.2 && !best.real) A.fakeDoors.add(best.body.handle); }
    dx = (A.lane - tr.x) * 0.35; dz = -1; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    for (const h of r.jumpHints) if (tr.z < h.z0 && tr.z > h.z1 && A.jumpT <= 0) { jump = true; A.jumpT = 0.5 + Math.random() * (1.4 - A.skill); }
    const v = p.body!.linvel(); if (Math.hypot(v.x, v.z) < 1.2) { A.stuck += dt; if (A.stuck > 0.5) { jump = true; A.lane += (Math.random() - 0.5) * 6; A.stuck = 0; } } else A.stuck = 0;
    if (Math.random() < dt * 0.15 * A.skill) dive = true;
  } else if (r.kind === 'tiles') {
    if (A.retarget <= 0) { const opts = r.tiles.filter(tt => tt.state === 0 && Math.abs(tt.mesh.position.y - (tr.y - 1)) < 2.5); const pick = opts[Math.floor(Math.random() * opts.length)]; if (pick) { A.tx = pick.mesh.position.x; A.tz = pick.mesh.position.z; } A.retarget = 0.6 + Math.random() * 1.2; }
    dx = A.tx - tr.x; dz = A.tz - tr.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (l < 0.4) { dx = dz = 0; }
    if (A.jumpT <= 0 && Math.random() < A.skill * 0.5) { jump = true; A.jumpT = 0.9 + Math.random(); }
  } else {
    const ang = Math.atan2(tr.z, tr.x), rad = Math.hypot(tr.x, tr.z);
    const want = 5.5; dx = -Math.cos(ang) * (rad - want) * 0.3; dz = -Math.sin(ang) * (rad - want) * 0.3;
    for (const bar of r.bars) { let da = ((ang - bar.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; const spd = barSpeed(bar.h); const lead = spd > 0 ? -da : da; if (lead > 0 && lead < 0.45 * Math.max(1, Math.abs(spd))) { if (bar.h < 1 && A.jumpT <= 0 && Math.random() < 0.6 + A.skill * 0.35) { jump = true; A.jumpT = 0.6; } if (bar.h > 1 && A.jumpT <= 0 && Math.random() < 0.4 + A.skill * 0.5) { dive = true; A.jumpT = 0.9; } } }
  }
  return [dx, dz, jump, dive];
}
const barSpeed = (h: number) => h < 1 ? 0.9 + Math.min(1.6, roundT * 0.025) : (roundT > 15 ? -(0.7 + Math.min(1.3, (roundT - 15) * 0.025)) : 0);

let netT = 0; const tmpV = new THREE.Vector3();
function step(dt: number) {
  skyMat.uniforms.t!.value += dt; clouds.rotation.y += dt * 0.004;
  if (mode === 'menu') {
    const T = performance.now() / 1000; if (menuBean) { animateBean(menuBean, Math.sin(T * 0.5) > 0.6 ? 'dance' : 'idle', dt, 0, 0, T); menuBean.root.rotation.y = Math.sin(T * 0.6) * 0.5; }
    camera.position.set(0, 1.9, 6.2); camera.lookAt(0, 1.1, 0); sun.position.set(-6, 12, 8); sun.target.position.set(0, 0, 0);
    return;
  }
  if (!round) return;
  if (mode === 'play' || mode === 'end') roundT += dt;
  const r = round;
  for (const m of r.movers) m.update(mode === 'intro' ? -1 : roundT);
  for (const bar of r.bars) { bar.angle += barSpeed(bar.h) * dt * (mode === 'play' ? 1 : 0); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, bar.angle, 0)); bar.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); bar.mesh.quaternion.copy(q); bar.mesh.visible = bar.h < 1 || roundT > 13; if (bar.h > 1 && roundT < 15) bar.body.setNextKinematicTranslation({ x: 0, y: 30, z: 0 }); else bar.body.setNextKinematicTranslation({ x: 0, y: bar.h, z: 0 }); }
  // tuiles qui fondent
  for (const tl of r.tiles) { if (tl.state === 1) { tl.t += dt; (tl.mesh.material as THREE.MeshPhysicalMaterial).emissive.setRGB(tl.t * 1.6, tl.t * 0.3, 0); tl.mesh.position.x += (Math.random() - 0.5) * 0.02; if (tl.t > 0.6) { tl.state = 2; tl.col.setEnabled(false); } } else if (tl.state === 2 && tl.mesh.visible) { tl.mesh.position.y -= dt * 9; tl.mesh.scale.multiplyScalar(1 - dt * 2); if (tl.mesh.scale.x < 0.05) tl.mesh.visible = false; } }
  // portes : une vraie porte s'ouvre quand on la touche
  for (const d of r.doors) { if (d.open > 0) { d.open += dt; d.mesh.rotation.x = -Math.min(1.5, d.open * 5); d.mesh.position.y = 1.4 - Math.min(1.3, d.open * 4); continue; } if (!d.real) continue; for (const p of players) { if (!p.body) continue; const tr = p.body.translation(); if (Math.abs(tr.x - d.mesh.position.x) < 1.3 && Math.abs(tr.z - d.mesh.position.z) < 0.95) { d.open = 0.01; d.col.setEnabled(false); if (p.human) sfx.crash(); break; } } }
  // grosses boules
  for (const bl of r.balls) { const tr = bl.body.translation(); if (tr.y < r.killY - 2 || tr.z > 40) { bl.body.setTranslation({ x: bl.home.x + (Math.random() - 0.5) * 4, y: bl.home.y, z: bl.home.z }, true); bl.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } else if (bl.body.linvel().z < 3) bl.body.applyImpulse({ x: 0, y: 0, z: 1.2 * dt * 60 * 0.15 }, true); const rot = bl.body.rotation(); bl.mesh.position.set(tr.x, tr.y, tr.z); bl.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w); }
  // joueurs
  const meP = me$();
  for (const p of players) {
    if (!p.body) continue;
    if (p.remote) { p.body.setNextKinematicTranslation({ x: p.tx, y: p.ty, z: p.tz }); continue; }
    if (mode !== 'play' || p.state !== 'play') { const v = p.body.linvel(); p.body.setLinvel({ x: v.x * 0.9, y: v.y, z: v.z * 0.9 }, true); continue; }
    if (p === meP && !spectating) {
      let jx = joy.x, jy = joy.y; if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) jx -= 1; if (keys.has('arrowright') || keys.has('d')) jx += 1; if (keys.has('arrowup') || keys.has('z') || keys.has('w')) jy -= 1; if (keys.has('arrowdown') || keys.has('s')) jy += 1;
      const l = Math.hypot(jx, jy); if (l > 1) { jx /= l; jy /= l; }
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      control(p, rx * jx + fx * -jy, rz * jx + fz * -jy, wantJump, wantDive, dt);
    } else if (!p.human) { const [dx, dz, j, d] = botThink(p, dt); control(p, dx, dz, j, d, dt); }
  }
  wantJump = wantDive = false;
  world.timestep = Math.min(1 / 30, dt); world.step();
  // règles
  for (const p of players) {
    if (!p.body || p.remote) continue; const tr = p.body.translation();
    if (r.kind === 'race') { for (let i = r.checkpoints.length - 1; i > p.cp; i--) if (tr.z < r.checkpoints[i]!) { p.cp = i; break; } if (tr.z < r.finishZ && p.state === 'play') qualify(p); }
    if (tr.y < r.killY && p.state === 'play') {
      if (r.kind === 'race') { const z = r.checkpoints[p.cp]!; p.body.setTranslation({ x: (Math.random() - 0.5) * 6, y: 3, z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); if (p === meP) { sfx.lose(); toast('💦 Splash !'); } }
      else eliminate(p);
    }
  }
  if (mode === 'play' && r.kind === 'race' && roundT > 150) endRound();
  if (mode === 'play' && r.kind === 'tiles' && roundT > 120) endRound();
  if (mode === 'play' && r.kind === 'jump' && roundT > 150) endRound();
  // affichage des haricots
  for (const p of players) {
    if (p.body) { const tr = p.body.translation(); p.bean.root.position.set(tr.x, tr.y - 0.77, tr.z); }
    else if (p.remote) p.bean.root.position.set(p.tx, p.ty - 0.77, p.tz);
    const v = p.body?.linvel() ?? { x: 0, y: 0, z: 0 }; const spd = Math.hypot(v.x, v.z);
    const pose: BeanPose = p.remote ? p.pose : mode === 'over' || p.state === 'qual' ? 'dance' : p.tumble > 0 ? 'tumble' : p.dive > 0 ? 'dive' : !p.ground ? 'air' : spd > 0.8 ? 'run' : 'idle';
    if (!p.remote) p.pose = pose;
    animateBean(p.bean, pose, dt, spd, v.y, roundT);
    let dy = p.yaw - p.bean.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.bean.root.rotation.y += dy * Math.min(1, dt * 12);
  }
  // caméra : derrière moi (ou derrière l'autre si je regarde)
  const target = spectating || meP.state !== 'play' ? (players.find(p => p.id === 'them' && p.state !== 'out') ?? players.find(p => p.state === 'play') ?? meP) : meP;
  const tp = target.bean.root.position; if (r.kind === 'race' && cam.dragId < 0 && !joy.on) cam.yaw += (0 - cam.yaw) * dt * 0.8;
  const dist = r.kind === 'race' ? 9.5 : 11, hgt = r.kind === 'tiles' ? 7 : 5.5;
  tmpV.set(tp.x + Math.sin(cam.yaw) * dist, tp.y + hgt, tp.z + Math.cos(cam.yaw) * dist);
  camera.position.lerp(tmpV, Math.min(1, dt * 6)); camera.lookAt(tp.x, tp.y + 1.2, tp.z - (r.kind === 'race' ? 2 : 0));
  sun.position.set(tp.x - 8, tp.y + 18, tp.z + 10); sun.target.position.copy(tp);
  (r.slime.material as THREE.ShaderMaterial).uniforms.t!.value += dt;
  // interface
  const alive = players.filter(p => p.state === 'play').length;
  $('hRound').innerHTML = `<small>${t('Manche')} ${roundIdx + 1}/${SEQ.length}</small>${lang === 'ar' ? r.nameAr : r.name}`;
  $('hStat').innerHTML = r.kind === 'race' ? `<small>${t('Qualifiés')}</small>${qualified} / ${quota}` : `<small>${t('En vie')}</small>${alive}${spectating ? ` · ${t('Spectateur')}` : ''}`;
  if (duoRoom && mode !== 'over') { netT -= dt; if (netT <= 0) { netT = 0.12; void net(); } }
}

// ── À DEUX ───────────────────────────────────────────────────────────────────
const netState = () => { const p = me$(); const tr = p.body?.translation() ?? { x: p.tx, y: p.ty, z: p.tz }; return { x: Math.round(tr.x * 100) / 100, y: Math.round(tr.y * 100) / 100, z: Math.round(tr.z * 100) / 100, yaw: Math.round(p.yaw * 100) / 100, pose: p.pose, st: p.state, r: roundIdx, c: save.costume }; };
async function net() {
  try {
    const v = await games.room('state', { score: roundIdx, state: mode === 'menu' ? { c: save.costume } : netState() }); duoRoom = v.room ?? duoRoom; const rm = duoRoom; if (!rm) return;
    const os = rm.players[otherOf(rm.me)]?.state as (ReturnType<typeof netState> | null | undefined);
    if (os?.c) remoteCostume = os.c;
    const them = players.find(p => p.id === 'them');
    if (them && os && os.r === roundIdx) { them.tx = os.x; them.ty = os.y; them.tz = os.z; them.yaw = os.yaw; them.pose = os.pose as BeanPose; if (os.st === 'qual' && them.state === 'play') { them.state = 'qual'; qualified++; if (round?.kind === 'race') them.bean.root.visible = false; toast(`🎉 ${them.name} ${t('QUALIFIÉ !')}`); if (qualified >= quota) endRound(); } if (os.st === 'out' && them.state === 'play') { them.state = 'out'; them.bean.root.visible = false; toast(`💦 ${them.name}`); } }
  } catch { /* */ }
}
async function openDuo() {
  if (!online()) { sheet(`<h2>👫</h2><div class="lead">${t('Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.')}</div><button class="btn w" id="x" style="width:100%">${t('Fermer')}</button>`); on('x', () => sheet('')); return; }
  try {
    const v0 = await games.peek(); const r = v0.room; let v = v0;
    if (r && r.game === 'folie' && !r.ended && r.host !== r.me && !r.players[r.me]) v = await games.room('join');
    else if (!r || r.game !== 'folie' || r.ended || !r.players[r.me]) v = await games.room('invite', { game: 'folie' });
    duoRoom = v.room; void games.room('state', { state: { c: save.costume } }).catch(() => {}); lobby();
  } catch (e) { toast(`⚠️ ${String(e).slice(0, 60)}`); }
}
function lobby() {
  const r = duoRoom; if (!r) return; const a = r.me, b = otherOf(a);
  const card = (u: Uid) => `<div class="${r.players[u]?.ready ? 'ok' : ''}"><div style="font-size:30px">${u === 'kouider' ? '🧢' : '🧕'}</div>${names[u]}<div style="font-size:13px;color:#8a7bd8">${!r.players[u] ? `⏳ ${t('En attente…')}` : r.players[u]!.ready ? `✅ ${t('Prêt')}` : '👀'}</div></div>`;
  sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${lang === 'ar' ? 'أنتما الاثنان + 18 منافسًا، تاج واحد فقط!' : 'Vous deux + 18 adversaires, une seule couronne !'}</div><div class="lob">${card(a)}${card(b)}</div>
    <div style="display:grid;gap:10px">${r.players[a]?.ready ? `<button class="btn w" disabled>✅ ${t('En attente…')}</button>` : `<button class="btn" id="dReady">${t('Prêt')} !</button>`}<button class="btn w" id="dLeave">${t('Quitter')}</button></div>`);
  on('dReady', async () => { try { const s = Date.now(); const v = await games.room('ready'); syncClock(v, s); duoRoom = v.room; lobby(); maybeStart(); } catch { /* */ } });
  on('dLeave', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; sheet(''); });
}
function maybeStart() { const r = duoRoom; if (!r?.startAt || mode !== 'menu') return; if (serverNow() > r.startAt + 6000) return; const w = Math.max(0, r.startAt - serverNow()); sheet(''); setTimeout(() => startShow(r.seed, true), w); }
let pollT = 0, pollBusy = false;
async function poll() {
  if (pollBusy || !online() || mode !== 'menu') return; pollBusy = true;
  try {
    const s = Date.now(); const v = await games.peek(); syncClock(v, s); const r = v.room;
    if (duoRoom) { duoRoom = r; const os = r?.players[otherOf(r.me)]?.state as { c?: Costume } | undefined; if (os?.c) remoteCostume = os.c; if (!r) sheet(''); else if ($('sheet').innerHTML.includes('class="lob"')) { lobby(); maybeStart(); } }
    else if (r && r.game === 'folie' && !r.ended && !r.startAt && r.host !== r.me && !r.players[r.me] && !r.otherGone) { $('invite').hidden = false; $('invTxt').textContent = `${names[r.host]} ${t('te défie à LA GRANDE FOLIE !')}`; }
    else $('invite').hidden = true;
  } catch { /* */ } finally { pollBusy = false; }
}
on('bJoin', () => { $('invite').hidden = true; void openDuo(); });

function confetti() {
  const c = $<HTMLCanvasElement>('confetti'), g = c.getContext('2d')!; c.width = innerWidth; c.height = innerHeight;
  const ps = Array.from({ length: 170 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * 3, c: `hsl(${Math.random() * 360},95%,62%)`, s: 6 + Math.random() * 8 }));
  let n = 0; const st = () => { g.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); } if (++n < 170) requestAnimationFrame(st); else g.clearRect(0, 0, c.width, c.height); }; st();
}

// ── Boucle ───────────────────────────────────────────────────────────────────
const ts = Number(new URLSearchParams(location.search).get('ts') ?? 1);
let last = performance.now(), fpsAcc = 0, fpsN = 0, low = 0;
function loop(now: number) {
  const dt = Math.min(1 / 30, (now - last) / 1000) * ts; last = now;
  step(dt); if (save.quality === 'high') composer.render(); else renderer.render(scene, camera);
  if (now - pollT > (duoRoom ? 900 : 3500)) { pollT = now; void poll(); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 2) { if (fpsN / fpsAcc < 36 && save.quality === 'high') { if (++low >= 2) { save.quality = 'low'; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); renderer.shadowMap.enabled = false; } } else low = 0; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(loop);
}
void textTex; void dressHat;
applyLang(); showMenu();
setTimeout(() => { const l = document.getElementById('loading'); if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 500); } }, 700);
requestAnimationFrame(loop);
const q = new URLSearchParams(location.search);
if (q.get('demo')) { startShow(7, false); const rk = Number(q.get('round') ?? 0); if (rk) { roundIdx = rk; startRound(); } const ff = Number(q.get('ff') ?? 0); if (ff) setTimeout(() => { for (let i = 0; i < ff * 30; i++) step(1 / 30); }, 3500); }
