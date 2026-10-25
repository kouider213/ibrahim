import * as THREE from 'three';

// Personnages de RUSH : petit humain stylé (articulations hanches / genoux / épaules / coudes) animé à la main
// (course, saut groupé, glissade, roulade, chute) + accessoires : jetpack, hoverboard, baskets à ressort.

export interface Look {
  id: string; name: string; skin: string; top: string; top2: string; pants: string; shoes: string; hair: string;
  style: 'cap' | 'short' | 'ponytail' | 'scarf' | 'buns' | 'helmet' | 'fennec'; price: number; pack?: boolean;
}
export const LOOKS: Look[] = [
  { id: 'kouider', name: 'Kouider', skin: '#d9a07a', top: '#e8333a', top2: '#ffffff', pants: '#26324a', shoes: '#f4f4f4', hair: '#1d1612', style: 'cap', price: 0, pack: true },
  { id: 'fatima', name: 'Fatima', skin: '#e2b08e', top: '#8b5cf6', top2: '#f5d0fe', pants: '#1f2937', shoes: '#ffffff', hair: '#2a1a14', style: 'ponytail', price: 0, pack: true },
  { id: 'fatima2', name: 'Fatima — foulard', skin: '#e2b08e', top: '#0ea5a3', top2: '#fef3c7', pants: '#334155', shoes: '#fda4af', hair: '#e8b4c8', style: 'scarf', price: 0 },
  { id: 'ninja', name: 'Ninja de l\'Atlas', skin: '#d6a27c', top: '#1b1b22', top2: '#ef4444', pants: '#1b1b22', shoes: '#ef4444', hair: '#111', style: 'short', price: 2500 },
  { id: 'star', name: 'Star de la Corniche', skin: '#c98d68', top: '#f59e0b', top2: '#111827', pants: '#0f766e', shoes: '#fde047', hair: '#3b2414', style: 'buns', price: 4000 },
  { id: 'robot', name: 'Robo-213', skin: '#b8c2d1', top: '#3b82f6', top2: '#e0f2fe', pants: '#475569', shoes: '#22d3ee', hair: '#e5e7eb', style: 'helmet', price: 8000 },
  { id: 'fennou', name: 'Fennou', skin: '#f0bf78', top: '#e8424f', top2: '#fff3df', pants: '#f0bf78', shoes: '#fff3df', hair: '#f0bf78', style: 'fennec', price: 12000 },
  { id: 'gold', name: 'Légende Dorée', skin: '#d9a07a', top: '#facc15', top2: '#fff7cc', pants: '#a16207', shoes: '#fde68a', hair: '#1d1612', style: 'cap', price: 25000 },
];

const M = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const limb = (parent: THREE.Object3D, r: number, len: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  m.geometry.translate(0, -len / 2 - r * 0.3, 0); m.castShadow = true; parent.add(m); return m;
};

export interface Hero {
  root: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
  thighL: THREE.Group; thighR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  shL: THREE.Group; shR: THREE.Group; elL: THREE.Group; elR: THREE.Group;
  jet: THREE.Group; board: THREE.Group; springs: THREE.Mesh[]; flame: THREE.Mesh[]; mats: THREE.MeshStandardMaterial[]; phase: number;
}

