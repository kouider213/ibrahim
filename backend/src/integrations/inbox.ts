// BOÎTE DE RÉCEPTION de la page Aujourd'hui (27/11/2026, Kouider : « quand il m'affiche les trucs comme pour TikTok, je dois
// pouvoir interagir : accepter, refuser, répondre… pour WhatsApp aussi et tout ce qui est possible »).
// Un seul flux : messages WhatsApp avec réponse prête, demandes WhatsApp / TikTok sans réponse, commentaires TikTok,
// relances du matin, réservations du site en attente, demandes du site. Chaque carte a ses boutons (envoyer, accepter, refuser,
// réécrire, traduire, vocal, plus tard, conclu / perdu…). Tout ce qui part chez un client part SEULEMENT sur son appui « Envoyer ».
// État (plus tard, rangé, notes, stats du jour) : app_kv inbox:state.
import { kvJson, kvPut, ai } from './ai-util.js';
import { supabase } from './supabase.js';
import * as CL from './client-lang.js';
import * as ND from './no-dispo.js';
import { listWaDemandes, markDemande, WA_CLOSED, type Channel } from './wa-demandes.js';

export type InboxKind = 'wa' | 'tt' | 'ttc' | 'rel' | 'booking' | 'lead';
export interface InboxItem {
  id: string; kind: InboxKind; sub?: string;           // sub : type de relance (wa / panier / prolong / tt)
  channel: 'whatsapp' | 'tiktok' | 'site';
  name: string; chat?: string; phone?: string | null;  // chat = nom de la discussion (WhatsApp / TikTok)
  text: string; draft?: string; why?: string; meta?: string; video?: string;
  at: string; flags: Array<{ icon: string; label: string; tone: 'bad' | 'warn' | 'ok' | 'info' }>;
  lang: string; prio: number; ask?: boolean; count?: number; note?: string;
  actions: string[];
}
interface DayStats { sent: number; accepted: number; refused: number; waitMin: number; waitN: number; voice: number }
interface State {
  snooze: Record<string, number>; done: Record<string, number>; notes: Record<string, string>;
  stats: Record<string, DayStats>; lost: Record<string, number>;
}
const KEY = 'inbox:state';
const day = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const H = 3600_000;

async function state(): Promise<State> {
  const s = await kvJson<Partial<State>>(KEY, {});
  return { snooze: s.snooze ?? {}, done: s.done ?? {}, notes: s.notes ?? {}, stats: s.stats ?? {}, lost: s.lost ?? {} };
}
let chain: Promise<unknown> = Promise.resolve();
function edit(fn: (s: State) => void): Promise<void> {
  const next = chain.then(async () => {
    const s = await state();
    fn(s);
    const now = Date.now();
    for (const [k, v] of Object.entries(s.snooze)) if (v < now) delete s.snooze[k];
    for (const [k, v] of Object.entries(s.done)) if (now - v > 30 * 86_400_000) delete s.done[k];
    for (const k of Object.keys(s.stats).sort().slice(0, -60)) delete s.stats[k];
    await kvPut(KEY, s);
  });
  chain = next.catch(() => {});
  return next;
}
const stat = (s: State) => (s.stats[day()] ??= { sent: 0, accepted: 0, refused: 0, waitMin: 0, waitN: 0, voice: 0 });

const langOf = (t: string) => CL.langLabel(CL.detectClientLang(t || ''));
const clip = (t: string, n = 600) => String(t ?? '').replace(/\s+\n/g, '\n').trim().slice(0, n);
/** 06/07 sans indicatif : on ne sait pas si c'est la France ou l'Algérie → l'app propose les deux. */
function guessNumbers(raw: string): string[] {
  const d = raw.replace(/\D/g, '');
  if (/^0[67]\d{8}$/.test(d)) return [`+33${d.slice(1)}`, `+213${d.slice(1)}`];
  return [];
}

