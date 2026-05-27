export interface VehiclePricing {
    name: string;
    houariPrice: number;
    kouiderPrice: number;
    benefit: number;
}
export declare const VEHICLE_PRICING: VehiclePricing[];
export declare function getPricingForVehicle(vehicleName: string): VehiclePricing | undefined;
export declare function formatPricingTable(): string;
//# sourceMappingURL=pricing.d.ts.map