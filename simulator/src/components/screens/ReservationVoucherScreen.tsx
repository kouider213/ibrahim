import { useState, useEffect, useRef, type CSSProperties, type RefObject, type ReactNode } from 'react';
import html2canvas from 'html2canvas';
import { business, api, type Car } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const LOGO_URL = `${((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? '/'}logo.png`;

// Lit un fichier image → base64 brut (sans le préfixe data:)
function fileToRawBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(((r.result as string) || '').split(',')[1] ?? '');
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const C = {
  bg: '#0a0a0c', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6', blue: '#60a5fa',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

const PLACES = ['Aéroport d\'Oran', 'Bureau Fik (Oran)'];

const L = {
  hello: { fr: 'Bonjour', ar: 'مرحباً', en: 'Hello' },
  intro: {
    fr: 'Votre réservation chez Fik Conciergerie est confirmée ✅',
    ar: 'تم تأكيد حجزك لدى Fik Conciergerie ✅',
    en: 'Your booking with Fik Conciergerie is confirmed ✅',
  },
  vehicle: { fr: 'Véhicule', ar: 'السيارة', en: 'Vehicle' },
  deposit: { fr: 'Acompte versé', ar: 'العربون المدفوع', en: 'Deposit paid' },
  reste: { fr: 'Reste à payer', ar: 'الباقي', en: 'Balance due' },
  pickup: { fr: 'Récupération', ar: 'الاستلام', en: 'Pickup' },
  dropoff: { fr: 'Dépôt', ar: 'الإرجاع', en: 'Drop-off' },
  thanks: { fr: 'Merci de votre confiance 🙏', ar: 'شكراً لثقتكم 🙏', en: 'Thank you for your trust 🙏' },
  pdfLabel: { fr: 'Bon de réservation PDF', ar: 'وصل الحجز PDF', en: 'Booking voucher PDF' },
};
const t = (k: keyof typeof L, lang: string) => L[k][(lang as 'fr' | 'ar' | 'en')] ?? L[k].fr;

export default function ReservationVoucherScreen() {
  const [cars, setCars]   = useState<Car[]>([]);
  const [firstName, setFirst] = useState('');
  const [lastName, setLast]   = useState('');
  const [passport, setPass]   = useState('');
  const [phone, setPhone]     = useState('');
  const [vehicle, setVehicle] = useState('');
  const [start, setStart]     = useState('');
  const [end, setEnd]         = useState('');
  const [pickup, setPickup]   = useState(PLACES[0]);
  const [dropoff, setDropoff] = useState(PLACES[0]);
  const [total, setTotal]     = useState('');
  const [deposit, setDeposit] = useState('');
  const [currency, setCurrency] = useState('DZD');
  const [lang, setLang]       = useState('fr');
  const [toast, setToast]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // Scan passeport / pièce d'identité → remplit nom, prénom, n° passeport
  const scanDoc = async (file: File) => {
    setScanBusy(true);
    try {
      const b64 = await fileToRawBase64(file);
      if (!b64) { flash('❌ Photo illisible'); return; }
      const r = await api.scan(b64, file.type || 'image/jpeg');
      const d = (r.extractedData ?? {}) as Record<string, unknown>;
      const fn = String(d.first_name ?? '').trim();
      const ln = String(d.last_name ?? '').trim();
      const name = String(d.name ?? '').trim();
      const num = String(d.document_number ?? '').trim();
      if (fn) setFirst(fn);
      if (ln) setLast(ln);
      if (!fn && !ln && name) {
        const parts = name.split(/\s+/);
        setFirst(parts[0] ?? '');
        setLast(parts.slice(1).join(' '));
      }
      if (num) setPass(num);
      const ok = (r.type === 'passport' || r.type === 'license') && (fn || ln || name || num);
      flash(ok ? '✅ Document lu' : '⚠️ Document peu lisible — vérifie');
    } catch { flash('❌ Lecture échouée'); }
    finally { setScanBusy(false); }
  };

  const [ref, setRef]         = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<Array<{ id: string; ref: string; client_name?: string; vehicle?: string; deposit?: number; total?: number; currency?: string; url: string; created_at?: string }>>([]);
  const [showHist, setShowHist] = useState(false);
  const loadHistory = () => business.vouchersList().then(r => setHistory(r.vouchers ?? [])).catch(() => {});
  useEffect(() => { business.fetchCars().then(r => setCars(r.cars ?? [])).catch(() => setCars([])); loadHistory(); }, []);

  const symbol = (c: string) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : 'DA');
  const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} ${symbol(currency)}`;
  const totalN = Number(total) || 0;
  const depositN = Number(deposit) || 0;
  const resteN = totalN > 0 ? Math.max(0, totalN - depositN) : null;

  const payload = () => ({
    first_name: firstName.trim(), last_name: lastName.trim(), passport: passport.trim(), phone: phone.trim(),
    vehicle: vehicle.trim(), start_date: start, end_date: end, pickup, dropoff,
    total: totalN, deposit: depositN, currency,
  });

  const valid = () => {
    if (!vehicle.trim()) { flash('Indique le véhicule'); return false; }
    if (!firstName.trim() && !lastName.trim()) { flash('Nom du client requis'); return false; }
    if (depositN <= 0) { flash('Indique l\'acompte'); return false; }
    return true;
  };

  const buildText = () => {
    const name = [firstName, lastName].filter(Boolean).join(' ');
    const period = (start || end) ? `\n📅 ${start || '—'} → ${end || '—'}` : '';
    const reste = resteN != null ? `\n${t('reste', lang)} : ${fmt(resteN)}` : '';
    return `${t('hello', lang)} ${name},\n${t('intro', lang)}\n\n`
      + `🚗 ${t('vehicle', lang)} : ${vehicle}${period}\n`
      + `📍 ${t('pickup', lang)} : ${pickup}\n`
      + `📍 ${t('dropoff', lang)} : ${dropoff}\n`
      + `💰 ${t('deposit', lang)} : ${fmt(depositN)}${reste}\n\n`
      + `${t('thanks', lang)}`;
  };

  // Sauve le bon (PDF + historique) et fixe le N° pour le visuel image. Renvoie {url, ref}.
  const ensureSaved = async (): Promise<{ url: string; ref: string } | null> => {
    try {
      const out = await business.voucherPdf(payload());
      setRef(out.ref); loadHistory();
      // laisse le visuel se re-render avec le N°
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      return out;
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); return null; }
  };

  const captureBlob = async (): Promise<Blob | null> => {
    const node = cardRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    return await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png', 0.95));
  };

  // PDF = fichier
  const makePdf = async () => {
    if (!valid()) return;
    setBusy(true);
    try { const out = await ensureSaved(); if (out) { window.open(out.url, '_blank'); flash('📄 PDF prêt'); } }
    finally { setBusy(false); }
  };

  // Image = télécharger une photo (PNG)
  const downloadImage = async () => {
    if (!valid()) return;
    setBusy(true);
    try {
      const out = await ensureSaved(); if (!out) return;
      const blob = await captureBlob(); if (!blob) { flash('❌ Image échouée'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${out.ref}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      flash('🖼️ Image téléchargée');
    } finally { setBusy(false); }
  };

  // WhatsApp = partage la PHOTO via la feuille native (arrive comme image). Repli: texte + lien.
  const sendWhatsApp = async () => {
    if (!valid()) return;
    setBusy(true);
    try {
      const out = await ensureSaved();
      const blob = await captureBlob();
      const ph = phone.replace(/\D/g, '');
      const text = buildText();
      if (blob && typeof navigator !== 'undefined' && 'canShare' in navigator) {
        const file = new File([blob], `${out?.ref || 'bon-reservation'}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], text }); flash('✅ Partagé'); return; }
          catch { /* annulé ou échec → repli */ }
        }
      }
      // Repli : télécharge l'image + ouvre WhatsApp avec le texte (+ lien PDF)
      if (blob) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${out?.ref || 'bon'}.png`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      const full = text + (out?.url ? `\n\n📄 ${t('pdfLabel', lang)} : ${out.url}` : '');
      window.open(ph ? `https://wa.me/${ph}?text=${encodeURIComponent(full)}` : `https://wa.me/?text=${encodeURIComponent(full)}`, '_blank');
      flash('Image téléchargée — joins-la dans WhatsApp');
    } finally { setBusy(false); }
  };

  const inp: CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };
  const lbl: CSSProperties = { fontSize: 10, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 6px' };
  const placeChips = (val: string, set: (v: string) => void) => (
    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      {PLACES.map(p => (
        <button key={p} onClick={() => set(p)} style={{ padding: '6px 11px', borderRadius: 20, border: `1px solid ${val === p ? C.accent : C.border}`, background: val === p ? `${C.accent}1c` : 'transparent', color: val === p ? C.accent : C.muted, fontFamily: C.font, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{p}</button>
      ))}
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Conciergerie" title="Bon de réservation" /></div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Confirme la réservation d'un véhicule + l'acompte → PDF + WhatsApp</div>

      {/* Scan passeport → remplit le client */}
      <input ref={scanRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void scanDoc(f); }} />
      <button onClick={() => scanRef.current?.click()} disabled={scanBusy}
        style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 12, border: `1px solid ${C.blue}55`, background: `${C.blue}14`, color: C.blue, fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
        {scanBusy ? '🔍 Lecture du document…' : '📷 Scanner passeport / pièce → remplir auto'}
      </button>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>Prends une photo, ou importe depuis ta galerie / tes fichiers → nom, prénom et n° remplis tout seuls. Ou remplis à la main ci-dessous.</div>

      {/* Client */}
      <div style={lbl}>Client</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={firstName} onChange={e => setFirst(e.target.value)} placeholder="Prénom" style={inp} />
        <input value={lastName} onChange={e => setLast(e.target.value)} placeholder="Nom" style={inp} />
      </div>
      <div style={{ marginTop: 8 }}><input value={passport} onChange={e => setPass(e.target.value)} placeholder="N° de passeport" style={inp} /></div>
      <div style={{ marginTop: 8 }}><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone (WhatsApp)" style={inp} /></div>

      {/* Véhicule */}
      <div style={lbl}>Véhicule</div>
      <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Ex : Renault Clio 4 — gris" style={inp} list="cars-list" />
      <datalist id="cars-list">{cars.map(c => <option key={c.id} value={c.name} />)}</datalist>

      {/* Période */}
      <div style={lbl}>Période (optionnel)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} />
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
      </div>

      {/* Lieux */}
      <div style={lbl}>Lieu de récupération</div>
      <input value={pickup} onChange={e => setPickup(e.target.value)} style={inp} />
      {placeChips(pickup, setPickup)}
      <div style={lbl}>Lieu de dépôt</div>
      <input value={dropoff} onChange={e => setDropoff(e.target.value)} style={inp} />
      {placeChips(dropoff, setDropoff)}

      {/* Paiement */}
      <div style={lbl}>Paiement</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={total} onChange={e => setTotal(e.target.value)} placeholder="Total (optionnel)" inputMode="numeric" style={inp} />
        <input value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="Acompte versé" inputMode="numeric" style={inp} />
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inp, width: 72, flex: 'none' }}><option value="DZD">DA</option><option value="EUR">€</option><option value="USD">$</option></select>
      </div>
      {resteN != null && (
        <div style={{ marginTop: 10, background: C.surface, border: `1px solid ${C.gold}33`, borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: C.muted, fontSize: 12.5 }}>{t('reste', lang)}</span>
          <span style={{ fontWeight: 800, color: C.gold }}>{fmt(resteN)}</span>
        </div>
      )}

      {/* Langue */}
      <div style={lbl}>Langue du message</div>
      <div style={{ display: 'flex', gap: 7 }}>
        {(['fr', 'ar', 'en'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: lang === l ? C.blue : 'rgba(255,255,255,0.04)', color: lang === l ? '#06182e' : C.muted, border: 'none' }}>{l === 'fr' ? '🇫🇷 FR' : l === 'ar' ? '🇩🇿 AR' : '🇬🇧 EN'}</button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button onClick={() => void makePdf()} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: 12, border: `1px solid ${C.gold}55`, background: `${C.gold}14`, color: C.gold, fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{busy ? '…' : '📄 PDF (fichier)'}</button>
        <button onClick={() => void downloadImage()} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: 12, border: `1px solid ${C.blue}55`, background: `${C.blue}14`, color: C.blue, fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{busy ? '…' : '🖼️ Image'}</button>
      </div>
      <button onClick={() => void sendWhatsApp()} disabled={busy} style={{ width: '100%', marginTop: 8, padding: '14px', borderRadius: 12, border: 'none', background: '#25D366', color: '#06210f', fontFamily: C.font, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Préparation…' : '💬 Envoyer WhatsApp (en photo)'}</button>

      {/* Historique */}
      {history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowHist(v => !v)} style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: C.font, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
            {showHist ? '▾' : '▸'} Bons récents ({history.length})
          </button>
          {showHist && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {history.map(v => (
                <a key={v.id} href={v.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 13px', textDecoration: 'none' }}>
                  <span style={{ fontSize: 15 }}>🧾</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{v.client_name || 'Client'} <span style={{ color: C.muted, fontWeight: 400, fontSize: 11 }}>· {v.ref}</span></div>
                    <div style={{ fontSize: 11, color: C.muted }}>{v.vehicle ? `${v.vehicle} · ` : ''}{v.deposit ? `acompte ${Math.round(v.deposit).toLocaleString('fr-FR')} ${v.currency === 'EUR' ? '€' : 'DA'}` : ''}</div>
                  </div>
                  <span style={{ color: C.gold, fontSize: 16 }}>›</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Visuel caché capturé en PHOTO (html2canvas) ── */}
      <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none', opacity: 0 }} aria-hidden>
        <VoucherCard
          cardRef={cardRef}
          ref_={ref}
          firstName={firstName} lastName={lastName} passport={passport} phone={phone}
          vehicle={vehicle} start={start} end={end} pickup={pickup} dropoff={dropoff}
          total={totalN} deposit={depositN} reste={resteN} fmt={fmt}
        />
      </div>

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.15)', border: `1px solid ${C.accent}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}

// ── Visuel "bon de réservation" pro (rendu en image PNG) ──
function VoucherCard(p: {
  cardRef: RefObject<HTMLDivElement>; ref_: string;
  firstName: string; lastName: string; passport: string; phone: string;
  vehicle: string; start: string; end: string; pickup: string; dropoff: string;
  total: number; deposit: number; reste: number | null; fmt: (n: number) => string;
}) {
  const GOLD = '#b8902f', INK = '#1a1a1a', SUB = '#7a7a82', BOX = '#f7f7f9', GREEN = '#1f8b4c';
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
  const date = new Date().toLocaleDateString('fr-FR');
  const f: CSSProperties = { fontFamily: 'Arial, Helvetica, sans-serif' };
  const Row = ({ l, v, c }: { l: string; v: string; c?: string }) => (
    <div style={{ display: 'flex', padding: '5px 0' }}>
      <div style={{ width: 200, color: SUB, fontSize: 13 }}>{l}</div>
      <div style={{ flex: 1, color: c || INK, fontSize: 14, fontWeight: 700 }}>{v || '—'}</div>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div style={{ background: BOX, borderRadius: 12, padding: '14px 18px', marginBottom: 12 }}>
      <div style={{ color: GOLD, fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
  return (
    <div ref={p.cardRef} style={{ ...f, width: 720, background: '#fff', color: INK, padding: '0 0 24px' }}>
      <div style={{ height: 8, background: GOLD }} />
      <div style={{ padding: '24px 36px 0' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src={LOGO_URL} alt="" crossOrigin="anonymous" style={{ width: 58, height: 58, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>FIK CONCIERGERIE</div>
            <div style={{ fontSize: 11.5, color: SUB }}>Conciergerie premium · Location · Vente · Immobilier · Import — Oran, Algérie</div>
            <div style={{ fontSize: 11.5, color: SUB }}>WhatsApp +32 466 31 14 69 · fikconciergerie.com</div>
          </div>
        </div>
        {/* Titre + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>BON DE RÉSERVATION</div>
          <div style={{ background: GREEN, color: '#fff', fontSize: 12, fontWeight: 800, padding: '5px 14px', borderRadius: 20 }}>✓ CONFIRMÉ</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: SUB, fontSize: 12.5, marginTop: 6 }}>
          <span>N° {p.ref_ || '—'}</span><span>Émis le {date}</span>
        </div>
        <div style={{ height: 2, background: GOLD, margin: '12px 0 18px' }} />

        <Section title="CLIENT">
          <Row l="Nom et prénom" v={name} />
          {p.passport ? <Row l="N° de passeport" v={p.passport} /> : null}
          {p.phone ? <Row l="Téléphone" v={p.phone} /> : null}
        </Section>
        <Section title="RÉSERVATION">
          <Row l="Véhicule" v={p.vehicle} />
          {(p.start || p.end) ? <Row l="Période" v={`${p.start || '—'}  →  ${p.end || '—'}`} /> : null}
          <Row l="Lieu de récupération" v={p.pickup} />
          <Row l="Lieu de dépôt" v={p.dropoff} />
        </Section>
        <Section title="PAIEMENT">
          {p.total > 0 ? <Row l="Montant total" v={p.fmt(p.total)} /> : null}
          <Row l="Acompte versé" v={p.fmt(p.deposit)} c={GREEN} />
          {p.reste != null ? <Row l="Reste à payer (à la prise du véhicule)" v={p.fmt(p.reste)} c="#b3261e" /> : null}
        </Section>

        <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.5, marginTop: 4 }}>
          Ce bon confirme la réservation du véhicule ci-dessus avec l'acompte indiqué. Le solde est réglé à la prise du véhicule.
          Passeport et permis valides requis. Sans caution.
        </div>
        <div style={{ borderTop: '1px solid #ececef', marginTop: 18, paddingTop: 10, fontSize: 11, color: SUB }}>
          <b style={{ color: '#15151b' }}>FIK CONCIERGERIE</b> — Rue Derbouz Draoua, Houari, Oran 31300, Algérie · Merci de votre confiance
        </div>
      </div>
    </div>
  );
}
