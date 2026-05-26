import { useState, useEffect } from 'react';
import AppShell   from './components/Phone.tsx';
import SaasPortal from './components/SaasPortal.tsx';

const BACKEND       = (import.meta as any).env?.VITE_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';
const TOKEN_KOUIDER = 'f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2';
const SAAS_SESSION_KEY = 'saas_session';

function isSaasHash() {
  const sp = new URLSearchParams(window.location.search);
  return window.location.hash === '#saas'
    || window.location.pathname.endsWith('/saas')
    || sp.has('saas')
    || sp.has('reset');
}

async function autoLoginAdmin(): Promise<void> {
  try {
    const existing = localStorage.getItem(SAAS_SESSION_KEY);
    if (existing) return; // already have session
    const res = await fetch(`${BACKEND}/api/saas/admin/autologin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN_KOUIDER}` },
    });
    if (!res.ok) return;
    const data = await res.json() as { token: string; org_id: string; email: string; ai_name: string; business_name: string; sector: string };
    localStorage.setItem(SAAS_SESSION_KEY, JSON.stringify({ token: data.token, ai_name: data.ai_name, business_name: data.business_name, sector: data.sector, org_id: data.org_id, email: data.email }));
  } catch { /* silent */ }
}

export default function App() {
  const [showSaas, setShowSaas] = useState(isSaasHash);

  useEffect(() => {
    const handle = () => setShowSaas(isSaasHash());
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);

  const openAdmin = async () => {
    await autoLoginAdmin();
    setShowSaas(true);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {showSaas
        ? <SaasPortal onBack={() => setShowSaas(false)} />
        : <AppShell   onOpenAdmin={openAdmin} />
      }
    </div>
  );
}
