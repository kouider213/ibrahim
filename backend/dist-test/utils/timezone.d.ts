export declare const FALLBACK_TZ = "Europe/Brussels";
export declare function isValidTimezone(tz: string): boolean;
export declare function getUTCOffsetMs(tz: string, date?: Date): number;
export declare function getUTCOffsetMinutes(tz: string, date?: Date): number;
export declare function getUTCOffsetString(tz: string, date?: Date): string;
export declare function toLocalISO(date: Date, tz: string): string;
export declare function parseLocalHHMM(HHmm: string, tz: string): Date | null;
export interface ResolvedTimezone {
    timezone: string;
    source: 'explicit' | 'user_profile' | 'device' | 'fallback';
    valid: boolean;
}
export declare function resolveTimezone(explicit?: string | null, // from tool input
userProfile?: string | null, // from Redis session (X-Timezone header)
deviceTz?: string | null): ResolvedTimezone;
export interface TimezoneConversion {
    timezone: string;
    utc_offset: string;
    local_iso: string;
    utc_iso: string;
    is_dst: boolean;
}
export declare function getTimezoneConversion(tz: string, date?: Date): TimezoneConversion;
export declare function getServerTimezone(): string;
//# sourceMappingURL=timezone.d.ts.map