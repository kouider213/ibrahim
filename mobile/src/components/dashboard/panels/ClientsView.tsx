import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRevenue, fmtDZD, type ClientScore } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

const SCORE_STYLES: Record<ClientScore['score'], string> = {
  VIP:      'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  FREQUENT: 'bg-violet-500/20 text-violet-300 border border-violet-500/40',
  REGULAR:  'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
  NEW:      'bg-gray-600/20 text-gray-400 border border-gray-600/40',
};

const SCORE_ICONS: Record<ClientScore['score'], string> = {
  VIP: '⭐', FREQUENT: '🔥', REGULAR: '✅', NEW: '🆕',
};

const FILTERS: Array<ClientScore['score'] | 'ALL'> = ['ALL', 'VIP', 'FREQUENT', 'REGULAR', 'NEW'];

export default function ClientsView() {
  const { data: rev, loading } = useRevenue();
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<ClientScore['score'] | 'ALL'>('ALL');

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span>⟳ Chargement clients…</span>
    </div>
  );

  const clients = rev?.top_clients ?? [];

  const filtered = clients.filter(c => {
    const matchScore  = filter === 'ALL' || c.score === filter;
    const matchSearch = !search.trim() || c.client_name.toLowerCase().includes(search.toLowerCase().trim());
    return matchScore && matchSearch;
  });

  const vipCount      = clients.filter(c => c.score === 'VIP').length;
  const frequentCount = clients.filter(c => c.score === 'FREQUENT').length;
  const totalSpent    = clients.reduce((s, c) => s + c.total_spent, 0);

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">Clients</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',   value: clients.length,      color: 'text-cyan-400'  },
          { label: 'VIP',     value: vipCount,            color: 'text-amber-400' },
          { label: 'CA total',value: fmtDZD(totalSpent),  color: 'text-emerald-400', str: true },
        ].map(({ label, value, color, str }) => (
          <div key={label} className={`${card} text-center`}>
            <div className={`font-mono text-lg font-bold ${color}`}>{str ? value : value}</div>
            <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={card}>
        <input
          className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
          placeholder="Rechercher un client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Score filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider border transition-all ${
              filter === f
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                : 'text-gray-600 border-gray-700/50 hover:border-gray-600'
            }`}
          >
            {f === 'ALL' ? 'Tous' : `${SCORE_ICONS[f]} ${f}`}
          </button>
        ))}
      </div>

      {/* Client list */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
          {filtered.length} client{filtered.length > 1 ? 's' : ''}
          {filter !== 'ALL' ? ` · ${filter}` : ''}
        </h3>

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-600 font-mono text-center py-4">Aucun résultat</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((c, i) => (
              <motion.div
                key={c.client_name}
                className="flex items-start justify-between py-2.5 border-b border-gray-800/40 last:border-0"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-200 truncate">{c.client_name}</span>
                    <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-mono ${SCORE_STYLES[c.score]}`}>
                      {SCORE_ICONS[c.score]} {c.score}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-gray-600">
                      {c.bookings_count} rés. · dernier: {c.last_booking}
                    </span>
                  </div>
                  {c.client_phone && (
                    <a
                      href={`tel:${c.client_phone}`}
                      className="text-[10px] text-cyan-600 hover:text-cyan-400 transition-colors font-mono mt-0.5 block"
                    >
                      📞 {c.client_phone}
                    </a>
                  )}
                </div>
                <div className="shrink-0 text-right ml-3">
                  <div className="font-mono text-sm text-emerald-400">{fmtDZD(c.total_spent)}</div>
                  <div className="text-[10px] text-gray-600">total</div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* VIP highlight */}
      {vipCount > 0 && filter === 'ALL' && (
        <div className="dash-card border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-400/80 font-mono">
            ⭐ {vipCount} client{vipCount > 1 ? 's' : ''} VIP · {frequentCount} fréquent{frequentCount > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </motion.div>
  );
}
