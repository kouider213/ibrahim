/**
 * L'ŒIL DE DZARYX (Kouider 28/10 : « un truc ultra puissant ») — pendant un appel vidéo Telegram, tgcall envoie une image
 * de sa caméra toutes les ~8 s. Dzaryx :
 *  - SE SOUVIENT DE TOUT ce qu'il a vu (lieu, objets et où ils sont posés, textes, plaques, prix) avec l'heure et la
 *    position GPS → « où j'ai posé mes clés ? », « c'était combien la télé de tout à l'heure ? », « la plaque de la
 *    voiture qui était garée devant moi ? » ;
 *  - PARLE DE LUI-MÊME quand il remarque quelque chose d'utile : texte en néerlandais / arabe / anglais traduit, courrier
 *    ou document important, danger, ou ce que Kouider lui a demandé de guetter (« préviens-moi si tu vois une Golf grise ») ;
 *  - ne nomme jamais les inconnus (il décrit, il n'identifie pas).
 * Vision : Gemini Flash Lite (quasi gratuit) — pas Claude, trop cher pour une image toutes les 8 s.
 */
import { kvJson, kvPut } from './ai-util.js';
import { getLocation } from './location.js';
import { localNow, hm } from './morning-routine.js';

interface EyeEntry { t: number; scene: string; objects: string; texts: string; people: string; lat?: number; lng?: number }
interface EyeState { lastSay?: number; said: Array<{ t: number; text: string }>; off?: boolean }
const LOG = 'eye:log', WATCH = 'eye:watch', STATE = 'eye:state';
const SAY_GAP = 45_000;

export async function gemini(prompt: string, jpg: string): Promise<string> {
  const key = process.env['GEMINI_API_KEY'];
  if (!key) throw new Error('GEMINI_API_KEY manquant');
  const body = { contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpg } }, { text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 500 } };
  let last = '';
  for (const model of ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest']) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
      const j = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
      const t = j.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (t.trim()) return t;
      last = j.error?.message ?? `${model} vide`;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(last);
}

/** Une image de la caméra : analysée, gardée en mémoire, et parfois une phrase à lui dire tout de suite. */
export async function eyeFrame(jpg: string): Promise<{ say?: string }> {
  const st = await kvJson<EyeState>(STATE, { said: [] });
  if (st.off || !jpg || jpg.length > 1_500_000) return {};
  const watch = await kvJson<string[]>(WATCH, []);
  const recent = st.said.filter(s => Date.now() - s.t < 10 * 60_000).map(s => s.text);
  const raw = await gemini(`Image de la caméra du téléphone de Kouider, en appel vidéo avec son assistant Dzaryx (il filme ce qu'il voit). Réponds en JSON :
{"scene": "le lieu en 8 mots max", "objects": "objets notables ET où ils sont posés (ex. « clés sur le meuble de l'entrée, à côté du bol »), 8 max", "texts": "textes lisibles utiles : plaques d'immatriculation, prix, panneaux, numéros, noms de magasins, titres de courrier", "people": "nombre de personnes + description courte, SANS jamais deviner qui c'est", "say": null}
"say" = UNE phrase courte, en français, à lui dire spontanément, SEULEMENT si c'est vraiment utile maintenant :
- il regarde un texte en néerlandais, arabe, anglais ou autre langue étrangère → ce qu'il veut dire en français ;
- un courrier, une facture, une amende, un document officiel → ce que c'est et la date limite si visible ;
- un danger visible (voiture qui arrive, objet qui va tomber, plaque chauffante allumée…) ;
- quelque chose de cette liste à guetter : ${watch.length ? watch.map(w => `« ${w} »`).join(', ') : '(rien)'} → « je vois … ».
Sinon "say": null. Jamais de remarque banale (« je vois une table »). Déjà dit récemment, ne pas répéter : ${recent.length ? recent.join(' | ') : '(rien)'}.`, jpg);
  let o: Partial<EyeEntry> & { say?: string | null } = {};
  try { o = JSON.parse(raw.replace(/^```json|```$/g, '').trim()) as typeof o; } catch { return {}; }
  const loc = await getLocation('kouider').catch(() => null);
  const fresh = loc && Date.now() - Date.parse(loc.updated_at) < 15 * 60_000;
  const log = await kvJson<EyeEntry[]>(LOG, []);
  log.push({ t: Date.now(), scene: String(o.scene ?? '').slice(0, 80), objects: String(o.objects ?? '').slice(0, 300), texts: String(o.texts ?? '').slice(0, 300),
    people: String(o.people ?? '').slice(0, 120), ...(fresh ? { lat: loc!.lat, lng: loc!.lng } : {}) });
  await kvPut(LOG, log.filter(e => Date.now() - e.t < 7 * 86_400_000).slice(-3000));
  const say = typeof o.say === 'string' && o.say.trim().length > 3 ? o.say.trim().slice(0, 240) : null;
  if (!say || Date.now() - (st.lastSay ?? 0) < SAY_GAP) return {};
  st.lastSay = Date.now();
  st.said = [...st.said.filter(s => Date.now() - s.t < 30 * 60_000), { t: Date.now(), text: say }].slice(-20);
  await kvPut(STATE, st);
  return { say };
}

