import { supabase } from './supabase.js';

// Retrouver ce qu'on s'est dit (idée reprise d'OpenClaw « session search ») : « qu'est-ce que je t'avais dit sur
// Sonatrach la semaine dernière ? », « quel prix j'avais donné à Karim au téléphone ? ». Cherche dans toutes les
// conversations enregistrées (app, Telegram, appels) — Kouider voit tout, Houari seulement les siennes.
// Sessions de test / missions / MCP exclues. Les tours en mode privé sont effacés à la fin du mode (privacy.ts).

const STOP = new Set(['les', 'des', 'une', 'pour', 'que', 'qui', 'quoi', 'avec', 'dans', 'sur', 'est', 'pas', 'mon', 'mes',
  'ton', 'tes', 'son', 'ses', 'aux', 'par', 'avait', 'avais', 'dit', 'parle', 'parlé', 'quel', 'quelle', 'quand', 'comment',
  'semaine', 'derniere', 'dernière', 'hier', 'jour', 'mois', 'moi', 'toi', 'lui', 'elle', 'nous', 'vous', 'ils', 'tout', 'fait',
  'the', 'and']);
const strip = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function channel(sid: string): string {
  if (sid.startsWith('voice_')) return 'appel / vocal';
  if (sid.startsWith('mobile_')) return 'app';
  if (/telegram|tg_/.test(sid)) return 'Telegram';
  if (sid.startsWith('nexus')) return 'PC';
  return 'chat';
}

export async function searchConversationsTool(input: Record<string, unknown>, sessionId?: string): Promise<string> {
  const query = String(input['query'] ?? '').trim();
  const days = Math.min(Math.max(Number(input['days'] ?? 60) || 60, 1), 365);
  const isHouari = !!sessionId?.toLowerCase().includes('houari');
  const words = [...new Set(strip(query).split(/[^a-z0-9€@]+/).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 6);
  if (!words.length) return '❌ Donne-moi un mot-clé (nom, voiture, société, prix…).';

  // ilike est sensible aux accents : on cherche le mot tel quel ET sans accent
  const raw = query.toLowerCase().split(/[^\p{L}0-9€@]+/u).filter(w => w.length > 2);
  const terms = [...new Set([...words, ...raw])].map(w => w.replace(/[%,()]/g, ''));
  let q = supabase.from('conversations').select('session_id, role, content, created_at')
    .in('role', ['user', 'assistant'])
    .gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString())
    .or(terms.map(w => `content.ilike.%${w}%`).join(','))
    .not('session_id', 'ilike', 'test%').not('session_id', 'ilike', 'mission_%')
    .not('session_id', 'ilike', 'readonly%').not('session_id', 'ilike', 'mcp_%')
    .order('created_at', { ascending: false }).limit(400);
  if (isHouari) q = q.ilike('session_id', '%houari%');
  const { data, error } = await q;
  if (error) return `❌ Recherche impossible : ${error.message}`;

  const rows = (data ?? []) as Array<{ session_id: string; role: string; content: string; created_at: string }>;
  const scored = rows.map(r => {
    const c = strip(String(r.content));
    return { r, score: words.filter(w => c.includes(w)).length + (r.role === 'user' ? 0.3 : 0) };
  }).filter(x => x.score >= Math.min(words.length, 2) || (words.length === 1 && x.score >= 1))
    .sort((a, b) => b.score - a.score || b.r.created_at.localeCompare(a.r.created_at))
    .slice(0, 8);
  if (!scored.length) return `Rien trouvé sur « ${query} » dans nos conversations des ${days} derniers jours.`;

  const lines = scored.map(({ r }) => {
    // retire les consignes techniques ajoutées aux messages d'appel (« [APPEL EN COURS … ] »)
    const c = String(r.content).replace(/^\s*\[[^\]]{0,600}\]\s*/, '').replace(/\s+/g, ' ');
    const at = strip(c).indexOf(words.find(w => strip(c).includes(w)) ?? '');
    const start = Math.max(0, at - 140);
    const excerpt = `${start > 0 ? '…' : ''}${c.slice(start, start + 320)}${start + 320 < c.length ? '…' : ''}`;
    const when = new Date(r.created_at).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const who = r.role === 'user' ? (r.session_id.includes('houari') ? 'Houari' : 'Kouider') : 'Dzaryx';
    return `• ${when} (${channel(r.session_id)}) — ${who} : ${excerpt}`;
  });
  return `🔎 ${scored.length} passage(s) sur « ${query} » (${days} derniers jours) — c'est ce qui a été DIT, vérifie dans les données si c'est encore vrai :\n${lines.join('\n')}`;
}
