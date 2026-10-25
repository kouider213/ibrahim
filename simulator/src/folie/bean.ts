import * as THREE from 'three';

// LA GRANDE FOLIE — les « haricots » (style Fall Guys) : corps tout rond, visage clair, petits bras et pieds,
// costumes (couleur, motif, chapeau). Animations molles : dandinement, étirement au saut, écrasement à l'atterrissage,
// plongeon, culbute, danse de victoire.

export type Pattern = 'plain' | 'stripes' | 'dots' | 'half' | 'stars' | 'zigzag';
export type Hat = 'none' | 'cap' | 'crown' | 'bunny' | 'cat' | 'chef' | 'flower' | 'scarf' | 'horns' | 'halo' | 'fez';
export interface Costume { body: string; body2: string; pattern: Pattern; hat: Hat; face: string }
export const COLORS = ['#ff6fa5', '#ffb03a', '#ffe14d', '#7ee081', '#4fd1ff', '#8b8cff', '#c38bff', '#ff7a5c', '#3ddbb2', '#ffffff', '#2d2d3a', '#f5c6a5'];

const texCache = new Map<string, THREE.Texture>();
function bodyTexture(c: Costume) {
  const key = `${c.body}${c.body2}${c.pattern}`; if (texCache.has(key)) return texCache.get(key)!;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d')!;
  g.fillStyle = c.body; g.fillRect(0, 0, 256, 256); g.fillStyle = c.body2;
  if (c.pattern === 'stripes') for (let y = 0; y < 256; y += 48) g.fillRect(0, y, 256, 22);
  if (c.pattern === 'dots') for (let y = 16; y < 256; y += 42) for (let x = (y / 42) % 2 ? 20 : 0; x < 256; x += 42) { g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill(); }
  if (c.pattern === 'half') g.fillRect(0, 140, 256, 116);
  if (c.pattern === 'stars') for (let i = 0; i < 9; i++) { const x = (i * 83) % 256, y = (i * 59) % 256; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 7 : 16, a = k * Math.PI / 5 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); }
  if (c.pattern === 'zigzag') { g.lineWidth = 14; g.strokeStyle = c.body2; for (let y = 30; y < 256; y += 70) { g.beginPath(); for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + ((x / 32) % 2 ? 18 : -18)); g.stroke(); } }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; texCache.set(key, t); return t;
}

export interface Bean { root: THREE.Group; body: THREE.Group; mesh: THREE.Mesh; armL: THREE.Mesh; armR: THREE.Mesh; footL: THREE.Mesh; footR: THREE.Mesh; face: THREE.Group; eyes: THREE.Mesh[]; hat: THREE.Group; phase: number; squash: number; label: THREE.Sprite | null }

