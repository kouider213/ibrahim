/**
 * Code Audit Runner — Tests Dzaryx autonomous coding capability (P8).
 *
 * Proofs:
 *   1. read_file         → réel appel GitHub API, retourne contenu exact
 *   2. apply_patch       → remplacement chirurgical → commit SHA réel
 *   3. list_directory    → liste un dossier GitHub
 *   4. get_railway_logs  → logs Railway en temps réel
 *
 * Test flow:
 *   PLANT: crée backend/audit-test/revenue-calc.ts avec un bug TypeScript délibéré
 *   RUN:   agent Claude → read → identifie bug → patch → re-read → verify
 *   PROOF: before_content vs after_content, commits, tools_called, verdict
 *
 * Note: le fichier test est en backend/audit-test/ (hors src/) — TypeScript
 * ne le compile pas → le bug ne casse pas Railway. L'agent le corrige quand même.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { getFileContent, updateFile, listDirectory } from '../integrations/github.js';
import { getRailwayLogs } from '../integrations/railway.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const AUDIT_REPO = 'ibrahim';
const AUDIT_FILE = 'backend/audit-test/revenue-calc.ts';

// Deliberately buggy TypeScript — price: string used in multiplication
const BUGGY_CODE = `/**
 * P8 Code Audit Test — Revenue calculator with deliberate TypeScript bug
 * Bug: parameter 'price' declared as 'string' but used in arithmetic (* operator)
 * TypeScript error: TS2362 — Left-hand side of arithmetic must be number, not string
 * @audit-test true — managed by code-audit-runner, do not edit manually
 */

export function calculateRevenue(price: string, days: number): number {
  // TS2362: The left-hand side of an arithmetic operation must be of type
  // 'any', 'number', 'bigint' or an enum type. Type 'string' is not assignable.
  return price * days;
}

export function formatAmount(amount: number): string {
  return \`\${amount.toFixed(2)} DZD\`;
}
`;

// ── Authorized tools ──────────────────────────────────────────────────────────

const AUDIT_ALLOWED = new Set(['read_file', 'apply_patch', 'list_directory', 'get_railway_logs']);

const AUDIT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Lit le contenu exact d\'un fichier depuis le repo GitHub ibrahim. OBLIGATOIRE avant tout apply_patch — copy the exact content returned.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin du fichier (ex: backend/audit-test/revenue-calc.ts)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'apply_patch',
    description: [
      'Correction CHIRURGICALE d\'un fichier via remplacement de string unique.',
      'old_string doit être copié MOT POUR MOT depuis read_file (espaces + indentation inclus).',
      'Doit apparaître EXACTEMENT 1 fois. Si 0 → re-lire le fichier. Si >1 → ajouter contexte.',
    ].join(' '),
    input_schema: {
      type: 'object' as const,
      properties: {
        path:       { type: 'string', description: 'Chemin du fichier à patcher' },
        old_string: { type: 'string', description: 'Extrait EXACT à remplacer (copié depuis read_file, indentation incluse)' },
        new_string: { type: 'string', description: 'Nouveau texte qui remplace old_string' },
        commit_msg: { type: 'string', description: 'Message de commit Git descriptif' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_directory',
    description: 'Liste les fichiers et dossiers dans un répertoire du repo GitHub ibrahim.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Chemin du répertoire (vide = racine)' },
      },
      required: [],
    },
  },
  {
    name: 'get_railway_logs',
    description: 'Récupère les logs Railway récents. Chercher: "error TS", "Cannot find", "Type" pour détecter des erreurs TypeScript actives en production.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Nombre de lignes (défaut: 60)' },
      },
    },
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditToolCall {
  tool_name:   string;
  tool_input:  Record<string, unknown>;
  tool_result: string;
  duration_ms: number;
  blocked:     boolean;
  commit_sha?: string;
}

export interface AuditPatch {
  file_path:   string;
  old_string:  string;
  new_string:  string;
  commit_sha:  string;
  commit_msg:  string;
  applied_at:  string;
}

