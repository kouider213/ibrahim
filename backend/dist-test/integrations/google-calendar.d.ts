interface CalendarEvent {
    id?: string;
    summary: string;
    description?: string;
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
    colorId?: string;
}
export declare function listUpcomingEvents(maxResults?: number): Promise<CalendarEvent[]>;
export declare function createCalendarEvent(bookingId: string, clientName: string, carName: string, startDate: string, endDate: string, notes?: string): Promise<string | null>;
export declare function updateCalendarEvent(googleEventId: string, updates: Partial<{
    summary: string;
    startDate: string;
    endDate: string;
    description: string;
}>): Promise<boolean>;
export declare function deleteCalendarEvent(googleEventId: string): Promise<boolean>;
export declare function syncPendingBookings(): Promise<number>;
export declare function getAuthUrl(): string;
export declare function exchangeCodeForTokens(code: string): Promise<boolean>;
export {};
//# sourceMappingURL=google-calendar.d.ts.map