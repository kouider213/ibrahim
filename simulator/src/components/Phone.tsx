import { useState, useEffect, useRef } from 'react';
import VoiceScreen from './screens/VoiceScreen.tsx';
import TextScreen from './screens/TextScreen.tsx';
import BookingsScreen from './screens/BookingsScreen.tsx';
import FleetScreen from './screens/FleetScreen.tsx';
import RevenueScreen from './screens/RevenueScreen.tsx';
import ClientsScreen from './screens/ClientsScreen.tsx';
import DocumentsScreen from './screens/DocumentsScreen.tsx';
import SettingsScreen from './screens/SettingsScreen.tsx';
import CalendarScreen from './screens/CalendarScreen.tsx';
import CapacitesScreen from './screens/CapacitesScreen.tsx';
import CurrencyScreen from './screens/CurrencyScreen.tsx';
import { setSimActor } from '../services/api.ts';

export type Page =
  | 'voice' | 'text' | 'bookings' | 'fleet' | 'revenue'
  | 'clients' | 'documents' | 'calendar'
  | 'capacites' | 'settings' | 'currency';

type SimState = 'locked' | 'home' | 'login' | 'app';
type Actor = 'kouider' | 'houari';

const CREDS: Record<string, { password: string; actor: Actor }> = {
  kouider: { password: 'kouider31', actor: 'kouider' },
  houari:  { password: 'houari31',  actor: 'houari'  },
};

const TABS: Array<{ id: Page; icon: string; label: string; kouiderOnly?: boolean; houariOnly?: boolean }> = [
  { id: 'voice',         icon: '🎙️', label: 'VOIX'    },
  { id: 'text',          icon: '💬', label: 'CHAT'    },
  { id: 'capacites',     icon: '🤖', label: 'DZARYX',  kouiderOnly: true },
  { id: 'currency',      icon: '💱', label: 'SARF',   houariOnly: true },
  { id: 'bookings',      icon: '📋', label: 'RESAS'   },
  { id: 'fleet',         icon: '🚗', label: 'PARC'    },
  { id: 'revenue',       icon: '💰', label: 'CA'      },
  { id: 'clients',       icon: '👥', label: 'CLIENTS' },
  { id: 'calendar',      icon: '📅', label: 'AGENDA'  },
  { id: 'documents',     icon: '📄', label: 'DOCS'    },
  { id: 'settings',      icon: '⚙️', label: 'CONFIG'  },
];

function getSavedSession(): { actor: Actor; user: string } | null {
  try {
    const s = localStorage.getItem('dzaryx_session');
    return s ? (JSON.parse(s) as { actor: Actor; user: string }) : null;
  } catch { return null; }
}

