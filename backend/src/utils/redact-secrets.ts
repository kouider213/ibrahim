/**
 * Masque les secrets dans un texte avant de le résumer ou de le garder en mémoire
 * (veille 22/11 : OpenClaw 2026.10.33 « compaction redacts credentials in quoted summaries »).
 *
 * Un code dicté au téléphone (« le code c'est 4821 »), un mot de passe, un IBAN, une carte bancaire
 * ou une clé d'API ne doit jamais finir dans la mémoire des appels (30 jours) ni dans les notes.
 * Les numéros de téléphone, montants, dates et noms ne sont PAS touchés (utiles pour les clients).
 */

const MASK = '[masqué]';

// Formes connues de clés / jetons (seulement la forme : aucune vraie valeur ici)
const KEY_SHAPES: RegExp[] = [
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,           // Anthropic / OpenAI
  /\bAIza[0-9A-Za-z_-]{30,}/g,                         // Google
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,                     // GitHub
  /\bhf_[A-Za-z0-9]{30,}/g,                            // Hugging Face
  /\br8_[A-Za-z0-9]{30,}/g,                            // Replicate
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,                   // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                             // AWS
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,   // JWT
  /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/g,                  // bot Telegram
];

// « mot de passe : xxx », « le code c'est 4821 », « code PIN 1234 », « OTP 552 901 »
const LABELLED = new RegExp(
  '\\b(mots? de passe|mdp|password|passcode|pass|code(?: pin| secret| wifi| wi-fi| de (?:vérification|verification|confirmation|sécurité|securite|validation|déverrouillage|deverrouillage|la carte|l\'alarme|accès|acces)| d\'accès| d\'acces| otp| sms)?|pin|otp|cvv|cvc|cryptogramme)'
  + '(\\s*(?:\\:|=|est|c\'est|c’est|:\\s*c\'est)?\\s*)'
  + '((?=[^\\s,;.!?]*\\d)[^\\s,;!?]{3,}(?:[ \\-]\\d{2,4}){0,3}|[A-Za-z0-9@#$%&*_\\-]{6,}(?=[\\s,;.!?]|$))',
  'gi',
);

const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;

function luhnOk(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// Mots qui suivent « code » sans être un secret (« code de la route », « code promo », « code postal »)
const NOT_SECRET = /^(?:de|du|la|le|les|des|promo|postal|source|route|barre|qr|client|couleur|vestimentaire|civil|pénal|penal|erreur)$/i;

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of KEY_SHAPES) out = out.replace(re, MASK);
  out = out.replace(IBAN, m => (/\d{6,}/.test(m.replace(/ /g, '')) ? '[IBAN masqué]' : m));
  out = out.replace(CARD, m => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnOk(digits) ? '[carte masquée]' : m;
  });
  out = out.replace(LABELLED, (all, label: string, sep: string, value: string) => {
    if (NOT_SECRET.test(value) || value === MASK) return all;
    // « pass Navigo », « code 2 » (quantité) : un secret a au moins 4 caractères dont un chiffre, ou 6+ caractères
    if (!/\d/.test(value) && value.length < 6) return all;
    if (/^\d{1,3}$/.test(value)) return all;
    if (/^pass$/i.test(label) && !/\d/.test(value)) return all;
    return `${label}${sep}${MASK}`;
  });
  return out;
}
