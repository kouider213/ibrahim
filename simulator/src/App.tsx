import { useState } from 'react';
import Phone from './components/Phone.tsx';
import FeedbackPanel from './components/feedback/FeedbackPanel.tsx';

export type Page = 'voice' | 'text';

export default function App() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at 50% 30%, #03050f 0%, #000000 70%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
      }} />

      {/* Corner decorations */}
      <CornerBracket pos="tl" />
      <CornerBracket pos="tr" />
      <CornerBracket pos="bl" />
      <CornerBracket pos="br" />

      {/* Header HUD */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 5, display: 'flex', gap: 32, alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff88',
          letterSpacing: '0.3em', textTransform: 'uppercase',
        }}>DZARYX SIMULATOR v1.0</span>
        <span style={{ width: 1, height: 14, background: '#00d4ff33' }} />
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: '#00d4ff55', letterSpacing: '0.2em' }}>
          FIK CONCIERGERIE ORAN
        </span>
      </div>

      {/* Phone */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <Phone />
      </div>

      {/* Feedback toggle button */}
      <button
        onClick={() => setFeedbackOpen(o => !o)}
        style={{
          position: 'absolute', right: feedbackOpen ? 380 : 20, top: '50%', transform: 'translateY(-50%)',
          zIndex: 10, background: '#0a0f1a', border: '1px solid #00d4ff44',
          borderRadius: 8, padding: '12px 8px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          transition: 'right 0.3s ease',
          boxShadow: '0 0 20px #00d4ff22',
        }}
        title="Panel de feedback"
      >
        <span style={{ fontSize: 16 }}>🧪</span>
        <span style={{
          fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff99',
          writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '0.2em',
        }}>FEEDBACK</span>
      </button>

      {/* Feedback panel */}
      {feedbackOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 360, zIndex: 9,
          animation: 'fadeIn 0.3s ease',
        }}>
          <FeedbackPanel onClose={() => setFeedbackOpen(false)} />
        </div>
      )}

      {/* Footer HUD */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 5, display: 'flex', gap: 24, alignItems: 'center',
      }}>
        {['RAILWAY', 'SUPABASE', 'ELEVENLABS', 'SOCKET.IO'].map(svc => (
          <span key={svc} style={{
            fontFamily: 'Share Tech Mono', fontSize: 9, color: '#00d4ff44', letterSpacing: '0.2em',
          }}>{svc}</span>
        ))}
      </div>
    </div>
  );
}

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 20, thick = 2, col = '#00d4ff44';
  const h = pos.endsWith('l') ? { left: 16 } : { right: 16 };
  const v = pos.startsWith('t') ? { top: 16 } : { bottom: 16 };
  const bT = pos.startsWith('t') ? `${thick}px solid ${col}` : 'none';
  const bB = pos.startsWith('b') ? `${thick}px solid ${col}` : 'none';
  const bL = pos.endsWith('l')  ? `${thick}px solid ${col}` : 'none';
  const bR = pos.endsWith('r')  ? `${thick}px solid ${col}` : 'none';
  return (
    <div style={{
      position: 'absolute', zIndex: 5,
      width: size, height: size,
      borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR,
      ...h, ...v,
    }} />
  );
}
