"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeActionJob = executeActionJob;
const executor_js_1 = require("../../actions/executor.js");
async function executeActionJob(job) {
    console.log(`[job] Executing action: ${job.data.action} (task: ${job.data.taskId ?? 'none'})`);
    const result = await (0, executor_js_1.executeAction)({
        action: job.data.action,
        params: job.data.params,
        taskId: job.data.taskId,
        sessionId: job.data.sessionId,
    });
    if (!result.success) {
        throw new Error(result.error ?? 'Action failed');
    }
    return result.data;
}
//# sourceMappingURL=execute-action.js.map