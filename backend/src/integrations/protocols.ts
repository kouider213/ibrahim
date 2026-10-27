import { kvGet, kvSet } from './app-store.js';

// PROTOCOLES (27/10/2026, façon Jarvis « House Party Protocol ») : une phrase lance une suite d'actions.
// « Lance le protocole départ Oran » → Dzaryx lit les étapes à Kouider, attend son OK, puis les exécute une par une
// avec ses outils (rien d'irréversible sans son oui : envois, paiements, annulations). Différent des procédures
// (façons de faire injectées dans le contexte) : un protocole se DÉCLENCHE d'un coup, à la voix ou d'un bouton.
// Stockage app_kv `protocols` ; 3 protocoles de départ, modifiables.

export interface Protocol { id: string; name: string; trigger: string; steps: string[]; uses: number; last_used?: string; builtin?: boolean }

const KEY = 'protocols';
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (t: string) => norm(t).replace(/ /g, '-').slice(0, 40);

const DEFAULTS: Protocol[] = [
  { id: 'depart-oran', name: 'Départ Oran', trigger: 'je pars à Oran, voyage Algérie, départ', builtin: true, uses: 0, steps: [
    'Regarder les locations et retours des 7 prochains jours (list_bookings) et les lister à Kouider.',
    'Préparer un message à Houari pour la passation des voitures de la semaine (assign_task), à valider par Kouider.',
    'Vérifier la météo à Oran pour le jour du départ (get_weather).',
    'Si un vol est prévu : vérifier le prix / la surveillance Air Algérie (air_algerie_search ou air_algerie_watch status).',
    'Proposer de vider ou décaler l\'agenda FIK des jours d\'absence (list_agenda_events), sans rien supprimer sans son oui.',
    'Rappel la veille au soir : papiers, passeport, chargeurs (schedule_reminder).',
  ] },
  { id: 'panne', name: 'Panne', trigger: 'panne, voiture en panne, accident, crevaison, dépanneuse', builtin: true, uses: 0, steps: [
    'Demander quelle voiture, où (position), et si le client est en sécurité.',
    'Trouver le dépanneur / garage le plus proche ouvert (gps_assistant nearby ou web_search) avec téléphone.',
    'Regarder s\'il y a une voiture libre pour remplacer (check_car_availability).',
    'Préparer le message au client (excuses + solution + délai), à valider avant envoi.',
    'Noter le problème sur la voiture (update_vehicle_maintenance) et prévoir un rappel de suivi (schedule_reminder).',
  ] },
  { id: 'fin-de-journee', name: 'Fin de journée', trigger: 'fin de journée, bilan du jour, je ferme', builtin: true, uses: 0, steps: [
    'Bilan du jour : locations, retours, paiements reçus (get_daily_report).',
    'Retards et impayés à relancer (get_late_returns, get_unpaid_bookings).',
    'Messages WhatsApp et mails clients encore sans réponse (whatsapp_web unread, list_emails).',
    'Les 3 choses importantes de demain (list_agenda_events + list_bookings de demain).',
    'Proposer l\'heure de réveil et le programme de demain matin (morning_routine).',
  ] },
];

async function all(): Promise<Protocol[]> {
  try {
    const raw = await kvGet(KEY);
    if (raw) return JSON.parse(raw) as Protocol[];
  } catch { /* liste illisible → défauts */ }
  return DEFAULTS.map(p => ({ ...p, steps: [...p.steps] }));
}
async function store(list: Protocol[]): Promise<void> { await kvSet(KEY, JSON.stringify(list)); }

function find(list: Protocol[], q: string): Protocol | undefined {
  const n = norm(q).replace(/^(le |la |protocole )+/, '');
  if (!n) return undefined;
  return list.find(p => p.id === slug(n) || norm(p.name) === n)
    ?? list.find(p => norm(p.name).includes(n) || n.includes(norm(p.name)))
    ?? list.find(p => norm(p.trigger).split(/ ?, ?/).some(t => t && (n.includes(t) || t.includes(n))));
}

export async function listProtocols(): Promise<Protocol[]> { return all(); }

export async function protocolTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'list');
  const list = await all();
  const name = String(input['name'] ?? '').trim();

  if (action === 'list') {
    return `⚡ ${list.length} protocole(s) :\n` + list.map(p => `• ${p.name} — ${p.steps.length} étapes (déclencheurs : ${p.trigger})`).join('\n')
      + '\nPour en lancer un : action run. Pour en créer un : action save avec name + steps.';
  }
  if (action === 'save') {
    const steps = (Array.isArray(input['steps']) ? input['steps'] as unknown[] : String(input['steps'] ?? '').split(/\n|;/)).map(s => String(s).trim()).filter(Boolean);
    if (!name || !steps.length) return '❌ name et steps (liste d\'étapes) requis.';
    const old = find(list, name);
    const p: Protocol = { id: old?.id ?? slug(name), name, trigger: String(input['trigger'] ?? old?.trigger ?? name), steps: steps.slice(0, 15), uses: old?.uses ?? 0, last_used: old?.last_used };
    await store([...list.filter(x => x.id !== p.id), p]);
    return `✅ Protocole « ${p.name} » ${old ? 'mis à jour' : 'créé'} (${p.steps.length} étapes). Kouider pourra dire « lance le protocole ${p.name} ».`;
  }
  const p = find(list, name);
  if (!p) return `❌ Protocole « ${name} » introuvable. Existants : ${list.map(x => x.name).join(', ')}.`;
  if (action === 'delete') {
    await store(list.filter(x => x.id !== p.id));
    return `🗑️ Protocole « ${p.name} » supprimé.`;
  }
  if (action === 'show') return `⚡ Protocole ${p.name} :\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  if (action === 'run') {
    p.uses += 1; p.last_used = new Date().toISOString();
    await store(list.map(x => x.id === p.id ? p : x));
    const extra = String(input['details'] ?? '').trim();
    return [`⚡ PROTOCOLE ${p.name.toUpperCase()} — lancé par Kouider${extra ? ` (précisions : ${extra})` : ''}.`,
      ...p.steps.map((s, i) => `${i + 1}. ${s}`), '',
      'CONSIGNE : annonce « Protocole ' + p.name + ' lancé » puis EXÉCUTE maintenant les étapes de lecture/vérification avec tes outils, dans l\'ordre, sans redemander. '
      + 'Pour chaque étape qui ENVOIE, PAIE, ANNULE ou SUPPRIME quelque chose : prépare-la et demande son oui avant. '
      + 'Termine par un compte rendu court : ✅ fait / ⏳ attend son oui / ❌ impossible (avec la raison).'].join('\n');
  }
  return '❌ action inconnue (list, show, run, save, delete).';
}
