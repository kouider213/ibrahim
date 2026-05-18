import { useState, useEffect } from 'react';
import { business, type SmartReminder } from '../../services/api.ts';

const PRI_COL = { HIGH: '#ff3366', MEDIUM: '#ffb347', LOW: '#ffffff55' } as const;
const PRI_BG  = { HIGH: '#ff336611', MEDIUM: '#ffb34711', LOW: '#ffffff08' } as const;
const PRI_LABEL = { HIGH: '🔴 URGENT', MEDIUM: '🟡 MOYEN', LOW: '⚪ FAIBLE' } as const;

export default function RemindersScreen() {
  const [reminders, setRem] = useState<SmartReminder[]>([]);
  const [loading, setLoad]  = useState(true);
  const [dismissed, setDis] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoad(true);
    try {
      const r = await business.fetchReminders();
      setRem(r.reminders ?? []);
    } catch { setRem([]); }
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>RAPPELS</span>
        {byPri.HIGH.length > 0 && (
          <span style={{ background: '#ff336622', border: '1px solid #ff336666', borderRadius: 10, padding: '1px 6px', fontSize: 8, color: '#ff3366' }}>
            {byPri.HIGH.length} URGENT
          </span>
        )}
        <button onClick={() => void load()} style={{ marginLeft: 'auto', ...refreshBtn }}>↻</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <Loader />
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, fontSize: 10, color: '#00e676' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
            Aucun rappel actif
          </div>
        ) : (
          (['HIGH', 'MEDIUM', 'LOW'] as const).map(pri => {
            const items = byPri[pri];
            if (items.length === 0) return null;
            const col = PRI_COL[pri];
            const bg  = PRI_BG[pri];
            return (
              <div key={pri}>
                <div style={{ padding: '6px 12px 3px', fontSize: 8, color: col, fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>
                  {PRI_LABEL[pri]}
                </div>
                {items.map(r => (
                  <div key={r.id} style={{ margin: '3px 10px', borderRadius: 8, background: bg, border: `1px solid ${col}33`, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: '#fff', lineHeight: 1.4, marginBottom: 3 }}>{r.message}</div>
                        <div style={{ fontSize: 8, color: '#ffffff55' }}>
                          {r.client_name} · {r.car_name}
                        </div>
                        <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 2 }}>
                          {fmtDate(r.date)} · {r.action}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        {r.client_phone && (
                          <a href={`tel:${r.client_phone}`} style={{ fontSize: 14, textDecoration: 'none' }}>📞</a>
                        )}
                        <button
                          onClick={() => void dismiss(r.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ffffff33' }}
                          title="Ignorer"
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

function Loader() {
  return <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#00d4ff44', fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>CHARGEMENT…</div>;
}
const refreshBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#00d4ff66', cursor: 'pointer', fontSize: 14,
};
