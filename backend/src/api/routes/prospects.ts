import { Router } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { getAutopilot, setAutopilot, updateProspect, PROSPECT_STATUSES, type Prospect, type ProspectStatus } from '../../integrations/prospects.js';
import { runDailyOutreach, sendProspectReply, algerianMobile, buildWeeklyReport } from '../../integrations/prospect-autopilot.js';
import { getProspectMode, setProspectMode, getSiteCities, setSiteCities, type ProspectMode } from '../../integrations/site-prospecting.js';
import { proAliasReady, PRO_ALIAS, gmailAddress } from '../../integrations/gmail.js';

// Page « Démarchage » de l'app : tout le fichier prospects, les réponses à valider, les messages LinkedIn.
const router = Router();

// GET /api/prospects/overview
router.get('/overview', requireMobileAuth, async (_req, res) => {
  try {
    const [settings, aliasOk, mode, cities, { data, error }] = await Promise.all([
      getAutopilot(), proAliasReady(), getProspectMode(), getSiteCities(),
      supabase.from('prospects').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Prospect[];
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
    const byStatus = Object.fromEntries(PROSPECT_STATUSES.map(s => [s, rows.filter(r => r.status === s).length]));
    res.json({
      autopilot: settings, mode, cities,
      sender: aliasOk ? PRO_ALIAS : gmailAddress('pro'), sender_pro: aliasOk,
      stats: {
        total:      rows.length,
        sent:       rows.filter(r => r.gmail_thread_id).length,
        sent_today: rows.filter(r => r.gmail_thread_id && r.last_contacted_at
          && new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date(r.last_contacted_at)) === day).length,
        replies:    rows.filter(r => ['a_repondu', 'interesse', 'client', 'refus'].includes(r.status)).length,
        linkedin_todo: rows.reduce((n, r) => n + (r.linkedin_contacts ?? []).filter(c => !c.sent_at).length, 0),
        whatsapp_todo: rows.filter(r => r.whatsapp_message && !r.whatsapp_sent_at && r.status === 'a_contacter').length,
        followups:  rows.filter(r => r.followup_at).length,
        visits:     rows.filter(r => r.site_visit_at).length,
        sites_sent: rows.filter(r => r.segment === 'site_web' && r.gmail_thread_id).length,
        by_status:  byStatus,
      },
      prospects: rows.map(r => ({
        id: r.id, company: r.company, contact_name: r.contact_name, email: r.email, phone: r.phone,
        segment: r.segment, city: r.city, source: r.source, status: r.status, notes: r.notes,
        website: r.website ?? null, created_at: r.created_at, last_contacted_at: r.last_contacted_at,
        last_subject: r.last_subject, last_reply_text: r.last_reply_text, suggested_reply: r.suggested_reply,
        linkedin_contacts: r.linkedin_contacts ?? [], lang: r.lang ?? null, last_sent_text: r.last_sent_text ?? null,
        followup_at: r.followup_at ?? null, site_visit_at: r.site_visit_at ?? null, site_visits: r.site_visits ?? 0,
        whatsapp_message: r.whatsapp_message ?? null, whatsapp_sent_at: r.whatsapp_sent_at ?? null, whatsapp_number: algerianMobile(r.phone),
        quote_draft: r.quote_draft ?? null, proposed_slots: r.proposed_slots ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/prospects/weekly — le bilan de la semaine (même texte que la notification du lundi)
router.get('/weekly', requireMobileAuth, async (_req, res) => {
  try { res.json({ report: await buildWeeklyReport() }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/prospects/autopilot { enabled?, per_day? }
router.post('/autopilot', requireMobileAuth, async (req, res) => {
  const { enabled, per_day, mode, cities } = req.body as { enabled?: boolean; per_day?: number; mode?: string; cities?: unknown };
  if (mode !== undefined) {
    if (!['sites', 'conciergerie', 'both'].includes(mode)) { res.status(400).json({ error: 'Mode inconnu.' }); return; }
    await setProspectMode(mode as ProspectMode);
  }
  if (cities !== undefined) {
    const list = (Array.isArray(cities) ? cities : []).map(c => String(c).trim()).filter(Boolean).slice(0, 20);
    if (!list.length) { res.status(400).json({ error: 'Donne au moins une ville.' }); return; }
    await setSiteCities(list);
  }
  const patch: { enabled?: boolean; per_day?: number } = {};
  if (typeof enabled === 'boolean') patch.enabled = enabled;
  if (per_day !== undefined) {
    const n = Math.round(Number(per_day));
    if (!(n >= 1 && n <= 15)) { res.status(400).json({ error: 'Entre 1 et 15 mails par jour.' }); return; }
    patch.per_day = n;
  }
  try { res.json({ autopilot: await setAutopilot(patch) }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/prospects/run — lance le démarchage du jour maintenant (en arrière-plan, récap en notification)
router.post('/run', requireMobileAuth, (_req, res) => {
  void runDailyOutreach({ force: true }).then(r => console.log(`[prospect-auto] ${r}`))
    .catch(err => console.error('[prospect-auto] run (page):', err instanceof Error ? err.message : err));
  res.json({ ok: true, message: 'Démarchage lancé. Le récap arrive en notification dans quelques minutes.' });
});

// POST /api/prospects/:id/reply { text } — Kouider a relu et appuie sur « Envoyer »
router.post('/:id/reply', requireMobileAuth, async (req, res) => {
  const { text } = req.body as { text?: string };
  try { res.json({ ok: true, message: await sendProspectReply(String(req.params['id']), String(text ?? '')) }); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/prospects/:id/dismiss-reply — ne pas répondre (efface la réponse proposée)
router.post('/:id/dismiss-reply', requireMobileAuth, async (req, res) => {
  try { await updateProspect(String(req.params['id']), { suggested_reply: null }); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/prospects/:id/status { status }
router.post('/:id/status', requireMobileAuth, async (req, res) => {
  const status = String((req.body as { status?: string }).status ?? '') as ProspectStatus;
  if (!PROSPECT_STATUSES.includes(status)) { res.status(400).json({ error: 'Statut invalide.' }); return; }
  try { await updateProspect(String(req.params['id']), { status }); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/prospects/:id/linkedin/:idx { sent } — Kouider a envoyé (ou pas) le message LinkedIn
router.post('/:id/linkedin/:idx', requireMobileAuth, async (req, res) => {
  const idx = Number(req.params['idx']);
  const sent = (req.body as { sent?: boolean }).sent !== false;
  try {
    const { data } = await supabase.from('prospects').select('linkedin_contacts, status, email').eq('id', String(req.params['id'])).maybeSingle();
    const row = data as Pick<Prospect, 'linkedin_contacts' | 'status' | 'email'> | null;
    const contacts = row?.linkedin_contacts ?? [];
    if (!contacts[idx]) { res.status(404).json({ error: 'Contact introuvable.' }); return; }
    contacts[idx] = { ...contacts[idx]!, sent_at: sent ? new Date().toISOString() : null };
    await updateProspect(String(req.params['id']), {
      linkedin_contacts: contacts,
      // Sans email, LinkedIn est le seul canal → contacté. Avec email, on laisse partir le mail prévu.
      ...(sent && row?.status === 'a_contacter' && !row.email ? { status: 'contacte' as const } : {}),
    });
    res.json({ ok: true, contacts });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/prospects/:id/whatsapp { sent } — Kouider a envoyé (ou pas) le message WhatsApp préparé
router.post('/:id/whatsapp', requireMobileAuth, async (req, res) => {
  const sent = (req.body as { sent?: boolean }).sent !== false;
  try {
    await updateProspect(String(req.params['id']), sent
      ? { whatsapp_sent_at: new Date().toISOString(), status: 'contacte', last_contacted_at: new Date().toISOString() }
      : { whatsapp_sent_at: null });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
