import { useState, useEffect } from 'react';
import { business, type Car, type FleetStat } from '../../services/api.ts';
import { T, Screen, PageHeader, Card, KpiGrid, Kpi, SectionTitle, Empty, tone } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';


export default function PricingScreen() {
  const [cars, setCars] = useState<Car[]>([]);
  const [stats, setStats] = useState<FleetStat[]>([]);
  const [summer, setSummer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      business.fetchCars().catch(() => ({ cars: [] as Car[] })),
      business.fetchFleet().catch(() => null),
      business.insightsForecast().catch(() => null),
    ]).then(([c, f, fc]) => {
      setCars(c.cars ?? []);
      setStats(f?.stats ?? []);
      setSummer(!!fc?.summerSoon);
    }).finally(() => setLoading(false));
  }, []);

  const suggest = (car: Car) => {
    const price = car.resale_price ?? car.base_price ?? 0;
    const occ = stats.find(s => s.car_name === car.name)?.occupancy_pct ?? 0;
    let pct = 0, reason = 'Prix stable', col = T.muted;
    if (summer || occ >= 70) { pct = 20; reason = summer ? 'Été / forte demande' : 'Très demandée'; col = T.warn; }
    else if (occ >= 40) { pct = 10; reason = 'Demande correcte'; col = T.accent; }
    else if (occ > 0 && occ < 15) { pct = -10; reason = 'Peu demandée — baisser pour louer'; col = T.accent2; }
    const sugg = Math.round(price * (1 + pct / 100));
    return { price, occ, pct, reason, col, sugg, cur: car.currency === 'DZD' ? 'DA' : '€' };
  };

  const all = cars.map(c => ({ car: c, s: suggest(c) }));
  const up = all.filter(x => x.s.pct > 0).length, down = all.filter(x => x.s.pct < 0).length;

  return (
    <Screen header={<PageHeader eyebrow="Tarification" title="Prix conseillés" subtitle="Selon l'occupation de chaque voiture et la saison — tu décides" />}>
      {summer && <Card accent={T.warn} style={{ marginBottom: 14 }}><div style={{ fontSize: 14, color: T.warn, lineHeight: 1.5 }}>☀️ <b>Période forte</b> (été / diaspora) — hausses conseillées sur les voitures demandées.</div></Card>}
      <KpiGrid cols={3}>
        <Kpi value={up} label="À augmenter" color={T.warn} />
        <Kpi value={all.length - up - down} label="Prix justes" color={T.ok} />
        <Kpi value={down} label="À baisser" color={T.accent2} />
      </KpiGrid>

      <SectionTitle>Par voiture</SectionTitle>
      {loading ? <SkeletonCards count={5} height={76} /> : cars.length === 0 ? <Empty icon="🚗" title="Aucun véhicule" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {all.map(({ car, s }) => (
            <Card key={car.id} pad={10} accent={s.pct !== 0 ? s.col : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 64, height: 48, borderRadius: 11, flexShrink: 0, background: car.image_url ? `url(${car.image_url}) center/cover` : tone(T.accent, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{car.image_url ? '' : '🚗'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{car.name}</div>
                <div style={{ fontSize: 12.5, color: s.col, marginTop: 2 }}>{s.reason}</div>
                {s.occ > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    <div style={{ flex: 1, maxWidth: 90, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, s.occ)}%`, height: '100%', background: s.col === T.muted ? T.accent : s.col }} /></div>
                    <span style={{ fontSize: 11.5, color: T.muted }}>occupée {Math.round(s.occ)} %</span>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {s.pct !== 0 ? <>
                  <div style={{ fontSize: 12, color: T.faint, textDecoration: 'line-through' }}>{s.price} {s.cur}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.col, lineHeight: 1.1 }}>{s.sugg} {s.cur}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: s.col }}>{s.pct > 0 ? `+${s.pct}` : s.pct} % / jour</div>
                </> : <>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{s.price} {s.cur}</div>
                  <div style={{ fontSize: 11.5, color: T.muted }}>par jour</div>
                </>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: T.muted, marginTop: 16, lineHeight: 1.5 }}>💡 Conseils indicatifs. Pour changer un prix : page Parc → touche la voiture → Prix.</div>
    </Screen>
  );
}
