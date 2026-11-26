// 26/11 Kouider (capture WhatsApp : client « Chendkom les voitures disponibles ?? », réponse proposée = « nos véhicules… ») :
// « faut jamais qu'il dise qu'il a un véhicule de dispo, moi-même je dois demander à chaque fois à Houari ;
//   à partir du 15 décembre on est presque au complet ».
// → AUCUNE réponse client ne dit / laisse croire qu'une voiture est libre. On dit qu'on vérifie et qu'on revient vers lui.
//   La base (check_car_availability…) n'est PAS la vérité : seul Houari sait. Houari n'est jamais nommé au client.
import type { ClientLang } from './client-lang.js';

export const NO_DISPO_RULE = `RÈGLE ABSOLUE DE KOUIDER (26/11) — DISPONIBILITÉS : tu ne dis JAMAIS qu'une voiture est disponible, libre, qu'il en reste, « on a », « voici nos véhicules (disponibles) », « kayen », et tu ne donnes AUCUNE liste de voitures en réponse à « quelles voitures sont dispo ? ». Même si un outil dit qu'une voiture est libre : la base n'est pas fiable, Kouider doit vérifier lui-même à chaque fois. Quand le client a donné ses dates et son âge, la réponse dit simplement qu'on vérifie la disponibilité pour ses dates et qu'on revient vers lui très vite (sans nommer personne). À partir du 15 décembre et pendant les fêtes on est PRESQUE COMPLET : pour ces dates tu peux dire honnêtement que c'est une période très demandée et qu'on vérifie, jamais promettre.`;

/** La réponse laisse-t-elle croire qu'une voiture est libre ? (« on vérifie la dispo » = OK) */
export function claimsAvailability(reply: string): boolean {
  const t = reply.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    // formulations de VÉRIFICATION, autorisées
    .replace(/(verifi\w*|regard\w*|check\w*|nchouf\w*|nverif\w*|confirm\w*|voir)\s+(la |les |l')?(dispo\w*|availability)/g, ' ')
    .replace(/wa[cs]h\s+kayn?a?/g, ' ')
    .replace(/(si|s'il|whether|if)\s+(\w+\s+){0,4}(dispo\w*|libre|available|kayn?a?)/g, ' ');
  return /\b(voici|voila|ci-dessous|here (are|is))\b[^.!?\n]{0,50}\b(vehicules?|voitures?|cars?|modeles?|tomobil\w*)\b/.test(t)
    || /\bnos (vehicules|voitures|modeles)\b[^.!?\n]{0,30}\b(dispo\w*|libres?)\b/.test(t)
    || /\b(dispo\w*|libres?|available)\s*:/.test(t)
    || /\b(est|sont|reste|restent|encore|toujours|is|are|still)\s+(encore\s+|toujours\s+)?(dispo\w*|libres?|available)\b/.test(t)
    || /\bil (nous )?reste\b[^.!?\n]{0,25}\b(vehicule|voiture|place)/.test(t)
    || /\b(on a|nous avons|j'ai|3andna|andna|kayen|kayna)\b[^.!?\n]{0,40}\b(vehicules?|voitures?|tomobil\w*|clio|duster|creta|500x|polo|picanto|i10|sandero|logan)\b/.test(t)
    || /(متوفر|متاحة|متاح|كاين[ةه]?\s+(طوموبيل|سيار)|عندنا\s+(طوموبيل|سيار))/.test(reply);
}

/** Réponse sûre dans la langue du client : on vérifie, on revient vers lui (+ période chargée si fêtes). */
export function checkingText(l: ClientLang, clientText = ''): string {
  const busy = /d[ée]c(embre)?\b|\b1[5-9]\s*\/\s*12|\b[23]\d\s*\/\s*12|janv|ديسمبر|جانفي|يناير|december|january|r[ée]veillon|f[êe]tes/i.test(clientText);
  return {
    darija_latin: `Saha, c'est noté 👍 ${busy ? 'Had la période rahi bezaf demandée, ' : ''}nverifyiw la dispo l les dates ta3ek w nrej3oulek au plus vite inchallah.`,
    darija_ar: `صحا، سجلنا 👍 ${busy ? 'هاد الفترة راهي مطلوبة بزاف، ' : ''}نشوفو الديسپو على التواريخ تاعك ونرجعولك في أقرب وقت إن شاء الله.`,
    arabe: `شكرا، تم التسجيل 👍 ${busy ? 'هذه الفترة مطلوبة جدا، ' : ''}سنتحقق من التوفر في تواريخك ونعود إليك في أقرب وقت.`,
    fr: `C'est noté, merci 👍 ${busy ? 'C\'est une période très demandée, ' : ''}nous vérifions la disponibilité pour vos dates et revenons vers vous très vite.`,
    en: `Noted, thank you 👍 ${busy ? 'It\'s a very busy period, ' : ''}we're checking availability for your dates and will get back to you very soon.`,
  }[l];
}
