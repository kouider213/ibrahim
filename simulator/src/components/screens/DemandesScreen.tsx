import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL, getToken } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, Screen, PageHeader, HeadBtn, Chips, Segmented, Card, Badge, Avatar, Btn, btnStyle, Empty, Sheet, Field, inputStyle } from '../ui/Kit.tsx';
import { Ico } from '../ui/Icon.tsx';

interface Demande {
  id: string;
  source: 'lead' | 'dossier' | 'import' | 'booking' | 'whatsapp' | 'tiktok';
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
  fields?: { text?: string; chat?: string; first_at?: string; video?: string };
}
interface Counts { total: number; lead: number; dossier: number; import: number; booking: number; whatsapp?: number; }

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
// 16/11 : les leads « perdu »/« conclu » et dossiers terminés étaient comptés « en cours » → rangés à part.
const CLOSED = new Set(['perdu', 'conclu', 'lost', 'won', 'refuse', 'refusé', 'CANCELLED', 'DELIVERED', 'FINALIZED', 'COMPLETED', 'REJECTED', 'DECLINED']);
const isClosed = (d: Demande) => !!d.status && CLOSED.has(d.status);
const ageDays = (d: Demande) => d.created_at ? Math.floor((Date.now() - Date.parse(d.created_at)) / 86_400_000) : 0;
const isStale = (d: Demande) => !isClosed(d) && ageDays(d) >= 2;
/** Numéro international pour wa.me (même règle que le serveur) : 00… → …, 04… belge, 05/06/07 Oran. */
function intlPhone(raw?: string): string | null {
  let p = String(raw ?? '').replace(/\D/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = p.slice(2);
  else if (/^04\d{8}$/.test(p)) p = '32' + p.slice(1);
  else if (/^0[567]\d{8}$/.test(p)) p = '213' + p.slice(1);
  else if (p.startsWith('0')) return null;
  return p.length >= 9 ? p : null;
}
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
  lead:    { label: 'Lead',        color: '#b86e00', icon: '🔔' },
  dossier: { label: 'Dossier',     color: '#2f5bff', icon: '📁' },
  import:  { label: 'Importation', color: '#2f5bff', icon: '🛳️' },
  booking: { label: 'Réservation', color: '#0a9a5e', icon: '🚗' },
  whatsapp: { label: 'WhatsApp', color: '#1fa855', icon: '💬' },
  tiktok:   { label: 'TikTok',   color: '#e8265e', icon: '🎵' },
};
const LANG_FLAG: Record<string, string> = { fr: '🇫🇷', ar: '🇩🇿', en: '🇬🇧' };
const SITE = 'https://fikconciergerie.com';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}
const rawId = (id: string) => id.replace(/^(booking|dossier|import|lead|whatsapp|tiktok)-/, '');

