export interface MonthlyImprovementReport {
    period: string;
    summary: {
        new_rules_learned: number;
        total_feedback_received: number;
        positive_feedback_rate: number;
        patterns_discovered: number;
    };
    learning_highlights: string[];
    preferences_calibrated: {
        response_style: string;
        tone: string;
        tiktok_favorites: string[];
    };
    performance_by_category: Record<string, {
        positive: number;
        negative: number;
        success_rate: number;
    }>;
    recommendations: string[];
}
export declare function generateMonthlyReport(year: number, month: number): Promise<MonthlyImprovementReport>;
export declare function getEvolutionReport(months?: number): Promise<{
    evolution: Array<{
        period: string;
        positive_rate: number;
        new_rules: number;
    }>;
    trends: {
        improving: boolean;
        avg_positive_rate: number;
    };
}>;
export declare function formatReportForKouider(report: MonthlyImprovementReport): string;
//# sourceMappingURL=improvement-report.d.ts.map