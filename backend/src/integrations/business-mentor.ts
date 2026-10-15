import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';
import { runReadOnlyAgent } from './readonly-agent.js';
import { kouiderDossierText, isDayOff } from './kouider-dossier.js';
import { getAutoOpportunities } from './opportunities.js';
import { startDossierJob, writeDossier } from './pro-doc.js';
import { createMissionTool } from './missions.js';
import { autoCall } from '../notifications/auto-call.js';
import { emitProactive } from '../notifications/mobile-push.js';
import { queueTelegramMessage } from '../notifications/tg-outbox.js';

// LE CONSEILLER BUSINESS (demande de Kouider 2026-10-15) : Dzaryx agit comme un homme d'affaires qui a réussi
// (société à plusieurs millions d'euros de CA) et qui s'occupe du business de Kouider. Chaque jour travaillé
// (pas lundi ni jeudi, ses jours en famille) il fait sa propre analyse — données FIK + recherche web + actualité —
// et APPELLE Kouider avec UNE vraie proposition : idée, nouveau projet, plan, « contacte X pour ça », risque ou
// opportunité. Le détail complet part par écrit sur Telegram et dans l'app. Kouider peut ensuite dire
// « mets-le sur papier » (dossier Google Docs) ou « exécute » (mission suivie par Dzaryx).
// Veille d'actualité en plus (2×/jour) : un risque ou une opportunité URGENTE → appel tout de suite.
// Historique : app_kv `mentor:history` (pour ne jamais répéter la même idée).

const HISTORY_KEY = 'mentor:history';
const ALERTS_KEY  = 'mentor:alerts:seen';
const TZ = 'Europe/Brussels';

export type MentorKind = 'idee' | 'projet' | 'plan' | 'contact' | 'risque' | 'opportunite' | 'conseil';

export interface MentorIdea {
  id: string;
  at: string;
  kind: MentorKind;
  title: string;
  spoken: string;        // ce qui est dit au téléphone
  detail: string;        // l'analyse complète écrite
  steps: string[];       // plan d'action concret
  contacts: string[];    // qui contacter et pourquoi
  numbers: string;       // chiffres : investissement, gain espéré, délai
  sources: string[];
  urgency: 'normal' | 'urgent';
  status?: 'proposee' | 'sur_papier' | 'en_cours' | 'refusee';
}

