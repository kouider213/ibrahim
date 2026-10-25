import * as THREE from 'three';
import { RushWorld, LANES, WORLDS, worldAt, TRAIN_H, type PowKind, type Ob } from './world.ts';
import { makeHero, animateHero, LOOKS, type Hero, type Pose } from './hero.ts';
import { labelTexture } from './tex.ts';
import { audioUnlock, sfx, music, setTempo, setMuted, isMuted, duck } from '../games/audio.ts';
import { getDeviceToken } from '../services/api.ts';
import { bootIdentity, games, online, local, otherOf, serverNow, syncClock, vibrate, type BoardView, type Room, type Uid } from '../games/net.ts';

// RUSH — runner 3D façon Subway Surfers pour Kouider et Fatima. Solo (missions, multiplicateur, boutique, mot du jour)
// ou À DEUX en direct : même piste (même graine), on voit l'autre courir en « fantôme », le meilleur score gagne.

bootIdentity({ name: 'RUSH', short: 'RUSH', color: '#120a24', icon: '/ibrahim/icons/rush-512.png' });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();

// ── Langue (FR / arabe littéraire pour Fatima) ───────────────────────────────
const AR: Record<string, string> = {
  play: 'العب', duo: 'لعب ثنائي', missions: 'المهام', shop: 'المتجر', how: 'طريقة اللعب', join: 'انضمام', tagline: 'قويدر ✦ فاطمة',
  'Partie en pause': 'اللعبة متوقفة', Reprendre: 'استئناف', Quitter: 'خروج', Rejouer: 'العب مجددًا', Menu: 'القائمة', 'NOUVEAU RECORD !': 'رقم قياسي جديد!',
  Pièces: 'قطع نقدية', Mètres: 'أمتار', Record: 'الرقم القياسي', 'Continuer ?': 'متابعة؟', 'Non merci': 'لا شكرًا', Personnages: 'الشخصيات', Bonus: 'المكافآت', Planches: 'الألواح',
  Équiper: 'ارتداء', Équipé: 'مُرتدى', Acheter: 'شراء', 'Pas assez de pièces': 'لا توجد قطع كافية', 'Mot du jour': 'كلمة اليوم', Prêt: 'جاهز', 'En attente…': 'في الانتظار…',
  'Jouer à deux': 'اللعب معًا', Inviter: 'دعوة', Revanche: 'جولة أخرى', Gagné: 'فوز', 'Égalité !': 'تعادل!', 'Tu as gagné !': 'لقد فزت!', 'a gagné !': 'فاز!',
  'Aimant': 'مغناطيس', 'Jetpack': 'حقيبة نفاثة', 'Score ×2': 'النقاط ×2', 'Super baskets': 'أحذية القفز', 'Glisse pour sauter, esquiver et glisser !': 'اسحب للقفز والتفادي والانزلاق!',
  'Toutes les missions faites : multiplicateur +1 !': 'أنجزت كل المهام: المضاعف +1!', 'Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.': 'افتح اللعبة من التطبيق (دزاريكس أو فورم) للعب معًا.',
  'court encore…': 'ما زال يجري…', 'Fermer': 'إغلاق', 'te défie à RUSH !': 'يتحداك في RUSH!', 'Qualité graphique': 'جودة الرسوميات', 'Haute': 'عالية', 'Économie': 'اقتصادية',
};
let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const t = (s: string) => (lang === 'ar' ? AR[s] ?? s : s);
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { const k = el.dataset.t!; el.dataset.fr ??= el.textContent ?? ''; el.textContent = lang === 'ar' ? AR[k] ?? el.dataset.fr : el.dataset.fr; });
  $('bLang').textContent = lang === 'ar' ? 'FR' : 'ع';
}

// ── Sauvegarde locale ────────────────────────────────────────────────────────
interface Mission { kind: string; target: number; prog: number; done: boolean }
interface Save { coins: number; boards: number; looks: string[]; look: string; lvl: Record<string, number>; mult: number; missions: Mission[]; best: number; quality: 'high' | 'low'; word: { date: string; got: number[] }; tut: boolean; totalRuns: number }
const save: Save = { coins: 0, boards: 2, looks: ['kouider', 'fatima', 'fatima2'], look: 'kouider', lvl: { magnet: 0, jet: 0, x2: 0, sneakers: 0 }, mult: 1, missions: [], best: 0, quality: 'high', word: { date: '', got: [] }, tut: false, totalRuns: 0, ...local.json<Partial<Save>>('rush', {}) };
const persist = () => local.save('rush', save);

const MISSIONS: Array<{ kind: string; e: string; fr: (n: number) => string; ar: (n: number) => string; base: number; step: number; perRun?: boolean }> = [
  { kind: 'coins', e: '🪙', fr: n => `Ramasse ${n} pièces en une partie`, ar: n => `اجمع ${n} قطعة في جولة واحدة`, base: 120, step: 60, perRun: true },
  { kind: 'jumps', e: '🦘', fr: n => `Saute ${n} fois`, ar: n => `اقفز ${n} مرة`, base: 40, step: 25 },
  { kind: 'slides', e: '🛷', fr: n => `Glisse ${n} fois`, ar: n => `انزلق ${n} مرة`, base: 30, step: 20 },
  { kind: 'dist', e: '🏃', fr: n => `Cours ${n} m en une partie`, ar: n => `اجرِ ${n} م في جولة واحدة`, base: 800, step: 400, perRun: true },
  { kind: 'roof', e: '🚆', fr: n => `Cours ${n} m sur les toits des trains`, ar: n => `اجرِ ${n} م فوق القطارات`, base: 150, step: 100 },
  { kind: 'pows', e: '⚡', fr: n => `Attrape ${n} bonus`, ar: n => `التقط ${n} مكافأة`, base: 5, step: 3 },
  { kind: 'score', e: '🏆', fr: n => `Fais ${n.toLocaleString('fr-FR')} points en une partie`, ar: n => `احصل على ${n} نقطة في جولة واحدة`, base: 15000, step: 12000, perRun: true },
  { kind: 'jet', e: '🚀', fr: n => `Vole ${n} fois en jetpack`, ar: n => `حلّق ${n} مرات بالحقيبة النفاثة`, base: 2, step: 1 },
  { kind: 'world', e: '🌍', fr: n => `Atteins le monde n°${n}`, ar: n => `اوصل إلى العالم رقم ${n}`, base: 2, step: 1, perRun: true },
];
function newMission(exclude: string[]): Mission {
  const pool = MISSIONS.filter(m => !exclude.includes(m.kind)); const m = pool[Math.floor(Math.random() * pool.length)]!;
  const target = m.kind === 'world' ? Math.min(5, m.base + Math.floor((save.mult - 1) / 3)) : Math.round(m.base + m.step * (save.mult - 1));
  return { kind: m.kind, target, prog: 0, done: false };
}
while (save.missions.length < 3) save.missions.push(newMission(save.missions.map(m => m.kind)));
const missionText = (m: Mission) => { const d = MISSIONS.find(x => x.kind === m.kind)!; return lang === 'ar' ? d.ar(m.target) : d.fr(m.target); };

