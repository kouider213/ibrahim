export interface DocumentAccessEvent {
    user_id: number;
    action: 'view' | 'store' | 'refused' | 'masked_preview';
    doc_type: string;
    client_name?: string;
    client_phone?: string;
    is_admin: boolean;
    masked: boolean;
    timestamp: string;
    ip?: string;
}
export declare function logDocumentAccess(ev: DocumentAccessEvent): Promise<void>;
//# sourceMappingURL=document-access-log.d.ts.map