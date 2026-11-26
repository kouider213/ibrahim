// 26/11 Kouider : un client écrit « 18 hata 22 décembre » (darija en lettres latines) et Dzaryx a proposé une réponse
// en français. Règle : on répond TOUJOURS comme le client écrit — darija en lettres latines → darija en lettres latines,
// lettres arabes → lettres arabes, français → français, anglais → anglais. Darija d'Oran, jamais marocaine.

export type ClientLang = 'darija_latin' | 'darija_ar' | 'arabe' | 'fr' | 'en';

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// mots darija courants écrits en lettres latines (arabizi)
const DARIJA_LATIN = /\b(hata|hatta|wach|wech|wesh|kayen|kayn|kayna|makach|makanch|nheb|nhab|nhebb|habit|bghit|chhal|ch?hal|bch?al|9adech|qadech|kadech|bezaf|bzaf|rani|raha|rah|rak|raki|ana|nta|nti|ntouma|khouya|khoya|kho|sahbi|sahbe|wela|wala|walla|kima|kifach|kifeh|wakteh|waqtach|wa9tach|mlih|mliha|labas|lbas|nchallah|inchallah|insha?allah|hamdoullah|hamdolah|sah|saha|yaatik|ya3tik|saha ftorek|tomobil|tonobil|loto|lwalid|lyoum|ghodwa|ghedwa|elyoum|nkri|nekri|kra|kiraa?|lkra|chi|chwiya|chouia|dork|drok|dorka|bach|besh|mazal|ndirou|ndir|tdir|yji|tji|nji|njib|n?jibha|aeroport|matar|lmatar|smahli|smahlia|khalas|khlas|jma3a|3la|3lik|3andek|3andi|andek|andi|m3a|ma3a|wahed|wahda|zouj|tlata|yamat|iyam|ayam|lyam|sbah|lil|l3id|el3id)\b/;
const DIGIT_WORD = /\b[a-z]+[2379][a-z]+\b|\b[2379](?!eme\b|er\b|e\b)[a-z]{3,}\b/;   // 3andi, ya3tik, 9adech, m3a
const ARABIC = /[؀-ۿ]/;
const DARIJA_AR = /(واش|راني|كاين|بزاف|نحب|شحال|قداش|حتى|ديالي|تاعي|تاع|غدوة|ضرك|دروك|بلاك|مازال|نكري|طوموبيل|كيفاش|وقتاش|خويا|صحا|يعطيك)/;
const ENGLISH = /\b(hello|hi|please|price|available|how much|car|rent|rental|days?|thanks|thank you|airport|i want|i need|book|booking)\b/;
const FRENCH = /\b(bonjour|bonsoir|salut|je|vous|voiture|prix|disponible|merci|location|jours?|svp|s'il|combien|est-ce|pour|avec|aeroport)\b/;

/** Langue du client d'après SES messages (le plus récent compte le plus). */
export function detectClientLang(clientText: string): ClientLang {
  const raw = clientText.trim();
  if (!raw) return 'fr';
  if (ARABIC.test(raw)) {
    const ar = (raw.match(/[؀-ۿ]/g) ?? []).length, lat = (raw.match(/[a-zA-Z]/g) ?? []).length;
    if (ar >= lat) return DARIJA_AR.test(raw) ? 'darija_ar' : 'arabe';
  }
  const t = strip(raw);
  const dz = (t.match(new RegExp(DARIJA_LATIN.source, 'g')) ?? []).length + (DIGIT_WORD.test(t) ? 1 : 0);
  const fr = (t.match(new RegExp(FRENCH.source, 'g')) ?? []).length;
  const en = (t.match(new RegExp(ENGLISH.source, 'g')) ?? []).length;
  if (dz > 0 && dz >= fr) return 'darija_latin';
  if (en > fr && en > 0) return 'en';
  return 'fr';
}

export function langLabel(l: ClientLang): string {
  return {
    darija_latin: 'darija algérienne d\'Oran écrite en LETTRES LATINES (comme le client : « hata », « wach », « rani »…)',
    darija_ar: 'darija algérienne d\'Oran écrite en lettres arabes',
    arabe: 'arabe',
    fr: 'français',
    en: 'anglais',
  }[l];
}

/** Consigne à ajouter au prompt d'une réponse client. */
export function langRule(clientText: string): string {
  const l = detectClientLang(clientText);
  return `LANGUE OBLIGATOIRE DE LA RÉPONSE : ${langLabel(l)}. Le client écrit ainsi, tu réponds EXACTEMENT de la même façon (même langue, même alphabet). ` +
    (l.startsWith('darija') ? DARIJA_GUIDE(l) : '');
}

/** La réponse proposée est-elle dans la langue du client ? (sinon on la réécrit) */
export function replyMatches(clientText: string, reply: string): boolean {
  const want = detectClientLang(clientText);
  const got = detectClientLang(reply);
  if (want === got) return true;
  if (want === 'darija_ar' || want === 'arabe') return ARABIC.test(reply);
  if (want === 'darija_latin') return got === 'darija_latin';
  if (want === 'fr') return got === 'fr';
  return got === 'en';
}

/** Phrase « dates + âge » dans la langue du client (règle du 01/11). */
export function askDatesAge(l: ClientLang): string {
  return {
    darija_latin: 'Bach nchoufoulek, a3tina les dates (men wakteh l wakteh) w l\'âge ta3 le conducteur svp.',
    darija_ar: 'باش نشوفولك، عطينا التواريخ (من وقتاش لوقتاش) وعمر السائق من فضلك.',
    arabe: 'للتحقق، من فضلك أرسل لنا التواريخ (البداية والنهاية) وعمر السائق.',
    fr: 'Pour vérifier, pouvez-vous m\'indiquer vos dates (début et fin) et l\'âge du conducteur ?',
    en: 'To check, could you send us your dates (start and end) and the driver\'s age?',
  }[l];
}

const DARIJA_GUIDE = (l: ClientLang) => `Darija algérienne d'ORAN, jamais marocaine : INTERDIT « dial / dyal / dialna », « bghit », « wakha », « daba », « ghadi » ; on dit « ta3 / taa3 », « nheb », « saha / mlih », « dork », « rah / rani ». Les mots techniques restent en français comme à Oran (les dates, l'âge, le conducteur, le permis, l'assurance, l'aéroport, réserver). ` +
  (l === 'darija_latin'
    ? `Exemples de bon style : « Saha, c'est noté men 18 hata 22 décembre 👍 Chhal 3andou l'âge le conducteur svp ? L'assurance taa3na tetlab 35 ans minimum. » · « Salam khouya, a3tini les dates w nchoufoulek wach kayen. » · « Ok, nrej3oulek tout de suite. » `
    : `Exemple : « صحا، سجلنا من 18 حتى 22 ديسمبر 👍 قداش عمر السائق من فضلك؟ التأمين تاعنا يطلب 35 سنة على الأقل. » `);

/** Réécrit une réponse proposée dans la langue / l'alphabet du client (même fond, rien d'ajouté). */
export async function rewriteInLang(reply: string, clientText: string, force?: ClientLang): Promise<string> {
  const l = force ?? detectClientLang(clientText);
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  const r = await runReadOnlyAgent(`Message du client : « ${clientText.slice(-600)} »\nRéponse à réécrire : « ${reply} »`, {
    sessionId: 'client_lang', maxRounds: 1, maxTokens: 500,
    system: `Tu réécris la réponse de FIK Conciergerie (location de voitures à Oran) en ${langLabel(l)}, comme le client écrit. ` +
      `Même sens exact, mêmes infos (dates, âge, conditions), rien d'ajouté, rien d'inventé, poli et court. ` +
      (l.startsWith('darija') ? DARIJA_GUIDE(l) : '') +
      'Réponds UNIQUEMENT avec le texte réécrit.',
  });
  const t = String(r.text ?? '').trim().replace(/^[«"“]\s*|\s*[»"”]$/g, '');
  const moroccan = /\b(d[iy]al\w*|bghit|wakha|daba|bzzaf|kanbghi|ghadi|hna\s+f)\b|ديال|غادي|واخا|دابا/i.test(t);
  const ok = force ? (force === 'darija_ar' || force === 'arabe' ? ARABIC.test(t) : detectClientLang(t) === force) : replyMatches(clientText, t);
  return t && !moroccan && t.length < reply.length * 3 + 200 && ok ? t : reply;
}

/** « écris-la en darija / en arabe / en français / comme lui » → la langue voulue (null = pas une demande de langue). */
export function askedLang(message: string, clientText: string): ClientLang | null {
  const m = strip(message);
  if (m.length > 80 || !/\b(ecri[st]?|mets?|met|change|traduis|reecri[st]?|fais|en|reponds?)\b/.test(m)) return null;
  const clientAr = ARABIC.test(clientText);
  if (/\b(darija|derja|dardja|dialecte|algerien)\b/.test(m)) return /lettres? arabes?|en arabe/.test(m) || clientAr ? 'darija_ar' : 'darija_latin';
  if (/\b(comme (lui|elle|eux|le client)|sa (langue|facon)|meme langue)\b/.test(m)) return detectClientLang(clientText);
  if (/\ben arabe\b/.test(m)) return 'arabe';
  if (/\ben (francais|fr)\b/.test(m)) return 'fr';
  if (/\ben anglais\b/.test(m)) return 'en';
  return null;
}

/** 26/11 Kouider : « il me traduit pas le message » (TikTok en arabe). Traduction française du message du client et/ou
 *  de la réponse proposée quand ils ne sont pas en français. Champs vides = déjà en français. */
export async function frTranslations(client: string, reply = ''): Promise<{ client: string; reply: string }> {
  const needC = !!client.trim() && detectClientLang(client) !== 'fr';
  const needR = !!reply.trim() && detectClientLang(reply) !== 'fr';
  if (!needC && !needR) return { client: '', reply: '' };
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  const r = await runReadOnlyAgent(
    `${needC ? `MESSAGE DU CLIENT :\n${client.slice(0, 1200)}\n\n` : ''}${needR ? `RÉPONSE PROPOSÉE :\n${reply.slice(0, 1200)}` : ''}`,
    { sessionId: 'client_lang_fr', maxRounds: 1, maxTokens: 600,
      system: 'Traduis fidèlement en français simple (darija algérienne, arabe ou anglais → français). Ne réponds pas au message, traduis seulement. Réponds UNIQUEMENT en JSON : {"client":"traduction du message du client ou vide","reply":"traduction de la réponse proposée ou vide"}' });
  try {
    const t = String(r.text ?? ''); const o = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) as { client?: string; reply?: string };
    return { client: needC ? String(o.client ?? '').trim() : '', reply: needR ? String(o.reply ?? '').trim() : '' };
  } catch { return { client: '', reply: '' }; }
}

/** Lignes à coller sous le message Telegram (vide si tout est en français). */
export async function frLines(client: string, reply = '', clientAlready = ''): Promise<{ client: string; reply: string }> {
  const t = await frTranslations(clientAlready ? '' : client, reply).catch(() => ({ client: '', reply: '' }));
  return { client: t.client ? `🇫🇷 Traduction : ${t.client}\n` : '', reply: t.reply ? `🇫🇷 En français : ${t.reply}\n` : '' };
}
