import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../services/api.ts';

// Statuts unifiés app + site. `disponible` = visible sur fikconciergerie.com.
type PropStatus      = 'disponible' | 'loué' | 'vendu' | 'en_travaux';
type PropType        = 'appartement' | 'villa' | 'commercial' | 'terrain' | 'bureau';
type PropTransaction = 'location' | 'vente';

interface Property {
  id: string;
  title?: string | null;
  name?: string | null;          // legacy = mirror de title
  type: PropType;
  transaction?: PropTransaction | null;
  status: PropStatus;
  price?: number | null;
  monthly_rent?: number | null;  // legacy/interne (miroir de price en location)
  city?: string | null;
  district?: string | null;
  tenant_name?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
}

const STATUS_COL: Record<PropStatus, string> = {
  'disponible': '#0a9a5e',
  'loué':       '#b86e00',
  'vendu':      '#2f5bff',
  'en_travaux': '#c2570c',
};

const TYPE_ICON: Record<PropType, string> = {
  appartement: '🏠',
  villa:       '🏡',
  commercial:  '🏪',
  terrain:     '🌿',
  bureau:      '🏢',
};

const STATUSES: PropStatus[] = ['disponible', 'loué', 'vendu', 'en_travaux'];
const TYPES: PropType[]      = ['appartement', 'villa', 'commercial', 'terrain', 'bureau'];

const propTitle = (p: Property) => p.title || p.name || 'Sans titre';
const propPrice = (p: Property) => (p.price ?? p.monthly_rent ?? null);

interface AddForm {
  title: string; transaction: PropTransaction; type: PropType; status: PropStatus;
  price: string; city: string; district: string; tenant_name: string; notes: string;
}
const EMPTY_FORM: AddForm = {
  title: '', transaction: 'location', type: 'appartement', status: 'disponible',
  price: '', city: 'Oran', district: '', tenant_name: '', notes: '',
};

