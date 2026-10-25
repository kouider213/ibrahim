import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeBean, animateBean, COLORS, type Bean, type Costume, type Hat, type Pattern, type BeanPose } from './bean.ts';
import { buildRound, type Round, type RoundKind } from './course.ts';
import { audioUnlock, sfx, music, setMuted, isMuted, duck, setTempo } from '../games/audio.ts';
import { exitGame, fromHub, bootIdentity, games, online, local, otherOf, rng, serverNow, syncClock, vibrate, type Room, type Uid } from '../games/net.ts';
import { getDeviceToken } from '../services/api.ts';

// LA GRANDE FOLIE — jeu de fête façon Fall Guys / Stumble Guys pour Kouider et Fatima : 20 haricots (vous + des
// adversaires joués par l'ordi), 3 manches tirées au sort parmi 5 (course d'obstacles toujours différente, tuiles
// fondantes, chasse aux queues, saute-barre, montagne à couronne), ambiances variées. On se pousse et on s'attrape (✋).
// Solo : dès que tu as fini, on passe à la suite. À deux : la manche finit quand vous avez fini tous les deux.

bootIdentity({ name: 'La Grande Folie', short: 'Folie', color: '#5b8cff', icon: '/ibrahim/icons/folie-512.png' });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const AR: Record<string, string> = { play: 'العب', duo: 'معًا', shop: 'الأزياء', 'QUALIFIÉ !': 'تأهلت!', 'ÉLIMINÉ': 'خرجت', 'Manche': 'الجولة', Qualifiés: 'المتأهلون', 'En vie': 'الأحياء', 'VICTOIRE !': 'فوز!', Couronnes: 'تيجان', Pièces: 'قطع', Rejouer: 'العب مجددًا', Menu: 'القائمة', Couleur: 'اللون', 'Couleur 2': 'اللون 2', Motif: 'النقش', Chapeau: 'القبعة', Fermer: 'إغلاق', Prêt: 'جاهز', 'En attente…': 'في الانتظار…', Quitter: 'خروج', 'te défie à LA GRANDE FOLIE !': 'يتحداك في الجنون الكبير!', 'Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.': 'افتح اللعبة من التطبيق للعب معًا.', Spectateur: 'متفرج', 'On attend': 'ننتظر', Queues: 'الذيول', 'Tu as une queue !': 'معك ذيل!', 'On t\'a volé ta queue !': 'سُرق ذيلك!', Suivant: 'التالي' };
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
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { t: { value: 0 }, top: { value: new THREE.Color('#1f52f2') }, mid: { value: new THREE.Color('#61b3ff') }, low: { value: new THREE.Color('#fa9fe6') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform float t; uniform vec3 top, mid, low; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0,0.7,y)) : mix(mid, low, smoothstep(0.0,-0.3,y)); float a = atan(vP.x, vP.z); float rays = smoothstep(0.6,1.0, sin(a*14.0 + t*0.2)) * 0.05 * smoothstep(0.0,0.6,y); gl_FragColor = vec4(c + rays, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat));
const fog = new THREE.Fog('#7fb2ff', 110, 380); scene.fog = fog;
const hemi = new THREE.HemisphereLight('#ffffff', '#9a7cff', 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);
const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!; for (let i = 0; i < 16; i++) { const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } return new THREE.CanvasTexture(c); })();
const clouds = new THREE.Group(); scene.add(clouds); for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.95, fog: false, depthWrite: false })); const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 200; s.position.set(Math.cos(a) * d, -30 + Math.random() * 90, Math.sin(a) * d); s.scale.set(60 + Math.random() * 60, 26 + Math.random() * 20, 1); clouds.add(s); }
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.4, 0.9)); composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });
function applyTheme(r: Round) {
  const th = r.theme; (skyMat.uniforms.top!.value as THREE.Color).set(th.sky[0]); (skyMat.uniforms.mid!.value as THREE.Color).set(th.sky[1]); (skyMat.uniforms.low!.value as THREE.Color).set(th.sky[2]); fog.color.set(th.fog);
  const night = th.id === 'nuit'; hemi.intensity = night ? 0.6 : 0.85; sun.intensity = night ? 1.6 : 2.6; sun.color.set(th.id === 'coucher' ? '#ffcf9e' : night ? '#b9c4ff' : '#fff4e0');
}

// ── Joueurs ──────────────────────────────────────────────────────────────────
interface P {
  id: string; name: string; human: boolean; remote: boolean; bean: Bean; body: RAPIER.RigidBody | null; col: RAPIER.Collider | null;
  state: 'play' | 'qual' | 'out'; ground: boolean; jumpCd: number; dive: number; tumble: number; yaw: number; lastV: THREE.Vector3; cp: number;
  ai: { lane: number; skill: number; jumpT: number; tx: number; tz: number; retarget: number; stuck: number; fakeDoors: Set<number>; grabT: number }; finish: number; tx: number; ty: number; tz: number; pose: BeanPose;
  grabbing: P | null; grabT: number; slowed: number; tail: boolean; tailMesh: THREE.Object3D | null; ring: THREE.Mesh | null;
}
let world: RAPIER.World = new RAPIER.World({ x: 0, y: -28, z: 0 });
let round: Round | null = null; let players: P[] = []; let roundIdx = 0; let roundT = -4; let quota = 0; let qualified = 0; let seed = 1; let plan: RoundKind[] = [];
type Mode = 'menu' | 'intro' | 'play' | 'end' | 'over';
let mode: Mode = 'menu'; let duoRoom: Room | null = null; let names: Record<Uid, string> = { kouider: 'Kouider', femme: 'Fatima' }; let me: Uid = 'kouider';
let spectating = false; let isHost = true;
const me$ = () => players.find(p => p.id === 'me');
const them$ = () => players.find(p => p.id === 'them');

