"use strict";
/**
 * DOCUMENT READER — Dzaryx
 * Lit et extrait le texte depuis: PDF, Word (.docx), Excel (.xlsx), TXT, CSV, images OCR
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectDocumentType = detectDocumentType;
exports.readDocument = readDocument;
const axios_1 = __importDefault(require("axios"));
// ─── Détecter le type de document ────────────────────────────────────────────
function detectDocumentType(url, mime) {
    const lower = url.toLowerCase().split('?')[0];
    if (lower.endsWith('.pdf') || mime === 'application/pdf')
        return 'pdf';
    if (lower.endsWith('.docx') || lower.endsWith('.doc') || mime?.includes('word'))
        return 'docx';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mime?.includes('spreadsheet') || mime?.includes('excel'))
        return 'xlsx';
    if (lower.endsWith('.txt') || mime === 'text/plain')
        return 'txt';
    if (lower.endsWith('.csv') || mime === 'text/csv')
        return 'csv';
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].some(ext => lower.endsWith(ext)) || mime?.startsWith('image/'))
        return 'image';
    return 'unknown';
}
// ─── Extraire le texte via Jina AI (supporte PDF, Word, etc.) ────────────────
async function extractViaJina(url) {
    const encoded = encodeURIComponent(url);
    const { data } = await axios_1.default.get(`https://r.jina.ai/${encoded}`, {
        headers: { 'Accept': 'text/plain', 'X-Retain-Images': 'none' },
        timeout: 30_000,
    });
    return typeof data === 'string' ? data.slice(0, 8000) : JSON.stringify(data).slice(0, 8000);
}
// ─── Lire un fichier texte brut ───────────────────────────────────────────────
async function readPlainText(url) {
    const { data } = await axios_1.default.get(url, { responseType: 'text', timeout: 15_000 });
    return String(data).slice(0, 8000);
}
// ─── OCR pour images (via Llama Vision OCR de Jina) ──────────────────────────
async function ocrImage(url) {
    // Utilise Jina AI reader sur l'image — retourne le texte détecté
    try {
        const encoded = encodeURIComponent(url);
        const { data } = await axios_1.default.get(`https://r.jina.ai/${encoded}`, {
            headers: { 'Accept': 'text/plain' },
            timeout: 30_000,
        });
        return typeof data === 'string' ? data.slice(0, 4000) : 'Aucun texte détecté.';
    }
    catch {
        return 'Impossible d\'extraire le texte de cette image.';
    }
}
// ─── Parser CSV basique ───────────────────────────────────────────────────────
function parseCSV(raw) {
    const lines = raw.split('\n').slice(0, 50); // max 50 lignes
    const rows = lines.map(l => l.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')).join(' | '));
    return rows.join('\n');
}
// ─── Générer un résumé court ──────────────────────────────────────────────────
function generateSummary(text, type) {
    const words = text.trim().split(/\s+/).length;
    const firstParagraph = text.trim().split('\n\n')[0]?.slice(0, 200) ?? text.slice(0, 200);
    const typeLabel = {
        pdf: 'PDF',
        docx: 'Document Word',
        xlsx: 'Feuille Excel',
        txt: 'Fichier texte',
        csv: 'Fichier CSV',
        image: 'Image (OCR)',
        unknown: 'Document',
    };
    return `${typeLabel[type]} — ~${words} mots. Début: "${firstParagraph.replace(/\n/g, ' ').trim()}"`;
}
// ─── Fonction principale ──────────────────────────────────────────────────────
async function readDocument(url) {
    if (!url)
        throw new Error('URL du document requise');
    // Normaliser l'URL
    url = url.trim();
    if (!url.startsWith('http'))
        throw new Error('L\'URL doit commencer par http:// ou https://');
    // Détecter le type
    const type = detectDocumentType(url);
    const filename = url.split('/').pop()?.split('?')[0] ?? 'document';
    let text = '';
    switch (type) {
        case 'txt':
            text = await readPlainText(url);
            break;
        case 'csv': {
            const raw = await readPlainText(url);
            text = parseCSV(raw);
            break;
        }
        case 'image':
            text = await ocrImage(url);
            break;
        case 'pdf':
        case 'docx':
        case 'xlsx':
        case 'unknown':
        default:
            // Jina AI gère PDF, Word, Excel, et formats inconnus
            text = await extractViaJina(url);
            break;
    }
    if (!text.trim()) {
        text = 'Impossible d\'extraire du texte depuis ce document.';
    }
    const wordCount = text.trim().split(/\s+/).length;
    const summary = generateSummary(text, type);
    // Estimer le nombre de pages (approximatif pour PDF)
    const pages = type === 'pdf'
        ? Math.max(1, Math.ceil(wordCount / 250))
        : undefined;
    return { type, filename, text, pages, word_count: wordCount, summary };
}
//# sourceMappingURL=document-reader.js.map