const WORDS = ['ORAN', 'YALLA', 'FATIMA', 'RUSH', 'SAHARA', 'HABIBI', 'KOUIDER', 'ATLAS', 'IBRAHIM', 'LILLE', 'TOKYO', 'BRAVO', 'DZAIR', 'AMOUR'];
const today = () => new Date().toISOString().slice(0, 10);
const dayWord = () => WORDS[Math.floor(Date.now() / 86_400_000) % WORDS.length]!;
if (save.word.date !== today()) save.word = { date: today(), got: [] };

const POW_INFO: Record<PowKind, { e: string; label: string; base: number }> = {
  magnet: { e: '🧲', label: 'Aimant', base: 9 }, jet: { e: '🚀', label: 'Jetpack', base: 6 }, x2: { e: '⭐', label: 'Score ×2', base: 12 }, sneakers: { e: '👟', label: 'Super baskets', base: 10 },
  board: { e: '🛹', label: 'Hoverboard', base: 0 }, gift: { e: '🎁', label: 'Cadeau', base: 0 },
};
const UPG_COST = [600, 1500, 3500, 7000, 14000];
const powDur = (k: PowKind) => POW_INFO[k].base + (save.lvl[k] ?? 0) * 2.5;

// ── Scène ────────────────────────────────────────────────────────────────────
const world = new RushWorld($<HTMLCanvasElement>('stage'));
world.setQuality(save.quality);
let hero: Hero = makeHero(LOOKS.find(l => l.id === save.look) ?? LOOKS[0]!);
hero.root.rotation.y = Math.PI; world.scene.add(hero.root);
let ghost: Hero | null = null; let ghostLabel: THREE.Sprite | null = null;
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
shadowBlob.rotation.x = -Math.PI / 2; world.scene.add(shadowBlob);

type Mode = 'menu' | 'count' | 'run' | 'pause' | 'dead' | 'over' | 'spectate';
let mode: Mode = 'menu';
const P = {
  s: 0, x: 0, lane: 1, prevLane: 1, y: 0, vy: 0, slide: 0, ground: true, speed: 15, coins: 0, score: 0, dist: 0,
  pow: { magnet: 0, jet: 0, x2: 0, sneakers: 0 } as Record<'magnet' | 'jet' | 'x2' | 'sneakers', number>, board: 0, invul: 0, stumble: 0, revives: 0, shake: 0,
  jumps: 0, slides: 0, roof: 0, pows: 0, jets: 0, maxWorld: 0, combo: 0, comboT: 0, lastWorld: 0, deadT: 0,
};
const speedAt = (s: number) => 15 + 17 * (1 - Math.exp(-s / 2600));
let seed = 1, duoRoom: Room | null = null, board: BoardView | null = null;

// ── Entrées : glisser (téléphone) ou flèches / ZQSD ──────────────────────────
type Act = 'left' | 'right' | 'up' | 'down' | 'board';
function act(a: Act) {
  if (mode !== 'run') return;
  if (a === 'left' || a === 'right') {
    const nl = Math.max(0, Math.min(2, P.lane + (a === 'left' ? -1 : 1)));
    if (nl !== P.lane) { P.prevLane = P.lane; P.lane = nl; sfx.lane(); }
    else { P.shake = 0.15; vibrate(15); }
  } else if (a === 'up') {
    if (P.pow.jet > 0) return;
    if (P.ground || P.y - world.groundAt(P.x, P.s) < 0.25) { P.vy = P.pow.sneakers > 0 ? 22.5 : 16.8; P.ground = false; P.slide = 0; P.jumps++; sfx.jump(); }
  } else if (a === 'down') {
    if (P.pow.jet > 0) return;
    if (!P.ground) P.vy = -32;
    if (P.slide <= 0) { P.slides++; sfx.slide(); }
    P.slide = 0.72;
  } else if (a === 'board') useBoard();
}
let touch: { x: number; y: number; t: number; used: boolean } | null = null, lastTap = 0;
addEventListener('pointerdown', e => { audioUnlock(); if ((e.target as HTMLElement).closest('button, .sheet')) return; touch = { x: e.clientX, y: e.clientY, t: performance.now(), used: false }; }, { passive: true });
addEventListener('pointermove', e => {
  if (!touch || touch.used) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) > 26) { touch.used = true; act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')); }
}, { passive: true });
addEventListener('pointerup', () => {
  if (touch && !touch.used && performance.now() - touch.t < 250) { const n = performance.now(); if (n - lastTap < 300) act('board'); lastTap = n; }
  touch = null;
});
addEventListener('keydown', e => {
  audioUnlock();
  const k = e.key.toLowerCase();
  if (k === 'arrowleft' || k === 'q' || k === 'a') act('left');
  else if (k === 'arrowright' || k === 'd') act('right');
  else if (k === 'arrowup' || k === 'z' || k === 'w' || k === ' ') act('up');
  else if (k === 'arrowdown' || k === 's') act('down');
  else if (k === 'b') act('board');
  else if (k === 'escape' || k === 'p') { if (mode === 'run') pause(); else if (mode === 'pause') resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'run' && !duoRoom) pause(); });

// ── Interface ────────────────────────────────────────────────────────────────
const fmt = (n: number) => Math.floor(n).toLocaleString(lang === 'ar' ? 'ar' : 'fr-FR');
function toast(big: string, small = '') { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `${small ? `<small>${small}</small>` : ''}${big}`; $('toasts').appendChild(d); setTimeout(() => d.remove(), 1700); }
function flash(o = 0.7) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = String(o); requestAnimationFrame(() => { f.style.transition = 'opacity .45s'; f.style.opacity = '0'; }); }
function sheet(html: string) { $('sheet').innerHTML = html ? `<div class="sheet"><div class="card">${html}</div></div>` : ''; }
const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = () => { audioUnlock(); sfx.click(); fn(); }; };

