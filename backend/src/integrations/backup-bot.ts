// 26/11 — Dzaryx de SECOURS par le bot des notifs FIK (Kouider : « fais-le », après la panne du VPS du 25/11, 11 h sans Telegram).
// Le bot vit avec le site (Vercel) : il marche même quand le VPS (tgcall) est tombé. Texte seulement (pas d'appel ni de vocal).
// Message → site /api/telegram-notif → POST /api/jarvis/backup-chat → backupTurn → réponse par /api/dzaryx-buttons (sans bouton).

/** Envoie du texte par le bot des notifs FIK (coupé en morceaux de 3 500 caractères). */
export async function sendBackupText(text: string): Promise<boolean> {
  const token = process.env['INTERNAL_API_TOKEN'];
  if (!token) return false;
  let ok = true;
  for (let i = 0; i < text.length; i += 3500) {
    const r = await fetch('https://fikconciergerie.com/api/dzaryx-buttons', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ text: text.slice(i, i + 3500) }), signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    ok = ok && !!r?.ok;
  }
  return ok;
}

/** Un tour de conversation complet (mêmes outils, même mémoire que Telegram), réponse renvoyée par le bot. */
export async function backupTurn(text: string): Promise<void> {
  const port = process.env['PORT'] || '3000';
  const r = await fetch(`http://127.0.0.1:${port}/api/call/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env['PC_AGENT_TOKEN'] ?? ''}` },
    body: JSON.stringify({ message: text, channel: 'message', textOnly: true, actor: 'kouider' }),
    signal: AbortSignal.timeout(240_000),
  }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }) as unknown as Response);
  const j = await r.json().catch(() => ({})) as { text?: string; error?: string };
  const reply = (j.text ?? '').replace(/\*\*/g, '').replace(/^#{1,4}\s*/gm, '').trim();
  await sendBackupText(reply || `❌ Je n'ai pas pu répondre (${j.error ?? r.status}). Réessaie dans un moment.`);
}
