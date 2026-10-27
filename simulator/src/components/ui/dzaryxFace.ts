// Visage animé de Dzaryx dans l'app : l'hologramme réaliste choisi par Kouider (27/10), le même que pendant les
// appels Telegram (tgcall/avatar_real.py) — la mâchoire descend quand il parle, il cligne des yeux, la tête respire,
// effets d'hologramme. talk 0-1 = Dzaryx parle, listen 0-1 = Kouider parle (il penche un peu la tête).

export interface FaceInput { talk: number; listen: number; thinking: boolean }

// Repères du visage sur public/dzaryx-face.jpg (540×720), trouvés avec YuNet (tgcall/models)
const IMG_W = 540, IMG_H = 720;
const EYES: [number, number][] = [[192.8, 344.2], [338.0, 341.4]];
const MOUTH: [number, number] = [265.8, 512.9];
const MOUTH_HW = 58.1, EYE_W = 37.8, FACE_H = 431.1;

export function createDzaryxFace() {
  const img = new Image();
  img.src = `${((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/ibrahim/"}dzaryx-face.jpg`;
  let ready = false;
  let jawMask: HTMLCanvasElement | null = null, jaw: HTMLCanvasElement | null = null, glow: HTMLCanvasElement | null = null;
  let skin = 'rgb(150,140,160)';
  img.onload = () => {
    ready = true;
    // Masque de la mâchoire : sous les lèvres, centré sur la bouche, s'éteint vers le cou (comme avatar_real.py)
    jawMask = document.createElement('canvas'); jawMask.width = IMG_W; jawMask.height = IMG_H;
    const mc = jawMask.getContext('2d')!;
    const id = mc.createImageData(IMG_W, IMG_H);
    const chin = MOUTH[1] + FACE_H * 0.27;
    for (let y = 0; y < IMG_H; y++) {
      // lèvre du bas = 1, menton = 0,5 (la barbe ne s'étire pas), cou = 0
      const ramp = Math.min(1, Math.max(0, (y - MOUTH[1]) / 3));
      const lip = 1 - 0.5 * Math.min(1, Math.max(0, (y - MOUTH[1] - FACE_H * 0.04) / (FACE_H * 0.12)));
      const wy = ramp * lip * Math.min(1, Math.max(0, 1 - (y - chin) / (FACE_H * 0.18)));
      if (!wy) continue;
      for (let x = 0; x < IMG_W; x++) {
        const wx = Math.exp(-(((x - MOUTH[0]) / (MOUTH_HW * 2.1)) ** 2));
        id.data[(y * IMG_W + x) * 4 + 3] = Math.round(255 * wx * wy);
      }
    }
    mc.putImageData(id, 0, 0);
    jaw = document.createElement('canvas'); jaw.width = IMG_W; jaw.height = IMG_H;
    glow = document.createElement('canvas'); glow.width = IMG_W / 6; glow.height = IMG_H / 6;
    try {   // couleur de la peau (joue) pour les paupières
      const c = document.createElement('canvas'); c.width = 6; c.height = 6;
      const cx = c.getContext('2d')!;
      cx.drawImage(img, EYES[0][0] - 3, EYES[0][1] + EYE_W * 0.9, 6, 6, 0, 0, 6, 6);
      const p = cx.getImageData(0, 0, 6, 6).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < p.length; i += 4) { r += p[i]!; g += p[i + 1]!; b += p[i + 2]!; }
      skin = `rgb(${Math.round(r / 36)},${Math.round(g / 36)},${Math.round(b / 36)})`;
    } catch { /* image d'un autre domaine : couleur par défaut */ }
  };

  let mouth = 0, nod = 0, lnod = 0, nextBlink = performance.now() + 2500, blinkT = -1e9;

  /** Dessine le visage centré en (cx, cy) ; R = demi-hauteur de la tête (px). t = performance.now(). */
  return function draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number, o: FaceInput) {
    if (!ready || !jaw || !jawMask || !glow) return;
    const target = Math.pow(Math.min(1, Math.max(0, o.talk)), 0.75);
    mouth += (target - mouth) * (target > mouth ? 0.5 : 0.3);
    const s = t / 1000;
    // Taille : la tête (FACE_H) fait 2R de haut ; le visage est centré sur (cx, cy)
    const k = (2 * R) / FACE_H;
    const w = IMG_W * k, h = IMG_H * k;
    const x0 = cx - (EYES[0][0] + EYES[1][0]) / 2 * k, y0 = cy - (EYES[0][1] + FACE_H * 0.12) * k;

    // Mâchoire décalée de d pixels (calque masqué)
    const d = mouth * FACE_H * 0.034;
    const jc = jaw.getContext('2d')!;
    jc.globalCompositeOperation = 'source-over';
    jc.clearRect(0, 0, IMG_W, IMG_H);
    if (d > 0.4) {
      jc.drawImage(img, 0, d);
      jc.globalCompositeOperation = 'destination-in';
      jc.drawImage(jawMask, 0, 0);
      jc.globalCompositeOperation = 'source-over';
      // intérieur de la bouche : ombre douce entre les lèvres (pas de fausses dents)
      const g = jc.createRadialGradient(MOUTH[0], MOUTH[1] + d * 0.5, 0, MOUTH[0], MOUTH[1] + d * 0.5, MOUTH_HW * 0.7);
      g.addColorStop(0, 'rgba(18,10,20,0.95)'); g.addColorStop(0.6, 'rgba(35,20,30,0.85)'); g.addColorStop(1, 'rgba(60,35,45,0)');
      jc.fillStyle = g;
      jc.beginPath(); jc.ellipse(MOUTH[0], MOUTH[1] + d * 0.5, MOUTH_HW * 0.68, Math.max(1, d * 0.6), 0, 0, Math.PI * 2); jc.fill();
    }
    // Clignement
    if (t > nextBlink) { blinkT = t; nextBlink = t + 2500 + Math.random() * 3000; }
    const bk = (t - blinkT) / 180;
    if (bk >= 0 && bk <= 1) {
      // vraie paupière : la bande de peau au-dessus de l'œil est étirée vers le bas sur l'œil
      const close = Math.sin(bk * Math.PI);
      for (const [ex, ey] of EYES) {
        const eh = EYE_W * 0.55, top = ey - eh * 1.5, strip = eh * 0.7;
        jc.save();
        jc.beginPath(); jc.ellipse(ex, ey, EYE_W * 1.05, eh * 1.1, 0, 0, Math.PI * 2); jc.clip();
        jc.drawImage(img, ex - EYE_W * 1.1, top, EYE_W * 2.2, strip, ex - EYE_W * 1.1, top, EYE_W * 2.2, strip + (eh * 2.4) * close);
        jc.restore();
      }
    }

    // Tête : respiration, balancement, hochement quand il parle, penche quand il écoute
    nod += (mouth * 1.2 * Math.sin(s * 6.5) - nod) * 0.25;
    lnod += ((o.listen > 0.08 ? 2.2 * Math.max(0, Math.sin(s * 2.2)) : 0) - lnod) * 0.08;   // petits hochements quand il écoute
    const ang = (1.2 * Math.sin(s * 0.5) + 0.6 * Math.sin(s * 1.3) + 1.5 * o.listen + (o.thinking ? 1.5 : 0)) * Math.PI / 180;
    const dy = (2.5 * Math.sin(s * 0.9) + nod + lnod) * k * 1.5;
    const pivX = x0 + w / 2, pivY = y0 + h * 0.85;
    ctx.save();
    ctx.translate(pivX, pivY + dy); ctx.rotate(ang); ctx.translate(-pivX, -pivY);
    ctx.drawImage(img, x0, y0, w, h);
    ctx.drawImage(jaw, x0, y0, w, h);
    // Halo d'hologramme qui pulse avec la voix (copie floue en mode « lighter »)
    const gc = glow.getContext('2d')!;
    gc.clearRect(0, 0, glow.width, glow.height);
    gc.drawImage(img, 0, 0, glow.width, glow.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 + 0.2 * mouth;
    ctx.drawImage(glow, x0, y0, w, h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // Lignes de balayage + bande lumineuse qui descend
    ctx.fillStyle = 'rgba(3,6,15,0.16)';
    for (let y = y0; y < y0 + h; y += 3) ctx.fillRect(x0, y, w, 1);
    const band = y0 + ((s * 70 * k * 1.5) % (h + 80)) - 40;
    ctx.fillStyle = 'rgba(120,200,255,0.10)';
    ctx.fillRect(x0, band, w, 8 * k * 1.5);
    // Bords fondus dans le fond (cache les éléments de l'affiche d'origine)
    const fade = (gx0: number, gx1: number) => {
      const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
      g.addColorStop(0, 'rgba(3,6,15,1)'); g.addColorStop(0.4, 'rgba(3,6,15,1)'); g.addColorStop(1, 'rgba(3,6,15,0)');
      ctx.fillStyle = g; ctx.fillRect(Math.min(gx0, gx1), y0 - 2, Math.abs(gx1 - gx0), h + 4);
    };
    fade(x0 - 1, x0 + w * 0.2); fade(x0 + w + 1, x0 + w * 0.8);
    const gt = ctx.createLinearGradient(0, y0 - 1, 0, y0 + h * 0.06);
    gt.addColorStop(0, 'rgba(3,6,15,1)'); gt.addColorStop(1, 'rgba(3,6,15,0)');
    ctx.fillStyle = gt; ctx.fillRect(x0 - 1, y0 - 1, w + 2, h * 0.06);
    const gb = ctx.createLinearGradient(0, y0 + h * 0.8, 0, y0 + h + 1);
    gb.addColorStop(0, 'rgba(3,6,15,0)'); gb.addColorStop(1, 'rgba(3,6,15,1)');
    ctx.fillStyle = gb; ctx.fillRect(x0, y0 + h * 0.8, w, h * 0.2 + 2);
    ctx.restore();
  };
}
