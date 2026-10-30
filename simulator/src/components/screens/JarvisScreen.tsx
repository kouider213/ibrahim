import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch, playBase64Audio, isAudioPlaying, unlockAudio, stopAudio, getDeviceToken, PRIMARY_BACKEND } from '../../services/api.ts';
import { T, tone, PageHeader, Segmented, Card, Btn, Badge, Empty, Field, Screen, inputStyle, SectionTitle } from '../ui/Kit.tsx';

// Page JARVIS (27/10/2026) : Dzaryx écoute en direct.
//  🎧 Souffleur — il entend ta discussion et te glisse à l'oreille (écouteurs) traduction + conseils.
//  📝 Réunion — il écoute tout, puis compte rendu, qui a promis quoi, rappels, message de suivi (sur Telegram).
//  🥊 Entraînement — il joue l'autre personne pour répéter une négociation, puis débrief noté.
//  ⚡ Protocoles — une phrase lance une suite d'actions.  🎥 État des lieux — une vidéo du tour de la voiture.
// Le micro est découpé aux pauses (petits morceaux envoyés au serveur). Jamais de <video> pendant que le micro tourne
// (sur iPhone, une vidéo coupe le micro) : l'état des lieux vidéo a son propre onglet, micro éteint.

type Tab = 'vie' | 'cerveau' | 'hud' | 'copilote' | 'escouade' | 'salle' | 'sante' | 'souffleur' | 'reunion' | 'sparring' | 'protocoles' | 'video';
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

