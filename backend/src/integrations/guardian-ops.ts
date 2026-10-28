/**
 * DZARYX VEILLE SUR LUI-MÊME ET SUR KOUIDER (27/10/2026) :
 *  - s'améliore seul : chaque nuit (3h), il relit les échanges de la veille où Kouider l'a corrigé / s'est agacé, et en
 *    tire des améliorations : des RÈGLES de comportement (appliquées après le oui de Kouider via save_learned_rule) et des
 *    BUGS de code (depuis le 28/10 : envoyés à l'atelier de nuit self-dev.ts / scripts/night-dev.mjs qui les corrige seul ; avant :
 *    ne touche jamais seul à son code en production). Matin 7h30 : « j'ai trouvé 3 choses, je les applique ? ».
 *  - se répare seul : à la 1re coupure détectée, il lance lui-même la réparation possible (code WhatsApp envoyé, lien
 *    Google renvoyé) ; le VPS relance seul le service Telegram / le PC cloud bloqués (scripts/self-heal-vps.ts).
 *  - garde du corps numérique : chaque jour, alertes de sécurité Google (connexion suspecte, mot de passe), pages ou
 *    comptes qui utilisent le nom FIK sans être à lui, mauvais avis, numéros signalés qui réapparaissent.
 */
import { ai, jsonOf, kvJson, kvPut, tg, research } from './ai-util.js';
import { supabase } from './supabase.js';

// ── S'améliore seul ──────────────────────────────────────────────────────────
interface Proposal { kind: 'rule' | 'bug'; text: string; why: string; category?: string }
const FRUSTRATION = /\b(non|faux|pas ça|n'importe quoi|t'as pas|tu as pas|tu n'as pas|j'ai dit|je t'ai dit|encore|toujours pas|bug|marche pas|ça marche pas|pourquoi tu|arrête|c'est pas|oublié|tu comprends pas|réessaie|re-?fais)\b/i;

export async function jobSelfImprove(): Promise<string> {
  const from = new Date(Date.now() - 26 * 3600_000).toISOString();
  const { data } = await supabase.from('conversations').select('role, content, created_at').eq('session_id', 'voice_kouider').in('role', ['user', 'assistant'])
    .gte('created_at', from).order('created_at').limit(800);
  const rows = (data ?? []) as Array<{ role: string; content: string }>;
  const moments: string[] = [];
  rows.forEach((r, i) => {
    if (r.role === 'user' && FRUSTRATION.test(String(r.content).slice(0, 300)) && i > 0) {
      moments.push(`DZARYX : ${String(rows[i - 1]!.content).slice(0, 500)}\nKOUIDER : ${String(r.content).slice(0, 400)}${rows[i + 1] ? `\nDZARYX ensuite : ${String(rows[i + 1]!.content).slice(0, 300)}` : ''}`);
    }
  });
  if (!moments.length) { await kvPut('improve:pending', []); return 'aucune correction hier'; }
  const o = jsonOf<{ proposals?: Proposal[] }>(await ai(`Tu es Dzaryx et tu fais ton auto-critique. Voici les moments d'hier où Kouider t'a corrigé ou s'est agacé :\n\n${moments.slice(0, 25).join('\n\n———\n\n')}\n\n`
    + 'Pour chaque VRAIE erreur de ta part (pas quand c\'était juste une conversation), propose UNE amélioration : soit "rule" = une règle de comportement claire que tu suivras désormais (formulée « Toujours… » / « Ne jamais… »), soit "bug" = un problème technique (outil qui échoue, info fausse renvoyée par un outil, fonction qui manque) à corriger dans ton code. Maximum 5, les plus utiles. Pas de doublon.\n'
    + 'Réponds UNIQUEMENT : {"proposals":[{"kind":"rule|bug","text":"la règle ou le bug, précis","why":"le moment qui le montre, en 1 phrase","category":"business|client|pricing|communication|operations|reminder"}]}', { quality: true, max: 1500 })) ?? {};
  const all = (o.proposals ?? []).filter(p => p.text).slice(0, 5);
  // Bugs de code → l'atelier de nuit les corrige seul (se_coder) ; les règles restent proposées le matin
  const { addDevTask } = await import('./self-dev.js');
  for (const b of all.filter(p => p.kind === 'bug')) await addDevTask(`BUG trouvé par l'auto-critique : ${b.text} (moment : ${b.why})`, 'auto');
  const ps = all.filter(p => p.kind === 'rule');
  await kvPut('improve:pending', ps, 3 * 86_400);
  return `${ps.length} proposition(s)`;
}

export async function jobSelfImproveMorning(): Promise<string> {
  const ps = await kvJson<Proposal[]>('improve:pending', []);
  if (!ps.length) return 'rien';
  await tg(`🧬 Cette nuit j'ai relu mes erreurs d'hier. Je propose ${ps.length} amélioration(s) :\n${ps.map((p, i) => `${i + 1}. ${p.kind === 'rule' ? '📏 Règle' : '🐞 Bug à corriger'} : ${p.text}\n   (${p.why})`).join('\n')}\n\nDis « applique les améliorations » (ou « applique la 1 et la 3 »).`);
  return 'proposé';
}

