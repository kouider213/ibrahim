import { useState, useEffect } from 'react';
import { business, type RevenueSummary } from '../../services/api.ts';

const SCORE_COL: Record<string, string> = {
  VIP: '#ffd700', FREQUENT: '#00d4ff', FRÉQUENT: '#00d4ff',
  REGULAR: '#00e676', RÉGULIER: '#00e676', NEW: '#ffffff88', NOUVEAU: '#ffffff88',
};

export default function RevenueScreen() {
  const [rev, setRev]       = useState<RevenueSummary | null>(null);
  const [loading, setLoad]  = useState(true);
  const [clearing, setClear] = useState(false);
  const [msg, setMsg]       = useState('');

  const load = async () => {
    setLoad(true);
    try {
      const r = await business.fetchRevenue();
      setRev(r);
    } catch { setRev(null); }
    finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const clearCache = async () => {
    setClear(true);
    try {
      await business.clearCache();
      setMsg('Cache vidé — rechargement…');
      setTimeout(() => { setMsg(''); void load(); }, 1000);
    } catch { setMsg('Erreur cache'); }
    finally { setClear(false); }
  };

  if (loading) return <Loader />;
  if (!rev) return <Error onRetry={load} />;

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>REVENUS</span>
        {msg && <span style={{ marginLeft: 8, fontSize: 8, color: '#00e676' }}>{msg}</span>}
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* CA cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <CACard label="AUJOURD'HUI" val={fmt(rev.today_revenue)} col="#00d4ff" />
          <CACard label="SEMAINE" val={fmt(rev.week_revenue)} col="#9b59b6" />
          <CACard label="MOIS" val={fmt(rev.month_revenue)} col="#00e676" />
        </div>

        {/* Profit + Bookings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffd70033' }}>
            <div style={{ fontSize: 8, color: '#ffd70088', letterSpacing: '0.2em', marginBottom: 4 }}>PROFIT KOUIDER</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#ffd700' }}>{fmt(rev.kouider_profit_month)}</div>
            <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 2 }}>ce mois</div>
          </div>
          <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #00d4ff22' }}>
            <div style={{ fontSize: 8, color: '#00d4ff88', letterSpacing: '0.2em', marginBottom: 4 }}>RÉSERVATIONS</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#00d4ff' }}>{rev.total_bookings_month}</div>
            <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 2 }}>ce mois</div>
          </div>
        </div>

        {/* Top clients */}
        {rev.top_clients?.length > 0 && (
          <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffffff0a' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#ffffff66', letterSpacing: '0.2em', marginBottom: 8 }}>TOP CLIENTS</div>
            {rev.top_clients.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: SCORE_COL[c.score.toUpperCase()] ?? '#ffffff66', minWidth: 60 }}>
                  {c.score.toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.client_name}
                </span>
                <span style={{ fontSize: 9, color: '#ffd700', flexShrink: 0 }}>{fmt(c.total_spent)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => void load()} style={actionBtn('#00d4ff')}>↻ ACTUALISER</button>
          <button onClick={() => void clearCache()} disabled={clearing} style={actionBtn('#ff6b00')}>
            {clearing ? '…' : '⚡ VIDER CACHE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CACard({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ background: '#0a1520', borderRadius: 10, padding: '8px 10px', border: `1px solid ${col}22`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 13, color: col }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}88`, letterSpacing: '0.15em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020810' }}>
      <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff44', letterSpacing: '0.2em' }}>CHARGEMENT…</span>
    </div>
  );
}

function Error({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020810', gap: 12 }}>
      <span style={{ fontSize: 9, color: '#ff336688' }}>Erreur de chargement</span>
      <button onClick={onRetry} style={actionBtn('#ff3366')}>RÉESSAYER</button>
    </div>
  );
}

function actionBtn(col: string): React.CSSProperties {
  return {
    background: 'transparent', border: `1px solid ${col}66`, borderRadius: 4,
    padding: '5px 10px', fontFamily: 'Orbitron', fontSize: 7,
    color: `${col}cc`, cursor: 'pointer', letterSpacing: '0.15em',
  };
}
