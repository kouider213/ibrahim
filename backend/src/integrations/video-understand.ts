/**
 * Vidéo envoyée à Dzaryx sur Telegram (28/10) — N'IMPORTE QUELLE vidéo : séance de sport, bug ou écran d'appli à coder,
 * site à copier, voiture, document filmé… → images + voix transcrite → description précise, puis le cerveau normal
 * (/api/call/turn) décide avec la consigne de Kouider : sport_coach plan_day, se_coder, état des lieux, etc.
 */
import { vision, jsonOf, type Img } from './media-util.js';

const PROMPT = (n: number, caption: string, speech: string) => `Ces ${n} images sont extraites dans l'ordre d'UNE vidéo envoyée par Kouider à son assistant Dzaryx.
${caption ? `Sa consigne : « ${caption} »` : 'Pas de consigne écrite.'}
${speech ? `Ce qu'on entend dans la vidéo : « ${speech.slice(0, 3000)} »` : ''}

Décris la vidéo pour que l'assistant puisse AGIR dessus sans la voir. Sois précis et complet, recopie tous les textes visibles.
- Programme / exercices de sport : CHAQUE exercice dans l'ordre, avec son nom tel qu'écrit, séries × reps, le jour/titre (« JOUR 2 : DOS & BICEPS »), le muscle (pecs, dos, epaules, bras, jambes, abdos, cardio).
- Appli, site, écran, bug : chaque écran, textes, boutons, messages d'erreur, ce que la personne fait, ce qui ne marche pas, le style (couleurs, mise en page).
- Voiture : modèle, plaque, dégâts visibles, kilométrage/carburant si visible.
- Autre : l'essentiel, chiffres et textes compris.
Réponds UNIQUEMENT en JSON : {"kind":"sport|app|car|document|other","title":"…","description":"…"}`;

export async function understandVideo(frames: Img[], caption: string, audio?: { base64: string; mime: string }): Promise<{ kind: string; title: string; description: string; speech: string }> {
  let speech = '';
  if (audio?.base64) {
    speech = await import('../api/routes/transcribe.js').then(m => m.transcribeAudio(audio.base64, audio.mime, undefined, true)).then(r => r.text.trim()).catch(() => '');
  }
  const raw = await vision(frames.slice(0, 16), PROMPT(Math.min(frames.length, 16), caption, speech), { quality: true, maxTokens: 2500 });
  const j = jsonOf<{ kind?: string; title?: string; description?: string }>(raw);
  return { kind: String(j?.kind ?? 'other'), title: String(j?.title ?? ''), description: String(j?.description ?? raw).slice(0, 6000), speech };
}
