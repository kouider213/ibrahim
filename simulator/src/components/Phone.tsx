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
import ImmoProScreen from './screens/ImmoProScreen.tsx';
import DealsScreen from './screens/DealsScreen.tsx';
import OpportunitiesScreen from './screens/OpportunitiesScreen.tsx';
import DemandesScreen from './screens/DemandesScreen.tsx';
import NewsletterScreen from './screens/NewsletterScreen.tsx';
import CaisseScreen from './screens/CaisseScreen.tsx';
import ReviewsScreen from './screens/ReviewsScreen.tsx';
import BlogScreen from './screens/BlogScreen.tsx';
import DevisScreen from './screens/DevisScreen.tsx';
import ReponseScreen from './screens/ReponseScreen.tsx';
import CommandCenterScreen from './screens/CommandCenterScreen.tsx';
import ForecastScreen from './screens/ForecastScreen.tsx';
import ReengageScreen from './screens/ReengageScreen.tsx';
import SocialScreen from './screens/SocialScreen.tsx';
import SearchScreen from './screens/SearchScreen.tsx';
import ParrainageScreen from './screens/ParrainageScreen.tsx';
import PricingScreen from './screens/PricingScreen.tsx';
import { setSimActor, registerWebPush } from '../services/api.ts';

export type Page =
  | 'voice' | 'text' | 'bookings' | 'fleet' | 'revenue'
  | 'clients' | 'documents' | 'calendar'
  | 'settings' | 'immo' | 'deals' | 'leads' | 'newsletter' | 'caisse' | 'reviews' | 'blog' | 'devis' | 'reponse'
  | 'aujourdhui' | 'forecast' | 'reengage' | 'social' | 'search' | 'parrainage' | 'pricing' | 'opportunities' | 'plus';

type SimState = 'locked' | 'home' | 'login' | 'app';
type Actor = 'kouider' | 'houari';

const CREDS: Record<string, { password: string; actor: Actor }> = {
  kouider: { password: 'kouider31', actor: 'kouider' },
  houari:  { password: 'houari31',  actor: 'houari'  },
};

const TABS: Array<{ id: Page; icon: string; label: string; kouiderOnly?: boolean; houariOnly?: boolean; group?: 'tool' }> = [
  // ── Barre du bas (essentiels) ──
  { id: 'aujourdhui',    icon: '☀️', label: "AUJOURD'HUI", kouiderOnly: true },
  { id: 'voice',         icon: '🎙️', label: 'VOIX'    },
  { id: 'text',          icon: '💬', label: 'CHAT'    },
  { id: 'leads',         icon: '📥', label: 'DEMANDES' },
  { id: 'fleet',         icon: '🚗', label: 'PARC'    },
  { id: 'revenue',       icon: '💰', label: 'CA'      },
  { id: 'clients',       icon: '👥', label: 'CLIENTS' },
  { id: 'settings',      icon: '⚙️', label: 'CONFIG'  },
  // ── Menu "⋯ Plus" (outils) ──
  { id: 'search',        icon: '🔍', label: 'CHERCHER', group: 'tool' },
  { id: 'devis',         icon: '🧮', label: 'DEVIS',   kouiderOnly: true, group: 'tool' },
  { id: 'reponse',       icon: '🗨️', label: 'RÉPONSE', kouiderOnly: true, group: 'tool' },
  { id: 'bookings',      icon: '📋', label: 'LOCATIONS', group: 'tool' },
  { id: 'immo',          icon: '🏠', label: 'IMMO',    group: 'tool' },
  { id: 'deals',         icon: '🔁', label: 'ACHAT',   group: 'tool' },
  { id: 'opportunities', icon: '💡', label: 'OPPORTUNITÉS', kouiderOnly: true, group: 'tool' },
  { id: 'calendar',      icon: '📅', label: 'AGENDA',  group: 'tool' },
  { id: 'caisse',        icon: '🧾', label: 'CAISSE',  kouiderOnly: true, group: 'tool' },
  { id: 'reviews',       icon: '⭐', label: 'AVIS',    kouiderOnly: true, group: 'tool' },
  { id: 'reengage',      icon: '🔁', label: 'RELANCE', kouiderOnly: true, group: 'tool' },
  { id: 'parrainage',    icon: '🎁', label: 'PARRAINAGE', kouiderOnly: true, group: 'tool' },
  { id: 'social',        icon: '📱', label: 'SOCIAL',  kouiderOnly: true, group: 'tool' },
  { id: 'forecast',      icon: '📈', label: 'PRÉVISION', kouiderOnly: true, group: 'tool' },
  { id: 'pricing',       icon: '🏷️', label: 'PRIX',    kouiderOnly: true, group: 'tool' },
  { id: 'newsletter',    icon: '📣', label: 'NEWS',    kouiderOnly: true, group: 'tool' },
  { id: 'blog',          icon: '✍️', label: 'BLOG',    kouiderOnly: true, group: 'tool' },
  { id: 'documents',     icon: '📄', label: 'DOCS',    kouiderOnly: true, group: 'tool' },
];

