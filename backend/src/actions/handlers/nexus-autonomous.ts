import { nexusTerminalRun, nexusClaudeCodeStart, sendToNexus } from './nexus-relay.js';
import { resolveProject } from './nexus-environment.js';

export interface AutonomousStep {
  name:       string;
  status:     'ok' | 'error' | 'skip';
  output?:    string;
  durationMs: number;
}

export interface AutonomousResult {
  jobId:            string;
  project:          string;
  steps:            AutonomousStep[];
  success:          boolean;
  summary:          string;
  committed:        boolean;
  errorsFixed:      number;
  errorsRemaining:  number;
  durationMs:       number;
}

// ── TypeScript auto-fix ───────────────────────────────────────────────────────
// Flow: tsc --noEmit → parse errors → Claude Code fix → tsc verify → git commit

export async function autonomousFixTypeScript(projectToken: string): Promise<AutonomousResult> {
  const jobId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const start = Date.now();

  const proj = resolveProject(projectToken);
  if (!proj) throw new Error(`Unknown project: "${projectToken}"`);

  const steps: AutonomousStep[] = [];

  async function step(
    name: string,
    fn:   () => Promise<{ ok: boolean; output: string }>,
  ): Promise<{ ok: boolean; output: string }> {
    const t0 = Date.now();
    try {
      const r = await fn();
      steps.push({ name, status: r.ok ? 'ok' : 'error', output: r.output, durationMs: Date.now() - t0 });
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      steps.push({ name, status: 'error', output: msg, durationMs: Date.now() - t0 });
      return { ok: false, output: msg };
    }
  }

  // ── Step 1: initial tsc check ─────────────────────────────────────────────
  const tsc1 = await step('tsc_initial', async () => {
    const r   = await nexusTerminalRun('npx tsc --noEmit 2>&1', proj.key, undefined, 60);
    const res = r.result as Record<string, unknown>;
    const out = [String(res['stdout'] ?? ''), String(res['stderr'] ?? '')].join('\n').trim();
    return { ok: !out.includes('error TS'), output: out };
  });

  const errorCount = (tsc1.output.match(/error TS\d+/g) ?? []).length;
  if (errorCount === 0) {
    return {
      jobId, project: proj.key, steps,
      success: true, summary: '✅ Aucune erreur TypeScript — rien à corriger',
      committed: false, errorsFixed: 0, errorsRemaining: 0,
      durationMs: Date.now() - start,
    };
  }

  // Notify PC we started (non-blocking)
  sendToNexus('nexus:autonomous_start', { jobId, project: proj.key, errors: errorCount });

  // ── Step 2: Claude Code fix ───────────────────────────────────────────────
  const prompt =
    `Corrige toutes les erreurs TypeScript suivantes dans ce projet. ` +
    `Fais UNIQUEMENT les corrections nécessaires, pas de refactoring, pas de nouveaux fichiers.\n\n` +
    `Erreurs:\n${tsc1.output.slice(0, 3_000)}`;

  await step('claude_code_fix', async () => {
    const r   = await nexusClaudeCodeStart(proj.key, prompt, 180);
    const res = r.result as Record<string, unknown>;
    return { ok: Boolean(res['ok']), output: String(res['output'] ?? '').slice(0, 2_000) };
  });

  // ── Step 3: tsc verify ────────────────────────────────────────────────────
  const tsc2 = await step('tsc_verify', async () => {
    const r   = await nexusTerminalRun('npx tsc --noEmit 2>&1', proj.key, undefined, 60);
    const res = r.result as Record<string, unknown>;
    const out = [String(res['stdout'] ?? ''), String(res['stderr'] ?? '')].join('\n').trim();
    return { ok: !out.includes('error TS'), output: out };
  });

  const errorsRemaining = (tsc2.output.match(/error TS\d+/g) ?? []).length;
  const errorsFixed     = Math.max(0, errorCount - errorsRemaining);

  // ── Step 4: git commit if clean ───────────────────────────────────────────
  let committed = false;
  if (tsc2.ok) {
    const commit = await step('git_commit', async () => {
      const r = await nexusTerminalRun(
        `git add -A && git commit -m "fix: TypeScript errors auto-fixed by Nexus autonomous mode"`,
        proj.key, undefined, 30,
      );
      const res = r.result as Record<string, unknown>;
      return { ok: Boolean(res['ok']), output: String(res['stdout'] ?? '') };
    });
    committed = commit.ok;
  }

  const success = errorsRemaining === 0;
  const summary = success
    ? `✅ ${errorsFixed} erreur(s) TS corrigée(s)${committed ? ' — commit créé' : ''}`
    : `⚠️ ${errorsFixed}/${errorCount} corrigée(s) — ${errorsRemaining} restante(s)`;

  console.log(`[NEXUS_AUTO] jobId=${jobId} project=${proj.key} ${summary} duration=${Date.now() - start}ms`);

  return {
    jobId, project: proj.key, steps, success, summary, committed,
    errorsFixed, errorsRemaining, durationMs: Date.now() - start,
  };
}

// ── Generic multi-step runner ─────────────────────────────────────────────────
// "nexus corrige les erreurs TypeScript dans backend"

export type AutonomousTask = 'fix_typescript';

export async function runAutonomousTask(
  task:    AutonomousTask,
  project: string,
): Promise<AutonomousResult> {
  switch (task) {
    case 'fix_typescript': return autonomousFixTypeScript(project);
    default: throw new Error(`Unknown autonomous task: "${task as string}"`);
  }
}