export default function ImmoScreen() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading]        = useState(true);
  const [showAdd, setShowAdd]        = useState(false);
  const [form, setForm]              = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving]          = useState(false);
  const [toast, setToast]            = useState<string | null>(null);
  const [selected, setSelected]      = useState<string | null>(null);
  const [photoBusy, setPhotoBusy]    = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const addPropPhotos = async (id: string, files: FileList) => {
    setPhotoBusy(id);
    try {
      const photos = await Promise.all(Array.from(files).slice(0, 10).map(f => new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error('read'));
        r.readAsDataURL(f);
      })));
      const out = await apiFetch<{ count: number }>(`/api/immo/properties/${id}/photos`, { method: 'POST', body: JSON.stringify({ photos }) });
      showToast(`✅ ${out.count} photo(s) — visible sur le site`);
      await load();
    } catch { showToast('❌ Échec photos'); }
    finally { setPhotoBusy(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ properties: Property[] }>('/api/immo/properties');
      setProperties(res.properties ?? []);
    } catch { setProperties([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = {
    total:   properties.length,
    dispo:   properties.filter(p => p.status === 'disponible').length,
    loued:   properties.filter(p => p.status === 'loué').length,
    revenu:  properties.filter(p => p.status === 'loué').reduce((s, p) => s + (propPrice(p) ?? 0), 0),
  };

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/immo/properties', {
        method: 'POST',
        body: JSON.stringify({
          title:       form.title.trim(),
          transaction: form.transaction,
          type:        form.type,
          status:      form.status,
          price:       form.price ? Number(form.price) : null,
          city:        form.city.trim() || 'Oran',
          district:    form.district.trim() || null,
          tenant_name: form.tenant_name.trim() || null,
          notes:       form.notes.trim() || null,
        }),
      });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      showToast('✅ Bien ajouté (app + site)');
      await load();
    } catch { showToast('❌ Erreur ajout'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (p: Property) => {
    // disponible ↔ loué (les autres statuts ne togglent pas)
    const next: PropStatus = p.status === 'loué' ? 'disponible' : p.status === 'disponible' ? 'loué' : p.status;
    try {
      await apiFetch(`/api/immo/properties/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, tenant_name: next === 'disponible' ? null : p.tenant_name }),
      });
      setProperties(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
    } catch { showToast('❌ Erreur'); }
  };

  const deleteProp = async (id: string) => {
    try {
      await apiFetch(`/api/immo/properties/${id}`, { method: 'DELETE' });
      setProperties(prev => prev.filter(x => x.id !== id));
      setSelected(null);
      showToast('🗑 Supprimé');
    } catch { showToast('❌ Erreur suppression'); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--dz-bg)', color: 'var(--dz-text)', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #2f5bff22', flexShrink: 0, background: 'rgba(var(--dz-surface-rgb),0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontFamily: 'Manrope, Inter, sans-serif', fontSize: 13.5, color: '#2f5bff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #2f5bff26' }}>
            IMMOBILIER
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => void load()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2f5bff55' }}>↻</button>
            <button
              onClick={() => setShowAdd(true)}
              style={{ background: 'rgba(47,91,255,0.12)', border: '1px solid #2f5bff44', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 12, color: '#2f5bff', letterSpacing: '0.1em' }}
            >
              + AJOUTER
            </button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#2f5bff55', letterSpacing: '0.15em' }}>DOUBA GROUPE · ORAN</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {[
            { label: 'TOTAL', val: stats.total,               col: '#2f5bff' },
            { label: 'DISPO', val: stats.dispo,               col: '#0a9a5e' },
            { label: 'LOUÉS', val: stats.loued,               col: '#b86e00' },
            { label: 'REVENU', val: `${Math.round(stats.revenu / 1000)}k`, col: '#2f5bff' },
          ].map(s => (
            <div key={s.label} style={{ background: `color-mix(in srgb, ${s.col} 4%, transparent)`, border: `1px solid color-mix(in srgb, ${s.col} 13%, transparent)`, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Manrope, Inter, sans-serif', fontSize: 13, color: s.col }}>{s.val}</div>
              <div style={{ fontSize: 11, color: `color-mix(in srgb, ${s.col} 40%, transparent)`, letterSpacing: '0.1em', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Property list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 12.5, color: '#2f5bff33', fontFamily: 'Manrope, Inter, sans-serif', letterSpacing: '0.2em' }}>CHARGEMENT…</div>
        ) : properties.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, fontSize: 12.5, color: 'var(--dz-faint)' }}>
            Aucun bien immobilier.<br />Appuie sur + AJOUTER
          </div>
        ) : (
          properties.map(p => {
            const sc = STATUS_COL[p.status] ?? 'rgba(var(--dz-ink-rgb),0.16)';
            const isSel = p.id === selected;
            const prix = propPrice(p);
            const loc  = [p.district, p.city].filter(Boolean).join(', ') || p.address;
            const isVente = p.transaction === 'vente';
            return (
              <div
                key={p.id}
                onClick={() => setSelected(isSel ? null : p.id)}
                style={{
                  background: isSel ? 'rgba(47,91,255,0.06)' : 'rgba(var(--dz-ink-rgb),0.015)',
                  border: `1px solid ${isSel ? '#2f5bff44' : 'rgba(var(--dz-ink-rgb),0.03)'}`,
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{TYPE_ICON[p.type] ?? '🏠'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--dz-text)', fontWeight: 600 }}>{propTitle(p)}</div>
                    {loc && <div style={{ fontSize: 12, color: 'var(--dz-muted)', marginTop: 1 }}>{loc}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{
                      fontSize: 11.5, color: sc, fontFamily: 'Manrope, Inter, sans-serif', letterSpacing: '0.1em',
                      background: `color-mix(in srgb, ${sc} 9%, transparent)`, padding: '2px 6px', borderRadius: 4,
                    }}>
                      {p.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: isVente ? '#2f5bff99' : '#2f5bff99', fontFamily: 'Manrope, Inter, sans-serif', letterSpacing: '0.1em' }}>
                      {isVente ? 'À VENDRE' : 'À LOUER'}
                    </span>
                  </div>
                </div>
                {(prix || p.tenant_name) && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--dz-muted)' }}>
                    {prix != null && <span style={{ color: '#0a9a5eaa' }}>{prix.toLocaleString('fr-DZ')} DA{isVente ? '' : '/mois'}</span>}
                    {p.tenant_name  && <span>{p.tenant_name}</span>}
                  </div>
                )}

                {/* Expanded actions */}
                {isSel && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(p.status === 'loué' || p.status === 'disponible') && (
                      <button
                        onClick={e => { e.stopPropagation(); void toggleStatus(p); }}
                        style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 11.5, letterSpacing: '0.1em', background: `color-mix(in srgb, ${sc} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${sc} 27%, transparent)`, color: sc }}
                      >
                        {p.status === 'loué' ? '→ DISPONIBLE' : '→ LOUÉ'}
                      </button>
                    )}
                    <label
                      onClick={e => e.stopPropagation()}
                      style={{ padding: '4px 10px', borderRadius: 6, cursor: photoBusy === p.id ? 'wait' : 'pointer', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 11.5, letterSpacing: '0.1em', background: 'rgba(47,91,255,0.1)', border: '1px solid #2f5bff44', color: '#2f5bff' }}
                    >
                      {photoBusy === p.id ? '…' : '+ PHOTOS'}
                      <input type="file" accept="image/*" multiple disabled={photoBusy === p.id} style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) void addPropPhotos(p.id, e.target.files); e.currentTarget.value = ''; }} />
                    </label>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm(`Supprimer ${propTitle(p)} ?`)) void deleteProp(p.id); }}
                      style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 11.5, letterSpacing: '0.1em', background: 'rgba(224,48,79,0.1)', border: '1px solid #e0304f44', color: '#e0304f' }}
                    >
                      SUPPRIMER
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: 'var(--dz-surface)', borderRadius: '16px 16px 0 0', padding: '16px 14px 24px', border: '1px solid #2f5bff22' }}>
            <div style={{ fontFamily: 'Manrope, Inter, sans-serif', fontSize: 13.5, color: '#2f5bff', letterSpacing: '0.2em', marginBottom: 14 }}>NOUVEAU BIEN</div>
            {[
              { label: 'TITRE *', key: 'title' as const,            type: 'text' },
              { label: 'PRIX (DA)', key: 'price' as const,          type: 'number' },
              { label: 'VILLE', key: 'city' as const,               type: 'text' },
              { label: 'QUARTIER', key: 'district' as const,        type: 'text' },
              { label: 'LOCATAIRE (si loué)', key: 'tenant_name' as const, type: 'text' },
              { label: 'NOTES', key: 'notes' as const,              type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: '#2f5bff88', letterSpacing: '0.15em', marginBottom: 3 }}>{f.label}</div>
                <input
                  type={f.type}
                  value={form[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(47,91,255,0.06)', border: '1px solid #2f5bff33', borderRadius: 6, padding: '6px 10px', color: 'var(--dz-text)', fontFamily: 'Share Tech Mono', fontSize: 13.5, boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: '#2f5bff88', letterSpacing: '0.15em', marginBottom: 3 }}>OPÉRATION</div>
                <select value={form.transaction} onChange={e => setForm(p => ({ ...p, transaction: e.target.value as PropTransaction }))}
                  style={{ width: '100%', background: 'var(--dz-surface)', border: '1px solid #2f5bff33', borderRadius: 6, padding: '6px 8px', color: 'var(--dz-text)', fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                  <option value="location">à louer</option>
                  <option value="vente">à vendre</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: '#2f5bff88', letterSpacing: '0.15em', marginBottom: 3 }}>TYPE</div>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as PropType }))}
                  style={{ width: '100%', background: 'var(--dz-surface)', border: '1px solid #2f5bff33', borderRadius: 6, padding: '6px 8px', color: 'var(--dz-text)', fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: '#2f5bff88', letterSpacing: '0.15em', marginBottom: 3 }}>STATUT</div>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as PropStatus }))}
                  style={{ width: '100%', background: 'var(--dz-surface)', border: '1px solid #2f5bff33', borderRadius: 6, padding: '6px 8px', color: 'var(--dz-text)', fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
                style={{ flex: 1, padding: 10, borderRadius: 8, background: 'transparent', border: '1px solid rgba(var(--dz-ink-rgb),0.13)', cursor: 'pointer', color: 'var(--dz-muted)', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 12.5 }}>
                ANNULER
              </button>
              <button onClick={() => void handleAdd()} disabled={saving || !form.title.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 8, background: saving ? '#2f5bff22' : 'rgba(47,91,255,0.18)', border: '1px solid #2f5bff66', cursor: saving ? 'default' : 'pointer', color: '#2f5bff', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 12.5 }}>
                {saving ? 'AJOUT…' : 'CONFIRMER'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(var(--dz-surface-rgb),0.96)', border: '1px solid #2f5bff44', borderRadius: 8, padding: '8px 18px', fontFamily: 'Manrope, Inter, sans-serif', fontSize: 12.5, color: '#2f5bff', letterSpacing: '0.15em', zIndex: 20, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
