// 🚗 Rendu du widget CarPlay (Scriptable), téléchargé à chaque rafraîchissement par le petit script collé une fois sur l'iPhone.
// Modifier ici = le widget de Kouider change tout seul (pas de nouveau copier-coller). Pas de ` ni de ${ dans le code.
export const CAR_WIDGET_RENDER = String.raw`// DZARYX · rendu du widget CarPlay v3 « Jarvis HUD » (servi par le backend : le script collé dans Scriptable le télécharge à chaque fois)
// Aucun chiffre (Kouider 03/11) : le vrai ciel sur la photo, soleil/lune réels, mode du moment, tout en mots.
const PHOTO_V = 4;
const RED = new Color("#ff2b3a"), GOLD = new Color("#f7c548"), WHITE = Color.white();
const SOFT = new Color("#ffffff", 0.82), DIM = new Color("#ffffff", 0.5);
const fm = FileManager.local();
const dir = fm.joinPath(fm.documentsDirectory(), "dzaryx");
if (!fm.fileExists(dir)) fm.createDirectory(dir);
const fam = config.widgetFamily || "medium";
const small = fam === "small" || fam === "accessoryRectangular";
const shape = small ? "square" : "wide";
const D = fm.joinPath(dir, "data.json"), P = fm.joinPath(dir, "car-" + shape + "-v" + PHOTO_V + ".jpg");

async function get(path, img) {
  const r = new Request(API + path);
  r.headers = { Authorization: "Bearer " + TOKEN };
  r.timeoutInterval = 15;
  return img ? await r.loadImage() : await r.loadJSON();
}
let data;
try { data = await get("/api/jarvis/car-widget"); if (data.error) throw new Error(data.error); fm.writeString(D, JSON.stringify(data)); }
catch (e) { data = fm.fileExists(D) ? JSON.parse(fm.readString(D)) : {}; }
data.fx = data.fx || {};
let photo = null;
if (!fm.fileExists(P) || Date.now() - fm.modificationDate(P).getTime() > 7 * 864e5) {
  try { photo = await get("/api/jarvis/car-widget/photo?shape=" + shape, true); fm.writeImage(P, photo); } catch (e) {}
}
if (!photo && fm.fileExists(P)) photo = fm.readImage(P);

const W = small ? 600 : 1280, H = 600;
const c = new DrawContext();
c.size = new Size(W, H); c.respectScreenScale = false; c.opaque = true;
c.setFillColor(new Color("#050505")); c.fillRect(new Rect(0, 0, W, H));
if (photo) c.drawImageInRect(photo, new Rect(0, 0, W, H));

const now = new Date();
let seed = now.getFullYear() * 400 + now.getMonth() * 32 + now.getDate();
function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
function t(s, x, y, w, h, font, color, align) {
  if (!s) return;
  c.setFont(font); c.setTextColor(color);
  if (align === "right") c.setTextAlignedRight(); else if (align === "center") c.setTextAlignedCenter(); else c.setTextAlignedLeft();
  c.drawTextInRect(String(s), new Rect(x, y, w, h));
}
function dot(x, y, r, color) { c.setFillColor(color); c.fillEllipse(new Rect(x - r, y - r, 2 * r, 2 * r)); }
function arc(cx, cy, r, a0, a1, color, width) {
  const p = new Path(), n = Math.max(6, Math.round(Math.abs(a1 - a0) / 4));
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180, pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
    if (i) p.addLine(pt); else p.move(pt);
  }
  c.addPath(p); c.setStrokeColor(color); c.setLineWidth(width); c.strokePath();
}
// Bandes de couleur (DrawContext n'a pas de dégradé) : du haut vers le bas, opacité décroissante
function veil(hex, maxA, from, to) {
  const n = 28, h = (to - from) / n;
  for (let i = 0; i < n; i++) { c.setFillColor(new Color(hex, maxA * (1 - i / n))); c.fillRect(new Rect(0, from + i * h, W, h + 1)); }
}

// ── 1. Le vrai ciel sur la photo ──
const ph = data.phase || "jour";
if (ph === "nuit") { c.setFillColor(new Color("#030a26", 0.38)); c.fillRect(new Rect(0, 0, W, H)); veil("#050f3a", 0.55, 0, H * 0.6); }
else if (ph === "aube") { veil("#ff8a5c", 0.42, 0, H * 0.55); veil("#7a4cff", 0.18, 0, H * 0.25); }
else if (ph === "couchant") { veil("#ff4d1f", 0.40, 0, H * 0.6); veil("#f7c548", 0.16, H * 0.2, H * 0.55); }
if (data.fx.rain || data.fx.storm) { c.setFillColor(new Color("#0b1020", 0.22)); c.fillRect(new Rect(0, 0, W, H)); }
if (ph === "nuit" && !data.fx.rain && !data.fx.fog) {
  for (let i = 0; i < (small ? 40 : 90); i++) { const x = rnd() * W, y = rnd() * H * 0.45, r = rnd() < 0.12 ? 2.6 : 1.3; dot(x, y, r, new Color("#ffffff", 0.35 + rnd() * 0.55)); }
}
if (data.fx.fog) { for (let i = 0; i < 5; i++) { c.setFillColor(new Color("#d8dde6", 0.10)); c.fillRect(new Rect(0, H * (0.2 + i * 0.13), W, 70)); } }
if (data.fx.rain || data.fx.storm) {
  for (let i = 0; i < (small ? 70 : 150); i++) {
    const x = rnd() * (W + 120), y = rnd() * H, l = 22 + rnd() * 26, p = new Path();
    p.move(new Point(x, y)); p.addLine(new Point(x - l * 0.35, y + l));
    c.addPath(p); c.setStrokeColor(new Color("#cfe3ff", 0.18 + rnd() * 0.2)); c.setLineWidth(1.6); c.strokePath();
  }
}
if (data.fx.snow) { for (let i = 0; i < (small ? 50 : 110); i++) dot(rnd() * W, rnd() * H, 1.5 + rnd() * 3, new Color("#ffffff", 0.5 + rnd() * 0.4)); }

// ── 2. Arc du soleil / de la lune (position réelle) ──
function sky(cx, cy, r) {
  for (let a = 180; a <= 360; a += 6) { const rad = a * Math.PI / 180; dot(cx + r * Math.cos(rad), cy + r * Math.sin(rad), 2.2, new Color("#ffffff", 0.5)); }
  const pos = data.sunPos != null ? data.sunPos : data.moonPos;
  if (pos == null) return;
  const rad = (180 + 180 * Math.min(1, Math.max(0, pos))) * Math.PI / 180, x = cx + r * Math.cos(rad), y = cy + r * Math.sin(rad);
  if (data.sunPos != null) {
    for (let k = 5; k >= 1; k--) dot(x, y, 10 + k * 9, new Color(ph === "couchant" || ph === "aube" ? "#ff7a2f" : "#f7c548", 0.07));
    dot(x, y, 15, GOLD); dot(x, y, 9, new Color("#fff4c8"));
  } else {
    for (let k = 4; k >= 1; k--) dot(x, y, 8 + k * 8, new Color("#cfd8ff", 0.06));
    dot(x, y, 15, new Color("#f2f4ff")); dot(x + 7, y - 4, 13, new Color("#0a1440", 0.92));
  }
}

// ── 3. HUD Jarvis autour du logo : les anneaux tournent à chaque rafraîchissement ──
function hud(x, y, s) {
  const cx = x + s / 2, cy = y + s / 2, rot = (now.getHours() * 60 + now.getMinutes()) * 6 % 360;
  const p = new Path();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 2, px = cx + s * 0.45 * Math.cos(a), py = cy + s * 0.45 * Math.sin(a);
    if (i) p.addLine(new Point(px, py)); else p.move(new Point(px, py));
  }
  p.closeSubpath();
  c.addPath(p); c.setFillColor(new Color("#000000", 0.35)); c.fillPath();
  c.addPath(p); c.setStrokeColor(new Color("#ff2b3a", 0.3)); c.setLineWidth(s * 0.2); c.strokePath();
  c.addPath(p); c.setStrokeColor(RED); c.setLineWidth(s * 0.075); c.strokePath();
  t("D", x, y + s * 0.2, s, s * 0.62, Font.heavySystemFont(s * 0.48), GOLD, "center");
  arc(cx, cy, s * 0.66, rot, rot + 95, RED, 3);
  arc(cx, cy, s * 0.66, rot + 150, rot + 205, new Color("#ff2b3a", 0.5), 3);
  arc(cx, cy, s * 0.78, -rot * 1.5, -rot * 1.5 + 60, GOLD, 2);
  arc(cx, cy, s * 0.78, -rot * 1.5 + 180, -rot * 1.5 + 215, new Color("#f7c548", 0.5), 2);
  for (let k = 0; k < 12; k++) { const a = (k * 30 + rot / 4) * Math.PI / 180; dot(cx + s * 0.88 * Math.cos(a), cy + s * 0.88 * Math.sin(a), k % 3 ? 1.2 : 2.4, new Color("#ffffff", k % 3 ? 0.35 : 0.8)); }
}
function bar(x, y, w) {
  c.setFillColor(new Color("#ff2b3a", 0.25)); c.fillRect(new Rect(x - 3, y - 3, w + 6, 12));
  c.setFillColor(RED); c.fillRect(new Rect(x, y, w, 6));
}
// Ligne de scan en bas : le point avance avec la journée (aucun chiffre)
function scan(y) {
  c.setFillColor(new Color("#ffffff", 0.14)); c.fillRect(new Rect(0, y, W, 2));
  const k = (now.getHours() * 60 + now.getMinutes()) / 1440, x = W * k;
  c.setFillColor(new Color("#ff2b3a", 0.7)); c.fillRect(new Rect(0, y, x, 2));
  for (let i = 4; i >= 1; i--) dot(x, y + 1, 3 + i * 4, new Color("#f7c548", 0.08));
  dot(x, y + 1, 5, GOLD);
}

const rainTwice = data.alert && /Pluie/.test(data.alert) && /pluie/i.test(data.weather || "");
const info = (!rainTwice && data.alert) || (data.prayer ? "🕌 " + data.prayer : "");
const infoColor = data.alert && !rainTwice ? RED : GOLD;
const weather = ((data.weatherE || "") + "  " + (data.weather || "")).trim();
const jarvis = data.jarvis ? "« " + data.jarvis + " »" : "";

if (small) {
  // Petit format : voile sombre sous le texte (la photo carrée est chargée partout)
  const n = 30;
  for (let i = 0; i < n; i++) { c.setFillColor(new Color("#000000", 0.8 * i / n)); c.fillRect(new Rect(0, H * 0.25 + i * H * 0.75 / n, W, H * 0.75 / n + 1)); }
  c.setFillColor(new Color("#000000", 0.35)); c.fillRect(new Rect(0, 0, W, 120));
  sky(W - 150, 190, 110);
  hud(30, 30, 64);
  t(data.modeLabel ? data.modeLabel.split(" · ")[0] : "DZARYX", 112, 50, 330, 30, Font.heavySystemFont(22), GOLD);
  t(data.greeting || "Bonjour, Monsieur.", 34, 214, W - 68, 56, Font.heavySystemFont(40), WHITE);
  t(weather, 34, 268, W - 68, 36, Font.mediumSystemFont(26), SOFT);
  t(info, 34, 304, W - 68, 34, Font.boldSystemFont(24), infoColor);
  bar(34, 362, 74);
  t(data.nextTitle, 34, 382, W - 68, 46, Font.boldSystemFont(34), WHITE);
  t(data.nextWhen, 34, 428, W - 68, 36, Font.semiboldSystemFont(27), GOLD);
  t(jarvis, 34, 476, W - 68, 92, Font.italicSystemFont(24), SOFT);
  scan(H - 10);
} else {
  sky(W - 250, 270, 190);
  hud(46, 40, 76);
  t("DZARYX", 150, 46, 420, 46, Font.heavySystemFont(40), WHITE);
  t(data.modeLabel || "JARVIS · EN LIGNE", 152, 94, 640, 28, Font.semiboldSystemFont(20), GOLD);
  t(data.greeting || "Bonjour, Monsieur.", 46, 150, 760, 70, Font.heavySystemFont(56), WHITE);
  t(weather, 48, 220, 700, 42, Font.mediumSystemFont(32), SOFT);
  t(info, 48, 262, 700, 36, Font.boldSystemFont(26), infoColor);
  bar(48, 326, 110);
  t("PROCHAIN · FIK", 48, 346, 400, 30, Font.heavySystemFont(22), GOLD);
  t(data.nextTitle, 48, 374, 640, 52, Font.boldSystemFont(40), WHITE);
  t(data.nextWhen, 48, 424, 640, 40, Font.semiboldSystemFont(30), GOLD);
  t(jarvis, 48, 482, 760, 84, Font.italicSystemFont(28), SOFT);
  scan(H - 10);
}

const w = new ListWidget();
w.setPadding(0, 0, 0, 0);
w.backgroundImage = c.getImage();
w.url = "https://kouider213.github.io/ibrahim/";
w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
if (config.runsInWidget) Script.setWidget(w);
else if (small) await w.presentSmall(); else await w.presentMedium();
Script.complete();
`;
