"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyQueue = exports.voiceQueue = exports.actionsQueue = exports.redis = void 0;
exports.enqueueAction = enqueueAction;
exports.enqueueVoice = enqueueVoice;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_js_1 = require("../config/env.js");
const constants_js_1 = require("../config/constants.js");
exports.redis = new ioredis_1.default(env_js_1.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
exports.redis.on('error', err => console.error('[redis] Connection error:', err.message));
exports.redis.on('connect', () => console.log('[redis] Connected'));
const queueOptions = { connection: exports.redis };
exports.actionsQueue = new bullmq_1.Queue(constants_js_1.QUEUES.ACTIONS, queueOptions);
exports.voiceQueue = new bullmq_1.Queue(constants_js_1.QUEUES.VOICE, queueOptions);
exports.notifyQueue = new bullmq_1.Queue(constants_js_1.QUEUES.NOTIFY, queueOptions);
async function enqueueAction(job, priority = 5) {
    const added = await exports.actionsQueue.add('execute-action', job, {
        priority,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    });
    return added.id ?? '';
}
async function enqueueVoice(text, sessionId) {
    const added = await exports.voiceQueue.add('synthesize', { text, sessionId }, {
        priority: 1,
        attempts: 2,
        removeOnComplete: { count: 50 },
    });
    return added.id ?? '';
}
//# sourceMappingURL=queue.js.map