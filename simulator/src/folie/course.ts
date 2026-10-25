import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Rng } from '../games/net.ts';

// LA GRANDE FOLIE — les manches. Chaque élément du décor a un corps physique (Rapier) + un joli objet 3D.
// Course folle (6 obstacles tirés au sort), Tuiles fondantes (3 étages qui s'effondrent), Saute-Barre (finale).

export type RoundKind = 'race' | 'tiles' | 'jump';
export interface Mover { body: RAPIER.RigidBody; mesh: THREE.Object3D; update: (t: number) => void }
export interface Tile { body: RAPIER.RigidBody; col: RAPIER.Collider; mesh: THREE.Mesh; state: 0 | 1 | 2; t: number }
export interface Door { body: RAPIER.RigidBody; col: RAPIER.Collider; mesh: THREE.Mesh; real: boolean; open: number }
export interface Round {
  kind: RoundKind; spawn: Array<{ x: number; y: number; z: number }>; finishZ: number; killY: number; checkpoints: number[]; movers: Mover[];
  tiles: Tile[]; doors: Door[]; balls: Array<{ body: RAPIER.RigidBody; mesh: THREE.Mesh; home: THREE.Vector3 }>; bars: Array<{ body: RAPIER.RigidBody; mesh: THREE.Object3D; h: number; angle: number }>;
  jumpHints: Array<{ z0: number; z1: number }>; group: THREE.Group; slime: THREE.Mesh; width: number; name: string; nameAr: string; goal: string; goalAr: string;
}

const PAL = ['#ff6fa5', '#ffb03a', '#ffe14d', '#7ee081', '#4fd1ff', '#8b8cff', '#c38bff', '#ff7a5c', '#3ddbb2'];
const stripeCache = new Map<string, THREE.Texture>();
function stripes(a: string, b: string) { const k = a + b; if (stripeCache.has(k)) return stripeCache.get(k)!; const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d')!; g.fillStyle = a; g.fillRect(0, 0, 128, 128); g.fillStyle = b; for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; stripeCache.set(k, t); return t; }
const mat = (c: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.3, ...o });

export class Builder {
  constructor(public world: RAPIER.World, public group: THREE.Group, public R: Rng) {}
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, o: { kin?: boolean; stripe?: string; rot?: THREE.Euler; friction?: number; radius?: number } = {}) {
    const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(o.radius ?? 0.25, Math.min(w, h, d) / 2.1));
    const m = new THREE.Mesh(geo, o.stripe ? mat('#ffffff', { map: (() => { const t = stripes(color, o.stripe!).clone(); t.needsUpdate = true; t.repeat.set(w / 2, d / 2); return t; })() }) : mat(color));
    m.position.set(x, y, z); if (o.rot) m.rotation.copy(o.rot); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
    const bd = o.kin ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed(); bd.setTranslation(x, y, z);
    if (o.rot) { const q = new THREE.Quaternion().setFromEuler(o.rot); bd.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); }
    const body = this.world.createRigidBody(bd); const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(o.friction ?? 0.8), body);
    return { mesh: m, body, col };
  }
  cyl(x: number, y: number, z: number, r: number, h: number, color: string, o: { kin?: boolean; seg?: number; stripe?: string } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, o.seg ?? 40), o.stripe ? mat('#ffffff', { map: stripes(color, o.stripe) }) : mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.group.add(m);
    const bd = o.kin ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed(); bd.setTranslation(x, y, z);
    const body = this.world.createRigidBody(bd); const col = this.world.createCollider((o.seg ?? 40) <= 8 ? RAPIER.ColliderDesc.convexHull(new Float32Array(m.geometry.attributes.position!.array))! : RAPIER.ColliderDesc.cylinder(h / 2, r).setFriction(0.8), body);
    return { mesh: m, body, col };
  }
}
const q = new THREE.Quaternion(), e = new THREE.Euler();
function kinRotY(body: RAPIER.RigidBody, mesh: THREE.Object3D, a: number) { e.set(0, a, 0); q.setFromEuler(e); body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); mesh.quaternion.copy(q); }

