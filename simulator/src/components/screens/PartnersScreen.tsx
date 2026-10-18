import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards, SearchPill } from '../ui/Premium.tsx';

// « PARTENAIRES » : Houari, Karim… et tout ce qu'ils proposent (véhicules, immobilier, services, activités),
// avec photos, prix payé au partenaire, prix client et marge. Un véhicule « dans le PARC » se met à jour partout.

type OfferType = 'vehicle' | 'property' | 'service' | 'activity' | 'other';
interface Offer {
  id: string; type: OfferType; title: string; description?: string; photos: string[];
  owner_price: number | null; client_price: number | null; unit: string; currency: 'EUR' | 'DZD';
  capacity?: number | null; location?: string; conditions?: string; available: boolean;
  car_id?: string | null; property_id?: string | null;
}
interface Partner {
  id: string; name: string; role?: string; status: string; phone?: string; whatsapp?: string; email?: string; city?: string; address?: string;
  payment_terms?: string; commission_pct?: number | null; deposit?: string; contract?: string; since?: string; rating?: number | null; notes?: string;
  offers: Offer[]; stats: { offers: number; byType: Partial<Record<OfferType, number>>; avgMarginPct: number | null };
}

const C = {
  bg: '#050a16', surface: '#0c1730', surface2: '#101e3d', border: 'rgba(90,150,255,0.16)',
  accent: '#38d8f5', gold: '#fbbf24', green: '#34d399', red: '#f87171', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const TYPES: Array<{ id: OfferType; icon: string; label: string; unit: string }> = [
  { id: 'vehicle', icon: '🚗', label: 'Véhicule', unit: 'jour' },
  { id: 'property', icon: '🏠', label: 'Immobilier', unit: 'nuit' },
  { id: 'service', icon: '🛎️', label: 'Service', unit: 'prestation' },
  { id: 'activity', icon: '🌊', label: 'Activité', unit: 'personne' },
  { id: 'other', icon: '📦', label: 'Autre', unit: 'prestation' },
];
const UNITS = ['jour', 'nuit', 'semaine', 'mois', 'personne', 'heure', 'prestation', 'trajet'];
const STATUSES = ['actif', 'en discussion', 'en pause', 'terminé'];
const STATUS_COL: Record<string, string> = { actif: C.green, 'en discussion': C.gold, 'en pause': C.muted, terminé: C.red };
const tInfo = (t: OfferType) => TYPES.find(x => x.id === t) ?? TYPES[4]!;
const money = (n: number | null | undefined, cur: string) => (n == null ? '—' : `${Math.round(n * 10) / 10} ${cur === 'DZD' ? 'DA' : '€'}`);
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: C.font } as const);
const input = { width: '100%', boxSizing: 'border-box' as const, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 14, fontFamily: C.font, outline: 'none' };
const label = { fontSize: 11, color: C.muted, fontWeight: 600, margin: '10px 0 4px', display: 'block' } as const;
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : 'Erreur';
  try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; }
};
const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;

/** Photo du téléphone → JPEG ≤ 1600 px (évite d'envoyer 5 Mo par photo). */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

type PartnerForm = Partial<Record<'name' | 'role' | 'status' | 'phone' | 'whatsapp' | 'email' | 'city' | 'address' | 'payment_terms' | 'commission_pct' | 'deposit' | 'contract' | 'since' | 'rating' | 'notes', string>>;
type OfferForm = { type: OfferType; title: string; description: string; owner_price: string; client_price: string; unit: string; currency: 'EUR' | 'DZD';
  capacity: string; location: string; conditions: string; available: boolean; add_to_fleet: boolean; publish_site: boolean; category: string; fuel: string; transmission: string };
const EMPTY_OFFER: OfferForm = { type: 'vehicle', title: '', description: '', owner_price: '', client_price: '', unit: 'jour', currency: 'EUR', capacity: '', location: '', conditions: '', available: true, add_to_fleet: true, publish_site: false, category: 'citadine', fuel: '', transmission: '' };

