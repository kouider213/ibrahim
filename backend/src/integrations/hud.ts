/**
 * HUD IRON MAN (27/10/2026) — page JARVIS › HUD : Kouider lève la caméra, l'app envoie une image toutes les ~2,5 s et
 * Dzaryx renvoie des étiquettes posées sur l'image (cadre + titre + détail) :
 *   - une voiture de la flotte (plaque apprise ou modèle) → client en cours + date de retour, ou « libre » ;
 *   - un texte en arabe / anglais (panneau, papier) → traduction ;
 *   - un reçu de paiement → « déjà vu ⚠️ » s'il ressemble à un reçu déjà présenté (anti-arnaque) ;
 *   - un prix, un numéro, un document → la valeur lue.
 * Pas de reconnaissance des visages des gens ici. Plaques apprises : app_kv `hud:plates` (état des lieux vidéo).
 */
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { vision, jsonOf, imageHash, hashDistance } from './media-util.js';

export interface HudLabel { x: number; y: number; w: number; h: number; kind: string; title: string; detail: string; alert?: boolean }

const norm = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function learnPlate(plate: string, car: string): Promise<void> {
  if (!plate || !car || norm(plate).length < 4) return;
  const m = JSON.parse((await kvGet('hud:plates').catch(() => null)) ?? '{}') as Record<string, string>;
  m[norm(plate)] = car;
  await kvSet('hud:plates', JSON.stringify(m));
}

let ctxCache: { at: number; text: string; plates: Record<string, string> } | null = null;
async function context(): Promise<{ text: string; plates: Record<string, string> }> {
  if (ctxCache && Date.now() - ctxCache.at < 120_000) return ctxCache;
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cars }, { data: rents }] = await Promise.all([
    supabase.from('cars').select('id, name, category'),
    supabase.from('bookings').select('car_id, client_name, start_date, end_date, status').lte('start_date', `${today}T23:59`).gte('end_date', today).not('status', 'in', '(REJECTED,CANCELLED,cancelled)'),
  ]);
  const plates = JSON.parse((await kvGet('hud:plates').catch(() => null)) ?? '{}') as Record<string, string>;
  const byCar = new Map(((rents ?? []) as Array<{ car_id: string; client_name: string; end_date: string }>).map(r => [r.car_id, r]));
  const text = ((cars ?? []) as Array<{ id: string; name: string; category?: string }>).map(c => {
    const r = byCar.get(c.id);
    const pl = Object.entries(plates).filter(([, n]) => n.toLowerCase() === c.name.toLowerCase()).map(([p]) => p).join('/');
    return `- ${c.name}${pl ? ` [plaque ${pl}]` : ''} : ${r ? `louée à ${r.client_name}, retour ${r.end_date.slice(0, 16).replace('T', ' ')}` : 'pas en location aujourd\'hui'}`;
  }).join('\n');
  ctxCache = { at: Date.now(), text, plates };
  return ctxCache;
}

const PROMPT = (fleet: string) => `Tu es le HUD de l'armure (style Iron Man) de Kouider, patron de FIK Conciergerie (location de voitures à Oran). Voici ce que voit sa caméra.
Repère au plus 5 choses UTILES pour lui et pose une étiquette sur chacune. Coordonnées en fraction de l'image (0 à 1) : x,y = coin haut-gauche, w,h = taille.
Ce qui compte :
- voiture : marque/modèle/couleur + plaque si lisible. Si c'est une voiture de SA flotte (liste ci-dessous, plaque ou modèle), mets kind "fleet", title = nom de la flotte, detail = situation (client, retour). Sinon kind "car".
- texte en arabe, anglais, espagnol… (panneau, papier, écran) : kind "translate", title = le texte d'origine court, detail = traduction française.
- reçu de paiement (BaridiMob, CCP, virement) : kind "receipt", title = montant, detail = date + référence lues.
- document officiel (passeport, permis, carte grise, contrat) : kind "document", title = type, detail = date d'expiration si lisible (JAMAIS les numéros).
- prix, numéro de téléphone, compteur km, niveau d'essence, voyant au tableau de bord : kind "read", title = ce que c'est, detail = la valeur.
- danger visible (pneu à plat, fuite, rayure fraîche, voyant rouge) : kind "warning", alert true.
INTERDIT : identifier ou décrire les visages des personnes. Ignore les gens.
Flotte de Kouider :
${fleet || '(inconnue)'}
Réponds UNIQUEMENT : {"labels":[{"x":0.1,"y":0.2,"w":0.3,"h":0.2,"kind":"fleet|car|translate|receipt|document|read|warning","title":"court","detail":"court","alert":false}],"scene":"la scène en 6 mots"}`;

export async function hudFrame(base64: string, mime = 'image/jpeg'): Promise<{ labels: HudLabel[]; scene: string }> {
  const ctx = await context();
  const raw = await vision([{ base64, mime }], PROMPT(ctx.text), { maxTokens: 700 });
  const j = jsonOf<{ labels?: HudLabel[]; scene?: string }>(raw) ?? {};
  const clamp = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));
  const labels = (j.labels ?? []).slice(0, 6).map(l => ({ x: clamp(l.x), y: clamp(l.y), w: clamp(l.w) || 0.2, h: clamp(l.h) || 0.15, kind: String(l.kind ?? 'read'), title: String(l.title ?? '').slice(0, 60), detail: String(l.detail ?? '').slice(0, 140), alert: !!l.alert }));
  // Plaque connue lue sur une voiture « car » → c'est une voiture de la flotte
  for (const l of labels) {
    const hit = Object.entries(ctx.plates).find(([p]) => norm(`${l.title} ${l.detail}`).includes(p));
    if (hit && l.kind === 'car') {
      const line = ctx.text.split('\n').find(x => x.toLowerCase().includes(hit[1].toLowerCase()));
      l.kind = 'fleet'; l.title = hit[1]; l.detail = line?.split(' : ').slice(1).join(' : ') ?? l.detail;
    }
  }
  // Reçu : déjà présenté ? (même empreinte qu'un reçu de l'anti-arnaque)
  if (labels.some(l => l.kind === 'receipt')) {
    const h = await imageHash(base64).catch(() => '');
    const seen = JSON.parse((await kvGet('fraud:receipts').catch(() => null)) ?? '[]') as Array<{ hash: string; who: string; at: string; ref: string }>;
    const ref = labels.find(l => l.kind === 'receipt')!;
    const dup = seen.find(r => (h && r.hash && hashDistance(h, r.hash) <= 6) || (r.ref && norm(ref.detail).includes(norm(r.ref)) && norm(r.ref).length >= 6));
    if (dup) { ref.alert = true; ref.detail = `⚠️ DÉJÀ VU (${dup.who || '?'}, ${dup.at.slice(0, 10)}) — ${ref.detail}`; }
  }
  return { labels, scene: String(j.scene ?? '').slice(0, 80) };
}
