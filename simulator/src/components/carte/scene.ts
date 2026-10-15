// Ville 3D low-poly (three.js) : tous les métiers FIK posés comme dans un jeu de gestion.
// Décor construit une fois ; voitures, bateau, biens et étiquettes reconstruits à chaque update(world).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { STATUS, ZONE_INFO, type World, type ZoneId, type MapCar } from './data.ts';

export type Pick = { kind: 'car'; id: string } | { kind: 'zone'; zone: ZoneId } | null;
export type SkyMode = 'auto' | 'jour' | 'nuit';
// Météo réelle (Open-Meteo, codes WMO) : pluie, nuages, vent → la ville réagit
export interface Weather { code: number; temp: number; wind: number; clouds: number }
export interface SceneApi {
  update: (w: World) => void;
  setSky: (mode: SkyMode, tz?: string) => void;
  setWeather: (w: Weather | null) => void;
  burst: (p: Pick, text: string) => void;  // pluie de pièces + gain qui monte (mission réussie)
  focus: (p: Pick) => void;
  zoom: (k: number) => void;
  reset: () => void;
  resize: () => void;
  dispose: () => void;
}

// ── Plan de la ville (x → est, z → sud, y → haut) ────────────────────────────
const Z: Record<ZoneId, { x: number; z: number; w: number; d: number }> = {
  port:     { x: -21, z: -11, w: 14, d: 8 },
  atelier:  { x: -8.5, z: -9, w: 7, d: 8 },
  agence:   { x: 0, z: -9, w: 6, d: 7 },
  parking:  { x: 13, z: -8.5, w: 16, d: 11 },
  packs:    { x: 27, z: -11, w: 9, d: 7 },
  vente:    { x: -17, z: 10, w: 15, d: 12 },
  b2b:      { x: -3.5, z: 8, w: 5, d: 5 },
  web:      { x: 3.5, z: 8, w: 5, d: 5 },
  ville:    { x: 0, z: 15, w: 14, d: 6 },
  immo:     { x: 16, z: 11, w: 12, d: 13 },
  aeroport: { x: 37, z: 8, w: 9, d: 22 },
};
// Boucle routière parcourue par les voitures en location
const LOOP = { x0: -26, x1: 27, z0: 0, z1: 21 };
const LOOP_LEN = 2 * ((LOOP.x1 - LOOP.x0) + (LOOP.z1 - LOOP.z0));
function loopAt(s: number): { x: number; z: number; a: number } {
  const W = LOOP.x1 - LOOP.x0, H = LOOP.z1 - LOOP.z0;
  let d = ((s % LOOP_LEN) + LOOP_LEN) % LOOP_LEN;
  if (d < W) return { x: LOOP.x0 + d, z: LOOP.z0 - 0.7, a: 0 };
  d -= W; if (d < H) return { x: LOOP.x1 + 0.7, z: LOOP.z0 + d, a: -Math.PI / 2 };
  d -= H; if (d < W) return { x: LOOP.x1 - d, z: LOOP.z1 + 0.7, a: Math.PI };
  d -= W; return { x: LOOP.x0 - 0.7, z: LOOP.z1 - d, a: Math.PI / 2 };
}
// Virages arrondis : moyenne de quelques points de la boucle → la voiture tourne en douceur
function loopSmooth(s: number): { x: number; z: number; a: number } {
  let x = 0, z = 0;
  for (const k of [-1, -0.5, 0, 0.5, 1]) { const p = loopAt(s + k); x += p.x / 5; z += p.z / 5; }
  const a0 = loopAt(s - 0.6), a1 = loopAt(s + 0.6), b0 = loopAt(s - 1.1), b1 = loopAt(s + 0.1);
  const dx = (a1.x - a0.x) + (b1.x - b0.x) * 0.5, dz = (a1.z - a0.z) + (b1.z - b0.z) * 0.5;
  return { x, z, a: Math.atan2(-dz, dx) };
}
// Emplacements
const PARK: Array<[number, number]> = [];
for (const row of [-12.6, -9.8, -6.6, -3.8]) for (let i = 0; i < 12; i++) PARK.push([6.2 + i * 1.25, row]);
const GARAGE: Array<[number, number]> = [];
for (const row of [-11.5, -8.5, -5.6]) for (let i = 0; i < 4; i++) GARAGE.push([-11.2 + i * 1.5, row]);
const SALE: Array<[number, number]> = [];
for (const row of [12.5, 15.2]) for (let i = 0; i < 8; i++) SALE.push([-23.5 + i * 1.35, row]);
const IMMO: Array<[number, number]> = [[11.5, 7], [15, 7], [18.5, 7], [11.5, 11.5], [15, 11.5], [18.5, 11.5], [11.5, 16], [15, 16], [18.5, 16]];

const mat = (() => {
  const cache = new Map<string, THREE.MeshLambertMaterial>();
  return (c: string, opts: { transparent?: boolean; opacity?: number } = {}) => {
    const k = `${c}|${opts.opacity ?? 1}`;
    let m = cache.get(k);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: c, ...opts }); cache.set(k, m); }
    return m;
  };
})();
const shiny = (() => {
  const cache = new Map<string, THREE.MeshPhongMaterial>();
  return (c: string, sh = 70) => {
    const k = `${c}|${sh}`;
    let m = cache.get(k);
    if (!m) { m = new THREE.MeshPhongMaterial({ color: c, shininess: sh, specular: '#ffffff' }); cache.set(k, m); }
    return m;
  };
})();
// Matériaux qui changent avec l'heure : fenêtres allumées, phares, lampadaires
const WIN = new THREE.MeshLambertMaterial({ color: '#e0f2fe', emissive: '#fcd34d', emissiveIntensity: 0 });
const WIN2 = new THREE.MeshLambertMaterial({ color: '#c7d2fe', emissive: '#fde68a', emissiveIntensity: 0 });
const HEAD = new THREE.MeshLambertMaterial({ color: '#fef9c3', emissive: '#fef08a', emissiveIntensity: 0.2 });
const TAIL = new THREE.MeshLambertMaterial({ color: '#b91c1c', emissive: '#ef4444', emissiveIntensity: 0.2 });
const GLASS = new THREE.MeshPhongMaterial({ color: '#1e293b', shininess: 120, specular: '#e0f2fe' });
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const GLOW = new THREE.SpriteMaterial({ map: glowTex, color: '#fde68a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const POOL = new THREE.MeshBasicMaterial({ map: glowTex, color: '#fbbf24', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const BEAM = new THREE.MeshBasicMaterial({ map: glowTex, color: '#fef3c7', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
const PLANE = new THREE.PlaneGeometry(1, 1);
// Peinture réaliste (le statut se lit sur l'anneau au sol, plus sur la carrosserie)
const PAINTS = ['#f8fafc', '#111827', '#9ca3af', '#b91c1c', '#1d4ed8', '#e5e7eb', '#374151', '#7f1d1d', '#065f46', '#d6d3d1', '#0c4a6e', '#f8fafc'];
export const paintOf = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0; return PAINTS[Math.abs(h) % PAINTS.length]!; };
const kindOf = (name: string): 'city' | 'suv' | 'van' =>
  /tucson|duster|rav ?4|sportage|tiguan|q3|q5|x1|x3|kuga|3008|5008|creta|qashqai|jeep|touareg|sorento|santa ?fe|c-hr|t-roc|arkana|captur|kadjar|bigster|jogger|land|prado|hilux/i.test(name) ? 'suv'
  : /berlingo|kangoo|jumpy|trafic|partner|caddy|master|sprinter|vito|expert|transit|ducato|boxer|h1|staria|doblo|combo/i.test(name) ? 'van' : 'city';
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);

