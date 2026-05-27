export interface FleetStat {
    car_id: string;
    car_name: string;
    base_price: number;
    resale_price: number;
    total_bookings_30d: number;
    revenue_30d: number;
    occupied_days_30d: number;
    occupancy_pct: number;
    last_booked: string | null;
    next_free_date: string | null;
    available_now: boolean;
}
export interface FleetIntelligence {
    stats: FleetStat[];
    total_cars: number;
    available_now_count: number;
    occupancy_avg_pct: number;
    most_profitable: string | null;
    idle_vehicles: string[];
    low_fleet_alert: boolean;
    generated_at: string;
}
export declare function getFleetIntelligence(): Promise<FleetIntelligence>;
//# sourceMappingURL=fleet-intelligence.d.ts.map