export interface ReminderRow {
    id: string;
    title: string | null;
    message: string;
    remind_at: string;
    timezone: string;
    utc_offset: string | null;
    local_time_iso: string | null;
    timezone_source: string | null;
    status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'DUPLICATE';
    sent_at: string | null;
    failed_reason: string | null;
    retry_count: number;
    created_by: string | null;
    session_id: string | null;
    telegram_target: string | null;
    pushover_target: boolean;
    dedup_key: string | null;
    provider_response: string | null;
    job_id: string | null;
    created_at: string;
}
export interface InsertReminderInput {
    message: string;
    remind_at: Date;
    timezone?: string;
    utc_offset?: string;
    local_time_iso?: string;
    timezone_source?: string;
    title?: string;
    created_by?: string;
    session_id?: string;
    telegram_target?: string;
    pushover_target?: boolean;
    dedup_key?: string;
    job_id?: string;
}
export declare function insertReminder(input: InsertReminderInput): Promise<ReminderRow | null>;
export declare function findByDedupKey(key: string): Promise<ReminderRow | null>;
export declare function getPendingDue(bufferSeconds?: number): Promise<ReminderRow[]>;
export declare function getRetryEligible(): Promise<ReminderRow[]>;
export declare function updateReminderStatus(id: string, status: 'SENT' | 'FAILED' | 'CANCELLED', opts?: {
    sent_at?: Date;
    failed_reason?: string;
    provider_response?: string;
    retry_count?: number;
}): Promise<void>;
export declare function resetToRetry(id: string, retryCount: number): Promise<void>;
export declare function listReminders(limit?: number): Promise<ReminderRow[]>;
//# sourceMappingURL=reminders.d.ts.map