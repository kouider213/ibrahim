// Faire entrer TOUTES les locations dans Dzaryx : une location en 20 s, ou import en vrac
// (texte collé / photo du carnet → Dzaryx lit → Kouider vérifie → création). Euro par défaut, dinar possible.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { apiFetch, business, type Car } from '../../services/api.ts';
import { ymd } from './data.ts';

type Cur = 'EUR' | 'DZD';
type Pay = 'paid' | 'partial' | 'unpaid';
interface Row {
  on: boolean; car_id: string; client_name: string; client_phone: string; start_date: string; end_date: string;
  price: string; currency: Cur; pay: Pay; paid_amount: string; note: string; err?: string; done?: boolean;
}

const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#081024', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '8px 9px', color: '#f5f5f7', fontSize: 13 };
const lbl: CSSProperties = { fontSize: 10.5, color: '#8ea3c8', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 3, textTransform: 'uppercase' };

// « API 400: {"error":"…"} » → juste le message lisible
export const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  try { const j = JSON.parse(m.slice(m.indexOf('{'))) as { error?: string }; if (j.error) return j.error; } catch { /* texte brut */ }
  return m.replace(/^API \d+: /, '') || 'Erreur';
};

const empty = (): Row => ({ on: true, car_id: '', client_name: '', client_phone: '', start_date: ymd(new Date()), end_date: ymd(new Date()), price: '', currency: 'EUR', pay: 'unpaid', paid_amount: '', note: '' });

function missing(r: Row): string | null {
  if (!r.car_id) return 'voiture';
  if (!r.client_name.trim()) return 'client';
  if (r.client_phone.replace(/\D/g, '').length < 6) return 'téléphone';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(r.end_date) || r.end_date < r.start_date) return 'dates';
  if (!(Number(r.price) >= 0) || r.price === '') return 'prix';
  return null;
}

async function create(r: Row, actor: string) {
  const today = ymd(new Date());
  const price = Number(r.price);
  const paid = r.pay === 'paid' ? price : r.pay === 'partial' ? Number(r.paid_amount) || 0 : 0;
  await business.createBooking({
    car_id: r.car_id, client_name: r.client_name.trim(), client_phone: r.client_phone.trim(),
    start_date: r.start_date, end_date: r.end_date, final_price: price, currency: r.currency,
    rented_by: actor === 'houari' ? 'Houari' : 'Kouider',
    initial_status: r.end_date < today ? 'COMPLETED' : 'CONFIRMED',
    payment_status: r.pay === 'paid' ? 'PAID' : r.pay === 'partial' ? 'PARTIAL' : 'PENDING',
    paid_amount: paid,
    syncCalendar: r.end_date >= today,
    ...(r.note ? { notes: r.note } : {}),
  });
}

async function photoB64(f: File): Promise<{ b64: string; mime: string }> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { b64: c.toDataURL('image/jpeg', 0.85).split(',')[1]!, mime: 'image/jpeg' };
  } finally { URL.revokeObjectURL(url); }
}

