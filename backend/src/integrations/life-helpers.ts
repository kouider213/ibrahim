/**
 * ASSISTANT DE VIE (27/10/2026) :
 *  - economies : chasseur d'économies perso (téléphone, internet, assurance, énergie, abonnements) — Kouider donne ses
 *    contrats, Dzaryx cherche moins cher (web, Belgique / France / Algérie), calcule le gain par an, prépare la lettre de
 *    résiliation. Re-vérifié chaque 1er du mois. app_kv `savings:subs`.
 *  - prof : prof perso — un sujet (anglais, arabe écrit, investissement…), une leçon de 10 min par jour à son heure sur
 *    Telegram + 3 questions ; ses réponses sont corrigées et la progression suivie. app_kv `tutor`.
 *  - conseil_sages : 3 conseillers (le Prudent, l'Audacieux, le Financier) débattent d'une décision, se répondent, puis votent.
 */
import { ai, jsonOf, kvJson, kvPut, tg, research, uid } from './ai-util.js';
import { localNow } from './morning-routine.js';

// ── Chasseur d'économies ─────────────────────────────────────────────────────
interface Sub { id: string; name: string; provider: string; price: number; per: 'mois' | 'an'; country: string; note?: string; lastCheck?: string; best?: string }
const SUBS = 'savings:subs';