export function makeHero(look: Look, ghost?: string): Hero {
  const mats: THREE.MeshStandardMaterial[] = [];
  const mk = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = ghost ? M(ghost, { transparent: true, opacity: 0.55, emissive: new THREE.Color(ghost), emissiveIntensity: 0.9, depthWrite: false }) : M(c, o);
    mats.push(m); return m;
  };
  const skin = mk(look.skin, { roughness: 0.5 }), top = mk(look.top), top2 = mk(look.top2), pants = mk(look.pants), shoes = mk(look.shoes, { roughness: 0.4 }), hair = mk(look.hair, { roughness: 0.8 });
  const dark = mk('#1a1410'), white = mk('#ffffff');
  const root = new THREE.Group();
  const hips = pivot(root, 0, 0.95, 0);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), pants); pelvis.scale.set(1.05, 0.7, 0.8); pelvis.castShadow = true; hips.add(pelvis);
  const torso = pivot(hips, 0, 0.08, 0);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.36, 6, 14), top); chest.position.y = 0.34; chest.scale.set(1.08, 1, 0.74); chest.castShadow = true; torso.add(chest);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 20), top2); band.rotation.x = Math.PI / 2; band.position.y = 0.12; band.scale.set(1.08, 0.74, 1); torso.add(band);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), top2); stripe.position.set(0, 0.36, 0.19); torso.add(stripe);
  // sac à dos
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.18), top2); bag.position.set(0, 0.38, -0.24); bag.castShadow = true; torso.add(bag);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 10), skin); neck.position.y = 0.66; torso.add(neck);
  const head = pivot(torso, 0, 0.88, 0.02);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 22, 18), skin); skull.scale.set(0.95, 1.02, 0.98); skull.castShadow = true; head.add(skull);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), white); eye.position.set(s * 0.09, 0.03, 0.21); eye.scale.z = 0.5; head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), dark); pupil.position.set(s * 0.09, 0.03, 0.235); head.add(pupil);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.02), hair); brow.position.set(s * 0.09, 0.1, 0.225); brow.rotation.z = -s * 0.15; head.add(brow);
    if (look.style !== 'fennec' && look.style !== 'helmet') { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin); ear.position.set(s * 0.245, 0, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear); }
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 12, Math.PI), dark); smile.position.set(0, -0.08, 0.225); smile.rotation.z = Math.PI; head.add(smile);
  // coiffures
  if (look.style === 'cap' || look.style === 'short' || look.style === 'ponytail' || look.style === 'buns') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.265, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), hair); h.position.y = 0.02; h.rotation.x = -0.25; head.add(h);
  }
  if (look.style === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.275, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), top); cap.position.y = 0.04; head.add(cap);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18, 1, false, 0, Math.PI), top2); visor.position.set(0, 0.1, -0.2); visor.rotation.set(-0.15, Math.PI, 0); head.add(visor);
  }
  if (look.style === 'ponytail') {
    const tail = new THREE.Group(); tail.position.set(0, 0.12, -0.22); head.add(tail);
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 4, 10), hair); t.position.y = -0.18; t.rotation.x = 0.4; tail.add(t);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), top); tie.rotation.x = Math.PI / 2; tail.add(tie);
    tail.name = 'tail';
  }
  if (look.style === 'buns') for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), hair); b.position.set(s * 0.17, 0.2, -0.05); head.add(b); }
  if (look.style === 'scarf') {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18, Math.PI * 0.2 + Math.PI / 2, Math.PI * 1.6, 0, Math.PI * 0.82), hair); sc.position.y = 0.01; sc.rotation.y = Math.PI; sc.castShadow = true; head.add(sc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.035, 8, 24), hair); rim.position.set(0, 0.0, 0.08); rim.scale.set(0.88, 1.1, 1); head.add(rim);
    const drape = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.42, 20, 1, true), hair); drape.position.set(0, -0.32, -0.02); drape.material.side = THREE.DoubleSide; head.add(drape);
  }
  if (look.style === 'helmet') {
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.29, 22, 16), M(look.hair, { metalness: 0.7, roughness: 0.25 })); head.add(hm); mats.push(hm.material as THREE.MeshStandardMaterial);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 22, 10, -0.9, 1.8, 1.1, 0.7), M('#22d3ee', { emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 1.4 })); visor.rotation.y = Math.PI / 2 - Math.PI / 2; head.add(visor); mats.push(visor.material as THREE.MeshStandardMaterial);
  }
  if (look.style === 'fennec') {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 4), hair); ear.position.set(s * 0.16, 0.32, -0.02); ear.rotation.z = -s * 0.4; ear.scale.z = 0.4; head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), mk('#ffb3b8')); inner.position.set(s * 0.16, 0.3, 0.02); inner.rotation.z = -s * 0.4; inner.scale.z = 0.3; head.add(inner);
    }
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 14), top2); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 0.28); head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark); nose.position.set(0, -0.04, 0.38); head.add(nose);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), hair); tail.scale.set(0.8, 0.8, 2); tail.position.set(0, -0.05, -0.36); hips.add(tail);
  }
  // bras
  const shL = pivot(torso, -0.33, 0.56, 0), shR = pivot(torso, 0.33, 0.56, 0);
  const elL = pivot(shL, 0, -0.3, 0), elR = pivot(shR, 0, -0.3, 0);
  limb(shL, 0.075, 0.2, top); limb(shR, 0.075, 0.2, top); limb(elL, 0.065, 0.18, skin); limb(elR, 0.065, 0.18, skin);
  for (const e of [elL, elR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin); h.position.y = -0.32; e.add(h); }
  // jambes
  const thighL = pivot(hips, -0.13, -0.06, 0), thighR = pivot(hips, 0.13, -0.06, 0);
  const kneeL = pivot(thighL, 0, -0.4, 0), kneeR = pivot(thighR, 0, -0.4, 0);
  limb(thighL, 0.095, 0.26, pants); limb(thighR, 0.095, 0.26, pants); limb(kneeL, 0.08, 0.25, pants); limb(kneeR, 0.08, 0.25, pants);
  for (const k of [kneeL, kneeR]) {
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.14, 4, 10), shoes); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -0.44, 0.06); shoe.castShadow = true; k.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.3), white); sole.position.set(0, -0.51, 0.06); k.add(sole);
  }
  // Jetpack (caché) + flammes
  const jet = new THREE.Group(); jet.position.set(0, 0.4, -0.3); torso.add(jet); jet.visible = false;
  const flame: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 12), M('#cbd5e1', { metalness: 0.8, roughness: 0.25 })); tank.position.x = s * 0.12; jet.add(tank);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 12), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.rotation.x = Math.PI; f.position.set(s * 0.12, -0.45, 0); jet.add(f); flame.push(f);
  }
  // Hoverboard (caché)
  const board = new THREE.Group(); board.position.y = 0.02; root.add(board); board.visible = false;
  const deck = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 16), M('#22d3ee', { emissive: new THREE.Color('#0891b2'), emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }));
  deck.rotation.x = Math.PI / 2; deck.scale.set(1, 1, 0.16); board.add(deck);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.8), new THREE.MeshBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -0.08; board.add(glow);
  // Baskets à ressort (cachées)
  const springs: THREE.Mesh[] = [];
  for (const k of [kneeL, kneeR]) { const sp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 14), M('#a3e635', { emissive: new THREE.Color('#65a30d'), emissiveIntensity: 1.5 })); sp.rotation.x = Math.PI / 2; sp.position.set(0, -0.57, 0.06); sp.visible = false; k.add(sp); springs.push(sp); }
  if (ghost) root.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).renderOrder = 2; } });
  return { root, hips, torso, head, thighL, thighR, kneeL, kneeR, shL, shR, elL, elR, jet, board, springs, flame, mats, phase: 0 };
}

