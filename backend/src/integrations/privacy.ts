import { kvGet, kvSet } from './app-store.js';
import { supabase } from './supabase.js';
import { getLearnedRules } from './learned-rules.js';
import { loadIntentions } from './intentions.js';
import { loadMissions } from './missions.js';
import { recentCallsText } from '../notifications/call-memory.js';
import { emitProactive } from '../notifications/mobile-push.js';

// Mode privé + « montre tout ce que tu sais sur moi » (idée reprise d'Open.Jarvis « memory privacy controls »).
// Mode privé : Dzaryx ne retient rien (pas de mémoire auto, pas d'apprentissage, pas de résumé d'appel), et à la
// fin du mode les messages échangés pendant ce temps sont EFFACÉS de l'historique. Ce qu'il retient sur demande
// explicite (« retiens que… ») reste possible. Fin : « fin du mode privé » ou au bout de N heures (défaut 2 h).

type Actor = 'kouider' | 'houari';
interface PrivacyState { since: string; until: string; sessions: string[] }
const key = (a: Actor) => `privacy:${a}`;

async function readState(a: Actor): Promise<PrivacyState | null> {
  try { return JSON.parse((await kvGet(key(a))) ?? 'null') as PrivacyState | null; } catch { return null; }
}

/** Mode privé actif pour cet acteur ? (note la session pour l'effacer à la fin) */
export async function isPrivate(actor: string, sessionId?: string): Promise<boolean> {
  const a: Actor = actor === 'houari' ? 'houari' : 'kouider';
  const st = await readState(a).catch(() => null);
  if (!st) return false;
  if (Date.now() > new Date(st.until).getTime()) { await endPrivacy(a, true); return false; }
  if (sessionId && !st.sessions.includes(sessionId)) {
    st.sessions.push(sessionId);
    await kvSet(key(a), JSON.stringify(st), 2 * 86_400);
  }
  return true;
}

async function endPrivacy(a: Actor, expired: boolean): Promise<number> {
  const st = await readState(a);
  if (!st) return 0;
  await kvSet(key(a), 'null', 60);
  let erased = 0;
  if (st.sessions.length) {
    const { data } = await supabase.from('conversations').delete()
      .in('session_id', st.sessions).gte('created_at', st.since).select('id');
    erased = data?.length ?? 0;
  }
  if (expired) emitProactive(`🔓 Mode privé terminé (${erased} message(s) effacé(s))`, 'info',
    `🔓 Le mode privé est terminé : j'ai effacé les ${erased} message(s) échangés pendant ce temps. Je retiens à nouveau normalement.`, a);
  console.log(`[privacy] ${a} fin du mode privé, ${erased} message(s) effacé(s)`);
  return erased;
}

/** Job toutes les 10 min : termine les modes privés expirés (et efface). */
export async function jobPrivacyExpire(): Promise<void> {
  for (const a of ['kouider', 'houari'] as const) await isPrivate(a);
}

export async function setPrivateModeTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const a: Actor = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  if (input['on'] === false) {
    if (!(await readState(a))) return 'Le mode privé n\'était pas actif.';
    const n = await endPrivacy(a, false);
    return `🔓 Mode privé terminé : ${n} message(s) effacé(s) de l'historique. Je retiens à nouveau normalement.`;
  }
  const hours = Math.min(Math.max(Number(input['hours'] ?? 2) || 2, 0.25), 24);
  const prev = await readState(a);
  const st: PrivacyState = {
    since: prev?.since ?? new Date(Date.now() - 60_000).toISOString(),
    until: new Date(Date.now() + hours * 3_600_000).toISOString(),
    sessions: [...new Set([...(prev?.sessions ?? []), ...(sessionId ? [sessionId] : [])])],
  };
  await kvSet(key(a), JSON.stringify(st), 2 * 86_400);
  return `🔒 Mode privé activé pour ${hours} h : je ne retiens rien de ce qu'on se dit, et à la fin j'efface nos messages. `
    + 'Dis « fin du mode privé » pour l\'arrêter avant.';
}

