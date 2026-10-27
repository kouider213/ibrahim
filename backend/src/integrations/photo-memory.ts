/**
 * MÉMOIRE PHOTOGRAPHIQUE (27/10/2026) : chaque photo que Kouider envoie à Dzaryx (Telegram, chat de l'app) est rangée
 * avec ce qu'on y voit, TOUT le texte lisible (plaques, compteurs, prix, numéros, noms), la date et l'endroit.
 * « C'était combien le compteur de la 208 ? », « le numéro sur la carte de visite d'hier ? », « où j'ai garé la Clio ? »
 * → outil photo_memory. Stockage app_kv `photomem:AAAA-MM` (un tableau par mois), photo sur Cloudinary.
 * Pas la caméra en direct (une image toutes les secondes), pas Houari, rien en mode privé.
 */
import { kvGet, kvSet } from './app-store.js';
import { uploadInspectionPhoto } from './inspection-core.js';
import { vision, jsonOf, normText, imageHash, hashDistance } from './media-util.js';

export interface PhotoMem {
  id: string; at: string; url: string; kind: string; desc: string; text: string; tags: string[];
  caption?: string; place?: string; lat?: number; lng?: number; hash?: string;
}

const monthKey = (d: Date) => `photomem:${d.toISOString().slice(0, 7)}`;

const PROMPT = (caption: string) => `Range cette photo dans la mémoire de Kouider (FIK, location de voitures). ${caption ? `Il a écrit avec : « ${caption.slice(0, 300)} ».` : ''}
Réponds UNIQUEMENT avec ce JSON :
{"kind":"voiture|tableau de bord|document|reçu|carte de visite|personne|lieu|capture d'écran|objet|corps|autre",
(kind "corps" = photo de son corps / torse / miroir pour le sport : elle ne sera PAS rangée)
"desc":"ce qu'on voit, précis et utile pour la retrouver plus tard (modèle/couleur de voiture, lieu, rue, enseigne, personnes…), 1-3 phrases",
"text":"TOUT le texte lisible recopié exactement : plaques, kilométrage, jauge d'essence, prix, montants, numéros de téléphone, noms, adresses, références",
"tags":["5 à 10 mots-clés"]}`;

async function month(key: string): Promise<PhotoMem[]> {
  try { return JSON.parse((await kvGet(key)) || '[]') as PhotoMem[]; } catch { return []; }
}

/** Range une photo (en arrière-plan, n'échoue jamais bruyamment). */
export async function rememberPhoto(base64: string, mime: string, caption = ''): Promise<void> {
  try {
    const now = new Date();
    const key = monthKey(now);
    const list = await month(key);
    const hash = await imageHash(base64).catch(() => '');
    // Même photo renvoyée (transfert, deuxième question dessus) → déjà en mémoire
    if (hash && list.slice(-40).some(p => p.hash && hashDistance(p.hash, hash) <= 3)) return;
    const [raw, loc] = await Promise.all([
      vision([{ base64, mime }], PROMPT(caption), { maxTokens: 700 }),
      import('./location.js').then(m => m.getLocation('kouider')).catch(() => null),
    ]);
    const a = jsonOf<{ kind?: string; desc?: string; text?: string; tags?: string[] }>(raw);
    if (!a || a.kind === 'corps') return;   // photo du corps (sport) : jamais rangée ni envoyée sur Cloudinary
    const url = await uploadInspectionPhoto(base64, mime, 'memoire');
    if (!url) return;
    const fresh = loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000;
    list.push({
      id: `${now.getTime().toString(36)}`, at: now.toISOString(), url, kind: String(a.kind ?? 'autre'), desc: String(a.desc ?? '').slice(0, 600),
      text: String(a.text ?? '').slice(0, 800), tags: (a.tags ?? []).map(String).slice(0, 12), ...(caption ? { caption: caption.slice(0, 300) } : {}),
      ...(fresh ? { place: loc!.city ?? loc!.country, lat: loc!.lat, lng: loc!.lng } : {}), ...(hash ? { hash } : {}),
    });
    await kvSet(key, JSON.stringify(list.slice(-600)));
  } catch (e) {
    console.warn('[photo-memory]', e instanceof Error ? e.message : e);
  }
}

const STOP = new Set(['photo', 'photos', 'image', 'avec', 'dans', 'pour', 'cette', 'quel', 'quelle', 'c etait', 'etait', 'combien', 'montre', 'retrouve', 'derniere', 'dernier']);

export async function photoMemoryTool(input: Record<string, unknown>): Promise<string> {
  const q = normText(String(input['query'] ?? ''));
  const from = input['date_from'] ? Date.parse(String(input['date_from'])) : 0;
  const to = input['date_to'] ? Date.parse(String(input['date_to'])) + 86_400_000 : Infinity;
  const limit = Math.min(Number(input['limit'] ?? 4) || 4, 10);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(monthKey(d)); }
  const all = (await Promise.all(months.map(month))).flat().filter(p => { const t = Date.parse(p.at); return t >= from && t < to; });
  if (!all.length) return '📷 Aucune photo en mémoire sur cette période (la mémoire photo démarre le 27/10/2026 : chaque photo envoyée à Dzaryx y est rangée).';
  const words = [...new Set(q.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))];
  const scored = all.map(p => {
    const hay = normText(`${p.kind} ${p.desc} ${p.text} ${p.tags.join(' ')} ${p.caption ?? ''} ${p.place ?? ''}`);
    const s = words.reduce((a, w) => a + (hay.includes(w) ? (w.length > 5 ? 2 : 1) : hay.includes(w.slice(0, 5)) ? 0.5 : 0), 0);
    return { p, s };
  }).filter(x => !words.length || x.s > 0).sort((a, b) => b.s - a.s || b.p.at.localeCompare(a.p.at)).slice(0, limit);
  if (!scored.length) return `📷 Rien trouvé pour « ${input['query']} » dans ${all.length} photos en mémoire. Essaie d'autres mots (marque, couleur, lieu, chiffre).`;
  const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `📷 ${scored.length} photo(s) retrouvée(s) (sur ${all.length} en mémoire) — montre la photo à Kouider (lien) et réponds à sa question avec le texte lu :\n\n`
    + scored.map(({ p }) => [`• ${fmt(p.at)}${p.place ? ` — ${p.place}` : ''}${p.lat ? ` (https://maps.google.com/?q=${p.lat},${p.lng})` : ''} — ${p.kind}`,
      `  ${p.desc}`, p.text ? `  Texte lu : ${p.text}` : '', p.caption ? `  Son message : « ${p.caption} »` : '', `  ${p.url}`].filter(Boolean).join('\n')).join('\n\n');
}
