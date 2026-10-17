// Fiche voiture de la Carte live : tout voir et tout modifier en un toucher.
// État (dispo / réparation / indispo + motif), location en cours (payé, prolonger, terminer),
// km, vidange, papiers, notes, et rappels datés (« vidange à prévoir ») envoyés sur Telegram + app.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { business, getOrCreateSessionId, type Booking, type Car, type CarReminder, type InspectionResult } from '../../services/api.ts';
import { STATUS, ymd, fmtMoney, type MapCar, type Money } from './data.ts';
import { InspectionModal } from '../screens/FleetScreen.tsx';
import { errMsg } from './AddRentals.tsx';

export const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 8px', color: '#0f172a', fontSize: 12.5 };
const fmtD = (s?: string | null) => (s ? new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const daysTo = (s?: string | null) => (s ? Math.round((new Date(s.slice(0, 10) + 'T12:00:00').getTime() - Date.now()) / 86_400_000) : null);
const SUGGEST = ['Vidange à prévoir', 'Contrôle technique', 'Assurance à renouveler', 'Pneus à vérifier', 'Nettoyage complet', 'Récupérer au garage'];

export default function CarSheet({ m, car, money, monthLabel, onClose, onChanged, onAsk, onOpen, onRent }: {
  m: MapCar; car: Car | undefined; money?: Money; monthLabel?: string; onClose: () => void; onChanged: () => void;
  onAsk: (p: string) => void; onOpen: (p: string) => void; onRent: () => void; actor?: string;
}) {
  const [insp, setInsp] = useState<'before' | 'after' | null>(null);
  const [damage, setDamage] = useState<string[] | null>(null); // dégâts trouvés au retour → proposer l'atelier
  const [tab, setTab] = useState<'info' | 'etat' | 'rappels'>('info');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [rem, setRem] = useState<CarReminder[] | null>(null);
  const b = m.booking;

  useEffect(() => { setTab('info'); setMsg(''); setRem(null); setDamage(null); setInsp(null); }, [m.id]);

  // Résultat de l'état des lieux : au retour, un dégât NOUVEAU (ou un choc) → proposer réparation + rappel
  const onInspect = (r: InspectionResult, mode: 'before' | 'after') => {
    const boxes = r.analysis?.damageBoxes ?? [];
    const found = (mode === 'after' ? boxes.filter(d => d.is_new) : []).map(d => d.label);
    if (r.analysis?.accident && !found.length) found.push('Choc / accident détecté');
    setDamage(found.length ? found : null);
    setMsg(found.length ? '' : `✓ État des lieux ${mode === 'before' ? 'de départ' : 'de retour'} enregistré${mode === 'after' ? ' — aucun nouveau dégât' : ''}`);
  };
  const sendToRepair = () => {
    if (!damage) return;
    const what = damage.slice(0, 3).join(', ');
    void run(async () => {
      await business.updateCar(m.id, { available: false, maintenance_note: `🔧 Carrosserie : ${what}`.slice(0, 200) });
      const d = new Date(); d.setDate(d.getDate() + 2);
      await business.addCarReminder(m.id, { message: `Réparer : ${what}${b ? ` (retour de ${b.client_name})` : ''}`, date: ymd(d), time: '09:00' });
      setDamage(null);
    }, 'Voiture passée en réparation + rappel dans 2 jours');
  };
  useEffect(() => {
    if (tab !== 'rappels' || rem) return;
    void business.carReminders(m.id).then(r => setRem(r.reminders ?? [])).catch(() => setRem([]));
  }, [tab, rem, m.id]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(`✓ ${ok}`); onChanged(); }
    catch (e) { setMsg(errMsg(e)); }
    finally { setBusy(false); }
  };

  const repair = !!car?.maintenance_note && !car.available;
  const stateLabel = b ? STATUS[m.status].label : car?.available === false ? (repair ? 'En réparation / atelier' : 'Indisponible') : 'Disponible';
  const paid = Number(b?.paid_amount ?? (b?.payment_status === 'PAID' ? b?.final_price : 0)) || 0;
  const cur = (b as (Booking & { currency?: string }) | null)?.currency === 'DZD' ? 'DA' : '€';
  const wa = (phone: string | null) => { const p = (phone || '').replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: repair ? '#71717a' : STATUS[m.status].badge, borderRadius: 6, padding: '2px 7px' }}>{stateLabel.toUpperCase()}</span>
        <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 4, margin: '9px 0 8px', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
        {([['info', 'Infos'], ['etat', 'État & entretien'], ['rappels', 'Rappels']] as const).map(([k, t]) => (
          <button key={k} onClick={() => { setTab(k); setMsg(''); }} style={{ flex: 1, border: 'none', borderRadius: 8, padding: '6px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: tab === k ? '#fff' : 'transparent', color: tab === k ? '#0f172a' : '#64748b', boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,.12)' : 'none' }}>{t}</button>
        ))}
      </div>

      {tab === 'info' && <>
        {b ? (
          <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.55 }}>
            <Row k="Client"><b>{b.client_name}</b>{b.client_phone ? ` · ${b.client_phone}` : ''}</Row>
            <Row k="Dates">{fmtD(b.start_date)} → {fmtD(b.end_date)}</Row>
            <Row k="Prix">{b.final_price != null ? `${b.final_price.toLocaleString('fr-FR')} ${cur}` : '—'} · payé {paid.toLocaleString('fr-FR')} {cur}{m.due > 0 && <b style={{ color: '#b45309' }}> · reste {m.due.toLocaleString('fr-FR')} {cur}</b>}</Row>
            <RentalActions b={b} busy={busy} run={run} />
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: '#334155' }}>{car?.available === false ? `Pas louée. ${car.maintenance_note ? `Motif : ${car.maintenance_note}` : 'Marquée indisponible.'}` : 'Libre, prête à partir.'}</div>
        )}
        <div style={{ fontSize: 12, color: '#475569', marginTop: 7, lineHeight: 1.5 }}>
          {car?.current_km != null && <span>🛣️ {car.current_km.toLocaleString('fr-FR')} km · </span>}
          {(car?.next_service_date || car?.next_service_km) && <span>🛢️ vidange {car.next_service_date ? fmtD(car.next_service_date) : ''}{car.next_service_km ? ` / ${car.next_service_km.toLocaleString('fr-FR')} km` : ''} · </span>}
          {([['🛡️ assurance', car?.insurance_expiry], ['🔍 CT', car?.technical_expiry], ['🏷️ vignette', car?.vignette_expiry]] as const).map(([t, d]) => {
            const n = daysTo(d); if (n == null) return null;
            return <span key={t} style={{ color: n < 0 ? '#b91c1c' : n <= 15 ? '#b45309' : undefined, fontWeight: n <= 15 ? 700 : 400 }}>{t} {fmtD(d)} · </span>;
          })}
          {car?.service_notes && <div>📝 {car.service_notes}</div>}
        </div>
        {money && <div style={{ fontSize: 12, marginTop: 7, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '6px 8px', color: '#78350f', lineHeight: 1.45 }}>
          💶 <b>{monthLabel}</b> : {money.days ? <>{fmtMoney(money.ca)} · {money.days} jour{money.days > 1 ? 's' : ''} loué{money.days > 1 ? 's' : ''}
            {' · '}bénéfice {money.rentals - money.noOwner ? fmtMoney(money.profit) : 'inconnu'}{money.noOwner && money.rentals - money.noOwner ? ` (+${money.noOwner} loc. sans prix propriétaire)` : ''}
            {money.due['€'] + money.due['DA'] > 0 && <b style={{ color: '#b45309' }}> · reste {fmtMoney(money.due)}</b>}</>
            : <b>💤 0 jour loué — elle dort</b>}
        </div>}
        {m.alerts.slice(0, 3).map(a => <div key={a.id} style={{ fontSize: 11.5, marginTop: 5, color: a.priority === 'HIGH' ? '#b91c1c' : '#9a3412' }}>⚠️ {a.message}</div>)}
        {damage && <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '8px 9px', fontSize: 12, color: '#7f1d1d' }}>
          🚨 <b>Nouveau dégât au retour</b> : {damage.slice(0, 4).join(' · ')}
          <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
            <Btn bg="#b91c1c" fg="#fff" disabled={busy} onClick={sendToRepair}>🔧 Mettre en réparation + rappel</Btn>
            {b && <Btn bg="#ede9fe" fg="#6d28d9" onClick={() => onAsk(`Au retour de la ${m.name}, l'état des lieux montre : ${damage.join(', ')}. Client ${b.client_name}. Estime le coût et rédige le message WhatsApp au client.`)}>✨ Coût + message client</Btn>}
            <Btn bg="#f1f5f9" fg="#334155" onClick={() => setDamage(null)}>Ignorer</Btn>
          </div>
        </div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
          <Btn bg="#fff7ed" fg="#c2410c" onClick={() => setInsp(m.status === 'retour' || m.status === 'loue' ? 'after' : 'before')}>📸 État des lieux {m.status === 'retour' || m.status === 'loue' ? 'retour' : 'départ'}</Btn>
          {b?.client_phone && <>
            <Btn bg="#dcfce7" fg="#15803d" onClick={() => wa(b.client_phone)}>💬 WhatsApp</Btn>
            <Btn bg="#e0f2fe" fg="#0369a1" onClick={() => { window.location.href = `tel:${b.client_phone}`; }}>📞 Appeler</Btn>
          </>}
          {!b && car?.available !== false && <Btn bg="#d1fae5" fg="#047857" onClick={onRent}>➕ Louer</Btn>}
          <Btn bg="#ede9fe" fg="#6d28d9" onClick={() => onAsk(b
            ? `Fais le point sur la ${m.name} louée par ${b.client_name} (${b.start_date} → ${b.end_date}) : paiement, retour, et ce que je dois faire.`
            : `La ${m.name} est ${stateLabel.toLowerCase()}. Quelles sont les prochaines réservations et comment la louer plus vite ?`)}>✨ Dzaryx</Btn>
          {b && <Btn bg="#f1f5f9" fg="#334155" onClick={() => onOpen('bookings')}>📅 Réservations</Btn>}
        </div>
      </>}

      {tab === 'etat' && car && <StateForm car={car} busy={busy} run={run} />}

      {tab === 'rappels' && <Reminders carId={m.id} list={rem} busy={busy} setList={setRem} run={run} />}

      {insp && <InspectionModal kind="vehicle" subject={m.name} sessionId={getOrCreateSessionId()} fixed initialMode={insp}
        initialClient={b?.client_name ?? ''} onResult={onInspect} onClose={() => setInsp(null)} />}
      {msg && <div style={{ fontSize: 12, marginTop: 8, fontWeight: 600, color: msg.startsWith('✓') ? '#047857' : '#b91c1c' }}>{msg}</div>}
    </div>
  );
}

