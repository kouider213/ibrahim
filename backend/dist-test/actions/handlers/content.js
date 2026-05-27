"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleContent = handleContent;
const claude_api_js_1 = require("../../integrations/claude-api.js");
const supabase_js_1 = require("../../integrations/supabase.js");
async function handleContent(payload) {
    switch (payload.action) {
        case 'generate_tiktok':
            return generateTiktok(payload.params);
        case 'generate_post':
            return generatePost(payload.params);
        default:
            return { success: false, error: 'Unknown content action', message: 'Action contenu inconnue' };
    }
}
async function generateTiktok(params) {
    const { topic, vehicle_name } = params;
    if (!topic)
        return { success: false, error: 'missing_topic', message: 'Sujet requis' };
    const script = await (0, claude_api_js_1.generateTikTokContent)(topic, vehicle_name);
    await supabase_js_1.supabase.from('tasks').insert({
        title: `TikTok: ${topic}`,
        action_type: 'generate_tiktok',
        payload: params,
        status: 'completed',
        result: { script },
        completed_at: new Date().toISOString(),
    });
    return { success: true, data: { script }, message: `✅ Script TikTok généré pour "${topic}".` };
}
async function generatePost(params) {
    const { platform, topic } = params;
    if (!topic)
        return { success: false, error: 'missing_topic', message: 'Sujet requis' };
    const { chat } = await Promise.resolve().then(() => __importStar(require('../../integrations/claude-api.js')));
    const res = await chat([{
            role: 'user',
            content: `Crée un post ${platform ?? 'Instagram'} pour Fik Conciergerie Oran.
Sujet: ${topic}
Style: luxe, professionnel, algérien moderne.
Inclus hashtags pertinents.`,
        }]);
    return { success: true, data: { post: res.text }, message: `✅ Post ${platform ?? 'Instagram'} généré.` };
}
//# sourceMappingURL=content.js.map