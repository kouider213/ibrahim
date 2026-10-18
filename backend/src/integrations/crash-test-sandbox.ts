// Bac à sable du crash-test (scripts/crash-test.ts) : un message de test passe par le VRAI cerveau de Dzaryx,
// mais aucune action réelle ne part. Tout ce qui s'exécute dans runInSandbox() (même les agents internes qui
// appellent executeTool sans sessionId) est suivi par AsyncLocalStorage : les outils de lecture tournent
// vraiment, les autres (mail, WhatsApp, appel, réservation, mémoire…) sont SIMULÉS et seulement notés.
import { AsyncLocalStorage } from 'async_hooks';
import { READ_TOOLS } from './readonly-agent.js';

export interface SandboxCall { tool: string; input: Record<string, unknown>; simulated: boolean; result: string }
interface SandboxStore { calls: SandboxCall[] }

const als = new AsyncLocalStorage<SandboxStore>();
// Lecture, mais avec un effet (message à Kouider en cas d'échec) → simulée aussi
const SIDE_EFFECT_READS = new Set(['run_self_test']);
const PREVIEW_TOOLS = new Set(['whatsapp_web', 'send_whatsapp_to_client']);

/** Un appel simulé qui serait vraiment parti (pas une simple relecture ni une lecture). */
export function isRealAction(c: SandboxCall): boolean {
  if (!c.simulated) return false;
  if (PREVIEW_TOOLS.has(c.tool)) return c.input['confirmed'] === true;
  return true;
}

export function inSandbox(): boolean {
  return als.getStore() !== undefined;
}

export async function runInSandbox<T>(fn: () => Promise<T>): Promise<{ value: T; calls: SandboxCall[] }> {
  const store: SandboxStore = { calls: [] };
  const value = await als.run(store, fn);
  return { value, calls: store.calls };
}

/** null → exécuter l'outil pour de vrai (lecture) ; sinon le résultat simulé à renvoyer. */
export function sandboxIntercept(tool: string, input: Record<string, unknown>): string | null {
  const store = als.getStore();
  if (!store) return null;
  if (READ_TOOLS.has(tool) && !SIDE_EFFECT_READS.has(tool)) return null;
  // Outils à relecture : sans confirmed:true le vrai outil ne fait que montrer le message → on imite ça
  const result = PREVIEW_TOOLS.has(tool) && input['confirmed'] !== true
    ? `📝 Relecture : voici ce qui partirait. Demande à Kouider « je l'envoie ? » ; après son oui, rappelle l'outil avec confirmed:true.`
    : `✅ ${tool} effectué.`;
  store.calls.push({ tool, input, simulated: true, result });
  return result;
}

export function sandboxRecord(tool: string, input: Record<string, unknown>, result: string): void {
  als.getStore()?.calls.push({ tool, input, simulated: false, result: result.slice(0, 400) });
}
