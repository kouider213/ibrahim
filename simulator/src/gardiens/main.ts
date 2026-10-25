import * as THREE from 'three';
import { Stage, ARENA, ENEMY_DEF, BUILD_POS, buildXZ, glowTex, type EnemyKind } from './stage.ts';
import { makeHero, animateHero, LOOKS, type Hero } from '../rush/hero.ts';
import { audioUnlock, sfx, music, setMuted, isMuted, duck, setTempo } from '../games/audio.ts';
import { bootIdentity, games, online, local, otherOf, rng, serverNow, syncClock, vibrate, type BuildingId, type Island, type IslandView, type Room, type Uid } from '../games/net.ts';
import { getDeviceToken } from '../services/api.ts';

// LES GARDIENS — action coopérative. Chaque nuit des vagues de monstres montent sur l'île ; on survit, on gagne
// des niveaux (3 cartes de pouvoir au choix), on bat le Roi des Ombres. Le LIEN entre les deux héros brûle les monstres
// qui le traversent : rester proches = plus forts. Cristaux → on reconstruit L'ÎLE COMMUNE (serveur, partagée à deux).
// Solo : le 2ᵉ héros est joué par l'ordi. À deux : chacun son téléphone, positions échangées en direct.

bootIdentity({ name: 'Les Gardiens', short: 'Gardiens', color: '#1c1038', icon: '/ibrahim/icons/gardiens-512.png' });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const AR: Record<string, string> = {
  tag: 'جزيرة قويدر وفاطمة', tank: 'الدرع · السيف', mage: 'النجمة · السحر', duo: 'لعب ثنائي', build: 'البناء', Nuit: 'الليلة', 'Niveau supérieur !': 'مستوى جديد!', 'Choisis un pouvoir': 'اختر قوة',
  'NUIT SURVÉCUE !': 'نجوت من الليلة!', 'Les Ombres ont gagné…': 'انتصرت الظلال…', Cristaux: 'بلورات', Monstres: 'وحوش', Temps: 'الوقت', Village: 'القرية', Rejouer: 'العب مجددًا', Fermer: 'إغلاق',
  'Pas assez de cristaux': 'لا توجد بلورات كافية', Améliorer: 'تحسين', Construire: 'بناء', 'Niveau max': 'المستوى الأقصى', Prêt: 'جاهز', 'En attente…': 'في الانتظار…', Quitter: 'خروج',
  'LE ROI DES OMBRES': 'ملك الظلال', 'arrive !': 'قادم!', 'ENSEMBLE': 'معًا', 'Relève-toi !': 'انهض!', 'te défie aux GARDIENS !': 'يدعوك إلى الحراس!', 'Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.': 'افتح اللعبة من التطبيق للعب معًا.',
};
const t = (s: string) => (lang === 'ar' ? AR[s] ?? s : s);
function applyLang() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { const k = el.dataset.t!; el.dataset.fr ??= el.textContent ?? ''; el.textContent = lang === 'ar' ? AR[k] ?? el.dataset.fr : el.dataset.fr; }); $('bLang').textContent = lang === 'ar' ? 'FR' : 'ع'; }

// ── Pouvoirs ─────────────────────────────────────────────────────────────────
type UpId = 'dmg' | 'rate' | 'area' | 'multi' | 'speed' | 'hp' | 'regen' | 'magnet' | 'orbit' | 'chain' | 'nova' | 'link' | 'crit';
const UPS: Array<{ id: UpId; e: string; fr: string; ar: string; dfr: string; dar: string; max: number }> = [
  { id: 'dmg', e: '⚔️', fr: 'Force', ar: 'القوة', dfr: '+20 % de dégâts', dar: '+20٪ ضرر', max: 5 },
  { id: 'rate', e: '⚡', fr: 'Rapidité', ar: 'السرعة', dfr: 'Attaques 15 % plus rapides', dar: 'هجمات أسرع 15٪', max: 5 },
  { id: 'area', e: '🌀', fr: 'Portée', ar: 'المدى', dfr: 'Zones et portée +15 %', dar: 'المدى +15٪', max: 5 },
  { id: 'multi', e: '✨', fr: 'Multi-coups', ar: 'ضربات متعددة', dfr: '+1 projectile / coup', dar: '+1 قذيفة', max: 3 },
  { id: 'speed', e: '👟', fr: 'Agilité', ar: 'الرشاقة', dfr: 'Déplacement +10 %', dar: 'الحركة +10٪', max: 3 },
  { id: 'hp', e: '❤️', fr: 'Vitalité', ar: 'الحيوية', dfr: '+25 PV max et soin complet', dar: '+25 صحة وشفاء كامل', max: 5 },
  { id: 'regen', e: '🌿', fr: 'Régénération', ar: 'التجدد', dfr: '+0,7 PV par seconde', dar: '+0.7 صحة/ثانية', max: 4 },
  { id: 'magnet', e: '🧲', fr: 'Aimant', ar: 'المغناطيس', dfr: 'Ramasse les cristaux de plus loin', dar: 'تجمع البلورات من بعيد', max: 3 },
  { id: 'orbit', e: '🌟', fr: 'Étoiles gardiennes', ar: 'النجوم الحارسة', dfr: 'Des étoiles tournent autour de toi', dar: 'نجوم تدور حولك', max: 5 },
  { id: 'chain', e: '🌩️', fr: 'Éclair en chaîne', ar: 'البرق المتسلسل', dfr: 'Un éclair saute d\'un monstre à l\'autre', dar: 'برق يقفز بين الوحوش', max: 5 },
  { id: 'nova', e: '❄️', fr: 'Nova de givre', ar: 'انفجار الجليد', dfr: 'Explosion glacée qui ralentit', dar: 'انفجار جليدي يبطئ', max: 5 },
  { id: 'link', e: '💞', fr: 'Lien du cœur', ar: 'رابط القلب', dfr: 'Le lien entre vous brûle plus fort et plus loin', dar: 'الرابط بينكما أقوى وأبعد', max: 5 },
  { id: 'crit', e: '🎯', fr: 'Coup critique', ar: 'الضربة الحاسمة', dfr: '+10 % de chance de dégâts ×2', dar: '+10٪ فرصة ضرر مضاعف', max: 4 },
];
const BINFO: Record<BuildingId, { e: string; fr: string; ar: string; dfr: (l: number) => string }> = {
  maison: { e: '🏠', fr: 'La Maison', ar: 'البيت', dfr: l => `+${l * 20} PV max pour les deux` },
  forge: { e: '🔥', fr: 'La Forge', ar: 'الحدادة', dfr: l => `+${l * 10} % de dégâts` },
  jardin: { e: '🌸', fr: 'Le Jardin', ar: 'الحديقة', dfr: l => `+${(l * 0.4).toFixed(1)} PV/s de régénération` },
  phare: { e: '🗼', fr: 'Le Phare', ar: 'المنارة', dfr: l => `Aimant +${l * 15} % · XP +${l * 6} %` },
  fontaine: { e: '⛲', fr: 'La Fontaine', ar: 'النافورة', dfr: l => l ? `${Math.min(3, l)} résurrection(s) gratuite(s) par nuit` : 'Résurrection gratuite' },
  tour: { e: '🔮', fr: 'La Tour de cristal', ar: 'برج البلور', dfr: l => l ? `La tour tire sur les monstres (puissance ${l})` : 'Une tour qui défend l\'île' },
};

