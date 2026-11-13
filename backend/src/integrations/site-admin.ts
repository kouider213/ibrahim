/**
 * GÉRER LE SITE fikconciergerie.com DEPUIS TELEGRAM (13/11/2026, Kouider : « je dois pouvoir gérer le site à 100 % à partir de Telegram »).
 * Ce que les autres outils ne faisaient pas : accepter / refuser une demande AVEC les effets du site (email au client, agenda),
 * réglages du site (annonce, WhatsApp, acompte…), FAQ, conditions, blog, newsletter, dossiers / import.
 * Les routes d'administration du site sont fermées au public (13/11) : Dzaryx passe avec le jeton interne INTERNAL_API_TOKEN.
 */
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';

const SITE = 'https://fikconciergerie.com';
type R = Record<string, unknown>;

async function siteApi<T = R>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const token = process.env['INTERNAL_API_TOKEN'];
  if (!token) return { ok: false, status: 503, data: { error: 'INTERNAL_API_TOKEN manquant sur Railway' } as T };
  const r = await fetch(`${SITE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({})) as T;
  return { ok: r.ok, status: r.status, data };
}

async function toArabic(texts: string[]): Promise<string[]> {
  try {
    const r = await fetch(`${SITE}/api/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, target: 'ar' }), signal: AbortSignal.timeout(25_000) });
    const d = await r.json() as { translations?: string[] };
    return texts.map((t, i) => d.translations?.[i] || t);
  } catch { return texts; }
}

interface Bk { id: string; client_name: string; client_phone: string | null; start_date: string; end_date: string; nb_days: number | null; final_price: number | null; status: string; notes: string | null; currency: string | null; cars: { name: string } | null }
const fmtBk = (b: Bk) => `• ${b.client_name} — ${b.cars?.name ?? '?'} — ${b.start_date} → ${b.end_date}${b.final_price ? ` — ${b.final_price} ${b.currency === 'DZD' ? 'DA' : '€'} au total` : ''} [${b.status}]`;

async function findBooking(input: R, statuses: string[]): Promise<Bk | string> {
  const id = String(input['id'] ?? '').trim();
  const q = String(input['client'] ?? '').trim();
  let req = supabase.from('bookings').select('id, client_name, client_phone, start_date, end_date, nb_days, final_price, status, notes, currency, cars(name)').in('status', statuses).order('created_at', { ascending: false }).limit(10);
  if (id) req = req.eq('id', id); else if (q) req = req.ilike('client_name', `%${q}%`);
  const { data, error } = await req;
  if (error) return `❌ ${error.message}`;
  const list = (data ?? []) as unknown as Bk[];
  if (!list.length) return `❌ Aucune demande ${statuses.join('/')} trouvée${q ? ` pour « ${q} »` : ''}.`;
  if (list.length > 1) return `⚠️ Plusieurs demandes — dis-moi laquelle (nom complet ou id) :\n${list.map(b => `${fmtBk(b)} id=${b.id}`).join('\n')}`;
  return list[0]!;
}

const SETTINGS: Record<string, string> = {
  annonce: 'announcement', announcement: 'announcement', whatsapp: 'whatsapp', whatsapp2: 'whatsapp2', whatsapp3: 'whatsapp3',
  telephone: 'phone', phone: 'phone', email: 'email', adresse: 'address', address: 'address', maps: 'maps_url', maps_url: 'maps_url',
  titre: 'hero_title', hero_title: 'hero_title', sous_titre: 'hero_subtitle', hero_subtitle: 'hero_subtitle',
  acompte: 'acompte_pct', acompte_pct: 'acompte_pct', instagram: 'instagram', tiktok: 'tiktok', facebook: 'facebook',
};

