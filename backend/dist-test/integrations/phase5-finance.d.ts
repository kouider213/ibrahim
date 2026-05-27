/**
 * PHASE 5 — Dzaryx gère tes finances
 * 1. Suivi encaissements & acomptes
 * 2. Calcul CA automatique (semaine/mois/année/véhicule)
 * 3. Relance clients impayés
 * 4. Génération reçu PDF simple
 * 5. Tableau de bord financier
 * 6. Alerte dépense anormale
 */
export declare function getPaymentStatus(bookingId?: string): Promise<string>;
export declare function recordPayment(bookingId: string, amount: number, type?: 'acompte' | 'solde' | 'partiel', note?: string): Promise<string>;
export declare function getCAReport(year: number, month?: number, week?: number): Promise<string>;
export declare function getUnpaidBookings(): Promise<string>;
export declare function generateRelanceMessage(clientName: string, amount: number, carName: string, attempt: 1 | 2): string;
export declare function generateReceipt(bookingId: string): Promise<string>;
export declare function getFinancialDashboard(): Promise<string>;
export declare function checkAnomalies(): Promise<string>;
export declare function generatePdfReceipt(bookingId: string): Promise<{
    url: string;
    text: string;
}>;
export interface DashboardData {
    month: number;
    year: number;
    ca: {
        current: number;
        previous: number;
        evolution: number;
    };
    payments: {
        collected: number;
        outstanding: number;
    };
    profit: number;
    forecast: {
        projected: number;
        nextMonth: number;
        dailyAvg: number;
    };
    unpaid: Array<{
        id: string;
        name: string;
        car: string;
        amount: number;
        phone?: string;
    }>;
    vehicles: Array<{
        name: string;
        ca: number;
        bookings: number;
    }>;
    bookingCount: number;
}
export declare function getDashboardData(): Promise<DashboardData>;
//# sourceMappingURL=phase5-finance.d.ts.map