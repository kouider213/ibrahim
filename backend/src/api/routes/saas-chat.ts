import { Router } from 'express';
import { z } from 'zod';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { processWithOrchestration } from '../../orchestrator/orchestrator-engine.js';
import { type OrgMember } from '../../orchestrator/org-resolver.js';

const router = Router();

const msgSchema = z.object({
  message:   z.string().min(1).max(4000),
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  textOnly:  z.boolean().optional().default(true),
});

// ── Sector system prompt ──────────────────────────────────────────
function buildSectorPrompt(cfg: Record<string, string>): string {
  const sector = cfg['sector'] ?? 'custom';
  const name   = cfg['ai_name'] ?? 'Dzaryx';
  const biz    = cfg['business_name'] ?? 'votre business';
  const city   = cfg['city'] ?? '';
  const lang   = cfg['language'] ?? 'fr';
  const curr   = cfg['currency'] ?? 'EUR';

  const langInstr = lang === 'ar'
    ? 'Réponds en arabe dialectal (darija). Si le client écrit en français, réponds en français.'
    : lang === 'en' ? 'Always respond in English. Switch to the user\'s language if they write in another language.'
    : lang === 'es' ? 'Responde siempre en español. Cambia al idioma del cliente si escribe en otro idioma.'
    : 'Réponds en français. Adapte-toi si le client écrit dans une autre langue.';

  const sectorCtx: Record<string, string> = {
    car_rental:  `Tu gères une agence de location de voitures. Tu connais chaque véhicule, chaque contrat, chaque client. Tu peux créer et gérer des locations, vérifier les disponibilités, calculer des prix, analyser les revenus.`,
    restaurant:  `Tu gères un restaurant. Tu connais le menu, les tables, les réservations et les commandes. Tu peux gérer les réservations, conseiller sur le menu, analyser les ventes.`,
    lawyer:      `Tu assistes un cabinet d'avocats. Tu connais les dossiers, les clients, les rendez-vous et les échéances. Tu peux rédiger des documents, gérer l'agenda, suivre les dossiers.`,
    doctor:      `Tu assistes une clinique ou cabinet médical. Tu connais les patients, les consultations et les ordonnances. Tu peux gérer l'agenda, rédiger des comptes-rendus, suivre les patients.`,
    real_estate: `Tu travailles dans l'immobilier. Tu connais le portefeuille de biens, les visites, les clients et les contrats. Tu peux gérer les visites, rédiger des annonces, analyser le marché.`,
    hotel:       `Tu gères un hôtel. Tu connais chaque chambre, chaque réservation, chaque client. Tu peux gérer les check-in/check-out, analyser le taux d'occupation, optimiser les revenus.`,
    retail:       `Tu gères un commerce. Tu connais le stock, les clients et les ventes. Tu peux gérer l'inventaire, analyser les ventes, créer des promotions.`,
    beauty:       `Tu gères un salon de beauté ou coiffure. Tu connais les clients, les services, les rendez-vous et le planning de l'équipe. Tu peux gérer le planning, analyser les revenus par service et coiffeur, envoyer des rappels clients.`,
    auto_school:  `Tu gères une auto-école. Tu connais les élèves, les moniteurs, les leçons de conduite, la progression de chaque élève et les examens. Tu peux gérer les plannings, suivre la progression, gérer les paiements et préparer les élèves aux examens.`,
    construction: `Tu gères une entreprise BTP ou de construction. Tu connais les chantiers, les équipes, les matériaux, les fournisseurs et les délais. Tu peux rédiger des devis et factures, suivre l'avancement des chantiers, gérer les commandes de matériaux et alerter sur les retards.`,
    ecommerce:    `Tu gères une boutique en ligne. Tu connais le catalogue produits, le stock, les commandes et les livraisons. Tu peux gérer les commandes, suivre les livraisons, rédiger des fiches produits, analyser les ventes et gérer le SAV.`,
    custom:       `Tu es l'assistant IA personnel de ${biz}.`,
  };

  return [
    `TU ES: ${name}, assistant IA privé et dévoué de ${biz}${city ? ` (${city})` : ''}.`,
    `SECTEUR: ${sectorCtx[sector] ?? sectorCtx['custom']}`,
    `DEVISE: ${curr}.`,
    `LANGUE: ${langInstr}`,
    `COMPORTEMENT: Tu es comme un bras droit ultra-compétent. Tu connais ce business par cœur. Sois concis, direct et proactif. Utilise les données en temps réel ci-dessous pour répondre précisément.`,
  ].join('\n');
}

