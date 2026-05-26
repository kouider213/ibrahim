import { useState, useEffect } from 'react';
import AppShell   from './components/Phone.tsx';
import SaasPortal from './components/SaasPortal.tsx';

function isSaasHash() {
  const sp = new URLSearchParams(window.location.search);
  return window.location.hash === '#saas'
    || window.location.pathname.endsWith('/saas')
    || sp.has('saas')
    || sp.has('reset');
}

export default function App() {
  const [showSaas, setShowSaas] = useState(isSaasHash);

  useEffect(() => {
    const handle = () => setShowSaas(isSaasHash());
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {showSaas ? <SaasPortal /> : <AppShell />}
    </div>
  );
}
