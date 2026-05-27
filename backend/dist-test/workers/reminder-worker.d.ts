import { type ReminderRow } from '../db/reminders.js';
export declare function initReminderWorker(): void;
export declare function stopReminderWorker(): void;
export declare function triggerScanNow(): Promise<{
    processed: number;
    rows: ReminderRow[];
}>;
//# sourceMappingURL=reminder-worker.d.ts.map