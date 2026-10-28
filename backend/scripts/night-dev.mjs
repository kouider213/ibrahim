// ATELIER DE CODE DE DZARYX (28/10/2026) — crontab root du VPS, toutes les 5 min (pas pm2 : cron_restart tuerait une tâche en cours).
// Lit la file app_kv `dev:queue` (outil se_coder, bugs de l'auto-critique, veille hebdo) et lance Claude Code en mode
// auto dans /root/dzaryx : code, tsc, tests, mise en ligne (skill dzaryx-livraison), puis rapport à Kouider sur Telegram
// (tgcall/outbox) : tout de suite pour « maintenant », à 5h pour la nuit.
// Garde-fous : une tâche à la fois (verrou), jamais si l'arbre git a des modifs non commitées (séance de dev en cours),
// 4 tâches max par nuit, 75 min max par tâche ; les modifs laissées à moitié sont rangées dans un git stash nommé.
import { createClient } from '@supabase/supabase-js';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const REPO = '/root/dzaryx';
const LOCK = '/root/.dzaryx-dev.lock';
const LOGS = '/root/dzaryx-dev-logs';
const OUTBOX = `${REPO}/tgcall/outbox`;
const NIGHT = { from: 30, to: 4 * 60 + 45 };   // 0h30 → 4h45 (heure de Bruxelles) ; il se lève à 5h
const REPORT_HOUR = 5;
const MAX_PER_NIGHT = 4;
const TASK_TIMEOUT_MS = 75 * 60_000;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function kvGet(key, fallback) {
  const { data } = await sb.from('app_kv').select('value').eq('key', key).maybeSingle();
  try { return data?.value ? JSON.parse(data.value) : fallback; } catch { return fallback; }
}
async function kvSet(key, value) {
  const { error } = await sb.from('app_kv').upsert({ key, value: JSON.stringify(value), expires_at: null, updated_at: new Date().toISOString() });
  if (error) throw new Error(`app_kv ${key}: ${error.message}`);
}
// Relit la file juste avant d'écrire : Dzaryx peut y avoir ajouté une tâche pendant le travail
async function updateTask(id, patch) {
  const q = await kvGet('dev:queue', []);
  const t = q.find(x => x.id === id);
  if (t) Object.assign(t, patch);
  await kvSet('dev:queue', q);
}

function brussels() {
  const p = new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t)?.value ?? '';
  return { min: Number(g('hour')) * 60 + Number(g('minute')), hour: Number(g('hour')), weekday: g('weekday'), day: `${g('year')}-${g('month')}-${g('day')}` };
}

function telegram(text) {
  mkdirSync(OUTBOX, { recursive: true });
  writeFileSync(`${OUTBOX}/${Date.now()}-atelier.txt`, text);
}

const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const dirty = () => git('status', '--porcelain', '--untracked-files=no') !== '';

function prompt(task) {
  return [
    `Tu es l'atelier de code autonome de Dzaryx (l'assistant IA de Kouider). Kouider n'est PAS là (il dort ou travaille) : personne ne répondra à tes questions, décide seul comme un bon développeur senior et va jusqu'au bout.`,
    `TÂCHE n° ${task.id} (source : ${task.source === 'kouider' ? 'demandée par Kouider' : task.source === 'veille' ? 'veille hebdomadaire' : "bug trouvé par l'auto-critique de Dzaryx"}) :`,
    task.text,
    ``,
    `Méthode :`,
    `- Le projet est dans ${REPO} (lis CLAUDE.md et l'état dans DZARYX/). Ta mémoire (MEMORY.md) contient les décisions de Kouider : respecte-les (idées refusées, règles).`,
    `- Si c'est un bug vécu : retrouve le vrai échange (table conversations, logs pm2) pour comprendre la cause avant de corriger.`,
    `- Fais-le complètement et proprement, dans le style du code existant. Ajoute ce qui rend la fonction vraiment utile (et ce à quoi Kouider n'aurait pas pensé) tant que ça reste dans le sujet.`,
    `- cd backend && npx tsc --noEmit = 0 erreur ; lance les tests utiles (crash-test sandboxé si ça touche les conversations). Ne démarre JAMAIS un 2e backend local.`,
    `- Le repo est PUBLIC : aucun secret, aucune donnée de santé ou perso dans le code.`,
    `- Ne touche pas aux données réelles (clients, réservations, paiements) et n'envoie rien à un client : seulement du code.`,
    `- Commit (git add de fichiers précis), puis mets en ligne en suivant le skill dzaryx-livraison (push Railway, app gh-pages si l'app change, redémarrage pm2 VPS si besoin) et vérifie que c'est bien déployé.`,
    `- Mets à jour ta mémoire si c'est une nouveauté importante.`,
    `- Si la tâche est impossible ou dangereuse, ne force pas : explique pourquoi.`,
    ``,
    `TERMINE ta réponse EXACTEMENT par :`,
    `STATUT: OK   (ou STATUT: ÉCHEC)`,
    `RAPPORT KOUIDER: <en français simple, 2 à 5 phrases pour Kouider : ce que tu as fait, comment s'en servir (la phrase à dire à Dzaryx), ce qui reste à faire par lui s'il y a quelque chose>`,
  ].join('\n');
}

