import { makePuzzle, render, photoPuzzle, THEMES, W, H, type Mode, type Diff, type Puzzle } from './scenes.ts';
import { audioUnlock, sfx, music, setMuted, isMuted, duck } from '../games/audio.ts';
import { exitGame, fromHub, bootIdentity, games, online, local, otherOf, serverNow, syncClock, vibrate, type BoardView, type Room, type Uid } from '../games/net.ts';
import { getDeviceToken } from '../services/api.ts';

// L'ŒIL — jeu des différences de Kouider et Fatima. 3 modes (facile / normal / difficile), niveaux sans fin
// (10 décors dessinés), zoom à deux doigts, indices, gel du chrono, combos, étoiles, défi du jour commun,
// À DEUX en direct (même image, la 1re personne qui touche gagne la différence) et MES PHOTOS.

bootIdentity({ name: "L'Œil", short: "L'Œil", color: '#101a3a', icon: '/ibrahim/icons/oeil-512.png' });
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();

let lang: 'fr' | 'ar' = (() => { try { const l = localStorage.getItem('jeux:lang'); if (l === 'ar' || l === 'fr') return l; return localStorage.getItem('forme:token') && !getDeviceToken() ? 'ar' : 'fr'; } catch { return 'fr'; } })();
const AR: Record<string, string> = {
  sub: 'اعثر على كل الاختلافات', daily: 'تحدي اليوم', duo: 'لعب ثنائي', duoSub: 'مباشر، كلٌّ بهاتفه', photo: 'صوري', photoSub: 'اللعبة تصنع الاختلافات على صورتك',
  facile: 'سهل', normal: 'عادي', difficile: 'صعب', Niveau: 'المستوى', 'différences': 'اختلافات', Bravo: 'أحسنت!', 'Temps écoulé': 'انتهى الوقت', Rejouer: 'أعد المحاولة', Suivant: 'التالي', Menu: 'القائمة',
  Points: 'نقاط', Temps: 'الوقت', Erreurs: 'أخطاء', Fermer: 'إغلاق', Prêt: 'جاهز', 'En attente…': 'في الانتظار…', Quitter: 'خروج', Revanche: 'جولة أخرى', 'Égalité !': 'تعادل!', 'Tu as gagné !': 'لقد فزت!', 'a gagné !': 'فاز!',
  'a trouvé !': 'وجد!', 'Trop tard !': 'متأخر!', 'Choisis la difficulté': 'اختر الصعوبة', 'Choisis une photo': 'اختر صورة', 'te défie à L\'ŒIL !': 'يتحداك في العين!', 'Indice': 'تلميح', 'Plus d\'indices': 'لا توجد تلميحات',
  'Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.': 'افتح اللعبة من التطبيق للعب معًا.', 'Ta photo reste sur ton téléphone.': 'صورتك تبقى على هاتفك.',
};
const t = (s: string) => (lang === 'ar' ? AR[s] ?? s : s);
const cap = (s: string) => s.replace(/^./, c => c.toUpperCase());
const fmt = (n: number) => Math.floor(n).toLocaleString(lang === 'ar' ? 'ar' : 'fr-FR');
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach(el => { const k = el.dataset.t!; el.dataset.fr ??= el.textContent ?? ''; el.textContent = lang === 'ar' ? AR[k] ?? el.dataset.fr : el.dataset.fr; });
  $('bLang').textContent = lang === 'ar' ? 'FR' : 'ع';
}

// ── Sauvegarde ───────────────────────────────────────────────────────────────
interface Save { level: Record<Mode, number>; stars: Record<string, number>; hints: number; freezes: number; best: Record<string, number>; daily: { date: string; score: number } }
const save: Save = { level: { facile: 1, normal: 1, difficile: 1 }, stars: {}, hints: 3, freezes: 2, best: {}, daily: { date: '', score: 0 }, ...local.json<Partial<Save>>('oeil', {}) };
const persist = () => local.save('oeil', save);
const MODES: Array<{ id: Mode; e: string; c1: string; c2: string; time: number; hints: number; penalty: number; diffs: number }> = [
  { id: 'facile', e: '🌱', c1: '#1fc98a', c2: '#38bdf8', time: 180, hints: 3, penalty: 0, diffs: 5 },
  { id: 'normal', e: '🔥', c1: '#ff9f1c', c2: '#ff3d75', time: 150, hints: 2, penalty: 5, diffs: 7 },
  { id: 'difficile', e: '💀', c1: '#8b5cf6', c2: '#1e1b4b', time: 120, hints: 1, penalty: 8, diffs: 10 },
];
const M = (m: Mode) => MODES.find(x => x.id === m)!;
const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const today = () => new Date().toISOString().slice(0, 10);

