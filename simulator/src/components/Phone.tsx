import { useState, useEffect } from 'react';
import VoiceScreen from './screens/VoiceScreen.tsx';
import TextScreen from './screens/TextScreen.tsx';

export type Page = 'voice' | 'text';

const PHONE_W   = 375;
const PHONE_H   = 812;
const FRAME     = 14;   // frame border thickness
const RADIUS    = 50;   // outer corner radius
const SCREEN_R  = 36;   // screen corner radius
const SCREEN_W  = PHONE_W - FRAME * 2;
const SCREEN_H  = PHONE_H - FRAME * 2;
const STATUSBAR = 44;
const NAVBAR    = 36;
const CONTENT_H = SCREEN_H - STATUSBAR - NAVBAR;

export default function Phone() {
  const [page, setPage]       = useState<Page>('voice');
  const [time, setTime]       = useState(getTime());
  const [battery, setBattery] = useState(87);
  const [wsOk, setWsOk]       = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(getTime()), 15000);
    return () => clearInterval(t);
  }, []);

  // Simulate battery drain slowly
  useEffect(() => {
    const t = setInterval(() => setBattery(b => Math.max(10, b - 1)), 120000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: 'relative', width: PHONE_W, height: PHONE_H }}>
      {/* Phone frame */}
      <div
        className="phone-shadow"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #1a2233 0%, #0d1120 60%, #080d18 100%)',
          borderRadius: RADIUS,
          zIndex: 0,
        }}
      />

      {/* Side buttons */}
      <SideButton side="left" top={120} h={32} label="vol+" />
      <SideButton side="left" top={162} h={32} label="vol-" />
      <SideButton side="right" top={140} h={56} label="pwr" />

      {/* Screen area */}
      <div style={{
        position: 'absolute',
        top: FRAME, left: FRAME,
        width: SCREEN_W, height: SCREEN_H,
        borderRadius: SCREEN_R,
        overflow: 'hidden',
        background: '#000',
        zIndex: 1,
      }}>
        {/* Status bar */}
        <StatusBar time={time} battery={battery} wsOk={wsOk} />

        {/* Screen content */}
        <div style={{ width: '100%', height: CONTENT_H, position: 'relative', overflow: 'hidden' }}>
          {page === 'voice' ? (
            <VoiceScreen
              onNavigateText={() => setPage('text')}
              onWsStatus={setWsOk}
            />
          ) : (
            <TextScreen
              onNavigateVoice={() => setPage('voice')}
            />
          )}
        </div>

        {/* Nav bar */}
        <NavBar page={page} onPage={setPage} />
      </div>

      {/* Punch-hole camera */}
      <div style={{
        position: 'absolute',
        top: FRAME + 12, left: '50%', transform: 'translateX(-50%)',
        width: 12, height: 12, borderRadius: '50%',
        background: '#000',
        zIndex: 3,
        boxShadow: 'inset 0 0 3px #000',
      }} />
    </div>
  );
}

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function StatusBar({ time, battery, wsOk }: { time: string; battery: number; wsOk: boolean }) {
  return (
    <div style={{
      height: STATUSBAR, width: '100%',
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px 0 20px',
      paddingTop: 8,
    }}>
      {/* Time */}
      <span style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: '#fff', letterSpacing: '0.05em' }}>
        {time}
      </span>
      {/* Center — network indicator */}
      <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: wsOk ? '#00d4ff' : '#ff3366', letterSpacing: '0.2em' }}>
        {wsOk ? '●LIVE' : '○OFF'}
      </span>
      {/* Right icons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <WifiIcon />
        <SignalIcon />
        <BatteryIcon pct={battery} />
      </div>
    </div>
  );
}

function NavBar({ page, onPage }: { page: Page; onPage: (p: Page) => void }) {
  return (
    <div style={{
      height: NAVBAR, width: '100%',
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40,
    }}>
      {/* Back chevron */}
      <button onClick={() => onPage('voice')} style={navBtnStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={page === 'voice' ? '#00d4ff' : '#ffffff44'} strokeWidth="2">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>
      {/* Home — circle */}
      <button onClick={() => onPage('voice')} style={navBtnStyle}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          border: `2px solid ${page === 'voice' ? '#00d4ff' : '#ffffff44'}`,
          background: page === 'voice' ? '#00d4ff22' : 'transparent',
        }} />
      </button>
      {/* Text — square for recents */}
      <button onClick={() => onPage('text')} style={navBtnStyle}>
        <div style={{
          width: 16, height: 13, borderRadius: 3,
          border: `2px solid ${page === 'text' ? '#ff6b00' : '#ffffff44'}`,
          background: page === 'text' ? '#ff6b0022' : 'transparent',
        }} />
      </button>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 36, height: 36,
};

function SideButton({ side, top, h, label }: { side: 'left' | 'right'; top: number; h: number; label: string }) {
  const isLeft = side === 'left';
  return (
    <div
      title={label}
      style={{
        position: 'absolute',
        top, [isLeft ? 'left' : 'right']: -5,
        width: 5, height: h,
        background: 'linear-gradient(180deg, #2a3a50, #1a2535)',
        borderRadius: isLeft ? '3px 0 0 3px' : '0 3px 3px 0',
        zIndex: 2,
        boxShadow: isLeft ? '-1px 0 3px rgba(0,0,0,0.5)' : '1px 0 3px rgba(0,0,0,0.5)',
      }}
    />
  );
}

function WifiIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 24 18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
      <path d="M1 6C5.4 2 10.4 0 12 0s6.6 2 11 6" opacity="0.4" />
      <path d="M4 10c2.1-2 5-3.5 8-3.5s5.9 1.5 8 3.5" opacity="0.6" />
      <path d="M7.5 14c1.2-1.2 2.8-2 4.5-2s3.3.8 4.5 2" />
      <circle cx="12" cy="18" r="1.5" fill="#fff" stroke="none" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <rect x="0"  y="15" width="5" height="9" rx="1" fill="#ffffff44" />
      <rect x="7"  y="10" width="5" height="14" rx="1" fill="#ffffff66" />
      <rect x="14" y="5"  width="5" height="19" rx="1" fill="#ffffffaa" />
      <rect x="21" y="0"  width="3" height="24" rx="1" fill="#fff" />
    </svg>
  );
}

function BatteryIcon({ pct }: { pct: number }) {
  const col = pct > 30 ? '#4eff91' : '#ff3366';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <div style={{ width: 22, height: 11, border: '1.5px solid #ffffff88', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 1, top: 1, bottom: 1,
          width: `${pct}%`, background: col, borderRadius: 2,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ width: 3, height: 6, background: '#ffffff88', borderRadius: '0 1px 1px 0' }} />
    </div>
  );
}