function runClaude(task) {
  mkdirSync(LOGS, { recursive: true });
  const r = spawnSync('claude', ['-p', prompt(task), '--permission-mode', 'auto', '--output-format', 'json'], {
    cwd: '/root', encoding: 'utf8', timeout: TASK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(`${LOGS}/${task.id}-${Date.now()}.json`, `${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}`);
  if (r.error) return { ok: false, report: `l'atelier s'est arrêté (${r.error.code === 'ETIMEDOUT' ? 'plus de 75 min' : r.error.message}).` };
  let text = '';
  try { text = JSON.parse(r.stdout).result ?? ''; } catch { text = r.stdout ?? ''; }
  const ok = /STATUT:\s*OK/i.test(text);
  const report = (text.split(/RAPPORT KOUIDER:\s*/i)[1] ?? text.slice(-600)).trim().slice(0, 1500);
  return { ok, report };
}

async function main() {
  const now = brussels();
  const night = now.min >= NIGHT.from && now.min <= NIGHT.to;

  // Rapport de la nuit → au réveil
  const pending = await kvGet('dev:report_pending', []);
  if (pending.length && now.hour >= REPORT_HOUR && now.hour < 22 && !night) {
    telegram(`🛠️ Cette nuit je me suis amélioré tout seul (${pending.length} chantier${pending.length > 1 ? 's' : ''}) :\n\n${pending.join('\n\n')}\n\nDis « qu'est-ce que tu as codé ? » pour revoir la liste.`);
    await kvSet('dev:report_pending', []);
  }

  let q = await kvGet('dev:queue', []);
  // Tâche restée « en cours » (VPS redémarré pendant le travail)
  for (const t of q.filter(t => t.status === 'running' && Date.now() - Date.parse(t.started_at ?? t.at) > 2 * TASK_TIMEOUT_MS)) {
    await updateTask(t.id, { status: 'todo', started_at: undefined });
  }

  // Veille hebdo : nuit de samedi à dimanche
  if (now.weekday.startsWith('dim') && night && !q.some(t => t.source === 'veille' && t.at.slice(0, 10) >= now.day)) {
    const src = readFileSync(`${REPO}/backend/src/integrations/self-dev.ts`, 'utf8');   // même texte que l'outil se_coder 'veille'
    const text = (src.match(/WEEKLY_WATCH = ([\s\S]*?);\n/)?.[1] ?? '').split(/'\s*\+\s*'/).join('').replace(/^'|'$/g, '').replace(/\\'/g, "'")
      || 'VEILLE HEBDO : nouveautés Anthropic, GitHub (agents IA open source dont Hermes Agent), assistants vocaux → max 3 fonctions utiles à Kouider, codées, testées, en ligne.';
    q.push({ id: Math.random().toString(36).slice(2, 7), text, source: 'veille', now: false, status: 'todo', at: new Date().toISOString() });
    await kvSet('dev:queue', q);
  }

  const doneTonight = q.filter(t => t.done_at && Date.now() - Date.parse(t.done_at) < 6 * 3600_000 && !t.now).length;
  const task = q.find(t => t.status === 'todo' && t.now)
    ?? (night && doneTonight < MAX_PER_NIGHT ? q.find(t => t.status === 'todo' && t.source === 'kouider') ?? q.find(t => t.status === 'todo') : undefined);
  if (!task) return;

  if (dirty()) {   // Kouider est en séance de dev avec Claude Code : on attend
    if (task.now && !task.waiting_told) {
      telegram(`🛠️ « ${task.text.slice(0, 80)} » : une séance de code est déjà en cours sur le serveur, je m'y mets dès qu'elle est finie.`);
      await updateTask(task.id, { waiting_told: true });
    }
    log('arbre git modifié → attente');
    return;
  }

  log('tâche', task.id, task.text.slice(0, 100));
  await updateTask(task.id, { status: 'running', started_at: new Date().toISOString() });
  if (task.now) telegram(`🛠️ Je me mets au code : « ${task.text.slice(0, 120)} ». Rapport dès que c'est en ligne.`);
  try { git('pull', '--rebase', '--autostash', 'origin', 'main'); } catch (e) { log('pull', e.message); }

  const { ok, report } = runClaude(task);
  if (dirty()) {   // travail laissé à moitié : rangé, jamais perdu, et l'arbre redevient libre
    try { git('stash', 'push', '-m', `atelier-${task.id}`); } catch (e) { log('stash', e.message); }
  }
  await updateTask(task.id, { status: ok ? 'done' : 'failed', done_at: new Date().toISOString(), summary: report.slice(0, 600) });
  const line = `${ok ? '✅' : '❌'} ${task.source === 'veille' ? '🔭 Veille' : task.source === 'auto' ? '🐞 Bug repéré seul' : '👤 Ta demande'} : ${task.text.slice(0, 120)}\n${report}`;
  if (task.now || !night) telegram(`🛠️ ${line}`);
  else await kvSet('dev:report_pending', [...await kvGet('dev:report_pending', []), line]);
  log('fin', task.id, ok ? 'OK' : 'ÉCHEC');
}

if (existsSync(LOCK)) {
  const pid = Number(readFileSync(LOCK, 'utf8'));
  try { process.kill(pid, 0); log('déjà en cours', pid); process.exit(0); } catch { /* verrou orphelin */ }
}
writeFileSync(LOCK, String(process.pid));
try { await main(); } catch (e) { log('erreur', e); } finally { try { unlinkSync(LOCK); } catch { /* */ } }
