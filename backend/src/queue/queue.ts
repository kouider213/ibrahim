import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { QUEUES } from '../config/constants.js';

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
});

redis.on('error', err => console.error('[redis] Connection error:', err.message));
redis.on('connect', () => console.log('[redis] Connected'));

const queueOptions = { connection: redis };

export const actionsQueue  = new Queue(QUEUES.ACTIONS, queueOptions);
export const voiceQueue    = new Queue(QUEUES.VOICE,   queueOptions);
export const notifyQueue   = new Queue(QUEUES.NOTIFY,  queueOptions);

export interface ExecuteActionJob {
  action:    string;
  params:    Record<string, unknown>;
  taskId?:   string;
  sessionId: string;
}

export async function enqueueAction(job: ExecuteActionJob, priority = 5): Promise<string> {
  const added = await actionsQueue.add('execute-action', job, {
    priority,
    attempts:   3,
    backoff:    { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail:     { count: 50 },
  });
  return added.id ?? '';
}

export async function enqueueVoice(text: string, sessionId: string): Promise<string> {
  const added = await voiceQueue.add('synthesize', { text, sessionId }, {
    priority: 1,
    attempts: 2,
    removeOnComplete: { count: 50 },
  });
  return added.id ?? '';
}
