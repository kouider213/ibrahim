import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from './supabase.js';
import { updateProspect, type Prospect } from './prospects.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { autoCall } from '../notifications/auto-call.js';
import { kvGet, kvSet } from './app-store.js';

// « Je suis intéressé » : lien personnel (signé) dans le mail de démo → page publique où le commerçant dit QUAND il est
// joignable (texte libre + téléphone) → alerte Telegram/app (et appel) à Kouider, qui choisit lui-même la date.
// Plus aucun créneau de l'agenda ni « heure de Bruxelles » montré au client (Kouider 24/10 : c'est lui qui fixe, souvent en Belgique).
// Pas de compte, pas de mot de passe ; le lien ne marche que pour CE prospect.

const API = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
const secret = () => process.env['SESSION_SECRET'] ?? process.env['WEBHOOK_SECRET'] ?? 'dzaryx';
const sign = (id: string) => createHmac('sha256', secret()).update(`rdv:${id}`).digest('base64url').slice(0, 22);

export const rdvLink = (prospectId: string) => `${API()}/rdv/${prospectId}.${sign(prospectId)}`;

function verify(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f6f4f0;color:#1f2328;display:flex;justify-content:center;padding:24px 16px}
main{max-width:460px;width:100%}h1{font-size:1.45rem;margin:0 0 6px}p{line-height:1.5;color:#444}
label{display:block;margin:14px 0 6px;font-weight:600}textarea,input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #d9d4ca;border-radius:12px;font:inherit;background:#fff}
button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:12px;background:#0f766e;color:#fff;font-size:1rem;cursor:pointer}.ok{background:#ecfdf5;border:1px solid #10b981;border-radius:12px;padding:16px}
small{color:#777}</style></head><body><main>${inner}<p><small>FIK Sites — Kouider</small></p></main></body></html>`;
}

async function loadProspect(token: string): Promise<Prospect | null> {
  const id = verify(token);
  if (!id) return null;
  const { data } = await supabase.from('prospects').select('*').eq('id', id).maybeSingle();
  return (data as Prospect | null) ?? null;
}

const ASKED = (id: string) => `rdv:asked:${id}`;

/** GET /rdv/:token */
export async function rdvPage(token: string): Promise<{ status: number; html: string }> {
  const p = await loadProspect(token);
  if (!p) return { status: 404, html: page('Lien invalide', '<h1>Lien invalide</h1><p>Ce lien n\'est pas (ou plus) valable. Répondez simplement au mail reçu.</p>') };
  if (await kvGet(ASKED(p.id)).catch(() => null)) return { status: 200, html: page('Merci', `<div class="ok"><h1>✅ Merci, c'est noté</h1><p>Kouider vous recontacte très vite pour convenir d'un moment avec vous.</p></div><p>Une précision ? Répondez simplement au mail.</p>`) };
  return { status: 200, html: page('Être recontacté', `<h1>${esc(p.company)}</h1>
<p>Vous aimez la démo ? Dites-nous quand vous êtes joignable : Kouider vous recontacte pour en parler et créer votre vrai site. Sans engagement.</p>
<form method="post"><label for="dispo">Quand êtes-vous disponible ?</label><textarea id="dispo" name="dispo" rows="3" maxlength="400" required placeholder="Ex. : en semaine après 15 h, ou samedi matin"></textarea>
<label for="tel">Votre téléphone (ou WhatsApp)</label><input id="tel" name="tel" maxlength="40" value="${esc(p.phone ?? '')}">
<button type="submit">Envoyer</button></form>`) };
}

/** POST /rdv/:token (dispo, tel) */
export async function rdvBook(token: string, dispo: string, tel: string): Promise<{ status: number; html: string }> {
  const p = await loadProspect(token);
  if (!p) return rdvPage(token);
  if (await kvGet(ASKED(p.id)).catch(() => null)) return rdvPage(token);
  const when = dispo.replace(/\s+/g, ' ').trim().slice(0, 400);
  const phone = tel.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!when) return rdvPage(token);
  await kvSet(ASKED(p.id), '1', 60 * 86_400);   // d'abord : un double clic ne prévient pas deux fois
  await updateProspect(p.id, { status: 'interesse', replied_at: new Date().toISOString(),
    notes: [p.notes, `[${new Date().toISOString().slice(0, 10)}] Veut être recontacté — dispo : ${when}${phone ? ` · tél : ${phone}` : ''}`].filter(Boolean).join('\n') }).catch(() => {});
  const msg = `📅 ${p.company} veut un rendez-vous pour son site !\n🕒 Ses disponibilités : ${when}\n📞 ${phone || p.phone || '—'} · ✉️ ${p.email ?? '—'}\n\n` +
    `👉 Dis-moi quand TU peux (jour + heure d'Oran, appel ou visite) et je lui écris. Je ne lui ai donné aucune date.`;
  emitProactive(`${p.company} veut un rendez-vous — dis-moi quand tu peux.`, 'alert', msg, 'kouider', 'demarchage');
  await queueTelegramMessage(msg).catch(() => {});
  void autoCall(`rdv-asked:${p.id}`, `Bonne nouvelle : ${p.company} veut un rendez-vous pour son site. Ses disponibilités : ${when}. Dis-moi quand toi tu peux, et je leur écris.`, { level: 'normal' });
  return rdvPage(token);
}
