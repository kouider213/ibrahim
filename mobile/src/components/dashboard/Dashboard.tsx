import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav, SideNav, type DashSection } from './DashboardNav.js';
import { useReminders, useClock } from '../../hooks/useDashboard.js';
import { connectSocket, getOrCreateSessionId } from '../../services/api.js';
import '../../dashboard.css';

const LiveFleet   = lazy(() => import('./panels/LiveFleet.js'));
const LiveRevenue = lazy(() => import('./panels/LiveRevenue.js'));
const AIAlerts    = lazy(() => import('./panels/AIAlerts.js'));
const WhatsAppAI  = lazy(() => import('./panels/WhatsAppAI.js'));
const TikTokAI    = lazy(() => import('./panels/TikTokAI.js'));
const DzaryxCore  = lazy(() => import('./panels/DzaryxCore.js'));
const VoiceMode   = lazy(() => import('./panels/VoiceMode.js'));

const PANELS: Record<DashSection, React.LazyExoticComponent<() => JSX.Element>> = {
  fleet:    LiveFleet,
  revenue:  LiveRevenue,
  alerts:   AIAlerts,
  whatsapp: WhatsAppAI,
  tiktok:   TikTokAI,
  core:     DzaryxCore,
  voice:    VoiceMode,
};

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-48 text-cyan-400 font-mono text-sm">
      <motion.span
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        ⟳ Chargement module…
      </motion.span>
    </div>
  );
}

function Header({ section, time, biRefreshed }: { section: DashSection; time: Date; biRefreshed: boolean }) {
  const timeStr = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-cyan-500/10 shrink-0 bg-gray-950/90 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="text-cyan-400 font-mono text-sm font-bold tracking-widest">◎ DZARYX</div>
        <div className="hidden sm:block text-gray-700 font-mono text-[10px] uppercase">{section}</div>
      </div>
      <div className="flex items-center gap-3">
        {biRefreshed && (
          <motion.span
            className="text-[10px] text-emerald-400 font-mono"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: [1, 1, 0] }}
            transition={{ duration: 3 }}
          >
            BI mis à jour
          </motion.span>
        )}
        <div className="text-right">
          <div className="font-mono text-xs text-cyan-400">{timeStr}</div>
          <div className="font-mono text-[10px] text-gray-600 hidden sm:block">{dateStr}</div>
        </div>
      </div>
    </header>
  );
}

export default function Dashboard() {
  const [section, setSection] = useState<DashSection>('fleet');
  const [biRefreshed, setBiRefreshed] = useState(false);
  const [isDesktop, setIsDesktop]     = useState(window.innerWidth >= 768);
  const { data: remData }  = useReminders();
  const alertCount = remData?.reminders?.filter(r => r.priority === 'HIGH').length ?? 0;
  const time       = useClock();

  // Listen for BI websocket refresh events
  useEffect(() => {
    const session = getOrCreateSessionId();
    const socket  = connectSocket(session, {
      onStatus: () => {}, onAudio: () => {}, onAudioChunk: () => {},
      onAudioComplete: () => {}, onTextChunk: () => {}, onTextComplete: () => {},
      onResponse: () => {}, onValidation: () => {}, onTaskUpdate: () => {},
    });
    socket.on('bi:refresh', () => {
      setBiRefreshed(true);
      setTimeout(() => setBiRefreshed(false), 4000);
    });
    return () => { socket.off('bi:refresh'); };
  }, []);

  // Responsive layout
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const Panel = PANELS[section];

  return (
    <div className="dash-scanline flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Header section={section} time={time} biRefreshed={biRefreshed} />

      <div className="flex flex-1 overflow-hidden">
        {/* Side nav — desktop only */}
        {isDesktop && (
          <SideNav active={section} onChange={setSection} alertCount={alertCount} />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto dash-scroll p-4 pb-24 md:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Suspense fallback={<PanelLoader />}>
                <Panel />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Bottom nav — mobile */}
      {!isDesktop && (
        <BottomNav active={section} onChange={setSection} alertCount={alertCount} />
      )}
    </div>
  );
}
