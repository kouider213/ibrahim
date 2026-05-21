import { useState, useEffect, useRef } from 'react';
import VoiceScreen from './screens/VoiceScreen.tsx';
import TextScreen from './screens/TextScreen.tsx';
import BookingsScreen from './screens/BookingsScreen.tsx';
import FleetScreen from './screens/FleetScreen.tsx';
import RevenueScreen from './screens/RevenueScreen.tsx';
import ClientsScreen from './screens/ClientsScreen.tsx';
import RemindersScreen from './screens/RemindersScreen.tsx';
import DocumentsScreen from './screens/DocumentsScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import CalendarScreen from './screens/CalendarScreen.tsx';
import NotificationsScreen from './screens/NotificationsScreen.tsx';
import CapacitesScreen from './screens/CapacitesScreen.tsx';
import TelegramScreen from './screens/TelegramScreen.tsx';
import { setSimActor } from '../services/api.ts';

export type Page =
  | 'voice' | 'text' | 'telegram' | 'bookings' | 'fleet' | 'revenue'
  | 'clients' | 'reminders' | 'documents' | 'calendar' | 'notifications'
  | 'capacites' | 'settings';

type SimState = 'locked' | 'home' | 'login' | 'app';
type Actor = 'kouider' | 'houari';

const CREDS: Record<string, { password: string; actor: Actor }> = {
  kouider: { password: 'kouider31', actor: 'kouider' },
  houari:  { password: 'houari31',  actor: 'houari'  },
};

const TABS: Array<{ id: Page; icon: string; label: string }> = [
  { id: 'voice',         icon: '🎙️', label: 'VOIX'     },
  { id: 'text',          icon: '💬', label: 'CHAT'     },
  { id: 'telegram',      icon: '✈️', label: 'TELEGRAM' },
  { id: 'capacites',     icon: '🤖', label: 'DZARYX'   },
  { id: 'bookings',      icon: '📋', label: 'RESAS'    },
  { id: 'fleet',         icon: '🚗', label: 'PARC'     },
  { id: 'revenue',       icon: '💰', label: 'CA'       },
  { id: 'clients',       icon: '👥', label: 'CLIENTS'  },
  { id: 'calendar',      icon: '📅', label: 'AGENDA'   },
  { id: 'notifications', icon: '🔔', label: 'ALERTES'  },
  { id: 'reminders',     icon: '⏰', label: 'RAPPELS'  },
  { id: 'documents',     icon: '📄', label: 'DOCS'     },
  { id: 'settings',      icon: '⚙️', label: 'CONFIG'   },
];

const PHONE_W   = 375;
const PHONE_H   = 812;
const FRAME     = 14;
const RADIUS    = 50;
const SCREEN_R  = 36;
const SCREEN_W  = PHONE_W - FRAME * 2;
const SCREEN_H  = PHONE_H - FRAME * 2;
const STATUSBAR = 44;
const NAVBAR    = 42;
const CONTENT_H = SCREEN_H - STATUSBAR - NAVBAR;

function getSavedSession(): { actor: Actor; user: string } | null {
  try {
    const s = localStorage.getItem('dzaryx_session');
    return s ? (JSON.parse(s) as { actor: Actor; user: string }) : null;
  } catch { return null; }
}

