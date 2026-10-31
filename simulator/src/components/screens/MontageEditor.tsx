import { useState, useEffect, useRef, useMemo } from 'react';
import { business, type EditOptions, type EditTimelineText } from '../../services/api.ts';

// ÉDITEUR façon CapCut (gratuit, illimité, sans filigrane) : tes rushes → timeline → coupes, vitesse, volume,
// textes, filtres, sous-titres auto, musique, format, signature FIK → export rendu par le serveur.
// « 🪄 Dzaryx monte tout » = montage automatique (silences coupés, zooms, accroche, sous-titres).

const C = {
  surface: '#0c1730', border: 'rgba(90,150,255,0.16)', accent: '#f472b6', green: '#38d8f5', gold: '#fbbf24', red: '#f87171',
  text: '#f5f5f7', muted: '#8ea3c8', font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 10, padding: '10px 13px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const chip = (on: boolean) => ({ background: on ? C.accent : 'rgba(255,255,255,0.06)', color: on ? '#050a16' : C.text, border: `1px solid ${on ? C.accent : C.border}`,
  borderRadius: 999, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.font, whiteSpace: 'nowrap' } as const);
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10 } as const;
const input = { width: '100%', boxSizing: 'border-box', background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10,
  padding: 10, fontSize: 13, fontFamily: C.font } as const;
const small = { fontSize: 11.5, color: C.muted } as const;

// Aperçu approximatif des filtres (le vrai rendu est fait par le serveur)
const LOOK_CSS: Record<string, string> = {
  naturel: 'contrast(1.03) saturate(1.04)', cinema: 'contrast(1.08) saturate(0.9) sepia(0.08)', chaud: 'saturate(1.15) sepia(0.18)',
  froid: 'contrast(1.07) saturate(0.9) hue-rotate(-8deg)', vif: 'contrast(1.12) saturate(1.35)', noir_blanc: 'grayscale(1) contrast(1.15)',
};
const RATIO: Record<string, string> = { '9:16': '9 / 16', '1:1': '1 / 1', '16:9': '16 / 9' };
const TOOLS = [
  ['cut', '✂️', 'Couper'], ['speed', '⚡', 'Vitesse'], ['volume', '🔊', 'Volume'], ['text', '🅣', 'Texte'], ['music', '🎵', 'Musique'],
  ['look', '🎨', 'Filtres'], ['captions', '💬', 'Sous-titres'], ['format', '📐', 'Format'],
] as const;
type Tool = typeof TOOLS[number][0];

