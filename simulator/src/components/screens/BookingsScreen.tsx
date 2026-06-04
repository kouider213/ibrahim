import { useState, useEffect, useCallback, useRef } from 'react';
import { business, type Booking, type Car, type ClientOperation } from '../../services/api.ts';

type ResaMode = 'resa' | 'ops';

const OP_META: Record<string, { label: string; icon: string; col: string }> = {
  location_immo:      { label: 'LOCATION IMMO',  icon: '🏠', col: '#b06bff' },
  vente_immo:         { label: 'ACHAT IMMO',     icon: '🏠', col: '#00e676' },
  vente_voiture:      { label: 'ACHAT VOITURE',  icon: '🚗', col: '#ff9f43' },
  demande_specifique: { label: 'DEMANDE SPÉCIALE', icon: '✨', col: '#ff5fa2' },
  demande:            { label: 'DEMANDE SPÉCIALE', icon: '✨', col: '#ff5fa2' },
};

const S: Record<string, string> = {
  active: '#00e676', confirmed: '#00d4ff', completed: '#ffffff44',
  cancelled: '#ff336655', pending: '#ffb347',
};
const P: Record<string, string> = {
  PAID: '#00e676', UNPAID: '#ff3366', PARTIAL: '#ffb347',
};

interface Props { onNavigateVoice?: () => void; actor?: string; }

interface EditState {
  booking: Booking;
  start_date: string;
  end_date: string;
  client_ppd: string;
  client_name: string;
  client_phone: string;
}

