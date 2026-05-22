import { useState, useEffect, useCallback } from 'react';
import { business, type Booking } from '../../services/api.ts';

const S: Record<string, string> = {
  active: '#00e676', confirmed: '#00d4ff', completed: '#ffffff44',
  cancelled: '#ff336655', pending: '#ffb347',
};
const P: Record<string, string> = {
  PAID: '#00e676', UNPAID: '#ff3366', PARTIAL: '#ffb347',
};

interface Props { onNavigateVoice?: () => void; }

export default function BookingsScreen({ onNavigateVoice: _ }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setCreate] = useState(false);
  const [msg, setMsg]           = useState('');

  const [form, setForm] = useState({
    client_name: '', client_phone: '', car_name: '',
    start_date: '', end_date: '', client_ppd: '', owner_ppd: '',
  });

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const r = await business.fetchBookings(q);
      setBookings(r.bookings ?? []);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as { t?: ReturnType<typeof setTimeout> }).t);
    (handleSearch as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => void load(v || undefined), 400);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette réservation ?')) return;
    await business.deleteBooking(id).catch(() => {});
    void load(search || undefined);
  };

  const handleCreate = async () => {
    const nb = Math.max(1, Math.round(
      (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000
    ));
    const cpp = parseFloat(form.client_ppd) || 0;
    const opp = parseFloat(form.owner_ppd) || 0;
    try {
      await business.createBooking({
        client_name: form.client_name, client_phone: form.client_phone || null,
        car_name: form.car_name, start_date: form.start_date, end_date: form.end_date,
        client_price_per_day: cpp || null, owner_price_per_day: opp || null,
        final_price: cpp * nb, nb_days: nb,
        profit_kouider: opp ? (cpp - opp) * nb : null,
        payment_status: 'UNPAID', status: 'confirmed',
      });
      setMsg('✅ Réservation créée');
      setCreate(false);
      setForm({ client_name: '', client_phone: '', car_name: '', start_date: '', end_date: '', client_ppd: '', owner_ppd: '' });
      void load();
    } catch (e) { setMsg(`❌ ${e}`); }
    setTimeout(() => setMsg(''), 3000);
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '?';

  const activeCount  = bookings.filter(b => b.status === 'active' || b.status === 'confirmed').length;
  const totalRevenue = bookings.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const totalProfit  = bookings.reduce((s, b) => s + (b.profit_kouider ?? 0), 0);
  const fmtMoney = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            RÉSERVATIONS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff55', letterSpacing: '0.15em' }}>{bookings.length}</span>
            <button onClick={() => setCreate(c => !c)} style={createBtn}>+ CRÉER</button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          <KpiCard label="ACTIVES" val={String(activeCount)} col="#00e676" />
          <KpiCard label="CA" val={fmtMoney(totalRevenue)} col="#00d4ff" />
          <KpiCard label="PROFIT" val={fmtMoney(totalProfit)} col="#ffd700" />
        </div>

        <input
          value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Chercher client / voiture…"
          style={inputStyle}
        />
        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #00d4ff18', flexShrink: 0, background: 'rgba(0,8,18,0.98)' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff77', letterSpacing: '0.3em', marginBottom: 8 }}>
            NOUVELLE RÉSERVATION
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {([['Client', 'client_name'], ['Téléphone', 'client_phone'], ['Voiture', 'car_name'], ['', ''], ['Début', 'start_date'], ['Fin', 'end_date'], ['Prix client/j', 'client_ppd'], ['Prix proprio/j', 'owner_ppd']] as [string, string][]).map(([label, key]) =>
              key ? (
                <div key={key}>
                  <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>{label}</div>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    type={key.includes('date') ? 'date' : key.includes('ppd') ? 'number' : 'text'}
                    style={{ ...inputStyle, fontSize: 9, padding: '4px 7px' }}
                  />
                </div>
              ) : <div key="empty" />
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={handleCreate} style={{ ...aBtn('#00e676'), flex: 1 }}>ENREGISTRER</button>
            <button onClick={() => setCreate(false)} style={{ ...aBtn('#ff3366'), flex: 1 }}>ANNULER</button>
          </div>
          {msg && <div style={{ fontSize: 8, color: '#00e676', marginTop: 5 }}>{msg}</div>}
        </div>
      )}

      {/* Booking list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <GpsCalculator />
        {loading ? <HudLoader /> : bookings.length === 0 ? <HudEmpty text="Aucune réservation" /> : bookings.map(b => {
          const stCol = S[b.status] ?? '#ffffff44';
          const pyCol = P[b.payment_status?.toUpperCase() ?? ''] ?? '#ffffff33';
          const isExp = expanded === b.id;
          return (
            <div key={b.id} style={{
              borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${stCol}33`,
              background: `linear-gradient(135deg, ${stCol}07, rgba(2,8,16,0.6))`,
              boxShadow: isExp ? `0 0 14px ${stCol}1a` : 'none',
              transition: 'box-shadow 0.2s',
            }}>
              <div onClick={() => setExpanded(e => e === b.id ? null : b.id)}
                style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: stCol, flexShrink: 0,
                  boxShadow: `0 0 7px ${stCol}`,
                  animation: b.status === 'active' ? 'statusPulse 2s ease infinite' : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.client_name}
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff44', marginTop: 1 }}>
                    {b.cars?.name ?? '?'} · {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff' }}>
                    {b.final_price ? `${b.final_price}€` : '—'}
                  </div>
                  <div style={{ fontSize: 7, color: pyCol, letterSpacing: '0.06em', marginTop: 1 }}>
                    {b.payment_status}
                  </div>
                </div>
              </div>
              {isExp && (
                <div style={{ padding: '6px 12px 10px 20px', background: 'rgba(0,5,15,0.96)', borderTop: `1px solid ${stCol}22` }}>
                  <Row label="ID" val={b.id.slice(0, 8) + '…'} />
                  <Row label="Nb jours" val={String(b.nb_days ?? '?')} />
                  <Row label="Prix client/j" val={b.client_price_per_day ? `${b.client_price_per_day}€` : '—'} />
                  <Row label="Prix proprio/j" val={b.owner_price_per_day ? `${b.owner_price_per_day}€` : '—'} />
                  <Row label="Profit Kouider" val={b.profit_kouider != null ? `${b.profit_kouider}€` : '—'} col={b.profit_kouider != null ? '#00e676' : undefined} />
                  <Row label="Statut" val={b.status} col={stCol} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => handleDelete(b.id)} style={aBtn('#ff3366')}>🗑 SUPPR</button>
                    {b.client_phone && (
                      <a href={`tel:${b.client_phone}`} style={{ ...aBtn('#00d4ff') as React.CSSProperties, textDecoration: 'none' }}>📞 APPEL</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, background: `${col}0a`, borderRadius: 8, padding: '6px 8px', border: `1px solid ${col}2a`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: col, textShadow: `0 0 10px ${col}44` }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.18em', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontSize: 8, color: '#ffffff2a' }}>{label}</span>
      <span style={{ fontSize: 8, color: col ?? '#ffffff77' }}>{val}</span>
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

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(0,212,255,0.04)', border: '1px solid #00d4ff1a',
  borderRadius: 8, padding: '6px 10px',
  fontFamily: 'Share Tech Mono', fontSize: 10, color: '#c8e8ff', outline: 'none',
};

const createBtn: React.CSSProperties = {
  background: '#00d4ff18', border: '1px solid #00d4ff55', borderRadius: 8,
  padding: '4px 10px', fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff',
  cursor: 'pointer', letterSpacing: '0.12em',
};

function aBtn(col: string): React.CSSProperties {
  return {
    background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 6,
    padding: '5px 10px', fontFamily: 'Orbitron', fontSize: 7, color: col,
    cursor: 'pointer', letterSpacing: '0.1em',
  };
}

// ── GPS Livraison Calculator ──────────────────────────────────────────────────

interface TravelResult {
  distance_km?:         number;
  travel_time_minutes?: number;
  traffic?:             string;
  waze_link?:           string;
  maps_link?:           string;
  destination_label?:   string;
  warning?:             string;
  error?:               string;
}

function GpsCalculator() {
  const [address,  setAddress]  = useState('');
  const [result,   setResult]   = useState<TravelResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const calculate = async () => {
    if (!address.trim()) return;
    setLoading(true); setResult(null); setApiError(null);
    try {
      const data = await business.getTravelTime(address.trim());
      if (data.error && !data.distance_km) {
        setApiError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setApiError('Erreur réseau — vérifie la connexion au backend.');
    } finally {
      setLoading(false);
    }
  };

  const trafficColor = result?.traffic === 'heavy' ? '#ff3366' : result?.traffic === 'light' ? '#00e676' : '#ffb347';

  return (
    <div style={{ background: 'rgba(0,212,255,0.03)', borderRadius: 12, padding: 12, border: '1px solid #00d4ff12', marginBottom: 8 }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff77', letterSpacing: '0.25em', marginBottom: 6 }}>
        🗺️ GPS LIVRAISON
      </div>
      <div style={{ fontSize: 7, color: '#ffffff22', marginBottom: 10 }}>
        Utilise ta position GPS stockée · Résultat réel Maps API
      </div>
      <input
        value={address}
        onChange={e => setAddress(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && calculate()}
        placeholder="Destination (ex: aéroport, Bir El Djir, Bruxelles…)"
        style={inputStyle}
      />
      <button onClick={calculate} disabled={loading} style={{ ...createBtn, marginTop: 8, width: '100%', opacity: loading ? 0.6 : 1 }}>
        {loading ? '⏳ CALCUL EN COURS…' : '📍 CALCULER TRAJET RÉEL'}
      </button>

      {apiError && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,51,102,0.06)', borderRadius: 8, border: '1px solid #ff336622', fontSize: 8, color: '#ff336688' }}>
          ⚠️ {apiError}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 10, background: 'rgba(0,212,255,0.06)', borderRadius: 10, border: '1px solid #00d4ff22', padding: '10px 12px' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ffcc', marginBottom: 8 }}>
            📍 {result.destination_label ?? address}
          </div>

          {result.warning && (
            <div style={{ marginBottom: 8, fontSize: 7, color: '#ffb34788' }}>⚠️ {result.warning}</div>
          )}

          {(result.distance_km !== undefined || result.travel_time_minutes !== undefined) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {result.distance_km !== undefined && (
                <div style={{ textAlign: 'center', background: 'rgba(0,212,255,0.05)', borderRadius: 8, padding: '8px 4px', border: '1px solid #00d4ff18' }}>
                  <div style={{ fontSize: 6, color: '#00d4ff55', letterSpacing: '0.1em', marginBottom: 3 }}>DISTANCE</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ffcc' }}>{result.distance_km} km</div>
                </div>
              )}
              {result.travel_time_minutes !== undefined && (
                <div style={{ textAlign: 'center', background: 'rgba(0,212,255,0.05)', borderRadius: 8, padding: '8px 4px', border: '1px solid #00d4ff18' }}>
                  <div style={{ fontSize: 6, color: '#00d4ff55', letterSpacing: '0.1em', marginBottom: 3 }}>TRAJET</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: trafficColor }}>{result.travel_time_minutes} min</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {result.waze_link && (
              <a href={result.waze_link} target="_blank" rel="noreferrer"
                style={{ flex: 1, textAlign: 'center', padding: '7px 4px', background: 'rgba(0,230,118,0.08)', border: '1px solid #00e67622', borderRadius: 8, fontFamily: 'Orbitron', fontSize: 7, color: '#00e676', textDecoration: 'none' }}>
                🔵 WAZE
              </a>
            )}
            {result.maps_link && (
              <a href={result.maps_link} target="_blank" rel="noreferrer"
                style={{ flex: 1, textAlign: 'center', padding: '7px 4px', background: 'rgba(255,107,107,0.08)', border: '1px solid #ff6b6b22', borderRadius: 8, fontFamily: 'Orbitron', fontSize: 7, color: '#ff6b6b', textDecoration: 'none' }}>
                🔴 GMAPS
              </a>
            )}
          </div>
        </div>
      )}
    </div>
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
