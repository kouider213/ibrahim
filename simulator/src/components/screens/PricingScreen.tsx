import { useState, useEffect } from 'react';
import { business, type Car, type FleetStat } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#ef4444', blue: '#60a5fa', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

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
    let pct = 0, reason = 'Prix stable', col = C.muted;
    if (summer || occ >= 70) { pct = 20; reason = summer ? 'Été / forte demande' : 'Très demandée'; col = C.gold; }
    else if (occ >= 40) { pct = 10; reason = 'Demande correcte'; col = C.accent; }
    else if (occ > 0 && occ < 15) { pct = -10; reason = 'Peu demandée — baisser pour louer'; col = C.blue; }
    const sugg = Math.round(price * (1 + pct / 100));
    return { price, occ, pct, reason, col, sugg, cur: car.currency === 'DZD' ? 'DA' : '€' };
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Tarification" title="Prix conseillés" accent={C.gold} /></div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Selon l'occupation et la saison — à toi de décider</div>

      {summer && <div style={{ background: `${C.gold}14`, border: `1px solid ${C.gold}44`, borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 12.5, color: C.gold }}>☀️ Période forte (été/diaspora) — hausses conseillées sur les véhicules demandés.</div>}

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Chargement…</div> : cars.length === 0 ? <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Aucun véhicule</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cars.map(car => {
            const s = suggest(car);
            return (
              <div key={car.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{car.name}</div>
                    <div style={{ fontSize: 11, color: s.col, marginTop: 2 }}>{s.reason}{s.occ > 0 ? ` · occ. ${Math.round(s.occ)}%` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: C.muted, textDecoration: s.pct !== 0 ? 'line-through' : 'none' }}>{s.price} {s.cur}/j</div>
                    {s.pct !== 0 && <div style={{ fontSize: 16, fontWeight: 800, color: s.col }}>{s.sugg} {s.cur}/j <span style={{ fontSize: 10 }}>{s.pct > 0 ? `+${s.pct}%` : `${s.pct}%`}</span></div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 16, lineHeight: 1.5 }}>💡 Conseils indicatifs. Pour appliquer un prix : onglet PARC → bouton Prix sur le véhicule.</div>
    </div>
  );
}