function renderMenu() {
  $('mCoins').textContent = fmt(save.coins); $('mBoards').textContent = String(save.boards);
  $('bSound').textContent = isMuted() ? '🔇' : '🔊'; $('bExit').hidden = !embedded;
  const look = LOOKS.find(l => l.id === save.look) ?? LOOKS[0]!; $('lookName').textContent = look.name;
  const owned = save.looks.includes(look.id); $('lookPrice').innerHTML = owned ? '' : `<span class="coin-ico" style="width:14px;height:14px"></span>${fmt(look.price)}`;
  $('bPlay').querySelector('span')!.textContent = owned ? (lang === 'ar' ? 'العب' : 'JOUER') : (lang === 'ar' ? 'شراء' : 'ACHETER');
  const w = dayWord(); $('word').innerHTML = [...w].map((c, i) => `<span class="${save.word.got.includes(i) ? 'got' : ''}">${c}</span>`).join('') + `<small>${t('Mot du jour')}</small>`;
  $('mDot').hidden = !save.missions.some(m => m.done);
  if (board) {
    $('duel').hidden = false;
    const r = board.board.rush ?? {}; const k = r.kouider?.best ?? 0, f = r.femme?.best ?? 0;
    $('dKn').textContent = board.names.kouider; $('dFn').textContent = board.names.femme; $('dKv').textContent = fmt(k); $('dFv').textContent = fmt(f);
    $('dKl').textContent = k > f ? '👑' : ''; $('dFl').textContent = f > k ? '👑' : '';
  }
}
function showMenu() {
  mode = 'menu'; sheet(''); $('menu').hidden = false; $('hud').hidden = true; $('bBoard').hidden = true;
  music(true, 'rush'); setTempo(100); duck(0.35);
  world.reset(1234, ''); resetPlayer();
  renderMenu(); refreshBoard();
}
async function refreshBoard() { if (!online()) return; try { board = await games.board(); renderMenu(); } catch { /* hors-ligne */ } }

on('bPrev', () => cycleLook(-1)); on('bNext', () => cycleLook(1));
function cycleLook(d: number) {
  const i = LOOKS.findIndex(l => l.id === save.look); const n = LOOKS[(i + d + LOOKS.length) % LOOKS.length]!;
  save.look = n.id; if (save.looks.includes(n.id)) persist(); setHero(n.id); renderMenu();
}
function setHero(id: string) {
  world.scene.remove(hero.root); hero = makeHero(LOOKS.find(l => l.id === id) ?? LOOKS[0]!); hero.root.rotation.y = Math.PI; world.scene.add(hero.root);
}
on('bPlay', () => {
  const look = LOOKS.find(l => l.id === save.look)!;
  if (!save.looks.includes(look.id)) {
    if (save.coins < look.price) { toast('🪙', t('Pas assez de pièces')); sfx.wrong(); return; }
    save.coins -= look.price; save.looks.push(look.id); persist(); sfx.power(); toast('✨', look.name); renderMenu(); return;
  }
  startRun(Math.floor(Math.random() * 1e9));
});
on('bSound', () => { setMuted(!isMuted()); renderMenu(); });
on('bLang', () => { lang = lang === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('jeux:lang', lang); } catch { /* */ } applyLang(); renderMenu(); });
on('bExit', () => window.parent.postMessage({ type: 'jeux:exit' }, '*'));
on('bMissions', showMissions); on('bShop', () => showShop('looks')); on('bHelp', showHelp); on('bDuo', openDuo);
on('bPause', pause); on('bBoard', () => act('board'));

