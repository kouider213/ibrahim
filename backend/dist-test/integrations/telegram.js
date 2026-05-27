"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.sendPhoto = sendPhoto;
exports.sendDocument = sendDocument;
exports.sendDocumentBuffer = sendDocumentBuffer;
exports.sendVideoBuffer = sendVideoBuffer;
exports.sendPhotoBuffer = sendPhotoBuffer;
exports.sendVoiceBuffer = sendVoiceBuffer;
exports.sendVideo = sendVideo;
exports.sendTyping = sendTyping;
exports.setWebhook = setWebhook;
exports.deleteWebhook = deleteWebhook;
exports.getFileUrl = getFileUrl;
exports.downloadFile = downloadFile;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const env_js_1 = require("../config/env.js");
function getToken() {
    return env_js_1.env.TELEGRAM_BOT_TOKEN ?? '';
}
function base() {
    return `https://api.telegram.org/bot${getToken()}`;
}
// ── Anti-duplication cache ────────────────────────────────────
// Blocks identical messages sent within DEDUP_TTL ms to the same chat
const _dedupeCache = new Map();
const DEDUP_TTL = 8_000; // 8 seconds
function _dedupeKey(chatId, text) {
    return `${chatId}:${text.slice(0, 120)}`;
}
function _isDuplicate(key) {
    const last = _dedupeCache.get(key);
    if (last && Date.now() - last < DEDUP_TTL)
        return true;
    _dedupeCache.set(key, Date.now());
    // Cleanup stale entries every 100 checks
    if (_dedupeCache.size > 200) {
        const now = Date.now();
        for (const [k, ts] of _dedupeCache) {
            if (now - ts > DEDUP_TTL * 10)
                _dedupeCache.delete(k);
        }
    }
    return false;
}
async function sendMessage(chatId, text) {
    const token = getToken();
    if (!token)
        throw new Error('TELEGRAM_SEND_FAILED: TELEGRAM_BOT_TOKEN not set');
    const key = _dedupeKey(chatId, text);
    if (_isDuplicate(key)) {
        // Dedup-blocked = already sent recently, not a failure
        console.warn(`[telegram] Duplicate blocked: ${key.slice(0, 60)}`);
        return;
    }
    try {
        await axios_1.default.post(`${base()}/sendMessage`, { chat_id: chatId, text, parse_mode: 'Markdown' });
        return;
    }
    catch {
        // Retry without markdown
    }
    try {
        await axios_1.default.post(`${base()}/sendMessage`, { chat_id: chatId, text });
    }
    catch (err2) {
        const reason = err2 instanceof Error ? err2.message : String(err2);
        throw new Error(`TELEGRAM_SEND_FAILED: ${reason}`);
    }
}
async function sendPhoto(chatId, photoUrl, caption) {
    if (!getToken())
        return;
    try {
        await axios_1.default.post(`${base()}/sendPhoto`, {
            chat_id: chatId,
            photo: photoUrl,
            caption: caption || undefined,
        });
    }
    catch (err) {
        console.error('[telegram] sendPhoto failed:', err instanceof Error ? err.message : String(err));
        await sendMessage(chatId, `📸 ${caption || ''}`);
    }
}
async function sendDocument(chatId, fileId, caption) {
    if (!getToken())
        return;
    try {
        await axios_1.default.post(`${base()}/sendDocument`, {
            chat_id: chatId,
            document: fileId,
            caption: caption || undefined,
        });
    }
    catch (err) {
        console.error('[telegram] sendDocument failed:', err instanceof Error ? err.message : String(err));
    }
}
async function sendDocumentBuffer(chatId, buffer, filename, caption) {
    if (!getToken())
        return;
    const form = new form_data_1.default();
    form.append('chat_id', String(chatId));
    form.append('document', buffer, { filename, contentType: 'application/pdf', knownLength: buffer.length });
    if (caption)
        form.append('caption', caption);
    try {
        await axios_1.default.post(`${base()}/sendDocument`, form, {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });
    }
    catch (err) {
        console.error('[telegram] sendDocumentBuffer failed:', err instanceof Error ? err.message : String(err));
    }
}
async function sendVideoBuffer(chatId, buffer, caption) {
    if (!getToken())
        return;
    const form = new form_data_1.default();
    form.append('chat_id', String(chatId));
    form.append('video', buffer, { filename: 'tiktok_video.mp4', contentType: 'video/mp4', knownLength: buffer.length });
    if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'Markdown');
    }
    form.append('supports_streaming', 'true');
    try {
        await axios_1.default.post(`${base()}/sendVideo`, form, {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 120_000,
        });
    }
    catch (err) {
        console.error('[telegram] sendVideoBuffer failed:', err instanceof Error ? err.message : String(err));
        throw err;
    }
}
async function sendPhotoBuffer(chatId, buffer, caption) {
    if (!getToken())
        return;
    const form = new form_data_1.default();
    form.append('chat_id', String(chatId));
    form.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg', knownLength: buffer.length });
    if (caption) {
        form.append('caption', caption);
        form.append('parse_mode', 'Markdown');
    }
    try {
        await axios_1.default.post(`${base()}/sendPhoto`, form, {
            headers: { ...form.getHeaders() },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 30_000,
        });
    }
    catch (err) {
        console.error('[telegram] sendPhotoBuffer failed:', err instanceof Error ? err.message : String(err));
        throw err;
    }
}
async function sendVoiceBuffer(chatId, buffer, caption) {
    if (!getToken())
        return;
    const form = new form_data_1.default();
    form.append('chat_id', String(chatId));
    form.append('voice', buffer, { filename: 'voiceover.mp3', contentType: 'audio/mpeg', knownLength: buffer.length });
    if (caption)
        form.append('caption', caption);
    await axios_1.default.post(`${base()}/sendVoice`, form, {
        headers: { ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
    }).catch(err => {
        console.error('[telegram] sendVoiceBuffer failed:', err instanceof Error ? err.message : String(err));
    });
}
async function sendVideo(chatId, videoUrl, caption) {
    const token = getToken();
    if (!token) {
        console.error('[telegram] TELEGRAM_BOT_TOKEN not set — cannot send video');
        return;
    }
    try {
        await axios_1.default.post(`${base()}/sendVideo`, {
            chat_id: chatId,
            video: videoUrl,
            caption: caption || undefined,
            parse_mode: 'Markdown',
            supports_streaming: true,
        });
    }
    catch (err) {
        console.error('[telegram] sendVideo failed:', err instanceof Error ? err.message : String(err));
        // Fallback: envoyer juste l'URL en texte
        await sendMessage(chatId, `🎬 Vidéo: ${videoUrl}\n${caption || ''}`);
    }
}
async function sendTyping(chatId) {
    if (!getToken())
        return;
    await axios_1.default.post(`${base()}/sendChatAction`, {
        chat_id: chatId,
        action: 'typing',
    }).catch(() => { });
}
async function setWebhook(url, secretToken) {
    try {
        const { data } = await axios_1.default.post(`${base()}/setWebhook`, {
            url,
            allowed_updates: ['message'],
            drop_pending_updates: true,
            ...(secretToken ? { secret_token: secretToken } : {}),
        });
        return data.ok;
    }
    catch {
        return false;
    }
}
async function deleteWebhook() {
    await axios_1.default.post(`${base()}/deleteWebhook`).catch(() => { });
}
async function getFileUrl(fileId) {
    try {
        const { data } = await axios_1.default.get(`${base()}/getFile?file_id=${fileId}`);
        const path = data.result.file_path;
        return `https://api.telegram.org/file/bot${getToken()}/${path}`;
    }
    catch {
        return null;
    }
}
async function downloadFile(fileId) {
    const url = await getFileUrl(fileId);
    if (!url)
        return null;
    try {
        const { data } = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(data);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=telegram.js.map