/**
 * AUTONOMIE PROGRESSIVE (27/10/2026) — Dzaryx compte les « oui » de Kouider à ses réponses WhatsApp proposées, par type
 * (question d'info, autre…). Après 5 « oui » sans changement d'un même type, il propose : « je réponds seul à ce type de
 * message ? ». C'est Kouider qui active, type par type, et il peut couper quand il veut.
 * Jamais en autonomie : demandes de location / dispo, plaintes, urgences, et toute réponse qui parle de disponibilité,
 * de réservation, de paiement ou d'un prix spécial (même règle que le gardien de nuit). app_kv `autonomy:*`.
 */
import { kvJson, kvPut, tg } from './ai-util.js';

const ALLOWED = ['question', 'autre'];
const LABEL: Record<string, string> = { question: 'questions d\'information (conditions, papiers, adresse, aéroport…)', autre: 'messages simples (remerciements, salutations, suivis)' };
const RISKY = /disponib|dispo\b|libre|r[ée]serv|confirm|acompte|paiement|payer|virement|remise|r[ée]duction|prix sp[ée]cial|caution|متوفر|محجوز/i;
interface Count { yes: number; edits: number; proposed?: boolean }

export async function noteDecision(kind: string, decision: 'yes' | 'no' | 'edit'): Promise<void> {
  if (!ALLOWED.includes(kind)) return;
  const c = await kvJson<Record<string, Count>>('autonomy:counts', {});
  const k = c[kind] ?? { yes: 0, edits: 0 };
  if (decision === 'yes') k.yes++; else { k.edits++; k.yes = Math.max(0, k.yes - 2); }
  c[kind] = k;
  const rules = await kvJson<Record<string, boolean>>('autonomy:rules', {});
  if (k.yes >= 5 && !k.proposed && !rules[kind]) {
    k.proposed = true;
    await tg(`🧠 Tu as validé mes 5 dernières réponses aux ${LABEL[kind]} sans rien changer.\nTu veux que je réponde SEUL à ce type de message à partir de maintenant ? (jamais pour une dispo, une réservation, un paiement ou un prix spécial)\nDis « oui, réponds seul aux ${kind === 'question' ? 'questions' : 'messages simples'} ».`);
  }
  await kvPut('autonomy:counts', c);
}

/** Peut-il envoyer seul cette réponse ? */
export async function canAutoSend(kind: string, reply: string): Promise<boolean> {
  if (!ALLOWED.includes(kind) || RISKY.test(reply)) return false;
  const rules = await kvJson<Record<string, boolean>>('autonomy:rules', {});
  return !!rules[kind];
}

export async function autonomyTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const kind = /quest/i.test(String(input['kind'] ?? '')) ? 'question' : /autre|simple/i.test(String(input['kind'] ?? '')) ? 'autre' : '';
  const rules = await kvJson<Record<string, boolean>>('autonomy:rules', {});
  if ((action === 'on' || action === 'off') && kind) {
    rules[kind] = action === 'on';
    await kvPut('autonomy:rules', rules);
    return action === 'on' ? `✅ Je réponds seul aux ${LABEL[kind]}. Je te montre chaque réponse envoyée sur Telegram. « arrête de répondre seul » pour couper.` : `⏹ Je ne réponds plus seul aux ${LABEL[kind]} : je te propose à nouveau chaque réponse.`;
  }
  if (action === 'off_all') { await kvPut('autonomy:rules', {}); return '⏹ Plus aucune réponse seule : tout repasse par toi.'; }
  const c = await kvJson<Record<string, Count>>('autonomy:counts', {});
  return `🧠 Autonomie :\n${ALLOWED.map(k => `• ${LABEL[k]} : ${rules[k] ? 'JE RÉPONDS SEUL' : `tu valides (${c[k]?.yes ?? 0}/5 oui d'affilée)`}`).join('\n')}\nJamais seul : dispo, réservations, paiements, prix spéciaux, plaintes, urgences.`;
}
