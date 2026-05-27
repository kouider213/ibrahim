"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDispatcher = initDispatcher;
exports.cleanTextForTTS = cleanTextForTTS;
exports.synthesizeVoice = synthesizeVoice;
exports.synthesizeVoiceStream = synthesizeVoiceStream;
exports.synthesizeAndSend = synthesizeAndSend;
exports.dispatch = dispatch;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
const supabase_js_1 = require("../integrations/supabase.js");
const constants_js_1 = require("../config/constants.js");
let _io = null;
function initDispatcher(io) {
    _io = io;
}
// ── Nettoyage texte pour TTS ─────────────────────────────────
function cleanTextForTTS(text) {
    return text
        // Supprimer les emojis
        .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F9FF}]/gu, '')
        // Supprimer le markdown gras/italique
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
        // Supprimer les titres markdown
        .replace(/^#{1,6}\s+/gm, '')
        // Supprimer les liens markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Supprimer les bullets markdown
        .replace(/^[-*•]\s+/gm, '')
        // Supprimer les blocs de code
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Nettoyer les espaces multiples
        .replace(/\s{2,}/g, ' ')
        .trim();
}
// ── ElevenLabs TTS ────────────────────────────────────────────
const EL_VOICE_SETTINGS = {
    stability: 0.5,
    similarity_boost: 0.8,
    style: 0.2,
    use_speaker_boost: true,
};
async function synthesizeVoice(text) {
    try {
        const response = await axios_1.default.post(`https://api.elevenlabs.io/v1/text-to-speech/${env_js_1.env.ELEVENLABS_VOICE_ID}`, { text: cleanTextForTTS(text), model_id: 'eleven_turbo_v2_5', voice_settings: EL_VOICE_SETTINGS }, {
            headers: { 'xi-api-key': env_js_1.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            responseType: 'arraybuffer',
            timeout: 12_000,
        });
        return Buffer.from(response.data);
    }
    catch (err) {
        console.error('[elevenlabs] TTS failed:', err instanceof Error ? err.message : String(err));
        return null;
    }
}
// Streaming TTS — calls onChunk for each audio buffer chunk
async function synthesizeVoiceStream(text, onChunk) {
    try {
        const response = await axios_1.default.post(`https://api.elevenlabs.io/v1/text-to-speech/${env_js_1.env.ELEVENLABS_VOICE_ID}/stream`, {
            text: cleanTextForTTS(text),
            model_id: 'eleven_turbo_v2_5',
            voice_settings: EL_VOICE_SETTINGS,
            output_format: 'mp3_44100_128',
        }, {
            headers: { 'xi-api-key': env_js_1.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            responseType: 'stream',
            timeout: 20_000,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = response.data;
        await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => onChunk(chunk));
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        return true;
    }
    catch (err) {
        console.error('[elevenlabs] streaming TTS failed:', err instanceof Error ? err.message : String(err));
        return false;
    }
}
async function synthesizeAndSend(text, sessionId) {
    const audioBuffer = await synthesizeVoice(text);
    if (audioBuffer) {
        const base64 = audioBuffer.toString('base64');
        _io?.emit(constants_js_1.SOCKET_EVENTS.AUDIO, { sessionId, audio: base64, mimeType: 'audio/mpeg' });
        await supabase_js_1.supabase.from('conversations').insert({
            session_id: sessionId,
            role: 'assistant',
            content: text,
            metadata: { has_audio: true },
        });
    }
    else {
        // Fallback: send text only, client uses iOS TTS
        _io?.emit(constants_js_1.SOCKET_EVENTS.RESPONSE, { sessionId, text, fallback: true });
    }
}
// ── General dispatcher ────────────────────────────────────────
async function dispatch(channel, title, message, payload = {}) {
    const { error } = await supabase_js_1.supabase.from('notifications').insert({
        type: payload['type'] ?? 'general',
        channel,
        title,
        message,
        payload,
        status: 'pending',
    });
    if (error)
        console.error('[dispatcher] Failed to insert notification:', error.message);
    if (channel === 'socket') {
        _io?.emit(constants_js_1.SOCKET_EVENTS.RESPONSE, { title, message, ...payload });
    }
}
//# sourceMappingURL=dispatcher.js.map