import {
  isNexusOnline,
  nexusScreenshot,
  nexusScreenUnderstand,
  nexusFileList, nexusFileSearch, nexusFileRead, nexusFileSend, nexusFileOpen,
  nexusWindowList, nexusWindowFocus, nexusWindowClose, nexusWindowScreenshot,
  nexusProcessList, nexusProcessKill,
  nexusAppLaunch,
} from './nexus-relay.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntentType =
  | 'screenshot' | 'screen_understand'
  | 'file_list' | 'file_search' | 'file_read' | 'file_send' | 'file_open'
  | 'window_list' | 'window_focus' | 'window_close' | 'window_screenshot'
  | 'process_list' | 'process_kill'
  | 'app_launch'
  | 'nexus_status'
  | 'unknown';

export interface DetectedIntent {
  type: IntentType;
  confidence: number;
  args: Record<string, string | number | boolean | undefined>;
}

export interface NlRouterResult {
  handled: boolean;
  messages: string[];
  logs: string[];
  proofs: NlProof[];
}

export interface NlProof {
  cmd:        string;
  intent:     IntentType;
  confidence: number;
  route:      'os_agent' | 'python_ai' | 'unknown';
  jobId?:     string;
  ok:         boolean;
  elapsedMs:  number;
}

export interface TestCase {
  input: string;
  expected_intents: IntentType[];
}

export interface TestResult {
  input: string;
  commands: string[];
  detected: Array<{ cmd: string; intent: IntentType; confidence: number; args: Record<string, unknown> }>;
  expected_intents: IntentType[];
  passed: boolean;
}

// ── Path aliases ──────────────────────────────────────────────────────────────

const _BASE = String.raw`C:\Users\douba`;

const PATH_ALIASES: [string, string][] = [
  ['bureau',           `${_BASE}\\OneDrive\\Bureau`],
  ['desktop',          `${_BASE}\\OneDrive\\Bureau`],
  ['documents',        `${_BASE}\\Documents`],
  ['téléchargements',  `${_BASE}\\Downloads`],
  ['telechargements',  `${_BASE}\\Downloads`],
  ['downloads',        `${_BASE}\\Downloads`],
  ['images',           `${_BASE}\\Pictures`],
  ['photos',           `${_BASE}\\Pictures`],
  ['vidéos',           `${_BASE}\\Videos`],
  ['videos',           `${_BASE}\\Videos`],
  ['nexus',            `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim\\nexus`],
  ['backend',          `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim\\backend`],
  ['ibrahim',          `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim`],
  ['projet',           `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim`],
];

function resolvePath(token: string): string | undefined {
  const lower = token.toLowerCase().replace(/[/\\]/g, '');
  for (const [alias, resolved] of PATH_ALIASES) {
    if (lower.includes(alias)) return resolved;
  }
  if (/^[a-z]:\\/i.test(token)) return token;
  return undefined;
}

// ── App aliases ───────────────────────────────────────────────────────────────

const APP_ALIASES: [string, string][] = [
  ['chrome', 'chrome'], ['google', 'chrome'], ['navigateur', 'chrome'], ['browser', 'chrome'],
  ['vscode', 'vscode'], ['vs code', 'vscode'], ['code', 'vscode'], ['éditeur', 'vscode'], ['editeur', 'vscode'],
  ['telegram', 'telegram'], ['tg', 'telegram'],
  ['spotify', 'spotify'],
  ['terminal', 'terminal'], ['cmd', 'terminal'], ['powershell', 'terminal'], ['console', 'terminal'], ['wt', 'terminal'],
  ['notepad', 'notepad'], ['bloc-notes', 'notepad'], ['bloc notes', 'notepad'],
  ['explorer', 'explorer'], ['explorateur', 'explorer'],
  ['dzaryx', 'dzaryx'],
  ['capcut', 'capcut'],
];

function resolveApp(token: string): string | undefined {
  const lower = token.toLowerCase().trim();
  for (const [alias, app] of APP_ALIASES) {
    if (lower.includes(alias)) return app;
  }
  return undefined;
}