// ── État de la partie ────────────────────────────────────────────────────────
type Kind = 'level' | 'daily' | 'duo' | 'photo';
interface Game { kind: Kind; mode: Mode; level: number; diffs: Diff[]; found: Map<number, Uid | 'me'>; timeLeft: number; total: number; score: number; mistakes: number; hintsUsed: number; combo: number; lastFind: number; frozen: number; over: boolean; lock: number; startAt: number }
let G: Game | null = null; let puzzle: Puzzle | null = null; let board: BoardView | null = null; let duoRoom: Room | null = null;
const cA = $<HTMLCanvasElement>('cA'), cB = $<HTMLCanvasElement>('cB');

function toast(s: string) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = s; document.body.appendChild(d); setTimeout(() => d.remove(), 2300); }
function pop(s: string, x: number, y: number) { const d = document.createElement('div'); d.className = 'pop'; d.textContent = s; d.style.left = `${x}px`; d.style.top = `${y}px`; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); }
function sheet(h: string) { $('sheet').innerHTML = h ? `<div class="sheet"><div class="card">${h}</div></div>` : ''; }
const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = () => { audioUnlock(); sfx.click(); fn(); }; };

// ── Accueil ──────────────────────────────────────────────────────────────────
function renderHome() {
  const stars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('hStars').textContent = `⭐ ${stars}`; $('hItems').textContent = `💡 ${save.hints} · ❄️ ${save.freezes}`;
  $('bSound').textContent = isMuted() ? '🔇' : '🔊'; $('bExit').hidden = !embedded && !fromHub();
  $('modes').innerHTML = MODES.map(m => `<button class="mode" style="--c1:${m.c1};--c2:${m.c2}" data-mode="${m.id}"><div class="e">${m.e}</div><div class="t"><b>${t(m.id).replace(/^./, c => c.toUpperCase())}</b><span>${m.diffs} ${t('différences')} · ${Math.floor(m.time / 60)}:${String(m.time % 60).padStart(2, '0')}</span></div><div class="lv">${t('Niveau')}<b>${save.level[m.id]}</b></div></button>`).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => { audioUnlock(); sfx.click(); startLevel(b.dataset.mode as Mode); });
  $('dailyTxt').textContent = save.daily.date === today() ? `✓ ${fmt(save.daily.score)}` : (lang === 'ar' ? 'نفس الصورة للجميع' : 'Même image pour vous deux');
  if (board) {
    const n = board.names, d = board.board.daily?.date === today() ? board.board.daily.scores : {};
    const best = (u: Uid) => Math.max(...(['oeil:facile', 'oeil:normal', 'oeil:difficile'] as const).map(k => board!.board[k]?.[u]?.best ?? 0));
    $('duel').hidden = false;
    $('duel').innerHTML = `<div><span>${n.kouider}</span><b style="color:#ff8fb1">${fmt(best('kouider'))}</b><span>${d?.kouider ? `📅 ${fmt(d.kouider)}` : ''}</span></div><div style="font-weight:700;color:var(--gold)">VS</div><div><span>${n.femme}</span><b style="color:#c4b5fd">${fmt(best('femme'))}</b><span>${d?.femme ? `📅 ${fmt(d.femme)}` : ''}</span></div>`;
  }
}
function showHome() {
  G = null; sheet(''); $('home').hidden = false; $('game').hidden = true; music(true, 'calm'); duck(0.4); renderHome(); void refreshBoard();
}
async function refreshBoard() { if (!online()) return; try { board = await games.board(); renderHome(); } catch { /* */ } }
// l'œil du logo suit le doigt
addEventListener('pointermove', e => { const i = document.getElementById('iris'); if (!i) return; const dx = (e.clientX / innerWidth - 0.5) * 22, dy = (e.clientY / innerHeight - 0.3) * 14; i.style.transform = `translate(${dx}px, ${dy}px)`; }, { passive: true });