// ── État ─────────────────────────────────────────────────────────────────────
interface H3 {
  who: 'me' | 'ally'; cls: 'k' | 'f'; h: Hero; x: number; z: number; face: number; hp: number; max: number; down: boolean; downT: number; inv: number; revive: number;
  up: Record<UpId, number>; cd: Record<string, number>; mvx: number; mvz: number; ai: boolean; remote: boolean; tx: number; tz: number; kills: number; lvl: number;
}
interface En { k: EnemyKind; x: number; z: number; y: number; hp: number; max: number; slow: number; flash: number; shoot: number; alive: boolean; rise: number; hitBy: Map<string, number> }
interface Gem { x: number; z: number; v: number; alive: boolean; pull: boolean }
interface Bolt { x: number; z: number; vx: number; vz: number; dmg: number; life: number; owner: H3; enemy: boolean }
interface Boss { x: number; z: number; hp: number; max: number; slam: number; tele: number; tx: number; tz: number; summon: number; alive: boolean; g: THREE.Group; ring: THREE.Mesh; flash: number }
const stage = new Stage($<HTMLCanvasElement>('stage'));
const S = local.json<{ cls: 'k' | 'f'; quality: 'high' | 'low'; localIsland: Island | null }>('gardiens', { cls: 'k', quality: 'high', localIsland: null });
const persist = () => local.save('gardiens', S);
stage.setQuality(S.quality);
let island: Island = S.localIsland ?? { crystals: 0, b: { maison: 0, forge: 0, jardin: 0, phare: 0, fontaine: 0, tour: 0 }, night: { kouider: 1, femme: 1 }, best: { kouider: 0, femme: 0 }, log: [] };
let costs: IslandView['costs'] | null = null; let names: Record<Uid, string> = { kouider: 'Kouider', femme: 'Fatima' }; let me: Uid = 'kouider';
const localCost = (id: BuildingId, l: number) => Math.round(({ maison: 60, forge: 80, jardin: 70, phare: 90, fontaine: 150, tour: 200 })[id] * Math.pow(l + 1, 1.6));
const costOf = (id: BuildingId, l: number) => costs?.[id]?.[l] ?? localCost(id, l);
function applyIsland() { for (const id of Object.keys(BUILD_POS) as BuildingId[]) stage.setBuilding(id, island.b[id]); }

type Mode = 'hub' | 'play' | 'pick' | 'over';
let mode: Mode = 'hub'; let duoRoom: Room | null = null; let night = 1;
let heroes: H3[] = []; let enemies: En[] = []; let gems: Gem[] = []; let bolts: Bolt[] = []; let boss: Boss | null = null;
let T = 0, kills = 0, charge = 0, xp = 0, need = 5, level = 1, freeRevives = 0, slowmo = 1, shake = 0, R = rng(1), spawnAcc = 0, towerCd = 0, ended = false;
const BOSS_AT = 150;
const meH = () => heroes.find(h => h.who === 'me')!; const allyH = () => heroes.find(h => h.who === 'ally');

function mkHero(who: 'me' | 'ally', cls: 'k' | 'f', ai: boolean, remote: boolean): H3 {
  const look = LOOKS.find(l => l.id === (cls === 'k' ? 'kouider' : 'fatima'))!; const h = makeHero(look);
  // arme : épée + bouclier (Kouider), bâton magique (Fatima)
  if (cls === 'k') {
    const sw = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.2), new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.9, roughness: 0.2 })); blade.position.y = -0.75; sw.add(blade);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.42), new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.7, roughness: 0.3 })); guard.position.y = -0.3; sw.add(guard); sw.position.y = -0.3; sw.rotation.x = -0.4; h.elR.add(sw);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), new THREE.MeshStandardMaterial({ color: '#2563eb', metalness: 0.5, roughness: 0.35 })); sh.rotation.z = Math.PI / 2; sh.position.set(-0.12, -0.2, 0.05); h.elL.add(sh);
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.14, 5), new THREE.MeshStandardMaterial({ color: '#ffd36b', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.8 })); em.position.set(-0.17, -0.2, 0.05); em.rotation.y = -Math.PI / 2; h.elL.add(em);
  } else {
    const st = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.4, 8), new THREE.MeshStandardMaterial({ color: '#7c4a2e' })); pole.position.y = -0.4; st.add(pole);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ color: '#c4b5fd', emissive: new THREE.Color('#a855f7'), emissiveIntensity: 2 })); orb.position.y = 0.35; st.add(orb);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#d8b4fe', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.setScalar(0.9); gl.position.y = 0.35; st.add(gl);
    st.position.y = -0.3; h.elR.add(st);
  }
  h.root.scale.setScalar(1.15); stage.scene.add(h.root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), new THREE.MeshBasicMaterial({ color: cls === 'k' ? '#ff6f8f' : '#a78bfa', transparent: true, opacity: 0.8, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; h.root.add(ring);
  const up = Object.fromEntries(UPS.map(u => [u.id, 0])) as Record<UpId, number>;
  const max = 100 + island.b.maison * 20;
  return { who, cls, h, x: who === 'me' ? -1.5 : 1.5, z: 2, face: Math.PI, hp: max, max, down: false, downT: 0, inv: 0, revive: 0, up, cd: {}, mvx: 0, mvz: 0, ai, remote, tx: 0, tz: 0, kills: 0, lvl: 1 };
}

// ── Effets visuels réutilisables ─────────────────────────────────────────────
const fxGroup = new THREE.Group(); stage.scene.add(fxGroup);
interface Fx { o: THREE.Object3D; life: number; max: number; kind: 'fade' | 'ring' | 'arc' }
const fxs: Fx[] = [];
function fxRing(x: number, z: number, r: number, color: string, life = 0.45) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.15, z); m.userData.r = r; fxGroup.add(m); fxs.push({ o: m, life, max: life, kind: 'ring' }); }
function fxArc(x: number, z: number, face: number, r: number, color: string) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.35, r, 32, 1, -1.3, 2.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -face + Math.PI / 2; m.position.set(x, 0.9, z); fxGroup.add(m); fxs.push({ o: m, life: 0.22, max: 0.22, kind: 'arc' });
}
function fxLine(pts: THREE.Vector3[], color: string) { const g = new THREE.BufferGeometry().setFromPoints(pts); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending })); fxGroup.add(l); fxs.push({ o: l, life: 0.18, max: 0.18, kind: 'fade' }); }
const link = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ff8fc0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); stage.scene.add(link);
const linkGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ff4d8d', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); stage.scene.add(linkGlow);
const orbitMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: '#ffe680', emissive: new THREE.Color('#ffc400'), emissiveIntensity: 2 }), 24); orbitMesh.count = 0; orbitMesh.frustumCulled = false; stage.scene.add(orbitMesh);
const tombs = new Map<H3, THREE.Object3D>();

