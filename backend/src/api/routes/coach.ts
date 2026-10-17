import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { getCoachDay, buildCoachDay, lifeCoachTool, MEAL_LABEL } from '../../integrations/life-coach.js';
import { computeGame, evolution, readChecks, updateChecks, setTarget } from '../../integrations/coach-game.js';
import { localNow } from '../../integrations/morning-routine.js';

// Page « COACH » de l'app (Kouider) : nutrition + mental + jeu (points, niveaux, badges) + évolution (charges, poids).
// Le sport a sa propre API (/api/sport). Données santé : uniquement en base privée (app_kv), jamais dans le code.
const router = Router();
router.use(requireMobileAuth, (req, res, next) => {
  if (req.mobileActor?.id !== 'kouider') { res.status(403).json({ error: 'Réservé à Kouider' }); return; }
  next();
});
const fail = (res: import('express').Response, err: unknown, code = 500) =>
  res.status(code).json({ error: err instanceof Error ? err.message : String(err) });
const tomorrow = () => new Date(Date.parse(`${localNow().date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

async function overview() {
  const today = localNow().date;
  const [day, next, checks, game, evo] = await Promise.all([getCoachDay(today), getCoachDay(tomorrow()), readChecks(), computeGame(), evolution()]);
  return { today, day, tomorrow: next, checks: checks[today] ?? { meals: [], water: 0, breath: 0, gratitude: [] }, mealLabels: MEAL_LABEL, game, evolution: evo };
}

// GET /api/coach
router.get('/', async (_req, res) => {
  try { res.json(await overview()); } catch (err) { fail(res, err); }
});

// POST /api/coach/generate { day: 'today'|'tomorrow' } — (re)fait la journée du coach + l'agenda
router.post('/generate', async (req, res) => {
  try {
    const date = (req.body as { day?: string }).day === 'tomorrow' ? tomorrow() : localNow().date;
    await buildCoachDay(date);
    res.json(await overview());
  } catch (err) { fail(res, err); }
});

// POST /api/coach/check { kind: meal|water|breath|gratitude|mood, value } — chaque case cochée rapporte des points
router.post('/check', async (req, res) => {
  const b = req.body as { kind?: string; value?: unknown };
  const date = localNow().date;
  try {
    const before = (await computeGame()).total;
    if (b.kind === 'meal' && typeof b.value === 'string' && b.value in MEAL_LABEL) {
      await updateChecks(date, d => { d.meals = d.meals.includes(b.value as string) ? d.meals.filter(m => m !== b.value) : [...d.meals, b.value as string]; });
    } else if (b.kind === 'water') {
      await updateChecks(date, d => { d.water = Math.max(0, Math.min(20, d.water + (Number(b.value) < 0 ? -1 : 1))); });
    } else if (b.kind === 'breath') {
      await updateChecks(date, d => { d.breath += 1; });
    } else if (b.kind === 'gratitude' && typeof b.value === 'string' && b.value.trim()) {
      await updateChecks(date, d => { d.gratitude = [...d.gratitude, (b.value as string).trim().slice(0, 140)].slice(-5); });
    } else if (b.kind === 'mood' && Number(b.value) >= 1 && Number(b.value) <= 10) {
      await lifeCoachTool({ action: 'log', mood: Number(b.value), note: 'noté dans l\'app COACH' }, 'kouider');
    } else { fail(res, 'action inconnue', 400); return; }
    const o = await overview();
    res.json({ ...o, gained: o.game.total - before });
  } catch (err) { fail(res, err); }
});

// POST /api/coach/weight { kg } — pesée (points pour la régularité)
router.post('/weight', async (req, res) => {
  const kg = Number((req.body as { kg?: number }).kg);
  if (!(kg > 30 && kg < 250)) { fail(res, 'poids invalide', 400); return; }
  try {
    const before = (await computeGame()).total;
    const msg = await lifeCoachTool({ action: 'log', weight: kg }, 'kouider');
    const o = await overview();
    res.json({ ...o, gained: o.game.total - before, message: msg });
  } catch (err) { fail(res, err); }
});

// POST /api/coach/target { kg|null } — objectif de poids
router.post('/target', async (req, res) => {
  const kg = Number((req.body as { kg?: number }).kg);
  try { await setTarget(kg > 30 && kg < 250 ? kg : null); res.json(await overview()); } catch (err) { fail(res, err); }
});

export default router;
