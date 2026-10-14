// Auto-test quotidien de Dzaryx (idée : une panne silencieuse — ex. messages Telegram cassés le 2026-10-14 —
// ne doit plus durer des heures). Tout est en LECTURE SEULE : aucun outil qui écrit, envoie ou appelle.
// Résultat dans app_kv selftest:last ; message à Kouider seulement si quelque chose ne va pas
// (et une fois par semaine, le lundi, un « tout va bien » court).
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { executeTool, isToolFailureResult } from './tool-executor.js';
import { probeProviders } from './fallback-probe.js';
import { lastBackup } from './db-backup.js';
import { getNexusStatus } from '../actions/handlers/nexus-relay.js';
import { emitProactive } from '../notifications/mobile-push.js';

export interface Check { name: string; ok: boolean; info: string; ms: number }
export interface SelfTestReport { at: string; ok: number; failed: number; checks: Check[] }

const SID = 'selftest';
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Outils de lecture, avec des paramètres sans effet de bord.
function readTools(): Array<[string, string, Record<string, unknown>]> {
  const in7 = new Date(Date.now() + 7 * 86_400_000), in9 = new Date(Date.now() + 9 * 86_400_000);
  return [
    ['Réservations', 'list_bookings', {}],
    ['Parc voitures', 'get_fleet_status', {}],
    ['Disponibilités', 'check_car_availability', { start_date: ymd(in7), end_date: ymd(in9) }],
    ['Impayés', 'get_unpaid_bookings', {}],
    ['Retards de retour', 'get_late_returns', {}],
    ['Dépenses', 'get_expenses', {}],
    ['Papiers voitures', 'get_car_papers', {}],
    ['Entretien', 'get_vehicle_maintenance', {}],
    ['Tableau finances', 'get_finance_dashboard', {}],
    ['Missions', 'list_missions', {}],
    ['Prospects', 'list_prospects', {}],
    ['Mémoire', 'recall_memory', { query: 'Kouider' }],
    ['Agenda Google', 'list_calendar_events', {}],
    ['Mails pro', 'list_emails', { max_results: 1 }],
    ['Météo', 'get_weather', { city: 'Oran' }],
    ['Liste des outils', 'list_my_capabilities', { detail: false }],
  ];
}

async function timed(name: string, fn: () => Promise<{ ok: boolean; info: string }>, timeoutMs = 45_000): Promise<Check> {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      fn(),
      new Promise<{ ok: boolean; info: string }>(res => setTimeout(() => res({ ok: false, info: `pas de réponse en ${timeoutMs / 1000} s` }), timeoutMs)),
    ]);
    return { name, ...r, ms: Date.now() - t0 };
  } catch (err) {
    return { name, ok: false, info: (err instanceof Error ? err.message : String(err)).slice(0, 200), ms: Date.now() - t0 };
  }
}

const ageH = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity);

// Tâches quotidiennes qui doivent avoir tourné dans les dernières 26 h.
const DAILY_JOBS = ['morning-briefing', 'daily-recap-call', 'prospect-outreach', 'client-sites', 'rental-eve-call', 'memory-consolidation'];

