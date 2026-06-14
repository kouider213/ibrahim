import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL, ACCESS_TOKEN } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';

interface Demande {
  id: string;
  source: 'lead' | 'dossier' | 'import' | 'booking';
  ref?: string;
  title: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  status?: string;
  lang?: string;
  created_at?: string;
  meta?: string;
  admin_path: string;
  kind?: string;
}
interface Counts { total: number; lead: number; dossier: number; import: number; booking: number; }

// Parcours d'étapes — codes identiques au site (lib/importStatus.js + lib/dossierStatus.js)
type Stage = { key: string; fr: string };
const IMPORT_FLOW: Stage[] = [
  { key: 'REQUESTED', fr: 'Demande reçue' }, { key: 'SEARCHING', fr: 'Recherche en cours' },
  { key: 'FOUND', fr: 'Véhicule trouvé' }, { key: 'PURCHASED', fr: 'Acheté' },
  { key: 'SHIPPING', fr: 'En transport' }, { key: 'CUSTOMS', fr: 'Dédouanement' },
  { key: 'READY', fr: 'Prêt à récupérer' }, { key: 'DELIVERED', fr: 'Livré' },
];
const DOSSIER_FLOWS: Record<string, Stage[]> = {
  voiture: [
    { key: 'REQUESTED', fr: 'Demande reçue' }, { key: 'RESERVED', fr: 'Véhicule réservé' },
    { key: 'DOCUMENTS', fr: 'Dossier & documents' }, { key: 'PAYMENT', fr: 'Paiement' },
    { key: 'READY', fr: 'Prêt à récupérer' }, { key: 'DELIVERED', fr: 'Livré' },
  ],
  immo: [
    { key: 'REQUESTED', fr: 'Demande reçue' }, { key: 'VISIT', fr: 'Visite programmée' },
    { key: 'REVIEW', fr: 'Dossier en cours' }, { key: 'CONTRACT', fr: 'Contrat' },
    { key: 'FINALIZED', fr: 'Finalisé' },
  ],
  pack: [
    { key: 'REQUESTED', fr: 'Demande reçue' }, { key: 'CONFIRMED', fr: 'Pack confirmé' },
    { key: 'DEPOSIT', fr: 'Acompte versé' }, { key: 'PREPARED', fr: 'Séjour préparé' },
    { key: 'ONGOING', fr: 'Séjour en cours' }, { key: 'COMPLETED', fr: 'Terminé' },
  ],
};
const flowFor = (d: Demande): Stage[] =>
  d.source === 'import' ? IMPORT_FLOW : DOSSIER_FLOWS[d.kind || 'voiture'] || DOSSIER_FLOWS.voiture;
const stageLabel = (d: Demande, key?: string): string =>
  flowFor(d).find(s => s.key === key)?.fr || key || '—';
const nextStage = (d: Demande): Stage | null => {
  const flow = flowFor(d);
  const i = flow.findIndex(s => s.key === d.status);
  if (i < 0) return flow[0];                    // statut inconnu → 1ère étape
  return i < flow.length - 1 ? flow[i + 1] : null; // déjà à la dernière → rien
};

const SRC: Record<Demande['source'], { label: string; color: string; icon: string }> = {
  lead:    { label: 'Lead',        color: '#f59e0b', icon: '🔔' },
  dossier: { label: 'Dossier',     color: '#8b5cf6', icon: '📁' },
  import:  { label: 'Importation', color: '#06b6d4', icon: '🛳️' },
  booking: { label: 'Réservation', color: '#22c55e', icon: '🚗' },
};
const LANG_FLAG: Record<string, string> = { fr: '🇫🇷', ar: '🇩🇿', en: '🇬🇧' };
const SITE = 'https://fikconciergerie.com';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
const rawId = (id: string) => id.replace(/^(booking|dossier|import|lead)-/, '');

