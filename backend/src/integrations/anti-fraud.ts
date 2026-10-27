/**
 * ANTI-ARNAQUE (27/10/2026) : un client envoie une preuve de paiement (BaridiMob, CCP, virement, CIB), une pièce d'identité
 * ou un permis → Dzaryx cherche les signes de faux AVANT que Kouider donne les clés :
 *   - lecture fine de l'image (Sonnet) : polices/chiffres qui ne s'alignent pas, date/heure impossibles, montant incohérent ;
 *   - même reçu déjà présenté (même référence ou image quasi identique) → app_kv `fraud:receipts` ;
 *   - logiciel de retouche dans les métadonnées du fichier ;
 *   - numéros signalés par Kouider → app_kv `fraud:numbers`.
 * Verdict prudent : un « OK » ne remplace jamais la vérification du solde dans l'appli de la banque.
 */
import { kvGet, kvSet } from './app-store.js';
import { vision, jsonOf, imageHash, hashDistance, type Img } from './media-util.js';

interface Receipt { at: string; hash: string; ref: string; amount: string; who: string }
interface Flag { phone: string; reason: string; at: string }

const PROMPT = (ctx: string) => `Tu es l'expert anti-fraude de FIK Conciergerie (location de voitures, Oran / Bruxelles). Kouider reçoit cette image d'un client.
${ctx}
Examine-la comme un enquêteur : est-ce un document AUTHENTIQUE ou retouché / fabriqué / réutilisé ?
Indices de faux : chiffres ou lettres d'une police / taille / couleur / netteté différente du reste, chiffres mal alignés, fond retouché autour du montant,
date ou heure impossible (futur, jour inexistant, heure > 23:59), format de date incohérent, référence de transaction absente ou trop courte,
montant en chiffres ≠ montant en lettres, solde incohérent, barre d'état du téléphone coupée ou incohérente, logo flou, capture d'une capture,
pour une pièce d'identité / permis : photo collée, textes décalés, date d'expiration passée, MRZ incohérente, âge incohérent avec la photo.
Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.
Réponds UNIQUEMENT avec ce JSON :
{"type":"recu_baridimob|recu_ccp|virement|cib|piece_identite|permis|autre","amount":"montant + devise lus ou vide","date":"date/heure lues ou vide",
"reference":"n° de transaction / référence / n° du document, recopié exactement, ou vide","sender":"émetteur / titulaire lu ou vide","receiver":"bénéficiaire / RIP lu ou vide",
"expiry":"date d'expiration (papiers) ou vide","anomalies":["chaque indice précis trouvé"],"verdict":"ok|douteux|faux_probable","confidence":0-100}`;

const EDITORS = /photoshop|picsart|snapseed|lightroom|gimp|canva|pixlr|facetune|picsay|photo editor|adobe/i;

async function list<T>(key: string): Promise<T[]> {
  try { return JSON.parse((await kvGet(key)) || '[]') as T[]; } catch { return []; }
}

