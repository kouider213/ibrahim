import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingId } from '../games/net.ts';

// LES GARDIENS — scène 3D : l'île volante (herbe, falaises, rochers qui flottent), le ciel (coucher de soleil
// au village, nuit étoilée au combat), les 6 bâtiments qui grandissent avec leur niveau, monstres en « instances ».

export const ARENA = 27;
export const BUILD_POS: Record<BuildingId, { a: number; r: number }> = {
  maison: { a: -0.35, r: 19 }, forge: { a: 0.75, r: 20 }, jardin: { a: 1.85, r: 19.5 }, phare: { a: 2.95, r: 21 }, fontaine: { a: 4.1, r: 18.5 }, tour: { a: 5.2, r: 20 },
};
export const buildXZ = (id: BuildingId) => { const p = BUILD_POS[id]; return { x: Math.cos(p.a) * p.r, z: Math.sin(p.a) * p.r }; };

const MAT = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.02, ...o });
function colored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(color); const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); g.deleteAttribute('uv'); return g;
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
export { glowTex };

export type EnemyKind = 'slime' | 'bat' | 'golem' | 'wisp';
export const ENEMY_DEF: Record<EnemyKind, { hp: number; speed: number; r: number; dmg: number; xp: number; max: number; fly: number }> = {
  slime: { hp: 5, speed: 2.3, r: 0.55, dmg: 7, xp: 1, max: 220, fly: 0 },
  bat: { hp: 3, speed: 4.4, r: 0.45, dmg: 5, xp: 1, max: 120, fly: 1.1 },
  golem: { hp: 30, speed: 1.4, r: 1.0, dmg: 16, xp: 5, max: 50, fly: 0 },
  wisp: { hp: 8, speed: 2.4, r: 0.5, dmg: 6, xp: 2, max: 50, fly: 0.9 },
};
function enemyGeo(k: EnemyKind) {
  const parts: THREE.BufferGeometry[] = [];
  const eyes = (y: number, z: number, sep: number, r: number) => { for (const s of [-1, 1]) { parts.push(colored(new THREE.SphereGeometry(r, 10, 8).translate(s * sep, y, z), '#ffffff')); parts.push(colored(new THREE.SphereGeometry(r * 0.55, 8, 6).translate(s * sep, y, z + r * 0.6), '#ff2a55')); } };
  if (k === 'slime') { const b = new THREE.SphereGeometry(0.6, 18, 14); b.scale(1, 0.75, 1); b.translate(0, 0.45, 0); parts.push(colored(b, '#16a34a')); parts.push(colored(new THREE.SphereGeometry(0.16, 10, 8).translate(-0.2, 0.75, 0.25), '#86efac')); eyes(0.55, 0.45, 0.2, 0.12); }
  if (k === 'bat') { parts.push(colored(new THREE.SphereGeometry(0.35, 14, 10), '#7c3aed')); for (const s of [-1, 1]) { const w = new THREE.ConeGeometry(0.35, 0.9, 3); w.rotateZ(s * Math.PI / 2); w.scale(1, 1, 0.2); w.translate(s * 0.65, 0.1, 0); parts.push(colored(w, '#5b21b6')); const ear = new THREE.ConeGeometry(0.09, 0.25, 4); ear.translate(s * 0.15, 0.38, 0); parts.push(colored(ear, '#5b21b6')); } eyes(0.08, 0.28, 0.13, 0.09); }
  if (k === 'golem') { const b = new THREE.DodecahedronGeometry(0.9, 0); b.scale(1, 1.1, 0.9); b.translate(0, 1.0, 0); parts.push(colored(b, '#6b7280')); const h = new THREE.DodecahedronGeometry(0.45, 0); h.translate(0, 2.0, 0.1); parts.push(colored(h, '#9ca3af')); for (const s of [-1, 1]) { const a = new THREE.DodecahedronGeometry(0.38, 0); a.translate(s * 1.0, 0.9, 0.1); parts.push(colored(a, '#4b5563')); } const crack = new THREE.BoxGeometry(0.5, 0.08, 0.05).translate(0, 1.2, 0.82); parts.push(colored(crack, '#f97316')); eyes(2.02, 0.42, 0.15, 0.09); }
  if (k === 'wisp') { const b = new THREE.SphereGeometry(0.45, 16, 12); b.translate(0, 0, 0); parts.push(colored(b, '#22d3ee')); const t = new THREE.ConeGeometry(0.35, 0.8, 12); t.rotateX(Math.PI); t.translate(0, -0.5, 0); parts.push(colored(t, '#0891b2')); eyes(0.08, 0.36, 0.14, 0.1); }
  return mergeGeometries(parts)!;
}