function showMissions() {
  const done = save.missions.every(m => m.done);
  sheet(`<h2>🎯 ${t('Missions')}</h2><div class="lead">${lang === 'ar' ? 'أنجز المهام الثلاث لرفع المضاعف' : 'Termine les 3 missions pour augmenter ton multiplicateur'} — <b style="color:#ff7aa2">×${save.mult}</b></div>
    ${save.missions.map(m => { const d = MISSIONS.find(x => x.kind === m.kind)!; return `<div class="mission ${m.done ? 'done' : ''}"><div class="e">${m.done ? '✅' : d.e}</div><div class="t">${missionText(m)}<div class="bar"><b style="width:${Math.min(100, (m.prog / m.target) * 100)}%"></b></div></div><div style="font-weight:900;font-size:13px">${fmt(Math.min(m.prog, m.target))}/${fmt(m.target)}</div></div>`; }).join('')}
    ${done ? `<button class="btn" id="mClaim" style="width:100%;margin-top:6px">×${save.mult + 1} 🎉</button>` : ''}
    <button class="btn ghost" id="mClose" style="width:100%;margin-top:10px">${t('Fermer')}</button>`);
  on('mClose', () => { sheet(''); renderMenu(); });
  on('mClaim', claimMissions);
}
function claimMissions() {
  const reward = 300 * save.mult; save.mult = Math.min(30, save.mult + 1); save.coins += reward;
  save.missions = []; while (save.missions.length < 3) save.missions.push(newMission(save.missions.map(m => m.kind)));
  persist(); sfx.win(); confetti(); toast(`×${save.mult}`, t('Toutes les missions faites : multiplicateur +1 !')); showMissions();
}
function showShop(tab: 'looks' | 'pows' | 'boards') {
  const tabs = `<div class="shop-tabs"><button id="tLooks" class="${tab === 'looks' ? 'on' : ''}">👕 ${t('Personnages')}</button><button id="tPows" class="${tab === 'pows' ? 'on' : ''}">⚡ ${t('Bonus')}</button><button id="tBoards" class="${tab === 'boards' ? 'on' : ''}">🛹 ${t('Planches')}</button></div>`;
  let body = '';
  if (tab === 'looks') body = LOOKS.map(l => { const own = save.looks.includes(l.id), eq = save.look === l.id; return `<div class="shop-item"><div class="sw" style="background:linear-gradient(135deg,${l.top},${l.top2})">${l.style === 'fennec' ? '🦊' : l.style === 'helmet' ? '🤖' : l.style === 'scarf' ? '🧕' : l.style === 'ponytail' || l.style === 'buns' ? '👩' : '🧢'}</div><div class="t"><b>${l.name}</b><span>${own ? '✓' : `🪙 ${fmt(l.price)}`}</span></div><button class="btn small ${eq ? 'ghost' : own ? 'alt' : ''}" data-look="${l.id}">${eq ? t('Équipé') : own ? t('Équiper') : t('Acheter')}</button></div>`; }).join('');
  if (tab === 'pows') body = (['magnet', 'jet', 'x2', 'sneakers'] as PowKind[]).map(k => { const lv = save.lvl[k] ?? 0, max = lv >= 5; return `<div class="shop-item"><div class="sw" style="background:rgba(255,255,255,.1)">${POW_INFO[k].e}</div><div class="t"><b>${t(POW_INFO[k].label)}</b><span>${powDur(k).toFixed(1)} s</span><div class="lv">${[0, 1, 2, 3, 4].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>${max ? '<b>MAX</b>' : `<button class="btn small" data-up="${k}">🪙 ${fmt(UPG_COST[lv]!)}</button>`}</div>`; }).join('');
  if (tab === 'boards') body = [[1, 300], [5, 1300], [12, 2800]].map(([n, c]) => `<div class="shop-item"><div class="sw" style="background:linear-gradient(135deg,#22d3ee,#0891b2)">🛹</div><div class="t"><b>${n} hoverboard${n! > 1 ? 's' : ''}</b><span>${lang === 'ar' ? 'يحميك من اصطدام واحد — انقر مرتين' : 'Te protège d\'un choc — double tape pour l\'activer'}</span></div><button class="btn small" data-board="${n}" data-cost="${c}">🪙 ${fmt(c!)}</button></div>`).join('');
  sheet(`<h2>🛍️ ${t('Boutique')}</h2><div class="lead"><span class="coin-ico" style="width:16px;height:16px;vertical-align:-3px"></span> ${fmt(save.coins)} · 🛹 ${save.boards}</div>${tabs}${body}<button class="btn ghost" id="sClose" style="width:100%;margin-top:6px">${t('Fermer')}</button>`);
  on('tLooks', () => showShop('looks')); on('tPows', () => showShop('pows')); on('tBoards', () => showShop('boards')); on('sClose', () => { sheet(''); renderMenu(); });
  document.querySelectorAll<HTMLButtonElement>('[data-look]').forEach(b => b.onclick = () => {
    const l = LOOKS.find(x => x.id === b.dataset.look)!;
    if (!save.looks.includes(l.id)) { if (save.coins < l.price) { sfx.wrong(); toast('🪙', t('Pas assez de pièces')); return; } save.coins -= l.price; save.looks.push(l.id); sfx.power(); }
    save.look = l.id; persist(); setHero(l.id); sfx.click(); showShop('looks');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-up]').forEach(b => b.onclick = () => {
    const k = b.dataset.up!, lv = save.lvl[k] ?? 0, c = UPG_COST[lv]!;
    if (save.coins < c) { sfx.wrong(); toast('🪙', t('Pas assez de pièces')); return; }
    save.coins -= c; save.lvl[k] = lv + 1; persist(); sfx.power(); showShop('pows');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-board]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.board), c = Number(b.dataset.cost);
    if (save.coins < c) { sfx.wrong(); toast('🪙', t('Pas assez de pièces')); return; }
    save.coins -= c; save.boards += n; persist(); sfx.power(); showShop('boards');
  });
}
function showHelp() {
  const rows = lang === 'ar'
    ? [['⬅️➡️', 'اسحب يمينًا/يسارًا لتغيير المسار'], ['⬆️', 'اسحب للأعلى للقفز فوق الحواجز'], ['⬇️', 'اسحب للأسفل للانزلاق تحت البوابات'], ['🚆', 'اصعد على القطارات عبر المنحدرات الصفراء'], ['🛹', 'انقر مرتين: لوح يحميك من اصطدام'], ['🔤', 'اجمع حروف كلمة اليوم لتربح جائزة']]
    : [['⬅️➡️', 'Glisse à gauche / droite pour changer de voie'], ['⬆️', 'Glisse vers le haut pour sauter les barrières'], ['⬇️', 'Glisse vers le bas pour passer sous les portiques'], ['🚆', 'Monte sur les trains par les rampes jaunes'], ['🛹', 'Double tape : hoverboard, il encaisse un choc'], ['🔤', 'Ramasse les lettres du mot du jour = gros cadeau']];
  sheet(`<h2>❔ ${t('how')}</h2>${rows.map(([e, s]) => `<div class="mission"><div class="e">${e}</div><div class="t">${s}</div></div>`).join('')}
    <div class="lead" style="margin-top:8px">${t('Qualité graphique')}</div><div class="shop-tabs"><button id="qH" class="${save.quality === 'high' ? 'on' : ''}">✨ ${t('Haute')}</button><button id="qL" class="${save.quality === 'low' ? 'on' : ''}">🔋 ${t('Économie')}</button></div>
    <button class="btn ghost" id="hClose" style="width:100%">${t('Fermer')}</button>`);
  on('hClose', () => sheet('')); on('qH', () => { save.quality = 'high'; world.setQuality('high'); persist(); showHelp(); }); on('qL', () => { save.quality = 'low'; world.setQuality('low'); persist(); showHelp(); });
}
function renderHud() {
  $('hScore').textContent = fmt(P.score); $('hCoins').textContent = fmt(P.coins);
  const m = $('hMult'); const x2 = P.pow.x2 > 0; m.textContent = `×${save.mult * (x2 ? 2 : 1)}`; m.className = `mult${x2 ? ' x2' : ''}`;
  $('hPows').innerHTML = (Object.keys(P.pow) as Array<keyof typeof P.pow>).filter(k => P.pow[k] > 0).map(k => `<div class="pow glass"><i>${POW_INFO[k].e}</i><div class="bar"><b style="width:${(P.pow[k] / powDur(k)) * 100}%"></b></div></div>`).join('')
    + (P.board > 0 ? `<div class="pow glass"><i>🛹</i><div class="bar"><b style="width:${(P.board / 30) * 100}%;background:#22d3ee"></b></div></div>` : '');
  $('hBoards').textContent = String(save.boards); $('bBoard').hidden = save.boards <= 0 || P.board > 0 || mode !== 'run';
}

// ── Partie ───────────────────────────────────────────────────────────────────
function resetPlayer() {
  Object.assign(P, { s: 0, x: 0, lane: 1, prevLane: 1, y: 0, vy: 0, slide: 0, ground: true, speed: 15, coins: 0, score: 0, dist: 0, board: 0, invul: 0, stumble: 0, revives: 0, shake: 0, jumps: 0, slides: 0, roof: 0, pows: 0, jets: 0, maxWorld: 0, combo: 0, comboT: 0, lastWorld: 0, deadT: 0 });
  P.pow = { magnet: 0, jet: 0, x2: 0, sneakers: 0 };
  hero.jet.visible = false; hero.board.visible = false;
}
function startRun(sd: number, duo = false) {
  seed = sd; sheet(''); $('menu').hidden = true; $('hud').hidden = false; $('hDuo').hidden = !duo;
  const w = dayWord(); world.wordGot = new Set(save.word.got);
  world.reset(seed, duo ? '' : w); resetPlayer();
  mode = 'count'; duck(0.5); countdown(duo && duoRoom?.startAt ? duoRoom.startAt : serverNow() + 2400);
  if (!save.tut) { setTimeout(() => { const h = document.createElement('div'); h.className = 'hint'; h.textContent = t('Glisse pour sauter, esquiver et glisser !'); document.body.appendChild(h); setTimeout(() => h.remove(), 4200); }, 2600); save.tut = true; persist(); }
}
function countdown(at: number) {
  const el = document.createElement('div'); el.className = 'count'; document.body.appendChild(el);
  let last = -1;
  const tick = () => {
    const left = at - serverNow();
    if (left <= 0) { el.textContent = 'GO!'; el.className = 'count go'; sfx.go(); setTimeout(() => el.remove(), 500); mode = 'run'; duck(0.5); music(true, 'rush'); return; }
    const n = Math.ceil(left / 1000); if (n !== last && n <= 3) { last = n; el.textContent = String(n); sfx.tick(); el.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300 }); }
    requestAnimationFrame(tick);
  };
  tick();
}
function pause() { if (mode !== 'run') return; if (duoRoom) return; mode = 'pause'; sheet(`<h2>❚❚ ${t('Partie en pause')}</h2><div class="stack" style="margin-top:12px"><button class="btn" id="pRes">▶ ${t('Reprendre')}</button><button class="btn ghost" id="pQuit">${t('Quitter')}</button></div>`); on('pRes', resume); on('pQuit', () => endRun(true)); }
function resume() { sheet(''); mode = 'count'; countdown(serverNow() + 2400); }
function useBoard() { if (P.board > 0 || save.boards <= 0) return; save.boards--; persist(); P.board = 30; hero.board.visible = true; sfx.shield(); toast('🛹', 'HOVERBOARD'); vibrate(30); }

