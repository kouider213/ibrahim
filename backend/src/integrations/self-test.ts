// Auto-test quotidien de Dzaryx (idée : une panne silencieuse — ex. messages Telegram cassés le 2026-10-14 —
// ne doit plus durer des heures). Tout est en LECTURE SEULE : aucun outil qui écrit, envoie ou appelle.
// Résultat dans app_kv selftest:last ; message à Kouider seulement si quelque chose ne va pas
// (et une fois par semaine, le lundi, un « tout va bien » court).
import { supabase } from './supabase.js';
import { kvGet, kvSet } from './app-store.js';
import { executeTool, isToolFailureResult } from './tool-executor.js';
import { probeProviders } from './fallback-probe.js';
import { lastBackup, googleStorage } from './db-backup.js';
import { getNexusStatus } from '../actions/handlers/nexus-relay.js';
import { emitProactive } from '../notifications/mobile-push.js';

export interface Check { name: string; ok: boolean; info: string; ms: number }
export interface SelfTestReport { at: string; ok: number; failed: number; checks: Check[] }

const SID = 'selftest';

// Santé des appels Telegram (24/10 : 4 appels muets la veille, voix gratuite bloquée — Kouider ne l'a su que 2 jours après).
type CallKind = 'ok' | 'muet' | 'manque' | 'bascule';
const brusselsDay = (ts = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date(ts));
const healthKey = (day: string) => `calls:health:${day}`;

export async function recordCallHealth(kind: CallKind): Promise<void> {
  const key = healthKey(brusselsDay());
  const h = JSON.parse((await kvGet(key)) ?? '{}') as Partial<Record<CallKind, number>>;
  h[kind] = (h[kind] ?? 0) + 1;
  await kvSet(key, JSON.stringify(h), 4 * 86_400);
}

async function callHealthYesterday(): Promise<{ ok: boolean; info: string }> {
  const h = JSON.parse((await kvGet(healthKey(brusselsDay(Date.now() - 86_400_000)))) ?? '{}') as Partial<Record<CallKind, number>>;
  const [ok, muet, manque, bascule] = [h.ok ?? 0, h.muet ?? 0, h.manque ?? 0, h.bascule ?? 0];
  if (!ok && !muet && !manque && !bascule) return { ok: true, info: 'aucun appel hier' };
  const parts = [`${ok} réussi${ok > 1 ? 's' : ''}`, manque ? `${manque} pas décroché${manque > 1 ? 's' : ''}` : '',
    muet ? `${muet} muet${muet > 1 ? 's' : ''} (ton iPhone n'envoyait pas de son)` : '',
    bascule ? `${bascule} fois la voix gratuite a bloqué → passé sur Claude` : ''].filter(Boolean);
  return { ok: !muet && !bascule, info: parts.join(', ') };
}
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

/**
 * Délai de réponse de la veille (10/11) : temps entre un message de Kouider et ma réponse, sur Telegram / app.
 * Sert à l'auto-test (alerte si ça se dégrade) et au briefing du matin (une ligne chaque jour) — il voit lui-même la vitesse.
 * Une réponse arrivée plus de 15 min après = question gardée pour plus tard (cerveaux saturés), comptée à part.
 */