// ── Real business data context ────────────────────────────────────
async function buildDataContext(orgId: string, cfg: Record<string, string>): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd    = new Date(now.getTime() + 7 * 86400000);

  const [todayRes, weekRes, itemsRes, clientsRes, profileRes] = await Promise.all([
    supabase.from('saas_bookings')
      .select('customer_name, customer_phone, item_name, start_date, end_date, status, amount, notes, guests')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .gte('start_date', todayStart.toISOString()).lte('start_date', todayEnd.toISOString())
      .order('start_date'),
    supabase.from('saas_bookings')
      .select('customer_name, item_name, start_date, status, amount')
      .eq('org_id', orgId).neq('status', 'cancelled')
      .gt('start_date', todayEnd.toISOString()).lte('start_date', weekEnd.toISOString())
      .order('start_date').limit(10),
    supabase.from('saas_items')
      .select('name, type, status, price_per_day, currency, capacity, metadata')
      .eq('org_id', orgId),
    supabase.from('saas_bookings')
      .select('customer_name, customer_phone')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(100),
    supabase.from('org_configs')
      .select('integrations, business_profile')
      .eq('org_id', orgId).maybeSingle(),
  ]);

  const fmt = (d: string) => new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const curr = cfg['currency'] ?? 'DZD';

  let ctx = '\n\n=== DONNÉES BUSINESS EN TEMPS RÉEL ===\n';
  ctx += `Date/heure: ${now.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n`;

  // Today's bookings
  const today = todayRes.data ?? [];
  if (today.length > 0) {
    ctx += `\nRÉSERVATIONS AUJOURD'HUI (${today.length}):\n`;
    today.forEach(b => {
      ctx += `• ${b.customer_name}`;
      if (b.customer_phone) ctx += ` (${b.customer_phone})`;
      if (b.item_name) ctx += ` → ${b.item_name}`;
      ctx += ` à ${fmt(b.start_date as string)}`;
      if (b.end_date) ctx += ` - fin ${fmt(b.end_date as string)}`;
      if (b.amount) ctx += ` | ${b.amount} ${curr}`;
      if (b.guests && b.guests > 1) ctx += ` | ${b.guests} pers.`;
      if (b.notes) ctx += ` | Note: ${b.notes}`;
      ctx += '\n';
    });
  } else {
    ctx += "\nAucune réservation aujourd'hui.\n";
  }

  // This week bookings
  const week = weekRes.data ?? [];
  if (week.length > 0) {
    ctx += `\nPROCHAINES RÉSERVATIONS (7 jours, ${week.length}):\n`;
    week.forEach(b => {
      ctx += `• ${fmt(b.start_date as string)} — ${b.customer_name}`;
      if (b.item_name) ctx += ` → ${b.item_name}`;
      if (b.amount) ctx += ` | ${b.amount} ${curr}`;
      ctx += '\n';
    });
  }

  // Inventory
  const items = itemsRes.data ?? [];
  if (items.length > 0) {
    const available = items.filter(i => i.status === 'available');
    const unavail   = items.filter(i => i.status !== 'available');
    ctx += `\nINVENTAIRE:\n`;
    if (available.length > 0) {
      ctx += `Disponibles (${available.length}): `;
      ctx += available.map(i => {
        let s = i.name as string;
        if (i.price_per_day) s += ` (${i.price_per_day} ${(i.currency as string) ?? curr}/j)`;
        if (i.capacity) s += ` [${i.capacity} pers.]`;
        const meta = i.metadata as Record<string, string> | null;
        if (meta?.plate) s += ` [${meta.plate}]`;
        if (meta?.color) s += ` [${meta.color}]`;
        if (meta?.floor) s += ` [étage ${meta.floor}]`;
        if (meta?.category) s += ` [${meta.category}]`;
        return s;
      }).join(' | ') + '\n';
    }
    if (unavail.length > 0) {
      ctx += `Indisponibles: ${unavail.map(i => `${i.name} (${i.status})`).join(', ')}\n`;
    }
  }

  // Known clients (deduplicated)
  const clientMap = new Map<string, string>();
  (clientsRes.data ?? []).forEach(c => {
    if (!clientMap.has((c.customer_name as string).toLowerCase())) {
      clientMap.set((c.customer_name as string).toLowerCase(), `${c.customer_name}${c.customer_phone ? ` (${c.customer_phone})` : ''}`);
    }
  });
  if (clientMap.size > 0) {
    ctx += `\nCLIENTS CONNUS (${clientMap.size}):\n`;
    ctx += [...clientMap.values()].slice(0, 20).join(' | ') + '\n';
  }

  // Integrations
  const integ = (profileRes.data as any)?.integrations as Record<string, string> | null;
  const profile = (profileRes.data as any)?.business_profile as Record<string, string> | null;
  if (integ?.whatsapp_number) ctx += `\nWhatsApp business: ${integ.whatsapp_number}\n`;
  if (integ?.google_calendar_url) ctx += `Google Agenda connecté: oui\n`;
  if (integ?.business_hours_open) ctx += `Horaires: ${integ.business_hours_open} - ${integ.business_hours_close ?? '22:00'}\n`;
  if (profile?.owner_name) ctx += `Propriétaire/gérant: ${profile.owner_name}\n`;
  if (profile?.address) ctx += `Adresse: ${profile.address}\n`;

  ctx += '=== FIN DONNÉES ===';
  return ctx;
}