export default function Phone() {
  const [page, setPage]       = useState<Page>('voice');
  const [wsOk, setWsOk]       = useState(false);

  const session = getSavedSession();
  const [simState, setSimState]         = useState<SimState>(session ? 'app' : 'locked');
  const [powering, setPowering]         = useState(false);
  const [loggedActor, setLoggedActor]   = useState<Actor | null>(session?.actor ?? null);
  const [loginUser, setLoginUser]       = useState('');
  const [loginPass, setLoginPass]       = useState('');
  const [loginErr, setLoginErr]         = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (loggedActor) setSimActor(loggedActor);
  }, [loggedActor]);

  const unlock  = () => setSimState('home');
  const openApp = () => setSimState('login');

  const logout = () => {
    setPowering(true);
    setTimeout(() => {
      localStorage.removeItem('dzaryx_session');
      setLoggedActor(null);
      setLoginUser('');
      setLoginPass('');
      setSimState('locked');
      setPowering(false);
    }, 900);
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

  const actor = loggedActor ?? 'kouider';

  const renderScreen = () => {
    switch (page) {
      case 'voice':         return <VoiceScreen onNavigateText={() => setPage('text')} onWsStatus={setWsOk} actor={actor} />;
      case 'text':          return <TextScreen onNavigateVoice={() => setPage('voice')} actor={actor} />;
      case 'bookings':      return <BookingsScreen actor={actor} />;
      case 'fleet':         return <FleetScreen />;
      case 'revenue':       return <RevenueScreen />;
      case 'clients':       return <ClientsScreen />;
      case 'documents':     return <DocumentsScreen />;
      case 'calendar':      return <CalendarScreen />;
      case 'capacites':     return <CapacitesScreen />;
      case 'settings':      return <SettingsScreen />;
      case 'currency':      return <CurrencyScreen actor={actor} />;
    }
  };

  const actorCol  = actor === 'houari' ? '#7c3aed' : '#00e5ff';
  const actorInit = actor === 'houari' ? 'H' : 'K';

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#000',
      position: 'relative',
    }}>
      {simState === 'locked' && (
        <LockScreen onUnlock={unlock} />
      )}

      {simState === 'home' && (
        <HomeScreen onOpenApp={openApp} />
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
          <StatusBar wsOk={wsOk} page={page} actorCol={actorCol} actorInit={actorInit} onLogout={logout} />
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {renderScreen()}
          </div>
          <NavBar page={page} onPage={setPage} actor={loggedActor ?? 'kouider'} />
        </>
      )}

      {powering && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
          animation: 'fadeIn 0.3s ease',
        }}>
          <DzaryxIcon size={64} glow />
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff44', letterSpacing: '0.3em' }}>
            DÉCONNEXION…
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lock Screen ──────────────────────────────────────────────────────────────

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div
      onClick={onUnlock}
      style={{
        flex: 1,
        background: 'radial-gradient(ellipse at 50% 20%, #03071a 0%, #000510 60%, #000000 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, zIndex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 60, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1, textShadow: '0 0 30px rgba(0,212,255,0.3)' }}>
            {getTime()}
          </div>
          <div style={{ fontFamily: 'Share Tech Mono', fontSize: 14, color: '#ffffff44', marginTop: 8, letterSpacing: '0.1em' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <DzaryxIcon size={80} glow />
        <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff44', letterSpacing: '0.25em', marginTop: 8 }}>
          APPUYER POUR CONTINUER
        </div>
      </div>

      <div style={{ paddingBottom: 24, zIndex: 1 }}>
        <div style={{ width: 80, height: 4, borderRadius: 2, background: '#ffffff22' }} />
      </div>
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <div style={{
      flex: 1,
      background: 'radial-gradient(ellipse at 50% 20%, #020a1a 0%, #000510 60%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
      }} />

      <div style={{ textAlign: 'center', marginTop: 20, zIndex: 1 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 36, color: '#fff', textShadow: '0 0 20px rgba(0,212,255,0.2)' }}>
          {getTime()}
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: '#ffffff44', marginTop: 4, letterSpacing: '0.08em' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <button
          onClick={onOpenApp}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{
            borderRadius: 24, overflow: 'hidden',
            boxShadow: '0 0 40px rgba(0,212,255,0.4), 0 0 80px rgba(0,212,255,0.15)',
            border: '1.5px solid rgba(0,212,255,0.3)',
          }}>
            <DzaryxIcon size={100} />
          </div>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: '#ffffffcc', letterSpacing: '0.05em' }}>
            Dzaryx
          </span>
        </button>
      </div>

      <div style={{ paddingBottom: 24, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
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
      flex: 1,
      background: '#020810',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Share Tech Mono', gap: 24, padding: '0 32px',
      position: 'relative', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(0,212,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,212,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)',
      }} />

      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <DzaryxIcon size={80} glow />
          <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#00d4ff', letterSpacing: '0.3em', textShadow: '0 0 12px #00d4ff55' }}>
            DZARYX
          </div>
          <div style={{ fontSize: 9, color: '#ffffff33', letterSpacing: '0.2em', fontFamily: 'Orbitron' }}>
            FIK CONCIERGERIE ORAN
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div style={{ fontSize: 9, color: '#ff3366', textAlign: 'center', fontFamily: 'Orbitron', letterSpacing: '0.1em' }}>
              {error}
            </div>
          )}

          <button
            onClick={onLogin}
            disabled={loading || !user || !pass}
            style={{
              marginTop: 4, padding: '14px',
              background: loading ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.1)',
              border: '1.5px solid #00d4ff55', borderRadius: 12,
              fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff',
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
  borderRadius: 10, padding: '12px 14px',
  fontFamily: 'Share Tech Mono', fontSize: 14, color: '#c8e8ff', outline: 'none',
};

