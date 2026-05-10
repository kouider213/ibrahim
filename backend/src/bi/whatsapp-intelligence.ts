import { chat } from '../integrations/claude-api.js';
import { detectLanguage, isBookingRequest, isComplaint } from '../integrations/whatsapp.js';
import type { Lang } from '../integrations/whatsapp.js';

export interface ExtractedClientInfo {
  name?:             string;
  phone?:            string;
  requested_start?:  string;
  requested_end?:    string;
  duration_days?:    number;
  budget_dzd?:       number;
  vehicle_pref?:     string;
  age?:              number;
  lang:              Lang;
  is_booking_req:    boolean;
  is_complaint:      boolean;
}

export interface WhatsAppIntelligence {
  auto_response?:     string;
  extracted_info?:    ExtractedClientInfo;
  age_declined:       boolean;
  decline_message?:   string;
  conversation_type:  'booking' | 'complaint' | 'info' | 'unknown';
  generated_at:       string;
}

const DECLINE_MESSAGES: Record<Lang, string> = {
  fr: `Bonjour 👋\n\nMerci de votre intérêt pour Fik Conciergerie.\n\nMalheureusement, notre politique de location requiert un âge minimum de 35 ans.\n\nNous vous souhaitons bonne route. 🙏`,
  ar: `مرحباً 👋\n\nشكراً لاهتمامك بـ Fik Conciergerie.\n\nللأسف، سياسة الإيجار لدينا تشترط الحد الأدنى لعمر 35 سنة.\n\nنتمنى لك رحلة موفقة. 🙏`,
  en: `Hello 👋\n\nThank you for your interest in Fik Conciergerie.\n\nUnfortunately, our rental policy requires a minimum age of 35.\n\nWe wish you safe travels. 🙏`,
};

export function shouldDeclineAge(age: number | undefined): boolean {
  return typeof age === 'number' && age < 35;
}

export function getDeclineMessage(lang: Lang = 'fr'): string {
  return DECLINE_MESSAGES[lang] ?? DECLINE_MESSAGES['fr'];
}

export async function extractClientInfo(text: string): Promise<ExtractedClientInfo> {
  const lang          = detectLanguage(text);
  const is_booking_req = isBookingRequest(text);
  const is_complaint   = isComplaint(text);

  const base: ExtractedClientInfo = { lang, is_booking_req, is_complaint };

  if (!is_booking_req) return base;

  const prompt = `Tu es un assistant d'extraction d'informations pour Fik Conciergerie Oran.

Analyse ce message WhatsApp et extrait les informations en JSON strict (sans markdown):

MESSAGE: "${text.slice(0, 500)}"

Retourne EXACTEMENT ce JSON (null si non trouvé):
{
  "name": "prénom et nom du client ou null",
  "requested_start": "YYYY-MM-DD ou null",
  "requested_end": "YYYY-MM-DD ou null",
  "duration_days": nombre ou null,
  "budget_dzd": nombre ou null,
  "vehicle_pref": "modèle de véhicule préféré ou null",
  "age": nombre ou null
}`;

  const response = await chat([{ role: 'user', content: prompt }], undefined).catch(() => null);
  if (!response?.text) return base;

  try {
    const json = response.text.match(/\{[\s\S]*?\}/)?.[0];
    if (!json) return base;
    const parsed = JSON.parse(json) as Partial<ExtractedClientInfo>;
    return { ...base, ...parsed, lang, is_booking_req, is_complaint };
  } catch {
    return base;
  }
}

export async function generateAutoResponse(booking: {
  client_name: string;
  car_name:    string;
  start_date:  string;
  end_date:    string;
  final_price: number;
  lang?:       Lang;
}): Promise<string> {
  const lang = booking.lang ?? 'fr';

  const prompt = `Génère un message WhatsApp de CONFIRMATION de réservation pour Fik Conciergerie Oran.
Client: ${booking.client_name}
Véhicule: ${booking.car_name}
Dates: ${booking.start_date} → ${booking.end_date}
Montant: ${booking.final_price.toLocaleString('fr-DZ')} DZD
Langue: ${lang === 'ar' ? 'arabe' : 'français'}

Message court, professionnel, avec emoji. Maximum 5 lignes.`;

  const response = await chat([{ role: 'user', content: prompt }], undefined).catch(() => null);
  return response?.text ?? `Bonjour ${booking.client_name} 🎉\nVotre réservation ${booking.car_name} est confirmée du ${booking.start_date} au ${booking.end_date}.\nMontant: ${booking.final_price.toLocaleString('fr-DZ')} DZD\n📞 Fik Conciergerie Oran`;
}

export async function analyzeWhatsAppMessage(text: string, clientAge?: number): Promise<WhatsAppIntelligence> {
  const lang           = detectLanguage(text);
  const is_booking_req = isBookingRequest(text);
  const is_complaint   = isComplaint(text);
  const age_declined   = shouldDeclineAge(clientAge);

  const conversation_type: WhatsAppIntelligence['conversation_type'] =
    is_complaint   ? 'complaint' :
    is_booking_req ? 'booking'   :
    text.length > 10 ? 'info'   : 'unknown';

  if (age_declined) {
    return {
      age_declined:      true,
      decline_message:   getDeclineMessage(lang),
      conversation_type,
      generated_at:      new Date().toISOString(),
    };
  }

  const extracted_info = is_booking_req ? await extractClientInfo(text) : undefined;

  return {
    auto_response:     undefined, // Generated on demand via generateAutoResponse()
    extracted_info,
    age_declined:      false,
    conversation_type,
    generated_at:      new Date().toISOString(),
  };
}
