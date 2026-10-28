/**
 * JARVIS 4 (28/10/2026) — ce que l'iPhone envoie et les outils « Iron Man » qui restent :
 *  - ÉVÉNEMENTS iPHONE (automatisations Raccourcis) : CarPlay branché → point de 20 s dit à voix haute ; CarPlay coupé →
 *    voiture garée notée ; chargeur branché le soir → bilan + demain + « ne pas déranger » ; bouton Action = Siri Dzaryx.
 *  - WIDGET (Scriptable) : argent du jour, clients qui attendent, séance, énergie, prochaine étape, météo du business.
 *  - TOTAL RECALL : « c'était quand la dernière fois que j'ai vu Karim ? » → GPS + conversations + agenda + mails + fiches.
 *  - SALLE DE CRISE : un vrai problème → plan, messages prêts pour tout le monde, un seul écran de suivi.
 *  - USINE À OUTILS : il dicte une idée de surveillance → l'outil est écrit, testé, mis en ligne après son oui.
 *  - CONTINUITÉ D'ÉCRAN : « continue sur la télé / le PC » → la suite s'affiche sur l'écran choisi.
 *  - DÉBRIEF VOCAL : 2 min dictées → tâches, fiches des gens, promesses, rendez-vous, messages prêts.
 *  - RÉPÉTITION : avant un appel difficile, Dzaryx joue l'autre (Telegram ou appel), puis note + phrases à changer.
 */
import { kvJson, kvPut, tg, ai, research, uid } from './ai-util.js';
import { jsonOf } from './media-util.js';
import { localNow } from './morning-routine.js';
import { supabase } from './supabase.js';

// ── Événements iPhone ────────────────────────────────────────────────────────
export async function iphoneEvent(type: string, body: Record<string, unknown>): Promise<{ say: string; url?: string; focus?: boolean; menu?: string[] }> {
  const lat = Number(body['lat'] ?? body['latitude']), lng = Number(body['lng'] ?? body['longitude']);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
  if (hasPos) void import('./gps-life.js').then(m => m.onLocationPoint(lat, lng)).catch(() => {});
  switch (type) {
    case 'carplay_on': case 'carplay': return { say: await carBrief() };
    case 'carplay_off': case 'parked': {
      if (hasPos) await import('./gps-life.js').then(m => m.setParking(lat, lng));
      return { say: hasPos ? 'Voiture garée, je retiens l\'endroit.' : 'Garé. Ajoute « Obtenir l\'emplacement actuel » au raccourci pour que je retienne l\'endroit.' };
    }
    case 'charger': case 'charge': {
      const h = localNow().hhmm;
      if (h < '20:00' && h > '05:00') return { say: '' };
      return { say: await eveningBrief(), focus: true };
    }
    case 'decisions': {
      const { pendingDecisions } = await import('./conscience.js');
      const d = (await pendingDecisions())[0];
      if (!d) return { say: 'Rien à décider pour le moment.' };
      return { say: d.title.replace(/[🔘🧠🤝🚨]/gu, '').slice(0, 300), menu: d.options.map(o => o.label) };
    }
    case 'decide': {
      const { chooseDecision } = await import('./conscience.js');
      return { say: (await chooseDecision(String(body['id'] ?? '') || null, Number(body['choice']) || 1)).replace(/[✅❌]/gu, '').slice(0, 400) };
    }
    default: return { say: '' };
  }
}