function costumeFor(i: number, R: ReturnType<typeof rng>): Costume { const pats: Pattern[] = ['plain', 'stripes', 'dots', 'half', 'stars', 'zigzag']; const hats: Hat[] = ['none', 'cap', 'cat', 'bunny', 'flower', 'chef', 'horns', 'fez', 'none', 'none']; return { body: COLORS[(i * 5 + Math.floor(R() * 12)) % 12]!, body2: COLORS[(i * 7 + 3) % 12]!, pattern: R.pick(pats), hat: R.pick(hats), face: '#fde7d4' }; }
function makeBody(x: number, y: number, z: number, kinematic: boolean) {
  const bd = (kinematic ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic().lockRotations().setCcdEnabled(true).setLinearDamping(0.2)).setTranslation(x, y, z);
  const body = world.createRigidBody(bd); body.userData = { bean: true };
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.31, 0.46).setFriction(0.15).setRestitution(0.05).setDensity(1.2), body);
  return { body, col };
}
const tailGeo = (() => { const g = new THREE.Group(); const m1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#ff8a1c', clearcoat: 0.5, roughness: 0.5 })); m1.scale.set(0.9, 0.9, 2); m1.position.z = -0.3; g.add(m1); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6 })); tip.position.z = -0.68; g.add(tip); g.position.set(0, 0.55, -0.45); g.rotation.x = -0.5; return g; })();
function setTail(p: P, on: boolean) { p.tail = on; if (on && !p.tailMesh) { p.tailMesh = tailGeo.clone(); p.bean.body.add(p.tailMesh); } if (!on && p.tailMesh) { p.bean.body.remove(p.tailMesh); p.tailMesh = null; } }
function spawnPlayers(list: Array<{ id: string; name: string; human: boolean; remote: boolean; costume: Costume }>) {
  for (const p of players) scene.remove(p.bean.root); players = [];
  const R = rng(seed ^ (0xabc + roundIdx));
  list.forEach((d, i) => {
    const sp = round!.spawn[i % round!.spawn.length]!;
    const label = d.id === 'me' ? `⭐ ${d.name}` : d.id === 'them' ? `♥ ${d.name}` : undefined;
    const bean = makeBean(d.costume, label, d.id === 'me' ? '#ffe14d' : '#ff6fb5'); scene.add(bean.root);
    let ring: THREE.Mesh | null = null;
    if (d.human) { ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: d.id === 'me' ? '#ffe14d' : '#ff4d9a', transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; bean.root.add(ring); }
    const { body, col } = makeBody(sp.x, sp.y, sp.z, d.remote);
    players.push({ ...d, bean, body, col, state: 'play', ground: false, jumpCd: 0, dive: 0, tumble: 0, yaw: round!.kind === 'race' || round!.kind === 'mountain' ? Math.PI : Math.atan2(-sp.x, -sp.z), lastV: new THREE.Vector3(), cp: 0, ai: { lane: (R() - 0.5) * 9, skill: 0.72 + R() * 0.28, jumpT: R() * 2, tx: 0, tz: 0, retarget: 0, stuck: 0, fakeDoors: new Set(), grabT: 2 + R() * 4 }, finish: 0, tx: sp.x, ty: sp.y, tz: sp.z, pose: 'idle', grabbing: null, grabT: 0, slowed: 0, tail: false, tailMesh: null, ring });
  });
  if (round!.kind === 'tail') { const order = players.map((_, i) => i).sort(() => R() - 0.5); order.slice(0, Math.floor(players.length / 2)).forEach(i => setTail(players[i]!, true)); }
}
function newWorld() { world.free(); world = new RAPIER.World({ x: 0, y: -28, z: 0 }); }

// ── Entrées ──────────────────────────────────────────────────────────────────
const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }; const cam = { yaw: 0, dragId: -1, lx: 0 }; const keys = new Set<string>(); let wantJump = false, wantDive = false, grabHeld = false, grabStart = 0, wantPush = false;
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
addEventListener('keydown', e => { const k = e.key.toLowerCase(); keys.add(k); if (e.key === ' ') wantJump = true; if (k === 'e' || e.key === 'Shift') wantDive = true; if (k === 'f' && !grabHeld) { grabHeld = true; grabStart = performance.now(); } });
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k); if (k === 'f') { if (performance.now() - grabStart < 200) wantPush = true; grabHeld = false; } });
$('bJump').addEventListener('pointerdown', e => { e.stopPropagation(); wantJump = true; });
$('bDive').addEventListener('pointerdown', e => { e.stopPropagation(); wantDive = true; });
$('bGrab').addEventListener('pointerdown', e => { e.stopPropagation(); grabHeld = true; grabStart = performance.now(); });
const grabUp = () => { if (!grabHeld) return; if (performance.now() - grabStart < 200) wantPush = true; grabHeld = false; };
$('bGrab').addEventListener('pointerup', grabUp); $('bGrab').addEventListener('pointercancel', grabUp); $('bGrab').addEventListener('pointerleave', grabUp);