// ── Entrées : joystick (moitié gauche) / clavier ─────────────────────────────
const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }; const keys = new Set<string>();
addEventListener('pointerdown', e => {
  audioUnlock(); if (mode !== 'play' || (e.target as HTMLElement).closest('button, .sheet')) return;
  if (!joy.on) { joy.on = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0; const j = $('joy'); j.hidden = false; j.style.left = `${e.clientX}px`; j.style.top = `${e.clientY}px`; $('joyK').style.transform = 'translate(-50%,-50%)'; }
});
addEventListener('pointermove', e => { if (!joy.on || e.pointerId !== joy.id) return; let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), mx = 55; if (d > mx) { dx *= mx / d; dy *= mx / d; } joy.x = dx / mx; joy.y = dy / mx; $('joyK').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; });
const joyEnd = (e: PointerEvent) => { if (e.pointerId !== joy.id) return; joy.on = false; joy.x = joy.y = 0; $('joy').hidden = true; };
addEventListener('pointerup', joyEnd); addEventListener('pointercancel', joyEnd);
addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') ultimate(); });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ── Interface village ────────────────────────────────────────────────────────
function toast(s: string) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }
function banner(b: string, s = '') { const d = document.createElement('div'); d.className = 'banner'; d.innerHTML = `<span>${s}</span><b>${b}</b>`; document.body.appendChild(d); setTimeout(() => d.remove(), 2700); }
function sheet(h: string) { $('sheet').innerHTML = h ? `<div class="sheet"><div class="card">${h}</div></div>` : ''; }
const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = () => { audioUnlock(); sfx.click(); fn(); }; };
function renderHub() {
  $('hCry').textContent = island.crystals.toLocaleString('fr-FR'); night = island.night[me] ?? 1; $('hNight').textContent = `🌙 ${night}`;
  $('playTxt').textContent = `${t('Nuit')} ${night}`; $('bSound').textContent = isMuted() ? '🔇' : '🔊'; $('bExit').hidden = !embedded;
  $('hK').classList.toggle('on', S.cls === 'k'); $('hF').classList.toggle('on', S.cls === 'f');
  const lg = $('hLog'); lg.hidden = !island.log.length; lg.innerHTML = island.log.slice(0, 3).map(l => `• ${l.text}`).join('<br>');
}
async function loadIsland() {
  if (!online()) { applyIsland(); renderHub(); return; }
  try { const v = await games.island(); island = v.island; costs = v.costs; names = v.names; const b = await games.board().catch(() => null); if (b) me = b.me; applyIsland(); renderHub(); } catch { applyIsland(); renderHub(); }
}
function showHub() {
  mode = 'hub'; snap = true; sheet(''); $('hub').hidden = false; $('hud').hidden = true; $('ult').hidden = true; $('joy').hidden = true;
  clearBattle(); stage.setNight(0); music(true, 'calm'); duck(0.4); setTempo(90); renderHub(); void loadIsland();
}
on('hK', () => { S.cls = 'k'; persist(); renderHub(); }); on('hF', () => { S.cls = 'f'; persist(); renderHub(); });
on('bSound', () => { setMuted(!isMuted()); renderHub(); });
on('bLang', () => { lang = lang === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('jeux:lang', lang); } catch { /* */ } applyLang(); renderHub(); });
on('bExit', () => window.parent.postMessage({ type: 'jeux:exit' }, '*'));
on('bPlay', () => startNight(Math.floor(Math.random() * 1e9), false));
on('bBuild', showBuild); on('bDuo', () => void openDuo());
function showBuild() {
  const ids = Object.keys(BUILD_POS) as BuildingId[];
  sheet(`<h2>🏗️ ${t('Construire')}</h2><div class="lead">${lang === 'ar' ? 'الجزيرة مشتركة بينكما' : 'L\'île est à vous deux : chaque cristal compte'} · 💎 ${island.crystals.toLocaleString('fr-FR')}</div>
    ${ids.map(id => { const l = island.b[id], c = l < 5 ? costOf(id, l) : 0; return `<div class="bld"><div class="e">${BINFO[id].e}</div><div class="t"><b>${lang === 'ar' ? BINFO[id].ar : BINFO[id].fr} · ${l}/5</b><span>${BINFO[id].dfr(Math.max(1, l + (l < 5 ? 1 : 0)))}</span><div class="pips">${[0, 1, 2, 3, 4].map(i => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div></div>${l >= 5 ? `<b>MAX</b>` : `<button class="btn go" data-b="${id}">💎 ${c.toLocaleString('fr-FR')}</button>`}</div>`; }).join('')}
    <button class="btn ghost" id="bClose" style="width:100%;margin-top:6px">${t('Fermer')}</button>`);
  on('bClose', () => sheet(''));
  document.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(b => b.onclick = async () => {
    const id = b.dataset.b as BuildingId; const c = costOf(id, island.b[id]);
    if (island.crystals < c) { sfx.wrong(); toast(`💎 ${t('Pas assez de cristaux')}`); return; }
    try {
      if (online()) { const v = await games.islandAct('build', { id }); island = v.island; }
      else { island.crystals -= c; island.b[id]++; S.localIsland = island; persist(); }
      sfx.win(); vibrate(40); stage.setBuilding(id, island.b[id]); const p = buildXZ(id); stage.burst(p.x, 2, p.z, '#ffd36b', 60, 9); focusBuild = { x: p.x, z: p.z, t: 2.2 };
      renderHub(); showBuild();
    } catch (e) { toast(String(e).replace(/^Error: API \d+: /, '').slice(0, 60)); }
  });
}
let focusBuild: { x: number; z: number; t: number } | null = null;

// ── Combat ───────────────────────────────────────────────────────────────────
function clearBattle() {
  for (const h of heroes) stage.scene.remove(h.h.root); heroes = []; enemies = []; gems = []; bolts = [];
  for (const tb of tombs.values()) stage.scene.remove(tb); tombs.clear();
  if (boss) { stage.scene.remove(boss.g); stage.scene.remove(boss.ring); boss = null; }
  for (const f of fxs) fxGroup.remove(f.o); fxs.length = 0; link.visible = linkGlow.visible = false; orbitMesh.count = 0;
  for (const m of Object.values(stage.enemyMesh)) m.count = 0; stage.gemMesh.count = 0; stage.boltMesh.count = 0; stage.orbMesh.count = 0;
}
function startNight(seed: number, duo: boolean, startAt = 0) {
  clearBattle(); sheet(''); $('hub').hidden = true; $('hud').hidden = false; $('ult').hidden = false;
  R = rng(seed); T = 0; kills = 0; charge = 0; xp = 0; need = 5; level = 1; spawnAcc = 0; towerCd = 0; ended = false; freeRevives = Math.min(3, island.b.fontaine); slowmo = 1;
  const mine = S.cls, other = mine === 'k' ? 'f' : 'k';
  if (duo && duoRoom) { const oc = (duoRoom.players[otherOf(duoRoom.me)]?.state?.c as 'k' | 'f' | undefined); heroes = [mkHero('me', mine, false, false), mkHero('ally', oc && oc !== mine ? oc : other, false, true)]; }
  else heroes = [mkHero('me', mine, false, false), mkHero('ally', other, true, false)];
  $('allyN').textContent = duo ? (names[otherOf(me)] ?? '') : (other === 'k' ? 'Kouider·IA' : 'Fatima·IA');
  mode = 'play'; snap = true; stage.setNight(1); music(true, 'rush'); duck(0.45); setTempo(104);
  const go = () => banner(`${t('Nuit')} ${night}`, lang === 'ar' ? 'دافعا عن جزيرتكما' : 'DÉFENDEZ VOTRE ÎLE');
  if (startAt) { const w = Math.max(0, startAt - serverNow()); slowmo = 0; setTimeout(() => { slowmo = 1; go(); }, w); } else go();
}
const dmgMul = (h: H3) => (1 + h.up.dmg * 0.2) * (1 + island.b.forge * 0.1) * (together() ? 1.15 : 1);
const together = () => { const a = heroes[0], b = heroes[1]; return !!a && !!b && !a.down && !b.down && Math.hypot(a.x - b.x, a.z - b.z) < linkRange(); };
const linkRange = () => 6 + Math.max(heroes[0]?.up.link ?? 0, heroes[1]?.up.link ?? 0) * 1.2;
const rateMul = (h: H3) => 1 / (1 + h.up.rate * 0.15);
const areaMul = (h: H3) => 1 + h.up.area * 0.15;
function hurt(e: En, d: number, h: H3 | null, src: string) {
  if (!e.alive || e.rise > 0) return;
  let dmg = d; let crit = false; if (h && Math.random() < h.up.crit * 0.1) { dmg *= 2; crit = true; }
  e.hp -= dmg; e.flash = 0.12;
  if (Math.random() < 0.35 || crit) dmgText(e.x, 1.6, e.z, Math.round(dmg), crit);
  if (e.hp <= 0) { e.alive = false; kills++; if (h) h.kills++; charge = Math.min(100, charge + (e.k === 'golem' ? 4 : 1)); dropGem(e.x, e.z, ENEMY_DEF[e.k].xp); stage.burst(e.x, 0.8, e.z, e.k === 'slime' ? '#86efac' : e.k === 'bat' ? '#c4b5fd' : e.k === 'golem' ? '#d1d5db' : '#67e8f9', 8, 4); if (kills % 3 === 0) sfx.coin(kills % 8); }
  void src;
}
function dropGem(x: number, z: number, v: number) {
  // trop de cristaux au sol : on les fusionne (plus gros, plus lisible, moins lourd pour le téléphone)
  if (gems.length > 140) { let best: Gem | null = null, bd = 6; for (const g of gems) { if (!g.alive) continue; const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = g; } } if (best) { best.v += v; return; } }
  gems.push({ x, z, v, alive: true, pull: false });
}
function hurtBoss(d: number, h: H3 | null) {
  if (!boss?.alive) return; let dmg = d; if (h && Math.random() < h.up.crit * 0.1) dmg *= 2;
  boss.hp -= dmg; boss.flash = 0.1; if (Math.random() < 0.3) dmgText(boss.x, 4, boss.z, Math.round(dmg), dmg > d);
  if (boss.hp <= 0) { boss.alive = false; stage.burst(boss.x, 3, boss.z, '#f0abfc', 120, 12); stage.burst(boss.x, 3, boss.z, '#ffd36b', 80, 10); shake = 1; sfx.win(); setTimeout(() => endNight(true), 1800); }
}
const proj = new THREE.Vector3();
function dmgText(x: number, y: number, z: number, n: number, crit: boolean) {
  proj.set(x, y, z).project(stage.camera); if (proj.z > 1) return;
  const d = document.createElement('div'); d.className = `dmg${crit ? ' crit' : ''}`; d.textContent = String(n); d.style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`; d.style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight}px`;
  const fx = $('fx'); if (fx.childElementCount > 40) fx.firstElementChild?.remove(); fx.appendChild(d); setTimeout(() => d.remove(), 700);
}
function nearestEnemy(x: number, z: number, max: number) { let best: En | null = null, bd = max; for (const e of enemies) { if (!e.alive || e.rise > 0) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; } } return best; }
function spawn(k: EnemyKind) {
  const alive = enemies.filter(e => e.alive && e.k === k).length; if (alive >= ENEMY_DEF[k].max) return;
  const a = R() * Math.PI * 2; const sc = 1 + (night - 1) * 0.35 + T / 240;
  const def = ENEMY_DEF[k]; enemies.push({ k, x: Math.cos(a) * (ARENA + 1), z: Math.sin(a) * (ARENA + 1), y: -2, hp: def.hp * sc, max: def.hp * sc, slow: 0, flash: 0, shoot: 2 + R() * 2, alive: true, rise: 0.6, hitBy: new Map() });
}
function spawnBoss() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 28, 20), new THREE.MeshStandardMaterial({ color: '#2e1065', roughness: 0.35, metalness: 0.2, emissive: new THREE.Color('#4c1d95'), emissiveIntensity: 0.5 })); body.scale.set(1, 1.2, 1); body.position.y = 2.6; body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff2a55' })); eye.position.set(s * 0.7, 3.2, 1.8); g.add(eye); const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.6, 4, 10), body.material); arm.position.set(s * 2.4, 2.2, 0); arm.rotation.z = s * 0.5; arm.castShadow = true; g.add(arm); }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.7, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.9, roughness: 0.2, emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 0.6, side: THREE.DoubleSide })); crown.position.y = 5.1; g.add(crown);
  for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), crown.material); const a = i * Math.PI / 4; sp.position.set(Math.cos(a) * 1.05, 5.7, Math.sin(a) * 1.05); g.add(sp); }
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#a855f7', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); aura.scale.setScalar(9); aura.position.y = 3; g.add(aura);
  const a = R() * Math.PI * 2; g.position.set(Math.cos(a) * ARENA, 0, Math.sin(a) * ARENA); g.scale.setScalar(1.0 + night * 0.05); stage.scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 48), new THREE.MeshBasicMaterial({ color: '#ff2a55', transparent: true, opacity: 0, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; stage.scene.add(ring);
  const hp = 1100 * (1 + (night - 1) * 0.5);
  boss = { x: g.position.x, z: g.position.z, hp, max: hp, slam: 4, tele: 0, tx: 0, tz: 0, summon: 6, alive: true, g, ring, flash: 0 };
  $('boss').hidden = false; $('bossN').textContent = t('LE ROI DES OMBRES'); banner(t('LE ROI DES OMBRES'), t('arrive !')); sfx.crash(); shake = 0.8; duck(0.6); setTempo(124);
}
function levelUp() {
  level++; xp -= need; need = Math.round(5 + level * 3.2 + level * level * 0.15);
  const h = meH(); h.lvl = level; sfx.power(); stage.burst(h.x, 1.5, h.z, '#ffd36b', 30, 6);
  const pool = UPS.filter(u => h.up[u.id] < u.max); const choices: typeof UPS = [];
  if (level === 2 && h.up.link === 0) choices.push(UPS.find(u => u.id === 'link')!);
  while (choices.length < 3 && pool.length) { const u = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!; if (!choices.includes(u)) choices.push(u); }
  if (!choices.length) return;
  mode = 'pick'; slowmo = duoRoom ? 0.15 : 0; joy.on = false; $('joy').hidden = true;
  sheet(`<h2>✦ ${t('Niveau supérieur !')} ✦</h2><div class="lead">${t('Choisis un pouvoir')} · Niv ${level}</div><div class="cards">${choices.map(u => `<button class="up" data-u="${u.id}" style="position:relative"><div class="e">${u.e}</div><div><b>${lang === 'ar' ? u.ar : u.fr}${h.up[u.id] ? ` ${h.up[u.id] + 1}` : ''}</b><span>${lang === 'ar' ? u.dar : u.dfr}</span><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < h.up[u.id] ? 'on' : ''}"></i>`).join('')}</div></div></button>`).join('')}</div>`);
  document.querySelectorAll<HTMLButtonElement>('[data-u]').forEach(b => b.onclick = () => { const id = b.dataset.u as UpId; h.up[id]++; if (id === 'hp') { h.max += 25; h.hp = h.max; } sfx.click(); sheet(''); mode = 'play'; slowmo = 1; h.inv = Math.max(h.inv, 1); if (xp >= need) setTimeout(levelUp, 250); });
  // l'IA monte aussi d'un niveau, au hasard
  const ally = allyH(); if (ally?.ai) { const ap = UPS.filter(u => ally.up[u.id] < u.max); const u = ap[Math.floor(Math.random() * ap.length)]; if (u) { ally.up[u.id]++; if (u.id === 'hp') { ally.max += 25; ally.hp = ally.max; } } }
}
function ultimate() {
  if (mode !== 'play' || charge < 100) return; const a = heroes[0]!, b = heroes[1]!;
  charge = 0; sfx.win(); vibrate([40, 30, 80]); shake = 0.9;
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2; const r = 10, dmg = 60 * Math.max(dmgMul(a), dmgMul(b));
  fxRing(cx, cz, r, '#ff6fa5', 0.8); fxRing(cx, cz, r * 0.7, '#ffd36b', 0.6); stage.burst(cx, 1, cz, '#ff9cc4', 120, 14); stage.burst(cx, 1, cz, '#ffe680', 80, 10);
  for (const e of enemies) if (e.alive && Math.hypot(e.x - cx, e.z - cz) < r) hurt(e, dmg, a, 'ult');
  if (boss?.alive && Math.hypot(boss.x - cx, boss.z - cz) < r + 2) hurtBoss(dmg * 3, a);
  banner('SUPER DUO !', t('ENSEMBLE'));
  if (duoRoom) void games.room('event', { ev: { type: 'ult', x: cx, z: cz } }).catch(() => {});
}
on('ult', ultimate);

function heroAttacks(h: H3, dt: number) {
  if (h.down) return;
  const cd = (k: string, period: number) => { h.cd[k] = (h.cd[k] ?? Math.random() * period) - dt; if (h.cd[k]! <= 0) { h.cd[k] = period; return true; } return false; };
  const dm = dmgMul(h), ar = areaMul(h), rm = rateMul(h);
  if (h.cls === 'k') {
    if (cd('sword', 0.95 * rm)) {
      const tgt = nearestEnemy(h.x, h.z, 5 * ar) ; if (tgt) h.face = Math.atan2(tgt.x - h.x, tgt.z - h.z);
      const dirs = [h.face, ...(h.up.multi >= 1 ? [h.face + Math.PI] : []), ...(h.up.multi >= 2 ? [h.face + Math.PI / 2] : []), ...(h.up.multi >= 3 ? [h.face - Math.PI / 2] : [])];
      const r = 3.0 * ar;
      for (const f of dirs) {
        fxArc(h.x, h.z, f, r, '#ffe7a3');
        for (const e of enemies) { if (!e.alive) continue; const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz); if (d > r + ENEMY_DEF[e.k].r) continue; let da = Math.atan2(dx, dz) - f; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < 1.35 || d < 1) { hurt(e, 8 * dm, h, 'sword'); e.x += dx / (d || 1) * 0.6; e.z += dz / (d || 1) * 0.6; } }
        if (boss?.alive) { const dx = boss.x - h.x, dz = boss.z - h.z; if (Math.hypot(dx, dz) < r + 2.2) hurtBoss(8 * dm, h); }
      }
      if (h.who === 'me') sfx.lane();
    }
  } else if (cd('bolt', 0.7 * rm)) {
    const tgt = nearestEnemy(h.x, h.z, 14 * ar) ?? null; const bt = boss?.alive && Math.hypot(boss.x - h.x, boss.z - h.z) < 14 * ar ? boss : null;
    const tx = tgt?.x ?? bt?.x, tz = tgt?.z ?? bt?.z;
    if (tx !== undefined && tz !== undefined) {
      const base = Math.atan2(tx - h.x, tz - h.z); h.face = base; const n = 1 + h.up.multi;
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.22; bolts.push({ x: h.x, z: h.z, vx: Math.sin(a) * 17, vz: Math.cos(a) * 17, dmg: 6 * dm, life: 1.1 * ar, owner: h, enemy: false }); }
      if (h.who === 'me') sfx.tick();
    }
  }
  if (h.up.chain && cd('chain', 2.3 * rm)) {
    let from = new THREE.Vector3(h.x, 1, h.z); const hit = new Set<En>(); let cur = nearestEnemy(h.x, h.z, 9 * ar);
    for (let i = 0; i < 2 + h.up.chain && cur; i++) { const to = new THREE.Vector3(cur.x, 1, cur.z); const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8)); fxLine([from, mid, to], '#a5f3fc'); hurt(cur, (6 + h.up.chain * 3) * dm, h, 'chain'); hit.add(cur); from = to; let nx: En | null = null, nd = 6 * ar; for (const e of enemies) { if (!e.alive || hit.has(e)) continue; const d = Math.hypot(e.x - cur.x, e.z - cur.z); if (d < nd) { nd = d; nx = e; } } cur = nx; }
    if (h.who === 'me') sfx.shield();
  }
  if (h.up.nova && cd('nova', 4.2 * rm)) {
    const r = (3.4 + h.up.nova * 0.5) * ar; fxRing(h.x, h.z, r, '#7dd3fc', 0.5);
    for (const e of enemies) if (e.alive && Math.hypot(e.x - h.x, e.z - h.z) < r) { hurt(e, (4 + h.up.nova * 2.5) * dm, h, 'nova'); e.slow = 2.2; }
    if (boss?.alive && Math.hypot(boss.x - h.x, boss.z - h.z) < r + 2) hurtBoss((4 + h.up.nova * 2.5) * dm, h);
  }
  if (h.up.orbit) {
    const n = h.up.orbit + 1, r = 2.3 * ar;
    for (let i = 0; i < n; i++) { const a = stage.time * 3 + i * Math.PI * 2 / n; const ox = h.x + Math.cos(a) * r, oz = h.z + Math.sin(a) * r;
      for (const e of enemies) { if (!e.alive) continue; if (Math.hypot(e.x - ox, e.z - oz) < 0.8 + ENEMY_DEF[e.k].r) { const k = `o${h.who}`; const last = e.hitBy.get(k) ?? -9; if (stage.time - last > 0.45) { e.hitBy.set(k, stage.time); hurt(e, (4 + h.up.orbit * 1.5) * dm, h, 'orbit'); } } }
      if (boss?.alive && Math.hypot(boss.x - ox, boss.z - oz) < 2.6 && Math.random() < dt * 3) hurtBoss((4 + h.up.orbit * 1.5) * dm, h);
    }
  }
}
function regen(h: H3, dt: number) { if (h.down) return; h.hp = Math.min(h.max, h.hp + (h.up.regen * 0.7 + island.b.jardin * 0.4) * dt); }
function hitHero(h: H3, d: number) {
  if (h.down || h.inv > 0 || h.remote) return;
  h.hp -= d; h.inv = 0.45;
  if (h.who === 'me') { vibrate(30); $('vig').classList.add('on'); setTimeout(() => $('vig').classList.remove('on'), 220); shake = Math.max(shake, 0.25); }
  if (h.hp <= 0) {
    if (freeRevives > 0 && h.who === 'me') { freeRevives--; h.hp = h.max * 0.6; h.inv = 2; fxRing(h.x, h.z, 6, '#7dd3fc', 0.8); toast(`⛲ ${t('Relève-toi !')}`); for (const e of enemies) if (e.alive && Math.hypot(e.x - h.x, e.z - h.z) < 6) e.slow = 2; return; }
    h.hp = 0; h.down = true; h.downT = 0; sfx.crash();
    const tb = new THREE.Group(); const stone = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.25), new THREE.MeshStandardMaterial({ color: '#9ca3af' })); stone.position.y = 0.55; tb.add(stone);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 40), new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.6, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.name = 'halo'; tb.add(halo);
    tb.position.set(h.x, 0, h.z); stage.scene.add(tb); tombs.set(h, tb);
    if (heroes.every(x => x.down)) setTimeout(() => endNight(false), 1500);
  }
}
function reviveHero(h: H3) { h.down = false; h.hp = h.max * 0.5; h.inv = 2; h.revive = 0; const tb = tombs.get(h); if (tb) { stage.scene.remove(tb); tombs.delete(h); } fxRing(h.x, h.z, 3, '#fde68a', 0.6); stage.burst(h.x, 1, h.z, '#fde68a', 40, 6); sfx.power(); toast(`💞 ${t('Relève-toi !')}`); }

