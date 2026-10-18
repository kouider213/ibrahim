import { useState, useEffect, useRef, type CSSProperties, type RefObject, type ReactNode } from 'react';
import html2canvas from 'html2canvas';
import { business, api, type Car } from '../../services/api.ts';
import { T, Screen, PageHeader, Field, inputStyle, Btn, Card, SectionTitle, Segmented, Chips, Row, Avatar, tone } from '../ui/Kit.tsx';

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
  bg: '#050a16', surface: '#0c1730', surface2: '#12203d', border: 'rgba(90,150,255,0.16)',
  accent: '#38d8f5', gold: '#fbbf24', text: '#f5f5f7', muted: '#8ea3c8', blue: '#60a5fa',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

const PLACES = ['Aéroport d\'Oran', 'Agence Hay Badr (Oran)'];

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

  const LANGS = [{ id: 'fr', label: '🇫🇷 Français' }, { id: 'ar', label: '🇩🇿 Arabe' }, { id: 'en', label: '🇬🇧 Anglais' }];
  const CURS = [{ id: 'DZD', label: 'DA' }, { id: 'EUR', label: '€' }, { id: 'USD', label: '$' }];
  const placeChips = (val: string, set: (v: string) => void) => (
    <div style={{ marginTop: 8 }}><Chips items={PLACES.map(p => ({ id: p, label: p }))} value={val as string} onChange={set} /></div>
  );
  const dateIn = { ...inputStyle, colorScheme: 'dark' as const };

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Conciergerie" title="Bon de réservation" subtitle="Confirme une réservation + l'acompte → photo ou PDF sur WhatsApp" />}>
      <input ref={scanRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void scanDoc(f); }} />
      <Card onClick={scanBusy ? undefined : () => scanRef.current?.click()} accent={T.accent2} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <Avatar icon={scanBusy ? '🔍' : '📷'} color={T.accent2} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700 }}>{scanBusy ? 'Lecture du document…' : 'Scanner le passeport'}</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>Photo ou galerie → nom, prénom et n° remplis tout seuls</div>
        </div>
        <span style={{ color: T.accent2, fontSize: 20 }}>›</span>
      </Card>

      <SectionTitle>Client</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Prénom"><input value={firstName} onChange={e => setFirst(e.target.value)} style={inputStyle} /></Field></div>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Nom"><input value={lastName} onChange={e => setLast(e.target.value)} style={inputStyle} /></Field></div>
        </div>
        <Field label="N° de passeport"><input value={passport} onChange={e => setPass(e.target.value)} style={{ ...inputStyle, letterSpacing: '0.05em' }} /></Field>
        <div style={{ marginBottom: -12 }}><Field label="Téléphone WhatsApp"><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+33 … ou +213 …" style={inputStyle} /></Field></div>
      </Card>

      <SectionTitle>Location</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <Field label="Véhicule">
          <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Ex : Renault Clio 4 — gris" style={inputStyle} list="cars-list" />
          <datalist id="cars-list">{cars.map(c => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Du (facultatif)"><input type="date" lang="fr" value={start} onChange={e => setStart(e.target.value)} style={dateIn} /></Field></div>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Au"><input type="date" lang="fr" value={end} onChange={e => setEnd(e.target.value)} style={dateIn} /></Field></div>
        </div>
        <Field label="Lieu de récupération"><input value={pickup} onChange={e => setPickup(e.target.value)} style={inputStyle} />{placeChips(pickup, setPickup)}</Field>
        <div style={{ marginBottom: -12 }}><Field label="Lieu de dépôt"><input value={dropoff} onChange={e => setDropoff(e.target.value)} style={inputStyle} />{placeChips(dropoff, setDropoff)}</Field></div>
      </Card>

      <SectionTitle>Paiement</SectionTitle>
      <Card style={{ marginBottom: 16 }}>
        <Field label="Devise"><Segmented items={CURS} value={currency} onChange={setCurrency} /></Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Total (facultatif)"><input value={total} onChange={e => setTotal(e.target.value)} inputMode="numeric" style={{ ...inputStyle, fontWeight: 700 }} /></Field></div>
          <div style={{ flex: 1, minWidth: 0 }}><Field label="Acompte versé"><input value={deposit} onChange={e => setDeposit(e.target.value)} inputMode="numeric" style={{ ...inputStyle, fontWeight: 700 }} /></Field></div>
        </div>
        {resteN != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 14px', borderRadius: 13, background: tone(T.warn, 0.1), border: `1px solid ${tone(T.warn, 0.3)}` }}>
            <span style={{ color: T.muted, fontSize: 14 }}>{t('reste', lang)}</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: T.warn }}>{fmt(resteN)}</span>
          </div>
        )}
      </Card>

      <Field label="Langue du message"><Segmented items={LANGS} value={lang} onChange={setLang} /></Field>

      <Btn onClick={() => void sendWhatsApp()} disabled={busy} style={{ width: '100%', background: '#25D366', color: '#04210f', border: 'none', minHeight: 50, marginTop: 4 }}>{busy ? 'Préparation…' : '💬 Envoyer sur WhatsApp (en photo)'}</Btn>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Btn color={T.warn} onClick={() => void makePdf()} disabled={busy} style={{ flex: 1 }}>📄 PDF</Btn>
        <Btn color={T.accent2} onClick={() => void downloadImage()} disabled={busy} style={{ flex: 1 }}>🖼️ Image</Btn>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionTitle right={<button onClick={() => setShowHist(v => !v)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>{showHist ? 'Masquer' : `Voir (${history.length})`}</button>}>Bons récents</SectionTitle>
          {showHist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(v => (
                <Row key={v.id} onClick={() => window.open(v.url, '_blank')} left={<Avatar icon="🧾" color={T.warn} size={38} />}
                  title={v.client_name || 'Client'}
                  sub={`${v.ref}${v.vehicle ? ` · ${v.vehicle}` : ''}${v.deposit ? ` · acompte ${Math.round(v.deposit).toLocaleString('fr-FR')} ${v.currency === 'EUR' ? '€' : 'DA'}` : ''}`}
                  right={<span style={{ color: T.muted, fontSize: 20 }}>›</span>} />
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
    </Screen>
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
          Passeport et permis valides requis. Le passeport est conservé en lieu sûr pendant toute la durée de la location et restitué au retour du véhicule. Sans caution.
        </div>
        <div style={{ borderTop: '1px solid #ececef', marginTop: 18, paddingTop: 10, fontSize: 11, color: SUB }}>
          <b style={{ color: '#15151b' }}>FIK CONCIERGERIE</b> — Rue Derbouz Draoua, Houari, Oran 31300, Algérie · Merci de votre confiance
        </div>
      </div>
    </div>
  );
}
