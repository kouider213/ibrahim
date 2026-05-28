/**
 * WhatsApp Booking Flow — State machine for client booking intake
 *
 * Flow:
 *   idle → collecting info → pending_approval (Kouider validates)
 *   → payment_requested (send bank info) → docs_requested
 *   → confirmed (create booking + calendar)
 */

import { redis } from '../queue/queue.js';
import { supabase } from '../integrations/supabase.js';
import { sendWhatsApp, type Lang } from '../integrations/whatsapp.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { chat } from '../integrations/claude-api.js';
import { createCalendarEvent } from '../integrations/google-calendar.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WaSession {
  phone:   string;
  lang:    Lang;
  state:   'idle' | 'collecting' | 'pending_approval' | 'payment_requested' | 'docs_requested' | 'confirmed';
  requestId?: string;         // UUID of wa_booking_requests row
  bookingId?: string;
}

export interface BookingFields {
  client_name?:      string;
  start_date?:       string;
  end_date?:         string;
  vehicle_wanted?:   string;
  delivery_location?: string;
  return_location?:  string;
  num_persons?:      number;
  has_flight?:       boolean;
  flight_number?:    string;
  arrival_time?:     string;
  arrival_airport?:  string;
  notes?:            string;
}

const REQUIRED: (keyof BookingFields)[] = [
  'client_name', 'start_date', 'end_date', 'vehicle_wanted', 'delivery_location',
];

// ── Redis helpers ─────────────────────────────────────────────────────────────

const KEY_SESSION = (phone: string) => `wa:session:${phone.replace(/\D/g, '')}`;
const KEY_FIELDS  = (phone: string) => `wa:fields:${phone.replace(/\D/g, '')}`;
const TTL = 60 * 60 * 24 * 3; // 3 days

export async function getSession(phone: string): Promise<WaSession> {
  const raw = await redis.get(KEY_SESSION(phone)).catch(() => null);
  if (raw) {
    try { return JSON.parse(raw) as WaSession; } catch { /* ignore */ }
  }
  return { phone, lang: 'fr', state: 'idle' };
}

export async function saveSession(sess: WaSession): Promise<void> {
  await redis.set(KEY_SESSION(sess.phone), JSON.stringify(sess), 'EX', TTL);
}

async function getFields(phone: string): Promise<BookingFields> {
  const raw = await redis.get(KEY_FIELDS(phone)).catch(() => null);
  if (raw) { try { return JSON.parse(raw) as BookingFields; } catch { /* ignore */ } }
  return {};
}

async function saveFields(phone: string, fields: BookingFields): Promise<void> {
  await redis.set(KEY_FIELDS(phone), JSON.stringify(fields), 'EX', TTL);
}


// ── Field extraction via Claude ───────────────────────────────────────────────

const EXTRACT_PROMPT = `Tu es un assistant qui extrait des informations de réservation depuis un message WhatsApp client.

Extrait UNIQUEMENT les champs présents dans le message. Ne devine rien.
Réponds UNIQUEMENT avec un JSON valide, sans texte autour. Format:
{
  "client_name": "...",       // nom complet
  "start_date": "YYYY-MM-DD", // date d'arrivée/début
  "end_date": "YYYY-MM-DD",   // date de départ/fin
  "vehicle_wanted": "...",    // modèle ou type souhaité
  "delivery_location": "...", // lieu de livraison (aéroport, adresse)
  "return_location": "...",   // lieu de récupération retour
  "num_persons": 0,           // nombre de personnes
  "has_flight": true/false,   // a-t-il un billet d'avion ?
  "flight_number": "...",     // numéro de vol
  "arrival_time": "HH:MM",    // heure d'arrivée
  "arrival_airport": "...",   // aéroport
  "notes": "..."              // autres infos pertinentes
}
Si un champ est inconnu → omettre la clé (ne pas mettre null).`;

