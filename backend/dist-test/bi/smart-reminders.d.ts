export interface SmartReminder {
    type: 'arrival_tomorrow' | 'missing_passport' | 'missing_deposit' | 'return_soon' | 'vehicle_prep' | 'age_alert';
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    client_name: string;
    car_name: string;
    date: string;
    message: string;
    action: string;
}
export declare function getSmartReminders(): Promise<SmartReminder[]>;
//# sourceMappingURL=smart-reminders.d.ts.map