function hit(o: Ob | null, frontal: boolean) {
  if (P.invul > 0) return;
  if (P.board > 0) {
    P.board = 0; hero.board.visible = false; P.invul = 1.6; sfx.shield(); flash(0.5); vibrate([40, 30, 40]);
    if (o) { o.hit = true; o.mesh.visible = false; world.burst(LANES[o.lane]!, 1.2, P.s + 1, '#67e8f9', 26, 8); }
    return;
  }
  if (!frontal) {
    // choc de côté : on rebondit sur sa voie ; deux fois de suite = rattrapé
    if (P.stumble > 0) { die(); return; }
    P.stumble = 3.5; P.lane = P.prevLane; P.shake = 0.4; sfx.land(); vibrate(60); $('vig').classList.add('on'); setTimeout(() => $('vig').classList.remove('on'), 500);
    return;
  }
  die();
}
function die() {
  mode = 'dead'; P.deadT = 0; sfx.crash(); flash(0.9); vibrate([80, 40, 120]); P.shake = 0.8; duck(0.15);
  world.burst(P.x, 1.2, P.s, '#ffffff', 30, 7);
  setTimeout(() => { if (mode === 'dead') offerRevive(); }, 900);
}
function offerRevive() {
  const cost = 500 * Math.pow(2, P.revives);
  if (duoRoom || save.coins + P.coins < cost) { endRun(); return; }
  let left = 5;
  sheet(`<h2>${t('Continuer ?')}</h2><div class="revive-ring" id="rRing"><span id="rNum">5</span></div><div class="stack"><button class="btn" id="rYes"><span class="coin-ico"></span> ${fmt(cost)}</button><button class="btn ghost" id="rNo">${t('Non merci')}</button></div>`);
  const timer = setInterval(() => { left -= 0.1; const r = document.getElementById('rRing'); if (r) { r.style.setProperty('--p', `${(left / 5) * 100}%`); $('rNum').textContent = String(Math.ceil(left)); } if (left <= 0) { clearInterval(timer); endRun(); } }, 100);
  on('rYes', () => {
    clearInterval(timer);
    let c = cost; const fromRun = Math.min(P.coins, c); P.coins -= fromRun; c -= fromRun; save.coins -= c; persist();
    P.revives++; world.clearAhead(P.s, 40); P.invul = 2.5; P.y = Math.max(P.y, world.groundAt(P.x, P.s)); P.vy = 0; P.stumble = 0; sheet(''); sfx.power();
    mode = 'count'; countdown(serverNow() + 1500);
  });
  on('rNo', () => { clearInterval(timer); endRun(); });
}
function missionProgress() {
  const val: Record<string, number> = { coins: P.coins, jumps: P.jumps, slides: P.slides, dist: P.s, roof: P.roof, pows: P.pows, score: P.score, jet: P.jets, world: P.maxWorld + 1 };
  let newly = 0;
  for (const m of save.missions) {
    if (m.done) continue;
    const d = MISSIONS.find(x => x.kind === m.kind)!;
    m.prog = d.perRun ? Math.max(m.prog, val[m.kind] ?? 0) : m.prog + (val[m.kind] ?? 0);
    if (m.prog >= m.target) { m.done = true; newly++; }
  }
  return newly;
}
async function endRun(quit = false) {
  mode = 'over'; music(true, 'rush'); setTempo(96); duck(0.3);
  save.coins += P.coins; save.totalRuns++;
  const newly = quit ? 0 : missionProgress();
  const rec = P.score > save.best; if (rec) save.best = Math.floor(P.score);
  persist();
  let srv: { record: boolean; beat: boolean } | null = null;
  if (online() && P.score > 0) try { srv = await games.score('rush', Math.floor(P.score)); } catch { /* */ }
  if (duoRoom) { void games.room('state', { score: Math.floor(P.score), done: true, state: stateOut(false) }).catch(() => {}); spectate(); return; }
  if (rec || srv?.record) { sfx.win(); confetti(); } else sfx.lose();
  const other = board ? board.board.rush?.[otherOf(board.me)]?.best ?? 0 : 0;
  sheet(`${rec ? `<div class="record">★ ${t('NOUVEAU RECORD !')} ★</div>` : ''}<div class="big-score">${fmt(P.score)}</div>
    ${srv?.beat ? `<div class="winner">👑 ${lang === 'ar' ? 'تفوقت على' : 'Tu passes devant'} ${board?.names[otherOf(board.me)] ?? ''} !</div>` : board && other > P.score ? `<div class="lead">${board.names[otherOf(board.me)]} : ${fmt(other)} — ${lang === 'ar' ? 'باقي' : 'encore'} ${fmt(other - P.score)} !</div>` : ''}
    <div class="stats"><div class="stat"><b>${fmt(P.coins)}</b><span>${t('Pièces')}</span></div><div class="stat"><b>${fmt(P.s)}</b><span>${t('Mètres')}</span></div><div class="stat"><b>${fmt(save.best)}</b><span>${t('Record')}</span></div></div>
    ${newly ? `<div class="mission done"><div class="e">🎯</div><div class="t">${newly} mission${newly > 1 ? 's' : ''} ✓</div></div>` : ''}
    <div class="stack"><button class="btn" id="oAgain">↻ ${t('Rejouer')}</button><button class="btn ghost" id="oMenu">${t('Menu')}</button></div>`);
  on('oAgain', () => startRun(Math.floor(Math.random() * 1e9))); on('oMenu', showMenu);
  void refreshBoard();
}

