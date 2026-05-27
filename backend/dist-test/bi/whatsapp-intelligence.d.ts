import type { Lang } from '../integrations/whatsapp.js';
export interface ExtractedClientInfo {
    name?: string;
    phone?: string;
    requested_start?: string;
    requested_end?: string;
    duration_days?: number;
    budget_dzd?: number;
    vehicle_pref?: string;
    age?: number;
    lang: Lang;
    is_booking_req: boolean;
    is_complaint: boolean;
}
export interface WhatsAppIntelligence {
    auto_response?: string;
    extracted_info?: ExtractedClientInfo;
    age_declined: boolean;
    decline_message?: string;
    conversation_type: 'booking' | 'complaint' | 'info' | 'unknown';
    generated_at: string;
}
export declare function shouldDeclineAge(age: number | undefined): boolean;
export declare function getDeclineMessage(lang?: Lang): string;
export declare function extractClientInfo(text: string): Promise<ExtractedClientInfo>;
export declare function generateAutoResponse(booking: {
    client_name: string;
    car_name: string;
    start_date: string;
    end_date: string;
    final_price: number;
    lang?: Lang;
}): Promise<string>;
export declare function analyzeWhatsAppMessage(text: string, clientAge?: number): Promise<WhatsAppIntelligence>;
//# sourceMappingURL=whatsapp-intelligence.d.ts.map