let netT = 0, snap = true;
function step(dt0: number) {
  const dt = dt0 * slowmo;
  stage.update(dt0);
  if (mode === 'hub') {
    const a = stage.time * 0.08; let cx = Math.sin(a) * 46, cz = Math.cos(a) * 46, ly = 0, lx = 0, lz = 0;
    if (focusBuild) { focusBuild.t -= dt0; lx = focusBuild.x; lz = focusBuild.z; cx = focusBuild.x * 1.6; cz = focusBuild.z * 1.6; if (focusBuild.t <= 0) focusBuild = null; }
    stage.camera.position.lerp(new THREE.Vector3(cx, 26, cz), snap ? 1 : Math.min(1, dt0 * 1.5)); snap = false; stage.camera.lookAt(lx, ly - 4, lz); stage.camera.fov = 52; stage.camera.updateProjectionMatrix();
    return;
  }
  if (!heroes.length) return;
  T += dt; const m = meH(), al = allyH();
  // déplacement du joueur
  if (mode === 'play' && !m.down) {
    let vx = joy.x, vz = joy.y;
    if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) vx -= 1; if (keys.has('arrowright') || keys.has('d')) vx += 1;
    if (keys.has('arrowup') || keys.has('z') || keys.has('w')) vz -= 1; if (keys.has('arrowdown') || keys.has('s')) vz += 1;
    const l = Math.hypot(vx, vz); if (l > 1) { vx /= l; vz /= l; }
    const sp = 6.2 * (1 + m.up.speed * 0.1); m.mvx = vx * sp; m.mvz = vz * sp;
    if (l > 0.1) m.face = Math.atan2(vx, vz);
  } else { m.mvx = m.mvz = 0; }
  // compagnon (ordi) : reste près pour le lien, s'écarte des monstres, vient me relever
  if (al?.ai && !al.down) {
    let gx: number, gz: number;
    if (m.down) { gx = m.x; gz = m.z; } else { const a = stage.time * 0.4; gx = m.x + Math.cos(a) * 3.6; gz = m.z + Math.sin(a) * 3.6; }
    let ax = gx - al.x, az = gz - al.z; const d = Math.hypot(ax, az); ax = d > 0.5 ? ax / d : 0; az = d > 0.5 ? az / d : 0;
    for (const e of enemies) { if (!e.alive) continue; const ex = al.x - e.x, ez = al.z - e.z, ed = Math.hypot(ex, ez); if (ed < 2.6 && ed > 0.01) { ax += ex / ed * (2.6 - ed) * 0.9; az += ez / ed * (2.6 - ed) * 0.9; } }
    const l = Math.hypot(ax, az); const sp = 5.8 * (1 + al.up.speed * 0.1); al.mvx = l > 0.05 ? ax / l * sp * Math.min(1, d / 2 + 0.3) : 0; al.mvz = l > 0.05 ? az / l * sp * Math.min(1, d / 2 + 0.3) : 0;
    if (l > 0.1) al.face = Math.atan2(al.mvx, al.mvz);
  }
  // partenaire à distance : on glisse vers sa dernière position connue
  if (al?.remote) { al.x += (al.tx - al.x) * Math.min(1, dt0 * 8); al.z += (al.tz - al.z) * Math.min(1, dt0 * 8); }
  for (const h of heroes) {
    if (!h.remote && !h.down) { h.x += h.mvx * dt; h.z += h.mvz * dt; }
    const r = Math.hypot(h.x, h.z); if (r > ARENA - 0.8) { h.x *= (ARENA - 0.8) / r; h.z *= (ARENA - 0.8) / r; }
    for (const id of Object.keys(BUILD_POS) as BuildingId[]) { const p = buildXZ(id); const dx = h.x - p.x, dz = h.z - p.z, d = Math.hypot(dx, dz), rr = 2.4; if (d < rr && d > 0.01) { h.x = p.x + dx / d * rr; h.z = p.z + dz / d * rr; } }
    h.inv = Math.max(0, h.inv - dt);
    if (mode === 'play') { heroAttacks(h, dt); regen(h, dt); }
    // relever l'autre : rester 2,5 s à côté de sa tombe
    if (h.down) { const o = heroes.find(x => x !== h)!; if (!o.down && Math.hypot(o.x - h.x, o.z - h.z) < 1.8) { h.revive += dt; if (h.revive > 2.5) { if (h.remote) { void games.room('event', { ev: { type: 'revive' } }).catch(() => {}); h.revive = 0; } else reviveHero(h); } } else h.revive = Math.max(0, h.revive - dt); const tb = tombs.get(h); if (tb) { const halo = tb.getObjectByName('halo') as THREE.Mesh; halo.scale.setScalar(1 + h.revive * 0.4); } }
    const moving = Math.hypot(h.mvx, h.mvz) > 0.3 || (h.remote && Math.hypot(h.tx - h.x, h.tz - h.z) > 0.15);
    animateHero(h.h, h.down ? 'fall' : moving ? 'run' : 'idle', dt0, moving ? 9 : 0, stage.time);
    h.h.root.position.set(h.x, 0, h.z); h.h.root.rotation.y += ((h.face - h.h.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt0 * 12);
    h.h.root.visible = !h.down && !(h.inv > 0 && h.inv < 1.9 && Math.floor(stage.time * 16) % 2 === 0);
  }
  // le lien
  const a = heroes[0]!, b = heroes[1]!; const dAB = Math.hypot(a.x - b.x, a.z - b.z); const lr = linkRange(); const linked = !a.down && !b.down && dAB < lr;
  link.visible = linkGlow.visible = linked;
  if (linked) {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; for (const l of [link, linkGlow]) { l.position.set(mx, 1.1, mz); l.scale.set(1, dAB, 1); l.lookAt(b.x, 1.1, b.z); l.rotateX(Math.PI / 2); }
    (link.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(stage.time * 10) * 0.25;
    const lvl = Math.max(a.up.link, b.up.link); const dps = (9 + lvl * 7) * Math.max(dmgMul(a), dmgMul(b)) / 1.15;
    for (const e of enemies) { if (!e.alive) continue; const ex = e.x - a.x, ez = e.z - a.z, bx = b.x - a.x, bz = b.z - a.z; const tt = Math.max(0, Math.min(1, (ex * bx + ez * bz) / (bx * bx + bz * bz || 1))); const px = a.x + bx * tt - e.x, pz = a.z + bz * tt - e.z; if (Math.hypot(px, pz) < 0.6 + ENEMY_DEF[e.k].r) { const k = 'link'; const last = e.hitBy.get(k) ?? -9; if (stage.time - last > 0.25) { e.hitBy.set(k, stage.time); hurt(e, dps * 0.25, a, 'link'); } } }
    if (boss?.alive) { const ex = boss.x - a.x, ez = boss.z - a.z, bx = b.x - a.x, bz = b.z - a.z; const tt = Math.max(0, Math.min(1, (ex * bx + ez * bz) / (bx * bx + bz * bz || 1))); if (Math.hypot(a.x + bx * tt - boss.x, a.z + bz * tt - boss.z) < 2.4) hurtBoss(dps * dt, a); }
  }
  // tour de cristal
  if (island.b.tour && mode === 'play') { towerCd -= dt; if (towerCd <= 0) { towerCd = 1.6 - island.b.tour * 0.2; const p = buildXZ('tour'); const e = nearestEnemy(p.x, p.z, 16); if (e) { fxLine([new THREE.Vector3(p.x, 5 + island.b.tour, p.z), new THREE.Vector3(e.x, 1, e.z)], '#e9d5ff'); hurt(e, 10 + island.b.tour * 8, null, 'tower'); } } }
  // apparitions
  if (mode === 'play' && !ended) {
    const rate = (1.1 + T / 26) * (1 + (night - 1) * 0.28) * (boss ? 0.55 : 1);
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) { spawnAcc--; const r = R(); spawn(T > 95 && r < 0.12 ? 'wisp' : T > 55 && r < 0.2 ? 'golem' : T > 25 && r < 0.45 ? 'bat' : 'slime'); }
    if (T >= BOSS_AT && !boss) spawnBoss();
  }
  // monstres : vers le héros le plus proche, avec écartement (grille)
  const grid = new Map<number, En[]>(); const key = (x: number, z: number) => (Math.floor(x / 2) + 100) * 1000 + Math.floor(z / 2) + 100;
  for (const e of enemies) if (e.alive) { const k = key(e.x, e.z); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(e); }
  for (const e of enemies) {
    if (!e.alive) continue; const def = ENEMY_DEF[e.k];
    if (e.rise > 0) { e.rise -= dt; e.y = -2 * Math.max(0, e.rise / 0.6) + def.fly; const r = Math.hypot(e.x, e.z); if (r > ARENA - 1) { e.x *= 1 - dt * 1.5; e.z *= 1 - dt * 1.5; } continue; }
    let tgt: H3 | null = null, td = 1e9; for (const h of heroes) { if (h.down) continue; const d = Math.hypot(h.x - e.x, h.z - e.z); if (d < td) { td = d; tgt = h; } }
    e.slow = Math.max(0, e.slow - dt); e.flash = Math.max(0, e.flash - dt);
    let vx = 0, vz = 0;
    if (tgt) {
      const dx = tgt.x - e.x, dz = tgt.z - e.z;
      if (e.k === 'wisp' && td < 7) { vx = -dx / td * 0.6; vz = -dz / td * 0.6; e.shoot -= dt; if (e.shoot <= 0) { e.shoot = 2.6; bolts.push({ x: e.x, z: e.z, vx: dx / td * 7, vz: dz / td * 7, dmg: 9, life: 2.2, owner: tgt, enemy: true }); } }
      else { vx = dx / td; vz = dz / td; }
      if (td < def.r + 0.55) hitHero(tgt, def.dmg * (1 + (night - 1) * 0.15));
    }
    const sp = def.speed * (e.slow > 0 ? 0.5 : 1) * (1 + (night - 1) * 0.05);
    let sx = 0, sz = 0; const gx = Math.floor(e.x / 2) + 100, gz = Math.floor(e.z / 2) + 100;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = grid.get((gx + i) * 1000 + gz + j); if (!c) continue; for (const o of c) { if (o === e) continue; const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), min = def.r + ENEMY_DEF[o.k].r; if (od < min && od > 0.001) { sx += ox / od * (min - od); sz += oz / od * (min - od); } } }
    e.x += (vx * sp) * dt + sx * 0.5; e.z += (vz * sp) * dt + sz * 0.5; e.y = def.fly + (def.fly ? Math.sin(stage.time * 4 + e.x) * 0.25 : 0);
    for (const id of Object.keys(BUILD_POS) as BuildingId[]) { const p = buildXZ(id); const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz), rr = 2.2 + def.r; if (d < rr && d > 0.01) { e.x = p.x + dx / d * rr; e.z = p.z + dz / d * rr; } }
  }
  enemies = enemies.filter(e => e.alive || false);
  // boss
  if (boss?.alive) {
    let tgt: H3 | null = null, td = 1e9; for (const h of heroes) { if (h.down) continue; const d = Math.hypot(h.x - boss.x, h.z - boss.z); if (d < td) { td = d; tgt = h; } }
    boss.flash = Math.max(0, boss.flash - dt);
    if (tgt && boss.tele <= 0) { const sp = 1.9 + night * 0.05; boss.x += (tgt.x - boss.x) / td * sp * dt; boss.z += (tgt.z - boss.z) / td * sp * dt; if (td < 2.6) hitHero(tgt, 22); }
    boss.slam -= dt; if (boss.slam <= 0 && tgt && boss.tele <= 0) { boss.tele = 1.25; boss.tx = tgt.x; boss.tz = tgt.z; boss.slam = Math.max(3.5, 6 - night * 0.3); }
    if (boss.tele > 0) { boss.tele -= dt; const k = 1 - boss.tele / 1.25; boss.ring.position.set(boss.tx, 0.08, boss.tz); boss.ring.scale.setScalar(4.2 * k + 0.2); (boss.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + k * 0.4; boss.g.position.y = Math.sin(k * Math.PI) * 3;
      if (boss.tele <= 0) { boss.x = boss.tx; boss.z = boss.tz; boss.g.position.y = 0; (boss.ring.material as THREE.MeshBasicMaterial).opacity = 0; fxRing(boss.x, boss.z, 4.5, '#ff2a55', 0.5); stage.burst(boss.x, 0.5, boss.z, '#a855f7', 60, 9); shake = 0.7; sfx.crash(); for (const h of heroes) if (Math.hypot(h.x - boss.x, h.z - boss.z) < 4.4) hitHero(h, 30); } }
    boss.summon -= dt; if (boss.summon <= 0) { boss.summon = 8; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; enemies.push({ k: 'slime', x: boss.x + Math.cos(a) * 3, z: boss.z + Math.sin(a) * 3, y: 0, hp: 8, max: 8, slow: 0, flash: 0, shoot: 0, alive: true, rise: 0.4, hitBy: new Map() }); } }
    const r = Math.hypot(boss.x, boss.z); if (r > ARENA - 2) { boss.x *= (ARENA - 2) / r; boss.z *= (ARENA - 2) / r; }
    boss.g.position.x = boss.x; boss.g.position.z = boss.z; if (tgt) boss.g.rotation.y = Math.atan2(tgt.x - boss.x, tgt.z - boss.z); boss.g.scale.y = (1.0 + night * 0.05) * (1 + Math.sin(stage.time * 3) * 0.03);
    $('bossB').style.width = `${Math.max(0, boss.hp / boss.max) * 100}%`;
  }
  // projectiles
  for (const p of bolts) {
    p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
    if (p.enemy) { for (const h of heroes) if (!h.down && Math.hypot(h.x - p.x, h.z - p.z) < 0.7) { hitHero(h, p.dmg); p.life = 0; } continue; }
    for (const e of enemies) if (e.alive && e.rise <= 0 && Math.hypot(e.x - p.x, e.z - p.z) < ENEMY_DEF[e.k].r + 0.3) { hurt(e, p.dmg, p.owner, 'bolt'); p.life = 0; stage.burst(p.x, 1, p.z, '#fff3a8', 4, 3); break; }
    if (p.life > 0 && boss?.alive && Math.hypot(boss.x - p.x, boss.z - p.z) < 2.4) { hurtBoss(p.dmg, p.owner); p.life = 0; }
  }
  bolts = bolts.filter(p => p.life > 0);
  // cristaux d'XP
  const mag = (1.8 + m.up.magnet * 1.2) * (1 + island.b.phare * 0.15);
  for (const g of gems) { if (!g.alive) continue; const d = Math.hypot(m.x - g.x, m.z - g.z); if (d < mag || g.pull) { g.pull = true; g.x += (m.x - g.x) * Math.min(1, dt * 9); g.z += (m.z - g.z) * Math.min(1, dt * 9); } if (d < 0.7 && !m.down) { g.alive = false; xp += g.v * (1 + island.b.phare * 0.06); if (xp >= need && mode === 'play') levelUp(); }
    else if (al && !al.remote && Math.hypot(al.x - g.x, al.z - g.z) < 0.7) { g.alive = false; xp += g.v * 0.6; if (xp >= need && mode === 'play') levelUp(); } }
  gems = gems.filter(g => g.alive);
  // rendu des instances
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
  const counts: Record<EnemyKind, number> = { slime: 0, bat: 0, golem: 0, wisp: 0 };
  for (const e of enemies) {
    const im = stage.enemyMesh[e.k]; const i = counts[e.k]++; if (i >= ENEMY_DEF[e.k].max) continue;
    let tgt = heroes[0]!; let td = 1e9; for (const h of heroes) { const d = Math.hypot(h.x - e.x, h.z - e.z); if (d < td) { td = d; tgt = h; } }
    E.set(0, Math.atan2(tgt.x - e.x, tgt.z - e.z), 0); Q.setFromEuler(E);
    const sq = e.k === 'slime' ? 1 + Math.sin(stage.time * 8 + e.x) * 0.1 : 1; SC.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)).multiplyScalar(e.k === 'golem' ? 1 + Math.min(0.3, night * 0.03) : 1);
    V.set(e.x, e.y, e.z); im.setMatrixAt(i, M4.compose(V, Q, SC)); im.setColorAt(i, e.flash > 0 ? C.set('#ffffff') : C.set(e.slow > 0 ? '#bfe9ff' : '#ffffff'));
    if (e.flash > 0) im.setColorAt(i, C.setRGB(3, 3, 3));
  }
  for (const k of Object.keys(counts) as EnemyKind[]) { const im = stage.enemyMesh[k]; im.count = Math.min(counts[k], ENEMY_DEF[k].max); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  stage.gemMesh.count = Math.min(600, gems.length); gems.slice(0, 600).forEach((g, i) => { E.set(0, stage.time * 2 + i, 0); Q.setFromEuler(E); V.set(g.x, 0.45 + Math.sin(stage.time * 4 + i) * 0.1, g.z); SC.setScalar(Math.min(1.6, 0.8 + g.v * 0.15)); stage.gemMesh.setMatrixAt(i, M4.compose(V, Q, SC)); }); stage.gemMesh.instanceMatrix.needsUpdate = true;
  const pb = bolts.filter(b => !b.enemy), eb = bolts.filter(b => b.enemy);
  stage.boltMesh.count = Math.min(300, pb.length); pb.slice(0, 300).forEach((p, i) => { stage.boltMesh.setMatrixAt(i, M4.makeTranslation(p.x, 1.1, p.z)); }); stage.boltMesh.instanceMatrix.needsUpdate = true;
  stage.orbMesh.count = Math.min(200, eb.length); eb.slice(0, 200).forEach((p, i) => { stage.orbMesh.setMatrixAt(i, M4.makeTranslation(p.x, 1.0, p.z)); }); stage.orbMesh.instanceMatrix.needsUpdate = true;
  let oc = 0; for (const h of heroes) { if (!h.up.orbit || h.down) continue; const n = h.up.orbit + 1, r = 2.3 * areaMul(h); for (let i = 0; i < n && oc < 24; i++) { const ang = stage.time * 3 + i * Math.PI * 2 / n; E.set(stage.time * 4, stage.time * 5, 0); Q.setFromEuler(E); V.set(h.x + Math.cos(ang) * r, 1.0, h.z + Math.sin(ang) * r); SC.setScalar(1); orbitMesh.setMatrixAt(oc++, M4.compose(V, Q, SC)); } } orbitMesh.count = oc; orbitMesh.instanceMatrix.needsUpdate = true;
  // effets
  for (let i = fxs.length - 1; i >= 0; i--) { const f = fxs[i]!; f.life -= dt0; const k = 1 - f.life / f.max; const mat = (f.o as THREE.Mesh).material as THREE.MeshBasicMaterial; if (f.kind === 'ring') { const r = f.o.userData.r as number; f.o.scale.setScalar(0.2 + k * r); } mat.opacity = Math.max(0, 1 - k) * 0.9; if (f.life <= 0) { fxGroup.remove(f.o); (f.o as THREE.Mesh).geometry.dispose(); mat.dispose(); fxs.splice(i, 1); } }
  // caméra
  const cx = m.down && al ? al.x : m.x, cz = m.down && al ? al.z : m.z; const portrait = innerHeight > innerWidth;
  const tgtPos = new THREE.Vector3(cx, portrait ? 23 : 17, cz + (portrait ? 14 : 12)); stage.camera.position.lerp(tgtPos, snap ? 1 : Math.min(1, dt0 * 5)); snap = false; stage.camera.fov = portrait ? 52 : 48; stage.camera.updateProjectionMatrix();
  if (shake > 0) { shake = Math.max(0, shake - dt0 * 1.6); stage.camera.position.x += (Math.random() - 0.5) * shake; stage.camera.position.z += (Math.random() - 0.5) * shake; }
  stage.camera.lookAt(stage.camera.position.x, 0, stage.camera.position.z - (portrait ? 14 : 12) - 1);
  // interface
  $('xpB').style.width = `${Math.min(100, (xp / need) * 100)}%`; $('lvl').textContent = `Niv ${level}`;
  $('hpB').style.width = `${(m.hp / m.max) * 100}%`; $('hpT').textContent = `${Math.ceil(m.hp)} / ${m.max}`; if (al) $('hpA').style.width = `${al.down ? 0 : (al.hp / al.max) * 100}%`;
  $('kills').textContent = `💀 ${kills}`;
  const left = Math.max(0, BOSS_AT - T); $('tmr').firstChild!.textContent = boss ? '👑' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; $('tmrS').textContent = boss ? 'BOSS' : 'BOSS';
  const ub = $('ult'); ub.style.setProperty('--p', `${charge}%`); ub.classList.toggle('ready', charge >= 100);
  // à deux : envoi de ma position ~7 fois par seconde
  if (duoRoom && mode !== 'over') { netT -= dt0; if (netT <= 0) { netT = 0.14; void net(); } }
}

