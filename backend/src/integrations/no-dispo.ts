// 26/11 Kouider (capture WhatsApp : client « Chendkom les voitures disponibles ?? », réponse proposée = « nos véhicules… ») :
// « faut jamais qu'il dise qu'il a un véhicule de dispo, moi-même je dois demander à chaque fois à Houari ;
//   à partir du 15 décembre on est presque au complet ».
// → AUCUNE réponse client ne dit / laisse croire qu'une voiture est libre. On dit qu'on vérifie et qu'on revient vers lui.
//   La base (check_car_availability…) n'est PAS la vérité : seul Houari sait. Houari n'est jamais nommé au client.
import type { ClientLang } from './client-lang.js';
import { kvGet, kvSet } from './app-store.js';

export const NO_DISPO_RULE = `RÈGLE ABSOLUE DE KOUIDER (26/11) — DISPONIBILITÉS : tu ne dis JAMAIS qu'une voiture est disponible, libre, qu'il en reste, « on a », « voici nos véhicules (disponibles) », « kayen », et tu ne donnes AUCUNE liste de voitures en réponse à « quelles voitures sont dispo ? ». Même si un outil dit qu'une voiture est libre : la base n'est pas fiable, Kouider doit vérifier lui-même à chaque fois. Quand le client a donné ses dates et son âge, la réponse dit simplement qu'on vérifie la disponibilité pour ses dates et qu'on revient vers lui très vite (sans nommer personne). À partir du 15 décembre et pendant les fêtes on est PRESQUE COMPLET : pour ces dates tu peux dire honnêtement que c'est une période très demandée et qu'on vérifie, jamais promettre.`;