on('bSound', () => { setMuted(!isMuted()); renderHome(); });
on('bLang', () => { lang = lang === 'ar' ? 'fr' : 'ar'; try { localStorage.setItem('jeux:lang', lang); } catch { /* */ } applyLang(); renderHome(); });
on('bExit', exitGame);
on('bDaily', () => startDaily());
on('bDuo', () => void openDuo());
on('bPhoto', () => { sheet(`<h2>📸 ${t('Mes photos')}</h2><div class="lead">${t('Ta photo reste sur ton téléphone.')}</div><div class="lead" style="margin-bottom:8px">${t('Choisis la difficulté')}</div><div class="seg">${MODES.map(m => `<button data-pm="${m.id}" class="${m.id === 'normal' ? 'on' : ''}">${m.e} ${t(m.id)}</button>`).join('')}</div><div class="stack"><button class="btn mint" id="pPick">🖼️ ${t('Choisis une photo')}</button><button class="btn ghost" id="pClose">${t('Fermer')}</button></div>`);
  let pm: Mode = 'normal';
  document.querySelectorAll<HTMLButtonElement>('[data-pm]').forEach(b => b.onclick = () => { pm = b.dataset.pm as Mode; document.querySelectorAll('[data-pm]').forEach(x => x.classList.toggle('on', x === b)); });
  on('pClose', () => sheet(''));
  on('pPick', () => { const f = $<HTMLInputElement>('file'); f.value = ''; f.onchange = () => { const file = f.files?.[0]; if (file) void startPhoto(file, pm); }; f.click(); });
});
on('bBack', () => { if (G?.kind === 'duo') { void games.room('leave').catch(() => {}); duoRoom = null; } showHome(); });
on('bHint', useHint); on('bFreeze', useFreeze);

// ── Mise en page des deux images ─────────────────────────────────────────────
function layout() {
  const bd = $('boards').getBoundingClientRect(); const land = innerWidth > innerHeight;
  const gap = 8; let w: number, h: number;
  if (land) { w = Math.min((bd.width - gap) / 2, bd.height * (W / H)); h = w * H / W; }
  else { h = Math.min((bd.height - gap) / 2, bd.width * (H / W)); w = h * W / H; }
  for (const f of [$('fA'), $('fB')]) { f.style.width = `${w}px`; f.style.height = `${h}px`; }
  applyZoom();
}
addEventListener('resize', layout);

// Zoom/déplacement communs aux deux images (deux doigts = zoom, un doigt quand zoomé = déplacer)
const Z = { k: 1, x: 0, y: 0 };
function applyZoom() {
  const fw = $('fA').clientWidth, fh = $('fA').clientHeight;
  Z.k = Math.max(1, Math.min(4, Z.k)); Z.x = Math.min(0, Math.max(fw - fw * Z.k, Z.x)); Z.y = Math.min(0, Math.max(fh - fh * Z.k, Z.y));
  for (const z of [$('zA'), $('zB')]) z.style.transform = `translate(${Z.x}px, ${Z.y}px) scale(${Z.k})`;
}
const pts = new Map<number, { x: number; y: number; frame: HTMLElement }>();
let gesture: { d0: number; k0: number; cx: number; cy: number; x0: number; y0: number } | null = null, panStart: { x: number; y: number; zx: number; zy: number; moved: boolean } | null = null, lastTap = 0;
for (const f of [$('fA'), $('fB')]) {
  f.addEventListener('pointerdown', e => {
    audioUnlock(); f.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY, frame: f });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const r = f.getBoundingClientRect(); gesture = { d0: Math.hypot(a!.x - b!.x, a!.y - b!.y), k0: Z.k, cx: (a!.x + b!.x) / 2 - r.left, cy: (a!.y + b!.y) / 2 - r.top, x0: Z.x, y0: Z.y }; panStart = null; }
    else panStart = { x: e.clientX, y: e.clientY, zx: Z.x, zy: Z.y, moved: false };
  });
  f.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY, frame: f });
    if (gesture && pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a!.x - b!.x, a!.y - b!.y); const k = Math.max(1, Math.min(4, gesture.k0 * d / gesture.d0));
      Z.x = gesture.cx - (gesture.cx - gesture.x0) * (k / gesture.k0); Z.y = gesture.cy - (gesture.cy - gesture.y0) * (k / gesture.k0); Z.k = k; applyZoom();
    } else if (panStart) {
      const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
      if (Math.hypot(dx, dy) > 10) panStart.moved = true;
      if (panStart.moved && Z.k > 1) { Z.x = panStart.zx + dx; Z.y = panStart.zy + dy; applyZoom(); }
    }
  });
  const end = (e: PointerEvent) => {
    const wasPinch = !!gesture; pts.delete(e.pointerId); if (pts.size < 2) gesture = null;
    if (!wasPinch && panStart && !panStart.moved && pts.size === 0) {
      const now = performance.now();
      const r = f.getBoundingClientRect();
      const sx = ((e.clientX - r.left - Z.x) / Z.k) / r.width * W, sy = ((e.clientY - r.top - Z.y) / Z.k) / r.height * H;
      if (now - lastTap < 280 && Z.k === 1) { /* double tape = zoom ×2.2 ici */ const cx = e.clientX - r.left, cy = e.clientY - r.top; Z.k = 2.2; Z.x = cx - cx * 2.2; Z.y = cy - cy * 2.2; applyZoom(); lastTap = 0; }
      else { lastTap = now; tap(sx, sy, e.clientX, e.clientY, f); }
    }
    if (pts.size === 0) panStart = null;
  };
  f.addEventListener('pointerup', end); f.addEventListener('pointercancel', end);
}

