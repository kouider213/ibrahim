import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, compressImage, type Overview, type Photo, type Analysis, vibrate } from './api.ts';
import { F, Title, Section, card, darkCard, btn, darkBtn, ghostBtn, Sheet, Spinner, LineChart, Ring, Stat, input, Chip } from './ui.tsx';
import { beep } from './Sport.tsx';
import Insights from './Insights.tsx';

// Onglet CORPS : poids, mensurations et PHOTOS DE SUIVI. Caméra avec la photo d'avant en transparence pour se placer
// pareil, minuteur 10 s (téléphone posé), puis Claude compare avant / maintenant et entoure ce qui a changé.
const TREND = { 'mieux': F.green, 'pareil': F.gold, 'à travailler': F.accent } as const;
const POSES: Array<{ id: Photo['pose']; label: string; tip: string }> = [
  { id: 'face', label: 'Face', tip: 'Bras légèrement écartés, pieds largeur d\'épaules' },
  { id: 'profil', label: 'Profil', tip: 'De côté, bras le long du corps, regard devant' },
  { id: 'dos', label: 'Dos', tip: 'Dos à l\'appareil, bras légèrement écartés' },
];

function Circles({ zones, before }: { zones: Analysis['zones']; before?: boolean }) {
  return <>{zones.map((z, i) => {
    const x = before ? z.bx : z.x, y = before ? z.by : z.y, r = before ? z.br : z.r;
    if (x == null || y == null || r == null) return null;
    const c = TREND[z.trend];
    return (
      <motion.div key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3 + i * 0.15, type: 'spring' }}
        style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: `${r * 200}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: `3px solid ${c}`, boxShadow: `0 0 0 2px rgba(255,255,255,0.7), 0 0 18px ${c}88`, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -11, left: -11, width: 22, height: 22, borderRadius: 11, background: c, color: '#fff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{i + 1}</div>
      </motion.div>
    );
  })}</>;
}

function Framed({ url, zones, before, label }: { url: string | null; zones: Analysis['zones']; before?: boolean; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: F.dark }}>
        {url ? <img src={url} alt={label} style={{ width: '100%', display: 'block' }} /> : <div style={{ aspectRatio: '3/4' }} />}
        <Circles zones={zones} before={before} />
        <div style={{ position: 'absolute', left: 8, bottom: 8, background: before ? 'rgba(0,0,0,0.6)' : F.accent, color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.08em' }}>{label}</div>
      </div>
    </div>
  );
}

export function Compare({ photo, before, a, onReanalyze }: { photo: Photo; before: Photo | null; a: Analysis; onReanalyze?: () => void }) {
  const [mode, setMode] = useState<'side' | 'slide'>('side');
  const [pos, setPos] = useState(50);
  return (
    <div>
      {before && <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['side', 'slide'] as const).map(m => <button key={m} onClick={() => setMode(m)} style={{ ...ghostBtn, flex: 1, padding: '8px', background: mode === m ? F.dark : '#fff', color: mode === m ? '#fff' : F.ink }}>{m === 'side' ? 'Côte à côte' : 'Glisser avant / après'}</button>)}
      </div>}
      {!before || mode === 'side' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {before && <Framed url={before.url} zones={a.zones} before label={`AVANT · ${before.date.slice(8)}/${before.date.slice(5, 7)}`} />}
          <Framed url={photo.url} zones={a.zones} label={before ? `MAINTENANT · ${photo.date.slice(8)}/${photo.date.slice(5, 7)}` : 'DÉPART'} />
        </div>
      ) : (
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', touchAction: 'none' }}
          onPointerMove={e => { if (e.buttons || e.pointerType === 'touch') { const r = e.currentTarget.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); } }}>
          <img src={photo.url ?? ''} alt="" style={{ width: '100%', display: 'block' }} />
          <Circles zones={a.zones} />
          <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <img src={before.url ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 3, background: '#fff', transform: 'translateX(-50%)', boxShadow: '0 0 8px rgba(0,0,0,0.4)' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 36, height: 36, borderRadius: 18, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>⇆</div>
          </div>
          <div style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 900 }}>AVANT</div>
          <div style={{ position: 'absolute', right: 8, top: 8, background: F.accent, color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 900 }}>MAINTENANT</div>
        </div>
      )}
      <div style={{ ...darkCard, marginTop: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
        <Ring value={a.score} max={100} size={78} stroke={8} color={a.score >= 55 ? F.green : a.score >= 45 ? F.gold : F.accent}><div style={{ fontSize: 20, fontWeight: 900 }}>{a.score}</div></Ring>
        <div style={{ fontSize: 14, lineHeight: 1.45 }}>{a.summary}</div>
      </div>
      <Section a="Ce qui a" b="changé" />
      {a.zones.map((z, i) => (
        <div key={i} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: TREND[z.trend], color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
          <div><div style={{ fontWeight: 800 }}>{z.label} <span style={{ fontSize: 12, color: TREND[z.trend], fontWeight: 800 }}>· {z.trend}</span></div><div style={{ fontSize: 13.5, color: F.muted, marginTop: 2 }}>{z.note}</div></div>
        </div>
      ))}
      <Section a="Mes" b="conseils" />
      <div style={{ ...card }}>
        {a.advice.map((x, i) => <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', fontSize: 14.5, lineHeight: 1.4 }}><span>🎯</span><span>{x}</span></div>)}
        {a.focus.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{a.focus.map(f => <span key={f} style={{ background: F.soft, color: F.accent, borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 800 }}>💪 {f}</span>)}</div>}
      </div>
      <div style={{ fontSize: 12, color: F.muted, textAlign: 'center', marginTop: 10 }}>Analyse par Claude · envoyée à Dzaryx · photos privées (jamais partagées)</div>
      {onReanalyze && <button onClick={onReanalyze} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>🔄 Refaire l'analyse</button>}
    </div>
  );
}

function Camera({ ghost, onShot, onClose }: { ghost: string | null; onShot: (dataUrl: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [showGhost, setShowGhost] = useState(true);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 }, ...({ zoom: 1 } as MediaTrackConstraints) }, audio: false })
      .then(s => { stream = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } })
      .catch(() => setFailed(true));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [facing]);
  const snap = () => {
    const v = video.current; if (!v?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d')!;
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0);
    vibrate(80); beep();
    c.toBlob(b => { if (b) void compressImage(b).then(onShot); }, 'image/jpeg', 0.92);
  };
  const timer = () => {
    let n = 10; setCount(n);
    const t = setInterval(() => { n--; if (n > 0) { setCount(n); if (n <= 3) beep(); } else { clearInterval(t); setCount(null); snap(); } }, 1000);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {!failed ? <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
          : <div style={{ color: '#fff', padding: 30, textAlign: 'center', marginTop: 80 }}>Caméra indisponible ici. Utilise le bouton « Galerie / appareil photo » en bas.</div>}
        {ghost && showGhost && !failed && <img src={ghost} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.32, pointerEvents: 'none' }} />}
        {!ghost && !failed && <svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: '8% 18%', width: '64%', height: '84%', opacity: 0.45, pointerEvents: 'none' }}>
          <g fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="3 3"><circle cx="50" cy="16" r="10" /><path d="M30 34 Q50 28 70 34 L76 80 M30 34 L24 80 M36 34 L38 92 L36 150 M64 34 L62 92 L64 150 M38 92 L62 92" /></g>
        </svg>}
        {count != null && <motion.div key={count} initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 120, fontWeight: 900, textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}>{count}</motion.div>}
        <button onClick={onClose} style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', left: 14, ...ghostBtn, width: 42, height: 42, padding: 0, borderRadius: 21 }}>✕</button>
        {ghost && <button onClick={() => setShowGhost(g => !g)} style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 14, ...ghostBtn, padding: '8px 12px', fontSize: 12.5 }}>{showGhost ? 'Masquer' : 'Afficher'} l'ancienne</button>}
      </div>
      <div style={{ background: '#000', padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={() => file.current?.click()} style={{ ...ghostBtn, background: '#222', color: '#fff', border: 'none', fontSize: 12.5 }}>Galerie</button>
        <button onClick={snap} disabled={failed} aria-label="Prendre la photo" style={{ width: 74, height: 74, borderRadius: 37, border: '5px solid #fff', background: F.accent, cursor: 'pointer' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={timer} disabled={failed || count != null} style={{ ...ghostBtn, background: '#222', color: '#fff', border: 'none', fontSize: 12.5 }}>⏱ 10 s</button>
          <button onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')} aria-label="Retourner" style={{ ...ghostBtn, background: '#222', color: '#fff', border: 'none', fontSize: 15 }}>⟲</button>
        </div>
        <input ref={file} type="file" accept="image/*" capture="user" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) onShot(await compressImage(f)); }} />
      </div>
    </div>
  );
}

export default function BodyScreen({ o, onO, toast }: { o: Overview; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const [pose, setPose] = useState<Photo['pose']>('face');
  const [cam, setCam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ photo: Photo; a: Analysis } | null>(null);
  const [mOpen, setMOpen] = useState(false);
  const [m, setM] = useState<Record<string, string>>({});
  const [kg, setKg] = useState('');
  const [goal, setGoal] = useState('');
  const [adapted, setAdapted] = useState<{ date: string; text: string } | null>(null);
  const [adapting, setAdapting] = useState(false);
  const [adaptAfter, setAdaptAfter] = useState(false);
  const adapt = async () => {
    setAdapting(true);
    try { setAdapted(await forme.adapt(goal.trim())); vibrate(60); } catch (e) { toast(errText(e)); } finally { setAdapting(false); }
  };
  const start = o.weights[0]?.kg ?? o.profile.weightKg, cur = o.weights[o.weights.length - 1]?.kg ?? o.profile.weightKg;
  const lastOf = (p: Photo['pose']) => o.photos.find(x => x.pose === p) ?? null;
  const beforeOf = (ph: Photo) => (ph.analysis?.vs ? o.photos.find(x => x.id === ph.analysis!.vs) : null) ?? null;

  const shot = async (dataUrl: string) => {
    setCam(false); setBusy(true);
    try {
      const r = await forme.bodyPhoto(dataUrl, pose, goal.trim(), adaptAfter);
      const fresh = await forme.overview(); onO(fresh);
      const ph = fresh.photos.find(x => x.id === r.photo.id) ?? { ...r.photo, url: dataUrl };
      if ('error' in r.analysis) toast(`Photo gardée, analyse impossible : ${r.analysis.error}`);
      else { setView({ photo: ph, a: r.analysis }); vibrate(60); }
      if (r.adapted?.date) { setAdapted(r.adapted); toast('🎯 Séance de demain refaite (agenda compris)'); }
      setAdaptAfter(false);
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const logKg = async () => { const v = Number(kg.replace(',', '.')); if (!(v > 30)) return; onO(await forme.log('weight', { kg: v })); setKg(''); toast('⚖️ Poids noté'); };

  return (
    <div style={{ padding: '6px 18px 0' }}>
      <Title a="Ton" b="évolution" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat v={`${cur}`} l="kg aujourd'hui" />
        <Stat v={`${cur - start > 0 ? '+' : ''}${(cur - start).toFixed(1)}`} l="kg depuis le début" color={cur <= start ? F.green : F.accent} />
        {o.profile.targetKg ? <Stat v={`${Math.max(0, cur - o.profile.targetKg).toFixed(1)}`} l={`kg avant ${o.profile.targetKg}`} color={F.accent} /> : <Stat v="—" l="objectif à régler (profil)" />}
      </div>
      {o.eta && <div style={{ ...card, marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ fontSize: 30 }}>🎯</span><div><b>{o.profile.targetKg} kg vers le {o.eta.slice(8)}/{o.eta.slice(5, 7)}/{o.eta.slice(0, 4)}</b><div style={{ fontSize: 13, color: F.muted }}>à ton rythme actuel ({o.weightRate} kg/semaine) — continue comme ça</div></div></div>}
      {o.tooFast && <div style={{ ...card, marginTop: 10, background: '#fff4e5', fontSize: 13.5, lineHeight: 1.4 }}>⚠️ Tu perds {o.weightRate} kg/semaine : un peu vite. Pour garder ton muscle : atteins tes {o.targets.p} g de protéines chaque jour et ne saute pas la muscu. Parles-en à ton médecin au prochain contrôle.</div>}
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontWeight: 800 }}>⚖️ Courbe de poids</div>{o.weightRate != null && <div style={{ fontSize: 12.5, color: F.muted, fontWeight: 700 }}>{o.weightRate > 0 ? '−' : '+'}{Math.abs(o.weightRate)} kg/sem.</div>}</div>
        <LineChart points={o.weights.slice(-30).map(w => ({ x: w.date, y: w.kg }))} goal={o.profile.targetKg} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder="Poids du jour (kg)" style={input} />
          <button onClick={logKg} style={{ ...btn, padding: '0 18px' }}>OK</button>
        </div>
      </div>

      <Insights />
      <Section a="Photos" b="de suivi" right={o.photoDue ? '📸 à faire' : undefined} />
      <div style={{ ...darkCard }}>
        <div style={{ fontSize: 14.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.8)' }}>Même endroit, même lumière, même heure. Ta photo d'avant s'affiche en transparence pour te placer pareil. L'IA entoure ce qui a changé et te dit quoi travailler.</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          {POSES.map(p => <button key={p.id} onClick={() => setPose(p.id)} style={{ ...ghostBtn, flex: 1, background: pose === p.id ? F.accent : 'rgba(255,255,255,0.08)', color: '#fff', border: 'none' }}>{p.label}</button>)}
        </div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>{POSES.find(p => p.id === pose)!.tip}</div>
        <button disabled={busy} onClick={() => setCam(true)} style={{ ...btn, width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>{busy ? <><Spinner size={18} color="#fff" /> Analyse en cours… (~20 s)</> : `📸 Prendre ma photo ${POSES.find(p => p.id === pose)!.label.toLowerCase()}`}</button>
      </div>
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>🎯 Ce que je veux perdre ou améliorer</div>
        <div style={{ fontSize: 13, color: F.muted, margin: '4px 0 10px', lineHeight: 1.4 }}>Avec tes photos analysées, le coach refait ta prochaine séance exercice par exercice (programme + agenda).</div>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} placeholder="ex. le ventre et les poignées d'amour, plus de pecs" style={{ ...input, resize: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>{['Le ventre', "Les poignées d'amour", 'Le bas du dos', 'Plus de pecs', 'Les bras', 'Les cuisses', 'Le dos plus large'].map(x => <Chip key={x} onClick={() => setGoal(g => g ? `${g}, ${x.toLowerCase()}` : x)}>{x}</Chip>)}</div>
        <button disabled={busy} onClick={() => { setAdaptAfter(true); setCam(true); }} style={{ ...darkBtn, width: '100%', marginBottom: 8, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>{busy && adaptAfter ? <><Spinner size={18} color="#fff" /> Analyse + nouvelle séance…</> : `📸 Photo ${POSES.find(p => p.id === pose)!.label.toLowerCase()} + adapter ma séance`}</button>
        <button disabled={adapting} onClick={adapt} style={{ ...btn, width: '100%', display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>{adapting ? <><Spinner size={18} color="#fff" /> Le coach prépare ta séance…</> : goal.trim() ? '🎯 Adapter ma séance de demain' : '🎯 Le coach choisit pour moi (sans photo)'}</button>
        <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>Sans rien écrire, le coach regarde tes photos et te dit lui-même quoi perdre. Tu peux aussi envoyer ta photo à Dzaryx sur Telegram : il répond avec ta photo entourée ⭕ et refait ta séance.</div>
      </div>
      {o.photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          {o.photos.map(ph => (
            <button key={ph.id} onClick={() => ph.analysis ? setView({ photo: ph, a: ph.analysis }) : undefined} style={{ position: 'relative', padding: 0, border: 'none', borderRadius: 14, overflow: 'hidden', aspectRatio: '3/4', background: F.dark, cursor: 'pointer' }}>
              {ph.url && <img src={ph.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', color: '#fff', fontSize: 11, fontWeight: 800, textAlign: 'left' }}>{ph.date.slice(8)}/{ph.date.slice(5, 7)} · {ph.pose}{ph.weight ? ` · ${ph.weight} kg` : ''}</div>
              {ph.analysis && <div style={{ position: 'absolute', top: 5, right: 5, background: F.accent, color: '#fff', borderRadius: 8, padding: '2px 6px', fontSize: 10.5, fontWeight: 900 }}>⭕ {ph.analysis.score}</div>}
            </button>
          ))}
        </div>
      )}

      <Section a="Mensurations" right="+ Noter" onRight={() => setMOpen(true)} />
      <div style={{ ...card }}>
        {o.measures.length ? (() => {
          const first = o.measures[0]!, last = o.measures[o.measures.length - 1]!;
          return ['taille', 'hanches', 'poitrine', 'bras', 'cuisse'].filter(k => last[k] != null).map(k => {
            const d = Number(last[k]) - Number(first[k] ?? last[k]);
            return <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${F.line}`, fontSize: 14.5 }}><span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{k}</span><span><b>{last[k]} cm</b> {d !== 0 && <span style={{ color: (k === 'bras' || k === 'poitrine') === d > 0 ? F.green : F.accent, fontWeight: 800, fontSize: 13 }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>}</span></div>;
          });
        })() : <div style={{ color: F.muted, fontSize: 14 }}>Le tour de taille dit souvent mieux la vérité que la balance (le muscle pèse lourd). Note-le toutes les 2 semaines.</div>}
      </div>

      <Sheet open={!!adapted} onClose={() => setAdapted(null)} title={<Title a="Ta séance" b="sur mesure" size={24} />}>
        {adapted && <><div style={{ ...card, fontSize: 14.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{adapted.text}</div>
          <div style={{ fontSize: 13, color: F.muted, marginTop: 10 }}>📅 {adapted.date.slice(8)}/{adapted.date.slice(5, 7)} · déjà dans ton onglet Sport{o.uid === 'kouider' ? ' et ton agenda' : ''}.</div></>}
      </Sheet>
      <Sheet open={mOpen} onClose={() => setMOpen(false)} title="Mensurations">
        <div style={{ fontSize: 13.5, color: F.muted, marginBottom: 10 }}>Mètre ruban, le matin, sans serrer. Taille = au niveau du nombril.</div>
        {['taille', 'hanches', 'poitrine', 'bras', 'cuisse'].map(k => <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}><span style={{ width: 80, fontWeight: 700, textTransform: 'capitalize' }}>{k}</span><input inputMode="decimal" placeholder="cm" value={m[k] ?? ''} onChange={e => setM({ ...m, [k]: e.target.value })} style={input} /></label>)}
        <button onClick={async () => { onO(await forme.log('measures', { measures: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(v.replace(',', '.'))])) })); setM({}); setMOpen(false); toast('📏 Mensurations notées'); }} style={{ ...btn, width: '100%' }}>Enregistrer</button>
      </Sheet>
      <Sheet open={!!view} onClose={() => setView(null)} title={<Title a="Avant /" b="maintenant" size={24} />}>
        {view && <Compare photo={view.photo} before={beforeOf(view.photo)} a={view.a} onReanalyze={async () => { setBusy(true); try { const r = await forme.analyze(view.photo.id); setView({ ...view, a: r.analysis }); onO(await forme.overview()); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} />}
      </Sheet>
      {cam && <Camera ghost={lastOf(pose)?.url ?? null} onShot={shot} onClose={() => setCam(false)} />}
    </div>
  );
}
