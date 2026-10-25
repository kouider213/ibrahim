import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// JEUX : la page des jeux du couple (La Grande Folie, Les Gardiens, L'Œil) ouverte en plein écran par-dessus l'app.
// Même origine que l'app → les jeux lisent la session Dzaryx (records, jouer à deux avec Fatima).
export default function JeuxScreen({ onExit }: { onExit: () => void }) {
  const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/ibrahim/';
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if ((e.data as { type?: string } | null)?.type === 'jeux:exit') onExit(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onExit]);
  return createPortal(
    <iframe src={`${base}jeux/`} title="Jeux" allow="autoplay; fullscreen; screen-wake-lock; camera" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, zIndex: 9999, background: '#5b5cff' }} />,
    document.body,
  );
}