export interface CodeAuditResult {
  request_id:       string;
  agent_id:         'code_audit';
  provider:         'claude';
  model:            string;
  system_prompt:    string;
  tools_allowed:    string[];
  // Test file
  test_file_path:   string;
  bug_description:  string;
  before_content:   string;
  before_commit_sha: string;
  after_content:    string | null;
  // Execution
  tools_called:     AuditToolCall[];
  tool_count:       number;
  patches_applied:  AuditPatch[];
  analysis:         string;
  input_tokens:     number;
  output_tokens:    number;
  total_ms:         number;
  // Verdict
  bug_found:        boolean;
  bug_fixed:        boolean;
  fix_verified:     boolean;
  verdict:          'VERIFIED' | 'PARTIAL' | 'FAKE';
  verdict_reason:   string;
  error?:           string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es l'Agent Code Autonome de Dzaryx — expert TypeScript/Node.js.

MISSION P8 : Trouver et corriger un bug TypeScript réel dans le repo ibrahim.

SÉQUENCE OBLIGATOIRE (dans cet ordre exact) :
1. read_file("${AUDIT_FILE}") → lis le code source exact
2. Identifie le bug TypeScript : type erroné, ligne exacte, code d'erreur TS
3. apply_patch avec old_string copié MOT POUR MOT depuis read_file (unique dans le fichier)
4. read_file("${AUDIT_FILE}") à nouveau → confirme que la correction est présente
5. get_railway_logs(60) → cherche des erreurs TypeScript actives en production

RÈGLES ABSOLUES :
- old_string dans apply_patch doit être copié EXACTEMENT depuis le résultat de read_file
- La correction doit être MINIMALE (changer seulement le type erroné, rien d'autre)
- Si apply_patch retourne "non trouvé" → relire le fichier et copier l'extrait exact
- Ne jamais deviner un extrait — toujours lire d'abord

FORMAT RÉPONSE FINALE (obligatoire) :
\`\`\`
BUG IDENTIFIÉ: [description précise : ligne, type TS erroné, code erreur TypeScript]
CORRECTION: [before] → [after]
COMMIT SHA: [hash complet]
VÉRIFICATION: CONFIRMÉ | ÉCHEC + raison
RAILWAY LOGS: [erreurs TS trouvées / aucune erreur TS active]
\`\`\``;

// ── Tool executors ─────────────────────────────────────────────────────────────

async function execReadFile(path: string): Promise<string> {
  const result = await getFileContent(path, AUDIT_REPO);
  if (!result) return `❌ Fichier non trouvé: ${path} dans ${AUDIT_REPO}`;
  return result.content;
}

async function execApplyPatch(
  path: string,
  oldString: string,
  newString: string,
  commitMsg: string,
): Promise<{ result: string; commitSha?: string; patch?: AuditPatch }> {
  const file = await getFileContent(path, AUDIT_REPO);
  if (!file) return { result: `❌ Fichier non trouvé: ${path}` };

  const occurrences = file.content.split(oldString).length - 1;
  if (occurrences === 0) {
    return {
      result: `❌ old_string non trouvé dans ${path}.\n` +
              `Utilise read_file pour copier l'extrait exact (indentation + espaces inclus).\n` +
              `Première ligne recherchée: "${oldString.split('\n')[0]?.slice(0, 60)}"`,
    };
  }
  if (occurrences > 1) {
    return {
      result: `❌ old_string trouvé ${occurrences} fois — ambigu.\n` +
              `Ajoute des lignes de contexte (lignes voisines) pour le rendre unique.`,
    };
  }

  const newContent  = file.content.replace(oldString, newString);
  const msg         = commitMsg || `fix: code audit patch in ${path}`;
  const writeResult = await updateFile(path, newContent, msg, AUDIT_REPO);

  if (!writeResult) return { result: `❌ GitHub updateFile a échoué pour ${path}` };

  const preview = oldString.split('\n')[0]?.trim().slice(0, 50) ?? '';
  const patch: AuditPatch = {
    file_path:  path,
    old_string: oldString,
    new_string: newString,
    commit_sha: writeResult.commitSha,
    commit_msg: msg,
    applied_at: new Date().toISOString(),
  };

  return {
    result:    `✅ Patch appliqué dans ${path} (commit: ${writeResult.commitSha})\n→ "${preview}..." remplacé`,
    commitSha: writeResult.commitSha,
    patch,
  };
}

async function execListDirectory(path: string): Promise<string> {
  const files = await listDirectory(path, AUDIT_REPO);
  if (!files.length) return `Répertoire vide ou non trouvé: ${path || '/'}`;
  return files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}`).join('\n');
}

async function execGetRailwayLogs(limit: number): Promise<string> {
  return getRailwayLogs(limit);
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runCodeAudit(
  requestId:  string,
  timeoutMs   = 90_000,
): Promise<CodeAuditResult> {
  const t0    = Date.now();
  const model = 'claude-sonnet-4-6';

  const toolsCalled:   AuditToolCall[] = [];
  const patchesApplied: AuditPatch[]   = [];
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  let finalAnalysis     = '';
  let afterContent: string | null = null;

  console.log(`[code-audit:${requestId}] ▶ START model=${model}`);

  if (!env.ANTHROPIC_API_KEY) {
    return makeFailedResult(requestId, model, toolsCalled, patchesApplied, 0, 0, Date.now() - t0, 'ANTHROPIC_API_KEY absent');
  }
  if (!env.GITHUB_TOKEN) {
    return makeFailedResult(requestId, model, toolsCalled, patchesApplied, 0, 0, Date.now() - t0, 'GITHUB_TOKEN absent — impossible d\'écrire sur GitHub');
  }

  // ── Step 1: Read pre-existing buggy file (no plant commit = no Railway restart) ──
  console.log(`[code-audit:${requestId}] READ existing file → ${AUDIT_FILE}`);
  const existingFile = await getFileContent(AUDIT_FILE, AUDIT_REPO);

  if (!existingFile) {
    return makeFailedResult(requestId, model, toolsCalled, patchesApplied, 0, 0, Date.now() - t0,
      `Fichier test non trouvé: ${AUDIT_FILE} — committer backend/audit-test/revenue-calc.ts dans le repo`);
  }

  const hasBug = existingFile.content.includes('price: string');
  let beforeContent   = existingFile.content;
  let beforeCommitSha = existingFile.sha;

  if (!hasBug) {
    // Bug was already fixed by a previous audit run — restore it synchronously.
    // Railway deploy takes ~2-3 min; agent finishes in ~60-90s → response sent before restart.
    console.log(`[code-audit:${requestId}] Bug absent (déjà corrigé) — RESTORE bug → ${AUDIT_FILE}`);
    const restoreResult = await updateFile(
      AUDIT_FILE,
      BUGGY_CODE,
      `P8 audit: restore test bug (TS2362) for re-run`,
      AUDIT_REPO,
    );
    if (!restoreResult) {
      return makeFailedResult(requestId, model, toolsCalled, patchesApplied, 0, 0, Date.now() - t0,
        `Impossible de restaurer le bug test dans ${AUDIT_FILE}`);
    }
    beforeContent   = BUGGY_CODE;
    beforeCommitSha = restoreResult.commitSha;
    console.log(`[code-audit:${requestId}] BUG RESTORED commit=${beforeCommitSha}`);
  } else {
    console.log(`[code-audit:${requestId}] Bug présent (price: string) — sha=${beforeCommitSha.slice(0, 7)}`);
  }

  // ── Step 2: Run agent ────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role:    'user',
      content: `Tâche P8 : Le fichier ${AUDIT_FILE} contient un bug TypeScript délibéré.\n` +
               `Lis-le, identifie le bug précis, corrige-le avec apply_patch, vérifie après correction, puis consulte les Railway logs.`,
    },
  ];

  const MAX_ITER = 8;
  let iterCount  = 0;

  try {
    while (iterCount < MAX_ITER && (Date.now() - t0) < timeoutMs) {
      iterCount++;

      const response = await client.messages.create({
        model,
        max_tokens:  3000,
        system:      SYSTEM_PROMPT,
        tools:       AUDIT_TOOLS,
        messages,
      });

      totalInputTokens  += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      console.log(
        `[code-audit:${requestId}] iter=${iterCount} stop=${response.stop_reason} ` +
        `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
      );