export default function Phone() {
  const [page, setPage]       = useState<Page>('voice');
  const [time, setTime]       = useState(getTime());
  const [battery, setBattery] = useState(87);
  const [wsOk, setWsOk]       = useState(false);

  // Boot/login state
  const session = getSavedSession();
  const [simState, setSimState]       = useState<SimState>(session ? 'app' : 'locked');
  const [powering, setPowering]       = useState(false); // power-off animation
  const [loggedActor, setLoggedActor] = useState<Actor | null>(session?.actor ?? null);
  const [loginUser, setLoginUser]     = useState('');
  const [loginPass, setLoginPass]     = useState('');
  const [loginErr, setLoginErr]       = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTime(getTime()), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setBattery(b => Math.max(10, b - 1)), 120000);
    return () => clearInterval(t);
  }, []);

  // Sync actor to API
  useEffect(() => {
    if (loggedActor) setSimActor(loggedActor);
  }, [loggedActor]);

  const unlock = () => setSimState('home');
  const openApp = () => setSimState('login');

  const powerOff = () => {
    if (simState === 'locked') { unlock(); return; }
    setPowering(true);
    setTimeout(() => {
      localStorage.removeItem('dzaryx_session');
      setLoggedActor(null);
      setLoginUser('');
      setLoginPass('');
      setSimState('locked');
      setPowering(false);
    }, 1200);
  };

  const doLogin = () => {
    const cred = CREDS[loginUser.toLowerCase().trim()];
    if (!cred || cred.password !== loginPass) {
      setLoginErr('Identifiants incorrects');
      setTimeout(() => setLoginErr(''), 2000);
      return;
    }
    setLoginLoading(true);
    setTimeout(() => {
      setLoggedActor(cred.actor);
      setSimActor(cred.actor);
      localStorage.setItem('dzaryx_session', JSON.stringify({ actor: cred.actor, user: loginUser.toLowerCase().trim() }));
      setSimState('app');
      setLoginLoading(false);
    }, 600);
  };

  const logout = () => {
    localStorage.removeItem('dzaryx_session');
    setLoggedActor(null);
    setLoginUser('');
    setLoginPass('');
    setSimState('locked');
  };

  const renderScreen = () => {
    switch (page) {
      case 'voice':         return <VoiceScreen onNavigateText={() => setPage('text')} onWsStatus={setWsOk} />;
      case 'text':          return <TextScreen onNavigateVoice={() => setPage('voice')} actor={loggedActor ?? 'kouider'} />;
      case 'telegram':      return <TelegramScreen />;
      case 'bookings':      return <BookingsScreen />;
      case 'fleet':         return <FleetScreen />;
      case 'revenue':       return <RevenueScreen />;
      case 'clients':       return <ClientsScreen />;
      case 'reminders':     return <RemindersScreen />;
      case 'documents':     return <DocumentsScreen />;
      case 'calendar':      return <CalendarScreen />;
      case 'notifications': return <NotificationsScreen />;
      case 'capacites':     return <CapacitesScreen />;
      case 'settings':      return <SettingsScreen />;
    }
  };

  const actorCol  = loggedActor === 'houari' ? '#7c3aed' : '#00e5ff';
  const actorInit = loggedActor === 'houari' ? 'H' : 'K';

  return (
    <div style={{ position: 'relative', width: PHONE_W, height: PHONE_H }}>
      {/* Phone frame */}
      <div
        className="phone-shadow"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #1a2233 0%, #0d1120 60%, #080d18 100%)',
          borderRadius: RADIUS, zIndex: 0,
        }}
      />

      {/* Side buttons */}
      <SideButton side="left" top={120} h={32} label="vol+" />
      <SideButton side="left" top={162} h={32} label="vol-" />
      <SideButton side="right" top={140} h={56} label="pwr" onClick={powerOff} />

      {/* Screen area */}
      <div style={{
        position: 'absolute',
        top: FRAME, left: FRAME,
        width: SCREEN_W, height: SCREEN_H,
        borderRadius: SCREEN_R, overflow: 'hidden',
        background: '#000', zIndex: 1,
      }}>
        {simState === 'locked' && (
          <LockScreen time={time} battery={battery} onUnlock={unlock} />
        )}

        {simState === 'home' && (
          <HomeScreen time={time} battery={battery} onOpenApp={openApp} />
        )}

        {simState === 'login' && (
          <LoginScreen
            user={loginUser} pass={loginPass}
            onUser={setLoginUser} onPass={setLoginPass}
            onLogin={doLogin} loading={loginLoading} error={loginErr}
            passRef={passRef}
          />
        )}

        {simState === 'app' && (
          <>
            {/* Status bar */}
            <StatusBar time={time} battery={battery} wsOk={wsOk} page={page}
              actorCol={actorCol} actorInit={actorInit} onLogout={logout} />

            {/* Screen content */}
            <div style={{ width: '100%', height: CONTENT_H, position: 'relative', overflow: 'hidden' }}>
              {renderScreen()}
            </div>

            {/* Nav bar */}
            <NavBar page={page} onPage={setPage} />
          </>
        )}
      </div>

      {/* Punch-hole camera */}
      <div style={{
        position: 'absolute',
        top: FRAME + 12, left: '50%', transform: 'translateX(-50%)',
        width: 12, height: 12, borderRadius: '50%',
        background: '#000', zIndex: 3,
        boxShadow: 'inset 0 0 3px #000',
      }} />

      {/* Power-off overlay */}
      {powering && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          borderRadius: RADIUS, overflow: 'hidden',
          background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '2px solid #00d4ff44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 22 }}>⏻</div>
          </div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff33', letterSpacing: '0.3em' }}>
            DZARYX
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#ffffff22', letterSpacing: '0.2em' }}>
            ARRÊT EN COURS…
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lock Screen ──────────────────────────────────────────────────────────────

function LockScreen({ time, battery, onUnlock }: { time: string; battery: number; onUnlock: () => void }) {
  return (
    <div
      onClick={onUnlock}
      style={{
        width: '100%', height: '100%',
        background: 'radial-gradient(ellipse at 50% 20%, #03071a 0%, #000510 60%, #000000 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Animated background grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* Status bar area */}
      <div style={{ width: '100%', padding: '12px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: '#fff' }}>{time}</span>
        <BatteryIcon pct={battery} />
      </div>

      {/* Center content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 1 }}>
        {/* Big clock */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 56, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 0 30px rgba(0,212,255,0.3)' }}>
            {time}
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: '#ffffff44', marginTop: 8, letterSpacing: '0.1em' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* Dzaryx icon */}
        <DzaryxIcon size={70} glow />

        {/* Unlock hint */}
        <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff44', letterSpacing: '0.25em', marginTop: 10 }}>
          ↑ APPUYER POUR DÉVERROUILLER
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ padding: '0 0 24px', zIndex: 1 }}>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: '#ffffff22' }} />
      </div>
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ time, battery, onOpenApp }: { time: string; battery: number; onOpenApp: () => void }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'radial-gradient(ellipse at 50% 20%, #020a1a 0%, #000510 60%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
      }} />

      {/* Status bar */}
      <div style={{ width: '100%', padding: '12px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: '#fff' }}>{time}</span>
        <BatteryIcon pct={battery} />
      </div>

      {/* Date */}
      <div style={{ textAlign: 'center', marginTop: 16, zIndex: 1 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 30, color: '#fff', letterSpacing: '-0.01em', textShadow: '0 0 20px rgba(0,212,255,0.2)' }}>
          {time}
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: '#ffffff44', marginTop: 4, letterSpacing: '0.08em' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* App grid */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* Dzaryx app icon */}
          <button
            onClick={onOpenApp}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}
          >
            <div style={{
              borderRadius: 22, overflow: 'hidden',
              boxShadow: '0 0 30px rgba(0,212,255,0.4), 0 0 60px rgba(0,212,255,0.15)',
              border: '1.5px solid rgba(0,212,255,0.3)',
            }}>
              <DzaryxIcon size={90} />
            </div>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 11, color: '#ffffffcc', letterSpacing: '0.05em' }}>
              Dzaryx
            </span>
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ padding: '0 0 24px', display: 'flex', justifyContent: 'center', zIndex: 1 }}>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: '#ffffff22' }} />
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({
  user, pass, onUser, onPass, onLogin, loading, error, passRef
}: {
  user: string; pass: string;
  onUser: (s: string) => void; onPass: (s: string) => void;
  onLogin: () => void; loading: boolean; error: string;
  passRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#020810',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Share Tech Mono', gap: 24, padding: '0 28px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
      }} />

      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, width: '100%' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <DzaryxIcon size={72} glow />
          <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: '#00d4ff', letterSpacing: '0.3em', textShadow: '0 0 12px #00d4ff55' }}>
            DZARYX
          </div>
          <div style={{ fontSize: 8, color: '#ffffff33', letterSpacing: '0.2em' }}>
            FIK CONCIERGERIE ORAN
          </div>
        </div>

        {/* Form */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 7, color: '#00d4ff55', letterSpacing: '0.2em', fontFamily: 'Orbitron' }}>
              IDENTIFIANT
            </label>
            <input
              value={user}
              onChange={e => onUser(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') passRef.current?.focus(); }}
              placeholder="kouider / houari"
              autoComplete="username"
              style={loginInputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 7, color: '#00d4ff55', letterSpacing: '0.2em', fontFamily: 'Orbitron' }}>
              MOT DE PASSE
            </label>
            <input
              ref={passRef as React.RefObject<HTMLInputElement>}
              type="password"
              value={pass}
              onChange={e => onPass(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onLogin(); }}
              placeholder="••••••••"
              autoComplete="current-password"
              style={loginInputStyle}
            />
          </div>

          {error && (
            <div style={{ fontSize: 8, color: '#ff3366', textAlign: 'center', fontFamily: 'Orbitron', letterSpacing: '0.1em' }}>
              {error}
            </div>
          )}

          <button
            onClick={onLogin}
            disabled={loading || !user || !pass}
            style={{
              marginTop: 4, padding: '12px',
              background: loading ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.1)',
              border: '1.5px solid #00d4ff55', borderRadius: 10,
              fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff',
              cursor: loading || !user || !pass ? 'default' : 'pointer',
              letterSpacing: '0.25em', opacity: !user || !pass ? 0.5 : 1,
              boxShadow: '0 0 20px rgba(0,212,255,0.2)',
            }}
          >
            {loading ? 'CONNEXION…' : 'SE CONNECTER'}
          </button>
        </div>
      </div>
    </div>
  );
}

const loginInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(0,212,255,0.05)', border: '1px solid #00d4ff22',
  borderRadius: 8, padding: '10px 12px',
  fontFamily: 'Share Tech Mono', fontSize: 12, color: '#c8e8ff', outline: 'none',
};

// ─── Dzaryx SVG Icon ──────────────────────────────────────────────────────────

function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Black background */}
      <rect width="100" height="100" rx="22" fill="#050d1a" />
      {/* Outer HUD ring */}
      <circle cx="50" cy="50" r="40" fill="none" stroke="#00d4ff" strokeWidth="0.8" strokeOpacity="0.25"
        strokeDasharray="4 3" />
      {/* Inner HUD ring */}
      <circle cx="50" cy="50" r="32" fill="none" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.4" />
      {/* Corner bracket markers */}
      <path d="M 16 16 L 22 16 M 16 16 L 16 22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 84 16 L 78 16 M 84 16 L 84 22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 16 84 L 22 84 M 16 84 L 16 78" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 84 84 L 78 84 M 84 84 L 84 78" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      {/* Robot head body */}
      <rect x="30" y="30" width="40" height="32" rx="7" fill="#00d4ff0d" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.7" />
      {/* Antenna */}
      <line x1="50" y1="30" x2="50" y2="22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
      <circle cx="50" cy="20" r="3" fill="#00d4ff" fillOpacity="0.9" />
      {glow && <circle cx="50" cy="20" r="5" fill="#00d4ff" fillOpacity="0.2" />}
      {/* Eyes */}
      <rect x="35" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.9" />
      <rect x="53" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.9" />
      {/* Eye glow */}
      {glow && (
        <>
          <rect x="35" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.3" />
          <rect x="53" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.3" />
        </>
      )}
      {/* Mouth bar */}
      <rect x="36" y="51" width="28" height="4" rx="2" fill="#00d4ff" fillOpacity="0.5" />
      {/* Neck */}
      <rect x="44" y="62" width="12" height="5" rx="2" fill="#00d4ff" fillOpacity="0.3" />
      {/* Shoulders */}
      <rect x="28" y="67" width="44" height="8" rx="4" fill="#00d4ff0a" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.35" />
      {/* Bottom text dots */}
      <circle cx="38" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.4" />
      <circle cx="50" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.6" />
      <circle cx="62" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.4" />
    </svg>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ time, battery, wsOk, page, actorCol, actorInit, onLogout }: {
  time: string; battery: number; wsOk: boolean; page: Page;
  actorCol: string; actorInit: string; onLogout: () => void;
}) {
  const tab = TABS.find(t => t.id === page);
  return (
    <div style={{
      height: STATUSBAR, width: '100%',
      background: 'rgba(0,0,0,0.95)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 12px', paddingTop: 8,
    }}>
      <span style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: '#fff', letterSpacing: '0.05em' }}>
        {time}
      </span>
      <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: wsOk ? '#00d4ff' : '#ff3366', letterSpacing: '0.15em' }}>
        {tab?.icon} {tab?.label}
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={onLogout}
          title="Déconnexion"
          style={{
            cursor: 'pointer', padding: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: `${actorCol}22`, border: `1px solid ${actorCol}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Orbitron', fontSize: 8, color: actorCol,
          }}
        >
          {actorInit}
        </button>
        <WifiIcon />
        <SignalIcon />
        <BatteryIcon pct={battery} />
      </div>
    </div>
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

function NavBar({ page, onPage }: { page: Page; onPage: (p: Page) => void }) {
  return (
    <div style={{
      height: NAVBAR, width: '100%',
      background: 'rgba(0,0,0,0.97)',
      borderTop: '1px solid #00d4ff12',
      display: 'flex', alignItems: 'stretch',
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      {TABS.map(tab => {
        const active = page === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onPage(tab.id)}
            style={{
              minWidth: 46, flex: '0 0 auto',
              background: active ? '#00d4ff0d' : 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 12, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{
              fontFamily: 'Orbitron', fontSize: 5,
              color: active ? '#00d4ff' : '#ffffff33',
              letterSpacing: '0.1em',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function SideButton({ side, top, h, label, onClick }: {
  side: 'left' | 'right'; top: number; h: number; label: string; onClick?: () => void;
}) {
  const isLeft = side === 'left';
  return (
    <div
      title={label}
      onClick={onClick}
      style={{
        position: 'absolute', top, [isLeft ? 'left' : 'right']: -5,
        width: 5, height: h,
        background: 'linear-gradient(180deg, #2a3a50, #1a2535)',
        borderRadius: isLeft ? '3px 0 0 3px' : '0 3px 3px 0',
        zIndex: 2,
        boxShadow: isLeft ? '-1px 0 3px rgba(0,0,0,0.5)' : '1px 0 3px rgba(0,0,0,0.5)',
        cursor: onClick ? 'pointer' : 'default',
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
