import { randomUUID } from 'crypto';
import { kvGet, kvSet } from './app-store.js';

// Procédures apprises (idée reprise de Hermes Agent « skills » + « curator ») : en plus des règles, Dzaryx retient des
// FAÇONS DE FAIRE en plusieurs étapes (« quand je valide une location : vérifier le client, contrat, lien de signature,
// agenda, message WhatsApp »). Apprises quand Kouider les décrit (save_procedure) ou lors de la relecture
// automatique des conversations (self-learning.ts). Injectées dans le contexte SEULEMENT quand le message parle du
// sujet (mots du déclencheur) ; non utilisées depuis 60 jours → archivées par le ménage de nuit.
// Stockage : app_kv `procedures`.

export interface Procedure {
  id: string;
  name: string;
  trigger: string;         // quand l'utiliser (mots-clés en clair)
  steps: string[];
  owner: 'kouider' | 'houari';
  source: 'kouider' | 'auto';
  active: boolean;
  created_at: string;
  uses: number;
  last_used?: string;
}

const KEY = 'procedures';
const ARCHIVE_DAYS = 60;
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['quand', 'pour', 'avec', 'dans', 'une', 'des', 'les', 'que', 'qui', 'est', 'fait', 'faire', 'toujours']);
// racine = 5 premières lettres : « valide », « valider », « validation » se correspondent
const words = (t: string) => [...new Set(norm(t).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 5)))];

export async function loadProcedures(): Promise<Procedure[]> {
  try { return JSON.parse((await kvGet(KEY)) ?? '[]') as Procedure[]; } catch { return []; }
}
async function save(list: Procedure[]): Promise<void> { await kvSet(KEY, JSON.stringify(list)); }

export async function addProcedure(p: { name: string; trigger: string; steps: string[]; owner: 'kouider' | 'houari'; source: 'kouider' | 'auto' }): Promise<'created' | 'updated'> {
  const list = await loadProcedures();
  const same = list.find(x => x.active && x.owner === p.owner && norm(x.name) === norm(p.name));
  if (same) { same.trigger = p.trigger; same.steps = p.steps; await save(list); return 'updated'; }
  list.push({ id: randomUUID().slice(0, 8), ...p, steps: p.steps.slice(0, 12), active: true, created_at: new Date().toISOString(), uses: 0 });
  await save(list);
  return 'created';
}

export async function saveProcedureTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const name = String(input['name'] ?? '').trim();
  const trigger = String(input['trigger'] ?? '').trim();
  const steps = Array.isArray(input['steps']) ? (input['steps'] as unknown[]).map(s => String(s).trim()).filter(Boolean) : [];
  if (!name || !trigger || steps.length < 2) return '❌ Il faut un nom, quand l\'utiliser, et au moins 2 étapes.';
  const op = await addProcedure({ name, trigger, steps, owner: sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider', source: 'kouider' });
  return `✅ Procédure « ${name} » ${op === 'created' ? 'apprise' : 'mise à jour'} — je la suivrai quand : ${trigger}.\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
}

export async function listProceduresTool(): Promise<string> {
  const list = (await loadProcedures()).filter(p => p.active);
  if (!list.length) return 'Aucune procédure apprise. Exemple : « quand je valide une location, fais toujours : … puis … ».';
  return list.map(p => `📘 ${p.name} (${p.source === 'auto' ? 'apprise seule' : 'dictée'}, utilisée ${p.uses}×) — quand : ${p.trigger}\n${p.steps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')}`).join('\n\n');
}

export async function deleteProcedureTool(input: Record<string, unknown>): Promise<string> {
  const q = norm(String(input['procedure'] ?? ''));
  const list = await loadProcedures();
  const p = list.find(x => x.active && (x.id === q || norm(x.name).includes(q)));
  if (!p) return '❌ Procédure introuvable.';
  p.active = false;
  await save(list);
  return `🗑️ Procédure « ${p.name} » oubliée.`;
}

/** Procédures dont le déclencheur correspond au message → texte à mettre dans le contexte (et compte l'usage). */
export async function proceduresContext(message: string, actor: string): Promise<string> {
  const list = await loadProcedures();
  const msg = new Set(words(message));
  const hits = list.filter(p => p.active && p.owner === actor).filter(p => {
    const w = words(`${p.name} ${p.trigger}`);
    const common = w.filter(x => msg.has(x)).length;
    return common >= 2 || (common >= 1 && w.length <= 3);
  }).slice(0, 2);
  if (!hits.length) return '';
  for (const p of hits) { p.uses++; p.last_used = new Date().toISOString(); }
  await save(list);
  return `PROCÉDURES APPRISES À SUIVRE (dans l'ordre, sauf si Kouider dit autrement ; demande confirmation avant chaque envoi) :\n`
    + hits.map(p => `« ${p.name} » :\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`).join('\n\n');
}

/** Ménage de nuit : archive les procédures inutilisées depuis 60 jours. */
export async function archiveUnusedProcedures(): Promise<string[]> {
  const list = await loadProcedures();
  const limit = Date.now() - ARCHIVE_DAYS * 86_400_000;
  const archived = list.filter(p => p.active && Date.parse(p.last_used ?? p.created_at) < limit);
  for (const p of archived) p.active = false;
  if (archived.length) await save(list);
  return archived.map(p => p.name);
}