// listenWhileSpeaking : souffleur avec écouteurs → on continue d'écouter pendant qu'il souffle (sinon on rate ce que dit l'autre)
function useSegmenter(onSegment: (b64: string, mime: string) => void, mode: 'pause' | 'continuous', listenWhileSpeaking = false) {
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
    // iPhone : un AudioContext créé après l'autorisation du micro peut rester « suspendu » → volume toujours à 0, rien n'est enregistré
    if (ctx.state === 'suspended') await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 1500))]);
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
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (now - s.t0 < 800) { s.floor = Math.max(0.0015, Math.min(0.012, (s.floor + rms) / 2)); return; }   // calibrage du bruit ambiant
      // Plafond : dans une pièce bruyante le seuil montait trop haut et sa voix ne le dépassait plus
      const thr = Math.min(Math.max(s.floor * 2.4, 0.007), 0.03);
      if (rms > thr) s.lastVoice = now;
      const r = s.rec as (MediaRecorder & { _peak?: { v: number } }) | undefined;
      if (r?._peak) r._peak.v = Math.max(r._peak.v, rms);
      if (mode === 'continuous') {
        // Réunion : coupe à une pause après 15 s, ou à 28 s quoi qu'il arrive
        const len = now - s.recStart;
        if ((len > 15_000 && now - s.lastVoice > 600) || len > 28_000) { stopRec(s); startRec(s); }
        return;
      }
      const busy = !listenWhileSpeaking && isAudioPlaying();       // Dzaryx parle (haut-parleur) : on n'enregistre pas sa propre voix
      if (!s.rec && !busy && rms > thr) startRec(s);
      else if (s.rec && (busy || now - s.lastVoice > 900 || now - s.recStart > 14_000)) stopRec(s);
      if (rms < thr * 0.8 && !s.rec) s.floor = Math.min(0.012, s.floor * 0.995 + rms * 0.005);
    }, 60);
  }, [mode, listenWhileSpeaking]);

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

  const seg = useSegmenter(onSegment, kind === 'reunion' ? 'continuous' : 'pause', kind === 'souffleur');

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

  // App en arrière-plan / écran verrouillé : on rend le micro tout de suite (sinon l'iPhone reste muet dans les appels Telegram)
  const endRef = useRef(end);
  endRef.current = end;
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && idRef.current) void endRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
  }, []);

  const intro = kind === 'souffleur'
    ? 'Mets tes écouteurs, lance, et pose le téléphone (micro vers la personne). À chaque pause dans la discussion, Dzaryx envoie ce qu\'il a entendu, l\'écrit ici (avec la traduction) et ne te parle à l\'oreille QUE si c\'est utile : traduction, prix, piège, argument. Sinon il reste silencieux, c\'est normal. Indique la langue de l\'autre (darija…) pour une meilleure écoute.'
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
            {kind === 'souffleur' && !l.whisper && <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>— entendu, rien d'utile à te souffler</div>}
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

// ── 🕶️ HUD IRON MAN ─────────────────────────────────────────────────────────
// Caméra arrière + étiquettes posées sur l'image (voiture de la flotte, traduction, reçu déjà vu, valeurs lues).
// Pas de micro ici (une vidéo coupe le micro sur iPhone) ; une image part toutes les ~2,5 s quand le serveur a fini.
interface HudLabel { x: number; y: number; w: number; h: number; kind: string; title: string; detail: string; alert?: boolean }
const HUD_COLOR: Record<string, string> = { fleet: T.ok, car: T.accent, translate: T.violet, receipt: T.warn, document: T.accent2, read: T.accent, warning: T.bad };

function Hud() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const spokenRef = useRef<Set<string>>(new Set());
  const [on, setOn] = useState(false);
  const [labels, setLabels] = useState<HudLabel[]>([]);
  const [scene, setScene] = useState('');
  const [ratio, setRatio] = useState(3 / 4);
  const [err, setErr] = useState('');
  const [voice, setVoice] = useState(true);
  const voiceRef = useRef(voice); voiceRef.current = voice;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOn(false); setLabels([]); setScene('');
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setErr(''); unlockAudio();
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      streamRef.current = st;
      const v = videoRef.current!;
      v.srcObject = st; await v.play().catch(() => {});
      setOn(true);
    } catch (e) { setErr(`Caméra indisponible : ${errMsg(e)}`); }
  };

  useEffect(() => {
    if (!on) return;
    const cv = document.createElement('canvas');
    const tick = async () => {
      const v = videoRef.current;
      if (!v || busyRef.current || !v.videoWidth) return;
      busyRef.current = true;
      try {
        setRatio(v.videoWidth / v.videoHeight);
        const s = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight));
        cv.width = Math.round(v.videoWidth * s); cv.height = Math.round(v.videoHeight * s);
        cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height);
        const image = cv.toDataURL('image/jpeg', 0.72).replace(/^data:[^,]+,/, '');
        const r = await apiFetch<{ labels: HudLabel[]; scene: string }>('/api/jarvis/hud', { method: 'POST', body: JSON.stringify({ image, mime: 'image/jpeg' }) });
        if (!streamRef.current) return;
        setLabels(r.labels ?? []); setScene(r.scene ?? '');
        // Voix : seulement les nouveautés importantes (voiture de la flotte, alerte, traduction)
        const fresh = (r.labels ?? []).filter(l => (l.kind === 'fleet' || l.alert || l.kind === 'translate') && !spokenRef.current.has(`${l.kind}:${l.title}`));
        if (voiceRef.current && fresh.length && !isAudioPlaying()) {
          fresh.forEach(l => spokenRef.current.add(`${l.kind}:${l.title}`));
          const say = fresh.map(l => l.kind === 'translate' ? `Traduction : ${l.detail}` : `${l.title}. ${l.detail}`).join('. ');
          apiFetch<{ audio?: string }>('/api/jarvis/copilot/speak', { method: 'POST', body: JSON.stringify({ text: say }) }).then(a => { if (a.audio) void playBase64Audio(a.audio); }).catch(() => {});
        }
      } catch (e) { setErr(errMsg(e)); }
      finally { busyRef.current = false; }
    };
    const t = window.setInterval(() => void tick(), 2500);
    void tick();
    return () => window.clearInterval(t);
  }, [on]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!on && <Card accent={T.accent}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>Lève la caméra : Dzaryx pose ses étiquettes sur ce qu'il voit — tes voitures (client, retour), les textes à traduire, les reçus déjà vus, les compteurs, les voyants. Il ne regarde pas les visages des gens.</div></Card>}
      <div style={{ position: 'relative', width: '100%', aspectRatio: String(ratio), maxHeight: '64vh', borderRadius: 18, overflow: 'hidden', background: '#000', display: on ? 'block' : 'none', border: `1px solid ${tone(T.accent, 0.5)}`, boxShadow: `0 0 30px ${tone(T.accent, 0.25)}` }}>
        <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `repeating-linear-gradient(0deg, ${tone(T.accent, 0.05)} 0 1px, transparent 1px 4px)` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`, animation: 'hudscan 2.5s linear infinite', opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 46, height: 46, marginLeft: -23, marginTop: -23, border: `1.5px solid ${tone(T.accent, 0.7)}`, borderRadius: '50%', boxShadow: `0 0 12px ${tone(T.accent, 0.5)}` }} />
        {labels.map((l, i) => {
          const c = l.alert ? T.bad : HUD_COLOR[l.kind] ?? T.accent;
          const below = l.y < 0.18;
          return (
            <div key={`${l.title}-${i}`} style={{ position: 'absolute', left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%`, border: `1.5px solid ${c}`, borderRadius: 6, boxShadow: `0 0 14px ${tone(c, 0.6)}, inset 0 0 10px ${tone(c, 0.25)}`, transition: 'all 400ms ease' }}>
              <div style={{ position: 'absolute', [below ? 'top' : 'bottom']: 'calc(100% + 4px)', left: -2, minWidth: 120, maxWidth: 230, background: 'rgba(4,10,20,0.82)', border: `1px solid ${c}`, borderRadius: 8, padding: '4px 7px', backdropFilter: 'blur(4px)' }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 10.5, color: c, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }} dir="auto">{l.alert ? '⚠ ' : ''}{l.title}</div>
                {l.detail && <div style={{ fontSize: 11.5, color: '#e6f6ff', lineHeight: 1.3 }} dir="auto">{l.detail}</div>}
              </div>
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: 10, bottom: 8, right: 10, display: 'flex', justifyContent: 'space-between', fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, color: T.accent, letterSpacing: '0.14em', textShadow: `0 0 6px ${T.accent}` }}>
          <span>DZARYX · HUD</span><span>{scene.toUpperCase().slice(0, 40)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant={on ? 'danger' : 'primary'} onClick={() => (on ? stop() : void start())} style={{ flex: 1, minHeight: 52, fontSize: 15 }}>{on ? '⏹ Couper le HUD' : '🕶️ Activer le HUD'}</Btn>
        <Btn onClick={() => setVoice(v => !v)} style={{ minHeight: 52 }}>{voice ? '🔊' : '🔇'}</Btn>
      </div>
      {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

// ── 🛰️ ESCOUADE ─────────────────────────────────────────────────────────────
interface SquadAgent { name: string; icon: string; task: string; status: 'waiting' | 'working' | 'done' | 'error'; steps: Array<{ at: string; text: string }>; result?: string }
interface Squad { id: string; goal: string; started: string; status: 'planning' | 'working' | 'merging' | 'done' | 'error'; agents: SquadAgent[]; final?: string }
const SQUAD_STATUS: Record<Squad['status'], string> = { planning: 'Le chef découpe la mission…', working: 'Les agents travaillent en même temps', merging: 'Le chef assemble le plan…', done: 'Mission terminée', error: 'Échec' };

function Escouade() {
  const [goal, setGoal] = useState('');
  const [squad, setSquad] = useState<Squad | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(async () => {
    try { const r = await apiFetch<{ squad: Squad | null }>('/api/jarvis/squad'); setSquad(r.squad); } catch (e) { setErr(errMsg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const running = !!squad && !['done', 'error'].includes(squad.status);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(t);
  }, [running, load]);
  const launch = async () => {
    setErr(''); setOpen(null);
    try { const s = await apiFetch<Squad>('/api/jarvis/squad', { method: 'POST', body: JSON.stringify({ goal }) }); setSquad(s); setGoal(''); } catch (e) { setErr(errMsg(e)); }
  };
  const color = (st: SquadAgent['status']) => st === 'done' ? T.ok : st === 'error' ? T.bad : st === 'working' ? T.accent : T.faint;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {!running && (
        <>
          <Card accent={T.violet}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5 }}>Une grosse question ? Plusieurs Dzaryx s'y mettent en même temps (chercheur, analyste, stratège…) avec tes vraies données et le web. Tu les regardes travailler ici, puis le plan final arrive aussi sur Telegram. Ils proposent, ils n'envoient rien.</div></Card>
          <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="ex. « Prépare-moi la saison été 2027 » ou « Comment avoir 5 clients FIK Sites ce mois-ci ? »" />
          <Btn variant="primary" color={T.violet} disabled={!goal.trim()} onClick={() => void launch()} style={{ minHeight: 52, fontSize: 15 }}>🛰️ Lancer l'escouade</Btn>
        </>
      )}
      {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
      {squad && (
        <>
          <Card accent={T.violet}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {running && <div style={{ width: 10, height: 10, borderRadius: 5, background: T.violet, boxShadow: `0 0 10px ${T.violet}`, animation: 'pulse 1.2s infinite' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>« {squad.goal} »</div>
                <div style={{ fontSize: 12, color: T.muted }}>{SQUAD_STATUS[squad.status]}</div>
              </div>
            </div>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {squad.agents.map((a, i) => (
              <div key={i} onClick={() => setOpen(open === i ? null : i)} style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${tone(color(a.status), 0.6)}`, borderRadius: 12, padding: 10, boxShadow: a.status === 'working' ? `0 0 16px ${tone(T.accent, 0.3)}` : 'none', cursor: 'pointer', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                  <span style={{ fontWeight: 800, fontSize: 12.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: color(a.status), animation: a.status === 'working' ? 'pulse 1s infinite' : undefined }} />
                </div>
                <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5, color: '#9fe6ff', lineHeight: 1.45, minHeight: 60 }}>
                  {a.steps.slice(-4).map((s, k) => <div key={k} style={{ opacity: 0.45 + (k + 1) / 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>› {s.text}</div>)}
                  {!a.steps.length && <div style={{ color: T.faint }}>› en attente…</div>}
                </div>
              </div>
            ))}
          </div>
          {open !== null && squad.agents[open]?.result && <Card pad={12}><div style={{ fontSize: 12.5, color: T.muted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}><b>{squad.agents[open]!.icon} {squad.agents[open]!.name}</b>{'\n'}{squad.agents[open]!.result!.replace(/\*\*/g, '')}</div></Card>}
          {squad.final && <ResultCard text={squad.final} color={T.violet} />}
          {!running && <Btn onClick={() => setSquad(null)}>Nouvelle mission</Btn>}
        </>
      )}
    </div>
  );
}

// ── 🚗 COPILOTE MAINS LIBRES ────────────────────────────────────────────────
interface FeedItem { id: string; at: string; chat: string; text: string; reply?: string; note?: string }

function Copilote() {
  const [on, setOn] = useState(false);
  // Écoute permanente : il ne répond que si on dit « Dzaryx… » (sauf 25 s après sa question, pour répondre « oui »)
  const [wake, setWake] = useState(() => { try { return localStorage.getItem('dz:copilot_wake') === '1'; } catch { return false; } });
  const wakeWordRef = useRef(wake); wakeWordRef.current = wake;
  const followRef = useRef(0);
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sinceRef = useRef('');
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const play = async (audio?: string) => { if (audio) await playBase64Audio(audio); };

  const onSegment = useCallback(async (b64: string, mime: string) => {
    setBusy(true);
    try {
      const needWake = wakeWordRef.current && Date.now() > followRef.current;
      const r = await apiFetch<{ heard: string; text: string; audio?: string; ignored?: boolean }>('/api/jarvis/copilot/audio', { method: 'POST', body: JSON.stringify({ audio: b64, mime, wake: needWake }) });
      if (!r.heard || r.ignored) return;
      setHeard(r.heard); setAnswer(r.text);
      if (/\?\s*$/.test(r.text)) followRef.current = Date.now() + 25_000;   // il pose une question : réponse sans « Dzaryx »
      void play(r.audio);
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }, []);
  const seg = useSegmenter(onSegment, 'pause');

  // Nouveaux messages WhatsApp → lus à voix haute
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(async () => {
      try {
        const r = await apiFetch<{ items: FeedItem[] }>(`/api/jarvis/copilot/feed?since=${encodeURIComponent(sinceRef.current)}`);
        if (!r.items.length) return;
        sinceRef.current = r.items[r.items.length - 1]!.at;
        const it = r.items[r.items.length - 1]!;
        const say = `Nouveau message WhatsApp de ${it.chat} : ${it.text.slice(0, 220)}.` + (it.note ? ` J'ai déjà ${it.note.replace(/^répondu par le /, 'répondu, en ')}.` : it.reply ? ` Je te propose de répondre : ${it.reply.slice(0, 220)}. Je l'envoie ?` : '');
        setAnswer(say);
        const a = await apiFetch<{ audio?: string }>('/api/jarvis/copilot/speak', { method: 'POST', body: JSON.stringify({ text: say }) });
        void play(a.audio);
      } catch { /* réseau en voiture : on réessaie */ }
    }, 8000);
    return () => window.clearInterval(t);
  }, [on]);

  const start = async () => {
    setErr(''); setHeard(''); setAnswer('');
    sinceRef.current = new Date().toISOString();
    try {
      await seg.start();
      setOn(true);
      try { wakeRef.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { /* écran : pas grave */ }
    } catch (e) { setErr(`Micro indisponible : ${errMsg(e)}`); }
  };
  const stop = () => { seg.stop(); stopAudio(); setOn(false); void wakeRef.current?.release().catch(() => {}); wakeRef.current = null; };
  useEffect(() => () => { void wakeRef.current?.release().catch(() => {}); }, []);

  const lvl = seg.level;
  return (
    <div style={{ display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center', padding: '6px 0' }}>
      {!on && (
        <button onClick={() => { const v = !wake; setWake(v); try { localStorage.setItem('dz:copilot_wake', v ? '1' : '0'); } catch { /* rien */ } }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: wake ? tone(T.accent, 0.15) : T.surface2, border: `1px solid ${wake ? T.accent : T.line}`, borderRadius: 14, padding: '10px 12px', color: T.text, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontSize: 22 }}>{wake ? '🗣️' : '🎙️'}</span>
          <span style={{ flex: 1, fontSize: 13 }}><b>{wake ? 'Réveil par « Dzaryx » : activé' : 'Réveil par « Dzaryx » : désactivé'}</b><br /><span style={{ color: T.muted }}>{wake ? 'Il écoute en permanence et ne répond que quand tu dis « Dzaryx… ». Parfait à la maison ou au bureau.' : 'Il répond à tout ce que tu dis (mode voiture).'}</span></span>
        </button>
      )}
      {!on && <Card accent={T.ok}><div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, textAlign: 'left' }}>Pour la voiture : pose le téléphone, lance le copilote et parle sans toucher l'écran. Il te lit tes nouveaux messages WhatsApp, tu dictes tes réponses (« oui », « vocal », « change… »), il gère Waze, la musique, ton agenda et tout le reste. L'écran reste allumé.</div></Card>}
      <button onClick={() => (on ? stop() : void start())} aria-label={on ? 'Arrêter le copilote' : 'Démarrer le copilote'}
        style={{ width: 210, height: 210, borderRadius: '50%', border: `2px solid ${on ? T.ok : T.accent}`, cursor: 'pointer', color: '#fff',
          background: `radial-gradient(circle at 50% 40%, ${tone(on ? T.ok : T.accent, 0.55)}, rgba(4,10,20,0.95) 70%)`,
          boxShadow: `0 0 ${30 + lvl * 70}px ${tone(on ? T.ok : T.accent, 0.45 + lvl * 0.4)}`, transition: 'box-shadow 90ms', fontFamily: 'Orbitron, sans-serif' }}>
        <div style={{ fontSize: 46 }}>{on ? (busy ? '⏳' : isAudioPlaying() ? '🔊' : '🎙️') : '🚗'}</div>
        <div style={{ fontSize: 12, letterSpacing: '0.18em', marginTop: 6 }}>{on ? (wake ? 'DIS « DZARYX »' : 'COPILOTE ACTIF') : 'DÉMARRER'}</div>
      </button>
      {heard && <div style={{ fontSize: 15, color: T.muted, maxWidth: 520 }}>« {heard} »</div>}
      {answer && <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.4, maxWidth: 520 }} dir="auto">{answer.replace(/https?:\/\/\S+/g, '').replace(/[*_#]/g, '')}</div>}
      {on && <Btn variant="danger" onClick={stop} style={{ minHeight: 54, width: '100%', fontSize: 16 }}>⏹ Arrêter le copilote</Btn>}
      {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
    </div>
  );
}

// ── 🖥️ SALLE DE COMMANDE (TV / PC) + 💰 FORTUNE + 🔭 MACHINE À VOIR LE FUTUR ────────────────────
interface CC { at: string; fleet: Array<{ name: string; status: string; client: string; until: string; next: string }>; revenue: number; profit: number; due: number; occupancy: number;
  returnsToday: string[]; departuresToday: string[]; whatsapp: Array<{ chat: string; preview: string }>; alerts: string[]; square: number | null; fortune: number | null;
  projects: Array<{ goal: string; done: number; total: number; today: string }>; squad: { goal: string; status: string } | null }
interface Fortune { total: number; lines: Array<{ label: string; eur: number; kind: string }>; rate: number; proj: Record<string, number> }
const ST_COLOR: Record<string, string> = { libre: T.ok, louée: T.accent, retour: T.warn, atelier: T.bad };

function Tile({ label, value, sub, color = T.accent }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${tone(color, 0.5)}`, borderRadius: 14, padding: '10px 12px', boxShadow: `0 0 18px ${tone(color, 0.15)}`, minWidth: 0 }}>
      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, letterSpacing: '0.16em', color, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 'clamp(20px, 3.2vw, 34px)', fontWeight: 800, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FutureMachine() {
  const [base, setBase] = useState<{ cars: number; price: number; marginPerDay: number; occupancy: number; monthlyCosts: number } | null>(null);
  const [extra, setExtra] = useState(2);
  const [occ, setOcc] = useState(45);
  const [price, setPrice] = useState(0);
  useEffect(() => { apiFetch<NonNullable<typeof base>>('/api/jarvis/future').then(b => { setBase(b); setPrice(b.price); setOcc(Math.max(20, Math.min(80, b.occupancy || 40))); }).catch(() => {}); }, []);
  if (!base) return null;
  const marginRatio = base.price ? base.marginPerDay / base.price : 0.3;
  // Bénéfice mensuel = voitures × jours loués × marge/jour − coûts ; montée progressive de la nouvelle flotte sur 3 mois
  const month = (cars: number, o: number, p: number, i: number) => Math.round(cars * 30 * (o / 100) * p * marginRatio * Math.min(1, 0.5 + i / 6) - base.monthlyCosts);
  const scen = [
    { name: 'Si rien ne change', color: T.faint, f: (i: number) => month(base.cars, Math.max(5, base.occupancy), base.price, 6) + i * 0 },
    { name: 'Prudent', color: T.warn, f: (i: number) => month(base.cars + Math.ceil(extra / 2), Math.max(10, occ - 15), price, i) },
    { name: 'Ton plan', color: T.ok, f: (i: number) => month(base.cars + extra, occ, price, i) },
  ];
  const months = Array.from({ length: 12 }, (_, i) => i);
  const cum = scen.map(sc => months.map(i => months.slice(0, i + 1).reduce((a, j) => a + sc.f(j), 0)));
  const max = Math.max(1, ...cum.flat().map(Math.abs));
  const W = 320, H = 140;
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${(i / 11) * W},${H / 2 - (v / max) * (H / 2 - 6)}`).join(' ');
  return (
    <Card accent={T.violet}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>🔭 La machine à voir le futur</div>
      <div style={{ fontSize: 12, color: T.muted, margin: '2px 0 10px' }}>Bénéfice cumulé sur 12 mois, à partir de tes vrais chiffres ({base.cars} voitures, {base.price} €/j en moyenne, occupation réelle {base.occupancy} %).</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }} role="img" aria-label="Projection du bénéfice cumulé sur 12 mois">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke={T.line} strokeDasharray="3 4" />
        {cum.map((arr, k) => <path key={k} d={path(arr)} fill="none" stroke={scen[k]!.color} strokeWidth={k === 2 ? 3 : 2} />)}
      </svg>
      <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
        {scen.map((sc, k) => <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 12, height: 3, background: sc.color, borderRadius: 2 }} /><span style={{ flex: 1 }}>{sc.name}</span><b>{cum[k]![11]!.toLocaleString('fr-FR')} € en 1 an</b></div>)}
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12, fontSize: 12.5 }}>
        <label>🚗 Voitures en plus : <b>{extra}</b><input type="range" min={0} max={15} value={extra} onChange={e => setExtra(Number(e.target.value))} style={{ width: '100%' }} /></label>
        <label>📈 Occupation visée : <b>{occ} %</b><input type="range" min={10} max={90} value={occ} onChange={e => setOcc(Number(e.target.value))} style={{ width: '100%' }} /></label>
        <label>💶 Prix moyen : <b>{price} €/j</b><input type="range" min={20} max={90} value={price} onChange={e => setPrice(Number(e.target.value))} style={{ width: '100%' }} /></label>
      </div>
      <div style={{ fontSize: 11, color: T.faint, marginTop: 8 }}>Estimation : marge réelle par jour de tes voitures, coûts moyens des 3 derniers mois, nouvelles voitures qui montent en charge sur 3 mois. Pas une promesse.</div>
    </Card>
  );
}

function Salle({ onAsk }: { onAsk: (p: string) => void }) {
  const [cc, setCc] = useState<CC | null>(null);
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    apiFetch<CC>('/api/jarvis/command-center').then(setCc).catch(e => setErr(errMsg(e)));
    apiFetch<Fortune>('/api/jarvis/fortune').then(setFortune).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t); }, [load]);
  const full = () => { const el = boxRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null; (el?.requestFullscreen?.() ?? el?.webkitRequestFullscreen?.()); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={full} style={{ flex: 1 }}>⛶ Plein écran (TV / PC)</Btn>
        <Btn onClick={load}>↻</Btn>
      </div>
      {err && <div style={{ color: T.bad, fontSize: 13 }}>{err}</div>}
      <div ref={boxRef} style={{ display: 'grid', gap: 10, background: '#030814', padding: 10, borderRadius: 16, overflowY: 'auto' }}>
        {!cc && <div style={{ color: T.faint, fontSize: 13, padding: 20, textAlign: 'center' }}>Chargement de la salle de commande…</div>}
        {cc && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: T.accent, letterSpacing: '0.2em' }}>
              <span>DZARYX · SALLE DE COMMANDE</span><span>{new Date(cc.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              <Tile label="CA du mois" value={`${cc.revenue.toLocaleString('fr-FR')} €`} sub={`bénéfice ${cc.profit.toLocaleString('fr-FR')} €`} color={T.ok} />
              <Tile label="Occupation" value={`${cc.occupancy} %`} sub={`${cc.fleet.filter(f => f.status !== 'libre').length}/${cc.fleet.length} voitures sorties`} />
              <Tile label="À encaisser" value={`${cc.due.toLocaleString('fr-FR')} €`} color={cc.due ? T.warn : T.ok} />
              <Tile label="Fortune" value={fortune ? `${fortune.total.toLocaleString('fr-FR')} €` : '—'} sub={cc.square ? `1 € = ${Math.round(cc.square)} DA` : undefined} color={T.violet} />
            </div>
            {cc.alerts.length > 0 && <div style={{ background: tone(T.bad, 0.15), border: `1px solid ${T.bad}`, borderRadius: 12, padding: 10, fontSize: 13 }}>⚠️ {cc.alerts.join(' · ')}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              <div style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${T.line}`, borderRadius: 14, padding: 10 }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, letterSpacing: '0.16em', color: T.accent, marginBottom: 6 }}>FLOTTE</div>
                <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                  {cc.fleet.map(f => (
                    <div key={f.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: ST_COLOR[f.status] ?? T.faint, flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ color: T.muted, fontSize: 11.5, whiteSpace: 'nowrap' }}>{f.status === 'libre' ? (f.next ? `réservée le ${f.next.slice(8, 10)}/${f.next.slice(5, 7)}` : 'libre') : `${f.client}${f.until ? ` → ${f.until.slice(8, 10)}/${f.until.slice(5, 7)}` : ''}`}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                <div style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, fontSize: 12.5 }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, letterSpacing: '0.16em', color: T.warn, marginBottom: 6 }}>AUJOURD'HUI</div>
                  {[...cc.departuresToday.map(d => `🚗 Départ : ${d}`), ...cc.returnsToday.map(r => `🏁 Retour : ${r}`)].map((l, i) => <div key={i}>{l}</div>)}
                  {!cc.departuresToday.length && !cc.returnsToday.length && <div style={{ color: T.faint }}>Ni départ ni retour.</div>}
                </div>
                <div style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, fontSize: 12.5 }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, letterSpacing: '0.16em', color: T.ok, marginBottom: 6 }}>WHATSAPP EN ATTENTE ({cc.whatsapp.length})</div>
                  {cc.whatsapp.map((w, i) => <div key={i} onClick={() => onAsk(`Lis WhatsApp ${w.chat}`)} style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">💬 {w.chat} : {w.preview.replace(/\s+/g, ' ')}</div>)}
                  {!cc.whatsapp.length && <div style={{ color: T.faint }}>Rien en attente.</div>}
                </div>
                {(cc.projects.length > 0 || cc.squad) && (
                  <div style={{ background: 'rgba(6,12,24,0.9)', border: `1px solid ${T.line}`, borderRadius: 14, padding: 10, fontSize: 12.5 }}>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9.5, letterSpacing: '0.16em', color: T.violet, marginBottom: 6 }}>PROJETS & AGENTS</div>
                    {cc.projects.map((p, i) => <div key={i}>🎼 {p.goal} — {p.done}/{p.total}{p.today ? ` · ${p.today}` : ''}</div>)}
                    {cc.squad && <div>🛰️ {cc.squad.goal} — {cc.squad.status}</div>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {fortune && fortune.lines.length > 0 && (
        <Card accent={T.violet}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>💰 Ta fortune : {fortune.total.toLocaleString('fr-FR')} €</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6, display: 'grid', gap: 2 }}>
            {fortune.lines.map((l, i) => <div key={i} style={{ display: 'flex' }}><span style={{ flex: 1 }}>{l.label}</span><b style={{ color: l.eur < 0 ? T.bad : T.text }}>{l.eur.toLocaleString('fr-FR')} €</b></div>)}
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>📈 {Object.entries(fortune.proj).map(([k, v]) => `dans ${k} : ${v.toLocaleString('fr-FR')} €`).join(' · ')}</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>Ajoute tes biens à la voix : « j'ai 3 000 € sur mon compte », « la Clio vaut 1,2 million de DA ».</div>
        </Card>
      )}
      <FutureMachine />
    </div>
  );
}

// ── 🧠 CERVEAU (Jarvis 4, 28/10) : décisions à boutons, salle de crise, écran partagé (télé / PC), widget ────────
interface Decision { id: string; at: number; title: string; options: Array<{ label: string }> }
interface Crisis { title: string; at: number; steps: Array<{ text: string; who?: string; done?: boolean; message?: string }>; log: string[] }
interface ScreenNow { title: string; content: string; at: number }
interface Widget { money: number; month: number | null; waiting: number; sport: string; energy: number | null; next: string; weather: string; weatherText: string; at: string }

function Cerveau({ onAsk }: { onAsk: (p: string) => void }) {
  const [dec, setDec] = useState<Decision[]>([]);
  const [crisis, setCrisis] = useState<Crisis | null>(null);
  const [screen, setScreen] = useState<ScreenNow | null>(null);
  const [w, setW] = useState<Widget | null>(null);
  const [msg, setMsg] = useState('');
  const screenRef = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    apiFetch<{ decisions: Decision[] }>('/api/jarvis/decisions').then(r => setDec(r.decisions)).catch(() => {});
    apiFetch<{ crisis: Crisis | null }>('/api/jarvis/crisis').then(r => setCrisis(r.crisis)).catch(() => {});
    apiFetch<{ screen: ScreenNow | null }>('/api/jarvis/screen').then(r => setScreen(r.screen)).catch(() => {});
    apiFetch<Widget>('/api/jarvis/widget').then(setW).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 15_000); return () => window.clearInterval(t); }, [load]);
  const choose = async (id: string, n: number) => {
    setMsg('…');
    try { setMsg((await apiFetch<{ text: string }>(`/api/jarvis/decisions/${id}`, { method: 'POST', body: JSON.stringify({ choice: n }) })).text); load(); } catch (e) { setMsg(errMsg(e)); }
  };
  const full = () => { const el = screenRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null; (el?.requestFullscreen?.() ?? el?.webkitRequestFullscreen?.()); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {w && (
        <Card accent={T.accent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b style={{ fontSize: 15 }}>{w.weather} {w.weatherText}</b><span style={{ fontSize: 11, color: T.faint }}>{w.at}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginTop: 8 }}>
            <Tile label="Aujourd'hui" value={`${w.money.toLocaleString('fr-FR')} €`} sub={w.month != null ? `mois ${w.month.toLocaleString('fr-FR')} €` : undefined} color={T.ok} />
            <Tile label="Clients qui attendent" value={String(w.waiting)} color={w.waiting ? T.warn : T.ok} />
            <Tile label="Séance" value={w.sport} />
            <Tile label="Énergie" value={w.energy != null ? `${w.energy}/10` : '—'} color={T.violet} />
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8 }}>➡️ Prochaine étape : {w.next}</div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>C'est aussi le widget de ton écran d'accueil (app Scriptable).</div>
        </Card>
      )}
      <SectionTitle>🔘 Décisions en attente</SectionTitle>
      {!dec.length && <div style={{ color: T.faint, fontSize: 13 }}>Rien à décider. Quand Dzaryx a besoin de toi, les boutons arrivent ici et sur Telegram (réponds juste 1, 2 ou 3).</div>}
      {dec.map(d => (
        <Card key={d.id}>
          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }} dir="auto">{d.title}</div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {d.options.map((o, i) => <Btn key={i} onClick={() => void choose(d.id, i + 1)}>{i + 1}. {o.label}</Btn>)}
          </div>
        </Card>
      ))}
      {msg && <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', color: T.muted }}>{msg}</div>}
      {crisis && (
        <>
          <SectionTitle>🚨 Salle de crise</SectionTitle>
          <Card accent={T.bad}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{crisis.title}</div>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {crisis.steps.map((st, i) => (
                <div key={i} style={{ fontSize: 13, opacity: st.done ? 0.55 : 1 }}>
                  {st.done ? '✅' : '⬜'} {i + 1}. {st.text}{st.who ? <span style={{ color: T.muted }}> — {st.who}</span> : null}
                  {!st.done && <span onClick={() => onAsk(`Salle de crise : étape ${i + 1} faite`)} style={{ marginLeft: 8, color: T.accent, cursor: 'pointer', fontSize: 12 }}>marquer fait</span>}
                  {st.message && <div style={{ fontSize: 12, color: T.faint, marginLeft: 22 }} dir="auto">✉️ {st.message}</div>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>{crisis.log.slice(-4).join(' · ')}</div>
            <Btn onClick={() => onAsk('Ferme la salle de crise, c\'est réglé')} style={{ marginTop: 8 }}>🟢 C'est réglé</Btn>
          </Card>
        </>
      )}
      <SectionTitle>📺 Écran partagé</SectionTitle>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={full} style={{ flex: 1 }}>⛶ Plein écran (télé / PC)</Btn>
        <Btn onClick={load}>↻</Btn>
      </div>
      <div ref={screenRef} style={{ background: '#030814', borderRadius: 16, padding: 18, minHeight: 160, overflowY: 'auto' }}>
        {screen ? (
          <>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: T.accent, letterSpacing: '0.18em', marginBottom: 10 }}>{screen.title.toUpperCase()}</div>
            <div style={{ fontSize: 17, lineHeight: 1.5, whiteSpace: 'pre-wrap' }} dir="auto">{screen.content.replace(/\*\*/g, '')}</div>
          </>
        ) : <div style={{ color: T.faint, fontSize: 13, textAlign: 'center', paddingTop: 50 }}>Dis à Dzaryx « continue sur la télé » et la suite s'affiche ici.</div>}
      </div>
    </div>
  );
}

// ── 🧭 VIE : identités et votes, intentions, décisions, couple, récupération, eau, prières ──
interface LifeOverview {
  identities: Array<{ name: string; kind: string; image?: string; today: string[]; week: number }>;
  intentions: Array<{ text: string; done?: boolean }>;
  decisions: Array<{ id: string; text: string; followAt: string; verdict?: string }>;
  couple: { date: string; time: string; place: string } | null;
  prayer: string; water: string; readiness: string; curve: string;
}
function Vie({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [o, setO] = useState<LifeOverview | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { apiFetch<LifeOverview>('/api/jarvis/life').then(setO).catch(() => setMsg('Impossible de charger.')); }, []);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const r = await apiFetch<{ message: string; overview: LifeOverview }>('/api/jarvis/life/action', { method: 'POST', body: JSON.stringify(body) }); setO(r.overview); setMsg(r.message); }
    catch { setMsg('Échec, réessaie.'); } finally { setBusy(false); }
  };
  if (!o) return <Empty icon="🧭" title={msg || 'Chargement…'} />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {o.readiness && <Card accent={T.ok}><div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{o.readiness}</div>{o.curve && <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: T.muted, whiteSpace: 'pre-wrap', marginTop: 8 }}>{o.curve}</div>}</Card>}
      <SectionTitle>🗳️ Qui je deviens</SectionTitle>
      <div style={{ display: 'grid', gap: 10 }}>
        {o.identities.map(i => (
          <Card key={i.name} style={{ padding: 0, overflow: 'hidden' }}>
            {i.image && <img src={i.image} alt="" loading="lazy" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />}
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 14.5 }}>{i.name}</b><Badge>{i.week} cette semaine</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: i.today.length ? T.text : T.faint, marginTop: 4 }}>{i.today.length ? `✅ ${i.today.join(' · ')}` : 'Pas encore de vote aujourd\'hui'}</div>
            </div>
          </Card>
        ))}
      </div>
      <Btn onClick={() => onAsk('Je veux changer mes identités « qui je veux devenir »')}>✏️ Changer mes identités</Btn>
      <SectionTitle>🧭 Mes intentions de la semaine</SectionTitle>
      <Card>
        {o.intentions.length ? o.intentions.map((t, k) => (
          <div key={k} onClick={() => !t.done && act({ action: 'intention_faite', n: k + 1 })} style={{ fontSize: 13.5, padding: '6px 0', cursor: t.done ? 'default' : 'pointer', opacity: t.done ? 0.55 : 1 }}>{t.done ? '✅' : '⬜'} {t.text}</div>
        )) : <div style={{ fontSize: 13, color: T.faint }}>Choisies dimanche à la revue de vie (19h).</div>}
        <Btn disabled={busy} onClick={() => act({ action: 'revue' })} style={{ marginTop: 8 }}>🧭 Lancer ma revue de vie maintenant</Btn>
      </Card>
      <SectionTitle>💑 Soirée à deux</SectionTitle>
      <Card>
        <div style={{ fontSize: 13.5 }}>{o.couple ? `Prochaine : ${o.couple.place} — ${o.couple.date.slice(8)}/${o.couple.date.slice(5, 7)} à ${o.couple.time.replace(':', 'h')}` : 'Je te propose une idée tous les 15 jours (mercredi midi).'}</div>
        <Btn disabled={busy} onClick={() => act({ action: 'couple', op: 'propose' })} style={{ marginTop: 8 }}>💡 Une idée maintenant</Btn>
      </Card>
      <SectionTitle>🛑 Décisions</SectionTitle>
      <Card>
        {o.decisions.length ? o.decisions.map(d => <div key={d.id} style={{ fontSize: 13, padding: '4px 0' }}>• {d.text}<span style={{ color: T.faint }}>{d.verdict ? ` → ${d.verdict}` : ` (bilan le ${d.followAt.slice(8)}/${d.followAt.slice(5, 7)})`}</span></div>)
          : <div style={{ fontSize: 13, color: T.faint }}>Dis « je veux acheter / investir / m'associer… » : je te fais le conseil avant de décider.</div>}
        <Btn onClick={() => onAsk('J\'ai une grosse décision à prendre : ')} style={{ marginTop: 8 }}>🛑 J'ai une décision à prendre</Btn>
      </Card>
      <Card>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{o.water}</div>
        {o.prayer && <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{o.prayer}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Btn disabled={busy} onClick={() => act({ action: 'priere', op: 'rappels_on' })}>🔔 Rappels prière</Btn>
          <Btn disabled={busy} onClick={() => act({ action: 'priere', op: 'rappels_off' })}>🔕 Sans rappel</Btn>
          <Btn disabled={busy} onClick={() => act({ action: 'rapport' })}>📄 Rapport santé PDF</Btn>
          <Btn disabled={busy} onClick={() => act({ action: 'correlations' })}>🔬 Mes bons jours</Btn>
        </div>
      </Card>
      {msg && <Card accent={T.accent}><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{msg}</div></Card>}
    </div>
  );
}

