// 🚗 Rendu du widget CarPlay (Scriptable), téléchargé à chaque rafraîchissement par le petit script collé une fois sur l'iPhone.
// Modifier ici = le widget de Kouider change tout seul (pas de nouveau copier-coller). Pas de ` ni de ${ dans le code.
export const CAR_WIDGET_RENDER = String.raw`// DZARYX · rendu du widget CarPlay (servi par le backend, le script collé dans Scriptable le télécharge à chaque fois)
const PHOTO_V = 4;
const RED = new Color("#ff2b3a"), GOLD = new Color("#f7c548"), WHITE = Color.white();
const SOFT = new Color("#ffffff", 0.78), DIM = new Color("#ffffff", 0.5);
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
catch (e) { data = fm.fileExists(D) ? JSON.parse(fm.readString(D)) : { nextTitle: "Dzaryx hors ligne", nextWhen: "", jarvis: "Tous les systèmes sont opérationnels, monsieur." }; }
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

function t(s, x, y, w, h, font, color, align) {
  if (!s) return;
  c.setFont(font); c.setTextColor(color);
  if (align === "right") c.setTextAlignedRight(); else if (align === "center") c.setTextAlignedCenter(); else c.setTextAlignedLeft();
  c.drawTextInRect(String(s), new Rect(x, y, w, h));
}
function hexa(x, y, s) {
  const p = new Path();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 2, px = x + s / 2 + s * 0.45 * Math.cos(a), py = y + s / 2 + s * 0.45 * Math.sin(a);
    if (i) p.addLine(new Point(px, py)); else p.move(new Point(px, py));
  }
  p.closeSubpath();
  c.addPath(p); c.setStrokeColor(new Color("#ff2b3a", 0.3)); c.setLineWidth(s * 0.2); c.strokePath();
  c.addPath(p); c.setStrokeColor(RED); c.setLineWidth(s * 0.075); c.strokePath();
  t("D", x, y + s * 0.2, s, s * 0.62, Font.heavySystemFont(s * 0.48), GOLD, "center");
}
function bar(x, y, w) {
  c.setFillColor(new Color("#ff2b3a", 0.25)); c.fillRect(new Rect(x - 3, y - 3, w + 6, 12));
  c.setFillColor(RED); c.fillRect(new Rect(x, y, w, 6));
}
const temp = data.temp != null ? data.temp + "°" : "";
const biz = (data.rented || 0) + (data.rented > 1 ? " voitures louées" : " voiture louée") +
  (data.money > 0 ? " · " + data.money.toLocaleString("fr-FR") + " € aujourd'hui" : data.month > 0 ? " · " + data.month.toLocaleString("fr-FR") + " € ce mois" : "");

if (small) {
  hexa(32, 30, 58);
  t("DZARYX", 100, 44, 260, 40, Font.heavySystemFont(30), WHITE);
  t(temp, W - 230, 18, 200, 80, Font.heavySystemFont(66), WHITE, "right");
  if (data.alert) t(data.alert, W - 360, 98, 330, 36, Font.boldSystemFont(24), RED, "right");
  else t((data.weatherE || "") + " " + (data.weather || ""), W - 330, 98, 300, 36, Font.mediumSystemFont(24), SOFT, "right");
  bar(34, 372, 74);
  t(data.nextTitle, 34, 392, W - 68, 46, Font.boldSystemFont(36), WHITE);
  t(data.nextWhen, 34, 440, W - 68, 36, Font.semiboldSystemFont(27), GOLD);
  t("« " + data.jarvis + " »", 34, 490, W - 68, 90, Font.italicSystemFont(25), SOFT);
} else {
  hexa(46, 40, 76);
  t("DZARYX", 136, 50, 400, 46, Font.heavySystemFont(40), WHITE);
  t("JARVIS · EN LIGNE", 138, 96, 400, 28, Font.semiboldSystemFont(20), GOLD);
  t(temp, 40, 128, 360, 150, Font.heavySystemFont(132), WHITE);
  t((data.weatherE || "") + "  " + (data.weather || "") + (data.alert ? "   " : ""), 48, 276, 560, 44, Font.mediumSystemFont(32), SOFT);
  if (data.alert) t(data.alert, 48, 304, 560, 34, Font.boldSystemFont(24), RED);
  bar(48, 340, 110);
  t("PROCHAIN · FIK", 48, 362, 400, 30, Font.heavySystemFont(22), GOLD);
  t(data.nextTitle, 48, 392, 560, 52, Font.boldSystemFont(40), WHITE);
  t(data.nextWhen, 48, 444, 560, 40, Font.semiboldSystemFont(30), GOLD);
  t("« " + data.jarvis + " »", 48, 500, 580, 84, Font.italicSystemFont(27), SOFT);
  t(biz + "  ·  à jour " + (data.at || ""), W - 40 - 640, 558, 640, 28, Font.semiboldSystemFont(21), SOFT, "right");
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
