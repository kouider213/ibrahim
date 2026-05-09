/**
 * Autonomous Pipeline — TEST 9
 *
 * Workflow orchestré end-to-end:
 *   0. READ   — lire le fichier buggy depuis GitHub
 *   1. DETECT — Developer Agent détecte les bugs (LLM)
 *   2. PATCH  — Developer Agent génère le fix (LLM)
 *   3. APPLY  — Nexus écrit le patch sur le PC local
 *   4. TEST   — Nexus exécute npx tsc --noEmit (compilation TypeScript)
 *   5. REVIEW — Code Reviewer Agent valide le patch (LLM)
 *   6. DECIDE — commit GitHub ou rollback (restaure original)
 *   7. NOTIFY — rapport Telegram complet
 */
import axios from 'axios';
import { callProvider }                    from '../providers/provider-manager.js';
import { getFileContent, updateFile }      from '../integrations/github.js';
import { isNexusOnline, nexusRunCommand }                 from '../actions/handlers/nexus-relay.js';
import { DEVELOPER_AGENT }                 from '../agents/definitions/developer-agent.js';
import { CODE_REVIEWER_AGENT }             from '../agents/definitions/code-reviewer-agent.js';
import { env }                             from '../config/env.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const BUGGY_FILE_GITHUB = 'backend/src/test/buggy_rental_calc.ts';
const IBRAHIM_LOCAL     = 'C:\\Users\\douba\\OneDrive\\Bureau\\ibrahim\\ibrahim';
const IBRAHIM_REPO      = 'ibrahim';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StepResult {
  step:         string;
  status:       'success' | 'failure' | 'skipped' | 'info';
  agentId?:     string;
  provider?:    string;
  model?:       string;
  latencyMs:    number;
  inputTokens?: number;
  outputTokens?:number;
  costUsd?:     number;
  output:       string;
  details?:     Record<string, unknown>;
}

