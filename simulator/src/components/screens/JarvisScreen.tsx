import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, playBase64Audio, isAudioPlaying, unlockAudio, stopAudio } from '../../services/api.ts';
import { T, tone, PageHeader, Segmented, Card, Btn, Badge, Empty, Field, Screen, inputStyle, SectionTitle } from '../ui/Kit.tsx';

// Page JARVIS (27/10/2026) : Dzaryx écoute en direct.
//  🎧 Souffleur — il entend ta discussion et te glisse à l'oreille (écouteurs) traduction + conseils.
//  📝 Réunion — il écoute tout, puis compte rendu, qui a promis quoi, rappels, message de suivi (sur Telegram).
//  🥊 Entraînement — il joue l'autre personne pour répéter une négociation, puis débrief noté.
//  ⚡ Protocoles — une phrase lance une suite d'actions.  🎥 État des lieux — une vidéo du tour de la voiture.
// Le micro est découpé aux pauses (petits morceaux envoyés au serveur). Jamais de <video> pendant que le micro tourne
// (sur iPhone, une vidéo coupe le micro) : l'état des lieux vidéo a son propre onglet, micro éteint.

type Tab = 'souffleur' | 'reunion' | 'sparring' | 'protocoles' | 'video';
type Kind = 'souffleur' | 'reunion' | 'sparring';
interface Line { who: string; text: string; fr?: string; whisper?: string; me?: boolean }
interface Meeting { id: string; kind: Kind; at: string; title: string; summary: string; decisions: string[]; promises: Array<{ who: string; what: string; when?: string }>; followup: string; minutes: number }
interface Protocol { id: string; name: string; trigger: string; steps: string[]; uses: number }

const toB64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]+,/, ''));
  r.onerror = rej;
  r.readAsDataURL(blob);
});
const recMime = () => {
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MR.isTypeSupported?.(m)) ?? '';
};
const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; }
};

/** Micro découpé : un morceau part dès une pause (souffleur / entraînement) ou toutes les ~25 s (réunion). */
type SegState = { stream?: MediaStream; ctx?: AudioContext; timer?: number; rec?: MediaRecorder; recStart: number; lastVoice: number; peak: number; floor: number; t0: number };

function useSegmenter(onSegment: (b64: string, mime: string) => void, mode: 'pause' | 'continuous') {
  const st = useRef<SegState | null>(null);
  const [level, setLevel] = useState(0);
  const cb = useRef(onSegment);
  cb.current = onSegment;

  const stopRec = (s: SegState) => { if (s.rec && s.rec.state !== 'inactive') s.rec.stop(); s.rec = undefined; };
  const startRec = (s: SegState) => {
    const mime = recMime();
    const rec = new MediaRecorder(s.stream!, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const began = Date.now();
    const peakAtStart = { v: 0 };
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const dur = Date.now() - began;
      const loud = mode === 'pause' || peakAtStart.v > s.floor * 2.2;
      if (dur < 450 || !chunks.length || !loud) return;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      cb.current(await toB64(blob), (rec.mimeType || mime || 'audio/webm').split(';')[0]!);
    };
    rec.start();
    s.rec = rec; s.recStart = began; s.peak = 0;
    (rec as unknown as { _peak: typeof peakAtStart })._peak = peakAtStart;
  };

  const start = useCallback(async () => {
    unlockAudio();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const s: SegState = { stream, ctx, recStart: 0, lastVoice: 0, peak: 0, floor: 0.004, t0: Date.now() };
    st.current = s;
    if (mode === 'continuous') startRec(s);
    s.timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 18));
      const now = Date.now();
      if (now - s.t0 < 800) { s.floor = Math.max(0.0015, Math.min(0.03, (s.floor + rms) / 2)); return; }   // calibrage du bruit ambiant
      const thr = Math.max(s.floor * 2.4, 0.007);
      if (rms > thr) s.lastVoice = now;
      const r = s.rec as (MediaRecorder & { _peak?: { v: number } }) | undefined;
      if (r?._peak) r._peak.v = Math.max(r._peak.v, rms);
      if (mode === 'continuous') {
        // Réunion : coupe à une pause après 15 s, ou à 28 s quoi qu'il arrive
        const len = now - s.recStart;
        if ((len > 15_000 && now - s.lastVoice > 600) || len > 28_000) { stopRec(s); startRec(s); }
        return;
      }
      const busy = isAudioPlaying();       // Dzaryx parle : on n'enregistre pas sa propre voix
      if (!s.rec && !busy && rms > thr) startRec(s);
      else if (s.rec && (busy || now - s.lastVoice > 900 || now - s.recStart > 14_000)) stopRec(s);
      if (rms < thr * 0.8 && !s.rec) s.floor = s.floor * 0.995 + rms * 0.005;
    }, 60);
  }, [mode]);

  const stop = useCallback(() => {
    const s = st.current;
    if (!s) return;
    window.clearInterval(s.timer);
    stopRec(s);
    s.stream?.getTracks().forEach(t => t.stop());
    s.ctx?.close().catch(() => {});
    st.current = null;
    setLevel(0);
  }, []);

  useEffect(() => stop, [stop]);
  return { start, stop, level };
}

