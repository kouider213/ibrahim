import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rng, type Rng } from '../games/net.ts';
import { trackTexture, facadeTextures, trainSideTexture, trainFrontTexture, stripeTexture, skylineTexture, glowTexture, cloudTexture, letterTexture, badgeTexture } from './tex.ts';

// Monde de RUSH : 5 décors qui s'enchaînent (tunnel entre deux), 3 voies, trains (dont certains qui foncent vers toi),
// barrières à sauter, portiques à glisser, rampes pour monter sur les toits, pièces, bonus, lettres du mot du jour.
// Distance « s » = mètres parcourus ; dans la scène z = -s. La piste dépend SEULEMENT de la graine → identique à deux.

export const LANES = [-2.4, 0, 2.4] as const;
export const WORLD_LEN = 1100;
export const TRAIN_H = 2.75;
export type ObKind = 'hurdle' | 'gate' | 'block' | 'train' | 'ramp' | 'mtrain';
export interface Ob { kind: ObKind; lane: number; s0: number; s1: number; top: number; mesh: THREE.Object3D; hit: boolean; base0?: number; baseS?: number; len?: number }
export type PowKind = 'magnet' | 'jet' | 'x2' | 'sneakers' | 'board' | 'gift';
export interface Pow { kind: PowKind; s: number; x: number; y: number; mesh: THREE.Object3D; taken: boolean }
export interface Coin { s: number; x: number; y: number; taken: boolean; fly: number; idx: number }
export interface Letter { ch: string; s: number; x: number; y: number; mesh: THREE.Object3D; taken: boolean }

interface Style {
  id: string; name: string; nameAr: string; sky: [string, string, string]; fog: string; fogNear: number; fogFar: number; sun: string; sunI: number; hemi: [string, string, number];
  side: string; gravel: string; facade: 'oran' | 'brick' | 'neon' | 'chalet' | 'adobe' | null; colors: string[]; night: boolean; deco: Array<'palm' | 'lamp' | 'pine' | 'rock' | 'sign' | 'dune' | 'sea' | 'cactus'>;
  skyline: 'city' | 'mountains' | 'dunes' | 'neon' | 'sea'; skyCol: [string, string]; weather?: 'snow' | 'rain' | 'sparks'; trains: Array<[string, string]>; bloom: number; sunPos: [number, number, number]
}
export const WORLDS: Style[] = [
  { id: 'oran', name: 'Oran — Front de Mer', nameAr: 'وهران — الواجهة البحرية', sky: ['#3d6fd1', '#ffb36b', '#ffe3b0'], fog: '#ffcf9e', fogNear: 40, fogFar: 230, sun: '#ffd9a8', sunI: 2.6, hemi: ['#ffe6c7', '#6b4a3a', 1.1],
    side: '#d8c3a5', gravel: '#8a7c70', facade: 'oran', colors: ['#fbf7ef', '#f3e2c4', '#ffffff', '#f6d7a7', '#e9eef5'], night: false, deco: ['palm', 'lamp', 'sea'], skyline: 'city', skyCol: ['#c98a6b', '#e7a985'],
    trains: [['#f2f2f2', '#1f6feb'], ['#e8333a', '#ffd400'], ['#14b8a6', '#ffffff']], bloom: 0.35, sunPos: [-60, 40, -200] },
  { id: 'lille', name: 'Vieux-Lille — L\'heure bleue', nameAr: 'ليل القديمة — الساعة الزرقاء', sky: ['#14214a', '#4b5fa8', '#f0a37a'], fog: '#5a6aa6', fogNear: 30, fogFar: 190, sun: '#ffc48a', sunI: 1.4, hemi: ['#9fb4ff', '#2b2240', 0.9],
    side: '#5a5560', gravel: '#6d6a70', facade: 'brick', colors: ['#c8624a', '#b85440', '#d07a5c', '#a8483a'], night: true, deco: ['lamp', 'lamp'], skyline: 'city', skyCol: ['#2a3060', '#3a4580'], weather: 'rain',
    trains: [['#1e3a8a', '#fbbf24'], ['#f8fafc', '#dc2626'], ['#334155', '#22d3ee']], bloom: 0.8, sunPos: [70, 20, -200] },
  { id: 'sahara', name: 'Sahara — Les Dunes d\'Or', nameAr: 'الصحراء — الكثبان الذهبية', sky: ['#2f7de0', '#8cc6ff', '#ffe9c2'], fog: '#f6d8a8', fogNear: 50, fogFar: 260, sun: '#fff2d8', sunI: 3.2, hemi: ['#fff5e0', '#a0703c', 1.2],
    side: '#e8b56a', gravel: '#c8975c', facade: 'adobe', colors: ['#d9a066', '#e3b47a', '#c98d52'], night: false, deco: ['dune', 'palm', 'rock', 'cactus'], skyline: 'dunes', skyCol: ['#e2a55c', '#efc286'],
    trains: [['#f97316', '#fff7ed'], ['#16a34a', '#fde047'], ['#fefce8', '#b91c1c']], bloom: 0.3, sunPos: [20, 80, -150] },
  { id: 'neon', name: 'Néo-Tokyo — Minuit', nameAr: 'نيو طوكيو — منتصف الليل', sky: ['#05010f', '#1d0b3a', '#5b1a6e'], fog: '#2a0f4a', fogNear: 25, fogFar: 170, sun: '#b18cff', sunI: 0.9, hemi: ['#7c5cff', '#1a0630', 0.8],
    side: '#1a1428', gravel: '#2b2633', facade: 'neon', colors: ['#2a2f45', '#1f2335', '#33304a'], night: true, deco: ['sign', 'lamp'], skyline: 'neon', skyCol: ['#120a24', '#1e1238'], weather: 'sparks',
    trains: [['#0f172a', '#ff2bd6'], ['#111827', '#22d3ee'], ['#1e1b4b', '#a3e635']], bloom: 1.25, sunPos: [0, 30, -200] },
  { id: 'snow', name: 'Atlas — Neige Éternelle', nameAr: 'الأطلس — الثلوج الأبدية', sky: ['#7fb2ff', '#cfe3ff', '#ffffff'], fog: '#e3eefc', fogNear: 35, fogFar: 210, sun: '#ffffff', sunI: 2.4, hemi: ['#ffffff', '#7d8ea8', 1.2],
    side: '#f4f8ff', gravel: '#9aa6b5', facade: 'chalet', colors: ['#8b5a3c', '#a0673f', '#7a4a2e'], night: false, deco: ['pine', 'pine', 'rock'], skyline: 'mountains', skyCol: ['#aebfd8', '#d5e1f2'], weather: 'snow',
    trains: [['#dc2626', '#ffffff'], ['#0369a1', '#e0f2fe'], ['#fafafa', '#16a34a']], bloom: 0.4, sunPos: [-40, 60, -200] },
];
export const worldAt = (s: number) => Math.floor(Math.max(0, s) / WORLD_LEN) % WORLDS.length;

