/**
 * DZARYX QUI CONSTRUIT ET VEND (27/10/2026) :
 *  - commercial : le commercial automatique — chaque matin (10h) il prépare l'annonce FIK du jour (voitures pas louées
 *    aujourd'hui, prix, sans caution, livraison aéroport) en français + arabe, avec la meilleure photo, et demande
 *    « je publie ? ». Après le oui : publiée dans le Chrome du PC cloud (avec SES comptes) sur les cibles qu'il a
 *    données (groupes Facebook d'Oran, Ouedkniss, page FIK). Jamais sans son oui. app_kv `commercial:*`.
 *  - atelier : l'atelier de Tony Stark — « fais-moi un outil / une page qui… » → une page web complète (un seul fichier,
 *    sans serveur) construite par Claude, mise en ligne aussitôt,
 *    lien envoyé. app_kv `atelier:list`.
 *  - usine_business : « lance un business de … » → l'escouade fait l'étude (marché, concurrents, chiffres, offre,
 *    plan de lancement) et l'atelier construit la page de présentation du business.
 */
import { ai, jsonOf, kvJson, kvPut, tg, uid } from './ai-util.js';
import { supabase } from './supabase.js';

// ── Commercial automatique ───────────────────────────────────────────────────
interface Ad { date: string; fr: string; ar: string; cars: string[]; photo?: string; published?: string[] }

async function freeCarsToday(): Promise<Array<{ name: string; price: number; image_url?: string; seats?: number; category?: string }>> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cars }, { data: rents }] = await Promise.all([
    supabase.from('cars').select('id, name, resale_price, image_url, seats, category, available').order('resale_price'),
    supabase.from('bookings').select('car_id').lte('start_date', `${today}T23:59`).gte('end_date', today).not('status', 'in', '(REJECTED,CANCELLED,cancelled)'),
  ]);
  const busy = new Set(((rents ?? []) as Array<{ car_id: string }>).map(r => r.car_id));
  return ((cars ?? []) as Array<{ id: string; name: string; resale_price: number; image_url?: string; seats?: number; category?: string; available?: boolean }>)
    .filter(c => c.available !== false && !busy.has(c.id)).map(c => ({ name: c.name, price: Number(c.resale_price), image_url: c.image_url, seats: c.seats, category: c.category }));
}

export async function buildAd(): Promise<Ad | null> {
  const free = await freeCarsToday();
  if (!free.length) return null;
  const pick = free.slice(0, 8);
  const o = jsonOf<{ fr?: string; ar?: string }>(await ai(`Écris l'annonce du jour de FIK Conciergerie (location de voitures à Oran) pour les groupes Facebook d'Oran et Ouedkniss.
Voitures à mettre en avant (prix client par jour) : ${pick.map(c => `${c.name} ${c.price} €/j${c.seats ? ` ${c.seats} places` : ''}`).join(', ')}.
Arguments VRAIS : sans caution, kilométrage illimité, assurance incluse, toute l'Algérie, livraison gratuite à l'aéroport d'Oran, 7j/7, réservation WhatsApp +32 466 31 14 69, site fikconciergerie.com.
N'écris PAS « disponible aujourd'hui » ni de dates (Kouider confirme les dispos lui-même) : écris « réservez vos dates ».
Accrocheur, emojis, 6-10 lignes. Version française ET version arabe/darija algérienne. Réponds UNIQUEMENT : {"fr":"","ar":""}`, { quality: true, max: 1200 })) ?? {};
  if (!o.fr) return null;
  return { date: new Date().toISOString().slice(0, 10), fr: o.fr, ar: o.ar ?? '', cars: pick.map(c => c.name), photo: pick.find(c => c.image_url)?.image_url };
}