function Meter({ level, color }: { level: number; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 26 }}>
      {Array.from({ length: 16 }, (_, i) => {
        const on = level * 16 > i;
        return <div key={i} style={{ width: 5, borderRadius: 2, height: 6 + (i % 4) * 5, background: on ? color : tone(color, 0.18), transition: 'background 80ms' }} />;
      })}
    </div>
  );
}

/** Une séance en direct (souffleur, réunion, entraînement) : démarrer, écouter, terminer. */
function LiveMode({ kind }: { kind: Kind }) {
  const [goal, setGoal] = useState('');
  const [lang, setLang] = useState('');
  const [role, setRole] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<string>('');
  const [ending, setEnding] = useState(false);
  const [mins, setMins] = useState(0);
  const idRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const color = kind === 'souffleur' ? T.accent : kind === 'reunion' ? T.violet : T.warn;

  const onSegment = useCallback(async (b64: string, mime: string) => {
    if (!idRef.current) return;
    setBusy(b => b + 1);
    try {
      const r = await apiFetch<{ heard?: string; who?: string; fr?: string; whisper?: string; say?: string; audio?: string; error?: string }>(
        `/api/jarvis/live/${idRef.current}/audio`, { method: 'POST', body: JSON.stringify({ audio: b64, mime, kind }) });
      if (r.error) { setErr(r.error); return; }
      if (r.heard) setLines(l => [...l, { who: kind === 'sparring' ? 'Toi' : r.who ?? '', text: r.heard!, fr: r.fr || undefined, whisper: r.whisper || undefined, me: kind === 'sparring' }]);
      if (r.say) setLines(l => [...l, { who: 'Rôle', text: r.say! }]);
      if (r.audio) void playBase64Audio(r.audio);
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(b => b - 1); }
  }, [kind]);

  const seg = useSegmenter(onSegment, kind === 'reunion' ? 'continuous' : 'pause');

  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [lines]);
  useEffect(() => {
    if (!id) return;
    const t0 = Date.now();
    const t = window.setInterval(() => setMins(Math.floor((Date.now() - t0) / 60_000)), 15_000);
    return () => window.clearInterval(t);
  }, [id]);

  const start = async () => {
    setErr(''); setResult(''); setLines([]); setMins(0);
    try {
      unlockAudio();
      const r = await apiFetch<{ id: string; say?: string; audio?: string }>('/api/jarvis/live/start', { method: 'POST', body: JSON.stringify({ kind, goal, lang, role }) });
      idRef.current = r.id; setId(r.id);
      if (r.say) { setLines([{ who: 'Rôle', text: r.say }]); if (r.audio) void playBase64Audio(r.audio); }
      await seg.start();
    } catch (e) { setErr(`Micro ou serveur indisponible : ${errMsg(e)}`); idRef.current = null; setId(null); }
  };

  const end = async () => {
    seg.stop(); stopAudio();
    const cur = idRef.current;
    if (!cur) return;
    setEnding(true);
    // Laisse partir le dernier morceau (réunion) avant de clore
    await new Promise(r => setTimeout(r, busy > 0 ? 2500 : 800));
    idRef.current = null;
    try {
      const r = await apiFetch<{ text?: string; error?: string }>(`/api/jarvis/live/${cur}/end`, { method: 'POST', body: '{}' });
      setResult(r.text ?? r.error ?? '');
    } catch (e) { setErr(errMsg(e)); }
    finally { setEnding(false); setId(null); }
  };

  const intro = kind === 'souffleur'
    ? 'Mets tes écouteurs, pose le téléphone près de la personne. Dzaryx écoute et te souffle seulement ce qui compte : traduction, prix, piège, argument.'
    : kind === 'reunion'
      ? 'Pose le téléphone au milieu de la table. À la fin : compte rendu, décisions, qui a promis quoi, rappels créés et message de suivi, aussi sur Telegram.'
      : 'Dzaryx joue l\'autre personne, en vrai et sans te faire de cadeau. Parle-lui comme au téléphone. À la fin : note sur 10 et phrases à réutiliser.';

  if (!id && !ending) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Card accent={color}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>{intro}</div></Card>
        {kind === 'sparring' && (
          <Field label="Qui joue-t-il ?" hint="ex. « Karim, client d'Alger qui trouve 30 €/jour trop cher » ou « garagiste qui veut 40 000 DA pour la vidange »">
            <textarea value={role} onChange={e => setRole(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Un client exigeant qui négocie le prix d'une Clio…" />
          </Field>
        )}
        <Field label={kind === 'reunion' ? 'Sujet (facultatif)' : 'Ton objectif'} hint={kind === 'souffleur' ? 'ex. « louer une 208 à moins de 6 000 DA/jour »' : kind === 'sparring' ? 'ex. « garder au moins 27 €/jour »' : undefined}>
          <input value={goal} onChange={e => setGoal(e.target.value)} style={inputStyle} placeholder={kind === 'reunion' ? 'Point semaine avec Houari' : 'Ce que tu veux obtenir'} />
        </Field>
        {kind === 'souffleur' && (
          <Field label="L'autre personne parle (facultatif)">
            <input value={lang} onChange={e => setLang(e.target.value)} style={inputStyle} placeholder="darija, arabe, anglais…" />
          </Field>
        )}
        <Btn variant="primary" color={color} onClick={() => void start()} style={{ minHeight: 52, fontSize: 15 }}>
          {kind === 'souffleur' ? '🎧 Lancer le souffleur' : kind === 'reunion' ? '📝 Démarrer la réunion' : '🥊 Commencer l\'entraînement'}
        </Btn>
        {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
        {result && <ResultCard text={result} color={color} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card accent={color}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: ending ? T.warn : T.bad, boxShadow: `0 0 12px ${ending ? T.warn : T.bad}`, animation: ending ? undefined : 'pulse 1.4s infinite' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{ending ? 'Je prépare le compte rendu…' : kind === 'souffleur' ? 'Je t\'écoute et je te souffle' : kind === 'reunion' ? 'Réunion en cours' : 'Entraînement en cours'}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{mins} min · {lines.length} passage(s){busy > 0 ? ' · analyse…' : ''}</div>
          </div>
          <Meter level={seg.level} color={color} />
        </div>
      </Card>
      <div ref={listRef} style={{ display: 'grid', gap: 8, maxHeight: '48vh', overflowY: 'auto' }}>
        {!lines.length && <div style={{ color: T.faint, fontSize: 13, textAlign: 'center', padding: 18 }}>{kind === 'sparring' ? 'Réponds-lui…' : 'J\'attends que ça parle…'}</div>}
        {lines.map((l, i) => (
          <div key={i} style={{ alignSelf: l.me ? 'end' : 'start', maxWidth: '92%', background: l.who === 'Rôle' ? tone(T.warn, 0.12) : T.surface2, border: `1px solid ${T.line}`, borderRadius: 14, padding: '8px 11px' }}>
            {l.who && <div style={{ fontSize: 10.5, color: T.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l.who}</div>}
            <div style={{ fontSize: 14, lineHeight: 1.4 }} dir="auto">{l.text}</div>
            {l.fr && <div style={{ fontSize: 13, color: T.accent, marginTop: 4 }}>🇫🇷 {l.fr}</div>}
            {l.whisper && <div style={{ fontSize: 15, fontWeight: 700, color: T.warn, marginTop: 6 }}>🎧 {l.whisper}</div>}
          </div>
        ))}
      </div>
      <Btn variant="danger" disabled={ending} onClick={() => void end()} style={{ minHeight: 50 }}>{ending ? '⏳ Un instant…' : kind === 'sparring' ? '⏹ Fin — mon débrief' : '⏹ Terminer'}</Btn>
      {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

function ResultCard({ text, color }: { text: string; color: string }) {
  return (
    <Card accent={color}>
      <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{text.replace(/\*/g, '')}</div>
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>Aussi envoyé sur ton Telegram. Dzaryx s'en souvient (« c'était quoi la réunion avec… ? »).</div>
    </Card>
  );
}

function History({ kind }: { kind: Kind }) {
  const [list, setList] = useState<Meeting[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { apiFetch<{ meetings: Meeting[] }>('/api/jarvis/meetings').then(r => setList(r.meetings)).catch(() => setList([])); }, []);
  const mine = (list ?? []).filter(m => (kind === 'sparring') === (m.kind === 'sparring'));
  if (!mine.length) return null;
  return (
    <>
      <SectionTitle>{kind === 'sparring' ? 'Mes entraînements' : 'Comptes rendus'}</SectionTitle>
      <div style={{ display: 'grid', gap: 8 }}>
        {mine.slice(0, 10).map(m => (
          <Card key={m.id} onClick={() => setOpen(open === m.id ? null : m.id)} pad={12}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{m.title}</div>
              <Badge>{new Date(m.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} · {m.minutes} min</Badge>
            </div>
            {open === m.id && (
              <div style={{ fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {m.summary}
                {m.decisions.length > 0 && `\n\n✅ ${m.decisions.join('\n✅ ')}`}
                {m.promises.length > 0 && `\n\n🤝 ${m.promises.map(p => `${p.who} : ${p.what}${p.when ? ` (${p.when})` : ''}`).join('\n🤝 ')}`}
                {m.followup && `\n\n✉️ ${m.followup}`}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function Protocols({ onAsk }: { onAsk: (p: string) => void }) {
  const [list, setList] = useState<Protocol[] | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  useEffect(() => { apiFetch<{ protocols: Protocol[] }>('/api/jarvis/protocols').then(r => setList(r.protocols)).catch(() => setList([])); }, []);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Card accent={T.accent}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>Une phrase, toute une suite d'actions. Tu peux aussi le dire à la voix : « Dzaryx, lance le protocole panne ». Tout ce qui envoie ou paie attend ton oui.</div></Card>
      {list === null && <div style={{ color: T.faint, fontSize: 13 }}>Chargement…</div>}
      {list?.map(p => (
        <Card key={p.id} pad={13}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, flex: 1 }}>⚡ {p.name}</div>
            {p.uses > 0 && <Badge color={T.ok}>{p.uses}×</Badge>}
          </div>
          <ol style={{ margin: '8px 0 10px', paddingLeft: 20, color: T.muted, fontSize: 12.5, lineHeight: 1.5 }}>
            {p.steps.map((s, i) => <li key={i}>{s.replace(/\s*\((?:[a-z]+_[a-z_]*|[a-z_]+ (?:nearby|status|unread))(?:[^)]*)\)/g, '')}</li>)}
          </ol>
          <input value={details[p.id] ?? ''} onChange={e => setDetails(d => ({ ...d, [p.id]: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} placeholder="Précision (facultatif) : quelle voiture, quel jour…" />
          <Btn variant="primary" onClick={() => onAsk(`Lance le protocole ${p.name}${details[p.id] ? ` (${details[p.id]})` : ''}`)} style={{ width: '100%' }}>Lancer</Btn>
        </Card>
      ))}
      <SectionTitle>Nouveau protocole</SectionTitle>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="ex. « Arrivée client : vérifier le paiement, préparer le contrat, envoyer la position de la voiture, rappel 1 h avant »" />
      <Btn disabled={!draft.trim()} onClick={() => onAsk(`Crée un protocole : ${draft.trim()}`)}>Créer avec Dzaryx</Btn>
    </div>
  );
}

/** Images réparties sur la vidéo (≤ 1280 px), tirées dans le téléphone : seules ~12 images partent au serveur. */
async function framesFromVideo(file: File, n = 12): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('vidéo illisible')); });
    await v.play().catch(() => {}); v.pause();
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 20;
    const s = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s);
    const g = cv.getContext('2d')!;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.1, (dur * (i + 0.5)) / n);
      await new Promise<void>(res => { v.onseeked = () => res(); v.currentTime = t; setTimeout(res, 3000); });
      g.drawImage(v, 0, 0, cv.width, cv.height);
      out.push(cv.toDataURL('image/jpeg', 0.8).replace(/^data:[^,]+,/, ''));
    }
    return out;
  } finally {
    v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url);
  }
}

function VideoInspection() {
  const [type, setType] = useState<'départ' | 'retour'>('départ');
  const [who, setWho] = useState('');
  const [step, setStep] = useState('');
  const [result, setResult] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const run = async (f: File) => {
    setResult(''); setStep('Je découpe la vidéo…');
    try {
      const frames = await framesFromVideo(f);
      setStep('Je regarde la voiture et le tableau de bord (1 min)…');
      const r = await apiFetch<{ text?: string; error?: string }>('/api/jarvis/inspection-frames', { method: 'POST',
        body: JSON.stringify({ frames: frames.map(base64 => ({ base64, mime: 'image/jpeg' })), caption: `${type} ${who}`.trim() }) });
      setResult(r.text ?? r.error ?? '');
    } catch (e) { setResult(`❌ ${errMsg(e)}`); }
    finally { setStep(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card accent={T.ok}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>Filme le tour complet de la voiture (lentement, 20 à 60 s), puis le tableau de bord moteur allumé. Dzaryx relève la plaque, le compteur, l'essence, chaque rayure, et compare avec le départ. Marche aussi en envoyant la vidéo sur Telegram avec « départ Clio Benali ».</div></Card>
      <Segmented items={[{ id: 'départ', label: '🚗 Départ' }, { id: 'retour', label: '🏁 Retour' }]} value={type} onChange={setType} />
      <Field label="Voiture et client">
        <input value={who} onChange={e => setWho(e.target.value)} style={inputStyle} placeholder="Clio Benali" />
      </Field>
      <input ref={fileRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void run(f); }} />
      <Btn variant="primary" color={T.ok} disabled={!!step} onClick={() => fileRef.current?.click()} style={{ minHeight: 52, fontSize: 15, whiteSpace: 'normal', textAlign: 'center' }}>{step || '🎥 Filmer / choisir la vidéo'}</Btn>
      {result && <Card accent={T.ok}><div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{result.replace(/\*/g, '').replace(/_/g, '')}</div></Card>}
    </div>
  );
}

export default function JarvisScreen({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('dz:jarvis_tab') as Tab) || 'souffleur'; } catch { return 'souffleur'; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('dz:jarvis_tab', t); } catch { /* ignore */ } };
  return (
    <Screen header={<>
      <PageHeader eyebrow="Dzaryx · mode Jarvis" title="JARVIS" subtitle="Il écoute, il souffle, il s'entraîne avec toi, il agit." />
      <div style={{ padding: '0 12px 8px', overflowX: 'auto' }}>
        <Segmented<Tab> items={[{ id: 'souffleur', label: '🎧 Souffleur' }, { id: 'reunion', label: '📝 Réunion' }, { id: 'sparring', label: '🥊 Entraîn.' },
          { id: 'protocoles', label: '⚡ Protocoles' }, { id: 'video', label: '🎥 État lieux' }]} value={tab} onChange={pick} />
      </div>
    </>}>
      <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}'}</style>
      {tab === 'souffleur' && <><LiveMode key="s" kind="souffleur" /></>}
      {tab === 'reunion' && <><LiveMode key="r" kind="reunion" /><History kind="reunion" /></>}
      {tab === 'sparring' && <><LiveMode key="p" kind="sparring" /><History kind="sparring" /></>}
      {tab === 'protocoles' && <Protocols onAsk={onAsk} />}
      {tab === 'video' && <VideoInspection />}
      {(tab === 'souffleur' || tab === 'reunion' || tab === 'sparring') && !('MediaRecorder' in window) && <Empty icon="🎙️" title="Micro non pris en charge" text="Mets à jour iOS (14.5 ou plus) pour utiliser le mode Jarvis." />}
    </Screen>
  );
}
