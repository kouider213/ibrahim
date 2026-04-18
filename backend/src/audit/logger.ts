import { supabase } from '../integrations/supabase.js';

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
    actor:     entry.actor ?? 'ibrahim',
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

export function consoleLog(level: 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}