/** La réponse laisse-t-elle croire qu'une voiture est libre ? (« on vérifie la dispo » = OK) */
export function claimsAvailability(reply: string): boolean {
  const t = reply.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    // formulations de VÉRIFICATION, autorisées
    .replace(/(verifi\w*|regard\w*|check\w*|nchouf\w*|nverif\w*|confirm\w*|voir)\s+(la |les |l'|nos |notre )?(dispo\w*|availability)/g, ' ')
    .replace(/wa[cs]h\s+kayn?a?/g, ' ')
    .replace(/(si|s'il|whether|if)\s+(\w+\s+){0,4}(dispo\w*|libre|available|kayn?a?)/g, ' ');
  return /\b(voici|voila|ci-dessous|here (are|is))\b[^.!?\n]{0,25}\b(dispo\w*|availabilit\w*)/.test(t)   // 27/11 « Voici nos disponibilités… »
    || /\bnos dispo\w*\b[^.!?\n]{0,60}(:|€)/.test(t)
    || /\b(voici|voila|ci-dessous|here (are|is))\b[^.!?\n]{0,50}\b(vehicules?|voitures?|cars?|modeles?|tomobil\w*)\b/.test(t)
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

// ── 26/11 (suite) : quand KOUIDER confirme une dispo, Dzaryx peut la dire ─────────────────────────────────────
// « si moi je lui dis cette voiture est dispo, Dzaryx le sait et répond avec ça ; si je confirme que j'ai des voitures,
//   il demande au client s'il a des préférences ». Ses mots exacts sont gardés 72 h (kv dispo:confirmed).

const KEY = 'dispo:confirmed';
const TTL_MS = 72 * 3600_000;
export interface DispoConfirm { text: string; chat?: string; at: string; full?: boolean }

async function load(): Promise<DispoConfirm[]> {
  try { return (JSON.parse((await kvGet(KEY)) ?? '[]') as DispoConfirm[]).filter(c => Date.now() - Date.parse(c.at) < TTL_MS); } catch { return []; }
}

/** Message de Kouider = confirmation de dispo ('yes'), « c'est complet » ('full'), sinon null. */
export function dispoWords(msg: string): 'yes' | 'full' | null {
  const t = msg.toLowerCase();
  if (/complet|plus rien|rien de (dispo|libre)|aucune? (voiture|dispo)|pas de (dispo|voiture)|(est|sont) (pas|plus) (dispo|libre)|makach|ma kaynach|ما كاين/.test(t)) return 'full';
  if (/\b(dispo\w*|libres?|kayn?a?|available)\b|\b(on a|j'ai|il y a|y a)\b[^.?!]{0,30}\b(voiture|clio|duster|creta|500x|polo|picanto|i10|sandero|logan|tomobil|v[ée]hicule)/.test(t)) return 'yes';
  return null;
}

export async function confirmDispo(text: string, chat?: string): Promise<void> {
  const all = await load();
  all.unshift({ text: text.trim().slice(0, 400), chat: chat || undefined, at: new Date().toISOString(), full: dispoWords(text) === 'full' || undefined });
  await kvSet(KEY, JSON.stringify(all.slice(0, 30)), 72 * 3600);
}

/** Confirmations utiles pour ce client : les siennes + les générales (« la Clio est dispo du 18 au 22 »). */
export async function confirmationsFor(chat?: string): Promise<DispoConfirm[]> {
  const c = (chat ?? '').toLowerCase();
  return (await load()).filter(x => !x.chat || (c && x.chat.toLowerCase() === c));
}

/** Règle à mettre dans le prompt : la règle absolue + ce que Kouider a confirmé lui-même. */
export async function noDispoRule(chat?: string): Promise<string> {
  const conf = await confirmationsFor(chat);
  if (!conf.length) return NO_DISPO_RULE;
  return `${NO_DISPO_RULE}
EXCEPTION — CE QUE KOUIDER A CONFIRMÉ LUI-MÊME (seule source valable, ses mots exacts, plus récent d'abord) :
${conf.map(x => `• ${new Date(x.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${x.chat ? ` (pour ${x.chat})` : ' (général)'} : « ${x.text} »`).join('\n')}
→ Si ça couvre les dates du client : s'il a cité des voitures précises, dis au client que CES voitures-là sont disponibles pour ses dates (rien d'autre, aucune autre voiture) et demande laquelle il préfère ; s'il a juste dit qu'il y a des voitures, dis qu'on a de la disponibilité et demande ses PRÉFÉRENCES (petite citadine ou SUV, boîte manuelle ou automatique, nombre de personnes et de valises). S'il a dit que c'est complet : excuse-toi poliment, c'est complet sur ces dates. Si ça ne couvre pas ses dates : on vérifie et on revient vers lui.`;
}

/** Kouider a confirmé quelque chose pour ce client → le filtre « dispo promise » ne s'applique plus. */
export async function hasConfirmation(chat?: string): Promise<boolean> {
  return (await confirmationsFor(chat)).some(x => !x.full);
}

/** Kouider répond à une réponse proposée par « la Clio est dispo » / « j'ai des voitures » / « c'est complet » :
 *  on retient et on réécrit la réponse au client avec ça. */
export async function draftFromConfirmation(chat: string, clientText: string, convo: string, kouider: string): Promise<string> {
  await confirmDispo(kouider, chat);
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  const CL = await import('./client-lang.js');
  const ng = await import('./night-guard.js');
  const info = await ng.publicInfo().catch(() => '');
  const system = `Tu écris la réponse (WhatsApp ou TikTok) de FIK Conciergerie (location de voitures à Oran) à un client, à la place de Kouider qui la relira.
Courte (1 à 3 phrases), chaleureuse, ne redemande pas ce que le client a déjà donné.
${CL.langRule(clientText)}
${await noDispoRule(chat)}
${CL.detectClientLang(clientText) === 'darija_latin' ? `Exemples de BONNE darija d'Oran en lettres latines (jamais de lettres arabes mélangées, jamais d'anglais) : « Saha, men 18 hata 22 décembre 3andna la Clio w la Creta disponibles 👍 Wach t7eb fihoum ? » · « Saha, 3andna de la dispo l les dates ta3ek 👍 Wach t7eb : petite citadine wela SUV, boîte manuelle wela automatique ? Chhal men personne w chhal men valise ? » · « Smahli khouya, malheureusement c'est complet men 18 hata 22 décembre. »` : ''}
Prix : seulement ceux écrits dans les infos ci-dessous, sinon n'en donne pas. Ne cite jamais Houari ni la Belgique.
INFOS FIK :
${info.slice(0, 5000)}
Réponds UNIQUEMENT avec le texte du message.`;
  const r = await runReadOnlyAgent(`Discussion avec « ${chat} » :\n${(convo || clientText).slice(-2500)}\n\nKouider vient de me dire : « ${kouider} ». Écris la réponse au client.`,
    { system, sessionId: 'wa_dispo_ok', maxRounds: 1, maxTokens: 400, quality: true });
  let out = r.text.trim().replace(/^["«]\s*|\s*["»]$/g, '').slice(0, 700);
  if (out && clientText && !CL.replyMatches(clientText, out)) out = await CL.rewriteInLang(out, clientText).catch(() => out);
  return out;
}

/** Outil du cerveau : Kouider dit à Dzaryx ce qui est dispo (ou complet), même sans client en attente. */
export async function dispoTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'list');
  if (a === 'set') {
    const text = String(input['text'] ?? '').trim();
    if (!text) return '❌ Dis-moi ce qui est dispo (ses mots exacts dans text).';
    await confirmDispo(text, input['chat'] ? String(input['chat']) : undefined);
    return `✅ Retenu 72 h${input['chat'] ? ` pour ${input['chat']}` : ''} : « ${text} ». Les prochaines réponses aux clients s'en serviront (et seulement de ça).`;
  }
  if (a === 'clear') { await kvSet(KEY, '[]', 60); return '✅ Plus aucune dispo confirmée : Dzaryx dit de nouveau « on vérifie et on revient vers vous ».'; }
  const all = await load();
  return all.length ? `Dispos confirmées par toi (72 h) :\n${all.map(x => `• ${x.chat ? `${x.chat} : ` : ''}« ${x.text} »`).join('\n')}` : 'Aucune dispo confirmée : Dzaryx répond « on vérifie et on revient vers vous ».';
}