const MAT = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05, ...o });
const UNIT = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

export class RushWorld {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera;
  composer: EffectComposer; bloom: UnrealBloomPass; quality: 'high' | 'low' = 'high';
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fog: THREE.Fog;
  skyMat: THREE.ShaderMaterial; sky: THREE.Mesh; skyline: THREE.Mesh; ground: THREE.Mesh; sideL: THREE.Mesh; sideR: THREE.Mesh; sea: THREE.Mesh;
  obs: Ob[] = []; coins: Coin[] = []; pows: Pow[] = []; letters: Letter[] = [];
  coinMesh: THREE.InstancedMesh; coinFree: number[] = [];
  private chunks: Array<{ s: number; g: THREE.Group }> = []; private nextChunk = 0; private nextGen = 0; private rnd: Rng = rng(1); private envRnd: Rng = rng(2);
  private trackTex: THREE.Texture[]; private facade: Map<string, readonly [THREE.Texture, THREE.Texture]> = new Map();
  private trainSides: THREE.Texture[] = []; private skylines: THREE.Texture[] = [];
  private styleIdx = 0; private shown = 0; // monde affiché (couleurs) / dernier monde appliqué
  private cur = { sky0: new THREE.Color(), sky1: new THREE.Color(), sky2: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), side: new THREE.Color(), sunI: 2, hemiI: 1, bloom: 0.4 };
  weather: THREE.Points; private weatherKind: Style['weather'] | undefined;
  sparks: THREE.Points; private sparkLife: Float32Array; private sparkVel: Float32Array; private sparkN = 0;
  speedLines: THREE.LineSegments; clouds: THREE.Group;
  word = ''; wordGot = new Set<number>(); private wordPlaced = new Set<number>();
  private glowTex = glowTexture(); private badges: Record<PowKind, THREE.Texture>;
  time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.55;
    this.fog = new THREE.Fog('#ffcf9e', 40, 230); this.scene.fog = this.fog;

    // Ciel : dégradé 3 couleurs + halo du soleil
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, sunCol: { value: new THREE.Color('#fff') }, night: { value: 0 }, t: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 c0,c1,c2,sunCol,sunDir; uniform float night,t; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){ float y = vP.y; vec3 col = y > 0.12 ? mix(c1, c0, smoothstep(0.12, 0.7, y)) : mix(c2, c1, smoothstep(-0.05, 0.12, y));
          float d = max(dot(vP, normalize(sunDir)), 0.0); col += sunCol * (pow(d, 600.0) * 2.5 + pow(d, 12.0) * 0.35);
          if (night > 0.5) { vec2 g = floor(vP.xz / max(vP.y, 0.05) * 120.0); float s = step(0.996, h(g)) * smoothstep(0.1, 0.4, y); col += vec3(s) * (0.6 + 0.4 * sin(t * 3.0 + h(g) * 20.0)); }
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat); this.scene.add(this.sky);
    this.skylines = WORLDS.map(w => skylineTexture(w.skyline, w.skyCol[0], w.skyCol[1]));
    this.skyline = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 70, 64, 1, true), new THREE.MeshBasicMaterial({ map: this.skylines[0], transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    (this.skyline.material as THREE.MeshBasicMaterial).map!.repeat.set(3, 1);
    this.skyline.position.y = 22; this.scene.add(this.skyline);
    this.clouds = new THREE.Group(); this.scene.add(this.clouds);
    const ct = cloudTexture();
    for (let i = 0; i < 14; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.85, fog: false, depthWrite: false })); sp.scale.set(70 + Math.random() * 60, 28 + Math.random() * 18, 1); sp.position.set(-250 + Math.random() * 500, 60 + Math.random() * 70, -150 - Math.random() * 300); this.clouds.add(sp); }

    this.hemi = new THREE.HemisphereLight('#fff', '#555', 1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff', 2.5); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); const sc = this.sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 22; sc.bottom = -26; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    // Sol : voies + bas-côtés (suivent le joueur, la texture défile)
    this.trackTex = WORLDS.map(w => trackTexture(w.gravel));
    const tt = this.trackTex[0]!; tt.repeat.set(1, 300 / 8);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 300), MAT('#ffffff', { map: tt, roughness: 0.92 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.scene.add(this.ground);
    const sideGeo = new THREE.PlaneGeometry(200, 300);
    this.sideL = new THREE.Mesh(sideGeo, MAT('#d8c3a5', { roughness: 0.95 })); this.sideL.rotation.x = -Math.PI / 2; this.sideL.position.x = -104.5; this.sideL.position.y = -0.02; this.sideL.receiveShadow = true; this.scene.add(this.sideL);
    this.sideR = new THREE.Mesh(sideGeo, this.sideL.material); this.sideR.rotation.x = -Math.PI / 2; this.sideR.position.x = 104.5; this.sideR.position.y = -0.02; this.sideR.receiveShadow = true; this.scene.add(this.sideR);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), MAT('#1f7fc4', { roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.95 }));
    this.sea.rotation.x = -Math.PI / 2; this.sea.position.set(-216, 0.05, 0); this.scene.add(this.sea);

    // Pièces (une seule « instanced mesh » = rapide sur téléphone)
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 28).rotateX(Math.PI / 2);
    this.coinMesh = new THREE.InstancedMesh(coinGeo, MAT('#ffc93c', { metalness: 1, roughness: 0.22, emissive: new THREE.Color('#7a4b00'), emissiveIntensity: 0.55 }), 420);
    this.coinMesh.castShadow = true; this.coinMesh.frustumCulled = false; this.scene.add(this.coinMesh);
    for (let i = 419; i >= 0; i--) this.coinFree.push(i);
    this.hideAllCoins();

    // Météo (neige / pluie / étincelles) + étincelles d'effets
    const wg = new THREE.BufferGeometry(); const wp = new Float32Array(1500 * 3);
    for (let i = 0; i < wp.length; i += 3) { wp[i] = (Math.random() - 0.5) * 60; wp[i + 1] = Math.random() * 30; wp[i + 2] = -Math.random() * 90 + 10; }
    wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    this.weather = new THREE.Points(wg, new THREE.PointsMaterial({ color: '#fff', size: 0.12, transparent: true, opacity: 0.8, depthWrite: false, map: this.glowTex }));
    this.weather.visible = false; this.weather.frustumCulled = false; this.scene.add(this.weather);
    const sg = new THREE.BufferGeometry(); const sp = new Float32Array(300 * 3); const scol = new Float32Array(300 * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, map: this.glowTex }));
    this.sparks.frustumCulled = false; this.scene.add(this.sparks);
    this.sparkLife = new Float32Array(300); this.sparkVel = new Float32Array(300 * 3);
    // Traits de vitesse
    const lg = new THREE.BufferGeometry(); const lp = new Float32Array(80 * 6);
    for (let i = 0; i < 80; i++) { const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 4; const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.7 + 1.5, z = -Math.random() * 30; lp.set([x, y, z, x, y, z - 2 - Math.random() * 3], i * 6); }
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    this.speedLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    this.speedLines.frustumCulled = false; this.scene.add(this.speedLines);

    this.badges = { magnet: badgeTexture('🧲', 0), jet: badgeTexture('🚀', 205), x2: badgeTexture('⭐', 48), sneakers: badgeTexture('👟', 95), board: badgeTexture('🛹', 185), gift: badgeTexture('🎁', 300) };
    for (let i = 0; i < 8; i++) { const w = WORLDS[i % WORLDS.length]!.trains[i % 3]!; this.trainSides.push(trainSideTexture(w[0], w[1])); }

    // Rendu : bloom (lueurs des néons, pièces) + sortie couleur
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.4, 0.5, 0.82);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.applyStyle(0, 1);
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight);
    this.bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  }
  setQuality(q: 'high' | 'low') {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.25));
    this.sun.castShadow = q === 'high'; this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.resize();
  }

  /** Nouvelle partie : même graine = même piste. */
  reset(seed: number, word: string) {
    for (const o of this.obs) { this.scene.remove(o.mesh); this.disposeGroup(o.mesh); }
    for (const p of this.pows) this.scene.remove(p.mesh);
    for (const l of this.letters) this.scene.remove(l.mesh);
    for (const c of this.chunks) { this.scene.remove(c.g); this.disposeGroup(c.g); }
    this.obs = []; this.pows = []; this.letters = []; this.chunks = []; this.coins = [];
    this.coinFree = []; for (let i = 419; i >= 0; i--) this.coinFree.push(i); this.hideAllCoins();
    this.rnd = rng(seed); this.envRnd = rng(seed ^ 0x5bd1e995); this.nextChunk = -40; this.nextGen = 40; this.word = word; this.wordPlaced.clear();
    this.styleIdx = 0; this.applyStyle(0, 1);
  }

  private hideAllCoins() { const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 420; i++) this.coinMesh.setMatrixAt(i, m); this.coinMesh.instanceMatrix.needsUpdate = true; }

  // ── Couleurs du monde (transition douce) ───────────────────────────────────
  private applyStyle(i: number, k: number) {
    const w = WORLDS[i]!, c = this.cur;
    const L = (col: THREE.Color, hex: string) => col.lerp(new THREE.Color(hex), k);
    L(c.sky0, w.sky[0]); L(c.sky1, w.sky[1]); L(c.sky2, w.sky[2]); L(c.fog, w.fog); L(c.sun, w.sun); L(c.hemiS, w.hemi[0]); L(c.hemiG, w.hemi[1]); L(c.side, w.side);
    c.sunI += (w.sunI - c.sunI) * k; c.hemiI += (w.hemi[2] - c.hemiI) * k; c.bloom += (w.bloom - c.bloom) * k;
    this.skyMat.uniforms.c0!.value.copy(c.sky0); this.skyMat.uniforms.c1!.value.copy(c.sky1); this.skyMat.uniforms.c2!.value.copy(c.sky2);
    this.skyMat.uniforms.sunCol!.value.copy(c.sun); this.skyMat.uniforms.night!.value = w.night ? 1 : 0;
    this.skyMat.uniforms.sunDir!.value.set(...w.sunPos).normalize();
    this.fog.color.copy(c.fog); this.fog.near += (w.fogNear - this.fog.near) * k; this.fog.far += (w.fogFar - this.fog.far) * k;
    this.sun.color.copy(c.sun); this.sun.intensity = c.sunI; this.hemi.color.copy(c.hemiS); this.hemi.groundColor.copy(c.hemiG); this.hemi.intensity = c.hemiI;
    (this.sideL.material as THREE.MeshStandardMaterial).color.copy(c.side);
    this.bloom.strength = c.bloom;
    if (k === 1) {
      this.shown = i;
      (this.skyline.material as THREE.MeshBasicMaterial).map = this.skylines[i]!; this.skylines[i]!.repeat.set(3, 1);
      const tt = this.trackTex[i]!; tt.repeat.set(1, 300 / 8); (this.ground.material as THREE.MeshStandardMaterial).map = tt; (this.ground.material as THREE.MeshStandardMaterial).needsUpdate = true;
      this.sea.visible = w.deco.includes('sea');
      this.weatherKind = w.weather; this.weather.visible = !!w.weather;
      const pm = this.weather.material as THREE.PointsMaterial;
      pm.size = w.weather === 'snow' ? 0.22 : w.weather === 'rain' ? 0.09 : 0.14; pm.color.set(w.weather === 'sparks' ? '#ff7bf0' : w.weather === 'rain' ? '#b8c8ff' : '#ffffff');
      this.clouds.visible = !w.night;
    }
  }

  // ── Décor (morceaux de 40 m de chaque côté) ────────────────────────────────
  private facadeFor(style: NonNullable<Style['facade']>, night: boolean, v: number) {
    const key = `${style}${night}${v}`;
    if (!this.facade.has(key)) this.facade.set(key, facadeTextures(night, style));
    return this.facade.get(key)!;
  }
  private buildChunk(s: number) {
    const R = this.envRnd, wi = worldAt(s + 20), w = WORLDS[wi]!, g = new THREE.Group(); g.position.z = -s;
    const tunnel = this.tunnelAt(s);
    // trottoir / bordure
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(UNIT, MAT(w.night ? '#3a3448' : '#cfc6b8')); curb.scale.set(1.2, 0.25, 40); curb.position.set(side * 5.1, 0, -20); curb.receiveShadow = true; g.add(curb);
    }
    if (tunnel) {
      const tg = new THREE.Group();
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 40, 24, 1, true, -Math.PI / 2, Math.PI), MAT('#3b3a40', { side: THREE.BackSide, roughness: 0.9 }));
      arch.rotation.x = Math.PI / 2; arch.position.set(0, 0, -20); tg.add(arch);
      for (let z = 0; z < 40; z += 5) for (const sd of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 1.6), new THREE.MeshBasicMaterial({ color: '#ffe6a0' })); l.position.set(sd * 5.6, 3.6, -z); tg.add(l);
      }
      g.add(tg);
    } else {
      for (const side of [-1, 1]) {
        const seaSide = side === -1 && w.deco.includes('sea');
        let z = 0;
        while (z < 40) {
          if (seaSide) {   // muret + balustrade face à la mer
            const wall = new THREE.Mesh(UNIT, MAT('#f1e7d6')); wall.scale.set(0.5, 0.9, 40); wall.position.set(-7.5, 0, -20); wall.castShadow = true; g.add(wall);
            for (let k = 0; k < 40; k += 2) { const p = new THREE.Mesh(UNIT, MAT('#ffffff')); p.scale.set(0.12, 0.6, 0.12); p.position.set(-7.5, 0.9, -k); g.add(p); }
            const rail = new THREE.Mesh(UNIT, MAT('#ffffff')); rail.scale.set(0.14, 0.1, 40); rail.position.set(-7.5, 1.5, -20); g.add(rail);
            break;
          }
          if (w.facade && w.deco[0] !== 'dune') {
            const bw = 5 + R() * 6, bh = (w.id === 'neon' ? 14 : 6) + R() * (w.id === 'neon' ? 26 : 10), bd = 6 + R() * 6;
            const [map, em] = this.facadeFor(w.facade, w.night, Math.floor(R() * 2));
            const mm = MAT(R.pick(w.colors), { map, emissiveMap: w.night ? em : null, emissive: new THREE.Color(w.night ? '#ffffff' : '#000000'), emissiveIntensity: w.night ? 1.6 : 0, roughness: 0.85 });
            map.repeat.set(Math.max(1, Math.round(bd / 5)), Math.max(1, Math.round(bh / 6)));
            const b = new THREE.Mesh(UNIT, mm); b.scale.set(bd, bh, bw); b.position.set(side * (9 + bd / 2 + R() * 2), 0, -(z + bw / 2)); b.castShadow = this.quality === 'high'; b.receiveShadow = true; g.add(b);
            if (w.id === 'oran' && R() < 0.5) { const dome = new THREE.Mesh(new THREE.SphereGeometry(Math.min(bd, bw) * 0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#f4f1ea')); dome.position.set(b.position.x, bh, b.position.z); g.add(dome); }
            if (w.id === 'chalet' || w.facade === 'chalet') { const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bd, bw) * 0.75, 3.5, 4), MAT('#f8fbff')); roof.rotation.y = Math.PI / 4; roof.position.set(b.position.x, bh + 1.7, b.position.z); roof.castShadow = true; g.add(roof); }
            if (w.id === 'neon' && R() < 0.6) {
              const hue = Math.floor(R() * 360); const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + R() * 3, 1 + R() * 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${hue},100%,60%)`), side: THREE.DoubleSide }));
              sign.position.set(side * 8.6, 4 + R() * 8, -(z + bw / 2)); sign.rotation.y = side * Math.PI / 2; g.add(sign);
            }
            z += bw + 0.5 + R() * 2;
          } else z = 40;
        }
        // décor de bord de voie
        for (let k = 0; k < 4; k++) {
          const kind = R.pick(w.deco), zz = -(k * 10 + R() * 6), x = side * (6.4 + R() * 1.2);
          if (kind === 'palm') g.add(this.palm(x, zz, R));
          else if (kind === 'lamp') g.add(this.lamp(x, zz, side, w.night));
          else if (kind === 'pine') g.add(this.pine(side * (7 + R() * 8), zz, R));
          else if (kind === 'rock') { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + R() * 1.2, 0), MAT(w.id === 'snow' ? '#8d99ab' : '#b07a48', { roughness: 1 })); r.position.set(side * (7 + R() * 10), 0.2, zz); r.rotation.set(R(), R(), R()); r.castShadow = true; g.add(r); }
          else if (kind === 'cactus') g.add(this.cactus(side * (7 + R() * 8), zz));
          else if (kind === 'sign') { const pole = new THREE.Mesh(UNIT, MAT('#222')); pole.scale.set(0.15, 5, 0.15); pole.position.set(x, 0, zz); g.add(pole); const hue = Math.floor(R() * 360); const pl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(`hsl(${hue},100%,62%)`) })); pl.position.set(x, 5, zz); g.add(pl); }
          else if (kind === 'dune') {
            const dg = new THREE.PlaneGeometry(30, 14, 12, 6); const pos = dg.attributes.position!;
            for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), py = pos.getY(i); pos.setZ(i, Math.max(0, (Math.sin(px * 0.25 + R() * 0.2) + 1) * 2.2 * (1 - Math.abs(py) / 7)) + R() * 0.15); }
            dg.computeVertexNormals();
            const d = new THREE.Mesh(dg, MAT('#e9b86f', { roughness: 1 })); d.rotation.x = -Math.PI / 2; d.position.set(side * (22 + R() * 10), -0.1, zz); d.receiveShadow = true; g.add(d);
          }
        }
      }
    }
    this.scene.add(g); this.chunks.push({ s, g });
  }
  private palm(x: number, z: number, R: Rng) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const h = 4.5 + R() * 2.5, lean = (R() - 0.5) * 0.4;
    for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, h / 6, 8), MAT('#8a6a45', { roughness: 1 })); seg.position.set(lean * i * 0.4, h / 12 + i * h / 6, 0); seg.castShadow = true; g.add(seg); }
    const top = new THREE.Vector3(lean * 2.4, h, 0);
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4, 1), MAT(i % 2 ? '#2f8f3a' : '#3ea84a', { roughness: 0.8 }));
      leaf.scale.z = 0.15; leaf.position.copy(top); leaf.rotation.set(0, (i / 8) * Math.PI * 2, 0); leaf.rotateX(1.9); leaf.translateY(1.2); leaf.castShadow = true; g.add(leaf);
    }
    return g;
  }
  private lamp(x: number, z: number, side: number, night: boolean) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 8), MAT('#2b2b33', { metalness: 0.6, roughness: 0.4 })); pole.position.y = 2.2; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), pole.material); arm.position.set(-side * 0.55, 4.35, 0); g.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: night ? '#ffe2a0' : '#fff8e0' })); bulb.position.set(-side * 1.1, 4.2, 0); g.add(bulb);
    if (night) { const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffcf7a', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(3, 3, 1); halo.position.copy(bulb.position); g.add(halo); }
    return g;
  }
  private pine(x: number, z: number, R: Rng) {
    const g = new THREE.Group(); g.position.set(x, 0, z); const s = 0.8 + R() * 0.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.2 * s, 6), MAT('#5b3a24')); trunk.position.y = 0.6 * s; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry((1.6 - i * 0.4) * s, 1.8 * s, 9), MAT('#2f6b45', { roughness: 0.9 })); c.position.y = (1.4 + i * 1.0) * s; c.castShadow = true; g.add(c);
      const snow = new THREE.Mesh(new THREE.ConeGeometry((0.9 - i * 0.25) * s, 0.7 * s, 9), MAT('#ffffff')); snow.position.y = (1.95 + i * 1.0) * s; g.add(snow);
    }
    return g;
  }
  private cactus(x: number, z: number) {
    const g = new THREE.Group(); g.position.set(x, 0, z); const m = MAT('#3f8f4f');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 2, 4, 10), m); body.position.y = 1.3; body.castShadow = true; g.add(body);
    for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.7, 4, 8), m); a.position.set(s * 0.5, 1.5 + s * 0.2, 0); g.add(a); }
    return g;
  }
  tunnelAt(s: number) { const k = Math.round(s / WORLD_LEN); return k > 0 && Math.abs(s + 20 - k * WORLD_LEN) <= 40; }

  // ── Générateur de piste (graine) ───────────────────────────────────────────
  private trainMesh(len: number, lane: number, style: Style, moving: boolean) {
    const R = this.rnd, g = new THREE.Group();
    const [base, stripe] = R.pick(style.trains);
    const side = this.trainSides[Math.floor(R() * this.trainSides.length)]!.clone(); side.needsUpdate = true; side.userData.own = true; side.wrapS = THREE.RepeatWrapping; side.repeat.set(Math.max(1, len / 9), 1);
    const sideM = MAT('#ffffff', { map: side, roughness: 0.45, metalness: 0.25 });
    const roofM = MAT('#9aa3ad', { roughness: 0.4, metalness: 0.6 });
    const front = trainFrontTexture(base); front.userData.own = true;
    const frontM = MAT('#ffffff', { map: front, roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(moving ? '#ff3b3b' : '#000'), emissiveIntensity: moving ? 0.25 : 0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.15, TRAIN_H - 0.35, len), [sideM, sideM, roofM, roofM, frontM, frontM]);
    body.position.y = 0.35 + (TRAIN_H - 0.35) / 2; body.position.z = -len / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, len, 16, 1, false, 0, Math.PI), roofM); roof.rotation.x = Math.PI / 2; roof.rotation.z = 0; roof.scale.set(1, 1, 0.18); roof.position.set(0, TRAIN_H - 0.02, -len / 2);
    roof.rotation.set(Math.PI / 2, 0, 0); roof.geometry.rotateZ(Math.PI / 2); g.add(roof);
    const stripeM = MAT(stripe, { emissive: new THREE.Color(style.night ? stripe : '#000'), emissiveIntensity: style.night ? 0.8 : 0 });
    for (const sx of [-1.08, 1.08]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, len - 0.4), stripeM); st.position.set(sx, 0.55, -len / 2); g.add(st); }
    const wheelM = MAT('#1b1c20', { metalness: 0.7, roughness: 0.4 });
    for (const zz of [1.6, len - 1.6]) for (const sx of [-0.7, 0.7]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 14), wheelM); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.32, -zz); g.add(w); }
    if (moving) for (const sx of [-0.7, 0.7]) { const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#fff2c0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); hl.scale.set(2.2, 2.2, 1); hl.position.set(sx, 0.9, 0.05); g.add(hl); }
    g.position.x = LANES[lane]!;
    return g;
  }
  private rampMesh(lane: number) {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(6, 0); sh.lineTo(6, TRAIN_H); sh.lineTo(0, 0.05);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.0, bevelEnabled: false }); geo.rotateY(Math.PI / 2); geo.translate(-1.0, 0, 0);
    const m = new THREE.Mesh(geo, [MAT('#ffd400', { map: this.stripe('#ffd400', '#1a1a1a', 4), roughness: 0.5 }), MAT('#2a2a2a')]);
    m.castShadow = true; m.receiveShadow = true;
    const g = new THREE.Group(); g.add(m); g.position.x = LANES[lane]!; return g;
  }
  private hurdleMesh(lane: number, style: Style) {
    const g = new THREE.Group(); const post = MAT('#e5e7eb', { metalness: 0.5, roughness: 0.4 });
    for (const sx of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), post); p.position.set(sx, 0.52, 0); p.castShadow = true; g.add(p); const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), post); f.position.set(sx, 0.03, 0); g.add(f); }
    const tex = this.stripe('#ffffff', '#e8333a', 5);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.1), MAT('#ffffff', { map: tex, roughness: 0.4, emissive: new THREE.Color(style.night ? '#ff3b3b' : '#000'), emissiveIntensity: style.night ? 0.25 : 0 }));
    board.position.y = 0.8; board.castShadow = true; g.add(board);
    g.position.x = LANES[lane]!; return g;
  }
  private gateMesh(lane: number) {
    const g = new THREE.Group(); const post = MAT('#374151', { metalness: 0.6, roughness: 0.35 });
    for (const sx of [-1.0, 1.0]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), post); p.position.set(sx, 1.3, 0); p.castShadow = true; g.add(p); }
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 0.14), MAT('#ffd400', { map: this.stripe('#ffd400', '#111111', 6), roughness: 0.4 })); board.position.y = 1.85; board.castShadow = true; g.add(board);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff8a00' })); lamp.position.set(0, 2.45, 0); lamp.name = 'blink'; g.add(lamp);
    g.position.x = LANES[lane]!; return g;
  }
  private blockMesh(lane: number) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 1.4), MAT('#2563eb', { roughness: 0.5, metalness: 0.2 })); b.position.y = 1.0; b.castShadow = true; b.receiveShadow = true; g.add(b);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.42), MAT('#ffffff', { map: this.stripe('#ffffff', '#e8333a', 6) })); band.position.y = 1.5; g.add(band);
    g.position.x = LANES[lane]!; return g;
  }
  private stripes = new Map<string, THREE.Texture>();
  private stripe(a: string, b: string, n: number) { const k = a + b + n; if (!this.stripes.has(k)) this.stripes.set(k, stripeTexture(a, b, n)); return this.stripes.get(k)!; }
  private addOb(o: Omit<Ob, 'hit'>) { o.mesh.position.z = -o.s0; this.scene.add(o.mesh); this.obs.push({ ...o, hit: false }); }
  private coinLine(lane: number, s0: number, n: number, y: number | ((i: number) => number) = 0.9, gap = 2.2) {
    for (let i = 0; i < n; i++) {
      const idx = this.coinFree.pop(); if (idx === undefined) return;
      this.coins.push({ s: s0 + i * gap, x: LANES[lane]!, y: typeof y === 'function' ? y(i) : y, taken: false, fly: 0, idx });
    }
  }
  private addPow(kind: PowKind, lane: number, s: number, y = 1.1) {
    const g = new THREE.Group();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badges[kind], depthWrite: false })); sp.scale.set(1.25, 1.25, 1); g.add(sp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#fff3b0', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(2.6, 2.6, 1); g.add(halo);
    g.position.set(LANES[lane]!, y, -s); this.scene.add(g); this.pows.push({ kind, s, x: LANES[lane]!, y, mesh: g, taken: false });
  }
  private addLetter(i: number, lane: number, s: number) {
    const ch = this.word[i]!; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(ch), depthWrite: false })); sp.scale.set(1.3, 1.3, 1);
    sp.position.set(LANES[lane]!, 1.3, -s); this.scene.add(sp); this.letters.push({ ch, s, x: LANES[lane]!, y: 1.3, mesh: sp, taken: false });
  }
  /** Trajectoire de pièces au-dessus d'une barrière (saut). */
  private arc(lane: number, sCenter: number) { this.coinLine(lane, sCenter - 5, 6, i => 0.9 + Math.sin((i / 5) * Math.PI) * 1.9, 2); }

  private genSegment(s: number): number {
    const R = this.rnd, w = WORLDS[worldAt(s)]!;
    const d = Math.min(1, s / 5000);   // difficulté 0 → 1
    if (this.tunnelAt(s) || this.tunnelAt(s + 30)) { this.coinLine(1, s, 12, 0.9, 2.5); return 34; }
    const powChance = 0.11, letterIdx = this.word ? Math.floor(s / 260) : -1;
    const maybePow = (lane: number, ss: number, y = 1.1) => {
      if (R.chance(powChance)) this.addPow(R.pick<PowKind>(['magnet', 'magnet', 'jet', 'x2', 'x2', 'sneakers', 'board', 'gift']), lane, ss, y);
      else if (letterIdx >= 0 && letterIdx < this.word.length * 3 && !this.wordPlaced.has(letterIdx % this.word.length) && !this.wordGot.has(letterIdx % this.word.length) && R.chance(0.35)) { this.wordPlaced.add(letterIdx % this.word.length); this.addLetter(letterIdx % this.word.length, lane, ss); }
    };
    const pat = R();
    const gapBase = 26 - d * 6;
    if (pat < 0.22) {   // 1 ou 2 obstacles simples
      const lanes = [0, 1, 2].sort(() => R() - 0.5); const n = R.chance(0.35 + d * 0.4) ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const k = R.pick<ObKind>(['hurdle', 'hurdle', 'gate', 'block']), l = lanes[i]!;
        const mesh = k === 'hurdle' ? this.hurdleMesh(l, w) : k === 'gate' ? this.gateMesh(l) : this.blockMesh(l);
        this.addOb({ kind: k, lane: l, s0: s, s1: s + (k === 'block' ? 1.4 : 0.3), top: k === 'hurdle' ? 1.05 : k === 'gate' ? 2.6 : 2.0, mesh });
        if (k === 'hurdle' && R.chance(0.6)) this.arc(l, s);
      }
      const free = lanes[n]!; this.coinLine(free, s - 8, 8); maybePow(free, s + 12);
      return gapBase;
    }
    if (pat < 0.36) {   // rangée complète : tout le monde saute OU tout le monde glisse
      const k: ObKind = R.chance(0.5) ? 'hurdle' : 'gate';
      for (let l = 0; l < 3; l++) this.addOb({ kind: k, lane: l, s0: s, s1: s + 0.3, top: k === 'hurdle' ? 1.05 : 2.6, mesh: k === 'hurdle' ? this.hurdleMesh(l, w) : this.gateMesh(l) });
      const cl = R.int(0, 2); if (k === 'hurdle') this.arc(cl, s); else this.coinLine(cl, s - 4, 5, 0.5);
      return gapBase + 2;
    }
    if (pat < 0.72) {   // trains (1 ou 2 voies), parfois avec rampe → toits
      const nTrains = R.chance(0.45 + d * 0.3) ? 2 : 1; const lanes = [0, 1, 2].sort(() => R() - 0.5);
      let longest = 0;
      for (let i = 0; i < nTrains; i++) {
        const l = lanes[i]!, len = R.pick([12, 18, 24, 30]), ramp = R.chance(0.42);
        const s0 = s + (ramp ? 6 : 0);
        if (ramp) { this.addOb({ kind: 'ramp', lane: l, s0: s, s1: s + 6, top: TRAIN_H, mesh: this.rampMesh(l) }); this.coinLine(l, s + 1, 3, j => 1 + j * 0.9, 2); }
        this.addOb({ kind: 'train', lane: l, s0, s1: s0 + len, top: TRAIN_H, mesh: this.trainMesh(len, l, w, false), len });
        if (ramp || R.chance(0.5)) this.coinLine(l, s0 + 2, Math.floor(len / 2.4), TRAIN_H + 0.9, 2.2);
        if (R.chance(0.35)) maybePow(l, s0 + len * 0.6, TRAIN_H + 1.1);
        longest = Math.max(longest, s0 + len - s);
      }
      const free = lanes[nTrains]!;
      if (nTrains === 2) {
        // la voie libre reste passable : barrière éventuelle seulement (jamais un mur)
        if (R.chance(0.4 + d * 0.3)) { const k: ObKind = R.chance(0.5) ? 'hurdle' : 'gate'; const zz = s + longest * 0.5; this.addOb({ kind: k, lane: free, s0: zz, s1: zz + 0.3, top: k === 'hurdle' ? 1.05 : 2.6, mesh: k === 'hurdle' ? this.hurdleMesh(free, w) : this.gateMesh(free) }); if (k === 'hurdle') this.arc(free, zz); }
        else this.coinLine(free, s, Math.floor(longest / 2.4), 0.9, 2.4);
      } else {
        this.coinLine(free, s, 8); maybePow(lanes[2]!, s + 10);
      }
      return longest + gapBase * 0.7;
    }
    if (pat < 0.84 && s > 400) {   // train qui fonce vers toi (lumières rouges)
      const l = R.int(0, 2), len = 20;
      this.addOb({ kind: 'mtrain', lane: l, s0: s + 116, s1: s + 116 + len, top: TRAIN_H, mesh: this.trainMesh(len, l, w, true), base0: s + 116, baseS: s - 140, len });
      const others = [0, 1, 2].filter(x => x !== l);
      for (const o of others) { if (R.chance(0.5)) { const zz = s + 30 + R() * 60; const k: ObKind = R.chance(0.5) ? 'hurdle' : 'gate'; this.addOb({ kind: k, lane: o, s0: zz, s1: zz + 0.3, top: k === 'hurdle' ? 1.05 : 2.6, mesh: k === 'hurdle' ? this.hurdleMesh(o, w) : this.gateMesh(o) }); } else this.coinLine(o, s + 10, 14, 0.9, 2.6); }
      return 150;
    }
    // zigzag de pièces + blocs en quinconce
    const order = R.chance(0.5) ? [0, 1, 2] : [2, 1, 0];
    for (let i = 0; i < 3; i++) {
      const l = order[i]!, zz = s + i * 14;
      this.addOb({ kind: 'block', lane: (l + 1) % 3, s0: zz, s1: zz + 1.4, top: 2.0, mesh: this.blockMesh((l + 1) % 3) });
      this.coinLine(l, zz - 4, 4);
    }
    maybePow(order[2]!, s + 34);
    return 42 + gapBase * 0.5;
  }

  /** Jetpack : une route de pièces dans le ciel. */
  skyCoins(s0: number, len: number) {
    let lane = 1;
    for (let k = 0; k < len; k += 12) { this.coinLine(lane, s0 + k, 5, 7.2, 2.2); if (this.rnd.chance(0.5)) lane = Math.max(0, Math.min(2, lane + (this.rnd.chance(0.5) ? 1 : -1))); }
  }
  /** Seconde chance : on dégage la piste devant. */
  clearAhead(s: number, len: number) {
    for (let i = this.obs.length - 1; i >= 0; i--) { const o = this.obs[i]!; if (o.s1 > s - 2 && o.s0 < s + len) { this.burst(LANES[o.lane]!, 1.2, Math.max(s, o.s0), '#ffffff', 10, 6); this.scene.remove(o.mesh); this.disposeGroup(o.mesh); this.obs.splice(i, 1); } }
  }
  /** Hauteur du sol sous le joueur (rampes, toits des trains). */
  groundAt(x: number, s: number) {
    let h = 0;
    for (const o of this.obs) {
      if (Math.abs(LANES[o.lane]! - x) > 1.15 || s < o.s0 - 0.2 || s > o.s1 + 0.2) continue;
      if (o.kind === 'train' || o.kind === 'mtrain') h = Math.max(h, o.top);
      else if (o.kind === 'ramp') h = Math.max(h, Math.min(1, Math.max(0, (s - o.s0) / (o.s1 - o.s0))) * o.top);
    }
    return h;
  }

  /** Remplit la piste devant le joueur, nettoie derrière. */
  update(dt: number, ps: number, px: number, py: number, fast: number) {
    this.time += dt;
    while (this.nextChunk < ps + 220) { this.buildChunk(this.nextChunk); this.nextChunk += 40; }
    while (this.nextGen < ps + 180) this.nextGen += this.genSegment(this.nextGen);
    for (let i = this.chunks.length - 1; i >= 0; i--) if (this.chunks[i]!.s + 40 < ps - 30) { this.disposeGroup(this.chunks[i]!.g); this.scene.remove(this.chunks[i]!.g); this.chunks.splice(i, 1); }
    for (let i = this.obs.length - 1; i >= 0; i--) {
      const o = this.obs[i]!;
      if (o.kind === 'mtrain') { const nz = o.base0! - Math.max(0, ps - o.baseS!) * 0.6; o.s0 = nz; o.s1 = nz + o.len!; o.mesh.position.z = -o.s0; }
      if (o.s1 < ps - 20) { this.scene.remove(o.mesh); this.disposeGroup(o.mesh); this.obs.splice(i, 1); continue; }
      const b = o.mesh.getObjectByName('blink'); if (b) b.visible = Math.sin(this.time * 8) > 0;
    }
    for (let i = this.pows.length - 1; i >= 0; i--) { const p = this.pows[i]!; p.mesh.position.y = p.y + Math.sin(this.time * 3 + p.s) * 0.15; if (p.s < ps - 10 || p.taken) { this.scene.remove(p.mesh); this.pows.splice(i, 1); } }
    for (let i = this.letters.length - 1; i >= 0; i--) { const l = this.letters[i]!; l.mesh.position.y = l.y + Math.sin(this.time * 3) * 0.15; if (l.s < ps - 10 || l.taken) { this.scene.remove(l.mesh); this.letters.splice(i, 1); } }
    // pièces : rotation, aspiration (aimant) et recyclage
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i]!;
      if (c.s < ps - 6 || c.fly > 1) { this.coinMesh.setMatrixAt(c.idx, m.makeScale(0, 0, 0)); this.coinFree.push(c.idx); this.coins.splice(i, 1); continue; }
      if (c.fly > 0) { c.fly += dt * 5; c.x += (px - c.x) * Math.min(1, dt * 14); c.y += (py + 1.2 - c.y) * Math.min(1, dt * 14); c.s += (ps + 0.5 - c.s) * Math.min(1, dt * 14); }
      e.set(0, this.time * 3.2 + c.s * 0.3, 0); q.setFromEuler(e); v.set(c.x, c.y + Math.sin(this.time * 4 + c.s) * 0.06, -c.s);
      sc.setScalar(c.taken && c.fly === 0 ? 0 : 1 - Math.max(0, c.fly - 0.6));
      this.coinMesh.setMatrixAt(c.idx, m.compose(v, q, sc));
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;

    // monde courant : transition des couleurs quand on sort du tunnel
    const wi = worldAt(ps + 10);
    if (wi !== this.styleIdx) this.styleIdx = wi;
    this.applyStyle(this.styleIdx, Math.min(1, dt * 1.2));
    if (this.shown !== this.styleIdx && this.tunnelAt(ps)) this.applyStyle(this.styleIdx, 1);

    // sol, ciel, soleil qui suivent
    const z = -ps;
    this.ground.position.z = z - 120; this.sideL.position.z = z - 120; this.sideR.position.z = z - 120; this.sea.position.z = z - 100;
    const tt = (this.ground.material as THREE.MeshStandardMaterial).map!; tt.offset.y = (ps / 8) % 1;
    this.sky.position.set(0, 0, z); this.skyline.position.z = z; this.clouds.position.z = z * 0.92;
    this.sun.position.set(px + 12, 30, z + 18); this.sun.target.position.set(px, 0, z - 6);
    this.skyMat.uniforms.t!.value = this.time;
    // météo
    if (this.weather.visible) {
      const pos = this.weather.geometry.attributes.position as THREE.BufferAttribute; const a = pos.array as Float32Array;
      const fall = this.weatherKind === 'rain' ? 22 : this.weatherKind === 'snow' ? 3 : 1.5;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1]! -= fall * dt; if (this.weatherKind === 'snow') a[i]! += Math.sin(this.time + i) * dt * 0.6; if (this.weatherKind === 'sparks') a[i + 1]! += Math.sin(this.time * 2 + i) * dt * 2;
        if (a[i + 1]! < 0 || a[i + 2]! > z + 12 || a[i + 2]! < z - 90) { a[i] = px + (Math.random() - 0.5) * 50; a[i + 1] = 6 + Math.random() * 24; a[i + 2] = z - Math.random() * 90 + 10; }
      }
      pos.needsUpdate = true;
    }
    // étincelles
    const sp = this.sparks.geometry.attributes.position as THREE.BufferAttribute, sa = sp.array as Float32Array;
    for (let i = 0; i < 300; i++) {
      if (this.sparkLife[i]! <= 0) { sa[i * 3 + 1] = -100; continue; }
      this.sparkLife[i]! -= dt; this.sparkVel[i * 3 + 1]! -= 9 * dt;
      sa[i * 3]! += this.sparkVel[i * 3]! * dt; sa[i * 3 + 1]! += this.sparkVel[i * 3 + 1]! * dt; sa[i * 3 + 2]! += this.sparkVel[i * 3 + 2]! * dt;
    }
    sp.needsUpdate = true;
    // traits de vitesse
    (this.speedLines.material as THREE.LineBasicMaterial).opacity = Math.max(0, fast) * 0.45;
    this.speedLines.position.set(px, py, z - 2);
    const lp = this.speedLines.geometry.attributes.position as THREE.BufferAttribute, la = lp.array as Float32Array;
    if (fast > 0) { for (let i = 0; i < la.length; i += 6) { la[i + 2]! += dt * 60; la[i + 5]! += dt * 60; if (la[i + 2]! > 4) { la[i + 2]! -= 34; la[i + 5]! -= 34; } } lp.needsUpdate = true; }
  }
  burst(x: number, y: number, s: number, color: string, n = 14, power = 5) {
    const col = new THREE.Color(color); const ca = (this.sparks.geometry.attributes.color as THREE.BufferAttribute).array as Float32Array; const pa = (this.sparks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < n; k++) {
      const i = this.sparkN = (this.sparkN + 1) % 300;
      pa[i * 3] = x; pa[i * 3 + 1] = y; pa[i * 3 + 2] = -s;
      this.sparkVel[i * 3] = (Math.random() - 0.5) * power; this.sparkVel[i * 3 + 1] = Math.random() * power; this.sparkVel[i * 3 + 2] = (Math.random() - 0.5) * power;
      this.sparkLife[i] = 0.4 + Math.random() * 0.4; ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b;
    }
    (this.sparks.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  private disposeGroup(g: THREE.Object3D) {
    g.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
      if (m.geometry && m.geometry !== UNIT && m.isMesh) m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material as THREE.Material | THREE.Material[])) { const mp = (mat as THREE.MeshStandardMaterial).map; if (mp?.userData.own) mp.dispose(); mat.dispose(); }
    });
  }
  render() { if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera); }
}
