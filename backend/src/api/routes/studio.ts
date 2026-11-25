import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { bestModel,
  STUDIO_MODELS, STUDIO_CAMERAS, STUDIO_TEMPLATES, STUDIO_LANGS, estimateCost, createStudioPlan, manualPlan,
  startStudioRender, listStudioJobs, getStudioJob, type StudioPlan, type ModelId, type RenderOptions,
} from '../../marketing/video-studio.js';
import { startAiEdit, estimateAiEdit, joinUploadParts, type AiEditRequest } from '../../marketing/ai-edit.js';
import { EDIT_FORMATS, EDIT_LOOKS, EDIT_CAPTIONS, startEdit, uploadUrl, type EditRequest } from '../../marketing/montage-pro.js';

// Page « STUDIO VIDÉO » de l'app (Kouider) : vidéos IA réalistes (Kling 3, Veo 3.1, Seedance 2) montées en 9:16.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const fail = (res: import('express').Response, err: unknown, code = 500) =>
  res.status(code).json({ error: err instanceof Error ? err.message : String(err) });

// GET /api/studio/options — modèles + prix, caméras, modèles de vidéo, langues, photos de la flotte
router.get('/options', async (_req, res) => {
  try {
    const { data } = await supabase.from('cars').select('id, name, image_url').not('image_url', 'is', null).order('name');
    const { spentUsd } = await listStudioJobs();
    res.json({
      models: Object.entries(STUDIO_MODELS).map(([id, m]) => ({ id, label: m.label, perSec: m.perSec, perSecAudio: m.perSecAudio, durations: m.durations, note: m.note })),
      cameras: Object.entries(STUDIO_CAMERAS).map(([id, c]) => ({ id, label: c.label })),
      templates: Object.entries(STUDIO_TEMPLATES).map(([id, t]) => ({ id, label: t.label })),
      langs: Object.keys(STUDIO_LANGS),
      cars: (data ?? []) as Array<{ id: string; name: string; image_url: string }>,
      spentUsd,
      defaultModel: await bestModel(),
    });
  } catch (err) { fail(res, err); }
});

// POST /api/studio/plan { idea, template, lang, seconds, imageUrl?, carName? } | { manual: { prompt, camera, duration, imageUrl? } }
router.post('/plan', async (req, res) => {
  const b = req.body as { idea?: string; template?: string; lang?: string; seconds?: number; imageUrl?: string; carName?: string;
    manual?: { prompt?: string; camera?: string; duration?: number; imageUrl?: string } };
  try {
    if (b.manual?.prompt) { res.json(await manualPlan({ prompt: b.manual.prompt, camera: b.manual.camera, duration: b.manual.duration, imageUrl: b.manual.imageUrl ?? null })); return; }
    // Idée vide = Dzaryx choisit lui-même la meilleure idée de pub pour ce type de vidéo (création en 1 clic).
    const idea = b.idea?.trim() || 'Aucune idée imposée : choisis toi-même l\'idée de pub la plus virale et la plus vendeuse pour ce type de vidéo.';
    res.json(await createStudioPlan({ idea, template: b.template, lang: b.lang, seconds: b.seconds, imageUrl: b.imageUrl ?? null, carName: b.carName ?? null }));
  } catch (err) { fail(res, err); }
});

// POST /api/studio/render { plan, options } — le plan peut avoir été modifié dans l'app
router.post('/render', async (req, res) => {
  const b = req.body as { plan?: StudioPlan; options?: Partial<RenderOptions> };
  if (!b.plan?.shots?.length) { res.status(400).json({ error: 'Plan vide' }); return; }
  const o = b.options ?? {};
  const opts: RenderOptions = {
    model: (STUDIO_MODELS[o.model as ModelId] ? o.model : await bestModel()) as ModelId,
    nativeAudio: !!o.nativeAudio, voice: o.voice !== false && !!b.plan.voiceover, music: !!o.music, subtitles: o.subtitles !== false, outro: o.outro !== false,
  };
  const plan: StudioPlan = {
    ...b.plan,
    shots: b.plan.shots.slice(0, 8).map(s => ({
      prompt: String(s.prompt ?? '').slice(0, 1500), camera: STUDIO_CAMERAS[s.camera] ? s.camera : 'auto',
      duration: Math.min(10, Math.max(3, Math.round(Number(s.duration) || 5))), use_image: !!s.use_image,
    })).filter(s => s.prompt),
  };
  try { res.json({ job: await startStudioRender(plan, opts, 'kouider'), estimateUsd: estimateCost(plan.shots, opts) }); }
  catch (err) { fail(res, err, 400); }
});

// ── MONTAGE PRO (façon CapCut, gratuit) : rushes du téléphone → montage auto par Dzaryx ou éditeur manuel ──
router.get('/edit/options', (_req, res) => {
  res.json({
    formats: Object.keys(EDIT_FORMATS), looks: Object.entries(EDIT_LOOKS).map(([id, l]) => ({ id, label: l.label })),
    captions: Object.entries(EDIT_CAPTIONS).map(([id, c]) => ({ id, label: c.label })),
  });
});

// POST /api/studio/upload-url { name } → lien d'envoi direct vers le stockage FIK (gros fichiers)
router.post('/upload-url', async (req, res) => {
  try { res.json(await uploadUrl(String((req.body as { name?: string }).name ?? 'rush.mp4'))); } catch (err) { fail(res, err); }
});