async function history(): Promise<MentorIdea[]> {
  try { return JSON.parse((await kvGet(HISTORY_KEY)) ?? '[]') as MentorIdea[]; } catch { return []; }
}
async function saveHistory(list: MentorIdea[]): Promise<void> {
  await kvSet(HISTORY_KEY, JSON.stringify(list.slice(-40)));
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

const MENTOR_SYSTEM = `Tu es le CONSEILLER BUSINESS personnel de Kouider : un entrepreneur qui a réussi, qui dirige une société à plusieurs millions d'euros de chiffre d'affaires, et qui met toute son expérience au service du business de Kouider comme si c'était le sien.
Tu penses en patron : chiffre d'affaires, marge, cash, risque, effet de levier, réseau, timing. Tu ne fais pas de généralités : tu proposes UNE chose précise que Kouider peut décider aujourd'hui.

Ta méthode :
1. Regarde l'état réel de FIK (réservations, finances, flotte, prospects, saisons, avis) avec tes outils de lecture.
2. Cherche sur le web ce qui bouge maintenant (Oran, Algérie, diaspora, Belgique/Europe, auto, tourisme, immobilier, devises, lois, concurrents, nouvelles tendances).
3. Choisis LA meilleure proposition du jour parmi : une idée pour gagner plus, un nouveau projet, un plan pour un objectif, une personne ou entreprise précise à contacter (nom réel, pourquoi, quoi lui dire), un risque à parer, une opportunité à saisir, un conseil de patron.
4. Chiffre-la (investissement, gain espéré, délai) — en indiquant clairement ce qui est estimé.

Règles : n'invente aucun fait ni contact (un contact = une entreprise/organisme réel trouvé dans tes recherches ou dans les données). Ne répète pas une idée déjà proposée (historique fourni). Varie les sujets d'un jour à l'autre. Tu tutoies Kouider, tu parles comme un mentor direct et bienveillant.

Réponds UNIQUEMENT avec ce JSON (aucun texte autour) :
{"kind":"idee|projet|plan|contact|risque|opportunite|conseil","title":"titre court","spoken":"ce que tu lui dis au téléphone : 4 à 7 phrases orales, naturelles, sans chiffre illisible ni liste, qui finissent par une question (« tu veux que je te le mette sur papier ou que je m'en occupe ? »)","detail":"l'analyse complète écrite (8 à 15 phrases : contexte, pourquoi maintenant, comment, risques)","steps":["étape concrète 1","..."],"contacts":["Nom réel — pourquoi — quoi lui dire"],"numbers":"investissement / gain espéré / délai (estimations signalées)","sources":["url ou source"],"urgency":"normal|urgent"}
urgency = urgent UNIQUEMENT si attendre quelques jours coûte de l'argent ou fait rater l'occasion.`;

function parseIdea(text: string): MentorIdea | null {
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  try {
    const o = JSON.parse(text.slice(a, z + 1)) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 10) : []);
    const kinds: MentorKind[] = ['idee', 'projet', 'plan', 'contact', 'risque', 'opportunite', 'conseil'];
    const idea: MentorIdea = {
      id: randomUUID().slice(0, 8),
      at: new Date().toISOString(),
      kind: kinds.includes(o['kind'] as MentorKind) ? o['kind'] as MentorKind : 'idee',
      title: String(o['title'] ?? '').trim(),
      spoken: String(o['spoken'] ?? '').trim(),
      detail: String(o['detail'] ?? '').trim(),
      steps: arr(o['steps']), contacts: arr(o['contacts']), sources: arr(o['sources']),
      numbers: String(o['numbers'] ?? '').trim(),
      urgency: o['urgency'] === 'urgent' ? 'urgent' : 'normal',
      status: 'proposee',
    };
    return idea.title && idea.spoken.length > 40 ? idea : null;
  } catch { return null; }
}

export function ideaText(i: MentorIdea): string {
  const label: Record<MentorKind, string> = { idee: '💡 Idée', projet: '🚀 Nouveau projet', plan: '🗺️ Plan', contact: '🤝 À contacter',
    risque: '⚠️ Risque', opportunite: '📈 Opportunité', conseil: '🎯 Conseil' };
  return [
    `${label[i.kind]} — ${i.title}`,
    '',
    i.detail,
    i.steps.length ? `\nPlan d'action :\n${i.steps.map((s, n) => `${n + 1}. ${s}`).join('\n')}` : '',
    i.contacts.length ? `\nÀ contacter :\n${i.contacts.map(c => `• ${c}`).join('\n')}` : '',
    i.numbers ? `\nChiffres : ${i.numbers}` : '',
    i.sources.length ? `\nSources : ${i.sources.slice(0, 5).join(' · ')}` : '',
    '\nRéponds « mets-le sur papier » pour un dossier complet, ou « exécute » et je m\'en occupe.',
  ].filter(Boolean).join('\n');
}