async function flagsFor(name: string, text: string, at: string): Promise<{ flags: InboxItem['flags']; bonus: number }> {
  const flags: InboxItem['flags'] = [];
  let bonus = 0;
  const wa = await import('./whatsapp-web.js');
  const age = wa.clientAge(text) ?? wa.birthDateAge(text);
  if (age !== null && age < 35) { flags.push({ icon: '🔞', label: `${age} ans (< 35)`, tone: 'bad' }); bonus -= 20; }
  else if (age !== null) flags.push({ icon: '✅', label: `${age} ans`, tone: 'ok' });
  for (const f of wa.redFlags(text)) { flags.push({ icon: '🚩', label: f, tone: 'bad' }); bonus += 30; }
  const prio = await import('./priority-referral.js').then(m => m.findPriority(name)).catch(() => null);
  if (prio) { flags.push({ icon: '⭐', label: `Prioritaire (${prio.uses} ami${prio.uses > 1 ? 's' : ''})`, tone: 'ok' }); bonus += 15; }
  const waitH = (Date.now() - Date.parse(at)) / H;
  if (waitH >= 1 && waitH < 72) { flags.push({ icon: '⏱', label: waitH < 24 ? `attend depuis ${Math.floor(waitH)} h` : `attend depuis ${Math.floor(waitH / 24)} j`, tone: waitH >= 3 ? 'bad' : 'warn' }); bonus += Math.min(20, waitH * 2); }
  if (/d[ée]c(embre)?\b|\b(1[5-9]|2\d|3[01])\s*\/\s*12|r[ée]veillon|f[êe]tes|ديسمبر/i.test(text)) flags.push({ icon: '🎄', label: 'Fêtes : presque complet', tone: 'warn' });
  return { flags, bonus };
}