export default function PartnersScreen() {
  const [list, setList] = useState<Partner[] | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OfferType | 'all'>('all');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [pForm, setPForm] = useState<{ id?: string; f: PartnerForm } | null>(null);
  const [oForm, setOForm] = useState<{ id?: string; f: OfferForm; photos: string[] } | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };
  const load = useCallback(async () => {
    try { setList((await apiFetch<{ partners: Partner[] }>('/api/partners')).partners); } catch (e) { say(`❌ ${errText(e)}`); setList(l => l ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const p = list?.find(x => x.id === openId) ?? null;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list ?? []).filter(x => !n || [x.name, x.role, x.city, ...x.offers.map(o => o.title)].some(v => v?.toLowerCase().includes(n)));
  }, [list, q]);
  const totals = useMemo(() => {
    const offers = (list ?? []).flatMap(x => x.offers);
    const m = offers.filter(o => o.client_price && o.owner_price != null).map(o => (o.client_price! - o.owner_price!) / o.client_price! * 100);
    return { partners: list?.length ?? 0, offers: offers.length, margin: m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null };
  }, [list]);

  const savePartner = async () => {
    if (!pForm) return;
    if (!pForm.f.name?.trim()) { say('❌ Le nom est obligatoire'); return; }
    setBusy(true);
    try {
      const body = { ...pForm.f, commission_pct: pForm.f.commission_pct ? Number(pForm.f.commission_pct) : null, rating: pForm.f.rating ? Number(pForm.f.rating) : null };
      const r = await apiFetch<{ partner: Partner }>(pForm.id ? `/api/partners/${pForm.id}` : '/api/partners', { method: pForm.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      say('✅ Partenaire enregistré'); setPForm(null); await load(); setOpenId(r.partner.id);
    } catch (e) { say(`❌ ${errText(e)}`); } finally { setBusy(false); }
  };
  const removePartner = async (x: Partner) => {
    if (!confirm(`Retirer ${x.name} de tes partenaires ? (ses voitures/biens restent sur le site)`)) return;
    try { await apiFetch(`/api/partners/${x.id}`, { method: 'DELETE' }); setOpenId(null); say('🗑️ Retiré'); await load(); } catch (e) { say(`❌ ${errText(e)}`); }
  };
  const saveOffer = async () => {
    if (!p || !oForm) return;
    const f = oForm.f;
    if (!f.title.trim()) { say('❌ Donne un nom à l\'offre'); return; }
    setBusy(true);
    try {
      const body = {
        type: f.type, title: f.title, description: f.description, unit: f.unit, currency: f.currency, location: f.location, conditions: f.conditions, available: f.available,
        owner_price: f.owner_price === '' ? null : Number(f.owner_price.replace(',', '.')), client_price: f.client_price === '' ? null : Number(f.client_price.replace(',', '.')),
        capacity: f.capacity === '' ? null : Number(f.capacity), photos: oForm.photos,
        ...(!oForm.id && f.type === 'vehicle' ? { add_to_fleet: f.add_to_fleet, category: f.category, fuel: f.fuel, transmission: f.transmission, seats: f.capacity ? Number(f.capacity) : undefined } : {}),
        ...(!oForm.id && f.type === 'property' ? { publish_site: f.publish_site } : {}),
      };
      await apiFetch(oForm.id ? `/api/partners/${p.id}/offers/${oForm.id}` : `/api/partners/${p.id}/offers`, { method: oForm.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      say('✅ Offre enregistrée'); setOForm(null); await load();
    } catch (e) { say(`❌ ${errText(e)}`); } finally { setBusy(false); }
  };
  const removeOffer = async (o: Offer) => {
    if (!p) return;
    const linked = o.car_id || o.property_id;
    const alsoSite = linked ? confirm(`Retirer aussi « ${o.title} » du ${o.car_id ? 'PARC et du site' : 'site'} ?\nOK = oui, l'enlever partout · Annuler = la garder sur le site`) : false;
    if (!linked && !confirm(`Retirer « ${o.title} » ?`)) return;
    try { await apiFetch(`/api/partners/${p.id}/offers/${o.id}${alsoSite ? '?remove_linked=1' : ''}`, { method: 'DELETE' }); say('🗑️ Offre retirée'); await load(); } catch (e) { say(`❌ ${errText(e)}`); }
  };
  const addPhotos = async (o: Offer, files: FileList | null) => {
    if (!p || !files?.length) return;
    setBusy(true);
    try {
      const photos = await Promise.all(Array.from(files).slice(0, 10).map(compress));
      await apiFetch(`/api/partners/${p.id}/offers/${o.id}`, { method: 'PATCH', body: JSON.stringify({ photos }) });
      say(`✅ ${photos.length} photo(s) ajoutée(s)${o.car_id ? ' (aussi dans le PARC et sur le site)' : ''}`); await load();
    } catch (e) { say(`❌ ${errText(e)}`); } finally { setBusy(false); }
  };
  const pickFormPhotos = async (files: FileList | null) => {
    if (!files?.length || !oForm) return;
    const photos = await Promise.all(Array.from(files).slice(0, 10).map(compress));
    setOForm(s => s && { ...s, photos: [...s.photos, ...photos].slice(0, 15) });
  };

  const page = { height: '100%', overflowY: 'auto' as const, WebkitOverflowScrolling: 'touch' as const, background: C.bg, color: C.text, fontFamily: C.font, paddingBottom: 110 };

  // ── Formulaire partenaire ──
  if (pForm) {
    const f = pForm.f;
    const set = (k: keyof PartnerForm) => (e: { target: { value: string } }) => setPForm(s => s && { ...s, f: { ...s.f, [k]: e.target.value } });
    const field = (k: keyof PartnerForm, l: string, ph = '', type = 'text') => (
      <div><span style={label}>{l}</span><input value={f[k] ?? ''} onChange={set(k)} placeholder={ph} type={type} style={input} /></div>
    );
    return (
      <div style={page}>
        <div style={{ padding: '18px 16px' }}>
          <button onClick={() => setPForm(null)} style={btn('transparent', C.muted)}>← Annuler</button>
          <h2 style={{ margin: '10px 0 4px', fontSize: 20 }}>{pForm.id ? `Modifier ${f.name ?? ''}` : 'Nouveau partenaire'}</h2>
          {field('name', 'Nom *', 'Karim')}
          {field('role', 'Ce qu\'il fait', 'Loueur de voitures, agent immobilier, excursions…')}
          <span style={label}>Statut</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.map(s => <button key={s} onClick={() => setPForm(x => x && { ...x, f: { ...x.f, status: s } })} style={{ ...btn((f.status ?? 'actif') === s ? `${STATUS_COL[s]}33` : C.surface2, (f.status ?? 'actif') === s ? STATUS_COL[s]! : C.muted), border: `1px solid ${(f.status ?? 'actif') === s ? STATUS_COL[s] : C.border}` }}>{s}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {field('phone', 'Téléphone', '+213…', 'tel')}
            {field('whatsapp', 'WhatsApp', '+213…', 'tel')}
          </div>
          {field('email', 'Email', '', 'email')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {field('city', 'Ville', 'Oran')}
            {field('since', 'Partenaire depuis', '2026')}
          </div>
          {field('address', 'Adresse')}
          {field('payment_terms', 'Comment il est payé', 'Cash à la fin de chaque location, virement…')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {field('commission_pct', 'Commission (%)', 'si à la commission', 'number')}
            {field('deposit', 'Caution / garantie', '')}
          </div>
          {field('contract', 'Contrat / accord', 'Écrit, oral, durée…')}
          <span style={label}>Note de confiance</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setPForm(x => x && { ...x, f: { ...x.f, rating: String(n) } })} style={{ ...btn('transparent', Number(f.rating ?? 0) >= n ? C.gold : C.muted), fontSize: 22, padding: '2px 4px' }}>★</button>)}
          </div>
          <span style={label}>Notes (ce qu'il propose, ses conditions, ce qu'il faut savoir…)</span>
          <textarea value={f.notes ?? ''} onChange={set('notes')} rows={4} style={{ ...input, resize: 'vertical' }} />
          <button onClick={() => void savePartner()} disabled={busy} style={{ ...btn(C.accent, '#00131a'), width: '100%', marginTop: 16, padding: 13, fontSize: 14 }}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  // ── Formulaire offre ──
  if (oForm && p) {
    const f = oForm.f;
    const set = <K extends keyof OfferForm>(k: K, v: OfferForm[K]) => setOForm(s => s && { ...s, f: { ...s.f, [k]: v } });
    const own = Number(f.owner_price.replace(',', '.')), cli = Number(f.client_price.replace(',', '.'));
    const margin = f.owner_price !== '' && f.client_price !== '' && cli > 0 ? cli - own : null;
    return (
      <div style={page}>
        <div style={{ padding: '18px 16px' }}>
          <button onClick={() => setOForm(null)} style={btn('transparent', C.muted)}>← Annuler</button>
          <h2 style={{ margin: '10px 0 4px', fontSize: 20 }}>{oForm.id ? 'Modifier l\'offre' : `Nouvelle offre — ${p.name}`}</h2>
          {!oForm.id && <>
            <span style={label}>Type</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPES.map(t => <button key={t.id} onClick={() => setOForm(s => s && { ...s, f: { ...s.f, type: t.id, unit: t.unit } })} style={{ ...btn(f.type === t.id ? `${C.accent}26` : C.surface2, f.type === t.id ? C.accent : C.muted), border: `1px solid ${f.type === t.id ? C.accent : C.border}` }}>{t.icon} {t.label}</button>)}
            </div>
          </>}
          <span style={label}>Nom *</span>
          <input value={f.title} onChange={e => set('title', e.target.value)} placeholder={f.type === 'vehicle' ? 'Clio 5' : f.type === 'property' ? 'Villa Aïn Turck 4 chambres' : f.type === 'activity' ? 'Tournée sur la corniche' : 'Chauffeur aéroport'} style={input} />
          <span style={label}>Description</span>
          <textarea value={f.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span style={label}>Je paie au partenaire</span><input value={f.owner_price} onChange={e => set('owner_price', e.target.value)} inputMode="decimal" placeholder="30" style={input} /></div>
            <div><span style={label}>Le client paie</span><input value={f.client_price} onChange={e => set('client_price', e.target.value)} inputMode="decimal" placeholder="42" style={input} /></div>
          </div>
          {margin != null && (
            <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 10, background: margin > 0 ? `${C.green}1a` : `${C.red}1a`, color: margin > 0 ? C.green : C.red, fontSize: 13, fontWeight: 700 }}>
              Ta marge : {money(margin, f.currency)} par {f.unit} ({Math.round(margin / cli * 100)} %){margin <= 0 ? ' — tu perds de l\'argent' : ''}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
            <div><span style={label}>Par</span>
              <select value={UNITS.includes(f.unit) ? f.unit : 'autre'} onChange={e => set('unit', e.target.value === 'autre' ? '' : e.target.value)} style={input}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}<option value="autre">autre…</option>
              </select>
              {!UNITS.includes(f.unit) && <input value={f.unit} onChange={e => set('unit', e.target.value)} placeholder="ex. demi-journée" style={{ ...input, marginTop: 6 }} />}
            </div>
            <div><span style={label}>Devise</span>
              <select value={f.currency} onChange={e => set('currency', e.target.value as 'EUR' | 'DZD')} style={input}><option value="EUR">€ euros</option><option value="DZD">DA dinars</option></select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8 }}>
            <div><span style={label}>{f.type === 'vehicle' ? 'Places' : 'Capacité (pers.)'}</span><input value={f.capacity} onChange={e => set('capacity', e.target.value)} inputMode="numeric" style={input} /></div>
            <div><span style={label}>Lieu</span><input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Oran, Aïn Turck…" style={input} /></div>
          </div>
          <span style={label}>Conditions (caution, durée min., horaires, ce qui est inclus…)</span>
          <input value={f.conditions} onChange={e => set('conditions', e.target.value)} style={input} />
          {!oForm.id && f.type === 'vehicle' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><span style={label}>Catégorie</span><select value={f.category} onChange={e => set('category', e.target.value)} style={input}>{['citadine', 'berline', 'SUV', 'familiale', 'utilitaire', 'premium'].map(c => <option key={c}>{c}</option>)}</select></div>
              <div><span style={label}>Carburant</span><select value={f.fuel} onChange={e => set('fuel', e.target.value)} style={input}><option value="">—</option>{['essence', 'diesel', 'hybride', 'électrique'].map(c => <option key={c}>{c}</option>)}</select></div>
              <div><span style={label}>Boîte</span><select value={f.transmission} onChange={e => set('transmission', e.target.value)} style={input}><option value="">—</option><option>manuelle</option><option>automatique</option></select></div>
            </div>
            <Toggle on={f.add_to_fleet} onClick={() => set('add_to_fleet', !f.add_to_fleet)} text="Ajouter au PARC et sur le site (louable tout de suite)" />
          </>}
          {!oForm.id && f.type === 'property' && <Toggle on={f.publish_site} onClick={() => set('publish_site', !f.publish_site)} text="Publier sur le site (page Immobilier, au prix client)" />}
          <Toggle on={f.available} onClick={() => set('available', !f.available)} text="Disponible" />
          <span style={label}>Photos {oForm.id ? '(ajoutées à celles déjà enregistrées)' : ''}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {oForm.photos.map((ph, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={ph} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 10 }} />
                <button onClick={() => setOForm(s => s && { ...s, photos: s.photos.filter((_, j) => j !== i) })} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: C.red, color: '#fff', fontSize: 12, cursor: 'pointer' }}>×</button>
              </div>
            ))}
            <label style={{ width: 70, height: 70, borderRadius: 10, border: `1px dashed ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 26, cursor: 'pointer' }}>
              +<input type="file" accept="image/*" multiple hidden onChange={e => void pickFormPhotos(e.target.files)} />
            </label>
          </div>
          <button onClick={() => void saveOffer()} disabled={busy} style={{ ...btn(C.accent, '#00131a'), width: '100%', marginTop: 18, padding: 13, fontSize: 14 }}>{busy ? 'Envoi…' : 'Enregistrer l\'offre'}</button>
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  // ── Fiche d'un partenaire ──
  if (p) {
    const offers = p.offers.filter(o => filter === 'all' || o.type === filter);
    const infos: Array<[string, string | undefined]> = [
      ['📍', [p.address, p.city].filter(Boolean).join(', ')], ['💳', p.payment_terms && `Paiement : ${p.payment_terms}`],
      ['％', p.commission_pct != null ? `Commission : ${p.commission_pct} %` : undefined], ['🔒', p.deposit && `Caution : ${p.deposit}`],
      ['📝', p.contract && `Accord : ${p.contract}`], ['📅', p.since && `Partenaire depuis ${p.since}`], ['✉️', p.email],
    ];
    return (
      <div style={page}>
        <div style={{ padding: '16px 16px 4px' }}>
          <button onClick={() => { setOpenId(null); setFilter('all'); }} style={btn('transparent', C.muted)}>← Partenaires</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Avatar name={p.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 21, fontWeight: 800 }}>{p.name} {p.rating ? <span style={{ color: C.gold, fontSize: 14 }}>{'★'.repeat(p.rating)}</span> : null}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>{p.role || '—'} · <span style={{ color: STATUS_COL[p.status] ?? C.muted }}>{p.status}</span></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            {p.phone && <a href={`tel:${p.phone}`} style={{ ...btn(C.surface2, C.text), textDecoration: 'none' }}>📞 Appeler</a>}
            {(p.whatsapp || p.phone) && <a href={waLink(p.whatsapp || p.phone!)} target="_blank" rel="noreferrer" style={{ ...btn('#25D36622', '#25D366'), textDecoration: 'none' }}>WhatsApp</a>}
            <button onClick={() => setPForm({ id: p.id, f: Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)])) as PartnerForm })} style={btn(C.surface2, C.accent)}>✏️ Modifier</button>
            <button onClick={() => void removePartner(p)} style={btn(C.surface2, C.red)}>🗑️</button>
          </div>
          {(infos.some(([, v]) => v) || p.notes) && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 1.55 }}>
              {infos.filter(([, v]) => v).map(([i, v]) => <div key={i}>{i} {v}</div>)}
              {p.notes && <div style={{ marginTop: 6, color: C.muted, whiteSpace: 'pre-wrap' }}>{p.notes}</div>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            <StatCard icon="📦" value={String(p.stats.offers)} label="offres" />
            <StatCard icon="💰" value={p.stats.avgMarginPct != null ? `${p.stats.avgMarginPct} %` : '—'} label="marge moy." color={C.green} />
            <StatCard icon="🚗" value={String(p.offers.filter(o => o.car_id).length)} label="dans le parc" color={C.gold} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '14px 0 4px', paddingBottom: 4 }}>
            {[{ id: 'all' as const, icon: '✨', label: 'Tout' }, ...TYPES].filter(t => t.id === 'all' || p.stats.byType[t.id as OfferType]).map(t => (
              <button key={t.id} onClick={() => setFilter(t.id)} style={{ ...btn(filter === t.id ? `${C.accent}26` : C.surface2, filter === t.id ? C.accent : C.muted), whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t.icon} {t.label}{t.id !== 'all' ? ` ${p.stats.byType[t.id as OfferType]}` : ''}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setOForm({ f: { ...EMPTY_OFFER }, photos: [] })} style={{ ...btn(C.accent, '#00131a'), padding: 12 }}>＋ Ajouter une offre (véhicule, bien, service, activité…)</button>
          {offers.map(o => {
            const t = tInfo(o.type);
            const m = o.client_price != null && o.owner_price != null ? o.client_price - o.owner_price : null;
            return (
              <div key={o.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', opacity: o.available ? 1 : 0.6 }}>
                {o.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
                    {o.photos.map(ph => <img key={ph} src={ph} alt="" onClick={() => setZoom(ph)} style={{ height: 130, minWidth: o.photos.length > 1 ? '70%' : '100%', objectFit: 'cover', cursor: 'zoom-in' }} />)}
                  </div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Badge text={`${t.icon} ${t.label}`} color={C.accent} />
                    {o.car_id && <Badge text="Dans le PARC" color={C.gold} />}
                    {o.property_id && <Badge text="Sur le site" color={C.gold} />}
                    {!o.available && <Badge text="Indisponible" color={C.red} />}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{o.title}</div>
                  {o.description && <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{o.description}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
                    <Price lab="Je paie" val={money(o.owner_price, o.currency)} />
                    <Price lab="Client paie" val={money(o.client_price, o.currency)} />
                    <Price lab="Ma marge" val={m != null ? `${money(m, o.currency)}${o.client_price ? ` · ${Math.round(m / o.client_price * 100)}%` : ''}` : '—'} color={m == null ? C.muted : m > 0 ? C.green : C.red} />
                  </div>
                  <div style={{ color: C.muted, fontSize: 11.5, marginTop: 6 }}>par {o.unit}{o.capacity ? ` · ${o.capacity} ${o.type === 'vehicle' ? 'places' : 'pers.'}` : ''}{o.location ? ` · ${o.location}` : ''}{o.conditions ? ` · ${o.conditions}` : ''}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setOForm({ id: o.id, photos: [], f: { ...EMPTY_OFFER, type: o.type, title: o.title, description: o.description ?? '', owner_price: o.owner_price != null ? String(o.owner_price) : '', client_price: o.client_price != null ? String(o.client_price) : '', unit: o.unit, currency: o.currency, capacity: o.capacity != null ? String(o.capacity) : '', location: o.location ?? '', conditions: o.conditions ?? '', available: o.available } })} style={btn(C.surface2, C.accent)}>✏️ Modifier</button>
                    <label style={{ ...btn(C.surface2, C.text), display: 'inline-block' }}>📷 Photos<input type="file" accept="image/*" multiple hidden onChange={e => void addPhotos(o, e.target.files)} /></label>
                    <button onClick={() => void removeOffer(o)} style={btn(C.surface2, C.red)}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
          {!offers.length && <div style={{ color: C.muted, textAlign: 'center', padding: 24, fontSize: 13 }}>Aucune offre pour l'instant.</div>}
        </div>
        {zoom && <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /></div>}
        {busy && <Toast text="⏳ Envoi des photos…" />}
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  // ── Liste ──
  return (
    <div style={page}>
      <Hero eyebrow="Dzaryx · Réseau" title="Partenaires" subtitle="Ceux avec qui tu travailles et tout ce qu'ils te proposent" accent={C.gold} />
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <StatCard icon="🤝" value={String(totals.partners)} label="partenaires" color={C.gold} />
          <StatCard icon="📦" value={String(totals.offers)} label="offres" />
          <StatCard icon="💰" value={totals.margin != null ? `${totals.margin} %` : '—'} label="marge moy." color={C.green} />
        </div>
        <div style={{ margin: '12px 0' }}><SearchPill value={q} onChange={setQ} placeholder="Chercher un partenaire ou une offre…" /></div>
        <button onClick={() => setPForm({ f: { status: 'actif', city: 'Oran' } })} style={{ ...btn(C.gold, '#1a1200'), width: '100%', padding: 12, marginBottom: 12 }}>＋ Nouveau partenaire</button>
        {list === null ? <SkeletonCards count={3} height={86} /> : shown.map(x => (
          <button key={x.id} onClick={() => setOpenId(x.id)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10, cursor: 'pointer', color: C.text, fontFamily: C.font }}>
            <Avatar name={x.name} photo={x.offers.find(o => o.photos.length)?.photos[0]} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{x.name} <span style={{ fontSize: 11, color: STATUS_COL[x.status] ?? C.muted, fontWeight: 600 }}>● {x.status}</span></div>
              <div style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[x.role, x.city].filter(Boolean).join(' · ') || '—'}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {Object.entries(x.stats.byType).map(([t, n]) => `${tInfo(t as OfferType).icon} ${n}`).join('   ') || 'Aucune offre'}
                {x.stats.avgMarginPct != null && <span style={{ color: C.green, marginLeft: 8 }}>marge {x.stats.avgMarginPct} %</span>}
              </div>
            </div>
            <span style={{ color: C.muted, fontSize: 18 }}>›</span>
          </button>
        ))}
        {list && !shown.length && <div style={{ color: C.muted, textAlign: 'center', padding: 24, fontSize: 13 }}>{q ? 'Aucun résultat.' : 'Aucun partenaire. Ajoute ton premier !'}</div>}
        <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.5, marginTop: 8 }}>💡 Tu peux aussi le dire à Dzaryx : « ajoute Karim comme partenaire, il me propose une villa à 80 € la nuit que je loue 110 € » ou « si je travaille avec Karim, combien je gagne ? ».</div>
      </div>
      {toast && <Toast text={toast} />}
    </div>
  );
}

function Avatar({ name, photo }: { name: string; photo?: string }) {
  return photo
    ? <img src={photo} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #fbbf2433, #38d8f522)', color: '#fbbf24', fontWeight: 800, fontSize: 22 }}>{name.slice(0, 1).toUpperCase()}</div>;
}
function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}1f`, border: `1px solid ${color}44`, borderRadius: 7, padding: '2px 7px' }}>{text}</span>;
}
function Price({ lab, val, color = '#f5f5f7' }: { lab: string; val: string; color?: string }) {
  return <div style={{ background: '#101e3d', borderRadius: 10, padding: '7px 8px' }}><div style={{ fontSize: 10, color: '#8ea3c8' }}>{lab}</div><div style={{ fontWeight: 800, fontSize: 13.5, color }}>{val}</div></div>;
}
function Toggle({ on, onClick, text }: { on: boolean; onClick: () => void; text: string }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 12, background: 'transparent', border: 'none', color: '#f5f5f7', fontSize: 13.5, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}>
      <span style={{ width: 42, height: 24, borderRadius: 12, background: on ? '#38d8f5' : '#2a3a5c', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .2s' }} />
      </span>{text}
    </button>
  );
}
function Toast({ text }: { text: string }) {
  return <div style={{ position: 'fixed', left: 16, right: 16, bottom: 96, background: '#0c1730', border: '1px solid rgba(90,150,255,0.3)', borderRadius: 12, padding: '11px 14px', fontSize: 13.5, color: '#f5f5f7', zIndex: 60, boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>{text}</div>;
}