function slimePlane(group: THREE.Group, y: number, size: number, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 60, 60), new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } }, fog: false,
    vertexShader: 'uniform float t; varying vec2 vU; varying float vH; void main(){ vU = uv; vec3 p = position; float h = sin(p.x*0.35+t*1.6)*0.25 + cos(p.y*0.3+t*1.2)*0.25; p.z += h; vH = h; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: 'uniform float t; varying vec2 vU; varying float vH; void main(){ vec3 a = vec3(0.98,0.42,0.75), b = vec3(0.62,0.28,0.95); vec3 c = mix(b, a, 0.5 + vH); float s = smoothstep(0.42,0.5, fract(vU.x*28.0 + vU.y*22.0 + t*0.15)); c += 0.07*s; gl_FragColor = vec4(c, 1.0); }',
  }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, y, z); group.add(m); return m;
}

// ── Course folle ─────────────────────────────────────────────────────────────
type Seg = (b: Builder, z: number, r: Round) => number;   // renvoie la longueur (vers -z)
const W = 13;
const SEGS: Record<string, Seg> = {
  sweepers: (b, z, r) => {
    const L = 24; b.box(0, -0.5, z - L / 2, W, 1, L, '#8b8cff', { stripe: '#a5a6ff' });
    for (const [k, dz] of [[0, 7], [1, 17]] as const) {
      const cz = z - dz; b.cyl(0, 0.6, cz, 0.7, 1.4, '#ffe14d');
      const bar = b.box(0, 0.55, cz, 12, 0.5, 0.5, '#ff6fa5', { kin: true, stripe: '#ffffff', radius: 0.24 });
      const spd = (k ? -1 : 1) * (1.4 + b.R() * 0.6);
      r.movers.push({ body: bar.body, mesh: bar.mesh, update: t => kinRotY(bar.body, bar.mesh, t * spd) });
      r.jumpHints.push({ z0: cz + 2.5, z1: cz - 2.5 });
    }
    return L;
  },
  doors: (b, z, r) => {
    const L = 26; b.box(0, -0.5, z - L / 2, W, 1, L, '#ffb03a', { stripe: '#ffc663' });
    for (let row = 0; row < 3; row++) {
      const dz = z - 5 - row * 8; const n = 5, dw = W / n; const realCount = 2 + (row === 2 ? 0 : 1); const reals = new Set<number>(); while (reals.size < realCount) reals.add(Math.floor(b.R() * n));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + dw * (i + 0.5); const real = reals.has(i);
        const d = b.box(x, 1.4, dz, dw - 0.25, 2.8, 0.5, PAL[(i + row * 2) % PAL.length]!, { kin: true, radius: 0.2 });
        r.doors.push({ body: d.body, col: d.col, mesh: d.mesh, real, open: 0 });
      }
      b.box(0, 3.1, dz, W, 0.6, 0.7, '#ffffff', { radius: 0.25 });
    }
    return L;
  },
  gaps: (b, z, r) => {
    const L = 30; b.box(0, -0.5, z - 3, W, 1, 6, '#3ddbb2', { stripe: '#7ff0d2' }); b.box(0, -0.5, z - L + 3, W, 1, 6, '#3ddbb2', { stripe: '#7ff0d2' });
    const lanes = [-4, 0, 4];
    for (let i = 0; i < 4; i++) { const pz = z - 8.5 - i * 4.5; for (const lx of lanes) { if (b.R() < 0.25) continue; const p = b.box(lx, -0.3, pz, 3, 0.6, 3, PAL[(i * 3 + lanes.indexOf(lx)) % PAL.length]!, { kin: true, radius: 0.3 }); const ph = b.R() * 6, amp = 1.2 + b.R(); r.movers.push({ body: p.body, mesh: p.mesh, update: t => { const x = lx + Math.sin(t * 1.3 + ph) * amp; p.body.setNextKinematicTranslation({ x, y: -0.3, z: pz }); p.mesh.position.x = x; } }); } }
    r.jumpHints.push({ z0: z - 5.5, z1: z - L + 6 });
    return L;
  },
  hammers: (b, z, r) => {
    const L = 24; b.box(0, -0.5, z - L / 2, W, 1, L, '#ff7a5c', { stripe: '#ff9c85' });
    for (let i = 0; i < 3; i++) {
      const cz = z - 5 - i * 7; b.box(-W / 2 + 0.4, 3.5, cz, 0.5, 7, 0.5, '#ffffff'); b.box(W / 2 - 0.4, 3.5, cz, 0.5, 7, 0.5, '#ffffff'); b.box(0, 7, cz, W, 0.5, 0.5, '#ffffff');
      const head = b.box(0, 1.2, cz, 3.2, 1.8, 1.8, '#ffe14d', { kin: true, stripe: '#ff6fa5', radius: 0.5 });
      const ph = i * 1.7; const pivotY = 7, len = 5.8;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 10), mat('#c38bff')); b.group.add(arm);
      r.movers.push({ body: head.body, mesh: head.mesh, update: t => { const a = Math.sin(t * 1.6 + ph) * 1.1; const x = Math.sin(a) * len, y = pivotY - Math.cos(a) * len; head.body.setNextKinematicTranslation({ x, y, z: cz }); e.set(0, 0, a); q.setFromEuler(e); head.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); head.mesh.position.set(x, y, cz); head.mesh.quaternion.copy(q); arm.position.set(x / 2, (pivotY + y) / 2, cz); arm.quaternion.copy(q); } });
    }
    return L;
  },
  seesaw: (b, z, r) => {
    const L = 30; b.box(0, -0.5, z - 3, W, 1, 6, '#4fd1ff', { stripe: '#86e2ff' }); b.box(0, -0.5, z - L + 3, W, 1, 6, '#4fd1ff', { stripe: '#86e2ff' });
    for (const [i, sx] of [[0, -3.3], [1, 3.3]] as const) {
      const cz = z - 15; const p = b.box(sx, -0.2, cz, 5.4, 0.6, 17, i ? '#ffe14d' : '#ff6fa5', { kin: true, stripe: '#ffffff', radius: 0.3 }); const ph = i * Math.PI;
      r.movers.push({ body: p.body, mesh: p.mesh, update: t => { const a = Math.sin(t * 0.9 + ph) * 0.18; e.set(a, 0, 0); q.setFromEuler(e); p.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); p.mesh.quaternion.copy(q); } });
      b.cyl(sx, -1.2, cz, 0.6, 2, '#ffffff');
    }
    return L;
  },
  balls: (b, z, r) => {
    const L = 30, rise = 6, ang = Math.atan2(rise, L);
    b.box(0, rise / 2 - 0.6, z - L / 2, W, 1, Math.hypot(L, rise), '#7ee081', { stripe: '#a6f0a8', rot: new THREE.Euler(ang, 0, 0) });
    b.box(-W / 2 - 0.3, rise / 2 + 0.4, z - L / 2, 0.6, 2, Math.hypot(L, rise), '#ffffff', { rot: new THREE.Euler(ang, 0, 0) }); b.box(W / 2 + 0.3, rise / 2 + 0.4, z - L / 2, 0.6, 2, Math.hypot(L, rise), '#ffffff', { rot: new THREE.Euler(ang, 0, 0) });
    b.box(0, rise - 0.5, z - L - 4, W, 1, 8, '#7ee081', { stripe: '#a6f0a8' });
    for (let i = 0; i < 4; i++) {
      const home = new THREE.Vector3(-4 + i * 2.7, rise + 2 + i * 0.5, z - L - 6);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.1, 28, 20), mat(PAL[i * 2]!, { map: stripes(PAL[i * 2]!, '#ffffff') })); m.castShadow = true; b.group.add(m);
      const body = b.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z).setLinearDamping(0.05)); b.world.createCollider(RAPIER.ColliderDesc.ball(1.1).setDensity(0.6).setRestitution(0.3), body);
      r.balls.push({ body, mesh: m, home });
    }
    return L + 8;
  },
  spinners: (b, z, r) => {
    const L = 26; b.box(0, -0.5, z - 2, W, 1, 4, '#c38bff'); b.box(0, -0.5, z - L + 2, W, 1, 4, '#c38bff');
    for (const [i, x, dz] of [[0, -3.2, 9], [1, 3.2, 9], [2, 0, 17]] as const) {
      const d = b.cyl(x, -0.4, z - dz, 3.6, 0.6, i % 2 ? '#ffe14d' : '#ff6fa5', { kin: true, stripe: '#ffffff' }); const spd = (i % 2 ? -1 : 1) * 1.1;
      r.movers.push({ body: d.body, mesh: d.mesh, update: t => kinRotY(d.body, d.mesh, t * spd) });
    }
    r.jumpHints.push({ z0: z - 4.5, z1: z - L + 4 });
    return L;
  },
};