function box(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, color: string | THREE.Material, shadow = true) {
  const m = new THREE.Mesh(BOX, typeof color === 'string' ? mat(color) : color);
  m.scale.set(w, h, d); m.position.set(x, y + h / 2, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m); return m;
}
function cyl(parent: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, color: string) {
  const m = new THREE.Mesh(CYL, mat(color));
  m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); m.castShadow = true;
  parent.add(m); return m;
}
function tag(parent: THREE.Object3D, mesh: THREE.Object3D, zone: ZoneId) {
  mesh.traverse(o => { o.userData['zone'] = zone; }); parent.add(mesh);
}

function makeCar(color: string, scale = 1, kind: 'city' | 'suv' | 'van' = 'city'): THREE.Group {
  const g = new THREE.Group(), paint = shiny(color, 60);
  const L = kind === 'van' ? 2.1 : 1.9, hi = kind === 'suv' ? 0.12 : 0;
  box(g, 0, 0.2 + hi, 0, L, 0.42, 0.92, paint);                                  // caisse
  box(g, L / 2 - 0.02, 0.2 + hi, 0, 0.08, 0.2, 0.94, '#27272a');                  // pare-chocs
  box(g, -L / 2 + 0.02, 0.2 + hi, 0, 0.08, 0.2, 0.94, '#27272a');
  if (kind === 'van') {
    box(g, -0.15, 0.62 + hi, 0, 1.7, 0.62, 0.9, paint);                           // grand volume
    box(g, 0.62, 0.66, 0, 0.3, 0.42, 0.86, GLASS, false);                         // pare-brise
    box(g, -0.15, 0.85, 0, 1.4, 0.24, 0.92, GLASS, false);                        // vitres latérales
  } else {
    box(g, -0.12, 0.62 + hi, 0, 1.08, 0.4, 0.84, GLASS);                           // habitacle vitré
    box(g, -0.14, 1.02 + hi, 0, 0.92, 0.06, 0.78, paint);                          // toit
    box(g, 0.43, 0.62 + hi, 0, 0.04, 0.4, 0.8, paint, false);                      // montants
    box(g, -0.67, 0.62 + hi, 0, 0.04, 0.4, 0.8, paint, false);
    if (kind === 'suv') box(g, -0.14, 1.08 + hi, 0, 0.7, 0.04, 0.7, '#3f3f46', false); // barres de toit
  }
  const wheels: THREE.Object3D[] = [];
  const wr = kind === 'suv' ? 0.26 : 0.22;
  for (const [wx, wz] of [[0.6, 0.47], [-0.6, 0.47], [0.6, -0.47], [-0.6, -0.47]] as const) {
    const w = new THREE.Group(); w.position.set(wx * (L / 1.9), wr, wz);
    const tyre = new THREE.Mesh(CYL, mat('#111113')); tyre.scale.set(wr, 0.18, wr); tyre.rotation.x = Math.PI / 2; w.add(tyre);
    const rim = new THREE.Mesh(CYL, shiny('#d4d4d8', 90)); rim.scale.set(wr * 0.55, 0.19, wr * 0.55); rim.rotation.x = Math.PI / 2; w.add(rim);
    const spoke = new THREE.Mesh(BOX, mat('#71717a')); spoke.scale.set(wr * 1.1, 0.06, 0.2); spoke.position.z = wz > 0 ? 0.1 : -0.1; w.add(spoke);
    g.add(w); wheels.push(w);
  }
  box(g, L / 2, 0.38 + hi, 0.3, 0.03, 0.1, 0.2, HEAD, false); box(g, L / 2, 0.38 + hi, -0.3, 0.03, 0.1, 0.2, HEAD, false);
  box(g, -L / 2, 0.4 + hi, 0.34, 0.03, 0.1, 0.16, TAIL, false); box(g, -L / 2, 0.4 + hi, -0.34, 0.03, 0.1, 0.16, TAIL, false);
  g.userData['wheels'] = wheels;
  g.scale.setScalar(scale);
  return g;
}

function tree(p: THREE.Object3D, x: number, z: number, s = 1) {
  cyl(p, x, 0, z, 0.12 * s, 0.7 * s, '#92400e');
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.3 * s, 7), mat('#22c55e'));
  top.position.set(x, 1.25 * s, z); top.castShadow = true; p.add(top);
}
function palm(p: THREE.Object3D, x: number, z: number) {
  cyl(p, x, 0, z, 0.1, 2.2, '#a16207');
  for (let i = 0; i < 5; i++) {
    const l = box(p, x, 2.1, z, 1.3, 0.06, 0.32, '#16a34a');
    l.rotation.y = (i / 5) * Math.PI * 2; l.rotation.z = -0.35; l.position.x += Math.cos(l.rotation.y) * 0.5; l.position.z -= Math.sin(l.rotation.y) * 0.5;
  }
}

function label(text: string, cls: string, onClick?: () => void): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls; el.innerHTML = text;
  if (onClick) { el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('click', e => { e.stopPropagation(); onClick(); }); }
  return new CSS2DObject(el);
}

