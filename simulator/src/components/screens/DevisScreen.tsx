import { useState, useEffect } from 'react';
import { business, type Car } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6', blue: '#60a5fa',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

interface Line { id: string; label: string; amount: string; currency: string; }
const uid = () => Math.random().toString(36).slice(2, 9);

const L = {
  hello: { fr: 'Bonjour', ar: 'مرحباً', en: 'Hello' },
  intro: {
    fr: 'Voici votre devis Fik Conciergerie :',
    ar: 'إليك عرض السعر من Fik Conciergerie :',
    en: 'Here is your Fik Conciergerie quote:',
  },
  total: { fr: 'Total', ar: 'المجموع', en: 'Total' },
  valid: {
    fr: 'Valable 7 jours. Pour confirmer, répondez à ce message 🙏',
    ar: 'صالح لمدة 7 أيام. للتأكيد، أجب على هذه الرسالة 🙏',
    en: 'Valid for 7 days. To confirm, reply to this message 🙏',
  },
  devis: { fr: 'Devis', ar: 'عرض سعر', en: 'Quote' },
};
const t = (k: keyof typeof L, lang: string) => L[k][(lang as 'fr' | 'ar' | 'en')] ?? L[k].fr;

export default function DevisScreen() {
  const [cars, setCars]       = useState<Car[]>([]);
  const [lines, setLines]     = useState<Line[]>([]);
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [lang, setLang]       = useState('fr');
  const [showCar, setShowCar] = useState(false);
  const [carId, setCarId]     = useState('');
  const [days, setDays]       = useState('1');
  const [toast, setToast]     = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  useEffect(() => { business.fetchCars().then(r => setCars(r.cars ?? [])).catch(() => setCars([])); }, []);

  const addLine = () => setLines(ls => [...ls, { id: uid(), label: '', amount: '', currency: 'DZD' }]);
  const setLine = (id: string, k: keyof Line, v: string) => setLines(ls => ls.map(l => l.id === id ? { ...l, [k]: v } : l));
  const delLine = (id: string) => setLines(ls => ls.filter(l => l.id !== id));

  const addCar = () => {
    const car = cars.find(c => c.id === carId);
    if (!car) { flash('Choisis une voiture'); return; }
    const d = Math.max(1, Number(days) || 1);
    const unit = car.resale_price ?? car.base_price ?? 0;
    setLines(ls => [...ls, { id: uid(), label: `${car.name} — ${d} jour${d > 1 ? 's' : ''}`, amount: String(unit * d), currency: car.currency || 'EUR' }]);
    setShowCar(false); setCarId(''); setDays('1');
  };

  // Totaux par devise
  const totals: Record<string, number> = {};
  for (const l of lines) { const a = Number(l.amount) || 0; const cur = l.currency || 'DZD'; totals[cur] = (totals[cur] || 0) + a; }
  const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('fr-FR')} ${cur === 'EUR' ? '€' : cur === 'USD' ? '$' : 'DA'}`;

  const buildText = () => {
    const valid = lines.filter(l => l.label.trim() && Number(l.amount) > 0);
    const itemLines = valid.map(l => `• ${l.label} : ${fmt(Number(l.amount), l.currency)}`).join('\n');
    const totalLines = Object.entries(totals).filter(([, v]) => v > 0).map(([cur, v]) => `${t('total', lang)} : ${fmt(v, cur)}`).join('\n');
    return `${t('hello', lang)} ${name || ''},\n${t('intro', lang)}\n\n${itemLines}\n\n${totalLines}\n\n${t('valid', lang)}`;
  };

  const sendWhatsApp = () => {
    const valid = lines.filter(l => l.label.trim() && Number(l.amount) > 0);
    if (valid.length === 0) { flash('Ajoute au moins une ligne'); return; }
    const ph = phone.replace(/\D/g, '');
    const txt = encodeURIComponent(buildText());
    window.open(ph ? `https://wa.me/${ph}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank');
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Conciergerie</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Devis instantané</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Voiture + logement + extras → total → WhatsApp en 1 tap</div>

      {/* Client */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du client" style={inp} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone (WhatsApp)" style={inp} />
        <div style={{ display: 'flex', gap: 7 }}>
          {(['fr', 'ar', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: lang === l ? C.blue : 'rgba(255,255,255,0.04)', color: lang === l ? '#06182e' : C.muted, border: 'none' }}>{l === 'fr' ? '🇫🇷 FR' : l === 'ar' ? '🇩🇿 AR' : '🇬🇧 EN'}</button>
          ))}
        </div>
      </div>

      {/* Lignes */}
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Prestations</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {lines.map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={l.label} onChange={e => setLine(l.id, 'label', e.target.value)} placeholder="Prestation (ex: Appartement 3 nuits)" style={{ ...inp, flex: 3, fontSize: 13, padding: '10px 11px' }} />
            <input value={l.amount} onChange={e => setLine(l.id, 'amount', e.target.value)} placeholder="Prix" inputMode="numeric" style={{ ...inp, flex: 1, fontSize: 13, padding: '10px 8px' }} />
            <select value={l.currency} onChange={e => setLine(l.id, 'currency', e.target.value)} style={{ ...inp, width: 64, flex: 'none', fontSize: 12, padding: '10px 4px' }}><option value="DZD">DA</option><option value="EUR">€</option><option value="USD">$</option></select>
            <button onClick={() => delLine(l.id)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 16, cursor: 'pointer', padding: 2 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={addLine} style={{ flex: 1, padding: '10px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: C.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>＋ Ligne</button>
        <button onClick={() => setShowCar(true)} style={{ flex: 1, padding: '10px', borderRadius: 11, border: `1px solid ${C.accent}55`, background: `${C.accent}14`, color: C.accent, fontFamily: C.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>🚗 Voiture</button>
      </div>

      {/* Totaux */}
      {Object.keys(totals).length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.gold}33`, borderRadius: 14, padding: '12px 14px', marginBottom: 14 }}>
          {Object.entries(totals).map(([cur, v]) => (
            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16 }}>
              <span style={{ color: C.muted, fontSize: 12.5 }}>Total {cur === 'EUR' ? '€' : cur === 'USD' ? '$' : 'DA'}</span>
              <span style={{ fontWeight: 800, color: C.gold }}>{fmt(v, cur)}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={sendWhatsApp} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#25D366', color: '#06210f', fontFamily: C.font, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>💬 Envoyer le devis par WhatsApp</button>

      {/* Modal voiture */}
      {showCar && (
        <div onClick={() => setShowCar(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#0e0e12', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.accent}22`, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Ajouter une voiture</div>
            <select value={carId} onChange={e => setCarId(e.target.value)} style={inp}>
              <option value="">— Choisir une voiture —</option>
              {cars.map(c => <option key={c.id} value={c.id}>{c.name} ({(c.resale_price ?? c.base_price ?? 0)} {c.currency === 'DZD' ? 'DA' : '€'}/j)</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.muted }}>Nombre de jours</span>
              <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" style={{ ...inp, width: 80, flex: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowCar(false)} style={{ flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={addCar} style={{ flex: 2, padding: '12px', borderRadius: 11, border: 'none', background: C.accent, color: '#06210f', fontFamily: C.font, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Ajouter au devis</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.15)', border: `1px solid ${C.accent}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}