// POST /api/saas/chat
router.post('/chat', requireSaasAuth, async (req, res) => {
  const parsed = msgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message });
    return;
  }

  const { message, sessionId, textOnly } = parsed.data;
  const saasActor = req.saasActor!;

  const { data: cfg } = await supabase
    .from('org_configs')
    .select('sector, ai_name, business_name, city, country, language, currency, messages_limit, messages_used')
    .eq('org_id', saasActor.orgId)
    .maybeSingle();

  if (!cfg) { res.status(404).json({ error: 'Organisation non trouvée' }); return; }

  if (cfg.messages_used >= cfg.messages_limit) {
    res.status(429).json({ error: `Limite mensuelle atteinte (${cfg.messages_limit} messages). Passez au plan supérieur.` });
    return;
  }

  await supabase.from('org_configs').update({ messages_used: cfg.messages_used + 1 }).eq('org_id', saasActor.orgId);

  // Build sector prompt + inject real business data
  const [sectorPrompt, dataContext] = await Promise.all([
    Promise.resolve(buildSectorPrompt(cfg as Record<string, string>)),
    buildDataContext(saasActor.orgId, cfg as Record<string, string>),
  ]);

  const actor: OrgMember = {
    orgId:       saasActor.orgId,
    ownerKey:    saasActor.ownerKey,
    role:        'owner',
    displayName: cfg.business_name ?? saasActor.email,
    systemPromptOverride: sectorPrompt + dataContext,
  };

  res.status(202).json({ status: 'processing', sessionId, ai_name: cfg.ai_name ?? 'Dzaryx' });

  await processWithOrchestration(message, sessionId, textOnly, undefined, 'image/jpeg', actor);
});

export default router;