export function createScene(host: HTMLElement, onPick: (p: Pick) => void): SceneApi {
  const W = () => host.clientWidth || 360, H = () => host.clientHeight || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const css = new CSS2DRenderer();
  css.setSize(W(), H());
  Object.assign(css.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  host.appendChild(css.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bae6fd');
  scene.fog = new THREE.Fog('#bae6fd', 120, 220);
  const VIEW = 46;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  const HOME = new THREE.Vector3(6, 0, 3);
  const OFFSET = new THREE.Vector3(48, 52, 48);
  cam.position.copy(HOME).add(OFFSET);
  const fit = () => {
    const a = W() / H(), v = a < 1 ? VIEW / a * 0.62 : VIEW * 0.62;
    cam.left = -v * a; cam.right = v * a; cam.top = v; cam.bottom = -v; cam.updateProjectionMatrix();
  };
  fit();
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.copy(HOME);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.minZoom = 0.7; controls.maxZoom = 6;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.2;
  controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.update();

  const hemi = new THREE.HemisphereLight('#ffffff', '#86efac', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff7e6', 2.2);
  sun.position.set(30, 60, 20); sun.castShadow = true;
  const sm = window.innerWidth > 900 ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 45, bottom: -45, near: 1, far: 160 });
  sun.target.position.set(6, 0, 3);
  scene.add(sun, sun.target);

  // ── Décor fixe ──────────────────────────────────────────────────────────────
  const world = new THREE.Group(); scene.add(world);
  // Mer vivante : vagues + reflets du soleil
  const seaGeo = new THREE.PlaneGeometry(260, 200, 64, 48);
  const seaMat = new THREE.MeshPhongMaterial({ color: '#38bdf8', shininess: 110, specular: '#ffffff', flatShading: true });
  const sea = new THREE.Mesh(seaGeo, seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(6, -0.45, -10); sea.receiveShadow = true; world.add(sea);
  const seaPos = seaGeo.attributes['position'] as THREE.BufferAttribute;
  box(world, 5, -0.3, 8, 84, 0.3, 40, '#86efac', false).receiveShadow = true; // terre
  box(world, 24, -0.3, -13.3, 22, 0.32, 3.5, '#fde68a', false);                   // plage
  // routes
  const road = '#475569', line = '#f8fafc';
  box(world, 0.5, 0, LOOP.z0 - 0.7, 64, 0.02, 2.2, road, false);
  box(world, 0.5, 0, LOOP.z1 + 0.7, 54.4, 0.02, 2.2, road, false);
  box(world, LOOP.x0 - 0.7, 0, 10.5, 2.2, 0.02, 23.6, road, false);
  box(world, LOOP.x1 + 0.7, 0, 10.5, 2.2, 0.02, 23.6, road, false);
  box(world, 0, 0, -3.3, 2, 0.02, 4.6, road, false);
  box(world, 32, 0, 3, 8, 0.02, 2.2, road, false);
  for (let x = -24; x < 30; x += 2.2) box(world, x, 0.03, LOOP.z0 - 0.7, 1, 0.01, 0.14, line, false);

  // Port + grue
  const P = Z.port;
  tag(world, box(new THREE.Group(), P.x, 0, P.z + 1.5, P.w, 0.6, 5, '#94a3b8'), 'port');
  const crane = new THREE.Group();
  box(crane, P.x + 4, 0.6, P.z + 1, 0.5, 7, 0.5, '#f59e0b'); box(crane, P.x + 2.2, 7.4, P.z + 1, 4.6, 0.4, 0.4, '#f59e0b');
  box(crane, P.x + 0.4, 5.2, P.z + 1, 0.06, 2.2, 0.06, '#334155');
  tag(world, crane, 'port');
  const cont = new THREE.Group(); tag(world, cont, 'port');
  for (let i = 0; i < 6; i++) box(cont, P.x - 5 + (i % 3) * 1.9, 0.6 + Math.floor(i / 3) * 0.9, P.z + 2.6, 1.7, 0.9, 1, ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#0ea5e9'][i]!);
  // Atelier (hangar ouvert)
  const A = Z.atelier, at = new THREE.Group();
  box(at, A.x, 0, A.z, A.w, 0.08, A.d, '#d4d4d8', false);
  box(at, A.x - A.w / 2 + 0.2, 0, A.z, 0.4, 3.2, A.d, '#a1a1aa');
  box(at, A.x, 0, A.z - A.d / 2 + 0.2, A.w, 3.2, 0.4, '#a1a1aa');
  box(at, A.x, 3.2, A.z, A.w + 0.4, 0.3, A.d + 0.4, '#71717a');
  box(at, A.x + 2.6, 0, A.z + 2.8, 0.3, 1.6, 0.3, '#ef4444'); // pont élévateur
  tag(world, at, 'atelier');
  // Agence FIK
  const G = Z.agence, ag = new THREE.Group();
  box(ag, G.x, 0, G.z, G.w - 1, 5.5, G.d - 2, '#14b8a6');
  box(ag, G.x, 5.5, G.z, G.w - 0.6, 0.5, G.d - 1.6, '#fbbf24');
  box(ag, G.x, 0, G.z + 2.6, 2.2, 2, 0.1, WIN, false);
  for (let i = 0; i < 3; i++) box(ag, G.x - 1.6 + i * 1.6, 2.8, G.z + 2.52, 1, 1.2, 0.06, WIN, false);
  for (let i = 0; i < 2; i++) box(ag, G.x + 2.52, 2.8, G.z - 0.9 + i * 1.8, 0.06, 1.2, 1, WIN, false);
  tag(world, ag, 'agence');
  // Parking location
  const PK = Z.parking;
  tag(world, box(new THREE.Group(), PK.x, 0, PK.z, PK.w, 0.05, PK.d, '#cbd5e1', false), 'parking');
  const pl = new THREE.Group(); tag(world, pl, 'parking');
  for (const [x, z] of PARK) box(pl, x - 0.62, 0.06, z, 0.05, 0.01, 2.2, '#f8fafc', false);
  // Packs séjour : villa + piscine
  const PS = Z.packs, pk = new THREE.Group();
  box(pk, PS.x, 0, PS.z + 1, 5, 2.4, 3.4, '#f8fafc'); box(pk, PS.x + 0.6, 2.4, PS.z + 1, 3.4, 1.6, 3, '#f1f5f9');
  box(pk, PS.x, 4, PS.z + 1, 5.4, 0.25, 3.8, '#c2410c');
  box(pk, PS.x + 3.6, 0, PS.z + 1, 2.2, 0.09, 3, '#06b6d4', false);
  tag(world, pk, 'packs');
  palm(world, PS.x - 3.4, PS.z - 1.6); palm(world, PS.x + 3.6, PS.z - 2.4); palm(world, 19, -13);
  // Showroom vente
  const V = Z.vente, sh = new THREE.Group();
  box(sh, V.x, 0, V.z, V.w, 0.05, V.d, '#e2e8f0', false);
  box(sh, V.x + 4, 0, V.z - 3.6, 6, 3, 4, '#bfdbfe');
  box(sh, V.x + 4, 3, V.z - 3.6, 6.3, 0.3, 4.3, '#1d4ed8');
  for (let i = 0; i < 6; i++) cyl(sh, V.x - 6.8 + i * 1.6, 0, V.z - 5.4, 0.04, 2, '#94a3b8');
  tag(world, sh, 'vente');
  const sl = new THREE.Group(); tag(world, sl, 'vente');
  for (const [x, z] of SALE) box(sl, x - 0.6, 0.06, z, 0.04, 0.01, 2, '#94a3b8', false);
  // Tour entreprises + studio web
  const B = Z.b2b, bt = new THREE.Group();
  box(bt, B.x, 0, B.z, 3.2, 11, 3.2, '#6366f1'); box(bt, B.x, 11, B.z, 2.2, 1.5, 2.2, '#4f46e5');
  for (let f = 1; f < 11; f += 1.4) { box(bt, B.x, f, B.z + 1.62, 2.6, 0.5, 0.04, WIN2, false); box(bt, B.x + 1.62, f, B.z, 0.04, 0.5, 2.6, WIN2, false); }
  tag(world, bt, 'b2b');
  const WB = Z.web, wb = new THREE.Group();
  box(wb, WB.x, 0, WB.z, 3.6, 3.4, 3.2, '#f472b6'); box(wb, WB.x, 3.4, WB.z, 3.9, 0.25, 3.5, '#be185d');
  box(wb, WB.x, 1.2, WB.z + 1.63, 2.4, 1.5, 0.05, '#0f172a', false); box(wb, WB.x, 1.32, WB.z + 1.67, 2.1, 1.2, 0.02, '#38bdf8', false);
  tag(world, wb, 'web');
  // Centre-ville décoratif
  const city = new THREE.Group();
  ([[-5, 14, 2.4, 4, '#fca5a5'], [-1.5, 15.5, 2.2, 6, '#c4b5fd'], [2, 14, 2.6, 3.5, '#fdba74'], [5.5, 15.5, 2, 7, '#93c5fd'], [-5.5, 17.8, 2, 2.6, '#f9a8d4'], [5, 18.2, 2.4, 3, '#fde68a']] as const)
    .forEach(([x, z, s, h, c]) => {
      box(city, x, 0, z, s, h, s, c); box(city, x, h, z, s + 0.15, 0.15, s + 0.15, '#f8fafc');
      for (let f = 0.8; f < h - 0.4; f += 1.1) { box(city, x, f, z + s / 2 + 0.01, s * 0.7, 0.42, 0.03, WIN, false); box(city, x + s / 2 + 0.01, f, z, 0.03, 0.42, s * 0.7, WIN, false); }
    });
  tag(world, city, 'ville');
  // Quartier immo (terrain)
  const IM = Z.immo;
  tag(world, box(new THREE.Group(), IM.x + 0.5, 0, IM.z + 0.3, IM.w, 0.04, IM.d, '#bbf7d0', false), 'immo');
  // Aéroport
  const AP = Z.aeroport, ap = new THREE.Group();
  box(ap, AP.x, 0, AP.z, 4, 0.03, 22, '#334155', false);
  for (let z = -2; z < 18; z += 2.4) box(ap, AP.x, 0.04, z, 0.2, 0.01, 1.2, '#f8fafc', false);
  box(ap, AP.x - 4.2, 0, AP.z - 6, 3, 2.4, 6, '#e2e8f0'); box(ap, AP.x - 4.2, 2.4, AP.z - 6, 3.2, 0.2, 6.2, '#0ea5e9');
  cyl(ap, AP.x - 4.2, 2.6, AP.z - 1.8, 0.3, 3, '#f1f5f9'); box(ap, AP.x - 4.2, 5.6, AP.z - 1.8, 1.2, 0.8, 1.2, '#0ea5e9');
  tag(world, ap, 'aeroport');
  const plane = new THREE.Group();
  box(plane, 0, 0, 0, 0.7, 0.7, 4, '#f8fafc'); box(plane, 0, 0.25, 0.2, 5, 0.12, 1, '#e2e8f0'); box(plane, 0, 0.5, -1.8, 0.12, 1, 0.7, '#0ea5e9');
  plane.userData['zone'] = 'aeroport'; plane.traverse(o => { o.userData['zone'] = 'aeroport'; });
  world.add(plane);
  // Arbres
  ([[-28, -4], [-27, 4], [-12, -2.5], [-5.5, -2.5], [4.5, -2.5], [24, -3], [-2, 2.6], [8, 2.6], [24, 18], [-24, 22.5], [-10, 22.8], [9, 22.8], [29.5, 14], [29.5, 6], [-14, 2.6]] as const)
    .forEach(([x, z]) => tree(world, x, z, 1));

  // ── Vie de la ville : quartiers, parc, lampadaires, piétons, bateaux, nuages, Santa Cruz ──
  const house = (x: number, z: number, wall: string, roof: string, r = 0) => {
    const h = new THREE.Group();
    box(h, 0, 0, 0, 1.8, 1.3, 1.6, wall);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), mat(roof));
    rf.position.y = 1.75; rf.rotation.y = Math.PI / 4; rf.castShadow = true; h.add(rf);
    box(h, 0.4, 0, 0.81, 0.4, 0.7, 0.02, '#78350f', false); box(h, -0.4, 0.6, 0.81, 0.4, 0.35, 0.02, WIN, false);
    h.position.set(x, 0, z); h.rotation.y = r; world.add(h);
  };
  const walls = ['#fef3c7', '#fde68a', '#fecaca', '#e0e7ff', '#f5f5f4', '#dcfce7', '#fbcfe8'];
  const roofs = ['#c2410c', '#b91c1c', '#9a3412', '#7c2d12'];
  let hi = 0;
  for (let x = -24; x <= 26; x += 3.3) { house(x, 24.6, walls[hi % 7]!, roofs[hi % 4]!, Math.PI); hi++; }      // rue du sud
  for (let z = 3; z <= 22; z += 3.2) { house(-31.5, z, walls[hi % 7]!, roofs[hi % 4]!, Math.PI / 2); hi++; }   // quartier ouest
  for (let z = 17; z <= 24; z += 3.4) { house(31.5, z, walls[hi % 7]!, roofs[hi % 4]!, -Math.PI / 2); hi++; }
  // Fort de Santa Cruz sur sa colline (Oran)
  const hill = new THREE.Mesh(new THREE.ConeGeometry(6, 5, 9), mat('#65a30d'));
  hill.position.set(-33, 2.2, -8); hill.castShadow = true; hill.receiveShadow = true; world.add(hill);
  box(world, -33, 4.4, -8, 2.4, 1.4, 1.8, '#e7e5e4'); cyl(world, -33.6, 5.8, -8, 0.35, 1.6, '#e7e5e4');
  box(world, -33.6, 7.4, -8, 0.08, 0.7, 0.08, '#a8a29e'); box(world, -33.6, 7.6, -8, 0.4, 0.08, 0.08, '#a8a29e');
  // Phare au bout du port
  cyl(world, -29.5, 0, -14.5, 0.55, 5, '#f8fafc'); cyl(world, -29.5, 1.5, -14.5, 0.57, 0.8, '#ef4444'); cyl(world, -29.5, 3.4, -14.5, 0.57, 0.8, '#ef4444');
  const beam = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: '#fde047' }));
  beam.position.set(-29.5, 5.4, -14.5); world.add(beam);
  // Parc + fontaine
  box(world, -16.5, 0, 19.2, 13, 0.06, 2.6, '#4ade80', false);
  cyl(world, -16.5, 0, 19.2, 1.1, 0.35, '#cbd5e1'); cyl(world, -16.5, 0.35, 19.2, 0.9, 0.05, '#38bdf8'); cyl(world, -16.5, 0.35, 19.2, 0.15, 0.9, '#cbd5e1');
  const jetW = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: '#bae6fd', transparent: true, opacity: 0.8 }));
  jetW.position.set(-16.5, 1.35, 19.2); world.add(jetW);
  for (const x of [-21.5, -19, -14, -11.5]) { box(world, x, 0.06, 18.4, 0.9, 0.25, 0.3, '#92400e'); }
  for (const [x, c] of [[-22.5, '#f472b6'], [-10.5, '#facc15'], [-13, '#fb7185'], [-20, '#a78bfa']] as const) box(world, x, 0.06, 20.1, 1.2, 0.2, 0.6, c, false);
  // Arbres en plus (parcs, bords de route)
  ([[-21, 18.2], [-12, 20.2], [-30, -1], [-30, 25], [27, 25.5], [21, 3.5], [27, 2.5], [-19, 3], [-23.5, 3], [7.5, 19.5], [23, 19.8], [-6.8, 20.3], [9.5, 3], [24.5, 9], [24.5, 14], [-29, 12], [33.5, 0], [41, 22], [41, -2]] as const)
    .forEach(([x, z]) => tree(world, x, z, 0.8 + ((x * 7 + z) % 3) * 0.12));
  // Lampadaires le long de l'avenue
  for (let x = -22; x <= 24; x += 6) for (const z of [-2.1, 0.9]) {
    cyl(world, x, 0, z, 0.06, 2.4, '#334155');
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: '#fef08a' }));
    bulb.position.set(x, 2.5, z); world.add(bulb);
    const halo = new THREE.Sprite(GLOW); halo.scale.set(1.6, 1.6, 1); halo.position.set(x, 2.5, z); world.add(halo);
    const pool = new THREE.Mesh(PLANE, POOL); pool.rotation.x = -Math.PI / 2; pool.scale.set(4.2, 4.2, 1); pool.position.set(x, 0.05, z); world.add(pool);
  }
  // Faisceau tournant du phare (la nuit)
  const lhBeam = new THREE.Group(); lhBeam.position.set(-29.5, 5.4, -14.5); world.add(lhBeam);
  const lhMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#fef9c3', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const lhRay = new THREE.Mesh(PLANE, lhMat); lhRay.scale.set(26, 2.2, 1); lhRay.position.x = 13; lhBeam.add(lhRay);
  // Pluie (météo réelle)
  const RAIN_N = 700;
  const rainGeo = new THREE.BufferGeometry(), rainArr = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) { const x = -45 + Math.random() * 100, y = Math.random() * 30, z = -30 + Math.random() * 65; rainArr.set([x, y, z, x - 0.15, y - 0.9, z], i * 6); }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainArr, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.55 }));
  rain.visible = false; rain.frustumCulled = false; scene.add(rain);
  // Avion garé au terminal
  const parked = new THREE.Group();
  box(parked, 0, 0, 0, 0.7, 0.7, 4, '#f8fafc'); box(parked, 0, 0.25, 0.2, 5, 0.12, 1, '#e2e8f0'); box(parked, 0, 0.5, -1.8, 0.12, 1, 0.7, '#f59e0b');
  parked.position.set(Z.aeroport.x - 8.2, 0.3, Z.aeroport.z + 4); parked.rotation.y = 0.3; tag(world, parked, 'aeroport');
  // Bus (ambiance : ce n'est pas une voiture du parc)
  const bus = new THREE.Group();
  box(bus, 0, 0.2, 0, 3.4, 1.3, 1.1, '#f59e0b'); box(bus, 0, 0.85, 0, 3.2, 0.4, 1.12, '#bae6fd', false); box(bus, 0, 1.5, 0, 3.4, 0.08, 1.1, '#f8fafc');
  world.add(bus);
  // Piétons
  const people: Array<{ g: THREE.Group; x0: number; x1: number; z: number; v: number; o: number }> = [];
  const skin = ['#fcd34d', '#d6a77a', '#a16207', '#f5d0a9'], cloth = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#0f172a', '#ec4899'];
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    box(g, 0, 0, 0, 0.32, 0.6, 0.24, cloth[i % 7]!);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(skin[i % 4]!)); head.position.y = 0.78; g.add(head);
    const lane = [[-24, 24, 1.5], [-24, 24, -2.6], [-25, -9, 17.6], [-3, 22, 22.9], [-8, 8, 11.5], [6, 24, -14.6]][i % 6]!;
    people.push({ g, x0: lane[0]!, x1: lane[1]!, z: lane[2]!, v: 0.6 + (i % 4) * 0.18, o: i * 7.3 });
    world.add(g);
  }
  // Voiliers + barques
  const sails: Array<{ g: THREE.Group; cx: number; cz: number; r: number; v: number }> = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    box(g, 0, -0.15, 0, 2, 0.5, 0.8, i % 2 ? '#f8fafc' : '#7c2d12');
    if (i < 3) { cyl(g, 0, 0.35, 0, 0.05, 2.6, '#78350f'); const sl = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 3), mat('#f8fafc')); sl.position.set(0.3, 1.7, 0); sl.scale.z = 0.15; sl.castShadow = true; g.add(sl); }
    world.add(g); sails.push({ g, cx: [-8, 6, 18, -2][i]!, cz: [-24, -27, -23, -19][i]!, r: 4 + i, v: 0.05 + i * 0.015 });
  }
  // Nuages qui passent (ombres sur la ville)
  const clouds: THREE.Group[] = [];
  const CLOUD = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.92 });
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + (k % 2) * 0.6, 8, 6), CLOUD); b.position.set(k * 1.5 - 2, (k % 2) * 0.5, (k % 3) * 0.6); g.add(b); }
    g.position.set(-40 + (i % 6) * 16 + (i >= 6 ? 8 : 0), 16 + (i % 3) * 2, -40 + (i * 7) % 14 + (i >= 6 ? 22 : 0)); g.scale.setScalar(0.8); g.visible = i < 6; world.add(g); clouds.push(g);
  }
  // Bateau cargo (import)
  const boat = new THREE.Group();
  box(boat, 0, -0.3, 0, 10, 1.2, 3, '#1e3a8a'); box(boat, 0, 0.9, 0, 9.4, 0.15, 2.6, '#b91c1c');
  box(boat, -3.8, 0.9, 0, 1.6, 2.2, 2.4, '#f8fafc'); box(boat, -3.8, 3.1, 0, 0.4, 1, 0.4, '#ef4444');
  boat.position.set(P.x - 1, 0, P.z - 6.5);
  boat.traverse(o => { o.userData['zone'] = 'port'; });
  world.add(boat);
  const boatCargo = new THREE.Group(); boat.add(boatCargo);
  // Jet ski (packs)
  const jet = new THREE.Group();
  box(jet, 0, 0, 0, 1.4, 0.4, 0.6, '#facc15'); box(jet, -0.2, 0.4, 0, 0.5, 0.3, 0.4, '#0f172a');
  jet.traverse(o => { o.userData['zone'] = 'packs'; }); world.add(jet);

  // ── Contenu dynamique ───────────────────────────────────────────────────────
  const dyn = new THREE.Group(); scene.add(dyn);
  let movers: Array<{ g: THREE.Group; s: number; v: number }> = [];
  let prices: CSS2DObject[] = [];
  let names: CSS2DObject[] = [];
  let rings: Array<{ m: THREE.Mesh; pulse: boolean; o: number }> = [];
  let arrows: Array<{ m: THREE.Object3D; y: number; o: number }> = [];
  let targets = new Set<string>();
  const ARROW = new THREE.MeshPhongMaterial({ color: '#fbbf24', emissive: '#f59e0b', emissiveIntensity: 0.5, shininess: 90 });
  const RING_GEO = new THREE.RingGeometry(0.78, 1.02, 32);
  const arrow = (parent: THREE.Object3D, y: number) => {
    const a = new THREE.Group();
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 4), ARROW); tip.rotation.x = Math.PI; a.add(tip);
    const stem = new THREE.Mesh(BOX, ARROW); stem.scale.set(0.24, 0.55, 0.24); stem.position.y = 0.62; a.add(stem);
    a.position.y = y; parent.add(a); arrows.push({ m: a, y, o: Math.random() * 6 });
  };
  // Nouveautés : la voiture arrive en roulant, le bien pousse du sol, le conteneur descend sur le bateau
  let spawns: Array<{ o: THREE.Object3D; kind: 'drive' | 'grow' | 'drop'; from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }> = [];
  let fresh = new Set<string>();
  let showMoney = false;
  const born = (o: THREE.Object3D, kind: 'drive' | 'grow' | 'drop', from: THREE.Vector3, dur: number, text: string, y: number) => {
    spawns.push({ o, kind, from, to: o.position.clone(), t0: performance.now() + Math.random() * 600, dur });
    if (kind === 'drive') o.position.copy(from);
    if (kind === 'grow') o.scale.y = 0.01;
    if (kind === 'drop') o.position.y = from.y;
    const l = label(`✨ ${text}`, 'dz3-new');
    l.position.set(0, y, 0); o.add(l);
    setTimeout(() => { l.removeFromParent(); l.element.remove(); }, 15000);
  };
  const carPos = new Map<string, THREE.Vector3>();
  let zones: ZoneId[] = [];

  const clearDyn = () => {
    dyn.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
    dyn.clear(); boatCargo.clear(); movers = []; prices = []; names = []; rings = []; arrows = []; spawns = []; carPos.clear();
  };

  const placeCar = (m: MapCar, x: number, z: number, rot: number, moving?: { s: number; v: number }) => {
    const g = makeCar(paintOf(m.id), 0.95, kindOf(m.name));
    g.position.set(x, 0.02, z); g.rotation.y = rot;
    // Anneau de statut au sol (lisible de loin, comme dans un jeu de stratégie)
    const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: STATUS[m.status].badge, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.scale.set(1.25, 0.8, 1); g.add(ring);
    rings.push({ m: ring, pulse: m.status === 'depart' || m.status === 'retour' || m.badge?.c === '#ef4444', o: Math.random() * 6 });
    if (moving) { const bm = new THREE.Mesh(PLANE, BEAM); bm.rotation.x = -Math.PI / 2; bm.scale.set(3, 1.6, 1); bm.position.set(2.2, 0.06, 0); g.add(bm); }
    g.traverse(o => { o.userData['car'] = m.id; });
    dyn.add(g);
    const nm = label(m.name, 'dz3-name', () => onPick({ kind: 'car', id: m.id })); nm.position.set(0, -0.2, 0); nm.visible = false; g.add(nm); names.push(nm);
    if (targets.has(m.id)) arrow(g, 3.6);
    if (m.badge) {
      const b = label(m.badge.t, 'dz3-badge', () => onPick({ kind: 'car', id: m.id }));
      b.element.style.background = m.badge.c;
      if (m.badge.c === '#ef4444') b.element.classList.add('dz3-pulse');
      b.position.set(0, 2.2, 0); g.add(b);
    }
    if (showMoney && m.money) {
      const t = label(m.money, 'dz3-money', () => onPick({ kind: 'car', id: m.id }));
      t.position.set(0, m.badge ? 3 : 2.2, 0); g.add(t);
    }
    if (moving) movers.push({ g, s: moving.s, v: moving.v });
    carPos.set(m.id, g.position);
    if (fresh.has(`car:${m.id}`)) {
      if (moving) { const l = label('✨ Nouvelle voiture', 'dz3-new'); l.position.set(0, 2.9, 0); g.add(l); setTimeout(() => { l.removeFromParent(); l.element.remove(); }, 15000); }
      else born(g, 'drive', new THREE.Vector3(x, 0.02, LOOP.z0 - 0.7), 2600, 'Nouvelle voiture', 2.9);
    }
  };

  const update = (w: World) => {
    clearDyn();
    fresh = new Set(w.fresh ?? []);
    targets = new Set(w.targets ?? []);
    showMoney = !!w.showMoney;
    zones = w.zones;
    const on = (z: ZoneId) => zones.includes(z);
    world.children.forEach(o => {
      const zz = o.userData['zone'] as ZoneId | undefined ?? (o.children[0]?.userData['zone'] as ZoneId | undefined);
      if (zz) o.visible = on(zz);
    });
    jet.visible = on('packs'); plane.visible = on('aeroport'); boat.visible = on('port');

    // Voitures de location
    const by = (s: string[]) => w.cars.filter(c => s.includes(c.status));
    by(['dispo', 'depart']).sort((a, b) => (a.status === 'depart' ? -1 : 0) - (b.status === 'depart' ? -1 : 0))
      .forEach((m, i) => { const [x, z] = PARK[i % PARK.length]!; placeCar(m, x, z, Math.PI / 2); });
    by(['atelier']).forEach((m, i) => { const [x, z] = GARAGE[i % GARAGE.length]!; placeCar(m, x, z, Math.PI / 2); });
    const road = by(['loue', 'retour']);
    road.forEach((m, i) => { const s = (i / Math.max(1, road.length)) * LOOP_LEN; const p = loopSmooth(s); placeCar(m, p.x, p.z, p.a, { s, v: 2.2 + (i % 3) * 0.35 }); });

    // Véhicules à vendre (prix sur pancarte)
    if (on('vente')) w.sales.slice(0, SALE.length).forEach((s, i) => {
      const [x, z] = SALE[i]!;
      const g = makeCar(paintOf(s.id), 0.95, kindOf(s.label));
      g.position.set(x, 0.02, z); g.rotation.y = Math.PI / 2; g.traverse(o => { o.userData['zone'] = 'vente'; }); dyn.add(g);
      if (s.sub) { const t = label(s.sub, 'dz3-price'); t.position.set(0, 1.9, 0); g.add(t); prices.push(t); }
      if (fresh.has(`sale:${s.id}`)) born(g, 'drive', new THREE.Vector3(x, 0.02, LOOP.z1 + 0.7), 2600, 'Nouveau à vendre', 2.9);
    });
    // Conteneurs sur le bateau = imports en cours
    w.imports.slice(0, 12).forEach((im, i) => {
      const c = box(boatCargo, -1.6 + (i % 4) * 1.6, 1.05 + Math.floor(i / 8) * 0.9, i % 8 < 4 ? -0.6 : 0.6, 1.5, 0.85, 1.1, ['#ef4444', '#22c55e', '#f59e0b', '#3b82f6'][i % 4]!);
      if (fresh.has(`imp:${im.id}`)) born(c, 'drop', new THREE.Vector3(0, 9, 0), 2200, 'Nouvel import', 1.6);
    });
    // Biens immobiliers : immeubles réels, sinon chantier « bientôt »
    if (on('immo')) {
      if (w.properties.length) w.properties.slice(0, IMMO.length).forEach((p, i) => {
        const [x, z] = IMMO[i]!, villa = /villa/i.test(p.label), h = villa ? 1.8 : 3 + (i % 3) * 1.6;
        const g = new THREE.Group();
        box(g, x, 0, z, villa ? 2.6 : 2.2, h, 2.2, ['#fef3c7', '#e0e7ff', '#fce7f3', '#dcfce7'][i % 4]!);
        box(g, x, h, z, villa ? 2.8 : 2.4, 0.2, 2.4, villa ? '#c2410c' : '#64748b');
        g.traverse(o => { o.userData['zone'] = 'immo'; }); dyn.add(g);
        if (fresh.has(`prop:${p.id}`)) { const pivot = new THREE.Group(); pivot.position.set(x, 0, z); g.position.set(-x, 0, -z); pivot.add(g); dyn.add(pivot); born(pivot, 'grow', new THREE.Vector3(), 2400, 'Nouveau bien', h + 1.8); }
        if (p.sub) { const t = label(p.sub, 'dz3-price'); t.position.set(x, h + 1.1, z); dyn.add(t); prices.push(t); }
      });
      else {
        const g = new THREE.Group();
        box(g, 13, 0, 9, 3, 2.2, 3, '#e5e7eb'); box(g, 13, 2.2, 9, 3, 0.15, 3, '#9ca3af');
        cyl(g, 18, 0, 13, 0.18, 8, '#f59e0b'); box(g, 16.6, 8, 13, 4.2, 0.3, 0.3, '#f59e0b');
        box(g, 13, 0, 15, 3.4, 0.05, 2.4, '#fcd34d', false);
        g.traverse(o => { o.userData['zone'] = 'immo'; }); dyn.add(g);
      }
    }

    // Étiquettes de zones (cliquables)
    const n = (s: string[]) => by(s).length;
    const text: Partial<Record<ZoneId, string>> = {
      agence: `${w.brand}${w.pending ? ` · <b>${w.pending}</b> demande${w.pending > 1 ? 's' : ''}` : ''}`,
      parking: `Parking · <b>${n(['dispo', 'depart'])}</b> dispo`,
      atelier: `Atelier · <b>${n(['atelier'])}</b>`,
      ville: `En location · <b>${n(['loue', 'retour'])}</b>`,
      vente: w.sales.length ? `Vente · <b>${w.sales.length}</b> à vendre` : 'Vente auto · bientôt',
      port: w.imports.length ? `Import · <b>${w.imports.length}</b> en cours` : 'Importation · 0 en cours',
      immo: w.properties.length ? `Immobilier · <b>${w.properties.length}</b> biens` : 'Immobilier · bientôt',
      packs: w.packs.length ? `Packs séjour · <b>${w.packs.length}</b>` : 'Packs séjour',
      aeroport: 'Aéroport · conciergerie',
      b2b: w.prospects ? `Entreprises · <b>${w.prospects}</b> démarchées` : 'Entreprises',
      web: w.sites ? `FIK Sites · <b>${w.sites}</b> en ligne` : 'FIK Sites',
    };
    const anchor: Record<ZoneId, [number, number, number]> = {
      agence: [Z.agence.x, 8.2, Z.agence.z], parking: [Z.parking.x, 2.5, Z.parking.z - 6], atelier: [Z.atelier.x - 2.5, 4.4, Z.atelier.z + 3],
      ville: [0, 9, 16], vente: [Z.vente.x, 4.6, Z.vente.z - 3.6], port: [Z.port.x, 9, Z.port.z], immo: [15, 5, 4.5],
      packs: [Z.packs.x, 5.4, Z.packs.z + 1], aeroport: [Z.aeroport.x - 4, 7.6, Z.aeroport.z - 4], b2b: [Z.b2b.x, 13.6, Z.b2b.z], web: [Z.web.x, 5, Z.web.z],
    };
    for (const z of zones) {
      const short = (text[z] ?? '').match(/<b>(\d+)<\/b>/)?.[1] ?? '';
      const html = `${ZONE_INFO[z].icon}<span class="dz3-full"> ${text[z] ?? ZONE_INFO[z].title}</span>${short ? `<span class="dz3-short"> ${short}</span>` : ''}`;
      const l = label(html, z === 'agence' ? 'dz3-zone dz3-brand' : 'dz3-zone', () => onPick({ kind: 'zone', zone: z }));
      l.position.set(...anchor[z]); dyn.add(l);
      if (targets.has(`zone:${z}`)) { const g = new THREE.Group(); g.position.set(anchor[z][0], 0, anchor[z][2]); dyn.add(g); arrow(g, anchor[z][1] + 1.6); }
    }
  };

  // ── Mission réussie : pièces qui jaillissent + gain qui monte ───────────────
  const COIN = new THREE.MeshPhongMaterial({ color: '#fbbf24', emissive: '#b45309', emissiveIntensity: 0.35, shininess: 120, specular: '#fff7ed' });
  let coins: Array<{ m: THREE.Mesh; v: THREE.Vector3; t0: number }> = [];
  const where = (p: Pick): THREE.Vector3 => {
    if (p?.kind === 'car') return carPos.get(p.id)?.clone() ?? new THREE.Vector3(Z.agence.x, 0, Z.agence.z);
    const z = Z[p?.kind === 'zone' ? p.zone : 'agence']; return new THREE.Vector3(z.x, 0, z.z);
  };
  const burst = (p: Pick, text: string) => {
    const at = where(p), now = performance.now();
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(CYL, COIN); m.scale.set(0.32, 0.07, 0.32); m.position.copy(at).setY(1.2); m.castShadow = true; scene.add(m);
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
      coins.push({ m, v: new THREE.Vector3(Math.cos(a) * r, 7 + Math.random() * 5, Math.sin(a) * r), t0: now + i * 25 });
    }
    const l = label(text, 'dz3-gain'); l.position.copy(at).setY(3); scene.add(l);
    const t0 = now;
    const up = () => { const e = (performance.now() - t0) / 2200; if (e >= 1) { l.removeFromParent(); l.element.remove(); return; } l.position.y = 3 + e * 4; l.element.style.opacity = String(1 - Math.max(0, e - 0.6) / 0.4); requestAnimationFrame(up); };
    requestAnimationFrame(up);
  };

  // ── Ciel : heure réelle (Oran par défaut), lever/coucher du soleil calculés ─
  let skyMode: SkyMode = 'auto', tz = 'Africa/Algiers';
  let wx: Weather | null = null;
  let dayK = 1, dayTarget = 1, dusk = 0, sunA = 0, flash = 0, nextSky = 0;
  const SKY_DAY = new THREE.Color('#bae6fd'), SKY_NIGHT = new THREE.Color('#0b1636'), SKY_DUSK = new THREE.Color('#fca5a5'), SKY_RAIN = new THREE.Color('#94a3b8');
  const SEA_DAY = new THREE.Color('#38bdf8'), SEA_NIGHT = new THREE.Color('#1e3a8a');
  const SUN_DAY = new THREE.Color('#fff7e6'), SUN_DUSK = new THREE.Color('#fb923c'), MOON = new THREE.Color('#c7d2fe');
  const sky = new THREE.Color(), tmp = new THREE.Color();
  const computeSky = () => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23', day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(new Date());
    const g = (t: string) => Number(parts.find(x => x.type === t)?.value ?? 0);
    const h = g('hour') + g('minute') / 60;
    const n = Math.floor((Date.UTC(g('year'), g('month') - 1, g('day')) - Date.UTC(g('year'), 0, 0)) / 86_400_000);
    const lat = 35.7 * Math.PI / 180, dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + n) / 365);
    const half = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(dec)))) * 12 / Math.PI; // demi-durée du jour (h)
    const noon = 12.9;
    const hh = skyMode === 'jour' ? noon - 2.5 : skyMode === 'nuit' ? noon + half + 3 : h;
    sunA = (hh - noon) / half;                          // -1 lever, 0 midi, +1 coucher
    const elev = Math.cos(Math.min(2, Math.abs(sunA)) * Math.PI / 2);
    dayTarget = Math.max(0, Math.min(1, (Math.abs(sunA) < 1 ? elev : -0.1) * 4 + 0.15));
    dusk = Math.max(0, 1 - Math.abs(Math.abs(sunA) - 1) * 5);
  };
  const applySky = (dt: number, t: number) => {
    if (performance.now() > nextSky) { computeSky(); nextSky = performance.now() + 20_000; }
    dayK += (dayTarget - dayK) * Math.min(1, dt * 1.5);
    const night = 1 - dayK, cloudy = wx ? Math.min(1, wx.clouds / 100) : 0.2;
    const wet = !!wx && ((wx.code >= 51 && wx.code <= 67) || (wx.code >= 80 && wx.code <= 82) || wx.code >= 95);
    const storm = !!wx && wx.code >= 95;
    sky.copy(SKY_NIGHT).lerp(SKY_DAY, dayK);
    if (dusk > 0) sky.lerp(SKY_DUSK, dusk * 0.55);
    if (wet || cloudy > 0.7) sky.lerp(SKY_RAIN, (wet ? 0.55 : 0.3) * dayK);
    (scene.background as THREE.Color).copy(sky); scene.fog!.color.copy(sky);
    const fogNear = wx && (wx.code === 45 || wx.code === 48) ? 40 : 120;
    (scene.fog as THREE.Fog).near = fogNear; (scene.fog as THREE.Fog).far = fogNear + 100;
    const dim = 1 - (wet ? 0.35 : cloudy * 0.2);
    if (storm && Math.random() < dt * 0.25) flash = 1;
    flash = Math.max(0, flash - dt * 4);
    hemi.intensity = (0.55 + 1.05 * dayK) * dim + flash * 2.5;
    hemi.color.copy(MOON).lerp(tmp.set('#ffffff'), dayK);
    hemi.groundColor.set(dayK > 0.5 ? '#86efac' : '#1e293b');
    const a = Math.max(-1, Math.min(1, sunA)) * Math.PI / 2;
    if (dayK > 0.08) { sun.position.set(6 - Math.sin(a) * 60, 10 + Math.cos(a) * 60, 3 + Math.cos(a) * 26); sun.color.copy(SUN_DAY).lerp(SUN_DUSK, dusk); sun.intensity = 2.3 * dayK * dim + 0.3; }
    else { sun.position.set(-20, 70, 30); sun.color.copy(MOON); sun.intensity = 0.45; }
    seaMat.color.copy(SEA_NIGHT).lerp(SEA_DAY, dayK);
    const lit = Math.max(0, night - 0.15) / 0.85;
    WIN.emissiveIntensity = lit * 0.95; WIN2.emissiveIntensity = lit * 0.8;
    HEAD.emissiveIntensity = 0.2 + lit * 1.4; TAIL.emissiveIntensity = 0.2 + lit * 0.9;
    GLOW.opacity = lit * 0.95; POOL.opacity = lit * 0.45; BEAM.opacity = lit * 0.5; lhMat.opacity = lit * 0.35;
    lhBeam.rotation.y = t * 0.9;
    CLOUD.opacity = 0.75 + cloudy * 0.2; CLOUD.color.set(wet ? '#cbd5e1' : '#ffffff').lerp(tmp.set('#475569'), night * 0.7);
    const nClouds = Math.round(3 + cloudy * 9);
    clouds.forEach((c, i) => { c.visible = i < nClouds; });
    rain.visible = wet;
    if (wet) {
      const arr = rainGeo.attributes['position'] as THREE.BufferAttribute, f = dt * (storm ? 34 : 26);
      for (let i = 0; i < RAIN_N; i++) { let y = arr.getY(i * 2) - f; if (y < 0) y += 30; arr.setY(i * 2, y); arr.setY(i * 2 + 1, y - 0.9); }
      arr.needsUpdate = true;
    }
  };

  // ── Caméra : vol vers une cible ─────────────────────────────────────────────
  let fly: { from: THREE.Vector3; to: THREE.Vector3; z0: number; z1: number; t0: number; follow?: string } | null = null;
  let follow: string | null = null;
  const flyTo = (to: THREE.Vector3, zoom: number, followId?: string) => {
    fly = { from: controls.target.clone(), to: to.clone(), z0: cam.zoom, z1: zoom, t0: performance.now(), follow: followId };
    follow = null;
  };
  const focus = (p: Pick) => {
    if (!p) { flyTo(HOME, 1); return; }
    if (p.kind === 'car') { const v = carPos.get(p.id); if (v) flyTo(v, 3.2, p.id); return; }
    const z = Z[p.zone]; flyTo(new THREE.Vector3(z.x, 0, z.z), p.zone === 'aeroport' ? 2 : 2.4);
  };

  // ── Clic / toucher ──────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; follow = null; fly = null; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const r = el.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    const hit = ray.intersectObjects([dyn, world], true).find(h => h.object.visible && (h.object.userData['car'] || h.object.userData['zone']));
    if (!hit) { onPick(null); return; }
    const car = hit.object.userData['car'] as string | undefined;
    onPick(car ? { kind: 'car', id: car } : { kind: 'zone', zone: hit.object.userData['zone'] as ZoneId });
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);

  // ── Boucle d'animation ──────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    const now = performance.now();
    for (const sp of spawns) {
      const e = Math.max(0, Math.min(1, (now - sp.t0) / sp.dur)), q = sp.kind === 'drop' ? e * e : 1 - Math.pow(1 - e, 3);
      if (sp.kind === 'drive') { sp.o.position.lerpVectors(sp.from, sp.to, q); sp.o.position.y = sp.to.y + Math.abs(Math.sin(e * 18)) * 0.06 * (1 - e); }
      else if (sp.kind === 'grow') sp.o.scale.y = Math.max(0.01, q < 1 ? q * 1.08 - (q > 0.9 ? (q - 0.9) * 0.8 : 0) : 1);
      else sp.o.position.y = sp.from.y + (sp.to.y - sp.from.y) * q;
    }
    spawns = spawns.filter(sp => now - sp.t0 < sp.dur);
    for (const m of movers) {
      m.s += m.v * dt; const p = loopSmooth(m.s); m.g.position.set(p.x, 0.02, p.z); m.g.rotation.y = p.a;
      for (const w of m.g.userData['wheels'] as THREE.Object3D[]) w.rotation.z -= m.v * dt * 4;
    }
    for (const r of rings) { const k = r.pulse ? 1 + Math.sin(t * 4 + r.o) * 0.12 : 1; r.m.scale.set(1.25 * k, 0.8 * k, 1); (r.m.material as THREE.MeshBasicMaterial).opacity = r.pulse ? 0.65 + Math.sin(t * 4 + r.o) * 0.3 : 0.85; }
    for (const a of arrows) { a.m.position.y = a.y + Math.abs(Math.sin(t * 3 + a.o)) * 0.7; a.m.rotation.y = t * 2; }
    if (coins.length) {
      for (const c of coins) {
        if (now < c.t0) continue;
        c.v.y -= 22 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += dt * 9; c.m.rotation.z += dt * 6;
        if (c.m.position.y < 0.05) { c.m.position.y = 0.05; c.v.multiplyScalar(0.45); c.v.y = Math.abs(c.v.y) * 0.4; }
      }
      coins = coins.filter(c => { const alive = now - c.t0 < 1800; if (!alive) c.m.removeFromParent(); return alive; });
    }
    {
      const arr = seaPos, wind = 1 + (wx?.wind ?? 12) / 25;
      for (let i = 0; i < arr.count; i++) { const x = arr.getX(i), y = arr.getY(i); arr.setZ(i, (Math.sin(x * 0.22 + t * 1.1) * 0.14 + Math.cos(y * 0.31 + t * 1.4) * 0.11) * wind); }
      arr.needsUpdate = true; seaGeo.computeVertexNormals();
    }
    applySky(dt, t);
    for (const p of people) {
      const L = p.x1 - p.x0, d = (t * p.v + p.o) % (2 * L), fwd = d < L;
      p.g.position.set(fwd ? p.x0 + d : p.x1 - (d - L), Math.abs(Math.sin(t * 8 + p.o)) * 0.05, p.z); p.g.rotation.y = fwd ? 0 : Math.PI;
    }
    for (const b of sails) { const a = t * b.v; b.g.position.set(b.cx + Math.cos(a) * b.r, Math.sin(t * 1.6 + b.cx) * 0.08, b.cz + Math.sin(a) * b.r * 0.4); b.g.rotation.y = -a + Math.PI / 2; }
    for (const c of clouds) { c.position.x += dt * 0.9; if (c.position.x > 60) c.position.x = -50; }
    { const p = loopAt(t * 1.6 + LOOP_LEN / 2); bus.position.set(p.x, 0.02, p.z + (p.a === 0 ? 0.7 : p.a === Math.PI ? -0.7 : 0)); bus.rotation.y = p.a; }
    jetW.scale.setScalar(1 + Math.sin(t * 5) * 0.15);
    (beam.material as THREE.MeshBasicMaterial).color.setHSL(0.15, 1, 0.55 + Math.sin(t * 3) * 0.2);
    boat.position.y = Math.sin(t * 1.3) * 0.12; boat.rotation.z = Math.sin(t * 0.9) * 0.02;
    jet.position.set(Z.packs.x + Math.cos(t * 0.6) * 5, 0.05 + Math.sin(t * 3) * 0.05, -19 + Math.sin(t * 0.6) * 2.5); jet.rotation.y = -t * 0.6;
    const k = (t % 24) / 24; // l'avion décolle, fait le tour, se repose
    const air = Math.max(0, Math.sin(k * Math.PI * 2 - Math.PI / 2) + 0.3);
    plane.position.set(Z.aeroport.x + Math.sin(k * Math.PI * 2) * 3, 0.5 + air * 9, Z.aeroport.z + Math.cos(k * Math.PI * 2) * -9);
    plane.rotation.y = -k * Math.PI * 2 + Math.PI; plane.rotation.z = air > 0.4 ? 0.15 : 0;

    if (fly) {
      const e = Math.min(1, (performance.now() - fly.t0) / 650), q = 1 - Math.pow(1 - e, 3);
      const target = fly.follow ? (carPos.get(fly.follow) ?? fly.to) : fly.to;
      const nt = fly.from.clone().lerp(target, q);
      cam.position.add(nt.clone().sub(controls.target)); controls.target.copy(nt);
      cam.zoom = fly.z0 + (fly.z1 - fly.z0) * q; cam.updateProjectionMatrix();
      if (e >= 1) { follow = fly.follow ?? null; fly = null; }
    } else if (follow) {
      const v = carPos.get(follow);
      if (v) { cam.position.add(v.clone().sub(controls.target)); controls.target.copy(v); }
    }
    const near = cam.zoom > 1.9;
    for (const t of prices) t.visible = near;
    const close = cam.zoom > 2.7;
    for (const n of names) n.visible = close;
    controls.update();
    renderer.render(scene, cam);
    css.render(scene, cam);
  });

  const compact = () => css.domElement.classList.toggle('dz3-compact', W() < 560);
  compact();
  const resize = () => { renderer.setSize(W(), H()); css.setSize(W(), H()); fit(); compact(); };
  const ro = new ResizeObserver(resize); ro.observe(host);

  return {
    update, focus, resize, burst,
    setSky: (mode, zone) => { skyMode = mode; if (zone) tz = zone; nextSky = 0; },
    setWeather: w => { wx = w; },
    zoom: k => { cam.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, cam.zoom * k)); cam.updateProjectionMatrix(); },
    reset: () => { cam.position.copy(controls.target).add(OFFSET); flyTo(HOME, 1); },
    dispose: () => {
      ro.disconnect(); renderer.setAnimationLoop(null);
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp);
      clearDyn(); coins.forEach(c => c.m.removeFromParent()); controls.dispose(); renderer.dispose();
      renderer.domElement.remove(); css.domElement.remove();
    },
  };
}