// ─── Dzaryx SVG Icon ──────────────────────────────────────────────────────────

function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#050d1a" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#00d4ff" strokeWidth="0.8" strokeOpacity="0.25" strokeDasharray="4 3" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.4" />
      <path d="M 16 16 L 22 16 M 16 16 L 16 22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 84 16 L 78 16 M 84 16 L 84 22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 16 84 L 22 84 M 16 84 L 16 78" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <path d="M 84 84 L 78 84 M 84 84 L 84 78" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
      <rect x="30" y="30" width="40" height="32" rx="7" fill="#00d4ff0d" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="50" y1="30" x2="50" y2="22" stroke="#00d4ff" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" />
      <circle cx="50" cy="20" r="3" fill="#00d4ff" fillOpacity="0.9" />
      {glow && <circle cx="50" cy="20" r="5" fill="#00d4ff" fillOpacity="0.2" />}
      <rect x="35" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.9" />
      <rect x="53" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.9" />
      {glow && (
        <>
          <rect x="35" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.3" />
          <rect x="53" y="37" width="12" height="9" rx="3" fill="#00d4ff" fillOpacity="0.3" />
        </>
      )}
      <rect x="36" y="51" width="28" height="4" rx="2" fill="#00d4ff" fillOpacity="0.5" />
      <rect x="44" y="62" width="12" height="5" rx="2" fill="#00d4ff" fillOpacity="0.3" />
      <rect x="28" y="67" width="44" height="8" rx="4" fill="#00d4ff0a" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.35" />
      <circle cx="38" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.4" />
      <circle cx="50" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.6" />
      <circle cx="62" cy="88" r="1.5" fill="#00d4ff" fillOpacity="0.4" />
    </svg>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ wsOk, page, actorCol, actorInit, onLogout }: {
  wsOk: boolean; page: Page;
  actorCol: string; actorInit: string; onLogout: () => void;
}) {
  const tab = TABS.find(t => t.id === page);
  return (
    <div style={{
      width: '100%',
      background: 'rgba(0,0,0,0.95)',
      borderBottom: '1px solid #00d4ff12',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px',
      paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
      flexShrink: 0,
    }}>
      <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff66', letterSpacing: '0.15em' }}>
        DZARYX
      </span>
      <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: wsOk ? '#00d4ff' : '#ff3366', letterSpacing: '0.15em' }}>
        {tab?.icon} {tab?.label}
      </span>
      <button
        onClick={onLogout}
        title="Déconnexion"
        style={{
          cursor: 'pointer', padding: 0,
          width: 24, height: 24, borderRadius: '50%',
          background: `${actorCol}22`, border: `1px solid ${actorCol}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Orbitron', fontSize: 9, color: actorCol,
        }}
      >
        {actorInit}
      </button>
    </div>
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

function NavBar({ page, onPage, actor }: { page: Page; onPage: (p: Page) => void; actor: string }) {
  const visibleTabs = TABS.filter(t =>
    (!t.kouiderOnly || actor === 'kouider') &&
    (!t.houariOnly  || actor === 'houari')
  );
  return (
    <div style={{
      width: '100%',
      background: 'rgba(0,0,0,0.97)',
      borderTop: '1px solid #00d4ff12',
      display: 'flex', alignItems: 'stretch',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {visibleTabs.map(tab => {
        const active = page === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onPage(tab.id)}
            style={{
              minWidth: 52, flex: '0 0 auto',
              height: 54,
              background: active ? '#00d4ff0d' : 'transparent',
              border: 'none',
              borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{
              fontFamily: 'Orbitron', fontSize: 5.5,
              color: active ? '#00d4ff' : '#ffffff33',
              letterSpacing: '0.08em',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