export default function BookingsScreen({ onNavigateVoice: _, actor = 'kouider' }: Props) {
  const isHouari = actor === 'houari';
  const [mode, setMode]         = useState<ResaMode>('resa');
  const [operations, setOps]    = useState<ClientOperation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setCreate] = useState(false);
  const [msg, setMsg]           = useState('');
  const [cars, setCars]         = useState<Car[]>([]);
  const [ownerPpd, setOwnerPpd] = useState<number | null>(null);
  const [dispo, setDispo]       = useState<'ok' | 'taken' | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editMsg, setEditMsg]     = useState('');
  const [saving, setSaving]       = useState(false);

  const [form, setForm] = useState({
    client_name: '', client_phone: '',
    car_id: '', start_date: '', end_date: '', client_ppd: '',
    currency: isHouari ? 'DZD' : 'EUR' as 'EUR' | 'DZD',
  });

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const [r, ops] = await Promise.all([
        business.fetchBookings(q),
        business.fetchOperations().catch(() => ({ operations: [] as ClientOperation[] })),
      ]);
      setBookings(r.bookings ?? []);
      setOps(ops.operations ?? []);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Load cars when create form opens
  useEffect(() => {
    if (showCreate && cars.length === 0) {
      business.fetchCars().then(r => setCars(r.cars ?? [])).catch(() => {});
    }
  }, [showCreate, cars.length]);

  // Check availability when car + dates selected
  useEffect(() => {
    if (!form.car_id || !form.start_date || !form.end_date) { setDispo(null); return; }
    const s = new Date(form.start_date).getTime();
    const e = new Date(form.end_date).getTime();
    const conflict = bookings.some(b =>
      b.cars && (b as unknown as { car_id?: string }).car_id === form.car_id &&
      b.status !== 'cancelled' &&
      new Date(b.start_date).getTime() <= e && new Date(b.end_date).getTime() >= s
    );
    setDispo(conflict ? 'taken' : 'ok');
  }, [form.car_id, form.start_date, form.end_date, bookings]);

  const openEdit = (b: Booking) => {
    setEditState({
      booking: b,
      start_date:   b.start_date,
      end_date:     b.end_date,
      client_ppd:   String(b.client_price_per_day ?? ''),
      client_name:  b.client_name,
      client_phone: b.client_phone ?? '',
    });
    setEditMsg('');
  };

  const handleEdit = async () => {
    if (!editState) return;
    const { booking, start_date, end_date, client_ppd, client_name, client_phone } = editState;
    if (!start_date || !end_date || new Date(end_date) <= new Date(start_date)) {
      setEditMsg('❌ Dates invalides'); return;
    }
    setSaving(true);
    const newNb  = Math.max(1, Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000));
    const cpp    = parseFloat(client_ppd) || (booking.client_price_per_day ?? 0);
    const opp    = booking.owner_price_per_day ?? 0;
    const newTotal = cpp * newNb;
    const paid     = booking.paid_amount ?? 0;
    const delta    = newTotal - paid;
    try {
      await business.updateBooking(booking.id, {
        client_name: client_name.trim(),
        client_phone: client_phone.trim() || null,
        start_date, end_date,
        nb_days: newNb,
        client_price_per_day: cpp,
        owner_price_per_day: opp,
        final_price: newTotal,
        profit_kouider: opp ? (cpp - opp) * newNb : null,
      });
      const deltaMsg = delta > 0
        ? `✅ Modifié — Client doit encore ${delta.toFixed(0)}€`
        : delta < 0
        ? `✅ Modifié — Rembourser ${Math.abs(delta).toFixed(0)}€ au client`
        : '✅ Modifié — Aucun changement de montant';
      setEditMsg(deltaMsg);
      setTimeout(() => { setEditState(null); void load(); }, 2000);
    } catch (e) { setEditMsg(`❌ ${e}`); }
    finally { setSaving(false); }
  };

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
    if (!form.client_name.trim() || !form.car_id || !form.start_date || !form.end_date) {
      setMsg('❌ Nom client, voiture et dates requis'); setTimeout(() => setMsg(''), 3000); return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      setMsg('❌ Date de fin doit être après la date de début'); setTimeout(() => setMsg(''), 3000); return;
    }
    const nb = Math.max(1, Math.round(
      (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000
    ));
    const cpp = parseFloat(form.client_ppd) || 0;
    const opp = ownerPpd ?? 0;
    try {
      await business.createBooking({
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || null,
        car_id: form.car_id,
        start_date: form.start_date, end_date: form.end_date,
        client_price_per_day: cpp || null,
        owner_price_per_day: opp || null,
        final_price: cpp * nb, nb_days: nb,
        profit_kouider: opp ? (cpp - opp) * nb : null,
        payment_status: 'UNPAID', status: 'confirmed',
        rented_by: isHouari ? 'Houari' : 'Kouider',
        currency: form.currency,
      });
      setMsg('✅ Réservation créée');
      setCreate(false);
      setForm({ client_name: '', client_phone: '', car_id: '', start_date: '', end_date: '', client_ppd: '', currency: isHouari ? 'DZD' : 'EUR' });
      setOwnerPpd(null); setDispo(null);
      void load();
    } catch (e) { setMsg(`❌ ${e}`); }
    setTimeout(() => setMsg(''), 3000);
  };

  const fmtDate  = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '?';
  const bkgCcy   = (b: Booking) => (b as unknown as { currency?: string }).currency ?? 'EUR';
  const fmtPrice = (n: number | null | undefined, ccy: string) => {
    if (n == null) return '—';
    return ccy === 'DZD' ? `${Math.round(n).toLocaleString('fr-FR')} DZD` : `${n}€`;
  };
  const fmtMoney = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;

  const activeCount = bookings.filter(b => b.status === 'active' || b.status === 'confirmed').length;
  const totalRevEur = bookings.filter(b => bkgCcy(b) === 'EUR').reduce((s, b) => s + (b.final_price ?? 0), 0);
  const totalRevDzd = bookings.filter(b => bkgCcy(b) === 'DZD').reduce((s, b) => s + (b.final_price ?? 0), 0);
  const totalProfit = bookings.reduce((s, b) => s + (b.profit_kouider ?? 0), 0);

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
            <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff55', letterSpacing: '0.15em' }}>{mode === 'resa' ? bookings.length : operations.length}</span>
            {mode === 'resa' && <button onClick={() => setCreate(c => !c)} style={createBtn}>+ CRÉER</button>}
          </div>
        </div>

        {/* Segment résa voiture / opérations */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {([['resa', '🚗 RÉSA VOITURE'], ['ops', '🏠 OPÉRATIONS']] as [ResaMode, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 7,
              background: mode === k ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.04)',
              border: `1px solid #00d4ff${mode === k ? '88' : '22'}`,
              fontFamily: 'Orbitron', fontSize: 7, letterSpacing: '0.1em',
              color: `#00d4ff${mode === k ? '' : '77'}`, cursor: 'pointer',
            }}>{lbl}</button>
          ))}
        </div>

        {/* KPI row */}
        {mode === 'resa' && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, overflowX: 'auto' }}>
          <KpiCard label="ACTIVES" val={String(activeCount)} col="#00e676" />
          {totalRevEur > 0 && <KpiCard label="CA €" val={fmtMoney(totalRevEur)} col="#00d4ff" />}
          {totalRevDzd > 0 && <KpiCard label="CA DZD" val={totalRevDzd >= 100000 ? `${(totalRevDzd/1000).toFixed(0)}k` : String(Math.round(totalRevDzd))} col="#7c3aed" />}
          {!isHouari && <KpiCard label="PROFIT" val={fmtMoney(totalProfit)} col="#ffd700" />}
        </div>
        )}

        {mode === 'resa' && (
        <input
          value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="Chercher client / voiture…"
          style={inputStyle}
        />
        )}
        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      {/* Create form — redesigned */}
      {mode === 'resa' && showCreate && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #00d4ff18', flexShrink: 0, background: 'rgba(0,8,18,0.98)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff77', letterSpacing: '0.3em' }}>
              NOUVELLE RÉSERVATION
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['EUR', 'DZD'] as const).map(ccy => (
                <button key={ccy} onClick={() => setForm(f => ({ ...f, currency: ccy }))} style={{
                  background: form.currency === ccy ? (ccy === 'DZD' ? '#7c3aed33' : '#00d4ff22') : 'transparent',
                  border: `1px solid ${form.currency === ccy ? (ccy === 'DZD' ? '#7c3aed' : '#00d4ff') : '#ffffff22'}`,
                  borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                  fontFamily: 'Orbitron', fontSize: 7,
                  color: form.currency === ccy ? (ccy === 'DZD' ? '#7c3aed' : '#00d4ff') : '#ffffff33',
                  letterSpacing: '0.1em',
                }}>{ccy}</button>
              ))}
            </div>
          </div>

          {/* Client name */}
          <FieldRow label="CLIENT *">
            <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
              placeholder="Prénom Nom" style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }} />
          </FieldRow>

          {/* Phone optional */}
          <FieldRow label="TÉL (optionnel)">
            <input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))}
              placeholder="+213…" type="tel" style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }} />
          </FieldRow>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>DÉBUT *</div>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                style={{ ...inputStyle, fontSize: 9, padding: '5px 6px' }} />
            </div>
            <div>
              <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>FIN *</div>
              <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                style={{ ...inputStyle, fontSize: 9, padding: '5px 6px' }} />
            </div>
          </div>

          {/* Car selector */}
          <FieldRow label="VOITURE *">
            <select
              value={form.car_id}
              onChange={e => {
                const car = cars.find(c => c.id === e.target.value);
                setForm(f => ({ ...f, car_id: e.target.value }));
                setOwnerPpd(car?.base_price ?? null);
              }}
              style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }}
            >
              <option value="">— Choisir voiture —</option>
              {cars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.base_price ? ` (proprio: ${c.base_price}€/j)` : ''}
                </option>
              ))}
            </select>
          </FieldRow>

          {/* Availability badge */}
          {dispo && (
            <div style={{ marginBottom: 6, fontSize: 8, color: dispo === 'ok' ? '#00e676' : '#ff3366', fontFamily: 'Orbitron', letterSpacing: '0.1em' }}>
              {dispo === 'ok' ? '✅ Disponible' : '❌ Déjà réservée sur ces dates'}
            </div>
          )}

          {/* Prix client + proprio auto */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>PRIX CLIENT {form.currency}/j</div>
              <input type="number" value={form.client_ppd} onChange={e => setForm(f => ({ ...f, client_ppd: e.target.value }))}
                placeholder={form.currency === 'DZD' ? 'ex: 8000' : 'ex: 55'} style={{ ...inputStyle, fontSize: 9, padding: '5px 6px' }} />
            </div>
            <div>
              <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>PRIX PROPRIO €/j</div>
              <div style={{ ...inputStyle, fontSize: 9, padding: '5px 6px', color: ownerPpd ? '#ffd700' : '#ffffff22', opacity: 0.7 }}>
                {ownerPpd ? `${ownerPpd}€ (auto)` : '— sélectionner voiture'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCreate} style={{ ...aBtn('#00e676'), flex: 1 }}>✅ ENREGISTRER</button>
            <button onClick={() => { setCreate(false); setDispo(null); setOwnerPpd(null); }} style={{ ...aBtn('#ff3366'), flex: 1 }}>✕ ANNULER</button>
          </div>
          {msg && <div style={{ fontSize: 8, color: msg.startsWith('✅') ? '#00e676' : '#ff3366', marginTop: 5 }}>{msg}</div>}
        </div>
      )}

      {/* Edit modal overlay */}
      {editState ? <EditModal
        editState={editState}
        setEditState={setEditState}
        editMsg={editMsg}
        saving={saving}
        handleEdit={handleEdit}
        inputStyle={inputStyle}
      /> : null}

      {/* Booking list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* OPÉRATIONS immo / vente / demandes */}
        {mode === 'ops' && (
          loading ? <HudLoader /> : operations.length === 0
            ? <HudEmpty text="Aucune opération — Dzaryx les enregistre quand tu marques un bien loué/vendu ou une voiture vendue." />
            : operations.map(op => {
                const m = OP_META[op.deal_type] ?? { label: op.deal_type.toUpperCase(), icon: '•', col: '#888' };
                const cur = op.currency === 'DZD' ? 'DA' : (op.currency || '€');
                return (
                  <div key={op.id} style={{
                    borderRadius: 10, border: `1px solid ${m.col}33`,
                    background: `linear-gradient(135deg, ${m.col}08, rgba(2,8,16,0.6))`,
                    padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 15 }}>{m.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.client_name}</span>
                        <span style={{ flexShrink: 0, fontSize: 6, fontFamily: 'Orbitron', letterSpacing: '0.08em', color: m.col, background: `${m.col}14`, border: `1px solid ${m.col}44`, borderRadius: 4, padding: '2px 5px' }}>
                          {m.label}
                        </span>
                      </div>
                      {op.item_label ? <div style={{ fontSize: 8, color: '#ffffff55', marginTop: 1 }}>{op.item_label}</div> : null}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#fff' }}>
                        {op.amount != null ? `${Number(op.amount).toLocaleString('fr-FR')} ${cur}` : '—'}
                      </div>
                      <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 1 }}>{String(op.created_at).slice(0, 10)}</div>
                    </div>
                    {op.client_phone && (
                      <a href={`tel:${op.client_phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 14, textDecoration: 'none' }}>📞</a>
                    )}
                  </div>
                );
              })
        )}

        {mode === 'resa' && <GpsCalculator />}
        {mode === 'resa' && (loading ? <HudLoader /> : bookings.length === 0 ? <HudEmpty text="Aucune réservation" /> : bookings.map(b => {
          const stCol = S[b.status] ?? '#ffffff44';
          const pyCol = P[b.payment_status?.toUpperCase() ?? ''] ?? '#ffffff33';
          const isExp = expanded === b.id;
          return (
            <div key={b.id} style={{
              borderRadius: 10,
              border: `1px solid ${stCol}33`,
              background: `linear-gradient(135deg, ${stCol}07, rgba(2,8,16,0.6))`,
              boxShadow: isExp ? `0 0 14px ${stCol}1a` : 'none',
              transition: 'box-shadow 0.2s',
              WebkitTransform: 'translateZ(0)',
            }}>
              <div onClick={() => setExpanded(e => e === b.id ? null : b.id)}
                style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: stCol, flexShrink: 0,
                  boxShadow: `0 0 7px ${stCol}`,
                  animation: b.status === 'active' ? 'statusPulse 2s ease infinite' : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#e8f4ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.client_name}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 6, fontFamily: 'Orbitron', letterSpacing: '0.08em', color: '#00d4ff', background: '#00d4ff14', border: '1px solid #00d4ff44', borderRadius: 4, padding: '2px 5px' }}>
                      LOC AUTO
                    </span>
                  </div>
                  <div style={{ fontSize: 8, color: '#ffffff44', marginTop: 1 }}>
                    {b.cars?.name ?? '?'} · {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: bkgCcy(b) === 'DZD' ? '#7c3aed' : '#00d4ff' }}>
                    {fmtPrice(b.final_price, bkgCcy(b))}
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
                  <Row label="Prix client/j" val={fmtPrice(b.client_price_per_day, bkgCcy(b))} />
                  <Row label="Prix proprio/j" val={b.owner_price_per_day ? `${b.owner_price_per_day}€` : '—'} />
                  <Row label="Profit Kouider" val={b.profit_kouider != null ? `${b.profit_kouider}€` : '—'} col={b.profit_kouider != null ? '#00e676' : undefined} />
                  <Row label="Statut" val={b.status} col={stCol} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(b)} style={{ background: '#ffb347', border: 'none', borderRadius: 6, padding: '8px 14px', fontFamily: 'Orbitron', fontSize: 8, color: '#000', cursor: 'pointer' }}>✏️ MODIFIER</button>
                    <button onClick={() => handleDelete(b.id)} style={{ background: '#ff3366', border: 'none', borderRadius: 6, padding: '8px 14px', fontFamily: 'Orbitron', fontSize: 8, color: '#fff', cursor: 'pointer' }}>🗑 SUPPR</button>
                    {b.client_phone && (
                      <a href={`tel:${b.client_phone}`} style={{ ...aBtn('#00d4ff') as React.CSSProperties, textDecoration: 'none' }}>📞 APPEL</a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        }))}
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

interface EditModalProps {
  editState: { booking: Booking; start_date: string; end_date: string; client_ppd: string; client_name: string; client_phone: string };
  setEditState: React.Dispatch<React.SetStateAction<{ booking: Booking; start_date: string; end_date: string; client_ppd: string; client_name: string; client_phone: string } | null>>;
  editMsg: string;
  saving: boolean;
  handleEdit: () => void;
  inputStyle: React.CSSProperties;
}

function EditModal({ editState, setEditState, editMsg, saving, handleEdit, inputStyle }: EditModalProps) {
  const b = editState.booking;
  const newNb = editState.start_date && editState.end_date && new Date(editState.end_date) > new Date(editState.start_date)
    ? Math.max(1, Math.round((new Date(editState.end_date).getTime() - new Date(editState.start_date).getTime()) / 86400000))
    : (b.nb_days ?? 0);
  const cpp      = parseFloat(editState.client_ppd) || (b.client_price_per_day ?? 0);
  const newTotal = cpp * newNb;
  const paid     = b.paid_amount ?? 0;
  const delta    = newTotal - paid;
  const origNb   = b.nb_days ?? 0;
  const daysDiff = newNb - origNb;
  const up = (patch: Partial<typeof editState>) => setEditState(s => s ? { ...s, ...patch } : s);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, background: 'rgba(0,5,15,0.97)', display: 'flex', flexDirection: 'column', padding: '14px', overflowY: 'auto' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#ffb347', letterSpacing: '0.3em', marginBottom: 10 }}>
        ✏️ MODIFIER RÉSERVATION
      </div>

      <FieldRow label="CLIENT">
        <input value={editState.client_name} onChange={e => up({ client_name: e.target.value })}
          style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }} />
      </FieldRow>
      <FieldRow label="TÉL">
        <input value={editState.client_phone} onChange={e => up({ client_phone: e.target.value })}
          type="tel" style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }} />
      </FieldRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2 }}>DÉBUT</div>
          <input type="date" value={editState.start_date} onChange={e => up({ start_date: e.target.value })}
            style={{ ...inputStyle, fontSize: 9, padding: '5px 6px' }} />
        </div>
        <div>
          <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2 }}>FIN</div>
          <input type="date" value={editState.end_date} min={editState.start_date || undefined} onChange={e => up({ end_date: e.target.value })}
            style={{ ...inputStyle, fontSize: 9, padding: '5px 6px' }} />
        </div>
      </div>

      <FieldRow label="PRIX CLIENT €/j">
        <input value={editState.client_ppd} onChange={e => up({ client_ppd: e.target.value })}
          type="number" placeholder={String(b.client_price_per_day ?? '')}
          style={{ ...inputStyle, fontSize: 9, padding: '5px 8px' }} />
      </FieldRow>

      {newNb > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: delta > 0 ? '#00d4ff0a' : delta < 0 ? '#ff33660a' : '#00e6760a', border: `1px solid ${delta > 0 ? '#00d4ff33' : delta < 0 ? '#ff336633' : '#00e67633'}` }}>
          <div style={{ fontSize: 8, color: '#ffffff55', marginBottom: 4 }}>
            {daysDiff > 0 ? `+${daysDiff}j` : daysDiff < 0 ? `${daysDiff}j` : 'Même durée'} · {newNb}j total · Nouveau: {newTotal.toFixed(0)}€ · Payé: {paid}€
          </div>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: delta > 0 ? '#00d4ff' : delta < 0 ? '#ff3366' : '#00e676' }}>
            {delta > 0 ? `💳 Client doit encore ${delta.toFixed(0)}€` : delta < 0 ? `↩ Rembourser ${Math.abs(delta).toFixed(0)}€ au client` : '✅ Aucun ajustement'}
          </div>
        </div>
      )}

      {editMsg && <div style={{ fontSize: 8, color: editMsg.startsWith('✅') ? '#00e676' : '#ff3366', marginBottom: 8 }}>{editMsg}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleEdit} disabled={saving} style={{ flex: 1, background: '#ffb347', border: 'none', borderRadius: 8, padding: '10px', fontFamily: 'Orbitron', fontSize: 9, color: '#000', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? '…' : '✅ ENREGISTRER'}
        </button>
        <button onClick={() => setEditState(null)} style={{ flex: 1, background: '#ff3366', border: 'none', borderRadius: 8, padding: '10px', fontFamily: 'Orbitron', fontSize: 9, color: '#fff', cursor: 'pointer' }}>
          ✕ ANNULER
        </button>
      </div>
    </div>
  );
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

interface Prediction { label: string; place_id: string; }

function GpsCalculator() {
  const [address,      setAddress]      = useState('');
  const [result,       setResult]       = useState<TravelResult | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [apiError,     setApiError]     = useState<string | null>(null);
  const [predictions,  setPredictions]  = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [acLoading,    setAcLoading]    = useState(false);
  const [fromDepot,    setFromDepot]    = useState(true);
  const acTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAddressChange = (val: string) => {
    setAddress(val);
    setResult(null);
    setApiError(null);

    if (acTimer.current) clearTimeout(acTimer.current);
    if (val.trim().length < 2) { setPredictions([]); setShowDropdown(false); return; }

    acTimer.current = setTimeout(async () => {
      setAcLoading(true);
      try {
        const data = await business.getAutocomplete(val.trim());
        if (data.ok && data.predictions.length > 0) {
          setPredictions(data.predictions);
          setShowDropdown(true);
        } else {
          setPredictions([]);
          setShowDropdown(false);
        }
      } catch { /* silent */ } finally { setAcLoading(false); }
    }, 350);
  };

  const selectPrediction = (p: Prediction) => {
    setAddress(p.label);
    setPredictions([]);
    setShowDropdown(false);
    void calculate(p.label);
  };

  const calculate = async (dest?: string) => {
    const target = (dest ?? address).trim();
    if (!target) return;
    setLoading(true); setResult(null); setApiError(null);
    try {
      const data = await business.getTravelTime(target, undefined, undefined, fromDepot);
      if (data.error && !data.distance_km) {
        setApiError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('401') || msg.includes('403')) setApiError('Non autorisé — token invalide');
      else if (msg.includes('404')) setApiError('Endpoint introuvable — mets à jour le backend');
      else if (msg.includes('500')) setApiError('Erreur serveur — vérifie Railway logs');
      else setApiError('Connexion backend impossible — Railway hors ligne ?');
    } finally { setLoading(false); }
  };

  const trafficColor = result?.traffic === 'heavy' ? '#ff3366' : result?.traffic === 'light' ? '#00e676' : '#ffb347';

  return (
    <div style={{ background: 'rgba(0,212,255,0.03)', borderRadius: 12, padding: 12, border: '1px solid #00d4ff12', marginBottom: 8 }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff77', letterSpacing: '0.25em', marginBottom: 4 }}>
        🗺️ GPS LIVRAISON
      </div>
      {/* Toggle origine */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        <button onClick={() => setFromDepot(true)} style={{
          flex: 1, padding: '5px 4px', borderRadius: 6, fontFamily: 'Orbitron', fontSize: 6,
          background: fromDepot ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.04)',
          border: `1px solid ${fromDepot ? '#00d4ff55' : '#00d4ff18'}`,
          color: fromDepot ? '#00d4ff' : '#ffffff44', cursor: 'pointer', letterSpacing: '0.1em',
        }}>🏢 DÉPÔT</button>
        <button onClick={() => setFromDepot(false)} style={{
          flex: 1, padding: '5px 4px', borderRadius: 6, fontFamily: 'Orbitron', fontSize: 6,
          background: !fromDepot ? 'rgba(0,230,118,0.15)' : 'rgba(0,212,255,0.04)',
          border: `1px solid ${!fromDepot ? '#00e67655' : '#00d4ff18'}`,
          color: !fromDepot ? '#00e676' : '#ffffff44', cursor: 'pointer', letterSpacing: '0.1em',
        }}>📍 MA POSITION</button>
      </div>
      <div style={{ fontSize: 7, color: '#ffffff22', marginBottom: 10 }}>
        {fromDepot ? 'Depuis Haï Badr (dépôt)' : 'Depuis ta position GPS'} · Distance &amp; trajet réels Google Maps
      </div>

      {/* Input + autocomplete dropdown */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <input
          value={address}
          onChange={e => handleAddressChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setShowDropdown(false); void calculate(); } if (e.key === 'Escape') setShowDropdown(false); }}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder="Destination (ex: aéroport, Bir El Djir, Bruxelles…)"
          style={{ ...inputStyle, paddingRight: acLoading ? 28 : undefined }}
        />
        {acLoading && (
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: '#00d4ff44' }}>⏳</div>
        )}
        {showDropdown && predictions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
            background: '#020f1e', border: '1px solid #00d4ff33', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)', overflow: 'hidden', marginTop: 2,
          }}>
            {predictions.map((p, i) => (
              <div key={p.place_id} onMouseDown={() => selectPrediction(p)} style={{
                padding: '8px 12px', fontSize: 9, color: '#c8e8ff', cursor: 'pointer',
                borderBottom: i < predictions.length - 1 ? '1px solid #00d4ff10' : 'none',
                background: 'transparent', transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,212,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: '#00d4ff66', marginRight: 6 }}>📍</span>{p.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => { setShowDropdown(false); void calculate(); }} disabled={loading} style={{ ...createBtn, marginTop: 8, width: '100%', opacity: loading ? 0.6 : 1 }}>
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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 6, color: '#00d4ff44', marginBottom: 2, letterSpacing: '0.1em' }}>{label}</div>
      {children}
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
