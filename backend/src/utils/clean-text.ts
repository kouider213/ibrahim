// Nettoyage des réponses des cerveaux gratuits (Qwen, DeepSeek, Nemotron…) : ils laissent parfois
// passer leur raisonnement (<think>…</think>) ou des caractères chinois au milieu du français
// (29/10, brief du matin : « soixante-qu十四 »). Arabe/darija et emojis restent intacts.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯＀-｠]+/g;

export function cleanModelText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(CJK, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
