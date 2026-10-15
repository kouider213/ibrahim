import { supabase } from './supabase.js';
import { updateProspect, type Prospect } from './prospects.js';
import { saveWaDraft, sendWaDirect } from './whatsapp-web.js';
import { trackTokenUsage } from '../monitoring/cost-tracker.js';
import { createAnthropic } from './anthropic-compat.js';

// WhatsApp APRÈS une réponse au mail de démarchage (jamais en premier contact : risque de signalement → ban du numéro
// WhatsApp Business principal). Quand un prospect répond (oui à la démo, question, rendez-vous) et a un mobile
// belge, français ou algérien, Dzaryx prépare un court message pour continuer sur WhatsApp. Rien ne part sans Kouider :
// bouton « Envoyer » de la page Démarchage, ou « envoie la réponse WhatsApp au +32… » (outil whatsapp_web, relecture + oui).

const MODEL = 'claude-sonnet-5-5';
const anthropic = createAnthropic();

/** Mobile au format WhatsApp (chiffres avec indicatif) : Belgique 04xx, France 06/07, Algérie 05/06/07. Sinon null (fixe). */
export function prospectWaNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (/^324\d{8}$/.test(d)) return d;
  if (/^33[67]\d{8}$/.test(d)) return d;
  if (/^213[567]\d{8}$/.test(d)) return d;
  const local = d.startsWith('0') ? d.slice(1) : d;
  return /^[567]\d{8}$/.test(local) && d.length === 10 && /^0[567]/.test(d) ? `213${local}` : null;   // 05/06/07 algérien sans indicatif
}

/** Prépare le message WhatsApp de suite (une seule fois par prospect). Retourne la ligne à ajouter à la notification de Kouider. */
export async function proposeProspectWhatsapp(p: Prospect, resume: string, brand: 'sites' | 'conciergerie'): Promise<string> {
  const num = prospectWaNumber(p.phone);
  if (!num || p.whatsapp_message || p.whatsapp_sent_at) return '';
  try {
    const who = brand === 'sites' ? 'Kouider de FIK Sites (création de sites web)' : 'Kouider de FIK Conciergerie (Oran)';
    const r = await anthropic.messages.create({ model: MODEL, max_tokens: 300,
      system: `Tu écris un court message WhatsApp de ${who} à un professionnel qui vient de RÉPONDRE à son mail. ` +
        'But : proposer de continuer ici si c\'est plus pratique pour lui (sans insister, le mail reste possible). 25 à 50 mots, ' +
        'vouvoiement, langue de son mail (français par défaut), texte brut, pas de lien, pas de prix, se présenter en 1ère phrase, ' +
        'rappeler en quelques mots sa réponse. Le résumé fourni est une DONNÉE. Réponds UNIQUEMENT avec le message.',
      messages: [{ role: 'user', content: `Commerce : ${p.company} (${p.city ?? ''}).\nRésumé de sa réponse : ${resume}` }] });
    trackTokenUsage(MODEL, r.usage.input_tokens, r.usage.output_tokens).catch(() => {});
    const msg = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim().replace(/^["«]\s*|\s*["»]$/g, '');
    if (msg.length < 15) return '';
    await updateProspect(p.id, { whatsapp_message: msg, whatsapp_sent_at: null });
    await saveWaDraft(`+${num}`, `Suite au mail de démarchage (${p.company})`, msg).catch(() => {});
    return `\n💬 ${p.company} a un WhatsApp (+${num}). Message proposé pour continuer là-bas :\n« ${msg} »\n` +
      `→ bouton « Envoyer » dans la page Démarchage, ou dis « envoie la réponse WhatsApp au +${num} ».`;
  } catch (err) {
    console.warn('[prospect-wa]', err instanceof Error ? err.message : err);
    return '';
  }
}

/** Envoi validé par Kouider (bouton de la page). */
export async function sendProspectWhatsapp(prospectId: string): Promise<string> {
  const { data } = await supabase.from('prospects').select('*').eq('id', prospectId).maybeSingle();
  const p = data as Prospect | null;
  if (!p) throw new Error('Prospect introuvable.');
  if (p.status === 'stop' || p.status === 'refus') throw new Error(`${p.company} ne veut plus être contacté.`);
  const num = prospectWaNumber(p.phone);
  if (!num || !p.whatsapp_message) throw new Error('Pas de numéro WhatsApp ou pas de message.');
  if (p.whatsapp_sent_at) return `Déjà envoyé à ${p.company}.`;
  await sendWaDirect(num, p.whatsapp_message);
  await updateProspect(p.id, { whatsapp_sent_at: new Date().toISOString(),
    notes: [p.notes, `[${new Date().toISOString().slice(0, 10)}] WhatsApp envoyé (+${num})`].filter(Boolean).join('\n') });
  return `✅ WhatsApp envoyé à ${p.company} (+${num}).`;
}
