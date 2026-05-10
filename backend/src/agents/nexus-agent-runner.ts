/**
 * Nexus Agent Runner — P9: Dzaryx ↔ Nexus live intelligence layer.
 *
 * Transforms natural language commands into real Nexus PC actions.
 * Claude acts as the AI brain — it plans, executes, verifies.
 *
 * Anti-fake guarantees:
 *   - verdict VERIFIED only if real Nexus ack received
 *   - every tool call logged with timing + raw result
 *   - screenshots stored as base64 proof
 *   - Nexus offline → immediate FAKE verdict, no hallucination
 *
 * Features:
 *   - Retry: 1 automatic retry per tool on timeout/error (2s cooldown)
 *   - Queue: sequential execution via Claude agentic loop
 *   - Busy state: set in nexus-relay before/after execution
 *   - MAX_ITER=8, timeoutMs=90s
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import {
  isNexusOnline, getNexusStatus, pingNexus, nexusSysinfo,
  nexusScreenshotBase64, nexusScreenUnderstand,
  nexusWindowList, nexusWindowScreenshot,
  nexusAppLaunch,
  nexusRunCommand,
  nexusProcessList,
  nexusFileList,
  setNexusBusy, clearNexusBusy,
} from '../actions/handlers/nexus-relay.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NexusToolCall {
  tool_name:   string;
  tool_input:  Record<string, unknown>;
  tool_result: string;
  duration_ms: number;
  retried:     boolean;
  blocked:     boolean;
  success:     boolean;
}

export interface NexusScreenshot {
  captured_at:  string;
  size_bytes:   number;
  size_kb:      number;
  hostname:     string;
  image_base64: string;
}

export interface NexusAgentResult {
  request_id:      string;
  agent_id:        'nexus_agent';
  provider:        'claude';
  model:           string;
  user_message:    string;
  tools_allowed:   string[];

  // Nexus connection proof
  nexus_online:    boolean;
  nexus_hostname:  string | null;
  nexus_os:        string | null;
  nexus_latency_ms: number | null;

  // Execution proof
  tools_called:    NexusToolCall[];
  tool_count:      number;
  screenshots:     NexusScreenshot[];
  screen_analysis: string | null;
  windows_found:   unknown[];
  processes_found: unknown[];

  // Final Claude analysis
  analysis:        string;
  input_tokens:    number;
  output_tokens:   number;
  total_ms:        number;

  // Verdict
  verdict:         'VERIFIED' | 'PARTIAL' | 'FAKE';
  verdict_reason:  string;
  error?:          string;
}

// ── Allowed tools ─────────────────────────────────────────────────────────────

const NEXUS_ALLOWED = new Set([
  'nexus_status', 'nexus_screenshot', 'nexus_screen_understand',
  'nexus_window_list', 'nexus_window_screenshot',
  'nexus_app_launch', 'nexus_exec',
  'nexus_process_list', 'nexus_file_list', 'nexus_sysinfo',
]);

const NEXUS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'nexus_status',
    description: 'Vérifie si Nexus est en ligne (ping réel + latence). Retourne hostname, OS, RAM, CPU, uptime. TOUJOURS appeler en premier.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'nexus_screenshot',
    description: 'Prend un screenshot réel du bureau Windows (PowerShell API). Retourne: taille en bytes, hostname, timestamp — preuve de capture réelle. L\'image base64 est incluse dans la réponse API.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'nexus_screen_understand',
    description: 'Capture le bureau et l\'analyse avec Claude Vision. Retourne: description des apps ouvertes, texte visible, layout, contexte. Utile pour "montre/analyse/décris mon écran".',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Question spécifique sur l\'écran (optionnel)' },
      },
      required: [],
    },
  },
  {
    name: 'nexus_window_list',
    description: 'Liste toutes les fenêtres Windows ouvertes avec leurs titres et PIDs.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'nexus_window_screenshot',
    description: 'Screenshot d\'une fenêtre spécifique, envoyé sur Telegram. Utile pour cibler une app précise.',
    input_schema: {
      type: 'object' as const,
      properties: { caption: { type: 'string' } },
      required: [],
    },
  },
  {
    name: 'nexus_app_launch',
    description: 'Ouvre une application sur le PC Windows. Apps: chrome, firefox, edge, spotify, discord, vscode, terminal, telegram, notepad, explorer, capcut, obs, vlc, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        app: { type: 'string', description: 'Nom de l\'application à ouvrir (ex: chrome, spotify, vscode)' },
      },
      required: ['app'],
    },
  },
  {
    name: 'nexus_exec',
    description: [
      'Exécute une commande PowerShell/cmd sur le PC Windows.',
      'Exemples: "tasklist | findstr chrome", "Get-Process | Sort-Object CPU -Desc | Select -First 5",',
      '"dir C:\\Users\\douba\\Desktop", "Get-Date".',
      'Commandes destructives bloquées (format, rm -rf, shutdown, etc.).',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Commande PowerShell ou cmd' },
        cwd:     { type: 'string', description: 'Répertoire de travail (optionnel)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'nexus_process_list',
    description: 'Liste les processus Windows actifs triés par RAM ou CPU. Retourne: nom, PID, RAM MB, CPU %.',
    input_schema: {
      type: 'object' as const,
      properties: {
        top:  { type: 'number', description: 'Nombre de processus (défaut: 20)' },
        sort: { type: 'string', enum: ['ram', 'cpu'], description: 'Tri: ram ou cpu' },
      },
      required: [],
    },
  },
  {
    name: 'nexus_file_list',
    description: 'Liste les fichiers d\'un dossier sur le PC. Dossiers autorisés: Bureau, Documents, Downloads, OneDrive/Bureau.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin du dossier (ex: C:\\Users\\douba\\Desktop)' },
      },
      required: [],
    },
  },
  {
    name: 'nexus_sysinfo',
    description: 'Informations système complètes: Python version, OS, version Windows, RAM totale, PID, répertoire courant.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'Agent Nexus de Dzaryx — couche IA intelligente au-dessus du PC Windows de Kouider.

RÔLE : Interprète les commandes de Kouider et exécute-les RÉELLEMENT sur son PC via les outils Nexus.

SÉQUENCE OBLIGATOIRE :
1. nexus_status TOUJOURS en premier — vérifie que Nexus est en ligne
2. Exécute les actions demandées (screenshot, open app, list windows, etc.)
3. VÉRIFIE le résultat (si app lancée → window_list pour confirmer qu'elle est ouverte)
4. Rapport final avec preuves runtime concrètes

CAPACITÉS NEXUS :
- nexus_status    : ping réel + latence + RAM/CPU/OS
- nexus_screenshot : screenshot bureau → base64 (preuve: taille bytes + hostname)
- nexus_screen_understand : Claude Vision analyse le bureau (description texte)
- nexus_window_list : fenêtres ouvertes (titres + PIDs)
- nexus_window_screenshot : screenshot d'une fenêtre spécifique
- nexus_app_launch : ouvre une app (chrome, spotify, vscode, terminal, etc.)
- nexus_exec      : commande PowerShell (Get-Process, tasklist, dir, Get-Date, etc.)
- nexus_process_list : processus actifs (RAM/CPU)
- nexus_file_list  : fichiers d'un dossier
- nexus_sysinfo    : infos système complètes

RÈGLES ABSOLUES :
- Si nexus_status retourne OFFLINE → ARRÊTER IMMÉDIATEMENT, ne pas inventer
- Ne jamais prétendre avoir exécuté sans ack runtime de Nexus
- Si un outil échoue → dire POURQUOI (erreur exacte, code de retour)
- Pour "ouvrir Chrome" : app_launch("chrome") PUIS window_list pour vérifier
- Pour "screenshot" : retourner size_bytes comme preuve de capture réelle
- Pour "analyse écran" : screen_understand retourne description Claude Vision

FORMAT RÉPONSE FINALE (obligatoire) :
\`\`\`
ACTION RÉALISÉE: [ce qui a été fait]
PREUVES RUNTIME: [timestamps, tailles, PIDs, hostnames, latences]
NEXUS: [online/offline + hostname + OS + latence]
\`\`\``;

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn:         () => Promise<T>,
  maxRetries  = 1,
  delaMs      = 2_000,
): Promise<{ value: T | null; retried: boolean; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return { value: await fn(), retried: attempt > 0 };
    } catch (err) {
      if (attempt < maxRetries && isNexusOnline()) {
        await new Promise(r => setTimeout(r, delaMs));
        continue;
      }
      return { value: null, retried: attempt > 0, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { value: null, retried: false, error: 'Max retries exceeded' };
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function execNexusTool(
  toolName:    string,
  input:       Record<string, unknown>,
  screenshots: NexusScreenshot[],
  windowsAcc:  unknown[],
  processesAcc: unknown[],
  analysisRef: { text: string | null },
): Promise<{ result: string; success: boolean; retried: boolean }> {
  const { value, retried, error } = await withRetry(async () => {
    switch (toolName) {

      case 'nexus_status': {
        const status = getNexusStatus();
        if (!status.online) return { ok: false, result: '❌ Nexus HORS LIGNE — aucune connexion Socket.IO active' };
        const ping = await pingNexus();
        return {
          ok: true,
          result: [
            `✅ Nexus ONLINE — latence: ${ping.latency_ms}ms`,
            `hostname: ${ping.hostname}`,
            `OS: ${status.telemetry.lastOs ?? '?'} ${status.telemetry.lastOsRelease ?? ''}`,
            `RAM: ${status.telemetry.lastRamUsedMb ?? '?'}/${status.telemetry.lastRamTotalMb ?? '?'} MB`,
            `CPU: ${status.telemetry.lastCpuPercent ?? '?'}%`,
            `uptime: ${status.telemetry.lastUptimeS ?? '?'}s`,
          ].join(' | '),
        };
      }

      case 'nexus_screenshot': {
        const r = await nexusScreenshotBase64(35_000);
        if (!r.ok || !r.image_base64) {
          return { ok: false, result: `❌ Screenshot échoué: ${r.error ?? 'erreur inconnue'}` };
        }
        screenshots.push({
          captured_at:  r.timestamp ?? new Date().toISOString(),
          size_bytes:   r.size_bytes ?? 0,
          size_kb:      r.size_kb ?? 0,
          hostname:     r.hostname ?? 'unknown',
          image_base64: r.image_base64,
        });
        return {
          ok: true,
          result: `✅ Screenshot capturé — ${r.size_bytes ?? 0} bytes (${r.size_kb ?? 0} KB) | hostname: ${r.hostname} | timestamp: ${r.timestamp} | image_base64 disponible dans proof.screenshots[${screenshots.length - 1}]`,
        };
      }

      case 'nexus_screen_understand': {
        const question = (input['question'] as string | undefined) ?? '';
        const r = await nexusScreenUnderstand(question || undefined, false, undefined, 60_000);
        const description = (r['description'] as string | undefined) ?? (r['result'] as string | undefined) ?? JSON.stringify(r).slice(0, 500);
        if (r.ok) analysisRef.text = description;
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ Analyse écran (Claude Vision):\n${description}`
            : `❌ screen_understand échoué: ${r.error ?? JSON.stringify(r).slice(0, 200)}`,
        };
      }

      case 'nexus_window_list': {
        const r = await nexusWindowList(15_000);
        const windows = (r['windows'] as unknown[] | undefined) ?? (r['data'] as unknown[] | undefined) ?? [];
        windows.forEach(w => windowsAcc.push(w));
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ ${windows.length} fenêtre(s) ouvertes:\n${JSON.stringify(windows, null, 2).slice(0, 600)}`
            : `❌ window_list: ${r.error ?? 'pas de réponse'}`,
        };
      }

      case 'nexus_window_screenshot': {
        const r = await nexusWindowScreenshot((input['caption'] as string | undefined), 35_000);
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ Screenshot fenêtre envoyé sur Telegram`
            : `❌ window_screenshot: ${r.error ?? 'erreur'}`,
        };
      }

      case 'nexus_app_launch': {
        const app = (input['app'] as string | undefined) ?? '';
        const r = await nexusAppLaunch(app, 15_000);
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ App lancée: "${app}" — ${r['message'] ?? r['result'] ?? JSON.stringify(r).slice(0, 200)}`
            : `❌ app_launch "${app}": ${r.error ?? r['message'] ?? 'erreur'}`,
        };
      }

      case 'nexus_exec': {
        const cmd = (input['command'] as string | undefined) ?? '';
        const cwd = (input['cwd'] as string | undefined);
        const r = await nexusRunCommand(cmd, cwd, 30_000);
        const output = (r.stdout || r.stderr || '(no output)').slice(0, 800);
        return {
          ok: r.ok,
          result: r.blocked
            ? `❌ BLOQUÉ (sécurité): "${cmd}"`
            : r.ok
              ? `✅ [exit ${r.exit_code}] ${output}`
              : `❌ [exit ${r.exit_code}] ${output}`,
        };
      }

      case 'nexus_process_list': {
        const top  = (input['top'] as number | undefined) ?? 20;
        const sort = (input['sort'] as 'ram' | 'cpu' | undefined) ?? 'ram';
        const r = await nexusProcessList(top, sort, 20_000);
        const procs = (r['processes'] as unknown[] | undefined) ?? (r['data'] as unknown[] | undefined) ?? [];
        procs.forEach(p => processesAcc.push(p));
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ ${procs.length} processus (tri: ${sort}):\n${JSON.stringify(procs, null, 2).slice(0, 800)}`
            : `❌ process_list: ${r.error ?? 'erreur'}`,
        };
      }

      case 'nexus_file_list': {
        const path = (input['path'] as string | undefined);
        const r = await nexusFileList(path, 20_000);
        const files = (r['files'] as unknown[] | undefined) ?? (r['items'] as unknown[] | undefined) ?? (r['data'] as unknown[] | undefined) ?? [];
        return {
          ok: !!r.ok,
          result: r.ok
            ? `✅ ${files.length} fichier(s) dans ${path ?? 'répertoire défaut'}:\n${JSON.stringify(files, null, 2).slice(0, 600)}`
            : `❌ file_list: ${r.error ?? 'erreur'}`,
        };
      }

      case 'nexus_sysinfo': {
        const r = await nexusSysinfo(12_000);
        return {
          ok: !!r.ok,
          result: r.ok
            ? [
                `✅ Sysinfo:`,
                `Python: ${r.python_executable ?? '?'} (${r.python_version ?? '?'})`,
                `OS: ${r.os ?? '?'} ${r.os_version ?? ''}`,
                `hostname: ${r.hostname ?? '?'}`,
                `PID: ${r.pid ?? '?'}`,
                `cwd: ${r.cwd ?? '?'}`,
              ].join(' | ')
            : `❌ sysinfo: erreur`,
        };
      }

      default:
        return { ok: false, result: `❌ Outil inconnu: ${toolName}` };
    }
  });

  if (value === null) {
    return {
      result:  `❌ ${toolName} TIMEOUT/ERREUR après ${maxRetries + 1} tentative(s): ${error ?? 'unknown'}`,
      success: false,
      retried,
    };
  }
  return { result: value.result, success: value.ok, retried };
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runNexusAgent(
  userMessage: string,
  requestId:   string,
  timeoutMs    = 90_000,
): Promise<NexusAgentResult> {
  const t0    = Date.now();
  const model = 'claude-sonnet-4-6';

  const toolsCalled:   NexusToolCall[]    = [];
  const screenshots:   NexusScreenshot[]  = [];
  const windowsFound:  unknown[]          = [];
  const processesFound: unknown[]         = [];
  const analysisRef:   { text: string | null } = { text: null };
  let totalInput  = 0;
  let totalOutput = 0;
  let finalText   = '';

  const nexusOnline   = isNexusOnline();
  const nexusStatus   = getNexusStatus();
  const nexusHostname = nexusStatus.telemetry.lastHostname;
  const nexusOs       = nexusStatus.telemetry.lastOs;
  let   nexusLatency: number | null = null;

  console.log(`[nexus-agent:${requestId}] ▶ START online=${nexusOnline} msg="${userMessage.slice(0, 60)}"`);

  if (!env.ANTHROPIC_API_KEY) {
    return makeFailedResult(requestId, model, userMessage, toolsCalled, screenshots, windowsFound, processesFound, 0, 0, Date.now() - t0, 'ANTHROPIC_API_KEY absent', nexusOnline, nexusHostname, nexusOs, null);
  }

  if (!nexusOnline) {
    return makeFailedResult(requestId, model, userMessage, toolsCalled, screenshots, windowsFound, processesFound, 0, 0, Date.now() - t0, 'Nexus HORS LIGNE — lance start.bat sur le PC Windows', false, null, null, null);
  }

  setNexusBusy(`nexus-agent:${requestId} — ${userMessage.slice(0, 60)}`);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const MAX_ITER = 8;
  let iter       = 0;

  try {
    while (iter < MAX_ITER && (Date.now() - t0) < timeoutMs) {
      iter++;

      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        system:     SYSTEM_PROMPT,
        tools:      NEXUS_TOOLS,
        messages,
      });

      totalInput  += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;

      console.log(`[nexus-agent:${requestId}] iter=${iter} stop=${response.stop_reason} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);

      const textBlocks = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
      if (textBlocks) finalText = textBlocks;

      if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') break;

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const tb of toolUseBlocks) {
        const tStart  = Date.now();
        const input   = tb.input as Record<string, unknown>;
        const blocked = !NEXUS_ALLOWED.has(tb.name);

        let result:  string;
        let success: boolean;
        let retried: boolean;

        if (blocked) {
          result  = `❌ Outil "${tb.name}" non autorisé pour nexus-agent.`;
          success = false;
          retried = false;
          console.warn(`[nexus-agent:${requestId}] BLOCKED tool=${tb.name}`);
        } else {
          const r = await execNexusTool(tb.name, input, screenshots, windowsFound, processesFound, analysisRef);
          result  = r.result;
          success = r.success;
          retried = r.retried;

          if (tb.name === 'nexus_status' && success) {
            const m = result.match(/latence: (\d+)ms/);
            if (m) nexusLatency = parseInt(m[1]);
          }
        }

        const duration = Date.now() - tStart;
        console.log(`[nexus-agent:${requestId}] tool=${tb.name} success=${success} retried=${retried} ${duration}ms`);

        toolsCalled.push({ tool_name: tb.name, tool_input: input, tool_result: result, duration_ms: duration, retried, blocked, success });
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    const totalMs = Date.now() - t0;

    // ── Verdict ───────────────────────────────────────────────────────────────
    const successfulTools = toolsCalled.filter(t => !t.blocked && t.success);
    const failedTools     = toolsCalled.filter(t => !t.blocked && !t.success);

    const verdict: NexusAgentResult['verdict'] =
      successfulTools.length >= 1 && nexusOnline   ? 'VERIFIED' :
      (successfulTools.length >= 1 || toolsCalled.length >= 1) ? 'PARTIAL' :
      'FAKE';

    const verdictReason =
      verdict === 'VERIFIED'
        ? `✅ ${successfulTools.length} outil(s) réel(s) exécuté(s) sur Nexus (${nexusHostname ?? 'PC'}). ${screenshots.length} screenshot(s). ${failedTools.length} échec(s).`
        : verdict === 'PARTIAL'
          ? `⚠️ ${successfulTools.length}/${toolsCalled.length} outils réussis. ${failedTools.map(t => t.tool_name).join(', ')} ont échoué.`
          : '❌ Nexus hors ligne ou aucun outil exécuté avec succès';

    console.log(`[nexus-agent:${requestId}] DONE verdict=${verdict} tools=${toolsCalled.length} success=${successfulTools.length} screenshots=${screenshots.length} ${totalMs}ms`);

    return {
      request_id:      requestId,
      agent_id:        'nexus_agent',
      provider:        'claude',
      model,
      user_message:    userMessage,
      tools_allowed:   [...NEXUS_ALLOWED],
      nexus_online:    nexusOnline,
      nexus_hostname:  nexusHostname ?? null,
      nexus_os:        nexusOs ?? null,
      nexus_latency_ms: nexusLatency,
      tools_called:    toolsCalled,
      tool_count:      toolsCalled.filter(t => !t.blocked).length,
      screenshots,
      screen_analysis: analysisRef.text,
      windows_found:   windowsFound,
      processes_found: processesFound,
      analysis:        finalText,
      input_tokens:    totalInput,
      output_tokens:   totalOutput,
      total_ms:        totalMs,
      verdict,
      verdict_reason:  verdictReason,
    };

  } catch (err) {
    const errMsg  = err instanceof Error ? err.message : String(err);
    const totalMs = Date.now() - t0;
    console.error(`[nexus-agent:${requestId}] ❌ ${errMsg}`);
    return makeFailedResult(requestId, model, userMessage, toolsCalled, screenshots, windowsFound, processesFound, totalInput, totalOutput, totalMs, errMsg, nexusOnline, nexusHostname, nexusOs, nexusLatency);

  } finally {
    clearNexusBusy();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFailedResult(
  requestId:     string,
  model:         string,
  userMessage:   string,
  toolsCalled:   NexusToolCall[],
  screenshots:   NexusScreenshot[],
  windowsFound:  unknown[],
  processesFound: unknown[],
  inp:           number,
  out:           number,
  ms:            number,
  errMsg:        string,
  nexusOnline:   boolean,
  nexusHostname: string | null,
  nexusOs:       string | null,
  nexusLatency:  number | null,
): NexusAgentResult {
  return {
    request_id:      requestId,
    agent_id:        'nexus_agent',
    provider:        'claude',
    model,
    user_message:    userMessage,
    tools_allowed:   [...NEXUS_ALLOWED],
    nexus_online:    nexusOnline,
    nexus_hostname:  nexusHostname,
    nexus_os:        nexusOs,
    nexus_latency_ms: nexusLatency,
    tools_called:    toolsCalled,
    tool_count:      toolsCalled.filter(t => !t.blocked).length,
    screenshots,
    screen_analysis: null,
    windows_found:   windowsFound,
    processes_found: processesFound,
    analysis:        '',
    input_tokens:    inp,
    output_tokens:   out,
    total_ms:        ms,
    verdict:         'FAKE',
    verdict_reason:  `❌ ${errMsg}`,
    error:           errMsg,
  };
}
