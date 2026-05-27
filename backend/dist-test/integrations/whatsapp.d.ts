export type Lang = 'ar' | 'fr' | 'en';
export declare function detectLanguage(text: string): Lang;
export declare function getClientSystemPrompt(lang: Lang): string;
export declare function isBookingRequest(text: string): boolean;
export declare function isComplaint(text: string): boolean;
export declare function sendWhatsApp(to: string, body: string): Promise<boolean>;
export declare function sendBookingConfirmation(phone: string, clientName: string, carName: string, startDate: string, endDate: string, totalPrice: number, lang?: Lang): Promise<boolean>;
export declare function send24hReminder(phone: string, clientName: string, carName: string, startDate: string, lang?: Lang): Promise<boolean>;
export declare function sendReturnReminder(phone: string, clientName: string, carName: string, endDate: string, lang?: Lang): Promise<boolean>;
//# sourceMappingURL=whatsapp.d.ts.map