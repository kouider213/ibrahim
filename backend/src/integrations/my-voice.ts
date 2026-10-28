/**
 * TA VOIX (Kouider 28/10 : « un truc de fou ») — Dzaryx apprend la VRAIE voix de Kouider à partir de ses propres vocaux
 * Telegram (jamais un vocal transféré, jamais la voix de quelqu'un d'autre) et peut ensuite parler AVEC SA VOIX :
 *  - n'importe quel texte, dans n'importe quelle langue (arabe, darija, anglais, espagnol, néerlandais…) : Kouider parle
 *    une langue qu'il ne parle pas, avec son propre timbre → fichier audio sur Telegram, à transférer à qui il veut ;
 *  - vocaux WhatsApp avec sa voix (whatsapp_web send_voice + ma_voix, toujours après son « oui ») ;
 *  - HISTOIRES DE PAPA : une histoire du soir pour Ibrahim racontée avec la voix de son père (français ou darija),
 *    même quand il est à la salle, au travail ou en Algérie.
 * Clonage : MiniMax (Replicate, sinon fal.ai). Échantillon = ses derniers vocaux mis bout à bout par tgcall.
 */
import crypto from 'node:crypto';
import { kvGet, kvSet } from './app-store.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { API_BASE } from './client-sites.js';

const SAMPLE = 'kouider:voice:sample', CLONE = 'kouider:voice:clone';
const OUT = (t: string) => `voice:file:${t}`;
interface Sample { b64: string; seconds: number; at: number }
interface Clone { provider: 'replicate' | 'fal'; voiceId: string; at: number; seconds: number }

const LANG: Array<[RegExp, string, string]> = [
  [/darija|dziri|alg[ée]rien/i, 'Arabic', 'darija algérienne (écrite en lettres arabes, mots de tous les jours d\'Oran)'],
  [/arabe|arabic/i, 'Arabic', 'arabe standard'], [/anglais|english/i, 'English', 'anglais'], [/espagnol|spanish/i, 'Spanish', 'espagnol'],
  [/n[ée]erlandais|flamand|dutch/i, 'Dutch', 'néerlandais'], [/allemand|german/i, 'German', 'allemand'], [/italien/i, 'Italian', 'italien'],
  [/turc|turkish/i, 'Turkish', 'turc'], [/portugais/i, 'Portuguese', 'portugais'], [/chinois|mandarin/i, 'Chinese', 'chinois mandarin'],
  [/japonais/i, 'Japanese', 'japonais'], [/russe/i, 'Russian', 'russe'], [/fran[cç]ais/i, 'French', 'français'],
];
const langOf = (l?: string) => { const x = LANG.find(([re]) => re.test(l ?? '')); return x ? { boost: x[1], name: x[2] } : { boost: 'French', name: 'français' }; };

/** Lien public temporaire (jeton aléatoire) vers un audio gardé dans app_kv — pour le clonage et les envois Telegram. */
async function publish(b64: string, ttl = 2 * 86_400): Promise<string> {
  const t = crypto.randomBytes(16).toString('hex');
  await kvSet(OUT(t), b64, ttl);
  return `${API_BASE()}/api/call/voice-file/${t}.mp3`;
}
/** Image / vidéo publiée de la même façon (photo de référence pour le double vidéo). */
export async function publishMedia(b64: string, mime: string, ttl = 3600): Promise<string> {
  const t = crypto.randomBytes(16).toString('hex');
  await kvSet(`media:file:${t}`, JSON.stringify({ mime, b64 }), ttl);
  return `${API_BASE()}/api/call/media/${t}.${mime.includes('png') ? 'png' : mime.includes('mp4') ? 'mp4' : 'jpg'}`;
}
export async function mediaFile(token: string): Promise<{ mime: string; buf: Buffer } | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const j = JSON.parse((await kvGet(`media:file:${token}`).catch(() => null)) ?? 'null') as { mime: string; b64: string } | null;
  return j ? { mime: j.mime, buf: Buffer.from(j.b64, 'base64') } : null;
}
export async function voiceFile(token: string): Promise<Buffer | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const b64 = await kvGet(OUT(token)).catch(() => null);
  return b64 ? Buffer.from(b64, 'base64') : null;
}

