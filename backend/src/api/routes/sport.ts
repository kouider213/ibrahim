import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import {
  sportOverview, logSportSession, setSportOverride, setSportSkip, setSportSettings, planSportWeek, ROTATION, SESSIONS,
  type SessionType, type SetLog,
} from '../../integrations/sport-coach.js';
import { localNow } from '../../integrations/morning-routine.js';
import { queueTelegramMessage } from '../../notifications/tg-outbox.js';

// Page « SPORT » de l'app (Kouider) : séance du jour, mode séance, semaine calée sur l'agenda, progrès, récupération.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const fail = (res: import('express').Response, err: unknown, code = 500) =>
  res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isType = (v: unknown): v is SessionType => ROTATION.includes(v as SessionType);

// GET /api/sport — tout l'écran
router.get('/', async (_req, res) => {
  try { res.json(await sportOverview()); } catch (err) { fail(res, err); }
});

// POST /api/sport/log { date?, type, sets: [{ ex, kg?, reps? }], durationMin?, rpe?, note? } — fin de séance
router.post('/log', async (req, res) => {
  const b = req.body as { date?: string; type?: string; sets?: SetLog[]; durationMin?: number; rpe?: number; note?: string };
  if (!isType(b.type)) { fail(res, 'type de séance invalide', 400); return; }
  try {
    const date = isDate(b.date) ? b.date : localNow().date;
    const sets = (b.sets ?? []).filter(s => typeof s?.ex === 'string').slice(0, 80)
      .map(s => ({ ex: s.ex, ...(Number(s.kg) > 0 ? { kg: Math.round(Number(s.kg) * 10) / 10 } : {}), ...(Number(s.reps) > 0 ? { reps: Math.round(Number(s.reps)) } : {}) }));
    const r = await logSportSession({ date, type: b.type, sets,
      ...(Number(b.durationMin) > 0 ? { durationMin: Math.round(Number(b.durationMin)) } : {}),
      ...(Number(b.rpe) > 0 ? { rpe: Math.min(10, Math.round(Number(b.rpe))) } : {}),
      ...(b.note ? { note: String(b.note).slice(0, 200) } : {}) });
    const s = SESSIONS[b.type];
    await queueTelegramMessage(`✅ ${s.emoji} ${s.label} terminée${b.durationMin ? ` en ${Math.round(Number(b.durationMin))} min` : ''} — ${sets.length} séries.${r.prs.length ? `\n🏆 Nouveau record : ${r.prs.join(', ')} !` : ''}\nBravo champion, ta femme et ton fils peuvent être fiers. 💪 Pense à boire et à manger des protéines dans l'heure.`).catch(() => {});
    res.json({ ok: true, ...r });
  } catch (err) { fail(res, err); }
});

// POST /api/sport/swap { date, type|null } — changer la séance d'un jour
router.post('/swap', async (req, res) => {
  const b = req.body as { date?: string; type?: string | null };
  if (!isDate(b.date) || (b.type != null && !isType(b.type))) { fail(res, 'date ou type invalide', 400); return; }
  try { await setSportOverride(b.date, b.type ?? null); res.json(await sportOverview()); } catch (err) { fail(res, err); }
});

// POST /api/sport/skip { date, reason|null } — pas de sport ce jour-là
router.post('/skip', async (req, res) => {
  const b = req.body as { date?: string; reason?: string | null };
  if (!isDate(b.date)) { fail(res, 'date invalide', 400); return; }
  try { await setSportSkip(b.date, b.reason ? String(b.reason).slice(0, 60) : null); res.json(await sportOverview()); } catch (err) { fail(res, err); }
});

// POST /api/sport/settings { callBefore?, gymCheck? }
router.post('/settings', async (req, res) => {
  try { res.json({ settings: await setSportSettings(req.body as Record<string, boolean>) }); } catch (err) { fail(res, err); }
});

// POST /api/sport/sync — réécrit les séances dans l'agenda
router.post('/sync', async (_req, res) => {
  try { const r = await planSportWeek(true); res.json({ ok: true, message: `${r.slots.length} séance(s), ${r.note}` }); } catch (err) { fail(res, err); }
});

export default router;
