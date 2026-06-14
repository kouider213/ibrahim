// Caisse / comptabilité depuis l'app : mouvements (income/expense) sur cash_entries (même base que le site).
import { Router } from 'express';
import { supabase } from '../../integrations/supabase.js';
import { requireMobileAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/cash — mouvements récents + totaux du mois courant
router.get('/', requireMobileAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('cash_entries')
      .select('id, kind, category, label, amount, currency, entry_date, created_at')
      .order('entry_date', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
    // Totaux du mois SÉPARÉS par devise (on ne mélange jamais DZD et EUR).
    const byCur: Record<string, { income: number; expense: number; balance: number }> = {};
    for (const r of rows as Array<{ kind: string; amount: number; entry_date: string; currency?: string }>) {
      if (!String(r.entry_date).startsWith(ym)) continue;
      const cur = (r.currency || 'DZD').toUpperCase();
      byCur[cur] ??= { income: 0, expense: 0, balance: 0 };
      if (r.kind === 'expense') byCur[cur].expense += Number(r.amount) || 0;
      else byCur[cur].income += Number(r.amount) || 0;
      byCur[cur].balance = byCur[cur].income - byCur[cur].expense;
    }
    res.json({ entries: rows, ym, month: byCur });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/cash — ajoute un mouvement
router.post('/', requireMobileAuth, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const amount = Number(b['amount']);
  if (!amount || amount <= 0) { res.status(400).json({ error: 'montant requis (> 0)' }); return; }
  const kind = b['kind'] === 'expense' ? 'expense' : 'income';
  try {
    const { data, error } = await supabase.from('cash_entries').insert([{
      kind, category: b['category'] || null, label: b['label'] || null,
      amount, currency: b['currency'] || 'DZD',
      entry_date: b['entry_date'] || new Date().toISOString().slice(0, 10),
    }]).select().single();
    if (error) throw new Error(error.message);
    res.status(201).json({ entry: data });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /api/cash/:id — supprime un mouvement
router.delete('/:id', requireMobileAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('cash_entries').delete().eq('id', req.params['id']);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