export default function AddRentals({ cars, actor, initialCar, onClose, onDone }: {
  cars: Car[]; actor: string; initialCar?: string; onClose: () => void; onDone: (n: number) => void;
}) {
  const [tab, setTab] = useState<'one' | 'bulk'>('one');
  const [one, setOne] = useState<Row>(() => ({ ...empty(), car_id: initialCar ?? '' }));
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const sorted = cars.slice().sort((a, b) => a.name.localeCompare(b.name));

  const saveOne = async () => {
    const m = missing(one); if (m) { setMsg(`Il manque : ${m}`); return; }
    setBusy(true); setMsg('');
    try { await create(one, actor); onDone(1); onClose(); }
    catch (e) { setMsg(errMsg(e)); }
    finally { setBusy(false); }
  };

  const read = async (file?: File) => {
    if (!text.trim() && !file) { setMsg('Colle tes notes ou prends une photo du carnet.'); return; }
    setBusy(true); setMsg('Dzaryx lit tes locations…');
    try {
      const img = file ? await photoB64(file) : null;
      const r = await apiFetch<{ items: Array<{ car_id: string | null; car_name: string; client_name: string; client_phone: string; start_date: string; end_date: string; final_price: number | null; currency: Cur; paid: boolean | null; paid_amount: number | null; note: string }> }>(
        '/api/bookings/import/parse', { method: 'POST', body: JSON.stringify({ text, ...(img ? { imageBase64: img.b64, mime: img.mime } : {}) }) });
      const today = ymd(new Date());
      const list = r.items.map<Row>(x => ({
        on: true, car_id: x.car_id ?? '', client_name: x.client_name, client_phone: x.client_phone,
        start_date: x.start_date, end_date: x.end_date, price: x.final_price != null ? String(x.final_price) : '',
        currency: x.currency === 'DZD' ? 'DZD' : 'EUR',
        // Location déjà terminée sans info de paiement → considérée payée (sinon Dzaryx relancerait pour rien)
        pay: x.paid_amount ? 'partial' : x.paid === true ? 'paid' : x.paid === false ? 'unpaid' : x.end_date && x.end_date < today ? 'paid' : 'unpaid',
        paid_amount: x.paid_amount ? String(x.paid_amount) : '', note: [x.car_id ? '' : `Voiture lue : « ${x.car_name} »`, x.note].filter(Boolean).join(' · '),
      }));
      setRows(list);
      setMsg(list.length ? `${list.length} location${list.length > 1 ? 's' : ''} trouvée${list.length > 1 ? 's' : ''}. Vérifie, complète ce qui est en rouge, puis valide.` : 'Aucune location trouvée.');
    } catch (e) { setMsg(errMsg(e)); }
    finally { setBusy(false); }
  };

  const saveAll = async () => {
    setBusy(true); let ok = 0;
    const next = rows.slice();
    for (let i = 0; i < next.length; i++) {
      const r = next[i]!; if (!r.on || r.done) continue;
      const m = missing(r); if (m) { next[i] = { ...r, err: `Il manque : ${m}` }; continue; }
      try { await create(r, actor); next[i] = { ...r, done: true, err: undefined }; ok++; }
      catch (e) { next[i] = { ...r, err: errMsg(e) }; }
      setRows(next.slice());
    }
    setBusy(false);
    setMsg(`${ok} location${ok > 1 ? 's' : ''} ajoutée${ok > 1 ? 's' : ''}.${next.some(r => r.on && !r.done) ? ' Corrige celles en rouge.' : ''}`);
    if (ok) onDone(ok);
    if (next.every(r => !r.on || r.done)) setTimeout(onClose, 900);
  };

  const set = (i: number, p: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...p, err: undefined } : r)));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '92%', overflowY: 'auto', background: '#0c1730', color: '#f5f5f7', borderRadius: '18px 18px 0 0', padding: '14px 14px 26px', fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Ajouter des locations</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8ea3c8', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {([['one', '⚡ Une location'], ['bulk', '📋 Plusieurs d\'un coup']] as const).map(([k, t]) => (
            <button key={k} onClick={() => { setTab(k); setMsg(''); }} style={{ flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, border: `1px solid ${tab === k ? '#38d8f5' : 'rgba(255,255,255,0.1)'}`, background: tab === k ? '#38d8f522' : 'transparent', color: '#f5f5f7' }}>{t}</button>
          ))}
        </div>

        {tab === 'one' ? (
          <RowForm r={one} cars={sorted} onChange={p => setOne(o => ({ ...o, ...p }))} />
        ) : rows.length === 0 ? (
          <div>
            <div style={{ fontSize: 12.5, color: '#8ea3c8', marginBottom: 8, lineHeight: 1.45 }}>
              Colle tes notes telles quelles : carnet, messages WhatsApp, tableau Excel… ou prends en photo ton carnet. Dzaryx retrouve la voiture, le client, les dates et le prix.
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={7} placeholder={'clio alpine - Karim 0661223344 du 2 au 9 octobre 50€/j payé\nsandero Amine 0770112233 12/10 → 18/10 300 € reste 100'} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Big onClick={() => void read()} disabled={busy} bg="#38d8f5">✨ Lire le texte</Big>
              <label style={{ flex: 1, display: 'grid', placeItems: 'center', borderRadius: 11, background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
                📷 Photo du carnet
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ border: `1px solid ${r.done ? '#38d8f5' : r.err ? '#ef4444' : 'rgba(255,255,255,0.1)'}`, borderRadius: 12, padding: 10, opacity: r.on ? 1 : 0.45 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input type="checkbox" checked={r.on} disabled={r.done} onChange={e => set(i, { on: e.target.checked })} />
                  <b style={{ fontSize: 13, flex: 1 }}>{r.done ? '✅ ' : ''}{cars.find(c => c.id === r.car_id)?.name ?? '— voiture à choisir —'} · {r.client_name || '?'}</b>
                  {missing(r) && r.on && !r.done && <span style={{ fontSize: 10.5, color: '#f87171', fontWeight: 700 }}>manque : {missing(r)}</span>}
                </div>
                {!r.done && r.on && <RowForm r={r} cars={sorted} onChange={p => set(i, p)} compact />}
                {(r.note || r.err) && <div style={{ fontSize: 11, marginTop: 6, color: r.err ? '#f87171' : '#8ea3c8' }}>{r.err ?? r.note}</div>}
              </div>
            ))}
          </div>
        )}

        {msg && <div style={{ fontSize: 12.5, marginTop: 10, color: msg.startsWith('Il manque') ? '#f87171' : '#d4d4d8' }}>{msg}</div>}
        {tab === 'one' && <div style={{ marginTop: 12 }}><Big onClick={() => void saveOne()} disabled={busy} bg="#38d8f5">{busy ? '…' : 'Enregistrer la location'}</Big></div>}
        {tab === 'bulk' && rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Big onClick={() => { setRows([]); setMsg(''); }} disabled={busy} bg="#3f3f46">↺ Recommencer</Big>
            <Big onClick={() => void saveAll()} disabled={busy} bg="#38d8f5">{busy ? '…' : `Ajouter ${rows.filter(r => r.on && !r.done).length}`}</Big>
          </div>
        )}
      </div>
    </div>
  );
}

