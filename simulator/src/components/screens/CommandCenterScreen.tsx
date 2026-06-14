import { useState, useEffect, useCallback } from 'react';
import { business, type TodayItem } from '../../services/api.ts';
import { StatCard, SkeletonCards } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#ef4444', blue: '#60a5fa', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
type Today = { date: string; departures: TodayItem[]; returns: TodayItem[]; toCollect: Array<TodayItem & { due: number }>; newDemands: number; pendingBookings: number };

export default function CommandCenterScreen() {
  const [d, setD] = useState<Today | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setD(await business.insightsToday()); } catch { setD(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const wa = (it: TodayItem) => { const p = (it.phone || '').replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

  const Section = ({ title, items, col, icon, empty }: { title: string; items: TodayItem[]; col: string; icon: string; empty: string }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 8 }}>{icon} {title} ({items.length})</div>
      {items.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>{empty}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.client}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{it.car}{'due' in it ? ` · ${(it as TodayItem & { due: number }).due.toLocaleString('fr-FR')} à encaisser` : ''}</div>
              </div>
              {it.phone && <button onClick={() => wa(it)} style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#25D366' }}>💬</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Aujourd'hui</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Ma journée</div>
        </div>
        <button onClick={() => void load()} style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: C.accent, fontWeight: 700 }}>↻</button>
      </div>

      {loading ? <SkeletonCards count={4} /> : !d ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Indisponible</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 18 }}>
            <StatCard icon="💰" value={d.toCollect.reduce((s, x) => s + x.due, 0).toLocaleString('fr-FR')} label="À ENCAISSER" color={C.gold} />
            <StatCard icon="📥" value={String(d.newDemands)} label="DEMANDES (24h)" color={C.blue} />
          </div>
          <Section title="Départs aujourd'hui" items={d.departures} col={C.accent} icon="🚗" empty="Aucun départ" />
          <Section title="Retours aujourd'hui" items={d.returns} col={C.blue} icon="↩️" empty="Aucun retour" />
          <Section title="À encaisser" items={d.toCollect} col={C.gold} icon="💰" empty="Rien à encaisser" />
        </>
      )}
    </div>
  );
}
