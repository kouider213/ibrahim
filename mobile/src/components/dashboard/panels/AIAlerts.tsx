import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReminders, type SmartReminder } from '../../../hooks/useDashboard.js';

const ICONS: Record<SmartReminder['type'], string> = {
  arrival_tomorrow:  '🛬',
  missing_passport:  '🪪',
  missing_deposit:   '💸',
  return_soon:       '🔄',
  vehicle_prep:      '🧹',
  age_alert:         '🔞',
};

const TYPE_LABELS: Record<SmartReminder['type'], string> = {
  arrival_tomorrow: 'Arrivée demain',
  missing_passport: 'Passeport manquant',
  missing_deposit:  'Acompte 0€',
  return_soon:      'Retour proche',
  vehicle_prep:     'Prép. véhicule',
  age_alert:        'Alerte âge',
};

function PriorityBadge({ p }: { p: SmartReminder['priority'] }) {
  const cls = { HIGH: 'badge-high', MEDIUM: 'badge-medium', LOW: 'badge-low' }[p];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${cls}`}>{p}</span>;
}

function AlertCard({ r }: { r: SmartReminder }) {
  const [open, setOpen] = useState(r.priority === 'HIGH');

  return (
    <motion.div
      className="dash-card overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-xl">{ICONS[r.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{TYPE_LABELS[r.type]}</span>
            <PriorityBadge p={r.priority} />
          </div>
          <p className="text-sm text-gray-200 truncate">{r.client_name} — {r.car_name}</p>
        </div>
        <span className="text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-3 pb-3 space-y-2 border-t border-gray-800/50"
          >
            <p className="text-xs text-gray-300 mt-2">{r.message}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-600 font-mono">{r.date}</span>
              <button
                className="text-[10px] text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-full hover:bg-cyan-500/10 transition-colors"
                onClick={() => navigator.clipboard.writeText(r.action)}
              >
                Copier action
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AIAlerts() {
  const { data, loading, error, lastUpdated } = useReminders();

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span className="data-tick">⟳ Chargement alertes…</span>
    </div>
  );

  if (error) return (
    <div className="dash-card p-4 text-red-400 font-mono text-sm">Erreur: {error}</div>
  );

  const reminders = data?.reminders ?? [];
  const high   = reminders.filter(r => r.priority === 'HIGH');
  const medium = reminders.filter(r => r.priority === 'MEDIUM');
  const low    = reminders.filter(r => r.priority === 'LOW');

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">AI Alerts</h2>
        <div className="flex items-center gap-2">
          {high.length > 0 && (
            <span className="badge-high text-[10px] px-2 py-0.5 rounded-full font-mono">
              {high.length} HIGH
            </span>
          )}
          <span className="text-xs text-gray-600 font-mono">{reminders.length} alertes</span>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="dash-card p-8 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-gray-500 text-sm">Aucune alerte — tout est sous contrôle</p>
        </div>
      ) : (
        <>
          {high.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs text-red-400 uppercase tracking-widest font-mono">● Urgents</h3>
              {high.map((r, i) => <AlertCard key={`${r.type}-${r.client_name}-${i}`} r={r} />)}
            </div>
          )}
          {medium.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs text-amber-400 uppercase tracking-widest font-mono">◐ Moyens</h3>
              {medium.map((r, i) => <AlertCard key={`${r.type}-${r.client_name}-${i}`} r={r} />)}
            </div>
          )}
          {low.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs text-gray-500 uppercase tracking-widest font-mono">○ Infos</h3>
              {low.map((r, i) => <AlertCard key={`${r.type}-${r.client_name}-${i}`} r={r} />)}
            </div>
          )}
        </>
      )}

      {lastUpdated && (
        <p className="text-[10px] text-gray-700 text-right font-mono">
          {lastUpdated.toLocaleTimeString('fr-FR')}
        </p>
      )}
    </motion.div>
  );
}
