import { motion } from 'framer-motion';
import { useFleet, fmtDZD, fmtPct } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

export default function LiveFleet() {
  const { data, loading, error, lastUpdated } = useFleet();

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span className="data-tick">⟳ Chargement flotte…</span>
    </div>
  );

  if (error) return (
    <div className="dash-card p-4 text-red-400 font-mono text-sm">Erreur: {error}</div>
  );

  const fleet = data!;
  const occupied  = fleet.total_cars - fleet.available_now_count;
  const today     = new Date().toISOString().slice(0, 10);
  const returning = fleet.stats.filter(s => s.next_free_date === today).length;

  const urgency = fleet.low_fleet_alert ? 'HIGH'
    : fleet.idle_vehicles.length > 0    ? 'MEDIUM'
    : 'LOW';

  const urgencyColor = { HIGH: 'text-red-400', MEDIUM: 'text-amber-400', LOW: 'text-emerald-400' }[urgency];

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">Live Fleet</h2>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs uppercase ${urgencyColor}`}>
            ● {urgency} URGENCY
          </span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Total',       value: fleet.total_cars,          color: 'text-cyan-400'    },
          { label: 'Disponibles', value: fleet.available_now_count,  color: 'text-emerald-400' },
          { label: 'En location', value: occupied,                   color: 'text-red-400'     },
          { label: 'Retour auj.', value: returning,                  color: 'text-amber-400'   },
        ].map(({ label, value, color }) => (
          <div key={label} className={`${card} text-center`}>
            <div className={`font-mono text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Occupancy bar */}
      <div className={card}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-500 uppercase tracking-widest">Taux d'occupation moyen</span>
          <span className="font-mono text-cyan-400 font-bold">{fmtPct(fleet.occupancy_avg_pct)}</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
            initial={{ width: 0 }}
            animate={{ width: `${fleet.occupancy_avg_pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        {fleet.most_profitable && (
          <p className="text-xs text-gray-500 mt-2">
            Top: <span className="text-amber-400">{fleet.most_profitable}</span>
          </p>
        )}
      </div>

      {/* Vehicle grid */}
      <div className="space-y-2">
        <h3 className="text-xs text-gray-500 uppercase tracking-widest">Véhicules</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {fleet.stats.map((car, i) => {
            const statusClass = car.available_now  ? 'status-available'
              : car.next_free_date === today ? 'status-returning'
              : 'status-occupied';
            const statusLabel = car.available_now  ? 'Libre'
              : car.next_free_date === today ? 'Retour auj.'
              : 'En location';

            return (
              <motion.div
                key={car.car_id}
                className={card}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-200 font-medium">{car.car_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>{statusLabel}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-mono text-xs text-cyan-400">{fmtPct(car.occupancy_pct)}</div>
                    <div className="text-[10px] text-gray-600">Occup.</div>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-emerald-400">{fmtDZD(car.revenue_30d)}</div>
                    <div className="text-[10px] text-gray-600">CA 30j</div>
                  </div>
                  <div>
                    <div className="font-mono text-xs text-violet-400">{car.total_bookings_30d}</div>
                    <div className="text-[10px] text-gray-600">Résas</div>
                  </div>
                </div>
                {car.next_free_date && !car.available_now && (
                  <p className="text-[10px] text-gray-600 mt-1">Libre: {car.next_free_date}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Idle alert */}
      {fleet.idle_vehicles.length > 0 && (
        <motion.div
          className="dash-card border border-amber-500/30 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-amber-400 text-xs font-mono">
            ⚠ Véhicules inactifs: {fleet.idle_vehicles.join(', ')}
          </p>
        </motion.div>
      )}

      {lastUpdated && (
        <p className="text-[10px] text-gray-700 text-right font-mono">
          Mis à jour: {lastUpdated.toLocaleTimeString('fr-FR')}
        </p>
      )}
    </motion.div>
  );
}
