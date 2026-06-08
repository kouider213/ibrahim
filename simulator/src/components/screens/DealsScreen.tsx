import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { business, type SaleVehicle, type SiteProperty } from '../../services/api.ts';

const C = {
  bg: '#0b0b0d', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.07)',
  gold: '#e9b949', goldSoft: '#f3d488', text: '#f5f5f7', muted: '#9b9ba6',
  green: '#34d399', blue: '#60a5fa', red: '#fb7185', violet: '#a78bfa',
  font: '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

type Tab = 'voitures' | 'immo' | 'opportunites';

const VSTATUS: Record<string, { label: string; col: string }> = {
  disponible: { label: 'À vendre', col: C.green },
  reserve:    { label: 'Réservée', col: C.gold },
  'réservé':  { label: 'Réservée', col: C.gold },
  vendu:      { label: 'Vendue',   col: C.blue },
  'vendue':   { label: 'Vendue',   col: C.blue },
};

const CAPS = [
  { icon: '💰', title: 'Estimer un prix de revente', desc: 'Dzaryx propose un prix selon l\'année, le km et le marché Oran.', ex: '"estime la revente d\'un Golf 7 2018 90000 km"' },
  { icon: '✍️', title: 'Créer une annonce de vente', desc: 'Décris le bien/voiture → annonce créée sur le site avec photos.', ex: '"ajoute une Clio 4 2017 à vendre 180 DA"' },
  { icon: '📈', title: 'Suivre la marge', desc: 'Prix d\'achat vs prix de revente → marge calculée.', ex: '"quelle marge sur la Sandero ?"' },
  { icon: '🏷️', title: 'Marquer vendu / réservé', desc: 'Statut synchronisé avec le site instantanément.', ex: '"marque le Duster comme vendu"' },
  { icon: '🔍', title: 'Repérer des opportunités', desc: 'Donne un budget → Dzaryx propose quoi acheter pour revendre.', ex: '"trouve une voiture à acheter sous 2000€ à revendre"' },
];

interface VForm { brand: string; model: string; year: string; price: string; currency: string; mileage: string }
const EMPTY_V: VForm = { brand: '', model: '', year: '', price: '', currency: 'DZD', mileage: '' };

