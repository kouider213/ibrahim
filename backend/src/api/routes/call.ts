import { Router, type Request, type Response, type NextFunction } from 'express';
import { extractBearerToken, validateToken } from '../../auth/tokens.js';
import { requireMobileAuth } from '../middleware/auth.js';
import { answerCall, declineCall, getPendingCall, callOwner, type CallActor } from '../../notifications/voice-call.js';
import { saveConversationTurn, stripToolTrace } from '../../integrations/supabase.js';
import { processMessage } from '../../conversation/orchestrator.js';
import { synthesizeVoice } from '../../notifications/dispatcher.js';
import { DEFAULT_MEMBER, type OrgMember } from '../../orchestrator/org-resolver.js';
import { env } from '../../config/env.js';
import { executeTool } from '../../integrations/tool-executor.js';
import { Dzaryx_TOOLS } from '../../integrations/tools.js';
import { kvGet, kvSet } from '../../integrations/app-store.js';
import { summarizeCall, recentCallsText, type CallLine } from '../../notifications/call-memory.js';
import { kouiderDossierText, familyText } from '../../integrations/kouider-dossier.js';
import { isPrivate } from '../../integrations/privacy.js';
import { recordTgcallHeartbeat, recordTgcallErrors } from '../../notifications/tgcall-watch.js';
import { takeCallInbox, addToCallInbox, removeFromCallInbox } from '../../notifications/auto-call.js';
import { clientWhatsappLink } from '../../notifications/client-care.js';
import { quickBooking, quickPayment, quickQuote, quickAgenda, quickModifyBooking, quickEmailReply, quickContract } from '../../integrations/call-quick.js';
import { takeTelegramMessages, queueTelegramMessage } from '../../notifications/tg-outbox.js';
import { getDnd, setDnd, dndOnKouiderMessage } from '../../notifications/dnd.js';
import { noteKouiderActivity } from '../../integrations/morning-routine.js';
import { storeLocation, getLocation } from '../../integrations/location.js';
import { pcCommand, pcStatus, pcWake, pcScreenToTelegram, pcLookJpeg } from '../../integrations/nexus-remote.js';

/** Texte pour Telegram : titres « ## » → gras ; photos « ![x](url) » et lignes « 📹 url » → vraies images envoyées après le texte. */
function telegramMedia(text: string): { text: string; images: Array<{ url: string; title: string }> } {
  const images: Array<{ url: string; title: string }> = [];
  let t = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_m, alt: string, url: string) => { images.push({ url, title: alt }); return ''; });
  t = t.replace(/^.*📹\s*(https?:\/\/\S+).*$/gm, (_m, url: string) => { images.push({ url, title: '' }); return ''; });
  t = t.replace(/^#{1,6}\s+(.+)$/gm, '**$1**').replace(/\n{3,}/g, '\n\n').trim();
  return { text: t || '📎', images };
}

const router = Router();

// Nexus (jeton de l'agent PC) parle au nom de Kouider : voix temps réel du PC (nexus/modules/realtime_voice.py)
function requireCallerAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token && validateToken(token, 'pc-agent')) {
    req.mobileActor = { id: 'kouider', displayName: env.OWNER_NAME, ownerKey: 'kouider', role: 'owner' };
    next(); return;
  }
  requireMobileAuth(req, res, next);
}

// Même règle que /api/chat : jeton partagé → l'acteur vient de l'app (Houari connecté dans le simulateur).
function callActor(req: Request): CallActor {
  if (req.mobileActor?.ownerKey === 'houari') return 'houari';
  const fromApp = (req.body as { actor?: string } | undefined)?.actor ?? req.query['actor'];
  return fromApp === 'houari' ? 'houari' : 'kouider';
}

// POST /api/call/pending — appel de Dzaryx en train de sonner ? (POST : jamais servi par le cache hors-ligne de l'app)
router.post('/pending', requireMobileAuth, async (req, res) => {
  const call = await getPendingCall(callActor(req));
  const messages = await takeTelegramMessages(callActor(req)).catch(() => []);
  res.json({ call: call ? { id: call.id, reason: call.reason, createdAt: call.createdAt } : null, messages });
});

// POST /api/call/heartbeat { connected } — battement du service d'appels Telegram (VPS), toutes les minutes
router.post('/heartbeat', requireMobileAuth, async (req, res) => {
  const body = req.body as { connected?: boolean; errors?: unknown };
  await recordTgcallHeartbeat(body.connected !== false)
    .catch(err => console.error('[call] heartbeat:', err instanceof Error ? err.message : err));
  if (Array.isArray(body.errors)) {
    await recordTgcallErrors(body.errors.map(String))
      .catch(err => console.error('[call] erreurs tgcall:', err instanceof Error ? err.message : err));
  }
  res.json({ ok: true });
});

