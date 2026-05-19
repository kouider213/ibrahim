import { useState, useRef } from 'react';
import { api, getOrCreateSessionId } from '../../services/api.ts';

const DOC_TYPES = [
  { key: 'passeport', label: 'PASSEPORT', icon: '🛂', msg: (n: string) => `récupère et envoie moi le passeport de ${n}` },
  { key: 'permis',    label: 'PERMIS',    icon: '🚗', msg: (n: string) => `récupère et envoie moi le permis de conduire de ${n}` },
  { key: 'contrat',   label: 'CONTRAT',   icon: '📝', msg: (n: string) => `récupère et envoie moi le contrat de location de ${n}` },
];

export default function DocumentsScreen() {
  const [name, setName]         = useState('');
  const [loading, setLoad]      = useState(false);
  const [result, setResult]     = useState('');
  const [scanFile, setScan]     = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionId = getOrCreateSessionId();

  const fetchDoc = async (docKey: string) => {
    const n = name.trim();
    if (!n) { setResult('⚠️ Entre le nom du client'); return; }
    const docType = DOC_TYPES.find(d => d.key === docKey);
    if (!docType) return;
    setLoad(true); setResult('');
    try {
      const r = await api.chat(docType.msg(n), sessionId);
      setResult(r.text ?? 'Pas de réponse');
    } catch (e) { setResult(`❌ Erreur: ${e}`); }
    finally { setLoad(false); }
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

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            DOCUMENTS
          </div>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff44', letterSpacing: '0.2em' }}>
            BASE CLIENTS
          </span>
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Fetch document panel */}
        <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #00d4ff1a' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#00d4ff77', letterSpacing: '0.25em', marginBottom: 10 }}>
            ▶ RÉCUPÉRER DOCUMENT CLIENT
          </div>

          {/* Client name input */}
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Nom du client…"
            style={inputStyle}
          />

          {/* Doc type buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {DOC_TYPES.map(d => (
              <button
                key={d.key}
                onClick={() => void fetchDoc(d.key)}
                disabled={loading}
                style={{
                  flex: 1, background: loading ? 'rgba(0,212,255,0.03)' : 'rgba(0,212,255,0.08)',
                  border: `1px solid #00d4ff${loading ? '18' : '44'}`,
                  borderRadius: 10, padding: '10px 6px',
                  fontFamily: 'Orbitron', color: `#00d4ff${loading ? '55' : 'cc'}`,
                  cursor: loading ? 'default' : 'pointer', textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontSize: 18, marginBottom: 4 }}>{d.icon}</div>
                <div style={{ fontSize: 7, letterSpacing: '0.12em' }}>{d.label}</div>
              </button>
            ))}
          </div>

          {loading && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 8, color: '#00d4ff55', letterSpacing: '0.2em', fontFamily: 'Orbitron' }}>
              RÉCUPÉRATION EN COURS…
            </div>
          )}

          {result && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: 'rgba(0,5,15,0.9)', borderRadius: 8,
              border: '1px solid #00d4ff22',
              fontSize: 9, color: '#00d4ffcc', lineHeight: 1.65,
              maxHeight: 120, overflowY: 'auto',
            }}>
              {result}
            </div>
          )}
        </div>

        {/* OCR Scan panel */}
        <div style={{ background: 'rgba(255,107,0,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #ff6b0022' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#ff6b0099', letterSpacing: '0.25em', marginBottom: 10 }}>
            ◉ SCAN OCR DOCUMENT
          </div>

          <div style={{ fontSize: 8, color: '#ffffff44', marginBottom: 10, lineHeight: 1.6 }}>
            Scanne un passeport, permis ou contrat pour en extraire les données automatiquement.
          </div>

          {/* Progress bar */}
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
            <span>
              {scanning ? 'ANALYSE EN COURS…' : scanFile ? scanFile.name.slice(0, 22) : 'CHOISIR IMAGE'}
            </span>
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