async function endNight(win: boolean) {
  if (ended) return; ended = true; mode = 'over'; joy.on = false; $('joy').hidden = true;
  const cry = Math.round((win ? 25 + night * 15 + 60 : 0) + kills / (win ? 6 : 10));
  const score = kills * 10 + Math.round(T) * 5 + (win ? 3000 * night : 0);
  if (win) { sfx.win(); banner(t('NUIT SURVÉCUE !'), `${t('Nuit')} ${night}`); } else { sfx.lose(); banner(t('Les Ombres ont gagné…')); }
  duck(0.3);
  try {
    if (online()) { const v = await games.islandAct('reward', { crystals: cry, night, win, score }); island = v.island; void games.score('gardiens', score).catch(() => {}); }
    else { island.crystals += cry; if (win) island.night[me] = night + 1; S.localIsland = island; persist(); }
  } catch { island.crystals += cry; }
  if (duoRoom) void games.room('state', { done: true, score, state: netState() }).catch(() => {});
  setTimeout(() => {
    sheet(`<h2>${win ? '🌅 ' + t('NUIT SURVÉCUE !') : '🌑 ' + t('Les Ombres ont gagné…')}</h2><div class="lead">${t('Nuit')} ${night}</div>
      <div class="res"><div><b>💎 +${cry}</b><span>${t('Cristaux')}</span></div><div><b>${kills}</b><span>${t('Monstres')}</span></div><div><b>${Math.floor(T / 60)}:${String(Math.floor(T % 60)).padStart(2, '0')}</b><span>${t('Temps')}</span></div></div>
      <div class="stack" style="display:grid;gap:10px"><button class="btn" id="eBuild">🏗️ ${t('Construire')}</button><button class="btn ghost" id="eHub">${t('Village')}</button></div>`);
    on('eBuild', () => { showHub(); showBuild(); }); on('eHub', showHub);
  }, 2200);
}

