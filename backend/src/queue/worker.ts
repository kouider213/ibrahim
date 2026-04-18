import { Worker } from 'bullmq';
import { redis } from './queue.js';
import { QUEUES } from '../config/constants.js';
import { executeActionJob } from './jobs/execute-action.js';
import { synthesizeAndSend } from '../notifications/dispatcher.js';
import type { Job } from 'bullmq';

const workerOptions = {
  connection:  redis,
  concurrency: 3,
};

// Actions worker
const actionsWorker = new Worker(
  QUEUES.ACTIONS,
  async (job: Job) => {
    if (job.name === 'execute-action') {
      return executeActionJob(job);
    }
    return undefined;
  },
  workerOptions,
);

actionsWorker.on('completed', job => {
  console.log(`[worker] ✅ ${job.name} completed (${job.id})`);
});

actionsWorker.on('failed', (job, err) => {
  console.error(`[worker] ❌ ${job?.name} failed (${job?.id}):`, err.message);
});

// Voice worker
const voiceWorker = new Worker(
  QUEUES.VOICE,
  async (job: Job) => {
    if (job.name === 'synthesize') {
      const { text, sessionId } = job.data as { text: string; sessionId: string };
      await synthesizeAndSend(text, sessionId);
    }
  },
  { ...workerOptions, concurrency: 1 },
);

voiceWorker.on('failed', (job, err) => {
  console.error(`[voice-worker] ❌ ${job?.name} failed:`, err.message);
});

console.log('[workers] Actions + Voice workers started');

process.on('SIGTERM', async () => {
  await actionsWorker.close();
  await voiceWorker.close();
  process.exit(0);
});