function getSavedSession(): { actor: Actor; user: string } | null {
  try {
    const s = localStorage.getItem('dzaryx_session');
    return s ? (JSON.parse(s) as { actor: Actor; user: string }) : null;
  } catch { return null; }
}

interface Notif { text: string; deepLink?: Page }

export default function Phone() {
  const [page, setPage]       = useState<Page>('voice');
  const [showOnboard, setShowOnboard] = useState<boolean>(() => { try { return !localStorage.getItem('dz:onboarded'); } catch { return false; } });
  const [wsOk, setWsOk]       = useState(false);
  const [notif, setNotif]     = useState<Notif | null>(null);
  const notifTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (loggedActor) {
      setSimActor(loggedActor);
      void registerWebPush();
    }
  }, [loggedActor]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { text, deepLink } = (e as CustomEvent<{ text: string; deepLink?: string }>).detail;
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      setNotif({ text, deepLink: deepLink as Page | undefined });
      notifTimerRef.current = setTimeout(() => setNotif(null), 5000);
    };
    window.addEventListener('Dzaryx:notify', handler);

    // SW notificationclick → navigate to deepLink page
    const swHandler = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'NOTIF_CLICK') {
        const dl = (e.data as { deepLink?: string }).deepLink;
        if (dl) setPage(dl as Page);
        setSimState('app');
      }
    };
    navigator.serviceWorker?.addEventListener('message', swHandler);

    return () => {
      window.removeEventListener('Dzaryx:notify', handler);
      navigator.serviceWorker?.removeEventListener('message', swHandler);
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, []);

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
      void registerWebPush();
    }, 600);
  };

  const actor = loggedActor ?? 'kouider';

  const houariOnlyPages: Page[] = [];
  const kouiderOnlyPages: Page[] = ['documents'];

  const safePage: Page = (() => {
    if (actor === 'houari' && kouiderOnlyPages.includes(page)) return 'voice';
    if (actor === 'kouider' && houariOnlyPages.includes(page)) return 'voice';
    return page;
  })();

  const renderScreen = () => {
    switch (safePage) {
      case 'voice':         return <VoiceScreen onNavigateText={() => setPage('text')} onWsStatus={setWsOk} actor={actor} />;
      case 'text':          return <TextScreen onNavigateVoice={() => setPage('voice')} actor={actor} />;
      case 'bookings':      return <BookingsScreen actor={actor} />;
      case 'fleet':         return <FleetScreen actor={actor} />;
      case 'revenue':       return <RevenueScreen actor={actor} />;
      case 'clients':       return <ClientsScreen />;
      case 'leads':         return <DemandesScreen />;
      case 'newsletter':    return <NewsletterScreen />;
      case 'caisse':        return <CaisseScreen />;
      case 'reviews':       return <ReviewsScreen />;
      case 'blog':          return <BlogScreen />;
      case 'devis':         return <DevisScreen />;
      case 'reponse':       return <ReponseScreen />;
      case 'aujourdhui':    return <CommandCenterScreen />;
      case 'forecast':      return <ForecastScreen />;
      case 'reengage':      return <ReengageScreen />;
      case 'social':        return <SocialScreen />;
      case 'search':        return <SearchScreen onOpen={(p) => setPage(p as Page)} />;
      case 'parrainage':    return <ParrainageScreen />;
      case 'pricing':       return <PricingScreen />;
      case 'plus':          return <ToolsGrid onOpen={setPage} actor={actor} />;
      case 'documents':     return <DocumentsScreen />;
      case 'calendar':      return <CalendarScreen />;
      case 'settings':      return <SettingsScreen />;
      case 'immo':          return <ImmoProScreen />;
      case 'deals':         return <DealsScreen />;
      case 'opportunities': return <OpportunitiesScreen />;
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
          <StatusBar wsOk={wsOk} page={safePage} actorCol={actorCol} actorInit={actorInit} onLogout={logout} />
          <OfflineBanner />
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {renderScreen()}
          </div>
          <NavBar page={safePage} onPage={setPage} actor={loggedActor ?? 'kouider'} />
          {showOnboard && <Onboarding onDone={() => { try { localStorage.setItem('dz:onboarded', '1'); } catch { /* ignore */ } setShowOnboard(false); }} />}
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
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#10b98144', letterSpacing: '0.3em' }}>
            DÉCONNEXION…
          </div>
        </div>
      )}

      {/* Notification banner */}
      {notif && simState === 'app' && (
        <div style={{
          position: 'absolute', top: 38, left: 8, right: 8, zIndex: 30,
          background: 'rgba(2,8,20,0.97)',
          border: '1px solid #10b98144',
          borderRadius: 12,
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 24px rgba(16,185,129,0.2)',
          animation: 'fadeIn 0.25s ease',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ fontSize: 16, flexShrink: 0 }}>
            {notif.text.startsWith('🚨') || notif.text.startsWith('🔴') ? '🚨'
              : notif.text.startsWith('💰') ? '💰'
              : notif.text.startsWith('☀️') ? '☀️'
              : '🔔'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#10b981', letterSpacing: '0.15em', marginBottom: 2 }}>
              DZARYX
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: '#c8e8ff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {notif.text.replace(/^[^\s]+\s/, '').slice(0, 60)}
            </div>
          </div>
          {notif.deepLink && (
            <button
              onClick={() => { setPage(notif.deepLink!); setNotif(null); }}
              style={{
                background: 'rgba(16,185,129,0.12)', border: '1px solid #10b98155',
                borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                fontFamily: 'Orbitron', fontSize: 6, color: '#10b981', letterSpacing: '0.12em',
                flexShrink: 0,
              }}
            >
              VOIR
            </button>
          )}
          <button
            onClick={() => setNotif(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#ffffff33', fontSize: 12, padding: '0 2px', flexShrink: 0,
            }}
          >
            ×
          </button>
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
        background: 'radial-gradient(ellipse at 50% 30%, #050e22 0%, #0a0a0c 50%, #000000 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        userSelect: 'none',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(16,185,129,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16,185,129,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, black 20%, transparent 100%)',
      }} />
      {/* Ambient glow center */}
      <div style={{
        position: 'absolute', top: '28%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, zIndex: 1 }}>
        {/* Time */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'Orbitron', fontSize: 72, fontWeight: 700,
            color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1,
            textShadow: '0 0 40px rgba(16,185,129,0.25)',
          }}>
            {getTime()}
          </div>
          <div style={{
            fontFamily: 'Inter', fontSize: 13, fontWeight: 400,
            color: 'rgba(255,255,255,0.35)', marginTop: 10, letterSpacing: '0.06em',
          }}>
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* Icon with halo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'absolute', width: 140, height: 140, borderRadius: '50%',
            border: '1px solid rgba(16,185,129,0.12)',
            animation: 'halo-breathe 3s ease-in-out infinite',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          <div style={{
            position: 'absolute', width: 110, height: 110, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'halo-breathe 3s ease-in-out infinite',
          }} />
          <DzaryxIcon size={88} glow />
        </div>

        <div style={{
          fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
          color: 'rgba(16,185,129,0.4)', letterSpacing: '0.3em',
          textTransform: 'uppercase',
        }}>
          Appuyer pour continuer
        </div>
      </div>

      <div style={{ paddingBottom: 28, zIndex: 1 }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }} />
      </div>
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <div style={{
      flex: 1,
      background: 'radial-gradient(ellipse at 50% 25%, #050e22 0%, #0a0a0c 55%, #000 100%)',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 10%, transparent 100%)',
      }} />

      {/* Top time */}
      <div style={{ textAlign: 'center', paddingTop: 24, zIndex: 1 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 40, fontWeight: 700, color: '#fff', textShadow: '0 0 24px rgba(16,185,129,0.2)' }}>
          {getTime()}
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginTop: 6, letterSpacing: '0.04em' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* App icon */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <button
          onClick={onOpenApp}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: -16, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
                animation: 'halo-breathe 3s ease-in-out infinite',
              }} />
              <div style={{
                borderRadius: 28, overflow: 'hidden',
                boxShadow: '0 0 30px rgba(16,185,129,0.3), 0 0 60px rgba(16,185,129,0.1), 0 8px 32px rgba(0,0,0,0.6)',
                border: '1px solid rgba(16,185,129,0.25)',
              }}>
                <DzaryxIcon size={108} />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.3em' }}>
                DZARYX
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(16,185,129,0.5)', marginTop: 3, letterSpacing: '0.08em' }}>
                Assistant IA · Fik Conciergerie
              </div>
            </div>
          </div>
        </button>
      </div>

      <div style={{ paddingBottom: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.15)' }} />
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
      background: 'radial-gradient(ellipse at 50% 40%, #050e22 0%, #0a0a0c 60%, #000 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 0, padding: '0 28px',
      position: 'relative', overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 20%, transparent 100%)',
      }} />
      {/* Center glow */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 320, height: 320,
        background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, width: '100%', maxWidth: 360, animation: 'fadeUp 0.5s ease both' }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -12, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)',
              animation: 'halo-breathe 3s ease-in-out infinite',
            }} />
            <DzaryxIcon size={80} glow />
          </div>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 900, color: '#10b981', letterSpacing: '0.4em', textShadow: '0 0 20px rgba(16,185,129,0.4)', textAlign: 'center' }}>
              DZARYX
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em', textAlign: 'center', marginTop: 4 }}>
              FIK CONCIERGERIE · ORAN
            </div>
          </div>
        </div>

        {/* Form card */}
        <div style={{
          width: '100%',
          background: 'rgba(7,17,31,0.6)',
          border: '1px solid rgba(16,185,129,0.12)',
          borderRadius: 20,
          padding: '24px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, color: 'rgba(16,185,129,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Identifiant
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, color: 'rgba(16,185,129,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Mot de passe
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
            <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: '#ff3366', textAlign: 'center', animation: 'fadeIn 0.2s ease' }}>
              {error}
            </div>
          )}

          <button
            onClick={onLogin}
            disabled={loading || !user || !pass}
            style={{
              marginTop: 4, padding: '15px',
              background: loading ? 'rgba(16,185,129,0.12)' : (!user || !pass ? 'rgba(16,185,129,0.06)' : 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(0,180,220,0.12) 100%)'),
              border: `1.5px solid ${!user || !pass ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.45)'}`,
              borderRadius: 14,
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: !user || !pass ? 'rgba(16,185,129,0.3)' : '#10b981',
              cursor: loading || !user || !pass ? 'default' : 'pointer',
              letterSpacing: '0.2em',
              boxShadow: !user || !pass ? 'none' : '0 0 20px rgba(16,185,129,0.2)',
              transition: 'all 0.2s ease',
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
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(16,185,129,0.18)',
  borderRadius: 12, padding: '13px 16px',
  fontFamily: 'Inter', fontSize: 15, fontWeight: 400,
  color: 'rgba(255,255,255,0.88)', outline: 'none',
  transition: 'border-color 0.2s ease',
};

// ─── Dzaryx SVG Icon ──────────────────────────────────────────────────────────

function DzaryxIcon({ size = 80, glow = false }: { size?: number; glow?: boolean }) {
  // Orbe IA (identique à l'icône d'app) — rendu vectoriel, net à toute taille.
  const uid = `dz${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', filter: glow ? 'drop-shadow(0 0 14px rgba(52,245,224,0.45)) drop-shadow(0 0 30px rgba(16,182,200,0.18))' : undefined }}>
      <defs>
        <radialGradient id={`${uid}bg`} cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#0e1417" /><stop offset="100%" stopColor="#050608" />
        </radialGradient>
        <radialGradient id={`${uid}glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34f5e0" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#10b6c8" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#10b6c8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}orb`} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#eafffb" /><stop offset="32%" stopColor="#5ef0df" />
          <stop offset="70%" stopColor="#13b9c9" /><stop offset="100%" stopColor="#0a6f86" />
        </radialGradient>
        <linearGradient id={`${uid}ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd76a" /><stop offset="100%" stopColor="#f0a93a" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${uid}bg)`} />
      <circle cx="256" cy="256" r="200" fill={`url(#${uid}glow)`} />
      <circle cx="256" cy="256" r="132" fill="none" stroke={`url(#${uid}ring)`} strokeWidth="6" opacity="0.85" />
      <circle cx="256" cy="256" r="104" fill={`url(#${uid}orb)`} />
      <ellipse cx="224" cy="216" rx="40" ry="26" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}

// ─── Offline Banner ───────────────────────────────────────────────────────────
function OfflineBanner() {
  const [offline, setOff] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  useEffect(() => {
    const goOff = () => setOff(true);
    const goOn = () => setOff(false);
    const custom = (e: Event) => setOff(!!(e as CustomEvent).detail);
    window.addEventListener('offline', goOff);
    window.addEventListener('online', goOn);
    window.addEventListener('dz:offline', custom as EventListener);
    return () => {
      window.removeEventListener('offline', goOff);
      window.removeEventListener('online', goOn);
      window.removeEventListener('dz:offline', custom as EventListener);
    };
  }, []);
  if (!offline) return null;
  return (
    <div style={{ background: 'rgba(255,179,71,0.16)', borderBottom: '1px solid rgba(255,179,71,0.3)', color: '#ffb347', fontSize: 11, fontWeight: 700, fontFamily: 'Inter, sans-serif', textAlign: 'center', padding: '5px 8px', flexShrink: 0 }}>
      ⚠️ Hors ligne — données de la dernière synchro
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({ wsOk, page, actorCol, actorInit, onLogout }: {
  wsOk: boolean; page: Page;
  actorCol: string; actorInit: string; onLogout: () => void;
}) {
  const tab = TABS.find(t => t.id === page);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div style={{
      width: '100%',
      background: 'rgba(2,5,14,0.97)',
      borderBottom: '1px solid rgba(16,185,129,0.08)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Safe-area spacer */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)' }} />

      {/* Actual content row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 44,
      }}>
        {/* Brand */}
        <span style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: 'rgba(16,185,129,0.55)', letterSpacing: '0.2em' }}>
          DZARYX
        </span>

        {/* Current page pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20,
          background: wsOk ? 'rgba(16,185,129,0.06)' : 'rgba(255,51,102,0.06)',
          border: `1px solid ${wsOk ? 'rgba(16,185,129,0.18)' : 'rgba(255,51,102,0.2)'}`,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: wsOk ? '#10b981' : '#ff3366',
            boxShadow: `0 0 6px ${wsOk ? '#10b981' : '#ff3366'}`,
            animation: 'statusPulse 2s ease infinite',
          }} />
          <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: wsOk ? 'rgba(16,185,129,0.85)' : '#ff3366', letterSpacing: '0.06em' }}>
            {tab?.label ?? page.toUpperCase()}
          </span>
        </div>

        {/* Right side: actor avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Actor avatar — tap = menu déconnexion */}
          <button
            onClick={() => setShowMenu(m => !m)}
            style={{
              cursor: 'pointer', padding: 0,
              width: 32, height: 32, borderRadius: '50%',
              background: `${actorCol}18`,
              border: `1.5px solid ${actorCol}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: actorCol,
              boxShadow: `0 0 10px ${actorCol}22`,
            }}
          >
            {actorInit}
          </button>
        </div>
      </div>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 98 }}
          />
          <div style={{
            position: 'absolute', top: '100%', right: 12, zIndex: 99,
            background: 'rgba(3,9,20,0.97)',
            border: '1px solid rgba(16,185,129,0.15)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 160,
          }}>
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid rgba(16,185,129,0.08)',
              fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
              color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              Connecté en tant que {actorInit === 'K' ? 'Kouider' : 'Houari'}
            </div>
            <button
              onClick={() => { setShowMenu(false); onLogout(); }}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: 'Inter', fontSize: 13, fontWeight: 500,
                color: '#ff3366',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16 }}>⏻</span>
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Nav Bar ──────────────────────────────────────────────────────────────────

function NavBar({ page, onPage, actor }: { page: Page; onPage: (p: Page) => void; actor: string }) {
  const visibleTabs = TABS.filter(t =>
    t.group !== 'tool' &&
    (!t.kouiderOnly || actor === 'kouider') &&
    (!t.houariOnly  || actor === 'houari')
  );
  const actorAccent = actor === 'houari' ? '#7c3aed' : '#10b981';
  const onToolPage = TABS.some(t => t.group === 'tool' && t.id === page);
  const tabBtn = (id: Page, icon: string, label: string, active: boolean) => (
    <button key={id} onClick={() => onPage(id)} style={{
      minWidth: 58, flex: '0 0 auto', height: 58,
      background: active ? `${actorAccent}0c` : 'transparent', border: 'none',
      borderTop: active ? `2px solid ${actorAccent}` : '2px solid transparent',
      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1, filter: active ? `drop-shadow(0 0 6px ${actorAccent}88)` : 'none' }}>{icon}</span>
      <span style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: active ? 700 : 400, color: active ? actorAccent : 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </button>
  );
  return (
    <div style={{
      width: '100%',
      background: 'rgba(2,5,14,0.98)',
      borderTop: '1px solid rgba(16,185,129,0.07)',
      display: 'flex', alignItems: 'stretch',
      overflowX: 'auto',
      scrollbarWidth: 'none',
      flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {visibleTabs.map(tab => tabBtn(tab.id, tab.icon, tab.label, page === tab.id))}
      {tabBtn('plus', '⋯', 'PLUS', page === 'plus' || onToolPage)}
    </div>
  );
}

// ─── Tools Grid (menu "Plus") ─────────────────────────────────────────────────
function ToolsGrid({ onOpen, actor }: { onOpen: (p: Page) => void; actor: string }) {
  const tools = TABS.filter(t =>
    t.group === 'tool' &&
    (!t.kouiderOnly || actor === 'kouider') &&
    (!t.houariOnly  || actor === 'houari')
  );
  const accent = actor === 'houari' ? '#7c3aed' : '#10b981';
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0a0a0c', color: '#f5f5f7', fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif', padding: '20px 16px 30px' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Outils</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Plus d'outils</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => onOpen(t.id)} style={{
            background: '#16161c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
            padding: '16px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.75)', textAlign: 'center', letterSpacing: '0.02em' }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Onboarding (1ère ouverture) ──────────────────────────────────────────────
function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const slides = [
    { icon: '🔮', title: 'Bienvenue sur Dzaryx', text: "Ton assistant IA qui gère toute ta conciergerie : voitures, immo, demandes, finances — depuis ton téléphone." },
    { icon: '💬', title: 'Parle, écris, demande', text: 'Vocal ou chat : crée une résa, un devis, une réponse client dans sa langue. Dzaryx fait le reste.' },
    { icon: '⚡', title: 'Tout est synchronisé', text: 'Ton site et l\'app partagent les mêmes données. Réservations, agenda Google, avis, newsletter — automatique.' },
  ];
  const s = slides[step];
  const last = step === slides.length - 1;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'radial-gradient(120% 100% at 50% 0%, #0e1417, #050608)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ marginBottom: 24 }}><DzaryxIcon size={96} glow /></div>
      <div style={{ fontSize: 40, marginBottom: 14 }}>{s.icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 12, letterSpacing: '-0.02em' }}>{s.title}</div>
      <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: 320, marginBottom: 30 }}>{s.text}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 26 }}>
        {slides.map((_, i) => (
          <div key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 4, background: i === step ? '#34f5e0' : 'rgba(255,255,255,0.2)', transition: 'all .2s' }} />
        ))}
      </div>
      <button onClick={() => last ? onDone() : setStep(step + 1)} style={{ width: '100%', maxWidth: 320, padding: '15px', borderRadius: 14, border: 'none', background: 'linear-gradient(120deg, #13b9c9, #34f5e0)', color: '#04201f', fontFamily: 'Inter', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>{last ? 'Commencer 🚀' : 'Suivant'}</button>
      {!last && <button onClick={onDone} style={{ marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer' }}>Passer</button>}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
