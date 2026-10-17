import { BACKEND_URL } from '../../services/api.ts';

// GLOBE : le globe holographique de Nexus dans l'app (avions en direct, vols vers / depuis une ville, séismes,
// satellites, météo, caméras du monde). Page autonome public/globe.html (CesiumJS) ; données via le serveur, PC éteint ou non.
export default function GlobeScreen() {
  const base = ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/ibrahim/";
  const src = `${base}globe.html?api=${encodeURIComponent(BACKEND_URL)}`;
  return (
    <iframe
      src={src}
      title="Globe"
      allow="autoplay; fullscreen"
      style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#02050d' }}
    />
  );
}
