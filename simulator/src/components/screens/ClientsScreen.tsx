import { useState, useEffect } from 'react';
import { business, type ClientSummary, type ClientIntelligence, type ClientOperation, type ClientType, type ClientDetail, type ClientBookingHistory } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';

// ── Palette premium (cartes sur obsidian + accent émeraude) ─────
const C = {
  bg: '#0b0b0d', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.07)',
  accent: '#10b981', accentSoft: '#34d399', text: '#f5f5f7', muted: '#9b9ba6',
  gold: '#fbbf24', blue: '#60a5fa', violet: '#a78bfa',
  font: '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const TYPE_META: Record<ClientType, { label: string; col: string }> = {
  loc_auto:   { label: 'Loc auto',   col: C.accent },
  loc_immo:   { label: 'Loc immo',   col: C.violet },
  achat_auto: { label: 'Achat auto', col: '#fb923c' },
  achat_immo: { label: 'Achat immo', col: C.accentSoft },
  demande:    { label: 'Demande',    col: '#f472b6' },
};

const OP_META: Record<string, { label: string; icon: string; col: string }> = {
  location_immo:      { label: 'Location immo',  icon: '🏠', col: C.violet },
  vente_immo:         { label: 'Achat immo',     icon: '🏠', col: C.accentSoft },
  vente_voiture:      { label: 'Achat voiture',  icon: '🚗', col: '#fb923c' },
  demande_specifique: { label: 'Demande spéciale', icon: '✨', col: '#f472b6' },
  demande:            { label: 'Demande spéciale', icon: '✨', col: '#f472b6' },
};

const SCORE_COL: Record<string, string> = {
  VIP: C.gold, FREQUENT: C.accent, FRÉQUENT: C.accent,
  REGULAR: C.accentSoft, RÉGULIER: C.accentSoft, NEW: C.muted, NOUVEAU: C.muted,
};