/** Génère UNE proposition (recherche web + données FIK). focus = sujet imposé par Kouider (facultatif). */
export async function generateMentorIdea(focus = ''): Promise<MentorIdea | null> {
  const [dossier, past, opps] = await Promise.all([
    kouiderDossierText().catch(() => ''),
    history(),
    getAutoOpportunities(false).catch(() => null),
  ]);
  const pastText = past.slice(-20).map(p => `- ${p.at.slice(0, 10)} [${p.kind}] ${p.title}${p.status && p.status !== 'proposee' ? ` (${p.status})` : ''}`).join('\n');
  const oppText = (opps?.items ?? []).slice(0, 8).map(o => `- [${o.category}/${o.urgency}] ${o.title} : ${o.detail.slice(0, 200)}`).join('\n');
  const instruction = [
    dossier,
    `Aujourd'hui : ${new Date().toLocaleDateString('fr-BE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
    focus ? `SUJET DEMANDÉ PAR KOUIDER : ${focus}` : 'Choisis toi-même le sujet le plus rentable pour lui aujourd\'hui.',
    'Fais l\'analyse COMPLÈTE (données FIK + web), même si c\'est un jour de congé : soit Kouider la demande lui-même, soit elle lui est dite un jour travaillé.',
    pastText ? `DÉJÀ PROPOSÉ (ne pas répéter) :\n${pastText}` : '',
    oppText ? `VEILLE DU JOUR (piste, à vérifier/approfondir) :\n${oppText}` : '',
    'Fais tes recherches (données FIK + web), puis réponds avec le JSON.',
  ].filter(Boolean).join('\n\n');

  const run = await runReadOnlyAgent(instruction, { system: MENTOR_SYSTEM, sessionId: 'business_mentor', maxRounds: 12, maxTokens: 4000, quality: true });
  return parseIdea(run.text);
}

async function deliver(idea: MentorIdea, callKey: string): Promise<void> {
  const list = await history();
  list.push(idea);
  await saveHistory(list);
  const text = ideaText(idea);
  await queueTelegramMessage(text).catch(() => {});
  emitProactive(`${idea.title}`.slice(0, 100), idea.urgency === 'urgent' ? 'alert' : 'info', text);
  await autoCall(callKey, idea.spoken, { level: idea.urgency });
}

/** Tâche quotidienne (11h Bruxelles) : l'appel « conseiller » du jour. Pas les jours de congé. */
export async function jobBusinessMentor(): Promise<void> {
  if (await isDayOff()) { console.log('[mentor] jour de congé — pas de conseil business aujourd\'hui'); return; }
  const idea = await generateMentorIdea();
  if (!idea) { console.warn('[mentor] aucune proposition exploitable'); return; }
  await deliver(idea, `mentor:${today()}`);
  console.log(`[mentor] ${idea.kind} — ${idea.title}`);
}

const ALERT_SYSTEM = `Tu surveilles l'actualité pour Kouider (FIK Conciergerie : location de voitures et conciergerie à Oran, Algérie ; il vit à Bruxelles ; clients surtout diaspora).
Cherche sur le web les nouvelles des DERNIÈRES 24-48 HEURES qui changent quelque chose pour son business : lois/décrets (import, change, location, fiscalité), devises euro-dinar, vols/ports/visas/frontières, carburant, sécurité, grève, météo extrême à Oran, gros événement à Oran, concurrent, opportunité qui se ferme vite.
Ne remonte QUE ce qui est vraiment important et nouveau. Si rien de tel : {"items":[]}.
Réponds UNIQUEMENT avec ce JSON : {"items":[{"title":"...","what":"ce qui se passe (2-3 phrases, avec la source)","impact":"risque|opportunite","why_for_kouider":"ce que ça change pour lui","action":"ce qu'il devrait faire","spoken":"3-4 phrases orales pour le lui dire au téléphone","urgent":true|false}]}`;

/** Veille actu (2×/jour) : un risque/une opportunité URGENTE → appel tout de suite ; le reste par message. */
export async function jobMentorNewsWatch(): Promise<void> {
  const run = await runReadOnlyAgent('Fais la veille maintenant (recherche web), puis réponds avec le JSON.',
    { system: ALERT_SYSTEM, sessionId: 'business_mentor', maxRounds: 8, maxTokens: 2500 });
  const a = run.text.indexOf('{'), z = run.text.lastIndexOf('}');
  let items: Array<{ title: string; what: string; impact: string; why_for_kouider: string; action: string; spoken: string; urgent: boolean }> = [];
  try { items = (JSON.parse(run.text.slice(a, z + 1)).items ?? []).filter((i: { title?: string }) => i?.title); } catch { return; }
  if (!items.length) return;

  let seen: string[] = [];
  try { seen = JSON.parse((await kvGet(ALERTS_KEY)) ?? '[]') as string[]; } catch { /* vide */ }
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim().slice(0, 60);
  const fresh = items.filter(i => !seen.includes(norm(i.title))).slice(0, 3);
  if (!fresh.length) return;
  await kvSet(ALERTS_KEY, JSON.stringify([...seen, ...fresh.map(i => norm(i.title))].slice(-60)), 14 * 86_400);

  for (const i of fresh) {
    const text = `${i.impact === 'risque' ? '⚠️ Risque' : '📈 Opportunité'} — ${i.title}\n\n${i.what}\n\nPour toi : ${i.why_for_kouider}\nÀ faire : ${i.action}`;
    await queueTelegramMessage(text).catch(() => {});
    emitProactive(i.title.slice(0, 100), i.urgent ? 'alert' : 'info', text);
    if (i.urgent && i.spoken) await autoCall(`news:${norm(i.title)}`, `Une actu importante pour toi. ${i.spoken}`, { level: 'urgent' });
  }
  console.log(`[mentor] veille : ${fresh.length} nouvelle(s)`);
}

function findIdea(list: MentorIdea[], ref: string): MentorIdea | undefined {
  const r = ref.trim().toLowerCase();
  if (!r) return list[list.length - 1];
  return list.find(i => i.id === ref) ?? [...list].reverse().find(i => i.title.toLowerCase().includes(r));
}

/** Outil business_mentor (Kouider uniquement). */
export async function businessMentorTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  if (/houari/i.test(sessionId ?? '')) return '❌ Réservé à Kouider.';
  const action = String(input['action'] ?? 'history');
  const ref = String(input['idea'] ?? '');

  if (action === 'new') {
    const focus = String(input['focus'] ?? '').trim();
    void (async () => {
      const idea = await generateMentorIdea(focus).catch(() => null);
      if (!idea) { await queueTelegramMessage('❌ Je n\'ai pas réussi à sortir une proposition solide, je réessaie plus tard.').catch(() => {}); return; }
      const list = await history(); list.push(idea); await saveHistory(list);
      const text = ideaText(idea);
      await queueTelegramMessage(text).catch(() => {});
      emitProactive(idea.title.slice(0, 100), 'info', text);
    })();
    return `⏳ Je fais l'analyse${focus ? ` sur « ${focus} »` : ''} (recherche web + tes chiffres, 1 à 3 minutes). Le détail arrive sur Telegram et dans l'app.`;
  }

  const list = await history();
  if (action === 'history') {
    if (!list.length) return 'Aucune proposition encore. Dis « donne-moi une idée business » et je fais l\'analyse.';
    return list.slice(-10).reverse().map(i => `• [${i.id}] ${i.at.slice(0, 10)} ${i.kind} — ${i.title} (${i.status ?? 'proposee'})`).join('\n');
  }

  const idea = findIdea(list, ref);
  if (!idea) return '❌ Je ne retrouve pas cette proposition. Utilise action=history pour la liste.';
  const setStatus = async (s: MentorIdea['status']) => { idea.status = s; await saveHistory(list); };

  if (action === 'show') return ideaText(idea);
  if (action === 'reject') { await setStatus('refusee'); return `👍 Je laisse tomber « ${idea.title} » et je n'y reviens pas.`; }
  if (action === 'paper') {
    await setStatus('sur_papier');
    const material = ideaText(idea) + `\n\nProposé le ${idea.at.slice(0, 10)} par Dzaryx, conseiller business de Kouider.`;
    return startDossierJob(`Plan — ${idea.title}`, () => writeDossier(`Plan — ${idea.title}`,
      'Business plan interne pour Kouider (décideur) : contexte, opportunité, plan d\'action détaillé, contacts, chiffres, risques, prochaines étapes.', material));
  }
  if (action === 'execute') {
    await setStatus('en_cours');
    const r = await createMissionTool({
      title: `Suivi — ${idea.title}`.slice(0, 60),
      instruction: `Kouider a validé ce plan, suis son avancement et dis-lui chaque semaine la prochaine étape concrète, ce qui bloque, et les infos nouvelles (web) utiles. Plan :\n${ideaText(idea).slice(0, 2500)}`,
      cron: '0 10 * * 3', when: 'chaque mercredi à 10h', delivery: 'call_if_important', always_report: true,
    }, sessionId);
    return `${r}\n\nPlan validé. Les étapes : ${idea.steps.slice(0, 5).join(' ; ') || 'voir le détail'}.`
      + ' Pour les actions qui demandent ton accord (envoyer un mail, appeler, ajouter dans ton agenda), fais-les maintenant avec moi étape par étape.';
  }
  return '❌ action inconnue (new, history, show, paper, execute, reject).';
}