async function carBrief(): Promise<string> {
  const now = new Date();
  const in6h = new Date(Date.now() + 6 * 3600_000);
  const [evs, drafts, dec] = await Promise.all([
    import('./google-calendar.js').then(m => m.listAgendaRange(now.toISOString(), in6h.toISOString())).catch(() => null),
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./conscience.js').then(m => m.pendingDecisions()).catch(() => []),
  ]);
  const next = ((evs ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>)[0];
  const parts: string[] = [];
  if (next) parts.push(`Prochaine étape : ${next.summary ?? 'un rendez-vous'} à ${next.start?.dateTime?.slice(11, 16).replace(':', 'h') ?? 'bientôt'}.`);
  if (drafts.length) parts.push(`${drafts.length} client${drafts.length > 1 ? 's attendent' : ' attend'} sur WhatsApp : ${(drafts as Array<{ chat: string }>).slice(0, 3).map(d => d.chat).join(', ')}.`);
  if (dec.length) parts.push(`Une décision t'attend : ${dec[0]!.title.replace(/[🔘🧠🤝🚨]/gu, '').slice(0, 120)}`);
  const promises = await import('./foresight.js').then(m => m.promisesDue()).catch(() => []);
  if (promises.length) parts.push(`Promesse à tenir : ${promises[0]}.`);
  return parts.length ? `En route. ${parts.join(' ')}` : 'En route, rien d\'urgent. Bonne route.';
}

async function eveningBrief(): Promise<string> {
  const { date } = localNow();
  const [cc, sim, promises] = await Promise.all([
    import('./jarvis-hub.js').then(m => m.commandCenter()).catch(() => null),
    kvJson<{ date: string; text: string; collisions: number } | null>('tomorrow:sim', null),
    import('./foresight.js').then(m => m.promisesDue()).catch(() => []),
  ]);
  const t = sim && sim.date > date ? sim : null;
  const lines = [
    cc ? `Bilan : ${(cc['returnsToday'] as string[]).length} retour(s) et ${(cc['departuresToday'] as string[]).length} départ(s) aujourd'hui, ${cc['occupancy']} % de la flotte louée.` : '',
    promises.length ? `Promesse encore ouverte : ${promises[0]}.` : '',
    t ? (t.collisions ? `Demain, attention : ${t.text.split('⚠️ Collisions repérées :')[1]?.split('\n').filter(Boolean)[0]?.replace('•', '').trim() ?? 'une collision dans ton planning'}.` : `Demain, ta journée est propre.`) : '',
    'Je passe en ne pas déranger. Bonne nuit.',
  ].filter(Boolean);
  return lines.join(' ');
}

// ── Widget (Scriptable) ──────────────────────────────────────────────────────
export async function widgetData(): Promise<Record<string, unknown>> {
  const { date } = localNow();
  const [cc, drafts, sport, energy, evs, conn] = await Promise.all([
    import('./jarvis-hub.js').then(m => m.commandCenter()).catch(() => null),
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./sport-coach.js').then(m => m.sportToday()).catch(() => null),
    import('./conscience.js').then(m => m.energyToday()).catch(() => null),
    import('./google-calendar.js').then(m => m.listAgendaRange(new Date().toISOString(), new Date(Date.now() + 12 * 3600_000).toISOString())).catch(() => null),
    import('./connections-watch.js').then(m => m.connectionsText()).catch(() => ''),
  ]);
  const { data: paid } = await supabase.from('bookings').select('final_price, created_at').gte('created_at', `${date}T00:00:00`);
  const today = ((paid ?? []) as Array<{ final_price?: number }>).reduce((s, b) => s + Number(b.final_price ?? 0), 0);
  const next = ((evs ?? []) as Array<{ summary?: string; start?: { dateTime?: string } }>)[0];
  const problems = (conn ? 1 : 0) + (await import('./foresight.js').then(m => m.planB(3)).then(l => l.filter(x => x.problem).length).catch(() => 0));
  return {
    money: Math.round(today), month: cc?.['revenue'] ?? null, waiting: drafts.length,
    sport: sport?.label ? `${sport.label}${sport.arrived ? ' ✓' : ''}` : 'repos', energy: energy?.score ?? null,
    next: next ? `${next.start?.dateTime?.slice(11, 16) ?? ''} ${next.summary ?? ''}`.trim() : '—',
    weather: problems ? '⛈️' : drafts.length > 3 ? '🌤️' : '☀️', weatherText: problems ? `${problems} problème(s)` : drafts.length > 3 ? 'clients en attente' : 'tout roule',
    at: localNow().hhmm,
  };
}

// ── Total Recall ─────────────────────────────────────────────────────────────
export async function totalRecall(question: string): Promise<string> {
  const { visitsText } = await import('./gps-life.js');
  const places = await visitsText(new Date(Date.now() - 400 * 86_400_000).toISOString());
  const people = await import('./people-memory.js').then(m => m.peopleContext(question)).catch(() => '');
  return research(`TOTAL RECALL — Kouider demande : « ${question} ».\nRetrouve la réponse en CROISANT : l'historique des conversations (search_conversations), l'agenda (list_calendar_events / agenda), les mails (list_emails), WhatsApp si utile (whatsapp_web read), les fiches des gens, et ses lieux GPS ci-dessous.\n${people ? `Fiches : ${people}\n` : ''}Lieux visités (date heure-heure lieu) :\n${places.split('\n').slice(-300).join('\n') || 'aucun'}\n\nRéponds comme un ami qui se souvient : la date, l'endroit, combien de temps, ce qui s'est dit / promis. Si tu ne trouves pas, dis ce que tu as trouvé de plus proche. Court.`, { rounds: 8, max: 1200, sessionId: 'total-recall' });
}

// ── Salle de crise ───────────────────────────────────────────────────────────
interface Crisis { id: string; title: string; at: number; steps: Array<{ text: string; who?: string; done?: boolean; message?: string; chat?: string }>; log: string[] }

export async function crisisTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'status');
  const c = await kvJson<Crisis | null>('crisis', null);
  if (a === 'open') {
    const situation = String(input['situation'] ?? '').trim();
    if (!situation) return '❌ Décris la situation (qui, quoi, où).';
    const ctx = await research(`Crise en cours chez FIK : « ${situation} ». Rassemble en 10 lignes les faits utiles : la réservation et le client concernés (nom, téléphone, voiture, dates), l'état de la flotte (voitures libres maintenant), le contact de Houari, l'assurance / dépanneuse si connus. Rien d'autre.`, { rounds: 5, sessionId: 'crisis' }).catch(() => '');
    const o = jsonOf<{ title?: string; steps?: Array<{ text: string; who?: string; message?: string; chat?: string }> }>(await ai(`SALLE DE CRISE. Situation : « ${situation} »\nFaits : ${ctx}\n\nFais le plan d'action pour régler ça vite, dans l'ordre : qui prévenir (Houari, client, dépanneur, assurance, police si besoin…), quoi faire. Pour chaque personne à prévenir par WhatsApp, écris le message prêt (FIK, poli, rassurant, jamais Bruxelles/Belgique au client) et son numéro ou nom WhatsApp s'il est dans les faits.\nRéponds UNIQUEMENT : {"title":"titre court","steps":[{"text":"action","who":"qui","message":"message WhatsApp prêt (facultatif)","chat":"numéro ou nom WhatsApp (facultatif)"}]}`, { quality: true, max: 1500 }));
    if (!o?.steps?.length) return '❌ Je n\'ai pas réussi à faire le plan, redis-moi la situation.';
    const crisis: Crisis = { id: uid(), title: o.title ?? situation.slice(0, 60), at: Date.now(), steps: o.steps.slice(0, 10), log: [`${localNow().hhmm} ouverture : ${situation}`] };
    await kvPut('crisis', crisis, 7 * 86_400);
    const { queueTelegramMessage } = await import('../notifications/tg-outbox.js');
    if (crisis.steps.some(s => /houari/i.test(s.who ?? ''))) await queueTelegramMessage(`🚨 Urgence FIK : ${crisis.title}. ${crisis.steps.find(s => /houari/i.test(s.who ?? ''))?.message ?? 'Kouider va t\'appeler.'}`, undefined, 'houari').catch(() => {});
    const { createDecision } = await import('./conscience.js');
    const toSend = crisis.steps.filter(s => s.message && s.chat && !/houari/i.test(s.who ?? ''));
    if (toSend.length) await createDecision(`🚨 Salle de crise « ${crisis.title} » : ${toSend.length} message(s) prêt(s).`, toSend.slice(0, 3).map(s => ({ label: `Envoyer à ${s.who ?? s.chat}`, tool: 'whatsapp_web', input: { action: 'send', chat: s.chat, text: s.message } })), false);
    return `🚨 SALLE DE CRISE ouverte : ${crisis.title}\n${crisis.steps.map((s, i) => `${i + 1}. ${s.text}${s.who ? ` (${s.who})` : ''}${s.message ? `\n   ✉️ « ${s.message} »` : ''}`).join('\n')}\n\nHouari est prévenu. Écran de suivi : app › JARVIS › 🧠 Cerveau. Dis « étape 2 faite » au fur et à mesure, ou « envoie le message au client ».`;
  }
  if (!c) return 'Aucune crise en cours.';
  if (a === 'done') {
    const i = Number(input['step']) - 1;
    if (c.steps[i]) { c.steps[i]!.done = true; c.log.push(`${localNow().hhmm} fait : ${c.steps[i]!.text}`); }
    if (input['note']) c.log.push(`${localNow().hhmm} ${input['note']}`);
    await kvPut('crisis', c, 7 * 86_400);
    const left = c.steps.filter(s => !s.done);
    return left.length ? `✅ Noté. Reste : ${left.map(s => s.text).join(' · ')}` : '✅ Toutes les étapes sont faites. Dis « ferme la crise » quand c\'est réglé.';
  }
  if (a === 'close') { await kvPut('crisis', null); c.log.push(`${localNow().hhmm} fermée`); const h = await kvJson<Crisis[]>('crisis:history', []); h.push(c); await kvPut('crisis:history', h.slice(-20)); return `🟢 Crise « ${c.title} » fermée.`; }
  return `🚨 ${c.title}\n${c.steps.map((s, i) => `${s.done ? '✅' : '⬜'} ${i + 1}. ${s.text}${s.who ? ` (${s.who})` : ''}`).join('\n')}\n\nJournal :\n${c.log.slice(-6).join('\n')}`;
}

