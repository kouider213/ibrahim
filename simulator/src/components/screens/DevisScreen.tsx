import { useState, useEffect } from 'react';
import { business, type Car } from '../../services/api.ts';
import { T, Screen, PageHeader, Sheet, Field, inputStyle, Btn, Card, SectionTitle, Segmented, Row, Avatar, tone } from '../ui/Kit.tsx';


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
  pdfLabel: { fr: 'Devis PDF', ar: 'عرض السعر PDF', en: 'Quote PDF' },
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

  const [history, setHistory] = useState<Array<{ id: string; ref: string; client_name?: string; total?: number; currency?: string; url: string; created_at?: string }>>([]);
  const [showHist, setShowHist] = useState(false);
  const loadHistory = () => business.quotesList().then(r => setHistory(r.quotes ?? [])).catch(() => {});
  useEffect(() => { business.fetchCars().then(r => setCars(r.cars ?? [])).catch(() => setCars([])); loadHistory(); }, []);

  // Ouvert depuis la page Démarchage : société + lignes proposées par Dzaryx (montants à saisir)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('devis_prefill');
      if (!raw) return;
      sessionStorage.removeItem('devis_prefill');
      const pre = JSON.parse(raw) as { client_name?: string; lang?: string; lines?: Array<{ label: string; currency: string }> };
      if (pre.client_name) setName(pre.client_name);
      if (pre.lang) setLang(pre.lang);
      if (pre.lines?.length) setLines(pre.lines.map(l => ({ id: uid(), label: l.label, amount: '', currency: l.currency || 'EUR' })));
    } catch { /* pré-remplissage illisible : page vide */ }
  }, []);

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

  // Packs entreprise (B2B) — pré-remplit une ligne, prix à négocier/saisir.
  const PACKS_B2B = [
    { name: 'Essentiel', desc: 'voiture de location + appartement' },
    { name: 'Premium', desc: 'voiture luxe/van + appartement ou maison' },
    { name: 'Signature', desc: 'voiture luxe + chauffeur + maison + guide & négociations' },
  ];
  const addPack = (p: { name: string; desc: string }) =>
    setLines(ls => [...ls, { id: uid(), label: `Pack ${p.name} entreprise — ${p.desc}`, amount: '', currency: 'EUR' }]);

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

  const [pdfBusy, setPdfBusy] = useState(false);
  const sendWhatsApp = async () => {
    const valid = lines.filter(l => l.label.trim() && Number(l.amount) > 0);
    if (valid.length === 0) { flash('Ajoute au moins une ligne'); return; }
    // Génère le PDF et joint son lien au message WhatsApp
    setPdfBusy(true);
    let pdfUrl = '';
    try { const out = await business.quotePdf({ client_name: name, lines: valid.map(l => ({ label: l.label.trim(), amount: Number(l.amount), currency: l.currency })) }); pdfUrl = out.url; loadHistory(); }
    catch { /* on envoie quand même le texte */ }
    setPdfBusy(false);
    const ph = phone.replace(/\D/g, '');
    const text = buildText() + (pdfUrl ? `\n\n📄 ${t('pdfLabel', lang)} : ${pdfUrl}` : '');
    window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const makePdf = async () => {
    const valid = lines.filter(l => l.label.trim() && Number(l.amount) > 0).map(l => ({ label: l.label.trim(), amount: Number(l.amount), currency: l.currency }));
    if (valid.length === 0) { flash('Ajoute au moins une ligne'); return; }
    setPdfBusy(true);
    try {
      const out = await business.quotePdf({ client_name: name, lines: valid });
      window.open(out.url, '_blank');
      flash('📄 PDF généré'); loadHistory();
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur PDF'); }
    finally { setPdfBusy(false); }
  };

  const LANGS = [{ id: 'fr', label: '🇫🇷 Français' }, { id: 'ar', label: '🇩🇿 Arabe' }, { id: 'en', label: '🇬🇧 Anglais' }];
  const CURS = [{ id: 'DZD', label: 'DA' }, { id: 'EUR', label: '€' }, { id: 'USD', label: '$' }];
  const sel = cars.find(c => c.id === carId);
  const nDays = Math.max(1, Number(days) || 1);

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Conciergerie" title="Devis instantané" subtitle="Voiture + logement + extras → PDF → WhatsApp en 1 tap" />}>
      <SectionTitle>Client</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <Field label="Nom du client"><input value={name} onChange={e => setName(e.target.value)} placeholder="Ex : Karim Benali" style={inputStyle} /></Field>
        <Field label="Téléphone WhatsApp"><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+33 … ou +213 …" style={inputStyle} /></Field>
        <div style={{ marginBottom: -12 }}><Field label="Langue du devis"><Segmented items={LANGS} value={lang} onChange={setLang} /></Field></div>
      </Card>

      <SectionTitle>Prestations</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {lines.length === 0 && <div style={{ fontSize: 14, color: T.muted, padding: '4px 2px 6px' }}>Ajoute une voiture, une ligne libre ou un pack entreprise ⬇️</div>}
        {lines.map((l, i) => (
          <Card key={l.id} pad={12}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.faint }}>LIGNE {i + 1}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => delLine(l.id)} style={{ background: 'none', border: 'none', color: T.bad, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>Retirer</button>
            </div>
            <input value={l.label} onChange={e => setLine(l.id, 'label', e.target.value)} placeholder="Ex : Appartement 3 nuits" style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={l.amount} onChange={e => setLine(l.id, 'amount', e.target.value)} placeholder="Prix" inputMode="numeric" style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
              <div style={{ flex: 1.3 }}><Segmented items={CURS} value={l.currency} onChange={v => setLine(l.id, 'currency', v)} /></div>
            </div>
          </Card>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Btn onClick={() => setShowCar(true)} style={{ flex: 1 }}>🚗 Voiture</Btn>
        <Btn variant="ghost" onClick={addLine} style={{ flex: 1 }}>＋ Ligne libre</Btn>
      </div>

      <SectionTitle>Packs entreprise</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {PACKS_B2B.map(p => (
          <Row key={p.name} onClick={() => addPack(p)} left={<Avatar icon="🏢" color={T.warn} size={38} />} title={`Pack ${p.name}`} sub={p.desc} right={<span style={{ color: T.warn, fontSize: 14, fontWeight: 700 }}>＋</span>} />
        ))}
      </div>

      {Object.keys(totals).length > 0 && (
        <Card accent={T.warn} style={{ marginBottom: 12, background: `linear-gradient(160deg, ${tone(T.warn, 0.12)}, ${T.surface})` }}>
          {Object.entries(totals).map(([cur, v]) => (
            <div key={cur} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: T.muted, fontSize: 14 }}>Total {cur === 'EUR' ? 'en euros' : cur === 'USD' ? 'en dollars' : 'en dinars'}</span>
              <span style={{ fontWeight: 800, fontSize: 24, color: T.warn }}>{fmt(v, cur)}</span>
            </div>
          ))}
        </Card>
      )}

      <Btn onClick={() => void sendWhatsApp()} disabled={pdfBusy} style={{ width: '100%', background: '#25D366', color: '#04210f', border: 'none', marginBottom: 8, minHeight: 50 }}>{pdfBusy ? 'Préparation…' : '💬 Envoyer sur WhatsApp (avec PDF)'}</Btn>
      <Btn color={T.warn} onClick={() => void makePdf()} disabled={pdfBusy} style={{ width: '100%' }}>📄 Voir le PDF seulement</Btn>

      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionTitle right={<button onClick={() => setShowHist(v => !v)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>{showHist ? 'Masquer' : `Voir (${history.length})`}</button>}>Devis récents</SectionTitle>
          {showHist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(q => (
                <Row key={q.id} onClick={() => window.open(q.url, '_blank')} left={<Avatar icon="📄" color={T.warn} size={38} />}
                  title={q.client_name || 'Client'}
                  sub={`${q.ref}${q.total ? ` · ${Math.round(q.total).toLocaleString('fr-FR')} ${q.currency === 'EUR' ? '€' : 'DA'}` : ''}${q.created_at ? ` · ${new Date(q.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}`}
                  right={<span style={{ color: T.muted, fontSize: 20 }}>›</span>} />
              ))}
            </div>
          )}
        </div>
      )}

      {showCar && (
        <Sheet title="Ajouter une voiture" subtitle="Le prix est calculé avec le tarif du parc" onClose={() => setShowCar(false)}
          footer={<Btn variant="primary" disabled={!sel} onClick={addCar} style={{ width: '100%' }}>{sel ? `Ajouter — ${fmt((sel.resale_price ?? sel.base_price ?? 0) * nDays, sel.currency || 'EUR')}` : 'Choisis une voiture'}</Btn>}>
          <Field label="Nombre de jours">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Btn variant="ghost" onClick={() => setDays(String(Math.max(1, nDays - 1)))}>−</Btn>
              <input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" style={{ ...inputStyle, width: 80, textAlign: 'center', fontSize: 20, fontWeight: 800 }} />
              <Btn variant="ghost" onClick={() => setDays(String(nDays + 1))}>＋</Btn>
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            {cars.map(c => {
              const on = c.id === carId;
              return (
                <button key={c.id} onClick={() => setCarId(c.id)} style={{ padding: 0, textAlign: 'left', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', fontFamily: T.font, background: T.surface, border: `2px solid ${on ? T.accent : T.line}`, color: T.text }}>
                  <div style={{ aspectRatio: '16 / 10', background: c.image_url ? `url(${c.image_url}) center/cover` : tone(T.accent, 0.1) }} />
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, color: on ? T.accent : T.muted }}>{c.resale_price ?? c.base_price ?? 0} {c.currency === 'DZD' ? 'DA' : '€'} / jour</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
