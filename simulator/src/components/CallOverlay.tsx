import { useEffect } from 'react';

const LOGO_URL = `${((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/'}logo.png`;

// Écran « Dzaryx t'appelle » (appel dans l'app, sans numéro de téléphone).
// Décrocher → l'écran Voix passe en mode appel (mains libres) et Dzaryx annonce la raison.

interface Props {
  reason?: string;
  onAnswer: () => void;
  onDecline: () => void;
}

// Sonnerie douce (WebAudio). Sur iPhone elle ne sonne que si l'audio a déjà été
// débloqué par un tap dans l'app : sinon l'écran reste muet, la notif a déjà sonné.
function startRingtone(): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  try { ctx = new AudioContext(); } catch { return () => {}; }
  const ring = () => {
    if (stopped || !ctx) return;
    const t0 = ctx.currentTime;
    [0, 0.42].forEach(off => {
      [880, 1100].forEach(freq => {
        const osc = ctx!.createOscillator();
        const g = ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.36);
        osc.connect(g); g.connect(ctx!.destination);
        osc.start(t0 + off); osc.stop(t0 + off + 0.38);
      });
    });
    try { navigator.vibrate?.([400, 200, 400]); } catch { /* iOS : pas de vibration web */ }
  };
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  ring();
  const timer = setInterval(ring, 2500);
  return () => { stopped = true; clearInterval(timer); ctx?.close().catch(() => {}); };
}

export default function CallOverlay({ reason, onAnswer, onDecline }: Props) {
  useEffect(() => startRingtone(), []);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 300,
      background: 'radial-gradient(circle at 50% 30%, #2a2214 0%, #0b0906 55%, #000 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      padding: '72px 24px 64px', fontFamily: 'Inter, system-ui, sans-serif', color: '#fff',
    }}>
      <style>{`
        @keyframes dzRingPulse { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.9); opacity: 0 } }
        @keyframes dzRingShake { 0%,100% { transform: rotate(0) } 10%,30% { transform: rotate(-14deg) } 20%,40% { transform: rotate(14deg) } 50% { transform: rotate(0) } }
      `}</style>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.18em', color: 'rgba(232,201,138,0.75)', textTransform: 'uppercase' }}>
          Appel entrant
        </div>
        <div style={{ fontSize: 34, fontWeight: 600, marginTop: 10 }}>Dzaryx</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>t'appelle…</div>
      </div>

      <div style={{ position: 'relative', width: 132, height: 132, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[0, 0.8].map(d => (
          <div key={d} style={{
            position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #E8C98A',
            animation: `dzRingPulse 1.6s ease-out ${d}s infinite`,
          }} />
        ))}
        <img src={LOGO_URL} alt="" style={{
          width: 112, height: 112, borderRadius: '50%', objectFit: 'cover',
          background: '#1a150d', border: '2px solid rgba(232,201,138,0.6)',
        }} />
      </div>

      {reason ? (
        <div style={{
          maxWidth: 320, textAlign: 'center', fontSize: 15, lineHeight: 1.45,
          color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '12px 16px',
        }}>
          {reason}
        </div>
      ) : <div />}

      <div style={{ display: 'flex', gap: 72 }}>
        <CallButton color="#FF3B30" label="Refuser" onClick={onDecline} rotate />
        <CallButton color="#34C759" label="Décrocher" onClick={onAnswer} shake />
      </div>
    </div>
  );
}

export function CallButton({ color, label, onClick, rotate, shake }: {
  color: string; label: string; onClick: () => void; rotate?: boolean; shake?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: 'inherit',
    }}>
      <span style={{
        width: 72, height: 72, borderRadius: '50%', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 6px 24px ${color}66`,
        animation: shake ? 'dzRingShake 1.2s ease-in-out infinite' : undefined,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff" style={{ transform: rotate ? 'rotate(135deg)' : undefined }}>
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
        </svg>
      </span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
    </button>
  );
}
