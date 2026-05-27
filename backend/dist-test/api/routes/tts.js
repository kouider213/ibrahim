"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dispatcher_js_1 = require("../../notifications/dispatcher.js");
const auth_js_1 = require("../middleware/auth.js");
const env_js_1 = require("../../config/env.js");
const router = (0, express_1.Router)();
// GET /api/tts/test — test ElevenLabs connectivity
router.get('/test', auth_js_1.requireMobileAuth, async (_req, res) => {
    try {
        const audio = await (0, dispatcher_js_1.synthesizeVoice)('Dzaryx est prêt.');
        if (!audio) {
            res.status(502).json({
                ok: false,
                error: 'ElevenLabs returned null — check ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID',
                voiceId: env_js_1.env.ELEVENLABS_VOICE_ID,
                keySet: !!env_js_1.env.ELEVENLABS_API_KEY,
            });
            return;
        }
        res.json({
            ok: true,
            bytes: audio.length,
            voiceId: env_js_1.env.ELEVENLABS_VOICE_ID,
            keySet: !!env_js_1.env.ELEVENLABS_API_KEY,
        });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
// POST /api/tts — synthesize text → base64 audio
router.post('/', auth_js_1.requireMobileAuth, async (req, res) => {
    const { text } = req.body;
    if (!text?.trim()) {
        res.status(400).json({ error: 'text required' });
        return;
    }
    try {
        const audio = await (0, dispatcher_js_1.synthesizeVoice)(text.slice(0, 500));
        if (!audio) {
            res.status(502).json({ error: 'ElevenLabs synthesis failed' });
            return;
        }
        res.json({ audio: audio.toString('base64'), bytes: audio.length, mimeType: 'audio/mpeg' });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=tts.js.map