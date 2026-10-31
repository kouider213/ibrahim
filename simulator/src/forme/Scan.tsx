import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, compressImage, vibrate, type MachineScan, type MachineEx } from './api.ts';
import { F, card, btn, ghostBtn, Spinner } from './ui.tsx';
import { ExTile, ExerciseSheet } from './Exercises.tsx';

// 📷 SCANNER (Kouider 31/10) : il prend une machine de la salle en photo → l'appareil est reconnu, comment le régler,
// et les exercices à faire dessus EN IMAGES (tuiles comme la bibliothèque) + un lien vidéo YouTube (pas obligé de l'ouvrir).
// Les machines scannées restent dans « Mes machines » pour la prochaine fois.
const STEPS = ['Je regarde la photo…', 'Je reconnais l\'appareil…', 'Je choisis les exercices…', 'Je prépare les images…'];

export default function ScanScreen({ toast }: { toast: (t: string) => void }) {
  const cam = useRef<HTMLInputElement>(null), lib = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<MachineScan | null>(null);
  const [hist, setHist] = useState<MachineScan[]>([]);
  const [pick, setPick] = useState<MachineEx | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { forme.machines().then(r => setHist(r.machines)).catch(() => {}); }, []);

  const go = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setScan(null); setBusy(true); setStep(0); vibrate(15);
    const tick = setInterval(() => setStep(s => Math.min(STEPS.length - 1, s + 1)), 4500);
    try {
      const [image, thumb] = await Promise.all([compressImage(file, 1024, 0.8), compressImage(file, 220, 0.6)]);
      setPreview(thumb);
      const r = await forme.machine(image, thumb);
      if (!r.scan.machine || !r.scan.exercises.length) { setErr(r.scan.what || 'Je ne vois pas de machine sur la photo — reprends-la avec tout l\'appareil dans le cadre.'); return; }
      setScan(r.scan); vibrate(60);
      setHist(h => [r.scan, ...h.filter(x => x.machine.toLowerCase() !== r.scan.machine.toLowerCase())]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(errText(e)); } finally { clearInterval(tick); setBusy(false); if (cam.current) cam.current.value = ''; if (lib.current) lib.current.value = ''; }
  };

  return (
    <div style={{ padding: '0 14px', overflowX: 'hidden' }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', padding: '4px 2px 4px' }}>Scanner</div>
      <div style={{ fontSize: 14, color: F.muted, margin: '0 2px 14px', lineHeight: 1.4 }}>Prends une machine en photo : je te dis ce que c'est, comment la régler et les exercices à faire dessus, en images.</div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => void go(e.target.files?.[0])} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={e => void go(e.target.files?.[0])} />

      {!scan && !busy && (
        <motion.button whileTap={{ scale: 0.98 }} onClick={() => cam.current?.click()} style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 24, padding: '30px 20px', background: `linear-gradient(160deg, #2c63f2, #5b3fe0)`, color: '#fff', fontFamily: 'inherit', boxShadow: '0 16px 34px rgba(44,99,242,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 76, height: 76, borderRadius: 38, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="4" /></svg>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>Prendre la machine en photo</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Poulie, presse, banc, haltères, cardio…</div>
        </motion.button>
      )}
      {!scan && !busy && <button onClick={() => lib.current?.click()} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>🖼️ Choisir une photo dans la galerie</button>}

      {busy && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24 }}>
          {preview && <img src={preview} alt="" style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 18 }} />}
          <Spinner size={28} />
          <div style={{ fontWeight: 600 }}>{STEPS[step]}</div>
          <div style={{ fontSize: 12.5, color: F.muted }}>~15 à 25 secondes</div>
        </div>
      )}
      {err && !busy && <div style={{ ...card, marginTop: 12, color: F.red, fontWeight: 600 }}>❌ {err}</div>}

      {scan && !busy && <>
        <div style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
          {scan.thumb ? <img src={scan.thumb} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 16, flexShrink: 0 }} /> : <div style={{ width: 84, height: 84, borderRadius: 16, background: F.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>⚙️</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: F.accent, letterSpacing: '0.06em' }}>MACHINE RECONNUE</div>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>{scan.machine}</div>
            <div style={{ fontSize: 13, color: F.muted, marginTop: 4, lineHeight: 1.35 }}>{scan.what}</div>
          </div>
        </div>
        {scan.setup && <div style={{ ...card, marginTop: 10, background: F.soft, boxShadow: 'none', fontSize: 14, lineHeight: 1.45 }}><b>⚙️ Réglage</b><br />{scan.setup}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 2px 10px' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Exercices sur cette machine</div>
          <div style={{ fontSize: 12.5, color: F.muted }}>{scan.exercises.length}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          {scan.exercises.map((x, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <ExTile name={x.name} sub={x.muscles.join(', ')} img={x.img} favId={x.id} onClick={() => setPick(x)} badge={i === 0 ? 'Le classique' : undefined} />
              <a href={x.video} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: 600, color: F.accent, textDecoration: 'none', padding: '6px 4px 0' }}>▶ Vidéo de la technique</a>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => cam.current?.click()} style={{ ...btn, flex: 1 }}>📷 Autre machine</button>
          <button onClick={() => { setScan(null); setErr(''); }} style={{ ...ghostBtn }}>Fermer</button>
        </div>
      </>}

      {hist.length > 0 && <>
        <div style={{ fontWeight: 700, fontSize: 18, margin: '26px 2px 10px' }}>Mes machines</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {hist.map(h => (
            <div key={h.id} style={{ ...card, padding: 10, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }} onClick={() => { setScan(h); setErr(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              {h.thumb ? <img src={h.thumb} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} /> : <div style={{ width: 54, height: 54, borderRadius: 12, background: F.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚙️</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{h.machine}</div>
                <div style={{ fontSize: 12.5, color: F.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.exercises.length} exercices · {h.exercises.map(e => e.name).join(' · ')}</div>
              </div>
              <button aria-label="Supprimer" onClick={async e => { e.stopPropagation(); if (!confirm(`Retirer « ${h.machine} » ?`)) return; try { setHist((await forme.delMachine(h.id)).machines); if (scan?.id === h.id) setScan(null); } catch (x) { toast(errText(x)); } }} style={{ background: 'none', border: 'none', color: F.muted, fontSize: 16, cursor: 'pointer', padding: 8 }}>✕</button>
            </div>
          ))}
        </div>
      </>}
      <ExerciseSheet session={pick ? { name: pick.name, img: pick.img, tip: pick.tip, video: pick.video, id: pick.id } : null} onClose={() => setPick(null)} />
    </div>
  );
}
