import { env } from '../config/env.js';

let _app: import('firebase-admin/app').App | null = null;

function getApp(): import('firebase-admin/app').App | null {
  if (_app) return _app;
  const saJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app') as typeof import('firebase-admin/app');
    if (getApps().length > 0) {
      _app = getApps()[0]!;
      return _app;
    }
    const creds = JSON.parse(saJson) as object;
    _app = initializeApp({ credential: cert(creds as Parameters<typeof cert>[0]) }, 'dzaryx');
    console.log('[fcm] Firebase app initialized');
    return _app;
  } catch (err) {
    console.error('[fcm] init error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Send FCM push notification. Returns true on success. */
export async function sendFcm(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  const app = getApp();
  if (!app) return false;

  try {
    const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
    const messaging = getMessaging(app);
    const message = {
      token,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' as const, notification: { sound: 'default' } },
      apns:    { payload: { aps: { sound: 'default' } } },
    };
    const result = await messaging.send(message);
    console.log('[fcm] sent:', result);
    return true;
  } catch (err) {
    console.error('[fcm] send error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** True if the token looks like a native FCM token (not an Expo token) */
export function isFcmToken(token: string): boolean {
  return !token.startsWith('ExponentPushToken[');
}
