import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

// FORME (remplace l'ancien COACH, Kouider 25/10) : l'appli sport + nutrition halal + Wegovy + photos avant/après.
// C'est une page à part (forme/index.html, aussi installable seule sur l'écran d'accueil) ouverte ici en plein écran :
// même origine → même session, rien à reconnecter. Sortie = flèche ← en haut (message « forme:exit »).
export default function FormeScreen({ onExit }: { onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/ibrahim/';
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if ((e.data as { type?: string })?.type === 'forme:exit') onExit();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onExit]);
  return createPortal(
    <iframe ref={frame} src={`${base}forme/`} title="Forme" allow="camera; microphone; autoplay; fullscreen; screen-wake-lock"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, zIndex: 9999, background: '#fbf1ec' }} />,
    document.body,
  );
}