// ── Usine à outils ───────────────────────────────────────────────────────────
interface Watcher { id: string; name: string; idea: string; prompt: string; every: 'hour' | 'day' | 'week'; hour: number; active: boolean; last?: string; lastAt?: number; test?: string }

export async function factoryTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'list');
  const list = await kvJson<Watcher[]>('factory:tools', []);
  const find = () => list.find(w => w.id === input['id'] || w.name.toLowerCase().includes(String(input['name'] ?? '###').toLowerCase()));
  if (a === 'create') {
    const idea = String(input['idea'] ?? '').trim();
    if (!idea) return '❌ Quelle idée d\'outil ?';
    const spec = jsonOf<{ name?: string; prompt?: string; every?: Watcher['every']; hour?: number }>(await ai(`Kouider veut un nouvel outil pour son assistant : « ${idea} ».\nTransforme-le en une SURVEILLANCE automatique : la consigne de recherche web précise à exécuter à chaque passage (quoi chercher, où, quels chiffres relever, sous quelle forme rendre le résultat : court, chiffré, avec liens) et la fréquence.\nRéponds UNIQUEMENT : {"name":"nom court","prompt":"consigne complète","every":"hour|day|week","hour":0-23}`, { quality: true, max: 600 }));
    if (!spec?.prompt) return '❌ Je n\'ai pas compris l\'outil, reformule.';
    const w: Watcher = { id: uid(), name: spec.name ?? idea.slice(0, 40), idea, prompt: spec.prompt, every: spec.every ?? 'day', hour: Number(spec.hour ?? 9), active: false };
    // Test dans la zone protégée : l'agent de lecture seule (aucune action possible)
    w.test = await research(w.prompt, { rounds: 6, sessionId: 'factory-test' }).catch(e => `échec du test : ${e instanceof Error ? e.message : e}`);
    w.last = w.test; w.lastAt = Date.now();
    list.push(w); await kvPut('factory:tools', list);
    return `🏭 Outil « ${w.name} » construit et testé (lecture seule, aucun risque).\nFréquence : ${{ hour: 'toutes les heures', day: `chaque jour à ${w.hour}h`, week: `chaque lundi à ${w.hour}h` }[w.every]}.\nRésultat du test :\n${w.test.slice(0, 1200)}\n\nDEMANDE À KOUIDER : « Je le mets en ligne ? » → si oui : usine_outils action confirm, id ${w.id}.`;
  }
  if (a === 'confirm') { const w = find(); if (!w) return '❌ Outil introuvable.'; w.active = true; await kvPut('factory:tools', list); return `✅ « ${w.name} » est en ligne. Je ne te préviens que si le résultat change vraiment.`; }
  if (a === 'remove') { const w = find(); await kvPut('factory:tools', list.filter(x => x !== w)); return w ? `🗑️ « ${w.name} » supprimé.` : '❌ Introuvable.'; }
  if (a === 'run') { const w = find(); if (!w) return '❌ Outil introuvable.'; const r = await research(w.prompt, { rounds: 6, sessionId: 'factory' }); w.last = r; w.lastAt = Date.now(); await kvPut('factory:tools', list); return `🏭 ${w.name} :\n${r}`; }
  return list.length ? `🏭 Tes outils maison :\n${list.map(w => `• ${w.active ? '🟢' : '⏸️ (pas en ligne)'} ${w.name} — ${{ hour: 'toutes les heures', day: `chaque jour ${w.hour}h`, week: `lundi ${w.hour}h` }[w.every]}`).join('\n')}` : '🏭 Aucun outil maison. Dicte une idée : « surveille le prix du ciment à Oran », « préviens-moi quand un iPhone 17 passe sous 900 € »…';
}