export async function selfImproveTool(input: Record<string, unknown>): Promise<string> {
  const action = String(input['action'] ?? 'show');
  const ps = await kvJson<Proposal[]>('improve:pending', []);
  const dev = await kvJson<Array<Proposal & { at: string }>>('improve:dev', []);
  if (action === 'show') return ps.length ? ps.map((p, i) => `${i + 1}. ${p.kind === 'rule' ? '📏' : '🐞'} ${p.text}`).join('\n') : `Rien en attente.${dev.length ? `\n🐞 Bugs notés pour la prochaine séance de développement : ${dev.length}` : ''}`;
  if (action === 'dev_list') return dev.length ? dev.map(d => `• ${d.at.slice(0, 10)} ${d.text}`).join('\n') : 'Aucun bug noté.';
  if (action !== 'apply') return '❌ action : show, apply, dev_list';
  const nums = ((input['numbers'] as unknown[] | undefined) ?? []).map(Number).filter(n => n > 0);
  const chosen = ps.filter((_, i) => !nums.length || nums.includes(i + 1));
  if (!chosen.length) return 'Rien à appliquer.';
  const { executeTool } = await import('./tool-executor.js');
  const out: string[] = [];
  for (const p of chosen) {
    if (p.kind === 'rule') {
      const r = await executeTool('save_learned_rule', { rule: p.text, category: p.category ?? 'communication', context: `auto-amélioration ${new Date().toISOString().slice(0, 10)} : ${p.why}`, priority: 7 }, 'self-improve').catch(e => `❌ ${e}`);
      out.push(`📏 ${/❌/.test(r) ? `pas enregistrée (${r.slice(0, 80)})` : 'appliquée tout de suite'} : ${p.text}`);
    } else {
      dev.push({ ...p, at: new Date().toISOString() });
      await (await import('./self-dev.js')).addDevTask(`BUG : ${p.text} (moment : ${p.why})`, 'auto');
      out.push(`🐞 envoyé à l'atelier de code : corrigé seul cette nuit, rapport au réveil : ${p.text}`);
    }
  }
  await kvPut('improve:dev', dev.slice(-60));
  await kvPut('improve:pending', ps.filter(p => !chosen.includes(p)), 3 * 86_400);
  return `🧬 Fait :\n${out.join('\n')}`;
}

// ── Se répare seul (côté cerveau) ────────────────────────────────────────────
/** Appelé par la surveillance des connexions à la 1re coupure : tente la réparation possible, dit ce qu'il a fait. */
export async function tryAutoRepair(id: string): Promise<string> {
  const { executeTool } = await import('./tool-executor.js');
  try {
    if (id === 'whatsapp') {
      const r = await executeTool('whatsapp_web', { action: 'connect' }, 'self-heal');
      return /Code WhatsApp/.test(r) ? '🩺 J\'ai déjà demandé un code de reconnexion : il est sur ton Telegram, tape-le dans WhatsApp Business (il expire vite).' : '';
    }
    if (id === 'gmail' || id === 'agenda') {
      const r = await executeTool('connect_gmail', {}, 'self-heal');
      return /https?:\/\//.test(r) ? `🩺 Voici le lien pour reconnecter Google en 1 clic :\n${(/https?:\/\/\S+/.exec(r) ?? [''])[0]}` : '';
    }
    if (id === 'cloudpc' || id === 'telegram') return '🩺 Le serveur essaie de relancer le service tout seul (dans les 10 min).';
  } catch { /* la réparation n'a pas marché : on garde le message normal */ }
  return '';
}

// ── Garde du corps numérique ─────────────────────────────────────────────────
export async function jobBodyguard(): Promise<string> {
  const alerts: string[] = [];
  const { executeTool } = await import('./tool-executor.js');
  // 1. Alertes de sécurité Google / connexions suspectes (24 h)
  const sec = await executeTool('list_emails', { query: 'newer_than:1d (from:no-reply@accounts.google.com OR subject:(alerte sécurité) OR subject:(security alert) OR subject:(nouvelle connexion) OR subject:(new sign-in) OR subject:(mot de passe) OR subject:(password))', max_results: 10 }, 'bodyguard').catch(() => '');
  if (sec && !/^❌|aucun/i.test(sec) && /alert|connexion|sign-in|mot de passe|password/i.test(sec)) alerts.push(`🔐 Alertes de sécurité dans tes mails (24 h) :\n${sec.slice(0, 700)}`);
  // 2. Usurpation du nom FIK / nouveaux avis négatifs (1 fois par semaine, le lundi)
  if (new Date().getDay() === 1) {
    const web = await research('Cherche sur le web (Facebook, Instagram, TikTok, Ouedkniss, Google) des pages, comptes ou annonces qui utilisent le nom « FIK Conciergerie » ou « Fik location » à Oran mais qui ne sont PAS les officiels (site fikconciergerie.com, WhatsApp +32 466 31 14 69). Cherche aussi des avis négatifs récents sur FIK. Réponds : liste des suspects avec lien et pourquoi c\'est suspect, ou « RAS ».', { rounds: 6, sessionId: 'bodyguard' }).catch(() => '');
    if (web && !/^\s*RAS\b/i.test(web) && !/aucun (compte|résultat) suspect/i.test(web)) alerts.push(`🕵️ Veille de ton nom :\n${web.slice(0, 1200)}`);
  }
  // 3. Numéros signalés qui réapparaissent dans les réservations récentes
  const flags = await kvJson<Array<{ phone: string; reason: string }>>('fraud:numbers', []);
  if (flags.length) {
    const { data } = await supabase.from('bookings').select('client_name, client_phone, created_at').gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
    for (const b of (data ?? []) as Array<{ client_name: string; client_phone?: string }>) {
      const d = String(b.client_phone ?? '').replace(/\D/g, '').slice(-9);
      const hit = d.length >= 8 && flags.find(f => f.phone.replace(/\D/g, '').endsWith(d));
      if (hit) alerts.push(`🚩 ${b.client_name} (${b.client_phone}) vient de réserver avec un numéro SIGNALÉ : ${hit.reason}`);
    }
  }
  if (alerts.length) await tg(`🛡️ Garde du corps numérique :\n\n${alerts.join('\n\n')}`);
  return `${alerts.length} alerte(s)`;
}
