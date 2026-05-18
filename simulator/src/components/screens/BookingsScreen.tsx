import { useState, useEffect, useCallback } from 'react';
import { business, type Booking } from '../../services/api.ts';

const S: Record<string, string> = {
  active: '#00e676', confirmed: '#00d4ff', completed: '#ffffff55',
  cancelled: '#ff336666', pending: '#ffb347',
};
const P: Record<string, string> = {
  PAID: '#00e67699', UNPAID: '#ff336699', PARTIAL: '#ffb34799',
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
    start_date: '', end_date: '',
    client_ppd: '', owner_ppd: '',
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
  const statusColor = (s: string) => S[s] ?? '#ffffff55';
  const payColor    = (s: string) => P[s.toUpperCase()] ?? '#ffffff33';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>RÉSERVATIONS</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff66' }}>{bookings.length}</span>
          <button onClick={() => setCreate(c => !c)} style={btnStyle('#00d4ff')}>+ CRÉER</button>
        </div>
        <input
          value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Chercher client / voiture..."
          style={inputStyle}
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0, background: '#030f1a' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {[
              ['Client', 'client_name'], ['Téléphone', 'client_phone'],
              ['Voiture', 'car_name'], ['', ''],
              ['Début', 'start_date'], ['Fin', 'end_date'],
              ['Prix client/j', 'client_ppd'], ['Prix proprio/j', 'owner_ppd'],
            ].map(([label, key]) => key ? (
              <div key={key}>
                <div style={{ fontSize: 7, color: '#00d4ff66', marginBottom: 2 }}>{label}</div>
                <input
                  value={(form as Record<string, string>)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  type={key.includes('date') ? 'date' : key.includes('ppd') ? 'number' : 'text'}
                  style={{ ...inputStyle, fontSize: 9, padding: '3px 6px' }}
                />
              </div>
            ) : <div key="empty" />)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={handleCreate} style={btnStyle('#00e676')}>ENREGISTRER</button>
            <button onClick={() => setCreate(false)} style={btnStyle('#ff336699')}>ANNULER</button>
          </div>
          {msg && <div style={{ fontSize: 9, color: '#00e676', marginTop: 4 }}>{msg}</div>}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {loading ? (
          <Loader />
        ) : bookings.length === 0 ? (
          <Empty text="Aucune réservation" />
        ) : bookings.map(b => (
          <div key={b.id} style={{ borderBottom: '1px solid #ffffff08' }}>
            <div
              onClick={() => setExpanded(e => e === b.id ? null : b.id)}
              style={{ padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(b.status), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.client_name}
                </div>
                <div style={{ fontSize: 8, color: '#ffffff55' }}>
                  {b.cars?.name ?? '?'} · {fmtDate(b.start_date)}→{fmtDate(b.end_date)}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: '#00d4ff' }}>{b.final_price ? `${b.final_price}€` : '—'}</div>
                <div style={{ fontSize: 7, color: payColor(b.payment_status) }}>{b.payment_status}</div>
              </div>
            </div>

            {expanded === b.id && (
              <div style={{ padding: '4px 12px 8px 20px', background: '#030f1a' }}>
                <Row label="ID" val={b.id.slice(0, 8) + '…'} />
                <Row label="Nb jours" val={String(b.nb_days ?? '?')} />
                <Row label="Prix client/j" val={b.client_price_per_day ? `${b.client_price_per_day}€` : '—'} />
                <Row label="Prix proprio/j" val={b.owner_price_per_day ? `${b.owner_price_per_day}€` : '—'} />
                <Row label="Profit Kouider" val={b.profit_kouider != null ? `${b.profit_kouider}€` : '—'} col={b.profit_kouider != null ? '#00e676' : undefined} />
                <Row label="Statut" val={b.status} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => handleDelete(b.id)} style={btnStyle('#ff336699')}>🗑 SUPPR</button>
                  {b.client_phone && (
                    <a href={`tel:${b.client_phone}`} style={{ ...btnStyle('#00d4ff66') as React.CSSProperties, textDecoration: 'none' }}>📞 APPEL</a>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
      <span style={{ fontSize: 8, color: '#ffffff44' }}>{label}</span>
      <span style={{ fontSize: 8, color: col ?? '#ffffff99' }}>{val}</span>
    </div>
  );
}

function Loader() {
  return <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#00d4ff44', fontFamily: 'Orbitron', letterSpacing: '0.2em' }}>CHARGEMENT…</div>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 20, fontSize: 9, color: '#ffffff22' }}>{text}</div>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0a1520', border: '1px solid #00d4ff22',
  borderRadius: 6, padding: '5px 8px',
  fontFamily: 'Share Tech Mono', fontSize: 10, color: '#fff',
  outline: 'none',
};

function btnStyle(col: string): React.CSSProperties {
  return {
    background: 'transparent', border: `1px solid ${col}`,
    borderRadius: 4, padding: '3px 8px',
    fontFamily: 'Orbitron', fontSize: 7, color: col,
    cursor: 'pointer', letterSpacing: '0.1em',
  };
}
