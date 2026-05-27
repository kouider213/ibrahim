/**
 * WhatsApp Language Detector
 * Détecte: français, arabe (MSA + darija), anglais
 */
export type ClientLanguage = 'fr' | 'ar' | 'en';
export declare function detectLanguage(text: string): ClientLanguage;
export declare function getGreeting(lang: ClientLanguage, name?: string): string;
export declare function getAvailabilityMessage(lang: ClientLanguage): string;
export declare function getPriceMessage(lang: ClientLanguage, car: string, price: number): string;
export declare function getValidationPendingMessage(lang: ClientLanguage): string;
export declare function getConfirmationMessage(lang: ClientLanguage, details: {
    car: string;
    startDate: string;
    endDate: string;
    price: number;
    days: number;
}): string;
export declare function getReminderMessage(lang: ClientLanguage, details: {
    car: string;
    startDate: string;
    clientName: string;
}): string;
export declare function getEndRentalMessage(lang: ClientLanguage, details: {
    car: string;
    clientName: string;
    endDate: string;
}): string;
export declare function getComplaintAckMessage(lang: ClientLanguage): string;
//# sourceMappingURL=language-detector.d.ts.map