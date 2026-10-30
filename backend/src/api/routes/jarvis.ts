import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { extractBearerToken, validateToken } from '../../auth/tokens.js';
import { env } from '../../config/env.js';
import { startLive, souffleurTurn, meetingChunk, sparringTurn, endLive, type LiveKind } from '../../integrations/jarvis-live.js';

// Page JARVIS de l'app (Souffleur, Réunion, Entraînement, Protocoles, État des lieux vidéo) + vidéos Telegram (tgcall).
const router = Router();

// Kouider seulement : app (jeton appareil) ou tgcall (jeton PC)
function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token && validateToken(token, 'pc-agent')) {
    req.mobileActor = { id: 'kouider', displayName: env.OWNER_NAME, ownerKey: 'kouider', role: 'owner' };
    next(); return;
  }
  requireMobileAuth(req, res, () => {
    if (req.mobileActor?.ownerKey === 'houari') { res.status(403).json({ error: 'réservé à Kouider' }); return; }
    next();
  });
}
router.use(requireOwner);

const fail = (res: Response, e: unknown) => res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
const KINDS: LiveKind[] = ['souffleur', 'reunion', 'sparring'];

router.post('/live/start', async (req, res) => {
  const { kind, goal, lang, role } = req.body as { kind?: LiveKind; goal?: string; lang?: string; role?: string };
  if (!kind || !KINDS.includes(kind)) { res.status(400).json({ error: 'kind = souffleur | reunion | sparring' }); return; }
  try { res.json(await startLive(kind, { goal, lang, role })); } catch (e) { fail(res, e); }
});

router.post('/live/:id/audio', async (req, res) => {
  const { audio, mime = 'audio/webm', kind } = req.body as { audio?: string; mime?: string; kind?: LiveKind };
  if (!audio) { res.status(400).json({ error: 'audio requis' }); return; }
  const id = String(req.params['id']);
  try {
    res.json(kind === 'souffleur' ? await souffleurTurn(id, audio, mime)
      : kind === 'sparring' ? await sparringTurn(id, audio, mime)
      : await meetingChunk(id, audio, mime));
  } catch (e) { fail(res, e); }
});

router.post('/live/:id/end', async (req, res) => {
  try { res.json(await endLive(String(req.params['id']))); } catch (e) { fail(res, e); }
});

router.get('/meetings', async (_req, res) => {
  try {
    const { kvGet } = await import('../../integrations/app-store.js');
    res.json({ meetings: JSON.parse((await kvGet('meetings')) || '[]') });
  } catch (e) { fail(res, e); }
});

router.get('/protocols', async (_req, res) => {
  try { res.json({ protocols: await import('../../integrations/protocols.js').then(m => m.listProtocols()) }); } catch (e) { fail(res, e); }
});

// État des lieux vidéo : images déjà tirées de la vidéo (app : <video> + canvas ; Telegram : ffmpeg sur le VPS)
router.post('/inspection-frames', async (req, res) => {
  const { frames, caption = '' } = req.body as { frames?: Array<{ base64: string; mime?: string }>; caption?: string };
  if (!Array.isArray(frames) || !frames.length) { res.status(400).json({ error: 'frames requis' }); return; }
  try {
    const { inspectFromFrames } = await import('../../integrations/video-inspection.js');
    res.json(await inspectFromFrames(frames.slice(0, 16).map(f => ({ base64: f.base64.replace(/^data:[^,]+,/, ''), mime: f.mime ?? 'image/jpeg' })), String(caption)));
  } catch (e) { fail(res, e); }
});

// Vidéo quelconque (Telegram) → description + voix transcrite ; le cerveau décide ensuite (sport, code, état des lieux…)
router.post('/video-read', async (req, res) => {
  const { frames, caption = '', audio, audioMime } = req.body as { frames?: Array<{ base64: string; mime?: string }>; caption?: string; audio?: string; audioMime?: string };
  if (!Array.isArray(frames) || !frames.length) { res.status(400).json({ error: 'frames requis' }); return; }
  try {
    const { understandVideo } = await import('../../integrations/video-understand.js');
    res.json(await understandVideo(frames.slice(0, 16).map(f => ({ base64: f.base64.replace(/^data:[^,]+,/, ''), mime: f.mime ?? 'image/jpeg' })), String(caption),
      audio ? { base64: audio, mime: audioMime ?? 'audio/mpeg' } : undefined));
  } catch (e) { fail(res, e); }
});