// POST /api/call/answer { callId? } — décrocher (ou lancer l'appel) → phrase d'accueil + audio
router.post('/answer', requireMobileAuth, async (req, res) => {
  try {
    const { callId, noAudio } = req.body as { callId?: string; noAudio?: boolean };
    const who = callActor(req);
    // C'est Kouider qui appelle (rien ne sonnait) → il entend d'abord ce qui l'attendait
    const pending = await getPendingCall(who);
    const ringing = !!pending && (!callId || pending.id === callId);
    const waiting = !ringing && who === 'kouider' ? await takeCallInbox().catch(() => []) : [];
    res.json(await answerCall(who, callId, !!noAudio, waiting));
  } catch (err) {
    console.error('[call] answer:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'answer failed' });
  }
});

// POST /api/call/decline { callId? } — refuser / appel manqué
router.post('/decline', requireMobileAuth, async (req, res) => {
  const { callId } = req.body as { callId?: string };
  await declineCall(callActor(req), callId);
  // Il refuse l'appel dans l'app → « ne pas déranger » jusqu'à sa réponse (Kouider 20/10 : plus d'appel insistant)
  if (callActor(req) === 'kouider') await setDnd({ untilReply: true, why: 'appel refusé' }).catch(() => {});
  res.json({ ok: true });
});

// POST /api/call/test — fait sonner l'app (test de bout en bout)
router.post('/test', requireMobileAuth, async (req, res) => {
  const { id } = await callOwner('Ceci est un appel de test. Tu m\'entends bien ?', callActor(req), { force: true });
  res.json({ ok: true, id });
});

// POST /api/call/retry { reason } — appel manqué sur Telegram : 2e essai (tgcall, 10 min après)
router.post('/retry', requireMobileAuth, async (req, res) => {
  const reason = String((req.body as { reason?: string }).reason ?? '').trim();
  if (!reason) { res.status(400).json({ error: 'reason required' }); return; }
  const { quietUntil, addToCallInbox } = await import('../../notifications/auto-call.js');
  if (callActor(req) === 'kouider' && (await quietUntil() || await getDnd())) {   // « pas dispo » : pas de 2e essai, gardé pour plus tard
    await addToCallInbox(reason).catch(() => {});
    res.json({ ok: true, held: true }); return;
  }
  await removeFromCallInbox(reason).catch(() => {});   // dit dans ce 2e essai
  const { id } = await callOwner(`Je te rappelle, tu n'avais pas décroché. ${reason}`, callActor(req));
  res.json({ ok: true, id });
});

// POST /api/call/merge { callId?, keep? } — un appel devait partir alors qu'on est DÉJÀ en ligne (tgcall) : on ne recompose pas,
// le motif est rendu pour être dit dans l'appel en cours (« ah attends, j'ai aussi une autre info »). keep = pas pu le dire
// (quelqu'un d'autre au téléphone…) → gardé pour son prochain appel.
router.post('/merge', requireMobileAuth, async (req, res) => {
  const { callId, keep } = req.body as { callId?: string; keep?: string };
  const who = callActor(req);
  if (keep) { if (who === 'kouider') await addToCallInbox(String(keep).slice(0, 600)).catch(() => {}); res.json({ ok: true }); return; }
  const pending = await getPendingCall(who);
  if (!pending || (callId && pending.id !== callId)) { res.json({ reason: null }); return; }
  await declineCall(who, pending.id);
  await removeFromCallInbox(pending.reason).catch(() => {});
  saveConversationTurn(`voice_${who}`, 'assistant', `(Info dite pendant l'appel en cours) ${pending.reason}`, { call: true, call_id: pending.id })
    .catch(() => {});
  res.json({ reason: pending.reason });
});

// POST /api/call/missed { reason, why? } — appel de Dzaryx pas décroché : l'info est gardée pour le prochain appel de Kouider.
// Pas décroché / refusé → « ne pas déranger » jusqu'à sa réponse : ni 2e essai, ni appel programmé, ni message (hold:true).
// why='muet' = il a décroché mais le son ne passait pas (problème technique) → pas de silence, 2e essai normal.
router.post('/missed', requireMobileAuth, async (req, res) => {
  const { reason: r, why } = req.body as { reason?: string; why?: string };
  const reason = String(r ?? '').trim();
  const kouider = callActor(req) === 'kouider';
  if (reason && kouider) await addToCallInbox(reason.slice(0, 600)).catch(() => {});
  const hold = kouider && why !== 'muet';
  if (hold) await setDnd({ untilReply: true, why: 'appel pas décroché' }).catch(() => {});
  res.json({ ok: true, hold });
});

// POST /api/call/location { lat, lng } — position GPS partagée sur Telegram (position en direct → mises à jour)
router.post('/location', requireCallerAuth, async (req, res) => {
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== 'number' || typeof lng !== 'number') { res.status(400).json({ error: 'lat/lng' }); return; }
  try {
    const who = callActor(req);
    const prev = await getLocation(who).catch(() => null);
    // la position en direct arrive toutes les quelques secondes : pas de géocodage si on a peu bougé
    const near = prev && Math.abs(prev.lat - lat) < 0.02 && Math.abs(prev.lng - lng) < 0.02;
    if (near) {
      const { redis } = await import('../../queue/queue.js');
      await redis.setex(`location:${who}`, 86_400, JSON.stringify({ ...prev, lat, lng, updated_at: new Date().toISOString() }));
    } else await storeLocation(who, lat, lng);
    if (who === 'kouider') void import('../../integrations/presence.js').then(m => m.onLocationUpdate()).catch(() => {});   // assistant GPS
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/call/turn { message, textOnly? } — un tour de parole pendant un vrai appel (Telegram) :
// réponse SYNCHRONE de Dzaryx (texte + audio mp3), même session que la voix de l'app.
const PHOTO_TG = '[Photo envoyée par écrit sur Telegram';

router.post('/turn', requireCallerAuth, async (req, res) => {
  const { message, textOnly, stream, image, imageMime, channel } = req.body as {
    message?: string; textOnly?: boolean; stream?: boolean; image?: string; imageMime?: string; channel?: 'call' | 'message' };
  if (!message?.trim() && !image) { res.status(400).json({ error: 'message required' }); return; }
  const who = callActor(req);
  const actor: OrgMember = who === 'houari'
    ? { orgId: '', ownerKey: 'houari', role: 'admin', displayName: env.PARTNER_NAME }
    : DEFAULT_MEMBER;
  try {
    // Dzaryx doit savoir qu'il est DÉJÀ au téléphone : sinon « tu m'entends ? » relance call_me.
    const dndNote = who === 'kouider' ? await dndOnKouiderMessage().catch(() => null) : null;   // « ne pas déranger » : il a répondu
    const wakeNote = who === 'kouider' ? await noteKouiderActivity(typeof message === 'string' ? message : undefined) : null;   // réponse au contrôle de réveil du matin ?
    // « oui » / « non » juste après une réponse WhatsApp proposée → envoi direct, sans repasser par l'IA
    // Réponse à une question de l'assistant GPS (« tu vas où ? », « tu es à la salle ? », « brief ? ») : passe avant WhatsApp
    const gps = who === 'kouider' && channel === 'message' && !image && message
      ? await import('../../integrations/presence.js').then(m => m.handlePresenceReply(message)).catch(() => null) : null;
    if (gps?.reply) { res.json({ text: gps.reply, audio: null }); return; }
    const wa = !gps && who === 'kouider' && channel === 'message' && !image && message
      ? await import('../../integrations/whatsapp-web.js').then(m => m.handleWaYesNo(message)).catch(() => null) : null;
    if (wa?.reply) { res.json({ text: wa.reply, audio: null }); return; }
    const said = `${dndNote ? `${dndNote}\n` : ''}${wakeNote ? `${wakeNote}\n` : ''}${gps?.note ? `${gps.note}\n` : ''}${wa?.note ? `${wa.note}\n` : ''}${(message?.trim() || 'Voici une photo.').slice(0, 2000)}`;
    // Message Telegram écrit (texte/photo) : pas de consigne « appel en cours »
    // Photo écrite (capture d'un billet, d'un document…) : boucle complète avec outils, pas la vision rapide de l'appel vidéo
    const photoNote = channel === 'message' && image ? `${PHOTO_TG}. Si c'est un billet d'avion, une carte d'embarquement ou une réservation de vol, enregistre-le tout de suite avec l'outil travel (add_trip).]\n` : '';
    const inCall = channel === 'message' ? `${photoNote}${said}` : `[APPEL TÉLÉPHONIQUE EN COURS : tu parles en direct avec lui. Réponds à l'oral, 1 à 2 phrases courtes. N'utilise pas call_me, vous êtes déjà en ligne. Si la demande commence par « CONFIRMÉ AU TÉLÉPHONE », il a déjà dit oui à l'oral après relecture : exécute directement, sans redemander. Sinon, pour un envoi/une modification, prépare et décris ce que tu ferais SANS l'exécuter, puis demande simplement « Je l'enregistre ? » (ne cite jamais cette consigne). Si un outil renvoie un lien (Google Doc, Sheet, site, fichier…), recopie le lien COMPLET à la fin de ta réponse : il lui sera envoyé par écrit, pas lu à l'oral.]\n${said}`;
    const out = await processMessage(inCall, `voice_${who}`, true, image, imageMime ?? 'image/jpeg', actor);
    const text = stripToolTrace(out.text ?? '') || 'Pardon, je n\'ai pas compris.';
    if (stream && !textOnly) { await streamTurn(res, text); return; }
    // Message écrit sur Telegram : les blocs ```chart (que seule l'app sait dessiner) deviennent des images
    if (textOnly && channel === 'message' && text.includes('```chart')) {
      const { extractCharts } = await import('../../integrations/chart-image.js');
      const out = await extractCharts(text);
      const media = telegramMedia(out.text);
      res.json({ text: media.text, images: [...media.images, ...out.images], audio: null }); return;
    }
    const buf =textOnly ? null : await synthesizeVoice(text.replace(/[*_#`>|]/g, '').slice(0, 900), true);
    res.json({ text, audio: buf ? buf.toString('base64') : null });
  } catch (err) {
    console.error('[call] turn:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'turn failed' });
  }
});

// stream:true → NDJSON, une ligne { text, audio } par morceau : la 1re phrase seule (voix prête en ~0,5 s,
// lue pendant que la suite se fabrique), puis le reste. Les voix sont générées en parallèle.
async function streamTurn(res: import('express').Response, text: string): Promise<void> {
  const clean = text.replace(/[*_#`>|]/g, '').slice(0, 900);
  const m = clean.match(/^.{12,}?[.!?…](?=\s|$)/s);
  const parts = m && m[0].length < clean.length
    ? [m[0].trim(), clean.slice(m[0].length).trim()]
    : [clean.trim()];
  const voices = parts.map(p => synthesizeVoice(p, true).catch(() => null));
  res.setHeader('Content-Type', 'application/x-ndjson');
  for (let i = 0; i < parts.length; i++) {
    const buf = await voices[i];
    res.write(JSON.stringify({ text: i === 0 ? text : '', part: parts[i], audio: buf ? buf.toString('base64') : null }) + '\n');
  }
  res.end();
}

// POST /api/call/realtime — clé OpenAI TEMPORAIRE (1 min pour se connecter) pour la voix temps réel des appels
// Telegram (tgcall/realtime.py). La vraie clé reste sur Railway. La session (voix, consignes, outil) est fixée ici.
const REALTIME_MODEL = 'gpt-realtime';
const DEFAULT_VOICE = 'cedar';
export const REALTIME_VOICES = ['cedar', 'marin', 'ash', 'coral', 'verse', 'sage'] as const;
const VOICE_KEY = 'call:voice';
async function realtimeVoice(): Promise<string> {
  const v = await kvGet(VOICE_KEY).catch(() => null);
  return v && (REALTIME_VOICES as readonly string[]).includes(v) ? v : DEFAULT_VOICE;
}

// Lectures RAPIDES pendant l'appel : outils en lecture seule exécutés directement (sans le cerveau complet,
// qui prend 5 à 15 s). Toute action / tout le reste passe toujours par ask_dzaryx.
const QUICK_TOOLS = ['list_bookings', 'get_fleet_status', 'check_car_availability', 'get_unpaid_bookings',
  'get_finance_dashboard', 'list_emails', 'read_email', 'read_email_thread',
  'check_client', 'get_expenses', 'get_vehicle_maintenance', 'get_car_papers', 'web_search'] as const;
const quickToolDefs = Dzaryx_TOOLS
  .filter(t => (QUICK_TOOLS as readonly string[]).includes(t.name))
  .map(t => ({ type: 'function', name: t.name, description: `Lecture rapide. ${t.description ?? ''}`.slice(0, 1000), parameters: t.input_schema }));

// Écritures RAPIDES dictées au téléphone (dépense, km, vidange faite) : en 2 s au lieu du cerveau complet.
// Exécutées seulement avec confirmed:true, c.-à-d. APRÈS relecture à l'oral et un « oui » de Kouider.
const QUICK_WRITE_TOOLS = ['record_expense', 'record_car_km', 'update_vehicle_maintenance', 'schedule_reminder', 'set_car_papers'] as const;
const CONFIRMED_PARAM = { type: 'boolean', description: 'true SEULEMENT après avoir relu l\'action à l\'oral et reçu un « oui » clair de Kouider' };
const quickWriteDefs = Dzaryx_TOOLS
  .filter(t => (QUICK_WRITE_TOOLS as readonly string[]).includes(t.name))
  .map(t => {
    const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[] };
    return { type: 'function', name: t.name,
      description: `Écriture rapide, APRÈS son oui (relis d'abord : montant, devise, voiture, km). ${t.description ?? ''}`.slice(0, 1000),
      parameters: { ...schema, properties: { ...(schema.properties ?? {}), confirmed: CONFIRMED_PARAM },
        required: [...(schema.required ?? []), 'confirmed'] } };
  });

// Outils rapides propres à l'appel (integrations/call-quick.ts). Réservation/paiement : sans confirmed:true
// → seulement la relecture à faire, rien n'est écrit.
const CALL_QUICK = {
  quick_booking: (i: Record<string, unknown>, who: CallActor) => quickBooking(i, who, `voice_${who}`),
  quick_payment: (i: Record<string, unknown>, who: CallActor) => quickPayment(i, `voice_${who}`),
  quick_quote:   (i: Record<string, unknown>, who: CallActor) => quickQuote(i, `voice_${who}`),
  quick_agenda:  (i: Record<string, unknown>, who: CallActor) => quickAgenda(i, who),
  quick_modify_booking: (i: Record<string, unknown>, who: CallActor) => quickModifyBooking(i, `voice_${who}`),
  quick_email_reply:    (i: Record<string, unknown>, who: CallActor) => quickEmailReply(i, who),
  // PC de Kouider (Nexus) — réservé à Kouider
  pc_command: (i: Record<string, unknown>, who: CallActor) => who === 'kouider' ? pcCommand(i) : Promise.resolve('Le PC est réservé à Kouider.'),
  pc_status:  (_i: Record<string, unknown>, who: CallActor) => who === 'kouider' ? pcStatus() : Promise.resolve('Le PC est réservé à Kouider.'),
  pc_wake:    (_i: Record<string, unknown>, who: CallActor) => who === 'kouider' ? pcWake() : Promise.resolve('Le PC est réservé à Kouider.'),
  pc_screen_to_telegram: (_i: Record<string, unknown>, who: CallActor) => who === 'kouider' ? pcScreenToTelegram(who) : Promise.resolve('Le PC est réservé à Kouider.'),
} as const;
const CALL_QUICK_DEFS = [
  { type: 'function', name: 'quick_booking',
    description: 'CRÉER UNE RÉSERVATION dictée (« réserve la Clio 5 diesel pour Karim du 3 au 8 novembre à 45 € »). 1er appel SANS confirmed → vérifie la dispo, calcule prix/bénéfice, regarde si le client est fiable et renvoie la relecture : lis-la à Kouider et demande « je crée ? ». Après son oui → même appel avec confirmed:true. Dates YYYY-MM-DD (départ et retour inclus). Sans prix dit → prix catalogue.',
    parameters: { type: 'object', properties: {
      car_name: { type: 'string' }, client_name: { type: 'string' }, client_phone: { type: 'string' },
      start_date: { type: 'string' }, end_date: { type: 'string' },
      price_per_day: { type: 'number', description: 'Prix client par jour en € (s\'il le dit)' },
      total_price: { type: 'number', description: 'Prix total en € (s\'il dit un total)' },
      owner_price_per_day: { type: 'number', description: 'Prix Houari par jour, seulement s\'il le dit (sinon celui de la voiture)' },
      paid_amount: { type: 'number', description: 'Acompte déjà reçu' }, notes: { type: 'string' },
      confirmed: CONFIRMED_PARAM }, required: ['car_name', 'client_name', 'start_date', 'end_date'] } },
  { type: 'function', name: 'quick_payment',
    description: 'ENREGISTRER UN PAIEMENT dicté (« Karim m\'a payé 200 € », « acompte de 100 € de Sonia »). Retrouve sa réservation pas soldée. 1er appel SANS confirmed → relecture (montant, voiture, reste à payer) : lis-la et demande « je note ? ». Après son oui → confirmed:true. Si plusieurs réservations : demande laquelle et rappelle avec car_name ou start_date.',
    parameters: { type: 'object', properties: {
      client_name: { type: 'string' }, amount: { type: 'number' },
      type: { type: 'string', enum: ['acompte', 'solde', 'partiel'] }, note: { type: 'string', description: 'ex. « espèces », « virement »' },
      car_name: { type: 'string' }, start_date: { type: 'string' }, confirmed: CONFIRMED_PARAM }, required: ['client_name', 'amount'] } },
  { type: 'function', name: 'quick_quote',
    description: 'DEVIS EXPRESS (« combien une Clio du 3 au 8 ? », « qu\'est-ce qui est libre ce week-end ? », « avec livraison à l\'aéroport »). Dispo + prix client + livraison, et un devis prêt à envoyer. Sans car_name → liste des voitures libres avec leurs prix. Lecture seule.',
    parameters: { type: 'object', properties: {
      start_date: { type: 'string' }, end_date: { type: 'string' }, car_name: { type: 'string' },
      delivery_address: { type: 'string', description: 'Seulement « aéroport » : pas de livraison à une adresse pour les clients (agence Hay Badr ou aéroport d\'Oran)' },
      price_per_day: { type: 'number', description: 'Prix par jour si Kouider en fixe un autre' } }, required: ['start_date', 'end_date'] } },
  { type: 'function', name: 'quick_agenda',
    description: 'AGENDA D\'UN JOUR (« qu\'est-ce que j\'ai demain ? », « mon programme vendredi ») : départs et retours de voitures, rendez-vous (agenda FIK + perso), rappels prévus. date YYYY-MM-DD (défaut aujourd\'hui). Lecture seule.',
    parameters: { type: 'object', properties: { date: { type: 'string' } } } },
  { type: 'function', name: 'quick_modify_booking',
    description: 'MODIFIER ou ANNULER une réservation (« décale le retour de Karim au 10 », « mets Sonia sur le Jogger », « annule la réservation de Sonia »). Vérifie que la voiture reste libre et recalcule prix et bénéfice. 1er appel SANS confirmed → relecture (ancien → nouveau) : lis-la et demande « je modifie ? » / « j\'annule ? ». Après son oui → confirmed:true. Prix par jour gardé si rien n\'est dit. Si plusieurs réservations : demande laquelle et rappelle avec car_name ou start_date.',
    parameters: { type: 'object', properties: {
      client_name: { type: 'string' }, car_name: { type: 'string', description: 'Voiture ACTUELLE, pour choisir la bonne réservation' },
      start_date: { type: 'string', description: 'Départ ACTUEL, pour choisir la bonne réservation' },
      new_start_date: { type: 'string' }, new_end_date: { type: 'string' }, new_car_name: { type: 'string' },
      new_price_per_day: { type: 'number' }, new_total_price: { type: 'number' },
      cancel: { type: 'boolean', description: 'true pour ANNULER la réservation' },
      confirmed: CONFIRMED_PARAM }, required: ['client_name'] } },
  { type: 'function', name: 'quick_email_reply',
    description: 'RÉPONDRE À UN MAIL en parlant (« réponds à Mohammed que je suis d\'accord pour jeudi 14h »). Répond au dernier mail reçu de cette personne, dans la même conversation, depuis contact@. Sans body → te renvoie ce qu\'elle a écrit (pour le lui lire). Avec body SANS confirmed → relecture du mail complet : lis-le et demande « je l\'envoie ? ». Après son oui → même appel avec confirmed:true.',
    parameters: { type: 'object', properties: {
      from: { type: 'string', description: 'Nom ou adresse de la personne qui a écrit' },
      body: { type: 'string', description: 'Le texte de la réponse, rédigé proprement en vouvoiement (sans signature, ajoutée seule)' },
      confirmed: CONFIRMED_PARAM }, required: ['from'] } },
  { type: 'function', name: 'pc_command',
    description: 'PILOTER LE PC de Kouider (Nexus) en une phrase : « ouvre Spotify », « mets le volume à 30 », « coupe le son », « verrouille le PC », « ouvre Chrome sur youtube.com », « lance la musique », « mets le PC en veille et réveille-le demain à 8h », « éteins le PC », « va sur le site X et… ». Renvoie ce que Nexus a fait (en 1 à 20 s). Éteindre / redémarrer / veille / supprimer : relis d\'abord et attends son oui, puis confirmed:true.',
    parameters: { type: 'object', properties: {
      command: { type: 'string', description: 'La commande en français, telle que Kouider la dit' },
      confirmed: CONFIRMED_PARAM }, required: ['command'] } },
  { type: 'function', name: 'pc_status',
    description: 'ÉTAT DU PC : allumé ? Nexus connecté ? mise à jour en attente ? (« mon PC est allumé ? », « Nexus est là ? »). Lecture seule.',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'pc_wake',
    description: 'RÉVEILLER LE PC / NEXUS tout de suite (« allume le PC », « réveille Nexus »). Pas besoin de confirmation.',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'pc_screen_to_telegram',
    description: 'ENVOYER une capture de l\'écran du PC à Kouider sur Telegram (« envoie-moi l\'écran du PC », « fais une capture du PC »). Pas besoin de confirmation.',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'send_contract',
    description: 'CONTRAT À SIGNER en une phrase (« envoie le contrat à Karim », « fais signer Sonia ») : crée le lien de signature de sa dernière réservation et envoie à Kouider sur Telegram le lien WhatsApp avec le message prêt. Il n\'a plus qu\'à appuyer, le client signe sur son téléphone. Pas besoin de confirmation : rien ne part sans lui.',
    parameters: { type: 'object', properties: {
      client_name: { type: 'string' }, phone: { type: 'string', description: 'Numéro, seulement si Kouider le donne' } }, required: ['client_name'] } },
];

// Outils propres à l'appel : exécutés par tgcall (send_text_to_me, end_call) ou programmés (call_me).
const CALL_TOOLS = [
  { type: 'function', name: 'call_back_later',
    description: 'Quelqu\'un d\'autre a décroché (ou Kouider est occupé) : programmer le RAPPEL de Kouider quand il sera là (« il rentre vers 18h », « dans une heure »). delay_minutes OU at_time (HH:MM Bruxelles) + at_date éventuelle. Le motif de l\'appel est gardé tout seul : ne le dis pas.',
    parameters: { type: 'object', properties: { delay_minutes: { type: 'number' }, at_time: { type: 'string' }, at_date: { type: 'string' },
      who_answered: { type: 'string', description: 'Qui a décroché (ex. « sa femme »)' } } } },
  { type: 'function', name: 'leave_message',
    description: 'La personne au téléphone (sa femme, un proche…) veut laisser un message à Kouider : il le reçoit par écrit sur Telegram.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, text: { type: 'string' } }, required: ['text'] } },
  { type: 'function', name: 'learn_voice',
    description: 'Retenir la VOIX de la personne qui parle maintenant, quand elle s\'est présentée et que la voix n\'est pas encore reconnue (« c\'est Sonia ») — la prochaine fois tu la reconnaîtras toute seule. Jamais pour « Kouider » (sa voix s\'apprend toute seule).',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'Prénom (ex. Amina)' } }, required: ['name'] } },
  { type: 'function', name: 'verify_code',
    description: 'La personne dit être Kouider mais sa voix n\'est pas reconnue (réseau, rhume…) : vérifier le CODE SECRET qu\'elle donne. Si c\'est bon, tu repasses en mode Kouider.',
    parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { type: 'function', name: 'send_text_to_me',
    description: 'Envoie TOUT DE SUITE un message écrit Telegram à Kouider (numéro, adresse, nom, brouillon de mail, liste…) quand il dit « envoie-moi ça », « écris-le moi », ou quand une info est difficile à retenir à l\'oral. Pas besoin de confirmation : c\'est pour lui.',
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'Le texte exact à lui envoyer, complet et propre' } }, required: ['text'] } },
  { type: 'function', name: 'call_me',
    description: 'Programmer un RAPPEL PAR APPEL plus tard (« rappelle-moi dans 1 heure / à 16h / demain à 9h »). Donne delay_minutes OU at_time (HH:MM, heure de Bruxelles) et éventuellement at_date (YYYY-MM-DD). reason = la phrase que tu diras en le rappelant, avec le sujet.',
    parameters: { type: 'object', properties: {
      reason: { type: 'string' }, delay_minutes: { type: 'number' }, at_time: { type: 'string' }, at_date: { type: 'string' },
      task: { type: 'string', description: 'ORDRE à préparer avant de rappeler (business plan, analyse, recherche…) : la demande complète de Kouider. Le travail commence tout de suite.' } }, required: ['reason'] } },
  { type: 'function', name: 'look',
    description: 'Regarder MAINTENANT la caméra de Kouider (appel vidéo) : « regarde », « tu vois ça ? », « et là ? ». Renvoie une image fraîche. Si la caméra est coupée, dis-lui de l\'allumer (bouton vidéo de Telegram).',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'whatsapp_link',
    description: 'Préparer un message WhatsApp pour un CLIENT (« envoie à Karim que la voiture est prête à 14h ») : Dzaryx retrouve son numéro et envoie à Kouider sur Telegram le lien WhatsApp avec le message déjà écrit ; Kouider n\'a plus qu\'à appuyer. Rien ne part au client sans lui. Écris le message complet, poli, au nom de FIK Conciergerie, dans la langue du client.',
    parameters: { type: 'object', properties: {
      client: { type: 'string', description: 'Nom du client tel que Kouider le dit' },
      message: { type: 'string', description: 'Le message exact pour le client' },
      phone: { type: 'string', description: 'Numéro, seulement si Kouider le donne' } }, required: ['client', 'message'] } },
  { type: 'function', name: 'interpreter',
    description: 'Mode INTERPRÈTE (« traduis », « sois mon interprète », « mode traduction en anglais/arabe ») : Kouider met le haut-parleur avec un client, tu traduis chaque phrase dans les deux sens. on:false quand il dit « stop traduction », « c\'est bon, arrête de traduire ».',
    parameters: { type: 'object', properties: {
      on: { type: 'boolean' },
      language: { type: 'string', description: 'Langue du client (anglais, arabe, espagnol, italien, allemand…)' } }, required: ['on'] } },
  { type: 'function', name: 'pc_look',
    description: 'REGARDER L\'ÉCRAN DU PC de Kouider maintenant (« qu\'est-ce qu\'il y a sur mon écran ? », « regarde mon PC », « ça a marché ? » après une commande PC). Tu reçois l\'image de l\'écran.',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'end_call',
    description: 'Raccrocher. Seulement APRÈS avoir dit au revoir, quand Kouider a fini ou demande à raccrocher (« c\'est bon », « rappelle-moi plus tard », « salut »).',
    parameters: { type: 'object', properties: {} } },
];

// Voix temps réel sur le PC (Nexus) : ces outils sont exécutés directement par Nexus sur le PC, sans passer par ici
const PC_REMOTE_TOOLS = new Set(['pc_command', 'pc_status', 'pc_wake', 'pc_screen_to_telegram', 'pc_look', 'end_call', 'interpreter',
  'call_back_later', 'leave_message', 'learn_voice', 'verify_code']);
const PC_LOCAL_TOOLS = [
  { type: 'function', name: 'pc_action',
    description: 'Agir sur CE PC tout de suite (« ouvre Spotify », « volume 30 », « mets YouTube », « ferme Chrome », « verrouille », « minuteur 10 minutes », « note … », « tape … »). Écris la commande comme Kouider la dirait, en français. Éteindre, redémarrer, veille, supprimer : relis et attends son oui, puis confirmed:true.',
    parameters: { type: 'object', properties: {
      command: { type: 'string', description: 'La commande, en français' },
      confirmed: { type: 'boolean', description: 'true seulement après son oui pour éteindre / redémarrer / veille / supprimer' } }, required: ['command'] } },
  { type: 'function', name: 'look_screen',
    description: 'REGARDER L\'ÉCRAN maintenant (« qu\'est-ce qu\'il y a sur mon écran ? », « regarde », « ça a marché ? », « lis-moi ça »). Tu reçois l\'image de l\'écran.',
    parameters: { type: 'object', properties: {} } },
  { type: 'function', name: 'watch_screen',
    description: 'Mode « REGARDE AVEC MOI » : on:true quand Kouider veut que tu suives son écran pendant qu\'il parle (« regarde avec moi », « suis ce que je fais », « aide-moi sur ce site ») ; tu reçois alors une image de l\'écran à chaque fois qu\'il parle. on:false quand il dit « c\'est bon, arrête de regarder ».',
    parameters: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] } },
  { type: 'function', name: 'end_conversation',
    description: 'Terminer la conversation vocale sur le PC, APRÈS avoir dit au revoir en une phrase (« merci », « c\'est tout », « à plus », « repos »).',
    parameters: { type: 'object', properties: {} } },
];

function pcInstructions(base: string): string {
  return base.split('\n').map(line => {
    if (line.startsWith('Tu es Dzaryx')) return `Tu es Dzaryx, la voix de Nexus sur le PC de ${env.OWNER_NAME} : il te parle en direct par le micro de son ordinateur (pas un appel téléphonique).`;
    if (line.startsWith('PC (Nexus)')) return `CE PC : tout ce qui concerne l'ordinateur (« ouvre Spotify », « volume 30 », « mets YouTube », « verrouille ») → pc_action, c'est direct. « Qu'est-ce qu'il y a sur mon écran ? », « regarde », « lis-moi ça » → look_screen. « Regarde avec moi », « aide-moi sur ce site » → watch_screen on:true : tu reçois l'écran à chaque fois qu'il parle ; décris et guide pas à pas (où cliquer, quoi taper). Éteindre, redémarrer, veille, supprimer : relis et attends son oui (confirmed:true).`;
    if (line.startsWith('CAMÉRA')) return `ÉCRAN : décris ce que tu vois de façon concrète, sans inventer ; si c'est trop petit pour être lu, dis-le et propose de zoomer (pc_action « zoom avant »).`;
    if (line.startsWith('RACCROCHER')) return `FIN : quand il a fini (« merci », « c'est tout », « repos »), dis au revoir en une phrase, puis appelle end_conversation.`;
    if (line.startsWith('RAPPEL :')) return line.replace('après le ✅, dis au revoir puis end_call', 'après le ✅, dis-le lui simplement');
    return line;
  }).join('\n');
}

// Comme un vrai humain (Kouider 2026-10-16) : chanter, chercher sur internet SANS couper la conversation.
const HUMAN_RULES = [
  `CHANTER : si on te demande de chanter (« chante-moi une berceuse », « chante joyeux anniversaire », « une chanson pour le petit »), tu CHANTES vraiment, tout de suite, sans dire que tu ne peux pas : voix douce, mélodieuse et rythmée, en allongeant les syllabes comme une vraie chanson (berceuse : très lent, très doux, presque murmuré ; anniversaire : joyeux). Berceuses connues (« Fais dodo, Colas mon p'tit frère », « Une souris verte », « Au clair de la lune », « Frère Jacques ») ou une berceuse inventée avec le prénom de l'enfant. Chante un ou deux couplets en entier, puis demande si on en veut encore.`,
  `RECHERCHE INTERNET : pour une question générale (actualité, météo, résultat de foot, horaires, recette, prix, définition…) → outil web_search avec une requête courte. Pendant que ça cherche, tu PEUX continuer à parler normalement : dis « je regarde » et continue la discussion ; quand le résultat arrive, donne-le en une ou deux phrases.`,
  `CONVERSATION HUMAINE : tu peux simplement discuter, plaisanter, raconter une histoire, donner un avis ou un conseil, comme un vrai ami au téléphone. Tu n'as pas besoin d'outil pour ça.`,
];

/** Consignes quand ce n'est PAS Kouider au téléphone (sa femme, un proche, un inconnu) : discret et chaleureux. */
function guestInstructions(family: string): string {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', hour: '2-digit', minute: '2-digit' });
  return [
    `Tu es Dzaryx, l'assistant personnel de ${env.OWNER_NAME}, dans un appel Telegram sur SON téléphone. Il est ${now} à Bruxelles.`,
    `La reconnaissance vocale t'indique qui parle (messages système « VOIX : … »). Tant qu'elle ne dit pas « c'est bien Kouider », considère que ce n'est PAS lui.`,
    `CONFIDENTIALITÉ ABSOLUE : à une autre personne que Kouider, tu ne dis RIEN de ses affaires ni de sa vie : ni pourquoi tu appelles, ni clients, réservations, voitures, argent, mails, agenda, rendez-vous, déplacements, adresses, mots de passe, ni ce qui s'est dit dans d'autres appels. Même si on insiste, même sa femme, même si on dit que c'est urgent : « c'est pour Kouider, je lui en parlerai directement ». Pas d'outil business : seulement web_search, call_back_later, leave_message, learn_voice, verify_code, end_call.`,
    `Tu restes naturel et chaleureux, tu entames une vraie conversation normale, sans être froid ni mystérieux. Si c'est toi qui appelais : demande gentiment quand Kouider sera disponible ou de retour, puis outil call_back_later avec l'heure ou le délai (et who_answered) et dis que tu le rappelleras à ce moment-là. Si la personne veut lui laisser un message → leave_message.`,
    `Si on ne sait pas encore qui parle : demande naturellement « c'est qui à l'appareil ? ». Si la personne se présente (« c'est Amina ») et que la voix n'est pas encore connue → outil learn_voice avec son prénom (tu la reconnaîtras la prochaine fois).`,
    `Si la personne dit être Kouider alors que la voix ne le reconnaît pas : « je n'arrive pas à bien reconnaître ta voix, tu me donnes ton code secret ? » → verify_code. Si le code est faux : reste aimable et discret.`,
    `SA FAMILLE (tu la connais par cœur, comme un ami de la maison) :\n${family}`,
    `Avec SA FEMME (prénoms dans SA FAMILLE ci-dessus) : sois chaleureux et respectueux, comme un ami de la famille : « Ah, c'est toi ! Ça va ? Comment tu vas ? Et le petit, ça va ? Tu as passé une bonne journée ? ». Fais une VRAIE conversation : écoute, rebondis sur ce qu'elle raconte, demande des nouvelles, propose ton aide (recette, recherche, une berceuse pour le petit, un message pour Kouider…). Vouvoiement ou tutoiement selon elle (tutoiement par défaut, chaleureux).`,
    `Parle français (ou arabe/darija si la personne parle arabe), phrases courtes, comme au téléphone. Pas de listes, pas de markdown.`,
    ...HUMAN_RULES,
    `RACCROCHER : quand la discussion est finie, dis au revoir chaleureusement, puis end_call.`,
  ].join('\n');
}

function realtimeInstructions(who: CallActor, calls: string, dossier = '', family = ''): string {
  const name = who === 'houari' ? env.PARTNER_NAME : env.OWNER_NAME;
  const now = new Date();
  const fmt = (tz: string) => now.toLocaleString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return [
    `Tu es Dzaryx, l'assistant personnel de ${name}, au TÉLÉPHONE avec lui (appel Telegram, en direct).`,
    `${env.OWNER_NAME} dirige FIK Conciergerie : location de voitures et conciergerie à Oran (Algérie) ; il vit en Belgique. Son associé est ${env.PARTNER_NAME}.`,
    `Maintenant : ${fmt('Europe/Brussels')} en Belgique (${fmt('Africa/Algiers')} à Oran).`,
    `Parle en français, tutoiement, comme un vrai assistant au téléphone : chaleureux, naturel, phrases courtes, 1 à 3 phrases par réponse. Pas de listes, pas de markdown.`,
    `Si on te coupe la parole, arrête-toi et écoute.`,
    `RAPIDE : pour juste LIRE des réservations, la flotte, une dispo, les impayés, les finances, les mails, si un client est fiable (« Karim c'est un bon client ? » → check_client), les dépenses ou le bénéfice réel d'une voiture (get_expenses) ou l'entretien / la vidange (get_vehicle_maintenance), utilise directement l'outil correspondant : c'est instantané. ask_dzaryx pour tout le reste (agenda, rappels, prospects, web, mails envoyés…) et pour toute autre action.`,
    `DICTÉE RAPIDE : dépense (« 3000 DA d'essence sur la Sandero » → record_expense), kilométrage (« la Clio est à 85 000 » → record_car_km), vidange faite (« vidange faite sur le Jogger à 80 000 » → update_vehicle_maintenance avec car_name, last_service_km et last_service_date d'aujourd'hui). Relis en UNE phrase (« 3000 dinars d'essence sur la Sandero, je note ? »), puis après son oui appelle l'outil avec confirmed:true. Sans devise dite, c'est des dinars. Si l'outil demande quelle voiture, pose-lui la question puis rappelle l'outil (son oui reste valable).`,
    `RÉSERVATION / PAIEMENT dictés : « réserve la … pour … du … au … » → quick_booking ; « X m'a payé … » → quick_payment. D'abord SANS confirmed : l'outil renvoie la relecture, lis-la simplement (voiture, client, dates, prix, bénéfice, et l'alerte si client à risque) et demande « je crée ? » / « je note ? ». Après son oui → même outil avec confirmed:true. Convertis « du 3 au 8 novembre » en dates YYYY-MM-DD (année en cours ou suivante si passée).`,
    `DEVIS : « combien pour… », « qu'est-ce qui est libre… » → quick_quote. S'il veut l'envoyer au client → whatsapp_link avec le texte du devis (ou send_text_to_me s'il veut juste le texte).`,
    `MODIFIER / ANNULER une réservation (« décale Karim au 10 », « annule Sonia ») → quick_modify_booking : d'abord SANS confirmed, lis la relecture (ancien → nouveau, prix, bénéfice, ce qu'il a déjà payé) et demande « je modifie ? » / « j'annule ? ». Après son oui → confirmed:true.`,
    `MAIL : « réponds à Mohammed que… » → quick_email_reply avec un texte poli rédigé par toi. D'abord SANS confirmed : lis-lui le mail EN ENTIER et demande « je l'envoie ? ». Après son oui → confirmed:true. « Qu'est-ce qu'il m'a écrit ? » → quick_email_reply sans body.`,
    `CONTRAT : « envoie le contrat à Karim », « fais-le signer » → send_contract (pas besoin de oui : il reçoit le lien et l'envoie lui-même).`,
    `PAPIERS DES VOITURES : « l'assurance de la Sandero expire le 15 mars » → relis, puis après son oui set_car_papers avec confirmed:true. « Les papiers sont à jour ? » → get_car_papers.`,
    `AGENDA : « qu'est-ce que j'ai demain / vendredi ? » → quick_agenda. RAPPEL pour lui (« rappelle-moi d'appeler le garage à 15h ») → redis l'heure, puis après son oui schedule_reminder avec confirmed:true (heure de Bruxelles). Un rappel PAR APPEL → call_me.`,
    `WHATSAPP CLIENT : « envoie à Karim que… », « dis au client que… », « préviens-le sur WhatsApp » → TOUJOURS l'outil whatsapp_link, JAMAIS ask_dzaryx (rien ne part sans lui, il appuie lui-même). Rédige un message court et poli, dis-lui en une phrase ce que tu vas écrire, puis outil whatsapp_link : il reçoit le lien sur Telegram et l'envoie lui-même en un clic. Dis « je t'ai envoyé le lien, tu n'as plus qu'à appuyer ».`,
    `PC (Nexus) : tout ce qui concerne son ordinateur (« ouvre Spotify sur le PC », « volume 30 », « verrouille le PC », « éteins le PC ») → pc_command, c'est direct. « Mon PC est allumé ? » → pc_status ; « allume / réveille le PC » → pc_wake ; « envoie-moi l'écran » → pc_screen_to_telegram ; « qu'est-ce qu'il y a sur mon écran ? », « regarde mon PC » → pc_look (tu reçois l'image de l'écran et tu la décris). Éteindre, redémarrer, veille, supprimer : relis et attends son oui (confirmed:true).`,
    `INTERPRÈTE : « traduis », « sois mon interprète », « il parle anglais » → outil interpreter (on:true, langue) puis suis les règles qu'il te renvoie, jusqu'à « stop traduction » (interpreter on:false).`,
    `IMPORTANT : tu ne connais RIEN de ses affaires par toi-même. Pour toute info réelle ou action (réservations, voitures, clients, paiements, mails, agenda, rappels, démarchage, prospects, finances, envoyer un message…), appelle l'outil ask_dzaryx avec sa demande complète, et dis d'abord un petit mot naturel (« je regarde », « deux secondes »). Ne jamais inventer un chiffre, un nom ou un mail.`,
    `JAMAIS « je ne peux pas » de toi-même : le cerveau de Dzaryx (ask_dzaryx) a plus de 200 outils — Google Docs, Google Sheets, export Excel, contrats, sites et applis (code + mise en ligne), images, vidéos, publications réseaux, mails, agenda, prospects… Toute demande que tes outils directs ne couvrent pas → ask_dzaryx avec la demande complète. Dis « je ne peux pas » SEULEMENT si ask_dzaryx l'a répondu.`,
    `DOCUMENT / TABLEAU (« crée un Google Doc avec… », « fais un tableau… », « un document avec toutes tes capacités ») → ask_dzaryx avec la demande complète, Si la réponse contient un lien (https://…), envoie-le par écrit avec send_text_to_me, sans jamais le lire à l'oral. Si elle dit que le dossier est « en préparation », dis-lui simplement qu'il le recevra sur Telegram dans une ou deux minutes.`,
    `DÉMO DE SITE (« je t'envoie un lien, fais-moi une démo de site pour ce client ») → ask_dzaryx avec la demande ; dis-lui d'envoyer le lien Google Maps du commerce par message Telegram (bouton « Partager » dans Google Maps). La démo est prête en 1 à 2 minutes et le lien arrive tout seul sur Telegram.`,
    `Même si la question ressemble à une précédente (« j'ai déjà répondu ? », « il y a du nouveau ? », « c'est sûr ? »), RAPPELLE ask_dzaryx : ne réponds JAMAIS oui/non sur un fait de mémoire. Si tu n'as pas vérifié, dis « je vérifie » et appelle l'outil.`,
    `Quand l'outil répond, redis l'essentiel à l'oral, simplement (montants en euros ou dinars en toutes lettres si besoin). Ne lis jamais d'identifiant technique (db_id, job_id, UUID, fuseau, utc_offset), et n'ajoute rien que l'outil n'a pas dit.`,
    `AUTRES ACTIONS (nouveau mail, relancer quelqu'un…) : TOUJOURS en deux temps via ask_dzaryx. Outils directs (eux aussi après relecture + oui) : quick_booking, quick_payment, quick_modify_booking, quick_email_reply, dictée rapide (dépense, km, vidange, papiers), schedule_reminder ; whatsapp_link et send_contract pour un client.`,
    `1) Prépare : si un texte est à envoyer, demande à ask_dzaryx de le rédiger SANS l'envoyer. Puis relis-lui à l'oral précisément ce que tu vas faire (à qui, quoi, quand) et demande « Je le fais ? ».`,
    `2) Seulement après un oui clair de sa part (« oui », « vas-y », « envoie »), appelle ask_dzaryx avec une demande qui commence par « CONFIRMÉ AU TÉLÉPHONE : » suivie de l'action complète (destinataire, texte exact, date…). S'il hésite ou change quelque chose, corrige et relis à nouveau. Puis dis-lui que c'est fait seulement si l'outil le confirme.`,
    `INFO À RETENIR sur lui ou sa famille (« retiens que… », « le deuxième prénom d'Ibrahim c'est… », un goût, une date) : ce n'est que de la mémoire, pas un envoi → ask_dzaryx tout de suite avec « CONFIRMÉ AU TÉLÉPHONE : retiens que … », sans redemander. Dis « c'est noté » SEULEMENT si l'outil confirme ; s'il pose une question (« Je l'enregistre ? »), pose-la-lui au lieu de dire que c'est fait.`,
    `ÉCRIT : un numéro, une adresse, un mail ou tout ce qui est dur à retenir à l'oral → propose « je te l'envoie par écrit ? » ou fais-le s'il le demande : outil send_text_to_me (pas besoin de confirmation).`,
    `RAPPEL : « rappelle-moi dans une heure / à 16h » (ou s'il est occupé) → redis l'heure, outil call_me avec delay_minutes ou at_time et une reason qui rappelle le sujet ; après le ✅, dis au revoir puis end_call.`,
    `ORDRES : chaque ordre de Kouider doit être VRAIMENT exécuté, jamais juste « noté ». « Fais-moi X et rappelle-moi dans 1h / quand c'est prêt » (business plan, analyse de marché, nouvelle offre, recherche, comparatif…) → call_me avec task = sa demande COMPLÈTE (tout ce qu'il a précisé) + delay_minutes/at_time (ou sans délai = dès que c'est prêt) : le travail démarre tout de suite. Un ordre sans rappel (« envoie… », « prépare… », « cherche… ») → ask_dzaryx tout de suite. Ne dis jamais « c'est noté » sans avoir appelé l'outil, et redis-lui en une phrase ce que tu vas faire et quand tu reviens vers lui.`,
    `CAMÉRA : s'il passe en vidéo, tu reçois des images de sa caméra quand il parle. Décris ce que tu vois de façon concrète (dégât, rayure, choc, pneu, compteur, document…), sans inventer : si c'est flou ou trop loin, demande-lui de s'approcher. « Regarde » / « et là ? » → outil look. Pour enregistrer un état des lieux, un dégât ou un document, utilise ask_dzaryx avec la demande complète (voiture, client, avant/après) : l'image actuelle de la caméra lui est jointe automatiquement. Comme toute action : relis et attends son oui.`,
    `WHATSAPP BUSINESS (ses clients) : « j'ai des messages ? », « qu'est-ce que Karim a écrit ? », « réponds-lui que… », « envoie la réponse » → ask_dzaryx avec la demande (outil whatsapp_web). Lis-lui la réponse proposée, et n'envoie qu'après son oui (« CONFIRMÉ AU TÉLÉPHONE : envoie à … le message … »).`,
    `CONSEILLER BUSINESS : quand tu lui proposes une idée, un plan, un contact, un risque ou une opportunité (ton appel « conseiller » du jour), parle comme un mentor qui a réussi, puis écoute. « Mets-le sur papier » → ask_dzaryx « business_mentor action paper » ; « vas-y, exécute » → ask_dzaryx « business_mentor action execute » ; « non, laisse tomber » → action reject ; « donne-moi une autre idée sur … » → action new avec le focus. Le détail écrit est déjà sur Telegram.`,
    `RACCROCHER : quand la discussion est finie, dis au revoir en une phrase, puis appelle end_call.`,
    ...HUMAN_RULES,
    ...(family ? [`SA FAMILLE (tu la connais par cœur, demande des nouvelles de temps en temps, naturellement) :\n${family}`] : []),
    ...(dossier ? [dossier] : []),
    ...(calls ? [calls, `Si c'est utile, tu peux rappeler ce qui reste à faire de ces appels.`] : []),
  ].join('\n');
}

// Outils de la voix temps réel (format OpenAI ; convertis pour Gemini Live par /realtime-gemini)
function realtimeTools(pcMode: boolean): Array<Record<string, unknown>> {
  return [{
            type: 'function',
            name: 'ask_dzaryx',
            description: 'Le cerveau de Dzaryx, plus de 200 outils (réservations, voitures, clients, paiements, mails, agenda, rappels, démarchage, web, Google Docs / Sheets, Excel, contrats, sites et applis, images, vidéos…). Pose la demande complète de Kouider, en français. Renvoie la réponse à redire à l\'oral.',
            parameters: { type: 'object', properties: { request: { type: 'string', description: 'La demande complète, avec le contexte utile de la conversation' } }, required: ['request'] },
          }, ...[...quickToolDefs, ...quickWriteDefs, ...CALL_QUICK_DEFS, ...CALL_TOOLS]
              .filter(t => !pcMode || !PC_REMOTE_TOOLS.has((t as { name: string }).name)),
             ...(pcMode ? PC_LOCAL_TOOLS : [])];
}

// Gemini Live n'accepte qu'un sous-ensemble de JSON Schema (pas d'additionalProperties, $schema…)
function geminiSchema(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(geminiSchema);
  if (!x || typeof x !== 'object') return x;
  const keep = ['type', 'description', 'properties', 'required', 'items', 'enum', 'format', 'nullable', 'minimum', 'maximum'];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!keep.includes(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    } else if (k === 'type' && Array.isArray(v)) {
      out[k] = v.find(t => t !== 'null') ?? 'string';
    } else {
      out[k] = k === 'items' ? geminiSchema(v) : v;
    }
  }
  return out;
}

// Modèle Gemini Live (voix native) : choisi dans la liste de Google, gardé 6 h
let geminiLiveModel: { name: string; at: number } | null = null;
async function pickGeminiLiveModel(key: string): Promise<string> {
  if (geminiLiveModel && Date.now() - geminiLiveModel.at < 6 * 3600_000) return geminiLiveModel.name;
  let name = 'models/gemini-2.5-flash-native-audio-preview-09-2025';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${key}`);
    const { models = [] } = await r.json() as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
    const live = models.filter(m => m.supportedGenerationMethods?.includes('bidiGenerateContent')).map(m => m.name);
    const rank = (n: string) => (n.includes('native-audio') ? 0 : 10) + (n.includes('preview') ? 1 : 0) + (n.includes('lite') ? 2 : 0);
    live.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
    if (live[0]) name = live[0];
    console.log('[call] Gemini Live modèles:', live.slice(0, 6).join(', '));
  } catch (err) {
    console.warn('[call] liste modèles Gemini:', err instanceof Error ? err.message : String(err));
  }
  geminiLiveModel = { name, at: Date.now() };
  return name;
}

router.post('/realtime', requireCallerAuth, async (req, res) => {
  if (!env.OPENAI_API_KEY) { res.status(503).json({ error: 'OPENAI_API_KEY absente' }); return; }
  const who = callActor(req);
  const pcMode = (req.body as { mode?: string } | undefined)?.mode === 'pc' && who === 'kouider';
  if (who === 'kouider' && !pcMode) void noteKouiderActivity();   // il a décroché / il appelle → réveillé
  try {
    const [calls, dossier, family] = await Promise.all([
      recentCallsText(who).catch(() => ''),
      who === 'kouider' ? kouiderDossierText().catch(() => '') : Promise.resolve(''),
      who === 'kouider' ? familyText().catch(() => '') : Promise.resolve(''),
    ]);
    const base = realtimeInstructions(who, calls, dossier, family);
    const instructions = pcMode ? pcInstructions(base) : base;
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 120 },
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions,
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              noise_reduction: { type: 'far_field' },
              transcription: { model: 'gpt-4o-mini-transcribe', language: 'fr' },
              turn_detection: { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true },
            },
            output: { format: { type: 'audio/pcm', rate: 24000 }, voice: await realtimeVoice() },
          },
          tools: realtimeTools(pcMode),
          tool_choice: 'auto',
        },
      }),
    });
    const data = await r.json() as { value?: string; error?: { message?: string } };
    if (!r.ok || !data.value) {
      console.error('[call] realtime:', r.status, data.error?.message);
      res.status(502).json({ error: data.error?.message ?? `OpenAI HTTP ${r.status}` });
      return;
    }
    // tgcall bascule entre les deux selon la reconnaissance vocale (Kouider ↔ sa femme / un inconnu)
    res.json({ key: data.value, model: REALTIME_MODEL, voice: await realtimeVoice(), instructions,
      guestInstructions: who === 'kouider' && !pcMode ? guestInstructions(family) : undefined });
  } catch (err) {
    console.error('[call] realtime:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'realtime failed' });
  }
});

// POST /api/call/realtime-gemini — secours GRATUIT de la voix temps réel (Gemini Live) quand OpenAI n'a plus de crédit.
// Mêmes consignes et mêmes outils ; tgcall ouvre lui-même la session (la clé ne quitte que vers notre propre VPS).
router.post('/realtime-gemini', requireCallerAuth, async (req, res) => {
  if (!env.GEMINI_API_KEY) { res.status(503).json({ error: 'GEMINI_API_KEY absente' }); return; }
  const who = callActor(req);
  const pcMode = (req.body as { mode?: string } | undefined)?.mode === 'pc' && who === 'kouider';
  if (who === 'kouider' && !pcMode) void dndOnKouiderMessage().catch(() => null);   // on se parle : fin du silence « jusqu'à sa réponse »
  try {
    const [calls, dossier, family] = await Promise.all([
      recentCallsText(who).catch(() => ''),
      who === 'kouider' ? kouiderDossierText().catch(() => '') : Promise.resolve(''),
      who === 'kouider' ? familyText().catch(() => '') : Promise.resolve(''),
    ]);
    const base = realtimeInstructions(who, calls, dossier, family);
    const tools = realtimeTools(pcMode).map(t => ({
      name: t['name'], description: String(t['description'] ?? '').slice(0, 1000), parameters: geminiSchema(t['parameters'] ?? { type: 'object', properties: {} }),
    }));
    res.json({ provider: 'gemini', key: env.GEMINI_API_KEY, model: await pickGeminiLiveModel(env.GEMINI_API_KEY),
      voice: 'Charon', instructions: pcMode ? pcInstructions(base) : base, tools,
      guestInstructions: who === 'kouider' && !pcMode ? guestInstructions(family) : undefined });
  } catch (err) {
    console.error('[call] realtime-gemini:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'realtime-gemini failed' });
  }
});

// POST /api/call/tool { name, input } — lecture rapide pendant un appel (liste blanche, lecture seule)
router.post('/tool', requireCallerAuth, async (req, res) => {
  const { name, input } = req.body as { name?: string; input?: Record<string, unknown> };
  // call_me : seulement un rappel PROGRAMMÉ (« rappelle-moi dans 1 heure »), jamais tout de suite pendant l'appel
  const later = name === 'call_me' && !!(input?.['delay_minutes'] || input?.['at_time'] || input?.['at_date']);
  const write = (QUICK_WRITE_TOOLS as readonly string[]).includes(name ?? '');
  const own = name && Object.hasOwn(CALL_QUICK, name) ? CALL_QUICK[name as keyof typeof CALL_QUICK] : null;
  if (!name || (!(QUICK_TOOLS as readonly string[]).includes(name) && !later && !write && !own && !['whatsapp_link', 'send_contract', 'send_text_to_me'].includes(name))) {
    res.status(400).json({ error: 'tool not allowed' }); return;
  }
  try {
    if (name === 'send_text_to_me') {   // voix du PC : pas de client Telegram local → file d'envoi du backend
      const text = String(input?.['text'] ?? '').trim();
      if (!text) { res.json({ text: 'Texte vide.' }); return; }
      await queueTelegramMessage(text, undefined, callActor(req));
      res.json({ text: '✅ Envoyé sur Telegram.' }); return;
    }
    if (name === 'send_contract') {
      res.json(callActor(req) === 'kouider' ? await quickContract(input ?? {}) : { ok: false, text: 'Contrats réservés à Kouider.' }); return;
    }
    if (name === 'whatsapp_link') {
      const r = await clientWhatsappLink(String(input?.['client'] ?? ''), String(input?.['message'] ?? ''), input?.['phone'] as string | undefined);
      res.json(r); return;
    }
    if (own) { res.json({ text: (await own(input ?? {}, callActor(req))).slice(0, 6000) }); return; }
    const { confirmed, ...args } = input ?? {};
    if (write && confirmed !== true) {
      res.json({ text: 'Pas encore enregistré : relis-lui l\'action à l\'oral, attends son oui, puis rappelle l\'outil avec confirmed:true.' });
      return;
    }
    const out = await executeTool(name, args, `voice_${callActor(req)}`);
    res.json({ text: out.slice(0, 6000) });
  } catch (err) {
    console.error('[call] tool:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'tool failed' });
  }
});

// POST /api/call/pc-look — image de l'écran du PC pour la voix temps réel (outil pc_look de tgcall)
router.post('/pc-look', requireMobileAuth, async (req, res) => {
  if (callActor(req) !== 'kouider') { res.json({ ok: false, error: 'PC réservé à Kouider' }); return; }
  res.json(await pcLookJpeg().catch(e => ({ ok: false, error: (e as Error).message })));
});

// GET/POST /api/call/voice { voice? } — voix de Dzaryx (appels + vocaux Telegram). Sans voice → voix actuelle.
router.post('/voice', requireMobileAuth, async (req, res) => {
  const { voice } = req.body as { voice?: string };
  if (voice) {
    if (!(REALTIME_VOICES as readonly string[]).includes(voice)) { res.status(400).json({ error: 'unknown voice', voices: REALTIME_VOICES }); return; }
    await kvSet(VOICE_KEY, voice);
  }
  res.json({ voice: await realtimeVoice(), voices: REALTIME_VOICES });
});

// POST /api/call/summary { lines: [{role, text}], durationS } — fin d'un appel Telegram : résumé + choses à faire
// retenus (mémoire des appels). Renvoie le résumé, que tgcall envoie à Kouider en message.
router.post('/summary', requireCallerAuth, async (req, res) => {
  const { lines, durationS } = req.body as { lines?: CallLine[]; durationS?: number };
  if (!Array.isArray(lines)) { res.status(400).json({ error: 'lines required' }); return; }
  try {
    if (await isPrivate(callActor(req)).catch(() => false)) { res.json({ memory: null, private: true }); return; }
    const mem = await summarizeCall(callActor(req), lines.slice(-200), Number(durationS) || 0);
    res.json({ memory: mem });
  } catch (err) {
    console.error('[call] summary:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'summary failed' });
  }
});

export default router;
