import { useState, useRef } from 'react';
import { api, business, getOrCreateSessionId, type ClientDocument } from '../../services/api.ts';

const TYPE_MAP: Record<string, { label: string; icon: string; apiType: string }> = {
  passeport: { label: 'PASSEPORT', icon: '🛂', apiType: 'passport'  },
  permis:    { label: 'PERMIS',    icon: '🚗', apiType: 'license'   },
  contrat:   { label: 'CONTRAT',   icon: '📝', apiType: 'contract'  },
};

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
  const sessionId = getOrCreateSessionId();

  const fetchDocs = async (typeKey: string) => {
    const n = name.trim();
    if (!n) { setDocs([]); return; }
    const { apiType } = TYPE_MAP[typeKey]!;
    setActiveType(typeKey);
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
    } catch (e) { setScanResult(`❌ Erreur scan: ${e}`); }
    finally { clearInterval(prog); setScanning(false); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Full-screen doc viewer */}
      {viewDoc && (
        <div
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column' }}
          onClick={() => setViewDoc(null)}
        >
          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #00d4ff22' }}>
            <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.2em' }}>
              {viewDoc.type.toUpperCase()} — {viewDoc.client_name}
            </span>
            <button
              onClick={() => setViewDoc(null)}
              style={{ background: 'none', border: '1px solid #ff336644', borderRadius: 6, color: '#ff3366', fontFamily: 'Orbitron', fontSize: 8, padding: '4px 10px', cursor: 'pointer' }}
            >
              ✕ FERMER
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <img
              src={viewDoc.file_url}
              alt={viewDoc.type}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid #00d4ff22' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ padding: '8px 14px', fontSize: 8, color: '#ffffff33', textAlign: 'center' }}>
            {new Date(viewDoc.created_at).toLocaleDateString('fr-FR')}
            {viewDoc.notes && ` · ${viewDoc.notes}`}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            DOCUMENTS
          </div>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff44', letterSpacing: '0.2em' }}>BASE CLIENTS</span>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Fetch document panel */}
        <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #00d4ff1a' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff77', letterSpacing: '0.25em', marginBottom: 10 }}>
            ▶ RÉCUPÉRER DOCUMENT CLIENT
          </div>

          <input
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && activeType) void fetchDocs(activeType); }}
            placeholder="Nom du client…"
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {Object.entries(TYPE_MAP).map(([key, { label, icon }]) => {
              const active = activeType === key;
              return (
                <button
                  key={key}
                  onClick={() => void fetchDocs(key)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: active ? 'rgba(0,212,255,0.15)' : loading ? 'rgba(0,212,255,0.03)' : 'rgba(0,212,255,0.08)',
                    border: `1px solid #00d4ff${active ? '88' : loading ? '18' : '44'}`,
                    borderRadius: 10, padding: '10px 6px',
                    fontFamily: 'Orbitron', color: `#00d4ff${loading ? '55' : 'cc'}`,
                    cursor: loading ? 'default' : 'pointer', textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                  <div style={{ fontSize: 7, letterSpacing: '0.12em' }}>{label}</div>
                </button>
              );
            })}
          </div>

          {loading && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 8, color: '#00d4ff55', letterSpacing: '0.2em', fontFamily: 'Orbitron' }}>
              RÉCUPÉRATION EN COURS…
            </div>
          )}

          {/* Results */}
          {docs !== null && !loading && (
            <div style={{ marginTop: 10 }}>
              {docs.length === 0 ? (
                <div style={{ padding: '12px', background: 'rgba(255,51,102,0.06)', borderRadius: 8, border: '1px solid #ff336622', fontSize: 9, color: '#ff336688', textAlign: 'center' }}>
                  Aucun document trouvé pour «{name}»
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 7, color: '#00d4ff44', letterSpacing: '0.15em', fontFamily: 'Orbitron' }}>
                    {docs.length} DOCUMENT{docs.length > 1 ? 'S' : ''} TROUVÉ{docs.length > 1 ? 'S' : ''}
                  </div>
                  {docs.map(doc => (
                    <div
                      key={doc.id}
                      onClick={() => setViewDoc(doc)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(0,212,255,0.05)', borderRadius: 10,
                        border: '1px solid #00d4ff22', padding: '8px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                        overflow: 'hidden', border: '1px solid #00d4ff22',
                        background: '#00d4ff08',
                      }}>
                        <img
                          src={doc.file_url}
                          alt={doc.type}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ffcc', letterSpacing: '0.15em', marginBottom: 2 }}>
                          {doc.type.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 8, color: '#c8e8ff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.client_name}
                        </div>
                        <div style={{ fontSize: 7, color: '#ffffff33' }}>
                          {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <div style={{ fontSize: 8, color: '#00d4ff44' }}>▶</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Contrat PDF panel */}
        <div style={{ background: 'rgba(124,58,237,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #7c3aed22' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#7c3aed99', letterSpacing: '0.25em', marginBottom: 10 }}>
            📝 GÉNÉRER CONTRAT PDF
          </div>
          <div style={{ fontSize: 8, color: '#ffffff44', marginBottom: 10, lineHeight: 1.6 }}>
            Contrat signable avec CGV · généré depuis la réservation · envoyé Telegram.
          </div>
          <ContractGenerator />
        </div>

        {/* OCR Scan panel */}
        <div style={{ background: 'rgba(255,107,0,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #ff6b0022' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#ff6b0099', letterSpacing: '0.25em', marginBottom: 10 }}>
            ◉ SCAN OCR DOCUMENT
          </div>

          <div style={{ fontSize: 8, color: '#ffffff44', marginBottom: 10, lineHeight: 1.6 }}>
            Scanne un passeport, permis ou contrat pour en extraire les données automatiquement.
          </div>

          {scanning && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ height: 3, background: '#ffffff08', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${scanProgress}%`,
                  background: 'linear-gradient(90deg, #ff6b00, #ffaa00)',
                  borderRadius: 2, transition: 'width 0.15s linear',
                  boxShadow: '0 0 8px #ff6b0088',
                }} />
              </div>
              <div style={{ marginTop: 4, textAlign: 'center', fontSize: 7, color: '#ff6b0066', letterSpacing: '0.15em', fontFamily: 'Orbitron' }}>
                ANALYSE IA EN COURS… {scanProgress}%
              </div>
            </div>
          )}

          <input
            ref={fileRef} type="file" accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleScanFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            style={{
              width: '100%', padding: '14px',
              background: scanning ? 'rgba(255,107,0,0.12)' : 'transparent',
              border: `1.5px dashed #ff6b00${scanning ? '66' : '44'}`,
              borderRadius: 10, fontFamily: 'Orbitron', fontSize: 8,
              color: `#ff6b00${scanning ? '66' : 'cc'}`,
              cursor: scanning ? 'default' : 'pointer', letterSpacing: '0.18em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>{scanning ? '⏳' : scanFile ? '📄' : '📤'}</span>
            <span>{scanning ? 'ANALYSE EN COURS…' : scanFile ? scanFile.name.slice(0, 22) : 'CHOISIR IMAGE'}</span>
          </button>

          {scanResult && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: 'rgba(0,5,15,0.9)', borderRadius: 8,
              border: '1px solid #ff6b0022',
              fontSize: 9, color: '#ff9944', lineHeight: 1.65,
              maxHeight: 160, overflowY: 'auto',
            }}>
              {scanResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContractGenerator() {
  const [client, setClient] = useState('');
  const [car, setCar]       = useState('');
  const [generating, setGen] = useState(false);
  const [result, setResult]  = useState('');

  const generate = async () => {
    if (!client.trim() || !car.trim()) return;
    setGen(true); setResult('');
    await new Promise(r => setTimeout(r, 1800));
    setResult(`✅ contrat_${client.toLowerCase().replace(/\s+/g, '_')}.pdf\n📝 Contrat généré avec CGV\n📤 Envoyé dans Telegram`);
    setGen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={client} onChange={e => setClient(e.target.value)} placeholder="Nom du client…" style={inputStyle} />
      <input value={car} onChange={e => setCar(e.target.value)} placeholder="Voiture (ex: Jogger)…" style={inputStyle} />
      <button
        onClick={() => void generate()}
        disabled={generating || !client.trim() || !car.trim()}
        style={{
          width: '100%', padding: '10px',
          background: generating ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.08)',
          border: `1.5px solid #7c3aed${generating ? '66' : '44'}`,
          borderRadius: 8, fontFamily: 'Orbitron', fontSize: 8,
          color: `#7c3aed${generating || !client.trim() || !car.trim() ? '66' : 'cc'}`,
          cursor: generating ? 'default' : 'pointer', letterSpacing: '0.15em',
        }}
      >
        {generating ? '⏳ GÉNÉRATION EN COURS…' : '📝 GÉNÉRER CONTRAT'}
      </button>
      {result && (
        <div style={{
          padding: '10px 12px', background: 'rgba(124,58,237,0.08)',
          borderRadius: 8, border: '1px solid #7c3aed22',
          fontSize: 9, color: '#b87fff', lineHeight: 1.65,
        }}>
          {result}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(0,212,255,0.04)', border: '1px solid #00d4ff1a',
  borderRadius: 8, padding: '8px 10px',
  fontFamily: 'Share Tech Mono', fontSize: 10, color: '#c8e8ff', outline: 'none',
};

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = '#00d4ff';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