export function makeBean(c: Costume, name?: string, labelColor = '#ffffff'): Bean {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const mat = new THREE.MeshPhysicalMaterial({ map: bodyTexture(c), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') });
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.62, 10, 24), mat); mesh.position.y = 0.78; mesh.castShadow = true; body.add(mesh);
  // visage (ovale clair) + yeux + sourire
  const face = new THREE.Group(); face.position.set(0, 1.02, 0.34); body.add(face);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshPhysicalMaterial({ color: c.face, roughness: 0.35, clearcoat: 0.8 })); plate.scale.set(0.95, 0.7, 0.32); face.add(plate);
  const eyes: THREE.Mesh[] = []; const eyeM = new THREE.MeshStandardMaterial({ color: '#1a1424', roughness: 0.2 }); const shineM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), eyeM); e.scale.set(0.8, 1.15, 0.6); e.position.set(s * 0.1, 0.03, 0.1); face.add(e); eyes.push(e); const sh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), shineM); sh.position.set(s * 0.1 + 0.02, 0.08, 0.14); face.add(sh); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 16, Math.PI), eyeM); smile.rotation.z = Math.PI; smile.position.set(0, -0.08, 0.1); face.add(smile);
  for (const s of [-1, 1]) { const blush = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: '#ff8fb0', transparent: true, opacity: 0.6 })); blush.position.set(s * 0.19, -0.04, 0.095); face.add(blush); }
  // bras et pieds
  const limbM = new THREE.MeshPhysicalMaterial({ color: c.body, roughness: 0.45, clearcoat: 0.5 });
  const arm = (s: number) => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 10), limbM); a.geometry.translate(0, -0.13, 0); a.position.set(s * 0.47, 0.88, 0); a.rotation.z = s * 0.5; a.castShadow = true; body.add(a); return a; };
  const foot = (s: number) => { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.12, 4, 10), new THREE.MeshPhysicalMaterial({ color: c.body2 === c.body ? '#ffffff' : c.body2, roughness: 0.4, clearcoat: 0.6 })); f.rotation.x = Math.PI / 2; f.position.set(s * 0.2, 0.1, 0.06); f.castShadow = true; root.add(f); return f; };
  const armL = arm(-1), armR = arm(1), footL = foot(-1), footR = foot(1);
  const hat = new THREE.Group(); hat.position.y = 1.42; body.add(hat); dressHat(hat, c.hat, c.body2);
  let label: THREE.Sprite | null = null;
  if (name) { label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(name, labelColor), depthTest: false, transparent: true })); label.scale.set(1.8, 0.45, 1); label.position.y = 2.25; label.renderOrder = 10; root.add(label); }
  return { root, body, mesh, armL, armR, footL, footR, face, eyes, hat, phase: 0, squash: 0, label };
}
function nameTex(n: string, color: string) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d')!;
  g.font = '900 60px "Titan One", "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = 'rgba(30,20,60,.85)'; g.strokeText(n, 256, 66); g.fillStyle = color; g.fillText(n, 256, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function dressHat(g: THREE.Group, h: Hat, col: string) {
  g.clear(); const M = (c: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.5, ...o });
  const add = (m: THREE.Mesh) => { m.castShadow = true; g.add(m); return m; };
  if (h === 'cap') { const c = add(new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(col))); c.position.y = -0.12; const v = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20, 1, false, 0, Math.PI), M('#ffffff'))); v.position.set(0, -0.1, 0.18); v.rotation.y = Math.PI / 2 - Math.PI / 2; v.rotation.x = 0.1; }
  if (h === 'crown') { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 10, 1, true), M('#ffd23f', { metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide }))); c.position.y = 0; for (let i = 0; i < 6; i++) { const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), M('#ffd23f', { metalness: 0.9, roughness: 0.2 }))); const a = i * Math.PI / 3; sp.position.set(Math.cos(a) * 0.27, 0.18, Math.sin(a) * 0.27); } const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), M('#ff3d6e', { emissive: new THREE.Color('#ff3d6e'), emissiveIntensity: 0.6 }))); gem.position.set(0, 0.02, 0.29); }
  if (h === 'bunny') for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 10), M('#ffffff'))); e.position.set(s * 0.14, 0.2, 0); e.rotation.z = -s * 0.15; const i = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3, 4, 8), M('#ffb3c7'))); i.position.set(s * 0.14, 0.2, 0.05); i.rotation.z = -s * 0.15; }
  if (h === 'cat') for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), M(col))); e.position.set(s * 0.2, 0.0, 0); e.rotation.z = -s * 0.3; }
  if (h === 'chef') { const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 18), M('#ffffff'))); b.position.y = -0.02; for (const [x, z] of [[-0.12, 0], [0.12, 0], [0, 0.1], [0, -0.1], [0, 0]]) { const p = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), M('#ffffff'))); p.position.set(x!, 0.18, z!); } }
  if (h === 'flower') for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; const f = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M(['#ff6fa5', '#ffe14d', '#ffffff', '#c38bff'][i % 4]!))); f.position.set(Math.cos(a) * 0.3, -0.12, Math.sin(a) * 0.3); }
  if (h === 'scarf') { const s = add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16, Math.PI * 0.62, Math.PI * 1.76, 0, Math.PI * 0.62), M(col, { side: THREE.DoubleSide }))); s.position.y = -0.38; s.rotation.y = 0; s.scale.set(1, 1.05, 1); }
  if (h === 'horns') for (const s of [-1, 1]) { const e = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 10), M('#fff3d6'))); e.position.set(s * 0.22, 0.0, 0); e.rotation.z = -s * 0.5; }
  if (h === 'halo') { const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), M('#ffe14d', { emissive: new THREE.Color('#ffd000'), emissiveIntensity: 1.2 }))); r.rotation.x = Math.PI / 2; r.position.y = 0.25; }
  if (h === 'fez') { const f = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.28, 18), M('#c81d25'))); f.position.y = 0.02; const tas = add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), M('#111'))); tas.position.set(0.1, 0.05, 0.12); tas.rotation.z = 0.4; }
}

