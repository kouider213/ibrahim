"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitCommands = splitCommands;
exports.detectIntent = detectIntent;
exports.routeNexusMessage = routeNexusMessage;
exports.testNlParser = testNlParser;
const nexus_relay_js_1 = require("./nexus-relay.js");
const nexus_environment_js_1 = require("./nexus-environment.js");
// ── System priority keywords ──────────────────────────────────────────────────
// Any command containing these triggers local-first routing.
// If no local intent matches → error reply (NOT web fallback).
const _SYS_KEYWORDS = [
    // Action verbs
    'ouvre', 'ouvrir', 'lance', 'lancer', 'démarre', 'demarr', 'start', 'active',
    'ferme', 'fermer', 'close', 'quitte', 'quitter',
    'focus', 'focalise', 'foreground', 'premier plan',
    'capture', 'screenshot',
    // Local apps — always local actions
    'vscode', 'vs code', 'visual studio code',
    'terminal', 'powershell',
    'chrome', 'chromium',
    'telegram', 'spotify', 'notepad', 'bloc-notes',
    'explorer', 'explorateur', 'dzaryx', 'capcut',
    // Web apps opened locally (URL in local browser)
    'claude', 'codex', 'github', 'chatgpt',
    // Developer / project
    'git', 'npm', 'npx', 'node', 'python', 'pip', 'tsc',
    'build', 'pull', 'push', 'commit', 'status',
    'projet', 'project', 'backend', 'nexus',
    // System concepts
    'bureau', 'desktop',
    'fenêtre', 'fenetre', 'window',
    'processus', 'process',
    'fichier', 'folder', 'dossier',
    'écran', 'ecran', 'screen',
];
function hasSysPriority(cmd) {
    const lower = cmd.toLowerCase();
    return _SYS_KEYWORDS.some(kw => lower.includes(kw));
}
function matchedSysKeywords(cmd) {
    const lower = cmd.toLowerCase();
    return _SYS_KEYWORDS.filter(kw => lower.includes(kw));
}
// ── Path aliases ──────────────────────────────────────────────────────────────
const _BASE = String.raw `C:\Users\douba`;
const PATH_ALIASES = [
    ['bureau', `${_BASE}\\OneDrive\\Bureau`],
    ['desktop', `${_BASE}\\OneDrive\\Bureau`],
    ['documents', `${_BASE}\\Documents`],
    ['téléchargements', `${_BASE}\\Downloads`],
    ['telechargements', `${_BASE}\\Downloads`],
    ['downloads', `${_BASE}\\Downloads`],
    ['images', `${_BASE}\\Pictures`],
    ['photos', `${_BASE}\\Pictures`],
    ['vidéos', `${_BASE}\\Videos`],
    ['videos', `${_BASE}\\Videos`],
    ['nexus', `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim\\nexus`],
    ['backend', `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim\\backend`],
    ['ibrahim', `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim`],
    ['projet', `${_BASE}\\OneDrive\\Bureau\\ibrahim\\ibrahim`],
];
function resolvePath(token) {
    const lower = token.toLowerCase().replace(/[/\\]/g, '');
    for (const [alias, resolved] of PATH_ALIASES) {
        if (lower.includes(alias))
            return resolved;
    }
    if (/^[a-z]:\\/i.test(token))
        return token;
    return undefined;
}
// ── App aliases ───────────────────────────────────────────────────────────────
// Maps natural language terms → canonical app key.
// Keys in LOCAL_APP_KEYS   → app_launch / app_close / focus_app
// Keys in URL_ALIASES      → url_open
const APP_ALIASES = [
    // Chrome / browser
    ['chrome', 'chrome'], ['chromium', 'chrome'], ['navigateur', 'chrome'], ['browser', 'chrome'],
    ['google chrome', 'chrome'],
    // VS Code
    ['vscode', 'vscode'], ['vs code', 'vscode'], ['code', 'vscode'],
    ['éditeur', 'vscode'], ['editeur', 'vscode'], ['visual studio code', 'vscode'],
    ['visual studio', 'vscode'], ['claude code', 'vscode'], // Claude Code runs in VS Code
    // Telegram
    ['telegram', 'telegram'], ['tg', 'telegram'],
    // Spotify
    ['spotify', 'spotify'],
    // Terminal
    ['terminal', 'terminal'], ['cmd', 'terminal'], ['powershell', 'terminal'],
    ['console', 'terminal'], ['wt', 'terminal'], ['windows terminal', 'terminal'],
    // Notepad
    ['notepad', 'notepad'], ['bloc-notes', 'notepad'], ['bloc notes', 'notepad'],
    // Explorer
    ['explorer', 'explorer'], ['explorateur', 'explorer'],
    // Custom
    ['dzaryx', 'dzaryx'], ['capcut', 'capcut'],
    // Web apps (resolve as URL targets)
    ['claude', 'claude'],
    ['codex', 'codex'],
    ['github', 'github'],
    ['chatgpt', 'chatgpt'], ['gpt', 'chatgpt'],
    ['youtube', 'youtube'],
    ['gmail', 'gmail'],
    ['notion', 'notion'],
    ['google', 'google'], // "ouvre google" → google.com in browser
];
const LOCAL_APP_KEYS = new Set([
    'chrome', 'vscode', 'telegram', 'spotify', 'terminal', 'notepad', 'explorer', 'dzaryx', 'capcut',
]);
// URL targets — open in local browser via cmd /c start
const URL_ALIASES = {
    'claude': 'https://claude.ai',
    'codex': 'https://chatgpt.com',
    'github': 'https://github.com',
    'chatgpt': 'https://chatgpt.com',
    'gpt': 'https://chatgpt.com',
    'youtube': 'https://youtube.com',
    'gmail': 'https://mail.google.com',
    'notion': 'https://notion.so',
    'google': 'https://google.com',
};
// Window title patterns used for app_close
const APP_WINDOW_TITLES = {
    'vscode': 'Visual Studio Code',
    'chrome': 'Google Chrome',
    'telegram': 'Telegram',
    'spotify': 'Spotify',
    'terminal': 'Windows Terminal',
    'notepad': 'Notepad',
};
function resolveApp(token) {
    const lower = token.toLowerCase().trim();
    // Longest match first — iterate full list (already ordered long→short in declaration)
    for (const [alias, app] of APP_ALIASES) {
        if (lower.includes(alias))
            return app;
    }
    return undefined;
}
// ── Verb patterns (flexible — match verb, resolve app from remainder) ─────────
const LAUNCH_VERB_RE = /\b(ouvre[sz]?|ouvrir|lance[sz]?|lancer|d[eé]marre[sz]?|d[eé]marrer|start|active[sz]?|activer)\s+(?:l[''']?app(?:lication)?\s+)?/i;
const CLOSE_VERB_RE = /\b(ferme[sz]?|fermer|close|quitte[sz]?|quitter|arr[eê]te[sz]?|stoppe[sz]?)\s+(?:l[''']?app(?:lication)?\s+)?/i;
const FOCUS_VERB_RE = /\b(focus\s+(?:sur\s+)?|mets?\s+en\s+avant\s+|mets?\s+au\s+premier\s+plan\s+|amène[sz]?\s+(?:au\s+premier\s+plan\s+)?|foreground\s+|bascule[sz]?\s+(?:vers?\s+)?|passe[sz]?\s+au\s+premier\s+plan\s+)/i;
function resolveAppFromVerb(verbRe, cmd) {
    const m = verbRe.exec(cmd);
    if (!m)
        return undefined;
    const rest = cmd.slice(m.index + m[0].length).trim();
    const words = rest.split(/\s+/);
    // Try longest match first (4 words → 1 word)
    for (let len = Math.min(words.length, 4); len >= 1; len--) {
        const token = words.slice(0, len).join(' ');
        const app = resolveApp(token);
        if (app)
            return app;
    }
    return undefined;
}
// ── splitCommands ─────────────────────────────────────────────────────────────
function splitCommands(text) {
    const stripped = text.replace(/^nexus\s*[,:\s]\s*/i, '').trim();
    const rawLines = stripped.split(/\n+/);
    const result = [];
    for (const line of rawLines) {
        const clean = line
            .replace(/^\s*\d+[.)]\s*/, '')
            .replace(/^\s*[-•*]\s*/, '')
            .trim();
        if (clean)
            result.push(clean);
    }
    return result.length ? result : [stripped];
}
// ── Fixed-pattern regexes (for intents not based on app aliases) ──────────────
const SCREEN_UNDERSTAND_RE = /\b(qu[e']?est[-\s]ce\s+(qu[e']?il\s+y\s+a\s+[àa])?\s*l[''']?[eé]cran|analyse[sz]?\s+(?:l[''']?|mon\s+|ton\s+|cet?\s+)?[eé]cran|que\s+vois[\s-]tu|dis[\s-]moi\s+ce\s+que\s+tu\s+vois|regarde[sz]?\s+(mon\s+)?[eé]cran|comprends?\s+mon\s+[eé]cran|qu[e']?est[\s-]ce\s+que\s+tu\s+vois|montre[\s-]moi\s+mon\s+bureau|montre\s+moi\s+le\s+bureau)\b/i;
const SCREENSHOT_RE = /\b(screenshot|capture\s+[eé]cran|prends?\s+(un\s+)?screenshot|fais?\s+(un\s+)?screenshot|prends?\s+(une\s+)?capture|montre[\s-]moi\s+(l[''']?[eé]cran|ce\s+qui\s+se\s+passe\s+[àa]l?\s*[eé]cran))\b/i;
const PROCESS_KILL_RE = /\b(tu[e]r?|kill|ferme[sz]?\s+(?:le\s+)?processus|termine[sz]?\s+(?:le\s+)?processus)\s+(\S+)\b/i;
const PROCESS_LIST_RE = /\b(liste[sz]?\s+(?:les?\s+)?processus|top\s+(?:processus|process)|ram\s+usage|cpu\s+usage|quels?\s+(?:sont\s+les?\s+)?processus|processus\s+(?:actifs?|en\s+cours))\b/i;
const WINDOW_CLOSE_RE = /\b(ferme[sz]?\s+(?:la\s+)?fen[eê]tre\s+|close\s+window\s+)\s*(.+)/i;
const WINDOW_FOCUS_RE = /\b(focalise[sz]?\s+(?:sur\s+)?|mets?\s+en\s+avant\s+|passe[sz]?\s+[àa]\s+|focus\s+(?:on\s+)?|amène[sz]?\s+(?:la\s+fen[eê]tre\s+)?)\s*([^.,]+)/i;
const WINDOW_SCREENSHOT_RE = /\b(screenshot\s+(?:de\s+la\s+)?fen[eê]tre|capture\s+(?:de\s+la\s+)?fen[eê]tre)\b/i;
const WINDOW_LIST_RE = /\b(liste[sz]?\s+(?:les?\s+)?fen[eê]tres?|quelles?\s+fen[eê]tres?\s+(?:sont\s+)?ouverte?s?|quoi\s+(?:est\s+)?(?:ouvert|tourne)|fen[eê]tres?\s+ouverte?s?)\b/i;
const FILE_SEND_RE = /\b(envoie[sz]?\s+(?:le\s+)?fichier|send\s+file|partage[sz]?\s+(?:le\s+)?fichier)\s+(.+)/i;
const FILE_READ_RE = /\b(lis?\s+(?:le\s+)?fichier|affiche[sz]?\s+(?:le\s+)?contenu|montre[sz]?\s+(moi\s+)?(?:le\s+)?contenu|cat\s+|type\s+)\s*(.+)/i;
const FILE_OPEN_RE = /\b(ouvre[sz]?\s+(?:le\s+)?fichier|open\s+file)\s+(.+)/i;
const FILE_SEARCH_RE = /\b(cherche[sz]?\s+(?:un\s+)?fichier|trouve[sz]?\s+(?:un\s+|tous?\s+les?\s+)?fichiers?|search\s+file)\s+(.+)/i;
const FILE_LIST_RE = /\b(liste[sz]?\s+(?:les?\s+)?(?:fichiers?|dossiers?|contenus?)|affiche[sz]?\s+(?:les?\s+)?(?:fichiers?|dossiers?)|montre[sz]?\s+(moi\s+)?(?:les?\s+)?(?:fichiers?|dossiers?))\b/i;
const NEXUS_STATUS_RE = /\b(nexus\s+(en\s+ligne|online|connect[eé]|status|[eé]tat|actif)|est[\s-]ce\s+que\s+nexus|nexus\s+est[\s-]il|tu\s+es\s+l[àa])\b/i;
// Terminal / project / Claude Code patterns
const TERMINAL_CMD_RE = /\b(fais?\s+|exécute[sz]?\s+|run\s+|lance[sz]?\s+(?:la\s+commande\s+)?|execute\s+)\s*(git\s+\S+|npm\s+\S+|npx\s+\S+|node\s+\S+|python\s+\S+|py\s+\S+|pip\s+\S+|tsc(\s|$)|eslint(\s|$)|ls(\s|$)|dir(\s|$)|type\s+|claude(\s+|$))/i;
const PROJECT_OPEN_RE = /\b(ouvre[sz]?\s+(?:le\s+)?projet|open\s+project|charge[sz]?\s+(?:le\s+)?projet|travaille[sz]?\s+(?:sur\s+|dans\s+)?(?:le\s+projet\s+)?)\s*(\S+)/i;
const CLAUDE_CODE_RE = /\b(lance[sz]?\s+claude\s+code|lance[sz]?\s+claude|démarre[sz]?\s+claude\s+code|start\s+claude|ouvre[sz]?\s+claude\s+code|claude\s+code\s+dans\s+|nexus\s+claude\s+)\s*(\S*)/i;
const CLAUDE_PROMPT_RE = /\b(claude\s+code\s+(?:fais?|crée?|modifie?|explique?|analyse?|aide?|écris?|génère?|fixe?)\s+.{5,}|demande[sz]?\s+[àa]\s+claude\s+.{5,})/i;
// Known dev command prefixes for shorthand matching
const _DEV_CMD_PREFIXES = /^(git|npm|npx|node|python|python3|py|pip|tsc|eslint|claude)\s/i;
// Single-word shorthands (after "nexus " prefix stripped)
const _GIT_SHORTHAND = {
    'pull': 'git pull', 'push': 'git push', 'status': 'git status',
    'diff': 'git diff', 'log': 'git log', 'branch': 'git branch',
    'fetch': 'git fetch', 'stash': 'git stash',
};
const _NPM_SHORTHAND = {
    'build': 'npm run build', 'dev': 'npm run dev', 'test': 'npm test',
    'install': 'npm install', 'ci': 'npm ci',
};
function _extractTerminalCmd(cmd) {
    const trimmed = cmd.trim();
    const lower = trimmed.toLowerCase();
    // Single-word git shorthand: "pull" → "git pull"
    if (_GIT_SHORTHAND[lower])
        return { command: _GIT_SHORTHAND[lower] };
    // Single-word npm shorthand: "build" → "npm run build"
    if (_NPM_SHORTHAND[lower])
        return { command: _NPM_SHORTHAND[lower] };
    // Direct: "git status", "npm run build", etc.
    if (_DEV_CMD_PREFIXES.test(trimmed))
        return { command: trimmed };
    // "fais git status", "run npm build", etc.
    const m = TERMINAL_CMD_RE.exec(cmd);
    if (m) {
        const rawCmd = cmd.slice(m.index + m[1].length).trim();
        return { command: rawCmd };
    }
    return undefined;
}
function _extractProject(cmd) {
    // "dans dzaryx", "dans le projet nexus", "pour dzaryx"
    const m = cmd.match(/\b(?:dans|in|dans\s+le\s+projet|project|projet)\s+([a-zA-Z0-9_-]+)\b/i);
    if (m) {
        const proj = (0, nexus_environment_js_1.resolveProject)(m[1]);
        if (proj)
            return proj.key;
    }
    return undefined;
}
// Explicit web search patterns (only matched when no sys priority)
const WEB_SEARCH_RE = /\b(cherche\s+(?:sur\s+(le\s+web|google|internet))|recherche\s+(?:en\s+ligne|sur\s+(?:le\s+web|google))|google\s+(?:pour|recherche)|search\s+(?:online|web|for))\b/i;
// ── detectIntent ──────────────────────────────────────────────────────────────
function detectIntent(cmd) {
    const sysPriority = hasSysPriority(cmd);
    // ── 1. screen_understand (most specific, always local)
    if (SCREEN_UNDERSTAND_RE.test(cmd)) {
        const qMatch = cmd.match(/(?:pour|question\s*:\s*|analyse\s+)(.{5,})/i);
        return { type: 'screen_understand', confidence: 0.88, sysPriority: true, args: { question: qMatch?.[1]?.trim() } };
    }
    // ── 2. screenshot (always local)
    if (SCREENSHOT_RE.test(cmd)) {
        return { type: 'screenshot', confidence: 0.92, sysPriority: true, args: {} };
    }
    // ── 3. focus_app — "focus vscode", "mets chrome en avant"
    const focusedApp = resolveAppFromVerb(FOCUS_VERB_RE, cmd);
    if (focusedApp && LOCAL_APP_KEYS.has(focusedApp)) {
        return { type: 'focus_app', confidence: 0.91, sysPriority: true, args: { app: focusedApp } };
    }
    // ── 4. app_launch or url_open via flexible verb matching
    //    BEFORE file_open so "ouvre chrome" ≠ "ouvre le fichier"
    const launchedApp = resolveAppFromVerb(LAUNCH_VERB_RE, cmd);
    if (launchedApp) {
        if (LOCAL_APP_KEYS.has(launchedApp)) {
            return { type: 'app_launch', confidence: 0.92, sysPriority: true, args: { app: launchedApp } };
        }
        const url = URL_ALIASES[launchedApp];
        if (url) {
            return { type: 'url_open', confidence: 0.90, sysPriority: true, args: { url, app: launchedApp } };
        }
    }
    // ── 5. app_close — "ferme chrome", "ferme vscode" (NOT "ferme la fenêtre X")
    //    Must come before window_close to grab "ferme <app>" patterns
    if (!WINDOW_CLOSE_RE.test(cmd) && !PROCESS_KILL_RE.test(cmd)) {
        const closedApp = resolveAppFromVerb(CLOSE_VERB_RE, cmd);
        if (closedApp && (LOCAL_APP_KEYS.has(closedApp) || URL_ALIASES[closedApp])) {
            return { type: 'app_close', confidence: 0.87, sysPriority: true, args: { app: closedApp } };
        }
    }
    // ── 6. process_kill
    const killM = PROCESS_KILL_RE.exec(cmd);
    if (killM) {
        return { type: 'process_kill', confidence: 0.85, sysPriority: true, args: { name: killM[2] } };
    }
    // ── 7. process_list
    if (PROCESS_LIST_RE.test(cmd)) {
        const sort = /\bcpu\b/i.test(cmd) ? 'cpu' : 'ram';
        return { type: 'process_list', confidence: 0.85, sysPriority: true, args: { sort } };
    }
    // ── 8. window_close — "ferme la fenêtre X"
    const winCloseM = WINDOW_CLOSE_RE.exec(cmd);
    if (winCloseM) {
        const title = winCloseM[2]?.trim();
        if (title && title.length > 1) {
            return { type: 'window_close', confidence: 0.82, sysPriority: true, args: { title } };
        }
    }
    // ── 9. window_screenshot (before window_focus)
    if (WINDOW_SCREENSHOT_RE.test(cmd)) {
        return { type: 'window_screenshot', confidence: 0.85, sysPriority: true, args: {} };
    }
    // ── 10. window_focus
    const winFocusM = WINDOW_FOCUS_RE.exec(cmd);
    if (winFocusM) {
        const title = winFocusM[2]?.trim();
        if (title && title.length > 1 && !/^(fichier|processus|app|liste)\b/i.test(title)) {
            return { type: 'window_focus', confidence: 0.78, sysPriority: true, args: { title } };
        }
    }
    // ── 11. window_list
    if (WINDOW_LIST_RE.test(cmd)) {
        return { type: 'window_list', confidence: 0.85, sysPriority: true, args: {} };
    }
    // ── 12. file_send
    const fileSendM = FILE_SEND_RE.exec(cmd);
    if (fileSendM) {
        const raw = fileSendM[2]?.trim() ?? '';
        const path = resolvePath(raw) ?? raw;
        return { type: 'file_send', confidence: 0.88, sysPriority: true, args: { path } };
    }
    // ── 13. file_read
    const fileReadM = FILE_READ_RE.exec(cmd);
    if (fileReadM) {
        const raw = (fileReadM[3] ?? fileReadM[fileReadM.length - 1] ?? '').trim();
        const path = resolvePath(raw) ?? raw;
        if (path)
            return { type: 'file_read', confidence: 0.85, sysPriority: true, args: { path } };
    }
    // ── 14. file_open (after app_launch — "ouvre le fichier X" ≠ "ouvre chrome")
    const fileOpenM = FILE_OPEN_RE.exec(cmd);
    if (fileOpenM) {
        const raw = fileOpenM[2]?.trim() ?? '';
        const path = resolvePath(raw) ?? raw;
        if (path)
            return { type: 'file_open', confidence: 0.82, sysPriority: true, args: { path } };
    }
    // ── 15. file_search
    const fileSearchM = FILE_SEARCH_RE.exec(cmd);
    if (fileSearchM) {
        const query = fileSearchM[2]?.trim() ?? '';
        if (query)
            return { type: 'file_search', confidence: 0.85, sysPriority: true, args: { query } };
    }
    // ── 16. file_list
    if (FILE_LIST_RE.test(cmd)) {
        const pathM = cmd.match(/(?:dans|de|du|de\s+la|de\s+l[''']?|in)\s+(.+)/i);
        const raw = pathM?.[1]?.trim();
        const path = raw ? (resolvePath(raw) ?? raw) : undefined;
        return { type: 'file_list', confidence: 0.85, sysPriority: true, args: { path } };
    }
    // ── 17. claude_code_start — "lance claude code dans dzaryx", "claude code fais X"
    if (CLAUDE_CODE_RE.test(cmd) || CLAUDE_PROMPT_RE.test(cmd)) {
        const projKey = _extractProject(cmd) ?? 'dzaryx';
        // Check if there's a prompt after the trigger
        const promptM = cmd.match(/(?:claude\s+code|claude)\s+(?:fais?|crée?|modifie?|explique?|analyse?|aide?|écris?|génère?|fixe?|dans\s+\w+\s+)(.{5,})/i)
            ?? cmd.match(/demande[sz]?\s+[àa]\s+claude\s+(.{5,})/i);
        const prompt = promptM?.[1]?.trim();
        return { type: 'claude_code_start', confidence: 0.88, sysPriority: true, args: { project: projKey, prompt } };
    }
    // ── 18. project_open — "ouvre le projet dzaryx", "charge nexus"
    const projOpenM = PROJECT_OPEN_RE.exec(cmd);
    if (projOpenM) {
        const raw = projOpenM[2]?.trim() ?? '';
        const proj = (0, nexus_environment_js_1.resolveProject)(raw);
        if (proj) {
            return { type: 'project_open', confidence: 0.88, sysPriority: true, args: { project: proj.key, path: proj.path } };
        }
    }
    // ── 19. terminal_run — git/npm/python shorthand OR "fais git status"
    const termExtracted = _extractTerminalCmd(cmd);
    if (termExtracted) {
        const projKey = _extractProject(cmd);
        return {
            type: 'terminal_run', confidence: 0.87, sysPriority: true,
            args: { command: termExtracted.command, project: projKey },
        };
    }
    // ── 20. nexus_status
    if (NEXUS_STATUS_RE.test(cmd)) {
        return { type: 'nexus_status', confidence: 0.90, sysPriority: false, args: {} };
    }
    // ── 21. Fallback logic
    if (sysPriority) {
        // System keyword detected but no intent matched — block web fallback
        const matched = matchedSysKeywords(cmd);
        return {
            type: 'unknown', confidence: 0.1, sysPriority: true,
            args: { reason: 'sys_no_local_match', keywords: matched.join(',') },
        };
    }
    // Explicit web search pattern
    if (WEB_SEARCH_RE.test(cmd)) {
        return { type: 'web_search', confidence: 0.60, sysPriority: false, args: { query: cmd } };
    }
    return { type: 'unknown', confidence: 0.0, sysPriority: false, args: {} };
}
// ── Response formatters ───────────────────────────────────────────────────────
function fmtFileList(r) {
    const entries = r['entries'];
    if (!entries?.length)
        return '📂 Dossier vide.';
    const lines = entries.slice(0, 20).map(e => {
        const icon = e.type === 'dir' ? '📁' : '📄';
        const size = e.size ? ` _(${Math.round(e.size / 1024)} KB)_` : '';
        return `${icon} ${e.name}${size}`;
    });
    if (entries.length > 20)
        lines.push(`_...et ${entries.length - 20} autres_`);
    return `📂 *${entries.length} éléments* :\n${lines.join('\n')}`;
}
function fmtFileSearch(r) {
    const results = r['results'];
    if (!results?.length)
        return '🔍 Aucun fichier trouvé.';
    const lines = results.slice(0, 15).map(p => `📄 \`${p}\``);
    if (results.length > 15)
        lines.push(`_...et ${results.length - 15} autres_`);
    return `🔍 *${results.length} fichier(s) trouvé(s)* :\n${lines.join('\n')}`;
}
function fmtProcessList(r) {
    const procs = r['processes'];
    if (!procs?.length)
        return '⚙️ Aucun processus trouvé.';
    const lines = procs.slice(0, 15).map(p => {
        const ram = p.ram_mb ? ` | RAM: ${p.ram_mb} MB` : '';
        const cpu = p.cpu !== undefined ? ` | CPU: ${p.cpu.toFixed(1)}%` : '';
        return `⚙️ \`${p.name}\` \\(PID ${p.pid}\\)${ram}${cpu}`;
    });
    return `⚙️ *Top ${procs.length} processus* :\n${lines.join('\n')}`;
}
function fmtWindowList(r) {
    const windows = r['windows'];
    if (!windows?.length)
        return '🪟 Aucune fenêtre ouverte.';
    const lines = windows.slice(0, 12).map(w => `🪟 \`${w.title}\`` + (w.process ? ` _(${w.process})_` : ''));
    return `🪟 *${windows.length} fenêtre(s)* :\n${lines.join('\n')}`;
}
async function executeIntent(intent, rawCmd) {
    const { type, args } = intent;
    switch (type) {
        case 'screenshot': {
            const r = await (0, nexus_relay_js_1.nexusScreenshot)(undefined, 35_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:screenshot', message: `❌ Screenshot échoué : ${r.error ?? 'erreur inconnue'}` };
            const kb = r.size_bytes ? Math.round(r.size_bytes / 1024) : '?';
            return { ok: true, toolUsed: 'nexus:screenshot', message: `📸 Screenshot pris et envoyé sur Telegram _(${kb} KB)_` };
        }
        case 'screen_understand': {
            const question = args['question'] ?? rawCmd;
            const r = await (0, nexus_relay_js_1.nexusScreenUnderstand)(question, true, undefined, 60_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:screen_understand', message: `❌ Analyse écran échouée : ${r.error ?? 'erreur inconnue'}` };
            const analysis = r['analysis']?.trim();
            if (analysis)
                return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:screen_understand', message: `👁️ *Analyse de l'écran* :\n\n${analysis}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:screen_understand', message: `👁️ Analyse terminée — envoyée sur Telegram.` };
        }
        case 'app_launch': {
            const app = args['app'];
            const r = await (0, nexus_relay_js_1.nexusAppLaunch)(app, 20_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:app_launch', message: `❌ Lancement ${app} échoué : ${r.error ?? 'erreur inconnue'}` };
            const focused = r['focused'];
            const focusTag = focused === true ? ' et mis au premier plan' : '';
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:app_launch', message: `🚀 *${app}* lancé${focusTag}.` };
        }
        case 'app_close': {
            const app = args['app'];
            const title = APP_WINDOW_TITLES[app] ?? app;
            const r = await (0, nexus_relay_js_1.nexusWindowClose)(title);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:window_close', message: `❌ Fermeture ${app} échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:window_close', message: `🔴 *${app}* fermé.` };
        }
        case 'focus_app': {
            const app = args['app'];
            const r = await (0, nexus_relay_js_1.nexusFocusApp)(app, 10_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:focus_app', message: `❌ Focus ${app} échoué : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:focus_app', message: `🎯 *${app}* mis au premier plan.` };
        }
        case 'url_open': {
            const url = args['url'];
            const app = args['app'] ?? url;
            const r = await (0, nexus_relay_js_1.nexusOpenUrl)(url, 10_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:open_url', message: `❌ Ouverture ${app} échouée \\(exit ${r.exit_code}\\)` };
            return { ok: true, jobId: r.jobId, toolUsed: 'nexus:open_url', message: `🌐 *${app}* ouvert dans le navigateur.` };
        }
        case 'file_list': {
            const path = args['path'];
            const r = await (0, nexus_relay_js_1.nexusFileList)(path);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:file_list', message: `❌ Liste fichiers échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:file_list', message: fmtFileList(r) };
        }
        case 'file_search': {
            const query = args['query'];
            const r = await (0, nexus_relay_js_1.nexusFileSearch)(query);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:file_search', message: `❌ Recherche échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:file_search', message: fmtFileSearch(r) };
        }
        case 'file_read': {
            const path = args['path'];
            const r = await (0, nexus_relay_js_1.nexusFileRead)(path);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:file_read', message: `❌ Lecture échouée : ${r.error ?? 'erreur inconnue'}` };
            const content = r['content']?.slice(0, 3000) ?? '(vide)';
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:file_read', message: `📄 *Contenu* :\n\`\`\`\n${content}\n\`\`\`` };
        }
        case 'file_send': {
            const path = args['path'];
            const r = await (0, nexus_relay_js_1.nexusFileSend)(path);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:file_send', message: `❌ Envoi échoué : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:file_send', message: `📤 Fichier envoyé sur Telegram.` };
        }
        case 'file_open': {
            const path = args['path'];
            const r = await (0, nexus_relay_js_1.nexusFileOpen)(path);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:file_open', message: `❌ Ouverture échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:file_open', message: `📂 Fichier ouvert.` };
        }
        case 'window_list': {
            const r = await (0, nexus_relay_js_1.nexusWindowList)();
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:window_list', message: `❌ Liste fenêtres échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:window_list', message: fmtWindowList(r) };
        }
        case 'window_focus': {
            const title = args['title'];
            const r = await (0, nexus_relay_js_1.nexusWindowFocus)(title);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:window_focus', message: `❌ Focus échoué : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:window_focus', message: `🪟 Fenêtre "${title}" mise en avant.` };
        }
        case 'window_close': {
            const title = args['title'];
            const r = await (0, nexus_relay_js_1.nexusWindowClose)(title);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:window_close', message: `❌ Fermeture échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:window_close', message: `🪟 Fenêtre "${title}" fermée.` };
        }
        case 'window_screenshot': {
            const r = await (0, nexus_relay_js_1.nexusWindowScreenshot)();
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:window_screenshot', message: `❌ Screenshot fenêtre échoué : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:window_screenshot', message: `📸 Screenshot fenêtre envoyé sur Telegram.` };
        }
        case 'process_list': {
            const sort = args['sort'] ?? 'ram';
            const r = await (0, nexus_relay_js_1.nexusProcessList)(20, sort);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:process_list', message: `❌ Liste processus échouée : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:process_list', message: fmtProcessList(r) };
        }
        case 'process_kill': {
            const name = args['name'];
            const pid = args['pid'];
            const r = await (0, nexus_relay_js_1.nexusProcessKill)(name, pid);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:process_kill', message: `❌ Kill échoué : ${r.error ?? 'erreur inconnue'}` };
            return { ok: true, jobId: r['job_id'], toolUsed: 'nexus:process_kill', message: `⚙️ Processus "${name ?? pid}" terminé.` };
        }
        case 'terminal_run': {
            const command = args['command'];
            const project = args['project'];
            if (!command)
                return { ok: false, toolUsed: 'nexus:terminal_run', message: '❌ Commande vide.' };
            const r = await (0, nexus_relay_js_1.nexusTerminalRun)(command, project, undefined, 30);
            const result = r.result;
            if (!result['ok'])
                return { ok: false, toolUsed: 'nexus:terminal_run', message: `❌ Erreur : ${result['error'] ?? `exit ${result['exit_code']}`}` };
            const stdout = (result['stdout'] ?? '').slice(0, 2000);
            const projTag = project ? ` \\(${project}\\)` : '';
            return {
                ok: true, jobId: r['job_id'], toolUsed: 'nexus:terminal_run',
                message: `💻 *${command}*${projTag} \\(${result['elapsed_ms']}ms\\)\n\`\`\`\n${stdout || '(vide)'}\n\`\`\``,
            };
        }
        case 'project_open': {
            const project = args['project'];
            const proj = (0, nexus_environment_js_1.resolveProject)(project) ?? { key: project, path: nexus_environment_js_1.PROJECT_REGISTRY[project] ?? '' };
            if (!proj.path)
                return { ok: false, toolUsed: 'nexus:app_launch', message: `❌ Projet inconnu: ${project}` };
            const r = await (0, nexus_relay_js_1.nexusAppLaunch)('vscode', 20_000);
            if (!r.ok)
                return { ok: false, toolUsed: 'nexus:app_launch', message: `❌ VS Code launch échoué: ${r.error ?? '?'}` };
            return { ok: true, toolUsed: 'nexus:app_launch', message: `📂 *${project}* ouvert dans VS Code.\n\`${proj.path}\`` };
        }
        case 'claude_code_start': {
            const project = args['project'] ?? 'dzaryx';
            const prompt = args['prompt'];
            const timeoutS = prompt ? 90 : 5;
            const r = await (0, nexus_relay_js_1.nexusClaudeCodeStart)(project, prompt, timeoutS);
            const result = r.result;
            if (!result['ok'] && !result['launched']) {
                return { ok: false, toolUsed: 'nexus:claude_code_start', message: `❌ Claude Code échoué: ${result['error'] ?? '?'}` };
            }
            if (result['output']) {
                const output = result['output'].slice(0, 2000);
                return {
                    ok: true, jobId: result['job_id'], toolUsed: 'nexus:claude_code_start',
                    message: `🤖 *Claude Code* \\(${project}\\) ${result['elapsed_ms']}ms :\n\n${output}`,
                };
            }
            return { ok: true, toolUsed: 'nexus:claude_code_start', message: `🤖 *Claude Code* lancé dans *${project}*.` };
        }
        case 'nexus_status': {
            const online = (0, nexus_relay_js_1.isNexusOnline)();
            return { ok: true, toolUsed: 'internal:nexus_status', message: online ? '🟢 NEXUS est en ligne.' : '🔴 NEXUS est hors ligne.' };
        }
        default:
            return { ok: false, toolUsed: 'none', message: '' };
    }
}
// ── routeNexusMessage ─────────────────────────────────────────────────────────
async function routeNexusMessage(text) {
    const logs = [];
    const messages = [];
    const proofs = [];
    let anyHandled = false;
    const cmds = splitCommands(text);
    const isMulti = cmds.length > 1;
    for (const cmd of cmds) {
        const t0 = Date.now();
        const intent = detectIntent(cmd);
        const parseMs = Date.now() - t0;
        // ── Log: INTENT_DETECTED
        logs.push(`[INTENT_DETECTED] cmd="${cmd.slice(0, 80)}" intent=${intent.type} ` +
            `confidence=${intent.confidence.toFixed(2)} sys_priority=${!!intent.sysPriority} ` +
            `parse_ms=${parseMs} args=${JSON.stringify(intent.args)}`);
        // ── Case 1: sys_priority + unknown → block web fallback, show error
        if (intent.type === 'unknown' && intent.sysPriority) {
            const elapsedMs = Date.now() - t0;
            const reason = `sys_priority_blocked — keywords: ${intent.args['keywords'] ?? '?'}`;
            logs.push(`[FALLBACK_REASON] cmd="${cmd.slice(0, 60)}" reason=sys_priority_blocked keywords="${intent.args['keywords'] ?? ''}"`);
            proofs.push({
                cmd, intent: 'unknown', confidence: intent.confidence,
                route: 'unknown', ok: false, elapsedMs, sysPriority: true,
                fallbackReason: reason,
            });
            messages.push(`⚠️ *Commande système non reconnue*\n` +
                `Commande : _${cmd}_\n` +
                `Mots-clés détectés : \`${intent.args['keywords'] ?? '?'}\`\n` +
                `Essaie : _ouvre vscode_ · _ferme chrome_ · _focus telegram_ · _screenshot_`);
            anyHandled = true;
            continue;
        }
        // ── Case 2: web_search (explicit) or plain unknown (no sys priority) → hand off to Claude
        if (intent.type === 'unknown' || intent.type === 'web_search') {
            const elapsedMs = Date.now() - t0;
            const reason = intent.type === 'web_search' ? 'explicit_web_search' : 'no_local_match';
            logs.push(`[FALLBACK_REASON] cmd="${cmd.slice(0, 60)}" reason=${reason} intent=${intent.type} confidence=${intent.confidence.toFixed(2)}`);
            proofs.push({
                cmd, intent: intent.type, confidence: intent.confidence,
                route: 'python_ai', ok: false, elapsedMs, sysPriority: false,
                fallbackReason: reason,
            });
            if (isMulti) {
                messages.push(`ℹ️ Non reconnu : _${cmd}_`);
                anyHandled = true;
            }
            continue;
        }
        // ── Case 3: known local intent → log action_selected and execute
        logs.push(`[ACTION_SELECTED] intent=${intent.type} ` +
            `tool=${_toolName(intent)} ` +
            `args=${JSON.stringify(intent.args)}`);
        try {
            const result = await executeIntent(intent, cmd);
            const totalMs = Date.now() - t0;
            logs.push(`[TOOL_USED] tool=${result.toolUsed ?? 'unknown'} intent=${intent.type} ` +
                `ok=${result.ok} elapsed_ms=${totalMs}`);
            proofs.push({
                cmd, intent: intent.type, confidence: intent.confidence,
                route: 'os_agent', jobId: result.jobId,
                ok: result.ok, elapsedMs: totalMs,
                sysPriority: !!intent.sysPriority,
                toolUsed: result.toolUsed,
            });
            if (result.message) {
                const confPct = Math.round(intent.confidence * 100);
                const jobPart = result.jobId ? ` | job: \`${result.jobId}\`` : '';
                const header = `🎯 *${intent.type}* | conf: ${confPct}%${jobPart}\n`;
                messages.push(header + result.message);
                anyHandled = true;
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const elapsedMs = Date.now() - t0;
            logs.push(`[TOOL_USED] tool=${_toolName(intent)} intent=${intent.type} ok=false error="${msg}"`);
            proofs.push({
                cmd, intent: intent.type, confidence: intent.confidence,
                route: 'os_agent', ok: false, elapsedMs,
                sysPriority: !!intent.sysPriority,
                toolUsed: _toolName(intent),
            });
            messages.push(`❌ Erreur NEXUS \\(${intent.type}\\) : ${msg}`);
            anyHandled = true;
        }
    }
    return { handled: anyHandled, messages, logs, proofs };
}
function _toolName(intent) {
    const map = {
        screenshot: 'nexus:screenshot',
        screen_understand: 'nexus:screen_understand',
        app_launch: 'nexus:app_launch',
        app_close: 'nexus:window_close',
        focus_app: 'nexus:focus_app',
        url_open: 'nexus:open_url',
        window_focus: 'nexus:window_focus',
        window_close: 'nexus:window_close',
        window_list: 'nexus:window_list',
        window_screenshot: 'nexus:window_screenshot',
        process_list: 'nexus:process_list',
        process_kill: 'nexus:process_kill',
        file_list: 'nexus:file_list',
        file_search: 'nexus:file_search',
        file_read: 'nexus:file_read',
        file_send: 'nexus:file_send',
        file_open: 'nexus:file_open',
        terminal_run: 'nexus:terminal_run',
        project_open: 'nexus:app_launch',
        claude_code_start: 'nexus:claude_code_start',
        nexus_status: 'internal:nexus_status',
        web_search: 'python_ai:claude',
        unknown: 'none',
    };
    return map[intent.type] ?? 'none';
}
// ── testNlParser ──────────────────────────────────────────────────────────────
function testNlParser(cases) {
    return cases.map(tc => {
        const cmds = splitCommands(tc.input);
        const detected = cmds.map(cmd => {
            const { type, confidence, args } = detectIntent(cmd);
            return { cmd, intent: type, confidence, args: args };
        });
        const detectedTypes = detected.map(d => d.intent);
        const passed = tc.expected_intents.every(exp => detectedTypes.includes(exp));
        return { input: tc.input, commands: cmds, detected, expected_intents: tc.expected_intents, passed };
    });
}
//# sourceMappingURL=nexus-nl-router.js.map