/** Note pour l'appel vidéo : il doit savoir qu'il voit et qu'il se souvient. */
export const EYE_NOTE = "L'ŒIL est actif : tu vois sa caméra en continu et tu te souviens de tout ce que tu as vu (outil memoire_visuelle pour « où j'ai posé… », « c'était combien… »). S'il te demande de guetter quelque chose (« préviens-moi si tu vois … »), utilise memoire_visuelle action=watch.";

/** Outil memoire_visuelle. */
export async function eyeTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'ask');
  const st = await kvJson<EyeState>(STATE, { said: [] });
  if (action === 'off' || action === 'on') { st.off = action === 'off'; await kvPut(STATE, st); return st.off ? '👁️ Œil coupé : je ne regarde plus ta caméra en continu (je vois seulement quand tu me demandes).' : '👁️ Œil activé : pendant tes appels vidéo je regarde, je retiens et je te préviens si je vois quelque chose d\'utile.'; }
  if (action === 'clear') { await kvPut(LOG, []); return '🧹 Mémoire visuelle effacée.'; }
  if (action === 'watch' || action === 'unwatch') {
    const what = String(input['target'] ?? '').trim().slice(0, 80);
    let list = await kvJson<string[]>(WATCH, []);
    list = action === 'watch' ? [...new Set([...list, what].filter(Boolean))].slice(-10) : what ? list.filter(w => !w.toLowerCase().includes(what.toLowerCase())) : [];
    await kvPut(WATCH, list);
    return action === 'watch' ? `👁️ Je guette : ${list.join(', ')}. Dès que je le vois à la caméra, je te le dis.` : `👁️ Je ne guette plus ${what || 'rien'}.`;
  }
  const log = await kvJson<EyeEntry[]>(LOG, []);
  if (!log.length) return '👁️ Je n\'ai encore rien vu : passe un appel vidéo Telegram avec moi (caméra allumée) et je retiens tout ce que je vois.';
  const q = String(input['question'] ?? '').trim();
  if (action === 'status' || !q) return `👁️ Mémoire visuelle : ${log.length} moments vus sur 7 jours (dernier : ${hm(log[log.length - 1]!.t)}, ${log[log.length - 1]!.scene}). Je guette : ${(await kvJson<string[]>(WATCH, [])).join(', ') || 'rien'}.${st.off ? ' (Œil coupé)' : ''}`;
  // Les moments qui parlent de la question d'abord, puis les plus récents
  const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/).filter(w => w.length > 3);
  const norm = (e: EyeEntry) => `${e.scene} ${e.objects} ${e.texts} ${e.people}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hits = log.filter(e => words.some(w => norm(e).includes(w)));
  const pick = [...hits.slice(-60), ...log.slice(-40)].filter((e, i, a) => a.indexOf(e) === i).sort((a, b) => a.t - b.t);
  const day = (t: number) => { const d = localNow(t).date; return d === localNow().date ? "aujourd'hui" : d; };
  const lines = pick.map(e => `[${day(e.t)} ${hm(e.t)}${e.lat ? ` @${e.lat.toFixed(4)},${e.lng!.toFixed(4)}` : ''}] lieu: ${e.scene} | objets: ${e.objects} | textes: ${e.texts} | personnes: ${e.people}`);
  const { ai } = await import('./ai-util.js');
  return ai(`Tu es Dzaryx. Voici ce que tu as VU par la caméra de Kouider (journal horodaté) :\n${lines.join('\n')}\n\nSa question : « ${q} »\nRéponds en 1 à 3 phrases, précis : où / quand (heure) / ce qui était écrit. Si tu ne l'as pas vu, dis-le franchement. N'invente rien.`, { max: 300 });
}
