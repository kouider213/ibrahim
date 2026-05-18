import { useState, useEffect } from 'react';
import { business, type Car, type FleetIntel } from '../../services/api.ts';

export default function FleetScreen() {
  const [intel, setIntel]   = useState<FleetIntel | null>(null);
  const [cars, setCars]     = useState<Car[]>([]);
  const [loading, setLoad]  = useState(true);
  const [toggling, setTog]  = useState<string | null>(null);
  const [msg, setMsg]       = useState('');

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
      setMsg(`${car.name} → ${!car.available ? 'DISPO' : 'INDISPO'}`);
      setTimeout(() => setMsg(''), 2000);
    }
    setTog(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>PARC VÉHICULES</span>
        {msg && <span style={{ marginLeft: 12, fontSize: 8, color: '#00e676' }}>{msg}</span>}
      </div>

      {/* Fleet stats */}
      {intel && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #ffffff08', flexShrink: 0 }}>
          <StatBox label="TOTAL" val={String(intel.total_cars)} col="#00d4ff" />
          <StatBox label="DISPO" val={String(intel.available_now_count)} col="#00e676" />
          <StatBox label="OCCUP" val={`${Math.round(intel.occupancy_avg_pct)}%`} col="#ffb347" />
        </div>
      )}

      {/* Cars list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <Loader />
        ) : cars.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#ffffff22' }}>Aucun véhicule</div>
        ) : cars.map(car => {
          const stat = intel?.stats.find(s => s.car_name === car.name);
          const avail = car.available;
          const isTog = toggling === car.id;
          return (
            <div key={car.id} style={{
              padding: '8px 12px', borderBottom: '1px solid #ffffff08',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {/* Car icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: avail ? '#00e67622' : '#ff336622',
                border: `1px solid ${avail ? '#00e67666' : '#ff336666'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>🚗</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {car.name}
                </div>
                <div style={{ fontSize: 8, color: '#ffffff55' }}>
                  {car.category ?? 'Standard'}
                  {stat && ` · Rev 30j: ${Math.round(stat.revenue_30d)}€ · ${Math.round(stat.occupancy_pct)}% occup`}
                </div>
                {car.base_price && (
                  <div style={{ fontSize: 8, color: '#00d4ff77' }}>{car.base_price}€/j client</div>
                )}
              </div>

              {/* Toggle */}
              <button
                onClick={() => void toggle(car)}
                disabled={isTog}
                style={{
                  minWidth: 52, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${avail ? '#00e676' : '#ff3366'}`,
                  background: avail ? '#00e67622' : '#ff336622',
                  color: avail ? '#00e676' : '#ff3366',
                  fontFamily: 'Orbitron', fontSize: 7, cursor: 'pointer',
                  letterSpacing: '0.1em', opacity: isTog ? 0.5 : 1,
                }}
              >
                {isTog ? '…' : avail ? 'DISPO' : 'INDISPO'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Refresh */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #ffffff08', flexShrink: 0 }}>
        <button onClick={() => void load()} style={refreshBtn}>↻ ACTUALISER</button>
      </div>
    </div>
  );
}

function StatBox({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, background: '#0a1520', borderRadius: 8, padding: '6px 8px', border: `1px solid ${col}22` }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: col, textAlign: 'center' }}>{val}</div>
      <div style={{ fontSize: 7, color: '#ffffff44', textAlign: 'center', letterSpacing: '0.2em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Loader() {
  return <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#00d4ff44', fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>CHARGEMENT…</div>;
}

const refreshBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #00d4ff33', borderRadius: 4,
  padding: '4px 10px', fontFamily: 'Orbitron', fontSize: 7,
  color: '#00d4ff77', cursor: 'pointer', letterSpacing: '0.2em',
};