export async function runSelfTest(): Promise<SelfTestReport> {
  const checks: Check[] = [];

  checks.push(await timed('Base de données', async () => {
    const { count, error } = await supabase.from('cars').select('id', { count: 'exact', head: true });
    if (error) return { ok: false, info: error.message };
    return { ok: true, info: `${count ?? 0} voitures` };
  }));

  checks.push(await timed('Cerveau IA (Claude + secours)', async () => {
    const p = await probeProviders(true);
    const claude = p['claude'];
    const backups = Object.entries(p).filter(([k, v]) => k !== 'claude' && v.state === 'ok').map(([k]) => k);
    if (claude?.state !== 'ok') return { ok: false, info: `Claude ${claude?.state ?? 'absent'}${claude?.error ? ` (${claude.error.slice(0, 80)})` : ''} — secours OK : ${backups.join(', ') || 'aucun'}` };
    return { ok: true, info: `Claude OK (${claude.ms} ms), secours : ${backups.join(', ') || 'aucun'}` };
  }, 60_000));

  for (const [label, tool, input] of readTools()) {
    checks.push(await timed(label, async () => {
      const out = await executeTool(tool, input, SID);
      const bad = isToolFailureResult(out, tool) || /^❌|n'est pas activée|Il faut d'abord autoriser|reconnect/i.test(out);
      return { ok: !bad, info: bad ? out.replace(/\s+/g, ' ').slice(0, 160) : 'OK' };
    }));
  }

  for (const kind of ['drive', 'vps'] as const) {
    checks.push(await timed(`Sauvegarde ${kind === 'drive' ? 'Google Drive' : 'VPS'}`, async () => {
      const b = await lastBackup(kind);
      if (!b) return { ok: false, info: 'aucune sauvegarde enregistrée' };
      const h = ageH(b.at);
      return { ok: h < 30 && b.failed === 0, info: `il y a ${Math.round(h)} h — ${b.tables} tables, ${b.rows} lignes${b.failed ? `, ${b.failed} tables illisibles` : ''}` };
    }));
  }

  checks.push(await timed('Service appels/messages Telegram', async () => {
    const beat = await kvGet('tgcall:heartbeat');
    const h = ageH(beat);
    const errs = JSON.parse((await kvGet('tgcall:errors')) ?? '[]') as Array<{ at: string; msg: string }>;
    const recent = errs.filter(e => ageH(e.at) < 24);
    if (h > 0.2) return { ok: false, info: `plus de signe de vie depuis ${Math.round(h * 60)} min` };
    if (recent.length) return { ok: false, info: `${recent.length} erreur(s) en 24 h, dernière : ${recent[recent.length - 1]!.msg.slice(0, 120)}` };
    return { ok: true, info: 'en ligne, aucune erreur en 24 h' };
  }));

  checks.push(await timed('Tâches automatiques', async () => {
    // Dernier passage de chaque tâche ; une tâche jamais lancée (ajoutée aujourd'hui) n'est pas une panne.
    const last = await Promise.all(DAILY_JOBS.map(async j => {
      const { data } = await supabase.from('job_runs').select('started_at').eq('job', j).order('started_at', { ascending: false }).limit(1);
      return [j, (data?.[0] as { started_at?: string } | undefined)?.started_at ?? null] as const;
    }));
    const missing = last.filter(([, at]) => at && ageH(at) > 26).map(([j]) => j);
    const { data: fails } = await supabase.from('app_kv').select('key').like('key', 'jobfail:%');
    const failing = (fails ?? []).map(r => (r as { key: string }).key.slice(8));
    if (missing.length || failing.length) {
      return { ok: false, info: [missing.length ? `pas lancées en 26 h : ${missing.join(', ')}` : '', failing.length ? `en échec : ${failing.join(', ')}` : ''].filter(Boolean).join(' — ') };
    }
    return { ok: true, info: `${DAILY_JOBS.length} tâches du jour lancées, aucune en échec` };
  }));

  // Nexus : pour info seulement (le PC peut être éteint normalement). Dernier signe gardé dans app_kv (survit aux redéploiements).
  checks.push(await timed('Nexus (PC)', async () => {
    if (getNexusStatus().online) {
      const { nexusBehind } = await import('./nexus-remote.js');
      const b = await nexusBehind().catch(() => null);
      return { ok: true, info: `connecté${b?.files.length ? ` — en retard de ${b.files.length} fichier(s), mise à jour auto au prochain démarrage` : ', à jour'}` };
    }
    const last = JSON.parse((await kvGet('nexus:last_seen')) ?? '{}') as { at?: string };
    const h = ageH(last.at);
    return { ok: true, info: last.at ? `hors ligne depuis ${h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} j`} (normal si le PC est éteint)` : 'jamais vu' };
  }, 30_000));

  const report: SelfTestReport = { at: new Date().toISOString(), ok: checks.filter(c => c.ok).length, failed: checks.filter(c => !c.ok).length, checks };
  await kvSet('selftest:last', JSON.stringify(report));
  return report;
}

export function formatSelfTest(r: SelfTestReport, onlyProblems = false): string {
  const lines = r.checks.filter(c => !onlyProblems || !c.ok).map(c => `${c.ok ? '✅' : '❌'} ${c.name} — ${c.info}`);
  const head = r.failed
    ? `🩺 Auto-test Dzaryx : ${r.failed} problème${r.failed > 1 ? 's' : ''} sur ${r.checks.length} vérifications`
    : `🩺 Auto-test Dzaryx : tout fonctionne (${r.checks.length} vérifications)`;
  return `${head}\n${lines.join('\n')}`;
}

/** Job 7h45 (Alger) : problèmes → message à Kouider ; le lundi, résumé même si tout va bien. */
export async function jobSelfTest(): Promise<string> {
  const r = await runSelfTest();
  const monday = new Date().getDay() === 1;
  if (r.failed) {
    emitProactive(`🩺 Auto-test : ${r.failed} problème${r.failed > 1 ? 's' : ''} détecté${r.failed > 1 ? 's' : ''}.`, 'alert',
      `${formatSelfTest(r, true)}\n\nDis « auto-test » pour relancer, ou demande à Claude Code de regarder.`, 'kouider');
  } else if (monday) {
    emitProactive('🩺 Auto-test : tout fonctionne.', 'info', formatSelfTest(r, true), 'kouider');
  }
  return `${r.ok} OK, ${r.failed} en échec`;
}

/** Outil run_self_test / backup_status. */
export async function selfTestTool(input: Record<string, unknown>): Promise<string> {
  if (input['what'] === 'backup') {
    const [d, v] = await Promise.all([lastBackup('drive'), lastBackup('vps')]);
    const f = (b: Awaited<ReturnType<typeof lastBackup>>, n: string) => b
      ? `${ageH(b.at) < 30 ? '✅' : '⚠️'} ${n} : ${new Date(b.at).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels' })} — ${b.tables} tables, ${b.rows} lignes, ${b.kb} Ko (${b.where})`
      : `❌ ${n} : aucune sauvegarde`;
    return `💾 Sauvegardes (chaque nuit, 30 jours gardés)\n${f(d, 'Google Drive')}\n${f(v, 'VPS')}`;
  }
  if (input['what'] === 'last') {
    const raw = await kvGet('selftest:last');
    if (raw) return formatSelfTest(JSON.parse(raw) as SelfTestReport);
  }
  return formatSelfTest(await runSelfTest());
}
