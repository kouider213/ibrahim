import { motion } from 'framer-motion';
import { useHeatmap, useFleet, fmtPct } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

function heatColor(count: number, max: number): string {
  if (count === 0) return 'bg-gray-800/60 text-gray-700';
  const lvl = Math.min(4, Math.ceil((count / max) * 4));
  return [
    '',
    'bg-cyan-900/40 text-cyan-300 border border-cyan-700/30',
    'bg-cyan-700/40 text-cyan-200 border border-cyan-600/40',
    'bg-cyan-600/50 text-white border border-cyan-500/50',
    'bg-cyan-500/70 text-white border border-cyan-400/60 font-bold',
  ][lvl]!;
}

export default function CalendarView() {
  const { data: heatmap, loading: hmLoading } = useHeatmap();
  const { data: fleet,   loading: flLoading  } = useFleet();

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();

  // Build month grid
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const totalDays = lastDay.getDate();

  const heatMap = new Map((heatmap ?? []).map(d => [d.date, d.count]));
  const maxCount = Math.max(...(heatmap ?? []).map(d => d.count), 1);

  const today = now.toISOString().slice(0, 10);

  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  if (hmLoading || flLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
        <span>⟳ Chargement calendrier…</span>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">Calendrier</h2>

      {/* Month header */}
      <div className={card}>
        <h3 className="text-center font-mono text-sm text-cyan-300 uppercase tracking-widest mb-4">
          {MONTHS_FR[month]} {year}
        </h3>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_FR.map(d => (
            <div key={d} className="text-center text-[9px] text-gray-600 font-mono uppercase py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const count   = heatMap.get(dateStr) ?? 0;
            const isToday = dateStr === today;
            const isPast  = dateStr < today;

            return (
              <motion.div
                key={dateStr}
                className={`
                  rounded text-center py-1.5 text-[11px] font-mono relative cursor-default
                  ${heatColor(count, maxCount)}
                  ${isToday ? 'ring-1 ring-cyan-400' : ''}
                  ${isPast && count === 0 ? 'opacity-40' : ''}
                `}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: isPast && count === 0 ? 0.4 : 1, scale: 1 }}
                transition={{ delay: (i % 7) * 0.02 }}
                title={count > 0 ? `${count} réservation${count > 1 ? 's' : ''}` : ''}
              >
                {day}
                {count > 0 && (
                  <span className="absolute bottom-0.5 right-0.5 text-[7px] leading-none">{count}</span>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 text-[9px] text-gray-600 font-mono justify-end">
          <span>Faible</span>
          {[1,2,3,4].map(l => (
            <div key={l} className={`w-3 h-3 rounded-sm ${heatColor(l, 4).split(' ')[0]}`} />
          ))}
          <span>Élevé</span>
        </div>
      </div>

      {/* Stats mois */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Ce mois</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="font-mono text-xl text-cyan-400">
              {Array.from(heatMap.entries())
                .filter(([d]) => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
                .reduce((s, [, c]) => s + c, 0)}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">Réservations</div>
          </div>
          <div>
            <div className="font-mono text-xl text-emerald-400">{fleet?.available_now_count ?? '—'}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">Dispos</div>
          </div>
          <div>
            <div className="font-mono text-xl text-amber-400">
              {fleet ? fmtPct(fleet.occupancy_avg_pct) : '—'}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">Occupation</div>
          </div>
        </div>
      </div>

      {/* Fleet status */}
      {fleet && fleet.stats.length > 0 && (
        <div className={card}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">État du parc</h3>
          <div className="space-y-2">
            {fleet.stats.map((car, i) => (
              <motion.div
                key={car.car_id}
                className="flex items-center justify-between py-1.5 border-b border-gray-800/40"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div>
                  <span className="text-sm text-gray-200">{car.car_name}</span>
                  {car.next_free_date && !car.available_now && (
                    <div className="text-[10px] text-gray-600">Libre le {car.next_free_date}</div>
                  )}
                </div>
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  car.available_now
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}>
                  {car.available_now ? 'DISPO' : 'RÉSERVÉ'}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
