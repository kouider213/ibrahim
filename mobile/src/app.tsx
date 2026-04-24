import { useState } from 'react';
import './app.css';
import ChatInterface    from './components/ChatInterface.js';
import TasksView        from './components/TasksView.js';
import ValidationQueue  from './components/ValidationQueue.js';
import FinanceDashboard from './components/FinanceDashboard.js';

type Tab = 'chat' | 'finance' | 'tasks' | 'validations';

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'chat',        icon: '🎙️', label: 'Ibrahim' },
  { id: 'finance',     icon: '💰', label: 'Finances' },
  { id: 'tasks',       icon: '📋', label: 'Tâches'   },
  { id: 'validations', icon: '✅', label: 'Validations' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="app-root">
      <div className={`app-page ${tab === 'chat'        ? 'app-page--active' : ''}`}><ChatInterface /></div>
      <div className={`app-page ${tab === 'finance'     ? 'app-page--active' : ''}`}><FinanceDashboard /></div>
      <div className={`app-page ${tab === 'tasks'       ? 'app-page--active' : ''}`}><TasksView /></div>
      <div className={`app-page ${tab === 'validations' ? 'app-page--active' : ''}`}><ValidationQueue /></div>

      <nav className="app-tabbar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`app-tab ${tab === t.id ? 'app-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="app-tab__icon">{t.icon}</span>
            <span className="app-tab__label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