export async function extractBookingFields(
  text:        string,
  existing:    BookingFields,
  lang:        Lang,
): Promise<BookingFields> {
  try {
    const prompt = `Langue client: ${lang}\nChamps déjà connus: ${JSON.stringify(existing)}\nMessage: "${text}"`;
    const res = await chat([{ role: 'user', content: prompt }], EXTRACT_PROMPT);
    const jsonMatch = res.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return existing;
    const extracted = JSON.parse(jsonMatch[0]) as Partial<BookingFields>;
    // Merge: existing + extracted (extracted wins)
    return { ...existing, ...Object.fromEntries(Object.entries(extracted).filter(([, v]) => v != null)) };
  } catch {
    return existing;
  }
}

function getMissingFields(fields: BookingFields): string[] {
  return REQUIRED.filter(k => !fields[k]);
}

// ── Client-facing messages ────────────────────────────────────────────────────

function missingFieldQuestion(missing: string[], lang: Lang): string {
  const labels: Record<string, Record<Lang, string>> = {
    client_name:       { fr: 'votre nom complet', ar: 'اسمك الكامل', en: 'your full name' },
    start_date:        { fr: 'la date d\'arrivée', ar: 'تاريخ الوصول', en: 'your arrival date' },
    end_date:          { fr: 'la date de départ', ar: 'تاريخ المغادرة', en: 'your departure date' },
    vehicle_wanted:    { fr: 'le type/modèle de voiture souhaité', ar: 'نوع السيارة المطلوبة', en: 'the car type/model you want' },
    delivery_location: { fr: 'le lieu de livraison (aéroport, adresse…)', ar: 'مكان التسليم (المطار، العنوان...)', en: 'delivery location (airport, address…)' },
  };
  const field = missing[0]!;
  const label = labels[field]?.[lang] ?? field;

  if (lang === 'ar')
    return `شكراً! نحتاج ${label} لمتابعة طلبك. 🙏`;
  if (lang === 'en')
    return `Thank you! To continue, could you share ${label}? 🙏`;
  return `Merci ! Pour continuer, pourriez-vous nous donner ${label} ? 🙏`;
}

function ackPendingApproval(lang: Lang): string {
  if (lang === 'ar')
    return 'شكراً لك! تلقينا طلب حجزك كاملاً. المسؤول سيراجعه ويرد عليك في أقرب وقت. ⏳';
  if (lang === 'en')
    return 'Thank you! We have received your full booking request. Our manager will review it and get back to you shortly. ⏳';
  return 'Merci ! Nous avons bien reçu votre demande de réservation complète. Notre responsable va la vérifier et vous répond très prochainement. ⏳';
}

export function buildPaymentMessage(fields: BookingFields, dailyRate: number, bankAccount: string, lang: Lang): string {
  if (!fields.start_date || !fields.end_date) return '';
  const days    = Math.max(1, Math.ceil((new Date(fields.end_date).getTime() - new Date(fields.start_date).getTime()) / 86400000));
  const deposit = dailyRate * 3;
  const total   = dailyRate * days;

  if (lang === 'ar') {
    return `✅ تم قبول طلب حجزك!\n\n🚗 ${fields.vehicle_wanted ?? 'Véhicule'}\n📅 من ${fields.start_date} إلى ${fields.end_date} (${days} يوم)\n\n💰 المبلغ الكلي: ${total} DZD\n💳 العربون (3 أيام): ${deposit} DZD\n\nالرجاء تحويل العربون إلى الحساب:\n🏦 ${bankAccount}\n📝 الإشارة: service rendu\n\nبعد التحويل، أرسل لنا صورة الإيصال. شكراً! 🙏`;
  }
  if (lang === 'en') {
    return `✅ Your booking request has been accepted!\n\n🚗 ${fields.vehicle_wanted ?? 'Vehicle'}\n📅 From ${fields.start_date} to ${fields.end_date} (${days} days)\n\n💰 Total: ${total} DZD\n💳 Deposit (3 days): ${deposit} DZD\n\nPlease transfer the deposit to:\n🏦 ${bankAccount}\n📝 Reference: service rendu\n\nAfter transfer, please send us a photo of the receipt. Thank you! 🙏`;
  }
  return `✅ Votre demande de réservation a été acceptée !\n\n🚗 ${fields.vehicle_wanted ?? 'Véhicule'}\n📅 Du ${fields.start_date} au ${fields.end_date} (${days} jours)\n\n💰 Total : ${total} DZD\n💳 Acompte (3 jours) : ${deposit} DZD\n\nMerci d'effectuer le virement sur :\n🏦 ${bankAccount}\n📝 Communication : service rendu\n\nAprès le virement, envoyez-nous une photo du reçu. Merci ! 🙏`;
}

