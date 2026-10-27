/**
 * ÉTAT DES LIEUX EN VIDÉO (27/10/2026) : Kouider filme le tour de la voiture (+ le tableau de bord) au lieu de prendre
 * 10 photos. L'app (page JARVIS) ou Telegram (vidéo avec une légende « départ Clio Benali » / « retour 208 ») en tirent
 * ~12 images ; ici : quelle location (légende + réservations du jour), plaque, kilométrage et essence lus sur le tableau de
 * bord, choix des vues extérieures nettes, puis l'état AVANT / APRÈS habituel (dégâts, comparaison, dossier) + km enregistré.
 */
import { supabase } from './supabase.js';
import { saveBeforeState, saveAfterState } from './vehicle-state.js';
import { vision, jsonOf, type Img } from './media-util.js';
import { createAnthropic, CLAUDE_FAST } from './anthropic-compat.js';

const anthropic = createAnthropic();

interface Who { type: 'before' | 'after' | ''; car: string; client: string }

async function whichRental(caption: string): Promise<Who> {
  const from = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from('bookings').select('client_name, start_date, end_date, status, cars(name)')
    .neq('status', 'cancelled').or(`and(start_date.gte.${from},start_date.lte.${to}),and(end_date.gte.${from},end_date.lte.${to})`).limit(30);
  const rows = (data ?? []) as unknown as Array<{ client_name: string; start_date: string; end_date: string; cars?: { name?: string } | null }>;
  const list = rows.map(b => `- ${b.cars?.name ?? '?'} / ${b.client_name} : départ ${b.start_date.slice(0, 16)}, retour ${b.end_date.slice(0, 16)}`).join('\n') || '(aucune)';
  const r = await anthropic.messages.create({ model: CLAUDE_FAST, max_tokens: 200, messages: [{ role: 'user', content:
    `Kouider envoie une vidéo d'état des lieux d'une voiture de location avec ce texte : « ${caption || '(aucun texte)'} ».
Aujourd'hui : ${new Date().toISOString().slice(0, 16)}. Locations qui partent ou reviennent autour d'aujourd'hui :\n${list}
Déduis : départ (before) ou retour (after), la voiture et le client. Si le texte ne suffit pas mais qu'UNE seule location colle (départ ou retour aujourd'hui), prends-la.
Si tu ne peux pas savoir, laisse vide. Réponds UNIQUEMENT : {"type":"before|after|","car":"","client":""}` }] });
  const j = jsonOf<Who>(r.content.map(b => (b.type === 'text' ? b.text : '')).join('')) ?? { type: '', car: '', client: '' };
  return { type: j.type === 'before' || j.type === 'after' ? j.type : '', car: String(j.car ?? '').trim(), client: String(j.client ?? '').trim() };
}

const READ_PROMPT = (n: number) => `Voici ${n} images tirées (dans l'ordre) d'une vidéo où Kouider fait le tour d'une voiture de location.
Pour CHAQUE image (index 0 à ${n - 1}) dis ce qu'elle montre, et lis ce qui est lisible.
Réponds UNIQUEMENT avec ce JSON :
{"frames":[{"i":0,"view":"avant|arrière|côté gauche|côté droit|tableau de bord|intérieur|roue|toit|flou|autre","sharp":true}],
"plate":"plaque d'immatriculation lue ou vide","km":"kilométrage lu au compteur (chiffres seuls) ou vide","fuel":"niveau d'essence lu (ex. 1/2, 3/4, 40 %) ou vide",
"warnings":"voyants allumés au tableau de bord ou vide","car_model":"marque/modèle/couleur visibles"}`;

export async function inspectFromFrames(frames: Img[], caption: string): Promise<{ ok: boolean; text: string }> {
  if (frames.length < 3) return { ok: false, text: '❌ Vidéo trop courte : filme tout le tour de la voiture puis le tableau de bord (20 à 60 s).' };
  const [who, raw] = await Promise.all([
    whichRental(caption),
    vision(frames.slice(0, 14), READ_PROMPT(Math.min(frames.length, 14)), { quality: true, maxTokens: 1400 }),
  ]);
  const read = jsonOf<{ frames?: Array<{ i: number; view: string; sharp?: boolean }>; plate?: string; km?: string; fuel?: string; warnings?: string; car_model?: string }>(raw) ?? {};
  if (!who.type || !who.car || !who.client) {
    return { ok: false, text: `🎥 J'ai bien la vidéo${read.car_model ? ` (${read.car_model}${read.plate ? `, ${read.plate}` : ''})` : ''}, mais je ne sais pas `
      + `${!who.type ? 'si c\'est un DÉPART ou un RETOUR' : ''}${!who.type && (!who.car || !who.client) ? ' ni ' : ''}${!who.car || !who.client ? 'pour quelle location' : ''}.\n`
      + 'Renvoie-la avec un texte du genre « départ Clio Benali » ou « retour 208 Karim ».' };
  }
  // Vues extérieures nettes pour les dégâts (8 max) ; si la lecture a échoué, on prend tout
  const ext = (read.frames ?? []).filter(f => f.sharp !== false && /avant|arri|c[oô]t|roue|toit/.test(f.view)).map(f => frames[f.i]).filter((f): f is Img => !!f);
  const pick = (ext.length >= 3 ? ext : frames).slice(0, 8);
  const res = who.type === 'before'
    ? await saveBeforeState(who.client, who.car, pick, 'kouider')
    : await saveAfterState(who.client, who.car, pick, 'kouider');
  const km = Number(String(read.km ?? '').replace(/\D/g, ''));
  const kmLine = km > 0 ? await import('../notifications/client-care.js').then(m => m.recordCarKm(who.car, km)).catch(() => '') : '';
  const dash = [read.plate ? `🔖 Plaque : ${read.plate}` : '', km > 0 ? `🧭 Compteur : ${km.toLocaleString('fr-FR')} km` : '🧭 Compteur : pas lu (filme le tableau de bord moteur allumé)',
    read.fuel ? `⛽ Essence : ${read.fuel}` : '', read.warnings ? `🚨 Voyants : ${read.warnings}` : ''].filter(Boolean).join('\n');
  return { ok: res.success, text: [`🎥 État des lieux vidéo — ${pick.length} vues analysées`, dash, '', res.message, kmLine].filter(Boolean).join('\n') };
}
