export interface PushoverMessage {
    title: string;
    message: string;
    priority?: -2 | -1 | 0 | 1 | 2;
    sound?: string;
    url?: string;
    urlTitle?: string;
}
export declare function sendPushover(msg: PushoverMessage): Promise<void>;
export declare function notifyOwner(title: string, message: string, urgent?: boolean): Promise<void>;
//# sourceMappingURL=pushover.d.ts.map