/** « Montre tout ce que tu sais sur moi » */
export async function showMyMemoryTool(_input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const a: Actor = sessionId?.toLowerCase().includes('houari') ? 'houari' : 'kouider';
  const [rules, facts, calls, intentions, missions, priv] = await Promise.all([
    getLearnedRules(a, 80).then(r => r.filter(x => x.owner_key === a)).catch(() => []),
    supabase.from('memory_facts').select('domain, key, value, updated_at').eq('is_current', true)
      .order('updated_at', { ascending: false }).limit(60).then(r => (r.data ?? []) as Array<{ domain: string; value: string }>),
    recentCallsText(a, 3).catch(() => ''),
    loadIntentions().then(l => l.filter(i => i.active && i.owner === a)).catch(() => []),
    loadMissions().then(l => l.filter(m => m.owner === a)).catch(() => []),
    readState(a).catch(() => null),
  ]);
  const parts: string[] = [];
  if (priv) parts.push(`🔒 Mode privé actif jusqu'à ${new Date(priv.until).toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' })}.`);
  parts.push(rules.length ? `📚 RÈGLES APPRISES (${rules.length}) :\n${rules.map(r => `• ${r.rule}`).join('\n')}` : '📚 Aucune règle apprise.');
  if (a === 'kouider') {
    const byDomain = new Map<string, string[]>();
    for (const f of facts) byDomain.set(f.domain, [...(byDomain.get(f.domain) ?? []), f.value]);
    parts.push(facts.length ? `🧠 SOUVENIRS (${facts.length} plus récents) :\n${[...byDomain].map(([d, v]) => `[${d}] ${v.slice(0, 12).map(x => String(x).slice(0, 140)).join(' · ')}`).join('\n')}` : '🧠 Aucun souvenir enregistré.');
  }
  if (calls) parts.push(`📞 DERNIERS APPELS :\n${calls.slice(0, 1200)}`);
  if (intentions.length) parts.push(`🔔 RAPPELS D'ÉVÉNEMENT : ${intentions.map(i => `${i.match} → ${i.reminder}`).join(' · ')}`);
  if (missions.length) parts.push(`🎯 MISSIONS : ${missions.map(m => `${m.title} (${m.active ? m.when : 'en pause'})`).join(' · ')}`);
  parts.push('Pour effacer : « oublie la règle … », « oublie le souvenir … ». Pour parler sans que je retienne : « mode privé ».');
  return parts.join('\n\n');
}

/** « Oublie le souvenir … » : désactive les souvenirs (memory_facts) qui correspondent. */
export async function forgetMemoryFactTool(input: Record<string, unknown>): Promise<string> {
  const strip = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = strip(String(input['text'] ?? '')).split(/[^a-z0-9€@]+/).filter(w => w.length > 2);
  if (!words.length) return '❌ Dis-moi quelques mots du souvenir à oublier.';
  const { data } = await supabase.from('memory_facts').select('id, key, value').eq('is_current', true)
    .ilike('value', `%${words[0]}%`).limit(50);
  const hits = ((data ?? []) as Array<{ id: string; value: string }>).filter(f => words.every(w => strip(f.value).includes(w)));
  if (!hits.length) return `❌ Aucun souvenir ne contient « ${input['text']} ».`;
  if (hits.length > 3) return `Trop de souvenirs correspondent (${hits.length}), sois plus précis :\n${hits.slice(0, 5).map(h => `• ${h.value.slice(0, 120)}`).join('\n')}`;
  await supabase.from('memory_facts').update({ is_current: false, updated_at: new Date().toISOString() }).in('id', hits.map(h => h.id));
  return `🗑️ Oublié : ${hits.map(h => `« ${h.value.slice(0, 120)} »`).join(', ')}`;
}
