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
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          <KpiCard label="TOTAL"  val={String(cars.length)}  col="#00d4ff" />
          <KpiCard label="DISPO"  val={String(availCount)}   col="#00e676" />
          <KpiCard label="OCCUP"  val={`${occPct}%`}         col="#ffb347" />
          <KpiCard label="INDISPO" val={String(unavailCount)} col="#ff3366" />
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      {/* Cars list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
              borderRadius: 14, overflow: 'hidden',
              border: `1px solid ${col}28`,
              background: `linear-gradient(160deg, ${col}08, rgba(2,8,16,0.7))`,
            }}>
              {/* ── Photo banner — full width, tall enough to see whole car ── */}
              <div style={{
                width: '100%', height: 130,
                background: `linear-gradient(135deg, ${col}0d, #020810)`,
                position: 'relative', overflow: 'hidden',
              }}>
                <CarPhoto url={car.image_url ?? null} name={car.name} col={col} />

                {/* Status badge — top right */}
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  padding: '4px 10px', borderRadius: 20,
                  background: avail ? '#00e676dd' : '#ff3366dd',
                  color: '#fff', fontFamily: 'Orbitron', fontSize: 8,
                  fontWeight: 700, letterSpacing: '0.1em',
                  boxShadow: `0 2px 8px ${col}66`,
                }}>
                  {avail ? '● DISPO' : '○ INDISPO'}
                </div>

                {/* Occupation bar — bottom of photo */}
                {occ30d !== null && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 18,
                    background: 'linear-gradient(transparent, rgba(2,8,16,0.85))',
                    display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6 }}>
                    <div style={{ flex: 1, height: 3, background: '#ffffff0a', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${occ30d}%`,
                        background: `linear-gradient(90deg, ${col}66, ${col})`, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: `${col}aa`, minWidth: 28, textAlign: 'right' }}>{occ30d}%</span>
                  </div>
                )}
              </div>

              {/* ── Info + toggle row ── */}
              <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#e8f4ff', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {car.name}
                  </div>
                  <div style={{ fontSize: 7, color: '#ffffff44' }}>
                    📍 {car.category ?? 'Standard'}
                    {car.base_price ? ` · ${car.base_price}€/j` : ''}
                    {rev30d !== null ? ` · Rev: ${rev30d >= 1000 ? `${(rev30d / 1000).toFixed(1)}k€` : `${rev30d}€`}` : ''}
                  </div>
                </div>

                {/* iOS-style toggle */}
                <button
                  onClick={() => void toggle(car)}
                  disabled={isTog}
                  style={{
                    width: 52, height: 28, borderRadius: 14, flexShrink: 0,
                    background: avail
                      ? 'linear-gradient(90deg, #00e67644, #00e676aa)'
                      : 'linear-gradient(90deg, #ff336644, #ff3366aa)',
                    border: `1.5px solid ${col}66`,
                    cursor: isTog ? 'default' : 'pointer',
                    opacity: isTog ? 0.5 : 1,
                    position: 'relative',
                    transition: 'all 0.2s',
                    boxShadow: `0 0 10px ${col}33`,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3,
                    width: 20, height: 20, borderRadius: '50%',
                    background: isTog ? '#ffffff66' : '#fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
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
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 40, opacity: 0.25 }}>🚗</span>
      </div>
    );
  }
  return (
    <>
      {!loaded && (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 40, opacity: 0.2 }}>🚗</span>
        </div>
      )}
      <img
        src={url} alt={name}
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          display: loaded ? 'block' : 'none',
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </>
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
