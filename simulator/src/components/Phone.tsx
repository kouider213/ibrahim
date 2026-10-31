import { useState, useEffect, useRef, useCallback } from 'react';
import DzaryxIcon from './ui/DzaryxLogo.tsx';
import VoiceScreen, { prepareCallAudio } from './screens/VoiceScreen.tsx';
import CallOverlay from './CallOverlay.tsx';
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
import ReservationVoucherScreen from './screens/ReservationVoucherScreen.tsx';
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
import DemarchageScreen from './screens/DemarchageScreen.tsx';
import SitesScreen from './screens/SitesScreen.tsx';
import PartnersScreen from './screens/PartnersScreen.tsx';
import PaiementsScreen from './screens/PaiementsScreen.tsx';
import StudioScreen from './screens/StudioScreen.tsx';
import CarteScreen from './screens/CarteScreen.tsx';
import NexusScreen from './screens/NexusScreen.tsx';
import PhoneCamScreen from './screens/PhoneCamScreen.tsx';
import RouteScreen from './screens/RouteScreen.tsx';
import GlobeScreen from './screens/GlobeScreen.tsx';
import FormeScreen from './screens/FormeScreen.tsx';
import FennouScreen from './screens/FennouScreen.tsx';
import LiberteScreen from './screens/LiberteScreen.tsx';
import JarvisScreen from './screens/JarvisScreen.tsx';
import CoachScreen from './screens/CoachScreen.tsx';
import JeuxScreen from './screens/JeuxScreen.tsx';
import { setSimActor, resumeWebPush, business, callApi, loginDevice, logoutDevice, setDeviceToken, getDeviceToken } from '../services/api.ts';

export type Page =
  | 'voice' | 'text' | 'bookings' | 'fleet' | 'revenue'
  | 'clients' | 'documents' | 'calendar'
  | 'settings' | 'immo' | 'deals' | 'leads' | 'newsletter' | 'caisse' | 'reviews' | 'blog' | 'devis' | 'reponse'
  | 'aujourdhui' | 'forecast' | 'reengage' | 'social' | 'search' | 'parrainage' | 'pricing' | 'opportunities' | 'voucher' | 'demarchage' | 'sites' | 'partners' | 'paiements' | 'studio' | 'carte' | 'nexus' | 'globe' | 'camera' | 'route' | 'sport' | 'coach' | 'fennou' | 'liberte' | 'jeux' | 'jarvis' | 'plus';

type SimState = 'locked' | 'home' | 'login' | 'app';
type Actor = 'kouider' | 'houari';


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
  // ── Menu "⋯ Plus" (outils) ── (31/10 : JEUX et CARTE LIVE retirés du menu à la demande de Kouider, jamais utilisés ; code gardé, démo ?demo=carte intacte)
  { id: 'coach',         icon: '🏆', label: 'COACH',   kouiderOnly: true, group: 'tool' },
  { id: 'jarvis',        icon: '🦾', label: 'JARVIS',  kouiderOnly: true, group: 'tool' },
  { id: 'search',        icon: '🔍', label: 'CHERCHER', group: 'tool' },
  { id: 'fennou',        icon: '🦊', label: 'FENNOU',  kouiderOnly: true, group: 'tool' },
  { id: 'sport',         icon: '💪', label: 'FORME',   kouiderOnly: true, group: 'tool' },
  { id: 'liberte',       icon: '🕊️', label: 'LIBERTÉ', kouiderOnly: true, group: 'tool' },
  { id: 'nexus',         icon: '🖥️', label: 'MON PC',  kouiderOnly: true, group: 'tool' },
  { id: 'globe',         icon: '🌍', label: 'GLOBE',   kouiderOnly: true, group: 'tool' },
  { id: 'route',         icon: '🚗', label: 'ROUTE',   kouiderOnly: true, group: 'tool' },
  { id: 'camera',        icon: '👁️', label: 'CAMÉRA → PC', kouiderOnly: true, group: 'tool' },
  { id: 'demarchage',    icon: '📤', label: 'DÉMARCHAGE', kouiderOnly: true, group: 'tool' },
  { id: 'partners',      icon: '🤝', label: 'PARTENAIRES', kouiderOnly: true, group: 'tool' },
  { id: 'sites',         icon: '🌐', label: 'SITES CLIENTS', kouiderOnly: true, group: 'tool' },
  { id: 'studio',        icon: '🎬', label: 'MONTAGE', kouiderOnly: true, group: 'tool' },
  { id: 'paiements',     icon: '💳', label: 'À PAYER', kouiderOnly: true, group: 'tool' },
  { id: 'devis',         icon: '🧮', label: 'DEVIS',   kouiderOnly: true, group: 'tool' },
  { id: 'voucher',       icon: '🧾', label: 'BON RÉSA', kouiderOnly: true, group: 'tool' },
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
    // Session valable seulement avec un jeton d'appareil remis par le serveur (connexion du 14/10/2026)
    if (!getDeviceToken()) return null;
    const s = localStorage.getItem('dzaryx_session');
    return s ? (JSON.parse(s) as { actor: Actor; user: string }) : null;
  } catch { return null; }
}

