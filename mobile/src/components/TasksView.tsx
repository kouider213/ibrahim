import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

type TaskStatus = 'pending' | 'queued' | 'running' | 'waiting_validation' | 'completed' | 'failed' | 'cancelled';

interface Task {
  id:          string;
  title:       string;
  action_type: string;
  status:      TaskStatus;
  created_at:  string;
  completed_at?: string;
  error?:      string;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending:             '#666',
  queued:              '#4a90e2',
  running:             '#8a2be2',
  waiting_validation:  '#f5a623',
  completed:           '#4caf50',
  failed:              '#f44336',
  cancelled:           '#444',
};

const STATUS_ICON: Record<TaskStatus, string> = {
  pending:             '○',
  queued:              '◎',
  running:             '◌',
  waiting_validation:  '◈',
  completed:           '✓',
  failed:              '✗',
  cancelled:           '⊘',
};

export default function TasksView() {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const res = await api.getTasks();
        setTasks(res.tasks as Task[]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 5_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{
      width:      '100%',
      height:     '100%',
      overflow:   'auto',
      padding:    '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <h2 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 400, marginBottom: 16, letterSpacing: 2, textTransform: 'uppercase' }}>
        Tâches Ibrahim
      </h2>

      {tasks.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
          Aucune tâche en cours
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map(task => (
            <div key={task.id} style={{
              background:   'rgba(255,255,255,0.04)',
              border:       `1px solid rgba(255,255,255,0.07)`,
              borderLeft:   `3px solid ${STATUS_COLOR[task.status]}`,
              borderRadius: 12,
              padding:      '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: STATUS_COLOR[task.status], fontSize: 14 }}>
                  {STATUS_ICON[task.status]}
                </span>
                <span style={{ color: '#fff', fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {task.title}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {task.action_type.replace('_', ' ')}
                </span>
                <span style={{ color: STATUS_COLOR[task.status], fontSize: 11, fontWeight: 500 }}>
                  {task.status}
                </span>
              </div>
              {task.error && (
                <div style={{ color: '#f44336', fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                  {task.error.slice(0, 80)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