function buildDocsRequest(lang: Lang): string {
  if (lang === 'ar')
    return '✅ تم تأكيد الدفع شكراً!\n\nلإتمام الحجز، نحتاج منك:\n📄 صورة جواز السفر\n✈️ صورة تذكرة الطيران\n\nيرجى إرسالها مباشرة هنا. 🙏';
  if (lang === 'en')
    return '✅ Payment confirmed, thank you!\n\nTo complete your booking, we need:\n📄 Photo of your passport\n✈️ Photo of your flight ticket\n\nPlease send them here directly. 🙏';
  return '✅ Paiement confirmé, merci !\n\nPour finaliser votre réservation, nous avons besoin de :\n📄 Photo de votre passeport\n✈️ Photo de votre billet d\'avion\n\nMerci de les envoyer directement ici. 🙏';
}

// ── Main flow handler ─────────────────────────────────────────────────────────

export interface FlowResult {
  handled:  boolean;   // true = booking flow handled, no need for generic Claude reply
  reply?:   string;    // message to send to client
}

export async function handleBookingFlow(
  phone:    string,
  text:     string,
  lang:     Lang,
  isBookingIntent: boolean,
): Promise<FlowResult> {
  const sess = await getSession(phone);

  // ── State: collecting info ────────────────────────────────────
  if (sess.state === 'collecting' || (sess.state === 'idle' && isBookingIntent)) {
    const existing = await getFields(phone);
    const merged   = await extractBookingFields(text, existing, lang);
    await saveFields(phone, merged);

    const missing = getMissingFields(merged);

    if (missing.length > 0) {
      // Still missing fields → ask for next one
      await saveSession({ ...sess, state: 'collecting' });
      return { handled: true, reply: missingFieldQuestion(missing, lang) };
    }

    // All required fields collected → create pending request
    const { data, error } = await supabase
      .from('wa_booking_requests')
      .insert({
        phone,
        lang,
        status: 'pending_approval',
        ...merged,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[wa-flow] Failed to create request:', error?.message);
      return { handled: true, reply: lang === 'fr' ? 'Désolé, une erreur est survenue. Réessayez.' : 'Sorry, an error occurred. Please try again.' };
    }

    const requestId = (data as { id: string }).id;
    await saveSession({ ...sess, state: 'pending_approval', requestId });

    // Notify Kouider in app
    const summary = [
      `📋 DEMANDE RÉSERVATION WhatsApp`,
      `👤 ${merged.client_name}`,
      `📱 ${phone}`,
      `🚗 ${merged.vehicle_wanted}`,
      `📅 ${merged.start_date} → ${merged.end_date}`,
      `📍 Livraison: ${merged.delivery_location}`,
      merged.return_location ? `📍 Retour: ${merged.return_location}` : '',
      merged.flight_number ? `✈️ Vol: ${merged.flight_number} à ${merged.arrival_time}` : '',
      merged.notes ? `📝 ${merged.notes}` : '',
      '',
      `🔑 ID: ${requestId}`,
      `👉 Va dans DEMANDES pour valider ou refuser.`,
    ].filter(Boolean).join('\n');

    emitProactive(`🚗 Nouvelle demande WhatsApp — ${merged.client_name}`, 'alert', summary, 'kouider');

    return { handled: true, reply: ackPendingApproval(lang) };
  }

  // ── State: waiting for payment proof ─────────────────────────
  if (sess.state === 'payment_requested') {
    // Client sent something while waiting for payment — likely asking a question, let Claude handle
    const paymentKeywords = /reçu|paiement|virement|payé|transfert|paid|transfer|receipt|payment|تحويل|دفعت|ايصال/i;
    if (paymentKeywords.test(text) && sess.requestId) {
      // Kouider must manually confirm payment in app
      const summary = `📨 Client ${phone} dit avoir payé l'acompte.\nDemande: ${sess.requestId}\nVérifier et confirmer dans DEMANDES.`;
      emitProactive('Acompte client — vérification requise', 'alert', summary, 'kouider');
      const ack = lang === 'fr'
        ? 'Merci ! Votre notification de paiement a été transmise à notre équipe. Nous vérifions et revenons vers vous sous peu. 🙏'
        : lang === 'ar'
        ? 'شكراً! تم إرسال إشعار الدفع لفريقنا. سنتحقق ونرد عليك قريباً. 🙏'
        : 'Thank you! Your payment notification has been forwarded to our team. We will verify and get back to you shortly. 🙏';
      return { handled: true, reply: ack };
    }
    // Generic question → let Claude handle, not booking flow
    return { handled: false };
  }

  // ── State: waiting docs ───────────────────────────────────────
  if (sess.state === 'docs_requested') {
    // Text message while waiting for docs — probably a question
    return { handled: false };
  }

  // Not in booking flow
  return { handled: false };
}

// ── Document OCR handler ──────────────────────────────────────────────────────

export async function handleClientDocument(
  phone:       string,
  lang:        Lang,
  imageBase64: string,
  imageMime:   string,
): Promise<string> {
  const sess = await getSession(phone);

  // Vision OCR via Claude
  const ocrPrompt = `Tu reçois un document envoyé par un client de location de voiture.
Analyse cette image et extrait toutes les informations utiles.
Réponds en JSON uniquement:
{
  "doc_type": "passport" | "ticket" | "license" | "unknown",
  "full_name": "...",
  "document_number": "...",
  "expiry_date": "YYYY-MM-DD",
  "nationality": "...",
  "birth_date": "YYYY-MM-DD",
  "flight_number": "...",
  "flight_date": "YYYY-MM-DD",
  "arrival_time": "HH:MM",
  "departure_airport": "...",
  "arrival_airport": "...",
  "notes": "..."
}
Omettre les clés inconnues.`;

  let extracted: Record<string, string> = {};
  try {
    const res = await chat(
      [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: imageMime as 'image/jpeg', data: imageBase64 } },
        { type: 'text',  text: ocrPrompt },
      ]}],
      'Analyse de document client — extraction JSON uniquement.',
    );
    const m = res.text.match(/\{[\s\S]*\}/);
    if (m) extracted = JSON.parse(m[0]) as Record<string, string>;
  } catch { /* ignore OCR failure */ }

  // Update wa_booking_requests if we have a pending request for this phone
  if (sess.requestId) {
    const updates: Record<string, unknown> = {};
    if (extracted['doc_type'] === 'passport') {
      if (extracted['document_number']) updates['passport_number'] = extracted['document_number'];
      if (extracted['expiry_date'])     updates['passport_expiry'] = extracted['expiry_date'];
      if (extracted['nationality'])     updates['nationality']     = extracted['nationality'];
    } else if (extracted['doc_type'] === 'ticket') {
      if (extracted['flight_number'])   updates['flight_number']   = extracted['flight_number'];
      if (extracted['flight_date'])     updates['flight_date']     = extracted['flight_date'];
      if (extracted['arrival_time'])    updates['arrival_time']    = extracted['arrival_time'];
      if (extracted['arrival_airport']) updates['arrival_airport'] = extracted['arrival_airport'];
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('wa_booking_requests').update(updates).eq('id', sess.requestId);
    }
  }

  // Notify Kouider
  const docLabel = extracted['doc_type'] === 'passport' ? 'Passeport' :
                   extracted['doc_type'] === 'ticket'   ? 'Billet d\'avion' :
                   extracted['doc_type'] === 'license'  ? 'Permis de conduire' : 'Document';
  const infoLines = [
    `📄 ${docLabel} reçu — client ${phone}`,
    extracted['full_name']       ? `👤 ${extracted['full_name']}`        : '',
    extracted['document_number'] ? `🔢 N° ${extracted['document_number']}`  : '',
    extracted['expiry_date']     ? `📅 Expiry: ${extracted['expiry_date']}` : '',
    extracted['nationality']     ? `🌍 ${extracted['nationality']}`      : '',
    extracted['flight_number']   ? `✈️ Vol ${extracted['flight_number']} le ${extracted['flight_date'] ?? '?'} à ${extracted['arrival_time'] ?? '?'}` : '',
  ].filter(Boolean).join('\n');

  emitProactive(`${docLabel} client WhatsApp reçu`, 'info', infoLines, 'kouider');

  // Check if both docs received → notify to confirm
  if (sess.requestId) {
    const { data: req } = await supabase
      .from('wa_booking_requests')
      .select('passport_number, flight_number')
      .eq('id', sess.requestId)
      .single();

    if ((req as any)?.passport_number && (req as any)?.flight_number) {
      emitProactive(
        '✅ Tous les documents reçus — confirmer réservation',
        'alert',
        `Client ${phone}\nPasseport ✅ + Billet ✅\nReq: ${sess.requestId}\n→ Va dans DEMANDES pour créer la réservation finale.`,
        'kouider',
      );
    }
  }

  // Ack to client
  if (lang === 'ar') return 'شكراً! تم استلام الوثيقة وسيتم مراجعتها. 📋';
  if (lang === 'en') return 'Thank you! Document received and under review. 📋';
  return 'Merci ! Document reçu et en cours de vérification. 📋';
}