function RentalActions({ b, busy, run }: { b: Booking; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [ext, setExt] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const today = ymd(new Date());
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {b.payment_status !== 'PAID' && <Btn bg="#fef3c7" fg="#92400e" disabled={busy} onClick={() => void run(() => business.updateBooking(b.id, { payment_status: 'PAID', paid_amount: b.final_price ?? 0 }), 'Marquée payée')}>💰 Tout est payé</Btn>}
        <Btn bg="#e0e7ff" fg="#3730a3" disabled={busy} onClick={() => { setExt(ext ? null : b.end_date); setPrice(b.final_price != null ? String(b.final_price) : ''); }}>📆 Prolonger / changer</Btn>
        <Btn bg="#fee2e2" fg="#b91c1c" disabled={busy} onClick={() => { if (window.confirm('Terminer la location maintenant ? La voiture revient au parking.')) void run(() => business.updateBooking(b.id, { status: 'COMPLETED', ...(b.end_date > today ? { end_date: today } : {}) }), 'Location terminée'); }}>🏁 Terminer</Btn>
      </div>
      {ext != null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginTop: 7, alignItems: 'end' }}>
          <L t="Nouveau retour"><input type="date" value={ext} min={b.start_date} onChange={e => setExt(e.target.value)} style={inp} /></L>
          <L t="Nouveau total"><input value={price} inputMode="decimal" onChange={e => setPrice(e.target.value.replace(',', '.'))} style={inp} /></L>
          <Btn bg="#4f46e5" fg="#fff" disabled={busy} onClick={() => {
            const nb = Math.max(1, Math.round((new Date(ext).getTime() - new Date(b.start_date).getTime()) / 86_400_000) + 1);
            void run(() => business.updateBooking(b.id, { end_date: ext, nb_days: nb, ...(price !== '' && Number(price) >= 0 ? { final_price: Number(price) } : {}) }), 'Location modifiée').then(() => setExt(null));
          }}>OK</Btn>
        </div>
      )}
    </div>
  );
}

