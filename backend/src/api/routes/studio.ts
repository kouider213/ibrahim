import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import {
  STUDIO_MODELS, STUDIO_CAMERAS, STUDIO_TEMPLATES, STUDIO_LANGS, estimateCost, createStudioPlan, manualPlan,
  startStudioRender, listStudioJobs, getStudioJob, type StudioPlan, type ModelId, type RenderOptions,
} from '../../marketing/video-studio.js';

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
    });
  } catch (err) { fail(res, err); }
});

// POST /api/studio/plan { idea, template, lang, seconds, imageUrl?, carName? } | { manual: { prompt, camera, duration, imageUrl? } }
router.post('/plan', async (req, res) => {
  const b = req.body as { idea?: string; template?: string; lang?: string; seconds?: number; imageUrl?: string; carName?: string;
    manual?: { prompt?: string; camera?: string; duration?: number; imageUrl?: string } };
  try {
    if (b.manual?.prompt) { res.json(await manualPlan({ prompt: b.manual.prompt, camera: b.manual.camera, duration: b.manual.duration, imageUrl: b.manual.imageUrl ?? null })); return; }
    if (!b.idea?.trim()) { res.status(400).json({ error: 'Écris une idée' }); return; }
    res.json(await createStudioPlan({ idea: b.idea, template: b.template, lang: b.lang, seconds: b.seconds, imageUrl: b.imageUrl ?? null, carName: b.carName ?? null }));
  } catch (err) { fail(res, err); }
});

// POST /api/studio/render { plan, options } — le plan peut avoir été modifié dans l'app
router.post('/render', async (req, res) => {
  const b = req.body as { plan?: StudioPlan; options?: Partial<RenderOptions> };
  if (!b.plan?.shots?.length) { res.status(400).json({ error: 'Plan vide' }); return; }
  const o = b.options ?? {};
  const opts: RenderOptions = {
    model: (STUDIO_MODELS[o.model as ModelId] ? o.model : 'gratuit') as ModelId,
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
