import axios from 'axios';
import { env } from '../config/env.js';

// ── Language detection ────────────────────────────────────────

export type Lang = 'ar' | 'fr' | 'en';

export function detectLanguage(text: string): Lang {
  // Arabic Unicode block
  if (/[؀-ۿ]/.test(text)) return 'ar';
  // English keywords / pattern
  if (/\b(hi|hello|hey|i |my |please|book|want|need|the |is |are |have)\b/i.test(text)) return 'en';
  return 'fr';
}

// ── Client system prompts ─────────────────────────────────────

export function getClientSystemPrompt(lang: Lang): string {
  const base = `Tu es Dzaryx, assistant IA de Fik Conciergerie Oran — agence de location de voitures de luxe.
Tu représentes l'agence de façon professionnelle et chaleureuse.
Tu DOIS toujours répondre dans la langue du client (${lang === 'ar' ? 'arabe dialectal algérien' : lang === 'en' ? 'anglais' : 'français'}).
Ne révèle jamais que tu es une IA si ce n'est pas demandé.
RÈGLES STRICTES — ne jamais enfreindre :
- Ne donne JAMAIS les disponibilités ni les tarifs. Si demandé : "Notre responsable vous confirmera les disponibilités et le tarif sous peu."
- Ne confirme JAMAIS une réservation toi-même. Toujours rediriger vers le responsable.
- Ne donne JAMAIS de numéro de compte bancaire ni d'instructions de paiement.
Pour toute demande de réservation : recueille les infos (nom, dates, voiture souhaitée, lieu de livraison), puis dis que le responsable va confirmer rapidement.
Pour les questions générales sur l'agence : réponds avec enthousiasme (flotte, services, zone couverte).
Pour les plaintes : écoute, compatit, rassure — sans promettre de remboursement.
Sois concis (WhatsApp, pas d'email). Max 2 paragraphes.`;

  if (lang === 'ar') {
    return `أنت دزاريكس، مساعد ذكاء اصطناعي لـ Fik Conciergerie Oran — وكالة تأجير سيارات فاخرة.
تمثّل الوكالة باحترافية وودّية.
ردّ دائماً بالعربية الدارجة الجزائرية.
لا تكشف أنك ذكاء اصطناعي إلا إذا سُئلت.
قواعد صارمة — لا تخالفها أبداً:
- لا تعطِ أبداً الأسعار أو التوفّر. إذا سُئلت: "مسؤولنا سيأكّد لك التوفّر والسعر قريباً."
- لا تؤكّد أي حجز بنفسك. دائماً أحِل للمسؤول.
- لا تعطِ أبداً رقم الحساب البنكي أو تعليمات الدفع.
لطلبات الحجز: اجمع المعلومات (الاسم، التواريخ، السيارة المطلوبة، مكان التسليم)، ثم قل أن المسؤول سيؤكّد سريعاً.
للأسئلة العامة عن الوكالة: أجب بحماس (الأسطول، الخدمات، المنطقة المغطّاة).
للشكاوى: استمع، تعاطف، اطمئن — دون الوعد بالاسترداد.
كن موجزاً (واتساب، ليس بريد إلكتروني). فقرتان كحدٍّ أقصى.`;
  }

  if (lang === 'en') {
    return `You are Dzaryx, AI assistant for Fik Conciergerie Oran — a luxury car rental agency.
You represent the agency professionally and warmly.
Always reply in English.
Do not reveal you are an AI unless asked.
STRICT RULES — never break:
- Never give availability or pricing. If asked: "Our manager will confirm availability and pricing shortly."
- Never confirm a booking yourself. Always refer to the manager.
- Never share bank account details or payment instructions.
For booking requests: gather info (name, dates, desired car, delivery location), then say the manager will confirm shortly.
For general questions: respond enthusiastically (fleet, services, coverage area).
For complaints: listen, empathize, reassure — never promise a refund.
Be concise (WhatsApp, not email). Max 2 paragraphs.`;
  }

  return base;
}

// ── Intent detection helpers ──────────────────────────────────

const BOOKING_PATTERNS = /louer|réserver|résa|location|disponible|dispo|prix|tarif|combien|book|reserve|rent|available|price|حجز|أجرة|متاح|سعر|كراء/i;
const COMPLAINT_PATTERNS = /problème|plainte|réclamation|mauvais|déçu|remboursement|arnaque|escroquerie|problem|complaint|bad|disappointed|refund|مشكل|شكوى|راسلتكم|خذلتوني/i;

export function isBookingRequest(text: string): boolean {
  return BOOKING_PATTERNS.test(text);
}

export function isComplaint(text: string): boolean {
  return COMPLAINT_PATTERNS.test(text);
}

