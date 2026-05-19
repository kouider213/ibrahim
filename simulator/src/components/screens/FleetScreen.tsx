import { useState, useEffect } from 'react';
import { business, type Car, type FleetIntel } from '../../services/api.ts';

export default function FleetScreen() {
  const [intel, setIntel]  = useState<FleetIntel | null>(null);
  const [cars, setCars]    = useState<Car[]>([]);
  const [loading, setLoad] = useState(true);
  const [toggling, setTog] = useState<string | null>(null);
  const [msg, setMsg]      = useState('');

  const load = async () => {
    setLoad(true);
    try {
      const [fleetRes, carsRes] = await Promise.all([
        business.fetchFleet().catch(() => null),
        business.fetchCars().catch(() => ({ cars: [] as Car[] })),
      ]);
      setIntel(fleetRes);
      setCars(carsRes.cars ?? []);
    } finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (car: Car) => {
    setTog(car.id);
    const ok = await business.toggleCar(car.id, !car.available).catch(() => false);
    if (ok) {
      setCars(cs => cs.map(c => c.id === car.id ? { ...c, available: !c.available } : c));
      setMsg(`${car.name} → ${!car.available ? 'DISPONIBLE' : 'INDISPONIBLE'}`);
      setTimeout(() => setMsg(''), 2500);
    }
    setTog(null);
  };

  const availCount  = cars.filter(c => c.available).length;
  const unavailCount = cars.filter(c => !c.available).length;
  const occPct      = intel ? Math.round(intel.occupancy_avg_pct) : 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            PARC VÉHICULES
          </div>
          {msg && (
            <span style={{ fontSize: 8, color: '#00e676', fontFamily: 'Orbitron', letterSpacing: '0.1em' }}>{msg}</span>
          )}
        </div>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          <KpiCard label="TOTAL" val={String(cars.length)} col="#00d4ff" />
          <KpiCard label="DISPO" val={String(availCount)} col="#00e676" />
          <KpiCard label="OCCUP" val={`${occPct}%`} col="#ffb347" />
          <KpiCard label="INDISPO" val={String(unavailCount)} col="#ff3366" />
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      {/* Cars list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <HudLoader />
        ) : cars.length === 0 ? (
          <HudEmpty text="Aucun véhicule" />
        ) : cars.map(car => {
          const avail   = car.available;
          const col     = avail ? '#00e676' : '#ff3366';
          const stat    = intel?.stats.find(s => s.car_name === car.name);
          const isTog   = toggling === car.id;
          const rev30d  = stat ? Math.round(stat.revenue_30d) : null;
          const occ30d  = stat ? Math.round(stat.occupancy_pct) : null;
          return (
            <div key={car.id} style={{
              borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${col}2a`,
              background: `linear-gradient(135deg, ${col}07, rgba(2,8,16,0.5))`,
            }}>
              <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Car icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${col}12`, border: `1.5px solid ${col}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>🚗</div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {car.name}
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff44', marginBottom: 4 }}>
                    {car.category ?? 'Standard'}
                    {car.base_price && ` · ${car.base_price}€/j`}
                  </div>
                  {/* Occupancy bar */}
                  {occ30d !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 3, background: '#ffffff0a', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${occ30d}%`,
                          background: `linear-gradient(90deg, ${col}88, ${col})`,
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 7, color: `${col}99`, minWidth: 28, textAlign: 'right' }}>
                        {occ30d}%
                      </span>
                    </div>
                  )}
                  {rev30d !== null && (
                    <div style={{ fontSize: 7, color: '#00d4ff55', marginTop: 2 }}>
                      Rev 30j: {rev30d >= 1000 ? `${(rev30d / 1000).toFixed(1)}k€` : `${rev30d}€`}
                    </div>
                  )}
                </div>

                {/* Toggle */}
                <button
                  onClick={() => void toggle(car)}
                  disabled={isTog}
                  style={{
                    minWidth: 60, padding: '6px 10px', borderRadius: 8,
                    border: `1.5px solid ${col}`,
                    background: `${col}1a`,
                    color: col,
                    fontFamily: 'Orbitron', fontSize: 7, cursor: 'pointer',
                    letterSpacing: '0.12em', opacity: isTog ? 0.5 : 1,
                    boxShadow: `0 0 8px ${col}22`,
                    flexShrink: 0,
                  }}
                >
                  {isTog ? '…' : avail ? 'DISPO' : 'INDISPO'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer refresh */}
      <div style={{ padding: '6px 14px 8px', borderTop: '1px solid #ffffff08', flexShrink: 0 }}>
        <button onClick={() => void load()} style={refreshBtn}>↻ ACTUALISER LE PARC</button>
      </div>
    </div>
  );
}

function KpiCard({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, background: `${col}0a`, borderRadius: 8, padding: '6px 8px', border: `1px solid ${col}2a`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: col, textShadow: `0 0 10px ${col}44` }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.15em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function HudLoader() {
  return (
    <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#00d4ff33', fontFamily: 'Orbitron', letterSpacing: '0.25em' }}>
      CHARGEMENT…
    </div>
  );
}
function HudEmpty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 30, fontSize: 9, color: '#ffffff1a', letterSpacing: '0.1em' }}>{text}</div>;
}

const refreshBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #00d4ff22', borderRadius: 6,
  padding: '5px 12px', fontFamily: 'Orbitron', fontSize: 7,
  color: '#00d4ff55', cursor: 'pointer', letterSpacing: '0.2em', width: '100%',
};

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
