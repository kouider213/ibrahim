import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// LE RESTO EN FOLIE — la cuisine en 3D : sol en damier, plans de travail en bois, gazinière, couscoussier,
// planches à découper, caisses d'ingrédients, passe-plats. Les aliments sont de petits objets 3D (crus / coupés / cuits).

export const TILE = 1.4;
export type Ing = 'tomate' | 'viande' | 'legumes' | 'semoule' | 'brick' | 'pate' | 'menthe' | 'pois';
export type Dish = 'soup' | 'semoule' | 'bourek' | 'mhajeb' | 'the';
export interface Item { k: Ing | Dish | 'plate'; st?: 'raw' | 'cut' | 'cooked' | 'burnt'; parts?: Item[]; soup?: Ing[] }
export const ING: Record<Ing, { e: string; fr: string; ar: string; color: string; cut: boolean }> = {
  tomate: { e: '🍅', fr: 'Tomate', ar: 'طماطم', color: '#e8333a', cut: true },
  viande: { e: '🥩', fr: 'Viande', ar: 'لحم', color: '#b4473f', cut: true },
  legumes: { e: '🥕', fr: 'Légumes', ar: 'خضر', color: '#ff8a00', cut: true },
  semoule: { e: '🌾', fr: 'Semoule', ar: 'سميد', color: '#f2d27a', cut: false },
  brick: { e: '🫓', fr: 'Feuille de brick', ar: 'ورقة بريك', color: '#f3e3b8', cut: false },
  pate: { e: '🥟', fr: 'Pâte', ar: 'عجين', color: '#f6e7c8', cut: false },
  menthe: { e: '🌿', fr: 'Menthe', ar: 'نعناع', color: '#2fbf71', cut: false },
  pois: { e: '🫘', fr: 'Haricots', ar: 'لوبيا', color: '#d6b98a', cut: false },
};
export type Station = 'counter' | 'board' | 'pot' | 'pan' | 'steamer' | 'kettle' | 'plates' | 'serve' | 'trash' | 'crate' | 'wall' | 'floor';
export interface Tile { x: number; z: number; type: Station; ing?: Ing; item: Item | null; prog: number; cook: number; burn: number; mesh: THREE.Group; itemMesh: THREE.Object3D | null; bar: THREE.Mesh | null; key: string }

const MAT = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.05, ...o });
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function emojiTex(e: string) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.15)'; g.stroke(); g.font = '70px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 70); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const emojiCache = new Map<string, THREE.Texture>();
export const emoji = (e: string) => { if (!emojiCache.has(e)) emojiCache.set(e, emojiTex(e)); return emojiCache.get(e)!; };
function floorTex(a: string, b: string) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 64, j * 64, 64, 64); } g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
function woodTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d')!; g.fillStyle = '#c98d52'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,50,20,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + Math.random() * 10 - 5, 170, y + Math.random() * 10 - 5, 256, y); g.stroke(); } for (let x = 0; x < 256; x += 64) { g.fillStyle = 'rgba(60,30,10,.25)'; g.fillRect(x, 0, 2, 256); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const WOOD = woodTex();

