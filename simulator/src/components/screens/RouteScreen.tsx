// ROUTE — copilote avec des yeux (Kouider 28/10) : iPhone sur le support de la voiture, caméra arrière.
// Toutes les ~4 s une image + la vitesse GPS partent au backend (/api/jarvis/road) : panneaux de vitesse lus
// (« limité à 50, tu es à 63 »), dangers dits à voix haute, plaques retenues, boîte noire sur freinage brutal.
import { useEffect, useRef, useState } from 'react';
import { apiFetch, speakOnDevice } from '../../services/api.ts';

const C = {
  bg: '#04070d', glass: 'rgba(8,20,32,0.72)', border: 'rgba(56,216,245,0.28)', cyan: '#38d8f5',
  text: '#e8fbff', muted: '#8fb3c0', red: '#ff4d6d', green: '#4ade80',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const EVERY_MS = 4000;

export default function RouteScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const geoRef = useRef<number | null>(null);
  const pos = useRef<{ lat: number; lng: number; kmh: number | null; t: number } | null>(null);
  const busy = useRef(false);
  const [on, setOn] = useState(false);
  const [kmh, setKmh] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [plates, setPlates] = useState<string[]>([]);
  const [last, setLast] = useState('');
  const [msg, setMsg] = useState('');

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
    } catch { setMsg('Caméra refusée : autorise la caméra pour Dzaryx dans les réglages.'); return; }
    // Vitesse : celle du GPS si le téléphone la donne, sinon calculée entre deux positions
    geoRef.current = navigator.geolocation?.watchPosition(p => {
      const prev = pos.current;
      let v = p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed * 3.6 : null;
      if (v == null && prev) {
        const dt = (p.timestamp - prev.t) / 3600_000;
        const R = 6371, dLat = (p.coords.latitude - prev.lat) * Math.PI / 180, dLng = (p.coords.longitude - prev.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(p.coords.latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        if (dt > 0) v = (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / dt;
      }
      pos.current = { lat: p.coords.latitude, lng: p.coords.longitude, kmh: v, t: p.timestamp };
      setKmh(v != null ? Math.round(v) : null);
    }, () => setMsg('Position refusée : autorise la localisation pour la vitesse.'), { enableHighAccuracy: true, maximumAge: 1000 }) ?? null;
    try { wakeRef.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* écran peut s'éteindre */ }
    setOn(true); setMsg('Dzaryx regarde la route');
    speakOnDevice('Je regarde la route avec toi. Bonne route.');
  }

  function stop() {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    if (geoRef.current != null) navigator.geolocation?.clearWatch(geoRef.current);
    void wakeRef.current?.release().catch(() => {}); wakeRef.current = null;
    setOn(false); setMsg('');
  }
  useEffect(() => () => stop(), []);

  function grab(): string | null {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const scale = Math.min(1, 768 / (v.videoWidth || 768));
    const cv = document.createElement('canvas');
    cv.width = Math.round((v.videoWidth || 640) * scale); cv.height = Math.round((v.videoHeight || 360) * scale);
    cv.getContext('2d')?.drawImage(v, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.6).split(',')[1] ?? null;
  }

  useEffect(() => {
    if (!on) return;
    const t = setInterval(async () => {
      if (busy.current) return;
      const image = grab();
      if (!image) return;
      busy.current = true;
      const p = pos.current;
      try {
        const r = await apiFetch<{ say?: string; limit?: number | null; plates?: string[] }>('/api/jarvis/road', {
          method: 'POST', body: JSON.stringify({ image, ...(p ? { lat: p.lat, lng: p.lng, ...(p.kmh != null ? { kmh: p.kmh } : {}) } : {}) }),
        });
        setLimit(r.limit ?? null);
        if (r.plates?.length) setPlates(x => [...new Set([...r.plates!, ...x])].slice(0, 6));
        if (r.say) { setLast(r.say); speakOnDevice(r.say); }
      } catch { /* réseau : image suivante */ }
      finally { busy.current = false; }
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [on]);

  const over = limit != null && kmh != null && kmh > limit + 4;
  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, color: C.text, fontFamily: C.font, overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: on ? 1 : 0.15 }} />
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ background: C.glass, border: `1px solid ${over ? C.red : C.border}`, borderRadius: 16, padding: '10px 16px', minWidth: 110 }}>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: over ? C.red : C.text }}>{kmh ?? '—'}</div>
          <div style={{ fontSize: 12, color: C.muted }}>km/h (GPS)</div>
        </div>
        {limit != null && (
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#fff', border: '9px solid #e11d2a', display: 'grid', placeItems: 'center', color: '#111', fontSize: 28, fontWeight: 800 }}>{limit}</div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 20, display: 'grid', gap: 10 }}>
        {last && <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 14px', fontSize: 15 }}>🗣️ {last}</div>}
        {plates.length > 0 && <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: '8px 14px', fontSize: 12, color: C.muted }}>🔢 Plaques retenues : {plates.join(' · ')}</div>}
        {msg && <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{msg}</div>}
        {!on && (
          <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, fontSize: 13, lineHeight: 1.5 }}>
            <b style={{ color: C.cyan }}>🚗 Copilote avec des yeux</b><br />
            Pose l'iPhone sur le support, caméra vers la route. Dzaryx lit les panneaux et te prévient si tu dépasses la limite,
            dit les dangers à voix haute, retient les plaques (« la plaque devant moi ce matin ? ») et garde une boîte noire
            en cas de freinage brutal (images envoyées sur Telegram).
          </div>
        )}
        <button onClick={on ? stop : start} style={{ padding: '16px 0', borderRadius: 16, border: 'none', fontSize: 17, fontWeight: 700, color: '#04070d', background: on ? C.red : C.cyan }}>
          {on ? '⏹ Arrêter' : '▶ Démarrer la route'}
        </button>
      </div>
    </div>
  );
}