export async function jobFactory(): Promise<string> {
  const list = await kvJson<Watcher[]>('factory:tools', []);
  const { hhmm, weekday, date } = localNow();
  const h = Number(hhmm.slice(0, 2));
  let n = 0;
  for (const w of list.filter(x => x.active)) {
    const due = w.every === 'hour' ? (!w.lastAt || Date.now() - w.lastAt > 55 * 60_000) && h >= 7 && h <= 22
      : w.every === 'day' ? h === w.hour && (!w.lastAt || localNow(w.lastAt).date !== date)
      : weekday === 1 && h === w.hour && (!w.lastAt || Date.now() - w.lastAt > 6 * 86_400_000);
    if (!due) continue;
    const r = await research(w.prompt, { rounds: 6, sessionId: 'factory' }).catch(() => '');
    if (!r) continue;
    const verdict = w.last ? await ai(`Ancien résultat :\n${w.last.slice(0, 2500)}\n\nNouveau résultat :\n${r.slice(0, 2500)}\n\nY a-t-il un changement qui MÉRITE de prévenir Kouider (nouveau chiffre important, nouvelle annonce, seuil franchi) ? Réponds « NON » ou une phrase qui dit ce qui a changé.`, { max: 150 }) : 'premier résultat';
    w.last = r; w.lastAt = Date.now(); n++;
    if (!/^NON\b/i.test(verdict.trim())) await tg(`🏭 ${w.name} — ${verdict}\n\n${r.slice(0, 1500)}`);
  }
  if (n) await kvPut('factory:tools', list);
  return `${n} passage(s)`;
}

