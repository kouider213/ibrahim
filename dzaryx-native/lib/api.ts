// Backend Railway — même API que le bot Telegram
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://your-railway-app.up.railway.app';

export interface ChatResponse {
  text:   string;
  status: 'done' | 'error';
}

export async function sendMessage(
  message:   string,
  sessionId: string,
): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<ChatResponse>;
}

export async function registerDevice(
  displayName:  string,
  mode:         string,
  businessType: string | null,
  businessName: string | null,
  city:         string | null,
): Promise<{ userId: string }> {
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, mode, businessType, businessName, city }),
  });
  if (!res.ok) throw new Error(`Register error ${res.status}`);
  return res.json() as Promise<{ userId: string }>;
}
