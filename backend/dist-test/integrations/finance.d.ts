export interface FinancialBooking {
    id: string;
    client_name: string;
    car_name: string;
    start_date: string;
    end_date: string;
    nb_days: number;
    final_price: number | null;
    client_price_per_day: number | null;
    owner_price_per_day: number | null;
    owner_total: number | null;
    rented_by: string;
    status: string;
    payment_status: string;
    paid_amount: number;
    kouider_profit: number | null;
    discount_applied: number;
    price_source: 'explicit' | 'computed' | 'missing';
    data_complete: boolean;
}
export interface FinancialReport {
    period: string;
    totalBookings: number;
    kouiderBookings: number;
    houariBookings: number;
    grossCA: number;
    ownerTotal: number;
    kouiderProfit: number;
    encaisse: number;
    aEncaisser: number;
    missingOwnerPrice: number;
    missingClientPrice: number;
    bookings: FinancialBooking[];
}
export declare function seedPricingTable(): Promise<void>;
export declare function computeBookingFinancials(b: {
    final_price: number | null;
    client_price_per_day: number | null;
    owner_price_per_day: number | null;
    start_date: string;
    end_date: string;
    nb_days?: number | null;
    paid_amount?: number | null;
    rented_by?: string | null;
    discount_applied?: number | null;
}): {
    nb_days: number;
    client_price_per_day: number | null;
    owner_price_per_day: number | null;
    final_price: number | null;
    owner_total: number | null;
    kouider_profit: number | null;
    paid_amount: number;
    discount_applied: number;
    price_source: 'explicit' | 'computed' | 'missing';
    data_complete: boolean;
};
export declare function getFinancialReport(year: number, month?: number): Promise<FinancialReport>;
export declare function formatFinancialReport(report: FinancialReport): string;
//# sourceMappingURL=finance.d.ts.map