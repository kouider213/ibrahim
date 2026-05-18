import { useState, useRef } from 'react';
import { api, getOrCreateSessionId } from '../../services/api.ts';

const DOC_TYPES = [
  { key: 'passeport', label: '🛂 PASSEPORT', msg: (n: string) => `récupère et envoie moi le passeport de ${n}` },
  { key: 'permis',    label: '🚗 PERMIS',    msg: (n: string) => `récupère et envoie moi le permis de conduire de ${n}` },
  { key: 'contrat',   label: '📝 CONTRAT',   msg: (n: string) => `récupère et envoie moi le contrat de location de ${n}` },
];

export default function DocumentsScreen() {
  const [name, setName]     = useState('');
  const [loading, setLoad]  = useState(false);
  const [result, setResult] = useState('');
  const [scanFile, setScan] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionId = getOrCreateSessionId();

  const fetchDoc = async (docKey: string) => {
    const n = name.trim();
    if (!n) { setResult('⚠️ Entre le nom du client'); return; }
    const docType = DOC_TYPES.find(d => d.key === docKey);
    if (!docType) return;
    setLoad(true);
    setResult('');
    try {
      const r = await api.chat(docType.msg(n), sessionId);
      setResult(r.text ?? 'Pas de réponse');
    } catch (e) {
      setResult(`❌ Erreur: ${e}`);
    } finally { setLoad(false); }
  };

  const handleScanFile = async (file: File) => {
    setScan(file);
    setScanning(true);
    setScanResult('');
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1] ?? '');
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const r = await api.scan(b64, file.type);
      setScanResult(r.description ?? 'Scan terminé');
    } catch (e) {
      setScanResult(`❌ Erreur scan: ${e}`);
    } finally { setScanning(false); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>DOCUMENTS CLIENTS</span>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Fetch document */}
        <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #00d4ff15' }}>
          <div style={{ fontSize: 8, color: '#00d4ff77', letterSpacing: '0.2em', marginBottom: 8 }}>RÉCUPÉRER DOCUMENT</div>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Nom du client…"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {DOC_TYPES.map(d => (
              <button
                key={d.key}
                onClick={() => void fetchDoc(d.key)}
                disabled={loading}
                style={{
                  flex: 1, background: 'transparent', border: '1px solid #00d4ff33',
                  borderRadius: 6, padding: '6px 4px',
                  fontFamily: 'Share Tech Mono', fontSize: 9, color: '#00d4ffaa',
                  cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {d.label.split(' ').map((w, i) => (
                  <div key={i} style={{ fontSize: i === 0 ? 14 : 7 }}>{w}</div>
                ))}
              </button>
            ))}
          </div>
          {loading && <div style={{ marginTop: 8, fontSize: 8, color: '#00d4ff55', textAlign: 'center' }}>Récupération…</div>}
          {result && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#03080f', borderRadius: 8, border: '1px solid #00d4ff22', fontSize: 9, color: '#00d4ffcc', lineHeight: 1.6, maxHeight: 120, overflowY: 'auto' }}>
              {result}
            </div>
          )}
        </div>

        {/* OCR Scan */}
        <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #ff6b0015' }}>
          <div style={{ fontSize: 8, color: '#ff6b0077', letterSpacing: '0.2em', marginBottom: 8 }}>SCAN OCR DOCUMENT</div>
          <div style={{ fontSize: 9, color: '#ffffff55', marginBottom: 8, lineHeight: 1.5 }}>
            Scanne un passeport, permis ou contrat pour en extraire les données.
          </div>
          <input
            ref={fileRef} type="file" accept="image/*"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleScanFile(f); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={scanning}
            style={{
              width: '100%', padding: '8px', background: 'transparent',
              border: '1px dashed #ff6b0066', borderRadius: 8,
              fontFamily: 'Orbitron', fontSize: 8, color: '#ff6b00aa',
              cursor: 'pointer', letterSpacing: '0.15em',
            }}
          >
            {scanning ? 'ANALYSE EN COURS…' : scanFile ? `📄 ${scanFile.name}` : '📤 CHOISIR IMAGE'}
          </button>
          {scanResult && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#03080f', borderRadius: 8, border: '1px solid #ff6b0022', fontSize: 9, color: '#ff6b00cc', lineHeight: 1.6, maxHeight: 150, overflowY: 'auto' }}>
              {scanResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#03080f', border: '1px solid #00d4ff22', borderRadius: 6,
  padding: '6px 8px', fontFamily: 'Share Tech Mono', fontSize: 10, color: '#fff', outline: 'none',
};
