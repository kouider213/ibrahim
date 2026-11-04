import { randomUUID } from 'node:crypto';
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
// 🎙️ Voix « façon Jarvis » : voix de synthèse grave, calme, majordome (pas la voix d'un acteur — imitation d'une vraie voix = non).
const VOICES = new Map<string, { at: number; p: Promise<Buffer | null> }>();
const JARVIS_STYLE = 'Lis ce texte en français, comme JARVIS, l\'intelligence artificielle majordome d\'Iron Man : voix masculine grave, calme, posée, élégante, très légèrement ironique, rythme tranquille et assuré, diction parfaite :';
function jarvisVoiceUrl(text: string): string {
  for (const [k, v] of VOICES) if (Date.now() - v.at > 15 * 60_000) VOICES.delete(k);
  const id = randomUUID().replace(/-/g, '');
  const p = import('../notifications/dispatcher.js').then(m => m.synthesizeVoiceGemini(text, { voice: process.env['JARVIS_VOICE'] || 'Charon', style: JARVIS_STYLE })).catch(() => null);
  VOICES.set(id, { at: Date.now(), p });
  const base = (process.env['PUBLIC_BACKEND_URL'] || 'https://ibrahim-backend-production.up.railway.app').replace(/\/$/, '');
  return `${base}/api/jarvis/voice/${id}`;
}
export async function jarvisVoice(id: string): Promise<Buffer | null> { return (await VOICES.get(id)?.p) ?? null; }

