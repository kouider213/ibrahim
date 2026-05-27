"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const queue_js_1 = require("./queue.js");
const constants_js_1 = require("../config/constants.js");
const execute_action_js_1 = require("./jobs/execute-action.js");
const dispatcher_js_1 = require("../notifications/dispatcher.js");
const workerOptions = {
    connection: queue_js_1.redis,
    concurrency: 3,
};
// Actions worker
const actionsWorker = new bullmq_1.Worker(constants_js_1.QUEUES.ACTIONS, async (job) => {
    if (job.name === 'execute-action') {
        return (0, execute_action_js_1.executeActionJob)(job);
    }
    return undefined;
}, workerOptions);
actionsWorker.on('completed', job => {
    console.log(`[worker] ✅ ${job.name} completed (${job.id})`);
});
actionsWorker.on('failed', (job, err) => {
    console.error(`[worker] ❌ ${job?.name} failed (${job?.id}):`, err.message);
});
// Voice worker
const voiceWorker = new bullmq_1.Worker(constants_js_1.QUEUES.VOICE, async (job) => {
    if (job.name === 'synthesize') {
        const { text, sessionId } = job.data;
        await (0, dispatcher_js_1.synthesizeAndSend)(text, sessionId);
    }
}, { ...workerOptions, concurrency: 1 });
voiceWorker.on('failed', (job, err) => {
    console.error(`[voice-worker] ❌ ${job?.name} failed:`, err.message);
});
console.log('[workers] Actions + Voice workers started');
process.on('SIGTERM', async () => {
    await actionsWorker.close();
    await voiceWorker.close();
    process.exit(0);
});
//# sourceMappingURL=worker.js.map