function RowForm({ r, cars, onChange, compact }: { r: Row; cars: Car[]; onChange: (p: Partial<Row>) => void; compact?: boolean }) {
  const g: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: compact ? 6 : 8 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      <F l="Voiture"><select value={r.car_id} onChange={e => onChange({ car_id: e.target.value })} style={inp}>
        <option value="">— choisir —</option>{cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></F>
      <div style={g}>
        <F l="Client"><input value={r.client_name} onChange={e => onChange({ client_name: e.target.value })} style={inp} /></F>
        <F l="Téléphone"><input value={r.client_phone} inputMode="tel" onChange={e => onChange({ client_phone: e.target.value })} style={inp} /></F>
        <F l="Du"><input type="date" value={r.start_date} onChange={e => onChange({ start_date: e.target.value })} style={inp} /></F>
        <F l="Au"><input type="date" value={r.end_date} onChange={e => onChange({ end_date: e.target.value })} style={inp} /></F>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'end' }}>
        <F l="Prix total"><input value={r.price} inputMode="decimal" onChange={e => onChange({ price: e.target.value.replace(',', '.') })} style={inp} placeholder="0" /></F>
        <Seg value={r.currency} opts={[['EUR', '€ Euro'], ['DZD', 'DA Dinar']]} onChange={v => onChange({ currency: v as Cur })} />
      </div>
      <Seg value={r.pay} opts={[['paid', 'Payé'], ['partial', 'Acompte'], ['unpaid', 'Pas payé']]} onChange={v => onChange({ pay: v as Pay })} />
      {r.pay === 'partial' && <F l={`Déjà versé (${r.currency === 'EUR' ? '€' : 'DA'})`}><input value={r.paid_amount} inputMode="decimal" onChange={e => onChange({ paid_amount: e.target.value.replace(',', '.') })} style={inp} /></F>}
    </div>
  );
}

const F = ({ l, children }: { l: string; children: ReactNode }) => <div><div style={lbl}>{l}</div>{children}</div>;

function Seg({ value, opts, onChange }: { value: string; opts: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', background: '#081024', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
      {opts.map(([k, t]) => (
        <button key={k} onClick={() => onChange(k)} style={{ flex: 1, whiteSpace: 'nowrap', padding: '6px 9px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: value === k ? '#38d8f5' : 'transparent', color: value === k ? '#fff' : '#8ea3c8' }}>{t}</button>
      ))}
    </div>
  );
}

function Big({ onClick, disabled, bg, children }: { onClick: () => void; disabled?: boolean; bg: string; children: ReactNode }) {
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, width: '100%', padding: '11px 0', borderRadius: 11, border: 'none', background: bg, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}
