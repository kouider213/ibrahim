import { useState, useEffect, useCallback } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Segmented, Row, Avatar, Btn, Empty, Kpi, KpiGrid } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

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

  const withPhone = list.filter(d => d.phone).length;
  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const PERIODS = [3, 4, 6, 12].map(m => ({ id: String(m), label: `${m} mois` }));

  return (
    <Screen header={<>
      <PageHeader eyebrow="Fidélisation" title="Relancer les clients" subtitle="Ceux qui ne sont pas revenus depuis…" />
      <div style={{ padding: '0 16px 10px' }}><Segmented items={PERIODS} value={String(months)} onChange={k => setMonths(+k)} /></div>
    </>}>
      <KpiGrid>
        <Kpi value={loading ? '—' : list.length} label="Clients à relancer" color={T.warn} />
        <Kpi value={loading ? '—' : withPhone} label="Joignables sur WhatsApp" color={T.ok} />
      </KpiGrid>
      {loading ? <SkeletonCards count={5} /> : list.length === 0 ? <Empty icon="🎉" title="Personne à relancer" text={`Tous tes clients sont revenus depuis moins de ${months} mois.`} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((d, i) => (
            <Row key={d.phone || d.name + i} left={<Avatar name={d.name} color={d.count > 1 ? T.warn : T.accent} />}
              title={d.name}
              sub={<>{d.car} · {fmt(d.date)}<br />{d.count} location{d.count > 1 ? 's' : ''}{d.count > 1 ? ' · fidèle ⭐' : ''}</>}
              right={d.phone ? <Btn onClick={() => wa(d)} color="#25D366" style={{ padding: '0 12px' }}>💬 Relancer</Btn> : <span style={{ fontSize: 12, color: T.faint }}>pas de n°</span>} />
          ))}
        </div>
      )}
    </Screen>
  );
}
