import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, business, getOrCreateSessionId, type ClientDocument } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, Card, Btn, SectionTitle, Chips, Empty, Field, inputStyle } from '../ui/Kit.tsx';

const TYPE_MAP: Record<string, { label: string; icon: string; apiType: string }> = {
  passeport: { label: 'Passeport', icon: '🛂', apiType: 'passport'  },
  permis:    { label: 'Permis',    icon: '🚗', apiType: 'license'   },
  contrat:   { label: 'Contrat',   icon: '📝', apiType: 'contract'  },
};
const TYPE_FR: Record<string, string> = { passport: 'Passeport', license: 'Permis', contract: 'Contrat', other: 'Document' };

export default function DocumentsScreen() {
  const [name, setName]           = useState('');
  const [loading, setLoad]        = useState(false);
  const [docs, setDocs]           = useState<ClientDocument[] | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [scanFile, setScan]       = useState<File | null>(null);
  const [scanning, setScanning]   = useState(false);
  const [scanResult, setScanResult] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [viewDoc, setViewDoc]     = useState<ClientDocument | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async (typeKey: string) => {
    const n = name.trim();
    setActiveType(typeKey);
    if (!n) { setDocs([]); return; }
    const { apiType } = TYPE_MAP[typeKey]!;
    setLoad(true); setDocs(null); setViewDoc(null);
    try {
      const r = await business.fetchDocuments(n, apiType);
      setDocs(r.documents);
    } catch {
      setDocs([]);
    } finally { setLoad(false); }
  };

  const handleScanFile = async (file: File) => {
    setScan(file); setScanning(true); setScanResult(''); setScanProgress(0);
    const prog = setInterval(() => setScanProgress(p => Math.min(p + 8, 90)), 120);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1] ?? '');
        reader.onerror = rej; reader.readAsDataURL(file);
      });
      const r = await api.scan(b64, file.type);
      setScanProgress(100);
      setScanResult(r.description ?? 'Scan terminé');
    } catch (e) { setScanResult(`❌ Erreur scan : ${e}`); }
    finally { clearInterval(prog); setScanning(false); }
  };

  return (
    <Screen header={<PageHeader eyebrow="Base clients" title="Documents" subtitle="Pièces d'identité, contrats PDF, lecture automatique" />}>
      {/* Visionneuse plein écran */}
      {viewDoc && createPortal(
        <div onClick={() => setViewDoc(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000', display: 'flex', flexDirection: 'column', fontFamily: T.font, color: T.text }}>
          <div onClick={e => e.stopPropagation()} style={{ padding: 'calc(12px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{TYPE_FR[viewDoc.type] ?? viewDoc.type} · {viewDoc.client_name}</div>
              <div style={{ fontSize: 13, color: T.muted }}>{new Date(viewDoc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{viewDoc.notes ? ` · ${viewDoc.notes}` : ''}</div>
            </div>
            <button onClick={() => setViewDoc(null)} aria-label="Fermer" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 17, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <img src={viewDoc.file_url} alt={viewDoc.type} onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 10 }} />
          </div>
        </div>,
        document.body,
      )}

      {/* Retrouver une pièce */}
      <SectionTitle>Retrouver une pièce</SectionTitle>
      <Card style={{ marginBottom: 18 }}>
        <Field label="Nom du client">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && activeType) void fetchDocs(activeType); }}
            placeholder="Ex. Karim Benali" style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          {Object.entries(TYPE_MAP).map(([key, { label, icon }]) => {
            const on = activeType === key;
            return (
              <button key={key} onClick={() => void fetchDocs(key)} disabled={loading} style={{
                minHeight: 72, borderRadius: 14, cursor: loading ? 'wait' : 'pointer', fontFamily: T.font,
                background: on ? tone(T.accent, 0.16) : 'rgba(255,255,255,0.03)', border: `1px solid ${on ? tone(T.accent, 0.6) : T.line}`,
                color: on ? T.accent : T.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</span>
              </button>
            );
          })}
        </div>

        {loading && <div style={{ marginTop: 12 }}><SkeletonCards count={2} height={64} /></div>}
        {docs !== null && !loading && (
          <div style={{ marginTop: 14 }}>
            {!name.trim() ? (
              <div style={{ fontSize: 14, color: T.warn }}>Écris d'abord le nom du client.</div>
            ) : docs.length === 0 ? (
              <Empty icon="🔎" title="Aucune pièce trouvée" text={`Rien pour « ${name} » dans cette catégorie.`} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: T.muted }}>{docs.length} document{docs.length > 1 ? 's' : ''} trouvé{docs.length > 1 ? 's' : ''}</div>
                {docs.map(doc => (
                  <button key={doc.id} onClick={() => setViewDoc(doc)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, cursor: 'pointer', fontFamily: T.font, textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.line}`, color: T.text }}>
                    <img src={doc.file_url} alt={doc.type} style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: T.surface2 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{TYPE_FR[doc.type] ?? doc.type}</span>
                      <span style={{ display: 'block', fontSize: 13, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.client_name} · {new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
                    </span>
                    <span style={{ color: T.accent, fontSize: 20 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Contrat PDF */}
      <SectionTitle>Contrat PDF</SectionTitle>
      <Card accent={T.violet} style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.45, marginBottom: 12 }}>Dzaryx prépare le contrat (avec conditions générales) et te l'envoie en PDF sur Telegram.</div>
        <ContractGenerator />
      </Card>

      {/* Lecture automatique */}
      <SectionTitle>Lire une pièce automatiquement</SectionTitle>
      <Card accent={T.warn}>
        <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.45, marginBottom: 12 }}>Photo d'un passeport, d'un permis ou d'un contrat : les informations sont extraites toutes seules.</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleScanFile(f); e.currentTarget.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} disabled={scanning} style={{
          width: '100%', minHeight: 88, borderRadius: 14, cursor: scanning ? 'wait' : 'pointer', fontFamily: T.font,
          background: tone(T.warn, scanning ? 0.12 : 0.05), border: `1.5px dashed ${tone(T.warn, 0.55)}`, color: T.warn,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 26 }}>{scanning ? '⏳' : scanFile ? '📄' : '📷'}</span>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>{scanning ? `Analyse en cours… ${scanProgress} %` : scanFile ? 'Scanner une autre photo' : 'Prendre ou choisir une photo'}</span>
        </button>
        {scanning && (
          <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: `${scanProgress}%`, background: `linear-gradient(90deg, ${tone(T.warn, 0.5)}, ${T.warn})`, transition: 'width .15s linear' }} />
          </div>
        )}
        {scanResult && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 13, background: 'rgba(0,0,0,0.25)', border: `1px solid ${T.line}`, fontSize: 14, color: T.text, lineHeight: 1.55, maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {scanResult}
          </div>
        )}
      </Card>
    </Screen>
  );
}

const CONTRACT_KINDS = [
  { key: 'loc_auto',   label: '🚗 Location voiture', who: 'Nom du client',     item: 'Voiture (ex. Clio 4 Diesel)',     doc: 'contrat de location voiture' },
  { key: 'loc_immo',   label: '🏠 Location immo',    who: 'Nom du locataire',  item: 'Bien (ex. F3 Hay Badr)',          doc: 'contrat de location immobilière' },
  { key: 'vente_immo', label: '🔑 Vente immo',       who: 'Nom de l’acheteur', item: 'Bien (ex. villa Bir El Djir)',    doc: 'compromis de vente immobilière' },
  { key: 'vente_auto', label: '🏷️ Vente voiture',    who: 'Nom de l’acheteur', item: 'Voiture (ex. Audi Q3)',           doc: 'contrat de vente de véhicule' },
] as const;

// Le contrat est réellement fait par Dzaryx (outil generate_contract pour une location voiture,
// document PDF pour les autres) : on lui envoie la demande et on affiche sa réponse.
function ContractGenerator() {
  const [kind, setKind]      = useState<typeof CONTRACT_KINDS[number]['key']>('loc_auto');
  const [client, setClient]  = useState('');
  const [item, setItem]      = useState('');
  const [generating, setGen] = useState(false);
  const [result, setResult]  = useState('');

  const cfg = CONTRACT_KINDS.find(k => k.key === kind)!;

  const generate = async () => {
    if (!client.trim() || !item.trim()) return;
    setGen(true); setResult('');
    const ask = kind === 'loc_auto'
      ? `Génère le contrat de location (PDF signable avec CGV) pour la réservation de ${client.trim()} — ${item.trim()}, et envoie-le moi sur Telegram.`
      : `Prépare un ${cfg.doc} en PDF pour ${client.trim()} — ${item.trim()}, avec les clauses habituelles, et envoie-le moi sur Telegram.`;
    try {
      const r = await api.chat(ask, getOrCreateSessionId(), undefined, undefined, true);
      setResult(r.text?.trim() || '✅ Demande envoyée à Dzaryx.');
    } catch (e) {
      setResult(`❌ Dzaryx n'a pas pu générer le contrat : ${e instanceof Error ? e.message : e}`);
    } finally { setGen(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Chips<typeof kind> value={kind} onChange={k => { setKind(k); setResult(''); }} items={CONTRACT_KINDS.map(k => ({ id: k.key, label: k.label }))} />
      </div>
      <Field label={cfg.who}><input value={client} onChange={e => setClient(e.target.value)} placeholder="Prénom Nom" style={inputStyle} /></Field>
      <Field label={kind.endsWith('immo') ? 'Bien' : 'Voiture'}><input value={item} onChange={e => setItem(e.target.value)} placeholder={cfg.item} style={inputStyle} /></Field>
      <Btn variant="primary" onClick={() => void generate()} disabled={generating || !client.trim() || !item.trim()} style={{ width: '100%' }}>
        {generating ? '⏳ Dzaryx prépare le contrat…' : '📝 Générer et recevoir sur Telegram'}
      </Btn>
      {result && (
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 13, background: tone(result.startsWith('❌') ? T.bad : T.violet, 0.1), border: `1px solid ${tone(result.startsWith('❌') ? T.bad : T.violet, 0.3)}`, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {result}
        </div>
      )}
    </div>
  );
}
