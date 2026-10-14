import { useState, useEffect, useRef, useCallback } from 'react';
import { api, business } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

// Piloter le PC (Nexus) depuis le téléphone : écran en direct au doigt, clavier, télécommande,
// et « Demande à Nexus » à l'écrit ou à la voix (même cerveau que sur le PC).

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', red: '#f87171', amber: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

type Frame = { src: string; at: string };
type Msg = { who: 'me' | 'nexus'; text: string };
type Pt = { x: number; y: number; nx: number; ny: number };

const QUALITY = { net: { scale: 0.6, quality: 55 }, rapide: { scale: 0.4, quality: 40 } } as const;
const LIVE_MAX_MS = 5 * 60_000;     // le direct s'arrête seul après 5 min sans toucher (données mobiles)
const CHIPS = ['Ouvre Spotify', 'Ouvre Chrome', 'Volume 30', 'Coupe le son', 'Verrouille le PC', 'Mets le PC en veille et réveille-le demain à 8h'];

export default function NexusScreen() {
  const [status, setStatus]   = useState<{ online: boolean; launcher: boolean; text: string } | null>(null);
  const [frame, setFrame]     = useState<Frame | null>(null);
  const [live, setLive]       = useState(false);
  const [quality, setQuality] = useState<keyof typeof QUALITY>('net');
  const [dragMode, setDragMode] = useState<'scroll' | 'drag'>('scroll');
  const [full, setFull]       = useState(false);
  const [mark, setMark]       = useState<{ x: number; y: number; kind: string } | null>(null);
  const [kb, setKb]           = useState('');
  const [enterAfter, setEnterAfter] = useState(true);
  const [ask, setAsk]         = useState('');
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [busy, setBusy]       = useState('');
  const [recording, setRecording] = useState(false);
  const [toast, setToast]     = useState('');

  const imgRef     = useRef<HTMLImageElement | null>(null);
  const liveRef    = useRef(false);
  const lastTouch  = useRef(Date.now());
  const press      = useRef<{ p: Pt; t: number; cx: number; cy: number; moved: boolean; long: boolean; lastY: number } | null>(null);
  const longTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap    = useRef<{ t: number; cx: number; cy: number } | null>(null);
  const recRef     = useRef<MediaRecorder | null>(null);
  const chunks     = useRef<Blob[]>([]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const online = !!status?.online;

  // ── État ──────────────────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    try { setStatus(await business.nexusRemoteStatus()); }
    catch { setStatus({ online: false, launcher: false, text: 'Serveur injoignable.' }); }
  }, []);
  useEffect(() => {
    void refreshStatus();
    const t = setInterval(refreshStatus, 15_000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  // ── Image de l'écran ──────────────────────────────────────────────────────
  const grab = useCallback(async () => {
    const r = await business.nexusLive<{ ok: boolean; image_base64?: string; error?: string }>('frame', { ...QUALITY[quality] });
    if (r.ok && r.image_base64) {
      setFrame({ src: `data:image/jpeg;base64,${r.image_base64}`, at: new Date().toLocaleTimeString('fr-FR') });
      return true;
    }
    return false;
  }, [quality]);

  useEffect(() => {
    liveRef.current = live;
    if (!live) return;
    lastTouch.current = Date.now();
    let stop = false;
    (async () => {
      while (!stop && liveRef.current) {
        if (Date.now() - lastTouch.current > LIVE_MAX_MS) { setLive(false); flash('Direct en pause (5 min sans toucher)'); break; }
        if (document.hidden) { await sleep(1000); continue; }
        const ok = await grab();
        await sleep(ok ? 250 : 2000);
      }
    })();
    return () => { stop = true; };
  }, [live, grab]);

  useEffect(() => { if (online && !frame) void grab(); }, [online, frame, grab]);

  // Après une action hors direct : une image fraîche pour voir le résultat
  const after = useCallback(() => {
    lastTouch.current = Date.now();
    if (!liveRef.current) setTimeout(() => { void grab(); }, 700);
  }, [grab]);

  // ── Doigt sur l'écran → souris du PC ──────────────────────────────────────
  const pointAt = (cx: number, cy: number): Pt | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const nx = (cx - r.left) / r.width, ny = (cy - r.top) / r.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    const w = img.naturalWidth / QUALITY[quality].scale, h = img.naturalHeight / QUALITY[quality].scale;
    return { nx, ny, x: Math.round(nx * w), y: Math.round(ny * h) };
  };

  const showMark = (cx: number, cy: number, kind: string) => {
    const r = imgRef.current?.parentElement?.getBoundingClientRect();
    if (!r) return;
    setMark({ x: cx - r.left, y: cy - r.top, kind });
    setTimeout(() => setMark(null), 450);
  };

  const click = (p: Pt, button: 'left' | 'right' | 'double', cx: number, cy: number) => {
    showMark(cx, cy, button);
    void business.nexusLive('click', { ...p, button }).then(r => { if (!r.ok) flash(r.error ?? 'Clic raté'); after(); });
  };

  const onDown = (e: React.PointerEvent) => {
    if (!online) return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    press.current = { p, t: Date.now(), cx: e.clientX, cy: e.clientY, moved: false, long: false, lastY: e.clientY };
    longTimer.current = setTimeout(() => {
      const pr = press.current;
      if (pr && !pr.moved) { pr.long = true; navigator.vibrate?.(25); click(pr.p, 'right', pr.cx, pr.cy); }
    }, 550);
  };

  const onMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    if (Math.hypot(e.clientX - pr.cx, e.clientY - pr.cy) > 10) {
      pr.moved = true;
      if (longTimer.current) clearTimeout(longTimer.current);
    }
    if (pr.moved && dragMode === 'scroll') {
      const dy = e.clientY - pr.lastY;
      if (Math.abs(dy) >= 28) {
        pr.lastY = e.clientY;
        void business.nexusLive('scroll', { direction: dy > 0 ? 'up' : 'down', amount: Math.min(6, Math.round(Math.abs(dy) / 28) * 2) });
      }
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const pr = press.current;
    press.current = null;
    if (longTimer.current) clearTimeout(longTimer.current);
    if (!pr || pr.long) return;
    if (pr.moved) {
      if (dragMode === 'drag') {
        const to = pointAt(e.clientX, e.clientY);
        if (to) void business.nexusLive('drag', { from: pr.p, to }).then(() => after());
      } else after();
      return;
    }
    // Double tap = double clic ; sinon clic simple (petit délai pour reconnaître le double)
    const prev = lastTap.current;
    if (prev && Date.now() - prev.t < 300 && Math.hypot(prev.cx - pr.cx, prev.cy - pr.cy) < 30) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = null;
      click(pr.p, 'double', pr.cx, pr.cy);
      return;
    }
    lastTap.current = { t: Date.now(), cx: pr.cx, cy: pr.cy };
    tapTimer.current = setTimeout(() => { lastTap.current = null; click(pr.p, 'left', pr.cx, pr.cy); }, 260);
  };

  // ── Clavier ───────────────────────────────────────────────────────────────
  const key = (body: Record<string, unknown>, label: string) => {
    if (!online) return;
    void business.nexusLive('key', body).then(r => { if (!r.ok) flash(`${label} : ${r.error ?? 'raté'}`); after(); });
  };
  const typeText = async () => {
    if (!kb || !online) return;
    const r = await business.nexusLive('key', { text: kb });
    if (!r.ok) { flash(r.error ?? 'Texte non envoyé'); return; }
    if (enterAfter) await business.nexusLive('key', { key: 'enter' });
    setKb(''); after();
  };

  // ── Demande à Nexus (écrit ou voix) ───────────────────────────────────────
  const say = async (command: string, confirmed = false) => {
    const c = command.trim();
    if (!c || busy) return;
    if (!confirmed) setMsgs(m => [...m, { who: 'me' as const, text: c }].slice(-12));
    setAsk(''); setBusy('say');
    try {
      const r = await business.nexusSay(c, confirmed);
      const text = r.text ?? r.error ?? 'Pas de réponse.';
      if (!confirmed && text.startsWith('Pas encore fait')) {
        setBusy('');
        if (window.confirm(`Confirmer sur le PC : « ${c} » ?`)) { void say(c, true); return; }
        setMsgs(m => [...m, { who: 'nexus' as const, text: 'Annulé.' }]);
        return;
      }
      setMsgs(m => [...m, { who: 'nexus' as const, text }].slice(-12));
      after();
    } catch (e) { setMsgs(m => [...m, { who: 'nexus' as const, text: `Erreur : ${e instanceof Error ? e.message : e}` }]); }
    finally { setBusy(''); }
  };

  const toggleMic = async () => {
    if (recording) {
      const rec = recRef.current;
      if (rec && rec.state !== 'inactive') await new Promise<void>(r => { rec.onstop = () => r(); rec.stop(); });
      rec?.stream.getTracks().forEach(t => t.stop());
      recRef.current = null; setRecording(false);
      const blob = new Blob(chunks.current, { type: rec?.mimeType || 'audio/webm' });
      chunks.current = [];
      if (blob.size < 500) return;
      setBusy('stt');
      try {
        const b64 = await blobToB64(blob);
        const { text } = await api.transcribe(b64, blob.type.split(';')[0]);
        if (text?.trim()) void say(text.trim());
      } catch { flash('Voix non comprise'); }
      finally { setBusy(b => (b === 'stt' ? '' : b)); }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start(100);
      recRef.current = rec; setRecording(true);
    } catch { flash('Micro refusé'); }
  };

  // ── Entretien ─────────────────────────────────────────────────────────────
  const maint = async (kind: 'wake' | 'update' | 'restart') => {
    if (busy) return;
    if (kind === 'update' && !window.confirm('Mettre à jour Nexus maintenant ? (quelques minutes, puis il redémarre)')) return;
    setBusy(kind);
    try {
      const r = kind === 'wake' ? await business.nexusWakePc() : kind === 'update' ? await business.nexusUpdate() : await business.nexusRestart();
      setMsgs(m => [...m, { who: 'nexus' as const, text: (r.text ?? r.error ?? 'Fait.').replace(/\*\*/g, '') }].slice(-12));
      setTimeout(() => { void refreshStatus(); }, kind === 'wake' ? 8000 : 4000);
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(''); }
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const dot = status === null ? C.amber : online ? C.accent : C.red;
  const screen = (
    <div style={{ position: 'relative', background: '#000', borderRadius: full ? 0 : 14, overflow: 'hidden', border: full ? 'none' : `1px solid ${C.border}`, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(full ? { width: '100%', height: '100%' } : { minHeight: 180 }) }}>
      {frame ? (
        <img ref={imgRef} src={frame.src} alt="Écran du PC" draggable={false}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { press.current = null; }}
          onContextMenu={e => e.preventDefault()}
          style={full ? { maxWidth: '100%', maxHeight: '100%', display: 'block' } : { width: '100%', height: 'auto', display: 'block' }} />
      ) : (
        <div style={{ color: C.muted, fontSize: 13, padding: 30, textAlign: 'center' }}>
          {online ? 'Chargement de l\'écran…' : 'PC non connecté'}
        </div>
      )}
      {mark && <div style={{ position: 'absolute', left: mark.x - 18, top: mark.y - 18, width: 36, height: 36, borderRadius: '50%', border: `3px solid ${mark.kind === 'right' ? C.amber : C.accent}`, pointerEvents: 'none', boxShadow: '0 0 12px rgba(16,185,129,0.6)' }} />}
      {frame && <div style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '2px 6px', pointerEvents: 'none' }}>{live ? '● direct' : frame.at}</div>}
    </div>
  );

  const toolbar = (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Pill on={live} onClick={() => { if (online) setLive(l => !l); }} label={live ? '⏸ Pause' : '▶ Direct'} />
      <Pill onClick={() => { void grab(); }} label="📸 Actualiser" />
      <Pill on={dragMode === 'drag'} onClick={() => setDragMode(m => (m === 'scroll' ? 'drag' : 'scroll'))} label={dragMode === 'scroll' ? '↕ Glisser = défiler' : '✋ Glisser = déplacer'} />
      <Pill onClick={() => setQuality(q => (q === 'net' ? 'rapide' : 'net'))} label={quality === 'net' ? 'Image nette' : 'Image rapide'} />
      <Pill onClick={() => setFull(f => !f)} label={full ? '✕ Fermer' : '⛶ Plein écran'} />
    </div>
  );

  if (full) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column', fontFamily: C.font }}>
        <div style={{ flex: 1, minHeight: 0 }}>{screen}</div>
        <div style={{ padding: 8, background: C.bg }}>{toolbar}</div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Nexus" title="Mon PC" /></div>

      {/* État */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, boxShadow: `0 0 8px ${dot}`, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: C.text, flex: 1, lineHeight: 1.35 }}>{status?.text ?? 'Vérification…'}</span>
        {!online && <Btn onClick={() => { void maint('wake'); }} label={busy === 'wake' ? '…' : 'Réveiller'} color={C.accent} />}
      </div>

      {/* Écran */}
      <div style={{ marginBottom: 8 }}>{screen}</div>
      <div style={{ marginBottom: 6 }}>{toolbar}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Toucher = clic · double toucher = double clic · appui long = clic droit · glisser = défiler ou déplacer</div>

      {/* Demande à Nexus */}
      <Section title="Demande à Nexus">
        {msgs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.who === 'me' ? 'flex-end' : 'flex-start', maxWidth: '88%', background: m.who === 'me' ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 11px', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.text}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <input value={ask} onChange={e => setAsk(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void say(ask); }}
            placeholder={online ? '« ouvre Spotify », « volume 30 »…' : 'PC non connecté'} disabled={!online} style={{ ...inp, flex: 1 }} />
          <button onClick={() => { void toggleMic(); }} disabled={!online || (!!busy && !recording)} aria-label="Dicter"
            style={{ ...round, background: recording ? C.red : 'rgba(255,255,255,0.06)' }}>{recording ? '■' : '🎙️'}</button>
          <button onClick={() => { void say(ask); }} disabled={!online || !ask.trim() || !!busy} aria-label="Envoyer"
            style={{ ...round, background: C.accent, color: '#04140d' }}>{busy === 'say' || busy === 'stt' ? '…' : '➤'}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
          {CHIPS.map(c => <Pill key={c} onClick={() => { void say(c); }} label={c} />)}
        </div>
      </Section>

      {/* Clavier */}
      <Section title="Clavier">
        <div style={{ display: 'flex', gap: 7, marginBottom: 9 }}>
          <input value={kb} onChange={e => setKb(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void typeText(); }}
            placeholder="Texte à taper sur le PC" disabled={!online} style={{ ...inp, flex: 1 }} />
          <Btn onClick={() => { void typeText(); }} label="Taper" color={C.accent} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, marginBottom: 10 }}>
          <input type="checkbox" checked={enterAfter} onChange={e => setEnterAfter(e.target.checked)} /> Appuyer sur Entrée après
        </label>
        <Grid>
          {([['Entrée', { key: 'enter' }], ['Échap', { key: 'esc' }], ['⌫', { key: 'backspace' }], ['Tab', { key: 'tab' }],
             ['←', { key: 'left' }], ['↑', { key: 'up' }], ['↓', { key: 'down' }], ['→', { key: 'right' }],
             ['Copier', { keys: ['ctrl', 'c'] }], ['Coller', { keys: ['ctrl', 'v'] }], ['Annuler', { keys: ['ctrl', 'z'] }], ['Tout', { keys: ['ctrl', 'a'] }],
             ['Alt+Tab', { keys: ['alt', 'tab'] }], ['Windows', { keys: ['win'] }], ['Bureau', { keys: ['win', 'd'] }], ['Fermer', { keys: ['alt', 'f4'] }],
          ] as Array<[string, Record<string, unknown>]>).map(([l, b]) => <Key key={l} label={l} onClick={() => key(b, l)} disabled={!online} />)}
        </Grid>
      </Section>

      {/* Télécommande */}
      <Section title="Télécommande">
        <Grid>
          {([['⏮', 'prevtrack'], ['⏯', 'playpause'], ['⏭', 'nexttrack'], ['🔇', 'volumemute'], ['🔉', 'volumedown'], ['🔊', 'volumeup'], ['F5', 'f5'], ['⛶ F11', 'f11']] as Array<[string, string]>)
            .map(([l, k]) => <Key key={l} label={l} onClick={() => key({ key: k }, l)} disabled={!online} />)}
        </Grid>
      </Section>

      {/* Entretien */}
      <Section title="Nexus">
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <Btn onClick={() => { void maint('update'); }} label={busy === 'update' ? 'Mise à jour…' : '⬇ Mettre à jour'} color={C.accent} disabled={!online} />
          <Btn onClick={() => { void maint('restart'); }} label={busy === 'restart' ? '…' : '↻ Redémarrer Nexus'} color={C.amber} disabled={!online} />
          <Btn onClick={() => { void maint('wake'); }} label={busy === 'wake' ? '…' : '⏻ Réveiller'} color={C.muted} />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 9, lineHeight: 1.5 }}>
          Nexus se met à jour tout seul quand le PC se rallume. PC éteint : il ne peut pas être rallumé à distance. En veille : dis « mets le PC en veille et réveille-le demain à 8h ».
        </div>
      </Section>

      {toast && <Toast text={toast} />}
    </div>
  );
}