// ── À DEUX ───────────────────────────────────────────────────────────────────
let pollT = 0, pollBusy = false, lastSend = 0;
const ghostState = { s: 0, x: 0, y: 0, sl: false, al: true, sc: 0, look: 'fatima', tS: 0, have: false };
function stateOut(alive = mode === 'run' || mode === 'count') { return { s: Math.round(P.s * 10) / 10, x: Math.round(P.x * 100) / 100, y: Math.round(P.y * 100) / 100, sl: P.slide > 0, al: alive, sc: Math.floor(P.score), look: save.look }; }
async function openDuo() {
  if (!online()) { sheet(`<h2>👫 ${t('Jouer à deux')}</h2><div class="lead">${t('Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.')}</div><button class="btn ghost" id="x" style="width:100%">${t('Fermer')}</button>`); on('x', () => sheet('')); return; }
  try {
    const v0 = await games.peek(); let v = v0;
    const r = v0.room;
    if (r && r.game === 'rush' && !r.ended && r.host !== r.me && !r.players[r.me]) v = await games.room('join');
    else if (!r || r.game !== 'rush' || r.ended || !r.players[r.me]) v = await games.room('invite', { game: 'rush' });
    duoRoom = v.room; renderLobby();
  } catch (e) { toast('⚠️', String(e).slice(0, 60)); }
}
function renderLobby() {
  const r = duoRoom; if (!r || mode !== 'menu' && mode !== 'over') return;
  const me = r.me, ot = otherOf(me), names = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  const pl = (u: Uid) => r.players[u];
  const card = (u: Uid) => `<div class="${pl(u)?.ready ? 'ok' : ''}"><div class="av" style="background:${u === 'kouider' ? 'linear-gradient(135deg,#ff7aa2,#e8333a)' : 'linear-gradient(135deg,#c4b5fd,#7c3aed)'}">${names[u].slice(0, 1)}</div><b>${names[u]}</b><div class="st">${!pl(u) ? `⏳ ${t('En attente…')}` : pl(u)!.ready ? `✅ ${t('Prêt')}` : '👀'}</div></div>`;
  sheet(`<h2>👫 ${t('Jouer à deux')}</h2><div class="lead">${lang === 'ar' ? 'نفس المسار في نفس الوقت — ترى الآخر يجري بجانبك' : 'Même piste en même temps — tu vois l\'autre courir à côté de toi'}</div>
    <div class="lobby-p">${card(me)}${card(ot)}</div>
    <div class="stack">${pl(me)?.ready ? `<button class="btn ghost" disabled>✅ ${t('En attente…')}</button>` : `<button class="btn pink" id="lReady">${t('Prêt')} !</button>`}<button class="btn ghost" id="lLeave">${t('Quitter')}</button></div>`);
  on('lReady', async () => { try { const s = Date.now(); const v = await games.room('ready'); syncClock(v, s); duoRoom = v.room; renderLobby(); checkStart(); } catch { /* */ } });
  on('lLeave', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; sheet(''); if (mode === 'over') showMenu(); });
}
function checkStart() {
  const r = duoRoom; if (!r?.startAt || mode === 'run' || mode === 'count' || mode === 'dead' || mode === 'spectate') return;
  if (serverNow() > r.startAt + 2000) return;
  ghostState.have = false; startRun(r.seed, true);
  const look = LOOKS.find(l => l.id === (r.players[otherOf(r.me)]?.state?.look as string)) ?? LOOKS[r.me === 'kouider' ? 1 : 0]!;
  makeGhost(look.id, board?.names[otherOf(r.me)] ?? '', r.me === 'kouider' ? '#c084fc' : '#ff6b8b');
}
function makeGhost(lookId: string, name: string, color: string) {
  if (ghost) world.scene.remove(ghost.root); if (ghostLabel) world.scene.remove(ghostLabel);
  ghost = makeHero(LOOKS.find(l => l.id === lookId) ?? LOOKS[0]!, color); ghost.root.rotation.y = Math.PI; world.scene.add(ghost.root);
  ghostLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name || '♥', color), depthWrite: false, depthTest: false })); ghostLabel.scale.set(2.2, 0.55, 1); ghostLabel.renderOrder = 5; world.scene.add(ghostLabel);
}
function spectate() {
  mode = 'spectate';
  const r = duoRoom; if (!r) return;
  const names = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  sheet(`<h2>💥 ${fmt(P.score)}</h2><div class="lead" id="spec">${names[otherOf(r.me)]} ${t('court encore…')}</div><div class="big-score" id="specSc">${fmt(ghostState.sc)}</div>`);
}
function duoResults() {
  const r = duoRoom; if (!r) return;
  const me = r.me, ot = otherOf(me), names = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  const a = r.players[me]?.score ?? Math.floor(P.score), b = r.players[ot]?.score ?? 0;
  const win = a > b ? me : b > a ? ot : null;
  if (win === me) { sfx.win(); confetti(); } else sfx.lose();
  sheet(`<div class="winner">${win === null ? t('Égalité !') : win === me ? `🏆 ${t('Tu as gagné !')}` : `${names[ot]} ${t('a gagné !')}`}</div>
    <div class="vs-table"><div class="${win === me ? 'win' : ''}">${names[me]}<b>${fmt(a)}</b></div><div class="${win === ot ? 'win' : ''}">${names[ot]}<b>${fmt(b)}</b></div></div>
    <div class="stack"><button class="btn pink" id="dAgain">↻ ${t('Revanche')}</button><button class="btn ghost" id="dMenu">${t('Menu')}</button></div>`);
  on('dAgain', async () => { try { const v = await games.room('rematch'); duoRoom = v.room; mode = 'over'; renderLobby(); } catch { /* */ } });
  on('dMenu', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; if (ghost) { world.scene.remove(ghost.root); ghost = null; } if (ghostLabel) { world.scene.remove(ghostLabel); ghostLabel = null; } showMenu(); });
  mode = 'over';
}
async function poll() {
  if (pollBusy || !online()) return; pollBusy = true;
  try {
    const sent = Date.now();
    if (duoRoom && (mode === 'run' || mode === 'count' || mode === 'dead')) {
      const v = await games.room('state', { score: Math.floor(P.score), state: stateOut() }); syncClock(v, sent); duoRoom = v.room ?? duoRoom;
    } else {
      const v = await games.peek(); syncClock(v, sent);
      const r = v.room;
      if (duoRoom) {
        duoRoom = r;
        if (!r) { if (mode === 'over' || mode === 'spectate') { sheet(''); showMenu(); } }
        else if (mode === 'spectate' && r.ended) duoResults();
        else if (mode === 'over' && r.startAt) checkStart();
        else if ((mode === 'menu' || mode === 'over') && $('sheet').innerHTML.includes('lobby-p')) renderLobby();
      } else if (r && r.game === 'rush' && !r.ended && !r.startAt && r.host !== r.me && !r.players[r.me] && mode === 'menu' && !r.otherGone) {
        $('invite').hidden = false; $('inviteTxt').textContent = `${board?.names[r.host] ?? ''} ${t('te défie à RUSH !')}`;
      } else $('invite').hidden = true;
    }
    if (duoRoom?.startAt && (mode === 'menu' || mode === 'over') && serverNow() < duoRoom.startAt) checkStart();
    const os = duoRoom?.players[otherOf(duoRoom.me)]?.state as typeof ghostState | null | undefined;
    if (os) { ghostState.tS = os.s; ghostState.x = os.x; ghostState.y = os.y; ghostState.sl = os.sl; ghostState.al = os.al; ghostState.sc = os.sc; if (!ghostState.have) { ghostState.s = os.s; ghostState.have = true; } }
  } catch { /* réseau */ } finally { pollBusy = false; }
}
on('bJoin', () => { $('invite').hidden = true; void openDuo(); });