// ── Continuité d'écran ───────────────────────────────────────────────────────
export async function screenTool(input: Record<string, unknown>): Promise<string> {
  const target = String(input['target'] ?? 'tv');
  const content = String(input['content'] ?? '').trim();
  if (!content) return '❌ Que faut-il afficher ? (content = le texte / les chiffres / le plan de la discussion)';
  await kvPut('screen:now', { title: String(input['title'] ?? 'Dzaryx'), content: content.slice(0, 12000), at: Date.now(), target }, 86_400);
  if (target === 'pc') {
    const r = await import('./tool-executor.js').then(m => m.executeTool('cloud_pc', { action: 'open_url', url: 'https://kouider213.github.io/ibrahim/' }, 'voice_kouider')).catch(() => '');
    return `🖥️ C'est affiché sur l'écran de l'app (JARVIS › 🧠 Cerveau › Écran partagé) et j'ai ouvert l'app sur le PC cloud. ${String(r).slice(0, 100)}`;
  }
  return `📺 C'est sur l'écran : ouvre l'app Dzaryx sur la télé ou le PC › JARVIS › 🧠 Cerveau › Écran partagé › Plein écran (ça se met à jour tout seul).`;
}

// ── Débrief vocal ────────────────────────────────────────────────────────────
export async function debriefTool(input: Record<string, unknown>): Promise<string> {
  const text = String(input['text'] ?? '').trim();
  if (text.length < 15) return '❌ Raconte-moi ton débrief (ce que tu as vu, fait, promis, ce qu\'il faut faire).';
  const o = jsonOf<{ people?: Array<{ name: string; text: string }>; promises?: Array<{ to: string; what: string; due?: string }>; tasks?: string[]; agenda?: Array<{ title: string; when: string }>; messages?: Array<{ to: string; text: string }>; car_issues?: Array<{ car: string; issue: string }> }>(await ai(
    `Débrief dicté par Kouider (souvent en vrac, en voiture) : « ${text} »\nMaintenant : ${new Date().toISOString().slice(0, 16)}.\nRange TOUT dans ce JSON (n'invente rien) : {"people":[{"name":"…","text":"ce qu'on apprend sur lui"}],"promises":[{"to":"…","what":"…","due":"AAAA-MM-JJTHH:MM"}],"tasks":["à faire"],"agenda":[{"title":"…","when":"AAAA-MM-JJTHH:MM"}],"messages":[{"to":"…","text":"message prêt"}],"car_issues":[{"car":"…","issue":"…"}]}`, { quality: true, max: 1500 })) ?? {};
  const done: string[] = [];
  const { peopleTool } = await import('./people-memory.js');
  for (const p of o.people ?? []) { await peopleTool({ action: 'remember', name: p.name, text: p.text }).catch(() => ''); done.push(`👤 fiche ${p.name} mise à jour`); }
  const { promisesTool } = await import('./foresight.js');
  for (const p of o.promises ?? []) { await promisesTool({ action: 'add', to: p.to, what: p.what, due: p.due }); done.push(`🤝 promesse à ${p.to} : ${p.what}`); }
  const todo = [
    ...(o.tasks ?? []).map(t => `• tâche : ${t}`),
    ...(o.agenda ?? []).map(a => `• rendez-vous à créer : ${a.title} (${a.when})`),
    ...(o.car_issues ?? []).map(c => `• voiture ${c.car} : ${c.issue}`),
    ...(o.messages ?? []).map(m => `• message pour ${m.to} : « ${m.text} »`),
  ];
  return `📋 Débrief rangé.\nDéjà fait :\n${done.join('\n') || '—'}\n\nÀ FAIRE MAINTENANT avec tes outils (sans redemander ce qui est clair) : crée les rendez-vous (create_calendar_event), note les tâches (night list / rappels), note les soucis de voitures, et pour chaque message prépare l'envoi WhatsApp (whatsapp_web send sans confirmed) puis demande son oui UNE fois pour tous :\n${todo.join('\n') || '—'}`;
}

