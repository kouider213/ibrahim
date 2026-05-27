export declare function sendMessage(chatId: number | string, text: string): Promise<void>;
export declare function sendPhoto(chatId: number | string, photoUrl: string, caption?: string): Promise<void>;
export declare function sendDocument(chatId: number | string, fileId: string, caption?: string): Promise<void>;
export declare function sendDocumentBuffer(chatId: number | string, buffer: Buffer, filename: string, caption?: string): Promise<void>;
export declare function sendVideoBuffer(chatId: number | string, buffer: Buffer, caption?: string): Promise<void>;
export declare function sendPhotoBuffer(chatId: number | string, buffer: Buffer, caption?: string): Promise<void>;
export declare function sendVoiceBuffer(chatId: number | string, buffer: Buffer, caption?: string): Promise<void>;
export declare function sendVideo(chatId: number | string, videoUrl: string, caption?: string): Promise<void>;
export declare function sendTyping(chatId: number | string): Promise<void>;
export declare function setWebhook(url: string, secretToken?: string): Promise<boolean>;
export declare function deleteWebhook(): Promise<void>;
export interface TelegramMessage {
    message_id: number;
    from: {
        id: number;
        first_name: string;
        username?: string;
    };
    chat: {
        id: number;
        type: string;
    };
    text?: string;
    caption?: string;
    photo?: Array<{
        file_id: string;
        file_size?: number;
    }>;
    document?: {
        file_id: string;
        file_name?: string;
        mime_type?: string;
    };
    video?: {
        file_id: string;
        file_name?: string;
        mime_type?: string;
        duration?: number;
    };
}
export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}
export declare function getFileUrl(fileId: string): Promise<string | null>;
export declare function downloadFile(fileId: string): Promise<Buffer | null>;
//# sourceMappingURL=telegram.d.ts.map