export async function commercialTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const action = String(input['action'] ?? 'prepare');
  if (action === 'targets') {
    const t = ((input['targets'] as unknown[] | undefined) ?? []).map(String).filter(Boolean);
    if (t.length) await kvPut('commercial:targets', t);
    const cur = await kvJson<string[]>('commercial:targets', []);
    return cur.length ? `📢 Où je publie :\n${cur.map(x => `• ${x}`).join('\n')}` : '📢 Aucune cible : donne-moi les liens des groupes Facebook d\'Oran, ta page FIK, Ouedkniss… (et connecte-toi une fois à ces sites dans le Chrome du PC cloud).';
  }
  if (action === 'prepare') {
    const ad = await buildAd();
    if (!ad) return '📢 Toutes les voitures sont louées aujourd\'hui : pas d\'annonce à faire.';
    await kvPut('commercial:ad', ad, 2 * 86_400);
    return `📢 Annonce du jour prête :\n\n🇫🇷 ${ad.fr}\n\n🇩🇿 ${ad.ar}\n\nDis « publie l'annonce » (action publish) et je la poste partout.`;
  }
  if (action === 'publish') {
    const ad = await kvJson<Ad | null>('commercial:ad', null);
    const targets = await kvJson<string[]>('commercial:targets', []);
    if (!ad) return '❌ Pas d\'annonce prête : action prepare d\'abord.';
    if (!targets.length) return await commercialTool({ action: 'targets' });
    if (input['confirmed'] !== true) return `📢 Je vais publier l'annonce sur ${targets.length} endroit(s) : ${targets.join(', ')}.\nDEMANDE À KOUIDER : « Je publie ? ». Après son oui → action publish, confirmed:true.`;
    const { executeTool } = await import('./tool-executor.js');
    const task = `Publie cette annonce (texte exact, français puis arabe, en un seul message)${ad.photo ? ` avec la photo ${ad.photo} (télécharge-la puis joins-la)` : ''} sur chacun de ces endroits, avec les comptes déjà connectés dans ce navigateur : ${targets.join(' ; ')}.\nSi un site demande une connexion, arrête-toi et dis-le.\n\nTEXTE :\n${ad.fr}\n\n${ad.ar}`;
    const r = await executeTool('browser_task', { task }, sessionId ?? 'commercial');
    ad.published = targets;
    await kvPut('commercial:ad', ad, 2 * 86_400);
    return `📢 Publication lancée dans le Chrome du PC cloud (tu peux regarder en direct : MON PC → PC cloud).\n${r.slice(0, 600)}`;
  }
  return '❌ action : prepare, publish, targets';
}

/** 10h : l'annonce du jour, proposée sur Telegram (rien ne part sans son oui). */
export async function jobCommercial(): Promise<string> {
  const targets = await kvJson<string[]>('commercial:targets', []);
  if (!targets.length) return 'pas de cible';
  const t = await commercialTool({ action: 'prepare' });
  await tg(t);
  return 'proposée';
}