export class Stage {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; composer: EffectComposer; bloom: UnrealBloomPass;
  skyMat: THREE.ShaderMaterial; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fog: THREE.Fog;
  island = new THREE.Group(); buildings: Record<BuildingId, THREE.Group> = {} as Record<BuildingId, THREE.Group>; floaters: THREE.Object3D[] = [];
  enemyMesh: Record<EnemyKind, THREE.InstancedMesh>; gemMesh: THREE.InstancedMesh; boltMesh: THREE.InstancedMesh; orbMesh: THREE.InstancedMesh;
  sparks: THREE.Points; private sparkVel: Float32Array; private sparkLife: Float32Array; private sparkI = 0;
  stars: THREE.Points; night = 0; quality: 'high' | 'low' = 'high'; time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 600);
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.45;
    this.fog = new THREE.Fog('#f4a37a', 60, 180); this.scene.fog = this.fog;
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#2b3a8f') }, mid: { value: new THREE.Color('#f78f6b') }, bot: { value: new THREE.Color('#ffd7a8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, y)) : mix(mid, bot, smoothstep(0.0, -0.4, y)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat));
    const sp = new Float32Array(900 * 3); for (let i = 0; i < 900; i++) { const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.9 + 0.08; v.normalize().multiplyScalar(380); sp.set([v.x, v.y, v.z], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); this.scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight('#ffe2c4', '#4a3a5a', 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd2a1', 2.4); this.sun.position.set(-30, 40, 20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 120; this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.buildIsland();

    const mk = (k: EnemyKind) => { const m = new THREE.InstancedMesh(enemyGeo(k), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, emissive: new THREE.Color(k === 'wisp' ? '#0e7490' : '#000000'), emissiveIntensity: k === 'wisp' ? 1.2 : 0 }), ENEMY_DEF[k].max); m.castShadow = true; m.frustumCulled = false; m.count = 0; this.scene.add(m); return m; };
    this.enemyMesh = { slime: mk('slime'), bat: mk('bat'), golem: mk('golem'), wisp: mk('wisp') };
    const gemGeo = new THREE.OctahedronGeometry(0.16, 0); gemGeo.scale(1, 1.5, 1);
    this.gemMesh = new THREE.InstancedMesh(gemGeo, MAT('#38bdf8', { emissive: new THREE.Color('#0ea5e9'), emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.25 }), 600); this.gemMesh.frustumCulled = false; this.gemMesh.count = 0; this.scene.add(this.gemMesh);
    this.boltMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3a8' }), 300); this.boltMesh.frustumCulled = false; this.boltMesh.count = 0; this.scene.add(this.boltMesh);
    this.orbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: '#c084fc' }), 200); this.orbMesh.frustumCulled = false; this.orbMesh.count = 0; this.scene.add(this.orbMesh);

    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3)); pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    this.sparks = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.sparks.frustumCulled = false; this.scene.add(this.sparks);
    this.sparkVel = new Float32Array(600 * 3); this.sparkLife = new Float32Array(600);

    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.55, 0.78); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.resize());
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); }
  setQuality(q: 'high' | 'low') { this.quality = q; this.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.25)); this.sun.castShadow = q === 'high'; this.resize(); }

  private buildIsland() {
    const I = this.island; this.scene.add(I);
    // dessus : herbe avec variations de couleur
    const top = new THREE.CylinderGeometry(ARENA + 3, ARENA + 1.5, 1.4, 72, 3); const pos = top.attributes.position!; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i); const n = Math.sin(x * 0.35) * Math.cos(z * 0.3) * 0.5 + Math.sin(x * 0.11 + z * 0.13) * 0.5; const c = y > 0.6 ? new THREE.Color().setHSL(0.27 + n * 0.03, 0.5, 0.34 + n * 0.06) : new THREE.Color('#8a6a4a'); col.set([c.r, c.g, c.b], i * 3); }
    top.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const grass = new THREE.Mesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); grass.position.y = -0.7; grass.receiveShadow = true; I.add(grass);
    // falaises en dessous (cône irrégulier)
    const cliff = new THREE.ConeGeometry(ARENA + 2.5, 26, 40, 8, true); cliff.rotateX(Math.PI); const cp = cliff.attributes.position!;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); const k = 1 + Math.sin(x * 0.7 + y * 0.3) * 0.06 + Math.cos(z * 0.5 - y * 0.4) * 0.06; cp.setXYZ(i, x * k, y, z * k); }
    cliff.computeVertexNormals(); const cl = new THREE.Mesh(cliff, MAT('#7a5a42', { roughness: 1, flatShading: true })); cl.position.y = -14; I.add(cl);
    const moss = new THREE.Mesh(new THREE.TorusGeometry(ARENA + 2.2, 0.9, 8, 72), MAT('#4f8a3a', { roughness: 1 })); moss.rotation.x = Math.PI / 2; moss.position.y = -1.2; I.add(moss);
    // chemin de pierres jusqu'au centre + place centrale
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(6, 40), MAT('#cdbb9c', { roughness: 0.95 })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; I.add(plaza);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.2, 48), MAT('#c9b28c')); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; I.add(ring);
    const star = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 8), MAT('#3b82f6', { emissive: new THREE.Color('#1d4ed8'), emissiveIntensity: 0.6 })); star.rotation.x = -Math.PI / 2; star.position.y = 0.04; I.add(star);
    // fleurs et touffes (instances)
    const flowerGeo = mergeGeometries([colored(new THREE.ConeGeometry(0.12, 0.35, 4).translate(0, 0.17, 0), '#3f8f4f'), colored(new THREE.SphereGeometry(0.07, 6, 5).translate(0, 0.3, 0), '#ffffff')])!;
    const fl = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 300); const m = new THREE.Matrix4(); const fc = new THREE.Color();
    for (let i = 0; i < 300; i++) { const a = Math.random() * Math.PI * 2, r = 7 + Math.random() * (ARENA - 6); m.makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r); fl.setMatrixAt(i, m); fl.setColorAt(i, fc.setHSL([0.95, 0.12, 0.6, 0.8, 0.15][i % 5]!, 0.85, 0.65)); }
    I.add(fl);
    // rochers qui flottent autour
    for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 2.5, 0), MAT('#8a6a4a', { flatShading: true })); const a = Math.random() * Math.PI * 2, d = ARENA + 10 + Math.random() * 30; r.position.set(Math.cos(a) * d, -6 + Math.random() * 14, Math.sin(a) * d); const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.8, 0.4, 7).scale(r.geometry.boundingSphere?.radius ?? 1.5, 1, 1.4), MAT('#5c9a45')); gr.position.y = 0.9; r.add(gr); this.floaters.push(r); this.scene.add(r); }
    // nuages en dessous
    for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })); const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 90; s.position.set(Math.cos(a) * d, -22 - Math.random() * 20, Math.sin(a) * d); s.scale.setScalar(30 + Math.random() * 40); this.floaters.push(s); this.scene.add(s); }
    for (const id of Object.keys(BUILD_POS) as BuildingId[]) { const g = new THREE.Group(); const p = buildXZ(id); g.position.set(p.x, 0, p.z); g.rotation.y = -BUILD_POS[id].a - Math.PI / 2; this.buildings[id] = g; I.add(g); }
  }

  /** Redessine un bâtiment selon son niveau (0 = ruines + échafaudage). */
  setBuilding(id: BuildingId, lvl: number) {
    const g = this.buildings[id]; g.clear(); const add = <T extends THREE.Object3D>(o: T) => { o.traverse(x => { if ((x as THREE.Mesh).isMesh) { x.castShadow = true; x.receiveShadow = true; } }); g.add(o); return o; };
    const box = (w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT(c, o)); m.position.set(x, y + h / 2, z); return add(m); };
    const cyl = (r: number, h: number, c: string, x = 0, y = 0, z = 0, seg = 16, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), MAT(c, o)); m.position.set(x, y + h / 2, z); return add(m); };
    const cone = (r: number, h: number, c: string, x = 0, y = 0, z = 0, seg = 16) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), MAT(c)); m.position.set(x, y + h / 2, z); return add(m); };
    const glow = (c: string, x: number, y: number, z: number, s = 2) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.position.set(x, y, z); sp.scale.setScalar(s); g.add(sp); return sp; };
    if (lvl === 0) {   // ruines
      for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.5, 0), MAT('#9ca3af', { flatShading: true })); r.position.set((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3); add(r); }
      for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) cyl(0.08, 2.4, '#b08155', x!, 0, z!, 6);
      box(2.6, 0.08, 0.1, '#b08155', 0, 2.2, -1.2); box(2.6, 0.08, 0.1, '#b08155', 0, 2.2, 1.2);
      const sign = box(0.9, 0.6, 0.06, '#fef3c7', 0, 0.6, 1.6); void sign; glow('#fde68a', 0, 1.2, 0, 2.5);
      return;
    }
    const s = 0.8 + lvl * 0.12; g.scale.setScalar(s);
    if (id === 'maison') {
      box(3.2, 2.2, 2.6, '#fbf7ef'); box(3.4, 0.25, 2.8, '#e8ddc9', 0, 2.2);
      box(0.7, 1.2, 0.05, '#2b6cb0', 0, 0, 1.31); for (const x of [-1.0, 1.0]) { box(0.6, 0.6, 0.05, '#8fd0ff', x, 1.1, 1.31, { emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.4 }); box(0.15, 0.7, 0.06, '#2b6cb0', x - 0.4, 1.05, 1.32); box(0.15, 0.7, 0.06, '#2b6cb0', x + 0.4, 1.05, 1.32); }
      if (lvl >= 2) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#f4f1ea')); d.position.y = 2.45; add(d); }
      if (lvl >= 3) { box(1.6, 1.4, 1.6, '#f3e2c4', 1.9, 0, -0.3); cone(0.15, 0.4, '#ffcc33', 0, 3.3, 0, 8); }
      if (lvl >= 4) for (const x of [-1.9, 1.9]) { cyl(0.12, 1.4, '#7a4a2e', x, 0, 1.8, 6); const lf = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), MAT('#3ea84a')); lf.position.set(x, 1.7, 1.8); add(lf); }
      if (lvl >= 5) { glow('#ffd98a', 0, 3.6, 0, 3); box(0.05, 1.2, 0.05, '#ddd', 0.8, 2.45, 0.6); box(0.6, 0.4, 0.02, '#16a34a', 1.1, 3.25, 0.6); }
    }
    if (id === 'forge') {
      box(3, 1.8, 2.4, '#8a5a3c'); box(3.4, 0.3, 2.8, '#5b3a24', 0, 1.8); cyl(0.4, 2.8 + lvl * 0.3, '#6b7280', 1.1, 0, -0.6, 10);
      const fire = box(1.0, 0.8, 0.1, '#ff7a18', 0, 0.3, 1.21, { emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 2.2 }); void fire; glow('#ff8a3a', 0, 0.8, 1.6, 3);
      box(0.9, 0.5, 0.5, '#374151', -0.6, 0, 1.7, { metalness: 0.8, roughness: 0.3 });
      if (lvl >= 3) for (let i = 0; i < 3; i++) box(0.08, 1.2, 0.3, '#cbd5e1', -1.3 + i * 0.25, 0.4, 1.4, { metalness: 0.9, roughness: 0.2 });
      if (lvl >= 5) glow('#ffb35a', 1.1, 4.4, -0.6, 3);
    }
    if (id === 'jardin') {
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 24), MAT('#7a4a2e')); bed.position.y = 0.2; add(bed);
      const soil = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), MAT('#4a2e1a')); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.41; add(soil);
      for (let i = 0; i < 4 + lvl * 3; i++) { const a = i * 2.4, r = 0.5 + (i % 3) * 0.55; const st = cyl(0.04, 0.6, '#3f8f4f', Math.cos(a) * r, 0.4, Math.sin(a) * r, 5); void st; const f = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), MAT(['#ff5f8f', '#ffcc33', '#a78bfa', '#ff8a00'][i % 4]!)); f.position.set(Math.cos(a) * r, 1.05, Math.sin(a) * r); add(f); }
      if (lvl >= 2) { cyl(0.18, 2.2, '#8a5a3c', -2.6, 0, 0, 8); const tr = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), MAT('#2f8f3a')); tr.position.set(-2.6, 2.6, 0); add(tr); for (let k = 0; k < 5; k++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), MAT('#ff8a00')); o.position.set(-2.6 + Math.cos(k) * 1.0, 2.4 + Math.sin(k * 2) * 0.5, Math.sin(k) * 1.0); add(o); } }
      if (lvl >= 4) glow('#a7f3d0', 0, 1.4, 0, 4);
    }
    if (id === 'phare') {
      const h = 4 + lvl * 0.8; const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, h, 16), MAT('#ffffff')); t.position.y = h / 2; add(t);
      for (let i = 1; i < 4; i++) cyl(0.95 - i * 0.08, 0.35, '#e8333a', 0, h * (i / 4), 0, 16);
      cyl(0.8, 0.9, '#1f2937', 0, h, 0, 12, { metalness: 0.6 }); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff3b0' })); lamp.position.y = h + 0.45; add(lamp);
      cone(0.9, 0.7, '#e8333a', 0, h + 0.9, 0, 12); const gl = glow('#fff1a8', 0, h + 0.45, 0, 5 + lvl); gl.name = 'beacon';
    }
    if (id === 'fontaine') {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 0.6, 28), MAT('#e9dcc4')); basin.position.y = 0.3; add(basin);
      const water = new THREE.Mesh(new THREE.CircleGeometry(1.8, 28), MAT('#38bdf8', { emissive: new THREE.Color('#0ea5e9'), emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.2 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.58; add(water);
      cyl(0.25, 1.2 + lvl * 0.2, '#e9dcc4', 0, 0.5, 0, 10); const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), MAT('#38bdf8', { emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 1.3 })); top.position.y = 1.9 + lvl * 0.2; top.name = 'orb'; add(top);
      glow('#7dd3fc', 0, 1.9 + lvl * 0.2, 0, 3 + lvl * 0.4);
    }
    if (id === 'tour') {
      const h = 3.5 + lvl * 0.9; cyl(1.1, h, '#9ca3af', 0, 0, 0, 10, { flatShading: true });
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; box(0.4, 0.5, 0.4, '#9ca3af', Math.cos(a) * 1.0, h, Math.sin(a) * 1.0); }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), MAT('#c084fc', { emissive: new THREE.Color('#a855f7'), emissiveIntensity: 1.8 })); crystal.position.y = h + 1.2; crystal.name = 'crystal'; add(crystal);
      glow('#d8b4fe', 0, h + 1.2, 0, 3 + lvl * 0.5);
    }
  }

  /** Ambiance : 0 = coucher de soleil au village, 1 = nuit de combat. */
  setNight(k: number) {
    this.night = k; const L = (a: string, b: string) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    this.skyMat.uniforms.top!.value.copy(L('#2b3a8f', '#05031a')); this.skyMat.uniforms.mid!.value.copy(L('#f78f6b', '#2a1650')); this.skyMat.uniforms.bot!.value.copy(L('#ffd7a8', '#1a0b33'));
    this.fog.color.copy(L('#f4a37a', '#1c1038')); this.hemi.color.copy(L('#ffe2c4', '#8b9cff')); this.hemi.groundColor.copy(L('#4a3a5a', '#120a24')); this.hemi.intensity = 1.0 - k * 0.35;
    this.sun.color.copy(L('#ffd2a1', '#9fb0ff')); this.sun.intensity = 2.0 - k * 1.2; (this.stars.material as THREE.PointsMaterial).opacity = k; this.bloom.strength = 0.25 + k * 0.45;
    (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.4 - k * 0.28; this.renderer.toneMappingExposure = 0.92 - k * 0.12;
  }
  burst(x: number, y: number, z: number, color: string, n = 10, power = 5) {
    const c = new THREE.Color(color); const pa = (this.sparks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array, ca = (this.sparks.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < n; k++) { const i = this.sparkI = (this.sparkI + 1) % 600; pa[i * 3] = x; pa[i * 3 + 1] = y; pa[i * 3 + 2] = z; this.sparkVel[i * 3] = (Math.random() - 0.5) * power; this.sparkVel[i * 3 + 1] = Math.random() * power; this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * power; this.sparkLife[i] = 0.35 + Math.random() * 0.4; ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    (this.sparks.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  update(dt: number) {
    this.time += dt;
    this.floaters.forEach((f, i) => { f.position.y += Math.sin(this.time * 0.6 + i) * dt * 0.15; });
    for (const g of Object.values(this.buildings)) { const c = g.getObjectByName('crystal'); if (c) { c.rotation.y += dt * 1.5; c.position.y += Math.sin(this.time * 2) * dt * 0.2; } const o = g.getObjectByName('orb'); if (o) o.scale.setScalar(1 + Math.sin(this.time * 3) * 0.08); const b = g.getObjectByName('beacon'); if (b) (b as THREE.Sprite).material.opacity = 0.6 + Math.sin(this.time * 2) * 0.4; }
    const pa = (this.sparks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < 600; i++) { if (this.sparkLife[i]! <= 0) { pa[i * 3 + 1] = -999; continue; } this.sparkLife[i]! -= dt; this.sparkVel[i * 3 + 1]! -= 9 * dt; pa[i * 3]! += this.sparkVel[i * 3]! * dt; pa[i * 3 + 1]! += this.sparkVel[i * 3 + 1]! * dt; pa[i * 3 + 2]! += this.sparkVel[i * 3 + 2]! * dt; }
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
  render() { if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