// ── Démarrage ────────────────────────────────────────────────────────────────
function newGame(kind: Kind, mode: Mode, diffs: Diff[], level = 0, startAt = 0): Game {
  const m = M(mode);
  return { kind, mode, level, diffs, found: new Map(), timeLeft: m.time, total: m.time, score: 0, mistakes: 0, hintsUsed: 0, combo: 0, lastFind: 0, frozen: 0, over: false, lock: 0, startAt };
}
function showGame(title: string, sub: string) {
  sheet(''); $('home').hidden = true; $('game').hidden = false; $('gTitle').textContent = title; $('gSub').textContent = sub;
  for (const z of [$('zA'), $('zB')]) z.querySelectorAll('.mark,.x,.freeze-ov').forEach(n => n.remove());
  Z.k = 1; Z.x = 0; Z.y = 0; requestAnimationFrame(layout); renderBar(); music(true, 'calm'); duck(0.35);
}
function startLevel(mode: Mode, lvl = save.level[mode]) {
  const seed = hashSeed(`${mode}:${lvl}`);
  puzzle = makePuzzle(seed, mode, (lvl - 1 + MODES.findIndex(m => m.id === mode) * 3) % THEMES.length);
  drawPuzzle(); G = newGame('level', mode, puzzle.diffs, lvl);
  showGame(lang === 'ar' ? puzzle.theme.nameAr : puzzle.theme.name, `${puzzle.theme.emoji} ${cap(t(mode))} · ${t('Niveau')} ${lvl}`);
}
function startDaily() {
  const seed = hashSeed(`daily:${today()}`);
  puzzle = makePuzzle(seed, 'normal'); drawPuzzle(); G = newGame('daily', 'normal', puzzle.diffs);
  showGame(`📅 ${t('daily')}`, lang === 'ar' ? puzzle.theme.nameAr : puzzle.theme.name);
}
function drawPuzzle() { if (!puzzle) return; render(cA.getContext('2d')!, puzzle, 'a'); render(cB.getContext('2d')!, puzzle, 'b'); }
async function startPhoto(file: File, mode: Mode) {
  try {
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url; await img.decode();
    const pp = photoPuzzle(img, mode, Math.floor(Math.random() * 1e9)); URL.revokeObjectURL(url);
    cA.getContext('2d')!.drawImage(pp.a, 0, 0); cB.getContext('2d')!.drawImage(pp.b, 0, 0);
    puzzle = null; G = newGame('photo', mode, pp.diffs);
    showGame(`📸 ${t('photo')}`, `${M(mode).e} ${t(mode)} · ${pp.diffs.length} ${t('différences')}`);
  } catch { toast('⚠️ Photo illisible'); }
}