// ── Post-approval: send payment info ─────────────────────────────────────────

export async function sendPaymentInstructions(
  requestId:   string,
  bankAccount: string,
  dailyRate:   number,
): Promise<boolean> {
  const { data: req } = await supabase
    .from('wa_booking_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!req) return false;
  const r = req as any;

  const msg = buildPaymentMessage(r, dailyRate, bankAccount, r.lang as Lang);
  const ok  = await sendWhatsApp(r.phone, msg);

  if (ok) {
    await supabase.from('wa_booking_requests').update({
      status:        'payment_requested',
      daily_rate:    dailyRate,
      deposit_amount: dailyRate * 3,
    }).eq('id', requestId);

    const sess = await getSession(r.phone);
    await saveSession({ ...sess, state: 'payment_requested', requestId });
  }

  return ok;
}

// ── Confirm payment → request documents ──────────────────────────────────────

export async function confirmPaymentAndRequestDocs(requestId: string): Promise<boolean> {
  const { data: req } = await supabase
    .from('wa_booking_requests')
    .select('phone, lang')
    .eq('id', requestId)
    .single();

  if (!req) return false;
  const r = req as any;

  const ok = await sendWhatsApp(r.phone, buildDocsRequest(r.lang as Lang));

  if (ok) {
    await supabase.from('wa_booking_requests').update({
      status:          'docs_requested',
      deposit_paid:    true,
      deposit_paid_at: new Date().toISOString(),
    }).eq('id', requestId);

    const sess = await getSession(r.phone);
    await saveSession({ ...sess, state: 'docs_requested', requestId });
  }

  return ok;
}

// ── Final confirmation: create booking + calendar event ──────────────────────

export async function finalizeBooking(requestId: string, carId: string): Promise<boolean> {
  const { data: req } = await supabase
    .from('wa_booking_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (!req) return false;
  const r = req as any;

  if (!r.start_date || !r.end_date || !r.client_name) return false;

  const days      = Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(r.start_date).getTime()) / 86400000));
  const finalPrice = (r.daily_rate ?? 0) * days;

  // Create booking in Supabase
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      car_id:               carId,
      client_name:          r.client_name,
      client_phone:         r.phone,
      start_date:           r.start_date,
      end_date:             r.end_date,
      status:               'CONFIRMED',
      payment_status:       'PARTIAL',
      paid_amount:          r.deposit_amount ?? 0,
      final_price:          finalPrice,
      client_price_per_day: r.daily_rate,
      rented_by:            'Kouider',
      nb_days:              days,
      passport_expiry:      r.passport_expiry,
      notes:                [
        r.delivery_location ? `Livraison: ${r.delivery_location}` : '',
        r.return_location   ? `Retour: ${r.return_location}`      : '',
        r.flight_number     ? `Vol: ${r.flight_number} le ${r.flight_date} à ${r.arrival_time}` : '',
        r.notes             ? r.notes : '',
        `Source: WhatsApp`,
      ].filter(Boolean).join(' | '),
    })
    .select('id')
    .single();

  if (error || !booking) {
    console.error('[wa-flow] Failed to create booking:', error?.message);
    return false;
  }

  const bookingId = (booking as { id: string }).id;

  // Create Google Calendar event
  const flightInfo = r.flight_number ? `\nVol: ${r.flight_number} le ${r.flight_date} à ${r.arrival_time}` : '';
  const moneyInfo  = `\nTotal: ${finalPrice} DZD | Acompte payé: ${r.deposit_amount ?? 0} DZD | Reste: ${finalPrice - (r.deposit_amount ?? 0)} DZD`;

  try {
    const calNotes = [
      `Tél: ${r.phone}`, `Livraison: ${r.delivery_location ?? 'N/A'}`,
      `Retour: ${r.return_location ?? 'N/A'}`, flightInfo, moneyInfo,
      r.passport_number ? `Passeport: ${r.passport_number}` : '',
      r.nationality     ? `Nationalité: ${r.nationality}` : '',
    ].filter(Boolean).join('\n');
    await createCalendarEvent(bookingId, r.client_name, r.vehicle_wanted ?? 'Véhicule', r.start_date, r.end_date, calNotes);
  } catch { /* calendar not critical */ }

  // Update wa_booking_request + session
  await supabase.from('wa_booking_requests').update({
    status:     'confirmed',
    booking_id: bookingId,
  }).eq('id', requestId);

  const sess = await getSession(r.phone);
  await saveSession({ ...sess, state: 'confirmed', bookingId });

  // Notify Kouider
  emitProactive(
    `✅ Réservation créée — ${r.client_name}`,
    'info',
    `Réservation confirmée:\n👤 ${r.client_name}\n🚗 ${r.vehicle_wanted}\n📅 ${r.start_date} → ${r.end_date}\n💰 ${finalPrice} DZD (acompte ${r.deposit_amount ?? 0} DZD)\nAgenda + base de données mis à jour.`,
    'kouider',
  );

  // Send confirmation to client
  const clientMsg = r.lang === 'ar'
    ? `✅ تهانينا! تم تأكيد حجزك رسمياً.\n🚗 ${r.vehicle_wanted ?? 'Véhicule'}\n📅 من ${r.start_date} إلى ${r.end_date}\n📍 التسليم: ${r.delivery_location ?? 'N/A'}\nسنتواصل معك قبل الوصول. 🙏`
    : r.lang === 'en'
    ? `✅ Congratulations! Your booking is officially confirmed.\n🚗 ${r.vehicle_wanted ?? 'Vehicle'}\n📅 ${r.start_date} to ${r.end_date}\n📍 Delivery: ${r.delivery_location ?? 'N/A'}\nWe'll contact you before your arrival. 🙏`
    : `✅ Félicitations ! Votre réservation est officiellement confirmée.\n🚗 ${r.vehicle_wanted ?? 'Véhicule'}\n📅 Du ${r.start_date} au ${r.end_date}\n📍 Livraison : ${r.delivery_location ?? 'N/A'}\nNous vous contacterons avant votre arrivée. 🙏`;

  await sendWhatsApp(r.phone, clientMsg);

  return true;
}
