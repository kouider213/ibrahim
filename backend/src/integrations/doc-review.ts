/**
 * AVOCAT DE POCHE + SECRÉTAIRE ADMINISTRATIF (27/10/2026)
 *  - avocat_de_poche : avant de signer (bail, achat de voiture, partenariat, contrat de location, devis) → ce que dit le
 *    contrat en clair, les PIÈGES (clause par clause), ce qui manque, les phrases à faire modifier, et une note de risque.
 *    Ne remplace pas un avocat pour les gros enjeux (il le dit quand c'est le cas).
 *  - courrier_admin : photo d'un courrier (impôts, commune, banque, assurance, CAF/mutuelle, douane, administration
 *    algérienne…) → ce que c'est, ce qu'on attend de lui, l'ÉCHÉANCE (mise dans l'agenda), la réponse prête, et rangé.
 * Le document : la photo qu'il vient d'envoyer, ou le texte (ex. pièce jointe lue avec read_email_attachment).
 * Courriers rangés dans app_kv `courriers` (jamais dans le dépôt public).
 */
import { ai, jsonOf, kvJson, kvPut, lastPhoto, uid } from './ai-util.js';

async function source(input: Record<string, unknown>, sessionId?: string): Promise<{ text: string; images: Array<{ base64: string; mime: string }> } | string> {
  const text = String(input['text'] ?? '').trim();
  if (text.length > 40) return { text: text.slice(0, 60_000), images: [] };
  const img = await lastPhoto(sessionId);
  if (img) return { text, images: [img] };
  return '❌ Il me faut le document : envoie-moi la photo (page par page si besoin), ou transfère le mail avec le PDF et je le lis.';
}

export async function lawyerTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const src = await source(input, sessionId);
  if (typeof src === 'string') return src;
  const role = String(input['role'] ?? '').trim();
  return `⚖️ Avocat de poche — lecture du contrat :\n\n` + await ai(
`Tu es l'avocat de poche de Kouider (FIK Conciergerie : location de voitures à Oran, il vit à Bruxelles). Il va peut-être SIGNER ce document${role ? ` (il est : ${role})` : ''}.
${src.text ? `Texte du document :\n${src.text}\n` : 'Le document est sur l\'image.'}
Réponds en français simple, tutoie-le, sans tableau :
1. 📄 Ce que c'est et ce qu'il s'engage à faire (3-5 lignes).
2. ⚠️ Les PIÈGES, du plus grave au moins grave : pour chacun, la clause (citée courte), pourquoi c'est risqué pour LUI, et la phrase de remplacement à proposer.
3. ❓ Ce qui MANQUE (durée, résiliation, pénalités, assurance, caution, état des lieux, juridiction…).
4. 🚦 Verdict : signer / signer après modifications / ne pas signer — et un risque de 1 à 10.
Droit applicable : belge ou algérien selon le document (dis lequel). Si l'enjeu est gros (achat immobilier, associé, > 10 000 €), dis-lui de faire relire par un vrai avocat ou notaire.
N'invente aucune clause : si l'image est illisible à un endroit, dis-le.`, { quality: true, max: 2200, images: src.images });
}

interface Letter { id: string; at: string; from: string; subject: string; deadline?: string; action: string; done?: boolean }

export async function letterTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (String(input['action'] ?? '') === 'list') {
    const l = (await kvJson<Letter[]>('courriers', [])).filter(x => !x.done);
    return l.length ? `📬 Courriers en attente :\n${l.map(x => `• ${x.from} — ${x.subject}${x.deadline ? ` (avant le ${x.deadline})` : ''} → ${x.action}`).join('\n')}` : 'Aucun courrier en attente.';
  }
  if (String(input['action'] ?? '') === 'done') {
    const q = String(input['text'] ?? '').toLowerCase();
    const l = await kvJson<Letter[]>('courriers', []);
    l.forEach(x => { if (!q || `${x.from} ${x.subject}`.toLowerCase().includes(q)) x.done = true; });
    await kvPut('courriers', l); return '✅ Courrier(s) classé(s) comme traité(s).';
  }
  const src = await source(input, sessionId);
  if (typeof src === 'string') return src;
  const raw = await ai(
`Tu es le secrétaire administratif de Kouider (vit à Bruxelles, entreprise à Oran). Voici un courrier qu'il a reçu${src.text ? ` :\n${src.text}` : ' (image)'}.
Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.
Réponds UNIQUEMENT avec ce JSON :
{"from":"expéditeur","subject":"de quoi il s'agit en 6 mots","explain":"ce que dit le courrier en français simple, 3-5 lignes (traduis s'il est en néerlandais, arabe…)","todo":"ce qu'il doit faire, concret","deadline":"AAAA-MM-JJ si une date limite existe, sinon vide","amount":"montant à payer si présent, sinon vide","risk":"ce qui arrive s'il ne fait rien, 1 phrase","reply":"brouillon de réponse ou de mail si une réponse est utile, sinon vide"}`, { quality: true, max: 1600, images: src.images });
  const o = jsonOf<{ from?: string; subject?: string; explain?: string; todo?: string; deadline?: string; amount?: string; risk?: string; reply?: string }>(raw);
  if (!o) return `📬 ${raw}`;
  const l = await kvJson<Letter[]>('courriers', []);
  l.push({ id: uid(), at: new Date().toISOString(), from: String(o.from ?? '?'), subject: String(o.subject ?? ''), deadline: o.deadline || undefined, action: String(o.todo ?? '') });
  await kvPut('courriers', l.slice(-100));
  let agenda = '';
  if (o.deadline && /^\d{4}-\d{2}-\d{2}$/.test(o.deadline)) {
    // Rappel 3 jours avant l'échéance (ou le jour même si c'est très proche)
    const remind = new Date(Math.max(Date.parse(o.deadline) - 3 * 86_400_000, Date.now() + 3600_000));
    const { executeTool } = await import('./tool-executor.js');
    const r = await executeTool('create_agenda_event', { title: `📬 ${o.from} — ${o.subject} (échéance ${o.deadline})`, start_datetime: `${remind.toISOString().slice(0, 10)}T09:00:00`, end_datetime: `${remind.toISOString().slice(0, 10)}T09:15:00`, description: `${o.todo ?? ''}${o.amount ? `\nMontant : ${o.amount}` : ''}` }, sessionId ?? 'courrier').catch(() => '');
    agenda = /❌|erreur/i.test(r) ? `\n⚠️ Rappel d'agenda pas créé : ${r.slice(0, 120)}` : `\n📅 Rappel mis dans ton agenda le ${remind.toISOString().slice(0, 10)}.`;
  }
  return `📬 ${o.from} — ${o.subject}\n${o.explain ?? ''}\n\n👉 À faire : ${o.todo ?? '—'}${o.deadline ? `\n⏰ Avant le : ${o.deadline}` : ''}${o.amount ? `\n💶 Montant : ${o.amount}` : ''}\n⚠️ Si tu ne fais rien : ${o.risk ?? '—'}${agenda}`
    + (o.reply ? `\n\n✍️ Réponse prête :\n${o.reply}\n(Je peux l'envoyer par mail après ton oui.)` : '');
}