export interface ReplyDelay { n: number; median: number; p90: number; late: number }
export async function replyDelayYesterday(): Promise<ReplyDelay | null> {
  const day = brusselsDay(Date.now() - 86_400_000);
  const { data, error } = await supabase.from('conversations').select('role, created_at').eq('session_id', 'voice_kouider')
    .in('role', ['user', 'assistant']).gte('created_at', new Date(Date.now() - 50 * 3_600_000).toISOString()).order('created_at').limit(3000);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Array<{ role: string; created_at: string }>).filter(r => brusselsDay(Date.parse(r.created_at)) === day);
  const secs: number[] = [];
  let late = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.role !== 'assistant' || rows[i - 1]!.role !== 'user') continue;
    const s = (Date.parse(rows[i]!.created_at) - Date.parse(rows[i - 1]!.created_at)) / 1000;
    if (s > 900) late++; else secs.push(s);
  }
  if (!secs.length && !late) return null;
  secs.sort((a, b) => a - b);
  const at = (q: number) => Math.round(secs[Math.min(secs.length - 1, Math.floor(q * secs.length))] ?? 0);
  return { n: secs.length + late, median: at(0.5), p90: at(0.9), late };
}
const secTxt = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);
export function replyDelayText(d: ReplyDelay): string {
  return `${secTxt(d.median)} en général, 9 fois sur 10 en moins de ${secTxt(d.p90)} (${d.n} message${d.n > 1 ? 's' : ''}${d.late ? `, dont ${d.late} répondu${d.late > 1 ? 's' : ''} plus tard` : ''})`;
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
    // 06/11 : Dzaryx à 0 € (31/10) = Claude volontairement pas utilisé → pas une panne si les secours répondent
    const free = (await kvGet('brain:free').catch(() => null)) !== '0' && process.env['FREE_BRAIN'] !== '0';
    if (claude?.state !== 'ok' && free && backups.length) return { ok: true, info: `mode gratuit voulu — cerveaux : ${backups.join(', ')}` };
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
      // Compte Google plein = la vraie cause (05→10/11) : le dire, sinon le conseil « reconnecte mes mails » ne sert à rien
      if (kind === 'drive' && h >= 30 && ((await googleStorage().catch(() => null))?.pct ?? 0) >= 98) {
        return { ok: false, info: `arrêtée depuis ${Math.round(h / 24)} j parce que ton espace Google est plein (la copie VPS continue)` };
      }
      return { ok: h < 30 && b.failed === 0, info: `il y a ${Math.round(h)} h — ${b.tables} tables, ${b.rows} lignes${b.failed ? `, ${b.failed} tables illisibles` : ''}` };
    }));
  }

  // Espace Google : prévenir à 90 %, AVANT que la sauvegarde Drive (et les mails) bloquent.
  checks.push(await timed('Espace Google', async () => {
    const g = await googleStorage();
    if (!g) return { ok: true, info: 'non mesurable (compte pas autorisé) — rien à signaler' };
    const info = `${g.pct} % utilisé (${g.usedGb.toFixed(1).replace('.', ',')} Go sur ${g.limitGb.toFixed(1).replace('.', ',')})`;
    if (g.pct < 90) return { ok: true, info };
    if (g.pct >= 98) return { ok: false, info: `plein — ${info} : sauvegarde Drive bloquée, les nouveaux mails peuvent être refusés` };
    // Entre 90 et 97 % : un seul rappel par semaine (sinon le même message tous les matins pendant des mois)
    if (await kvGet('gstorage:warned').catch(() => null)) return { ok: true, info: `${info} — bientôt plein, déjà signalé cette semaine` };
    await kvSet('gstorage:warned', '1', 7 * 86_400);
    return { ok: false, info: `bientôt plein — ${info}` };
  }));

  checks.push(await timed('Délai de réponse hier', async () => {
    const d = await replyDelayYesterday();
    if (!d) return { ok: true, info: 'aucun message hier' };
    // Repère : médiane 17 s mesurée du 01 au 09/11. Lent = plus du double, sur assez de messages pour que ça veuille dire quelque chose.
    const slow = d.n >= 5 && (d.median > 40 || d.late / d.n > 0.2);
    return { ok: !slow, info: `${slow ? 'plus lent que d\'habitude — ' : ''}${replyDelayText(d)}` };
  }));

  checks.push(await timed('Service appels/messages Telegram', async () => {
    const beat = await kvGet('tgcall:heartbeat');
    const h = ageH(beat);
    const errs = JSON.parse((await kvGet('tgcall:errors')) ?? '[]') as Array<{ at: string; msg: string }>;
    const recent = errs.filter(e => ageH(e.at) < 24 && !/declined|busy|no answer|missed|refus|occup/i.test(e.msg));
    if (h > 0.2) return { ok: false, info: `plus de signe de vie depuis ${Math.round(h * 60)} min` };
    if (recent.length) return { ok: false, info: `${recent.length} erreur(s) en 24 h, dernière : ${recent[recent.length - 1]!.msg.slice(0, 120)}` };
    return { ok: true, info: 'en ligne, aucune erreur en 24 h' };
  }));

  checks.push(await timed('Appels d\'hier', callHealthYesterday));
  checks.push(await timed('Crédit Claude', async () => {
    const { getBilling } = await import('./billing.js');
    const row = (await getBilling()).rows.find(r => r.id === 'anthropic');
    return { ok: !!row && row.state !== 'out' && row.state !== 'soon', info: row?.status ?? 'inconnu' };
  }));
  // 06/11 : le démarchage était coupé depuis le 29/10 sans que personne le voie (la tâche « tournait » mais n'envoyait rien)
  checks.push(await timed('Démarchage', async () => {
    const { getAutopilot } = await import('./prospects.js');
    const a = await getAutopilot();
    const { data } = await supabase.from('prospects').select('last_contacted_at').not('gmail_thread_id', 'is', null)
      .order('last_contacted_at', { ascending: false }).limit(1);
    const last = (data?.[0] as { last_contacted_at?: string } | undefined)?.last_contacted_at;
    if (!a.enabled) return { ok: false, info: `coupé (dernier mail ${last ? `il y a ${Math.round(ageH(last) / 24)} j` : 'jamais'}) — dis « relance le démarchage »` };
    if (last && ageH(last) > 50) return { ok: false, info: `allumé mais aucun mail depuis ${Math.round(ageH(last) / 24)} j` };
    return { ok: true, info: `${a.per_day} mails/jour, dernier il y a ${last ? Math.round(ageH(last)) + ' h' : '—'}` };
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

  // PC cloud : toujours allumé sur le VPS → hors ligne = vraie panne
  checks.push(await timed('PC cloud (serveur)', async () => {
    const { isCloudPcOnline, cloudEmit } = await import('../actions/handlers/cloudpc-relay.js');
    if (!isCloudPcOnline()) return { ok: false, info: 'agent non connecté (pm2 dzaryx-cloudpc / dzaryx-cloudpc-desktop sur le VPS)' };
    const st = await cloudEmit<{ ok: boolean; chrome?: boolean; tabs?: unknown[] }>('cloud:status', {}, 15_000);
    return { ok: !!st.chrome, info: st.chrome ? `en ligne, Chrome ouvert (${st.tabs?.length ?? 0} onglet(s))` : 'en ligne mais Chrome fermé' };
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

/** 09/11 — plus de Claude Code à partir de demain : chaque problème est suivi de ce que KOUIDER peut faire lui-même, en mots simples.
 *  (Avant : « demande à Claude Code de regarder ».) Rien à faire de son côté = dit aussi, pour qu'il ne s'inquiète pas. */
const VPS_REBOOT = 'mon réparateur le relance seul toutes les 10 min ; si ça dure plus d\'1 h, clique « Redémarrer » sur le serveur (VPS) dans l\'espace client de ton hébergeur — tout se rallume seul';
export function remedy(name: string, info: string): string {
  if (/Base de données/.test(name)) return 'ouvre supabase.com → ton projet : quota dépassé ou paiement en attente ? (c\'est arrivé le 03/11). Une fois réglé, tout repart seul';
  if (/Cerveau IA/.test(name)) return 'les cerveaux gratuits se rechargent chaque matin vers 9 h. Si c\'est urgent, écris « utilise Claude pour cette question »';
  if (/Crédit Claude/.test(name)) return 'pas bloquant (je tourne en gratuit). Pour garder le secours : recharge sur console.anthropic.com → Billing';
  if (/Espace Google/.test(name) || /espace Google est plein/.test(info)) return 'ouvre one.google.com/storage : supprime les gros mails et les photos/vidéos lourdes, vide la corbeille — ou prends Google One 100 Go. La sauvegarde Drive repart seule la nuit suivante';
  if (/Délai de réponse/.test(name)) return 'ce sont les cerveaux gratuits qui saturent : ça revient seul le lendemain matin vers 9 h. Pour une question pressée, écris « utilise Claude pour cette question ». Si c\'est lent 3 jours de suite, c\'est à noter pour une session de code';
  if (/Sauvegarde Google Drive/.test(name)) return 'dis-moi « reconnecte mes mails » (même compte Google) : la sauvegarde repart la nuit suivante';
  if (/Sauvegarde VPS/.test(name)) return 'le serveur (VPS) est peut-être éteint : clique « Redémarrer » dans l\'espace client de ton hébergeur';
  if (/Telegram/.test(name)) return /signe de vie/.test(info) ? VPS_REBOOT : 'rien à faire si mes messages t\'arrivent ; sinon ' + VPS_REBOOT;
  if (/Appels d'hier/.test(name)) return 'si mes appels sont muets, ferme l\'app Dzaryx sur l\'iPhone avant de décrocher (elle garde le micro), puis rappelle-moi';
  if (/Démarchage/.test(name)) return 'dis-moi « relance le démarchage »';
  if (/Tâches automatiques/.test(name)) return 'souvent un redémarrage de Railway au mauvais moment : elles repartent seules le lendemain. Si la même revient 3 jours de suite, vérifie le paiement Railway (page À PAYER)';
  if (/PC cloud/.test(name)) return VPS_REBOOT;
  if (/Réservations|Parc|Disponibilités|Impayés|Retards|Dépenses|Papiers|Entretien|finances|Missions|Prospects|Mémoire/.test(name)) return 'c\'est lié à la base : relance « auto-test » dans 10 min ; si ça reste rouge, regarde supabase.com (quota / paiement)';
  if (/Agenda/i.test(name)) return 'dis-moi « reconnecte mon agenda »';
  if (/Gmail|Mail|Google/i.test(name)) return 'dis-moi « reconnecte mes mails »';
  if (/WhatsApp/i.test(name)) return 'dis-moi « connecte mon WhatsApp » : je t\'envoie un code à taper dans WhatsApp Business';
  return 'relance « auto-test » dans 10 min ; si ça reste rouge, c\'est à noter pour une prochaine session de code';
}

export function formatSelfTest(r: SelfTestReport, onlyProblems = false): string {
  const lines = r.checks.filter(c => !onlyProblems || !c.ok).map(c => `${c.ok ? '✅' : '❌'} ${c.name} — ${c.info}${c.ok ? '' : `\n   👉 ${remedy(c.name, c.info)}`}`);
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
    const text = `${formatSelfTest(r, true)}\n\nDis « auto-test » pour relancer la vérification.`;
    emitProactive(`🩺 Auto-test : ${r.failed} problème${r.failed > 1 ? 's' : ''} détecté${r.failed > 1 ? 's' : ''}.`, 'alert', text, 'kouider');
    // Sur Telegram aussi : c'est là qu'il lit (l'historique de l'app seul, il ne le voyait pas)
    const { queueTelegramMessage } = await import('../notifications/tg-outbox.js');
    await queueTelegramMessage(`🩺 Bilan santé de Dzaryx\n${text}`).catch(() => {});
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
