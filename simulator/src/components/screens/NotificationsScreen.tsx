import { useState, useEffect } from 'react';
import { business, type SmartReminder } from '../../services/api.ts';

const PRIORITY_COL = { HIGH: '#ff3366', MEDIUM: '#ffb347', LOW: '#00d4ff' };
const PRIORITY_BG  = { HIGH: 'rgba(255,51,102,0.07)', MEDIUM: 'rgba(255,179,71,0.07)', LOW: 'rgba(0,212,255,0.04)' };
const PRIORITY_ICON = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🔵' };

const TYPE_ICON: Record<string, string> = {
  RETURN_TODAY:   '🚗',
  RETURN_SOON:    '⏰',
  UNPAID:         '💰',
  MISSING_DOCS:   '📄',
  UPCOMING:       '📅',
  CONFLICT:       '⚠️',
  LOW_PERIOD:     '📊',
};

export default function NotificationsScreen({ actor = 'kouider' }: { actor?: string }) {
  void actor; // actor carried by API token — backend filters accordingly
  const [reminders, setReminders] = useState<SmartReminder[]>([]);
  const [loading, setLoad]        = useState(true);
  const [dismissing, setDismiss]  = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState('');

  const load = async () => {
    setLoad(true);
    try {
      const r = await business.fetchReminders();
      setReminders(r.reminders ?? []);
      setLastUpdate(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    } catch { setReminders([]); }
    finally { setLoad(false); }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, []);

  const dismiss = async (id: string) => {
    setDismiss(id);
    await business.dismissReminder(id).catch(() => {});
    setReminders(rs => rs.filter(r => r.id !== id));
    setDismiss(null);
  };

  const high   = reminders.filter(r => r.priority === 'HIGH');
  const medium = reminders.filter(r => r.priority === 'MEDIUM');
  const low    = reminders.filter(r => r.priority === 'LOW');

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch { return iso.slice(0, 10); }
  };

  const renderGroup = (items: SmartReminder[], priority: 'HIGH' | 'MEDIUM' | 'LOW') => {
    if (items.length === 0) return null;
    const col = PRIORITY_COL[priority];
    return (
      <div key={priority} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: `${col}88`, letterSpacing: '0.2em', paddingLeft: 2 }}>
          {PRIORITY_ICON[priority]} {priority} ({items.length})
        </div>
        {items.map(r => {
          const bg = PRIORITY_BG[priority];
          const isDismissing = dismissing === r.id;
          return (
            <div key={r.id} style={{
              borderRadius: 10, border: `1px solid ${col}22`,
              background: bg, padding: '9px 11px',
              opacity: isDismissing ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
                  {TYPE_ICON[r.type] ?? '🔔'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: '#e8f4ff', marginBottom: 3, lineHeight: 1.4 }}>
                    {r.message}
                  </div>
                  <div style={{ fontSize: 7, color: '#ffffff44', marginBottom: 4 }}>
                    {r.client_name}
                    {r.car_name ? ` · ${r.car_name}` : ''}
                    {r.date ? ` · ${fmtDate(r.date)}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 6, color: col, fontFamily: 'Orbitron', letterSpacing: '0.1em',
                      background: `${col}14`, padding: '2px 6px', borderRadius: 4,
                    }}>
                      {r.action}
                    </span>
                    <button
                      onClick={() => void dismiss(r.id)}
                      disabled={isDismissing}
                      style={{
                        background: 'none', border: '1px solid #ffffff11', borderRadius: 4,
                        padding: '2px 7px', fontFamily: 'Orbitron', fontSize: 6,
                        color: '#ffffff33', cursor: 'pointer', letterSpacing: '0.1em',
                        marginLeft: 'auto',
                      }}
                    >
                      {isDismissing ? '…' : '✕ VU'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
              ALERTES
            </div>
            {reminders.length > 0 && (
              <div style={{
                background: '#ff3366', borderRadius: '50%', width: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Orbitron', fontSize: 7, color: '#fff',
              }}>
                {reminders.length}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastUpdate && <span style={{ fontSize: 7, color: '#ffffff22', letterSpacing: '0.1em' }}>{lastUpdate}</span>}
            <button onClick={() => void load()} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#00d4ff55' }}>↻</button>
          </div>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#00d4ff33', fontFamily: 'Orbitron', letterSpacing: '0.25em' }}>
            CHARGEMENT…
          </div>
        ) : reminders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>✅</span>
            <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00e67644', letterSpacing: '0.2em' }}>
              AUCUNE ALERTE
            </span>
            <span style={{ fontSize: 8, color: '#ffffff22' }}>Tout est en ordre</span>
          </div>
        ) : (
          <>
            {renderGroup(high, 'HIGH')}
            {renderGroup(medium, 'MEDIUM')}
            {renderGroup(low, 'LOW')}
          </>
        )}

        {/* Dzaryx proactive info */}
        <div style={{ background: 'rgba(0,212,255,0.03)', borderRadius: 10, padding: '10px 12px', border: '1px solid #00d4ff0f' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff33', letterSpacing: '0.2em', marginBottom: 6 }}>
            ◉ DZARYX — PROACTIF
          </div>
          <div style={{ fontSize: 8, color: '#ffffff22', lineHeight: 1.6 }}>
            Dzaryx envoie des alertes en temps réel via Socket.IO.
            Activez la voix ou le chat pour recevoir les notifications proactives directement.
          </div>
        </div>
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = '#00d4ff';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
