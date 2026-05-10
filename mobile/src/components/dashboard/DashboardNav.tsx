import { motion } from 'framer-motion';

export type DashSection =
  | 'fleet'
  | 'revenue'
  | 'alerts'
  | 'whatsapp'
  | 'tiktok'
  | 'core'
  | 'voice';

export const NAV_ITEMS: { id: DashSection; icon: string; label: string; badge?: number }[] = [
  { id: 'fleet',    icon: '🚗', label: 'Fleet'    },
  { id: 'revenue',  icon: '₿',  label: 'Revenue'  },
  { id: 'alerts',   icon: '🔔', label: 'Alertes'  },
  { id: 'whatsapp', icon: '💬', label: 'WhatsApp' },
  { id: 'tiktok',   icon: '🎵', label: 'TikTok'   },
  { id: 'core',     icon: '⚙',  label: 'Core'     },
  { id: 'voice',    icon: '🎤', label: 'Voice'    },
];

interface Props {
  active: DashSection;
  onChange: (s: DashSection) => void;
  alertCount?: number;
}

export function BottomNav({ active, onChange, alertCount }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur-md border-t border-cyan-500/15">
      <div className="flex">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          const count    = item.id === 'alerts' ? alertCount : undefined;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 relative transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute top-0 left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)' }}
                />
              )}
              <span className="text-lg leading-none">{item.icon}</span>
              <span className={`text-[9px] font-mono uppercase tracking-wider transition-colors ${
                isActive ? 'text-cyan-400' : 'text-gray-600'
              }`}>
                {item.label}
              </span>
              {count != null && count > 0 && (
                <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function SideNav({ active, onChange, alertCount }: Props) {
  return (
    <nav className="w-20 md:w-48 shrink-0 flex flex-col bg-gray-950/80 border-r border-cyan-500/10 pt-4">
      <div className="px-3 mb-6 hidden md:block">
        <div className="text-cyan-400 font-mono text-xs uppercase tracking-[0.2em]">Dzaryx</div>
        <div className="text-gray-700 font-mono text-[9px] uppercase tracking-widest">Dashboard</div>
      </div>
      {NAV_ITEMS.map(item => {
        const isActive = active === item.id;
        const count    = item.id === 'alerts' ? alertCount : undefined;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center gap-3 px-3 py-3 transition-colors ${
              isActive ? 'text-cyan-400 bg-cyan-500/8' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="sidenav-indicator"
                className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-cyan-400"
              />
            )}
            <span className="text-xl w-6 text-center">{item.icon}</span>
            <span className="text-[11px] font-mono uppercase tracking-wider hidden md:block">{item.label}</span>
            {count != null && count > 0 && (
              <span className="ml-auto w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center hidden md:flex">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