export async function siteAdminTool(input: R): Promise<string> {
  const action = String(input['action'] ?? 'pending');

  // ── Réservations ────────────────────────────────────────────────────────
  if (action === 'pending') {
    const { data } = await supabase.from('bookings').select('id, client_name, client_phone, start_date, end_date, nb_days, final_price, status, notes, currency, cars(name)').eq('status', 'PENDING').order('created_at', { ascending: false }).limit(15);
    const l = (data ?? []) as unknown as Bk[];
    return l.length ? `📥 Demandes en attente sur le site (${l.length}) :\n${l.map(fmtBk).join('\n')}\n\n👉 « accepte <nom> » (prix final possible) ou « refuse <nom> ».` : '✅ Aucune demande en attente sur le site.';
  }
  if (action === 'accept' || action === 'reject') {
    const b = await findBooking(input, ['PENDING']);
    if (typeof b === 'string') return b;
    const price = Number(input['price']);
    const r = await siteApi<{ error?: string }>('/api/update-booking-status', { bookingId: b.id, status: action === 'accept' ? 'ACCEPTED' : 'REJECTED', ...(price > 0 ? { finalPrice: price } : {}) });
    if (!r.ok) return `❌ Pas fait (site : ${r.data.error ?? r.status}). La demande de ${b.client_name} est toujours en attente.`;
    if (action === 'reject') return `✅ Demande de ${b.client_name} REFUSÉE sur le site. L'email « indisponible » part au client s'il a laissé son email.`;
    const total = price > 0 ? price : Number(b.final_price ?? 0);
    const days = Number(b.nb_days) || 1;
    const cal = await siteApi<{ success?: boolean; error?: string }>('/api/calendar-event', {
      clientName: b.client_name, clientPhone: b.client_phone ?? '', carName: b.cars?.name ?? '—', startDate: b.start_date, endDate: b.end_date, nbDays: days, finalPrice: total, notes: b.notes ?? '',
    }).catch(() => ({ ok: false, status: 0, data: {} as { success?: boolean; error?: string } }));
    void import('./night-guard.js').then(m => m.clearClientWaiting(b.client_name)).catch(() => {});
    return `✅ Demande de ${b.client_name} ACCEPTÉE sur le site (${b.cars?.name ?? '?'}, ${b.start_date} → ${b.end_date}, ${total} € au total, soit ${Math.round(total / days * 100) / 100} €/jour). Email de confirmation envoyé au client s'il a laissé son email. Agenda : ${cal.ok && cal.data.success ? 'événement créé ✅' : `⚠️ pas créé (${cal.data.error ?? 'erreur'})`}. Pense au message WhatsApp de confirmation (whatsapp_web).`;
  }

  // ── Réglages du site ────────────────────────────────────────────────────
  if (action === 'settings') {
    const { data } = await supabase.from('site_settings').select('*').eq('id', 1).single();
    const s = (data ?? {}) as R;
    return `⚙️ Réglages du site :\n${Object.entries({ annonce: 'announcement', whatsapp: 'whatsapp', whatsapp2: 'whatsapp2', whatsapp3: 'whatsapp3', telephone: 'phone', email: 'email', adresse: 'address', maps: 'maps_url', titre: 'hero_title', sous_titre: 'hero_subtitle', acompte: 'acompte_pct', instagram: 'instagram', tiktok: 'tiktok', facebook: 'facebook' }).map(([k, c]) => `• ${k} : ${s[c] === '' || s[c] == null ? '(vide)' : String(s[c])}${k === 'acompte' ? ' %' : ''}`).join('\n')}`;
  }
  if (action === 'set_setting') {
    const field = SETTINGS[String(input['field'] ?? '').toLowerCase().replace(/[\s-]/g, '_')];
    if (!field) return `❌ Réglage inconnu. Possibles : ${[...new Set(Object.keys(SETTINGS).filter(k => !k.includes('_') || k === 'sous_titre'))].join(', ')}.`;
    let value: unknown = String(input['value'] ?? '').trim();
    if (field === 'acompte_pct') { const n = Number(String(value).replace('%', '')); if (!(n >= 0 && n <= 100)) return '❌ Acompte = un pourcentage entre 0 et 100.'; value = n; }
    if (/^whatsapp/.test(field)) value = String(value).replace(/\D/g, '');
    const { error } = await supabase.from('site_settings').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return `❌ ${error.message}`;
    return `✅ Site mis à jour : ${String(input['field'])} = ${value === '' ? '(vidé)' : String(value)}. Visible sur fikconciergerie.com dans la minute.`;
  }

  // ── FAQ ─────────────────────────────────────────────────────────────────
  if (action === 'faq_list') {
    const { data } = await supabase.from('site_faq').select('id, question_fr, answer_fr, position').order('position');
    return ((data ?? []) as R[]).map(f => `#${f['id']} ${f['question_fr']}\n   → ${String(f['answer_fr']).slice(0, 160)}`).join('\n') || 'FAQ vide.';
  }
  if (action === 'faq_add') {
    const q = String(input['question'] ?? '').trim(), a = String(input['answer'] ?? '').trim();
    if (!q || !a) return '❌ question + answer requis.';
    const [qa, aa] = await toArabic([q, a]);
    const { data: last } = await supabase.from('site_faq').select('position').order('position', { ascending: false }).limit(1);
    const { error } = await supabase.from('site_faq').insert({ question_fr: q, answer_fr: a, question_ar: qa, answer_ar: aa, position: Number((last as R[] | null)?.[0]?.['position'] ?? 0) + 1 });
    return error ? `❌ ${error.message}` : `✅ Question ajoutée à la FAQ du site (français + arabe) : « ${q} »`;
  }
  if (action === 'faq_delete') {
    const id = String(input['id'] ?? '').trim(); if (!id) return '❌ id requis (faq_list).';
    const { error, count } = await supabase.from('site_faq').delete({ count: 'exact' }).eq('id', id);
    return error ? `❌ ${error.message}` : count ? `✅ Question #${id} retirée de la FAQ.` : `❌ Question #${id} introuvable.`;
  }

  // ── Conditions ──────────────────────────────────────────────────────────
  if (action === 'conditions_list') {
    const { data } = await supabase.from('site_conditions').select('id, section, text_fr, position').order('section').order('position');
    return ((data ?? []) as R[]).map(c => `[${c['section']}] ${String(c['text_fr']).slice(0, 200)} (id=${c['id']})`).join('\n') || 'Aucune condition.';
  }
  if (action === 'conditions_add') {
    const section = String(input['section'] ?? 'location').trim(), text = String(input['text'] ?? '').trim();
    if (!text) return '❌ text requis.';
    const [ar] = await toArabic([text]);
    const { data: last } = await supabase.from('site_conditions').select('position').eq('section', section).order('position', { ascending: false }).limit(1);
    const { error } = await supabase.from('site_conditions').insert({ section, text_fr: text, text_ar: ar, position: Number((last as R[] | null)?.[0]?.['position'] ?? 0) + 1 });
    if (!error) await kvSet('nightguard:site', '', 60).catch(() => {});   // l'assistant IA relit les conditions
    return error ? `❌ ${error.message}` : `✅ Condition ajoutée au site (section ${section}, français + arabe).`;
  }
  if (action === 'conditions_delete') {
    const id = String(input['id'] ?? '').trim(); if (!id) return '❌ id requis (conditions_list).';
    const { error, count } = await supabase.from('site_conditions').delete({ count: 'exact' }).eq('id', id);
    if (!error && count) await kvSet('nightguard:site', '', 60).catch(() => {});
    return error ? `❌ ${error.message}` : count ? '✅ Condition retirée du site.' : '❌ Condition introuvable.';
  }

  // ── Blog ────────────────────────────────────────────────────────────────
  if (action === 'blog_list') {
    const { data } = await supabase.from('blog_posts').select('id, slug, title_fr, published, created_at').order('created_at', { ascending: false }).limit(20);
    return ((data ?? []) as R[]).map(p => `#${p['id']} ${p['published'] ? '🟢' : '⚪'} ${p['title_fr']} — ${SITE}/blog/${p['slug']}`).join('\n') || 'Aucun article.';
  }
  if (action === 'blog_add') {
    const title = String(input['title'] ?? '').trim(), body = String(input['body'] ?? '').trim();
    if (!title || body.length < 50) return '❌ title + body (au moins quelques phrases) requis.';
    const excerpt = String(input['excerpt'] ?? '').trim() || body.replace(/\s+/g, ' ').slice(0, 160);
    const [ta, ea, ba] = await toArabic([title, excerpt, body]);
    const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
    const published = input['publish'] === true;
    const { data, error } = await supabase.from('blog_posts').insert({ slug, title_fr: title, title_ar: ta, excerpt_fr: excerpt, excerpt_ar: ea, body_fr: body, body_ar: ba, published }).select('id').single();
    return error ? `❌ ${error.message}` : `✅ Article ${published ? 'PUBLIÉ' : 'enregistré en brouillon'} (#${(data as R)['id']}) : ${SITE}/blog/${slug}${published ? '' : ' — « publie l\'article » pour le mettre en ligne.'}`;
  }
  if (action === 'blog_publish') {
    const id = String(input['id'] ?? '').trim(); if (!id) return '❌ id requis (blog_list).';
    const on = input['published'] !== false;
    const { error, count } = await supabase.from('blog_posts').update({ published: on, updated_at: new Date().toISOString() }, { count: 'exact' }).eq('id', id);
    return error ? `❌ ${error.message}` : count ? `✅ Article #${id} ${on ? 'publié' : 'retiré du site (brouillon)'}.` : '❌ Article introuvable.';
  }
  if (action === 'blog_delete') {
    const id = String(input['id'] ?? '').trim(); if (!id) return '❌ id requis (blog_list).';
    const { error, count } = await supabase.from('blog_posts').delete({ count: 'exact' }).eq('id', id);
    return error ? `❌ ${error.message}` : count ? `✅ Article #${id} supprimé.` : '❌ Article introuvable.';
  }

  // ── Newsletter (envoi à tous les abonnés → relecture obligatoire) ───────
  if (action === 'newsletter') {
    const title = String(input['title'] ?? '').trim(), body = String(input['body'] ?? '').trim();
    if (!title || !body) return '❌ title + body requis.';
    const { count } = await supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'active');
    const sig = `${title}|${body}`.slice(0, 500);
    if (input['test'] === true) {
      const r = await siteApi<{ error?: string }>('/api/newsletter-send', { title, body, test: true });
      return r.ok ? '✅ Email de TEST envoyé (à l\'adresse de l\'admin). Regarde-le, puis dis « envoie la newsletter » pour l\'envoyer à tous.' : `❌ Test pas parti : ${r.data.error ?? r.status}`;
    }
    if (input['confirmed'] !== true || (await kvGet('site:nl:preview').catch(() => null)) !== sig) {
      await kvSet('site:nl:preview', sig, 30 * 60);
      return `📰 Newsletter à envoyer à ${count ?? '?'} abonné(s) :\nTitre : « ${title} »\n${body.slice(0, 1200)}\n\nDEMANDE À KOUIDER : « Je l'envoie à tout le monde ? » (ou « envoie un test d'abord »). Après son oui → même outil, même texte, confirmed:true.`;
    }
    await kvSet('site:nl:preview', '', 60);
    const r = await siteApi<{ sent?: number; error?: string }>('/api/newsletter-send', { title, body });
    return r.ok ? `✅ Newsletter envoyée (${r.data.sent ?? count ?? '?'} abonnés).` : `❌ Newsletter pas envoyée : ${r.data.error ?? r.status}`;
  }

  // ── Dossiers & import ───────────────────────────────────────────────────
  if (action === 'dossiers') {
    const [{ data: d }, { data: i }] = await Promise.all([
      supabase.from('dossiers').select('id, kind, status, client_name, client_phone, created_at').order('created_at', { ascending: false }).limit(15),
      supabase.from('import_orders').select('id, status, client_name, client_phone, created_at').order('created_at', { ascending: false }).limit(15),
    ]);
    const L = (x: R[] | null, t: string) => (x ?? []).map(r => `• ${t} ${r['client_name'] ?? '?'} (${r['client_phone'] ?? ''}) — ${r['kind'] ? `${r['kind']} · ` : ''}${r['status']} — id=${r['id']}`);
    const all = [...L(d as R[] | null, '📁'), ...L(i as R[] | null, '🚢')];
    return all.length ? `Dossiers et commandes import :\n${all.join('\n')}` : 'Aucun dossier ni commande import.';
  }
  if (action === 'dossier_status') {
    const id = String(input['id'] ?? '').trim(), status = String(input['status'] ?? '').trim().toUpperCase();
    if (!id || !status) return '❌ id + status requis (liste : action dossiers).';
    const r = await siteApi<{ error?: string }>('/api/update-dossier', { id, patch: { status } });
    return r.ok ? `✅ Dossier ${id} → ${status} (email au client si prévu par le site).` : `❌ ${r.data.error ?? r.status}`;
  }

  return '❌ Action inconnue. Actions : pending, accept, reject, settings, set_setting, faq_list, faq_add, faq_delete, conditions_list, conditions_add, conditions_delete, blog_list, blog_add, blog_publish, blog_delete, newsletter, dossiers, dossier_status.';
}