export async function checkImage(img: Img, ctx: { client?: string; expected_amount?: string; phone?: string }): Promise<string> {
  const context = [ctx.client ? `Client : ${ctx.client}.` : '', ctx.expected_amount ? `Montant attendu : ${ctx.expected_amount}.` : ''].filter(Boolean).join(' ');
  const [raw, hash] = await Promise.all([
    vision([img], PROMPT(context), { quality: true, maxTokens: 1000 }),
    imageHash(img.base64).catch(() => ''),
  ]);
  const a = jsonOf<{ type?: string; amount?: string; date?: string; reference?: string; sender?: string; receiver?: string; expiry?: string;
    anomalies?: string[]; verdict?: string; confidence?: number }>(raw);
  if (!a) return '❌ Je n\'arrive pas à lire cette image. Renvoie-la en meilleure qualité (en fichier si possible).';

  const flags: string[] = [...(a.anomalies ?? []).map(String)];
  // Métadonnées : logiciel de retouche (les fichiers envoyés en « document » gardent leurs métadonnées)
  const head = Buffer.from(img.base64.slice(0, 90_000), 'base64').toString('latin1');
  const editor = head.match(EDITORS)?.[0];
  if (editor) flags.push(`le fichier a été enregistré par un logiciel de retouche (${editor})`);

  // Reçu déjà présenté ?
  const receipts = await list<Receipt>('fraud:receipts');
  const ref = String(a.reference ?? '').replace(/\s+/g, '');
  const isPayment = /recu|virement|cib/.test(String(a.type));
  const twin = receipts.find(r => (ref.length >= 6 && r.ref === ref) || (hash && r.hash && hashDistance(r.hash, hash) <= 4));
  if (twin) flags.unshift(`⚠️ MÊME REÇU déjà présenté le ${new Date(twin.at).toLocaleDateString('fr-FR')}${twin.who ? ` (${twin.who})` : ''} — réf. ${twin.ref || 'image identique'}`);
  else if (isPayment && (ref || hash)) {
    receipts.push({ at: new Date().toISOString(), hash, ref, amount: String(a.amount ?? ''), who: ctx.client ?? '' });
    await kvSet('fraud:receipts', JSON.stringify(receipts.slice(-500))).catch(() => {});
  }
  // Papiers périmés
  const exp = Date.parse(String(a.expiry ?? '').split('/').reverse().join('-'));
  if (Number.isFinite(exp) && exp < Date.now()) flags.push(`document EXPIRÉ (${a.expiry})`);
  // Numéro signalé
  if (ctx.phone) {
    const d = ctx.phone.replace(/\D/g, '').slice(-9);
    const hit = (await list<Flag>('fraud:numbers')).find(f => f.phone.endsWith(d));
    if (hit) flags.unshift(`⚠️ numéro SIGNALÉ le ${new Date(hit.at).toLocaleDateString('fr-FR')} : ${hit.reason}`);
  }

  const verdict = twin || flags.some(f => f.startsWith('⚠️')) ? 'faux_probable' : String(a.verdict ?? 'douteux');
  const head1 = verdict === 'ok' && !flags.length ? '✅ Aucun signe de faux trouvé'
    : verdict === 'faux_probable' ? '🚨 FAUX PROBABLE — ne donne pas les clés' : '⚠️ DOUTEUX — vérifie avant de donner les clés';
  return [`🛡️ Anti-arnaque : ${head1} (confiance ${a.confidence ?? '?'} %)`,
    `Type : ${a.type ?? '?'}${a.amount ? ` · Montant : ${a.amount}` : ''}${a.date ? ` · Date : ${a.date}` : ''}${a.reference ? ` · Réf. : ${a.reference}` : ''}`,
    a.sender || a.receiver ? `De : ${a.sender || '?'} → À : ${a.receiver || '?'}` : '',
    ctx.expected_amount ? `Montant attendu : ${ctx.expected_amount}` : '',
    flags.length ? `Indices :\n${flags.map(f => `• ${f}`).join('\n')}` : '',
    isPayment ? '👉 Dans tous les cas : vérifie dans TON appli (BaridiMob / banque) que l\'argent est bien arrivé avant de remettre la voiture.' : '',
  ].filter(Boolean).join('\n');
}

export async function antiFraudTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const action = String(input['action'] ?? 'check');
  if (action === 'report_number') {
    const phone = String(input['phone'] ?? '').replace(/[^\d+]/g, '');
    if (phone.replace(/\D/g, '').length < 8) return '❌ numéro invalide.';
    const all = await list<Flag>('fraud:numbers');
    all.push({ phone, reason: String(input['reason'] ?? 'signalé par Kouider').slice(0, 200), at: new Date().toISOString() });
    await kvSet('fraud:numbers', JSON.stringify(all.slice(-300)));
    return `🚩 Numéro ${phone} signalé. Je préviendrai Kouider si ce numéro réapparaît (paiement, WhatsApp, réservation).`;
  }
  if (action === 'check_number') {
    const d = String(input['phone'] ?? '').replace(/\D/g, '').slice(-9);
    const hit = (await list<Flag>('fraud:numbers')).find(f => f.phone.endsWith(d));
    return hit ? `⚠️ Numéro SIGNALÉ le ${new Date(hit.at).toLocaleDateString('fr-FR')} : ${hit.reason}` : '✅ Ce numéro n\'est pas dans les numéros signalés.';
  }
  if (action === 'list_numbers') {
    const all = await list<Flag>('fraud:numbers');
    return all.length ? all.map(f => `• ${f.phone} — ${f.reason} (${new Date(f.at).toLocaleDateString('fr-FR')})`).join('\n') : 'Aucun numéro signalé.';
  }
  let img: Img | null = null;
  if (sessionId) {
    const { redis } = await import('../queue/queue.js');
    const c = await redis.get(`session:image:${sessionId}`).catch(() => null);
    if (c) { const j = JSON.parse(c) as { base64: string; mime?: string }; img = { base64: j.base64, mime: j.mime ?? 'image/jpeg' }; }
  }
  if (!img) return '❌ Pas d\'image : demande à Kouider d\'envoyer la capture du paiement ou la photo du document (de préférence en fichier, pour garder les métadonnées).';
  return checkImage(img, { client: input['client'] as string | undefined, expected_amount: input['expected_amount'] as string | undefined, phone: input['phone'] as string | undefined });
}
