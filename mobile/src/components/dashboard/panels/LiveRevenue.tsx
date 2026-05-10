import { motion } from 'framer-motion';
import { useRevenue, useHeatmap, fmtDZD, type ClientScore, type HeatmapDay } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

function ScoreBadge({ score }: { score: ClientScore['score'] }) {
  const cls = { VIP: 'badge-vip', FREQUENT: 'badge-frequent', REGULAR: 'badge-regular', NEW: 'badge-new' }[score];
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${cls}`}>{score}</span>;
}

function HeatmapGrid({ data }: { data: HeatmapDay[] }) {
  const map = new Map(data.map(d => [d.date, d.count]));
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const days: Date[] = [];
  for (let i = 59; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86_400_000));
  }

  return (
    <div className="flex flex-wrap gap-1">
      {days.map(d => {
        const key   = d.toISOString().slice(0, 10);
        const count = map.get(key) ?? 0;
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxCount) * 4));
        return (
          <div
            key={key}
            title={`${key}: ${count} résa(s)`}
            className={`w-3 h-3 rounded-sm heatmap-${level} border border-gray-800/50`}
          />
        );
      })}
    </div>
  );
}

export default function LiveRevenue() {
  const { data: rev, loading: revLoading } = useRevenue();
  const { data: heatmap }                  = useHeatmap();

  if (revLoading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span className="data-tick">⟳ Chargement revenus…</span>
    </div>
  );

  const r = rev!;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">Live Revenue</h2>

      {/* CA cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Aujourd'hui", value: r.today_revenue,  color: 'text-emerald-400' },
          { label: 'Semaine',     value: r.week_revenue,   color: 'text-cyan-400'    },
          { label: 'Mois',        value: r.month_revenue,  color: 'text-violet-400'  },
        ].map(({ label, value, color }) => (
          <motion.div
            key={label}
            className={`${card} text-center`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className={`font-mono text-xl font-bold ${color}`}>{fmtDZD(value)}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Split Kouider / Houari */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Répartition propriétaires</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="font-mono text-2xl font-bold text-amber-400">{fmtDZD(r.kouider_profit_month)}</div>
            <div className="text-xs text-gray-500 mt-1">Kouider (bénéfice)</div>
          </div>
          <div className="text-center">
            <div className="font-mono text-2xl font-bold text-violet-400">{fmtDZD(r.houari_revenue_month)}</div>
            <div className="text-xs text-gray-500 mt-1">Houari (CA)</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="text-gray-400 font-mono">{r.total_bookings_month}</span>
            <div className="text-gray-600">Réservations</div>
          </div>
          <div>
            <span className="text-gray-400 font-mono">{fmtDZD(r.avg_booking_value)}</span>
            <div className="text-gray-600">Valeur moy.</div>
          </div>
          <div>
            <span className="text-red-400 font-mono">{r.rejected_count}</span>
            <div className="text-gray-600">Refusées</div>
          </div>
        </div>
        {r.rejected_revenue_lost > 0 && (
          <p className="text-xs text-red-400/60 font-mono mt-2">
            CA perdu: {fmtDZD(r.rejected_revenue_lost)}
          </p>
        )}
      </div>

      {/* Heatmap */}
      {heatmap && heatmap.length > 0 && (
        <div className={card}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Heatmap réservations (60j)</h3>
          <HeatmapGrid data={heatmap} />
          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
            <span>Faible</span>
            {[0,1,2,3,4].map(l => (
              <div key={l} className={`w-2 h-2 rounded-sm heatmap-${l}`} />
            ))}
            <span>Élevé</span>
          </div>
        </div>
      )}

      {/* Top clients */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Top Clients</h3>
        <div className="space-y-2">
          {r.top_clients.slice(0, 5).map((c, i) => (
            <motion.div
              key={c.client_name}
              className="flex items-center justify-between py-1.5 border-b border-gray-800/50"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-600 font-mono text-xs w-4">{i + 1}.</span>
                <div>
                  <span className="text-sm text-gray-200">{c.client_name}</span>
                  <div className="text-[10px] text-gray-600">{c.bookings_count} rés. · {c.last_booking}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-emerald-400">{fmtDZD(c.total_spent)}</span>
                <ScoreBadge score={c.score} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
