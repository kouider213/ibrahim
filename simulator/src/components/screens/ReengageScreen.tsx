import { useState, useEffect, useCallback } from 'react';
import { business } from '../../services/api.ts';
import { Hero, SkeletonCards } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
type D = { name: string; phone: string | null; date: string; car: string; count: number };

export default function ReengageScreen() {
  const [list, setList] = useState<D[]>([]);
  const [months, setMonths] = useState(4);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m: number) => {
    setLoading(true);
    try { const r = await business.insightsReengage(m); setList(r.dormant ?? []); } catch { setList([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(months); }, [load, months]);

  const wa = (d: D) => {
    const p = (d.phone || '').replace(/\D/g, ''); if (!p) return;
    const msg = `Bonjour ${d.name}, c'est Fik Conciergerie 👋 Ça fait un moment ! Une offre spéciale pour votre prochaine location/séjour à Oran ? Dites-nous, on s'occupe de tout 🙏`;
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Fidélisation" title="Relancer les clients" /></div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Clients qui ne sont pas revenus — réactive-les en 1 tap</div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
        {[3, 4, 6, 12].map(m => (
          <button key={m} onClick={() => setMonths(m)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: months === m ? C.accent : 'rgba(255,255,255,0.04)', color: months === m ? '#06210f' : C.muted, border: 'none' }}>+{m} mois</button>
        ))}
      </div>

      {loading ? <SkeletonCards count={5} /> : list.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Aucun client dormant 🎉</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((d, i) => (
            <div key={d.phone || d.name + i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: '11px 13px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Dernière : {d.car} · {(d.date || '').slice(0, 10)} · {d.count} résa</div>
              </div>
              {d.phone && <button onClick={() => wa(d)} style={{ background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', borderRadius: 9, padding: '7px 11px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#25D366' }}>💬 Relancer</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