export interface PipelineReport {
  requestId:       string;
  startedAt:       string;
  completedAt:     string;
  totalMs:         number;
  nexusOnline:     boolean;
  steps:           StepResult[];
  decision:        'committed' | 'rolled_back' | 'aborted';
  commitSha?:      string;
  rollbackReason?: string;
  totalCostUsd:    number;
  telegramSent:    boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractCodeBlock(text: string): string {
  const m = text.match(/```(?:typescript|ts)?\n([\s\S]+?)```/);
  if (m) return m[1]!.trim();
  // fallback: if whole text looks like code, return as-is
  if (text.includes('export function') || text.includes('return ')) return text.trim();
  return '';
}

function extractDecision(text: string): 'APPROVED' | 'REJECTED' {
  const upper = text.toUpperCase().slice(0, 100);
  if (upper.includes('APPROVED') || upper.includes('APPROUV') || upper.includes('VALID')) return 'APPROVED';
  return 'REJECTED';
}

async function sendTelegram(message: string): Promise<void> {
  const token  = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: chatId, text: message, parse_mode: 'Markdown' },
      { timeout: 10_000 },
    );
  } catch { /* non-critical */ }
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────
export async function runAutonomousPipeline(requestId: string): Promise<PipelineReport> {
  const t0         = Date.now();
  const startedAt  = new Date().toISOString();
  const steps:     StepResult[] = [];
  let decision:    PipelineReport['decision'] = 'aborted';
  let commitSha:   string | undefined;
  let rollbackReason: string | undefined;
  let totalCostUsd = 0;
  const nexusOnline = isNexusOnline();

  const addStep = (s: StepResult) => { steps.push(s); console.log(`[pipeline:${requestId}] STEP ${s.step} → ${s.status} (${s.latencyMs}ms)`); return s; };

  // ── STEP 0: READ BUGGY FILE FROM GITHUB ──────────────────────────────────
  const t0r = Date.now();
  const fileData = await getFileContent(BUGGY_FILE_GITHUB, IBRAHIM_REPO);

  if (!fileData) {
    addStep({ step: 'READ_BUG_FILE', status: 'failure', latencyMs: Date.now() - t0r,
      output: `❌ File not found on GitHub: ${BUGGY_FILE_GITHUB}. Push it first.` });
    return finalize(requestId, startedAt, steps, 'aborted', totalCostUsd, false, undefined, 'File not on GitHub', Date.now() - t0, nexusOnline);
  }

  const originalCode = fileData.content;
  addStep({ step: 'READ_BUG_FILE', status: 'success', latencyMs: Date.now() - t0r,
    output: `✅ Read ${originalCode.length} chars from GitHub`,
    details: { path: BUGGY_FILE_GITHUB, sha: fileData.sha.slice(0, 7), repo: IBRAHIM_REPO } });

  // ── STEP 1: DEVELOPER AGENT — DETECT BUGS ────────────────────────────────
  const t1 = Date.now();
  const detectPrompt = `Analyse ce fichier TypeScript et liste TOUS les bugs avec précision.
Pour chaque bug: numéro de ligne, opérateur ou logique incorrect, impact réel, correction exacte.

\`\`\`typescript
${originalCode}
\`\`\``;

  let bugAnalysis = '';
  try {
    const r = await callProvider(
      { provider: DEVELOPER_AGENT.provider, model: DEVELOPER_AGENT.model,
        temperature: DEVELOPER_AGENT.temperature, maxTokens: DEVELOPER_AGENT.maxTokens,
        fallback: DEVELOPER_AGENT.fallback as any },
      detectPrompt, DEVELOPER_AGENT.systemPrompt, 25_000,
    );
    bugAnalysis = r.text;
    totalCostUsd += r.costEstUsd;
    addStep({ step: 'DETECT_BUGS', status: 'success', agentId: 'developer',
      provider: r.provider, model: r.model, latencyMs: Date.now() - t1,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costEstUsd,
      output: bugAnalysis.slice(0, 600) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addStep({ step: 'DETECT_BUGS', status: 'failure', latencyMs: Date.now() - t1, output: msg });
    return finalize(requestId, startedAt, steps, 'aborted', totalCostUsd, false, undefined, `Detect failed: ${msg}`, Date.now() - t0, nexusOnline);
  }

  // ── STEP 2: DEVELOPER AGENT — GENERATE PATCH ─────────────────────────────
  const t2 = Date.now();
  const fixPrompt = `Voici un fichier TypeScript avec des bugs identifiés.
Retourne UNIQUEMENT le code TypeScript corrigé dans un seul bloc \`\`\`typescript ... \`\`\`.
Corrige seulement les bugs, garde tout le reste identique (commentaires, structure).

BUGS:
${bugAnalysis.slice(0, 600)}

CODE:
\`\`\`typescript
${originalCode}
\`\`\``;

  let fixedCode = '';
  try {
    const r = await callProvider(
      { provider: DEVELOPER_AGENT.provider, model: DEVELOPER_AGENT.model,
        temperature: 0.2, maxTokens: 1200, fallback: DEVELOPER_AGENT.fallback as any },
      fixPrompt, DEVELOPER_AGENT.systemPrompt, 25_000,
    );
    fixedCode = extractCodeBlock(r.text);
    totalCostUsd += r.costEstUsd;
    const ok = fixedCode.length > 80;
    addStep({ step: 'GENERATE_PATCH', status: ok ? 'success' : 'failure', agentId: 'developer',
      provider: r.provider, model: r.model, latencyMs: Date.now() - t2,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costEstUsd,
      output: fixedCode.slice(0, 500) });
    if (!ok) {
      rollbackReason = 'Generated patch too short or unparseable';
      return finalize(requestId, startedAt, steps, 'aborted', totalCostUsd, false, undefined, rollbackReason, Date.now() - t0, nexusOnline);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addStep({ step: 'GENERATE_PATCH', status: 'failure', latencyMs: Date.now() - t2, output: msg });
    return finalize(requestId, startedAt, steps, 'aborted', totalCostUsd, false, undefined, msg, Date.now() - t0, nexusOnline);
  }

  // ── STEP 3: APPLY PATCH → GitHub API (temp commit) + Nexus git pull ─────
  const t3 = Date.now();
  const tempCommitMsg = `wip(test9-pipeline): apply autonomous patch — ${requestId} [TEMP — will rollback if rejected]`;
  const tempCommit = await updateFile(BUGGY_FILE_GITHUB, fixedCode, tempCommitMsg, IBRAHIM_REPO);

  if (!tempCommit) {
    addStep({ step: 'APPLY_PATCH_GITHUB', status: 'failure', latencyMs: Date.now() - t3,
      output: '❌ GitHub API write failed — cannot apply patch' });
    return finalize(requestId, startedAt, steps, 'aborted', totalCostUsd, false, undefined, 'GitHub patch apply failed', Date.now() - t0, nexusOnline);
  }

  addStep({ step: 'APPLY_PATCH_GITHUB', status: 'success', latencyMs: Date.now() - t3,
    output: `✅ Patch temporary-committed to GitHub — sha: ${tempCommit.commitSha.slice(0, 7)}`,
    details: { commitSha: tempCommit.commitSha, path: BUGGY_FILE_GITHUB } });

  // Nexus pulls the patch from GitHub
  if (nexusOnline) {
    try {
      const pull = await nexusRunCommand('git pull origin main', IBRAHIM_LOCAL, 30_000);
      addStep({ step: 'NEXUS_GIT_PULL', status: pull.ok ? 'success' : 'info',
        latencyMs: 0,
        output: pull.ok ? `✅ git pull OK — patch on PC disk` : `⚠️ pull partial: ${pull.stderr.slice(0, 150)}` });
    } catch (err: unknown) {
      addStep({ step: 'NEXUS_GIT_PULL', status: 'info', latencyMs: 0,
        output: `pull skipped: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // ── STEP 4: RUN TESTS — TSC VIA NEXUS ────────────────────────────────────
  const t4 = Date.now();
  let testsPass = false;
  let testStdout = '';
  let testStderr = '';

  if (nexusOnline) {
    try {
      const tsc = await nexusRunCommand(
        'npx tsc --noEmit --skipLibCheck 2>&1',
        `${IBRAHIM_LOCAL}\\backend`,
        60_000,
      );
      testsPass  = tsc.ok;
      testStdout = tsc.stdout.slice(0, 2000);
      testStderr = tsc.stderr.slice(0, 1000);
      addStep({ step: 'RUN_TSC_NEXUS', status: tsc.ok ? 'success' : 'failure',
        latencyMs: Date.now() - t4,
        output: tsc.ok
          ? `✅ npx tsc --noEmit: 0 erreurs`
          : `❌ tsc erreurs:\n${testStdout.slice(0, 400)}\n${testStderr.slice(0, 200)}`,
        details: { exit_code: tsc.exit_code, command: tsc.command } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep({ step: 'RUN_TSC_NEXUS', status: 'failure', latencyMs: Date.now() - t4, output: msg });
    }
  } else {
    // Static analysis fallback: check that the specific bugs are NOT in the fixed code
    const hasBug1 = /pricePerDay\s*\+\s*days/.test(fixedCode);
    const hasBug2 = /age\s*>\s*18/.test(fixedCode) && !/age\s*>=\s*18/.test(fixedCode);
    const hasBug3 = /baseCost\s*-\s*discountPercent/.test(fixedCode);
    testsPass  = !hasBug1 && !hasBug2 && !hasBug3;
    testStdout = `Static check — bug1(+→*):${hasBug1 ? 'FAIL' : 'OK'} bug2(>→>=):${hasBug2 ? 'FAIL' : 'OK'} bug3(-→%):${hasBug3 ? 'FAIL' : 'OK'}`;
    addStep({ step: 'RUN_STATIC_CHECK', status: testsPass ? 'success' : 'failure',
      latencyMs: Date.now() - t4,
      output: `⚠️ NEXUS hors ligne — vérification statique: ${testsPass ? '✅ PASS' : '❌ FAIL'}\n${testStdout}` });
  }

  // ── STEP 5: CODE REVIEWER AGENT ──────────────────────────────────────────
  const t5 = Date.now();
  const diff = buildDiff(originalCode, fixedCode);
  const reviewPrompt = `Review ce patch TypeScript pour Fik Conciergerie Oran.
Réponds en commençant par APPROVED ou REJECTED (obligatoire en premier), puis explique.

DIFF (original → corrigé):
${diff}

RÉSULTAT TESTS TypeScript: ${testsPass ? '✅ 0 erreurs' : '❌ Erreurs de compilation'}

Critères: logique correcte, pas de régression, bugs clairement fixés.`;

  let reviewDecision: 'APPROVED' | 'REJECTED' = 'REJECTED';
  let reviewText = '';
  try {
    const r = await callProvider(
      { provider: CODE_REVIEWER_AGENT.provider, model: CODE_REVIEWER_AGENT.model,
        temperature: CODE_REVIEWER_AGENT.temperature, maxTokens: CODE_REVIEWER_AGENT.maxTokens,
        fallback: CODE_REVIEWER_AGENT.fallback as any },
      reviewPrompt, CODE_REVIEWER_AGENT.systemPrompt, 35_000,
    );
    reviewDecision = extractDecision(r.text);
    reviewText     = r.text;
    totalCostUsd  += r.costEstUsd;
    addStep({ step: 'CODE_REVIEW', status: reviewDecision === 'APPROVED' ? 'success' : 'failure',
      agentId: 'code_reviewer', provider: r.provider, model: r.model,
      latencyMs: Date.now() - t5,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costEstUsd,
      output: r.text.slice(0, 700),
      details: { decision: reviewDecision } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    addStep({ step: 'CODE_REVIEW', status: 'failure', latencyMs: Date.now() - t5, output: msg });
    reviewDecision = 'REJECTED';
    rollbackReason = `Code review error: ${msg}`;
  }

  // ── STEP 6: DECIDE — COMMIT OR ROLLBACK ──────────────────────────────────
  const t6 = Date.now();
  const shouldCommit = testsPass && reviewDecision === 'APPROVED';

  if (shouldCommit) {
    const commitMsg = `fix(test9): autonomous pipeline — 3 bugs corrected (rental calc, age check, discount)\n\nAuto-fixed by Dzaryx autonomous pipeline ${requestId}\nAgents: Developer (${DEVELOPER_AGENT.provider}/${DEVELOPER_AGENT.model}) + CodeReviewer (${CODE_REVIEWER_AGENT.provider}/${CODE_REVIEWER_AGENT.model})\nTests: ${testsPass ? 'PASS' : 'FAIL'}`;
    const commitResult = await updateFile(BUGGY_FILE_GITHUB, fixedCode, commitMsg, IBRAHIM_REPO);
    if (commitResult) {
      commitSha = commitResult.commitSha;
      decision  = 'committed';
      addStep({ step: 'COMMIT_GITHUB', status: 'success', latencyMs: Date.now() - t6,
        output: `✅ Committed to GitHub — sha: ${commitSha?.slice(0, 7)}`,
        details: { commitSha, repo: IBRAHIM_REPO, path: BUGGY_FILE_GITHUB } });

      // Pull on Nexus PC to sync
      if (nexusOnline) {
        try {
          const pull = await nexusRunCommand('git pull origin main', IBRAHIM_LOCAL, 25_000);
          addStep({ step: 'NEXUS_GIT_PULL', status: pull.ok ? 'success' : 'info',
            latencyMs: 0, output: pull.ok ? `✅ git pull OK` : pull.stderr.slice(0, 200) });
        } catch { /* non-critical */ }
      }
    } else {
      decision = 'rolled_back';
      rollbackReason = 'GitHub API commit failed';
      addStep({ step: 'COMMIT_GITHUB', status: 'failure', latencyMs: Date.now() - t6,
        output: '❌ GitHub API commit failed — check GITHUB_TOKEN' });
    }
  } else {
    // ROLLBACK
    decision = 'rolled_back';
    rollbackReason = reviewDecision === 'REJECTED'
      ? `Code Reviewer a rejeté le patch: "${reviewText.slice(0, 100)}"`
      : `TypeScript tests failed:\n${testStdout.slice(0, 200)}`;

    // Rollback: restore original buggy code on GitHub (undo the temp commit)
    const rollbackCommit = await updateFile(
      BUGGY_FILE_GITHUB, originalCode,
      `revert(test9-pipeline): rollback — ${rollbackReason?.slice(0, 80)} — ${requestId}`,
      IBRAHIM_REPO,
    );
    if (rollbackCommit) {
      addStep({ step: 'ROLLBACK_GITHUB', status: 'success', latencyMs: Date.now() - t6,
        output: `✅ Original restauré sur GitHub — sha: ${rollbackCommit.commitSha.slice(0, 7)}\nRaison: ${rollbackReason?.slice(0, 100)}`,
        details: { commitSha: rollbackCommit.commitSha } });
      // Also pull on Nexus to restore local copy
      if (nexusOnline) {
        try {
          const pull = await nexusRunCommand('git pull origin main', IBRAHIM_LOCAL, 20_000);
          addStep({ step: 'ROLLBACK_NEXUS_PULL', status: pull.ok ? 'success' : 'info',
            latencyMs: 0, output: pull.ok ? `✅ git pull OK — original restauré sur PC` : pull.stderr.slice(0, 100) });
        } catch { /* non-critical */ }
      }
    } else {
      addStep({ step: 'ROLLBACK_GITHUB', status: 'failure', latencyMs: Date.now() - t6,
        output: `❌ GitHub rollback API failed — manual restore needed for ${BUGGY_FILE_GITHUB}` });
    }
  }

  // ── STEP 7: TELEGRAM REPORT ───────────────────────────────────────────────
  const totalMs    = Date.now() - t0;
  const completedAt = new Date().toISOString();
  let telegramSent  = false;

  const decisionIcon = decision === 'committed' ? '✅ COMMIT' : `🔄 ROLLBACK`;
  const telegramMsg  = [
    `${decision === 'committed' ? '✅' : '🔄'} *TEST 9 — Autonomous Pipeline*`,
    `\`${requestId}\``,
    '',
    `*Décision: ${decisionIcon}*`,
    rollbackReason ? `_Raison: ${rollbackReason.slice(0, 100)}_` : '',
    '',
    `📋 *Étapes:*`,
    ...steps.map(s => {
      const icon = s.status === 'success' ? '✅' : s.status === 'failure' ? '❌' : s.status === 'skipped' ? '⏭' : 'ℹ️';
      const prov = s.provider ? ` _(${s.provider}/${s.model?.split('-').slice(-2).join('-')})_` : '';
      return `${icon} \`${s.step}\`${prov} — ${s.latencyMs}ms`;
    }),
    '',
    `💰 *Coût total: $${totalCostUsd.toFixed(5)}*`,
    `⏱️ *Durée: ${(totalMs / 1000).toFixed(1)}s*`,
    `🖥️ *NEXUS: ${nexusOnline ? 'connecté ✅' : 'hors ligne ⚠️'}*`,
    commitSha ? `🔗 *Commit: \`${commitSha.slice(0, 7)}\`*` : '',
  ].filter(Boolean).join('\n');

  try {
    await sendTelegram(telegramMsg);
    telegramSent = true;
  } catch { /* non-critical */ }

  addStep({ step: 'TELEGRAM_REPORT', status: telegramSent ? 'success' : 'failure',
    latencyMs: 0, output: telegramSent ? '✅ Telegram envoyé' : '❌ Telegram échoué' });

  console.log(`[pipeline:${requestId}] DONE decision=${decision} totalMs=${totalMs} cost=$${totalCostUsd.toFixed(5)} nexus=${nexusOnline}`);

  return finalize(requestId, startedAt, steps, decision, totalCostUsd, telegramSent, commitSha, rollbackReason, totalMs, nexusOnline, completedAt);
}

// ── Diff builder ─────────────────────────────────────────────────────────────
function buildDiff(original: string, fixed: string): string {
  const origLines  = original.split('\n');
  const fixedLines = fixed.split('\n');
  const diff: string[] = [];
  const maxLines = Math.max(origLines.length, fixedLines.length);
  for (let i = 0; i < maxLines; i++) {
    const o = origLines[i] ?? '';
    const f = fixedLines[i] ?? '';
    if (o !== f) {
      diff.push(`L${i + 1} - ${o.trim()}`);
      diff.push(`L${i + 1} + ${f.trim()}`);
    }
  }
  return diff.length > 0 ? diff.join('\n') : '(aucune différence détectée)';
}

// ── Report builder ────────────────────────────────────────────────────────────
function finalize(
  requestId: string, startedAt: string, steps: StepResult[],
  decision: PipelineReport['decision'], totalCostUsd: number,
  telegramSent: boolean, commitSha?: string, rollbackReason?: string,
  totalMs = 0, nexusOnline = false, completedAt?: string,
): PipelineReport {
  return {
    requestId, startedAt,
    completedAt: completedAt ?? new Date().toISOString(),
    totalMs, nexusOnline, steps, decision, commitSha, rollbackReason,
    totalCostUsd, telegramSent,
  };
}