// ── Petits composants ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const blobToB64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onloadend = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b);
});

const inp: React.CSSProperties = { boxSizing: 'border-box', minWidth: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };
const round: React.CSSProperties = { width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: `1px solid ${C.border}`, color: C.text, fontSize: 17, cursor: 'pointer' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>{children}</div>;
}

function Key({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '11px 2px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 13, fontFamily: C.font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</button>
  );
}

function Pill({ label, onClick, on }: { label: string; onClick: () => void; on?: boolean }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(16,185,129,0.16)' : 'rgba(255,255,255,0.04)', color: on ? C.accent : C.text, fontSize: 12, fontFamily: C.font, cursor: 'pointer' }}>{label}</button>
  );
}

function Btn({ label, onClick, color, disabled }: { label: string; onClick: () => void; color: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '10px 13px', borderRadius: 11, border: `1px solid ${color}55`, background: `${color}1f`, color, fontSize: 13, fontWeight: 600, fontFamily: C.font, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, flexShrink: 0 }}>{label}</button>
  );
}

function Toast({ text }: { text: string }) {
  return <div style={{ position: 'absolute', left: 16, right: 16, bottom: 20, zIndex: 60, background: '#222', border: `1px solid ${C.border}`, color: C.text, borderRadius: 12, padding: '10px 14px', fontSize: 13, textAlign: 'center' }}>{text}</div>;
}
