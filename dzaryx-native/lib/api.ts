export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

export interface ChatResponse {
  text:   string;
  status: 'done' | 'error';
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function sendMessage(
  message:       string,
  sessionId:     string,
  imageBase64?:  string,
  userLocation?: UserLocation,
  mobileToken?:  string,
): Promise<ChatResponse> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method:  'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      message,
      sessionId,
      ...(imageBase64  ? { imageBase64, imageMime: 'image/jpeg' } : {}),
      ...(userLocation ? { userLocation }                         : {}),
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
  mobileToken?: string,
): Promise<{ userId: string }> {
  const token = mobileToken ?? process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';
  const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method:  'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ displayName, mode, businessType, businessName, city }),
  });
  if (!res.ok) throw new Error(`Register error ${res.status}`);
  return res.json() as Promise<{ userId: string }>;
}