export default function DealsScreen() {
  const [tab, setTab] = useState<Tab>('voitures');
  const [vehicles, setVehicles] = useState<SaleVehicle[]>([]);
  const [props, setProps] = useState<SiteProperty[]>([]);
  const [loading, setLoad] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShow] = useState(false);
  const [form, setForm] = useState<VForm>(EMPTY_V);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = async () => {
    setLoad(true);
    try {
      const [v, p] = await Promise.all([
        business.fetchVehiclesForSale().catch(() => ({ vehicles: [] as SaleVehicle[] })),
        business.fetchProperties().catch(() => ({ properties: [] as SiteProperty[] })),
      ]);
      setVehicles(v.vehicles ?? []);
      setProps((p.properties ?? []).filter(x => x.transaction === 'vente'));
    } finally { setLoad(false); }
  };
  useEffect(() => { void load(); }, []);

  const addVehicle = async () => {
    if (!form.brand.trim() || !form.model.trim() || !form.price) { flash('❌ Marque + modèle + prix'); return; }
    setSaving(true);
    try {
      await business.addVehicleForSale({
        brand: form.brand.trim(), model: form.model.trim(),
        year: form.year ? Number(form.year) : null, price: Number(form.price),
        currency: form.currency, mileage: form.mileage ? Number(form.mileage) : null, status: 'disponible',
      });
      flash('✅ Annonce créée'); setShow(false); setForm(EMPTY_V); void load();
    } catch { flash('❌ Échec'); } finally { setSaving(false); }
  };

  const cycleVehicle = async (v: SaleVehicle) => {
    const order = ['disponible', 'reserve', 'vendu'];
    const next = order[(order.indexOf((v.status || 'disponible').toLowerCase()) + 1) % order.length];
    setBusy(v.id);
    try { await business.updateVehicleSale(v.id, { status: next }); setVehicles(xs => xs.map(x => x.id === v.id ? { ...x, status: next } : x)); }
    catch { flash('❌ Échec'); } finally { setBusy(null); }
  };

  const cycleProp = async (p: SiteProperty) => {
    const order = ['disponible', 'vendu', 'coming_soon'];
    const next = order[(order.indexOf((p.status || 'disponible').toLowerCase()) + 1) % order.length];
    setBusy(p.id);
    try { await business.updateProperty(p.id, { status: next }); setProps(xs => xs.map(x => x.id === p.id ? { ...x, status: next } : x)); }
    catch { flash('❌ Échec'); } finally { setBusy(null); }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      {/* Hero */}
      <div style={{ position: 'relative', padding: '22px 18px 16px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, background: `radial-gradient(circle, ${C.violet}22, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.gold, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Dzaryx · Trading</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, background: `linear-gradient(120deg, #fff, ${C.goldSoft})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Achat & Revente</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          Voitures & biens · synchro fikconciergerie.com
        </div>
      </div>

      {/* Segments */}
      <div style={{ display: 'flex', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, margin: '0 18px 14px' }}>
        {([['voitures', 'Voitures'], ['immo', 'Immo'], ['opportunites', 'Opportunités']] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: C.font, fontSize: 11.5, fontWeight: 600, background: tab === id ? C.gold : 'transparent', color: tab === id ? '#1a1300' : C.muted }}>{lbl}</button>
        ))}
      </div>

      {/* VOITURES */}
      {tab === 'voitures' && (
        <div style={{ padding: '0 18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => setShow(true)} style={addBtn}>+ Ajouter une voiture à vendre</button>
          {loading ? <Empty t="Chargement…" /> : vehicles.length === 0 ? <Empty t="Aucune voiture à vendre" /> : vehicles.map(v => {
            const sm = VSTATUS[(v.status || 'disponible').toLowerCase()] ?? { label: v.status || '', col: C.muted };
            const cur = v.currency === 'DZD' ? 'DA' : (v.currency || '€');
            return (
              <div key={v.id} style={card}>
                <div style={{ display: 'flex', gap: 12, padding: 12 }}>
                  <div style={{ width: 66, height: 66, borderRadius: 13, flexShrink: 0, background: v.image_url ? `url(${v.image_url}) center/cover` : `linear-gradient(135deg, ${C.surface2}, #0e0e12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `1px solid ${C.border}` }}>{!v.image_url && '🚗'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{v.brand} {v.model}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{[v.year, v.mileage ? `${Number(v.mileage).toLocaleString('fr-FR')} km` : null].filter(Boolean).join(' · ') || '—'}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.goldSoft, marginTop: 7 }}>{v.price != null ? `${Number(v.price).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sm.col, background: `${sm.col}1f`, padding: '3px 9px', borderRadius: 20, height: 'fit-content' }}>{sm.label}</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => void cycleVehicle(v)} disabled={busy === v.id} style={rowBtn}>Changer le statut →</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* IMMO À VENDRE */}
      {tab === 'immo' && (
        <div style={{ padding: '0 18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? <Empty t="Chargement…" /> : props.length === 0 ? <Empty t="Aucun bien à vendre (ajoute-le dans IMMO)" /> : props.map(p => {
            const sm = VSTATUS[(p.status || 'disponible').toLowerCase()] ?? { label: (p.status || 'disponible'), col: C.green };
            const cur = p.currency === 'DZD' ? 'DA' : (p.currency || '€');
            return (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', gap: 12, padding: 12 }}>
                  <div style={{ width: 66, height: 66, borderRadius: 13, flexShrink: 0, background: p.image_url ? `url(${p.image_url}) center/cover` : `linear-gradient(135deg, ${C.surface2}, #0e0e12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: `1px solid ${C.border}` }}>{!p.image_url && '🏠'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || p.name}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{[p.district, p.city].filter(Boolean).join(', ') || '—'}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.goldSoft, marginTop: 7 }}>{p.price != null ? `${Number(p.price).toLocaleString('fr-FR')} ${cur}` : '—'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sm.col, background: `${sm.col}1f`, padding: '3px 9px', borderRadius: 20, height: 'fit-content' }}>{(p.status || 'disponible') === 'vendu' ? 'Vendu' : 'À vendre'}</span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  <button onClick={() => void cycleProp(p)} disabled={busy === p.id} style={rowBtn}>Changer le statut →</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* OPPORTUNITÉS */}
      {tab === 'opportunites' && (
        <div style={{ padding: '0 18px 20px' }}>
          <div style={{ background: `linear-gradient(135deg, ${C.violet}1c, ${C.surface})`, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>🔍 Repérage d'opportunités</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>Demande à Dzaryx d'analyser une affaire avant d'acheter pour revendre. Donne-lui le prix, l'année, le kilométrage ou l'adresse.</div>
          </div>
          {[
            { q: '"Cette Clio 4 2016 à 1500€, je peux la revendre combien à Oran ?"', a: 'Estimation revente + marge nette' },
            { q: '"Trouve-moi un appart à acheter sous 2M DA à revendre avec marge"', a: 'Analyse marché + suggestions' },
            { q: '"Compare ce Duster d\'occasion avec les prix actuels"', a: 'Bon plan ou pas' },
          ].map((o, i) => (
            <div key={i} style={{ ...card, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>{o.q}</div>
              <div style={{ fontSize: 12, color: C.goldSoft, marginTop: 6 }}>→ {o.a}</div>
            </div>
          ))}
        </div>
      )}

      {/* Capacités */}
      <div style={{ padding: '6px 18px 30px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Ce que Dzaryx fait pour l'achat/revente</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Parle-lui dans le chat ou en vocal.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CAPS.map(c => (
            <div key={c.title} style={{ ...card, padding: 14, display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: `${C.gold}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{c.desc}</div>
                <div style={{ fontSize: 12, color: C.goldSoft, marginTop: 6, fontStyle: 'italic' }}>{c.ex}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal ajouter voiture */}
      {showAdd && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: C.surface, borderRadius: '22px 22px 0 0', border: `1px solid ${C.border}`, padding: '20px 18px 26px' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Voiture à vendre</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Marque" flex><input value={form.brand} onChange={e => setForm(s => ({ ...s, brand: e.target.value }))} placeholder="Renault" style={inp} /></Field>
              <Field label="Modèle" flex><input value={form.model} onChange={e => setForm(s => ({ ...s, model: e.target.value }))} placeholder="Clio 4" style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Année" flex><input type="number" value={form.year} onChange={e => setForm(s => ({ ...s, year: e.target.value }))} style={inp} /></Field>
              <Field label="Km" flex><input type="number" value={form.mileage} onChange={e => setForm(s => ({ ...s, mileage: e.target.value }))} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Prix" flex><input type="number" value={form.price} onChange={e => setForm(s => ({ ...s, price: e.target.value }))} style={inp} /></Field>
              <Field label="Devise"><select value={form.currency} onChange={e => setForm(s => ({ ...s, currency: e.target.value }))} style={{ ...inp, minWidth: 80 }}><option>DZD</option><option>EUR</option></select></Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={() => { setShow(false); setForm(EMPTY_V); }} style={{ flex: 1, padding: 13, borderRadius: 13, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 14, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => void addVehicle()} disabled={saving} style={{ flex: 2, padding: 13, borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`, color: '#1a1300', fontFamily: C.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>{saving ? 'Ajout…' : 'Créer l\'annonce'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 40, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>{t}</div>;
}
function Field({ label, children, flex }: { label: string; children: ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 11, flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

const card: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' };
const addBtn: CSSProperties = { width: '100%', padding: '13px 0', borderRadius: 14, border: `1px dashed ${C.gold}66`, background: `${C.gold}10`, color: C.goldSoft, fontFamily: C.font, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const rowBtn: CSSProperties = { width: '100%', padding: '11px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: C.font, fontSize: 12.5, fontWeight: 600, color: C.gold };
const inp: CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none', boxSizing: 'border-box' };