// ── Interface ────────────────────────────────────────────────────────────────
function toast(s: string) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }
function big(b: string, s = '', bad = false, ms = 1800) { const d = document.createElement('div'); d.className = 'big'; d.innerHTML = `<div><b class="${bad ? 'bad' : ''}">${b}</b>${s ? `<span class="out">${s}</span>` : ''}</div>`; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
function sheet(h: string) { $('sheet').innerHTML = h ? `<div class="sheet"><div class="card">${h}</div></div>` : ''; }
const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = () => { audioUnlock(); sfx.click(); fn(); }; };
let menuBean: Bean | null = null; let podium: THREE.Group | null = null;
function renderMenu() { $('mCrowns').textContent = String(save.crowns); $('mKudos').textContent = save.kudos.toLocaleString('fr-FR'); $('bSound').textContent = isMuted() ? '🔇' : '🔊'; $('bExit').hidden = !embedded && !fromHub(); }
async function refreshBoard() { if (!online()) return; try { const b = await games.board(); names = b.names; me = b.me; const r = b.board.folie ?? {}; $('duel').hidden = false; $('duel').innerHTML = `<div class="chip">${names.kouider} <b>👑 ${r.kouider?.best ?? 0}</b></div><div class="chip">${names.femme} <b>👑 ${r.femme?.best ?? 0}</b></div>`; } catch { /* */ } }
function showMenu() {
  mode = 'menu'; sheet(''); $('menu').hidden = false; $('hud').hidden = true; $('ctrl').hidden = true; $('wait').hidden = true; $('arrow').hidden = true;
  if (round) { scene.remove(round.group); round = null; } for (const p of players) scene.remove(p.bean.root); players = []; newWorld();
  (skyMat.uniforms.top!.value as THREE.Color).set('#1f52f2'); (skyMat.uniforms.mid!.value as THREE.Color).set('#61b3ff'); (skyMat.uniforms.low!.value as THREE.Color).set('#fa9fe6');
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
function makePlan(R: ReturnType<typeof rng>): RoundKind[] { return ['race', R.pick<RoundKind>(['tiles', 'tail', 'race', 'tiles', 'tail']), R.pick<RoundKind>(['jump', 'mountain'])]; }
function startShow(sd: number, duo: boolean) {
  seed = sd; roundIdx = 0; spectating = false; crownWinner = null; nextSent = -1; const R = rng(seed); plan = makePlan(R);
  isHost = !duo || !duoRoom || duoRoom.host === duoRoom.me;
  const myName = online() ? names[me] : (isFemme ? 'Fatima' : 'Kouider');
  roster = [{ id: 'me', name: myName, human: true, remote: false, costume: save.costume }];
  if (duo && duoRoom) roster.push({ id: 'them', name: names[otherOf(duoRoom.me)], human: true, remote: true, costume: remoteCostume ?? { body: '#4fd1ff', body2: '#ffffff', pattern: 'dots', hat: 'none', face: '#fde7d4' } });
  const bots = [...BOTS].sort(() => R() - 0.5);
  while (roster.length < 20) { const i = roster.length; roster.push({ id: `b${i}`, name: bots[i % bots.length]!, human: false, remote: false, costume: costumeFor(i, R) }); }
  if (menuBean) { scene.remove(menuBean.root); menuBean = null; } if (podium) scene.remove(podium);
  startRound();
}
function startRound() {
  const kind = plan[roundIdx]!; newWorld(); if (round) scene.remove(round.group);
  const n = roster.length; round = buildRound(world, scene, kind, rng(seed + roundIdx * 7919), n); applyTheme(round);
  quota = kind === 'race' ? Math.max(2, Math.round(n * 0.6)) : kind === 'tiles' ? Math.max(2, Math.round(n * 0.65)) : kind === 'tail' ? Math.floor(n / 2) : 1; qualified = 0;
  spawnPlayers(roster); roundT = -4.2; mode = 'intro'; $('menu').hidden = true; $('hud').hidden = false; $('ctrl').hidden = spectating; $('wait').hidden = true; sheet('');
  if (spectating) { const m = me$(); if (m) { m.state = 'out'; if (m.body) world.removeRigidBody(m.body); m.body = null; m.bean.root.visible = false; } }
  cam.yaw = 0;
  const card = document.createElement('div'); card.className = 'card-round'; card.innerHTML = `<div><small>${t('Manche')} ${roundIdx + 1} / ${plan.length}</small><h2>${lang === 'ar' ? round.nameAr : round.name}</h2><p>${lang === 'ar' ? round.goalAr : round.goal}</p></div>`; document.body.appendChild(card);
  sfx.power(); duck(0.3);
  setTimeout(() => { card.remove(); countdown(); }, 2600);
}
function countdown() { let n = 3; const tick = () => { if (n > 0) { big(String(n), '', false, 800); sfx.tick(); n--; setTimeout(tick, 550); } else { big('GO !', '', false, 900); sfx.go(); mode = 'play'; roundT = 0; music(true, 'rush'); setTempo(round?.kind === 'jump' ? 132 : 124); duck(0.45); } }; tick(); }
const humansDone = () => players.filter(p => p.human).every(p => p.state !== 'play');
function qualify(p: P) {
  if (p.state !== 'play') return;
  if (!p.human && qualified >= quota) return;   // quota atteint : les adversaires ne passent plus, les humains toujours
  p.state = 'qual'; qualified++; p.finish = roundT;
  if (p.id === 'me') { big(t('QUALIFIÉ !'), `${qualified} / ${quota}`); sfx.win(); confetti(); vibrate([30, 40, 30]); save.kudos += 40 + Math.max(0, quota - qualified) * 5; persist(); }
  if (p.body) { world.removeRigidBody(p.body); p.body = null; p.col = null; }
  if (round?.kind === 'race' || round?.kind === 'mountain') p.bean.root.visible = false;
  checkEnd();
}
function eliminate(p: P) {
  if (p.state !== 'play') return; p.state = 'out';
  if (p.body) { world.removeRigidBody(p.body); p.body = null; p.col = null; } p.bean.root.visible = false;
  if (p.id === 'me') { big(t('ÉLIMINÉ'), '', true, 2200); sfx.lose(); vibrate(120); }
  checkEnd();
}
/** Fin de manche : solo → dès que j'ai fini ; à deux → quand les deux ont fini (l'hôte donne le signal). */
function checkEnd() {
  if (mode !== 'play' || !round) return;
  const k = round.kind; const alive = players.filter(x => x.state === 'play').length;
  const survival = k === 'tiles' || k === 'jump';
  if (!duoRoom) {
    const m = me$()!;
    if (m.state !== 'play') { mode = 'end'; setTimeout(() => endRound(), 1600); return; }
    if (survival && alive <= quota) endRound();
    return;
  }
  if (humansDone() || (survival && alive <= quota)) { if (isHost) hostNext(); else { $('wait').hidden = false; $('wait').textContent = '⏳'; } }
  else if (me$()?.state !== 'play') { const th = them$(); $('wait').hidden = false; $('wait').textContent = `⏳ ${t('On attend')} ${th?.name ?? ''}…`; }
}
let nextSent = -1;
function hostNext() {
  if (nextSent === roundIdx) return; nextSent = roundIdx;
  const at = serverNow() + 3200;
  void games.room('event', { ev: { type: 'next', r: roundIdx, at, host: finalState(me$()), guest: finalState(them$()) } }).catch(() => {});
  endRound(at);
}
function finalState(p: P | undefined) { if (!p || (p.id === 'me' && spectating)) return 'out'; if (p.state === 'qual') return 'qual'; if (p.state === 'out') return 'out'; const k = round?.kind; return k === 'tail' ? (p.tail ? 'qual' : 'out') : k === 'tiles' || k === 'jump' ? 'qual' : 'out'; }
function endRound(at = 0) {
  if (mode !== 'play' && mode !== 'end') return; if (endingRound) return; endingRound = true; mode = 'end'; $('wait').hidden = true;
  const kind = round!.kind;
  for (const p of players) if (p.state === 'play') { if (kind === 'race' || kind === 'mountain') p.state = 'out'; else if (kind === 'tail') p.state = p.tail ? 'qual' : 'out'; else { p.state = 'qual'; qualified++; } }
  // course : on complète le quota avec les adversaires les plus avancés (en solo on n'attend pas qu'ils finissent)
  if (kind === 'race') { const q = players.filter(p => p.state === 'qual').length; if (q < quota) { const rest = players.filter(p => !p.human && p.state === 'out' && p.body).sort((a, b) => a.body!.translation().z - b.body!.translation().z); rest.slice(0, quota - q).forEach(p => { p.state = 'qual'; }); } }
  if (kind === 'tail' && !spectating) { const m = me$(); if (m) big(m.state === 'qual' ? t('QUALIFIÉ !') : t('ÉLIMINÉ'), '', m.state !== 'qual'); }
  if (duoRoom) void games.room('state', { state: netState(), score: roundIdx }).catch(() => {});
  const wait = at ? Math.max(1200, at - serverNow()) : 2400;
  setTimeout(() => { endingRound = false; advance(); }, wait);
}
let endingRound = false;
function advance() {
  const kind = round!.kind; const last = roundIdx >= plan.length - 1;
  const survivors = players.filter(p => p.state === 'qual');
  if (last || kind === 'mountain' || survivors.length <= 1) { finale(); return; }
  const meQ = me$()?.state === 'qual' && !spectating; const themQ = them$()?.state === 'qual';
  roster = roster.filter(r => r.human || players.find(p => p.id === r.id)?.state === 'qual');
  if (!meQ) { if (duoRoom && themQ) spectating = true; else { over(false); return; } }
  if (duoRoom && !themQ) roster = roster.filter(r => r.id !== 'them');
  roundIdx++; startRound();
}
let crownWinner: P | null = null;
function finale() {
  const winner = crownWinner ?? players.find(p => p.state === 'qual') ?? players.find(p => p.state === 'play');
  over(winner?.id === 'me' && !spectating, winner?.name);
}
async function over(win: boolean, winnerName?: string) {
  if (mode === 'over') return; mode = 'over'; $('ctrl').hidden = true; $('joy').hidden = true; $('wait').hidden = true; $('arrow').hidden = true;
  if (win) { save.crowns++; save.kudos += 500; big('👑', t('VICTOIRE !'), false, 3000); confetti(); sfx.win(); } else sfx.lose();
  persist(); spectating = false; crownWinner = null;
  if (online()) void games.score('folie', save.crowns).catch(() => {});
  setTimeout(() => {
    sheet(`<h2>${win ? '👑 ' + t('VICTOIRE !') : winnerName ? `👑 ${winnerName}` : t('ÉLIMINÉ')}</h2><div class="lead">${t('Manche')} ${roundIdx + 1} / ${plan.length}</div>
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
function groundY(x: number, z: number) { const hit = world.castRay(new RAPIER.Ray({ x, y: 80, z }, RAYDIR), 200, true, undefined, undefined, undefined, undefined, c => !(c.parent()?.userData as { bean?: boolean } | undefined)?.bean); return hit ? 80 - hit.timeOfImpact : 0; }
function control(p: P, dx: number, dz: number, jump: boolean, dive: boolean, dt: number) {
  const b = p.body; if (!b) return; const v = b.linvel();
  const was = p.ground; p.ground = grounded(p);
  if (p.ground && !was && v.y < -6) { p.bean.squash = 1; if (p.id === 'me') sfx.land(); }
  const dv = Math.hypot(v.x - p.lastV.x, v.z - p.lastV.z);
  if (dv > 9 && p.tumble <= 0 && p.dive <= 0) { p.tumble = 1.1; if (p.id === 'me') { vibrate(60); sfx.crash(); } }
  p.tumble = Math.max(0, p.tumble - dt); p.dive = Math.max(0, p.dive - dt); p.jumpCd = Math.max(0, p.jumpCd - dt); p.slowed = Math.max(0, p.slowed - dt);
  let nvx = v.x, nvz = v.z, nvy = v.y;
  if (p.tumble <= 0 && p.dive <= 0) {
    const sp = 7.6 * (p.human ? 1 : p.ai.skill * 0.95 + 0.06) * (p.grabbing ? 0.6 : 1) * (p.slowed > 0 ? 0.35 : 1); const acc = p.ground ? 46 : 16;
    const tx = dx * sp, tz = dz * sp; const ddx = tx - v.x, ddz = tz - v.z; const dl = Math.hypot(ddx, ddz), mx = acc * dt;
    if (dl > mx) { nvx = v.x + ddx / dl * mx; nvz = v.z + ddz / dl * mx; } else { nvx = tx; nvz = tz; }
    if (Math.hypot(dx, dz) > 0.1 && !p.grabbing) p.yaw = Math.atan2(dx, dz);
    if (jump && p.ground && p.jumpCd <= 0) { nvy = 10.5; p.jumpCd = 0.25; p.ground = false; if (p.id === 'me') sfx.jump(); }
    if (dive && p.jumpCd <= 0) { const f = 10.5; nvx = Math.sin(p.yaw) * f; nvz = Math.cos(p.yaw) * f; nvy = p.ground ? 5 : Math.max(v.y, 2.5); p.dive = 0.75; p.jumpCd = 0.6; p.grabbing = null; if (p.id === 'me') sfx.slide(); }
  }
  if (p.dive > 0) p.col?.setHalfHeight(0.04); else p.col?.setHalfHeight(0.31);
  b.setLinvel({ x: nvx, y: nvy, z: nvz }, true); p.lastV.set(nvx, nvy, nvz);
}
const posOf = (p: P) => p.body && !p.remote ? p.body.translation() : { x: p.tx, y: p.ty, z: p.tz };
function frontTarget(p: P, maxD = 1.6) {
  const a = posOf(p); let best: P | null = null, bd = maxD;
  for (const o of players) { if (o === p || o.state !== 'play' || (!o.body && !o.remote)) continue; const b = posOf(o); const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d > bd || Math.abs(b.y - a.y) > 1.4) continue; let da = Math.atan2(dx, dz) - p.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < 1.25) { bd = d; best = o; } }
  return best;
}
/** Pousser (appui court) : grosse bourrade. Sur l'autre joueur à distance → message pour son téléphone. */
function push(p: P) {
  const o = frontTarget(p, 1.9); p.bean.squash = 0.4; if (p.id === 'me') sfx.slide();
  if (!o) return; const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
  if (o.remote) { void games.room('event', { ev: { type: 'push', dx, dz } }).catch(() => {}); if (p.id === 'me') toast(`💥 ${o.name} !`); return; }
  o.body?.setLinvel({ x: dx * 11, y: 4, z: dz * 11 }, true); o.tumble = 0.7; o.lastV.set(dx * 11, 4, dz * 11);
  if (o.id === 'me') { vibrate(50); sfx.crash(); }
}
/** Attraper (appui long) : on retient l'autre (il ralentit) ; à la chasse aux queues, on lui vole sa queue. */
function grab(p: P, dt: number) {
  if (!p.grabbing) {
    const o = frontTarget(p, 1.5); if (!o) return; p.grabbing = o; p.grabT = 0; if (p.id === 'me') sfx.tick();
    if (round?.kind === 'tail' && o.tail && !p.tail) { setTail(p, true); setTail(o, false); if (o.remote) void games.room('event', { ev: { type: 'steal' } }).catch(() => {}); if (p.id === 'me') { sfx.power(); toast(`🦊 ${t('Tu as une queue !')}`); } if (o.id === 'me') { sfx.wrong(); toast(`😱 ${t('On t\'a volé ta queue !')}`); } }
  }
  const o = p.grabbing; p.grabT += dt; const a = posOf(p), b = posOf(o);
  if (o.state !== 'play' || Math.hypot(a.x - b.x, a.z - b.z) > 2.4 || p.grabT > 3 || p.tumble > 0) { p.grabbing = null; return; }
  p.yaw = Math.atan2(b.x - a.x, b.z - a.z);
  if (o.remote) { if (Math.floor(p.grabT * 4) !== Math.floor((p.grabT - dt) * 4)) void games.room('event', { ev: { type: 'grab' } }).catch(() => {}); return; }
  if (o.body) { const v = o.body.linvel(); o.body.setLinvel({ x: v.x * 0.8 + (a.x - b.x) * 0.6, y: v.y, z: v.z * 0.8 + (a.z - b.z) * 0.6 }, true); const nv = o.body.linvel(); o.lastV.set(nv.x, 0, nv.z); o.slowed = 0.3; }
}
function botThink(p: P, dt: number): [number, number, boolean, boolean] {
  const tr = p.body!.translation(); const r = round!; const A = p.ai; let dx = 0, dz = 0, jump = false, dive = false;
  A.jumpT -= dt; A.retarget -= dt; A.grabT -= dt;
  if (r.kind === 'race' || r.kind === 'mountain') {
    A.lane += (Math.random() - 0.5) * dt * 2; A.lane = Math.max(-5, Math.min(5, A.lane));
    const row = r.doors.filter(d => d.mesh.position.z < tr.z && d.mesh.position.z > tr.z - 7 && d.open === 0);
    if (row.length) { let best = row[0]!, bd = 1e9; for (const d of row) { if (A.fakeDoors.has(d.body.handle)) continue; const dd = Math.abs(d.mesh.position.x - tr.x); if (dd < bd) { bd = dd; best = d; } } A.lane = best.mesh.position.x; if (Math.abs(best.mesh.position.z - tr.z) < 1.2 && !best.real) A.fakeDoors.add(best.body.handle); }
    if (r.crownPos && tr.z < r.crownPos.z + 8) { A.lane = r.crownPos.x; if (Math.abs(tr.z - r.crownPos.z) < 3) jump = true; }
    dx = (A.lane - tr.x) * 0.35; dz = r.crownPos && tr.z < r.crownPos.z ? 1 : -1; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    for (const h of r.jumpHints) if (tr.z < h.z0 && tr.z > h.z1 && A.jumpT <= 0) { jump = true; A.jumpT = 0.5 + Math.random() * (1.4 - A.skill); }
    const v = p.body!.linvel(); if (Math.hypot(v.x, v.z) < 1.2) { A.stuck += dt; if (A.stuck > 0.5) { jump = true; A.lane += (Math.random() - 0.5) * 6; A.stuck = 0; } } else A.stuck = 0;
    if (Math.random() < dt * 0.15 * A.skill) dive = true;
  } else if (r.kind === 'tiles') {
    if (A.retarget <= 0) { const opts = r.tiles.filter(tt => tt.state === 0 && Math.abs(tt.mesh.position.y - (tr.y - 1)) < 2.5); const pick = opts[Math.floor(Math.random() * opts.length)]; if (pick) { A.tx = pick.mesh.position.x; A.tz = pick.mesh.position.z; } A.retarget = 0.6 + Math.random() * 1.2; }
    dx = A.tx - tr.x; dz = A.tz - tr.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (l < 0.4) { dx = dz = 0; }
    if (A.jumpT <= 0 && Math.random() < A.skill * 0.5) { jump = true; A.jumpT = 0.9 + Math.random(); }
  } else if (r.kind === 'tail') {
    // sans queue : je chasse le porteur le plus proche ; avec : je fuis les chasseurs
    let best: P | null = null, bd = 1e9; for (const o of players) { if (o === p || o.state !== 'play' || p.tail === o.tail) continue; const b = posOf(o); const d = Math.hypot(b.x - tr.x, b.z - tr.z); if (d < bd) { bd = d; best = o; } }
    if (best) { const b = posOf(best); dx = b.x - tr.x; dz = b.z - tr.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (p.tail) { dx = -dx; dz = -dz; if (Math.hypot(tr.x, tr.z) > 10) { dx -= tr.x * 0.1; dz -= tr.z * 0.1; } } }
    if (A.jumpT <= 0 && Math.random() < 0.3) { jump = true; A.jumpT = 1 + Math.random(); }
  } else {
    const ang = Math.atan2(tr.z, tr.x), rad = Math.hypot(tr.x, tr.z);
    dx = -Math.cos(ang) * (rad - 5.5) * 0.3; dz = -Math.sin(ang) * (rad - 5.5) * 0.3;
    for (const bar of r.bars) { const da = ((ang - bar.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; const spd = barSpeed(bar.h); const lead = spd > 0 ? -da : da; if (lead > 0 && lead < 0.45 * Math.max(1, Math.abs(spd))) { if (bar.h < 1 && A.jumpT <= 0 && Math.random() < 0.6 + A.skill * 0.35) { jump = true; A.jumpT = 0.6; } if (bar.h > 1 && A.jumpT <= 0 && Math.random() < 0.4 + A.skill * 0.5) { dive = true; A.jumpT = 0.9; } } }
  }
  return [dx, dz, jump, dive];
}
const barSpeed = (h: number) => h < 1 ? 0.9 + Math.min(1.6, roundT * 0.025) : (roundT > 15 ? -(0.7 + Math.min(1.3, (roundT - 15) * 0.025)) : 0);
const TIME_LIMIT: Record<RoundKind, number> = { race: 150, tiles: 90, jump: 150, tail: 75, mountain: 180 };

let netT = 0; const tmpV = new THREE.Vector3(); const tmp2 = new THREE.Vector3(); const proj = new THREE.Vector3();
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
  for (const tl of r.tiles) { if (tl.state === 1) { tl.t += dt; (tl.mesh.material as THREE.MeshPhysicalMaterial).emissive.setRGB(tl.t * 0.7, tl.t * 0.15, 0); if (tl.t > 0.9) tl.mesh.position.x += (Math.random() - 0.5) * 0.03; if (tl.t > 1.5) { tl.state = 2; tl.col.setEnabled(false); } } else if (tl.state === 2 && tl.mesh.visible) { tl.mesh.position.y -= dt * 9; tl.mesh.scale.multiplyScalar(1 - dt * 2); if (tl.mesh.scale.x < 0.05) tl.mesh.visible = false; } }
  for (const d of r.doors) { if (d.open > 0) { d.open += dt; d.mesh.rotation.x = -Math.min(1.5, d.open * 5); d.mesh.position.y = 1.4 - Math.min(1.3, d.open * 4); continue; } if (!d.real) continue; for (const p of players) { if (p.state !== 'play') continue; const tr = posOf(p); if (Math.abs(tr.x - d.mesh.position.x) < 1.3 && Math.abs(tr.z - d.mesh.position.z) < 0.95) { d.open = 0.01; d.col.setEnabled(false); if (p.human) sfx.crash(); break; } } }
  for (const bl of r.balls) { const tr = bl.body.translation(); if (tr.y < r.killY - 2 || tr.z > 40) { bl.body.setTranslation({ x: bl.home.x + (Math.random() - 0.5) * 4, y: bl.home.y, z: bl.home.z }, true); bl.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } else if (bl.body.linvel().z < 3) bl.body.applyImpulse({ x: 0, y: 0, z: 0.18 }, true); const rot = bl.body.rotation(); bl.mesh.position.set(tr.x, tr.y, tr.z); bl.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w); }
  for (const bm of r.bumpers) { bm.hit = Math.max(0, bm.hit - dt); bm.mesh.scale.setScalar(1 + bm.hit * 0.6); }
  if (r.crown && r.crownPos) { r.crown.rotation.y += dt * 1.5; r.crown.position.y = r.crownPos.y + Math.sin(roundT * 2) * 0.25; }
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
      if (wantPush) push(p);
      if (grabHeld && performance.now() - grabStart > 200) grab(p, dt); else if (!grabHeld) p.grabbing = null;
    } else if (!p.human) {
      const [dx, dz, j, d] = botThink(p, dt); control(p, dx, dz, j, d, dt);
      // les adversaires aussi poussent et attrapent (surtout à la chasse aux queues)
      if (p.ai.grabT <= 0) { p.ai.grabT = r.kind === 'tail' ? 0.4 + Math.random() : 2.5 + Math.random() * 5; const o = frontTarget(p, 1.5); if (o) { if (r.kind === 'tail' && o.tail && !p.tail) grab(p, dt); else if (Math.random() < 0.5) push(p); } }
      if (p.grabbing) { grab(p, dt); if (p.grabT > 0.8) p.grabbing = null; }
    }
    // tapis roulants, ventilateurs, champignons rebondissants
    if (!p.body) continue; const tr = p.body.translation();
    for (const z of r.zones) if (tr.x > z.x0 && tr.x < z.x1 && tr.z > z.z0 && tr.z < z.z1 && tr.y < z.y + 1.5) p.body.setTranslation({ x: tr.x + z.vx * dt, y: tr.y, z: tr.z + z.vz * dt }, true);
    for (const bm of r.bumpers) { const dx = tr.x - bm.x, dz = tr.z - bm.z, d = Math.hypot(dx, dz); if (d < bm.r + 0.5 && Math.abs(tr.y - bm.y - 0.3) < 1.3 && d > 0.01) { p.body.setLinvel({ x: dx / d * 12, y: 5, z: dz / d * 12 }, true); p.lastV.set(dx / d * 12, 5, dz / d * 12); p.tumble = 0.5; bm.hit = 0.25; if (p.id === 'me') { sfx.jump(); vibrate(30); } } }
  }
  wantJump = wantDive = wantPush = false;
  world.timestep = Math.min(1 / 30, dt); world.step();
  // règles
  for (const p of players) {
    if (!p.body || p.remote) continue; const tr = p.body.translation();
    if (r.kind === 'race' || r.kind === 'mountain') { for (let i = r.checkpoints.length - 1; i > p.cp; i--) if (tr.z < r.checkpoints[i]!) { p.cp = i; break; } if (r.kind === 'race' && tr.z < r.finishZ && p.state === 'play') qualify(p); }
    if (r.crownPos && p.state === 'play' && mode === 'play' && Math.hypot(tr.x - r.crownPos.x, tr.y - (r.crownPos.y - 1.4), tr.z - r.crownPos.z) < 1.9) {
      crownWinner = p; p.state = 'qual'; for (const o of players) if (o !== p && o.state === 'play') o.state = 'out';
      if (p.id === 'me') { big('👑', t('VICTOIRE !'), false, 2500); confetti(); if (duoRoom) void games.room('event', { ev: { type: 'crown' } }).catch(() => {}); } else toast(`👑 ${p.name}`);
      if (r.crown) r.crown.visible = false; mode = 'end'; setTimeout(() => finale(), 2600);
    }
    if (tr.y < r.killY && p.state === 'play') {
      if (r.kind === 'race' || r.kind === 'mountain') { const z = r.checkpoints[p.cp]!; const x = (Math.random() - 0.5) * 6; p.body.setTranslation({ x, y: groundY(x, z) + 2, z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); if (p === meP) { sfx.lose(); toast('💦 Splash !'); } }
      else eliminate(p);
    }
  }
  if (mode === 'play' && roundT > TIME_LIMIT[r.kind]) { if (duoRoom) { if (isHost) hostNext(); } else endRound(); }
  // affichage des haricots
  for (const p of players) {
    if (p.body && !p.remote) { const tr = p.body.translation(); p.bean.root.position.set(tr.x, tr.y - 0.77, tr.z); }
    else if (p.remote) p.bean.root.position.lerp(tmp2.set(p.tx, p.ty - 0.77, p.tz), Math.min(1, dt * 10));
    const v = p.body && !p.remote ? p.body.linvel() : { x: 0, y: 0, z: 0 }; const spd = Math.hypot(v.x, v.z);
    const pose: BeanPose = p.remote ? p.pose : mode === 'over' || (p.state === 'qual' && r.kind !== 'tail') ? 'dance' : p.tumble > 0 ? 'tumble' : p.dive > 0 ? 'dive' : p.grabbing ? 'grab' : !p.ground ? 'air' : spd > 0.8 ? 'run' : 'idle';
    if (!p.remote) p.pose = pose;
    animateBean(p.bean, pose, dt, p.remote ? 6 : spd, v.y, roundT);
    let dy = p.yaw - p.bean.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.bean.root.rotation.y += dy * Math.min(1, dt * 12);
    if (p.tailMesh) p.tailMesh.rotation.y = Math.sin(roundT * 8 + p.bean.root.id) * 0.4;
  }
  // caméra : derrière moi (ou derrière l'autre si j'ai fini et qu'on l'attend)
  const th = them$();
  const target = (!meP || spectating || meP.state !== 'play') ? (th && th.state === 'play' ? th : players.find(p => p.state === 'play') ?? meP ?? players[0]!) : meP;
  const tp = target.bean.root.position; if ((r.kind === 'race' || r.kind === 'mountain') && cam.dragId < 0 && !joy.on) cam.yaw += (0 - cam.yaw) * dt * 0.8;
  const dist = r.kind === 'race' || r.kind === 'mountain' ? 9.5 : r.kind === 'tail' ? 12.5 : 11, hgt = r.kind === 'tiles' ? 7 : r.kind === 'tail' ? 9.5 : 5.5;
  tmpV.set(tp.x + Math.sin(cam.yaw) * dist, tp.y + hgt, tp.z + Math.cos(cam.yaw) * dist);
  camera.position.lerp(tmpV, Math.min(1, dt * 6)); camera.lookAt(tp.x, tp.y + 1.2, tp.z - (r.kind === 'race' ? 2 : 0));
  sun.position.set(tp.x - 8, tp.y + 18, tp.z + 10); sun.target.position.copy(tp);
  (r.slime.material as THREE.ShaderMaterial).uniforms.t!.value += dt;
  // flèche vers l'autre joueur quand il est hors de l'écran
  const arrow = $('arrow');
  if (th && th.state === 'play' && th !== target) {
    proj.copy(th.bean.root.position); proj.y += 1.2; proj.project(camera);
    const off = proj.z > 1 || Math.abs(proj.x) > 0.92 || Math.abs(proj.y) > 0.88;
    arrow.hidden = !off;
    if (off) { let x = proj.x, y = proj.y; if (proj.z > 1) { x = -x; y = -y; } const k = 0.85 / Math.max(Math.abs(x), Math.abs(y), 0.01); x *= k; y *= k; arrow.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`; arrow.style.top = `${(-y * 0.5 + 0.5) * innerHeight}px`; arrow.style.setProperty('--a', `${Math.atan2(-y, x)}rad`); }
  } else arrow.hidden = true;
  // interface
  const alive = players.filter(p => p.state === 'play').length;
  $('hRound').innerHTML = `<small>${t('Manche')} ${roundIdx + 1}/${plan.length}</small>${lang === 'ar' ? r.nameAr : r.name}`;
  const left = Math.max(0, Math.ceil(TIME_LIMIT[r.kind] - Math.max(0, roundT)));
  $('hStat').innerHTML = r.kind === 'race' ? `<small>${t('Qualifiés')} · ${left}s</small>${qualified} / ${quota}` : r.kind === 'tail' ? `<small>${t('Queues')} · ${left}s</small>${meP?.tail ? '🦊 ✓' : '🦊 ✗'}` : r.kind === 'mountain' ? `<small>👑 · ${left}s</small>${alive}` : `<small>${t('En vie')} · ${left}s</small>${alive}${spectating ? ` · ${t('Spectateur')}` : ''}`;
  $('bGrab').classList.toggle('on', !!meP?.grabbing);
  if (duoRoom && mode !== 'over') { netT -= dt; if (netT <= 0) { netT = 0.12; void net(); } }
}

// ── À DEUX ───────────────────────────────────────────────────────────────────
const netState = () => { const p = me$(); if (!p) return { c: save.costume }; const tr = posOf(p); return { x: Math.round(tr.x * 100) / 100, y: Math.round(tr.y * 100) / 100, z: Math.round(tr.z * 100) / 100, yaw: Math.round(p.yaw * 100) / 100, pose: p.pose, st: spectating ? 'out' : p.state, r: roundIdx, c: save.costume, tail: p.tail }; };
interface NetIn { c?: Costume; x?: number; y?: number; z?: number; yaw?: number; pose?: string; st?: string; r?: number; tail?: boolean }
let lastEv = 0;
async function net() {
  try {
    const v = await games.room('state', { score: roundIdx, state: mode === 'menu' ? { c: save.costume } : netState() }); duoRoom = v.room ?? duoRoom; const rm = duoRoom; if (!rm) return;
    const os = rm.players[otherOf(rm.me)]?.state as NetIn | null | undefined;
    if (os?.c) remoteCostume = os.c;
    const th = them$(); const m = me$();
    if (th && os && os.r === roundIdx && os.x !== undefined && mode !== 'over') {
      th.tx = os.x; th.ty = os.y ?? 0; th.tz = os.z ?? 0; th.yaw = os.yaw ?? 0; th.pose = (os.pose as BeanPose) ?? 'run';
      if (round?.kind === 'tail' && typeof os.tail === 'boolean' && os.tail !== th.tail) setTail(th, os.tail);
      if (os.st === 'qual' && th.state === 'play') { th.state = 'qual'; if (round?.kind === 'race' || round?.kind === 'mountain') { qualified++; th.bean.root.visible = false; } toast(`🎉 ${th.name} ${t('QUALIFIÉ !')}`); checkEnd(); }
      if (os.st === 'out' && th.state === 'play') { th.state = 'out'; th.bean.root.visible = false; toast(`💦 ${th.name}`); checkEnd(); }
    }
    for (const e of rm.events ?? []) {
      if (e.at <= lastEv || e.from === rm.me) continue; lastEv = Math.max(lastEv, e.at);
      if (e.ev.type === 'push' && m?.body) { const dx = Number(e.ev.dx), dz = Number(e.ev.dz); m.body.setLinvel({ x: dx * 11, y: 4, z: dz * 11 }, true); m.lastV.set(dx * 11, 4, dz * 11); m.tumble = 0.7; vibrate(60); sfx.crash(); toast(`💥 ${th?.name ?? ''}`); }
      if (e.ev.type === 'grab' && m) m.slowed = 0.45;
      if (e.ev.type === 'steal' && m && m.tail) { setTail(m, false); if (th) setTail(th, true); sfx.wrong(); toast(`😱 ${t('On t\'a volé ta queue !')}`); }
      if (e.ev.type === 'crown' && th && mode === 'play') { crownWinner = th; th.state = 'qual'; if (m && m.state === 'play') m.state = 'out'; mode = 'end'; toast(`👑 ${th.name}`); setTimeout(() => finale(), 2400); }
      if (e.ev.type === 'next' && !isHost && Number(e.ev.r) === roundIdx && (mode === 'play' || mode === 'end')) {
        // l'hôte annonce la fin de manche : j'applique son verdict pour nous deux
        if (m && !spectating) { m.state = String(e.ev.guest) === 'qual' ? 'qual' : 'out'; if (m.body) { world.removeRigidBody(m.body); m.body = null; } }
        if (th) th.state = String(e.ev.host) === 'qual' ? 'qual' : 'out';
        mode = 'end'; $('wait').hidden = true; endingRound = true; setTimeout(() => { endingRound = false; advance(); }, Math.max(800, Number(e.ev.at) - serverNow()));
      }
    }
  } catch { /* */ }
}
async function openDuo() {
  if (!online()) { sheet(`<h2>👫</h2><div class="lead">${t('Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.')}</div><button class="btn w" id="x" style="width:100%">${t('Fermer')}</button>`); on('x', () => sheet('')); return; }
  try {
    const v0 = await games.peek(); const r = v0.room; let v = v0;
    if (r && r.game === 'folie' && !r.ended && r.host !== r.me && !r.players[r.me]) v = await games.room('join');
    else if (!r || r.game !== 'folie' || r.ended || !r.players[r.me]) v = await games.room('invite', { game: 'folie' });
    duoRoom = v.room; lastEv = v.now; void games.room('state', { state: { c: save.costume } }).catch(() => {}); lobby();
  } catch (e) { toast(`⚠️ ${String(e).slice(0, 60)}`); }
}
function lobby() {
  const r = duoRoom; if (!r) return; const a = r.me, b = otherOf(a);
  const card = (u: Uid) => `<div class="${r.players[u]?.ready ? 'ok' : ''}"><div style="font-size:30px">${u === 'kouider' ? '🧢' : '🧕'}</div>${names[u]}<div style="font-size:13px;color:#8a7bd8">${!r.players[u] ? `⏳ ${t('En attente…')}` : r.players[u]!.ready ? `✅ ${t('Prêt')}` : '👀'}</div></div>`;
  sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${lang === 'ar' ? 'أنتما الاثنان + 18 منافسًا، تاج واحد فقط! ادفعا وامسكا بعضكما بالزر ✋' : 'Vous deux + 18 adversaires, une seule couronne ! Poussez-vous et attrapez-vous avec ✋'}</div><div class="lob">${card(a)}${card(b)}</div>
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
    if (duoRoom) { duoRoom = r; const os = r?.players[otherOf(r.me)]?.state as NetIn | undefined; if (os?.c) remoteCostume = os.c; if (!r) sheet(''); else if ($('sheet').innerHTML.includes('class="lob"')) { lobby(); maybeStart(); } }
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
applyLang(); showMenu();
setTimeout(() => { const l = document.getElementById('loading'); if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 500); } }, 700);
requestAnimationFrame(loop);
// tests : ?demo=1&kind=tail&ff=10 (manche choisie, avance rapide)
const q = new URLSearchParams(location.search);
if (q.get('demo')) { startShow(Number(q.get('seed') ?? 7), false); const k = q.get('kind') as RoundKind | null; if (k) { plan[0] = k; roundIdx = 0; startRound(); } const ff = Number(q.get('ff') ?? 0); if (ff) setTimeout(() => { mode = 'play'; roundT = 0; for (let i = 0; i < ff * 30; i++) step(1 / 30); }, 6000); }