// ── Fournisseurs ─────────────────────────────────────────────────────────────
async function replicate(model: string, input: Record<string, unknown>, polls = 40): Promise<unknown> {
  const token = process.env['REPLICATE_API_TOKEN'];
  if (!token) throw new Error('REPLICATE_API_TOKEN manquant');
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=60' };
  let p = await (await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, { method: 'POST', headers: h, body: JSON.stringify({ input }) })).json() as { status?: string; output?: unknown; error?: string; detail?: string; urls?: { get: string } };
  for (let i = 0; i < polls && p.status && !['succeeded', 'failed', 'canceled'].includes(p.status) && p.urls?.get; i++) {
    await new Promise(r => setTimeout(r, 3000));
    p = await (await fetch(p.urls.get, { headers: h })).json() as typeof p;
  }
  if (p.status !== 'succeeded') throw new Error(`replicate ${model} : ${p.error ?? p.detail ?? p.status}`);
  return p.output;
}
async function fal(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = process.env['FAL_KEY'] || process.env['FAL_API_KEY'];
  if (!key) throw new Error('FAL_KEY manquant');
  const r = await fetch(`https://fal.run/${model}`, { method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(model.includes('omnihuman') ? 600_000 : 180_000) });
  const j = await r.json() as Record<string, unknown>;
  if (!r.ok) throw new Error(`fal ${model} : ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const pick = (o: unknown, ...keys: string[]): string | null => {
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object') for (const k of keys) { const v = (o as Record<string, unknown>)[k]; if (typeof v === 'string') return v; if (v && typeof v === 'object' && typeof (v as { url?: string }).url === 'string') return (v as { url: string }).url; }
  return null;
};

/** Apprend (ou réapprend) sa voix à partir de l'échantillon envoyé par tgcall. */
export async function cloneMyVoice(): Promise<Clone> {
  const s = JSON.parse((await kvGet(SAMPLE)) ?? 'null') as Sample | null;
  if (!s || s.seconds < 10) throw new Error(`pas assez de voix (${Math.round(s?.seconds ?? 0)} s sur 10 s minimum) : envoie-moi un vocal de 30 secondes où tu parles normalement`);
  const url = await publish(s.b64, 3600);
  const errs: string[] = [];
  try {
    const out = await replicate('minimax/voice-cloning', { voice_file: url, model: 'speech-02-hd', need_noise_reduction: true, need_volume_normalization: true });
    const id = pick(out, 'voice_id', 'custom_voice_id');
    if (id) { const c: Clone = { provider: 'replicate', voiceId: id, at: Date.now(), seconds: s.seconds }; await kvSet(CLONE, JSON.stringify(c)); return c; }
    errs.push(`replicate : réponse sans voice_id (${JSON.stringify(out).slice(0, 120)})`);
  } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
  try {
    const out = await fal('fal-ai/minimax/voice-clone', { audio_url: url, noise_reduction: true, need_volume_normalization: true });
    const id = pick(out, 'custom_voice_id', 'voice_id');
    if (id) { const c: Clone = { provider: 'fal', voiceId: id, at: Date.now(), seconds: s.seconds }; await kvSet(CLONE, JSON.stringify(c)); return c; }
    errs.push(`fal : réponse sans voice_id (${JSON.stringify(out).slice(0, 120)})`);
  } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
  throw new Error(errs.join(' | '));
}

async function synth(c: Clone, text: string, boost: string): Promise<Buffer> {
  const url = c.provider === 'replicate'
    ? pick(await replicate('minimax/speech-02-hd', { text, voice_id: c.voiceId, language_boost: boost, emotion: 'auto', speed: 1, english_normalization: boost === 'English' }), 'audio', 'url')
    : pick(await fal('fal-ai/minimax/speech-02-hd', { text, voice_setting: { voice_id: c.voiceId, speed: 1 }, language_boost: boost, output_format: 'url' }), 'audio', 'url');
  if (!url) throw new Error('pas d\'audio en retour');
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`audio ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Texte → mp3 avec la voix de Kouider. Voix clonée expirée (MiniMax oublie une voix inutilisée) → réapprise une fois. */
export async function speakAsKouider(text: string, lang?: string): Promise<Buffer> {
  let c = JSON.parse((await kvGet(CLONE)) ?? 'null') as Clone | null;
  if (!c) c = await cloneMyVoice();
  const { boost } = langOf(lang);
  try { return await synth(c, text.slice(0, 2500), boost); }
  catch { c = await cloneMyVoice(); return synth(c, text.slice(0, 2500), boost); }
}
export const hasMyVoice = async () => !!(await kvGet(CLONE).catch(() => null));

// ── TON DOUBLE VIDÉO : sa photo de référence + sa voix clonée → vidéo où il parle (bouche, tête, expressions) ──
const FACE = 'kouider:face:photo';
async function talkingVideo(imageUrl: string, audioUrl: string): Promise<string> {
  const errs: string[] = [];
  try {
    const out = await replicate('bytedance/omni-human', { image: imageUrl, audio: audioUrl }, 150);   // vidéo : jusqu'à ~8 min
    const url = pick(out, 'video', 'url'); if (url) return url;
    errs.push(`replicate : ${JSON.stringify(out).slice(0, 120)}`);
  } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
  try {
    const out = await fal('fal-ai/bytedance/omnihuman', { image_url: imageUrl, audio_url: audioUrl });
    const url = pick(out, 'video', 'url'); if (url) return url;
    errs.push(`fal : ${JSON.stringify(out).slice(0, 120)}`);
  } catch (e) { errs.push(e instanceof Error ? e.message : String(e)); }
  throw new Error(errs.join(' | '));
}
/** Fabrique la vidéo en arrière-plan (2 à 6 min) puis l'envoie sur Telegram. */
async function makeDoubleVideo(text: string, lang: string, caption: string, testImage?: string): Promise<void> {
  const face = testImage ?? (await kvGet(FACE).catch(() => null));
  if (!face) throw new Error('pas de photo de référence');
  const audio = testImage ? Buffer.from(String(await kvGet('voice:test:audio').catch(() => '') ?? ''), 'base64') : await speakAsKouider(text, lang);
  const video = await talkingVideo(await publishMedia(face, 'image/jpeg', 3 * 3600), await publish(audio.toString('base64'), 3 * 3600));
  if (testImage) { await kvSet('voice:test:video', video, 3600); return; }
  await queueTelegramMessage(caption, undefined, 'kouider', { url: video, name: `ton-double-${Date.now()}.mp4` }, true);
}

/** tgcall : ses derniers vocaux (les siens, pas transférés) mis bout à bout en mp3. Première fois ≥ 20 s → apprise toute seule. */
export async function saveVoiceSample(b64: string, seconds: number): Promise<string> {
  if (!b64 || b64.length > 6_000_000) return 'échantillon refusé';
  const had = JSON.parse((await kvGet(SAMPLE)) ?? 'null') as Sample | null;
  await kvSet(SAMPLE, JSON.stringify({ b64, seconds, at: Date.now() } satisfies Sample));
  const c = JSON.parse((await kvGet(CLONE)) ?? 'null') as Clone | null;
  // Apprentissage auto : la 1re fois qu'on a 20 s, puis quand on a nettement plus de voix (meilleure ressemblance)
  if (seconds >= 20 && (!c || (seconds >= c.seconds * 2 && c.seconds < 90))) {
    try {
      await cloneMyVoice();
      if (!c) await queueTelegramMessage(`🎙️ J'ai appris ta voix (${Math.round(seconds)} s de tes vocaux).\nJe peux maintenant parler AVEC TA VOIX, dans n'importe quelle langue. Essaie :\n• « dis en arabe avec ma voix : … »\n• « raconte une histoire à Ibrahim avec ma voix »\n• « envoie-lui un vocal avec ma voix » (WhatsApp, après ton oui)`, undefined, 'kouider', undefined, true);
    } catch (e) { console.warn('[my-voice] clone', e instanceof Error ? e.message : e); }
  }
  return had ? 'ok' : 'premier échantillon';
}

async function sendAudio(buf: Buffer, caption: string, name: string): Promise<void> {
  await queueTelegramMessage(caption, undefined, 'kouider', { url: await publish(buf.toString('base64')), name }, true);
}

/** Outil ma_voix. */
export async function myVoiceTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'status');
  try {
    if (action === 'status') {
      const c = JSON.parse((await kvGet(CLONE)) ?? 'null') as Clone | null;
      const s = JSON.parse((await kvGet(SAMPLE)) ?? 'null') as Sample | null;
      return c ? `🎙️ Ta voix est apprise (${Math.round(c.seconds)} s de vocaux, ${new Date(c.at).toLocaleDateString('fr-FR')}). Plus tu m'envoies de vocaux, plus elle te ressemble.`
        : `🎙️ Pas encore apprise : j'ai ${Math.round(s?.seconds ?? 0)} s de ta voix, il m'en faut 20. Envoie-moi un vocal Telegram de 30 s où tu parles normalement (pas un vocal transféré).`;
    }
    if (action === 'test') { const b = await speakAsKouider(String(input['text'] ?? 'Test.'), String(input['langue'] ?? '')); return `✅ test voix : ${b.length} octets (rien envoyé)`; }   // contrôle technique
    if (action === 'photo') {
      const { lastPhoto } = await import('./ai-util.js');
      const ph = await lastPhoto(sessionId);
      if (!ph) return '❌ Envoie-moi d\'abord une photo de TOI (visage de face, bien éclairé, épaules visibles), puis redis « c\'est ma photo pour mon double ».';
      await kvSet(FACE, ph.base64);
      return '✅ Photo de référence enregistrée pour ton double vidéo. Demande « fais une vidéo de moi qui dit … en anglais ».';
    }
    if (action === 'video' || action === 'histoire_video') {
      if (!(await kvGet(FACE).catch(() => null))) return '❌ Il me faut une photo de toi : envoie un selfie de face (bien éclairé), puis dis « c\'est ma photo pour mon double ».';
      if (!(await hasMyVoice())) return '❌ Il me faut d\'abord ta voix : envoie-moi un vocal Telegram de 30 s.';
      let text = String(input['text'] ?? '').trim();
      const langue = String(input['langue'] ?? '');
      const lang = langOf(langue);
      const { ai } = await import('./ai-util.js');
      if (action === 'histoire_video') {
        const darija = /darija|arabe/i.test(langue);
        text = (await ai(`Petite histoire du soir de 40 secondes qu'un papa (Kouider) raconte face caméra à son fils Ibrahim, 18 mois. ${darija ? 'EN DARIJA ALGÉRIENNE en lettres arabes.' : 'En français très simple.'} Ibrahim est le héros${input['theme'] ? `, thème : ${String(input['theme']).slice(0, 100)}` : ''}. Termine par « papa t'aime, bonne nuit mon Ibrahim ». Réponds UNIQUEMENT avec l'histoire.`, { max: 500 })).trim();
      } else {
        if (!text) return '❌ Qu\'est-ce que ton double doit dire ?';
        if (lang.boost !== 'French' || /darija/i.test(langue)) text = (await ai(`Traduis en ${lang.name}, naturel à l'oral, sans rien ajouter. Réponds UNIQUEMENT avec le texte.\n\n${text}`, { max: 600 })).trim();
      }
      text = text.slice(0, 600);          // ~40 s max : coût et temps de fabrication raisonnables
      const caption = action === 'histoire_video' ? '🌙 Papa raconte (vidéo) : ton double raconte une histoire à Ibrahim, avec ton visage et ta voix.' : `🎬 TON DOUBLE${lang.boost !== 'French' ? ` en ${lang.name.split(' (')[0]}` : ''} : « ${text.slice(0, 300)} »`;
      void makeDoubleVideo(text, langue, caption).catch(async e => queueTelegramMessage(`❌ Vidéo de ton double ratée : ${e instanceof Error ? e.message : String(e)}`.slice(0, 400), undefined, 'kouider', undefined, true));
      return `🎬 Fabrication lancée : ton double (ton visage + ta voix) va dire${lang.boost !== 'French' ? ` en ${lang.name.split(' (')[0]}` : ''} « ${text.slice(0, 200)}… ». La vidéo arrive sur Telegram dans 2 à 6 minutes. Dis-le-lui.`;
    }
    if (action === 'test_video') {         // contrôle technique : image + audio de test déjà en mémoire, rien n'est envoyé
      const img = await kvGet('voice:test:image').catch(() => null);
      if (!img) return '❌ pas d\'image de test';
      await makeDoubleVideo('', '', '', img);
      return `✅ vidéo test : ${await kvGet('voice:test:video').catch(() => '?')}`;
    }
    if (action === 'clone') { const c = await cloneMyVoice(); return `✅ Voix (ré)apprise à partir de ${Math.round(c.seconds)} s de tes vocaux.`; }
    if (action === 'dire') {
      let text = String(input['text'] ?? '').trim();
      if (!text) return '❌ Quel texte dire avec sa voix ?';
      const lang = langOf(String(input['langue'] ?? ''));
      if (lang.boost !== 'French' || /darija/i.test(String(input['langue'] ?? ''))) {
        const { ai } = await import('./ai-util.js');
        text = (await ai(`Traduis en ${lang.name} ce que Kouider veut dire, avec ses mots à lui, naturel à l'oral (pas de traduction mot à mot), sans rien ajouter. Réponds UNIQUEMENT avec le texte traduit.\n\n${text}`, { max: 800 })).trim();
      }
      const buf = await speakAsKouider(text, String(input['langue'] ?? ''));
      await sendAudio(buf, `🎙️ Avec TA voix${lang.boost !== 'French' ? ` en ${lang.name.split(' (')[0]}` : ''} :\n« ${text.slice(0, 600)} »\n(fichier audio : transfère-le à qui tu veux)`, `ma-voix-${Date.now()}.mp3`);
      return `✅ Audio avec sa voix envoyé sur Telegram${lang.boost !== 'French' ? ` (traduit en ${lang.name})` : ''} : « ${text.slice(0, 300)} ». Dis-le-lui simplement.`;
    }
    if (action === 'histoire') {
      const { ai } = await import('./ai-util.js');
      const darija = /darija|arabe/i.test(String(input['langue'] ?? ''));
      const story = (await ai(`Écris une histoire du soir de 1 min 30 à lire à voix haute par un papa (Kouider) à son fils Ibrahim, 18 mois. ${darija ? 'EN DARIJA ALGÉRIENNE écrite en lettres arabes, mots doux de maman et papa d\'Oran.' : 'En français très simple.'} Phrases courtes, répétitions, bruits d'animaux, douceur, Ibrahim est le héros${input['theme'] ? `, thème : ${String(input['theme']).slice(0, 100)}` : ''}. Termine par « papa t'aime, bonne nuit mon Ibrahim » (${darija ? 'en darija' : 'en français'}). Réponds UNIQUEMENT avec l'histoire.`, { max: 900 })).trim();
      const buf = await speakAsKouider(story, darija ? 'darija' : 'français');
      await sendAudio(buf, `🌙 Histoire du soir pour Ibrahim, racontée avec TA voix${darija ? ' (en darija)' : ''}.\nFais-la écouter à la maison, ou transfère-la à sa maman.`, `histoire-ibrahim-${Date.now()}.mp3`);
      return `✅ Histoire pour Ibrahim racontée avec la voix de papa, envoyée sur Telegram (${story.length} caractères).`;
    }
    return '❌ action : status, clone, dire (text, langue), histoire (theme, langue), photo, video (text, langue), histoire_video (theme, langue).';
  } catch (e) {
    return `❌ Voix pas prête : ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
  }
}
