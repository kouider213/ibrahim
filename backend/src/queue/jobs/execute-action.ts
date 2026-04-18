import type { Job } from 'bullmq';
import { executeAction } from '../../actions/executor.js';
import type { ExecuteActionJob } from '../queue.js';

export async function executeActionJob(job: Job<ExecuteActionJob>): Promise<unknown> {
  console.log(`[job] Executing action: ${job.data.action} (task: ${job.data.taskId ?? 'none'})`);

  const result = await executeAction({
    action:    job.data.action,
    params:    job.data.params,
    taskId:    job.data.taskId,
    sessionId: job.data.sessionId,
  });

  if (!result.success) {
    throw new Error(result.error ?? 'Action failed');
  }

  return result.data;
}
