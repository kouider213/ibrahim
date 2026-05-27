"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Workflow routes — autonomous pipeline TEST 9 + Nexus proof TEST 10.
 *
 * POST /api/workflow/test9         — start pipeline (async, returns jobId + 202)
 * GET  /api/workflow/result/:jobId — poll for result (returns 200 when done, 202 while running)
 * GET  /api/workflow/status        — quick status check
 * POST /api/workflow/nexus-proof   — async Nexus real-execution proof (returns jobId + 202)
 * GET  /api/workflow/nexus-result/:jobId — poll nexus-proof result
 *
 * Pipeline runs in background to avoid Railway's 60s HTTP timeout.
 */
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const autonomous_pipeline_js_1 = require("../../workflow/autonomous-pipeline.js");
const nexus_relay_js_1 = require("../../actions/handlers/nexus-relay.js");
const router = (0, express_1.Router)();
const JOBS = new Map();
// ── POST /api/workflow/test9 ──────────────────────────────────────────────────
router.post('/test9', auth_js_1.requireMobileAuth, (_req, res) => {
    const requestId = `pipeline_${Date.now()}`;
    console.log(`[workflow] ${requestId} — starting background pipeline (nexus=${(0, nexus_relay_js_1.isNexusOnline)()})`);
    const job = { requestId, status: 'running', startedAt: Date.now() };
    JOBS.set(requestId, job);
    // Fire-and-forget — result arrives via Telegram + GET /result/:jobId
    (0, autonomous_pipeline_js_1.runAutonomousPipeline)(requestId)
        .then(report => {
        job.status = 'done';
        job.report = report;
        console.log(`[workflow] ${requestId} DONE — decision=${report.decision} totalMs=${report.totalMs}`);
    })
        .catch(err => {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
        console.error(`[workflow] ${requestId} CRASHED: ${job.error}`);
    });
    res.status(202).json({
        ok: true,
        requestId,
        status: 'running',
        poll_url: `/api/workflow/result/${requestId}`,
        note: 'Pipeline started. Poll poll_url every 10s or wait for Telegram report.',
        nexus_online: (0, nexus_relay_js_1.isNexusOnline)(),
    });
});
// ── GET /api/workflow/result/:jobId ───────────────────────────────────────────
router.get('/result/:jobId', auth_js_1.requireMobileAuth, (req, res) => {
    const job = JOBS.get(req.params['jobId']);
    if (!job) {
        res.status(404).json({ ok: false, error: 'Job not found' });
        return;
    }
    if (job.status === 'running') {
        res.status(202).json({
            ok: true,
            requestId: job.requestId,
            status: 'running',
            elapsed_ms: Date.now() - job.startedAt,
            message: 'Pipeline still running — retry in 10s',
        });
        return;
    }
    if (job.status === 'error') {
        res.status(500).json({ ok: false, requestId: job.requestId, status: 'error', error: job.error });
        return;
    }
    const r = job.report;
    res.json({
        ok: true,
        requestId: r.requestId,
        status: 'done',
        decision: r.decision,
        commit_sha: r.commitSha ?? null,
        rollback_reason: r.rollbackReason ?? null,
        total_ms: r.totalMs,
        total_cost_usd: r.totalCostUsd,
        nexus_online: r.nexusOnline,
        telegram_sent: r.telegramSent,
        started_at: r.startedAt,
        completed_at: r.completedAt,
        steps: r.steps.map(s => ({
            step: s.step,
            status: s.status,
            agent_id: s.agentId ?? null,
            provider: s.provider ?? null,
            model: s.model ?? null,
            latency_ms: s.latencyMs,
            input_tokens: s.inputTokens ?? 0,
            output_tokens: s.outputTokens ?? 0,
            cost_usd: s.costUsd ?? 0,
            output: s.output.slice(0, 800),
            details: s.details ?? null,
        })),
    });
});
// ── GET /api/workflow/status ──────────────────────────────────────────────────
router.get('/status', auth_js_1.requireMobileAuth, (_req, res) => {
    const running = [...JOBS.values()].filter(j => j.status === 'running').length;
    res.json({
        nexus_online: (0, nexus_relay_js_1.isNexusOnline)(),
        buggy_file: 'backend/src/test/buggy_rental_calc.ts',
        active_jobs: running,
        pipeline_endpoint: 'POST /api/workflow/test9',
        note: 'Pipeline runs async. Poll GET /api/workflow/result/:jobId every 10s.',
    });
});
const NEXUS_JOBS = new Map();
async function runNexusProof(jobId) {
    const job = NEXUS_JOBS.get(jobId);
    const steps = [];
    async function step(name, fn) {
        const t0 = Date.now();
        try {
            const r = await fn();
            steps.push({ name, ...r, latency_ms: Date.now() - t0 });
        }
        catch (e) {
            steps.push({ name, ok: false, stderr: String(e), latency_ms: Date.now() - t0 });
        }
    }
    const repoDir = String.raw `C:\Users\douba\OneDrive\Bureau\ibrahim\ibrahim`;
    const backendDir = `${repoDir}\\backend`;
    const desktopFile = String.raw `C:\Users\douba\Desktop\nexus_test.txt`;
    // Step 1 — sysinfo (Python path, OS, hostname, PID — from Nexus process itself)
    let sysinfoData = {};
    await step('sysinfo (Python + OS)', async () => {
        const r = await (0, nexus_relay_js_1.nexusSysinfo)(10_000);
        if (r.ok)
            sysinfoData = r;
        return {
            ok: r.ok,
            detail: r.ok
                ? `Python: ${r.python_executable} (${r.python_version}) | host: ${r.hostname} | OS: ${r.os} | PID: ${r.pid}`
                : 'sysinfo failed',
        };
    });
    // Step 2 — pwd (real working directory of Nexus)
    await step('pwd', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('cd', undefined, 10_000);
        return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, cmd_job_id: r.jobId };
    });
    // Step 3 — git status
    await step('git status', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('git status', repoDir, 15_000);
        return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, cmd_job_id: r.jobId };
    });
    // Step 4 — node -v
    await step('node -v', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('node -v', undefined, 10_000);
        return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, cmd_job_id: r.jobId };
    });
    // Step 5 — Python version via Windows Launcher (py.exe — bypasses MS Store alias)
    await step('py --version (Windows Launcher)', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('py --version', undefined, 10_000);
        if (r.ok)
            return { ok: true, exit_code: 0, stdout: r.stdout, cmd_job_id: r.jobId };
        // fallback: try python3
        const r2 = await (0, nexus_relay_js_1.nexusRunCommand)('python3 --version', undefined, 10_000);
        return { ok: r2.ok, exit_code: r2.exit_code, stdout: r2.stdout || r2.stderr, stderr: r2.stderr, cmd_job_id: r2.jobId };
    });
    // Step 6 — create real file on Desktop
    await step('create nexus_test.txt', async () => {
        const content = [
            'NEXUS REAL EXECUTION PROOF',
            `Timestamp : ${new Date().toISOString()}`,
            `JobId     : ${jobId}`,
            `Python    : ${sysinfoData['python_executable'] ?? 'unknown'}`,
            `Hostname  : ${sysinfoData['hostname'] ?? 'unknown'}`,
            'Generated by Dzaryx AI — hardening TEST 10',
        ].join('\n') + '\n';
        const r = await (0, nexus_relay_js_1.nexusWriteFile)(desktopFile, content, 15_000);
        return { ok: r.ok, detail: r.ok ? `Written ${r.size} chars → ${r.path}` : r.error };
    });
    // Step 7 — verify file on disk
    await step('verify file on disk', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)(`powershell -Command "Get-Item '${desktopFile}' | Select-Object FullName,Length,LastWriteTime | ConvertTo-Json"`, undefined, 10_000);
        return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, cmd_job_id: r.jobId };
    });
    // Step 8 — screenshot → Telegram (full PNG, no stdout truncation)
    await step('screenshot → Telegram', async () => {
        const r = await (0, nexus_relay_js_1.nexusScreenshot)(`📸 NEXUS Proof — ${new Date().toLocaleString('fr-FR')} — jobId: ${jobId}`, 30_000);
        return {
            ok: r.ok,
            detail: r.ok
                ? `PNG ${(r.size_bytes ?? 0) >= 1024 ? Math.round((r.size_bytes ?? 0) / 1024) + ' KB' : (r.size_bytes ?? 0) + ' bytes'} → Telegram ✅`
                : r.error,
        };
    });
    // Step 9 — npx tsc --noEmit (real compiler on real codebase)
    await step('npx tsc --noEmit', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)('npx tsc --noEmit --skipLibCheck', backendDir, 90_000);
        return {
            ok: r.ok,
            exit_code: r.exit_code,
            stdout: r.stdout.slice(0, 3000),
            stderr: r.stderr.slice(0, 500),
            cmd_job_id: r.jobId,
        };
    });
    // Step 10 — delete test file
    await step('delete nexus_test.txt', async () => {
        const r = await (0, nexus_relay_js_1.nexusRunCommand)(`del "${desktopFile}"`, undefined, 10_000);
        return { ok: r.ok, exit_code: r.exit_code, stdout: r.stdout, stderr: r.stderr, cmd_job_id: r.jobId };
    });
    const nexusStatus = (0, nexus_relay_js_1.getNexusStatus)();
    job.status = 'done';
    job.steps = steps;
    job.sysinfo = sysinfoData;
    job.hostname = sysinfoData['hostname'] ?? nexusStatus.telemetry.lastHostname ?? 'unknown';
    job.nexus_status = nexusStatus;
}
// ── POST /api/workflow/nexus-proof ───────────────────────────────────────────
router.post('/nexus-proof', auth_js_1.requireMobileAuth, (_req, res) => {
    const nexusStatus = (0, nexus_relay_js_1.getNexusStatus)();
    if (!nexusStatus.online) {
        res.status(503).json({
            ok: false,
            error: 'Nexus offline — cannot run real PC execution proof',
            nexus_state: {
                online: nexusStatus.online,
                last_connected_at: nexusStatus.telemetry.lastConnectedAt,
                last_disconnected_at: nexusStatus.telemetry.lastDisconnectedAt,
                last_disconnect_reason: nexusStatus.telemetry.lastDisconnectReason,
                total_connections: nexusStatus.telemetry.totalConnections,
                total_disconnections: nexusStatus.telemetry.totalDisconnections,
                last_socket_id: nexusStatus.telemetry.lastSocketId,
                last_hostname: nexusStatus.telemetry.lastHostname,
                public_ip: nexusStatus.publicIp,
                mac: nexusStatus.mac,
                fix: 'Ensure Nexus PC agent is running (nexus_main.py) and PC_AGENT_TOKEN matches',
            },
        });
        return;
    }
    const jobId = `nexus_proof_${Date.now()}`;
    const job = { jobId, status: 'running', startedAt: Date.now() };
    NEXUS_JOBS.set(jobId, job);
    runNexusProof(jobId)
        .catch(err => {
        job.status = 'error';
        job.error = err instanceof Error ? err.message : String(err);
    });
    res.status(202).json({
        ok: true,
        jobId,
        status: 'running',
        poll_url: `/api/workflow/nexus-result/${jobId}`,
        nexus_online: true,
        socket_id: nexusStatus.socketId,
        public_ip: nexusStatus.publicIp,
        hostname: nexusStatus.telemetry.lastHostname,
        note: 'Proof running. Poll poll_url every 5s — takes ~45-90s total.',
    });
});
// ── GET /api/workflow/nexus-result/:jobId ────────────────────────────────────
router.get('/nexus-result/:jobId', auth_js_1.requireMobileAuth, (req, res) => {
    const job = NEXUS_JOBS.get(req.params['jobId']);
    if (!job) {
        res.status(404).json({ ok: false, error: 'Nexus proof job not found' });
        return;
    }
    if (job.status === 'running') {
        res.status(202).json({
            ok: true,
            jobId: job.jobId,
            status: 'running',
            elapsed_ms: Date.now() - job.startedAt,
        });
        return;
    }
    if (job.status === 'error') {
        res.status(500).json({ ok: false, jobId: job.jobId, status: 'error', error: job.error });
        return;
    }
    res.json({
        ok: true,
        jobId: job.jobId,
        status: 'done',
        hostname: job.hostname,
        total_ms: Date.now() - job.startedAt,
        nexus_status: job.nexus_status,
        sysinfo: job.sysinfo ?? null,
        steps: job.steps ?? [],
    });
});
exports.default = router;
//# sourceMappingURL=workflow.js.map