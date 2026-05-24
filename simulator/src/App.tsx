import AppShell   from './components/Phone.tsx';
import SaasPortal from './components/SaasPortal.tsx';

const path = window.location.pathname.replace(/\/$/, '');
const isSaas = path.endsWith('/saas') || path.endsWith('/signup') || path.endsWith('/login-saas');

export default function App() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      overflow: 'hidden',
    }}>
      {isSaas ? <SaasPortal /> : <AppShell />}
    </div>
  );
}