// ── À DEUX ───────────────────────────────────────────────────────────────────
const netState = () => { const m = meH(); return { x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100, f: Math.round(m.face * 100) / 100, hp: Math.round(m.hp), mx: m.max, dn: m.down, c: m.cls, up: m.up, k: m.kills }; };
let lastEv = 0;
async function net() {
  try {
    const v = await games.room('state', { score: kills, state: netState() }); duoRoom = v.room ?? duoRoom; const r = duoRoom; if (!r) return;
    const os = r.players[otherOf(r.me)]?.state as ReturnType<typeof netState> | null | undefined; const al = allyH();
    if (os && al?.remote) { al.tx = os.x; al.tz = os.z; al.face = os.f; al.hp = os.hp; al.max = os.mx; al.up = { ...al.up, ...os.up }; al.kills = os.k; if (os.dn && !al.down) { al.down = true; al.hp = 0; const tb = new THREE.Group(); const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.25), new THREE.MeshStandardMaterial({ color: '#9ca3af' })); s.position.y = 0.55; tb.add(s); const halo = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 40), new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.6 })); halo.rotation.x = -Math.PI / 2; halo.name = 'halo'; tb.add(halo); tb.position.set(al.x, 0, al.z); stage.scene.add(tb); tombs.set(al, tb); } else if (!os.dn && al.down) { al.down = false; const tb = tombs.get(al); if (tb) { stage.scene.remove(tb); tombs.delete(al); } } }
    for (const e of r.events ?? []) { if (e.at <= lastEv || e.from === r.me) continue; lastEv = Math.max(lastEv, e.at); if (e.ev.type === 'revive' && meH().down) reviveHero(meH()); if (e.ev.type === 'ult') { fxRing(Number(e.ev.x), Number(e.ev.z), 10, '#ff6fa5', 0.8); for (const en of enemies) if (en.alive && Math.hypot(en.x - Number(e.ev.x), en.z - Number(e.ev.z)) < 10) hurt(en, 60, al ?? null, 'ult'); } }
    if (heroes.every(h => h.down) && !ended) void endNight(false);
  } catch { /* */ }
}
async function openDuo() {
  if (!online()) { sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${t('Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.')}</div><button class="btn ghost" id="x" style="width:100%">${t('Fermer')}</button>`); on('x', () => sheet('')); return; }
  try {
    const v0 = await games.peek(); const r = v0.room; let v = v0;
    if (r && r.game === 'gardiens' && !r.ended && r.host !== r.me && !r.players[r.me]) v = await games.room('join');
    else if (!r || r.game !== 'gardiens' || r.ended || !r.players[r.me]) v = await games.room('invite', { game: 'gardiens' });
    duoRoom = v.room; void games.room('state', { state: { c: S.cls } }).catch(() => {}); lobby();
  } catch (e) { toast(`⚠️ ${String(e).slice(0, 60)}`); }
}
function lobby() {
  const r = duoRoom; if (!r) return; const me2 = r.me, ot = otherOf(me2);
  const card = (u: Uid) => `<div class="${r.players[u]?.ready ? 'ok' : ''}"><div style="font-size:32px">${(r.players[u]?.state?.c ?? (u === 'kouider' ? 'k' : 'f')) === 'k' ? '🛡️' : '✨'}</div><b>${names[u]}</b><div style="font-size:13px;opacity:.8">${!r.players[u] ? `⏳ ${t('En attente…')}` : r.players[u]!.ready ? `✅ ${t('Prêt')}` : '👀'}</div></div>`;
  sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${lang === 'ar' ? 'ابقيا قريبين: الرابط بينكما يحرق الوحوش' : 'Restez proches : le lien entre vous brûle les monstres'}</div><div class="lob">${card(me2)}${card(ot)}</div>
    <div style="display:grid;gap:10px">${r.players[me2]?.ready ? `<button class="btn ghost" disabled>✅ ${t('En attente…')}</button>` : `<button class="btn pink" id="dReady">${t('Prêt')} !</button>`}<button class="btn ghost" id="dLeave">${t('Quitter')}</button></div>`);
  on('dReady', async () => { try { const s = Date.now(); const v = await games.room('ready'); syncClock(v, s); duoRoom = v.room; lobby(); maybeStart(); } catch { /* */ } });
  on('dLeave', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; sheet(''); });
}
function maybeStart() { const r = duoRoom; if (!r?.startAt || mode === 'play' || mode === 'pick') return; if (serverNow() > r.startAt + 5000) return; night = Math.max(island.night.kouider ?? 1, island.night.femme ?? 1); startNight(r.seed, true, r.startAt); }
let pollT = 0, pollBusy = false;
async function poll() {
  if (pollBusy || !online() || mode === 'play' || mode === 'pick') return; pollBusy = true;
  try {
    const s = Date.now(); const v = await games.peek(); syncClock(v, s); const r = v.room;
    if (duoRoom) { duoRoom = r; if (!r) sheet(''); else if ($('sheet').innerHTML.includes('class="lob"')) { lobby(); maybeStart(); } }
    else if (r && r.game === 'gardiens' && !r.ended && !r.startAt && r.host !== r.me && !r.players[r.me] && !r.otherGone && mode === 'hub') { $('invite').hidden = false; $('invTxt').textContent = `${names[r.host]} ${t('te défie aux GARDIENS !')}`; }
    else $('invite').hidden = true;
  } catch { /* */ } finally { pollBusy = false; }
}
on('bJoin', () => { $('invite').hidden = true; void openDuo(); });

