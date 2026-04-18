import { useState } from 'react';
import ChatInterface    from './components/ChatInterface.js';
import TasksView        from './components/TasksView.js';
import ValidationQueue  from './components/ValidationQueue.js';

type Tab = 'chat' | 'tasks' | 'validations';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'chat',        icon: '◎', label: 'Ibrahim'      },
  { id: 'tasks',       icon: '⊡', label: 'Tâches'       },
  { id: 'validations', icon: '◈', label: 'Validations'  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div style={{
      width:         '100vw',
      height:        '100dvh',
      background:    '#000',
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      fontFamily:    '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    }}>
      {/* Page content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: activeTab === 'chat'        ? 'block' : 'none', height: '100%' }}>
          <ChatInterface />
        </div>
        <div style={{ display: activeTab === 'tasks'       ? 'block' : 'none', height: '100%' }}>
          <TasksView />
        </div>
        <div style={{ display: activeTab === 'validations' ? 'block' : 'none', height: '100%' }}>
          <ValidationQueue />
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav style={{
        display:         'flex',
        borderTop:       '1px solid rgba(255,255,255,0.06)',
        background:      'rgba(0,0,0,0.95)',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom:   'env(safe-area-inset-bottom, 0px)',
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex:           1,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            4,
                padding:        '10px 0',
                background:     'none',
                border:         'none',
                cursor:         'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition:     'opacity 0.15s',
              }}
            >
              <span style={{
                fontSize:   20,
                color:      active ? '#7b2fff' : 'rgba(255,255,255,0.25)',
                transition: 'color 0.2s, text-shadow 0.2s',
                textShadow: active ? '0 0 12px rgba(123,47,255,0.6)' : 'none',
              }}>
                {tab.icon}
              </span>
              <span style={{
                fontSize:      10,
                letterSpacing: 0.5,
                color:         active ? '#7b2fff' : 'rgba(255,255,255,0.2)',
                transition:    'color 0.2s',
                textTransform: 'uppercase',
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