// ── Jeu ──────────────────────────────────────────────────────────────────────
function mark(d: Diff, cls: string) {
  for (const z of [$('zA'), $('zB')]) { const m = document.createElement('div'); m.className = `mark ${cls}`; m.style.left = `${(d.x / W) * 100}%`; m.style.top = `${(d.y / H) * 100}%`; m.style.width = m.style.height = `${(d.r * 2 / W) * 100}%`; m.style.height = `${(d.r * 2 / H) * 100}%`; m.dataset.idx = String(G!.diffs.indexOf(d)); z.appendChild(m); }
}
function tap(sx: number, sy: number, cx: number, cy: number, frame: HTMLElement) {
  if (!G || G.over || G.timeLeft <= 0) return;
  if (G.kind === 'duo' && G.startAt && serverNow() < G.startAt) return;
  if (performance.now() < G.lock) return;
  const i = G.diffs.findIndex((d, k) => !G!.found.has(k) && Math.hypot(d.x - sx, d.y - sy) < d.r + 18);
  if (i >= 0) { found(i, cx, cy); return; }
  if (G.diffs.some((d, k) => G!.found.has(k) && Math.hypot(d.x - sx, d.y - sy) < d.r + 10)) return;   // déjà trouvée : on ignore
  // erreur
  G.mistakes++; G.combo = 0; sfx.wrong(); vibrate(70);
  const z = frame.querySelector('.zoomer')!; const x = document.createElement('div'); x.className = 'x'; x.textContent = '✕'; x.style.left = `${(sx / W) * 100}%`; x.style.top = `${(sy / H) * 100}%`; z.appendChild(x); setTimeout(() => x.remove(), 700);
  frame.classList.remove('flashbad'); void frame.offsetWidth; frame.classList.add('flashbad');
  const pen = M(G.mode).penalty;
  if (G.kind === 'duo') G.lock = performance.now() + 1500;
  else if (pen) { G.timeLeft = Math.max(0, G.timeLeft - pen); pop(`-${pen}s`, cx, cy); }
}
function found(i: number, cx: number, cy: number) {
  const g = G!; const d = g.diffs[i]!;
  if (g.kind === 'duo') {
    g.found.set(i, 'me'); mark(d, ''); sfx.find(g.combo); vibrate(25); renderBar();
    void games.room('claim', { idx: String(i) }).then(v => { duoRoom = v.room; applyClaims(); }).catch(() => {});
    return;
  }
  const now = performance.now();
  g.combo = now - g.lastFind < 5000 ? g.combo + 1 : 0; g.lastFind = now;
  const pts = 100 * (1 + g.combo * 0.5);
  g.score += pts; g.found.set(i, 'me'); mark(d, ''); sfx.find(g.combo); vibrate(25);
  pop(g.combo ? `+${Math.round(pts)} COMBO ×${g.combo + 1}` : `+${Math.round(pts)}`, cx, cy);
  renderBar();
  if (g.found.size === g.diffs.length) win();
}
function renderBar() {
  if (!G) return;
  $('dots').innerHTML = G.diffs.map((_, i) => `<i class="${G!.found.get(i) === 'me' ? 'on' : G!.found.has(i) ? 'ot' : ''}"></i>`).join('');
  $('gScore').textContent = G.kind === 'duo' ? `${[...G.found.values()].filter(v => v === 'me').length}` : fmt(G.score);
  $('nHint').textContent = String(save.hints); $<HTMLButtonElement>('bHint').disabled = save.hints <= 0 || G.kind === 'duo';
  $('nFreeze').textContent = String(save.freezes); $<HTMLButtonElement>('bFreeze').disabled = save.freezes <= 0 || G.kind === 'duo' || G.frozen > 0;
}
function useHint() {
  if (!G || G.over || G.kind === 'duo') return;
  if (save.hints <= 0) { toast(t('Plus d\'indices')); return; }
  const i = G.diffs.findIndex((_, k) => !G!.found.has(k)); if (i < 0) return;
  save.hints--; G.hintsUsed++; persist(); sfx.hint(); renderBar();
  const d = G.diffs[i]!; mark(d, 'hint');
  // zoom sur l'indice
  const fw = $('fA').clientWidth, fh = $('fA').clientHeight; Z.k = 1.8; Z.x = fw / 2 - (d.x / W) * fw * Z.k; Z.y = fh / 2 - (d.y / H) * fh * Z.k; applyZoom();
  setTimeout(() => { document.querySelectorAll(`.mark.hint[data-idx="${i}"]`).forEach(n => n.remove()); }, 2600);
}
function useFreeze() {
  if (!G || G.over || G.kind === 'duo' || G.frozen > 0 || save.freezes <= 0) return;
  save.freezes--; persist(); G.frozen = 12; sfx.shield(); renderBar();
  for (const f of [$('fA'), $('fB')]) { const o = document.createElement('div'); o.className = 'freeze-ov'; f.appendChild(o); }
}
function stars(g: Game) { const r = g.timeLeft / g.total; return r >= 0.45 && g.mistakes <= 2 && g.hintsUsed === 0 ? 3 : r >= 0.2 && g.mistakes <= 5 ? 2 : 1; }
async function win() {
  const g = G!; g.over = true; sfx.win(); confetti(); duck(0.25);
  const st = stars(g); const bonus = Math.round(g.timeLeft * 6) + (g.hintsUsed ? 0 : 300) + Math.max(0, 200 - g.mistakes * 40);
  g.score += bonus;
  if (g.kind === 'level') {
    const key = `${g.mode}:${g.level}`; if ((save.stars[key] ?? 0) < st) save.stars[key] = st;
    save.level[g.mode] = Math.max(save.level[g.mode], g.level + 1);
    if (st === 3) save.hints++; if (g.level % 5 === 0) save.freezes++;
    save.best[g.mode] = Math.max(save.best[g.mode] ?? 0, g.score);
  }
  if (g.kind === 'daily') save.daily = { date: today(), score: Math.max(save.daily.date === today() ? save.daily.score : 0, g.score) };
  persist();
  let srv: { record: boolean; beat: boolean } | null = null;
  if (online() && g.kind !== 'photo') try { srv = await games.score(g.kind === 'daily' ? 'oeil:daily' : `oeil:${g.mode}`, g.score, today()); } catch { /* */ }
  sheet(`<h2>${t('Bravo')} 🎉</h2><div class="stars">${[1, 2, 3].map(i => `<i data-s="${i}">⭐</i>`).join('')}</div><div class="big">${fmt(g.score)}</div>
    ${srv?.beat && board ? `<div class="lead" style="color:var(--gold)">👑 ${lang === 'ar' ? 'تفوقت على' : 'Tu passes devant'} ${board.names[otherOf(board.me)]} !</div>` : ''}
    <div class="kv"><div><b>${Math.floor((g.total - g.timeLeft) / 60)}:${String(Math.floor(g.total - g.timeLeft) % 60).padStart(2, '0')}</b><span>${t('Temps')}</span></div><div><b>${g.mistakes}</b><span>${t('Erreurs')}</span></div><div><b>+${fmt(bonus)}</b><span>bonus</span></div></div>
    <div class="stack">${g.kind === 'level' ? `<button class="btn mint" id="wNext">${t('Suivant')} ▶</button>` : ''}<button class="btn ghost" id="wMenu">${t('Menu')}</button></div>`);
  [1, 2, 3].forEach(i => setTimeout(() => { if (i <= st) { document.querySelector(`[data-s="${i}"]`)?.classList.add('on'); sfx.coin(i * 3); } }, 350 + i * 300));
  on('wNext', () => startLevel(g.mode)); on('wMenu', showHome);
}
function lose() {
  const g = G!; g.over = true; sfx.lose();
  g.diffs.forEach((d, i) => { if (!g.found.has(i)) mark(d, 'miss'); });
  setTimeout(() => {
    sheet(`<h2>⏰ ${t('Temps écoulé')}</h2><div class="lead">${g.found.size} / ${g.diffs.length} ${t('différences')}</div><div class="stack"><button class="btn" id="lAgain">↻ ${t('Rejouer')}</button><button class="btn ghost" id="lMenu">${t('Menu')}</button></div>`);
    on('lAgain', () => { if (g.kind === 'level') startLevel(g.mode, g.level); else if (g.kind === 'daily') startDaily(); else showHome(); }); on('lMenu', showHome);
  }, 1800);
}

