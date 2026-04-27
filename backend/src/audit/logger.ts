import { supabase } from '../integrations/supabase.js';

// ── Audit log (Supabase) ───────────────────────────────────────

export interface AuditEntry {
  actor?:    string;
  action:    string;
  target?:   string;
  targetId?: string;
  before?:   Record<string, unknown>;
  after?:    Record<string, unknown>;
  ip?:       string;
}

export async function audit(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    actor:     entry.actor ?? 'Dzaryx',
    action:    entry.action,
    target:    entry.target,
    target_id: entry.targetId,
    before:    entry.before,
    after:     entry.after,
    ip:        entry.ip,
  });
  if (error) {
    console.error('[audit] Failed to write log:', error.message);
  }
}

// ── Structured JSON logger ─────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts:      string;
  level:   LogLevel;
  module:  string;
  msg:     string;
  data?:   unknown;
  ms?:     number;
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(module: string, msg: string, data?: unknown): void {
    if (process.env['LOG_LEVEL'] === 'debug') {
      emit({ ts: new Date().toISOString(), level: 'debug', module, msg, data });
    }
  },
  info(module: string, msg: string, data?: unknown): void {
    emit({ ts: new Date().toISOString(), level: 'info', module, msg, data });
  },
  warn(module: string, msg: string, data?: unknown): void {
    emit({ ts: new Date().toISOString(), level: 'warn', module, msg, data });
  },
  error(module: string, msg: string, data?: unknown): void {
    emit({ ts: new Date().toISOString(), level: 'error', module, msg, data });
  },
  /** Wrap an async fn and emit its duration + outcome */
  async time<T>(module: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      emit({ ts: new Date().toISOString(), level: 'info', module, msg: label, ms: Date.now() - start });
      return result;
    } catch (err) {
      emit({
        ts: new Date().toISOString(), level: 'error', module,
        msg: `${label} FAILED`, ms: Date.now() - start,
        data: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};

// ── Legacy helper kept for backward compat ────────────────────

export function consoleLog(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  logger[level]('app', args.map(String).join(' '));
}
