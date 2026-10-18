import { useState, useEffect, useCallback, useRef } from 'react';
import { business, type Booking, type Car, type ClientOperation } from '../../services/api.ts';
import { SkeletonCards, SearchPill } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, HeadBtn, Segmented, Kpi, KpiGrid, Card, Row, Avatar, Badge, Btn, btnStyle, ActionBtn, Empty, Sheet, Field, inputStyle as inputStyleKit, waLink, money } from '../ui/Kit.tsx';

type ResaMode = 'resa' | 'ops';

// Jours de location = tranches de 24 h (Kouider 18/10/2026) : 03/11 → 07/11 = 4 jours, comme le serveur (rentalDays).
// Retour plus tard que l'heure de départ = 1 jour de plus : se règle en éditant nb_days.
function daysInclusive(start: string, end: string): number {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
}

const OP_META: Record<string, { label: string; icon: string; col: string }> = {
  location_immo:      { label: 'LOCATION IMMO',  icon: '🏠', col: '#b06bff' },
  vente_immo:         { label: 'ACHAT IMMO',     icon: '🏠', col: '#00e676' },
  vente_voiture:      { label: 'ACHAT VOITURE',  icon: '🚗', col: '#ff9f43' },
  demande_specifique: { label: 'DEMANDE SPÉCIALE', icon: '✨', col: '#ff5fa2' },
  demande:            { label: 'DEMANDE SPÉCIALE', icon: '✨', col: '#ff5fa2' },
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
    const newNb  = daysInclusive(start_date, end_date);
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
    const nb = daysInclusive(form.start_date, form.end_date);
    const cpp = parseFloat(form.client_ppd) || 0;
    const opp = ownerPpd ?? 0;
    // Plancher : Kouider ne peut pas louer en dessous du prix proprio (ce qu'il paye à Houari).
    // Ex DZD : Houari 7000 → Kouider min 7000. Houari (proprio) n'est pas concerné.
    if (!isHouari && opp > 0 && cpp > 0 && cpp < opp) {
      setMsg(`❌ Prix client ${cpp} ${form.currency} < prix proprio ${opp} ${form.currency}. Tu peux pas louer sous le prix de Houari.`);
      setTimeout(() => setMsg(''), 4000); return;
    }
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

  const bkgCcy   = (b: Booking) => (b as unknown as { currency?: string }).currency ?? 'EUR';
  const fmtPrice = (n: number | null | undefined, ccy: string) => {
    if (n == null) return '—';
    return ccy === 'DZD' ? `${Math.round(n).toLocaleString('fr-FR')} DZD` : `${n}€`;
  };

  const activeCount = bookings.filter(b => b.status === 'active' || b.status === 'confirmed').length;
  // CA/marge = résas RÉELLES : on exclut les REJETÉES (comme l'écran Finances) pour
  // que le CA soit identique partout. Sinon une résa refusée gonfle le total.
  const counted     = bookings.filter(b => (b.status ?? '').toUpperCase() !== 'REJECTED');
  const totalRevEur = counted.filter(b => bkgCcy(b) === 'EUR').reduce((s, b) => s + (b.final_price ?? 0), 0);
  const totalRevDzd = counted.filter(b => bkgCcy(b) === 'DZD').reduce((s, b) => s + (b.final_price ?? 0), 0);
  // RÈGLE MARGE : seul KOUIDER déduit le prix proprio (il loue le véhicule d'un proprio).
  // Quand HOUARI loue, c'est lui le propriétaire → son CA est sa marge complète, rien à déduire.
  // Donc la couverture "prix proprio renseigné" ne concerne QUE les résas de Kouider.
  const isHouariBkg = (b: typeof bookings[number]) => (b.rented_by ?? '').toLowerCase().startsWith('houari');
  const kouiderBkgs = counted.filter(b => !isHouariBkg(b));
  // Marge de Kouider séparée par devise : il peut louer en € OU en DZD → un bénéfice par devise.
  const kEur = kouiderBkgs.filter(b => bkgCcy(b) === 'EUR');
  const kDzd = kouiderBkgs.filter(b => bkgCcy(b) === 'DZD');
  // Marge calculée À LA VOLÉE = (prix client − prix proprio) × jours. On ne dépend PAS
  // du champ stocké profit_kouider (souvent vide sur les anciennes résas) → chiffre juste.
  const bkgMargin = (b: typeof bookings[number]): number | null => {
    const cpp = (b as { client_price_per_day?: number | null }).client_price_per_day;
    const opp = (b as { owner_price_per_day?: number | null }).owner_price_per_day;
    let nb = (b as { nb_days?: number | null }).nb_days ?? null;
    const sd = (b as { start_date?: string }).start_date, ed = (b as { end_date?: string }).end_date;
    if (!nb && sd && ed) nb = daysInclusive(sd, ed);
    if (cpp == null || opp == null || !nb) return null;
    return Math.round((cpp - opp) * nb * 100) / 100;
  };
  const sumMargin = (arr: typeof bookings) => arr.reduce((s, b) => s + (bkgMargin(b) ?? 0), 0);
  const marginEur = sumMargin(kEur);
  const marginDzd = sumMargin(kDzd);
  const covEur = kEur.filter(b => bkgMargin(b) != null).length;
  const covDzd = kDzd.filter(b => bkgMargin(b) != null).length;

  const ST_FR: Record<string, string> = { active: 'En cours', confirmed: 'Confirmée', completed: 'Terminée', cancelled: 'Annulée', pending: 'En attente', rejected: 'Refusée' };
  const ST_COL: Record<string, string> = { active: T.ok, confirmed: T.accent, completed: T.faint, cancelled: T.bad, pending: T.warn, rejected: T.bad };
  const PAY: Record<string, [string, string]> = { PAID: ['Payé', T.ok], PARTIAL: ['Acompte', T.warn], UNPAID: ['À payer', T.bad], PENDING: ['À payer', T.bad] };
  const longD = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '?';
  const ownerOf = (b: Booking) => ((b.rented_by ?? 'Kouider').toLowerCase().startsWith('h') ? 'H' : 'K');
  const closeCreate = () => { setCreate(false); setDispo(null); setOwnerPpd(null); };
  const pickCcy = (ccy: 'EUR' | 'DZD') => {
    setForm(f => ({ ...f, currency: ccy }));
    const car = cars.find(c => c.id === form.car_id);
    setOwnerPpd((ccy === 'DZD' ? car?.houari_resale_price : car?.base_price) ?? null);
  };
  const createNb = form.start_date && form.end_date && new Date(form.end_date) > new Date(form.start_date) ? daysInclusive(form.start_date, form.end_date) : 0;
  const createCpp = parseFloat(form.client_ppd) || 0;
  const unit = form.currency === 'DZD' ? 'DA' : '€';

  return (
    <Screen toast={msg && !showCreate ? msg : ''} header={<>
      <PageHeader eyebrow="Locations" title="Réservations"
        subtitle={loading ? 'Chargement…' : mode === 'resa' ? `${bookings.length} réservation${bookings.length > 1 ? 's' : ''} · ${activeCount} en cours ou à venir` : `${operations.length} opération${operations.length > 1 ? 's' : ''} immo / vente`}
        right={mode === 'resa' ? <HeadBtn icon="＋" label="Créer" onClick={() => setCreate(true)} /> : undefined} />
      <div style={{ padding: '0 16px 10px' }}>
        <Segmented<ResaMode> value={mode} onChange={setMode} items={[
          { id: 'resa', label: '🚗 Voitures', count: bookings.length || undefined },
          { id: 'ops', label: '🏠 Opérations', count: operations.length || undefined },
        ]} />
      </div>
    </>}>
      {mode === 'resa' && (
        <>
          <KpiGrid cols={3}>
            <Kpi value={activeCount} label="En cours" color={T.ok} />
            {totalRevEur > 0 || !totalRevDzd ? <Kpi value={money(totalRevEur)} label="CA total" color={T.accent} /> : null}
            {totalRevDzd > 0 && <Kpi value={money(totalRevDzd, 'DZD')} label="CA (DA)" color={T.violet} />}
            {!isHouari && (totalRevEur > 0 || !kDzd.length) && <Kpi value={money(marginEur)} label="Ma marge" color={T.warn} sub={covEur < kEur.length ? `${covEur}/${kEur.length} résas` : undefined} />}
            {!isHouari && kDzd.length > 0 && <Kpi value={money(marginDzd, 'DZD')} label="Ma marge (DA)" color={T.warn} sub={`${covDzd}/${kDzd.length} résas`} />}
          </KpiGrid>
          <div style={{ marginBottom: 12 }}><SearchPill value={search} onChange={handleSearch} placeholder="Chercher un client ou une voiture…" /></div>
          <GpsCalculator />
        </>
      )}

      {/* OPÉRATIONS immo / vente / demandes */}
      {mode === 'ops' && (
        loading ? <SkeletonCards count={4} /> : operations.length === 0
          ? <Empty icon="🏠" title="Aucune opération" text="Dzaryx les enregistre quand tu marques un bien loué ou vendu, ou une voiture vendue." />
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{operations.map(op => {
              const m = OP_META[op.deal_type] ?? { label: op.deal_type, icon: '•', col: T.muted };
              return (
                <Row key={op.id} accent={m.col} left={<Avatar icon={m.icon} color={m.col} />}
                  title={op.client_name}
                  sub={<><span style={{ color: m.col, fontWeight: 700 }}>{m.label.charAt(0) + m.label.slice(1).toLowerCase()}</span>{op.item_label ? ` · ${op.item_label}` : ''}<br />{new Date(op.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>}
                  right={<div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{op.amount != null ? money(Number(op.amount), op.currency || 'EUR') : '—'}</div>
                    {op.client_phone && <a href={`tel:${op.client_phone}`} style={{ fontSize: 13, color: T.accent, textDecoration: 'none', fontWeight: 600 }}>📞 Appeler</a>}
                  </div>} />
              );
            })}</div>
      )}

      {mode === 'resa' && (loading && !bookings.length ? <SkeletonCards count={5} height={80} /> : bookings.length === 0 ? <Empty icon="📋" title={search ? 'Aucun résultat' : 'Aucune réservation'} text={search ? 'Essaie un autre nom.' : 'Crée la première avec le bouton ＋ ou demande à Dzaryx.'} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bookings.map(b => {
            const st = (b.status ?? '').toLowerCase();
            const stCol = ST_COL[st] ?? T.faint;
            const [payLbl, payCol] = PAY[(b.payment_status ?? '').toUpperCase()] ?? [b.payment_status ?? '—', T.faint];
            const isExp = expanded === b.id;
            const own = ownerOf(b);
            const ccy = bkgCcy(b);
            const mg = bkgMargin(b);
            const nb = b.nb_days ?? daysInclusive(b.start_date, b.end_date);
            return (
              <Card key={b.id} accent={stCol} pad={0}>
                <div onClick={() => setExpanded(e => e === b.id ? null : b.id)} style={{ padding: '13px 14px 13px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={b.client_name} color={own === 'H' ? T.violet : T.accent} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.client_name}</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{b.cars?.name ?? '?'}</div>
                    <div style={{ fontSize: 13, color: T.text, marginTop: 2 }}>{longD(b.start_date)} → {longD(b.end_date)} <span style={{ color: T.faint }}>· {nb} j</span></div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: ccy === 'DZD' ? T.violet : T.text }}>{money(b.final_price, ccy)}</div>
                    <Badge color={payCol}>{payLbl}</Badge>
                  </div>
                </div>
                {isExp && (
                  <div style={{ padding: '0 14px 14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
                      {([['Client / j', fmtPrice(b.client_price_per_day, ccy), T.text], ['Proprio / j', fmtPrice(b.owner_price_per_day, ccy), T.muted], ['Ma marge', mg != null ? fmtPrice(mg, ccy) : '—', mg != null ? T.ok : T.faint]] as const).map(([l, v, c]) => (
                        <div key={l} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, borderRadius: 12, padding: '9px 10px' }}>
                          <div style={{ fontSize: 11.5, color: T.faint }}>{l}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c, marginTop: 2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <Badge color={stCol}>{ST_FR[st] ?? b.status}</Badge>
                      <Badge color={own === 'H' ? T.violet : T.accent}>{own === 'H' ? 'Loué par Houari' : 'Loué par Kouider'}</Badge>
                      {(b.paid_amount ?? 0) > 0 && <span style={{ fontSize: 13, color: T.muted }}>Payé : {fmtPrice(b.paid_amount, ccy)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <ActionBtn icon="✏️" label="Modifier" color={T.warn} onClick={() => openEdit(b)} />
                      {b.client_phone && <ActionBtn icon="📞" label="Appeler" onClick={() => { window.location.href = `tel:${b.client_phone}`; }} />}
                      {waLink(b.client_phone) && <ActionBtn icon="💬" label="WhatsApp" color="#25D366" onClick={() => window.open(waLink(b.client_phone)!, '_blank')} />}
                      <ActionBtn icon="🗑️" label="Supprimer" color={T.bad} onClick={() => void handleDelete(b.id)} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ))}

      {/* Nouvelle réservation */}
      {showCreate && (
        <Sheet title="Nouvelle réservation" subtitle={isHouari ? 'Tu es le propriétaire : le CA est ta marge.' : 'Prix proprio = ce que tu paies à Houari'} onClose={closeCreate}
          footer={<>
            <Btn variant="ghost" onClick={closeCreate} style={{ flex: 1 }}>Annuler</Btn>
            <Btn variant="primary" onClick={() => void handleCreate()} style={{ flex: 2 }}>Enregistrer{createNb && createCpp ? ` · ${money(createCpp * createNb, form.currency)}` : ''}</Btn>
          </>}>
          {msg && <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: tone(msg.startsWith('✅') ? T.ok : T.bad, 0.12), color: msg.startsWith('✅') ? T.ok : T.bad }}>{msg}</div>}
          <div style={{ marginBottom: 14 }}>
            <Segmented<'EUR' | 'DZD'> value={form.currency} onChange={pickCcy} items={[{ id: 'EUR', label: '€ Euros' }, { id: 'DZD', label: 'DA Dinars' }]} />
          </div>
          <Field label="Client *"><input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} placeholder="Prénom Nom" style={inputStyleKit} /></Field>
          <Field label="Téléphone (optionnel)"><input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} placeholder="+213…" type="tel" style={inputStyleKit} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
            <Field label="Début *"><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyleKit} /></Field>
            <Field label="Fin *"><input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyleKit} /></Field>
          </div>
          <Field label="Voiture *" hint={dispo ? <span style={{ color: dispo === 'ok' ? T.ok : T.bad, fontWeight: 700 }}>{dispo === 'ok' ? '✅ Libre sur ces dates' : '❌ Déjà réservée sur ces dates'}</span> : createNb ? `${createNb} jour${createNb > 1 ? 's' : ''} de location` : undefined}>
            <select value={form.car_id} onChange={e => {
              const car = cars.find(c => c.id === e.target.value);
              setForm(f => ({ ...f, car_id: e.target.value }));
              // Prix proprio selon la devise : € = base_price, DZD = houari_resale_price (prix Houari en dinars)
              setOwnerPpd((form.currency === 'DZD' ? car?.houari_resale_price : car?.base_price) ?? null);
            }} style={inputStyleKit}>
              <option value="">— Choisir —</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.name}{c.base_price ? ` (proprio ${c.base_price} €/j)` : ''}</option>)}
            </select>
          </Field>
          {/* Houari = propriétaire → CA complet, aucun prix proprio. Kouider → prix proprio pour la marge. */}
          <div style={{ display: 'grid', gridTemplateColumns: isHouari ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
            <Field label={`Prix client (${unit}/jour)`}><input type="number" inputMode="decimal" value={form.client_ppd} onChange={e => setForm(f => ({ ...f, client_ppd: e.target.value }))} placeholder={form.currency === 'DZD' ? '8000' : '30'} style={inputStyleKit} /></Field>
            {!isHouari && <Field label={`Prix proprio (${unit}/jour) *`}><input type="number" inputMode="decimal" value={ownerPpd ?? ''} onChange={e => { const v = parseFloat(e.target.value); setOwnerPpd(Number.isFinite(v) ? v : null); }} placeholder={form.currency === 'DZD' ? '5000' : '16'} style={{ ...inputStyleKit, borderColor: ownerPpd ? undefined : tone(T.bad, 0.5) }} /></Field>}
          </div>
          {!isHouari && !ownerPpd && <div style={{ fontSize: 13, color: T.bad, marginTop: -4 }}>⚠️ Sans prix proprio, la marge ne sera pas calculée.</div>}
          {!isHouari && ownerPpd != null && createCpp > 0 && createNb > 0 && (
            <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 14, background: tone(T.ok, 0.08), border: `1px solid ${tone(T.ok, 0.3)}`, fontSize: 14 }}>
              Ta marge : <b style={{ color: T.ok }}>{money((createCpp - ownerPpd) * createNb, form.currency)}</b> <span style={{ color: T.muted }}>({createCpp - ownerPpd} {unit} × {createNb} j)</span>
            </div>
          )}
        </Sheet>
      )}

      {editState && <EditModal editState={editState} setEditState={setEditState} editMsg={editMsg} saving={saving} handleEdit={handleEdit} />}
    </Screen>
  );
}

interface EditModalProps {
  editState: { booking: Booking; start_date: string; end_date: string; client_ppd: string; client_name: string; client_phone: string };
  setEditState: React.Dispatch<React.SetStateAction<{ booking: Booking; start_date: string; end_date: string; client_ppd: string; client_name: string; client_phone: string } | null>>;
  editMsg: string;
  saving: boolean;
  handleEdit: () => void;
}

function EditModal({ editState, setEditState, editMsg, saving, handleEdit }: EditModalProps) {
  const b = editState.booking;
  const newNb = editState.start_date && editState.end_date && new Date(editState.end_date) > new Date(editState.start_date)
    ? daysInclusive(editState.start_date, editState.end_date)
    : (b.nb_days ?? 0);
  const cpp      = parseFloat(editState.client_ppd) || (b.client_price_per_day ?? 0);
  const newTotal = cpp * newNb;
  const paid     = b.paid_amount ?? 0;
  const delta    = newTotal - paid;
  const origNb   = b.nb_days ?? 0;
  const daysDiff = newNb - origNb;
  const up = (patch: Partial<typeof editState>) => setEditState(s => s ? { ...s, ...patch } : s);
  const dCol = delta > 0 ? T.accent : delta < 0 ? T.bad : T.ok;

  return (
    <Sheet title="Modifier la réservation" subtitle={`${b.client_name} · ${b.cars?.name ?? ''}`} onClose={() => setEditState(null)}
      footer={<>
        <Btn variant="ghost" onClick={() => setEditState(null)} style={{ flex: 1 }}>Annuler</Btn>
        <Btn variant="primary" onClick={handleEdit} disabled={saving} style={{ flex: 2 }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </>}>
      <Field label="Client"><input value={editState.client_name} onChange={e => up({ client_name: e.target.value })} style={inputStyleKit} /></Field>
      <Field label="Téléphone"><input value={editState.client_phone} onChange={e => up({ client_phone: e.target.value })} type="tel" style={inputStyleKit} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
        <Field label="Début"><input type="date" value={editState.start_date} onChange={e => up({ start_date: e.target.value })} style={inputStyleKit} /></Field>
        <Field label="Fin"><input type="date" value={editState.end_date} min={editState.start_date || undefined} onChange={e => up({ end_date: e.target.value })} style={inputStyleKit} /></Field>
      </div>
      <Field label="Prix client (€/jour)"><input value={editState.client_ppd} onChange={e => up({ client_ppd: e.target.value })} type="number" inputMode="decimal" placeholder={String(b.client_price_per_day ?? '')} style={inputStyleKit} /></Field>
      {newNb > 0 && (
        <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 14, background: tone(dCol, 0.08), border: `1px solid ${tone(dCol, 0.32)}` }}>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
            {daysDiff > 0 ? `+${daysDiff} j` : daysDiff < 0 ? `${daysDiff} j` : 'Même durée'} · {newNb} j au total · nouveau total {newTotal.toFixed(0)} € · déjà payé {paid} €
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: dCol }}>
            {delta > 0 ? `💳 Le client doit encore ${delta.toFixed(0)} €` : delta < 0 ? `↩ Rembourser ${Math.abs(delta).toFixed(0)} € au client` : '✅ Aucun ajustement'}
          </div>
        </div>
      )}
      {editMsg && <div style={{ fontSize: 14, fontWeight: 600, color: editMsg.startsWith('✅') ? T.ok : T.bad }}>{editMsg}</div>}
    </Sheet>
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
  const [open,         setOpen]         = useState(false);
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

  const trafficColor = result?.traffic === 'heavy' ? T.bad : result?.traffic === 'light' ? T.ok : T.warn;

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, cursor: 'pointer', fontFamily: T.font, textAlign: 'left',
      background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.lineStrong}`, color: T.text }}>
      <span style={{ fontSize: 22 }}>🗺️</span>
      <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>Trajet de livraison</span><span style={{ fontSize: 12.5, color: T.muted }}>Distance et temps réels depuis le dépôt ou ta position</span></span>
      <span style={{ color: T.accent, fontSize: 18 }}>›</span>
    </button>
  );

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>🗺️ Trajet de livraison</div>
        <button onClick={() => setOpen(false)} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: 11, border: `1px solid ${T.line}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontSize: 15 }}>✕</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Segmented<'depot' | 'me'> value={fromDepot ? 'depot' : 'me'} onChange={v => setFromDepot(v === 'depot')} items={[{ id: 'depot', label: '🏢 Depuis le dépôt' }, { id: 'me', label: '📍 Ma position' }]} />
      </div>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <input
          value={address}
          onChange={e => handleAddressChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setShowDropdown(false); void calculate(); } if (e.key === 'Escape') setShowDropdown(false); }}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder="Destination : aéroport, Bir El Djir…"
          style={{ ...inputStyleKit, paddingRight: 36 }}
        />
        {acLoading && <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>⏳</div>}
        {showDropdown && predictions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: T.surface2, border: `1px solid ${T.lineStrong}`, borderRadius: 13, boxShadow: '0 12px 30px rgba(0,0,0,0.6)', overflow: 'hidden', marginTop: 4 }}>
            {predictions.map((p, i) => (
              <div key={p.place_id} onMouseDown={() => selectPrediction(p)} style={{ padding: '12px 14px', fontSize: 14, color: T.text, cursor: 'pointer', borderBottom: i < predictions.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                <span style={{ marginRight: 8 }}>📍</span>{p.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <Btn variant="primary" onClick={() => { setShowDropdown(false); void calculate(); }} disabled={loading} style={{ width: '100%', marginTop: 10 }}>{loading ? '⏳ Calcul…' : 'Calculer le trajet'}</Btn>
      {apiError && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: tone(T.bad, 0.1), fontSize: 13.5, color: T.bad }}>⚠️ {apiError}</div>}
      {result && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>📍 {result.destination_label ?? address}</div>
          {result.warning && <div style={{ marginBottom: 10, fontSize: 13, color: T.warn }}>⚠️ {result.warning}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, marginBottom: 10 }}>
            {result.distance_km !== undefined && <Kpi value={`${result.distance_km} km`} label="Distance" />}
            {result.travel_time_minutes !== undefined && <Kpi value={`${result.travel_time_minutes} min`} label="Trajet" color={trafficColor} />}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {result.waze_link && <a href={result.waze_link} target="_blank" rel="noreferrer" style={{ ...btnStyle('soft', '#33ccff'), flex: 1, textDecoration: 'none' }}>Waze</a>}
            {result.maps_link && <a href={result.maps_link} target="_blank" rel="noreferrer" style={{ ...btnStyle('soft', T.ok), flex: 1, textDecoration: 'none' }}>Google Maps</a>}
          </div>
        </div>
      )}
    </Card>
  );
}