// ── Répétition avant un appel difficile ──────────────────────────────────────
export async function rehearsalTool(input: Record<string, unknown>): Promise<string> {
  const a = String(input['action'] ?? 'start');
  if (a === 'start') {
    const role = String(input['role'] ?? '').trim();
    if (!role) return '❌ Qui dois-je jouer ? (le garagiste, un client qui conteste une caution, le banquier…)';
    await kvPut('rehearsal', { role, goal: String(input['goal'] ?? 'obtenir le meilleur résultat'), at: Date.now() }, 3 * 3600);
    return `🎭 Répétition lancée : je joue ${role}. Je vais être coriace. Tu commences quand tu veux (par écrit ou dis « appelle-moi » pour le faire à voix haute). Dis « fin de la répétition » pour ta note.\nCONSIGNE : réponds maintenant directement DANS LE RÔLE, première réplique courte (tu décroches / tu accueilles).`;
  }
  const r = await kvJson<{ role: string; goal: string; at: number } | null>('rehearsal', null);
  if (!r) return 'Aucune répétition en cours.';
  await kvPut('rehearsal', null);
  const { data } = await supabase.from('conversations').select('role, content, created_at').eq('session_id', 'voice_kouider').gte('created_at', new Date(r.at).toISOString()).order('created_at').limit(80);
  const convo = ((data ?? []) as Array<{ role: string; content: string }>).map(m => `${m.role === 'user' ? 'Kouider' : r.role} : ${String(m.content).replace(/^\[[^\]]{20,}\]\s*/s, '').slice(0, 400)}`).join('\n');
  return ai(`Répétition d'un appel difficile. Kouider s'entraînait face à ${r.role} ; son objectif : ${r.goal}.\n${convo.slice(-9000)}\n\nDonne : une note /10, ce qu'il a bien fait (2 points), où il a cédé ou s'est mal exprimé (2-3 points), et 3 PHRASES EXACTES à dire à la place. Court, direct, bienveillant.`, { quality: true, max: 800 }).then(t => `🎭 Fin de la répétition.\n${t}`);
}