// ── Atelier de Tony Stark ────────────────────────────────────────────────────
interface Build { id: string; slug: string; title: string; ask: string; url: string; at: string }
// Pages servies par le cerveau lui-même (route publique /atelier/:slug, app_kv `atelier:page:<slug>`) :
// pas besoin du jeton GitHub (refusé depuis le 18/10).
const PUBLIC_BASE = process.env['PUBLIC_BACKEND_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';

export async function buildPage(ask: string, kind = 'outil'): Promise<Build> {
  const html = await ai(`Construis ${kind === 'business' ? 'la page de présentation (landing page) de ce business' : 'cet outil / cette page web'} pour Kouider (FIK Conciergerie, Oran / Bruxelles) :
« ${ask} »
Si la page parle de FIK, utilise UNIQUEMENT ces vraies règles (n'invente aucun frais ni service) : sans caution ; acompte = 3 jours de location, déduit du total ; livraison GRATUITE à l'aéroport d'Oran (Es-Sénia) seulement, sinon retrait à l'agence Hay Badr ; kilométrage illimité ; assurance incluse ; toute l'Algérie ; 35 ans minimum ; passeport + permis ; WhatsApp +32 466 31 14 69 ; site fikconciergerie.com. 1 jour de location = un bloc de 24 h.
Contraintes : UN SEUL fichier HTML complet (CSS et JavaScript dedans, aucun serveur, aucune clé d'API). Si des données doivent être gardées, utilise localStorage (avec try/catch). Mobile d'abord (iPhone), beau, moderne, thème sombre bleu néon façon Dzaryx, en français. Fonctionnel pour de vrai, pas une maquette. Pas de librairie externe sauf si indispensable (alors cdnjs.cloudflare.com avec une version exacte).
Réponds UNIQUEMENT avec le code HTML, en commençant par <!doctype html>.`, { quality: true, max: 12000 });
  const code = html.slice(html.indexOf('<!doctype') >= 0 ? html.indexOf('<!doctype') : html.toLowerCase().indexOf('<!doctype'), html.toLowerCase().lastIndexOf('</html>') + 7);
  if (!/^<!doctype html/i.test(code)) throw new Error('page incomplète, réessaie');
  const title = (/<title>([^<]{1,80})<\/title>/i.exec(code)?.[1] ?? ask).trim();
  const slug = `${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'outil'}-${uid().slice(0, 4)}`;
  const { kvSet } = await import('./app-store.js');
  await kvSet(`atelier:page:${slug}`, code);
  const b: Build = { id: uid(), slug, title, ask, url: `${PUBLIC_BASE}/atelier/${slug}`, at: new Date().toISOString() };
  const list = await kvJson<Build[]>('atelier:list', []);
  await kvPut('atelier:list', [...list, b].slice(-50));
  return b;
}

export async function atelierTool(input: Record<string, unknown>): Promise<string> {
  if (String(input['action'] ?? 'build') === 'list') {
    const l = await kvJson<Build[]>('atelier:list', []);
    return l.length ? l.map(b => `• ${b.title} — ${b.url}`).join('\n') : 'Rien construit pour le moment.';
  }
  const ask = String(input['request'] ?? '').trim();
  if (!ask) return '❌ Qu\'est-ce que je construis ?';
  // Long (1-3 min) : on construit en fond et on envoie le lien sur Telegram
  void buildPage(ask).then(b => tg(`🛠️ C'est construit : « ${b.title} »\n${b.url}\n(Dis-moi ce qu'il faut changer.)`))
    .catch(err => tg(`🛠️ L'atelier a échoué pour « ${ask.slice(0, 80)} » : ${err instanceof Error ? err.message : String(err)}`));
  return `🛠️ L'atelier est lancé : « ${ask} ». Je construis la page complète et je t'envoie le lien sur Telegram dans 2-3 minutes.`;
}

// ── Usine à business ─────────────────────────────────────────────────────────
export async function businessFactoryTool(input: Record<string, unknown>): Promise<string> {
  const idea = String(input['idea'] ?? '').trim();
  if (!idea) return '❌ Quel business ?';
  const { startSquad } = await import('./squad.js');
  const s = await startSquad(`USINE À BUSINESS — étude complète pour lancer : « ${idea} » (Kouider, Oran / Bruxelles, petit budget). Il faut : le marché et la demande réelle, les concurrents et leurs prix, les chiffres (investissement de départ, coûts mensuels, prix, marge, point mort en clients par mois), l'offre irrésistible, le plan de lancement en 30 jours avec un premier test pas cher.`);
  void buildPage(`Landing page pour lancer le business « ${idea} » à Oran : promesse claire, offre, prix de lancement, avantages, FAQ, bouton WhatsApp +32 466 31 14 69, formulaire de liste d'attente (localStorage).`, 'business')
    .then(b => tg(`🏭 Usine à business — la page de « ${idea} » est en ligne : ${b.url}`)).catch(() => {});
  return `🏭 Usine à business lancée pour « ${idea} » :\n• l'escouade fait l'étude (marché, concurrents, chiffres, offre, plan 30 jours) — visible en direct dans JARVIS › Escouade (id ${s.id}) ;\n• l'atelier construit la page de présentation.\nTout arrive sur Telegram dans quelques minutes.`;
}
