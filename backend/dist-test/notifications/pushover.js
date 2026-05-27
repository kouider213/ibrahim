"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushover = sendPushover;
exports.notifyOwner = notifyOwner;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
const PUSHOVER_API = 'https://api.pushover.net/1/messages.json';
async function sendPushover(msg) {
    try {
        await axios_1.default.post(PUSHOVER_API, {
            token: env_js_1.env.PUSHOVER_APP_TOKEN,
            user: env_js_1.env.PUSHOVER_USER_KEY,
            title: msg.title,
            message: msg.message,
            priority: msg.priority ?? 0,
            sound: msg.sound,
            url: msg.url,
            url_title: msg.urlTitle,
            retry: msg.priority === 2 ? 60 : undefined,
            expire: msg.priority === 2 ? 600 : undefined,
        });
    }
    catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[pushover] Failed to send notification:', error);
    }
}
async function notifyOwner(title, message, urgent = false) {
    await sendPushover({ title, message, priority: urgent ? 1 : 0 });
}
//# sourceMappingURL=pushover.js.map