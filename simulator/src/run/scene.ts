import * as THREE from 'three';
import type { World, OutfitId } from './data.ts';

// Fennou en 3D (petit fennec, l'animal national de l'Algérie) + décors des mondes. Tout est fait de formes simples,
// couleurs douces, pas de lumière qui flashe : pensé pour un tout-petit.

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });

export interface Fennec { root: THREE.Group; body: THREE.Group; legs: THREE.Mesh[]; tail: THREE.Group; ears: THREE.Mesh[]; head: THREE.Group; outfit: THREE.Group; eyes: THREE.Mesh[] }

export function makeFennec(): Fennec {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = mat('#f0bf78'), cream = mat('#fff3df'), dark = mat('#3a2a22'), pink = mat('#ffb3b8'), white = mat('#ffffff');
  // Corps
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), fur);
  torso.scale.set(0.95, 0.8, 1.25); torso.position.y = 0.75; torso.castShadow = true; body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), cream);
  belly.scale.set(0.85, 0.7, 1.05); belly.position.set(0, 0.62, 0.12); body.add(belly);
  // Tête
  const head = new THREE.Group(); head.position.set(0, 1.35, 0.45); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), fur); skull.castShadow = true; head.add(skull);
  const cheeks = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), cream); cheeks.scale.set(1.15, 0.8, 0.9); cheeks.position.set(0, -0.12, 0.2); head.add(cheeks);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 18), cream); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.08, 0.5); head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), dark); nose.position.set(0, -0.06, 0.72); head.add(nose);
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.17, 0.17]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), white); w.position.set(x, 0.07, 0.36); head.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 12), dark); p.position.set(x, 0.07, 0.43); head.add(p); eyes.push(p);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), white); sh.position.set(x + 0.02, 0.1, 0.49); head.add(sh);
  }
  // Les GRANDES oreilles du fennec
  const ears: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 4, 1), fur);
    ear.scale.set(1, 1, 0.35); ear.position.set(s * 0.3, 0.55, -0.05); ear.rotation.z = -s * 0.42; ear.castShadow = true;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.62, 4, 1), pink); inner.scale.set(1, 1, 0.3); inner.position.set(0, -0.04, 0.06);
    ear.add(inner); head.add(ear); ears.push(ear);
  }
  // Pattes
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.25, 0.35], [0.25, 0.35], [-0.25, -0.35], [0.25, -0.35]] as const) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 10), fur);
    leg.geometry.translate(0, -0.25, 0); leg.position.set(x, 0.55, z); leg.castShadow = true;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), cream); paw.position.y = -0.48; leg.add(paw);
    body.add(leg); legs.push(leg);
  }
  // Queue touffue au bout sombre
  const tail = new THREE.Group(); tail.position.set(0, 0.85, -0.65); body.add(tail);
  const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), fur); t1.scale.set(0.9, 0.9, 1.8); t1.position.set(0, 0.15, -0.3); tail.add(t1);
  const t2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), dark); t2.position.set(0, 0.28, -0.68); tail.add(t2);
  tail.rotation.x = -0.6;
  const outfit = new THREE.Group(); body.add(outfit);
  root.scale.setScalar(0.95);
  return { root, body, legs, tail, ears, head, outfit, eyes };
}

export function dressFennec(f: Fennec, id: OutfitId) {
  f.outfit.clear();
  const add = (m: THREE.Object3D, parent: THREE.Object3D = f.outfit) => { parent.add(m); return m; };
  if (id === 'scarf' || id === 'cape' || id === 'crown') {
    const sc = add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.09, 10, 24), mat('#e8424f')));
    sc.position.set(0, 1.08, 0.32); sc.rotation.x = Math.PI / 2.4;
  }
  if (id === 'hat') {
    const hat = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 18), mat('#7b5cf0')), f.head); hat.position.set(0.05, 0.55, 0.05); hat.rotation.z = -0.15;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat('#ffd23f')); pom.position.y = 0.28; hat.add(pom);
  }
  if (id === 'glasses' || id === 'space') {
    for (const x of [-0.17, 0.17]) { const g = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 18), mat('#111', { roughness: 0.2 })), f.head); g.rotation.x = Math.PI / 2; g.position.set(x, 0.07, 0.47); }
  }
  if (id === 'cape') {
    const c = add(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1, 1, 6), mat('#e8424f', { side: THREE.DoubleSide })));
    c.position.set(0, 0.9, -0.4); c.rotation.x = 0.9;
  }
  if (id === 'crown') {
    const cr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 8, 1, true), mat('#ffcc33', { metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide })), f.head);
    cr.position.set(0, 0.45, 0);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), mat('#ffcc33', { metalness: 0.5 })); const a = (i / 6) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.2, 0.13, Math.sin(a) * 0.2); cr.add(sp); }
  }
  if (id === 'space') {
    const h = add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 18), new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.28, roughness: 0.05 })), f.head);
    h.position.set(0, 0.12, 0.05);
  }
}