export type Pose = 'run' | 'jump' | 'slide' | 'fly' | 'board' | 'fall' | 'idle' | 'dance';
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Anime le personnage. `blend` adoucit le passage d'une pose à l'autre. */
export function animateHero(h: Hero, pose: Pose, dt: number, speed: number, t: number, extra: { vy?: number; tilt?: number; springs?: boolean } = {}) {
  const k = Math.min(1, dt * 14);
  const set = (g: THREE.Group, x: number, z = 0) => { g.rotation.x = lerp(g.rotation.x, x, k); g.rotation.z = lerp(g.rotation.z, z, k); };
  h.phase += dt * (pose === 'idle' ? 2 : pose === 'dance' ? 7 : 4 + speed * 0.42);
  const p = h.phase, s = Math.sin(p), c = Math.cos(p);
  let hipsY = 0.95, torsoX = 0.18, hipsX = 0;
  if (pose === 'run' || pose === 'board') {
    const amp = pose === 'board' ? 0.15 : 1;
    set(h.thighL, -s * 0.95 * amp); set(h.thighR, s * 0.95 * amp);
    set(h.kneeL, Math.max(0, c) * 1.5 * amp + (pose === 'board' ? 0.5 : 0.15)); set(h.kneeR, Math.max(0, -c) * 1.5 * amp + (pose === 'board' ? 0.5 : 0.15));
    set(h.shL, s * 0.9 * amp, -0.12); set(h.shR, -s * 0.9 * amp, 0.12);
    set(h.elL, -1.1 - Math.max(0, s) * 0.4); set(h.elR, -1.1 - Math.max(0, -s) * 0.4);
    hipsY = 0.95 + Math.abs(s) * 0.07 * amp - (pose === 'board' ? 0.12 : 0); torsoX = pose === 'board' ? 0.1 : 0.22;
  } else if (pose === 'jump') {
    const up = (extra.vy ?? 0) > 0;
    set(h.thighL, up ? -1.2 : -0.5); set(h.thighR, up ? -0.4 : -0.9); set(h.kneeL, up ? 1.7 : 0.6); set(h.kneeR, up ? 0.9 : 1.2);
    set(h.shL, -2.6, -0.5); set(h.shR, -2.4, 0.5); set(h.elL, -0.4); set(h.elR, -0.4); torsoX = up ? 0.35 : 0.1; hipsY = 1.0;
  } else if (pose === 'slide') {
    set(h.thighL, -1.45); set(h.thighR, -1.25); set(h.kneeL, 0.25); set(h.kneeR, 0.55); set(h.shL, -0.6, -0.8); set(h.shR, 0.4, 0.9); set(h.elL, -0.6); set(h.elR, -0.3);
    torsoX = -1.05; hipsY = 0.38; hipsX = 0;
  } else if (pose === 'fly') {
    set(h.thighL, 0.2 + s * 0.1); set(h.thighR, 0.1 - s * 0.1); set(h.kneeL, 0.6); set(h.kneeR, 0.8); set(h.shL, -0.3, -1.2); set(h.shR, -0.3, 1.2); set(h.elL, -0.3); set(h.elR, -0.3);
    torsoX = 0.9; hipsY = 1.0;
  } else if (pose === 'fall') {
    set(h.thighL, -1.6); set(h.thighR, -1.1); set(h.kneeL, 0.2); set(h.kneeR, 0.5); set(h.shL, -2.8, -0.9); set(h.shR, -2.6, 0.9); set(h.elL, 0); set(h.elR, 0);
    torsoX = -1.3; hipsY = 0.3;
  } else if (pose === 'dance') {
    set(h.thighL, s * 0.3); set(h.thighR, -s * 0.3); set(h.kneeL, 0.3 + Math.max(0, s) * 0.6); set(h.kneeR, 0.3 + Math.max(0, -s) * 0.6);
    set(h.shL, -2.4 + s * 0.4, -0.5); set(h.shR, -2.4 - s * 0.4, 0.5); set(h.elL, -0.5); set(h.elR, -0.5); hipsY = 0.9 + Math.abs(s) * 0.12; torsoX = 0.05;
  } else {
    set(h.thighL, 0); set(h.thighR, 0); set(h.kneeL, 0.05); set(h.kneeR, 0.05); set(h.shL, Math.sin(t * 1.5) * 0.06, -0.15); set(h.shR, -Math.sin(t * 1.5) * 0.06, 0.15); set(h.elL, -0.25); set(h.elR, -0.25);
    hipsY = 0.95 + Math.sin(t * 2) * 0.012; torsoX = 0.02;
  }
  h.hips.position.y = lerp(h.hips.position.y, hipsY, k);
  h.hips.rotation.x = lerp(h.hips.rotation.x, hipsX, k);
  h.torso.rotation.x = lerp(h.torso.rotation.x, torsoX, k);
  h.head.rotation.x = lerp(h.head.rotation.x, -torsoX * 0.6, k);
  h.root.rotation.z = lerp(h.root.rotation.z, extra.tilt ?? 0, Math.min(1, dt * 10));
  const tail = h.head.getObjectByName('tail'); if (tail) tail.rotation.x = 0.3 + Math.sin(p * 2) * 0.25;
  h.flame.forEach((f, i) => { f.scale.set(1, 0.8 + Math.random() * 0.6 + i * 0.05, 1); });
  h.board.rotation.z = Math.sin(t * 3) * 0.05;
  h.springs.forEach(sp => { sp.visible = !!extra.springs; });
}
