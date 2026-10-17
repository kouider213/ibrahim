// Fiche modifiable de la Carte live pour tous les métiers hors location :
// vente auto, immobilier, importations, packs séjour et demandes du site (agence).
// Ajouter, modifier, changer d'étape / de statut, contacter, supprimer — même base que le site.
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, business } from '../../services/api.ts';
import { errMsg } from './AddRentals.tsx';
import { Btn, L, Row, inp } from './CarSheet.tsx';

export type SheetKind = 'sale' | 'prop' | 'imp' | 'pack' | 'dem';
export type Raw = Record<string, unknown> & { id: string };

type Stage = { key: string; fr: string };
// Codes identiques au site (lib/importStatus.js) et à l'écran Demandes
const IMPORT_FLOW: Stage[] = [
  { key: 'REQUESTED', fr: 'Demande reçue' }, { key: 'SEARCHING', fr: 'Recherche' }, { key: 'FOUND', fr: 'Trouvé' },
  { key: 'PURCHASED', fr: 'Acheté' }, { key: 'SHIPPING', fr: 'En mer' }, { key: 'CUSTOMS', fr: 'Douane' },
  { key: 'READY', fr: 'Prêt' }, { key: 'DELIVERED', fr: 'Livré' },
];
const DOSSIER_FLOWS: Record<string, Stage[]> = {
  voiture: [{ key: 'REQUESTED', fr: 'Reçue' }, { key: 'RESERVED', fr: 'Réservé' }, { key: 'DOCUMENTS', fr: 'Documents' }, { key: 'PAYMENT', fr: 'Paiement' }, { key: 'READY', fr: 'Prêt' }, { key: 'DELIVERED', fr: 'Livré' }],
  immo: [{ key: 'REQUESTED', fr: 'Reçue' }, { key: 'VISIT', fr: 'Visite' }, { key: 'REVIEW', fr: 'Dossier' }, { key: 'CONTRACT', fr: 'Contrat' }, { key: 'FINALIZED', fr: 'Finalisé' }],
  pack: [{ key: 'REQUESTED', fr: 'Reçue' }, { key: 'CONFIRMED', fr: 'Confirmé' }, { key: 'DEPOSIT', fr: 'Acompte' }, { key: 'PREPARED', fr: 'Préparé' }, { key: 'ONGOING', fr: 'En cours' }, { key: 'COMPLETED', fr: 'Terminé' }],
};
const SALE_ST: Stage[] = [{ key: 'disponible', fr: '🟢 En vente' }, { key: 'reserve', fr: '🟡 Réservé' }, { key: 'vendu', fr: '✅ Vendu' }];
const PROP_ST: Stage[] = [{ key: 'disponible', fr: '🟢 Disponible' }, { key: 'loue', fr: '🔑 Loué' }, { key: 'vendu', fr: '✅ Vendu' }, { key: 'en_travaux', fr: '🔨 Travaux' }];
const PACK_ST: Stage[] = [{ key: 'disponible', fr: '🟢 En ligne' }, { key: 'indisponible', fr: '⛔ Caché du site' }];
const TITLE: Record<SheetKind, string> = { sale: '🏷️ Véhicule à vendre', prop: '🏠 Bien immobilier', imp: '🚢 Importation', pack: '🏝️ Pack séjour', dem: '📥 Demande' };

const str = (v: unknown) => (v == null ? '' : String(v));
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')) || 0);
const rawId = (id: string) => id.replace(/^(booking|dossier|import|lead)-/, '');
const wa = (phone: unknown) => { const p = str(phone).replace(/\D/g, ''); if (p) window.open(`https://wa.me/${p}`, '_blank'); };

