"use strict";
/**
 * WhatsApp Language Detector
 * Détecte: français, arabe (MSA + darija), anglais
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = detectLanguage;
exports.getGreeting = getGreeting;
exports.getAvailabilityMessage = getAvailabilityMessage;
exports.getPriceMessage = getPriceMessage;
exports.getValidationPendingMessage = getValidationPendingMessage;
exports.getConfirmationMessage = getConfirmationMessage;
exports.getReminderMessage = getReminderMessage;
exports.getEndRentalMessage = getEndRentalMessage;
exports.getComplaintAckMessage = getComplaintAckMessage;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;
const FRENCH_WORDS = /\b(bonjour|bonsoir|salut|merci|voiture|louer|location|prix|disponible|réserver|réservation|combien|quand|comment|quel|madame|monsieur|svp|stp|besoin|voudrais|souhaite)\b/i;
const ENGLISH_WORDS = /\b(hello|hi|good|morning|evening|car|rent|rental|price|available|booking|reserve|how|what|when|please|thanks|thank you|want|need|would like)\b/i;
const DARIJA_WORDS = /\b(salam|wach|bghit|tswir|krahti|dyal|hna|labas|wakha|mzyan|chhal|kifach|wayn|ana|nta|nti|radi|kayn|baghit|hadi|hadak|chno|3ndek|3ndi|rani|bghit)\b/i;
function detectLanguage(text) {
    // Arabe (MSA ou darija script arabe)
    if (ARABIC_PATTERN.test(text))
        return 'ar';
    // Darija en caractères latins
    if (DARIJA_WORDS.test(text))
        return 'ar';
    // Français
    if (FRENCH_WORDS.test(text))
        return 'fr';
    // Anglais
    if (ENGLISH_WORDS.test(text))
        return 'en';
    // Défaut: français (clientèle algérienne)
    return 'fr';
}
function getGreeting(lang, name) {
    const n = name ? ` ${name}` : '';
    switch (lang) {
        case 'ar': return `السلام عليكم${n} 👋\nأهلاً بكم في AutoLux Oran — خدمة تأجير السيارات ⭐`;
        case 'en': return `Hello${n} 👋\nWelcome to AutoLux Oran — Premium Car Rental ⭐`;
        default: return `Bonjour${n} 👋\nBienvenue chez AutoLux Oran — Location de voitures ⭐`;
    }
}
function getAvailabilityMessage(lang) {
    switch (lang) {
        case 'ar': return '🚗 إليك قائمة السيارات المتاحة:';
        case 'en': return '🚗 Here are our available vehicles:';
        default: return '🚗 Voici nos véhicules disponibles:';
    }
}
function getPriceMessage(lang, car, price) {
    switch (lang) {
        case 'ar': return `💰 سعر ${car}: ${price}€ في اليوم`;
        case 'en': return `💰 ${car}: ${price}€/day`;
        default: return `💰 ${car}: ${price}€/jour`;
    }
}
function getValidationPendingMessage(lang) {
    switch (lang) {
        case 'ar': return '⏳ تم استلام طلبكم. سيتم تأكيد الحجز قريباً من طرف فريقنا.';
        case 'en': return '⏳ Your request has been received. Our team will confirm shortly.';
        default: return '⏳ Votre demande a bien été reçue. Notre équipe vous confirme très bientôt.';
    }
}
function getConfirmationMessage(lang, details) {
    const { car, startDate, endDate, price, days } = details;
    switch (lang) {
        case 'ar':
            return `✅ *تأكيد الحجز*\n\n🚗 السيارة: ${car}\n📅 من: ${startDate}\n📅 إلى: ${endDate}\n⏱️ المدة: ${days} أيام\n💰 المبلغ الإجمالي: ${price}€\n\nشكراً لثقتكم في AutoLux Oran 🙏`;
        case 'en':
            return `✅ *Booking Confirmed*\n\n🚗 Vehicle: ${car}\n📅 From: ${startDate}\n📅 To: ${endDate}\n⏱️ Duration: ${days} days\n💰 Total: ${price}€\n\nThank you for choosing AutoLux Oran 🙏`;
        default:
            return `✅ *Réservation Confirmée*\n\n🚗 Véhicule: ${car}\n📅 Du: ${startDate}\n📅 Au: ${endDate}\n⏱️ Durée: ${days} jours\n💰 Montant total: ${price}€\n\nMerci de votre confiance chez AutoLux Oran 🙏`;
    }
}
function getReminderMessage(lang, details) {
    const { car, startDate, clientName } = details;
    switch (lang) {
        case 'ar':
            return `⏰ تذكير — ${clientName}\n\nحجزكم غداً ${startDate} 🚗\nالسيارة: ${car}\n\nإذا كان لديكم أي سؤال، لا تترددوا في التواصل معنا.\nAutoLux Oran 🌟`;
        case 'en':
            return `⏰ Reminder — ${clientName}\n\nYour rental is tomorrow ${startDate} 🚗\nVehicle: ${car}\n\nDon't hesitate to contact us for any question.\nAutoLux Oran 🌟`;
        default:
            return `⏰ Rappel — ${clientName}\n\nVotre location commence demain ${startDate} 🚗\nVéhicule: ${car}\n\nN'hésitez pas à nous contacter pour toute question.\nAutoLux Oran 🌟`;
    }
}
function getEndRentalMessage(lang, details) {
    const { car, clientName, endDate } = details;
    switch (lang) {
        case 'ar':
            return `🏁 ${clientName}، تنتهي مدة استئجار ${car} اليوم ${endDate}.\n\nنأمل أن تكون تجربتكم ممتازة 😊\nشكراً لاختياركم AutoLux Oran — نراكم قريباً! 🌟`;
        case 'en':
            return `🏁 ${clientName}, your rental for ${car} ends today ${endDate}.\n\nWe hope you had a great experience 😊\nThank you for choosing AutoLux Oran — see you soon! 🌟`;
        default:
            return `🏁 ${clientName}, votre location de ${car} se termine aujourd'hui ${endDate}.\n\nNous espérons que votre expérience était excellente 😊\nMerci de choisir AutoLux Oran — À bientôt! 🌟`;
    }
}
function getComplaintAckMessage(lang) {
    switch (lang) {
        case 'ar': return '🙏 شكراً على تواصلكم. لقد تم استلام رسالتكم وسيرد عليكم أحد أعضاء فريقنا في أقرب وقت ممكن.';
        case 'en': return '🙏 Thank you for reaching out. Your message has been received and a team member will respond shortly.';
        default: return '🙏 Merci de nous avoir contacté. Votre message a été reçu et un membre de notre équipe vous répondra dans les plus brefs délais.';
    }
}
//# sourceMappingURL=language-detector.js.map