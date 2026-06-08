import { useState, useEffect } from 'react';
import { business, type SmartReminder } from '../../services/api.ts';

const PRI_COL   = { HIGH: '#ff3366', MEDIUM: '#ffb347', LOW: '#ffffff44' } as const;
const PRI_BG    = { HIGH: '#ff336610', MEDIUM: '#ffb34710', LOW: '#ffffff06' } as const;
const PRI_LABEL = { HIGH: 'URGENT', MEDIUM: 'MOYEN', LOW: 'FAIBLE' } as const;
const PRI_ICON  = { HIGH: '🔴', MEDIUM: '🟡', LOW: '⚪' } as const;

export default function RemindersScreen({ actor = 'kouider' }: { actor?: string }) {
  void actor; // actor is used via API token which already carries the identity
  const [reminders, setRem] = useState<SmartReminder[]>([]);
  const [loading, setLoad]  = useState(true);
  const [dismissed, setDis] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoad(true);
    try { setRem((await business.fetchReminders()).reminders ?? []); }
    catch { setRem([]); }
    finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const dismiss = async (id: string) => {
    setDis(d => new Set([...d, id]));
    await business.dismissReminder(id).catch(() => {});
  };

  const visible = reminders.filter(r => !dismissed.has(r.id));
  const byPri = {
    HIGH:   visible.filter(r => r.priority === 'HIGH'),
    MEDIUM: visible.filter(r => r.priority === 'MEDIUM'),
    LOW:    visible.filter(r => r.priority === 'LOW'),
  };

  const fmtDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #10b98112', flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#10b981', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #10b98155' }}>
            RAPPELS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {byPri.HIGH.length > 0 && (
              <div style={{
                background: '#ff336618', border: '1px solid #ff336655', borderRadius: 10,
                padding: '3px 8px', fontSize: 7, color: '#ff3366', fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.1em', animation: 'statusPulse 1.5s ease infinite',
              }}>
                {byPri.HIGH.length} URGENT
              </div>
            )}
            <button onClick={() => void load()} style={{ background: 'none', border: '1px solid #10b98122', borderRadius: 6, padding: '3px 8px', color: '#10b98166', cursor: 'pointer', fontSize: 12 }}>
              ↻
            </button>
          </div>
        </div>

        {/* Priority summary */}
        <div style={{ display: 'flex', gap: 5 }}>
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(pri => (
            <div key={pri} style={{
              flex: 1, background: PRI_BG[pri], borderRadius: 7, padding: '4px 6px',
              border: `1px solid ${PRI_COL[pri]}2a`, textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: PRI_COL[pri], textShadow: `0 0 8px ${PRI_COL[pri]}44` }}>
                {byPri[pri].length}
              </div>
              <div style={{ fontSize: 6, color: `${PRI_COL[pri]}66`, letterSpacing: '0.12em', marginTop: 1 }}>{PRI_LABEL[pri]}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #10b98144, transparent)' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#10b98133', fontFamily: 'Inter, sans-serif', letterSpacing: '0.25em' }}>CHARGEMENT…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ fontSize: 10, color: '#00e676', fontFamily: 'Inter, sans-serif', letterSpacing: '0.2em' }}>
              AUCUN RAPPEL ACTIF
            </div>
          </div>
        ) : (
          (['HIGH', 'MEDIUM', 'LOW'] as const).map(pri => {
            const items = byPri[pri];
            if (items.length === 0) return null;
            const col = PRI_COL[pri];
            const bg  = PRI_BG[pri];
            return (
              <div key={pri} style={{ marginBottom: 4 }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px 4px',
                }}>
                  <span>{PRI_ICON[pri]}</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: col, letterSpacing: '0.2em' }}>
                    {PRI_LABEL[pri]}
                  </span>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${col}33, transparent)` }} />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: `${col}55` }}>{items.length}</span>
                </div>

                {/* Items */}
                {items.map(r => (
                  <div key={r.id} style={{
                    margin: '0 0 5px', borderRadius: 10,
                    background: bg, border: `1px solid ${col}2a`,
                    padding: '9px 10px',
                    boxShadow: pri === 'HIGH' ? `0 0 10px ${col}0f` : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {/* Left accent bar */}
                      <div style={{ width: 3, borderRadius: 2, background: col, flexShrink: 0, alignSelf: 'stretch', opacity: 0.8 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: '#e8f4ff', lineHeight: 1.45, marginBottom: 4 }}>
                          {r.message}
                        </div>
                        <div style={{ fontSize: 8, color: '#ffffff44' }}>
                          {r.client_name} · {r.car_name}
                        </div>
                        <div style={{ fontSize: 7, color: `${col}55`, marginTop: 3, letterSpacing: '0.05em' }}>
                          {fmtDate(r.date)} · {r.action}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                        {r.client_phone && (
                          <a href={`tel:${r.client_phone}`} style={{ fontSize: 15, textDecoration: 'none' }}>📞</a>
                        )}
                        <button
                          onClick={() => void dismiss(r.id)}
                          style={{
                            background: 'none', border: `1px solid ${col}22`,
                            borderRadius: 4, cursor: 'pointer',
                            fontSize: 10, color: `${col}44`, padding: '2px 4px',
                          }}
                        >✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = 'transparent';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