export default function DemandesScreen() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, lead: 0, dossier: 0, import: 0, booking: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Demande['source']>('all');
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // Formulaire de création (dossier / import)
  const [showNew, setShowNew] = useState(false);
  const emptyForm = { type: 'dossier', kind: 'voiture', client_name: '', client_phone: '', client_email: '', subject: '', vehicle: '', budget: '', currency: 'DZD', lang: 'fr' };
  const [form, setForm] = useState(emptyForm);
  const setF = (k: keyof typeof emptyForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submitNew = async () => {
    if (!form.client_name && !form.client_phone) { showToast('Nom ou téléphone requis'); return; }
    setBusy('new');
    try {
      const payload: Record<string, unknown> = {
        type: form.type, client_name: form.client_name, client_phone: form.client_phone,
        client_email: form.client_email, budget: form.budget, currency: form.currency, lang: form.lang,
      };
      if (form.type === 'dossier') { payload.kind = form.kind; payload.subject = form.subject; }
      else { const [vb, ...vm] = form.vehicle.trim().split(' '); payload.vehicle_brand = vb || null; payload.vehicle_model = vm.join(' ') || null; payload.country_origin = form.subject || null; }
      const out = await postJson<{ ref?: string }>('/api/demandes/create', payload);
      showToast(`Créé ✅ ${out.ref || ''}`);
      setShowNew(false); setForm(emptyForm);
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erreur création'); }
    finally { setBusy(''); }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ demandes: Demande[]; counts: Counts }>('/api/demandes');
      setDemandes(data.demandes || []);
      setCounts(data.counts || { total: 0, lead: 0, dossier: 0, import: 0, booking: 0 });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = filter === 'all' ? demandes : demandes.filter(d => d.source === filter);

  const waRelance = (d: Demande) => {
    const phone = (d.client_phone || '').replace(/\D/g, '');
    if (!phone) return;
    const lg = d.lang === 'ar' ? 'ar' : d.lang === 'en' ? 'en' : 'fr';
    const obj = d.title;
    const msg = lg === 'ar'
      ? `مرحباً ${d.client_name || ''}، معك Fik Conciergerie 👋 بخصوص: ${obj}. كيف يمكننا مساعدتك؟`
      : lg === 'en'
      ? `Hello ${d.client_name || ''}, this is Fik Conciergerie 👋 Regarding: ${obj}. How can we help?`
      : `Bonjour ${d.client_name || ''}, c'est Fik Conciergerie 👋 Concernant : ${obj}. Comment pouvons-nous vous aider ?`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const act = async (d: Demande, status: string, okMsg: string) => {
    setBusy(d.id);
    try {
      await postJson('/api/demandes/update', { source: d.source, id: rawId(d.id), status });
      showToast(okMsg);
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(''); }
  };

  const addPhoto = async (d: Demande, file: File) => {
    setBusy(d.id);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('lecture fichier'));
        r.readAsDataURL(file);
      });
      const out = await postJson<{ count: number }>('/api/demandes/photos', {
        source: d.source, id: rawId(d.id), base64, fileName: file.name, mimeType: file.type,
      });
      showToast(`Photo ajoutée 📷 (${out.count})`);
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erreur photo'); }
    finally { setBusy(''); }
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  const chip = (key: 'all' | Demande['source'], label: string, n: number) => (
    <button onClick={() => setFilter(key)} style={{
      padding: '6px 12px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap',
      fontSize: 11, fontWeight: 700, fontFamily: 'Inter',
      background: filter === key ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.04)',
      color: filter === key ? '#06210f' : 'rgba(255,255,255,0.55)',
      border: `1px solid ${filter === key ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.08)'}`,
    }}>{label} {n > 0 && <span style={{ opacity: 0.7 }}>· {n}</span>}</button>
  );

  return (
    <div style={{ width: '100%', height: '100%', background: '#0a0a0c', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.22em', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>Dzaryx · Demandes</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, background: 'linear-gradient(120deg, #fff, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Demandes du site</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{counts.total} demande{counts.total !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowNew(true)} style={{ background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#10b981' }}>＋ Nouveau</button>
          <button onClick={() => { void load(); }} style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'rgba(16,185,129,0.8)' }}>↺</button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 7, padding: '10px 12px 4px', overflowX: 'auto' }}>
        {chip('all', 'Tout', counts.total)}
        {chip('booking', '🚗 Résa', counts.booking)}
        {chip('lead', '🔔 Leads', counts.lead)}
        {chip('dossier', '📁 Dossiers', counts.dossier)}
        {chip('import', '🛳️ Import', counts.import)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <SkeletonCards count={5} height={120} />}
        {error && !loading && <div style={{ textAlign: 'center', color: '#ef4444', fontSize: 12, paddingTop: 40 }}>{error}</div>}
        {!loading && !error && shown.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Aucune demande</div>
          </div>
        )}

        {shown.map(d => {
          const s = SRC[d.source];
          return (
            <div key={d.id} style={{ background: 'rgba(7,17,31,0.8)', border: `1px solid ${s.color}22`, borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}40`, borderRadius: 7, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.icon} {s.label}</span>
                    {d.ref && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{d.ref}</span>}
                    {d.lang && <span style={{ fontSize: 11 }}>{LANG_FLAG[d.lang] || ''}</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 5 }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{d.client_name || 'Client'} · {d.client_phone || '—'}</div>
                  {d.meta && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{d.meta}</div>}
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 3 }}>{fmt(d.created_at)}{d.status ? ` · ${d.status}` : ''}</div>
                </div>
              </div>
              {/* Action rapide : accepter/refuser une réservation depuis l'app */}
              {d.source === 'booking' && d.status === 'PENDING' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={!!busy} onClick={() => act(d, 'ACCEPTED', 'Réservation acceptée ✅')} style={{ flex: 1, padding: '9px 6px', background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.5)', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#22c55e', fontFamily: 'Inter' }}>✅ ACCEPTER</button>
                  <button disabled={!!busy} onClick={() => act(d, 'REJECTED', 'Réservation refusée')} style={{ flex: 1, padding: '9px 6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.45)', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#ef4444', fontFamily: 'Inter' }}>❌ REFUSER</button>
                </div>
              )}
              {/* Avancement d'étape in-app : dossier (achat/immo/pack) + importation */}
              {(d.source === 'dossier' || d.source === 'import') && d.status !== 'CANCELLED' && (() => {
                const next = nextStage(d);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
                      Étape : <span style={{ color: s.color, fontWeight: 700 }}>{stageLabel(d, d.status)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {next ? (
                        <button disabled={!!busy} onClick={() => act(d, next.key, `Étape → ${next.fr} ✅`)} style={{ flex: 2, padding: '9px 6px', background: `${s.color}22`, border: `1px solid ${s.color}66`, borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: s.color, fontFamily: 'Inter' }}>→ {next.fr.toUpperCase()}</button>
                      ) : (
                        <div style={{ flex: 2, padding: '9px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'rgba(34,197,94,0.7)' }}>✓ Terminé</div>
                      )}
                      <button disabled={!!busy} onClick={() => act(d, 'CANCELLED', 'Demande annulée')} style={{ flex: 1, padding: '9px 6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#ef4444', fontFamily: 'Inter' }}>Annuler</button>
                    </div>
                    <label style={{ display: 'block', textAlign: 'center', padding: '8px 6px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.18)', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter' }}>
                      📷 Ajouter une photo
                      <input type="file" accept="image/*" disabled={!!busy} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void addPhoto(d, f); e.currentTarget.value = ''; }} />
                    </label>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', gap: 8 }}>
                {d.client_phone && (
                  <button onClick={() => waRelance(d)} style={{ flex: 1, padding: '8px 6px', background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.4)', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#25D366', fontFamily: 'Inter' }}>💬 WhatsApp</button>
                )}
                {d.source === 'lead' && d.status !== 'conclu' && (
                  <button disabled={!!busy} onClick={() => act(d, 'conclu', 'Lead marqué conclu ✅')} style={{ flex: 1, padding: '8px 6px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#22c55e', fontFamily: 'Inter' }}>✓ Conclu</button>
                )}
                <a href={`${SITE}${d.admin_path}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '8px 6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>⚙️ Gérer</a>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '88%', overflowY: 'auto', background: '#0e0e12', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid rgba(16,185,129,0.2)', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Nouvelle demande</div>

            {/* Type */}
            <div style={{ display: 'flex', gap: 7 }}>
              {(['dossier', 'import'] as const).map(t => (
                <button key={t} onClick={() => setF('type', t)} style={{ flex: 1, padding: '8px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Inter', background: form.type === t ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.04)', color: form.type === t ? '#06210f' : 'rgba(255,255,255,0.6)', border: `1px solid ${form.type === t ? 'rgba(16,185,129,0.9)' : 'rgba(255,255,255,0.1)'}` }}>{t === 'dossier' ? '📁 Dossier' : '🛳️ Import'}</button>
              ))}
            </div>

            {/* Kind (dossier seulement) */}
            {form.type === 'dossier' && (
              <div style={{ display: 'flex', gap: 7 }}>
                {([['voiture', '🚗 Achat'], ['immo', '🏠 Immo'], ['pack', '🎫 Pack']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setF('kind', k)} style={{ flex: 1, padding: '7px', borderRadius: 9, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, fontFamily: 'Inter', background: form.kind === k ? 'rgba(139,92,246,0.8)' : 'rgba(255,255,255,0.04)', color: form.kind === k ? '#fff' : 'rgba(255,255,255,0.6)', border: `1px solid ${form.kind === k ? 'rgba(139,92,246,0.8)' : 'rgba(255,255,255,0.1)'}` }}>{lbl}</button>
                ))}
              </div>
            )}

            {(() => {
              const inp = { width: '100%', boxSizing: 'border-box' as const, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 13px', color: '#fff', fontFamily: 'Inter', fontSize: 14, outline: 'none' };
              return (
                <>
                  <input value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="Nom du client" style={inp} />
                  <input value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} placeholder="Téléphone (WhatsApp)" style={inp} />
                  <input value={form.client_email} onChange={e => setF('client_email', e.target.value)} placeholder="Email (optionnel)" style={inp} />
                  {form.type === 'dossier'
                    ? <input value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Objet (ex: Clio 2020, Appart 3 pièces…)" style={inp} />
                    : <>
                        <input value={form.vehicle} onChange={e => setF('vehicle', e.target.value)} placeholder="Véhicule (marque modèle année)" style={inp} />
                        <input value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Pays d'origine (ex: France)" style={inp} />
                      </>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={form.budget} onChange={e => setF('budget', e.target.value)} placeholder="Budget" inputMode="numeric" style={{ ...inp, flex: 2 }} />
                    <select value={form.currency} onChange={e => setF('currency', e.target.value)} style={{ ...inp, flex: 1 }}>
                      <option value="DZD">DZD</option><option value="EUR">EUR</option><option value="USD">USD</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {(['fr', 'ar', 'en'] as const).map(l => (
                      <button key={l} onClick={() => setF('lang', l)} style={{ flex: 1, padding: '7px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: form.lang === l ? 'rgba(96,165,250,0.8)' : 'rgba(255,255,255,0.04)', color: form.lang === l ? '#06210f' : 'rgba(255,255,255,0.6)', border: `1px solid ${form.lang === l ? 'rgba(96,165,250,0.8)' : 'rgba(255,255,255,0.1)'}` }}>{LANG_FLAG[l]}</button>
                    ))}
                  </div>
                </>
              );
            })()}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter' }}>Annuler</button>
              <button disabled={busy === 'new'} onClick={() => void submitNew()} style={{ flex: 2, padding: '12px', background: 'rgba(16,185,129,0.9)', border: 'none', borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#06210f', fontFamily: 'Inter' }}>{busy === 'new' ? 'Création…' : 'Créer la demande'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#10b981', zIndex: 20, backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>{toast}</div>
      )}
    </div>
  );
}