function StateForm({ car, busy, run }: { car: Car; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const init = car.available ? 'dispo' : car.maintenance_note?.startsWith('🔧') ? 'repar' : 'indispo';
  const [state, setState] = useState<'dispo' | 'repar' | 'indispo'>(init);
  const [why, setWhy] = useState((car.maintenance_note ?? '').replace(/^🔧\s*/, ''));
  const [f, setF] = useState({
    current_km: car.current_km?.toString() ?? '', next_service_km: car.next_service_km?.toString() ?? '', next_service_date: car.next_service_date ?? '',
    insurance_expiry: car.insurance_expiry ?? '', technical_expiry: car.technical_expiry ?? '', vignette_expiry: car.vignette_expiry ?? '', service_notes: car.service_notes ?? '',
  });
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s.replace(/\s/g, ''))) || 0));
  const day = (s: string) => (s ? s.slice(0, 10) : null);
  const save = () => run(() => business.updateCar(car.id, {
    available: state === 'dispo',
    maintenance_note: state === 'dispo' ? null : `${state === 'repar' ? '🔧 ' : ''}${why.trim() || (state === 'repar' ? 'En réparation' : 'Indisponible')}`,
    current_km: num(f.current_km), next_service_km: num(f.next_service_km), next_service_date: day(f.next_service_date),
    insurance_expiry: day(f.insurance_expiry), technical_expiry: day(f.technical_expiry), vignette_expiry: day(f.vignette_expiry),
    service_notes: f.service_notes.trim() || null,
  }), 'Voiture mise à jour');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(o => ({ ...o, [k]: e.target.value }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {([['dispo', '🟢 Disponible'], ['repar', '🔧 Réparation'], ['indispo', '⛔ Indispo (autre)']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setState(k)} style={{ flex: 1, padding: '7px 0', borderRadius: 9, border: `1.5px solid ${state === k ? '#0f172a' : '#cbd5e1'}`, background: state === k ? '#0f172a' : '#fff', color: state === k ? '#fff' : '#334155', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{t}</button>
        ))}
      </div>
      {state !== 'dispo' && <L t="Motif"><input value={why} onChange={e => setWhy(e.target.value)} placeholder={state === 'repar' ? 'ex. embrayage, carrosserie, chez le garagiste Hay Badr' : 'ex. réservée pour la famille, papiers'} style={inp} /></L>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <L t="Km actuel"><input value={f.current_km} inputMode="numeric" onChange={set('current_km')} style={inp} /></L>
        <L t="Vidange à (km)"><input value={f.next_service_km} inputMode="numeric" onChange={set('next_service_km')} style={inp} /></L>
        <L t="Vidange le"><input type="date" value={f.next_service_date} onChange={set('next_service_date')} style={inp} /></L>
        <L t="Assurance jusqu'au"><input type="date" value={f.insurance_expiry} onChange={set('insurance_expiry')} style={inp} /></L>
        <L t="Contrôle technique"><input type="date" value={f.technical_expiry} onChange={set('technical_expiry')} style={inp} /></L>
        <L t="Vignette"><input type="date" value={f.vignette_expiry} onChange={set('vignette_expiry')} style={inp} /></L>
      </div>
      <L t="Notes"><textarea value={f.service_notes} onChange={set('service_notes')} rows={2} placeholder="ex. rayure portière arrière, pneus neufs le 10/10" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></L>
      <Btn bg="#38d8f5" fg="#fff" disabled={busy} onClick={() => void save()}>{busy ? '…' : 'Enregistrer'}</Btn>
    </div>
  );
}

function Reminders({ carId, list, busy, setList, run }: {
  carId: string; list: CarReminder[] | null; busy: boolean; setList: (l: CarReminder[] | null) => void;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(addDays(7));
  const [time, setTime] = useState('09:00');
  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
        {SUGGEST.map(s => <button key={s} onClick={() => setText(s)} style={{ fontSize: 11, borderRadius: 14, padding: '4px 9px', cursor: 'pointer', border: `1px solid ${text === s ? '#4f46e5' : '#cbd5e1'}`, background: text === s ? '#eef2ff' : '#fff', color: '#334155' }}>{s}</button>)}
      </div>
      <L t="Rappel"><input value={text} onChange={e => setText(e.target.value)} placeholder="ex. bientôt nouvelle vidange à prévoir" style={inp} /></L>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 6, marginTop: 6, alignItems: 'end' }}>
        <L t="Le"><input type="date" value={date} min={ymd(new Date())} onChange={e => setDate(e.target.value)} style={inp} /></L>
        <L t="À"><input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} /></L>
        <Btn bg="#4f46e5" fg="#fff" disabled={busy || !text.trim()} onClick={() => void run(async () => {
          const r = await business.addCarReminder(carId, { message: text.trim(), date, time });
          setList([...(list ?? []), r.reminder].sort((a, b) => a.remind_at.localeCompare(b.remind_at))); setText('');
        }, 'Rappel ajouté — tu le recevras sur Telegram et dans l\'app')}>Ajouter</Btn>
      </div>
      <div style={{ marginTop: 9 }}>
        {list == null ? <div style={{ fontSize: 12, color: '#64748b' }}>Chargement…</div>
          : list.length === 0 ? <div style={{ fontSize: 12, color: '#64748b' }}>Aucun rappel prévu pour cette voiture.</div>
          : list.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #e2e8f0', fontSize: 12.5 }}>
              <span style={{ color: '#4f46e5', fontWeight: 700, whiteSpace: 'nowrap' }}>⏰ {new Date(r.remind_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{r.message.replace(/^🚗 [^:]+: /, '')}</span>
              <button disabled={busy} onClick={() => void run(async () => { await business.deleteCarReminder(carId, r.id); setList(list.filter(x => x.id !== r.id)); }, 'Rappel supprimé')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
          ))}
      </div>
    </div>
  );
}

export const Row = ({ k, children }: { k: string; children: ReactNode }) => <div><span style={{ color: '#64748b' }}>{k} : </span>{children}</div>;
export const L = ({ t, children }: { t: string; children: ReactNode }) => <div><div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{t}</div>{children}</div>;
export function Btn({ bg, fg, onClick, disabled, children }: { bg: string; fg: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button onClick={onClick} disabled={disabled} style={{ background: bg, color: fg, border: 'none', borderRadius: 9, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}
