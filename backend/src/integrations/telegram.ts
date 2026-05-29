import axios from 'axios';
import { env } from '../config/env.js';

export async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return;
  await axios.post(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    { chat_id: chatId, text: text.slice(0, 4096), parse_mode: 'Markdown' },
    { timeout: 8_000 },
  );
}