export default function ItemSheet({ kind, raw, onClose, onChanged, onAsk }: {
  kind: SheetKind; raw: Raw | null; onClose: () => void; onChanged: () => void; onAsk: (p: string) => void;
}) {
  const creating = !raw;
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState(false);

  useEffect(() => {
    const r = raw ?? {} as Raw;
    const fx = (r['fields'] as Record<string, unknown> | undefined) ?? r;
    const keys = kind === 'sale' ? ['brand', 'model', 'year', 'price', 'currency', 'mileage']
      : kind === 'prop' ? ['title', 'transaction', 'price', 'currency', 'city', 'district', 'tenant_name', 'notes']
      : kind === 'pack' ? ['title', 'price', 'currency', 'duration', 'tagline']
      : kind === 'imp' ? ['vehicle_brand', 'vehicle_model', 'vehicle_year', 'budget', 'currency', 'country_origin', 'notes_admin', 'client_name', 'client_phone']
      : [];
    const o: Record<string, string> = {};
    for (const k of keys) o[k] = str(fx[k]);
    if (!o['currency'] && kind !== 'dem') o['currency'] = 'EUR';
    if (kind === 'prop' && !o['transaction']) o['transaction'] = 'location';
    if (kind === 'prop' && !o['city']) o['city'] = 'Oran';
    setF(o); setMsg(''); setSure(false);
  }, [kind, raw]);

  const set = (k: string) => (e: { target: { value: string } }) => setF(o => ({ ...o, [k]: e.target.value }));
  const run = async (fn: () => Promise<unknown>, ok: string, close = false) => {
    setBusy(true); setMsg('');
    try { await fn(); setMsg(`✓ ${ok}`); onChanged(); if (close) setTimeout(onClose, 900); }
    catch (e) { setMsg(errMsg(e)); }
    finally { setBusy(false); }
  };
  const status = str(raw?.['status']);
  const id = raw?.id ?? '';

  // ── Enregistrement par métier ───────────────────────────────────────────────
  const save = () => {
    if (kind === 'sale') {
      if (!f['brand']?.trim() || !f['model']?.trim()) { setMsg('Marque et modèle obligatoires.'); return; }
      const body = { brand: f['brand'].trim(), model: f['model'].trim(), year: numOrNull(f['year'] ?? ''), price: numOrNull(f['price'] ?? ''), currency: f['currency'], mileage: numOrNull(f['mileage'] ?? '') };
      void run(() => creating ? business.addVehicleForSale(body) : business.updateVehicleSale(id, body), creating ? 'Véhicule mis en vente (visible sur le site)' : 'Véhicule mis à jour', creating);
    } else if (kind === 'prop') {
      if (!f['title']?.trim()) { setMsg('Donne un nom au bien (ex. F3 Hay Badr).'); return; }
      const body = { title: f['title'].trim(), transaction: f['transaction'], price: numOrNull(f['price'] ?? ''), currency: f['currency'], city: f['city']?.trim() || 'Oran', district: f['district']?.trim() || null, tenant_name: f['tenant_name']?.trim() || null, notes: f['notes']?.trim() || null };
      void run(() => creating ? business.createProperty(body) : business.updateProperty(id, body), creating ? 'Bien ajouté (visible sur le site)' : 'Bien mis à jour', creating);
    } else if (kind === 'pack') {
      if (!f['title']?.trim()) { setMsg('Donne un nom au pack.'); return; }
      const body = { title: f['title'].trim(), price: numOrNull(f['price'] ?? ''), currency: f['currency'], duration: f['duration']?.trim() || null, tagline: f['tagline']?.trim() || null };
      void run(() => apiFetch(creating ? '/api/packs' : `/api/packs/${encodeURIComponent(id)}`, { method: creating ? 'POST' : 'PATCH', body: JSON.stringify(body) }), creating ? 'Pack créé' : 'Pack mis à jour', creating);
    } else if (kind === 'imp') {
      const veh = { vehicle_brand: f['vehicle_brand']?.trim() || null, vehicle_model: f['vehicle_model']?.trim() || null, vehicle_year: f['vehicle_year']?.trim() || null, budget: numOrNull(f['budget'] ?? ''), currency: f['currency'], country_origin: f['country_origin']?.trim() || null };
      if (creating) {
        if (!f['client_name']?.trim() && !f['client_phone']?.trim()) { setMsg('Nom ou téléphone du client obligatoire.'); return; }
        void run(() => apiFetch('/api/demandes/create', { method: 'POST', body: JSON.stringify({ type: 'import', client_name: f['client_name']?.trim() || null, client_phone: f['client_phone']?.trim() || null, ...veh }) }), 'Import créé — il arrive sur le bateau 🚢', true);
      } else {
        void run(() => apiFetch('/api/demandes/update', { method: 'POST', body: JSON.stringify({ source: 'import', id: rawId(id), patch: { ...veh, notes_admin: f['notes_admin']?.trim() || null } }) }), 'Import mis à jour');
      }
    }
  };

  // ── Changement de statut / étape (un toucher) ───────────────────────────────
  const setStatus = (st: string, label: string) => {
    if (kind === 'sale') void run(() => business.updateVehicleSale(id, { status: st }), label);
    else if (kind === 'prop') void run(() => business.updateProperty(id, { status: st, transaction: f['transaction'] }), label);
    else if (kind === 'pack') void run(() => apiFetch(`/api/packs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: st }) }), label);
    else void run(() => apiFetch('/api/demandes/update', { method: 'POST', body: JSON.stringify({ source: kind === 'imp' ? 'import' : str(raw?.['source']), id: rawId(id), status: st }) }), label);
  };

  const del = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
    const fn = kind === 'prop' ? () => apiFetch(`/api/immo/properties/${encodeURIComponent(id)}`, { method: 'DELETE' })
      : kind === 'pack' ? () => apiFetch(`/api/packs/${encodeURIComponent(id)}`, { method: 'DELETE' })
      : () => apiFetch('/api/demandes/delete', { method: 'POST', body: JSON.stringify({ source: kind === 'imp' ? 'import' : str(raw?.['source']), id: rawId(id) }) });
    void run(fn, 'Supprimé', true);
  };

  const flow = kind === 'sale' ? SALE_ST : kind === 'prop' ? PROP_ST : kind === 'pack' ? PACK_ST : kind === 'imp' ? IMPORT_FLOW
    : str(raw?.['source']) === 'dossier' ? DOSSIER_FLOWS[str(raw?.['kind'])] ?? DOSSIER_FLOWS['voiture']! : null;
  const cur = (k = 'currency') => (
    <select value={f[k] ?? 'EUR'} onChange={set(k)} style={inp}><option value="EUR">€ euro</option><option value="DZD">DA dinar</option></select>
  );
  const title = creating ? `Nouveau — ${TITLE[kind].slice(TITLE[kind].indexOf(' ') + 1).toLowerCase()}`
    : str(raw?.['title']) || [raw?.['brand'], raw?.['model'], raw?.['year']].filter(Boolean).join(' ') || TITLE[kind];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#0f172a', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{TITLE[kind].split(' ')[0]} {TITLE[kind].split(' ').slice(1).join(' ').toUpperCase()}</span>
        <span style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#64748b' }}>✕</button>
      </div>

      {/* Client (imports et demandes) */}
      {!creating && (kind === 'imp' || kind === 'dem') && (
        <div style={{ fontSize: 12.5, color: '#334155', marginTop: 6, lineHeight: 1.55 }}>
          <Row k="Client"><b>{str(raw?.['client_name']) || '—'}</b>{raw?.['client_phone'] ? ` · ${str(raw['client_phone'])}` : ''}</Row>
          {raw?.['ref'] != null && <Row k="Réf.">{str(raw['ref'])}</Row>}
          {raw?.['meta'] ? <Row k="Détails">{str(raw['meta'])}</Row> : null}
          {raw?.['created_at'] ? <Row k="Reçue le">{new Date(str(raw['created_at'])).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Row> : null}
        </div>
      )}

      {/* Statut / étape */}
      {!creating && flow && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>{kind === 'imp' || kind === 'dem' ? 'Étape' : 'Statut'}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {flow.map((s, i) => {
              const on = status === s.key || (!status && i === 0);
              const done = (kind === 'imp' || kind === 'dem') && flow.findIndex(x => x.key === status) > i;
              return <Chip key={s.key} on={on} done={done} disabled={busy} onClick={() => { if (!on) setStatus(s.key, `${s.fr.replace(/^\S+\s/, '')} ✓`); }}>{s.fr}</Chip>;
            })}
          </div>
        </div>
      )}
      {!creating && kind === 'dem' && str(raw?.['source']) === 'booking' && status === 'PENDING' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <Btn bg="#dcfce7" fg="#15803d" disabled={busy} onClick={() => setStatus('ACCEPTED', 'Réservation acceptée')}>✅ Accepter</Btn>
          <Btn bg="#fee2e2" fg="#b91c1c" disabled={busy} onClick={() => setStatus('REJECTED', 'Réservation refusée')}>❌ Refuser</Btn>
        </div>
      )}
      {!creating && kind === 'dem' && str(raw?.['source']) === 'lead' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {status !== 'en_cours' && <Btn bg="#e0f2fe" fg="#0369a1" disabled={busy} onClick={() => setStatus('en_cours', 'Lead en cours')}>📞 En cours</Btn>}
          {status !== 'conclu' && <Btn bg="#dcfce7" fg="#15803d" disabled={busy} onClick={() => setStatus('conclu', 'Lead conclu')}>✓ Conclu</Btn>}
        </div>
      )}

      {/* Formulaire */}
      {kind !== 'dem' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 9 }}>
          {kind === 'sale' && <>
            <L t="Marque"><input value={f['brand'] ?? ''} onChange={set('brand')} placeholder="Volkswagen" style={inp} /></L>
            <L t="Modèle"><input value={f['model'] ?? ''} onChange={set('model')} placeholder="Golf 7" style={inp} /></L>
            <L t="Année"><input value={f['year'] ?? ''} inputMode="numeric" onChange={set('year')} style={inp} /></L>
            <L t="Kilométrage"><input value={f['mileage'] ?? ''} inputMode="numeric" onChange={set('mileage')} style={inp} /></L>
            <L t="Prix"><input value={f['price'] ?? ''} inputMode="decimal" onChange={set('price')} style={inp} /></L>
            <L t="Devise">{cur()}</L>
          </>}
          {kind === 'prop' && <>
            <Span2><L t="Nom du bien"><input value={f['title'] ?? ''} onChange={set('title')} placeholder="F3 Hay Badr, Villa Canastel…" style={inp} /></L></Span2>
            <L t="Pour"><select value={f['transaction']} onChange={set('transaction')} style={inp}><option value="location">À louer</option><option value="vente">À vendre</option></select></L>
            <L t={f['transaction'] === 'vente' ? 'Prix de vente' : 'Loyer / mois'}><input value={f['price'] ?? ''} inputMode="decimal" onChange={set('price')} style={inp} /></L>
            <L t="Devise">{cur()}</L>
            <L t="Ville"><input value={f['city'] ?? ''} onChange={set('city')} style={inp} /></L>
            <L t="Quartier"><input value={f['district'] ?? ''} onChange={set('district')} style={inp} /></L>
            {f['transaction'] !== 'vente' && <L t="Locataire"><input value={f['tenant_name'] ?? ''} onChange={set('tenant_name')} style={inp} /></L>}
            <Span2><L t="Notes"><textarea value={f['notes'] ?? ''} onChange={set('notes')} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></L></Span2>
          </>}
          {kind === 'pack' && <>
            <Span2><L t="Nom du pack"><input value={f['title'] ?? ''} onChange={set('title')} placeholder="Pack été — voiture + appartement + jet ski" style={inp} /></L></Span2>
            <L t="Prix"><input value={f['price'] ?? ''} inputMode="decimal" onChange={set('price')} style={inp} /></L>
            <L t="Devise">{cur()}</L>
            <L t="Durée"><input value={f['duration'] ?? ''} onChange={set('duration')} placeholder="7 jours" style={inp} /></L>
            <L t="Accroche"><input value={f['tagline'] ?? ''} onChange={set('tagline')} style={inp} /></L>
          </>}
          {kind === 'imp' && <>
            {creating && <>
              <L t="Client"><input value={f['client_name'] ?? ''} onChange={set('client_name')} style={inp} /></L>
              <L t="Téléphone"><input value={f['client_phone'] ?? ''} inputMode="tel" onChange={set('client_phone')} style={inp} /></L>
            </>}
            <L t="Marque"><input value={f['vehicle_brand'] ?? ''} onChange={set('vehicle_brand')} placeholder="Audi" style={inp} /></L>
            <L t="Modèle"><input value={f['vehicle_model'] ?? ''} onChange={set('vehicle_model')} placeholder="A3" style={inp} /></L>
            <L t="Année"><input value={f['vehicle_year'] ?? ''} inputMode="numeric" onChange={set('vehicle_year')} style={inp} /></L>
            <L t="Pays d'achat"><input value={f['country_origin'] ?? ''} onChange={set('country_origin')} placeholder="Allemagne" style={inp} /></L>
            <L t="Budget"><input value={f['budget'] ?? ''} inputMode="decimal" onChange={set('budget')} style={inp} /></L>
            <L t="Devise">{cur()}</L>
            {!creating && <Span2><L t="Notes internes"><textarea value={f['notes_admin'] ?? ''} onChange={set('notes_admin')} rows={2} placeholder="ex. bateau Marseille → Oran le 22, transitaire X" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} /></L></Span2>}
          </>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
        {kind !== 'dem' && <Btn bg="#38d8f5" fg="#fff" disabled={busy} onClick={save}>{busy ? '…' : creating ? '➕ Ajouter' : 'Enregistrer'}</Btn>}
        {!creating && raw?.['client_phone'] ? <>
          <Btn bg="#dcfce7" fg="#15803d" onClick={() => wa(raw['client_phone'])}>💬 WhatsApp</Btn>
          <Btn bg="#e0f2fe" fg="#0369a1" onClick={() => { window.location.href = `tel:${str(raw['client_phone'])}`; }}>📞 Appeler</Btn>
        </> : null}
        {!creating && <Btn bg="#ede9fe" fg="#6d28d9" onClick={() => onAsk(`Fais le point sur ${TITLE[kind].slice(TITLE[kind].indexOf(' ') + 1).toLowerCase()} « ${title} » (statut ${status || '—'}) et dis-moi la prochaine chose à faire.`)}>✨ Dzaryx</Btn>}
        {!creating && kind !== 'sale' && <Btn bg={sure ? '#dc2626' : '#fee2e2'} fg={sure ? '#fff' : '#b91c1c'} disabled={busy} onClick={del}>{sure ? '⚠️ Confirmer' : '🗑️ Supprimer'}</Btn>}
      </div>
      {msg && <div style={{ fontSize: 12, marginTop: 8, fontWeight: 600, color: msg.startsWith('✓') ? '#047857' : '#b91c1c' }}>{msg}</div>}
    </div>
  );
}

const Span2 = ({ children }: { children: ReactNode }) => <div style={{ gridColumn: '1 / -1' }}>{children}</div>;
function Chip({ on, done, disabled, onClick, children }: { on: boolean; done?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button disabled={disabled} onClick={onClick} style={{ fontSize: 11, fontWeight: 700, borderRadius: 14, padding: '4px 9px', cursor: 'pointer', border: `1.5px solid ${on ? '#0f172a' : done ? '#86efac' : '#cbd5e1'}`, background: on ? '#0f172a' : done ? '#f0fdf4' : '#fff', color: on ? '#fff' : done ? '#15803d' : '#334155', opacity: disabled ? 0.6 : 1 }}>{done ? '✓ ' : ''}{children}</button>;
}