// POST /api/studio/edit EditRequest — media[] (auto) ou timeline[] (éditeur)
router.post('/edit', async (req, res) => {
  try { res.json({ job: await startEdit(req.body as EditRequest, 'kouider') }); } catch (err) { fail(res, err, 400); }
});

// 25/11 POST /api/studio/rush { text, url, frames? } — vraie vidéo d'une voiture (Telegram « pub Clio ») → bibliothèque des pubs
router.post('/rush', async (req, res) => {
  const b = req.body as { text?: string; url?: string; frames?: string[] };
  if (!b.url) { res.status(400).json({ error: 'url requise' }); return; }
  try {
    const { addRush } = await import('../../marketing/car-rushes.js');
    res.json({ text: await addRush(String(b.text ?? ''), String(b.url), Array.isArray(b.frames) ? b.frames.map(String).slice(0, 3) : []) });
  } catch (err) { fail(res, err); }
});

// POST /api/studio/upload-join { urls, name } — gros fichier envoyé en morceaux → recollé + compressé (< 50 Mo)
router.post('/upload-join', async (req, res) => {
  const b = req.body as { urls?: string[]; name?: string };
  try { res.json(await joinUploadParts(Array.isArray(b.urls) ? b.urls.map(String) : [], String(b.name ?? 'rush.mp4'))); } catch (err) { fail(res, err); }
});

// « Modifier par l'IA » : ta photo/vidéo + une phrase → retouchée (photo gratuite ; vidéo Kling, devis avant)
router.post('/ai-edit/estimate', async (req, res) => {
  const b = req.body as { type?: string; seconds?: number; quality?: string };
  const { falEmptyNow } = await import('../../marketing/video-studio.js');
  const free = await falEmptyNow();
  res.json({ usd: estimateAiEdit(b.type === 'video' ? 'video' : 'image', Number(b.seconds) || 10, b.quality === 'max' ? 'max' : 'gratuit', free), free });
});
router.post('/ai-edit', async (req, res) => {
  try { res.json({ job: await startAiEdit(req.body as AiEditRequest, 'kouider') }); } catch (err) { fail(res, err, 400); }
});

// 24/11 : onglet 📈 TikTok de la page MONTAGE — chiffres + idées de l'équipe TikTok (tiktok-growth.ts)
router.get('/tiktok', async (_req, res) => {
  try {
    const tg = await import('../../marketing/tiktok-growth.js');
    const g = await tg.getGrowth();
    if (!g) { res.json({ growth: null }); return; }
    const best = g.slots?.find(s => s.prime);
    res.json({ growth: {
      at: g.at, followers: g.followers, followers7: g.followers7, views7: g.views7, audience: g.audience,
      bestHour: best ? `${best.h}h${String(best.m).padStart(2, '0')}` : null, hours: g.hours ?? null,
      videos: g.videos.slice(0, 5).map(v => ({ id: v.id, desc: v.desc.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120), plays: v.plays, likes: v.likes, saves: v.saves, shares: v.shares })),
      searches: g.searches.slice(0, 8), analysis: g.analysis, traffic: g.traffic ?? null, week: tg.weekPlan(g),
    } });
  } catch (err) { fail(res, err); }
});
// Créer une pub depuis une idée de l'équipe (plan ≈ 1 min → la pub arrive sur Telegram + ici, avec les boutons de publication)
router.post('/pub-tiktok', async (req, res) => {
  const idea = String((req.body ?? {}).idea ?? '').slice(0, 800);
  res.json({ message: '🎬 Pub lancée : prête dans 5 à 12 min sur Telegram et ici, avec le choix de la publier sur TikTok.' });
  void import('../../marketing/tiktok-pub.js').then(m => m.tiktokPubTool({ idea }, 'kouider'))
    .catch(e => console.warn('[studio] pub-tiktok', e instanceof Error ? e.message : e));
});
// Réunion d'équipe tout de suite (relit TikTok ≈ 2 min) → Telegram
router.post('/tiktok-meeting', async (_req, res) => {
  res.json({ message: '📊 Réunion lancée : je relis ton TikTok, le compte-rendu arrive sur Telegram dans 2-3 min.' });
  void import('../../marketing/tiktok-growth.js').then(m => m.weeklyMeeting(true)).catch(e => console.warn('[studio] réunion', e instanceof Error ? e.message : e));
});

// 24/11 : bouton « Publier sur TikTok » de la page MONTAGE — publication 1-5 min sur le PC cloud → résultat sur Telegram.
router.post('/publish-tiktok', async (req, res) => {
  const b = (req.body ?? {}) as { job_id?: string; at?: string; decline?: boolean };
  const m = await import('../../marketing/tiktok-pub.js');
  if (b.at || b.decline) { try { res.json({ message: await m.publishPubTool(b) }); } catch (err) { fail(res, err); } return; }
  res.json({ message: '⏳ Publication sur TikTok en cours (1 à 5 min) : je te confirme sur Telegram.' });
  void m.publishPubTool(b).then(r => import('../../notifications/tg-outbox.js').then(t => t.queueTelegramMessage(r, undefined, 'kouider', undefined, true)))
    .catch(e => console.warn('[studio] publish-tiktok', e instanceof Error ? e.message : e));
});

router.get('/jobs', async (_req, res) => {
  try { res.json(await listStudioJobs()); } catch (err) { fail(res, err); }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await getStudioJob(String(req.params['id']));
    if (!job) { res.status(404).json({ error: 'Rendu introuvable' }); return; }
    res.json(job);
  } catch (err) { fail(res, err); }
});

export default router;