// HUD Iron Man : une image de la caméra → étiquettes posées sur l'image
router.post('/hud', async (req, res) => {
  const { image, mime } = req.body as { image?: string; mime?: string };
  if (!image) { res.status(400).json({ error: 'image requise' }); return; }
  try { res.json(await import('../../integrations/hud.js').then(m => m.hudFrame(image.replace(/^data:[^,]+,/, ''), mime ?? 'image/jpeg'))); } catch (e) { fail(res, e); }
});

// Escouade d'agents : lancer + suivre en direct
router.post('/squad', async (req, res) => {
  const goal = String((req.body as { goal?: string }).goal ?? '').trim();
  if (!goal) { res.status(400).json({ error: 'objectif requis' }); return; }
  try { res.json(await import('../../integrations/squad.js').then(m => m.startSquad(goal))); } catch (e) { fail(res, e); }
});
router.get('/squad', async (req, res) => {
  try { res.json({ squad: await import('../../integrations/squad.js').then(m => m.getSquad(String(req.query['id'] ?? '') || undefined)) }); } catch (e) { fail(res, e); }
});

// ROUTE : dashcam intelligente (panneaux, vitesse, dangers, plaques, boîte noire)
router.post('/road', async (req, res) => {
  const b = req.body as { image?: string; lat?: number; lng?: number; kmh?: number };
  try { res.json(await import('../../integrations/road.js').then(m => m.roadFrame({ image: String(b.image ?? ''), ...(typeof b.lat === 'number' ? { lat: b.lat, lng: b.lng } : {}), ...(typeof b.kmh === 'number' ? { kmh: b.kmh } : {}) }))); } catch (e) { fail(res, e); }
});

// Copilote mains libres : une phrase au volant → réponse dite ; fil des nouveaux messages WhatsApp à lire
router.post('/copilot/audio', async (req, res) => {
  const { audio, mime = 'audio/webm', wake } = req.body as { audio?: string; mime?: string; wake?: boolean };
  if (!audio) { res.status(400).json({ error: 'audio requis' }); return; }
  try { res.json(await import('../../integrations/copilot.js').then(m => m.copilotTurn(audio, mime, !!wake))); } catch (e) { fail(res, e); }
});
router.get('/copilot/feed', async (req, res) => {
  try { res.json({ items: await import('../../integrations/copilot.js').then(m => m.copilotFeed(String(req.query['since'] ?? ''))) }); } catch (e) { fail(res, e); }
});
router.post('/copilot/speak', async (req, res) => {
  const text = String((req.body as { text?: string }).text ?? '').trim();
  if (!text) { res.status(400).json({ error: 'texte requis' }); return; }
  try { res.json(await import('../../integrations/copilot.js').then(m => m.copilotSpeak(text))); } catch (e) { fail(res, e); }
});