// ── 🩺 SANTÉ + 🍏 SIRI (Raccourcis iPhone) ───────────────────────────────────
function SanteSiri() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => { apiFetch<{ text: string }>('/api/jarvis/health').then(r => setText(r.text)).catch(() => {}); }, []);
  const token = getDeviceToken();
  const copy = (label: string, v: string) => { void navigator.clipboard?.writeText(v).then(() => { setCopied(label); setTimeout(() => setCopied(''), 2000); }); };
  const Copy = ({ label, v }: { label: string; v: string }) => (
    <button onClick={() => copy(label, v)} style={{ display: 'block', width: '100%', textAlign: 'left', background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '8px 10px', color: T.text, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, wordBreak: 'break-all', cursor: 'pointer', marginTop: 4 }}>
      {copied === label ? '✅ copié' : `📋 ${v.length > 60 ? `${v.slice(0, 60)}…` : v}`}
    </button>
  );
  const step = (n: number, t: React.ReactNode) => <div style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}><b style={{ color: T.accent, minWidth: 18 }}>{n}.</b><div style={{ flex: 1 }}>{t}</div></div>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card accent={T.ok}>
        <div style={{ fontWeight: 800, fontSize: 15 }}>🩺 Jarvis santé</div>
        <div style={{ fontSize: 12.5, color: T.muted, whiteSpace: 'pre-wrap', marginTop: 6 }}>{text || 'Chargement…'}</div>
      </Card>
      <Card>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>Installer le Raccourci « Dzaryx Santé » (une seule fois)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {step(1, <>Ouvre l'app <b>Raccourcis</b> › <b>+</b> › nomme-le « Dzaryx Santé ».</>)}
          {step(2, <>Ajoute <b>Rechercher des échantillons de santé</b> pour chacun, filtre <b>Date de début : aujourd'hui</b> : <b>Nombre de pas</b>, <b>Énergie active</b>, <b>Fréquence cardiaque au repos</b>, <b>Variabilité de la fréquence cardiaque</b>, <b>Poids</b> (si tu as une balance connectée).</>)}
          {step(3, <>Ajoute <b>Rechercher des entraînements</b> (date : aujourd'hui) : leur <b>Type</b> et leur <b>Durée</b>. Pas de sommeil : tu ne dors pas avec la montre.</>)}
          {step(4, <>Ajoute <b>Obtenir le contenu de l'URL</b> : méthode <b>POST</b>, adresse :<Copy label="url" v={`${PRIMARY_BACKEND}/api/jarvis/health`} /> En-tête <b>Authorization</b> = <Copy label="tok" v={`Bearer ${token}`} /> Corps <b>JSON</b> : <code>steps</code>, <code>active_kcal</code>, <code>resting_heart_rate</code>, <code>hrv</code>, <code>weight</code>, <code>workouts</code>, <code>workout_duration</code> = les résultats.</>)}
          {step(5, <>Onglet <b>Automatisation</b> › <b>Heure de la journée</b> › <b>21h30</b>, tous les jours › lancer « Dzaryx Santé » › <b>Exécuter immédiatement</b>. Dzaryx coche ta séance, ajuste FORME et allège la séance de demain si ton cœur est fatigué.</>)}
        </div>
      </Card>
      <Card accent={T.warn}>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>⌚ Séance en direct avec la montre</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 8 }}>Dès que tu lances un entraînement sur l'Apple Watch, Dzaryx le sait : tapis fini → il t'envoie la muscu ; fin → durée, calories, cœur moyen / max, minutes par zone, comparaison avec la dernière fois et bilan. Tu n'as rien à lui dire.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {step(1, <>Raccourcis › <b>Automatisation</b> › <b>+</b> › <b>Entraînement Apple Watch</b> › <b>Commence</b> › choisis <b>Course en salle, Marche en salle, Elliptique, Vélo en salle</b> › <b>Exécuter immédiatement</b>.</>)}
          {step(2, <>Action <b>Obtenir le contenu de l'URL</b> : <b>POST</b> sur <Copy label="wo" v={`${PRIMARY_BACKEND}/api/jarvis/workout`} /> En-tête <b>Authorization</b> = <Copy label="tok3" v={`Bearer ${token}`} /> Corps JSON : <code>event</code> = <b>start</b>, <code>type</code> = <b>tapis</b>.</>)}
          {step(3, <>Même chose avec <b>Se termine</b> (mêmes types). Avant l'URL, ajoute <b>Rechercher des échantillons de santé</b> × 2, filtre <b>Date de début : dans les dernières 60 minutes</b> : <b>Fréquence cardiaque</b> et <b>Énergie active</b>. Corps JSON : <code>event</code> = <b>end</b>, <code>type</code> = <b>tapis</b>, <code>heart_rate</code> et <code>active_kcal</code> = les résultats.</>)}
          {step(4, <>Refais les étapes 1 à 3 pour <b>Musculation traditionnelle</b> et <b>Renforcement fonctionnel</b>, avec <code>type</code> = <b>muscu</b> (2 automatisations : commence + se termine).</>)}
          {step(5, <>❤️ <b>« Dis Siri, Dzaryx cœur »</b> (sur le tapis) : nouveau raccourci nommé <b>Dzaryx cœur</b> → <b>Rechercher des échantillons de santé</b> Fréquence cardiaque, <b>dernières 2 minutes</b>, trier par date, limite 1 → <b>Obtenir le contenu de l'URL</b> POST sur la même adresse, corps JSON <code>event</code> = <b>pulse</b>, <code>heart_rate</code> = le résultat → <b>Obtenir la valeur du dictionnaire</b> « say » → <b>Énoncer le texte</b>. Il te dit ta zone et s'il faut accélérer ou ralentir.</>)}
          {step(6, <>À la salle, lance simplement l'entraînement sur ta montre. Si tu veux, dis un poids (« 60 kg 12 ») : il le note, sinon il suit au chrono.</>)}
        </div>
      </Card>
      <Card accent={T.accent}>
        <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>🍏 « Dis Siri, Dzaryx » — ton iPhone à la voix</div>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 8 }}>Tu dis « Dis Siri, Dzaryx », tu parles, Dzaryx répond à voix haute et utilise tous ses outils (clients, WhatsApp Business, papiers des clients → Telegram), appelle, envoie un SMS, ouvre Waze, la musique… et te répond en conversation suivie.</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {step(1, <>Raccourcis › <b>+</b> › nomme-le exactement <b>Dzaryx</b>.</>)}
          {step(2, <>Ajoute <b>Dicter le texte</b> (langue : français, <b>Arrêter l'écoute : après une pause</b>).</>)}
          {step(3, <>Ajoute <b>Obtenir le contenu de l'URL</b> : <b>POST</b> sur <Copy label="siri" v={`${PRIMARY_BACKEND}/api/jarvis/siri`} /> En-tête <b>Authorization</b> = <Copy label="tok2" v={`Bearer ${token}`} /> Corps JSON : <code>text</code> = « Texte dicté ».</>)}
          {step(4, <>Ajoute <b>Obtenir la valeur du dictionnaire</b> « say » → <b>Énoncer le texte</b>.</>)}
          {step(5, <>Ajoute <b>Obtenir la valeur du dictionnaire</b> « url » → <b>Si</b> elle a une valeur → <b>Ouvrir les URL</b>.</>)}
          {step(6, <>⚠️ <b>Indispensable pour discuter</b> : ajoute <b>Obtenir la valeur du dictionnaire</b> « listen » → <b>Si</b> elle a une valeur → <b>Exécuter le raccourci</b> « Dzaryx ». Le micro se rouvre après CHAQUE réponse : tu enchaînes comme sur Telegram. Pour finir : « merci », « c'est bon » ou tu ne dis rien.</>)}
          {step(7, <>💬 Pour une <b>vraie conversation libre</b> (tu lui coupes la parole, il t'écoute en continu) : « Dis Siri, Dzaryx » puis <b>« appelle-moi »</b> → il t'appelle sur Telegram dans la seconde, avec tous ses outils et la suite de ce que vous disiez.</>)}
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 8 }}>Ta clé est personnelle : ne la partage avec personne. Si tu te déconnectes de l'app, recopie la nouvelle.</div>
      </Card>
    </div>
  );
}

export default function JarvisScreen({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('dz:jarvis_tab') as Tab) || 'hud'; } catch { return 'souffleur'; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('dz:jarvis_tab', t); } catch { /* ignore */ } };
  return (
    <Screen header={<>
      <PageHeader eyebrow="Dzaryx · mode Jarvis" title="JARVIS" subtitle="Il voit, il écoute, il conduit avec toi, il agit." />
      <div style={{ padding: '0 12px 8px', overflowX: 'auto' }}>
        <Segmented<Tab> items={[{ id: 'vie', label: '🧭 Vie' }, { id: 'cerveau', label: '🧠 Cerveau' }, { id: 'hud', label: '🕶️ HUD' }, { id: 'copilote', label: '🚗 Copilote' }, { id: 'escouade', label: '🛰️ Escouade' }, { id: 'salle', label: '🖥️ Salle' }, { id: 'sante', label: '🩺 Santé·Siri' }, { id: 'souffleur', label: '🎧 Souffleur' }, { id: 'reunion', label: '📝 Réunion' }, { id: 'sparring', label: '🥊 Entraîn.' },
          { id: 'protocoles', label: '⚡ Protocoles' }, { id: 'video', label: '🎥 État lieux' }]} value={tab} onChange={pick} />
      </div>
    </>}>
      <style>{'@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes hudscan{0%{top:0}100%{top:100%}}'}</style>
      {tab === 'cerveau' && <Cerveau onAsk={onAsk} />}
      {tab === 'hud' && <Hud />}
      {tab === 'copilote' && <Copilote />}
      {tab === 'escouade' && <Escouade />}
      {tab === 'salle' && <Salle onAsk={onAsk} />}
      {tab === 'vie' && <Vie onAsk={onAsk} />}
      {tab === 'sante' && <SanteSiri />}
      {tab === 'souffleur' && <><LiveMode key="s" kind="souffleur" /></>}
      {tab === 'reunion' && <><LiveMode key="r" kind="reunion" /><History kind="reunion" /></>}
      {tab === 'sparring' && <><LiveMode key="p" kind="sparring" /><History kind="sparring" /></>}
      {tab === 'protocoles' && <Protocols onAsk={onAsk} />}
      {tab === 'video' && <VideoInspection />}
      {(tab === 'souffleur' || tab === 'reunion' || tab === 'sparring' || tab === 'copilote') && !('MediaRecorder' in window) && <Empty icon="🎙️" title="Micro non pris en charge" text="Mets à jour iOS (14.5 ou plus) pour utiliser le mode Jarvis." />}
    </Screen>
  );
}
