import axios from 'axios';
import { env } from '../config/env.js';

export interface PushoverMessage {
  title:    string;
  message:  string;
  priority?: -2 | -1 | 0 | 1 | 2;
  sound?:   string;
  url?:     string;
  urlTitle?: string;
}

const PUSHOVER_API = 'https://api.pushover.net/1/messages.json';

export async function sendPushover(msg: PushoverMessage): Promise<void> {
  try {
    await axios.post(PUSHOVER_API, {
      token:     env.PUSHOVER_APP_TOKEN,
      user:      env.PUSHOVER_USER_KEY,
      title:     msg.title,
      message:   msg.message,
      priority:  msg.priority ?? 0,
      sound:     msg.sound,
      url:       msg.url,
      url_title: msg.urlTitle,
      retry:     msg.priority === 2 ? 60  : undefined,
      expire:    msg.priority === 2 ? 600 : undefined,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[pushover] Failed to send notification:', error);
  }
}

export async function notifyOwner(title: string, message: string, urgent = false): Promise<void> {
  await sendPushover({ title, message, priority: urgent ? 1 : 0 });
}
