import { type FleetIntelligence } from './fleet-intelligence.js';
import { type RevenueSummary } from './revenue-intelligence.js';
import { type SmartReminder } from './smart-reminders.js';
import { type TikTokIntelligence } from './tiktok-intelligence.js';
export interface BIReport {
    fleet: FleetIntelligence;
    revenue: RevenueSummary;
    reminders: SmartReminder[];
    tiktok: TikTokIntelligence;
    generated_at: string;
    runtime_ms: number;
}
export declare function runBIEngine(forceTelegram?: boolean): Promise<BIReport>;
//# sourceMappingURL=bi-engine.d.ts.map