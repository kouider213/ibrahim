import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import './app.css';
import ChatInterface from './components/ChatInterface.js';
import Dashboard     from './components/dashboard/Dashboard.js';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';
const TOKEN   = (import.meta as any).env?.VITE_ACCESS_TOKEN ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function setupPush(reg: ServiceWorkerRegistration): Promise<void> {
  // Get VAPID public key
  let vapidKey: string;
  try {
    const r = await fetch(`${BACKEND}/api/push-token/vapid-public-key`);
    if (!r.ok) return;
    const { key } = await r.json() as { key: string };
    vapidKey = key;
  } catch { return; }

  // Check existing subscription
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Already subscribed — just re-register with backend
    await sendSubToBackend(existing);
    return;
  }

  // Request permission
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { console.log('[push] Permission denied'); return; }

  // Subscribe
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
  });
  await sendSubToBackend(sub);
  console.log('[push] Subscribed successfully');
}

async function sendSubToBackend(sub: PushSubscription): Promise<void> {
  try {
    await fetch(`${BACKEND}/api/push-token/web`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (err) {
    console.error('[push] Failed to register subscription:', err);
  }
}

function usePushSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Delay to ensure SW is active
      setTimeout(() => setupPush(reg), 2000);
    }).catch(err => console.error('[sw] Registration failed:', err));
  }, []);
}

export default function App() {
  usePushSetup();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={
          <div className="app-root">
            <ChatInterface />
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}