export type BeanPose = 'idle' | 'run' | 'air' | 'dive' | 'tumble' | 'dance' | 'sad' | 'grab';
/** Animation molle. vy = vitesse verticale (étirement), speed = vitesse au sol. */
export function animateBean(b: Bean, pose: BeanPose, dt: number, speed: number, vy: number, t: number) {
  const k = Math.min(1, dt * 12), L = (a: number, c: number) => a + (c - a) * k;
  b.phase += dt * (pose === 'run' ? 6 + speed * 1.1 : pose === 'dance' ? 9 : 2.5);
  const s = Math.sin(b.phase);
  b.squash = Math.max(0, b.squash - dt * 4);
  let sy = 1, sx = 1, tiltX = 0, tiltZ = 0, bob = 0;
  if (pose === 'run') { tiltZ = s * 0.16; tiltX = 0.18; bob = Math.abs(s) * 0.09; b.footL.position.z = 0.06 + Math.sin(b.phase) * 0.22; b.footR.position.z = 0.06 - Math.sin(b.phase) * 0.22; b.footL.position.y = 0.1 + Math.max(0, Math.sin(b.phase)) * 0.12; b.footR.position.y = 0.1 + Math.max(0, -Math.sin(b.phase)) * 0.12; b.armL.rotation.x = L(b.armL.rotation.x, s * 0.9); b.armR.rotation.x = L(b.armR.rotation.x, -s * 0.9); b.armL.rotation.z = L(b.armL.rotation.z, -0.5); b.armR.rotation.z = L(b.armR.rotation.z, 0.5); }
  else if (pose === 'air') { const st = Math.max(-0.25, Math.min(0.25, vy * 0.03)); sy = 1 + st; sx = 1 - st * 0.5; b.armL.rotation.z = L(b.armL.rotation.z, -2.4); b.armR.rotation.z = L(b.armR.rotation.z, 2.4); b.armL.rotation.x = L(b.armL.rotation.x, 0); b.armR.rotation.x = L(b.armR.rotation.x, 0); b.footL.position.y = L(b.footL.position.y, 0.0); b.footR.position.y = L(b.footR.position.y, 0.0); }
  else if (pose === 'dive') { tiltX = 1.45; b.armL.rotation.z = L(b.armL.rotation.z, -1.2); b.armR.rotation.z = L(b.armR.rotation.z, 1.2); b.armL.rotation.x = L(b.armL.rotation.x, -1.4); b.armR.rotation.x = L(b.armR.rotation.x, -1.4); }
  else if (pose === 'tumble') { tiltX = t * 9; tiltZ = Math.sin(t * 7) * 0.6; b.armL.rotation.z = -2 + s; b.armR.rotation.z = 2 - s; }
  else if (pose === 'dance') { bob = Math.abs(s) * 0.35; tiltZ = s * 0.25; b.armL.rotation.z = L(b.armL.rotation.z, -2.6 + s * 0.4); b.armR.rotation.z = L(b.armR.rotation.z, 2.6 + s * 0.4); }
  else if (pose === 'sad') { tiltX = 0.35; sy = 0.92; b.armL.rotation.z = L(b.armL.rotation.z, -0.2); b.armR.rotation.z = L(b.armR.rotation.z, 0.2); }
  else if (pose === 'grab') { b.armL.rotation.x = L(b.armL.rotation.x, -1.5); b.armR.rotation.x = L(b.armR.rotation.x, -1.5); tiltX = 0.3; }
  else { bob = Math.sin(t * 2.5) * 0.03; b.armL.rotation.z = L(b.armL.rotation.z, -0.45 + Math.sin(t * 2) * 0.05); b.armR.rotation.z = L(b.armR.rotation.z, 0.45 - Math.sin(t * 2) * 0.05); b.armL.rotation.x = L(b.armL.rotation.x, 0); b.armR.rotation.x = L(b.armR.rotation.x, 0); b.footL.position.set(-0.2, 0.1, 0.06); b.footR.position.set(0.2, 0.1, 0.06); }
  // écrasement à l'atterrissage
  if (b.squash > 0) { sy *= 1 - b.squash * 0.35; sx *= 1 + b.squash * 0.25; }
  b.body.scale.set(L(b.body.scale.x, sx), L(b.body.scale.y, sy), L(b.body.scale.z, sx));
  b.body.position.y = L(b.body.position.y, bob);
  if (pose === 'tumble') { b.body.rotation.x = tiltX; b.body.rotation.z = tiltZ; }
  else { b.body.rotation.x = L(b.body.rotation.x % (Math.PI * 2), tiltX); b.body.rotation.z = L(b.body.rotation.z, tiltZ); }
  // clignement des yeux
  const blink = (t * 0.7 + b.root.id * 0.37) % 4 < 0.12; for (const e of b.eyes) e.scale.y = blink ? 0.15 : 1.15;
}
