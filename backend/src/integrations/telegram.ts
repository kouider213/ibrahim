import axios from 'axios';

function getToken(): string {
  return process.env['TELEGRAM_BOT_TOKEN'] ?? '';
}

function base(): string {
  return `https://api.telegram.org/bot${getToken()}`;
}

export async function sendMessage(chatId: number | string, text: string): Promise<void> {
  const token = getToken();
  if (!token) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN not set — cannot send message');
    return;
  }
  try {
    await axios.post(`${base()}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'Markdown',
    });
  } catch {
    // Retry without markdown
    try {
      await axios.post(`${base()}/sendMessage`, { chat_id: chatId, text });
    } catch (err2) {
      console.error('[telegram] sendMessage failed:', err2 instanceof Error ? err2.message : String(err2));
    }
  }
}

export async function sendTyping(chatId: number | string): Promise<void> {
  if (!getToken()) return;
  await axios.post(`${base()}/sendChatAction`, {
    chat_id: chatId,
    action:  'typing',
  }).catch(() => {});
}

export async function setWebhook(url: string): Promise<boolean> {
  try {
    const { data } = await axios.post(`${base()}/setWebhook`, {
      url,
      allowed_updates:      ['message'],
      drop_pending_updates: true,
    });
    return (data as { ok: boolean }).ok;
  } catch {
    return false;
  }
}

export async function deleteWebhook(): Promise<void> {
  await axios.post(`${base()}/deleteWebhook`).catch(() => {});
}

export interface TelegramMessage {
  message_id: number;
  from:       { id: number; first_name: string; username?: string };
  chat:       { id: number; type: string };
  text?:      string;
  caption?:   string;
  photo?:     Array<{ file_id: string; file_size?: number }>;
  document?:  { file_id: string; file_name?: string; mime_type?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?:  TelegramMessage;
}

export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const { data } = await axios.get(`${base()}/getFile?file_id=${fileId}`);
    const path = (data as { result: { file_path: string } }).result.file_path;
    return `https://api.telegram.org/file/bot${getToken()}/${path}`;
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
