import './app.css';
import { useState } from 'react';
import ChatInterface   from './components/ChatInterface.js';
import TasksView       from './components/TasksView.js';
import ValidationQueue from './components/ValidationQueue.js';

type Tab = 'chat' | 'tasks' | 'validations';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chat',        label: 'Ibrahim',     icon: '◎' },
  { id: 'tasks',       label: 'Tâches',      icon: '⊡' },
  { id: 'validations', label: 'Validations', icon: '◈' },
];

export default function App() {
  const [active, setActive] = useState<Tab>('chat');

  return (
    <div className="app-root">

      {/* Content area — fills remaining height */}
      <div className="app-content">

        {/* Chat is always mounted so the globe keeps animating */}
        <div className={`app-page${active === 'chat' ? ' app-page--active' : ''}`}>
          <ChatInterface />
        </div>

        {active === 'tasks' && (
          <div className="app-page app-page--active app-page--scroll">
            <TasksView />
          </div>
        )}

        {active === 'validations' && (
          <div className="app-page app-page--active app-page--scroll">
            <ValidationQueue />
          </div>
        )}

      </div>

      {/* Tab bar — part of the flex column, not position:fixed */}
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${active === t.id ? ' tab-btn--active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}