export async function savingsTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const subs = await kvJson<Sub[]>(SUBS, []);
  if (action === 'add') {
    const name = String(input['name'] ?? '').trim();
    const price = Number(String(input['price'] ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
    if (!name || !(price > 0)) return '❌ Il me faut le contrat (name : « internet Proximus ») et son prix (price).';
    subs.push({ id: uid(), name, provider: String(input['provider'] ?? ''), price, per: input['per'] === 'an' ? 'an' : 'mois', country: String(input['country'] ?? 'BE'), note: String(input['note'] ?? '') || undefined });
    await kvPut(SUBS, subs);
    const yearly = subs.reduce((a, s) => a + (s.per === 'an' ? s.price : s.price * 12), 0);
    return `✅ Ajouté : ${name} — ${price} €/${input['per'] === 'an' ? 'an' : 'mois'}. Total de tes contrats suivis : ${Math.round(yearly)} €/an. Dis « cherche moins cher » quand tu veux.`;
  }
  if (action === 'remove') {
    const q = String(input['name'] ?? '').toLowerCase();
    await kvPut(SUBS, subs.filter(s => !s.name.toLowerCase().includes(q)));
    return '🗑️ Retiré.';
  }
  if (action === 'letter') {
    const s = subs.find(x => x.name.toLowerCase().includes(String(input['name'] ?? '').toLowerCase()));
    if (!s) return '❌ Quel contrat ?';
    return `✉️ Lettre de résiliation — ${s.name}\n\n` + await ai(`Écris une lettre de résiliation courte et correcte (${s.country === 'BE' ? 'droit belge' : s.country === 'FR' ? 'droit français' : 'droit algérien'}) pour le contrat « ${s.name} » chez ${s.provider || 'le fournisseur'} au nom de Kouider. Laisse [numéro client] et [adresse] à compléter. Mentionne la date de fin souhaitée et la demande de confirmation écrite.`, { max: 700 });
  }
  if (action === 'hunt') {
    const target = subs.filter(s => !input['name'] || s.name.toLowerCase().includes(String(input['name']).toLowerCase()));
    if (!target.length) return 'Aucun contrat suivi. Donne-moi tes abonnements (action add : téléphone, internet, assurance, énergie, streaming…).';
    const out = await research(`Kouider paie ces contrats :\n${target.map(s => `- ${s.name} (${s.provider || '?'}, ${s.country}) : ${s.price} €/${s.per}${s.note ? ` — ${s.note}` : ''}`).join('\n')}\n`
      + 'Pour CHACUN, cherche sur le web des offres équivalentes moins chères ACTUELLES dans son pays (même niveau de service). Donne : l\'offre trouvée (nom, prix, lien), le gain par an, les pièges (engagement, frais de résiliation). Termine par le TOTAL économisable par an. Pas de tableau.', { rounds: 10, sessionId: 'savings' });
    for (const s of target) s.lastCheck = new Date().toISOString();
    await kvPut(SUBS, subs);
    return `💸 Chasseur d'économies :\n\n${out}\n\nDis « prépare la lettre de résiliation pour … » si tu changes.`;
  }
  if (!subs.length) return 'Aucun contrat suivi pour l\'instant. Dis-moi tes abonnements : « internet Proximus 55 € par mois », « assurance auto AXA 620 € par an »…';
  const yearly = subs.reduce((a, s) => a + (s.per === 'an' ? s.price : s.price * 12), 0);
  return `💳 Tes contrats suivis (${Math.round(yearly)} €/an) :\n${subs.map(s => `• ${s.name}${s.provider ? ` (${s.provider})` : ''} — ${s.price} €/${s.per}${s.lastCheck ? ` · vérifié le ${s.lastCheck.slice(0, 10)}` : ''}`).join('\n')}`;
}

/** 1er du mois 10h : chasse automatique si des contrats sont suivis. */
export async function jobSavingsMonthly(): Promise<string> {
  const subs = await kvJson<Sub[]>(SUBS, []);
  if (!subs.length) return 'aucun contrat';
  await tg(await savingsTool({ action: 'hunt' }));
  return 'ok';
}

// ── Prof perso ───────────────────────────────────────────────────────────────
interface Tutor { subject: string; level: string; hour: string; lesson: number; history: Array<{ at: string; title: string; score?: number }>; pending?: { questions: string[]; answers: string[] } ; lastSent?: string }

export async function tutorTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'status');
  const t = await kvJson<Tutor | null>('tutor', null);
  if (action === 'start') {
    const subject = String(input['subject'] ?? '').trim();
    if (!subject) return '❌ Tu veux apprendre quoi ? (anglais, arabe écrit, investissement, comptabilité…)';
    const hh = /^(\d{1,2})(?:[h:](\d{2}))?$/.exec(String(input['hour'] ?? '').trim());
    const nt: Tutor = { subject, level: String(input['level'] ?? 'débutant'), hour: hh ? `${hh[1]!.padStart(2, '0')}:${hh[2] ?? '00'}` : '20:45', lesson: 0, history: [] };
    await kvPut('tutor', nt);
    return `🎓 C'est parti : ${subject} (niveau ${nt.level}). Chaque jour à ${nt.hour.replace(':', 'h')}, une leçon de 10 minutes sur Telegram + 3 questions. Réponds-moi et je corrige. Dis « leçon maintenant » pour commencer tout de suite.`;
  }
  if (!t) return 'Aucun cours en route. Dis « je veux apprendre l\'anglais, leçon à 21h » (action start).';
  if (action === 'stop') { await kvPut('tutor', null); return '⏹ Cours arrêté.'; }
  if (action === 'lesson') return lesson(t);
  if (action === 'answer') {
    if (!t.pending) return 'Pas de questions en attente : dis « leçon maintenant ».';
    const ans = String(input['answers'] ?? '').trim();
    const o = jsonOf<{ score?: number; feedback?: string }>(await ai(`Tu es le prof de Kouider (${t.subject}, niveau ${t.level}). Questions :\n${t.pending.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\nRéponses attendues :\n${t.pending.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}\nSes réponses : « ${ans} »\nCorrige avec bienveillance, explique chaque erreur en 1 phrase. Réponds UNIQUEMENT : {"score":0-3,"feedback":"correction"}`, { max: 700 })) ?? {};
    const last = t.history[t.history.length - 1];
    if (last) last.score = Number(o.score ?? 0);
    t.pending = undefined;
    const avg = t.history.filter(h => h.score !== undefined);
    if (avg.length >= 5 && avg.slice(-5).every(h => (h.score ?? 0) >= 3)) t.level = t.level === 'débutant' ? 'intermédiaire' : 'avancé';
    await kvPut('tutor', t);
    return `🎓 ${o.score ?? '?'}/3\n${o.feedback ?? ''}\n\nProgression : leçon ${t.lesson}, niveau ${t.level}.`;
  }
  const scored = t.history.filter(h => h.score !== undefined);
  return `🎓 ${t.subject} — niveau ${t.level}, ${t.lesson} leçon(s), moyenne ${scored.length ? (scored.reduce((a, h) => a + (h.score ?? 0), 0) / scored.length).toFixed(1) : '—'}/3. Leçon chaque jour à ${t.hour.replace(':', 'h')}.`;
}