/** Toutes les cartes à traiter, la plus urgente d'abord. */
export async function inboxList(): Promise<{ items: InboxItem[]; stats: DayStats & { waiting: number; oldestH: number; snoozed: number; lostTop: Array<{ reason: string; n: number }> } }> {
  const st = await state();
  const now = Date.now();
  const items: InboxItem[] = [];
  const seenChats = new Set<string>();
  const hidden = (id: string, at: string) => (st.snooze[id] ?? 0) > now || (st.done[id] ?? 0) >= Date.parse(at);
  const safe = async (name: string, f: () => Promise<void>) => { try { await f(); } catch (e) { console.warn(`[inbox] ${name}:`, e instanceof Error ? e.message : e); } };

  // 1. WhatsApp : messages de clients avec une réponse prête (48 h)
  await safe('wa-drafts', async () => {
    const wa = await import('./whatsapp-web.js');
    const ttNames = new Set((await listWaDemandes('tiktok')).map(x => x.chat.toLowerCase()));
    for (const d of await wa.waDraftList()) {
      if (now - Date.parse(d.at) > 48 * H) continue;
      const tiktok = d.chat.startsWith('@') || ttNames.has(d.chat.toLowerCase());   // brouillon d'un client TikTok rangé avec ceux de WhatsApp
      const id = `${tiktok ? 'tt' : 'wa'}:${d.chat.toLowerCase()}`;
      seenChats.add(d.chat.toLowerCase());
      if (hidden(id, d.at)) continue;
      const f = await flagsFor(d.chat, d.preview, d.at);
      let draft = d.draft;
      // 27/11 : ancien brouillon qui promet des voitures « disponibles » sans que Kouider l'ait confirmé → remplacé (règle du 26/11)
      if (ND.claimsAvailability(draft) && !(await ND.hasConfirmation(d.chat).catch(() => false))) {
        draft = ND.checkingText(CL.detectClientLang(d.preview), d.preview);
        f.flags.push({ icon: '🛡', label: 'Réponse corrigée : jamais de dispo sans toi (touche Accepter pour dire que c\'est dispo)', tone: 'info' });
      }
      items.push({ id, kind: tiktok ? 'tt' : 'wa', channel: tiktok ? 'tiktok' : 'whatsapp', name: d.chat, chat: d.chat, phone: /^\+?[\d\s]{8,}$/.test(d.chat) ? d.chat : null,
        text: clip(d.preview), draft, at: d.at, flags: f.flags, lang: langOf(d.preview), prio: 80 + f.bonus,
        actions: ['send', 'accept', 'refuse', 'rewrite', 'quick', 'translate', 'history', ...(tiktok ? [] : ['voice']), 'snooze', 'ignore', 'conclu', 'perdu', 'note'] });
    }
  });
  // 2. Demandes WhatsApp / TikTok encore « nouveau » (7 j) sans réponse prête
  for (const ch of ['whatsapp', 'tiktok'] as Channel[]) await safe(`demandes-${ch}`, async () => {
    for (const d of await listWaDemandes(ch)) {
      if (d.status !== 'nouveau' || WA_CLOSED.has(d.status) || now - Date.parse(d.updated_at) > 7 * 86_400_000) continue;
      if (ch === 'whatsapp' && seenChats.has(d.chat.toLowerCase())) continue;
      const comment = ch === 'tiktok' && d.via === 'comment';
      const id = ch === 'whatsapp' ? `wa:${d.chat.toLowerCase()}` : comment ? `ttc:${d.id}` : `tt:${d.chat.toLowerCase()}`;
      if (hidden(id, d.updated_at)) continue;
      seenChats.add(d.chat.toLowerCase());
      const f = await flagsFor(d.chat, d.text, d.updated_at);
      items.push({ id, kind: ch === 'whatsapp' ? 'wa' : comment ? 'ttc' : 'tt', channel: ch, name: d.chat, chat: d.chat, phone: d.phone ?? null,
        text: clip(d.text.split('\n').slice(-3).join('\n')), at: d.updated_at, flags: f.flags, lang: langOf(d.text), count: d.count, video: d.video,
        meta: comment ? `commentaire${d.video ? ' sous une vidéo' : ''}` : d.count > 1 ? `${d.count} messages` : undefined,
        prio: (ch === 'whatsapp' ? 70 : comment ? 25 : 60) + f.bonus,
        actions: comment ? ['draft', 'copy', 'rewrite', 'translate', 'snooze', 'ignore', 'conclu', 'perdu', 'note']
          : ['draft', 'send', 'accept', 'refuse', 'rewrite', 'quick', 'translate', 'history', ...(ch === 'whatsapp' ? ['voice'] : []), 'snooze', 'ignore', 'conclu', 'perdu', 'note'] });
    }
  });
  // 3. Relances du matin (avec leur message prêt)
  await safe('relances', async () => {
    for (const r of await (await import('./relance-clients.js')).relanceItems()) {
      if (seenChats.has(r.chat.toLowerCase())) continue;
      const id = `rel:${r.key}`;
      if ((st.snooze[id] ?? 0) > now || st.done[id]) continue;
      items.push({ id, kind: 'rel', sub: r.kind, channel: r.kind === 'tt' ? 'tiktok' : 'whatsapp', name: r.label, chat: r.chat, phone: r.kind === 'tt' ? null : r.chat,
        text: r.why, draft: r.draft, why: r.why, at: new Date().toISOString(), flags: r.ask ? [{ icon: '🌍', label: 'Numéro sans indicatif', tone: 'warn' }] : [],
        lang: langOf(r.draft), prio: { prolong: 45, panier: 40, wa: 35, tt: 30 }[r.kind], ask: r.ask,
        meta: { prolong: '📅 Prolongation', panier: '🛒 Panier du site', wa: '💬 WhatsApp silencieux', tt: '🎵 TikTok' }[r.kind],
        actions: ['send', 'rewrite', 'translate', 'snooze', 'ignore', 'note', ...(r.kind !== 'tt' ? ['voice'] : [])] });
    }
  });
  // 4. Réservations du site en attente
  await safe('bookings', async () => {
    const { data } = await supabase.from('bookings').select('id, client_name, client_phone, start_date, end_date, final_price, currency, created_at, cars(name)')
      .eq('status', 'PENDING').order('created_at', { ascending: false }).limit(20);
    for (const b of (data ?? []) as Array<Record<string, unknown> & { cars?: { name?: string } }>) {
      const id = `bk:${b['id']}`;
      if (hidden(id, String(b['created_at']))) continue;
      const days = Math.max(1, Math.round((Date.parse(String(b['end_date'])) - Date.parse(String(b['start_date']))) / 86_400_000));   // jour du retour jamais compté
      const f = await flagsFor(String(b['client_name'] ?? ''), '', String(b['created_at']));
      items.push({ id, kind: 'booking', channel: 'site', name: String(b['client_name'] ?? 'Client'), phone: (b['client_phone'] as string) ?? null,
        text: `${b.cars?.name ?? 'Voiture'} · ${String(b['start_date']).slice(0, 10)} → ${String(b['end_date']).slice(0, 10)} (${days} j)${b['final_price'] ? ` · ${b['final_price']} ${b['currency'] || '€'}` : ''}`,
        at: String(b['created_at']), flags: f.flags, lang: '', prio: 100 + f.bonus, meta: 'Réservation du site à confirmer',
        actions: ['accept', 'refuse', 'snooze', 'note', 'wa_link'] });
    }
  });
  // 5. Demandes du site (7 j, pas encore traitées)
  await safe('leads', async () => {
    const since = new Date(now - 7 * 86_400_000).toISOString();
    const { data } = await supabase.from('client_leads').select('id, client_name, client_phone, category, criteria, budget_max, currency, status, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(20);
    for (const l of data ?? []) {
      if (l.status && !/^(new|nouveau)$/i.test(String(l.status))) continue;
      const id = `lead:${l.id}`;
      if (hidden(id, l.created_at)) continue;
      const nums = (await import('./relance-clients.js')).waPhone(l.client_phone);
      const txt = [l.criteria || l.category, l.budget_max ? `budget ${l.budget_max} ${l.currency || ''}` : ''].filter(Boolean).join(' · ');
      const f = await flagsFor(l.client_name ?? '', txt, l.created_at);
      items.push({ id, kind: 'lead', channel: 'site', name: l.client_name || 'Client du site', phone: nums ?? l.client_phone, chat: nums ?? undefined,
        text: txt || 'Demande du site', at: l.created_at, flags: f.flags, lang: 'Français', prio: 50 + f.bonus, meta: 'Demande du site', ask: !nums && !!l.client_phone,
        actions: ['draft', 'send', 'rewrite', 'translate', 'snooze', 'ignore', 'conclu', 'perdu', 'note', 'wa_link'] });
    }
  });

  for (const it of items) { const n = st.notes[it.name.toLowerCase()]; if (n) it.note = n; }
  items.sort((a, b) => b.prio - a.prio || b.at.localeCompare(a.at));
  const s = st.stats[day()] ?? { sent: 0, accepted: 0, refused: 0, waitMin: 0, waitN: 0, voice: 0 };
  const waits = items.filter(i => i.kind !== 'rel').map(i => (now - Date.parse(i.at)) / H);
  return { items, stats: { ...s, waiting: items.length, oldestH: waits.length ? Math.round(Math.max(...waits)) : 0,
    snoozed: Object.values(st.snooze).filter(v => v > now).length,
    lostTop: Object.entries(st.lost).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, n]) => ({ reason, n })) } };
}

