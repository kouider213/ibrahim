import { createHmac, timingSafeEqual } from 'crypto';
import { supabase } from './supabase.js';
import { updateProspect, type Prospect } from './prospects.js';
import { findFreeSlots, createPersonalCalendarEvent } from './google-calendar.js';
import { sendEmail } from './gmail.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { autoCall } from '../notifications/auto-call.js';
import { kvGet, kvSet } from './app-store.js';

// « Je veux ce site » : lien personnel (signé) dans le mail de démo → page publique avec les VRAIS créneaux libres de
// l'agenda de Kouider → 1 clic = rendez-vous dans l'agenda + mail de confirmation au commerçant + alerte (et appel) à
// Kouider. Pas de compte, pas de mot de passe ; le lien ne marche que pour CE prospect.

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
const fmt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f6f4f0;color:#1f2328;display:flex;justify-content:center;padding:24px 16px}
main{max-width:460px;width:100%}h1{font-size:1.45rem;margin:0 0 6px}p{line-height:1.5;color:#444}
.slot{display:block;width:100%;text-align:left;margin:10px 0;padding:14px 16px;border:1px solid #d9d4ca;border-radius:12px;background:#fff;font-size:1rem;cursor:pointer;text-transform:capitalize}
.slot:hover{border-color:#0f766e;background:#f0fdfa}.ok{background:#ecfdf5;border:1px solid #10b981;border-radius:12px;padding:16px}
small{color:#777}</style></head><body><main>${inner}<p><small>FIK Sites — Kouider</small></p></main></body></html>`;
}

async function loadProspect(token: string): Promise<Prospect | null> {
  const id = verify(token);
  if (!id) return null;
  const { data } = await supabase.from('prospects').select('*').eq('id', id).maybeSingle();
  return (data as Prospect | null) ?? null;
}

const BOOKED = (id: string) => `rdv:booked:${id}`;

/** GET /rdv/:token */
export async function rdvPage(token: string): Promise<{ status: number; html: string }> {
  const p = await loadProspect(token);
  if (!p) return { status: 404, html: page('Lien invalide', '<h1>Lien invalide</h1><p>Ce lien n\'est pas (ou plus) valable. Répondez simplement au mail reçu.</p>') };
  const booked = await kvGet(BOOKED(p.id)).catch(() => null);
  if (booked) return { status: 200, html: page('Rendez-vous confirmé', `<div class="ok"><h1>✅ C'est noté</h1><p>Votre rendez-vous est prévu le <b>${esc(fmt(booked))}</b> (heure de Bruxelles). Kouider vous appellera${p.phone ? ` au ${esc(p.phone)}` : ''}.</p></div><p>Besoin de changer ? Répondez simplement au mail.</p>`) };
  const slots = await findFreeSlots(6).catch(() => [] as string[]);
  if (!slots.length) return { status: 200, html: page('Rendez-vous', `<h1>${esc(p.company)}</h1><p>Aucun créneau n'est disponible en ligne pour le moment. Répondez simplement au mail avec vos disponibilités, Kouider vous recontacte très vite.</p>`) };
  return { status: 200, html: page('Choisir un rendez-vous', `<h1>${esc(p.company)}</h1>
<p>Choisissez un moment pour un court appel (30 min) avec Kouider : on regarde ensemble la démo et votre futur site. Sans engagement.</p>
<form method="post">${slots.map(s => `<button class="slot" name="slot" value="${esc(s)}">📅 ${esc(fmt(s))}</button>`).join('')}</form>
<p><small>Heures de Bruxelles. Aucun de ces moments ne convient ? Répondez au mail avec vos disponibilités.</small></p>`) };
}

/** POST /rdv/:token (slot) */
export async function rdvBook(token: string, slot: string): Promise<{ status: number; html: string }> {
  const p = await loadProspect(token);
  if (!p) return rdvPage(token);
  if (await kvGet(BOOKED(p.id)).catch(() => null)) return rdvPage(token);
  const free = await findFreeSlots(6).catch(() => [] as string[]);
  if (!free.includes(slot)) {
    const again = await rdvPage(token);
    return { status: 409, html: again.html.replace('<h1>', '<p style="color:#b91c1c">Ce créneau vient d\'être pris, choisissez-en un autre.</p><h1>') };
  }
  const end = new Date(new Date(slot).getTime() + 30 * 60_000).toISOString();
  await kvSet(BOOKED(p.id), slot, 60 * 86_400);   // d'abord : un double clic ne réserve pas deux fois
  const eventId = await createPersonalCalendarEvent(`📞 FIK Sites — ${p.company}`, slot, end,
    `Rendez-vous pris en ligne par ${p.company} (${p.city ?? ''}).\nTél : ${p.phone ?? '—'}\nE-mail : ${p.email ?? '—'}\nSujet : sa démo de site et la création du vrai site.`).catch(() => null);
  await updateProspect(p.id, { status: 'interesse', replied_at: new Date().toISOString(),
    notes: [p.notes, `[${new Date().toISOString().slice(0, 10)}] RDV pris en ligne : ${fmt(slot)}${eventId ? '' : ' (⚠️ pas ajouté à l\'agenda)'}`].filter(Boolean).join('\n') }).catch(() => {});
  if (p.email) {
    await sendEmail('pro', { to: p.email, subject: `Rendez-vous confirmé — ${p.company}`, fromName: 'Kouider - FIK Sites',
      body: `Bonjour,\n\nC'est noté : je vous appelle le ${fmt(slot)} (heure de Bruxelles)${p.phone ? ` au ${p.phone}` : ''}, pour regarder ensemble la démo et votre futur site.\n\nUn empêchement ? Répondez simplement à ce mail.\n\nKouider — FIK Sites` }).catch(() => {});
  }
  const msg = `📅 ${p.company} a pris rendez-vous en ligne : ${fmt(slot)} (heure de Bruxelles).\n📞 ${p.phone ?? '—'} · ✉️ ${p.email ?? '—'}\n` +
    `${eventId ? '✅ Ajouté à ton agenda.' : '⚠️ Pas ajouté à l\'agenda (Google Agenda injoignable) : note-le !'}\nIl a reçu un mail de confirmation.`;
  emitProactive(`${p.company} a pris rendez-vous : ${fmt(slot)}`, 'alert', msg, 'kouider', 'demarchage');
  await queueTelegramMessage(msg).catch(() => {});
  void autoCall(`rdv-booked:${p.id}`, `Bonne nouvelle : ${p.company} a pris rendez-vous avec toi pour son site, le ${fmt(slot)}. C'est dans ton agenda.`, { level: 'normal' });
  return rdvPage(token);
}