// ── Confettis ────────────────────────────────────────────────────────────────
function confetti() {
  const c = $<HTMLCanvasElement>('confetti'), g = c.getContext('2d')!; c.width = innerWidth; c.height = innerHeight;
  const ps = Array.from({ length: 160 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * Math.PI, c: `hsl(${Math.random() * 360},95%,60%)`, s: 5 + Math.random() * 7 }));
  let n = 0; const step = () => { g.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); } if (++n < 170) requestAnimationFrame(step); else g.clearRect(0, 0, c.width, c.height); };
  step();
}

// ── Boucle ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock(); let fpsAcc = 0, fpsN = 0, lowFor = 0;
const camPos = new THREE.Vector3(0, 3.4, 7), camLook = new THREE.Vector3();
function step(dt: number) {
  const T = clock.elapsedTime;
  if (mode === 'run') {
    P.speed = speedAt(P.s);
    const v = P.speed * (P.pow.jet > 0 ? 1.15 : 1);
    const prevS = P.s; P.s += v * dt;
    setTempo(108 + (P.speed - 15) * 2.4);
    // voie
    const tx = LANES[P.lane]!; P.x += (tx - P.x) * Math.min(1, dt * 15);
    // bonus
    for (const k of Object.keys(P.pow) as Array<keyof typeof P.pow>) if (P.pow[k] > 0) { P.pow[k] -= dt; if (P.pow[k] <= 0) { P.pow[k] = 0; if (k === 'jet') { hero.jet.visible = false; P.invul = Math.max(P.invul, 1.2); } } }
    if (P.board > 0) { P.board -= dt; if (P.board <= 0) hero.board.visible = false; }
    P.invul = Math.max(0, P.invul - dt); P.stumble = Math.max(0, P.stumble - dt); P.slide = Math.max(0, P.slide - dt);
    // vertical
    const ground = world.groundAt(P.x, P.s);
    if (P.pow.jet > 0) { P.y += (7 - P.y) * Math.min(1, dt * 3); P.vy = 0; P.ground = false; }
    else {
      P.vy -= 56 * dt; P.y += P.vy * dt;
      if (P.y <= ground) { if (!P.ground && P.vy < -14) { sfx.land(); world.burst(P.x, ground + 0.1, P.s, '#ffffff', 6, 2); } P.y = ground; P.vy = 0; P.ground = true; }
      else if (P.y - ground > 0.05) P.ground = false;
    }
    if (P.ground && ground >= TRAIN_H - 0.01) P.roof += v * dt;
    // collisions
    if (P.pow.jet <= 0) {
      const h = P.slide > 0 ? 0.8 : 1.75;
      for (const o of world.obs) {
        if (o.hit || Math.abs(LANES[o.lane]! - P.x) > 1.05) continue;
        if (P.s + 0.35 < o.s0 || P.s - 0.35 > o.s1) continue;
        let bad = false, frontal = true;
        if (o.kind === 'hurdle') bad = P.y < 1.0;
        else if (o.kind === 'gate') bad = P.y + h > 1.4 && P.y < 2.3;
        else if (o.kind === 'block') bad = P.y < 1.95;
        else if (o.kind === 'train' || o.kind === 'mtrain') { bad = P.y < o.top - 0.4; frontal = prevS + 0.35 <= o.s0 + 0.6 || o.kind === 'mtrain' && P.s < o.s0 + 1.5; }
        if (bad) { hit(o, frontal); break; }
      }
    }
    // pièces, bonus, lettres
    const mg = P.pow.magnet > 0;
    for (const c of world.coins) {
      if (c.taken) continue;
      const ds = c.s - P.s;
      if (mg && ds < 16 && ds > -1 && Math.abs(c.y - P.y) < 5) { c.taken = true; c.fly = 0.01; gotCoin(); continue; }
      if (Math.abs(ds) < 1.1 && Math.abs(c.x - P.x) < 1.0 && Math.abs(c.y - (P.y + 0.9)) < 1.25) { c.taken = true; c.fly = 0.01; gotCoin(); }
    }
    for (const p of world.pows) if (!p.taken && Math.abs(p.s - P.s) < 1.3 && Math.abs(p.x - P.x) < 1.1 && Math.abs(p.y - (P.y + 0.9)) < 1.6) { p.taken = true; gotPow(p.kind); }
    for (const l of world.letters) if (!l.taken && Math.abs(l.s - P.s) < 1.3 && Math.abs(l.x - P.x) < 1.1 && Math.abs(l.y - (P.y + 0.9)) < 1.6) { l.taken = true; gotLetter(l.ch); }
    // score
    const x2 = P.pow.x2 > 0 ? 2 : 1;
    P.score += v * dt * save.mult * x2 * 1.0;
    P.comboT -= dt; if (P.comboT <= 0) P.combo = 0;
    // nouveau monde
    const wi = Math.floor(P.s / 1100);
    if (wi !== P.lastWorld) { P.lastWorld = wi; P.maxWorld = Math.max(P.maxWorld, wi); const W = WORLDS[worldAt(P.s)]!; toast(lang === 'ar' ? W.nameAr : W.name, `${lang === 'ar' ? 'العالم' : 'MONDE'} ${wi + 1}`); sfx.power(); }
    // à deux : envoi de ma position
    if (duoRoom && performance.now() - lastSend > 220) { lastSend = performance.now(); void poll(); }
    renderHud();
    if (duoRoom) renderDuoBar();
  } else if (mode === 'dead') {
    P.deadT += dt; P.vy -= 30 * dt; P.y = Math.max(world.groundAt(P.x, P.s), P.y + P.vy * dt);
  } else if (mode === 'spectate' && duoRoom) {
    const el = document.getElementById('specSc'); if (el) el.textContent = fmt(ghostState.sc);
    if (performance.now() - pollT > 600) { pollT = performance.now(); void poll(); }
  } else if (performance.now() - pollT > (duoRoom ? 800 : 3000)) { pollT = performance.now(); void poll(); }

  // héros
  const pose: Pose = mode === 'menu' ? 'idle' : mode === 'dead' || mode === 'spectate' || (mode === 'over' && P.s > 0) ? 'fall' : P.pow.jet > 0 ? 'fly' : P.slide > 0 ? 'slide' : !P.ground ? 'jump' : P.board > 0 ? 'board' : mode === 'count' && P.s === 0 ? 'idle' : 'run';
  animateHero(hero, pose, dt, mode === 'run' ? P.speed : 0, T, { vy: P.vy, tilt: (LANES[P.lane]! - P.x) * -0.12, springs: P.pow.sneakers > 0 });
  hero.jet.visible = P.pow.jet > 0;
  hero.root.position.set(P.x, P.y, -P.s);
  hero.root.visible = !(P.invul > 0 && Math.floor(T * 14) % 2 === 0 && mode === 'run');
  shadowBlob.position.set(P.x, world.groundAt(P.x, P.s) + 0.02, -P.s); shadowBlob.scale.setScalar(Math.max(0.4, 1 - (P.y - world.groundAt(P.x, P.s)) * 0.12));
  // fantôme (à deux)
  if (ghost && duoRoom && ghostState.have) {
    const gv = speedAt(ghostState.s) * (ghostState.al ? 1 : 0);
    ghostState.s += gv * dt; ghostState.s += (ghostState.tS - ghostState.s) * Math.min(1, dt * 4);
    ghost.root.position.set(ghost.root.position.x + (ghostState.x - ghost.root.position.x) * Math.min(1, dt * 12), ghostState.y, -ghostState.s);
    animateHero(ghost, !ghostState.al ? 'fall' : ghostState.sl ? 'slide' : ghostState.y > 0.3 && ghostState.y < TRAIN_H - 0.1 ? 'jump' : 'run', dt, gv, T);
    ghostLabel!.position.set(ghost.root.position.x, ghostState.y + 2.6, -ghostState.s);
  }
  // caméra
  if (mode === 'menu') {
    const a = Math.sin(T * 0.25) * 0.5;
    camPos.lerp(new THREE.Vector3(Math.sin(a) * 4.2, 1.9, -P.s - Math.cos(a) * 4.2), Math.min(1, dt * 2)); camLook.set(0, 1.2, -P.s);
    world.camera.fov += (55 - world.camera.fov) * dt * 2;
  } else {
    const fast = P.pow.jet > 0 ? 1 : Math.max(0, (P.speed - 22) / 10);
    const target = new THREE.Vector3(P.x * 0.75, P.y * (P.pow.jet > 0 ? 0.85 : 0.55) + 3.35, -P.s + 6.9);
    camPos.lerp(target, Math.min(1, dt * (mode === 'count' ? 3 : 9)));
    camLook.set(P.x * 0.9, P.y * 0.6 + 1.25, -P.s - 9);
    world.camera.fov += (62 + fast * 12 - world.camera.fov) * Math.min(1, dt * 3);
  }
  world.camera.updateProjectionMatrix();
  world.camera.position.copy(camPos);
  if (P.shake > 0) { P.shake -= dt; world.camera.position.x += (Math.random() - 0.5) * P.shake; world.camera.position.y += (Math.random() - 0.5) * P.shake; }
  world.camera.lookAt(camLook);
  world.update(dt, P.s, P.x, P.y, mode === 'run' ? (P.pow.jet > 0 ? 1 : Math.max(0, (P.speed - 20) / 12)) : 0);
}
function gotCoin() {
  P.coins++; P.combo++; P.comboT = 0.5; sfx.coin(P.combo % 12);
  if (P.combo > 0 && P.combo % 25 === 0) toast(`COMBO ×${P.combo}`);
}
function gotPow(k: PowKind) {
  P.pows++; sfx.power(); vibrate(25); world.burst(P.x, P.y + 1, P.s, '#fff3b0', 18, 6);
  if (k === 'board') { save.boards++; persist(); toast('🛹 +1', 'HOVERBOARD'); return; }
  if (k === 'gift') { const n = [50, 100, 150, 250, 500][Math.floor(Math.random() * 5)]!; P.coins += n; toast(`🎁 +${n}`); return; }
  P.pow[k] = powDur(k); toast(POW_INFO[k].e, t(POW_INFO[k].label));
  if (k === 'jet') { P.jets++; sfx.jet(); world.skyCoins(P.s + 10, powDur('jet') * speedAt(P.s) * 1.1); hero.jet.visible = true; P.slide = 0; }
}
function gotLetter(ch: string) {
  const w = dayWord(); const i = [...w].findIndex((c, k) => c === ch && !save.word.got.includes(k));
  if (i >= 0) { save.word.got.push(i); world.wordGot.add(i); }
  sfx.power(); toast(ch, t('Mot du jour'));
  if (save.word.got.length >= w.length) { save.coins += 2500; save.boards += 3; toast(`🎉 ${w}`, '+2500 🪙 · +3 🛹'); confetti(); sfx.win(); }
  persist();
}
function renderDuoBar() {
  const r = duoRoom!; const names = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  const me = r.me, ot = otherOf(me); const max = Math.max(P.s, ghostState.s, 1);
  const line = (n: string, s: number, sc: number, col: string) => `<div class="duo-line"><span>${n}</span><div class="track"><b style="width:${(s / max) * 100}%;background:${col}"></b></div><span class="sc">${fmt(sc)}</span></div>`;
  $('hDuo').innerHTML = line(names[me], P.s, P.score, me === 'kouider' ? '#ff6b8b' : '#c084fc') + line(names[ot], ghostState.s, ghostState.sc, ot === 'kouider' ? '#ff6b8b' : '#c084fc');
}

function loop() {
  const dt = Math.min(1 / 30, clock.getDelta());
  step(dt); world.render();
  // qualité auto : si le téléphone rame, on coupe le bloom et les ombres
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { const fps = fpsN / fpsAcc; if (fps < 40 && world.quality === 'high') { lowFor++; if (lowFor >= 2) { world.setQuality('low'); } } else lowFor = 0; fpsAcc = 0; fpsN = 0; }
  requestAnimationFrame(loop);
}

applyLang();
showMenu();
const ts = Number(new URLSearchParams(location.search).get('ts') ?? 1);   // tests : ?ts=3 accélère
if (ts !== 1) { const gd = clock.getDelta.bind(clock); clock.getDelta = () => gd() * ts; }
document.fonts?.ready.then(() => { $('loading').style.opacity = '0'; setTimeout(() => $('loading').remove(), 500); });
setTimeout(() => { const l = document.getElementById('loading'); if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 500); } }, 2500);
loop();