// ── splitCommands ─────────────────────────────────────────────────────────────

export function splitCommands(text: string): string[] {
  const stripped = text.replace(/^nexus\s*[,:\s]\s*/i, '').trim();
  const rawLines = stripped.split(/\n+/);
  const result: string[] = [];
  for (const line of rawLines) {
    const clean = line
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/^\s*[-•*]\s*/, '')
      .trim();
    if (clean) result.push(clean);
  }
  return result.length ? result : [stripped];
}

// ── Intent patterns ───────────────────────────────────────────────────────────

const SCREEN_UNDERSTAND_RE = /\b(qu[e']?est[-\s]ce\s+(qu[e']?il\s+y\s+a\s+[àa])?\s*l[''']?[eé]cran|analyse[sz]?\s+(?:l[''']?|mon\s+|ton\s+|cet?\s+)?[eé]cran|que\s+vois[\s-]tu|dis[\s-]moi\s+ce\s+que\s+tu\s+vois|regarde[sz]?\s+(mon\s+)?[eé]cran|comprends?\s+mon\s+[eé]cran|qu[e']?est[\s-]ce\s+que\s+tu\s+vois|montre[\s-]moi\s+mon\s+bureau|montre\s+moi\s+le\s+bureau)\b/i;
const SCREENSHOT_RE         = /\b(screenshot|capture\s+[eé]cran|prends?\s+(un\s+)?screenshot|fais?\s+(un\s+)?screenshot|prends?\s+(une\s+)?capture|montre[\s-]moi\s+(l[''']?[eé]cran|ce\s+qui\s+se\s+passe\s+[àa]l?\s*[eé]cran))\b/i;
const APP_LAUNCH_RE         = /\b(ouvre[sz]?\s+|lance[sz]?\s+|d[eé]marre[sz]?\s+|start\s+|ouvre[sz]?\s+l[''']?app(?:lication)?\s+)\s*(chrome|google|navigateur|vscode|vs\s*code|[eé]diteur|editeur|telegram|tg|spotify|terminal|cmd|powershell|console|wt|notepad|bloc[\s-]notes|explorer|explorateur|dzaryx|capcut)\b/i;
const PROCESS_KILL_RE       = /\b(tu[e]r?|kill|ferme[sz]?\s+(?:le\s+)?processus|termine[sz]?\s+(?:le\s+)?processus)\s+(\S+)\b/i;
const PROCESS_LIST_RE       = /\b(liste[sz]?\s+(?:les?\s+)?processus|top\s+(?:processus|process)|ram\s+usage|cpu\s+usage|quels?\s+(?:sont\s+les?\s+)?processus|processus\s+(?:actifs?|en\s+cours))\b/i;
const WINDOW_CLOSE_RE       = /\b(ferme[sz]?\s+(?:la\s+)?fen[eê]tre\s+|close\s+window\s+)\s*(.+)/i;
const WINDOW_FOCUS_RE       = /\b(focalise[sz]?\s+(?:sur\s+)?|mets?\s+en\s+avant\s+|passe[sz]?\s+[àa]\s+|focus\s+(?:on\s+)?|amène[sz]?\s+(?:la\s+fen[eê]tre\s+)?)\s*([^.,]+)/i;
const WINDOW_SCREENSHOT_RE  = /\b(screenshot\s+(?:de\s+la\s+)?fen[eê]tre|capture\s+(?:de\s+la\s+)?fen[eê]tre)\b/i;
const WINDOW_LIST_RE        = /\b(liste[sz]?\s+(?:les?\s+)?fen[eê]tres?|quelles?\s+fen[eê]tres?\s+(?:sont\s+)?ouverte?s?|quoi\s+(?:est\s+)?(?:ouvert|tourne)|fen[eê]tres?\s+ouverte?s?)\b/i;
const FILE_SEND_RE          = /\b(envoie[sz]?\s+(?:le\s+)?fichier|send\s+file|partage[sz]?\s+(?:le\s+)?fichier)\s+(.+)/i;
const FILE_READ_RE          = /\b(lis?\s+(?:le\s+)?fichier|affiche[sz]?\s+(?:le\s+)?contenu|montre[sz]?\s+(moi\s+)?(?:le\s+)?contenu|cat\s+|type\s+)\s*(.+)/i;
const FILE_OPEN_RE          = /\b(ouvre[sz]?\s+(?:le\s+)?fichier|open\s+file)\s+(.+)/i;
const FILE_SEARCH_RE        = /\b(cherche[sz]?\s+(?:un\s+)?fichier|trouve[sz]?\s+(?:un\s+|tous?\s+les?\s+)?fichiers?|search\s+file)\s+(.+)/i;
const FILE_LIST_RE          = /\b(liste[sz]?\s+(?:les?\s+)?(?:fichiers?|dossiers?|contenus?)|affiche[sz]?\s+(?:les?\s+)?(?:fichiers?|dossiers?)|montre[sz]?\s+(moi\s+)?(?:les?\s+)?(?:fichiers?|dossiers?))\b/i;
const NEXUS_STATUS_RE       = /\b(nexus\s+(en\s+ligne|online|connect[eé]|status|[eé]tat|actif)|est[\s-]ce\s+que\s+nexus|nexus\s+est[\s-]il|tu\s+es\s+l[àa])\b/i;

// ── detectIntent ──────────────────────────────────────────────────────────────

export function detectIntent(cmd: string): DetectedIntent {
  // screen_understand (more specific than screenshot — must come first)
  if (SCREEN_UNDERSTAND_RE.test(cmd)) {
    const qMatch = cmd.match(/(?:pour|question\s*:\s*|analyse\s+)(.{5,})/i);
    return { type: 'screen_understand', confidence: 0.88, args: { question: qMatch?.[1]?.trim() } };
  }

  // screenshot
  if (SCREENSHOT_RE.test(cmd)) {
    return { type: 'screenshot', confidence: 0.92, args: {} };
  }

  // app_launch (check before file_open to avoid "ouvre chrome" → file_open)
  const appM = APP_LAUNCH_RE.exec(cmd);
  if (appM) {
    const appToken = (appM[2] ?? '').trim();
    const app = resolveApp(appToken);
    if (app) return { type: 'app_launch', confidence: 0.90, args: { app } };
  }

  // process_kill
  const killM = PROCESS_KILL_RE.exec(cmd);
  if (killM) {
    return { type: 'process_kill', confidence: 0.85, args: { name: killM[2] } };
  }

  // process_list
  if (PROCESS_LIST_RE.test(cmd)) {
    const sort = /\bcpu\b/i.test(cmd) ? 'cpu' : 'ram';
    return { type: 'process_list', confidence: 0.85, args: { sort } };
  }

  // window_close
  const winCloseM = WINDOW_CLOSE_RE.exec(cmd);
  if (winCloseM) {
    const title = winCloseM[2]?.trim();
    if (title && title.length > 1) {
      return { type: 'window_close', confidence: 0.82, args: { title } };
    }
  }

  // window_screenshot (before window_focus to avoid false match)
  if (WINDOW_SCREENSHOT_RE.test(cmd)) {
    return { type: 'window_screenshot', confidence: 0.85, args: {} };
  }

  // window_focus
  const winFocusM = WINDOW_FOCUS_RE.exec(cmd);
  if (winFocusM) {
    const title = winFocusM[2]?.trim();
    if (title && title.length > 1 && !/^(fichier|processus|app|liste)\b/i.test(title)) {
      return { type: 'window_focus', confidence: 0.78, args: { title } };
    }
  }

  // window_list
  if (WINDOW_LIST_RE.test(cmd)) {
    return { type: 'window_list', confidence: 0.85, args: {} };
  }

  // file_send
  const fileSendM = FILE_SEND_RE.exec(cmd);
  if (fileSendM) {
    const raw = fileSendM[2]?.trim() ?? '';
    const path = resolvePath(raw) ?? raw;
    return { type: 'file_send', confidence: 0.88, args: { path } };
  }

  // file_read
  const fileReadM = FILE_READ_RE.exec(cmd);
  if (fileReadM) {
    const raw = (fileReadM[3] ?? fileReadM[fileReadM.length - 1] ?? '').trim();
    const path = resolvePath(raw) ?? raw;
    if (path) return { type: 'file_read', confidence: 0.85, args: { path } };
  }

  // file_open
  const fileOpenM = FILE_OPEN_RE.exec(cmd);
  if (fileOpenM) {
    const raw = fileOpenM[2]?.trim() ?? '';
    const path = resolvePath(raw) ?? raw;
    if (path) return { type: 'file_open', confidence: 0.82, args: { path } };
  }

  // file_search
  const fileSearchM = FILE_SEARCH_RE.exec(cmd);
  if (fileSearchM) {
    const query = fileSearchM[2]?.trim() ?? '';
    if (query) return { type: 'file_search', confidence: 0.85, args: { query } };
  }

  // file_list
  if (FILE_LIST_RE.test(cmd)) {
    const pathM = cmd.match(/(?:dans|de|du|de\s+la|de\s+l[''']?|in)\s+(.+)/i);
    const raw = pathM?.[1]?.trim();
    const path = raw ? (resolvePath(raw) ?? raw) : undefined;
    return { type: 'file_list', confidence: 0.85, args: { path } };
  }

  // nexus_status
  if (NEXUS_STATUS_RE.test(cmd)) {
    return { type: 'nexus_status', confidence: 0.90, args: {} };
  }

  return { type: 'unknown', confidence: 0.0, args: {} };
}

// ── Response formatters ───────────────────────────────────────────────────────

function fmtFileList(r: Record<string, unknown>): string {
  const entries = r['entries'] as Array<{ name: string; type: string; size?: number }> | undefined;
  if (!entries?.length) return '📂 Dossier vide.';
  const lines = entries.slice(0, 20).map(e => {
    const icon = e.type === 'dir' ? '📁' : '📄';
    const size = e.size ? ` _(${Math.round(e.size / 1024)} KB)_` : '';
    return `${icon} ${e.name}${size}`;
  });
  if (entries.length > 20) lines.push(`_...et ${entries.length - 20} autres_`);
  return `📂 *${entries.length} éléments* :\n${lines.join('\n')}`;
}

function fmtFileSearch(r: Record<string, unknown>): string {
  const results = r['results'] as string[] | undefined;
  if (!results?.length) return '🔍 Aucun fichier trouvé.';
  const lines = results.slice(0, 15).map(p => `📄 \`${p}\``);
  if (results.length > 15) lines.push(`_...et ${results.length - 15} autres_`);
  return `🔍 *${results.length} fichier(s) trouvé(s)* :\n${lines.join('\n')}`;
}

function fmtProcessList(r: Record<string, unknown>): string {
  const procs = r['processes'] as Array<{ name: string; pid: number; ram_mb?: number; cpu?: number }> | undefined;
  if (!procs?.length) return '⚙️ Aucun processus trouvé.';
  const lines = procs.slice(0, 15).map(p => {
    const ram = p.ram_mb ? ` | RAM: ${p.ram_mb} MB` : '';
    const cpu = p.cpu !== undefined ? ` | CPU: ${p.cpu.toFixed(1)}%` : '';
    return `⚙️ \`${p.name}\` \\(PID ${p.pid}\\)${ram}${cpu}`;
  });
  return `⚙️ *Top ${procs.length} processus* :\n${lines.join('\n')}`;
}

function fmtWindowList(r: Record<string, unknown>): string {
  const windows = r['windows'] as Array<{ title: string; process?: string }> | undefined;
  if (!windows?.length) return '🪟 Aucune fenêtre ouverte.';
  const lines = windows.slice(0, 12).map(w =>
    `🪟 \`${w.title}\`` + (w.process ? ` _(${w.process})_` : ''),
  );
  return `🪟 *${windows.length} fenêtre(s)* :\n${lines.join('\n')}`;
}

// ── executeIntent ─────────────────────────────────────────────────────────────

interface IntentResult { message: string; ok: boolean; jobId?: string; }

async function executeIntent(intent: DetectedIntent, rawCmd: string): Promise<IntentResult> {
  const { type, args } = intent;

  switch (type) {
    case 'screenshot': {
      const r = await nexusScreenshot(undefined, 35_000);
      if (!r.ok) return { ok: false, message: `❌ Screenshot échoué : ${r.error ?? 'erreur inconnue'}` };
      const kb = r.size_bytes ? Math.round(r.size_bytes / 1024) : '?';
      return { ok: true, message: `📸 Screenshot pris et envoyé sur Telegram _(${kb} KB)_` };
    }

    case 'screen_understand': {
      const question = (args['question'] as string | undefined) ?? rawCmd;
      const r = await nexusScreenUnderstand(question, true, undefined, 60_000);
      if (!r.ok) return { ok: false, message: `❌ Analyse écran échouée : ${r.error ?? 'erreur inconnue'}` };
      const analysis = (r['analysis'] as string | undefined)?.trim();
      if (analysis) return { ok: true, jobId: r['job_id'] as string | undefined, message: `👁️ *Analyse de l'écran* :\n\n${analysis}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `👁️ Analyse terminée — envoyée sur Telegram.` };
    }

    case 'file_list': {
      const path = args['path'] as string | undefined;
      const r = await nexusFileList(path);
      if (!r.ok) return { ok: false, message: `❌ Liste fichiers échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: fmtFileList(r as Record<string, unknown>) };
    }

    case 'file_search': {
      const query = args['query'] as string;
      const r = await nexusFileSearch(query);
      if (!r.ok) return { ok: false, message: `❌ Recherche échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: fmtFileSearch(r as Record<string, unknown>) };
    }

    case 'file_read': {
      const path = args['path'] as string;
      const r = await nexusFileRead(path);
      if (!r.ok) return { ok: false, message: `❌ Lecture échouée : ${r.error ?? 'erreur inconnue'}` };
      const content = (r['content'] as string | undefined)?.slice(0, 3000) ?? '(vide)';
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `📄 *Contenu* :\n\`\`\`\n${content}\n\`\`\`` };
    }

    case 'file_send': {
      const path = args['path'] as string;
      const r = await nexusFileSend(path);
      if (!r.ok) return { ok: false, message: `❌ Envoi échoué : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `📤 Fichier envoyé sur Telegram.` };
    }

    case 'file_open': {
      const path = args['path'] as string;
      const r = await nexusFileOpen(path);
      if (!r.ok) return { ok: false, message: `❌ Ouverture échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `📂 Fichier ouvert.` };
    }

    case 'window_list': {
      const r = await nexusWindowList();
      if (!r.ok) return { ok: false, message: `❌ Liste fenêtres échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: fmtWindowList(r as Record<string, unknown>) };
    }

    case 'window_focus': {
      const title = args['title'] as string;
      const r = await nexusWindowFocus(title);
      if (!r.ok) return { ok: false, message: `❌ Focus échoué : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `🪟 Fenêtre "${title}" mise en avant.` };
    }

    case 'window_close': {
      const title = args['title'] as string;
      const r = await nexusWindowClose(title);
      if (!r.ok) return { ok: false, message: `❌ Fermeture échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `🪟 Fenêtre "${title}" fermée.` };
    }

    case 'window_screenshot': {
      const r = await nexusWindowScreenshot();
      if (!r.ok) return { ok: false, message: `❌ Screenshot fenêtre échoué : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `📸 Screenshot fenêtre envoyé sur Telegram.` };
    }

    case 'process_list': {
      const sort = (args['sort'] as 'ram' | 'cpu') ?? 'ram';
      const r = await nexusProcessList(20, sort);
      if (!r.ok) return { ok: false, message: `❌ Liste processus échouée : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: fmtProcessList(r as Record<string, unknown>) };
    }

    case 'process_kill': {
      const name = args['name'] as string | undefined;
      const pid  = args['pid']  as number | undefined;
      const r = await nexusProcessKill(name, pid);
      if (!r.ok) return { ok: false, message: `❌ Kill échoué : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `⚙️ Processus "${name ?? pid}" terminé.` };
    }

    case 'app_launch': {
      const app = args['app'] as string;
      const r = await nexusAppLaunch(app);
      if (!r.ok) return { ok: false, message: `❌ Lancement échoué : ${r.error ?? 'erreur inconnue'}` };
      return { ok: true, jobId: r['job_id'] as string | undefined, message: `🚀 ${app} lancé.` };
    }

    case 'nexus_status': {
      const online = isNexusOnline();
      return { ok: true, message: online ? '🟢 NEXUS est en ligne.' : '🔴 NEXUS est hors ligne.' };
    }

    default:
      return { ok: false, message: '' };
  }
}

// ── routeNexusMessage ─────────────────────────────────────────────────────────

export async function routeNexusMessage(text: string): Promise<NlRouterResult> {
  const logs: string[] = [];
  const messages: string[] = [];
  const proofs: NlProof[] = [];
  let anyHandled = false;

  const cmds = splitCommands(text);
  const isMulti = cmds.length > 1;

  for (const cmd of cmds) {
    const t0 = Date.now();
    const intent = detectIntent(cmd);
    const parseMs = Date.now() - t0;

    if (intent.type === 'unknown' || intent.confidence < 0.70) {
      const elapsedMs = Date.now() - t0;
      logs.push(`[NL-ROUTER] cmd="${cmd.slice(0, 60)}" intent=unknown confidence=${intent.confidence.toFixed(2)} route=python_ai elapsed=${parseMs}ms`);
      proofs.push({ cmd, intent: 'unknown', confidence: intent.confidence, route: 'python_ai', ok: false, elapsedMs });
      if (isMulti) {
        messages.push(`ℹ️ Non reconnu : _${cmd}_`);
        anyHandled = true;
      }
      continue;
    }

    logs.push(`[NL-ROUTER] cmd="${cmd.slice(0, 60)}" intent=${intent.type} confidence=${intent.confidence.toFixed(2)} route=os_agent elapsed=${parseMs}ms`);

    try {
      const result = await executeIntent(intent, cmd);
      const totalMs = Date.now() - t0;
      logs.push(`[NL-ROUTER] executed intent=${intent.type} success=${result.ok} elapsed=${totalMs}ms`);

      proofs.push({
        cmd,
        intent: intent.type,
        confidence: intent.confidence,
        route: 'os_agent',
        jobId: result.jobId,
        ok: result.ok,
        elapsedMs: totalMs,
      });

      if (result.message) {
        const confPct = Math.round(intent.confidence * 100);
        const jobPart = result.jobId ? ` | job: \`${result.jobId}\`` : '';
        const header = `🎯 *${intent.type}* | conf: ${confPct}%${jobPart}\n`;
        messages.push(header + result.message);
        anyHandled = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const elapsedMs = Date.now() - t0;
      logs.push(`[NL-ROUTER] ERROR intent=${intent.type} err="${msg}"`);
      proofs.push({ cmd, intent: intent.type, confidence: intent.confidence, route: 'os_agent', ok: false, elapsedMs });
      messages.push(`❌ Erreur NEXUS \\(${intent.type}\\) : ${msg}`);
      anyHandled = true;
    }
  }

  return { handled: anyHandled, messages, logs, proofs };
}

// ── testNlParser ──────────────────────────────────────────────────────────────

export function testNlParser(cases: TestCase[]): TestResult[] {
  return cases.map(tc => {
    const cmds = splitCommands(tc.input);
    const detected = cmds.map(cmd => {
      const { type, confidence, args } = detectIntent(cmd);
      return { cmd, intent: type, confidence, args: args as Record<string, unknown> };
    });
    const detectedTypes = detected.map(d => d.intent);
    const passed = tc.expected_intents.every(exp => detectedTypes.includes(exp));
    return { input: tc.input, commands: cmds, detected, expected_intents: tc.expected_intents, passed };
  });
}
