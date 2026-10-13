import { Router, type Request } from 'express';
import { requireMobileAuth } from '../middleware/auth.js';
import { answerCall, declineCall, getPendingCall, callOwner, type CallActor } from '../../notifications/voice-call.js';
import { processMessage } from '../../conversation/orchestrator.js';
import { synthesizeVoice } from '../../notifications/dispatcher.js';
import { DEFAULT_MEMBER, type OrgMember } from '../../orchestrator/org-resolver.js';
import { env } from '../../config/env.js';
import { executeTool } from '../../integrations/tool-executor.js';
import { Dzaryx_TOOLS } from '../../integrations/tools.js';
import { kvGet, kvSet } from '../../integrations/app-store.js';
import { summarizeCall, recentCallsText, type CallLine } from '../../notifications/call-memory.js';

const router = Router();

// Même règle que /api/chat : jeton partagé → l'acteur vient de l'app (Houari connecté dans le simulateur).
function callActor(req: Request): CallActor {
  if (req.mobileActor?.ownerKey === 'houari') return 'houari';
  const fromApp = (req.body as { actor?: string } | undefined)?.actor ?? req.query['actor'];
  return fromApp === 'houari' ? 'houari' : 'kouider';
}

// POST /api/call/pending — appel de Dzaryx en train de sonner ? (POST : jamais servi par le cache hors-ligne de l'app)
router.post('/pending', requireMobileAuth, async (req, res) => {
  const call = await getPendingCall(callActor(req));
  res.json({ call: call ? { id: call.id, reason: call.reason, createdAt: call.createdAt } : null });
});

