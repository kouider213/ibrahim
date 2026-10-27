// Visage animé de Dzaryx dans l'app : le même petit bonhomme dessin animé que pendant les appels Telegram
// (tgcall/avatar_cute.py, style 'cartoon') — Kouider 27/10 : il veut voir Dzaryx, un visage AMICAL qui bouge quand il parle.
// talk 0-1 = Dzaryx parle (bouche), listen 0-1 = Kouider parle (sourcils levés, petite inclinaison).

export interface FaceInput { talk: number; listen: number; thinking: boolean }

const SKIN = 'rgb(240,190,150)', SKIN_D = 'rgb(215,160,120)', HAIR = 'rgb(40,40,45)', INK = 'rgb(40,40,50)';
const SHIRT = 'rgb(40,120,190)', BLUSH = 'rgba(250,150,150,0.75)', MOUTH = 'rgb(110,40,60)', TONGUE = 'rgb(240,120,140)';
const D = Math.PI / 180;

export function createDzaryxFace() {
  let mouth = 0, gx = 0, gy = 0, tgx = 0, tgy = 0;
  let nextBlink = performance.now() + 2500, blinkUntil = 0, nextGaze = performance.now() + 2000;

  const ell = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a0: number, a1: number,
    fill?: string, stroke?: string, lw = 0, rot = 0) => {
    ctx.beginPath();
    if (fill && a1 - a0 < 360) ctx.moveTo(x, y);   // comme OpenCV : arc rempli = part de tarte jusqu'au centre
    ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot * D, a0 * D, a1 * D);
    if (fill) { if (a1 - a0 < 360) ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke(); }
  };

  /** Dessine le bonhomme centré en (cx, cy) ; R = rayon de la tête (px). t = performance.now(). */
  return function draw(ctx: CanvasRenderingContext2D, cx: number, cy0: number, R: number, t: number, o: FaceInput) {
    const now = t;
    const target = Math.pow(Math.min(1, Math.max(0, o.talk)), 0.7);
    mouth += (target - mouth) * (target > mouth ? 0.5 : 0.3);
    if (now > nextBlink) { blinkUntil = now + 150; nextBlink = now + 2500 + Math.random() * 3000; }
    const blink = now < blinkUntil;
    if (now > nextGaze) {
      tgx = o.thinking ? 0.6 : Math.random() * 2 - 1; tgy = o.thinking ? -0.8 : Math.random() - 0.5;
      nextGaze = now + 1500 + Math.random() * 2000;
    }
    gx += (tgx - gx) * 0.15; gy += (tgy - gy) * 0.15;
    const s = t / 1000;
    const bob = R * (0.035 * Math.sin(s * 1.5) + 0.03 * mouth * Math.sin(s * 9));
    const tilt = 3 * Math.sin(s * 0.6) + 4 * o.listen + (o.thinking ? 4 : 0);
    const cy = cy0 + bob;

    // Corps : t-shirt + cou (ne bougent pas avec la tête)
    ell(ctx, cx, cy0 + R * 2.48, R * 1.33, R * 0.98, 180, 360, SHIRT);
    ctx.fillStyle = SKIN_D; ctx.fillRect(cx - R * 0.24, cy + R * 0.8, R * 0.48, cy0 + R * 1.6 - cy - R * 0.8);
    ell(ctx, cx, cy0 + R * 1.6, R * 0.28, R * 0.13, 0, 180, SKIN_D);

    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt * D); ctx.translate(-cx, -cy);
    for (const k of [-1, 1]) ell(ctx, cx + k * R * 0.95, cy + R * 0.09, R * 0.16, R * 0.22, 0, 360, SKIN_D);
    ell(ctx, cx, cy, R, R * 1.08, 0, 360, SKIN);
    // Barbe courte (ombre sur la mâchoire) puis cheveux courts
    ell(ctx, cx, cy + R * 0.35, R * 0.92, R * 0.7, 15, 165, SKIN_D);
    ell(ctx, cx, cy + R * 0.25, R * 0.78, R * 0.6, 15, 165, SKIN);
    ell(ctx, cx, cy - R * 0.15, R * 1.02, R * 0.98, 190, 350, HAIR);
    ell(ctx, cx, cy - R * 0.05, R * 0.9, R * 0.62, 200, 340, SKIN);
    ell(ctx, cx + R * 0.1, cy - R * 0.62, R * 0.55, R * 0.22, 180, 360, HAIR, undefined, 0, -8);
    // Sourcils doux
    for (const k of [-1, 1]) ell(ctx, cx + k * R * 0.36, cy - R * (0.3 + 0.05 * o.listen), R * 0.15, R * 0.06, 200, 340, undefined, HAIR, R * 0.04);
    // Grands yeux brillants
    for (const k of [-1, 1]) {
      const x0 = cx + k * R * 0.36, y0 = cy - R * 0.05;
      if (blink) { ell(ctx, x0, y0, R * 0.13, R * 0.08, 20, 160, undefined, INK, R * 0.035); continue; }
      ell(ctx, x0, y0, R * 0.15, R * 0.17, 0, 360, '#fff');
      const px = x0 + gx * R * 0.04, py = y0 + gy * R * 0.03 + R * 0.03;
      ell(ctx, px, py, R * 0.1, R * 0.1, 0, 360, 'rgb(40,50,70)');
      ell(ctx, px - R * 0.035, py - R * 0.06, R * 0.035, R * 0.035, 0, 360, '#fff');
      ell(ctx, px + R * 0.04, py + R * 0.02, R * 0.015, R * 0.015, 0, 360, '#fff');
    }
    // Nez + joues
    ell(ctx, cx, cy + R * 0.18, R * 0.08, R * 0.06, 0, 180, undefined, SKIN_D, R * 0.028);
    for (const k of [-1, 1]) ell(ctx, cx + k * R * 0.58, cy + R * 0.25, R * 0.12, R * 0.07, 0, 360, BLUSH);
    // Bouche : sourire, s'ouvre quand il parle (dents + langue)
    const my = cy + R * 0.42;
    if (mouth > 0.08) {
      const hh = R * (0.06 + 0.2 * mouth);
      ell(ctx, cx, my, R * 0.26, hh, 0, 180, MOUTH);
      ctx.fillStyle = MOUTH; ctx.fillRect(cx - R * 0.26, my - R * 0.03, R * 0.52, R * 0.045);
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - R * 0.2, my - R * 0.02, R * 0.4, Math.max(2, hh * 0.25 + R * 0.02));
      ell(ctx, cx, my + hh * 0.75, R * 0.12, Math.max(2, hh / 4), 180, 360, TONGUE);
    } else {
      ell(ctx, cx, my - R * 0.08, R * 0.24, R * 0.14, 15, 165, undefined, INK, R * 0.035);
    }
    ctx.restore();
  };
}