// ── À DEUX ───────────────────────────────────────────────────────────────────
let duoMode: Mode = 'normal';
async function openDuo() {
  if (!online()) { sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${t('Ouvre le jeu depuis l\'app (Dzaryx ou FORME) pour jouer à deux.')}</div><button class="btn ghost" id="x" style="width:100%">${t('Fermer')}</button>`); on('x', () => sheet('')); return; }
  try {
    const v0 = await games.peek(); const r = v0.room; let v = v0;
    if (r && r.game === 'oeil' && !r.ended && r.host !== r.me && !r.players[r.me]) v = await games.room('join');
    else if (!r || r.game !== 'oeil' || r.ended || !r.players[r.me]) v = await games.room('invite', { game: 'oeil', mode: duoMode });
    duoRoom = v.room; lobby();
  } catch (e) { toast(`⚠️ ${String(e).slice(0, 60)}`); }
}
function lobby() {
  const r = duoRoom; if (!r) return;
  const me = r.me, ot = otherOf(me), n = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  const card = (u: Uid) => `<div class="${r.players[u]?.ready ? 'ok' : ''}"><div style="font-size:34px">${u === 'kouider' ? '🧔' : '👩'}</div><b>${n[u]}</b><div style="font-size:13px;color:var(--mut)">${!r.players[u] ? `⏳ ${t('En attente…')}` : r.players[u]!.ready ? `✅ ${t('Prêt')}` : '👀'}</div></div>`;
  sheet(`<h2>👫 ${t('duo')}</h2><div class="lead">${lang === 'ar' ? 'نفس الصورة — من يلمس أولًا يربح الاختلاف' : 'Même image — chaque différence est à celui qui la touche en premier'}</div>
    ${r.host === me ? `<div class="seg">${MODES.map(m => `<button data-dm="${m.id}" class="${r.mode === m.id ? 'on' : ''}">${m.e} ${t(m.id)}</button>`).join('')}</div>` : `<div class="lead">${M(r.mode as Mode)?.e ?? ''} ${t(r.mode)}</div>`}
    <div class="lob">${card(me)}${card(ot)}</div>
    <div class="stack">${r.players[me]?.ready ? `<button class="btn ghost" disabled>✅ ${t('En attente…')}</button>` : `<button class="btn rose" id="dReady">${t('Prêt')} !</button>`}<button class="btn ghost" id="dLeave">${t('Quitter')}</button></div>`);
  document.querySelectorAll<HTMLButtonElement>('[data-dm]').forEach(b => b.onclick = async () => { duoMode = b.dataset.dm as Mode; try { const v = await games.room('rematch', { mode: duoMode }); duoRoom = v.room; lobby(); } catch { /* */ } });
  on('dReady', async () => { try { const s = Date.now(); const v = await games.room('ready'); syncClock(v, s); duoRoom = v.room; lobby(); maybeStartDuo(); } catch { /* */ } });
  on('dLeave', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; sheet(''); });
}
function maybeStartDuo() {
  const r = duoRoom; if (!r?.startAt || (G?.kind === 'duo' && !G.over)) return;
  if (serverNow() > r.startAt + M(r.mode as Mode).time * 1000) return;
  puzzle = makePuzzle(r.seed, r.mode as Mode); drawPuzzle();
  G = newGame('duo', r.mode as Mode, puzzle.diffs, 0, r.startAt);
  showGame(`👫 ${t('duo')}`, `${lang === 'ar' ? puzzle.theme.nameAr : puzzle.theme.name} · ${t(r.mode)}`);
  countdown(r.startAt);
}
function countdown(at: number) {
  const el = document.createElement('div'); el.style.cssText = 'position:fixed;inset:0;z-index:45;display:grid;place-items:center;font-size:130px;font-weight:700;color:#ffe07a;text-shadow:0 6px 0 rgba(0,0,0,.3),0 0 40px rgba(255,201,60,.7);background:rgba(5,8,20,.45);pointer-events:none'; document.body.appendChild(el);
  let last = -1; const tick = () => { const left = at - serverNow(); if (left <= 0) { el.textContent = 'GO!'; sfx.go(); setTimeout(() => el.remove(), 450); return; } const n = Math.ceil(left / 1000); if (n !== last) { last = n; el.textContent = String(Math.min(3, n)); sfx.tick(); } requestAnimationFrame(tick); }; tick();
}
function applyClaims() {
  const r = duoRoom; if (!r || !G || G.kind !== 'duo') return;
  const n = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  for (const [k, u] of Object.entries(r.claims)) {
    const i = Number(k); const mine = u === r.me; const cur = G.found.get(i);
    if (mine && cur !== 'me') { G.found.set(i, 'me'); mark(G.diffs[i]!, ''); }
    if (!mine && cur !== u) {
      if (cur === 'me') { document.querySelectorAll(`.mark[data-idx="${i}"]`).forEach(m => m.classList.add('other')); toast(`${t('Trop tard !')} ${n[u]} ⚡`); }
      else { mark(G.diffs[i]!, 'other'); toast(`👀 ${n[u]} ${t('a trouvé !')}`); sfx.tick(); }
      G.found.set(i, u);
    }
  }
  renderBar();
  if (G.found.size === G.diffs.length && !G.over) duoEnd();
}
function duoEnd() {
  const r = duoRoom!, g = G!; g.over = true;
  const me = r.me, ot = otherOf(me), n = board?.names ?? { kouider: 'Kouider', femme: 'Fatima' };
  const a = Object.values(r.claims).filter(x => x === me).length, b = Object.values(r.claims).filter(x => x === ot).length;
  const w = a > b ? me : b > a ? ot : null;
  if (w === me) { sfx.win(); confetti(); } else sfx.lose();
  void games.room('state', { done: true, score: a }).catch(() => {});
  sheet(`<h2>${w === null ? t('Égalité !') : w === me ? `🏆 ${t('Tu as gagné !')}` : `${n[ot]} ${t('a gagné !')}`}</h2>
    <div class="vs"><div class="${w === me ? 'w' : ''}">${n[me]}<b>${a}</b></div><div class="${w === ot ? 'w' : ''}">${n[ot]}<b>${b}</b></div></div>
    <div class="stack"><button class="btn rose" id="rAgain">↻ ${t('Revanche')}</button><button class="btn ghost" id="rMenu">${t('Menu')}</button></div>`);
  on('rAgain', async () => { try { const v = await games.room('rematch', { mode: g.mode }); duoRoom = v.room; G = null; $('game').hidden = true; $('home').hidden = false; lobby(); } catch { /* */ } });
  on('rMenu', async () => { try { await games.room('leave'); } catch { /* */ } duoRoom = null; showHome(); });
}
let pollBusy = false, lastPoll = 0;
async function poll() {
  if (pollBusy || !online()) return; pollBusy = true;
  try {
    const s = Date.now(); const v = await games.peek(); syncClock(v, s); const r = v.room;
    if (duoRoom || (G?.kind === 'duo')) {
      duoRoom = r;
      if (!r) { if (G?.kind === 'duo' && !G.over) { toast('👋'); showHome(); } else if ($('sheet').innerHTML.includes('class="lob"')) sheet(''); }
      else if (G?.kind === 'duo' && !G.over) applyClaims();
      else if ($('sheet').innerHTML.includes('class="lob"')) { lobby(); maybeStartDuo(); }
    } else if (r && r.game === 'oeil' && !r.ended && !r.startAt && r.host !== r.me && !r.players[r.me] && !r.otherGone && !G) {
      $('invite').hidden = false; $('invTxt').textContent = `${board?.names[r.host] ?? ''} ${t('te défie à L\'ŒIL !')}`;
    } else $('invite').hidden = true;
  } catch { /* */ } finally { pollBusy = false; }
}
on('bJoin', () => { $('invite').hidden = true; void openDuo(); });

function confetti() {
  const c = $<HTMLCanvasElement>('confetti'), g = c.getContext('2d')!; c.width = innerWidth; c.height = innerHeight;
  const ps = Array.from({ length: 150 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.3, vx: (Math.random() - 0.5) * 15, vy: -Math.random() * 15 - 4, r: Math.random() * 3, c: `hsl(${Math.random() * 360},95%,62%)`, s: 5 + Math.random() * 7 }));
  let n = 0; const st = () => { g.clearRect(0, 0, c.width, c.height); for (const p of ps) { p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); } if (++n < 160) requestAnimationFrame(st); else g.clearRect(0, 0, c.width, c.height); }; st();
}

// ── Boucle : chrono ──────────────────────────────────────────────────────────
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (G && !G.over) {
    if (G.kind === 'duo') { G.timeLeft = Math.max(0, G.total - Math.max(0, serverNow() - G.startAt) / 1000); if (G.timeLeft <= 0 && !G.over) duoEnd(); }
    else if (G.frozen > 0) { G.frozen -= dt; if (G.frozen <= 0) { G.frozen = 0; document.querySelectorAll('.freeze-ov').forEach(n => n.remove()); renderBar(); } }
    else if (!$('sheet').innerHTML) { G.timeLeft -= dt; if (G.timeLeft <= 0) { G.timeLeft = 0; lose(); } }
    const tl = Math.ceil(G.timeLeft); $('tTxt').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
    const ring = $('tRing'); ring.setAttribute('stroke-dashoffset', String(144.5 * (1 - G.timeLeft / G.total)));
    ring.setAttribute('stroke', G.frozen > 0 ? '#8fe3ff' : G.timeLeft < 20 ? '#ff4d5e' : G.timeLeft < 50 ? '#ffc93c' : '#34e0a1');
    $('timer').className = `timer${G.frozen > 0 ? ' frozen' : G.timeLeft < 15 ? ' low' : ''}`;
  }
  if (now - lastPoll > (G?.kind === 'duo' ? 500 : duoRoom ? 900 : 3500)) { lastPoll = now; void poll(); }
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });
addEventListener('pointerdown', () => audioUnlock(), { once: true });

applyLang(); showHome(); requestAnimationFrame(loop);
const q = new URLSearchParams(location.search);
if (q.get('demo')) startLevel((q.get('demo') as Mode) || 'normal', Number(q.get('lvl') ?? 1));
