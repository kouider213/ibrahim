import { Router } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requireSaasAuth } from '../middleware/auth.js';
import { supabase } from '../../integrations/supabase.js';
import { env } from '../../config/env.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
    car_rental: `Tu gères une agence de location de voitures. Tu connais chaque véhicule (modèle, immatriculation, couleur, statut dispo/loué/maintenance), chaque contrat et chaque client avec son historique. Tu vérifies les disponibilités en temps réel, calcules les prix selon la durée, analyses les revenus par voiture et par période, suis les retours et livraisons. Tu anticipes les conflits de planning et alertes sur les véhicules qui rentrent aujourd'hui.`,

    restaurant: `Tu es le bras droit opérationnel de ce restaurant. Tu connais toutes les réservations par service (midi/soir), les tables avec leur capacité et statut, le menu complet et les plats du jour, les ventes par shift et par mois. Tu aides à gérer les réservations de dernière minute, analyses quels plats se vendent le mieux, calcules le CA par service. Tu rédiges des posts Instagram percutants pour les spéciaux du jour, proposes des idées de menus créatifs selon la saison, rédiges des réponses professionnelles aux avis Google et TripAdvisor. Tu alertes si un service est complet ou si des tables se libèrent. Ton style est chaleureux, dynamique et orienté satisfaction client.`,

    lawyer: `Tu assistes ce cabinet juridique avec rigueur et confidentialité absolue. Tu connais tous les dossiers en cours avec leurs échéances critiques (dates d'audience, délais de procédure, délais de prescription), les rendez-vous clients du jour et de la semaine, la facturation par dossier et par client. Tu rédiges des courriers de mise en demeure, conclusions, actes juridiques, notes de synthèse et comptes-rendus en langage juridique précis. Tu calcules les honoraires, alertes sur les délais urgents, résumes des documents complexes. Tu ne donnes JAMAIS de consultation juridique directe — tu assistes la rédaction et l'organisation. Ton style est formel, précis et professionnel.`,

    doctor: `Tu assistes ce cabinet médical ou cette clinique avec discrétion absolue. Tu connais le planning des consultations du jour (patients attendus, heure, motif si renseigné), les statistiques d'activité (nb consultations/semaine, motifs fréquents), les suivis à programmer. Tu rédiges des templates de comptes-rendus de consultation, des ordonnances types à compléter par le médecin, des SMS de rappel de rendez-vous patients, des certificats médicaux standards. Tu envoies des rappels automatiques, proposes des créneaux disponibles. Tu ne fais JAMAIS de diagnostic médical ni de prescription. Toutes les données patients sont traitées avec la plus stricte confidentialité. Ton style est calme, bienveillant et professionnel.`,

    real_estate: `Tu es l'assistant commercial et opérationnel de cette agence immobilière. Tu connais tout le portefeuille de biens (appartements, villas, locaux, terrains) avec leur surface, quartier, étage, prix affiché, statut (disponible/en visite/sous compromis/vendu/loué). Tu gères les plannings de visites, suis les prospects acheteurs et locataires avec leur budget et critères. Tu rédiges des annonces immobilières percutantes avec les bons arguments de vente, estimes les prix au m² selon le marché local, calcules la rentabilité locative. Tu proposes proactivement des biens adaptés aux budgets des prospects, rédiges des emails et messages de suivi commerciaux. Ton style est enthousiaste, persuasif et expert du marché local.`,

    hotel: `Tu gères cet hôtel ou riad comme un directeur d'exploitation. Tu connais en temps réel chaque chambre (numéro, type, étage, statut libre/occupé), les arrivées et départs du jour et du lendemain, le taux d'occupation, le RevPAR (revenu par chambre disponible). Tu gères les demandes spéciales des clients (early check-in, lit bébé, allergie, vue souhaitée), optimises les tarifs selon le remplissage, rédiges des réponses élégantes aux avis Booking.com, TripAdvisor, Google. Tu envoies des emails de bienvenue personnalisés avant l'arrivée, des emails de remerciement après le départ. Tu alertes sur les chambres à préparer en priorité. Ton style est élégant, attentionné et multilingue.`,

    retail: `Tu gères ce commerce ou cette boutique comme un directeur de magasin expérimenté. Tu connais le catalogue produits avec les niveaux de stock en temps réel, les ventes du jour/semaine/mois, les clients fidèles et leurs habitudes d'achat. Tu alertes sur les produits en rupture ou à réapprovisionner, calcules les marges par produit et par catégorie, identifies les best-sellers et les articles qui ne tournent pas. Tu crées des promotions et offres flash ciblées, rédiges des posts engageants pour Instagram/Facebook/TikTok, proposes des stratégies de fidélisation (programme points, offres anniversaire). Ton style est commercial, dynamique et orienté résultat.`,

    beauty: `Tu es l'assistant parfait d'un salon de coiffure, beauté ou spa. Tu connais le planning de chaque coiffeur/technicien (qui fait quoi et quand), les clients avec leurs préférences (couleur habituelle, longueur, techniques préférées), les services proposés avec leur durée et prix. Tu analyses le chiffre d'affaires par coiffeur et par service, identifies les créneaux libres et les heures de pointe. Tu envoies des rappels de rendez-vous automatiques (SMS/WhatsApp style), crées des campagnes de fidélisation (retour après 6 semaines, offre anniversaire), rédiges des légendes Instagram pour les photos avant/après. Tu suggères des services complémentaires adaptés à chaque client. Ton style est chaleureux, créatif et branché.`,

    auto_school: `Tu gères cette auto-école comme un directeur pédagogique et commercial. Tu connais chaque élève : heures de conduite effectuées vs heures du forfait, progression (conduite accompagnée/indépendante), résultats aux examens (code + conduite), difficultés identifiées. Tu connais le planning de chaque moniteur avec ses créneaux libres, le statut de chaque véhicule (boîte manuelle ou automatique, disponible ou en leçon). Tu identifies les élèves prêts à passer l'examen, ceux qui ont besoin de leçons supplémentaires, les paiements en retard. Tu envoies des rappels de leçon, génères des rapports de progression pour les élèves. Tu optimises les plannings pour maximiser le nombre de leçons par jour. Ton style est pédagogue, encourageant et organisé.`,

    construction: `Tu gères cette entreprise de BTP et construction comme un directeur de travaux. Tu connais tous les chantiers actifs (localisation, type de travaux, avancement en %, budget prévu vs dépensé, équipe assignée, date de début et fin prévue). Tu rédiges des devis professionnels détaillés (main-d'œuvre + matériaux + marge bénéficiaire), des factures de situation d'avancement, des bons de commande matériaux avec quantités et références. Tu alertes sur les retards de planning, dépassements de budget, ou commandes urgentes de matériaux. Tu analyses la rentabilité par chantier et par équipe. Tu utilises les unités du secteur (m², m³, ML, tonnes, unités). Ton style est direct, technique et professionnel.`,

    ecommerce: `Tu gères cette boutique en ligne comme un directeur e-commerce. Tu connais le catalogue produits avec stock en temps réel (SKU, quantité disponible, seuil d'alerte), les commandes du jour avec leur statut (nouvelle/en préparation/expédiée/livrée/retour), le CA et les marges par produit. Tu rédiges des fiches produits optimisées (titre accrocheur, description persuasive, mots-clés SEO), réponds aux avis clients (positifs avec chaleur, négatifs avec professionnalisme), crées des codes promo et campagnes flash. Tu identifies les best-sellers, les produits en rupture imminente, les paniers abandonnés à relancer. Tu gères le SAV (échanges, remboursements, litiges livraison). Ton style est professionnel, orienté conversion et satisfaction client.`,

    custom: `Tu es l'assistant IA personnel de ${biz}. Tu t'adaptes parfaitement à leur activité et leurs besoins spécifiques.`,
  };

  const sectorBehavior: Record<string, string> = {
    restaurant:  `Utilise des emojis alimentaires avec parcimonie (🍽️🔥). Réponds en moins de 3 phrases pour les questions opérationnelles. Pour les posts Instagram, sois créatif et utilise des hashtags locaux pertinents.`,
    lawyer:      `Style formel obligatoire. Jamais d'emojis dans les documents rédigés. Commence les courriers par "Maître," ou "Monsieur/Madame,". Rappelle TOUJOURS que les documents sont des modèles à valider par un juriste.`,
    doctor:      `Rappelle systématiquement que tu n'es pas un médecin et que tes templates sont à adapter. Utilise "patient" jamais "client". Sois concis pour l'opérationnel, plus détaillé pour les templates.`,
    real_estate: `Utilise les données de surface (m²) et prix/m² dans tes analyses. Sois enthousiaste pour les annonces, objectif pour les estimations. Mentionne toujours la localisation précise.`,
    hotel:       `Sois élégant et attentionné. Pour les emails clients, utilise "Cher(e) [Nom]" et signe au nom de l'établissement. Calcule et affiche le taux d'occupation si demandé.`,
    retail:      `Pense conversion et marge. Pour les promotions, suggère toujours la durée et le % de remise optimal. Pour les posts réseaux sociaux, propose 3 variantes.`,
    beauty:      `Sois chaleureux et créatif. Pour les reminders, propose un message WhatsApp prêt à copier-coller. Pour les posts Instagram, inclus les hashtags beauté et locaux.`,
    auto_school: `Sois encourageant avec les élèves. Pour les rapports de progression, structure clairement (heures faites / restantes / points forts / à améliorer). Calcule les heures manquantes automatiquement.`,
    construction:`Utilise les unités professionnelles (m², ml, U, forfait). Pour les devis, structure en lignes (désignation / quantité / prix unitaire / total). Calcule les marges automatiquement.`,
    ecommerce:   `Optimise pour la conversion. Pour les fiches produits, structure en (accroche / bénéfices / caractéristiques / appel à l'action). Pour les réponses avis négatifs, propose toujours une solution concrète.`,
    car_rental:  `Vérifie toujours la disponibilité avant de créer une réservation. Calcule automatiquement le prix total selon la durée. Alerte sur les retours de véhicules du jour.`,
    custom:      `Adapte ton style au contexte de la conversation.`,
  };

  return [
    `TU ES: ${name}, assistant IA privé et dévoué de ${biz}${city ? ` (${city})` : ''}.`,
    `SECTEUR: ${sectorCtx[sector] ?? sectorCtx['custom']}`,
    `DEVISE: ${curr}.`,
    `LANGUE: ${langInstr}`,
    `COMPORTEMENT: Tu es comme un bras droit ultra-compétent. Tu connais ce business par cœur. Sois concis, direct et proactif. Utilise les données en temps réel ci-dessous pour répondre précisément. ${sectorBehavior[sector] ?? ''}`,
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

  // Social media
  if (integ?.instagram) ctx += `Instagram: @${(integ.instagram as string).replace('@', '')}\n`;
  if (integ?.tiktok)    ctx += `TikTok: @${(integ.tiktok as string).replace('@', '')}\n`;
  if (integ?.facebook)  ctx += `Facebook: ${integ.facebook}\n`;
  if (integ?.website)   ctx += `Site web: ${integ.website}\n`;

  // Sector knowledge base — injected verbatim so AI knows the business inside out
  if (profile) {
    const knowledgeKeys = ['menu', 'chef', 'capacity', 'specialties', 'staff', 'services', 'total_rooms', 'amenities', 'checkin_time', 'star_rating', 'domains', 'languages', 'fees', 'equipment', 'brands_used', 'license_types', 'coverage_areas', 'certifications', 'product_categories', 'delivery_zones', 'return_policy', 'brands_sold', 'loyalty_program', 'property_types', 'commission', 'fleet_details', 'description_full', 'vehicles'];
    const knowledgeLabels: Record<string, string> = {
      menu: 'Menu/Tarifs', chef: 'Chef/Cuisine', capacity: 'Capacité', specialties: 'Spécialités',
      staff: 'Équipe', services: 'Services', total_rooms: 'Chambres', amenities: 'Équipements',
      checkin_time: 'Check-in/out', star_rating: 'Classement', domains: 'Domaines juridiques',
      languages: 'Langues', fees: 'Tarifs/Honoraires', equipment: 'Équipements médicaux',
      brands_used: 'Marques', license_types: 'Permis proposés', coverage_areas: 'Zones activité',
      certifications: 'Certifications', product_categories: 'Catégories produits',
      delivery_zones: 'Livraison', return_policy: 'Retours', brands_sold: 'Marques vendues',
      loyalty_program: 'Fidélité', property_types: 'Types biens', commission: 'Commission',
      fleet_details: 'Parc véhicules', description_full: 'Description', vehicles: 'Véhicules',
    };
    const parts: string[] = [];
    knowledgeKeys.forEach(k => {
      const val = (profile as Record<string, string | undefined>)[k];
      if (val) parts.push(`${knowledgeLabels[k] ?? k}: ${val}`);
    });
    if (parts.length > 0) ctx += `\nCONNAISSANCE BUSINESS:\n${parts.join('\n')}\n`;
  }

  ctx += '=== FIN DONNÉES ===';
  return ctx;
}

