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

// Sector → system prompt
function buildSectorPrompt(cfg: Record<string, string>): string {
  const sector = cfg['sector'] ?? 'custom';
  const name   = cfg['ai_name'] ?? 'Dzaryx';
  const biz    = cfg['business_name'] ?? 'votre business';
  const city   = cfg['city'] ?? '';
  const lang   = cfg['language'] ?? 'fr';
  const curr   = cfg['currency'] ?? 'EUR';

  const langInstr = lang === 'ar'
    ? 'Réponds en arabe dialectal (darija). Si le client écrit en français, réponds en français.'
    : lang === 'en'
    ? 'Always respond in English. Switch to the user\'s language if they write in another language.'
    : lang === 'es'
    ? 'Responde siempre en español. Cambia al idioma del cliente si escribe en otro idioma.'
    : 'Réponds en français. Adapte-toi si le client écrit dans une autre langue.';

  const sectorCtx: Record<string, string> = {
    car_rental:  `Tu gères une agence de location de voitures. Tu peux créer des réservations, lister les véhicules disponibles, calculer des prix, gérer les retours et les paiements.`,
    restaurant:  `Tu gères un restaurant. Tu peux prendre des commandes, gérer les réservations de tables, informer sur le menu et les disponibilités.`,
    lawyer:      `Tu assistes un cabinet d'avocats ou notaires. Tu peux gérer les dossiers clients, les rendez-vous, les échéances et les documents juridiques.`,
    doctor:      `Tu assistes une clinique ou cabinet médical. Tu gères les rendez-vous patients, les prescriptions et le suivi médical.`,
    real_estate: `Tu travailles dans l'immobilier. Tu gères les biens, les visites, les leads clients et les contrats.`,
    hotel:       `Tu gères un hôtel ou riad. Tu peux gérer les réservations de chambres, les check-in/check-out et les services.`,
    retail:      `Tu gères une boutique ou commerce. Tu peux gérer le stock, les commandes clients et les ventes.`,
    custom:      `Tu es un assistant IA polyvalent pour ${biz}.`,
  };

  return [
    `TU ES: ${name}, assistant IA privé de ${biz}${city ? ` (${city})` : ''}.`,
    `SECTEUR: ${sectorCtx[sector] ?? sectorCtx['custom']}`,
    `DEVISE: ${curr}.`,
    `LANGUE: ${langInstr}`,
    `COMPORTEMENT: Sois concis, professionnel et efficace. Réponds directement sans fioritures.`,
    `Tu as accès aux outils de gestion pour ce business.`,
  ].join('\n');
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

  // Load org config
  const { data: cfg } = await supabase
    .from('org_configs')
    .select('sector, ai_name, business_name, city, country, language, currency, messages_limit, messages_used')
    .eq('org_id', saasActor.orgId)
    .maybeSingle();

  if (!cfg) {
    res.status(404).json({ error: 'Organisation non trouvée' });
    return;
  }

  // Check message limit
  if (cfg.messages_used >= cfg.messages_limit) {
    res.status(429).json({ error: `Limite mensuelle atteinte (${cfg.messages_limit} messages). Passez au plan supérieur.` });
    return;
  }

  // Increment usage
  await supabase
    .from('org_configs')
    .update({ messages_used: cfg.messages_used + 1 })
    .eq('org_id', saasActor.orgId);

  // Build OrgMember for this tenant
  const actor: OrgMember = {
    orgId:       saasActor.orgId,
    ownerKey:    saasActor.ownerKey,
    role:        'owner',
    displayName: cfg.business_name ?? saasActor.email,
    systemPromptOverride: buildSectorPrompt(cfg as Record<string, string>),
  };

  res.status(202).json({ status: 'processing', sessionId, ai_name: cfg.ai_name ?? 'Dzaryx' });

  await processWithOrchestration(message, sessionId, textOnly, undefined, 'image/jpeg', actor);
});

export default router;
