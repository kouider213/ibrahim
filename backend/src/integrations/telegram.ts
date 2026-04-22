import axios from 'axios';

const TOKEN = process.env['TELEGRAM_BOT_TOKEN'] ?? '';
const BASE   = `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  await axios.post(`${BASE}/sendMessage`, {
    chat_id:    chatId,
    text,
    parse_mode: 'Markdown',
  }).catch(() => {
    return axios.post(`${BASE}/sendMessage`, { chat_id: chatId, text });
  });
}

export async function sendTyping(chatId: number | string): Promise<void> {
  await axios.post(`${BASE}/sendChatAction`, {
    chat_id: chatId,
    action:  'typing',
  }).catch(() => {});
}

export async function setWebhook(url: string): Promise<boolean> {
  try {
    const { data } = await axios.post(`${BASE}/setWebhook`, {
      url,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    return (data as { ok: boolean }).ok;
  } catch {
    return false;
  }
}

export async function deleteWebhook(): Promise<void> {
  await axios.post(`${BASE}/deleteWebhook`).catch(() => {});
}

export interface TelegramMessage {
  message_id: number;
  from: { id: number; first_name: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?:  TelegramMessage;
}

export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const { data } = await axios.get(`${BASE}/getFile?file_id=${fileId}`);
    const path = (data as { result: { file_path: string } }).result.file_path;
    return `https://api.telegram.org/file/bot${TOKEN}/${path}`;
  } catch {
    return null;
  }
}

export async function downloadFile(fileId: string): Promise<Buffer | null> {
  const url = await getFileUrl(fileId);
  if (!url) return null;
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(data as ArrayBuffer);
  } catch {
    return null;
  }
}