// ── Boucle ───────────────────────────────────────────────────────────────────
let last = performance.now(), fpsAcc = 0, fpsN = 0, low = 0;
const ts = Number(new URLSearchParams(location.search).get('ts') ?? 1);
function loop(now: number) {
  const dt = Math.min(ts > 1 ? 0.25 : 1 / 30, (now - last) / 1000 * ts); last = now;
  step(dt); stage.render();
  if (now - pollT > (duoRoom ? 900 : 3500)) { pollT = now; void poll(); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 2) { if (fpsN / fpsAcc < 38 && stage.quality === 'high') { if (++low >= 2) stage.setQuality('low'); } else low = 0; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden && mode === 'play' && !duoRoom) { slowmo = 0; sheet(`<h2>❚❚</h2><div style="display:grid;gap:10px"><button class="btn" id="pRes">▶</button><button class="btn ghost" id="pQuit">${t('Village')}</button></div>`); on('pRes', () => { sheet(''); slowmo = 1; }); on('pQuit', showHub); } });

applyLang(); applyIsland(); showHub();
setTimeout(() => { const l = document.getElementById('loading'); if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 500); } }, 900);
requestAnimationFrame(loop);
const q = new URLSearchParams(location.search);
if (q.get('demo')) { night = 1; startNight(42, false); const ff = Number(q.get('ff') ?? 0); for (let i = 0; i < ff * 30; i++) { if ((mode as Mode) === 'pick') { (document.querySelector('[data-u]') as HTMLButtonElement | null)?.click(); } step(1 / 30); } }   // tests : ?demo=1&ff=60 avance de 60 s