export function buildRound(world: RAPIER.World, scene: THREE.Scene, kind: RoundKind, R: Rng, players: number): Round {
  const group = new THREE.Group(); scene.add(group); const b = new Builder(world, group, R);
  const r: Round = { kind, spawn: [], finishZ: 0, killY: -8, checkpoints: [], movers: [], tiles: [], doors: [], balls: [], bars: [], jumpHints: [], group, slime: null as unknown as THREE.Mesh, width: W, name: '', nameAr: '', goal: '', goalAr: '' };
  if (kind === 'race') {
    r.name = 'La Course Folle'; r.nameAr = 'السباق المجنون'; r.goal = 'Fonce vers l\'arrivée !'; r.goalAr = 'أسرع إلى خط الوصول!';
    b.box(0, -0.5, 4, W, 1, 16, '#ffffff', { stripe: '#ffe1ef' });
    for (let i = 0; i < players; i++) r.spawn.push({ x: -W / 2 + 1.2 + (i % 7) * ((W - 2.4) / 6), y: 1.2, z: 8 - Math.floor(i / 7) * 2.2 });
    const gate = b.box(0, 1.5, -3.5, W, 3, 0.4, '#ff6fa5', { kin: true }); r.movers.push({ body: gate.body, mesh: gate.mesh, update: t => { const y = t < 0 ? 1.5 : -3; gate.body.setNextKinematicTranslation({ x: 0, y, z: -3.5 }); gate.mesh.position.y = y; } });
    const keys = Object.keys(SEGS); const order: string[] = []; const bag = [...keys]; while (order.length < 6) { if (!bag.length) bag.push(...keys); order.push(bag.splice(Math.floor(R() * bag.length), 1)[0]!); }
    let z = -4; r.checkpoints.push(4);
    for (const k of order) { const len = SEGS[k]!(b, z, r); r.checkpoints.push(z - 2); z -= len; b.box(0, -0.5, z - 2, W, 1, 4, '#ffffff', { stripe: '#e8e8ff' }); z -= 4; }
    // arrivée
    b.box(0, -0.5, z - 6, W + 4, 1, 12, '#ffe14d', { stripe: '#fff3a8' }); r.finishZ = z - 2;
    for (const s of [-1, 1]) b.cyl(s * (W / 2 + 1), 3, z - 2, 0.6, 6, '#ff6fa5', { stripe: '#ffffff' });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(W / 2 + 1, 0.6, 16, 48, Math.PI), mat('#ff6fa5', { map: stripes('#ff6fa5', '#ffffff') })); arch.position.set(0, 6, z - 2); arch.castShadow = true; group.add(arch);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 1.6), new THREE.MeshBasicMaterial({ map: textTex('ARRIVÉE', '#ffe14d', '#ff3d8b'), transparent: true, side: THREE.DoubleSide })); banner.position.set(0, 8.3, z - 2); group.add(banner);
    r.slime = slimePlane(group, -6, 400, z / 2); r.killY = -5;
  }
  if (kind === 'tiles') {
    r.name = 'Les Tuiles Fondantes'; r.nameAr = 'البلاط الذائب'; r.goal = 'Ne tombe pas ! Les tuiles disparaissent sous tes pieds'; r.goalAr = 'لا تسقط! البلاط يختفي تحت قدميك';
    const rad = 7, hr = 1.05, layers = 3;
    for (let l = 0; l < layers; l++) {
      const y = -l * 7; const col = ['#4fd1ff', '#ffe14d', '#ff6fa5'][l]!;
      for (let qx = -rad; qx <= rad; qx++) for (let qr = -rad; qr <= rad; qr++) {
        if (Math.abs(qx + qr) > rad) continue;
        const x = hr * 1.5 * qx * 1.02, z = hr * Math.sqrt(3) * (qr + qx / 2) * 1.02;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(hr, hr, 0.5, 6), mat(col)); m.rotation.y = Math.PI / 6; m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m);
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)); const c = world.createCollider(RAPIER.ColliderDesc.cylinder(0.25, hr * 0.92).setFriction(0.9), body);
        r.tiles.push({ body, col: c, mesh: m, state: 0, t: 0 });
      }
    }
    for (let i = 0; i < players; i++) { const a = (i / players) * Math.PI * 2, d = 3 + (i % 3) * 1.5; r.spawn.push({ x: Math.cos(a) * d, y: 1.5, z: Math.sin(a) * d }); }
    r.slime = slimePlane(group, -22, 300); r.killY = -20;
  }
  if (kind === 'jump') {
    r.name = 'Le Saute-Barre'; r.nameAr = 'القفز فوق العارضة'; r.goal = 'Saute la barre du bas, plonge sous celle du haut. Le dernier debout gagne la couronne !'; r.goalAr = 'اقفز فوق العارضة السفلى وانخفض تحت العليا. آخر من يبقى يفوز بالتاج!';
    b.cyl(0, -0.5, 0, 10, 1, '#8b8cff', { stripe: '#a5a6ff', seg: 64 });
    b.cyl(0, 0.9, 0, 1.0, 2.8, '#ffe14d');
    for (const [h, col, len] of [[0.55, '#ff6fa5', 10], [2.05, '#4fd1ff', 10]] as const) {
      const bar = new THREE.Group(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, len - 0.6, 6, 16), mat(col, { map: stripes(col, '#ffffff') })); m.rotation.z = Math.PI / 2; m.position.x = len / 2; m.castShadow = true; bar.add(m); bar.position.y = h; group.add(bar);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, h, 0)); world.createCollider(RAPIER.ColliderDesc.capsule((len - 0.6) / 2, 0.3).setTranslation(len / 2, 0, 0).setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) }), body);
      r.bars.push({ body, mesh: bar, h, angle: h > 1 ? Math.PI : 0 });
    }
    for (let i = 0; i < players; i++) { const a = (i / players) * Math.PI * 2; r.spawn.push({ x: Math.cos(a) * 6.5, y: 1.5, z: Math.sin(a) * 6.5 }); }
    r.slime = slimePlane(group, -5, 300); r.killY = -4;
  }
  // décor lointain : îles de bonbons, ballons
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, d = 45 + R() * 60; const cx = kind === 'race' ? (R() < 0.5 ? -1 : 1) * (32 + R() * 60) : Math.cos(a) * d, cz = kind === 'race' ? 20 + R() * (r.finishZ - 40) : Math.sin(a) * d;
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(3 + R() * 4, 1 + R() * 2, 3 + R() * 3, 12), mat(PAL[i % PAL.length]!)); isl.position.set(cx, -4 + R() * 10, cz); group.add(isl);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2 + R() * 2, 16, 12), mat(PAL[(i + 3) % PAL.length]!)); top.position.set(cx, isl.position.y + 3, cz); group.add(top);
  }
  return r;
}
export function textTex(s: string, fill: string, stroke: string) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d')!;
  g.font = '900 120px "Titan One", "Lilita One", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = 26; g.strokeStyle = stroke; g.strokeText(s, 512, 86); g.fillStyle = fill; g.fillText(s, 512, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function disposeRound(world: RAPIER.World, r: Round, scene: THREE.Scene) {
  scene.remove(r.group);
  r.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); } });
  world.forEachRigidBody(b => { if (!b.userData) world.removeRigidBody(b); });
}
