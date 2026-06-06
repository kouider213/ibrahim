import AppShell from './components/Phone.tsx';
import VoiceScreen from './components/screens/VoiceScreen.tsx';
import { setSimActor } from './services/api.ts';

export default function App() {
  // Mode OVERLAY (fenêtre flottante par-dessus les autres apps) : on n'affiche QUE
  // l'écran vocal (voix + caméra + scan), sans le shell/onglets/login. URL: ?overlay=1[&actor=]
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  if (params.has('overlay')) {
    const actor: 'kouider' | 'houari' = params.get('actor') === 'houari' ? 'houari' : 'kouider';
    setSimActor(actor);
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        <VoiceScreen onNavigateText={() => {}} onWsStatus={() => {}} actor={actor} compact />
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <AppShell />
    </div>
  );
}