// ── Rédaction ─────────────────────────────────────────────────────────────────────────────────────────────
async function polish(out: string, clientText: string, chat: string): Promise<string> {
  out = out.trim().replace(/^["«]\s*|\s*["»]$/g, '').slice(0, 900);
  if (out && clientText && !CL.replyMatches(clientText, out)) out = await CL.rewriteInLang(out, clientText).catch(() => out);
  if (out && ND.claimsAvailability(out) && !(await ND.hasConfirmation(chat).catch(() => false))) out = ND.checkingText(CL.detectClientLang(clientText), clientText);
  return out;
}

async function convoOf(it: InboxItem): Promise<string> {
  if (!it.chat) return '';
  const msgs = it.channel === 'tiktok' && it.kind !== 'ttc'
    ? await (await import('./tiktok-web.js')).readTtChat(it.chat).catch(() => null)
    : it.channel === 'whatsapp' ? await (await import('./whatsapp-web.js')).readWaChat(it.chat).catch(() => null) : null;
  return (msgs ?? []).map(m => `${m.me ? 'FIK' : it.name} : ${m.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
}

/** Réponse fraîche (WhatsApp / site), même règles que les brouillons de Telegram. */
async function freshDraft(it: InboxItem, how = ''): Promise<string> {
  if (it.kind === 'tt') { const r = await (await import('./tiktok-web.js')).draftFor(it.chat!, it.text); if (r.missing || !r.draft) throw new Error(r.last); return r.draft; }
  if (it.kind === 'ttc') return (await import('./tiktok-web.js')).ttDraft({ kind: 'comment', name: it.name, text: it.text });
  const wa = await import('./whatsapp-web.js');
  const age = wa.clientAge(it.text);
  if (age !== null && age < 35) return wa.declineText(CL.detectClientLang(it.text) === 'darija_latin' ? 'dz' : /[؀-ۿ]/.test(it.text));
  const convo = await convoOf(it);
  const cond = await import('./night-guard.js').then(m => m.exactConditions()).catch(() => '');
  const prio = await import('./priority-referral.js').then(m => m.findPriority(it.name).then(p => p ? m.priorityRule(p) : '')).catch(() => '');
  const system = `Tu prépares la réponse ${it.kind === 'lead' ? 'WhatsApp à une demande reçue sur le site' : 'WhatsApp'} de FIK Conciergerie (location de voitures à Oran, départ et retour à l'aéroport d'Oran). Kouider la relira avant envoi.
Court (1 à 3 phrases), chaleureux, ne redemande jamais ce que le client a déjà donné. ${CL.langRule(it.text)}
Demande de location sans dates ou sans âge du conducteur → demande-les (35 ans minimum). Pas de prix inventé.
CONDITIONS EXACTES (n'en cite aucune autre, il n'y a AUCUNE caution) :
${cond}${prio}
${await ND.noDispoRule(it.chat ?? it.name)}
Ne cite jamais Houari ni la Belgique. Réponds UNIQUEMENT avec le texte du message.${how ? `\nCONSIGNE DE KOUIDER : ${how}` : ''}`;
  const { runReadOnlyAgent } = await import('./readonly-agent.js');
  const r = await runReadOnlyAgent(convo ? `Discussion avec « ${it.name} » (« FIK » = nous). Réponds à son DERNIER message :\n${convo.slice(-2500)}`
    : `${it.kind === 'lead' ? 'Demande envoyée sur le site' : 'Message'} de « ${it.name} » :\n« ${it.text.slice(0, 800)} »`, { system, sessionId: 'inbox_draft', maxRounds: 1, maxTokens: 400 });
  return polish(r.text, it.text, it.chat ?? it.name);
}

const LANGS: Record<string, CL.ClientLang> = { darija: 'darija_latin', darija_ar: 'darija_ar', fr: 'fr', en: 'en', arabe: 'arabe' };
const STYLE: Record<string, string> = {
  court: 'Raccourcis-le au maximum (1 phrase), même sens.',
  chaleureux: 'Rends-le plus chaleureux et accueillant (un emoji au plus), même sens.',
  pro: 'Rends-le plus professionnel et rassurant, même sens.',
  datesage: "Ajoute la demande des dates (début et fin) et de l'âge du conducteur si elles manquent.",
  aeroport: "Ajoute que la voiture est remise et rendue à l'aéroport d'Oran.",
  autresdates: "C'est complet sur ses dates : propose-lui gentiment d'autres dates proches.",
};

async function rewrite(it: InboxItem, draft: string, how: string): Promise<string> {
  if (LANGS[how]) {
    const out = await CL.rewriteInLang(draft, it.text, LANGS[how]);
    return ND.claimsAvailability(out) && !(await ND.hasConfirmation(it.chat ?? it.name).catch(() => false)) ? CL.rewriteInLang(ND.checkingText('fr', it.text), it.text, LANGS[how]) : out;
  }
  const consigne = STYLE[how] ?? how;
  const out = await ai(`Message du client : « ${it.text.slice(0, 600)} »\nRéponse actuelle : « ${draft} »\nConsigne : ${consigne}\nRéécris la réponse.`,
    { system: `Tu réécris une réponse de FIK Conciergerie (location de voitures à Oran) à un client. ${CL.langRule(it.text)} Ne promets jamais une voiture disponible sauf si la réponse actuelle le dit déjà. N'invente aucun prix ni condition. Réponds UNIQUEMENT avec le nouveau texte.`, max: 400 });
  return polish(out, it.text, it.chat ?? it.name);
}

function quickText(tpl: string, it: InboxItem): string {
  const l = CL.detectClientLang(it.text);
  if (tpl === 'verif') return ND.checkingText(l, it.text);
  if (tpl === 'datesage') return CL.askDatesAge(l);
  const T: Record<string, Partial<Record<CL.ClientLang, string>>> = {
    merci: { fr: 'Merci beaucoup, à très bientôt 🙏', darija_latin: 'Saha khouya, merci bezaf 🙏', darija_ar: 'صحا خويا، يعطيك الصحة 🙏', arabe: 'شكرا جزيلا، إلى اللقاء 🙏', en: 'Thank you so much, see you soon 🙏' },
    rappel: { fr: 'Bonjour, je vous appelle dans quelques minutes 👍', darija_latin: 'Salam, n3ayetlek men ba3d chwiya 👍', darija_ar: 'السلام، نعيطلك من بعد شوية 👍', arabe: 'مرحبا، سأتصل بك بعد قليل 👍', en: "Hello, I'll call you in a few minutes 👍" },
    complet: { fr: 'Désolé, nous sommes complets sur ces dates. Voulez-vous que je regarde d\'autres dates proches ?', darija_latin: 'Smahli, c\'est complet f had les dates. T7eb nchoflek dates okhrin ?', darija_ar: 'سمحلي، كومبلي في هاد التواريخ. تحب نشوفلك تواريخ أخرى؟', arabe: 'نعتذر، كل السيارات محجوزة في هذه التواريخ. هل تريد أن أبحث عن تواريخ أخرى قريبة؟', en: "Sorry, we're fully booked on those dates. Shall I check other dates nearby?" },
  };
  return T[tpl]?.[l] ?? T[tpl]?.['fr'] ?? '';
}

// ── Actions ───────────────────────────────────────────────────────────────────────────────────────────────
export interface ActInput { id: string; action: string; text?: string; how?: string; to?: string; car?: string; hours?: number; reason?: string; own?: boolean }
export interface ActResult { ok: boolean; message?: string; draft?: string; messages?: Array<{ me: boolean; text: string }>; client?: string; reply?: string; gone?: boolean }

async function findItem(id: string): Promise<InboxItem | null> {
  return (await inboxList()).items.find(i => i.id === id) ?? null;
}

async function closeDemande(it: InboxItem, status: string): Promise<void> {
  if (it.chat && (it.channel === 'whatsapp' || it.channel === 'tiktok') && it.kind !== 'rel')
    await markDemande(it.chat, status, ['nouveau', 'contacté'], it.channel).catch(() => false);
  if (it.kind === 'ttc') await (await import('./wa-demandes.js')).updateWaDemande(it.id.slice(4), status, 'tiktok').catch(() => false);
  if (it.kind === 'lead') await supabase.from('client_leads').update({ status: status === 'conclu' ? 'won' : status === 'perdu' ? 'lost' : 'contacted', updated_at: new Date().toISOString() }).eq('id', it.id.slice(5));
  if (it.kind === 'rel') await (await import('./relance-clients.js')).dropRelance(it.id.slice(4));
  if (it.kind === 'wa' && it.chat) await (await import('./whatsapp-web.js')).dropWaDraft(it.chat);
  if (it.kind === 'tt' && it.chat) { await (await import('./tiktok-web.js')).clearTtPendingFor(it.chat); await (await import('./whatsapp-web.js')).dropWaDraft(it.chat); }
}

export async function inboxAct(inp: ActInput): Promise<ActResult> {
  const it = await findItem(inp.id);
  if (!it) return { ok: false, gone: true, message: 'Déjà traité (ou plus en attente).' };
  const a = inp.action;
  const draft = (inp.text ?? it.draft ?? '').trim();

  if (a === 'draft') return { ok: true, draft: await freshDraft(it, inp.how) };
  if (a === 'rewrite') {
    if (!draft) return { ok: true, draft: await freshDraft(it, STYLE[inp.how ?? ''] ?? inp.how) };
    return { ok: true, draft: await rewrite(it, draft, String(inp.how ?? 'court')) };
  }
  if (a === 'quick') return { ok: true, draft: quickText(String(inp.how ?? 'verif'), it) };
  if (a === 'translate') { const r = await CL.frLines(it.text, draft); return { ok: true, client: r.client, reply: r.reply }; }
  if (a === 'history') {
    const conv = await convoOf(it);
    if (!conv) return { ok: false, message: 'Discussion pas lisible pour le moment (PC cloud ?).' };
    return { ok: true, messages: conv.split('\n').map(l => ({ me: l.startsWith('FIK : '), text: l.replace(/^[^:]+ : /, '') })) };
  }
  if (a === 'note') { await edit(s => { if (inp.text?.trim()) s.notes[it.name.toLowerCase()] = inp.text.trim().slice(0, 300); else delete s.notes[it.name.toLowerCase()]; }); return { ok: true, message: 'Note gardée.' }; }
  if (a === 'snooze') {
    const h = Math.max(0.5, Math.min(72, Number(inp.hours ?? 2)));
    await edit(s => { s.snooze[it.id] = Date.now() + h * H; });
    return { ok: true, gone: true, message: h >= 12 ? 'Je te la remontre demain.' : `Je te la remontre dans ${h} h.` };
  }

  // Accepter / refuser
  if (a === 'accept' || a === 'refuse') {
    if (it.kind === 'booking') {
      await (await import('./booking-status.js')).setBookingStatus(it.id.slice(3), a === 'accept' ? 'ACCEPTED' : 'REJECTED');
      await edit(s => { s.done[it.id] = Date.now(); stat(s)[a === 'accept' ? 'accepted' : 'refused']++; });
      return { ok: true, gone: true, message: a === 'accept' ? 'Réservation acceptée ✅ (agenda mis à jour, le site prévient le client).' : 'Réservation refusée (le site prévient le client).' };
    }
    if (!it.chat) return { ok: false, message: 'Pas de discussion pour ce client.' };
    // SON appui = sa confirmation (règle « jamais de dispo sans Kouider ») : retenue 72 h, la réponse est réécrite avec
    const words = a === 'accept' ? (inp.car?.trim() ? `la ${inp.car.trim()} est disponible pour ses dates` : 'oui on a des voitures disponibles pour ses dates')
      : (inp.how === 'autresdates' ? "c'est complet sur ses dates, propose-lui d'autres dates proches" : "c'est complet pour ses dates");
    const d = await ND.draftFromConfirmation(it.chat, it.text, await convoOf(it), words);
    await edit(s => { stat(s)[a === 'accept' ? 'accepted' : 'refused']++; });
    return { ok: true, draft: d, message: a === 'accept' ? 'Réponse « c\'est dispo » prête : vérifie puis Envoyer.' : 'Réponse « complet » prête : vérifie puis Envoyer.' };
  }

  if (a === 'send' || a === 'voice') {
    if (!draft) return { ok: false, message: 'Rien à envoyer : prépare ou écris la réponse.' };
    if (it.kind === 'ttc') return { ok: false, message: 'Commentaire TikTok : copie la réponse et colle-la sous la vidéo.' };
    if (it.kind === 'booking') return { ok: false, message: 'Réservation : utilise Accepter ou Refuser.' };
    const to = (inp.to ?? '').trim() || (it.ask ? '' : it.chat ?? '');
    if (!to) return { ok: false, message: `Numéro sans indicatif : choisis ${guessNumbers(it.chat ?? it.phone ?? '').join(' ou ') || 'le pays'}.` };
    const tiktok = it.channel === 'tiktok';
    if (a === 'voice') {
      if (tiktok) return { ok: false, message: 'Le vocal marche seulement sur WhatsApp.' };
      const r = await (await import('./whatsapp-web.js')).sendWaVoice(to, draft, !!inp.own);
      if (!r.startsWith('✅')) return { ok: false, message: r.replace(/^❌\s*/, '') };
    } else {
      const r = tiktok ? await (await import('./tiktok-web.js')).sendTtReply(to, draft) : await (await import('./whatsapp-web.js')).sendWaToChat(to, draft);
      if (!r.ok) return { ok: false, message: `Pas envoyé : ${r.error ?? 'erreur'}` };
    }
    await closeDemande(it, 'contacté');
    await edit(s => { s.done[it.id] = Date.now(); const x = stat(s); x.sent++; if (a === 'voice') x.voice++; if (it.kind !== 'rel') { x.waitMin += Math.round((Date.now() - Date.parse(it.at)) / 60_000); x.waitN++; } });
    return { ok: true, gone: true, message: `${a === 'voice' ? 'Vocal envoyé' : 'Envoyé'} sur ${tiktok ? 'TikTok' : 'WhatsApp'} à ${it.name} ✅` };
  }

  // 27/11 soir (Kouider : « je dois pouvoir les zapper, j'ai déjà répondu ») : répondu ailleurs (WhatsApp/TikTok à la main)
  if (a === 'repondu') {
    await closeDemande(it, 'contacté');
    await edit(s => { s.done[it.id] = Date.now(); });
    return { ok: true, gone: true, message: 'Noté : déjà répondu ✅' };
  }
  if (a === 'ignore' || a === 'conclu' || a === 'perdu') {
    const status = a === 'ignore' ? 'sans suite' : a;
    await closeDemande(it, status);
    await edit(s => { s.done[it.id] = Date.now(); if (a === 'perdu' && inp.reason) s.lost[inp.reason] = (s.lost[inp.reason] ?? 0) + 1; });
    return { ok: true, gone: true, message: a === 'ignore' ? 'Rangé (sans suite).' : a === 'conclu' ? 'Noté conclu 🎉 Pense à créer la location.' : 'Noté perdu.' };
  }
  return { ok: false, message: 'Action inconnue.' };
}

/** Pour le brief / Telegram : combien de cartes attendent, et depuis quand. */
export async function inboxSummary(): Promise<string> {
  const { items, stats } = await inboxList();
  if (!items.length) return '';
  const by = (k: InboxKind) => items.filter(i => i.kind === k).length;
  return `📥 ${items.length} à traiter dans l'app (Aujourd'hui) : ${[[by('booking'), 'résa'], [by('wa'), 'WhatsApp'], [by('tt') + by('ttc'), 'TikTok'], [by('rel'), 'relance'], [by('lead'), 'site']]
    .filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(', ')}${stats.oldestH >= 2 ? ` · le plus ancien attend depuis ${stats.oldestH} h` : ''}.`;
}