export class Kitchen {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; composer: EffectComposer; bloom: UnrealBloomPass;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; root = new THREE.Group(); tiles: Tile[] = []; w = 0; h = 0;
  steam: THREE.Points; private sv: Float32Array; private sl: Float32Array; private si = 0; quality: 'high' | 'low' = 'high'; time = 0;
  spot: THREE.PointLight[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.5;
    this.scene.background = new THREE.Color('#2a1a3a');
    this.hemi = new THREE.HemisphereLight('#fff1dc', '#5a4060', 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe7c4', 2.2); this.sun.position.set(-8, 16, 10); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 50; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02; this.scene.add(this.sun);
    this.scene.add(this.root);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(400 * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(400 * 3), 3));
    this.steam = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.5, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7 })); this.steam.frustumCulled = false; this.scene.add(this.steam);
    this.sv = new Float32Array(400 * 3); this.sl = new Float32Array(400);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.85); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    addEventListener('resize', () => this.resize());
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); this.frame(); }
  setQuality(q: 'high' | 'low') { this.quality = q; this.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.25)); this.sun.castShadow = q === 'high'; this.resize(); }
  /** Cadre la caméra pour voir toute la cuisine (portrait ou paysage). */
  frame() {
    const W = this.w * TILE, H = this.h * TILE; const portrait = innerHeight > innerWidth;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov); const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
    const dW = (W / 2 + 0.8) / Math.tan(fovH / 2), dH = (H / 2 + 1.6) / Math.tan(fovV / 2) * 0.9;
    const d = Math.max(dW, dH) * (portrait ? 1.0 : 1.05);
    this.camera.position.set(0, d * 0.88, d * 0.5 + H * 0.06); this.camera.lookAt(0, 0, H * 0.04);
  }

  build(map: string[], theme: { floor: [string, string]; wall: string; bg: string }) {
    this.root.clear(); this.tiles = []; this.h = map.length; this.w = map[0]!.length;
    this.scene.background = new THREE.Color(theme.bg);
    const W = this.w * TILE, H = this.h * TILE;
    const ft = floorTex(theme.floor[0], theme.floor[1]); ft.repeat.set(this.w / 2, this.h / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), MAT('#ffffff', { map: ft, roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.root.add(floor);
    const wallM = MAT(theme.wall, { roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 2.8, 0.3), wallM); back.position.set(0, 1.4, -H / 2 - 0.15); back.receiveShadow = true; this.root.add(back);
    for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, H + 0.6), wallM); side.position.set(s * (W / 2 + 0.15), 0.6, 0); this.root.add(side); }
    // carreaux décoratifs (zellige) sur le mur du fond
    const zc = document.createElement('canvas'); zc.width = 256; zc.height = 64; const zg = zc.getContext('2d')!;
    for (let i = 0; i < 8; i++) { zg.fillStyle = ['#1f6feb', '#ffffff', '#14b8a6', '#ffffff'][i % 4]!; zg.fillRect(i * 32, 0, 32, 64); zg.fillStyle = '#ffd36b'; zg.beginPath(); zg.moveTo(i * 32 + 16, 12); zg.lineTo(i * 32 + 28, 32); zg.lineTo(i * 32 + 16, 52); zg.lineTo(i * 32 + 4, 32); zg.fill(); }
    const zt = new THREE.CanvasTexture(zc); zt.wrapS = THREE.RepeatWrapping; zt.repeat.set(W / 2, 1); zt.colorSpace = THREE.SRGBColorSpace;
    const zel = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.6), MAT('#ffffff', { map: zt })); zel.position.set(0, 1.6, -H / 2 + 0.01); this.root.add(zel);
    const legend: Record<string, Station> = { C: 'counter', X: 'board', O: 'pot', F: 'pan', U: 'steamer', K: 'kettle', P: 'plates', D: 'serve', T: 'trash', '#': 'wall', '.': 'floor' };
    const crates: Record<string, Ing> = { t: 'tomate', v: 'viande', l: 'legumes', s: 'semoule', b: 'brick', p: 'pate', m: 'menthe', h: 'pois' };
    map.forEach((row, j) => [...row].forEach((ch, i) => {
      const type: Station = crates[ch] ? 'crate' : legend[ch] ?? 'floor';
      const x = (i - (this.w - 1) / 2) * TILE, z = (j - (this.h - 1) / 2) * TILE;
      const g = new THREE.Group(); g.position.set(x, 0, z); this.root.add(g);
      const t: Tile = { x, z, type, ing: crates[ch], item: null, prog: 0, cook: 0, burn: 0, mesh: g, itemMesh: null, bar: null, key: `${i},${j}` };
      this.makeStation(t); this.tiles.push(t);
    }));
    this.frame();
  }
  private makeStation(t: Tile) {
    const g = t.mesh; if (t.type === 'floor') return;
    const add = (m: THREE.Object3D) => { m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(m); return m; };
    const cab = (c = '#f4efe6') => { const b = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.04, 0.9, TILE - 0.04), MAT(c, { roughness: 0.7 })); b.position.y = 0.45; add(b); const top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.1, TILE), MAT('#ffffff', { map: WOOD, roughness: 0.5 })); top.position.y = 0.95; add(top); const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), MAT('#c9a227', { metalness: 0.8, roughness: 0.3 })); h.position.set(0, 0.7, TILE / 2); add(h); };
    if (t.type === 'wall') { const b = new THREE.Mesh(new THREE.BoxGeometry(TILE, 1.0, TILE), MAT('#7a5a7a')); b.position.y = 0.5; add(b); return; }
    if (t.type === 'counter') cab();
    if (t.type === 'board') { cab(); const bd = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.75), MAT('#e2b77a', { roughness: 0.8 })); bd.position.y = 1.04; add(bd); const kn = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.1), MAT('#e5e7eb', { metalness: 0.9, roughness: 0.2 })); blade.position.x = 0.15; kn.add(blade); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.07), MAT('#3a2a1a')); hd.position.x = -0.2; kn.add(hd); kn.position.set(0, 1.09, 0.3); kn.name = 'knife'; add(kn); }
    if (t.type === 'pot' || t.type === 'pan' || t.type === 'steamer' || t.type === 'kettle') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.04, 0.9, TILE - 0.04), MAT('#3b3f4a', { metalness: 0.5, roughness: 0.35 })); b.position.y = 0.45; add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.08, TILE), MAT('#1f2229', { metalness: 0.6, roughness: 0.3 })); top.position.y = 0.94; add(top);
      const flame = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: '#3b82f6' })); flame.rotation.x = Math.PI / 2; flame.position.y = 1.0; flame.name = 'flame'; flame.visible = false; add(flame);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12), MAT('#e5e7eb', { metalness: 0.7 })); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.75, TILE / 2 + 0.02); add(knob);
      let vessel: THREE.Object3D;
      if (t.type === 'pot') { vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.5, 24, 1, true), MAT('#94a3b8', { metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })); vessel.position.y = 1.24; const bot = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), MAT('#64748b')); bot.rotation.x = -Math.PI / 2; bot.position.y = 1.0; add(bot); for (const s of [-1, 1]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), MAT('#475569', { metalness: 0.8 })); hd.position.set(s * 0.47, 1.4, 0); hd.rotation.y = Math.PI / 2; add(hd); } }
      else if (t.type === 'pan') { vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.1, 24), MAT('#1f2937', { metalness: 0.6, roughness: 0.3 })); vessel.position.y = 1.04; const hd = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.08), MAT('#111827')); hd.position.set(0.65, 1.07, 0); add(hd); }
      else if (t.type === 'steamer') { vessel = new THREE.Group(); const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.4, 20), MAT('#c9a227', { metalness: 0.8, roughness: 0.3 })); lo.position.y = 1.18; vessel.add(lo); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.32, 20, 1, true), MAT('#d4af37', { metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide })); up.position.y = 1.52; vessel.add(up); }
      else { vessel = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), MAT('#d4d4d8', { metalness: 0.9, roughness: 0.2 })); body.scale.set(1, 0.85, 1); body.position.y = 1.25; vessel.add(body); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 8), body.material); sp.position.set(0.32, 1.35, 0); sp.rotation.z = -0.9; vessel.add(sp); const lid = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 12), body.material); lid.position.y = 1.58; vessel.add(lid); }
      add(vessel);
      const surf = new THREE.Mesh(new THREE.CircleGeometry(t.type === 'pan' ? 0.36 : 0.38, 24), MAT('#ffffff', { roughness: 0.4 })); surf.rotation.x = -Math.PI / 2; surf.position.y = t.type === 'pan' ? 1.1 : t.type === 'steamer' ? 1.62 : 1.38; surf.name = 'surf'; surf.visible = false; if (t.type !== 'kettle') add(surf);
    }
    if (t.type === 'plates') { cab(); for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.05, 24), MAT('#ffffff', { roughness: 0.25 })); p.position.y = 1.03 + i * 0.06; add(p); } }
    if (t.type === 'trash') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 1.0, 20), MAT('#475569', { metalness: 0.4 })); b.position.y = 0.5; add(b); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.08, 20), MAT('#334155')); l.position.y = 1.02; add(l); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji('🗑️'), depthWrite: false })); sp.position.y = 1.5; sp.scale.setScalar(0.55); g.add(sp); }
    if (t.type === 'serve') { const b = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.04, 0.9, TILE - 0.04), MAT('#1f6feb')); b.position.y = 0.45; add(b); const top = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.1, TILE), MAT('#e5e7eb', { metalness: 0.8, roughness: 0.25 })); top.position.y = 0.95; add(top); const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#ffd36b', { metalness: 0.9, roughness: 0.2 })); bell.position.set(0.4, 1.0, -0.4); add(bell); const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji('🛎️'), depthWrite: false })); arrow.position.y = 1.7; arrow.scale.setScalar(0.6); arrow.name = 'bob'; g.add(arrow); }
    if (t.type === 'crate') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.1, 0.85, TILE - 0.1), MAT('#b07a48', { map: WOOD, roughness: 0.8 })); b.position.y = 0.42; add(b);
      for (const y of [0.2, 0.65]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.05, 0.08, TILE - 0.05), MAT('#8a5a3c')); sl.position.y = y; add(sl); }
      const pile = itemMesh({ k: t.ing!, st: 'raw' }); pile.position.y = 0.95; pile.scale.setScalar(1.15); g.add(pile);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji(ING[t.ing!].e), depthWrite: false })); sp.position.y = 1.65; sp.scale.setScalar(0.55); g.add(sp);
    }
  }
  /** Met à jour l'objet posé sur une case (et le contenu des marmites). */
  refresh(t: Tile) {
    if (t.itemMesh) { t.mesh.remove(t.itemMesh); t.itemMesh = null; }
    const surf = t.mesh.getObjectByName('surf') as THREE.Mesh | undefined;
    const flame = t.mesh.getObjectByName('flame') as THREE.Mesh | undefined;
    const cooking = ['pot', 'pan', 'steamer', 'kettle'].includes(t.type);
    if (cooking) {
      const it = t.item; if (flame) flame.visible = !!it;
      if (surf) { surf.visible = !!it; if (it) (surf.material as THREE.MeshStandardMaterial).color.set(it.st === 'burnt' ? '#1f1a17' : soupColor(it)); }
      if (it && (t.type === 'pan' || t.type === 'kettle')) { const m = itemMesh(it); m.position.y = t.type === 'pan' ? 1.12 : 1.75; if (t.type === 'kettle') m.scale.setScalar(0.6); t.mesh.add(m); t.itemMesh = m; }
      return;
    }
    if (t.item) { const m = itemMesh(t.item); m.position.y = t.type === 'board' ? 1.08 : 1.0; t.mesh.add(m); t.itemMesh = m; }
  }
  puff(x: number, y: number, z: number, color: string, n = 1) {
    const c = new THREE.Color(color); const pa = (this.steam.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array, ca = (this.steam.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < n; k++) { const i = this.si = (this.si + 1) % 400; pa[i * 3] = x + (Math.random() - 0.5) * 0.4; pa[i * 3 + 1] = y; pa[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4; this.sv[i * 3] = (Math.random() - 0.5) * 0.3; this.sv[i * 3 + 1] = 0.6 + Math.random() * 0.6; this.sv[i * 3 + 2] = (Math.random() - 0.5) * 0.3; this.sl[i] = 1 + Math.random() * 0.6; ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
    (this.steam.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  update(dt: number) {
    this.time += dt;
    const pa = (this.steam.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < 400; i++) { if (this.sl[i]! <= 0) { pa[i * 3 + 1] = -99; continue; } this.sl[i]! -= dt; pa[i * 3]! += this.sv[i * 3]! * dt; pa[i * 3 + 1]! += this.sv[i * 3 + 1]! * dt; pa[i * 3 + 2]! += this.sv[i * 3 + 2]! * dt; }
    (this.steam.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (const t of this.tiles) { const b = t.mesh.getObjectByName('bob'); if (b) b.position.y = 1.7 + Math.sin(this.time * 3) * 0.08; const f = t.mesh.getObjectByName('flame'); if (f?.visible) f.scale.setScalar(1 + Math.sin(this.time * 20 + t.x) * 0.06); }
  }
  render() { if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}

export function soupColor(it: Item) {
  if (it.k === 'the') return '#b45309'; if (it.k === 'semoule' || it.k === 'bourek' || it.k === 'mhajeb') return '#f2c46a';
  const s = it.soup ?? []; if (s.includes('tomate') && s.includes('viande')) return '#c2410c'; if (s.includes('tomate')) return '#e8333a'; if (s.includes('pois')) return '#c08a4a'; if (s.includes('legumes')) return '#f59e0b'; return '#e8b04a';
}
/** Objet 3D d'un aliment / d'une assiette. */
export function itemMesh(it: Item): THREE.Object3D {
  const g = new THREE.Group(); const cast = (m: THREE.Mesh) => { m.castShadow = true; return m; };
  if (it.k === 'plate') {
    const p = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.06, 26), MAT('#ffffff', { roughness: 0.2 }))); p.position.y = 0.03; g.add(p);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 26), MAT('#1f6feb')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.07; g.add(rim);
    (it.parts ?? []).forEach((pt, i, arr) => { const m = itemMesh(pt); const a = (i / Math.max(1, arr.length)) * Math.PI * 2; const r = arr.length > 1 ? 0.15 : 0; m.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r); m.scale.setScalar(arr.length > 1 ? 0.7 : 0.9); g.add(m); });
    return g;
  }
  const burnt = it.st === 'burnt';
  if (it.k === 'soup') { const b = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.2, 20), MAT('#f4efe6'))); b.position.y = 0.1; g.add(b); const s = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20), MAT(burnt ? '#1f1a17' : soupColor(it), { roughness: 0.3 })); s.rotation.x = -Math.PI / 2; s.position.y = 0.19; g.add(s); for (let i = 0; i < 4; i++) { const ch = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), MAT(ING[(it.soup ?? ['tomate'])[i % (it.soup?.length || 1)]!]?.color ?? '#fff')); ch.position.set(Math.cos(i * 1.6) * 0.12, 0.2, Math.sin(i * 1.6) * 0.12); g.add(ch); } return g; }
  if (it.k === 'the') { const gl = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.28, 14), MAT('#fde68a', { transparent: true, opacity: 0.75, roughness: 0.1 }))); gl.position.y = 0.14; g.add(gl); const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.2, 14), MAT('#b45309')); tea.position.y = 0.11; g.add(tea); const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), MAT('#16a34a')); leaf.position.set(0.04, 0.28, 0); g.add(leaf); return g; }
  if (it.k === 'semoule') { const m = cast(new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT(burnt ? '#2b2118' : it.st === 'cooked' ? '#f6d77e' : '#e9cf8a', { roughness: 0.95 }))); m.scale.y = 0.6; g.add(m); if (it.st === 'cooked') for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), MAT('#fff7d6')); d.position.set((Math.random() - 0.5) * 0.3, 0.16, (Math.random() - 0.5) * 0.3); g.add(d); } return g; }
  if (it.k === 'bourek') { for (let i = 0; i < 3; i++) { const c = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10), MAT(burnt ? '#2b2118' : '#e0a33a', { roughness: 0.6 }))); c.rotation.z = Math.PI / 2; c.position.set(0, 0.07, (i - 1) * 0.13); g.add(c); } return g; }
  if (it.k === 'mhajeb') { const m = cast(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.45), MAT(burnt ? '#2b2118' : '#eab35a', { roughness: 0.6 }))); m.position.y = 0.04; g.add(m); const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), MAT('#c2410c')); s.position.y = 0.08; g.add(s); return g; }
  const ing = ING[it.k as Ing]; const col = burnt ? '#2b2118' : ing.color; const cut = it.st === 'cut';
  if (it.k === 'tomate') { if (cut) { for (let i = 0; i < 4; i++) { const s = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), MAT(col))); s.position.set((i - 1.5) * 0.11, 0.03, 0); s.rotation.z = 0.2; g.add(s); } } else { const t = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), MAT(col, { roughness: 0.35 }))); t.position.y = 0.18; t.scale.y = 0.85; g.add(t); const st = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.06, 5), MAT('#16a34a')); st.position.y = 0.36; g.add(st); } return g; }
  if (it.k === 'viande') { if (cut) { for (let i = 0; i < 5; i++) { const c = cast(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), MAT(col))); c.position.set((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3); g.add(c); } } else { const m = cast(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), MAT(col, { roughness: 0.5 }))); m.scale.set(1.3, 0.5, 1); m.position.y = 0.1; g.add(m); const fat = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16), MAT('#fde2d0')); fat.rotation.x = Math.PI / 2; fat.scale.set(1.3, 1, 1); fat.position.y = 0.12; g.add(fat); } return g; }
  if (it.k === 'legumes') { if (cut) { for (let i = 0; i < 6; i++) { const c = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), MAT(i % 2 ? col : '#65a30d'))); c.position.set((Math.random() - 0.5) * 0.3, 0.03, (Math.random() - 0.5) * 0.3); g.add(c); } } else { const c = cast(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 10), MAT(col))); c.rotation.z = Math.PI / 2; c.position.y = 0.1; g.add(c); const z = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10), MAT('#65a30d'))); z.rotation.z = Math.PI / 2; z.position.set(0, 0.08, 0.16); g.add(z); } return g; }
  if (it.k === 'brick') { const d = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24), MAT(col, { roughness: 0.8 }))); d.position.y = 0.03; g.add(d); return g; }
  if (it.k === 'pate') { const d = cast(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), MAT(col, { roughness: 0.9 }))); d.scale.y = 0.5; d.position.y = 0.08; g.add(d); return g; }
  if (it.k === 'menthe') { for (let i = 0; i < 5; i++) { const l = cast(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MAT(col))); l.scale.set(1, 0.3, 0.6); l.position.set(Math.cos(i * 1.3) * 0.1, 0.06 + i * 0.02, Math.sin(i * 1.3) * 0.1); g.add(l); } return g; }
  if (it.k === 'pois') { const s = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.22, 14), MAT('#d6c3a3'))); s.position.y = 0.11; g.add(s); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), MAT('#f3ead6')); b.position.set((Math.random() - 0.5) * 0.25, 0.23, (Math.random() - 0.5) * 0.25); g.add(b); } return g; }
  return g;
}
