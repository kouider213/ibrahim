import { createHmac, timingSafeEqual } from 'crypto';
import { loadDemo } from './demo-site.js';
import { buildClientSite, setBilling, saveSite, readIndex, getSite, adminUrl, type ClientSite } from './client-sites.js';
import { sendEmail } from './gmail.js';
import { kvGet, kvSet } from './app-store.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';
import { autoCall } from '../notifications/auto-call.js';

// Contrat d'abonnement FIK Sites signé en ligne : Kouider le prépare après le rendez-vous (démo + prix mensuel) →
// lien personnel signé → le patron lit, tape son nom, coche « lu et approuvé » (horodatage + IP conservés) →
// le site passe tout seul de la démo à la version définitive (sans étiquette démo, espace client, abonnement),
// copie du contrat + identifiants par mail au patron, alerte + appel à Kouider. Pas de JS : formulaire simple.

const API = () => process.env['PUBLIC_API_URL'] ?? 'https://ibrahim-backend-production.up.railway.app';
const secret = () => process.env['SESSION_SECRET'] ?? process.env['WEBHOOK_SECRET'] ?? 'dzaryx';
const sign = (slug: string) => createHmac('sha256', secret()).update(`contrat:${slug}`).digest('base64url').slice(0, 22);
const KEY = (slug: string) => `fiksite:contract:${slug}`;
const INDEX = 'fiksite:contracts';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SiteContract {
  slug: string; business: string; monthly: number; currency: string; setupFee: number; graceDays: number;
  email: string | null; createdAt: string;
  signed?: { name: string; email: string; phone: string; at: string; ip: string; ua: string };
  siteId?: string; siteUrl?: string; error?: string;
}

export const contractLink = (slug: string) => `${API()}/contrat/${slug}.${sign(slug)}`;

function verify(token: string): string | null {
  const i = token.lastIndexOf('.');
  const slug = token.slice(0, i), sig = token.slice(i + 1);
  if (i < 1 || !/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(slug));
  return a.length === b.length && timingSafeEqual(a, b) ? slug : null;
}

const getContract = async (slug: string) => { const v = await kvGet(KEY(slug)); return v ? JSON.parse(v) as SiteContract : null; };
async function saveContract(c: SiteContract): Promise<void> {
  await kvSet(KEY(c.slug), JSON.stringify(c));
  const idx = JSON.parse((await kvGet(INDEX)) ?? '[]') as string[];
  if (!idx.includes(c.slug)) { idx.unshift(c.slug); await kvSet(INDEX, JSON.stringify(idx.slice(0, 200))); }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number, cur: string) => `${n.toLocaleString('fr-FR')} ${cur}`;
const frDateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Les articles du contrat (même texte sur la page, dans le mail de copie et dans l'aperçu pour Kouider). */
export function contractTerms(c: SiteContract): string[] {
  return [
    `Prestataire : Kouider, FIK Sites (fikconciergerie.com). Client : ${c.business}.`,
    `Objet : création, mise en ligne, hébergement et mises à jour du site internet de ${c.business}, à partir de la démo présentée, avec un espace client pour modifier textes, horaires, prix et photos, et recevoir les messages des visiteurs.`,
    `Prix : ${money(c.monthly, c.currency)} par mois, payable d'avance chaque mois${c.setupFee > 0 ? `, plus ${money(c.setupFee, c.currency)} de frais de mise en place payés une seule fois` : ', sans frais de mise en place'}. Le paiement se fait directement à Kouider (espèces, virement ou autre moyen convenu).`,
    `Durée : sans engagement. Chaque partie peut arrêter à la fin d'un mois payé, par simple message ou mail. Aucun mois commencé n'est remboursé.`,
    `Retard de paiement : après ${c.graceDays} jours de retard, le site peut être mis en pause ; il revient en ligne dès le paiement.`,
    `Contenu : le client garantit que les informations, textes et photos qu'il fournit sont exacts et qu'il a le droit de les utiliser. FIK Sites remplace tout ce qui avait été inventé dans la démo par les vraies informations du client.`,
    `Nom de domaine (ex. ${c.slug.replace(/-/g, '')}.com) : en option, à la charge du client ; FIK Sites s'occupe du branchement.`,
    `Données : le site ne dépose aucun cookie publicitaire ; les visites et clics sont comptés de façon anonyme pour le bilan mensuel envoyé au client.`,
    `Acceptation électronique : en tapant son nom et en cochant « lu et approuvé », le client signe ce contrat. La date, l'heure et l'adresse IP sont conservées comme preuve.`,
  ];
}

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f6f4f0;color:#1f2328;display:flex;justify-content:center;padding:24px 16px}
main{max-width:560px;width:100%}h1{font-size:1.4rem;margin:0 0 6px}p,li{line-height:1.5;color:#333}ol{padding-left:20px}li{margin:8px 0}
.box{background:#fff;border:1px solid #d9d4ca;border-radius:12px;padding:16px 18px;margin:14px 0}
label{display:block;font-size:.9rem;margin:12px 0 4px;color:#444}input[type=text],input[type=email],input[type=tel]{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cfc9be;border-radius:10px;font-size:1rem}
.chk{display:flex;gap:10px;align-items:flex-start;margin:16px 0}.chk input{margin-top:4px;width:20px;height:20px}
button{width:100%;padding:15px;border:0;border-radius:12px;background:#0f766e;color:#fff;font-size:1.05rem;font-weight:600;cursor:pointer}
.ok{background:#ecfdf5;border:1px solid #10b981;border-radius:12px;padding:16px}.err{color:#b91c1c}small{color:#777}</style></head><body><main>${inner}<p><small>FIK Sites — Kouider</small></p></main></body></html>`;
}

const termsHtml = (c: SiteContract) => `<div class="box"><b>Contrat d'abonnement — site internet</b><ol>${contractTerms(c).map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>`;

/** GET /contrat/:token */
export async function contractPage(token: string, error = ''): Promise<{ status: number; html: string }> {
  const slug = verify(token);
  const c = slug ? await getContract(slug) : null;
  if (!c) return { status: 404, html: page('Lien invalide', '<h1>Lien invalide</h1><p>Ce lien n\'est pas (ou plus) valable. Contactez Kouider.</p>') };
  if (c.signed) {
    return { status: 200, html: page('Contrat signé', `<div class="ok"><h1>✅ Contrat signé</h1><p>Signé par <b>${esc(c.signed.name)}</b> le ${esc(frDateTime(c.signed.at))}. ${c.siteUrl ? `Votre site : <a href="${esc(c.siteUrl)}">${esc(c.siteUrl)}</a>` : 'Votre site définitif est en préparation : vous recevez le lien et vos identifiants par mail dans quelques minutes.'}</p></div>${termsHtml(c)}`) };
  }
  return { status: 200, html: page(`Contrat — ${c.business}`, `<h1>${esc(c.business)}</h1>
<p>Voici le contrat de votre site. Lisez-le, puis signez en bas : votre site passe aussitôt en version définitive.</p>
${termsHtml(c)}
<form method="post" class="box">
${error ? `<p class="err">${esc(error)}</p>` : ''}
<label for="n">Votre nom et prénom (signature)</label><input id="n" type="text" name="name" required maxlength="120" autocomplete="name">
<label for="e">Votre e-mail (pour la copie du contrat et l'accès à votre espace)</label><input id="e" type="email" name="email" required maxlength="200" value="${esc(c.email ?? '')}" autocomplete="email">
<label for="t">Votre téléphone</label><input id="t" type="tel" name="phone" maxlength="40" autocomplete="tel">
<div class="chk"><input id="ok" type="checkbox" name="agree" value="1" required><label for="ok" style="margin:0">J'ai lu le contrat ci-dessus : <b>lu et approuvé</b>, je le signe.</label></div>
<button type="submit">✍️ Signer le contrat</button></form>`) };
}

/** POST /contrat/:token */
export async function contractSign(token: string, body: Record<string, unknown>, ip: string, ua: string): Promise<{ status: number; html: string }> {
  const slug = verify(token);
  const c = slug ? await getContract(slug) : null;
  if (!c) return contractPage(token);
  if (c.signed) return contractPage(token);
  const name = String(body['name'] ?? '').trim().slice(0, 120);
  const email = String(body['email'] ?? '').trim().toLowerCase().slice(0, 200);
  const phone = String(body['phone'] ?? '').trim().slice(0, 40);
  if (name.length < 3) return contractPage(token, 'Tapez votre nom et prénom pour signer.');
  if (!EMAIL.test(email)) return contractPage(token, 'Cette adresse e-mail ne semble pas valide.');
  if (body['agree'] !== '1') return contractPage(token, 'Cochez « lu et approuvé » pour signer.');

  c.signed = { name, email, phone, at: new Date().toISOString(), ip: ip.slice(0, 64), ua: ua.slice(0, 200) };
  await saveContract(c);
  void finalizeSite(c);
  return contractPage(token);
}

/** Après signature : démo → vrai site + abonnement, mails et alertes. Jamais d'exception (tâche de fond). */
async function finalizeSite(c: SiteContract): Promise<void> {
  const s = c.signed!;
  let site: ClientSite | null = null, password: string | undefined, err = '';
  try {
    const existing = (await readIndex()).find(r => r.fromDemo === c.slug);
    if (existing) site = await getSite(existing.id);
    else ({ site, password } = await buildClientSite(c.slug, `Gérant : ${s.name}${s.phone ? `, téléphone ${s.phone}` : ''}.`, s.email));
    if (site) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers' }).format(new Date());
      setBilling(site, { monthly: c.monthly, currency: c.currency, paid_until: site.billing?.paidUntil ?? today, auto_pause: true, grace_days: c.graceDays });
      await saveSite(site);
      c.siteId = site.id; c.siteUrl = site.url;
    }
  } catch (e) { err = e instanceof Error ? e.message : String(e); c.error = err.slice(0, 300); }
  await saveContract(c).catch(() => {});

  const terms = contractTerms(c).map((t, i) => `${i + 1}. ${t}`).join('\n');
  const access = site?.account && password
    ? `\n\nVotre espace client (pour modifier votre site) :\n${adminUrl(site)}\nE-mail : ${site.account.email}\nMot de passe : ${password}` : '';
  await sendEmail('pro', {
    to: s.email, fromName: 'Kouider - FIK Sites', subject: `Votre contrat signé — site de ${c.business}`,
    body: `Bonjour ${s.name},\n\nMerci pour votre confiance ! Voici la copie de votre contrat, signé électroniquement le ${frDateTime(s.at)}.\n\n` +
      `${site ? `Votre site est en ligne : ${site.url}` : 'Votre site définitif arrive très vite : je vous envoie le lien dès qu\'il est en ligne.'}${access}\n\n` +
      `Premier paiement : ${money(c.monthly, c.currency)}${c.setupFee > 0 ? ` + ${money(c.setupFee, c.currency)} de mise en place` : ''}, à régler directement avec moi.\n\n` +
      `— Contrat —\n${terms}\n\nSigné par : ${s.name} (${s.email}${s.phone ? `, ${s.phone}` : ''}), le ${frDateTime(s.at)}.\n\nKouider — FIK Sites`,
  }).catch(e => console.error('[site-contract] mail client', e instanceof Error ? e.message : e));

  const msg = `✍️ CONTRAT SIGNÉ — ${c.business} : ${money(c.monthly, c.currency)}/mois${c.setupFee > 0 ? ` + ${money(c.setupFee, c.currency)} de mise en place` : ''}.\n` +
    `Signé par ${s.name} (${s.email}${s.phone ? `, ${s.phone}` : ''}).\n` +
    (site ? `🌐 Site définitif en ligne : ${site.url}\nCopie du contrat + identifiants envoyés au patron. 💰 Premier paiement à encaisser, puis dis-moi « ${c.business} a payé ».`
      : `❌ Le site définitif n'a pas pu être créé : ${err}. Dis-moi « crée le vrai site de ${c.business} ».`);
  await queueTelegramMessage(msg).catch(() => {});
  emitProactive(`✍️ Contrat signé : ${c.business}`, 'alert', msg, 'kouider');
  void autoCall(`contract:${c.slug}`, `Bonne nouvelle : ${c.business} vient de signer le contrat de son site, ${c.monthly} ${c.currency === '€' ? 'euros' : c.currency} par mois. ${site ? 'Le site définitif est déjà en ligne.' : 'Par contre le site définitif n\'a pas pu être créé, regarde Telegram.'}`, { level: 'normal' });
}

/** Outil fik_site_contract : create / status / list. */
export async function manageSiteContract(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'create');
  if (action === 'list') {
    const idx = JSON.parse((await kvGet(INDEX)) ?? '[]') as string[];
    if (!idx.length) return 'Aucun contrat FIK Sites pour l\'instant.';
    const rows = (await Promise.all(idx.slice(0, 30).map(getContract))).filter(Boolean) as SiteContract[];
    return `Contrats FIK Sites (${rows.length}) :\n${rows.map(c => `- ${c.business} — ${money(c.monthly, c.currency)}/mois — ${c.signed ? `✅ signé le ${frDateTime(c.signed.at)} par ${c.signed.name}${c.siteUrl ? ` → ${c.siteUrl}` : ''}` : `⏳ pas encore signé : ${contractLink(c.slug)}`}`).join('\n')}`;
  }
  const demo = await loadDemo(String(input['demo'] ?? ''));
  if (!demo) return '❌ Je ne trouve pas cette démo. Donne-moi le nom du commerce (celui de la démo envoyée).';
  const prev = await getContract(demo.slug);
  if (action === 'status') {
    if (!prev) return `Pas encore de contrat pour « ${demo.place.name} ».`;
    return prev.signed ? `✅ Signé par ${prev.signed.name} le ${frDateTime(prev.signed.at)}.${prev.siteUrl ? ` Site : ${prev.siteUrl}` : ''}${prev.error ? ` ⚠️ ${prev.error}` : ''}` : `⏳ Pas encore signé. Lien : ${contractLink(prev.slug)}`;
  }
  if (prev?.signed) return `✅ Le contrat de « ${prev.business} » est déjà signé (${frDateTime(prev.signed.at)}). Pour changer le prix : manage_client_site action=billing.`;
  const monthly = Number(input['monthly']);
  if (!(monthly > 0)) return '❌ Il me faut le prix mensuel (monthly), par exemple 3000 (DA) ou 15 (€).';
  const currency = String(input['currency'] ?? 'DA').trim().slice(0, 8) || 'DA';
  const email = String(input['client_email'] ?? '').trim().toLowerCase();
  if (email && !EMAIL.test(email)) return `❌ E-mail invalide : « ${email} ».`;
  const c: SiteContract = {
    slug: demo.slug, business: demo.place.name, monthly, currency,
    setupFee: Math.max(0, Number(input['setup_fee']) || 0), graceDays: Math.min(60, Math.max(3, Number(input['grace_days']) || 10)),
    email: email || null, createdAt: new Date().toISOString(),
  };
  await saveContract(c);
  const link = contractLink(c.slug);
  let sent = '';
  if (input['send'] === true && email) {
    await sendEmail('pro', {
      to: email, fromName: 'Kouider - FIK Sites', subject: `Votre contrat — site de ${c.business}`,
      body: `Bonjour,\n\nComme convenu, voici le contrat de votre site internet (${money(monthly, currency)}/mois, sans engagement).\n\n👉 Lire et signer en 1 minute : ${link}\n\nDès la signature, votre site passe en version définitive et vous recevez vos accès.\n\nKouider — FIK Sites`,
    }).then(() => { sent = `\n📧 Envoyé à ${email}.`; }).catch(e => { sent = `\n⚠️ Mail non envoyé (${e instanceof Error ? e.message : e}) : envoie le lien toi-même.`; });
  }
  return `📝 Contrat prêt pour « ${c.business} » : ${money(monthly, currency)}/mois${c.setupFee ? ` + ${money(c.setupFee, currency)} de mise en place` : ''}, sans engagement, pause après ${c.graceDays} j de retard.\n🔗 Lien de signature : ${link}${sent}\nDès qu'il signe : le site passe en version définitive tout seul, il reçoit la copie + ses accès, et je te préviens (Telegram + appel).`;
}
