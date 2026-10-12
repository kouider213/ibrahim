import { useEffect, useRef } from 'react';

export type OrbPhase = 'idle' | 'listening' | 'thinking' | 'speaking';

// Paramètres par état : rayon relatif, vitesse de rotation, agitation, liens entre particules
const PHASE_PARAMS: Record<OrbPhase, { radius: number; spin: number; jitter: number; links: number; rgb: [number, number, number] }> = {
  idle:      { radius: 0.70, spin: 0.15, jitter: 0.02, links: 0.00, rgb: [6, 182, 212] },
  listening: { radius: 0.62, spin: 0.30, jitter: 0.04, links: 0.35, rgb: [16, 185, 129] },
  thinking:  { radius: 0.58, spin: 0.90, jitter: 0.03, links: 0.80, rgb: [139, 92, 246] },
  speaking:  { radius: 0.74, spin: 0.45, jitter: 0.10, links: 0.50, rgb: [245, 158, 11] },
};

const COUNT = 420;
const LINK_DIST = 0.22;

interface Props {
  phase: OrbPhase;
  /** Volume 0..1 de la voix. Si absent en phase "speaking", une pulsation est simulée. */
  volume?: number;
  size?: number;
}

/** Sphère de particules (répartition de Fibonacci) projetée en 2D, animée selon la phase. */
export default function ParticleOrb({ phase, volume, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef  = useRef(phase);
  const volumeRef = useRef(volume);
  phaseRef.current  = phase;
  volumeRef.current = volume;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Points de base sur une sphère unité + graine aléatoire par point
    const golden = Math.PI * (3 - Math.sqrt(5));
    const base = Array.from({ length: COUNT }, (_, i) => {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      return { x: Math.cos(t) * r, y, z: Math.sin(t) * r, seed: Math.random() * Math.PI * 2 };
    });

    // Valeurs lissées pour des transitions douces entre phases
    const cur = { radius: 0.7, spin: 0.15, jitter: 0.02, links: 0, r: 6, g: 182, b: 212, vol: 0 };
    let angle = 0;
    let last = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = PHASE_PARAMS[phaseRef.current];
      const k = 1 - Math.exp(-dt * 4);

      cur.radius += (p.radius - cur.radius) * k;
      cur.spin   += (p.spin   - cur.spin)   * k;
      cur.jitter += (p.jitter - cur.jitter) * k;
      cur.links  += (p.links  - cur.links)  * k;
      cur.r += (p.rgb[0] - cur.r) * k;
      cur.g += (p.rgb[1] - cur.g) * k;
      cur.b += (p.rgb[2] - cur.b) * k;

      let targetVol = 0;
      if (phaseRef.current === 'speaking') {
        targetVol = volumeRef.current ?? 0.45 + 0.3 * Math.sin(now / 90) * Math.sin(now / 230);
      } else if (volumeRef.current !== undefined) {
        targetVol = volumeRef.current;
      }
      cur.vol += (targetVol - cur.vol) * (1 - Math.exp(-dt * 12));

      if (!reduceMotion) angle += cur.spin * dt;
      const time = now / 1000;
      const half = size / 2;
      const scale = half * (cur.radius + cur.vol * 0.12);
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const tilt = 0.35, cosT = Math.cos(tilt), sinT = Math.sin(tilt);

      // Rotation Y puis inclinaison X, plus une onde radiale pour l'agitation
      const pts = base.map(b => {
        const wobble = reduceMotion ? 0 : Math.sin(time * 3 + b.seed) * cur.jitter * (1 + cur.vol * 2);
        const s = 1 + wobble;
        const x1 = (b.x * cosA - b.z * sinA) * s;
        const z1 = (b.x * sinA + b.z * cosA) * s;
        const y1 = b.y * s;
        const y2 = y1 * cosT - z1 * sinT;
        const z2 = y1 * sinT + z1 * cosT;
        return { x: x1, y: y2, z: z2 };
      });

      ctx.clearRect(0, 0, size, size);
      const rgb = `${cur.r | 0},${cur.g | 0},${cur.b | 0}`;

      // Halo central
      const glow = ctx.createRadialGradient(half, half, 0, half, half, scale * 1.1);
      glow.addColorStop(0, `rgba(${rgb},${0.18 + cur.vol * 0.25})`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // Liens entre particules proches (face avant uniquement, pour limiter le coût)
      if (cur.links > 0.02) {
        ctx.lineWidth = 0.6;
        const front = pts.filter(q => q.z > 0.1);
        for (let i = 0; i < front.length; i += 2) {
          const a = front[i];
          for (let j = i + 2; j < front.length; j += 3) {
            const c = front[j];
            const dx = a.x - c.x, dy = a.y - c.y, dz = a.z - c.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < LINK_DIST * LINK_DIST) {
              const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * cur.links * 0.35;
              ctx.strokeStyle = `rgba(${rgb},${alpha})`;
              ctx.beginPath();
              ctx.moveTo(half + a.x * scale, half + a.y * scale);
              ctx.lineTo(half + c.x * scale, half + c.y * scale);
              ctx.stroke();
            }
          }
        }
      }

      // Particules : taille et opacité selon la profondeur
      for (const q of pts) {
        const depth = (q.z + 1) / 2;
        ctx.fillStyle = `rgba(${rgb},${0.15 + depth * 0.85})`;
        ctx.beginPath();
        ctx.arc(half + q.x * scale, half + q.y * scale, 0.5 + depth * 1.4 + cur.vol * depth, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      aria-label={`Dzaryx — ${phase}`}
      role="img"
    />
  );
}