/** Animation de course (t en secondes, speed 0-1, jump 0-1). */
export function animateFennec(f: Fennec, t: number, speed: number, jump: number, happy: number) {
  const k = t * (8 + speed * 6);
  f.legs.forEach((l, i) => { l.rotation.x = Math.sin(k + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 * speed; });
  f.body.position.y = Math.abs(Math.sin(k)) * 0.08 * speed + jump * 1.6;
  f.body.rotation.x = -jump * 0.25;
  f.tail.rotation.y = Math.sin(k * 0.5) * 0.4 + Math.sin(t * 12) * happy * 0.5;
  f.ears.forEach((e, i) => { e.rotation.x = Math.sin(k + i) * 0.08 * speed - jump * 0.3; });
  f.head.rotation.z = Math.sin(t * 9) * happy * 0.15;
}

// ── Textures ──────────────────────────────────────────────────────────────────
const texCache = new Map<string, THREE.Texture>();
export function emojiTexture(e: string): THREE.Texture {
  const hit = texCache.get(e); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.font = '200px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(e, 128, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(e, t); return t;
}
export function photoTexture(src: string): THREE.Texture {
  const hit = texCache.get(src); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d')!; g.save(); g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.clip();
    const s = Math.max(256 / img.width, 256 / img.height); g.drawImage(img, 128 - img.width * s / 2, 128 - img.height * s / 2, img.width * s, img.height * s);
    g.restore(); g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke(); t.needsUpdate = true;
  };
  img.src = src;
  texCache.set(src, t); return t;
}
export function makeSprite(tex: THREE.Texture, size = 1.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(size); return s;
}

export function skyTexture(top: string, bottom: string, stars = false): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (stars) { /* les étoiles sont des points 3D, voir buildWorld */ }
  return t;
}