export async function iphoneEvent(type: string, body: Record<string, unknown>): Promise<{ say: string; audio_url?: string; url?: string; focus?: boolean; menu?: string[] }> {
  const lat = Number(body['lat'] ?? body['latitude']), lng = Number(body['lng'] ?? body['longitude']);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0;
  if (hasPos) void import('./gps-life.js').then(m => m.onLocationPoint(lat, lng)).catch(() => {});
  switch (type) {
    case 'carplay_on': case 'carplay': {
      // 02/11 : « Bonjour Kouider » + discours de coach business + citation, puis le point pratique
      // 03/11 : en RETOUR à la maison → pas de point « à faire », seulement du courage (car-coach.ts isHomeward)
      const cc = await import('./car-coach.js');
      const homeward = await cc.isHomeward(hasPos ? { lat, lng } : {}).catch(() => false);
      const [hello, brief] = await Promise.all([cc.carGreeting(hasPos ? { lat, lng } : {}, homeward).catch(() => 'Bonjour Kouider.'), homeward ? Promise.resolve('') : carBrief(hasPos ? { lat, lng } : {})]);
      void kvPut('car:last-mode', { at: Date.now(), homeward });
      void kvPut('car:last-event', { at: Date.now(), type });   // trace : l'automatisation CarPlay est bien arrivée
      const say = speakable(carPrivacy(`${hello} ${brief}`)) || 'Bonjour Kouider. Bonne route.';
      return { say, audio_url: jarvisVoiceUrl(say) };
    }
    case 'carplay_off': case 'parked': {
      void kvPut('car:last-off', { at: Date.now(), type });
      if (hasPos) await import('./gps-life.js').then(m => m.setParking(lat, lng));
      // 04/11 : discours d'arrivée façon Jarvis (maison = bienvenue + demain ; ailleurs = phrase courte), avec la voix Jarvis
      const said = await import('./car-widget-plus.js').then(m => m.arrivalSpeech(hasPos ? { lat, lng } : null)).catch(() => 'Vous êtes arrivé, Monsieur.');
      const say = speakable(carPrivacy(said)) || 'Vous êtes arrivé, Monsieur.';
      return { say, audio_url: jarvisVoiceUrl(say) };
    }
    case 'charger': case 'charge': {
      const h = localNow().hhmm;
      if (h < '20:00' && h > '05:00') return { say: '' };
      return { say: speakable(await eveningBrief()), focus: true };
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

/** Texte pour la voix de l'iPhone : sans emoji ni symbole (« Énoncer » coupe la phrase dessus), tirets → virgules. */
export function speakable(t: string): string {
  return t.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D*_#`>|]/gu, '').replace(/\s*[—–]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

/** Point vocal de 20 s quand CarPlay se branche : trajet jusqu'à la prochaine étape, ce que veulent les clients, locations
 *  du jour, promesse, décision. Les faits sont rassemblés ici ; l'IA n'en fait qu'une phrase naturelle (rien d'inventé). */
// 02/11 : lu à VOIX HAUTE dans la voiture (sa femme peut être là) → jamais LIBERTÉ, médicament, santé, vitalité.
// 02/11 (2) : il a entendu « je vois que tu vas à la pharmacie » → pharmacie/🕊️/outil liberte filtrés aussi, + filet final sur la phrase dite.
const PRIVATE_RX = /libert|m[ée]dicament|demi|prise autoris|comprim|dose|zaldiar|vitalit|libido|sant[ée]|psy|m[ée]decin|pharmac|ordonnance|sevrage|manque|envie|🕊|cachet|traitement|sex|rapports? |testost|prise de sang|r[èe]gles|c[âa]lin|massage|intime|🔒|🔥 vital/i;
/** Retire toute phrase privée (médicament, Liberté, santé) d'un texte dit à voix haute dans la voiture. */
export function carPrivacy(t: string): string {
  return t.split(/(?<=[.!?])\s+/).filter(x => !PRIVATE_RX.test(x)).join(' ').trim();
}
async function carBrief(body: Record<string, unknown> = {}): Promise<string> {
  const now = new Date();
  const { date } = localNow();
  const [evs, drafts, dec, promises, scores, books, loc] = await Promise.all([
    import('./google-calendar.js').then(m => m.listAgendaRange(now.toISOString(), new Date(Date.now() + 8 * 3600_000).toISOString())).catch(() => null),
    import('./whatsapp-web.js').then(m => m.waPendingDrafts()).catch(() => []),
    import('./conscience.js').then(m => m.pendingDecisions()).catch(() => []),
    import('./foresight.js').then(m => m.promisesDue()).catch(() => []),
    kvJson<Record<string, { pct: number; why: string }>>('wa:scores', {}),
    supabase.from('bookings').select('client_name, start_date, end_date, status, cars(name)').or(`start_date.like.${date}%,end_date.like.${date}%`).limit(10).then(r => r.data ?? []),
    import('./location.js').then(m => m.getLocation('kouider')).catch(() => null),
  ]);
  // Créneaux « 🟢 Libre — RDV possibles » de l'agenda = pas une étape ; déjà commencés = ignorés
  const next = ((evs ?? []) as Array<{ summary?: string; location?: string; start?: { dateTime?: string } }>)
    .find(e => !/libre|rdv possibles|disponible/i.test(e.summary ?? '') && !PRIVATE_RX.test(e.summary ?? '') && (!e.start?.dateTime || Date.parse(e.start.dateTime) > Date.now()));
  // Trajet réel depuis sa position (Raccourci ou Telegram) jusqu'au lieu du rendez-vous
  let trip = '';
  const lat = Number(body['lat']), lng = Number(body['lng']);
  const here = Number.isFinite(lat) && lat ? { lat, lng } : loc && Date.now() - Date.parse(loc.updated_at) < 2 * 3600_000 ? { lat: loc.lat, lng: loc.lng } : null;
  if (next && here) {
    const { geocode, drive } = await import('./departures.js');
    const { getRoutineConfig } = await import('./morning-routine.js');
    const a = (await getRoutineConfig()).addresses;
    const where = next.location || (/travail|boulot|belgique/i.test(next.summary ?? '') ? a.work : /salle|sport/i.test(next.summary ?? '') ? a.gym : '');
    const dest = where ? await geocode(where).catch(() => null) : null;
    const d = dest ? await drive(here, dest).catch(() => null) : null;
    if (d && next.start?.dateTime) {
      const margin = Math.round((Date.parse(next.start.dateTime) - Date.now()) / 60_000) - d.min;
      trip = `${d.min} min de route${d.min - d.normal >= 5 ? ` (${d.min - d.normal} min de bouchons)` : ''}, ${margin >= 0 ? `marge ${margin} min` : `RETARD probable de ${-margin} min`}`;
    }
  }
  const clients = (drafts as Array<{ chat: string; preview: string }>).map(d => {
    const sc = scores[d.chat.toLowerCase()];
    return { who: /^[+\d\s().-]+$/.test(d.chat) ? 'un numéro inconnu' : d.chat, wants: d.preview.replace(/\s+/g, ' ').slice(0, 120), pct: sc?.pct ?? null };
  }).sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0));
  const facts = {
    heure: localNow().hhmm,
    prochaine_etape: next ? { quoi: next.summary, heure: next.start?.dateTime ? localNow(Date.parse(next.start.dateTime)).hhmm : null, trajet: trip || null } : null,
    clients_whatsapp_en_attente: { nombre: clients.length, les_plus_chauds: clients.slice(0, 2) },
    locations_du_jour: (books as Array<Record<string, unknown>>).filter(b => !/REJECT|CANCEL/i.test(String(b['status']))).map(b => `${(b['cars'] as { name?: string } | null)?.name ?? ''} ${b['client_name']} ${String(b['start_date']).startsWith(date) ? 'départ' : 'retour'}`),
    promesse: promises.find(p => !PRIVATE_RX.test(String(p))) ?? null,
    decision: dec.find(d => !PRIVATE_RX.test(`${d.title} ${d.options.map(o => `${o.label} ${o.tool ?? ''} ${o.say ?? ''}`).join(' ')}`))?.title.slice(0, 140) ?? null,
  };
  const said = await ai(`Kouider vient de monter en voiture (CarPlay). Fais-lui son point en 3 à 5 phrases courtes à l'ORAL (20 secondes), comme JARVIS d'Iron Man : calme, précis, élégant, VOUVOIEMENT :
d'abord sa prochaine étape avec le temps de route et la marge (ou le retard), puis ce que veulent les 1-2 clients les plus chauds sur WhatsApp et combien attendent en tout, puis la location, la promesse ou la décision du jour s'il y en a.
Ne redis PAS l'heure (déjà dite). JAMAIS un mot sur médicament, pharmacie, santé, Liberté ou sevrage (c'est privé). S'il n'y a aucun fait, dis seulement « Rien d'urgent à signaler. Bonne route. ». Uniquement ces faits, n'invente rien. Ce qui est vide ou null : n'en parle PAS du tout (jamais « pas de… »). Pas de « salut », pas de numéro de téléphone, pas d'emoji, pas de liste. Termine par « Bonne route. »
Faits : ${JSON.stringify(facts)}`, { max: 300 }).catch(() => '');
  if (said) return speakable(said);
  const parts = [next ? `Prochaine étape : ${next.summary} à ${facts.prochaine_etape?.heure?.replace(':', 'h') ?? 'bientôt'}${trip ? `, ${trip}` : ''}.` : '', clients.length ? `${clients.length} clients attendent sur WhatsApp.` : '', facts.promesse ? `Promesse à tenir : ${facts.promesse}.` : ''].filter(Boolean);
  return speakable(parts.length ? `En route. ${parts.join(' ')} Bonne route.` : 'En route, rien d\'urgent. Bonne route.');
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

// ── 🚗 Widget CarPlay (Kouider 03/11) : photo de SON Audi + météo + prochain mouvement FIK + argent du jour + phrase Jarvis.
// Rien de santé / médicament / Liberté (écran visible par les passagers). Phrase Jarvis = liste fixe (0 €, pas d'IA à chaque rafraîchissement).
const CAR_LINES = [
  'Tous les systèmes sont opérationnels, monsieur.',
  'Chaque trajet vous rapproche d\'Oran.',
  'La régularité bat le talent. Vous avez les deux.',
  'Un client servi aujourd\'hui, dix clients demain.',
  'Les grands ne s\'arrêtent pas au premier effort.',
  'Votre famille compte sur l\'homme que vous devenez.',
  'Ce qui barre la route devient la route.',
  'Construisez aujourd\'hui l\'ombre de demain.',
  'Une priorité. Une seule. Exécutez.',
  'Le marché récompense ceux qui reviennent.',
  'Discipline aujourd\'hui, liberté demain.',
  'FIK grandit au rythme de votre constance.',
  'Ceux qui construisent ne regardent pas l\'heure.',
  'Calme, précis, inarrêtable. Comme d\'habitude.',
  'Le futur grand businessman d\'Oran est au volant.',
  'Vous ne rêvez pas, vous bâtissez.',
  'Avec la difficulté vient la facilité.',
  'La maison à Oran se construit trajet après trajet.',
  'Restez affamé, monsieur. Restez concentré.',
  'Aujourd\'hui compte. Faites-le compter.',
];
// 🇩🇿 Match de l'Algérie aujourd'hui ? (TheSportsDB gratuit, en cache 3 h)
let fennecsCache: { at: number; date: string; v: string } | null = null;
async function fennecsToday(date: string): Promise<string> {
  if (fennecsCache && fennecsCache.date === date && Date.now() - fennecsCache.at < 3 * 3600_000) return fennecsCache.v;
  let v = '';
  try {
    const base = 'https://www.thesportsdb.com/api/v1/json/3';
    const team = await fetch(`${base}/searchteams.php?t=Algeria`, { signal: AbortSignal.timeout(5000) }).then(r => r.json() as Promise<{ teams?: Array<{ idTeam: string; strSport?: string; strGender?: string }> | null }>);
    const id = team.teams?.find(x => x.strSport === 'Soccer' && x.strGender !== 'Female')?.idTeam;
    if (id) {
      const ev = await fetch(`${base}/eventsnext.php?id=${id}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json() as Promise<{ events?: Array<{ dateEvent: string; strTime?: string }> | null }>);
      const e = ev.events?.find(x => x.dateEvent === date);
      if (e) { const h = Number(String(e.strTime ?? '').slice(0, 2)) + 1; v = h >= 17 ? 'Les Fennecs jouent ce soir' : 'Les Fennecs jouent aujourd\'hui'; }
    }
  } catch { /* hors ligne : rien */ }
  fennecsCache = { at: Date.now(), date, v };
  return v;
}
export async function carWidgetData(): Promise<Record<string, unknown>> {
  const { date, hhmm } = localNow();
  const loc = await import('./location.js').then(m => m.getLocation('kouider')).catch(() => null);
  const here = loc && Date.now() - Date.parse(loc.updated_at) < 12 * 3600_000 ? { lat: loc.lat, lng: loc.lng } : { lat: 50.85, lng: 4.35 };
  const freshPos = !!loc && Date.now() - Date.parse(loc.updated_at) < 30 * 60_000;
  const day = (n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const tomorrow = day(1), horizon = day(14);
  const [meteo, { data: cars }, { data: books }] = await Promise.all([
    import('./forme-runs-pro.js').then(m => m.weatherAt(here.lat, here.lng, Date.now())).catch(() => null),
    supabase.from('cars').select('id, name'),
    supabase.from('bookings').select('car_id, start_date, end_date, status').or(`start_date.gte.${date},end_date.gte.${date}`).lte('start_date', `${horizon}T23:59:59`),
  ]);
  const C = (cars ?? []) as Array<{ id: string; name: string }>;
  const now = `${date}T${hhmm}`;
  const moves = ((books ?? []) as Array<Record<string, unknown>>).filter(b => !/REJECT|CANCEL/i.test(String(b['status'])))
    .flatMap(b => [{ k: 'Départ', at: String(b['start_date']).slice(0, 16), car: b['car_id'] }, { k: 'Retour', at: String(b['end_date']).slice(0, 16), car: b['car_id'] }])
    .filter(m => m.at.slice(0, 10) >= date && m.at.slice(0, 10) <= horizon && (m.at.length < 16 ? m.at >= date : m.at >= now))
    .sort((a, b) => a.at.localeCompare(b.at));
  const m = moves[0];
  const carName = (id: unknown) => (C.find(c => c.id === id)?.name ?? 'voiture').replace(/\s*\(.*\)$/, '');

  // 03/11 v3 « un truc de fou, AUCUN chiffre » (ni voitures louées, ni argent, ni mot pour Ibrahim) : tout en MOTS,
  // + le vrai ciel (aube / jour / couchant / nuit, soleil réel), effets météo, mode du moment, prière qui approche.
  const nowMs = Date.now();
  const H = Number(hhmm.slice(0, 2)), M = Number(hhmm.slice(3, 5)), minNow = H * 60 + M;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const [sun, homeward, prayerData, daysOff, fennecs] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${here.lat.toFixed(3)}&longitude=${here.lng.toFixed(3)}&daily=sunrise,sunset&hourly=weather_code,temperature_2m&forecast_days=2&timezone=auto`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json() as Promise<{ daily?: { sunrise?: string[]; sunset?: string[] }; hourly?: { time: string[]; weather_code: number[]; temperature_2m: number[] } }>)
      .then(j => {
        // Demain matin (5 h – 9 h, son départ) : le pire temps de la tranche
        const hh = j.hourly; let code = -1, tmin = 99;
        if (hh) hh.time.forEach((tt, i) => { if (tt.slice(0, 10) === tomorrow && Number(tt.slice(11, 13)) >= 5 && Number(tt.slice(11, 13)) <= 9) { code = Math.max(code, hh.weather_code[i] ?? 0); tmin = Math.min(tmin, hh.temperature_2m[i] ?? 99); } });
        return { rise: toMin(String(j.daily?.sunrise?.[0] ?? '').slice(11, 16) || '07:30'), set: toMin(String(j.daily?.sunset?.[0] ?? '').slice(11, 16) || '17:30'), tmCode: code, tmMin: tmin };
      }).catch(() => ({ rise: 450, set: 1050, tmCode: -1, tmMin: 99 })),
    import('./car-coach.js').then(m => m.isHomeward(here)).catch(() => false),
    (async () => { const oran = await import('./gps-life.js').then(m => m.oranActive()).catch(() => null); const [y, mo, d] = date.split('-');
      const r = await fetch(`https://api.aladhan.com/v1/timingsByCity/${d}-${mo}-${y}?city=${oran ? 'Oran' : 'Brussels'}&country=${oran ? 'Algeria' : 'Belgium'}&method=3`, { signal: AbortSignal.timeout(5000) });
      return ((await r.json()) as { data?: { timings?: Record<string, string>; date?: { hijri?: { day?: string; month?: { number?: number }; holidays?: string[] } } } }).data ?? null; })().catch(() => null),
    import('./kouider-dossier.js').then(m => m.getDaysOff()).catch(() => [] as number[]),
    fennecsToday(date),
  ]);
  // 04/11 : quand partir / trafic / retard prédit / client qui attend — en mots (car-widget-plus.ts)
  const plus = await import('./car-widget-plus.js');
  const [roadI, waiting] = await Promise.all([
    plus.carRoad(here, freshPos, homeward).catch(() => ({ go: '', road: '', late: '' })),
    plus.clientWaiting().catch(() => ''),
  ]);
  const prayers = prayerData?.timings ?? null;
  const hijri = prayerData?.date?.hijri;
  const ramadan = hijri?.month?.number === 9;
  const hDay = Number(hijri?.day ?? 0), hMonth = hijri?.month?.number ?? 0;
  const eid = (hMonth === 10 && hDay <= 3) || (hMonth === 12 && hDay >= 10 && hDay <= 13);
  const wdNow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const phase = minNow < sun.rise - 40 || minNow > sun.set + 40 ? 'nuit' : minNow < sun.rise + 50 ? 'aube' : minNow > sun.set - 70 ? 'couchant' : 'jour';
  const sunPos = minNow >= sun.rise && minNow <= sun.set ? (minNow - sun.rise) / Math.max(1, sun.set - sun.rise) : null;
  const nightLen = 1440 - (sun.set - sun.rise);
  const moonPos = sunPos === null ? ((minNow - sun.set + 1440) % 1440) / Math.max(1, nightLen) : null;
  const dayOff = daysOff.includes(wdNow) && !homeward;
  const mode = H >= 23 || H < 5 ? 'nuit' : dayOff && H >= 8 && H < 22 ? 'repos' : H < 11 ? 'depart' : homeward ? 'retour' : 'journee';
  const greeting = eid ? 'Aïd Mubarak, Monsieur.' : wdNow === 5 && H >= 5 && H < 16 ? 'Jumu\'a Mubarak, Monsieur.' : ramadan && H >= 5 && H < 18 ? 'Ramadan Karim, Monsieur.' : H >= 5 && H < 12 ? 'Bonjour, Monsieur.' : H >= 12 && H < 18 ? 'Bon après-midi, Monsieur.' : 'Bonsoir, Monsieur.';
  const modeLabel = eid ? 'JOUR DE FÊTE · AÏD MUBARAK' : ramadan && mode !== 'nuit' ? 'MODE RAMADAN · ' + ({ depart: 'BONNE ROUTE', journee: 'EN LIGNE', retour: 'LA MAISON VOUS ATTEND', repos: 'REPOS' } as Record<string, string>)[mode] : ({ depart: 'MODE DÉPART · BONNE ROUTE', journee: 'MODE MISSION · EN LIGNE', retour: 'MODE RETOUR · LA MAISON VOUS ATTEND', nuit: 'VEILLE DE NUIT · ACTIVE', repos: 'JOUR DE REPOS · EN FAMILLE' } as Record<string, string>)[mode]!;
  const t = meteo?.temp;
  const feel = t == null ? '' : t <= 0 ? 'Gel' : t <= 5 ? 'Froid' : t <= 12 ? 'Frais' : t <= 20 ? 'Doux' : t <= 27 ? 'Chaud' : 'Canicule';
  const code = meteo?.code ?? 0;
  const fx = { rain: !!meteo?.rain || code >= 95, snow: code >= 71 && code <= 86 && !(code >= 80 && code <= 82), fog: code === 45 || code === 48, storm: code >= 95, clear: code <= 1 };
  // Moment en mots (« demain matin », « jeudi soir »), jamais d'heure
  const part = (hh: number) => hh < 12 ? 'matin' : hh < 14 ? 'midi' : hh < 18 ? 'après-midi' : 'soir';
  const whenWords = (at: string) => {
    const d = at.slice(0, 10), hh = at.length >= 16 ? Number(at.slice(11, 13)) : NaN, p = Number.isFinite(hh) && at.slice(11, 16) !== '00:00' ? part(hh) : '';
    if (d === date) return p === 'matin' ? 'ce matin' : p === 'midi' ? 'ce midi' : p === 'après-midi' ? 'cet après-midi' : p === 'soir' ? 'ce soir' : "aujourd'hui";
    if (d === tomorrow) return p ? `demain ${p}` : 'demain';
    const x = new Date(`${d}T12:00:00Z`), wdn = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][x.getUTCDay()];
    return Date.parse(`${d}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`) < 7 * 86_400_000 ? `${wdn}${p ? ` ${p}` : ''}` : 'plus tard';
  };
  // Prière : seulement quand elle approche (≤ 40 min) ou vient de commencer (≤ 20 min)
  const PR: Record<string, string> = { Fajr: 'Fajr', Dhuhr: 'Dohr', Asr: 'Asr', Maghrib: 'Maghreb', Isha: 'Icha' };
  let prayer = '';
  for (const [k, fr] of Object.entries(PR)) {
    const v = prayers?.[k]; if (!v) continue; const d = toMin(v) - minNow;
    if (ramadan && k === 'Maghrib' && d > 0 && d <= 60) { prayer = 'Iftar approche'; break; }
    if (ramadan && k === 'Fajr' && d > 0 && d <= 60) { prayer = 'Shour avant Fajr'; break; }
    if (d > 0 && d <= 40) { prayer = `${fr} approche`; break; } if (d <= 0 && d >= -20) { prayer = `C'est l'heure de ${fr}`; break; }
  }
  // Phrase Jarvis selon le vrai moment (listes fixes, 0 €)
  const slot = Math.floor(nowMs / 3_600_000);
  const L: Record<string, string[]> = {
    depart: ['Systèmes prêts. La journée vous appartient.', 'Bonne route, Monsieur. Je veille sur FIK.', 'Le monde se lève. Vous êtes déjà en route.', 'Une priorité. Une seule. Exécutez.'],
    journee: CAR_LINES,
    retour: ['Mission accomplie. Votre famille vous attend.', 'Le plus dur est derrière vous, Monsieur.', 'Vous avez tenu. Rentrez en héros.', 'Ce soir, on recharge. Demain, on conquiert.'],
    repos: ['Aujourd\'hui, la mission c\'est votre famille.', 'Je garde la boutique. Profitez, Monsieur.', 'Un roi se repose aussi. Demain, on repart.'],
    nuit: ['Je veille. Reposez-vous, Monsieur.', 'La nuit travaille pour ceux qui ont tout donné.', 'Les empires se construisent aussi en dormant.'],
  };
  let jarvis = L[mode]![slot % L[mode]!.length]!;
  if (eid) jarvis = 'Aïd Mubarak. Que cette fête vous rapproche d\'Oran.';
  else if (fennecs) jarvis = 'Ce soir, toute l\'Algérie est derrière les Fennecs.';
  else if (ramadan && mode === 'retour') jarvis = 'Tenez bon, Monsieur. L\'iftar vous attend à la maison.';
  if (fx.snow || (t != null && t <= 2)) jarvis = 'Route froide, Monsieur. Douceur sur les freins.';
  else if (fx.storm) jarvis = 'Orage sur la route. Je reste en alerte avec vous.';
  else if (fx.fog) jarvis = 'Brouillard. Feux allumés, distance doublée.';
  else if (roadI.late) jarvis = 'Retard en vue. Restez calme, Monsieur, on prévient et on assure.';
  else if (/^Partez maintenant/.test(roadI.go)) jarvis = 'Il est l\'heure, Monsieur. Moteur, et on y va.';
  else if (/^Trafic chargé/.test(roadI.road)) jarvis = 'La route est lente. Patience, Monsieur : on arrive entier.';
  const wordOf = (c: number) => c < 0 ? '' : c >= 95 ? 'orage' : c >= 71 && c <= 86 && !(c >= 80 && c <= 82) ? 'neige' : c >= 51 ? 'pluie' : c === 45 || c === 48 ? 'brouillard' : c >= 3 ? 'gris' : 'dégagé';
  const tomorrowMorning = H >= 17 || H < 3 ? [wordOf(sun.tmCode), sun.tmMin <= 1 ? 'gel, attention au verglas' : sun.tmMin <= 5 ? 'froid' : ''].filter(Boolean).join(', ') : '';
  return {
    v: 5, eid, ramadan, friday: wdNow === 5, fennecs, tomorrow: tomorrowMorning ? `Demain matin : ${tomorrowMorning}` : '',
    at: hhmm, phase, sunPos, moonPos, mode, modeLabel, greeting, fx,
    alert: meteo ? (t! <= 3 ? '❄️ Risque de verglas' : meteo.rain ? '🌧️ Pluie, prudence' : meteo.wind >= 50 ? '💨 Vent fort' : '') : '',
    weatherE: phase === 'nuit' && meteo && meteo.code <= 1 ? '🌙' : phase === 'nuit' && meteo && meteo.code <= 3 ? '☁️' : meteo?.e ?? '', weather: [feel, (meteo?.label ?? '').toLowerCase()].filter(Boolean).join(' · '),
    nextTitle: m ? `${m.k} ${carName(m.car)}` : 'Flotte au calme', nextWhen: m ? whenWords(m.at) : 'rien de prévu',
    prayer, jarvis,
    go: roadI.go, road: roadI.road, late: roadI.late, waiting,
  };
}
export async function carWidgetPhoto(shape?: string): Promise<Buffer | null> {
  const { kvGet } = await import('./app-store.js');
  const b64 = await kvGet(shape === 'wide' || shape === 'square' ? `car:widget:photo:${shape}` : 'car:widget:photo').catch(() => null);
  return b64 ? Buffer.from(b64, 'base64') : null;
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