export default function DemandesScreen() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | Demande['source']>('all');
  const [busy, setBusy] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [toast, setToast] = useState('');
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // Formulaire de création (dossier / import)
  const [showNew, setShowNew] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
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
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = demandes.filter(d => !isClosed(d));
  const closedN = demandes.length - open.length;
  const pool = showClosed ? demandes.filter(isClosed) : open;
  const shown = filter === 'all' ? pool : pool.filter(d => d.source === filter);
  const cnt = (src?: Demande['source']) => pool.filter(d => !src || d.source === src).length;

  const waRelance = (d: Demande) => {
    const phone = intlPhone(d.client_phone);
    if (!phone) { showToast('Numéro sans indicatif pays : corrige-le sur le site'); return; }
    // Demande arrivée par WhatsApp : on ouvre simplement la discussion (le client a déjà écrit)
    if (d.source === 'whatsapp' && !isStale(d)) { window.open(`https://wa.me/${phone}`, '_blank'); return; }
    const lg = d.lang === 'ar' ? 'ar' : d.lang === 'en' ? 'en' : 'fr';
    const obj = d.source === 'whatsapp' ? (lg === 'ar' ? 'كراء السيارة' : lg === 'en' ? 'your car rental' : 'votre location de voiture') : d.title;
    const name = (d.client_name || '').trim().split(/\s+/)[0] ?? '';
    // 16/11 : demande ouverte depuis plus de 48 h → vraie relance (le client est en Europe, il prépare sa venue à Oran)
    const late = isStale(d);
    const msg = late
      ? (lg === 'ar'
        ? `السلام عليكم ${name}، معك قويدر من FIK Conciergerie 👋 رجعتلك على طلبك : ${obj}. مازال يهمك ؟ قولي وقتاش راك هابط لوهران ونحضرلك كلش.`
        : lg === 'en'
        ? `Hello ${name}, Kouider from FIK Conciergerie 👋 Following up on your request: ${obj}. Are you still interested? Tell me when you're coming to Oran and I'll get everything ready.`
        : `Bonjour ${name}, c'est Kouider de FIK Conciergerie 👋 Je reviens vers vous pour votre demande : ${obj}. Est-ce toujours d'actualité ? Dites-moi quand vous descendez à Oran et je vous prépare tout.`)
      : (lg === 'ar'
        ? `مرحباً ${d.client_name || ''}، معك Fik Conciergerie 👋 بخصوص: ${obj}. كيف يمكننا مساعدتك؟`
        : lg === 'en'
        ? `Hello ${d.client_name || ''}, this is Fik Conciergerie 👋 Regarding: ${obj}. How can we help?`
        : `Bonjour ${d.client_name || ''}, c'est Fik Conciergerie 👋 Concernant : ${obj}. Comment pouvons-nous vous aider ?`);
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

  // Suppression depuis l'app — 2 taps (window.confirm bloqué en WebView).
  const del = async (d: Demande) => {
    if (confirmDel !== d.id) { setConfirmDel(d.id); setTimeout(() => setConfirmDel(c => c === d.id ? '' : c), 3000); return; }
    setConfirmDel(''); setBusy(d.id);
    try {
      await postJson('/api/demandes/delete', { source: d.source, id: rawId(d.id) });
      showToast('Supprimé 🗑️');
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erreur suppression'); }
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

  const ago = (iso?: string) => {
    if (!iso) return '';
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : m < 2880 ? 'hier' : fmt(iso);
  };

  return (
    <Screen toast={toast} header={<>
      <PageHeader eyebrow="Site, WhatsApp, TikTok & dossiers" title="Demandes"
        subtitle={loading ? 'Chargement…' : `${open.length} demande${open.length !== 1 ? 's' : ''} en cours${closedN ? ` · ${closedN} terminée${closedN > 1 ? 's' : ''}` : ''}`}
        right={<div style={{ display: 'flex', gap: 8 }}>
          <HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} busy={loading} />
          <HeadBtn icon="＋" label="Nouveau" onClick={() => setShowNew(true)} />
        </div>} />
      <div style={{ padding: '0 16px 10px' }}>
        <Chips<'all' | Demande['source']> value={filter} onChange={setFilter} items={[
          { id: 'all', label: 'Tout', count: cnt() },
          { id: 'booking', label: '🚗 Réservations', count: cnt('booking') },
          { id: 'whatsapp', label: '💬 WhatsApp', count: cnt('whatsapp') },
          { id: 'tiktok', label: '🎵 TikTok', count: cnt('tiktok') },
          { id: 'lead', label: '🔔 Leads', count: cnt('lead') },
          { id: 'dossier', label: '📁 Dossiers', count: cnt('dossier') },
          { id: 'import', label: '🛳️ Imports', count: cnt('import') },
        ]} />
      </div>
    </>}>
      {loading && !demandes.length && <SkeletonCards count={4} height={150} />}
      {error && !loading && <Empty icon="📡" title="Impossible de charger" text={error} action={<Btn onClick={() => void load()}>Réessayer</Btn>} />}
      {!loading && !error && shown.length === 0 && <Empty icon="📭" title={showClosed ? 'Rien de terminé ici' : 'Aucune demande en cours'} text={showClosed ? 'Les demandes conclues, perdues ou annulées apparaissent ici.' : 'Les nouvelles demandes du site, de WhatsApp et de TikTok arrivent ici automatiquement.'} />}
      {!loading && closedN > 0 && (
        <button onClick={() => setShowClosed(v => !v)} style={{ width: '100%', margin: '0 0 12px', padding: '10px 14px', borderRadius: 14, border: '1px solid var(--dz-line)', background: 'transparent', color: T.muted, fontFamily: T.font, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          {showClosed ? '← Revenir aux demandes en cours' : `Voir les ${closedN} terminée${closedN > 1 ? 's' : ''} (conclues, perdues, annulées)`}
        </button>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shown.map(d => {
          const s = SRC[d.source];
          const flow = d.source === 'dossier' || d.source === 'import' ? flowFor(d) : null;
          const stepIdx = flow ? flow.findIndex(x => x.key === d.status) : -1;
          const next = flow && d.status !== 'CANCELLED' ? nextStage(d) : null;
          const isBusy = busy === d.id;
          return (
            <Card key={d.id} accent={s.color} pad={0}>
              <div style={{ padding: '14px 14px 12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Badge color={s.color}>{`${s.icon} ${s.label}`}</Badge>
                  {isStale(d) && <Badge color={T.warn}>{`attend depuis ${ageDays(d)} j`}</Badge>}
                  {d.ref && <span style={{ fontSize: 12, color: T.faint, fontFamily: 'ui-monospace, monospace' }}>{d.ref}</span>}
                  {d.lang && <span style={{ fontSize: 14 }}>{LANG_FLAG[d.lang] || ''}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: T.faint }}>{ago(d.created_at)}</span>
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: T.text, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{d.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <Avatar name={d.client_name || 'Client'} color={s.color} size={36} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{d.client_name || 'Client'}</div>
                    <div style={{ fontSize: 13, color: T.muted }}>{d.client_phone || 'pas de téléphone'}{d.meta ? ` · ${d.meta}` : ''}</div>
                  </div>
                </div>

                {(d.source === 'whatsapp' || d.source === 'tiktok') && d.fields?.text && d.fields.text.includes('\n') && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(var(--dz-ink-rgb),0.04)', fontSize: 13.5, color: T.muted, lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>{d.fields.text}</div>
                )}

                {/* Parcours d'étapes (dossier / import) */}
                {flow && d.status !== 'CANCELLED' && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 7 }}>
                      {flow.map((st, i) => <div key={st.key} title={st.fr} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= stepIdx ? s.color: 'rgba(var(--dz-ink-rgb),0.06)', boxShadow: i === stepIdx ? `0 0 8px ${s.color}` : 'none' }} />)}
                    </div>
                    <div style={{ fontSize: 13, color: T.muted }}>Étape {Math.max(1, stepIdx + 1)}/{flow.length} : <b style={{ color: s.color }}>{stageLabel(d, d.status)}</b></div>
                  </div>
                )}
                {d.status === 'CANCELLED' && <div style={{ marginTop: 10 }}><Badge color={T.bad}>Annulée</Badge></div>}
                {!flow && d.status && d.status !== 'CANCELLED' && <div style={{ marginTop: 10 }}><Badge color={d.status === 'conclu' ? T.ok : d.status === 'perdu' ? T.bad : T.faint}>{({ new: 'Nouveau', nouveau: 'Nouveau', contacte: 'Contacté', contacté: 'Contacté', conclu: 'Conclu', perdu: 'Perdu', refusé: 'Refusé (âge)', PENDING: 'En attente' } as Record<string, string>)[d.status] ?? d.status}</Badge></div>}
              </div>

              {/* Actions */}
              <div style={{ padding: '0 14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.source === 'booking' && d.status === 'PENDING' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="primary" disabled={!!busy} onClick={() => void act(d, 'ACCEPTED', 'Réservation acceptée ✅')} style={{ flex: 1 }}><Ico e="✅" />Accepter</Btn>
                    <Btn variant="danger" disabled={!!busy} onClick={() => void act(d, 'REJECTED', 'Réservation refusée')} style={{ flex: 1 }}>Refuser</Btn>
                  </div>
                )}
                {flow && d.status !== 'CANCELLED' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {next
                      ? <Btn color={s.color} disabled={!!busy} onClick={() => void act(d, next.key, `Étape → ${next.fr} ✅`)} style={{ flex: 2 }}>{isBusy ? '⏳' : '→'} {next.fr}</Btn>
                      : <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: T.ok }}>✓ Terminé</div>}
                    <label style={{ ...btnStyle('ghost'), flex: 1, cursor: busy ? 'wait' : 'pointer' }}>
                      📷 Photo
                      <input type="file" accept="image/*" disabled={!!busy} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void addPhoto(d, f); e.currentTarget.value = ''; }} />
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  {d.client_phone && <Btn color="#25D366" onClick={() => waRelance(d)} style={{ flex: 1.2 }}><Ico e="💬" />{isStale(d) ? 'Relancer' : 'WhatsApp'}</Btn>}
                  {d.source === 'tiktok' && <a href={d.fields?.video ? `https://www.tiktok.com/@fik_conciergerie/video/${d.fields.video}` : 'https://www.tiktok.com/messages'} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('ghost'), flex: 1.2, textDecoration: 'none' }}><Ico e="🎵" />Ouvrir TikTok</a>}
                  {(d.source === 'lead' || d.source === 'whatsapp' || d.source === 'tiktok') && d.status !== 'conclu' && <Btn color={T.ok} disabled={!!busy} onClick={() => void act(d, 'conclu', 'Demande marquée conclue ✅')} style={{ flex: 1 }}>✓ Conclu</Btn>}
                  {(d.source === 'whatsapp' || d.source === 'tiktok') && !isClosed(d) && <Btn variant="ghost" disabled={!!busy} onClick={() => void act(d, 'perdu', 'Demande marquée perdue')} style={{ flex: 1 }}>✕ Perdu</Btn>}
                  {d.admin_path && <a href={`${SITE}${d.admin_path}`} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('ghost'), flex: 1, textDecoration: 'none' }}><Ico e="⚙️" />Gérer</a>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {flow && d.status !== 'CANCELLED' && <Btn variant="ghost" disabled={!!busy} onClick={() => void act(d, 'CANCELLED', 'Demande annulée')} style={{ flex: 1, minHeight: 40, fontSize: 13 }}>✕ Annuler</Btn>}
                  <Btn variant={confirmDel === d.id ? 'primary' : 'danger'} disabled={isBusy} onClick={() => void del(d)}
                    style={{ flex: 1, minHeight: 40, fontSize: 13, ...(confirmDel === d.id ? { background: T.bad, color: '#fff' } : {}) }}>{confirmDel === d.id ? '⚠️ Confirmer' : '🗑️ Supprimer'}</Btn>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {showNew && (
        <Sheet title="Nouvelle demande" subtitle="Dossier d'achat, immo, pack ou importation" onClose={() => setShowNew(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => setShowNew(false)} style={{ flex: 1 }}>Annuler</Btn>
            <Btn variant="primary" disabled={busy === 'new'} onClick={() => void submitNew()} style={{ flex: 2 }}>{busy === 'new' ? 'Création…' : 'Créer la demande'}</Btn>
          </>}>
          <div style={{ marginBottom: 12 }}>
            <Segmented<'dossier' | 'import'> value={form.type as 'dossier' | 'import'} onChange={v => setF('type', v)}
              items={[{ id: 'dossier', label: '📁 Dossier' }, { id: 'import', label: '🛳️ Import' }]} />
          </div>
          {form.type === 'dossier' && (
            <div style={{ marginBottom: 14 }}>
              <Chips<string> value={form.kind} onChange={v => setF('kind', v)}
                items={[{ id: 'voiture', label: '🚗 Achat voiture' }, { id: 'immo', label: '🏠 Immo' }, { id: 'pack', label: '🎫 Pack séjour' }]} />
            </div>
          )}
          <Field label="Nom du client"><input value={form.client_name} onChange={e => setF('client_name', e.target.value)} placeholder="Ex. Karim Benali" style={inputStyle} /></Field>
          <Field label="Téléphone (WhatsApp)"><input value={form.client_phone} onChange={e => setF('client_phone', e.target.value)} placeholder="+213 …" inputMode="tel" style={inputStyle} /></Field>
          <Field label="Email (optionnel)"><input value={form.client_email} onChange={e => setF('client_email', e.target.value)} placeholder="client@mail.com" inputMode="email" style={inputStyle} /></Field>
          {form.type === 'dossier'
            ? <Field label="Objet"><input value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Ex. Clio 2020, appart 3 pièces…" style={inputStyle} /></Field>
            : <>
                <Field label="Véhicule"><input value={form.vehicle} onChange={e => setF('vehicle', e.target.value)} placeholder="Marque modèle année" style={inputStyle} /></Field>
                <Field label="Pays d'origine"><input value={form.subject} onChange={e => setF('subject', e.target.value)} placeholder="Ex. France" style={inputStyle} /></Field>
              </>}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}><Field label="Budget"><input value={form.budget} onChange={e => setF('budget', e.target.value)} placeholder="0" inputMode="numeric" style={inputStyle} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Devise">
              <select value={form.currency} onChange={e => setF('currency', e.target.value)} style={inputStyle}>
                <option value="DZD">DZD</option><option value="EUR">EUR</option><option value="USD">USD</option>
              </select>
            </Field></div>
          </div>
          <Field label="Langue du client">
            <Segmented<string> value={form.lang} onChange={v => setF('lang', v)}
              items={[{ id: 'fr', label: '🇫🇷 Français' }, { id: 'ar', label: '🇩🇿 Arabe' }, { id: 'en', label: '🇬🇧 Anglais' }]} />
          </Field>
        </Sheet>
      )}
    </Screen>
  );
}