async function lesson(t: Tutor): Promise<string> {
  const o = jsonOf<{ title?: string; lesson?: string; questions?: string[]; answers?: string[] }>(await ai(
`Tu es un excellent prof particulier. Élève : Kouider (adulte, entrepreneur, français, parle aussi darija). Matière : ${t.subject}. Niveau : ${t.level}. Leçon n°${t.lesson + 1}.
Déjà vu : ${t.history.slice(-12).map(h => h.title).join(' ; ') || 'rien'}.
Prépare la leçon suivante (10 minutes de lecture, concrète, exemples tirés de sa vie : location de voitures, Oran, Bruxelles, famille), puis 3 questions courtes.
Réponds UNIQUEMENT : {"title":"titre","lesson":"la leçon (texte clair, 15-25 lignes)","questions":["q1","q2","q3"],"answers":["r1","r2","r3"]}`, { quality: true, max: 2000 })) ?? {};
  t.lesson++;
  t.history.push({ at: new Date().toISOString(), title: String(o.title ?? `Leçon ${t.lesson}`) });
  t.pending = { questions: o.questions ?? [], answers: o.answers ?? [] };
  t.lastSent = localNow().date;
  await kvPut('tutor', t);
  return `🎓 ${t.subject} — leçon ${t.lesson} : ${o.title ?? ''}\n\n${o.lesson ?? ''}\n\n❓ À toi :\n${(o.questions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nRéponds-moi ici, je corrige.`;
}

/** Toutes les 15 min : leçon du jour à son heure. */
export async function jobTutor(): Promise<string> {
  const t = await kvJson<Tutor | null>('tutor', null);
  const { date, hhmm } = localNow();
  if (!t || t.lastSent === date || hhmm < t.hour) return 'rien';
  await tg(await lesson(t));
  return 'leçon envoyée';
}

// ── Conseil des sages ────────────────────────────────────────────────────────
const SAGES = [
  { name: 'Le Prudent', icon: '🛡️', mind: 'protège ce qui existe : risques, trésorerie, famille, réputation, plan B. Il cite ce qui pourrait mal tourner.' },
  { name: 'L\'Audacieux', icon: '🚀', mind: 'voit l\'opportunité : vitesse, croissance, coup d\'avance sur les concurrents, regret de ne pas avoir osé.' },
  { name: 'Le Financier', icon: '💶', mind: 'ne croit que les chiffres : coût, retour sur investissement, délai de remboursement, cash bloqué, scénario pessimiste.' },
];

export async function councilTool(input: Record<string, unknown>): Promise<string> {
  const q = String(input['question'] ?? '').trim();
  if (!q) return '❌ Quelle décision soumettre au conseil ?';
  const facts = input['facts'] ? `Infos données par Kouider : ${String(input['facts'])}` : '';
  const sys = 'Kouider : FIK Conciergerie (location de voitures à Oran, sites web FIK Sites), vit à Bruxelles, marié, un fils de 1,5 an. Tutoie-le. Français parlé, direct.';
  // Tour 1 : chacun donne son avis (en parallèle)
  const first = await Promise.all(SAGES.map(s => ai(`Tu es ${s.name} du conseil des sages de Kouider. Ta façon de penser : ${s.mind}\nDécision : « ${q} ». ${facts}\nDonne ton avis en 4 phrases maximum, avec UN argument fort et concret.`, { system: sys, quality: true, max: 350 })));
  // Tour 2 : chacun répond aux deux autres
  const debate = first.map((t, i) => `${SAGES[i]!.icon} ${SAGES[i]!.name} : ${t}`).join('\n\n');
  const second = await Promise.all(SAGES.map(s => ai(`Tu es ${s.name}. Voici le premier tour du débat :\n${debate}\n\nRéponds aux autres en 2 phrases (d'accord / pas d'accord et pourquoi), puis ton VOTE : POUR, CONTRE ou POUR SOUS CONDITION (dis laquelle). Format : « réponse… VOTE : … »`, { system: sys, quality: true, max: 250 })));
  const votes = second.map(t => /VOTE\s*:\s*([^\n.]+)/i.exec(t)?.[1]?.trim() ?? '?');
  const verdict = await ai(`Débat sur « ${q} » :\n${debate}\n\nDeuxième tour :\n${second.map((t, i) => `${SAGES[i]!.name} : ${t}`).join('\n')}\n\nEn 3 lignes : la décision du conseil (majorité), la condition la plus importante, et la première action à faire demain.`, { system: sys, quality: true, max: 300 });
  return `🏛️ Conseil des sages — « ${q} »\n\n${debate}\n\n— Deuxième tour —\n${second.map((t, i) => `${SAGES[i]!.icon} ${t}`).join('\n')}\n\n🗳️ Votes : ${SAGES.map((s, i) => `${s.name} → ${votes[i]}`).join(' · ')}\n\n⚖️ ${verdict}`;
}