export default function ClientsScreen() {
  const [clients, setClients]   = useState<ClientSummary[]>([]);
  const [intel, setIntel]       = useState<Map<string, ClientIntelligence>>(new Map());
  const [ops, setOps]           = useState<Map<string, ClientOperation[]>>(new Map());
  const [loading, setLoad]      = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails]   = useState<Map<string, ClientDetail | 'loading'>>(new Map());

  const toggle = (c: ClientSummary) => {
    setExpanded(prev => prev === c.name ? null : c.name);
    if (expanded !== c.name && c.phone && !details.has(c.phone)) {
      setDetails(m => new Map(m).set(c.phone!, 'loading'));
      business.fetchClientDetail(c.phone)
        .then(d => setDetails(m => new Map(m).set(c.phone!, d)))
        .catch(() => setDetails(m => { const n = new Map(m); n.delete(c.phone!); return n; }));
    }
  };

  const load = async () => {
    setLoad(true);
    try {
      const [clientRes, intelRes, opsRes] = await Promise.all([
        business.fetchClients().catch(() => ({ clients: [] as ClientSummary[] })),
        business.fetchClientIntel().catch(() => ({ clients: [] as ClientIntelligence[] })),
        business.fetchOperations().catch(() => ({ operations: [] as ClientOperation[] })),
      ]);
      setClients(clientRes.clients ?? []);
      const map = new Map<string, ClientIntelligence>();
      (intelRes.clients ?? []).forEach(c => map.set(c.client_name, c));
      setIntel(map);
      const opMap = new Map<string, ClientOperation[]>();
      (opsRes.operations ?? []).forEach(o => {
        const arr = opMap.get(o.client_name) ?? [];
        arr.push(o); opMap.set(o.client_name, arr);
      });
      setOps(opMap);
    } finally { setLoad(false); }
  };
  useEffect(() => { void load(); }, []);

  const [scanning, setScanning] = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);

  // Scan d'une pièce depuis la fiche client (sans passer par le chat).
  const handleScan = async (c: ClientSummary, file: File, isPermis = false) => {
    setScanning(c.name);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result)); r.onerror = rej;
        r.readAsDataURL(file);
      });
      const b64 = dataUrl.split('base64,')[1] ?? '';
      const r = await business.scanClientDocument(b64, {
        mime: file.type || 'image/jpeg', isPermis,
        clientName: c.name, clientPhone: c.phone ?? undefined,
      });
      setToast(r.text.split('\n').slice(0, 2).join(' · ') || 'Document enregistré');
      if (c.phone) {
        const d = await business.fetchClientDetail(c.phone);
        setDetails(m => new Map(m).set(c.phone!, d));
      }
    } catch {
      setToast('❌ Erreur lors du scan');
    } finally {
      setScanning(null);
      setTimeout(() => setToast(null), 5000);
    }
  };

  // ── Édition profil intelligence (négociation, fiabilité, durée) ──
  const [intelEdit, setIntelEdit] = useState<string | null>(null);
  const [intelForm, setIntelForm] = useState<{ negotiation_style: string; payment_reliability: string; typical_duration_days: string; notes: string }>({ negotiation_style: '', payment_reliability: '', typical_duration_days: '', notes: '' });
  const [saving, setSaving]       = useState(false);

  const startIntelEdit = (name: string, ci: ClientIntelligence | undefined) => {
    setIntelForm({
      negotiation_style:     ci?.negotiation_style ?? '',
      payment_reliability:   ci?.payment_reliability ?? '',
      typical_duration_days: ci?.typical_duration_days != null ? String(ci.typical_duration_days) : '',
      notes:                 ci?.notes ?? '',
    });
    setIntelEdit(name);
  };
  const saveIntel = async (name: string) => {
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {
        negotiation_style:   intelForm.negotiation_style.trim() || null,
        payment_reliability: intelForm.payment_reliability.trim() || null,
        notes:               intelForm.notes.trim() || null,
      };
      const dur = parseInt(intelForm.typical_duration_days, 10);
      if (!isNaN(dur)) fields.typical_duration_days = dur;
      const r = await business.updateClientIntel(name, fields);
      setIntel(m => new Map(m).set(name, r.client));
      setToast('✅ Profil mis à jour'); setIntelEdit(null);
    } catch { setToast('❌ Erreur mise à jour profil'); }
    finally { setSaving(false); setTimeout(() => setToast(null), 4000); }
  };

  // ── Édition d'une réservation depuis la fiche client ──
  const [bkEdit, setBkEdit] = useState<string | null>(null);
  const [bkForm, setBkForm] = useState<Record<string, string>>({});
  const daysIncl = (s: string, e: string) => Math.max(1, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1);

  const startBkEdit = (bk: ClientBookingHistory) => {
    setBkForm({
      start_date: (bk.start_date ?? '').slice(0, 10), end_date: (bk.end_date ?? '').slice(0, 10),
      client_price_per_day: bk.client_price_per_day != null ? String(bk.client_price_per_day) : '',
      owner_price_per_day:  bk.owner_price_per_day  != null ? String(bk.owner_price_per_day)  : '',
      paid_amount:          bk.paid_amount          != null ? String(bk.paid_amount)          : '',
      status: bk.status ?? 'CONFIRMED', payment_status: bk.payment_status ?? 'UNPAID',
      client_passport: bk.client_passport ?? '', passport_expiry: (bk.passport_expiry ?? '').slice(0, 10),
    });
    setBkEdit(bk.id);
  };
  const saveBk = async (c: ClientSummary, bkId: string) => {
    setSaving(true);
    try {
      const cppd = parseFloat(bkForm.client_price_per_day) || null;
      const oppd = parseFloat(bkForm.owner_price_per_day) || null;
      const nb   = bkForm.start_date && bkForm.end_date ? daysIncl(bkForm.start_date, bkForm.end_date) : null;
      const payload: Record<string, unknown> = {
        start_date: bkForm.start_date, end_date: bkForm.end_date,
        status: bkForm.status, payment_status: bkForm.payment_status,
        client_passport: bkForm.client_passport.trim() || null,
        passport_expiry: bkForm.passport_expiry || null,
      };
      if (cppd != null) payload.client_price_per_day = cppd;
      if (oppd != null) payload.owner_price_per_day = oppd;
      if (bkForm.paid_amount !== '') payload.paid_amount = parseFloat(bkForm.paid_amount) || 0;
      if (nb != null) { payload.nb_days = nb; if (cppd != null) payload.final_price = Math.round(cppd * nb); if (cppd != null && oppd != null) payload.profit_kouider = Math.round((cppd - oppd) * nb); }
      await business.updateBooking(bkId, payload);
      setToast('✅ Réservation mise à jour'); setBkEdit(null);
      if (c.phone) { const d = await business.fetchClientDetail(c.phone); setDetails(m => new Map(m).set(c.phone!, d)); }
    } catch { setToast('❌ Erreur mise à jour résa'); }
    finally { setSaving(false); setTimeout(() => setToast(null), 4000); }
  };

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone?.includes(search) ?? false)
  );
  const getScore = (name: string) => intel.get(name)?.score?.toUpperCase() ?? 'NOUVEAU';
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;
  const vipCount = clients.filter(c => getScore(c.name) === 'VIP').length;
  const totalSpent = clients.reduce((s, c) => s + (intel.get(c.name)?.total_spent ?? 0), 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 90, transform: 'translateX(-50%)', zIndex: 200, maxWidth: '90%', background: C.surface2, border: `1px solid ${C.accent}55`, color: C.text, fontSize: 12, padding: '10px 14px', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>{toast}</div>
      )}
      {/* Hero */}
      <div style={{ position: 'relative', padding: '24px 18px 16px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -50, width: 240, height: 240, background: `radial-gradient(circle, ${C.accent}26, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -40, left: -60, width: 180, height: 180, background: `radial-gradient(circle, ${C.gold}12, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.22em', color: C.accent, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Dzaryx · Clients</div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, background: `linear-gradient(120deg, #fff 30%, ${C.accentSoft})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Clients</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>{clients.length} profil{clients.length !== 1 ? 's' : ''} · ton fichier clients vivant</div>
      </div>

      {/* Stats premium */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '0 18px 14px' }}>
        {[
          { v: String(clients.length), l: 'Profils', c: C.accentSoft, icon: '👥' },
          { v: String(vipCount), l: 'VIP', c: C.gold, icon: '👑' },
          { v: fmt(totalSpent), l: 'CA total', c: C.accent, icon: '💰' },
        ].map(s => (
          <div key={s.l} style={{ position: 'relative', background: 'linear-gradient(160deg, #18181f, #121217)', border: `1px solid ${C.border}`, borderRadius: 18, padding: '14px 6px 12px', textAlign: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${s.c}, transparent)` }} />
            <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: `${s.c}14`, filter: 'blur(8px)' }} />
            <div style={{ fontSize: 16, marginBottom: 3 }}>{s.icon}</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', background: `linear-gradient(120deg, #fff, ${s.c})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.v}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 3, letterSpacing: '0.04em' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Recherche (pilule) */}
      <div style={{ padding: '0 18px 14px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 14, opacity: 0.5 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un nom ou téléphone…"
            style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 999, padding: '13px 16px 13px 42px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' }} />
        </div>
      </div>

      {/* Liste */}
      <div style={{ padding: '0 18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <SkeletonCards count={5} height={78} />
        ) : filtered.length === 0 ? (
          <Empty t="Aucun client" />
        ) : filtered.map(c => {
          const score = getScore(c.name);
          const scCol = SCORE_COL[score] ?? C.muted;
          const ci    = intel.get(c.name);
          const isExp = expanded === c.name;
          const initials = c.name.split(' ').map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase();
          const cOps = ops.get(c.name) ?? [];

          return (
            <div key={c.name} style={{ background: isExp ? 'linear-gradient(160deg, #18181f, #131318)' : C.surface, border: `1px solid ${isExp ? scCol + '55' : C.border}`, borderRadius: 18, overflow: 'hidden', transition: 'all .2s', boxShadow: isExp ? `0 8px 28px ${scCol}18` : '0 1px 0 rgba(255,255,255,0.02)' }}>
              <div onClick={() => toggle(c)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 14px', cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(145deg, ${scCol}33, ${scCol}10)`, border: `1.5px solid ${scCol}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: scCol, boxShadow: `0 0 14px ${scCol}22` }}>{initials || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{c.bookingCount} résa · {fmt(c.totalSpent)}</div>
                  {c.lastCarName && (
                    <div style={{ fontSize: 11.5, color: C.accentSoft, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      🚗 Dernière : {c.lastCarName}{c.lastBookingDate ? ` · ${String(c.lastBookingDate).slice(0, 10)}` : ''}
                    </div>
                  )}
                  {c.types && c.types.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                      {c.types.map(t => { const m = TYPE_META[t]; if (!m) return null; return (
                        <span key={t} style={{ fontSize: 10, fontWeight: 600, color: m.col, background: `${m.col}1a`, border: `1px solid ${m.col}40`, borderRadius: 20, padding: '2px 9px' }}>{m.label}</span>
                      ); })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: scCol, background: `${scCol}1f`, border: `1px solid ${scCol}55`, borderRadius: 20, padding: '3px 10px' }}>{score}</span>
                  {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 20, textDecoration: 'none' }}>📞</a>}
                </div>
              </div>

              {isExp && (ci || cOps.length > 0) && (
                <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                  {ci && <>
                    <Row label="Voitures préférées" val={(ci.preferred_cars ?? []).join(', ') || '—'} />
                    {intelEdit === c.name ? (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <EditField label="Durée typique (jours)" value={intelForm.typical_duration_days} onChange={v => setIntelForm(f => ({ ...f, typical_duration_days: v }))} type="number" />
                        <EditField label="Négociation" value={intelForm.negotiation_style} onChange={v => setIntelForm(f => ({ ...f, negotiation_style: v }))} placeholder="ex: négocie souvent / jamais" />
                        <EditField label="Fiabilité paiement" value={intelForm.payment_reliability} onChange={v => setIntelForm(f => ({ ...f, payment_reliability: v }))} placeholder="ex: fiable / à surveiller" />
                        <EditField label="Notes" value={intelForm.notes} onChange={v => setIntelForm(f => ({ ...f, notes: v }))} placeholder="Notes libres" />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button disabled={saving} onClick={() => void saveIntel(c.name)} style={miniBtn(C.accent)}>{saving ? '…' : '✓ Enregistrer'}</button>
                          <button onClick={() => setIntelEdit(null)} style={miniBtn(C.muted)}>Annuler</button>
                        </div>
                      </div>
                    ) : (<>
                      <Row label="Durée typique" val={ci.typical_duration_days ? `${ci.typical_duration_days} j` : '—'} />
                      <Row label="Négociation" val={ci.negotiation_style ?? '—'} />
                      <Row label="Fiabilité paiement" val={ci.payment_reliability ?? '—'} />
                      <Row label="Dépenses total" val={fmt(ci.total_spent)} col={C.gold} />
                      {ci.notes && <div style={{ marginTop: 10, padding: '10px 12px', background: `${C.accent}10`, borderRadius: 12, border: `1px solid ${C.accent}22`, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{ci.notes}</div>}
                      <button onClick={() => startIntelEdit(c.name, ci)} style={{ ...miniBtn(C.blue), marginTop: 10 }}>✏️ Modifier le profil</button>
                    </>)}
                  </>}
                  {cOps.length > 0 && (
                    <div style={{ marginTop: ci ? 14 : 0 }}>
                      <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Immo · Vente · Demandes</div>
                      {cOps.map(op => {
                        const m = OP_META[op.deal_type] ?? { label: op.deal_type, icon: '•', col: C.muted };
                        const cur = op.currency === 'DZD' ? 'DA' : (op.currency || '€');
                        return (
                          <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 16 }}>{m.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: m.col, fontWeight: 600 }}>{m.label}</div>
                              {op.item_label && <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.item_label}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{op.amount != null ? `${Number(op.amount).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                              <div style={{ fontSize: 10, color: C.muted }}>{String(op.created_at).slice(0, 10)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {isExp && c.phone && (() => {
                const det = details.get(c.phone);
                if (det === 'loading' || det === undefined) return (
                  <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2, fontSize: 12, color: C.muted }}>Chargement de la fiche…</div>
                );
                return (
                  <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                    {/* Historique des réservations */}
                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Historique réservations ({det.bookings.length})</div>
                    {det.bookings.length === 0 ? (
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Aucune réservation enregistrée.</div>
                    ) : det.bookings.map(bk => {
                      const stCol = bk.status === 'CONFIRMED' || bk.status === 'COMPLETED' ? C.accent
                        : bk.status === 'PENDING' ? C.gold
                        : bk.status === 'REJECTED' || bk.status === 'CANCELLED' ? '#ef4444' : C.muted;
                      const reste = (bk.final_price ?? 0) - (bk.paid_amount ?? 0);
                      const marge = bk.client_price_per_day != null && bk.owner_price_per_day != null && bk.nb_days
                        ? Math.round((bk.client_price_per_day - bk.owner_price_per_day) * bk.nb_days) : null;
                      return (
                        <div key={bk.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 15 }}>🚗</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bk.car_name || 'Véhicule'}</div>
                              <div style={{ fontSize: 11, color: C.muted }}>{(bk.start_date ?? '').slice(0, 10)}{bk.end_date ? ` → ${bk.end_date.slice(0, 10)}` : ''}{bk.nb_days ? ` · ${bk.nb_days}j` : ''}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{bk.final_price != null ? fmt(bk.final_price) : '—'}</div>
                              <span style={{ fontSize: 9, fontWeight: 700, color: stCol }}>{bk.status ?? ''}</span>
                            </div>
                          </div>

                          {bkEdit === bk.id ? (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, padding: '10px', background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <EditField label="Début" value={bkForm.start_date} onChange={v => setBkForm(f => ({ ...f, start_date: v }))} type="date" />
                                <EditField label="Fin" value={bkForm.end_date} onChange={v => setBkForm(f => ({ ...f, end_date: v }))} type="date" />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <EditField label="Prix client/j" value={bkForm.client_price_per_day} onChange={v => setBkForm(f => ({ ...f, client_price_per_day: v }))} type="number" />
                                <EditField label="Prix proprio/j" value={bkForm.owner_price_per_day} onChange={v => setBkForm(f => ({ ...f, owner_price_per_day: v }))} type="number" />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <EditField label="Payé (€)" value={bkForm.paid_amount} onChange={v => setBkForm(f => ({ ...f, paid_amount: v }))} type="number" />
                                <EditSelect label="Statut" value={bkForm.status} onChange={v => setBkForm(f => ({ ...f, status: v }))} options={['CONFIRMED', 'PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED']} />
                              </div>
                              <EditSelect label="Paiement" value={bkForm.payment_status} onChange={v => setBkForm(f => ({ ...f, payment_status: v }))} options={['UNPAID', 'PARTIAL', 'PAID']} />
                              <EditField label="N° passeport" value={bkForm.client_passport} onChange={v => setBkForm(f => ({ ...f, client_passport: v }))} placeholder="N° pièce" />
                              <EditField label="Expiration passeport" value={bkForm.passport_expiry} onChange={v => setBkForm(f => ({ ...f, passport_expiry: v }))} type="date" />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button disabled={saving} onClick={() => void saveBk(c, bk.id)} style={miniBtn(C.accent)}>{saving ? '…' : '✓ Enregistrer'}</button>
                                <button onClick={() => setBkEdit(null)} style={miniBtn(C.muted)}>Annuler</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginTop: 6, paddingLeft: 25 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11, color: C.muted }}>
                                {bk.client_price_per_day != null && <span>Client {bk.client_price_per_day}€/j</span>}
                                {bk.owner_price_per_day != null && <span>Proprio {bk.owner_price_per_day}€/j</span>}
                                {marge != null && <span style={{ color: C.gold }}>Marge {marge}€</span>}
                                {bk.payment_status && <span>{bk.payment_status}{reste > 0 ? ` · reste ${Math.round(reste)}€` : ''}</span>}
                                {bk.client_passport && <span style={{ color: C.blue }}>🪪 {bk.client_passport}{bk.passport_expiry ? ` (exp ${bk.passport_expiry.slice(0, 10)})` : ''}</span>}
                              </div>
                              <button onClick={() => startBkEdit(bk)} style={{ ...miniBtn(C.blue), marginTop: 6 }}>✏️ Modifier la réservation</button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Documents */}
                    {det.documents.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Documents ({det.documents.length})</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {det.documents.map(doc => {
                            const lbl = doc.type === 'passport' ? '🪪 Passeport' : doc.type === 'license' ? '🚘 Permis' : doc.type === 'contract' ? '📄 Contrat' : '📎 Document';
                            const hasUrl = !!doc.file_url && doc.file_url.length > 4;
                            const st = { fontSize: 11, fontWeight: 600, color: C.blue, background: `${C.blue}15`, border: `1px solid ${C.blue}40`, borderRadius: 10, padding: '6px 11px', textDecoration: 'none' } as const;
                            return hasUrl
                              ? <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" style={st}>{lbl}</a>
                              : <span key={doc.id} style={{ ...st, color: C.muted, border: `1px solid ${C.border}`, background: C.surface }}>{lbl} (sans photo)</span>;
                          })}
                        </div>
                      </div>
                    )}

                    {/* Ajouter une pièce directement (sans le chat) → scan + rattache à la résa */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.accent, background: `${C.accent}15`, border: `1px solid ${C.accent}40`, borderRadius: 10, padding: '8px 12px', cursor: scanning === c.name ? 'wait' : 'pointer', opacity: scanning === c.name ? 0.6 : 1 }}>
                        {scanning === c.name ? '⏳ Lecture…' : '🪪 Ajouter passeport'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={scanning === c.name}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handleScan(c, f, false); e.currentTarget.value = ''; }} />
                      </label>
                      <label style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: `${C.blue}15`, border: `1px solid ${C.blue}40`, borderRadius: 10, padding: '8px 12px', cursor: scanning === c.name ? 'wait' : 'pointer', opacity: scanning === c.name ? 0.6 : 1 }}>
                        {scanning === c.name ? '⏳ Lecture…' : '🚘 Ajouter permis'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} disabled={scanning === c.name}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handleScan(c, f, true); e.currentTarget.value = ''; }} />
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function miniBtn(col: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, color: col, background: `${col}15`, border: `1px solid ${col}40`, borderRadius: 10, padding: '7px 12px', cursor: 'pointer' };
}

function EditField({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: C.muted }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
    </label>
  );
}

function EditSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: C.muted }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', width: '100%' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Row({ label, val, col }: { label: string; val: string; col?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
      <span style={{ fontSize: 12.5, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: col ?? C.text, fontWeight: 600, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
    </div>
  );
}
function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 36, color: C.muted, fontSize: 13 }}>{t}</div>;
}
