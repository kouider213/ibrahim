/**
 * DOCUMENT READER — Dzaryx
 * Lit et extrait le texte depuis: PDF, Word (.docx), Excel (.xlsx), TXT, CSV, images OCR
 */
export type DocumentType = 'pdf' | 'docx' | 'xlsx' | 'txt' | 'csv' | 'image' | 'unknown';
export interface DocumentResult {
    type: DocumentType;
    filename: string;
    text: string;
    pages?: number;
    word_count: number;
    summary: string;
}
export declare function detectDocumentType(url: string, mime?: string): DocumentType;
export declare function readDocument(url: string): Promise<DocumentResult>;
//# sourceMappingURL=document-reader.d.ts.map