      const textBlocks = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      if (response.stop_reason === 'end_turn' || response.stop_reason !== 'tool_use') {
        finalAnalysis = textBlocks || finalAnalysis;
        break;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const tb of toolUseBlocks) {
        const tStart  = Date.now();
        const input   = tb.input as Record<string, unknown>;
        const blocked = !AUDIT_ALLOWED.has(tb.name);

        let result:    string;
        let commitSha: string | undefined;

        if (blocked) {
          result = `❌ Outil "${tb.name}" non autorisé pour code-audit. Autorisés: ${[...AUDIT_ALLOWED].join(', ')}`;
          console.warn(`[code-audit:${requestId}] BLOCKED tool=${tb.name}`);
        } else if (tb.name === 'read_file') {
          result = await execReadFile(input['path'] as string);
        } else if (tb.name === 'apply_patch') {
          const r = await execApplyPatch(
            input['path']       as string,
            input['old_string'] as string,
            input['new_string'] as string,
            (input['commit_msg'] as string | undefined) ?? '',
          );
          result    = r.result;
          commitSha = r.commitSha;
          if (r.patch) patchesApplied.push(r.patch);
        } else if (tb.name === 'list_directory') {
          result = await execListDirectory((input['path'] as string) ?? '');
        } else if (tb.name === 'get_railway_logs') {
          result = await execGetRailwayLogs(Number(input['limit'] ?? 60));
        } else {
          result = `Outil inconnu: ${tb.name}`;
        }

        const duration = Date.now() - tStart;
        console.log(
          `[code-audit:${requestId}] ` +
          `tool=${tb.name} blocked=${blocked} ` +
          `${commitSha ? `commit=${commitSha} ` : ''}chars=${result.length} ${duration}ms`,
        );

        toolsCalled.push({
          tool_name: tb.name, tool_input: input, tool_result: result,
          duration_ms: duration, blocked, commit_sha: commitSha,
        });
        toolResults.push({ type: 'tool_result', tool_use_id: tb.id, content: result });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // ── Step 3: Verify final file state ─────────────────────────────────────────
    const finalFile = await getFileContent(AUDIT_FILE, AUDIT_REPO);
    afterContent    = finalFile?.content ?? null;

    const totalMs = Date.now() - t0;

    // ── Compute verdict ──────────────────────────────────────────────────────────
    const patchCount  = patchesApplied.length;
    const readCalls   = toolsCalled.filter(t => t.tool_name === 'read_file' && !t.blocked);
    const bugFound    = finalAnalysis.toLowerCase().includes('ts2362') ||
                        finalAnalysis.toLowerCase().includes('price') ||
                        finalAnalysis.toLowerCase().includes('string') ||
                        toolsCalled.some(t => t.tool_result.includes(BUGGY_CODE.split('\n')[9] ?? ''));
    const bugFixed    = patchCount >= 1 && afterContent !== null && afterContent !== beforeContent;
    const fixVerified = bugFixed && readCalls.length >= 2; // at least read before + after patch

    const verdict: CodeAuditResult['verdict'] =
      bugFixed && fixVerified && readCalls.length >= 2 ? 'VERIFIED' :
      bugFixed || (readCalls.length >= 1 && patchCount >= 1) ? 'PARTIAL' :
      'FAKE';

    const verdictReason =
      verdict === 'VERIFIED'
        ? `✅ Bug planté → lu → corrigé (commit: ${patchesApplied[0]?.commit_sha ?? '?'}) → vérifié par re-lecture. ${readCalls.length} read_file calls, ${patchCount} patch(es) appliqué(s).`
        : verdict === 'PARTIAL'
          ? `⚠️ Patch appliqué (${patchCount}) mais vérification incomplète — ${readCalls.length} lecture(s)`
          : `❌ Aucun patch appliqué — agent n'a pas corrigé le bug`;

    console.log(
      `[code-audit:${requestId}] DONE verdict=${verdict} ` +
      `patches=${patchCount} reads=${readCalls.length} ` +
      `bugFixed=${bugFixed} fixVerified=${fixVerified} ${totalMs}ms`,
    );

    return {
      request_id:        requestId,
      agent_id:          'code_audit',
      provider:          'claude',
      model,
      system_prompt:     SYSTEM_PROMPT,
      tools_allowed:     [...AUDIT_ALLOWED],
      test_file_path:    AUDIT_FILE,
      bug_description:   'TS2362: price parameter typed as string but used in multiplication (price * days). Fix: price: string → price: number',
      before_content:    beforeContent,
      before_commit_sha: beforeCommitSha,
      after_content:     afterContent,
      tools_called:      toolsCalled,
      tool_count:        toolsCalled.filter(t => !t.blocked).length,
      patches_applied:   patchesApplied,
      analysis:          finalAnalysis,
      input_tokens:      totalInputTokens,
      output_tokens:     totalOutputTokens,
      total_ms:          totalMs,
      bug_found:         bugFound,
      bug_fixed:         bugFixed,
      fix_verified:      fixVerified,
      verdict,
      verdict_reason:    verdictReason,
    };

  } catch (err) {
    const errMsg  = err instanceof Error ? err.message : String(err);
    const totalMs = Date.now() - t0;
    console.error(`[code-audit:${requestId}] ❌ ${errMsg}`);

    // Read file for after state even on error
    try {
      const f = await getFileContent(AUDIT_FILE, AUDIT_REPO);
      afterContent = f?.content ?? null;
    } catch { /* ignore */ }

    return {
      ...makeFailedResult(requestId, model, toolsCalled, patchesApplied, totalInputTokens, totalOutputTokens, totalMs, errMsg),
      before_content:    beforeContent,
      before_commit_sha: beforeCommitSha,
      after_content:     afterContent,
    };
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeFailedResult(
  requestId: string, model: string,
  toolsCalled: AuditToolCall[], patchesApplied: AuditPatch[],
  inp: number, out: number, ms: number, errMsg: string,
): CodeAuditResult {
  return {
    request_id:        requestId,
    agent_id:          'code_audit',
    provider:          'claude',
    model,
    system_prompt:     SYSTEM_PROMPT,
    tools_allowed:     [...AUDIT_ALLOWED],
    test_file_path:    AUDIT_FILE,
    bug_description:   'TS2362: price: string used in arithmetic',
    before_content:    '',
    before_commit_sha: '',
    after_content:     null,
    tools_called:      toolsCalled,
    tool_count:        toolsCalled.filter(t => !t.blocked).length,
    patches_applied:   patchesApplied,
    analysis:          '',
    input_tokens:      inp,
    output_tokens:     out,
    total_ms:          ms,
    bug_found:         false,
    bug_fixed:         false,
    fix_verified:      false,
    verdict:           'FAKE',
    verdict_reason:    `❌ ${errMsg}`,
    error:             errMsg,
  };
}