interface Notif { text: string; deepLink?: Page }

// « nexus-cloud » (notifications du PC cloud) = écran MON PC, directement sur le PC cloud
function resolveDeepLink(dl: string): Page {
  if (dl === 'nexus-cloud') {
    try { localStorage.setItem('dz:pc_target', 'cloud'); } catch { /* ignore */ }
    return 'nexus';
  }
  return dl as Page;
}

export default function Phone() {
  // Lien PC : ?carte=1 → ouvre directement la Carte live en grand
  const carteLink = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('carte');
  // Dev seulement : ?page=xxx ouvre la page directement (captures d'écran du design)
  const devPage = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('page') as Page | null : null;
  const [page, setPage]       = useState<Page>(devPage ?? (carteLink ? 'carte' : 'voice'));
  const [showOnboard, setShowOnboard] = useState<boolean>(() => { try { return !localStorage.getItem('dz:onboarded'); } catch { return false; } });
  const [wsOk, setWsOk]       = useState(false);
  // Hors de la page vocale (pas de socket), une lecture réussie suffit pour afficher « EN LIGNE »
  useEffect(() => {
    const onNet = (e: Event) => setWsOk(!(e as CustomEvent).detail);
    window.addEventListener('dz:offline', onNet as EventListener);
    return () => window.removeEventListener('dz:offline', onNet as EventListener);
  }, []);
  const [notif, setNotif]     = useState<Notif | null>(null);
  // Appels Dzaryx : ringing = « Dzaryx t'appelle » à l'écran ; activeCall = conversation en cours (écran Voix)
  const [ringing, setRinging]       = useState<{ id: string; reason: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ id?: string; incoming: boolean; key: number } | null>(null);
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
      void resumeWebPush(); // silencieux : re-souscrit si déjà autorisé (jamais de prompt hors gesture)
      // Détection GPS AUTO au démarrage de l'app (silencieux) : rafraîchit la position
      // si la permission est déjà accordée → le fuseau/les trajets suivent où tu es.
      if (navigator.geolocation) {
        const auto = () => navigator.geolocation.getCurrentPosition(
          pos => { void business.shareLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
          () => {}, { timeout: 10000, enableHighAccuracy: false },
        );
        const np = navigator.permissions;
        if (np?.query) np.query({ name: 'geolocation' as PermissionName }).then(p => { if (p.state === 'granted') auto(); }).catch(() => {});
        else auto();
      }
    }
  }, [loggedActor]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { text, deepLink } = (e as CustomEvent<{ text: string; deepLink?: string }>).detail;
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      setNotif({ text, deepLink: deepLink ? resolveDeepLink(deepLink) : undefined });
      notifTimerRef.current = setTimeout(() => setNotif(null), 5000);
    };
    window.addEventListener('Dzaryx:notify', handler);

    // SW notificationclick → navigate to deepLink page
    const swHandler = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'NOTIF_CLICK') {
        const dl = (e.data as { deepLink?: string }).deepLink;
        if (dl && dl !== 'call') setPage(resolveDeepLink(dl));   // 'call' : géré par l'écran d'appel
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

  // ── Appels Dzaryx ─────────────────────────────────────────────────────────
  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;
  const checkPendingCall = () => {
    if (!getSavedSession() || activeCallRef.current) return;
    callApi.pending()
      .then(r => { if (r.call && !activeCallRef.current) setRinging({ id: r.call.id, reason: r.call.reason }); })
      .catch(() => {});
  };

  useEffect(() => {
    // App lancée depuis une notif (app fermée) : ?deeplink=<page> ou ?deeplink=call
    const dl = new URLSearchParams(window.location.search).get('deeplink');
    if (dl) {
      if (dl === 'call') checkPendingCall();
      else if (dl === 'nexus-cloud') setPage(resolveDeepLink(dl));
      else if (TABS.some(t => t.id === dl)) setPage(dl as Page);
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
    } else {
      checkPendingCall();   // ouverte depuis l'écran d'accueil pendant que Dzaryx appelle
    }
    const onIncoming = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; reason: string }>).detail;
      if (!activeCallRef.current) setRinging(d);
    };
    const onSw = (e: MessageEvent) => {
      const m = e.data as { type?: string; deepLink?: string } | null;
      if (m?.type === 'NOTIF_CLICK' && m.deepLink === 'call') checkPendingCall();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') checkPendingCall(); };
    window.addEventListener('Dzaryx:incoming_call', onIncoming);
    navigator.serviceWorker?.addEventListener('message', onSw);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('Dzaryx:incoming_call', onIncoming);
      navigator.serviceWorker?.removeEventListener('message', onSw);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sonnerie sans réponse → s'arrête après 3 min (comme côté serveur)
  useEffect(() => {
    if (!ringing) return;
    const t = setTimeout(() => setRinging(null), 180_000);
    return () => clearTimeout(t);
  }, [ringing]);

  // Quitter l'écran Voix pendant un appel = raccrocher
  useEffect(() => { if (page !== 'voice' && activeCall) setActiveCall(null); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const answerCall = () => {
    prepareCallAudio();                 // dans le tap : iOS débloque son + micro
    const id = ringing?.id;
    setRinging(null);
    setSimState('app');
    setPage('voice');
    setActiveCall({ id, incoming: true, key: Date.now() });
  };
  const declineCall = () => {
    const id = ringing?.id;
    setRinging(null);
    void callApi.decline(id).catch(() => {});
  };
  const startCall = () => {
    prepareCallAudio();
    setActiveCall({ incoming: false, key: Date.now() });
  };

  const unlock  = () => setSimState('home');
  const openApp = () => setSimState('login');

  const logout = () => {
    setPowering(true);
    void logoutDevice();
    setTimeout(() => {
      localStorage.removeItem('dzaryx_session');
      setLoggedActor(null);
      setLoginUser('');
      setLoginPass('');
      setSimState('locked');
      setPowering(false);
    }, 900);
  };

  // Identifiant + mot de passe vérifiés par le serveur → jeton propre à ce téléphone
  const doLogin = async () => {
    setLoginLoading(true);
    try {
      const { token, actor: who } = await loginDevice(loginUser.toLowerCase().trim(), loginPass);
      setDeviceToken(token);
      setLoggedActor(who);
      setSimActor(who);
      localStorage.setItem('dzaryx_session', JSON.stringify({ actor: who, user: loginUser.toLowerCase().trim() }));
      setLoginPass('');
      setSimState('app');
      void resumeWebPush(); // silencieux ; le prompt se fait via le bouton Réglages (geste iOS)
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : 'Connexion impossible');
      setTimeout(() => setLoginErr(''), 3000);
    } finally {
      setLoginLoading(false);
    }
  };

  // Jeton refusé par le serveur (appareil déconnecté à distance, mot de passe changé) → retour à la connexion
  useEffect(() => {
    const onExpired = () => {
      setDeviceToken(null);
      localStorage.removeItem('dzaryx_session');
      setLoggedActor(null);
      setSimState('locked');
    };
    window.addEventListener('dz:auth-expired', onExpired);
    return () => window.removeEventListener('dz:auth-expired', onExpired);
  }, []);

  const actor = loggedActor ?? 'kouider';

  const houariOnlyPages: Page[] = [];
  const kouiderOnlyPages: Page[] = ['coach', 'jarvis', 'jeux', 'fennou', 'liberte', 'documents', 'demarchage', 'sites', 'partners', 'paiements', 'studio', 'carte', 'camera', 'route'];

  const safePage: Page = (() => {
    if (actor === 'houari' && kouiderOnlyPages.includes(page)) return 'voice';
    if (actor === 'kouider' && houariOnlyPages.includes(page)) return 'voice';
    return page;
  })();

  const exitFennou = useCallback(() => setPage('plus'), []);

  const renderScreen = () => {
    switch (safePage) {
      case 'voice':         return <VoiceScreen onNavigateText={() => setPage('text')} onWsStatus={setWsOk} actor={actor}
                                call={activeCall ?? undefined} onHangup={() => setActiveCall(null)} onStartCall={startCall} />;
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
      case 'voucher':       return <ReservationVoucherScreen />;
      case 'reponse':       return <ReponseScreen />;
      case 'aujourdhui':    return <CommandCenterScreen />;
      case 'forecast':      return <ForecastScreen />;
      case 'reengage':      return <ReengageScreen />;
      case 'social':        return <SocialScreen />;
      case 'search':        return <SearchScreen onOpen={(p) => setPage(p as Page)} />;
      case 'parrainage':    return <ParrainageScreen />;
      case 'pricing':       return <PricingScreen />;
      case 'nexus':         return <NexusScreen />;
      case 'demarchage':    return <DemarchageScreen onOpen={(p) => setPage(p as Page)} />;
      case 'sites':         return <SitesScreen />;
      case 'partners':      return <PartnersScreen />;
      case 'paiements':     return <PaiementsScreen />;
      case 'studio':        return <StudioScreen />;
      case 'camera':        return <PhoneCamScreen />;
      case 'route':         return <RouteScreen />;
      case 'globe':         return <GlobeScreen />;
      case 'sport':         return <FormeScreen onExit={exitFennou} />;
      case 'fennou':        return <FennouScreen onExit={exitFennou} />;
      case 'liberte':       return <LiberteScreen />;
      case 'jeux':          return <JeuxScreen onExit={exitFennou} />;
      case 'coach':         return <CoachScreen onAsk={(prompt) => { try { localStorage.setItem('dz:ask_prompt', prompt); } catch { /* ignore */ } setPage('text'); }} />;
      case 'jarvis':        return <JarvisScreen onAsk={(prompt) => { try { localStorage.setItem('dz:ask_prompt', prompt); } catch { /* ignore */ } setPage('text'); }} />;
      case 'carte':         return <CarteScreen actor={actor} startFull={carteLink} onOpen={(p) => setPage(p as Page)} onAsk={(prompt) => { try { localStorage.setItem('dz:ask_prompt', prompt); } catch { /* ignore */ } setPage('text'); }} />;
      case 'plus':          return <ToolsGrid onOpen={setPage} actor={actor} />;
      case 'documents':     return <DocumentsScreen />;
      case 'calendar':      return <CalendarScreen />;
      case 'settings':      return <SettingsScreen />;
      case 'immo':          return <ImmoProScreen />;
      case 'deals':         return <DealsScreen />;
      case 'opportunities': return <OpportunitiesScreen onAsk={(prompt) => { try { localStorage.setItem('dz:ask_prompt', prompt); } catch { /* ignore */ } setPage('text'); }} />;
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
      background: '#03060f',
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
          <div style={{ fontFamily: 'Orbitron', fontSize: 12, color: '#38d8f588', letterSpacing: '0.3em' }}>
            DÉCONNEXION…
          </div>
        </div>
      )}

      {/* Dzaryx t'appelle */}
      {ringing && simState === 'app' && (
        <CallOverlay reason={ringing.reason} onAnswer={answerCall} onDecline={declineCall} />
      )}

      {/* Notification banner */}
      {notif && simState === 'app' && (
        <div style={{
          position: 'absolute', top: 38, left: 8, right: 8, zIndex: 30,
          background: 'rgba(2,8,20,0.97)',
          border: '1px solid #38d8f544',
          borderRadius: 12,
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 24px rgba(56,216,245,0.2)',
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
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#38d8f5', letterSpacing: '0.15em', marginBottom: 3 }}>
              DZARYX
            </div>
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, color: '#e6f4ff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {notif.text.replace(/^[^\s]+\s/, '').slice(0, 60)}
            </div>
          </div>
          {notif.deepLink && (
            <button
              onClick={() => { setPage(notif.deepLink!); setNotif(null); }}
              style={{
                background: 'rgba(56,216,245,0.12)', border: '1px solid #38d8f555',
                borderRadius: 10, padding: '0 14px', minHeight: 40, cursor: 'pointer',
                fontFamily: 'Orbitron', fontSize: 11, color: '#38d8f5', letterSpacing: '0.12em',
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
          linear-gradient(rgba(56,216,245,0.035) 1px, transparent 1px),
          linear-gradient(90deg, rgba(56,216,245,0.035) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 50% 40%, black 20%, transparent 100%)',
      }} />
      {/* Ambient glow center */}
      <div style={{
        position: 'absolute', top: '28%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(56,216,245,0.07) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, zIndex: 1 }}>
        {/* Time */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'Orbitron', fontSize: 72, fontWeight: 700,
            color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1,
            textShadow: '0 0 40px rgba(56,216,245,0.25)',
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
            border: '1px solid rgba(56,216,245,0.12)',
            animation: 'halo-breathe 3s ease-in-out infinite',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          <div style={{
            position: 'absolute', width: 110, height: 110, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(56,216,245,0.08) 0%, transparent 70%)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'halo-breathe 3s ease-in-out infinite',
          }} />
          <DzaryxIcon size={88} glow />
        </div>

        <div style={{
          fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
          color: 'rgba(56,216,245,0.4)', letterSpacing: '0.3em',
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
          linear-gradient(rgba(56,216,245,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(56,216,245,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 10%, transparent 100%)',
      }} />

      {/* Top time */}
      <div style={{ textAlign: 'center', paddingTop: 24, zIndex: 1 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 40, fontWeight: 700, color: '#fff', textShadow: '0 0 24px rgba(56,216,245,0.2)' }}>
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
                background: 'radial-gradient(circle, rgba(56,216,245,0.12) 0%, transparent 70%)',
                animation: 'halo-breathe 3s ease-in-out infinite',
              }} />
              <div style={{
                borderRadius: 28, overflow: 'hidden',
                boxShadow: '0 0 30px rgba(56,216,245,0.3), 0 0 60px rgba(56,216,245,0.1), 0 8px 32px rgba(0,0,0,0.6)',
                border: '1px solid rgba(56,216,245,0.25)',
              }}>
                <DzaryxIcon size={108} />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.3em' }}>
                DZARYX
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(56,216,245,0.5)', marginTop: 3, letterSpacing: '0.08em' }}>
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
          linear-gradient(rgba(56,216,245,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(56,216,245,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, black 20%, transparent 100%)',
      }} />
      {/* Center glow */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 320, height: 320,
        background: 'radial-gradient(circle, rgba(56,216,245,0.06) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, width: '100%', maxWidth: 360, animation: 'fadeUp 0.5s ease both' }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', inset: -12, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56,216,245,0.1) 0%, transparent 70%)',
              animation: 'halo-breathe 3s ease-in-out infinite',
            }} />
            <DzaryxIcon size={80} glow />
          </div>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 900, color: '#38d8f5', letterSpacing: '0.4em', textShadow: '0 0 20px rgba(56,216,245,0.4)', textAlign: 'center' }}>
              DZARYX
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em', textAlign: 'center', marginTop: 4 }}>
              FIK CONCIERGERIE · ORAN
            </div>
          </div>
        </div>

        {/* Form card */}
        <div style={{
          width: '100%',
          background: 'rgba(7,17,31,0.6)',
          border: '1px solid rgba(56,216,245,0.12)',
          borderRadius: 20,
          padding: '24px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: 'Inter', fontSize: 11.5, fontWeight: 600, color: 'rgba(56,216,245,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
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
            <label style={{ fontFamily: 'Inter', fontSize: 11.5, fontWeight: 600, color: 'rgba(56,216,245,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
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
              background: loading ? 'rgba(56,216,245,0.12)' : (!user || !pass ? 'rgba(56,216,245,0.06)' : 'linear-gradient(135deg, rgba(56,216,245,0.18) 0%, rgba(0,180,220,0.12) 100%)'),
              border: `1.5px solid ${!user || !pass ? 'rgba(56,216,245,0.15)' : 'rgba(56,216,245,0.45)'}`,
              borderRadius: 14,
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: !user || !pass ? 'rgba(56,216,245,0.3)' : '#38d8f5',
              cursor: loading || !user || !pass ? 'default' : 'pointer',
              letterSpacing: '0.2em',
              boxShadow: !user || !pass ? 'none' : '0 0 20px rgba(56,216,245,0.2)',
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
  border: '1px solid rgba(56,216,245,0.18)',
  borderRadius: 12, padding: '13px 16px',
  fontFamily: 'Inter', fontSize: 15, fontWeight: 400,
  color: 'rgba(255,255,255,0.88)', outline: 'none',
  transition: 'border-color 0.2s ease',
};

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
      background: 'linear-gradient(180deg, rgba(6,14,32,0.98), rgba(3,7,18,0.96))',
      borderBottom: '1px solid rgba(90,150,255,0.14)',
      boxShadow: '0 1px 0 rgba(56,216,245,0.06), 0 6px 24px rgba(0,0,0,0.35)',
      flexShrink: 0,
      position: 'relative', zIndex: 5,
    }}>
      {/* Safe-area spacer */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)' }} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', height: 50,
      }}>
        {/* Marque : emblème + DZARYX + état de la liaison */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 92 }}>
          <DzaryxIcon size={28} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{
              fontFamily: 'Orbitron', fontSize: 12, fontWeight: 800, letterSpacing: '0.26em', lineHeight: 1,
              background: 'linear-gradient(120deg, #ffffff, #38d8f5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              DZARYX
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Orbitron', fontSize: 6.5, letterSpacing: '0.2em', lineHeight: 1, color: wsOk ? '#34d399' : '#8ea3c8' }}>
              <span style={{ width: 4, height: 4, borderRadius: 1, background: wsOk ? '#34d399' : '#fbbf24', boxShadow: wsOk ? '0 0 5px #34d399' : 'none' }} />
              {wsOk ? 'EN LIGNE' : 'CONNEXION…'}
            </span>
          </div>
        </div>

        {/* Page courante */}
        <span style={{
          fontFamily: 'Orbitron', fontSize: 11, fontWeight: 600, color: '#8ea3c8', letterSpacing: '0.22em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150,
        }}>
          {tab?.label ?? (page === 'plus' ? 'OUTILS' : page.toUpperCase())}
        </span>

        {/* Avatar — tap = menu déconnexion */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 92 }}>
          <button
            onClick={() => setShowMenu(m => !m)}
            style={{
              cursor: 'pointer', padding: 0,
              width: 32, height: 32, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${actorCol}40, ${actorCol}10)`,
              border: `1.5px solid ${actorCol}77`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: actorCol,
              boxShadow: `0 0 12px ${actorCol}33`,
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
            border: '1px solid rgba(56,216,245,0.15)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 160,
          }}>
            <div style={{
              padding: '8px 14px',
              borderBottom: '1px solid rgba(56,216,245,0.08)',
              fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
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

// Les 4 onglets du bas (+ PLUS) ; le reste passe dans la grille « Plus »
const PRIMARY: Record<string, Page[]> = {
  kouider: ['aujourdhui', 'text', 'voice', 'leads'],
  houari:  ['fleet', 'text', 'voice', 'leads'],
};

function NavIcon({ id, col }: { id: Page; col: string }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: col, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'aujourdhui': return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'text':       return <svg {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14h4" /></svg>;
    case 'leads':      return <svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" /></svg>;
    case 'fleet':      return <svg {...p}><path d="M5 17h14M3 13l2-6h14l2 6v4H3z" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>;
    default:           return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
  }
}

function NavBar({ page, onPage, actor }: { page: Page; onPage: (p: Page) => void; actor: string }) {
  const accent = actor === 'houari' ? '#a78bfa' : '#38d8f5';
  const primary = (PRIMARY[actor] ?? PRIMARY.kouider)!;
  const tabs = primary.map(id => TABS.find(t => t.id === id)).filter((t): t is (typeof TABS)[number] => !!t);
  const onPlus = !primary.includes(page);
  const item = (id: Page, label: string, active: boolean) => (
    <button key={id} onClick={() => onPage(id)} style={{
      flex: 1, height: 56, background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    }}>
      {active && <div style={{ position: 'absolute', top: 0, width: 26, height: 2, borderRadius: 2, background: accent, boxShadow: `0 0 10px ${accent}` }} />}
      <div style={{ filter: active ? `drop-shadow(0 0 6px ${accent}aa)` : 'none', display: 'flex' }}>
        <NavIcon id={id} col={active ? accent : '#5d7096'} />
      </div>
      <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: active ? 700 : 500, color: active ? accent : '#5d7096', letterSpacing: '0.04em' }}>{label}</span>
    </button>
  );
  const voiceActive = page === 'voice';
  const half = Math.ceil(tabs.filter(t => t.id !== 'voice').length / 2);
  const side = tabs.filter(t => t.id !== 'voice');
  const label = (t: (typeof TABS)[number]) => t.label.charAt(0) + t.label.slice(1).toLowerCase();
  return (
    <div style={{
      width: '100%', flexShrink: 0, position: 'relative', zIndex: 5,
      background: 'linear-gradient(0deg, #030712, #060e20)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {/* Bord du haut avec une bosse sous l'orbe VOIX (au lieu d'un trait qui coupe le bouton) */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: -27, height: 28, display: 'flex', alignItems: 'flex-end', pointerEvents: 'none' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(90,150,255,0.18)', boxShadow: '0 -6px 18px rgba(0,0,0,0.35)' }} />
        <svg width="104" height="28" viewBox="0 0 104 28" style={{ display: 'block', flexShrink: 0 }}>
          <path d="M0 27.5 C22 27.5 20 1 52 1 C84 1 82 27.5 104 27.5 V28 H0 Z" fill="#060e20" />
          <path d="M0 27.5 C22 27.5 20 1 52 1 C84 1 82 27.5 104 27.5" fill="none" stroke="rgba(90,150,255,0.18)" />
        </svg>
        <div style={{ flex: 1, height: 1, background: 'rgba(90,150,255,0.18)', boxShadow: '0 -6px 18px rgba(0,0,0,0.35)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {side.slice(0, half).map(t => item(t.id, label(t), page === t.id))}
        {/* VOIX : orbe central surélevé */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => onPage('voice')} aria-label="Voix" style={{
            width: 54, height: 54, marginTop: -24, borderRadius: '50%', position: 'relative', zIndex: 1, cursor: 'pointer', padding: 0,
            background: voiceActive ? `radial-gradient(circle at 50% 35%, ${accent}66, #0a2550 75%)` : 'radial-gradient(circle at 50% 35%, #14366b, #071229 75%)',
            border: `1.5px solid ${voiceActive ? accent : accent + '66'}`,
            boxShadow: voiceActive ? `0 0 22px ${accent}88, 0 6px 18px rgba(0,0,0,0.6)` : `0 0 12px ${accent}33, 0 6px 18px rgba(0,0,0,0.6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" fill={accent} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="21" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {side.slice(half).map(t => item(t.id, label(t), page === t.id))}
        {item('plus', 'Plus', page === 'plus' || onPlus)}
      </div>
    </div>
  );
}

// ─── Tools Grid (menu "Plus") ─────────────────────────────────────────────────
// Menu « Plus » : outils rangés par thème, nom lisible + une ligne d'explication, recherche.
const TOOL_INFO: Partial<Record<Page, { name: string; hint: string; cat: string }>> = {
  bookings:      { name: 'Locations',      hint: 'Réservations voitures', cat: 'Activité' },
  fleet:         { name: 'Parc',           hint: 'Voitures, prix, photos', cat: 'Activité' },
  revenue:       { name: 'CA & marge', hint: 'Encaissé, à encaisser', cat: 'Activité' },
  clients:       { name: 'Clients',        hint: 'Fichier et historique', cat: 'Activité' },
  calendar:      { name: 'Agenda',         hint: 'Rendez-vous et locations', cat: 'Activité' },
  immo:          { name: 'Immobilier',     hint: 'Biens à louer / vendre', cat: 'Activité' },
  deals:         { name: 'Achat-revente',  hint: 'Voitures et biens', cat: 'Activité' },
  caisse:        { name: 'Caisse',         hint: 'Entrées et sorties', cat: 'Activité' },
  paiements:     { name: 'À payer',        hint: 'Abonnements de Dzaryx', cat: 'Activité' },
  documents:     { name: 'Documents',      hint: 'Pièces, contrats PDF', cat: 'Activité' },
  devis:         { name: 'Devis',          hint: 'Devis WhatsApp + PDF', cat: 'Clients & ventes' },
  voucher:       { name: 'Bon de résa',    hint: 'Confirmation + acompte', cat: 'Clients & ventes' },
  reponse:       { name: 'Réponse client', hint: 'Dans sa langue', cat: 'Clients & ventes' },
  reengage:      { name: 'Relance',        hint: 'Anciens clients', cat: 'Clients & ventes' },
  parrainage:    { name: 'Parrainage',     hint: 'Codes parrain', cat: 'Clients & ventes' },
  reviews:       { name: 'Avis',           hint: 'Avis du site', cat: 'Clients & ventes' },
  demarchage:    { name: 'Démarchage',     hint: 'Prospection auto', cat: 'Clients & ventes' },
  sites:         { name: 'Sites clients',  hint: 'FIK Sites', cat: 'Clients & ventes' },
  social:        { name: 'Réseaux sociaux', hint: 'Posts prêts', cat: 'Marketing' },
  newsletter:    { name: 'Newsletter',     hint: 'Mail aux abonnés', cat: 'Marketing' },
  blog:          { name: 'Blog',           hint: 'Articles du site', cat: 'Marketing' },
  studio:        { name: 'Montage',        hint: 'Vidéos IA gratuites', cat: 'Marketing' },
  opportunities: { name: 'Opportunités',   hint: 'Veille business', cat: 'Pilotage' },
  forecast:      { name: 'Prévisions',     hint: 'Saisons et pics', cat: 'Pilotage' },
  pricing:       { name: 'Prix conseillés', hint: 'Selon la demande', cat: 'Pilotage' },
  partners:      { name: 'Partenaires',    hint: 'Houari et les autres', cat: 'Pilotage' },
  search:        { name: 'Chercher',       hint: 'Partout dans Dzaryx', cat: 'Perso & PC' },
  coach:         { name: 'Coach de vie',   hint: 'Business, vie, discipline', cat: 'Perso & PC' },
  sport:         { name: 'Forme',          hint: 'Salle, exercices, scanner', cat: 'Perso & PC' },
  carte:         { name: 'Carte live',     hint: 'Toute l\'activité en 3D', cat: 'Perso & PC' },
  nexus:         { name: 'Mon PC',         hint: 'Contrôle à distance', cat: 'Perso & PC' },
  camera:        { name: 'Caméra → PC',    hint: 'Montrer à Nexus', cat: 'Perso & PC' },
  globe:         { name: 'Globe',          hint: 'Vue du monde', cat: 'Perso & PC' },
  settings:      { name: 'Réglages',       hint: 'Notifications, sécurité', cat: 'Perso & PC' },
};
const TOOL_CATS = ['Activité', 'Clients & ventes', 'Marketing', 'Pilotage', 'Perso & PC'];

function ToolsGrid({ onOpen, actor }: { onOpen: (p: Page) => void; actor: string }) {
  const [q, setQ] = useState('');
  const primary = (PRIMARY[actor] ?? PRIMARY.kouider)!;
  const visible = TABS.filter(t =>
    !primary.includes(t.id) &&
    (!t.kouiderOnly || actor === 'kouider') &&
    (!t.houariOnly  || actor === 'houari')
  );
  const accent = actor === 'houari' ? '#a78bfa' : '#38d8f5';
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const info = (t: (typeof TABS)[number]) => TOOL_INFO[t.id] ?? { name: t.label.charAt(0) + t.label.slice(1).toLowerCase(), hint: '', cat: 'Perso & PC' };
  const shown = visible.filter(t => { const i = info(t); return !q || norm(`${i.name} ${i.hint} ${t.label}`).includes(norm(q)); });
  const tile = (t: (typeof TABS)[number]) => {
    const i = info(t);
    return (
      <button key={t.id} onClick={() => onOpen(t.id)} style={{
        background: 'linear-gradient(160deg, #101d3d, #0b1530)', border: '1px solid rgba(110,160,255,0.14)', borderRadius: 16,
        padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', minHeight: 64, minWidth: 0,
        fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          background: `radial-gradient(circle at 50% 35%, ${accent}2e, ${accent}0a)`, border: `1px solid ${accent}33` }}>{t.icon}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#f4f7ff', lineHeight: 1.2 }}>{i.name}</span>
          {i.hint && <span style={{ display: 'block', fontSize: 12, color: '#8ea3c8', marginTop: 2, lineHeight: 1.25 }}>{i.hint}</span>}
        </span>
      </button>
    );
  };
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'radial-gradient(120% 60% at 50% 0%, #0b1a3a 0%, #050a16 60%)', color: '#e8f0ff', fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif', padding: '18px 16px 130px' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 11, letterSpacing: '0.26em', color: accent, fontWeight: 600 }}>OUTILS</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 6, color: '#f4f7ff' }}>Tout Dzaryx</div>
      <div style={{ position: 'relative', margin: '14px 0 4px' }}>
        <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un outil…" style={{ width: '100%', boxSizing: 'border-box', minHeight: 48, background: '#0b1530', border: '1px solid rgba(110,160,255,0.14)', borderRadius: 999, padding: '0 16px 0 42px', color: '#f4f7ff', fontFamily: 'inherit', fontSize: 16, outline: 'none' }} />
      </div>
      {TOOL_CATS.map(cat => {
        const items = shown.filter(t => info(t).cat === cat);
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#8ea3c8', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{cat}</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(110,160,255,0.2), transparent)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 160px), 1fr))', gap: 8 }}>{items.map(tile)}</div>
          </div>
        );
      })}
      {!shown.length && <div style={{ textAlign: 'center', color: '#8ea3c8', fontSize: 14, marginTop: 30 }}>Aucun outil ne correspond.</div>}
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
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'radial-gradient(120% 100% at 50% 0%, #0b1a3a, #03060f)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 28px', textAlign: 'center' }}>
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
