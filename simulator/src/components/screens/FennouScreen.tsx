import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../../services/api.ts';

// FENNOU : le compagnon de jeu du petit (page autonome public/fennou.html) ouvert par-dessus TOUTE l'app :
// pas de barre du bas ni d'accès au business pendant qu'il joue. Sortie = coin parents (appui long 2 s) → « Quitter Fennou ».
// Le prénom vient du serveur (privé), chaque partie est notée pour les rappels « temps avec le petit » et le bilan du dimanche.
export default function FennouScreen({ onExit }: { onExit: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/ibrahim/';

  useEffect(() => {
    let name = '';
    void apiFetch<{ name: string }>('/api/kid/profile').then(p => {
      name = p.name === 'le petit' ? '' : p.name;
      frame.current?.contentWindow?.postMessage({ type: 'fennou:profile', name }, '*');
    }).catch(() => { /* hors-ligne : le jeu marche sans */ });
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data) return;
      const d = e.data as { type?: string; game?: string; minutes?: number; wins?: number };
      if (d.type === 'fennou:ready' && name) frame.current?.contentWindow?.postMessage({ type: 'fennou:profile', name }, '*');
      if (d.type === 'fennou:session') void apiFetch('/api/kid/session', { method: 'POST', body: JSON.stringify({ game: d.game, minutes: d.minutes, wins: d.wins }) }).catch(() => {});
      if (d.type === 'fennou:exit') onExit();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onExit]);

  return createPortal(
    <iframe
      ref={frame}
      src={`${base}fennou.html`}
      title="Fennou"
      allow="microphone; autoplay; fullscreen; screen-wake-lock"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, zIndex: 9999, background: '#13213a' }}
    />,
    document.body,
  );
}