// Jarvis santé : le Raccourci iPhone envoie les données de Santé / Apple Watch
router.post('/health', express.text({ type: 'text/*', limit: '1mb' }), async (req, res) => {
  const body = typeof req.body === 'string' ? { data: req.body } : (req.body ?? {}) as Record<string, unknown>;   // corps en texte simple accepté
  try { res.json(await import('../../integrations/jarvis-hub.js').then(m => m.receiveHealth(body))); } catch (e) { fail(res, e); }
});
// Montre : automatisations Raccourcis « Entraînement Apple Watch » commence / se termine (+ relevé de pouls ponctuel)
router.post('/workout', express.text({ type: 'text/*', limit: '1mb' }), async (req, res) => {
  const body = typeof req.body === 'string' ? { data: req.body } : (req.body ?? {}) as Record<string, unknown>;
  try { res.json(await import('../../integrations/workout-live.js').then(m => m.receiveWorkout(body))); } catch (e) { fail(res, e); }
});
router.get('/health', async (_req, res) => {
  try { res.json({ text: [await import('../../integrations/jarvis-hub.js').then(m => m.healthText(14)), await import('../../integrations/workout-live.js').then(m => m.workoutsText(7)).catch(() => '')].filter(Boolean).join('\n\n') }); } catch (e) { fail(res, e); }
});
// « Dis Siri, Dzaryx » : le Raccourci envoie la phrase dictée → phrase à dire + action iPhone (lien à ouvrir)
router.post('/siri', express.text({ type: 'text/*', limit: '1mb' }), async (req, res) => {
  // Corps tolérant (Raccourcis) : JSON {text}, autre nom de champ, ou texte simple
  const b = req.body as unknown;
  const obj = b && typeof b === 'object' ? b as Record<string, unknown> : {};
  const pick = (v: unknown): string => typeof v === 'string' ? v : Array.isArray(v) ? v.map(pick).join(' ') : v && typeof v === 'object' ? pick((v as Record<string, unknown>)['text'] ?? Object.values(v as object)[0]) : '';
  const text = (typeof b === 'string' ? b : pick(obj['text'] ?? obj['Texte dicté'] ?? Object.values(obj).find(v => typeof v === 'string' && v.trim()))).trim();
  if (!text) {
    // Diagnostic dit à voix haute : ce que le Raccourci a réellement envoyé (jamais la clé)
    const keys = Object.keys(obj);
    const what = typeof b === 'string' ? 'un texte vide' : keys.length ? `les champs ${keys.join(', ')}, mais vides` : `rien (type ${String(req.headers['content-type'] ?? 'inconnu').split(';')[0]})`;
    // Silence pendant une conversation suivie = il a fini : on s'arrête sans bruit (listen absent → la boucle se termine)
    if (typeof b !== 'string' && keys.length) { res.json({ say: 'Je reste là.' }); return; }
    res.json({ say: `Je n'ai pas reçu ta phrase. Le raccourci m'a envoyé ${what}. Vérifie que la dictée t'a bien entendu.` });
    return;
  }
  try { res.json(await import('../../integrations/jarvis-hub.js').then(m => m.siriTurn(text))); } catch (e) { fail(res, e); }
});
// Salle de commande (TV / PC), machine à voir le futur, briefing 3D de la Carte live
router.get('/command-center', async (_req, res) => {
  try { res.json(await import('../../integrations/jarvis-hub.js').then(m => m.commandCenter())); } catch (e) { fail(res, e); }
});
router.get('/future', async (_req, res) => {
  try { res.json(await import('../../integrations/jarvis-hub.js').then(m => m.futureBase())); } catch (e) { fail(res, e); }
});
router.get('/briefing', async (_req, res) => {
  try { res.json(await import('../../integrations/jarvis-hub.js').then(m => m.briefing3d())); } catch (e) { fail(res, e); }
});
// Jarvis 4 : automatisations iPhone (CarPlay, chargeur, décisions), widget Scriptable, crise, écran
router.post('/event', express.text({ type: 'text/*', limit: '256kb' }), async (req, res) => {
  const b = (typeof req.body === 'string' ? { type: req.body } : req.body ?? {}) as Record<string, unknown>;
  const type = String(b['type'] ?? req.query['type'] ?? '').trim().toLowerCase();
  if (!type) { res.status(400).json({ error: 'type requis (carplay_on, carplay_off, charger, decisions, decide)' }); return; }
  try { res.json(await import('../../integrations/jarvis4.js').then(m => m.iphoneEvent(type, b))); } catch (e) { fail(res, e); }
});
router.get('/widget', async (_req, res) => {
  try { res.json(await import('../../integrations/jarvis4.js').then(m => m.widgetData())); } catch (e) { fail(res, e); }
});
router.get('/decisions', async (_req, res) => {
  try { res.json({ decisions: await import('../../integrations/conscience.js').then(m => m.pendingDecisions()) }); } catch (e) { fail(res, e); }
});
router.post('/decisions/:id', async (req, res) => {
  try { res.json({ text: await import('../../integrations/conscience.js').then(m => m.chooseDecision(String(req.params['id']), Number((req.body as { choice?: number }).choice) || 1)) }); } catch (e) { fail(res, e); }
});
router.get('/crisis', async (_req, res) => {
  try { const { kvGet } = await import('../../integrations/app-store.js'); res.json({ crisis: JSON.parse((await kvGet('crisis')) || 'null') }); } catch (e) { fail(res, e); }
});
router.get('/screen', async (_req, res) => {
  try { const { kvGet } = await import('../../integrations/app-store.js'); res.json({ screen: JSON.parse((await kvGet('screen:now')) || 'null') }); } catch (e) { fail(res, e); }
});
router.get('/fortune', async (_req, res) => {
  try { res.json(await import('../../integrations/brain-plus.js').then(m => m.fortune())); } catch (e) { fail(res, e); }
});

export default router;
