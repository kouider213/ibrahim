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
export interface AuditToolCall {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_result: string;
    duration_ms: number;
    blocked: boolean;
    commit_sha?: string;
}
export interface AuditPatch {
    file_path: string;
    old_string: string;
    new_string: string;
    commit_sha: string;
    commit_msg: string;
    applied_at: string;
}
export interface CodeAuditResult {
    request_id: string;
    agent_id: 'code_audit';
    provider: 'claude';
    model: string;
    system_prompt: string;
    tools_allowed: string[];
    test_file_path: string;
    bug_description: string;
    before_content: string;
    before_commit_sha: string;
    after_content: string | null;
    tools_called: AuditToolCall[];
    tool_count: number;
    patches_applied: AuditPatch[];
    analysis: string;
    input_tokens: number;
    output_tokens: number;
    total_ms: number;
    bug_found: boolean;
    bug_fixed: boolean;
    fix_verified: boolean;
    verdict: 'VERIFIED' | 'PARTIAL' | 'FAKE';
    verdict_reason: string;
    error?: string;
}
export declare function runCodeAudit(requestId: string, timeoutMs?: number): Promise<CodeAuditResult>;
//# sourceMappingURL=code-audit-runner.d.ts.map