// POST /api/call/answer { callId? } — décrocher (ou lancer l'appel) → phrase d'accueil + audio
router.post('/answer', requireMobileAuth, async (req, res) => {
  try {
    const { callId, noAudio } = req.body as { callId?: string; noAudio?: boolean };
    res.json(await answerCall(callActor(req), callId, !!noAudio));
  } catch (err) {
    console.error('[call] answer:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'answer failed' });
  }
});

// POST /api/call/decline { callId? } — refuser / appel manqué
router.post('/decline', requireMobileAuth, async (req, res) => {
  const { callId } = req.body as { callId?: string };
  await declineCall(callActor(req), callId);
  res.json({ ok: true });
});

// POST /api/call/test — fait sonner l'app (test de bout en bout)
router.post('/test', requireMobileAuth, async (req, res) => {
  const { id } = await callOwner('Ceci est un appel de test. Tu m\'entends bien ?', callActor(req));
  res.json({ ok: true, id });
});

// POST /api/call/turn { message, textOnly? } — un tour de parole pendant un vrai appel (Telegram) :
// réponse SYNCHRONE de Dzaryx (texte + audio mp3), même session que la voix de l'app.
router.post('/turn', requireMobileAuth, async (req, res) => {
  const { message, textOnly, stream } = req.body as { message?: string; textOnly?: boolean; stream?: boolean };
  if (!message?.trim()) { res.status(400).json({ error: 'message required' }); return; }
  const who = callActor(req);
  const actor: OrgMember = who === 'houari'
    ? { orgId: '', ownerKey: 'houari', role: 'admin', displayName: env.PARTNER_NAME }
    : DEFAULT_MEMBER;
  try {
    // Dzaryx doit savoir qu'il est DÉJÀ au téléphone : sinon « tu m'entends ? » relance call_me.
    const inCall = `[APPEL TÉLÉPHONIQUE EN COURS : tu parles en direct avec lui. Réponds à l'oral, 1 à 2 phrases courtes. N'utilise pas call_me, vous êtes déjà en ligne. Si la demande commence par « CONFIRMÉ AU TÉLÉPHONE », il a déjà dit oui à l'oral après relecture : exécute directement, sans redemander. Sinon, pour un envoi/une modification, prépare et décris ce que tu ferais SANS l'exécuter.]\n${message.trim().slice(0, 2000)}`;
    const out = await processMessage(inCall, `voice_${who}`, true, undefined, 'image/jpeg', actor);
    const text = (out.text ?? '').trim() || 'Pardon, je n\'ai pas compris.';
    if (stream && !textOnly) { await streamTurn(res, text); return; }
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
  'get_finance_dashboard', 'list_emails', 'read_email'] as const;
const quickToolDefs = Dzaryx_TOOLS
  .filter(t => (QUICK_TOOLS as readonly string[]).includes(t.name))
  .map(t => ({ type: 'function', name: t.name, description: `Lecture rapide. ${t.description ?? ''}`.slice(0, 1000), parameters: t.input_schema }));

function realtimeInstructions(who: CallActor, calls: string): string {
  const name = who === 'houari' ? env.PARTNER_NAME : env.OWNER_NAME;
  const now = new Date();
  const fmt = (tz: string) => now.toLocaleString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return [
    `Tu es Dzaryx, l'assistant personnel de ${name}, au TÉLÉPHONE avec lui (appel Telegram, en direct).`,
    `${env.OWNER_NAME} dirige FIK Conciergerie : location de voitures et conciergerie à Oran (Algérie) ; il vit en Belgique. Son associé est ${env.PARTNER_NAME}.`,
    `Maintenant : ${fmt('Europe/Brussels')} en Belgique (${fmt('Africa/Algiers')} à Oran).`,
    `Parle en français, tutoiement, comme un vrai assistant au téléphone : chaleureux, naturel, phrases courtes, 1 à 3 phrases par réponse. Pas de listes, pas de markdown.`,
    `Si on te coupe la parole, arrête-toi et écoute.`,
    `RAPIDE : pour juste LIRE des réservations, la flotte, une dispo, les impayés, les finances ou les mails, utilise directement l'outil correspondant (list_bookings, get_fleet_status, check_car_availability, get_unpaid_bookings, get_finance_dashboard, list_emails puis read_email) : c'est instantané. ask_dzaryx pour tout le reste (clients, agenda, rappels, prospects, web, mails envoyés…) et pour TOUTE action.`,
    `IMPORTANT : tu ne connais RIEN de ses affaires par toi-même. Pour toute info réelle ou action (réservations, voitures, clients, paiements, mails, agenda, rappels, démarchage, prospects, finances, météo, actualité, envoyer un message…), appelle l'outil ask_dzaryx avec sa demande complète, et dis d'abord un petit mot naturel (« je regarde », « deux secondes »). Ne jamais inventer un chiffre, un nom ou un mail.`,
    `Même si la question ressemble à une précédente (« j'ai déjà répondu ? », « il y a du nouveau ? », « c'est sûr ? »), RAPPELLE ask_dzaryx : ne réponds JAMAIS oui/non sur un fait de mémoire. Si tu n'as pas vérifié, dis « je vérifie » et appelle l'outil.`,
    `Quand l'outil répond, redis l'essentiel à l'oral, simplement (montants en euros ou dinars en toutes lettres si besoin).`,
    `ACTIONS (envoyer un mail/message/WhatsApp, créer/modifier/annuler une réservation, enregistrer un paiement, programmer un rappel, appeler ou relancer quelqu'un…) : TOUJOURS en deux temps.`,
    `1) Prépare : si un texte est à envoyer, demande à ask_dzaryx de le rédiger SANS l'envoyer. Puis relis-lui à l'oral précisément ce que tu vas faire (à qui, quoi, quand) et demande « Je le fais ? ».`,
    `2) Seulement après un oui clair de sa part (« oui », « vas-y », « envoie »), appelle ask_dzaryx avec une demande qui commence par « CONFIRMÉ AU TÉLÉPHONE : » suivie de l'action complète (destinataire, texte exact, date…). S'il hésite ou change quelque chose, corrige et relis à nouveau. Puis dis-lui que c'est fait seulement si l'outil le confirme.`,
    `Un rappel qu'il demande pour lui-même (« rappelle-moi demain à 9h ») : redis l'heure et le sujet, puis fais-le après son oui.`,
    ...(calls ? [calls, `Si c'est utile, tu peux rappeler ce qui reste à faire de ces appels.`] : []),
  ].join('\n');
}

router.post('/realtime', requireMobileAuth, async (req, res) => {
  if (!env.OPENAI_API_KEY) { res.status(503).json({ error: 'OPENAI_API_KEY absente' }); return; }
  const who = callActor(req);
  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 120 },
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: realtimeInstructions(who, await recentCallsText(who).catch(() => '')),
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              noise_reduction: { type: 'far_field' },
              transcription: { model: 'gpt-4o-mini-transcribe', language: 'fr' },
              turn_detection: { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true },
            },
            output: { format: { type: 'audio/pcm', rate: 24000 }, voice: await realtimeVoice() },
          },
          tools: [{
            type: 'function',
            name: 'ask_dzaryx',
            description: 'Le cerveau de Dzaryx (accès réel aux réservations, voitures, clients, paiements, mails, agenda, rappels, démarchage, web…). Pose la demande complète de Kouider, en français. Renvoie la réponse à redire à l\'oral.',
            parameters: { type: 'object', properties: { request: { type: 'string', description: 'La demande complète, avec le contexte utile de la conversation' } }, required: ['request'] },
          }, ...quickToolDefs],
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
    res.json({ key: data.value, model: REALTIME_MODEL, voice: await realtimeVoice() });
  } catch (err) {
    console.error('[call] realtime:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'realtime failed' });
  }
});

// POST /api/call/tool { name, input } — lecture rapide pendant un appel (liste blanche, lecture seule)
router.post('/tool', requireMobileAuth, async (req, res) => {
  const { name, input } = req.body as { name?: string; input?: Record<string, unknown> };
  if (!name || !(QUICK_TOOLS as readonly string[]).includes(name)) { res.status(400).json({ error: 'tool not allowed' }); return; }
  try {
    const out = await executeTool(name, input ?? {}, `voice_${callActor(req)}`);
    res.json({ text: out.slice(0, 6000) });
  } catch (err) {
    console.error('[call] tool:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'tool failed' });
  }
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
router.post('/summary', requireMobileAuth, async (req, res) => {
  const { lines, durationS } = req.body as { lines?: CallLine[]; durationS?: number };
  if (!Array.isArray(lines)) { res.status(400).json({ error: 'lines required' }); return; }
  try {
    const mem = await summarizeCall(callActor(req), lines.slice(-200), Number(durationS) || 0);
    res.json({ memory: mem });
  } catch (err) {
    console.error('[call] summary:', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'summary failed' });
  }
});

export default router;
