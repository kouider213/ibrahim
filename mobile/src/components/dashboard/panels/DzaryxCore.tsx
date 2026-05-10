import { motion } from 'framer-motion';
import { useHealth, useLogStream, type SystemHealth } from '../../../hooks/useDashboard.js';

const card = 'dash-card dash-glow p-4';

function HealthDot({ ok, ms }: { ok: boolean; ms?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
        {ok && <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 status-pulse" />}
      </span>
      <span className={`text-xs font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
        {ok ? 'OK' : 'DOWN'}{ms !== undefined ? ` ${ms}ms` : ''}
      </span>
    </div>
  );
}

function MetricCard({ label, value, sub, color = 'text-cyan-400' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className={card}>
      <div className={`font-mono text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-700 mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function DzaryxCore() {
  const { data: health, loading, lastUpdated } = useHealth();
  const logs = useLogStream();

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-cyan-400 font-mono text-sm">
      <span className="data-tick">⟳ Diagnostic système…</span>
    </div>
  );

  const h = health as SystemHealth | null;

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase">Dzaryx Core</h2>
        {lastUpdated && (
          <span className="text-[10px] text-gray-700 font-mono">
            {lastUpdated.toLocaleTimeString('fr-FR')}
          </span>
        )}
      </div>

      {/* Services status */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">État services</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Redis</span>
            <HealthDot ok={h?.redis.ok ?? false} ms={h?.redis.ping_ms} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Supabase</span>
            <HealthDot ok={h?.supabase.ok ?? false} ms={h?.supabase.ping_ms} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">BullMQ</span>
            <HealthDot ok={(h?.scheduler.active ?? 0) >= 0} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Railway</span>
            <HealthDot ok={(h?.process.uptime_s ?? 0) > 0} />
          </div>
        </div>
      </div>

      {/* Process */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Uptime"
          value={h ? formatUptime(h.process.uptime_s) : '—'}
          color="text-emerald-400"
        />
        <MetricCard
          label="Mémoire"
          value={h ? `${h.process.memory_mb}MB` : '—'}
          color="text-amber-400"
        />
      </div>

      {/* BullMQ queues */}
      {h?.scheduler && (
        <div className={card}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">BullMQ — {h.scheduler.queue}</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'En attente', value: h.scheduler.waiting,    color: 'text-amber-400'   },
              { label: 'Actifs',     value: h.scheduler.active,     color: 'text-cyan-400'    },
              { label: 'Terminés',   value: h.scheduler.completed,  color: 'text-emerald-400' },
              { label: 'Échoués',    value: h.scheduler.failed,     color: h.scheduler.failed > 0 ? 'text-red-400' : 'text-gray-600' },
              { label: 'Différés',   value: h.scheduler.delayed,    color: 'text-violet-400'  },
              { label: 'Répétables', value: h.scheduler.repeatable, color: 'text-cyan-400'    },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className={`font-mono text-lg font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-gray-600">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Claude token usage */}
      {h?.claude && (
        <div className={card}>
          <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">Claude — Usage aujourd'hui</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="font-mono text-xl font-bold text-violet-400">{h.claude.calls_today}</div>
              <div className="text-[10px] text-gray-600">Appels</div>
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-cyan-400">{fmtTokens(h.claude.tokens_in_today)}</div>
              <div className="text-[10px] text-gray-600">Tokens in</div>
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-amber-400">{fmtTokens(h.claude.tokens_out_today)}</div>
              <div className="text-[10px] text-gray-600">Tokens out</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-gray-700 font-mono text-center">
            Total: {fmtTokens((h.claude.tokens_in_today + h.claude.tokens_out_today))} tokens · Haiku 4.5
          </div>
        </div>
      )}

      {/* Log stream */}
      <div className={card}>
        <h3 className="text-xs text-gray-500 uppercase tracking-widest mb-3">
          Logs temps réel
          <span className="ml-2 cursor-blink text-cyan-500">|</span>
        </h3>
        <div className="dash-scroll overflow-y-auto max-h-48 space-y-1 font-mono text-[10px]">
          {logs.length === 0 ? (
            <p className="text-gray-700">En attente d'événements…</p>
          ) : (
            logs.map((log, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-2"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <span className="text-gray-700 shrink-0">{log.ts.slice(11, 19)}</span>
                <span className={
                  log.level === 'ERROR' ? 'text-red-400'
                  : log.level === 'WARN' ? 'text-amber-400'
                  : 'text-gray-500'
                }>
                  [{log.level}]
                </span>
                <span className="text-gray-400">{log.msg}</span>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