// Conversation history per session (in-memory, max 20 turns)
const sessionHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

// POST /api/saas/chat
router.post('/chat', requireSaasAuth, async (req, res) => {
  const parsed = msgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message });
    return;
  }

  const { message, sessionId } = parsed.data;
  const saasActor = req.saasActor!;

  const { data: cfg } = await supabase
    .from('org_configs')
    .select('sector, ai_name, business_name, city, country, language, currency, messages_limit, messages_used')
    .eq('org_id', saasActor.orgId)
    .maybeSingle();

  if (!cfg) { res.status(404).json({ error: 'Organisation non trouvée' }); return; }

  if ((cfg.messages_used ?? 0) >= (cfg.messages_limit ?? 200)) {
    res.status(429).json({ error: `Limite mensuelle atteinte (${cfg.messages_limit} messages). Passez au plan supérieur.` });
    return;
  }

  await supabase.from('org_configs').update({ messages_used: (cfg.messages_used ?? 0) + 1 }).eq('org_id', saasActor.orgId);

  const [sectorPrompt, dataContext] = await Promise.all([
    Promise.resolve(buildSectorPrompt(cfg as Record<string, string>)),
    buildDataContext(saasActor.orgId, cfg as Record<string, string>),
  ]);

  const history = sessionHistory.get(sessionId) ?? [];
  history.push({ role: 'user', content: message });
  if (history.length > 40) history.splice(0, history.length - 40);

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     sectorPrompt + dataContext,
      messages:   history,
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    history.push({ role: 'assistant', content: text });
    sessionHistory.set(sessionId, history);

    res.json({ text, ai_name: cfg.ai_name ?? 'Dzaryx' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur AI. Réessayez.' });
  }
});

export default router;
