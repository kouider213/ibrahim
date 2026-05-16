// Backend Railway — même API que le bot Telegram
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://your-railway-app.up.railway.app';
const MOBILE_TOKEN = process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';

const authHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${MOBILE_TOKEN}`,
};

export interface ChatResponse {
  text:   string;
  status: 'done' | 'error';
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export async function sendMessage(
  message:      string,
  sessionId:    string,
  imageBase64?: string,
  userLocation?: UserLocation,
): Promise<ChatResponse> {
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method:  'POST',
    headers: authHeaders,
    body: JSON.stringify({
      message,
      sessionId,
      ...(imageBase64   ? { imageBase64, imageMime: 'image/jpeg' } : {}),
      ...(userLocation  ? { userLocation }                         : {}),
    }),
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
    headers: authHeaders,
    body: JSON.stringify({ displayName, mode, businessType, businessName, city }),
  });
  if (!res.ok) throw new Error(`Register error ${res.status}`);
  return res.json() as Promise<{ userId: string }>;
}
