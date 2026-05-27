export interface ClientScore {
    client_name: string;
    client_phone?: string;
    bookings_count: number;
    total_spent: number;
    last_booking: string;
    score: 'VIP' | 'FREQUENT' | 'REGULAR' | 'NEW';
}
export interface RevenueSummary {
    today_revenue: number;
    week_revenue: number;
    month_revenue: number;
    kouider_profit_month: number;
    houari_revenue_month: number;
    missing_owner_price: number;
    avg_booking_value: number;
    total_bookings_month: number;
    rejected_count: number;
    rejected_revenue_lost: number;
    top_clients: ClientScore[];
    generated_at: string;
}
export declare function getRevenueSummary(): Promise<RevenueSummary>;
//# sourceMappingURL=revenue-intelligence.d.ts.map