// ── Send WhatsApp via Twilio ──────────────────────────────────

export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
    console.warn('[whatsapp] Twilio not configured — message not sent');
    return false;
  }

  // Ensure "to" has whatsapp: prefix
  const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
    await axios.post(url, new URLSearchParams({
      From: env.TWILIO_WHATSAPP_FROM,
      To:   formattedTo,
      Body: body,
    }), {
      auth: { username: env.TWILIO_ACCOUNT_SID, password: env.TWILIO_AUTH_TOKEN },
      timeout: 10_000,
    });
    console.log(`[whatsapp] ✅ Sent to ${formattedTo}: ${body.slice(0, 60)}`);
    return true;
  } catch (err) {
    const msg = (err as { response?: { data?: unknown } }).response?.data ?? String(err);
    console.error('[whatsapp] Send failed:', msg);
    return false;
  }
}

// ── Send booking confirmation ─────────────────────────────────

export async function sendBookingConfirmation(
  phone:       string,
  clientName:  string,
  carName:     string,
  startDate:   string,
  endDate:     string,
  totalPrice:  number,
  lang:        Lang = 'fr',
): Promise<boolean> {
  let msg: string;

  if (lang === 'ar') {
    msg = `مرحباً ${clientName} 🎉\n\nتم تأكيد حجزك في Fik Conciergerie Oran!\n\n🚗 السيارة: ${carName}\n📅 من: ${startDate}\n📅 إلى: ${endDate}\n💰 المبلغ الإجمالي: ${totalPrice.toLocaleString('fr-DZ')} DZD\n\nشكراً لثقتك بنا. للاستفسار، راسلنا هنا.`;
  } else if (lang === 'en') {
    msg = `Hello ${clientName} 🎉\n\nYour booking at Fik Conciergerie Oran is confirmed!\n\n🚗 Car: ${carName}\n📅 From: ${startDate}\n📅 To: ${endDate}\n💰 Total: ${totalPrice.toLocaleString('fr-DZ')} DZD\n\nThank you for choosing us. Reply here for any questions.`;
  } else {
    msg = `Bonjour ${clientName} 🎉\n\nVotre réservation chez Fik Conciergerie Oran est confirmée !\n\n🚗 Véhicule: ${carName}\n📅 Du: ${startDate}\n📅 Au: ${endDate}\n💰 Total: ${totalPrice.toLocaleString('fr-DZ')} DZD\n\nMerci de votre confiance. Répondez ici pour toute question.`;
  }

  return sendWhatsApp(phone, msg);
}

// ── Send 24h reminder ─────────────────────────────────────────

export async function send24hReminder(
  phone:      string,
  clientName: string,
  carName:    string,
  startDate:  string,
  lang:       Lang = 'fr',
): Promise<boolean> {
  let msg: string;

  if (lang === 'ar') {
    msg = `مرحباً ${clientName} 👋\n\nتذكير: حجزك لـ ${carName} غداً ${startDate}.\n\nللتأكيد أو لأي استفسار، راسلنا هنا. 🚗`;
  } else if (lang === 'en') {
    msg = `Hello ${clientName} 👋\n\nReminder: Your ${carName} rental starts tomorrow, ${startDate}.\n\nReply here to confirm or for any questions. 🚗`;
  } else {
    msg = `Bonjour ${clientName} 👋\n\nRappel : Votre location de ${carName} commence demain, le ${startDate}.\n\nRépondez ici pour confirmer ou pour toute question. 🚗`;
  }

  return sendWhatsApp(phone, msg);
}

// ── Send end-of-rental message ────────────────────────────────

export async function sendReturnReminder(
  phone:      string,
  clientName: string,
  carName:    string,
  endDate:    string,
  lang:       Lang = 'fr',
): Promise<boolean> {
  let msg: string;

  if (lang === 'ar') {
    msg = `مرحباً ${clientName}،\n\nنذكّرك أن موعد إعادة ${carName} اليوم ${endDate}.\n\nشكراً لك على ثقتك. نتمنى أن تكون رحلتك ممتعة! 🙏`;
  } else if (lang === 'en') {
    msg = `Hello ${clientName},\n\nThis is a reminder that your ${carName} rental ends today, ${endDate}.\n\nThank you for choosing us — hope you enjoyed the ride! 🙏`;
  } else {
    msg = `Bonjour ${clientName},\n\nRappel : la restitution de votre ${carName} est prévue aujourd'hui, le ${endDate}.\n\nMerci de votre confiance — nous espérons que vous avez passé un excellent séjour ! 🙏`;
  }

  return sendWhatsApp(phone, msg);
}