export function pathTexture(ground: string, path: string): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = ground; g.fillRect(0, 0, 256, 256);
  g.fillStyle = path; g.fillRect(40, 0, 176, 256);
  // petites taches pour sentir la vitesse
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.04})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const x of [98, 158]) for (let y = 0; y < 256; y += 64) g.fillRect(x - 2, y, 4, 34);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ── Décors ────────────────────────────────────────────────────────────────────
export function makeDecor(kind: World['decor'][number], w: World): THREE.Object3D {
  const g = new THREE.Group();
  const r = Math.random;
  switch (kind) {
    case 'palm': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3, 8), mat('#a0703f')); trunk.position.y = 1.5; trunk.rotation.z = (r() - 0.5) * 0.3; g.add(trunk);
      for (let i = 0; i < 6; i++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 4), mat('#3fae5a')); leaf.scale.z = 0.25; leaf.position.set(0, 3, 0); leaf.rotation.set(1.1, (i / 6) * Math.PI * 2, 0); leaf.translateY(0.8); g.add(leaf); }
      for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#8a4b1e')); d.position.set(Math.cos(i * 2) * 0.2, 2.85, Math.sin(i * 2) * 0.2); g.add(d); }
      break;
    }
    case 'cactus': {
      const m = mat('#4caf50');
      const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.4, 6, 12), m); c.position.y = 1; g.add(c);
      for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 6, 10), m); a.position.set(s * 0.45, 1.1 + r() * 0.4, 0); g.add(a); }
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#ff6f91')); fl.position.y = 1.95; g.add(fl);
      break;
    }
    case 'dune': { const d = new THREE.Mesh(new THREE.SphereGeometry(3 + r() * 3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(w.ground)); d.scale.y = 0.35; g.add(d); break; }
    case 'rock': { const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + r() * 0.6, 0), mat(w.id === 'etoiles' ? '#6a5acd' : '#a89a8a')); k.position.y = 0.3; k.rotation.set(r(), r(), r()); g.add(k); break; }
    case 'flower': {
      const cols = ['#ff6f91', '#ffd23f', '#7b5cf0', '#ff9a3c', '#ffffff'];
      for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), mat('#3fae5a')); const x = (r() - 0.5) * 1.2, z = (r() - 0.5) * 1.2; st.position.set(x, 0.25, z); g.add(st);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(cols[i % cols.length]!)); fl.position.set(x, 0.52, z); g.add(fl); }
      break;
    }
    case 'pine': for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1 - i * 0.25, 1.3, 10), mat('#2e8b57')); c.position.y = 1 + i * 0.75; g.add(c); } { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8), mat('#7a5230')); t.position.y = 0.3; g.add(t); } break;
    case 'tree': { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 8), mat('#7a5230')); t.position.y = 0.7; g.add(t);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat('#5cb85c')); top.position.y = 2; g.add(top);
      for (let i = 0; i < 4; i++) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('#e53935')); a.position.set(Math.cos(i * 1.7) * 0.8, 1.8 + r() * 0.5, Math.sin(i * 1.7) * 0.8); g.add(a); }
      break; }
    case 'mushroom': { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.7, 10), mat('#fff3df')); s.position.y = 0.35; g.add(s);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(w.id === 'etoiles' ? '#ff6fd8' : '#e53935', { emissive: w.id === 'etoiles' ? '#7a1f6a' : '#000000' })); cap.position.y = 0.65; g.add(cap); break; }
    case 'house': {
      const cols = ['#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6'];
      const hgt = 1.6 + r() * 2.4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, hgt, 2), mat(cols[Math.floor(r() * cols.length)]!)); b.position.y = hgt / 2; g.add(b);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1, 4), mat('#d95d39')); roof.position.y = hgt + 0.5; roof.rotation.y = Math.PI / 4; g.add(roof);
      for (let i = 0; i < 2; i++) { const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), mat('#5aa9e6', { emissive: '#1d4e89' })); win.position.set(-0.45 + i * 0.9, hgt * 0.6, 1.01); g.add(win); }
      break;
    }
    case 'lamp': { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3, 8), mat('#444')); p.position.y = 1.5; g.add(p);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#fff6b0', { emissive: '#ffe066', emissiveIntensity: 0.8 })); l.position.y = 3.1; g.add(l); break; }
    case 'water': { const wa = new THREE.Mesh(new THREE.CircleGeometry(1.6 + r(), 24), mat('#4fc3f7', { roughness: 0.15, metalness: 0.1 })); wa.rotation.x = -Math.PI / 2; wa.position.y = 0.03; g.add(wa); break; }
    case 'boat': { const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.6), mat('#ffffff')); hull.position.y = 0.3; g.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), mat('#7a5230')); mast.position.y = 1.2; g.add(mast);
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), mat('#ff6f61')); sail.scale.z = 0.1; sail.position.set(0.25, 1.3, 0); g.add(sail); break; }
    case 'planet': { const cols = ['#ff9a3c', '#7bdff2', '#f15bb5', '#fee440', '#9b5de5'];
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.8 + r() * 1.2, 20, 16), mat(cols[Math.floor(r() * cols.length)]!, { emissive: '#221144' })); p.position.y = 3 + r() * 3; g.add(p);
      if (r() > 0.5) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.08, 6, 40), mat('#ffffff', { emissive: '#8888ff' })); ring.position.copy(p.position); ring.rotation.x = 1.2; g.add(ring); }
      break; }
    case 'crystal': { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + r() * 0.4, 0), mat('#9bf6ff', { emissive: '#3a86ff', emissiveIntensity: 0.6, roughness: 0.2 })); c.position.y = 0.6; c.scale.y = 1.8; g.add(c); break; }
  }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
  return g;
}

/** Arche de forme (missions « passe par le rond ») */
export function makeArch(color: string): THREE.Mesh {
  return new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 10, 32, Math.PI), mat(color, { emissive: color, emissiveIntensity: 0.25 }));
}

export function confetti(scene: THREE.Scene, origin: THREE.Vector3, n = 60): Array<{ m: THREE.Mesh; v: THREE.Vector3; life: number }> {
  const cols = ['#ff6f91', '#ffd23f', '#7b5cf0', '#4fc3f7', '#5cb85c', '#ff9a3c'];
  const out: Array<{ m: THREE.Mesh; v: THREE.Vector3; life: number }> = [];
  const geo = new THREE.PlaneGeometry(0.14, 0.22);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
    m.position.copy(origin); scene.add(m);
    out.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 4), life: 1.6 + Math.random() });
  }
  return out;
}
