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

  const availCount   = cars.filter(c => c.available).length;
  const unavailCount = cars.filter(c => !c.available).length;
  const occPct       = intel ? Math.round(intel.occupancy_avg_pct) : 0;

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
          const avail  = car.available;
          const col    = avail ? '#00e676' : '#ff3366';
          const stat   = intel?.stats.find(s => s.car_name === car.name);
          const isTog  = toggling === car.id;
          const rev30d = stat ? Math.round(stat.revenue_30d) : null;
          const occ30d = stat ? Math.round(stat.occupancy_pct) : null;

          return (
            <div key={car.id} style={{
              borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${col}22`,
              background: `linear-gradient(135deg, ${col}06, rgba(2,8,16,0.6))`,
              display: 'flex', height: 84,
            }}>
              {/* Photo — LEFT column */}
              <div style={{ width: 90, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                <CarPhoto url={car.image_url ?? null} name={car.name} col={col} />
                {/* Status dot on photo */}
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  width: 8, height: 8, borderRadius: '50%',
                  background: col, boxShadow: `0 0 6px ${col}`,
                }} />
              </div>

              {/* Vertical divider */}
              <div style={{ width: 1, background: `${col}18`, flexShrink: 0 }} />

              {/* Info — CENTER */}
              <div style={{ flex: 1, padding: '8px 10px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 13, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, marginBottom: 2 }}>
                  {car.name}
                </div>
                <div style={{ fontSize: 7, color: `${col}88`, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📍 {car.category ?? 'Standard'}
                  {car.base_price ? ` · ${car.base_price}€/j` : ''}
                  {rev30d !== null ? ` · ${rev30d >= 1000 ? `${(rev30d / 1000).toFixed(1)}k€` : `${rev30d}€`}` : ''}
                </div>
                {occ30d !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ flex: 1, height: 3, background: '#ffffff0a', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${occ30d}%`, background: `linear-gradient(90deg, ${col}66, ${col})`, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: `${col}88`, minWidth: 24, textAlign: 'right' }}>{occ30d}%</span>
                  </div>
                )}
              </div>

              {/* Toggle — RIGHT column */}
              <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button
                  onClick={() => void toggle(car)}
                  disabled={isTog}
                  style={{
                    width: 52, height: 28, borderRadius: 14,
                    background: avail
                      ? `linear-gradient(90deg, #00e67644, #00e676aa)`
                      : `linear-gradient(90deg, #ff336644, #ff3366aa)`,
                    border: `1.5px solid ${col}66`,
                    cursor: isTog ? 'default' : 'pointer',
                    opacity: isTog ? 0.5 : 1,
                    position: 'relative',
                    transition: 'all 0.2s',
                    boxShadow: `0 0 10px ${col}33`,
                  }}
                >
                  {/* Pill knob */}
                  <div style={{
                    position: 'absolute',
                    top: 3, width: 20, height: 20, borderRadius: '50%',
                    background: isTog ? '#ffffff66' : '#fff',
                    boxShadow: `0 1px 4px rgba(0,0,0,0.4)`,
                    transition: 'left 0.2s',
                    left: avail ? 26 : 4,
                  }} />
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

function CarPhoto({ url, name, col }: { url: string | null; name: string; col: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!url || failed) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: `linear-gradient(135deg, ${col}12, #020810)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CarPlaceholder col={col} />
      </div>
    );
  }
  return (
    <>
      {!loaded && (
        <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${col}12, #020810)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CarPlaceholder col={col} />
        </div>
      )}
      <img
        src={url}
        alt={name}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: loaded ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
  );
}

function CarPlaceholder({ col }: { col: string }) {
  return (
    <svg width="40" height="28" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="12" width="36" height="10" rx="3" fill={col} fillOpacity="0.12" stroke={col} strokeWidth="0.8" strokeOpacity="0.5"/>
      <path d="M 10 12 L 14 5 L 26 5 L 30 12" fill={col} fillOpacity="0.1" stroke={col} strokeWidth="0.8" strokeOpacity="0.4"/>
      <rect x="14.5" y="6.5" width="4.5" height="5" rx="1" fill={col} fillOpacity="0.25"/>
      <rect x="21" y="6.5" width="4.5" height="5" rx="1" fill={col} fillOpacity="0.25"/>
      <circle cx="10" cy="22" r="3.5" fill="none" stroke={col} strokeWidth="1" strokeOpacity="0.6"/>
      <circle cx="10" cy="22" r="1.5" fill={col} fillOpacity="0.3"/>
      <circle cx="30" cy="22" r="3.5" fill="none" stroke={col} strokeWidth="1" strokeOpacity="0.6"/>
      <circle cx="30" cy="22" r="1.5" fill={col} fillOpacity="0.3"/>
      <rect x="36" y="14" width="2" height="3" rx="1" fill={col} fillOpacity="0.7"/>
    </svg>
  );
}

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
