// Caméra du téléphone → Nexus : le PC voit en direct (widget sur l'écran Nexus), lit / analyse ce qu'on lui montre,
// et range les photos / vidéos dans Images/Dzaryx Caméra du PC. Les ordres vocaux donnés à Nexus (« prends-la en photo »,
// « filme 10 secondes ») reviennent ici dans la réponse de /frame et sont exécutés en pleine qualité.
import { useEffect, useRef, useState } from 'react';
import { apiFetch, speakOnDevice } from '../../services/api.ts';

const C = {
  bg: '#04070d', glass: 'rgba(8,20,32,0.72)', border: 'rgba(56,216,245,0.28)', cyan: '#38d8f5',
  text: '#e8fbff', muted: '#8fb3c0', red: '#ff4d6d', green: '#4ade80',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

type Cmd = { id: string; cmd: 'photo' | 'video' | 'switch' | 'stop'; secs?: number; label?: string };

// À quoi sert la caméra pour Kouider : chaque usage = une question précise posée à Nexus sur l'image en cours
const USES: Array<{ icon: string; label: string; q: string; save?: string }> = [
  { icon: '🚗', label: 'État voiture',  q: "Fais l'état des lieux de cette partie de la voiture : rayures, chocs, jantes, pneus. Liste ce que tu vois.", save: 'etat_voiture' },
  { icon: '📄', label: 'Lire document', q: 'Lis ce document et recopie les informations importantes (noms, dates, montants, numéros).', save: 'document' },
  { icon: '🪪', label: 'Permis / CNI',  q: 'Recopie nom, prénom, date de naissance, numéro et date de validité de cette pièce.', save: 'piece_identite' },
  { icon: '🔢', label: 'Plaque / km',   q: "Lis la plaque d'immatriculation ou le compteur kilométrique et le niveau de carburant visibles." },
  { icon: '⚠️', label: 'Voyant',        q: "Quel est ce voyant du tableau de bord, est-ce grave et que faut-il faire ?" },
  { icon: '🧾', label: 'Ticket / facture', q: 'Lis ce ticket ou cette facture : commerçant, date, total, TVA, ce qui a été payé.', save: 'facture' },
  { icon: '🔧', label: 'Identifier',    q: "Qu'est-ce que c'est exactement (pièce, objet, modèle) et où le trouver / combien ça coûte environ ?" },
];

export default function PhoneCamScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facing = useRef<'environment' | 'user'>('environment');
  const busy = useRef(false);
  const [on, setOn] = useState(false);
  const [pc, setPc] = useState<boolean | null>(null);
  const [rec, setRec] = useState(0);
  const [msg, setMsg] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState('');
  const [q, setQ] = useState('');

  async function open(mode = facing.current) {
    streamRef.current?.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
  }

  async function start() {
    try { await open(); setOn(true); setMsg('Nexus voit ta caméra'); }
    catch { setMsg('Caméra refusée : autorise la caméra pour Dzaryx dans les réglages du téléphone.'); }
  }

  function stop() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setOn(false);
    void apiFetch('/api/phonecam/stop', { method: 'POST' }).catch(() => {});
  }

  async function flip() {
    facing.current = facing.current === 'environment' ? 'user' : 'environment';
    try { await open(facing.current); } catch { setMsg('Impossible de changer de caméra'); }
  }

  function grab(maxW: number, quality: number): string | null {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const scale = Math.min(1, maxW / (v.videoWidth || maxW));
    const cv = document.createElement('canvas');
    cv.width = Math.round((v.videoWidth || 640) * scale); cv.height = Math.round((v.videoHeight || 480) * scale);
    cv.getContext('2d')?.drawImage(v, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', quality).split(',')[1] ?? null;
  }

  async function sendMedia(kind: 'photo' | 'video', data: string, mime: string, label = '') {
    setMsg(kind === 'photo' ? 'Photo envoyée au PC…' : 'Vidéo envoyée au PC…');
    try {
      const r = await apiFetch<{ ok: boolean; path?: string; error?: string }>('/api/phonecam/media', {
        method: 'POST', body: JSON.stringify({ kind, data, mime, label }),
      });
      setMsg(r.ok ? `✓ Rangée sur le PC : ${String(r.path ?? '').split(/[\\/]/).slice(-2).join('/')}` : `❌ ${r.error}`);
    } catch (e) { setMsg(`❌ ${e instanceof Error ? e.message : 'envoi impossible'}`); }
  }

  async function photo(label = '') {
    const data = grab(2560, 0.9);
    if (data) await sendMedia('photo', data, 'image/jpeg', label);
  }

  async function video(secs = 10, label = '') {
    const s = streamRef.current;
    if (!s || rec || typeof MediaRecorder === 'undefined') return;
    const mime = ['video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) ?? '';
    const mr = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 1_500_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      setRec(0);
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'video/webm' });
      const b64 = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] ?? ''); fr.readAsDataURL(blob); });
      await sendMedia('video', b64, blob.type, label);
    };
    mr.start(1000);
    const end = Date.now() + secs * 1000;
    setRec(secs);
    const t = setInterval(() => {
      const left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { clearInterval(t); if (mr.state !== 'inactive') mr.stop(); } else setRec(left);
    }, 250);
  }

  async function ask(question: string, label?: string) {
    if (!on || asking) return;
    setAsking(question); setAnswer('');
    try {
      const r = await apiFetch<{ ok: boolean; text?: string; error?: string }>('/api/phonecam/ask', { method: 'POST', body: JSON.stringify({ question }) });
      const text = r.text || r.error || 'Pas de réponse';
      setAnswer(text); speakOnDevice(text);
      if (label && r.ok) void photo(label);
    } catch (e) { setAnswer(`❌ ${e instanceof Error ? e.message : 'Nexus injoignable'}`); }
    finally { setAsking(''); }
  }

  // Flux vers le PC : ~3 images/s en basse définition + ordres de Nexus en retour
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const tick = async () => {
      if (!alive || busy.current) return;
      const data = grab(560, 0.55);
      if (!data) return;
      busy.current = true;
      try {
        const r = await apiFetch<{ ok: boolean; pc: boolean; cmds: Cmd[] }>('/api/phonecam/frame', {
          method: 'POST', body: JSON.stringify({ data, w: videoRef.current?.videoWidth, h: videoRef.current?.videoHeight }),
        });
        setPc(r.pc);
        for (const c of r.cmds ?? []) {
          if (c.cmd === 'photo') void photo(c.label);
          else if (c.cmd === 'video') void video(c.secs ?? 10, c.label);
          else if (c.cmd === 'switch') void flip();
          else if (c.cmd === 'stop') stop();
        }
      } catch { setPc(false); }
      finally { busy.current = false; }
    };
    const iv = setInterval(tick, 350);
    return () => { alive = false; clearInterval(iv); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const btn = (bg: string): React.CSSProperties => ({
    width: 58, height: 58, borderRadius: 29, border: `1px solid ${C.border}`, background: bg, color: C.text,
    fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)',
  });

  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, color: C.text, fontFamily: C.font, overflow: 'hidden' }}>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: on ? 1 : 0 }} />

      {/* HUD haut */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', background: 'linear-gradient(#04070de6, transparent)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.cyan, fontWeight: 700 }}>NEXUS · VISION</div>
        <div style={{ flex: 1 }} />
        {on && <span style={{ fontSize: 10, letterSpacing: 1.5, padding: '4px 9px', borderRadius: 10, border: `1px solid ${pc ? C.green : C.red}66`, color: pc ? C.green : C.red }}>
          {pc === null ? '…' : pc ? '● PC EN DIRECT' : '● PC HORS LIGNE'}</span>}
        {rec > 0 && <span style={{ fontSize: 11, padding: '4px 9px', borderRadius: 10, background: C.red, fontWeight: 700 }}>● REC {rec}s</span>}
      </div>

      {!on && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 16 }}>
          <div style={{ width: 120, height: 120, borderRadius: 60, border: `2px solid ${C.cyan}`, boxShadow: `0 0 40px ${C.cyan}55, inset 0 0 30px ${C.cyan}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46 }}>👁️</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Montre-le à Nexus</div>
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5, maxWidth: 320 }}>
            Ta caméra s'affiche en direct sur l'écran de ton PC. Dis à Nexus « tu vois ça ? », « prends-la en photo » ou « filme 10 secondes » :
            il lit, analyse et range tout dans <b style={{ color: C.text }}>Images › Dzaryx Caméra</b>.
          </div>
          <button onClick={start} style={{ marginTop: 6, padding: '15px 30px', borderRadius: 30, border: 'none', background: `linear-gradient(135deg, ${C.cyan}, #2563eb)`, color: '#001018', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>
            MONTRER À NEXUS
          </button>
          {msg && <div style={{ fontSize: 12, color: C.red }}>{msg}</div>}
        </div>
      )}

      {on && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 0 18px', background: 'linear-gradient(transparent, #04070df0 30%)' }}>
          {(answer || asking) && (
            <div style={{ margin: '0 14px 10px', padding: '11px 13px', borderRadius: 14, background: C.glass, border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.5, maxHeight: 170, overflowY: 'auto', whiteSpace: 'pre-wrap', backdropFilter: 'blur(12px)' }}>
              {asking ? <span style={{ color: C.cyan }}>Nexus regarde…</span> : answer}
            </div>
          )}
          <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 14px 10px', scrollbarWidth: 'none' }}>
            {USES.map(u => (
              <button key={u.label} onClick={() => ask(u.q, u.save)} disabled={!!asking}
                style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 18, border: `1px solid ${C.border}`, background: C.glass, color: C.text, fontSize: 12, backdropFilter: 'blur(10px)', opacity: asking ? 0.5 : 1 }}>
                {u.icon} {u.label}
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (q.trim()) { void ask(q.trim()); setQ(''); } }} style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Demande à Nexus ce qu'il voit…"
              style={{ flex: 1, minWidth: 0, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 20, padding: '10px 14px', color: C.text, fontSize: 14, outline: 'none' }} />
          </form>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '0 20px' }}>
            <button onClick={stop} style={btn('rgba(255,77,109,0.25)')} title="Arrêter">✕</button>
            <button onClick={() => photo()} title="Photo sur le PC"
              style={{ width: 74, height: 74, borderRadius: 37, border: `4px solid ${C.text}`, background: 'rgba(255,255,255,0.15)' }} />
            <button onClick={() => video(10)} disabled={rec > 0} style={btn(rec ? C.red : 'rgba(255,77,109,0.18)')} title="Vidéo 10 s">⏺</button>
            <button onClick={flip} style={btn(C.glass)} title="Retourner">🔄</button>
          </div>
          {msg && <div style={{ textAlign: 'center', fontSize: 11.5, color: C.muted, marginTop: 10, padding: '0 16px' }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
