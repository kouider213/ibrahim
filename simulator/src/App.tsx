import AppShell from './components/Phone.tsx';
import VoiceScreen from './components/screens/VoiceScreen.tsx';
import { setSimActor } from './services/api.ts';
import CarteScreen from './components/screens/CarteScreen.tsx';
import type { DemoKind } from './components/carte/data.ts';

export default function App() {
  // Mode OVERLAY (fenêtre flottante par-dessus les autres apps) : on n'affiche QUE
  // l'écran vocal (voix + caméra + scan), sans le shell/onglets/login. URL: ?overlay=1[&actor=]
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  // Démo PUBLIQUE de la Carte live (offre FIK) : données fictives, pas de connexion. ?demo=carte&k=location&n=Nom
  if (params.get('demo') === 'carte') {
    const k = params.get('k') ?? 'location';
    const kind = (['location', 'vente', 'garage', 'immo', 'transport'].includes(k) ? k : 'location') as DemoKind;
    const brand = (params.get('n') ?? '').slice(0, 40).toUpperCase();
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#050a16', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: '100%' }}>
          <CarteScreen demo={{ kind, brand }} onAsk={() => {}} onOpen={() => {}} />
        </div>
      </div>
    );
  }

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
