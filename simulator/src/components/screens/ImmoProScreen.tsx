import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { business, getOrCreateSessionId, type SiteProperty } from '../../services/api.ts';
import { InspectionModal } from './FleetScreen.tsx';

// ── Palette premium (façon Gemini) ──────────────────────────────
const C = {
  bg:      '#0b0b0d',
  surface: '#16161c',
  surface2:'#1d1d25',
  border:  'rgba(255,255,255,0.07)',
  gold:    '#3b82f6',
  goldSoft:'#60a5fa',
  text:    '#f5f5f7',
  muted:   '#9b9ba6',
  green:   '#34d399',
  blue:    '#60a5fa',
  red:     '#fb7185',
  font:    '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

type Filter = 'tous' | 'location' | 'vente';

const STATUS_META: Record<string, { label: string; col: string }> = {
  disponible: { label: 'Disponible', col: C.green },
  loue:       { label: 'Loué',       col: C.gold },
  'loué':     { label: 'Loué',       col: C.gold },
  vendu:      { label: 'Vendu',      col: C.blue },
  coming_soon:{ label: 'Bientôt',    col: C.muted },
  en_travaux: { label: 'Travaux',    col: '#fb923c' },
};

const TYPE_ICON: Record<string, string> = {
  appartement: '🏢', villa: '🏡', maison: '🏠', studio: '🛏️',
  commercial: '🏪', local: '🏬', terrain: '🌿', bureau: '🏢',
};

const HOWTO = [
  '➕ Appuie sur + pour publier un bien (location ou vente) directement sur le site.',
  '🖼️ Ajoute plusieurs photos — la 1ʳᵉ est la photo principale.',
  '📍 Tape l\'adresse → choisis la suggestion exacte → une carte s\'affiche sur l\'annonce.',
  '🔄 « Statut » bascule disponible / loué / vendu. 📷 fait l\'état des lieux (IA).',
];

interface AddForm {
  title: string; transaction: 'location' | 'vente'; type: string;
  price: string; currency: string; city: string; district: string; address: string;
  surface: string; rooms: string; bedrooms: string; bathrooms: string; floor: string;
  description: string;
}
const EMPTY: AddForm = {
  title: '', transaction: 'location', type: 'appartement', price: '', currency: 'DZD',
  city: 'Oran', district: '', address: '', surface: '', rooms: '', bedrooms: '', bathrooms: '', floor: '',
  description: '',
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const propTitle = (p: SiteProperty) => p.title || p.name || 'Sans titre';
const statusKey = (p: SiteProperty) => (p.status || 'disponible').toLowerCase();

export default function ImmoProScreen() {
  const [items, setItems]   = useState<SiteProperty[]>([]);
  const [loading, setLoad]  = useState(true);
  const [filter, setFilter] = useState<Filter>('tous');
  const [showAdd, setShow]  = useState(false);
  const [form, setForm]     = useState<AddForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy]     = useState<string | null>(null);
  const [toast, setToast]   = useState('');
  const [inspect, setInspect] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionId = getOrCreateSessionId();

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = async () => {
    setLoad(true);
    try { const r = await business.fetchProperties(); setItems(r.properties ?? []); }
    catch { setItems([]); }
    finally { setLoad(false); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = items.filter(p => filter === 'tous' || (p.transaction || 'location') === filter);
  const stats = {
    total: items.length,
    louer: items.filter(p => (p.transaction || 'location') === 'location').length,
    vendre: items.filter(p => p.transaction === 'vente').length,
    dispo: items.filter(p => statusKey(p) === 'disponible').length,
  };

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    try { const urls = await Promise.all(files.slice(0, 15).map(fileToDataUrl)); setPhotos(p => [...p, ...urls].slice(0, 15)); }
    catch { flash('❌ Lecture photo'); }
  };

  const add = async () => {
    if (!form.title.trim()) { flash('❌ Titre requis'); return; }
    setSaving(true);
    try {
      await business.createProperty({
        title: form.title.trim(), name: form.title.trim(), transaction: form.transaction,
        type: form.type, status: 'disponible',
        price: form.price ? Number(form.price) : null, currency: form.currency,
        price_type: form.transaction === 'location' ? 'mois' : 'total',
        city: form.city.trim() || 'Oran', district: form.district.trim() || null,
        address: form.address.trim() || null,
        surface: form.surface || null, rooms: form.rooms || null,
        bedrooms: form.bedrooms || null, bathrooms: form.bathrooms || null, floor: form.floor || null,
        description: form.description.trim() || null,
        photos,
      });
      flash('✅ Bien ajouté au site'); setShow(false); setForm(EMPTY); setPhotos([]); void load();
    } catch { flash('❌ Échec ajout'); } finally { setSaving(false); }
  };

  const cycleStatus = async (p: SiteProperty) => {
    const order = p.transaction === 'vente' ? ['disponible', 'vendu', 'coming_soon'] : ['disponible', 'loue', 'coming_soon'];
    const next = order[(order.indexOf(statusKey(p)) + 1) % order.length];
    setBusy(p.id);
    try { await business.updateProperty(p.id, { status: next }); setItems(xs => xs.map(x => x.id === p.id ? { ...x, status: next } : x)); }
    catch { flash('❌ Échec MAJ'); } finally { setBusy(null); }
  };

  const del = async (p: SiteProperty) => {
    if (!confirm(`Supprimer "${propTitle(p)}" du site ?`)) return;
    setBusy(p.id);
    try { await business.deleteProperty(p.id); setItems(xs => xs.filter(x => x.id !== p.id)); flash('🗑 Supprimé'); }
    catch { flash('❌ Échec'); } finally { setBusy(null); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      {/* Hero */}
      <div style={{ position: 'relative', padding: '22px 18px 18px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, background: `radial-gradient(circle, ${C.gold}22, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.gold, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Dzaryx · Immobilier</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, background: `linear-gradient(120deg, #fff, ${C.goldSoft})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Immobilier</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          Synchronisé avec fikconciergerie.com
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '0 18px 14px' }}>
        {[
          { v: stats.total, l: 'Biens', c: C.text },
          { v: stats.louer, l: 'À louer', c: C.gold },
          { v: stats.vendre, l: 'À vendre', c: C.blue },
          { v: stats.dispo, l: 'Dispo', c: C.green },
        ].map(s => (
          <div key={s.l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filtres + ajouter */}
      <div style={{ display: 'flex', gap: 8, padding: '0 18px 14px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, flex: 1 }}>
          {(['tous', 'location', 'vente'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 11.5, fontWeight: 600, background: filter === f ? C.gold : 'transparent', color: filter === f ? '#ffffff' : C.muted, transition: 'all .2s' }}>
              {f === 'tous' ? 'Tous' : f === 'location' ? 'À louer' : 'À vendre'}
            </button>
          ))}
        </div>
        <button onClick={() => setShow(true)} style={{ width: 42, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`, color: '#ffffff', fontSize: 22, fontWeight: 700, boxShadow: `0 6px 18px ${C.gold}44` }}>+</button>
      </div>

      {/* Liste */}
      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Aucun bien. Appuie sur +</div>
        ) : filtered.map(p => {
          const sm = STATUS_META[statusKey(p)] ?? { label: statusKey(p), col: C.muted };
          const isVente = p.transaction === 'vente';
          const cur = p.currency === 'DZD' ? 'DA' : (p.currency || '€');
          const loc = [p.district, p.city].filter(Boolean).join(', ');
          return (
            <div key={p.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 12, padding: 12 }}>
                <div style={{ width: 66, height: 66, borderRadius: 13, flexShrink: 0, background: p.image_url ? `url(${p.image_url}) center/cover` : `linear-gradient(135deg, ${C.surface2}, #0e0e12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `1px solid ${C.border}` }}>
                  {!p.image_url && (TYPE_ICON[(p.type || '').toLowerCase()] ?? '🏠')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{propTitle(p)}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{loc || '—'}{p.rooms ? ` · ${p.rooms} pièces` : ''}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.goldSoft }}>{p.price != null ? `${Number(p.price).toLocaleString('fr-FR')} ${cur}` : '—'}<span style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>{isVente ? '' : '/mois'}</span></span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sm.col, background: `${sm.col}1f`, padding: '3px 9px', borderRadius: 20 }}>{sm.label}</span>
                  <span style={{ fontSize: 9.5, color: isVente ? C.blue : C.gold }}>{isVente ? 'Vente' : 'Location'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 1, borderTop: `1px solid ${C.border}` }}>
                <ActBtn label="Statut" onClick={() => void cycleStatus(p)} disabled={busy === p.id} />
                <ActBtn label="📷 État des lieux" onClick={() => setInspect(propTitle(p))} accent />
                <ActBtn label="Suppr." onClick={() => void del(p)} disabled={busy === p.id} danger />
              </div>
            </div>
          );
        })}
      </div>

      {/* Comment utiliser */}
      <div style={{ padding: '20px 18px 30px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Comment l'utiliser</div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '6px 14px' }}>
          {HOWTO.map((s, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, padding: '8px 0', borderBottom: i < HOWTO.length - 1 ? `1px solid ${C.border}` : 'none' }}>{s}</div>
          ))}
        </div>
      </div>

      {/* Modal ajouter */}
      {showAdd && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: C.surface, borderRadius: '22px 22px 0 0', border: `1px solid ${C.border}`, padding: '20px 18px 26px', maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Nouveau bien</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['location', 'vente'] as const).map(t => (
                <button key={t} onClick={() => setForm(s => ({ ...s, transaction: t }))} style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: `1px solid ${form.transaction === t ? C.gold : C.border}`, background: form.transaction === t ? `${C.gold}1c` : 'transparent', color: form.transaction === t ? C.goldSoft : C.muted, fontFamily: C.font, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t === 'location' ? 'À louer' : 'À vendre'}</button>
              ))}
            </div>
            <Field label="Titre"><input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} placeholder="Ex: F3 Hay Badr" style={inp} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Ville" flex><input value={form.city} onChange={e => setForm(s => ({ ...s, city: e.target.value }))} style={inp} /></Field>
              <Field label="Quartier" flex><input value={form.district} onChange={e => setForm(s => ({ ...s, district: e.target.value }))} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label={form.transaction === 'location' ? 'Loyer/mois' : 'Prix'} flex><input type="number" value={form.price} onChange={e => setForm(s => ({ ...s, price: e.target.value }))} style={inp} /></Field>
              <Field label="Devise"><select value={form.currency} onChange={e => setForm(s => ({ ...s, currency: e.target.value }))} style={{ ...inp, minWidth: 80 }}><option>DZD</option><option>EUR</option></select></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Type" flex><select value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))} style={inp}>{['appartement', 'villa', 'maison', 'studio', 'local', 'terrain', 'bureau'].map(o => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Surface (m²)" flex><input type="number" value={form.surface} onChange={e => setForm(s => ({ ...s, surface: e.target.value }))} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Pièces" flex><input type="number" value={form.rooms} onChange={e => setForm(s => ({ ...s, rooms: e.target.value }))} style={inp} /></Field>
              <Field label="Chambres" flex><input type="number" value={form.bedrooms} onChange={e => setForm(s => ({ ...s, bedrooms: e.target.value }))} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="SDB" flex><input type="number" value={form.bathrooms} onChange={e => setForm(s => ({ ...s, bathrooms: e.target.value }))} style={inp} /></Field>
              <Field label="Étage" flex><input type="number" value={form.floor} onChange={e => setForm(s => ({ ...s, floor: e.target.value }))} style={inp} /></Field>
            </div>

            {/* Adresse exacte (autocomplétion Google) → carte sur l'annonce */}
            <Field label="Adresse exacte (pour la carte)">
              <AddressInput value={form.address} onChange={v => setForm(s => ({ ...s, address: v }))} />
            </Field>

            <Field label="Description"><textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))} placeholder="Détails du bien…" rows={3} style={{ ...inp, resize: 'vertical' }} /></Field>

            {/* Photos */}
            <Field label={`Photos (${photos.length})`}>
              {photos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {photos.map((u, i) => (
                    <div key={i} style={{ position: 'relative', width: 56, height: 56, borderRadius: 9, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                      <img src={u} alt={`p${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {i === 0 && <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', color: C.goldSoft, fontSize: 7, textAlign: 'center' }}>Principale</span>}
                      <button onClick={() => setPhotos(p => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'rgba(255,51,102,0.85)', color: '#fff', fontSize: 10, lineHeight: '14px', cursor: 'pointer', padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { const arr = Array.from(e.target.files ?? []); e.target.value = ''; void addFiles(arr); }} />
              <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '10px 0', borderRadius: 11, border: `1px dashed ${C.gold}55`, background: `${C.gold}10`, color: C.goldSoft, fontFamily: C.font, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>🖼️ Ajouter des photos</button>
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => { setShow(false); setForm(EMPTY); setPhotos([]); }} style={{ flex: 1, padding: 13, borderRadius: 13, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 14, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => void add()} disabled={saving || !form.title.trim()} style={{ flex: 2, padding: 13, borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`, color: '#ffffff', fontFamily: C.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving || !form.title.trim() ? 0.5 : 1 }}>{saving ? 'Publication…' : 'Publier sur le site'}</button>
            </div>
          </div>
        </div>
      )}

      {inspect && <InspectionModal kind="property" subject={inspect} sessionId={sessionId} onClose={() => setInspect(null)} />}

      {toast && <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 40, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}

function ActBtn({ label, onClick, disabled, accent, danger }: { label: string; onClick: () => void; disabled?: boolean; accent?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ flex: 1, padding: '11px 0', border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer', fontFamily: C.font, fontSize: 12, fontWeight: 600, color: danger ? C.red : accent ? C.gold : C.muted, opacity: disabled ? 0.4 : 1 }}>{label}</button>
  );
}

function Field({ label, children, flex }: { label: string; children: ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 11, flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

const inp: CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none', boxSizing: 'border-box' };

function AddressInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [sugs, setSugs] = useState<Array<{ label: string; place_id: string }>>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onType = (v: string) => {
    onChange(v);
    if (tRef.current) clearTimeout(tRef.current);
    if (v.trim().length < 3) { setSugs([]); setOpen(false); return; }
    tRef.current = setTimeout(async () => {
      try { const r = await business.addressAutocomplete(v); setSugs(r.predictions ?? []); setOpen(true); }
      catch { setSugs([]); }
    }, 350);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => onType(e.target.value)} placeholder="Ex: Rue Larbi Ben M'hidi, Oran" style={inp} />
      {open && sugs.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          {sugs.map(s => (
            <button key={s.place_id} onClick={() => { onChange(s.label); setOpen(false); setSugs([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontFamily: C.font, fontSize: 12.5, cursor: 'pointer' }}>📍 {s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