interface Clip {
  id: string; type: 'video' | 'image'; local: string; url: string | null; name: string; dur: number;
  start: number; end: number; speed: number; volume: number; progress: number; failed?: boolean;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`;
const uid = () => Math.random().toString(36).slice(2, 9);

function uploadFile(file: File, onProgress: (p: number) => void): Promise<string> {
  return business.studioUploadUrl(file.name).then(({ uploadUrl, publicUrl }) => new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.setRequestHeader('x-upsert', 'true');
    x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve(publicUrl) : reject(new Error(x.status === 413 ? 'fichier trop lourd (max 50 Mo)' : `envoi refusé (${x.status})`)));
    x.onerror = () => reject(new Error('envoi impossible (réseau)'));
    x.send(file);
  }));
}

function mediaDuration(file: File, local: string): Promise<number> {
  if (file.type.startsWith('image/')) return Promise.resolve(3);
  return new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.src = local;
    v.onloadedmetadata = () => res(Number.isFinite(v.duration) ? v.duration : 5);
    v.onerror = () => res(5);
  });
}

export default function MontageEditor({ onExported, say }: { onExported: () => void; say: (t: string) => void }) {
  const [opts, setOpts] = useState<EditOptions | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('cut');
  const [texts, setTexts] = useState<EditTimelineText[]>([]);
  const [look, setLook] = useState('naturel');
  const [captions, setCaptions] = useState('tiktok');
  const [format, setFormat] = useState('9:16');
  const [outro, setOutro] = useState(true);
  const [music, setMusic] = useState<{ name: string; url: string | null; progress: number } | null>(null);
  const [musicVol, setMusicVol] = useState(1);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  // Lecture
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);       // index du plan lu
  const [time, setTime] = useState(0);     // temps global (s) dans le montage
  const vid = useRef<HTMLVideoElement>(null);
  const imgTimer = useRef<number | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const musicIn = useRef<HTMLInputElement>(null);

  useEffect(() => { business.studioEditOptions().then(setOpts).catch(() => setOpts({ formats: ['9:16', '1:1', '16:9'], looks: [], captions: [] })); }, []);

  const outDur = (c: Clip) => (c.type === 'image' ? c.end - c.start : (c.end - c.start) / c.speed);
  const offsets = useMemo(() => { let t = 0; return clips.map(c => { const o = t; t += outDur(c); return o; }); }, [clips]);
  const total = clips.reduce((s, c) => s + outDur(c), 0);
  const selected = clips.find(c => c.id === sel) ?? null;
  const patch = (id: string, p: Partial<Clip>) => setClips(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c)));

  // ── Import ──
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files).slice(0, 20)) {
      const local = URL.createObjectURL(file);
      const type = file.type.startsWith('image/') ? 'image' : 'video';
      const dur = await mediaDuration(file, local);
      const clip: Clip = { id: uid(), type, local, url: null, name: file.name, dur, start: 0, end: type === 'image' ? 3 : dur, speed: 1, volume: 1, progress: 0 };
      setClips(cs => [...cs, clip]);
      setSel(s => s ?? clip.id);
      uploadFile(file, p => patch(clip.id, { progress: p }))
        .then(url => patch(clip.id, { url, progress: 100 }))
        .catch(e => { patch(clip.id, { failed: true }); say(`❌ ${file.name} : ${e instanceof Error ? e.message : e}`); });
    }
  };
  const addMusic = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setMusic({ name: f.name, url: null, progress: 0 });
    uploadFile(f, p => setMusic(m => m && { ...m, progress: p }))
      .then(url => setMusic(m => m && { ...m, url, progress: 100 }))
      .catch(e => { setMusic(null); say(`❌ musique : ${e instanceof Error ? e.message : e}`); });
  };

  // ── Lecture de l'aperçu (plan par plan, coupes et vitesse respectées) ──
  const stopImg = () => { if (imgTimer.current) { window.clearInterval(imgTimer.current); imgTimer.current = null; } };
  const playFrom = (i: number) => {
    stopImg();
    const c = clips[i];
    if (!c) { setPlaying(false); setCur(0); setTime(0); return; }
    setCur(i);
    if (c.type === 'image') {
      const t0 = Date.now();
      imgTimer.current = window.setInterval(() => {
        const el = (Date.now() - t0) / 1000;
        setTime(offsets[i]! + el);
        if (el >= c.end - c.start) playFrom(i + 1);
      }, 100);
    }
  };
  useEffect(() => {
    const v = vid.current, c = clips[cur];
    if (!v || !c || c.type !== 'video') return;
    if (v.getAttribute('data-src') !== c.local) { v.src = c.local; v.setAttribute('data-src', c.local); }
    const go = () => { v.currentTime = c.start; v.playbackRate = c.speed; v.volume = Math.min(1, c.volume); if (playing) void v.play().catch(() => {}); };
    if (v.readyState >= 1) go(); else v.onloadedmetadata = go;
  }, [cur, playing, clips]);
  const onTime = () => {
    const v = vid.current, c = clips[cur];
    if (!v || !c || c.type !== 'video') return;
    setTime(offsets[cur]! + Math.max(0, v.currentTime - c.start) / c.speed);
    if (playing && v.currentTime >= c.end - 0.03) { v.pause(); playFrom(cur + 1); }
  };
  const togglePlay = () => {
    if (playing) { setPlaying(false); vid.current?.pause(); stopImg(); return; }
    if (!clips.length) return;
    setPlaying(true);
    playFrom(selected ? clips.indexOf(selected) : 0);
  };
  useEffect(() => () => stopImg(), []);
  // Quand on choisit un plan à l'arrêt : l'aperçu se place dessus
  useEffect(() => { if (!playing && selected) { const i = clips.indexOf(selected); setCur(i); setTime(offsets[i] ?? 0); } }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions sur le plan choisi ──
  const move = (dir: -1 | 1) => setClips(cs => {
    const i = cs.findIndex(c => c.id === sel), j = i + dir;
    if (i < 0 || j < 0 || j >= cs.length) return cs;
    const n = [...cs]; [n[i], n[j]] = [n[j]!, n[i]!]; return n;
  });
  const remove = () => setClips(cs => { const n = cs.filter(c => c.id !== sel); setSel(n[0]?.id ?? null); return n; });
  const duplicate = () => setClips(cs => { const i = cs.findIndex(c => c.id === sel); if (i < 0) return cs; const n = [...cs]; n.splice(i + 1, 0, { ...cs[i]!, id: uid() }); return n; });
  const splitHere = () => {
    if (!selected || selected.type !== 'video') return;
    const at = vid.current && clips[cur]?.id === selected.id ? vid.current.currentTime : (selected.start + selected.end) / 2;
    if (at <= selected.start + 0.2 || at >= selected.end - 0.2) { say('Place la lecture au milieu du plan pour le couper en deux.'); return; }
    setClips(cs => { const i = cs.findIndex(c => c.id === selected.id); const n = [...cs]; n.splice(i, 1, { ...selected, end: at }, { ...selected, id: uid(), start: at }); return n; });
    say('✂️ Plan coupé en deux');
  };

  const pending = clips.some(c => !c.url && !c.failed) || (music && !music.url);
  const ready = clips.filter(c => c.url);

  const exportManual = async () => {
    if (pending) { say('⏳ Attends la fin de l\'envoi des fichiers.'); return; }
    if (!ready.length) { say('Ajoute d\'abord des vidéos ou photos.'); return; }
    setBusy(true);
    try {
      await business.studioEdit({
        timeline: ready.map(c => ({ url: c.url!, type: c.type, start: c.start, end: c.end, speed: c.speed, volume: c.volume })),
        texts, look, captions, format, outro, musicUrl: music?.url ?? null, musicVolume: musicVol, brief: brief || undefined,
      });
      say('🎬 Export lancé : la vidéo arrive dans « Mes vidéos » et sur Telegram.');
      onExported();
    } catch (e) { say(`❌ ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(false); }
  };
  const exportAuto = async () => {
    if (pending) { say('⏳ Attends la fin de l\'envoi des fichiers.'); return; }
    if (!ready.length) { say('Ajoute d\'abord des vidéos ou photos.'); return; }
    setBusy(true);
    try {
      await business.studioEdit({ media: ready.map(c => ({ url: c.url!, type: c.type })), brief, look, captions, format, outro,
        musicUrl: music?.url ?? null, musicVolume: musicVol, cutSilences: true, voiceover: true });
      say('🪄 Dzaryx monte ta vidéo : elle arrive dans « Mes vidéos » et sur Telegram.');
      onExported();
    } catch (e) { say(`❌ ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(false); }
  };

  const curClip = clips[cur];
  const activeTexts = texts.filter(t => time >= t.start && time <= t.end);
  const looks = opts?.looks.length ? opts.looks : Object.keys(LOOK_CSS).map(id => ({ id, label: id }));
  const caps = opts?.captions.length ? opts.captions : [{ id: 'tiktok', label: 'TikTok' }, { id: 'aucun', label: 'Aucun' }];

  return (
    <div>
      <input ref={fileIn} type="file" accept="video/*,image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={musicIn} type="file" accept="audio/*" hidden onChange={e => { addMusic(e.target.files); e.target.value = ''; }} />

      {/* ── Aperçu ── */}
      <div style={{ ...card, padding: 8 }}>
        <div style={{ position: 'relative', margin: '0 auto', width: format === '16:9' ? '100%' : format === '1:1' ? '78%' : '58%', aspectRatio: RATIO[format],
          background: '#000', borderRadius: 10, overflow: 'hidden' }}>
          {!clips.length && (
            <button onClick={() => fileIn.current?.click()} style={{ position: 'absolute', inset: 0, background: 'none', border: `2px dashed ${C.border}`, borderRadius: 10,
              color: C.muted, fontSize: 13, fontFamily: C.font, cursor: 'pointer' }}>＋ Ajoute tes vidéos et photos</button>
          )}
          <video ref={vid} playsInline muted={false} onTimeUpdate={onTime}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: LOOK_CSS[look], display: curClip?.type === 'video' ? 'block' : 'none' }} />
          {curClip?.type === 'image' && <img src={curClip.local} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: LOOK_CSS[look] }} />}
          {activeTexts.map((t, k) => (
            <div key={k} style={{ position: 'absolute', left: 8, right: 8, textAlign: 'center', fontWeight: 900, fontSize: 14, textTransform: t.style === 'simple' ? 'none' : 'uppercase',
              top: t.pos === 'haut' ? '12%' : t.pos === 'milieu' ? '45%' : undefined, bottom: t.pos === 'bas' ? '10%' : undefined,
              color: '#fff', textShadow: '0 2px 4px #000' }}>
              <span style={t.style === 'bandeau' ? { background: '#000', padding: '3px 8px' } : undefined}>{t.text}</span>
            </div>
          ))}
          {captions !== 'aucun' && clips.length > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: captions === 'minimal' ? '6%' : '24%', textAlign: 'center', fontSize: 11, fontWeight: 900, color: '#fff', textShadow: '0 1px 3px #000', opacity: 0.55 }}>
              SOUS-TITRES <span style={{ color: '#ffd700' }}>AUTO</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button style={{ ...btn(C.accent, '#050a16'), padding: '8px 14px' }} onClick={togglePlay} disabled={!clips.length}>{playing ? '⏸' : '▶️'}</button>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
            <div style={{ width: `${total ? Math.min(100, (time / total) * 100) : 0}%`, height: '100%', background: C.accent, borderRadius: 2 }} />
          </div>
          <span style={small}>{fmt(time)} / {fmt(total)}</span>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '4px 0 10px', WebkitOverflowScrolling: 'touch' }}>
        {clips.map((c, i) => (
          <button key={c.id} onClick={() => setSel(c.id)}
            style={{ position: 'relative', flex: '0 0 auto', width: Math.max(58, Math.min(220, outDur(c) * 18)), height: 62, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
              border: `2px solid ${sel === c.id ? C.gold : 'transparent'}`, background: '#111' }}>
            {c.type === 'image'
              ? <img src={c.local} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <video src={`${c.local}#t=${c.start.toFixed(1)}`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
            <span style={{ position: 'absolute', left: 3, bottom: 2, fontSize: 9.5, color: '#fff', textShadow: '0 1px 2px #000', fontWeight: 700 }}>
              {i + 1} · {outDur(c).toFixed(1)}s{c.speed !== 1 ? ` ×${c.speed}` : ''}
            </span>
            {!c.url && !c.failed && <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', color: C.gold, fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{c.progress}%</span>}
            {c.failed && <span style={{ position: 'absolute', inset: 0, background: 'rgba(80,0,0,0.6)', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center' }}>❌</span>}
          </button>
        ))}
        <button onClick={() => fileIn.current?.click()} style={{ flex: '0 0 auto', width: 58, height: 62, borderRadius: 8, border: `1px dashed ${C.border}`, background: 'rgba(255,255,255,0.04)', color: C.text, fontSize: 22, cursor: 'pointer' }}>＋</button>
      </div>

      {/* ── Barre d'outils façon CapCut ── */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', marginBottom: 8 }}>
        {TOOLS.map(([id, icon, lbl]) => (
          <button key={id} onClick={() => setTool(id)} style={{ flex: '0 0 auto', minWidth: 58, background: tool === id ? 'rgba(244,114,182,0.15)' : 'transparent', border: 'none', borderRadius: 10,
            color: tool === id ? C.accent : C.text, padding: '6px 4px', cursor: 'pointer', fontFamily: C.font }}>
            <div style={{ fontSize: 18 }}>{icon}</div><div style={{ fontSize: 10.5, fontWeight: 700 }}>{lbl}</div>
          </button>
        ))}
      </div>

      <div style={card}>
        {['cut', 'speed', 'volume'].includes(tool) && !selected && <div style={small}>Choisis un plan dans la timeline.</div>}
        {tool === 'cut' && selected && (<>
          <div style={small}>Début : {fmt(selected.start)} · Fin : {fmt(selected.end)} {selected.type === 'video' ? `(rush de ${fmt(selected.dur)})` : ''}</div>
          {selected.type === 'video' ? (<>
            <input type="range" min={0} max={selected.dur} step={0.1} value={selected.start} style={{ width: '100%' }}
              onChange={e => patch(selected.id, { start: Math.min(Number(e.target.value), selected.end - 0.3) })} />
            <input type="range" min={0} max={selected.dur} step={0.1} value={selected.end} style={{ width: '100%' }}
              onChange={e => patch(selected.id, { end: Math.max(Number(e.target.value), selected.start + 0.3) })} />
          </>) : (
            <input type="range" min={1} max={10} step={0.5} value={selected.end - selected.start} style={{ width: '100%' }}
              onChange={e => patch(selected.id, { start: 0, end: Number(e.target.value) })} />
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {selected.type === 'video' && <button style={chip(false)} onClick={splitHere}>✂️ Couper ici</button>}
            <button style={chip(false)} onClick={() => move(-1)}>◀ Avant</button>
            <button style={chip(false)} onClick={() => move(1)}>Après ▶</button>
            <button style={chip(false)} onClick={duplicate}>⧉ Dupliquer</button>
            <button style={{ ...chip(false), color: C.red }} onClick={remove}>🗑 Supprimer</button>
          </div>
        </>)}
        {tool === 'speed' && selected && (selected.type === 'image' ? <div style={small}>La vitesse s'applique aux vidéos.</div> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3].map(s => <button key={s} style={chip(selected.speed === s)} onClick={() => patch(selected.id, { speed: s })}>×{s}{s < 1 ? ' ralenti' : ''}</button>)}
          </div>
        ))}
        {tool === 'volume' && selected && (<>
          <div style={small}>Son du plan : {Math.round(selected.volume * 100)} %</div>
          <input type="range" min={0} max={2} step={0.05} value={selected.volume} style={{ width: '100%' }} onChange={e => patch(selected.id, { volume: Number(e.target.value) })} />
          <button style={chip(selected.volume === 0)} onClick={() => patch(selected.id, { volume: selected.volume === 0 ? 1 : 0 })}>🔇 Couper le son</button>
        </>)}
        {tool === 'text' && (<>
          {texts.map((t, k) => (
            <div key={k} style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 8, marginBottom: 8 }}>
              <input style={input} value={t.text} onChange={e => setTexts(ts => ts.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)))} />
              <div style={{ ...small, marginTop: 4 }}>De {fmt(t.start)} à {fmt(t.end)}</div>
              <input type="range" min={0} max={Math.max(1, total)} step={0.1} value={t.start} style={{ width: '100%' }} onChange={e => setTexts(ts => ts.map((x, j) => (j === k ? { ...x, start: Math.min(Number(e.target.value), x.end - 0.3) } : x)))} />
              <input type="range" min={0} max={Math.max(1, total)} step={0.1} value={t.end} style={{ width: '100%' }} onChange={e => setTexts(ts => ts.map((x, j) => (j === k ? { ...x, end: Math.max(Number(e.target.value), x.start + 0.3) } : x)))} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(['haut', 'milieu', 'bas'] as const).map(p => <button key={p} style={chip(t.pos === p)} onClick={() => setTexts(ts => ts.map((x, j) => (j === k ? { ...x, pos: p } : x)))}>{p}</button>)}
                {(['titre', 'bandeau', 'simple'] as const).map(s => <button key={s} style={chip(t.style === s)} onClick={() => setTexts(ts => ts.map((x, j) => (j === k ? { ...x, style: s } : x)))}>{s}</button>)}
                <button style={{ ...chip(false), color: C.red }} onClick={() => setTexts(ts => ts.filter((_, j) => j !== k))}>🗑</button>
              </div>
            </div>
          ))}
          <button style={btn('rgba(255,255,255,0.08)', C.text)} onClick={() => setTexts(ts => [...ts, { text: 'Ton texte', start: time, end: Math.min(Math.max(total, 2), time + 2.5), pos: 'milieu', style: 'titre' }])}>＋ Ajouter un texte ici</button>
        </>)}
        {tool === 'music' && (<>
          {music ? (<>
            <div style={{ fontSize: 13 }}>🎵 {music.name} {music.url ? '✅' : `⏳ ${music.progress} %`}</div>
            <div style={{ ...small, marginTop: 6 }}>Volume : {Math.round(musicVol * 100)} % (baisse toute seule quand on parle)</div>
            <input type="range" min={0} max={1.5} step={0.05} value={musicVol} style={{ width: '100%' }} onChange={e => setMusicVol(Number(e.target.value))} />
            <button style={{ ...chip(false), color: C.red }} onClick={() => setMusic(null)}>🗑 Enlever</button>
          </>) : <button style={btn('rgba(255,255,255,0.08)', C.text)} onClick={() => musicIn.current?.click()}>＋ Choisir une musique (fichier audio)</button>}
        </>)}
        {tool === 'look' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{looks.map(l => <button key={l.id} style={chip(look === l.id)} onClick={() => setLook(l.id)}>{l.label}</button>)}</div>}
        {tool === 'captions' && (<>
          <div style={{ ...small, marginBottom: 6 }}>Dzaryx écoute ce qui est dit dans tes vidéos et écrit les sous-titres mot par mot.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{caps.map(c => <button key={c.id} style={chip(captions === c.id)} onClick={() => setCaptions(c.id)}>{c.label}</button>)}</div>
        </>)}
        {tool === 'format' && (<>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[['9:16', 'TikTok / Reels'], ['1:1', 'Carré'], ['16:9', 'YouTube']].map(([f, l]) => <button key={f} style={chip(format === f)} onClick={() => setFormat(f!)}>{f} {l}</button>)}
          </div>
          <button style={{ ...chip(outro), marginTop: 8 }} onClick={() => setOutro(!outro)}>🔑 Signature FIK à la fin {outro ? 'oui' : 'non'}</button>
        </>)}
      </div>

      {/* ── Export ── */}
      <div style={card}>
        <textarea style={{ ...input, resize: 'vertical' }} rows={2} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="Dis à Dzaryx ce que tu veux (ex. pub pour la Clio, ambiance été, en darija)…" />
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button style={{ ...btn(C.gold, '#050a16'), flex: 1, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => void exportAuto()}>🪄 Dzaryx monte tout</button>
          <button style={{ ...btn(C.accent, '#050a16'), flex: 1, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => void exportManual()}>⬆️ Exporter mon montage</button>
        </div>
        <div style={{ ...small, marginTop: 6, lineHeight: 1.4 }}>
          0 €, sans filigrane, sans limite. « Dzaryx monte tout » coupe les blancs, ajoute zooms, accroche, sous-titres et voix off si tes vidéos sont muettes. Max 50 Mo par fichier.
        </div>
      </div>
    </div>
  );
}
