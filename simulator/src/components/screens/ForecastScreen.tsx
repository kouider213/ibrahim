import { useState, useEffect } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Card, KpiGrid, Kpi, SectionTitle, Empty, tone } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

type F = { byMonth: Array<{ month: string; count: number; pct: number }>; peaks: string[]; next3: string[]; summerSoon: boolean; total: number };

export default function ForecastScreen() {
  const [f, setF] = useState<F | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { business.insightsForecast().then(setF).catch(() => setF(null)).finally(() => setLoading(false)); }, []);

  const cur = new Date().getMonth();
  const next3 = f ? [0, 1, 2].map(k => f.byMonth[(cur + k) % 12]).filter(Boolean) : [];
  const nextSum = next3.reduce((a, m) => a + m.count, 0);
  const maxCount = f ? Math.max(1, ...f.byMonth.map(m => m.count)) : 1;
  const SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  const avg3 = f && f.total ? Math.round(f.total / 4) : 0;

  return (
    <Screen header={<PageHeader eyebrow="Prévision" title="Saison diaspora" subtitle="Quand la demande monte — pour préparer la flotte et les prix" />}>
      {loading ? <SkeletonCards count={3} height={110} /> : !f ? <Empty icon="📉" title="Prévision indisponible" text="Réessaie dans un moment." /> : (
        <>
          {f.summerSoon && <Card accent={T.warn} style={{ marginBottom: 14 }}><div style={{ fontSize: 14, color: T.warn, lineHeight: 1.5 }}>☀️ <b>L'été approche</b> — pic diaspora juillet/août. Bloque les voitures clés et monte les prix sur les périodes fortes.</div></Card>}
          <KpiGrid cols={3}>
            <Kpi value={f.peaks[0] ?? '—'} label="Mois le plus fort" color={T.warn} />
            <Kpi value={nextSum} label="Résas sur 3 mois*" color={nextSum >= avg3 ? T.ok : T.accent2} sub={nextSum >= avg3 ? 'période haute' : 'période calme'} />
            <Kpi value={f.total} label="Résas analysées" />
          </KpiGrid>

          <SectionTitle>Réservations par mois</SectionTitle>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 170 }}>
              {f.byMonth.map((m, i) => {
                const peak = f.peaks.includes(m.month), now = i === cur;
                const col = peak ? T.warn : now ? T.ok : T.accent;
                return (
                  <div key={m.month} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: peak ? T.warn : T.muted, fontWeight: 700 }}>{m.count}</span>
                    <div style={{ width: '100%', height: Math.max(4, (m.count / maxCount) * 130), borderRadius: '6px 6px 2px 2px', background: `linear-gradient(180deg, ${col}, ${tone(col, 0.35)})`, boxShadow: peak ? `0 0 12px ${tone(col, 0.5)}` : 'none' }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {f.byMonth.map((m, i) => <span key={m.month} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11, color: i === cur ? T.ok : T.muted, fontWeight: i === cur ? 800 : 500, overflow: 'hidden' }}>{SHORT[i] ?? m.month}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12, color: T.muted, flexWrap: 'wrap' }}>
              <span><span style={{ color: T.warn }}>■</span> mois forts</span><span><span style={{ color: T.ok }}>■</span> ce mois-ci</span>
            </div>
          </Card>

          <SectionTitle>Les 3 prochains mois</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {next3.map(m => (
              <Card key={m.month} pad={12} accent={f.peaks.includes(m.month) ? T.warn : undefined}>
                <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'capitalize' }}>{m.month}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{m.count}</div>
                <div style={{ fontSize: 11.5, color: T.muted }}>résas les années passées</div>
              </Card>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 12 }}>* Basé sur l'historique de tes réservations, pas sur les réservations déjà prises.</div>
        </>
      )}
    </Screen>
  );
}
