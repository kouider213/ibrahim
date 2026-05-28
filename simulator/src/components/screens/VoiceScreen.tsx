import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio, stopAudio,
  sendNativeAction, tryParseNativeAction,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props {
  onNavigateText: () => void;
  onWsStatus: (ok: boolean) => void;
  actor?: 'kouider' | 'houari';
}

const STATE_COLOR: Record<DzaryxStatus, string> = {
  idle:      '#00d4ff',
  listening: '#ff3366',
  thinking:  '#ffaa00',
  speaking:  '#00e676',
};

const STATE_LABEL: Record<DzaryxStatus, [string, string]> = {
  idle:      ['EN ATTENTE', 'STANDBY'],
  listening: ['ÉCOUTE ACTIVE', 'LISTENING'],
  thinking:  ['TRAITEMENT', 'THINKING'],
  speaking:  ['PARLE', 'SPEAKING'],
};

const STATE_MSG: Record<DzaryxStatus, string> = {
  idle:      'Je suis prêt à vous écouter',
  listening: 'Parlez naturellement...',
  thinking:  'Réflexion en cours...',
  speaking:  'Dzaryx vous répond...',
};

const SPEECH_RMS    = 0.004;
const SILENCE_RMS   = 0.006;
const SILENCE_DELAY = 900;
const MIN_SPEECH_MS = 250;
const MAX_REC_MS    = 15000;

export default function VoiceScreen({ onNavigateText, onWsStatus }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const animRef         = useRef<number>(0);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const speechStartRef  = useRef<number>(0);
  const isSpeechRef     = useRef(false);
  const isRecordingRef  = useRef(false);
  const sessionId       = useRef(getOrCreateSessionId());

  const [status, setStatus]     = useState<DzaryxStatus>('idle');
  const [toolLabel, setLabel]   = useState<string | null>(null);
  const [response, setResp]     = useState('');
  const [respStream, setStream] = useState('');
  const [scanActive, setScanActive] = useState(false);
  const [micErr, setMicErr]     = useState(false);
  const [wsConn, setWsConn]     = useState(false);
  const [visionActive, setVision] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const [particles]             = useState(() => makeParticles(30));
  const [hudMsg, setHud]        = useState('SYSTÈME DZARYX INITIALISÉ');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [rmsLevel, setRmsLevel] = useState(0);
  const rmsRef = useRef(0);
  const [respExpanded, setRespExpanded] = useState(false);

  const statusRef = useRef(status);
  statusRef.current = status;

  const [continuousMode, setContinuousMode] = useState(false);
  const continuousModeRef = useRef(false);
  continuousModeRef.current = continuousMode;
  const prevStatusRef = useRef<DzaryxStatus>('idle');

  const [handsFree, setHandsFree]         = useState(false);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;
  const [wakeWordOn, setWakeWordOn]       = useState(false);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const sock = connectSocket(sessionId.current, {
      onStatus:        (s, l) => { setStatus(s); setLabel(l ?? null); },
      onAudio:             b64 => playBase64Audio(b64),
      onAudioChunk:        b64 => enqueueChunk(b64),
      onAudioComplete:     ()  => flushChunks(),
      onAudioSentenceDone: ()  => flushChunks(),
      onTextChunk:     c   => setStream(s => s + c),
      onTextComplete:  t   => { setResp(t); setStream(''); },
      onResponse:      (t, _fb) => { setResp(t); setStream(''); },
      onProactive:     t   => { setHud(t); setResp(t); },
    });
    sock.on('connect',    () => { setWsConn(true);  onWsStatus(true); });
    sock.on('disconnect', () => { setWsConn(false); onWsStatus(false); });
    return () => disconnectSocket();
  }, [onWsStatus]);

  // ── Continuous voice mode — auto-restart after TTS completes ──────────────
  useEffect(() => {
    if (prevStatusRef.current === 'speaking' && status === 'idle' && continuousModeRef.current) {
      setTimeout(() => {
        if (statusRef.current === 'idle' && !isRecordingRef.current) {
          setHud('🔄 MODE CONTINU — J\'ÉCOUTE...');
          startRecording();
        }
      }, 400);
    }
    prevStatusRef.current = status;
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Native wake word bridge (Porcupine via React Native injectJavaScript) ────
  useEffect(() => {
    const activate = (skipGreeting = false) => {
      if (statusRef.current === 'speaking') {
        stopAudio();
        setStatus('idle');
        setTimeout(() => startRecording(), 200);
        return;
      }
      if (statusRef.current !== 'idle' || isRecordingRef.current) return;
      setHud('🎤 DZARYX ACTIVÉ — J\'ÉCOUTE');
      if (skipGreeting || handsFreeRef.current) {
        startRecording();
        return;
      }
      try {
        const utter = new SpeechSynthesisUtterance('Je t\'écoute');
        utter.lang = 'fr-FR'; utter.rate = 1.15; utter.pitch = 1.0;
        utter.onend = () => startRecording();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        startRecording();
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__triggerWakeWord = () => activate(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__triggerWakeWordFast = () => activate(true);
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__triggerWakeWord;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__triggerWakeWordFast;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic init ────────────────────────────────────────────────────────────────
  const micInitRef = useRef(false);

  async function initMic() {
    if (micInitRef.current) return;
    micInitRef.current = true;
    drawCanvas();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;
      const audioCtx = new AudioContext({ sampleRate: 44100 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      startVAD();
      startWakeWord();
      setHud('MICROPHONE ACTIF — PARLE-MOI');
    } catch (e) {
      console.error('[mic] error:', e);
      setMicErr(true);
      setHud('MICRO INACCESSIBLE — VÉRIFIE LES PERMISSIONS');
    }
  }

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── Live camera ─────────────────────────────────────────────────────────────
  async function toggleLiveCam() {
    if (camActive) {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamActive(false);
      setVision(false);
      setHud('CAMÉRA DÉSACTIVÉE');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      setCamActive(true);
      setVision(true);
      setHud('CAMÉRA ACTIVE — PARLE PENDANT QUE TU FILMES');
    } catch {
      setHud('PERMISSION CAMÉRA REFUSÉE');
    }
  }

  function captureFrame(): string | undefined {
    const video = videoRef.current;
    if (!video || !camStreamRef.current || video.readyState < 2) return undefined;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  }

  // ── Wake word (SpeechRecognition API — browser fallback for Porcupine) ───────
  const WAKE_RE = /\b(dzaryx|dzari|hey dzaryx|ibrahim|hey ibrahim|dzarieks)\b/;
  function startWakeWord() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.continuous     = true;
    rec.lang           = 'fr-FR';
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onstart  = () => setWakeWordOn(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror  = () => setWakeWordOn(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i]![0]!.transcript as string).toLowerCase();
        if (WAKE_RE.test(t)) {
          if (statusRef.current === 'idle' && !isRecordingRef.current) {
            setHud('🎤 WAKE WORD — DZARYX ACTIVÉ');
            if (handsFreeRef.current) {
              startRecording();
            } else {
              try {
                const utter = new SpeechSynthesisUtterance('Je t\'écoute');
                utter.lang = 'fr-FR'; utter.rate = 1.15;
                utter.onend = () => startRecording();
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
              } catch { startRecording(); }
            }
          } else if (statusRef.current === 'speaking') {
            stopAudio();
            setStatus('idle');
            setTimeout(() => startRecording(), 100);
          }
        }
      }
    };
    rec.onend = () => {
      setWakeWordOn(false);
      setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 300);
    };
    try { rec.start(); } catch { /* ignore */ }
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────
  function startVAD() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const timeBuf = new Uint8Array(analyser.fftSize);
    const a = analyser;
    function tick() {
      if (statusRef.current === 'thinking') {
        requestAnimationFrame(tick); return;
      }
      a.getByteTimeDomainData(timeBuf);
      let sq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i]! - 128) / 128;
        sq += v * v;
      }
      const rms = Math.sqrt(sq / timeBuf.length);
      rmsRef.current = rms;
      setRmsLevel(Math.min(rms * 80, 1));
      if (statusRef.current === 'idle' && !isRecordingRef.current) {
        setHud(`MIC: ${(rms * 1000).toFixed(1)} | SEUIL: ${(SPEECH_RMS * 1000).toFixed(1)} | PARLE-MOI`);
      }
      if (rms > SPEECH_RMS) {
        if (statusRef.current === 'speaking') {
          stopAudio();
          setStatus('idle');
        }
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (!isSpeechRef.current) { isSpeechRef.current = true; speechStartRef.current = Date.now(); }
        if (!isRecordingRef.current) startRecording();
      } else if (rms < SILENCE_RMS && isSpeechRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          const dur = Date.now() - speechStartRef.current;
          if (dur > MIN_SPEECH_MS) stopRecordingAndProcess();
          else resetVAD();
        }, SILENCE_DELAY);
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current) return;
    isRecordingRef.current = true;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(100);
    recorderRef.current = rec;
    setStatus('listening');
    setHud('ENREGISTREMENT EN COURS...');
    setTimeout(() => { if (isRecordingRef.current) stopRecordingAndProcess(); }, MAX_REC_MS);
  }

  async function stopRecordingAndProcess() {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') { resetVAD(); return; }
    await new Promise<void>(r => { rec.onstop = () => r(); rec.stop(); });
    recorderRef.current = null;
    resetVAD();
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (blob.size < 500) return;
    setStatus('thinking');
    setHud('TRANSCRIPTION EN COURS...');
    try {
      const b64 = await blobToBase64(blob);
      const { text } = await api.transcribe(b64, 'audio/webm');
      if (!text?.trim()) { setStatus('idle'); setHud('PARLE-MOI'); return; }
      setHud(`"${text}"`);
      const frame = captureFrame();
      const res = await api.chat(text, sessionId.current, frame, frame ? 'image/jpeg' : undefined);
      if (frame) setHud(`📷 + 🎤 "${text.slice(0, 40)}"`);
      if (res.text) {
        const nativeAction = tryParseNativeAction(res.text);
        if (nativeAction) {
          sendNativeAction(nativeAction);
          const h = Number(nativeAction['hour'] ?? 0);
          const m = Number(nativeAction['minute'] ?? 0);
          const confirmText = `✅ Alarme créée pour ${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
          setResp(confirmText);
          setHud(confirmText);
        } else {
          setResp(res.text);
          setHud(res.text.slice(0, 80) + (res.text.length > 80 ? '…' : ''));
          if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
        }
      }
    } catch (err) {
      console.error('[voice] error:', err);
      setStatus('idle');
      setHud('ERREUR — RÉESSAIE');
    }
  }

  function resetVAD() {
    isRecordingRef.current = false;
    isSpeechRef.current    = false;
    if (statusRef.current !== 'speaking' && statusRef.current !== 'thinking') setStatus('idle');
  }

  // ── Canvas background ───────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    function frame(t: number) {
      animRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      const rms   = rmsRef.current;
      const pulse = Math.sin(t * 0.002) * 0.5 + 0.5;
      const amp   = Math.max(rms * 3, pulse * 0.06);
      const col   = STATE_COLOR[statusRef.current];

      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(0, y, W, 2);
      }

      // Subtle ambient rings
      [0.95, 0.75].forEach((f, i) => {
        const r = Math.min(cx, cy) * f;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(col, (0.04 - i * 0.015) * (1 + amp * 2));
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      // Floating particles
      particles.forEach((p, idx) => {
        p.y -= p.vy * (1 + amp);
        p.x += Math.sin(t * 0.001 + idx) * 0.2;
        p.life -= 0.002;
        if (p.life <= 0) {
          p.x = Math.random() * W;
          p.y = H + 10;
          p.life = 0.4 + Math.random() * 0.6;
          p.vy = 0.2 + Math.random() * 0.4;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(col, p.life * 0.25);
        ctx.fill();
      });

      // Star field
      if (t % 3 < 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(Math.random() * W, Math.random() * H * 0.6, 1, 1);
      }
    }
    frame(0);
  }, [particles]);

  // ── Vision ──────────────────────────────────────────────────────────────────
  async function handleVision() {
    setVision(true);
    setHud('ACTIVATION VISION...');
    try {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { setVision(false); return; }
        const b64 = await fileToBase64(file);
        setStatus('thinking');
        setHud('ANALYSE VISUELLE EN COURS...');
        const res = await api.vision(b64, file.type);
        const reply = await api.chat(`[VISION] ${res.description}`, sessionId.current);
        if (reply.text) {
          setResp(reply.text);
          setHud(reply.text.slice(0, 80));
          if (reply.audio) { unlockAudio(); await playBase64Audio(reply.audio); }
        }
        setVision(false);
      };
      input.click();
    } catch {
      setVision(false);
      setHud('ERREUR VISION');
    }
  }

  const col = STATE_COLOR[status];
  const [labelFr, labelEn] = STATE_LABEL[status];
  const displayText = respStream || response;

  return (
    <div
      className="scanlines"
      style={{ width: '100%', height: '100%', background: '#000000', position: 'relative', overflow: 'hidden' }}
    >
      {/* Canvas background */}
      <canvas ref={canvasRef} width={347} height={704}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* ── HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
        padding: '10px 16px 6px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 60%, transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          {/* Connection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: wsConn ? '#00e676' : '#ff3366',
              boxShadow: `0 0 8px ${wsConn ? '#00e676' : '#ff3366'}`,
              animation: 'statusPulse 2s ease infinite',
            }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: wsConn ? '#00e67688' : '#ff336688', letterSpacing: '0.12em' }}>
              {wsConn ? 'CONNECTÉ' : 'HORS LIGNE'}
            </span>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#ffffff22', letterSpacing: '0.08em' }}>
              · SYSTÈME EN LIGNE
            </span>
          </div>

          {/* DZARYX */}
          <div style={{
            fontFamily: 'Orbitron', fontSize: 18, fontWeight: 900,
            color: '#00d4ff', letterSpacing: '0.4em',
            textShadow: '0 0 14px #00d4ff, 0 0 28px #00d4ff44',
          }}>DZARYX</div>

          {/* Menu icon */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', padding: 4 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 16, height: 1.5, background: '#00d4ff55', borderRadius: 1 }} />
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff44', letterSpacing: '0.2em' }}>
            IA DE FIK CONCIERGERIE · ORAN
          </span>
          {/* Wake word indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: wakeWordOn ? '#00e676' : '#ffffff22',
              boxShadow: wakeWordOn ? '0 0 6px #00e676' : 'none',
            }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 6, color: wakeWordOn ? '#00e67666' : '#ffffff22', letterSpacing: '0.1em' }}>
              WAKE
            </span>
          </div>
          {/* Hands-free toggle */}
          <button
            onClick={() => setHandsFree(h => !h)}
            style={{
              background: handsFree ? 'rgba(0,230,118,0.12)' : 'transparent',
              border: `1px solid ${handsFree ? '#00e67666' : '#ffffff22'}`,
              borderRadius: 4, padding: '1px 5px', cursor: 'pointer',
              fontFamily: 'Share Tech Mono', fontSize: 6,
              color: handsFree ? '#00e676' : '#ffffff33',
              letterSpacing: '0.08em',
            }}
          >
            {handsFree ? '🙌 LIBRE' : 'MAINS'}
          </button>
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${col}55, transparent)` }} />
      </div>

      {/* ── STATUS BADGE ── */}
      <div style={{
        position: 'absolute', top: 74, left: 0, right: 0, zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 16px', borderRadius: 20,
          border: `1.5px solid ${col}55`, background: `${col}0d`,
          boxShadow: `0 0 12px ${col}22`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: col, boxShadow: `0 0 8px ${col}`,
            animation: 'statusPulse 1.5s ease infinite',
          }} />
          <span style={{
            fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700,
            color: col, letterSpacing: '0.2em', textShadow: `0 0 8px ${col}`,
          }}>{labelFr}{toolLabel ? ` — ${toolLabel}` : ''}</span>
        </div>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: `${col}55`, letterSpacing: '0.3em' }}>
          {labelEn}
        </span>
      </div>

      {/* ── ROBOT + HALO ── */}
      <div style={{
        position: 'absolute', left: '50%', top: '40%',
        transform: 'translate(-50%, -50%)',
        zIndex: 5,
      }}>
        {/* Outer ambient ring */}
        <div style={{
          position: 'absolute', top: '42%', left: '50%',
          width: 240, height: 240, borderRadius: '50%',
          border: `1px solid ${col}`,
          opacity: 0.07,
          animation: 'halo-breathe 4s ease-in-out infinite',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
        {/* Middle ring — pulse on listening */}
        <div style={{
          position: 'absolute', top: '42%', left: '50%',
          width: 196, height: 196, borderRadius: '50%',
          border: `1px solid ${col}`,
          opacity: status === 'listening' ? 0.28 : 0.09,
          animation: status === 'listening' ? 'ring-expand 1.8s ease-out infinite' : 'halo-breathe 3s ease-in-out infinite 0.5s',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
        {/* Glow core */}
        <div style={{
          position: 'absolute', top: '42%', left: '50%',
          width: 150, height: 150, borderRadius: '50%',
          background: `radial-gradient(circle, ${col}10 0%, transparent 70%)`,
          animation: 'halo-breathe 2.5s ease-in-out infinite',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
        <DzaryxRobot status={status} visionActive={visionActive} scale={0.82} />
      </div>

      {/* ── STATE TEXT ── */}
      <div style={{
        position: 'absolute', bottom: 152, left: 0, right: 0, zIndex: 6, textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'Inter', fontSize: 14, fontWeight: 500,
          color: 'rgba(200,232,255,0.85)',
          letterSpacing: '0.02em', marginBottom: 6,
          textShadow: `0 0 12px ${col}55`,
        }}>
          {STATE_MSG[status]}
        </div>
        {displayText && (
          <div
            onClick={() => setRespExpanded(e => !e)}
            style={{
              margin: '0 20px',
              padding: '8px 14px',
              background: `rgba(7,17,31,0.82)`,
              border: `1px solid ${col}25`,
              borderRadius: 12,
              fontFamily: 'Inter', fontSize: 11, fontWeight: 400,
              color: `rgba(200,232,255,0.82)`,
              lineHeight: 1.6,
              maxHeight: respExpanded ? 200 : 64,
              overflow: respExpanded ? 'auto' : 'hidden',
              backdropFilter: 'blur(10px)',
              cursor: 'pointer',
              transition: 'max-height 0.3s ease',
              position: 'relative',
            }}
          >
            {displayText}
            {!respExpanded && displayText.length > 100 && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 24,
                background: `linear-gradient(transparent, rgba(7,17,31,0.9))`,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 2,
              }}>
                <span style={{ fontSize: 7, color: `${col}88`, fontFamily: 'Inter', letterSpacing: '0.1em' }}>▼ VOIR TOUT</span>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 400, color: `${col}44`, letterSpacing: '0.08em' }}>
            {hudMsg.slice(0, 55)}
          </span>
        </div>
      </div>

      {/* ── RMS BAR ── */}
      {audioUnlocked && (
        <div style={{ position: 'absolute', bottom: 144, left: 20, right: 20, zIndex: 6, height: 2, background: '#ffffff08', borderRadius: 1 }}>
          <div style={{
            height: '100%', width: `${rmsLevel * 100}%`,
            background: rmsLevel > 0.05 ? '#ff3366' : col,
            borderRadius: 1, transition: 'width 0.04s linear',
          }} />
        </div>
      )}

      {/* ── BOTTOM BUTTONS ── */}
      <div style={{
        position: 'absolute', bottom: 10, left: 0, right: 0, zIndex: 6,
        display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
        padding: '0 10px',
      }}>
        {/* SCAN DOCUMENT */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.accept = 'image/*';
              input.onchange = async () => {
                const file = input.files?.[0]; if (!file) return;
                setScanActive(true);
                try {
                  const b64 = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onload = () => res((reader.result as string).split(',')[1] ?? '');
                    reader.onerror = rej; reader.readAsDataURL(file);
                  });
                  const scan = await api.scan(b64, file.type);
                  const chat = await api.chat(`[SCAN OCR] ${scan.description}`, sessionId.current);
                  if (chat.text) setResp(chat.text);
                  if (chat.audio) await playBase64Audio(chat.audio);
                } catch { /* ignore */ } finally { setScanActive(false); }
              };
              input.click();
            }}
            disabled={scanActive}
            style={{
              width: 58, height: 58, borderRadius: 16,
              background: scanActive ? 'rgba(255,170,0,0.12)' : 'rgba(255,107,0,0.06)',
              border: `1.5px solid ${scanActive ? '#ffaa00' : '#ff6b0055'}`,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: scanActive ? '0 0 18px rgba(255,170,0,0.45)' : '0 0 8px rgba(255,107,0,0.18)',
              transition: 'all 0.25s ease',
              backdropFilter: 'blur(8px)',
            }}
          >
            {scanActive ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffaa00" strokeWidth="1.8" strokeLinecap="round" style={{ animation: 'spin-slow 1.2s linear infinite' }}>
                <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff6b00cc" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <rect x="7" y="7" width="10" height="10" rx="1" strokeOpacity="0.5" />
                <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.7" />
              </svg>
            )}
          </button>
          <span style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 600, color: '#ff6b00aa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>SCAN</span>
          <span style={{ fontFamily: 'Inter', fontSize: 6, fontWeight: 400, color: '#ff6b0066', letterSpacing: '0.1em', textTransform: 'uppercase' }}>DOC</span>
        </div>

        {/* MIC — premium 90px centre */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ position: 'relative', width: 90, height: 90 }}>
            {/* Ambient pulse ring */}
            <div style={{
              position: 'absolute', inset: -14,
              borderRadius: '50%',
              border: `1px solid ${col}`,
              opacity: status === 'listening' ? 0.35 : 0.07,
              animation: status === 'listening' ? 'ring-expand 1.4s ease-out infinite' : 'halo-breathe 4s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
            {/* Second ring (listening only) */}
            {status === 'listening' && (
              <div style={{
                position: 'absolute', inset: -6,
                borderRadius: '50%',
                border: `1px solid ${col}`,
                opacity: 0.25,
                animation: 'ring-expand 1.4s ease-out infinite 0.5s',
                pointerEvents: 'none',
              }} />
            )}
            {/* Button core — tappable */}
            <div
              onClick={() => {
                if (status === 'idle' && !isRecordingRef.current) {
                  unlockAudio();
                  if (streamRef.current) { startRecording(); setHud('🎤 MANUEL — J\'ÉCOUTE'); }
                  else { setHud('MIC NON ACTIVÉ'); }
                } else if (status === 'listening') {
                  stopRecordingAndProcess();
                } else if (status === 'speaking') {
                  stopAudio(); setStatus('idle');
                }
              }}
              style={{
                width: 90, height: 90, borderRadius: '50%',
                background: status === 'listening'
                  ? `radial-gradient(circle at 35% 30%, ${col}44, ${col}16)`
                  : `radial-gradient(circle at 35% 30%, ${col}1c, ${col}08)`,
                border: `2px solid ${status === 'listening' ? col : col + '77'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: status === 'listening'
                  ? `0 0 30px ${col}66, 0 0 60px ${col}2a, inset 0 0 22px ${col}16`
                  : `0 0 16px ${col}33, 0 0 32px ${col}12, inset 0 0 12px ${col}0a`,
                animation: status === 'listening' ? 'neonPulse 0.8s ease infinite' : 'statusPulse 4s ease infinite',
                transition: 'all 0.3s ease',
                cursor: status === 'thinking' ? 'default' : 'pointer',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                style={{ filter: `drop-shadow(0 0 7px ${col}) drop-shadow(0 0 14px ${col}55)` }}>
                {status === 'listening' ? (
                  // Stop icon when listening
                  <rect x="7" y="7" width="10" height="10" rx="2" fill={col} opacity="0.88" />
                ) : (
                  <>
                    <rect x="9" y="2" width="6" height="11" rx="3" fill={col} opacity="0.88" />
                    <path d="M5 10a7 7 0 0 0 14 0" stroke={col} strokeWidth="1.8" strokeLinecap="round" fill="none" />
                    <line x1="12" y1="17" x2="12" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="8" y1="21" x2="16" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </div>
          </div>
          <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 600, color: `${col}cc`, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            {status === 'listening' ? 'STOP' : status === 'speaking' ? 'COUPER' : 'MICRO'}
          </span>
          {/* Continuous mode toggle */}
          <button
            onClick={() => setContinuousMode(m => !m)}
            style={{
              marginTop: 2, padding: '2px 8px', borderRadius: 8,
              background: continuousMode ? `${col}22` : 'transparent',
              border: `1px solid ${continuousMode ? col : col + '44'}`,
              cursor: 'pointer', color: continuousMode ? col : `${col}66`,
              fontFamily: 'Share Tech Mono', fontSize: 6, letterSpacing: '0.12em',
              transition: 'all 0.2s ease',
            }}
          >
            {continuousMode ? '🔄 CONTINU' : '⏸ PAUSE'}
          </button>
        </div>

        {/* LIVE CAM */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <button
            onClick={toggleLiveCam}
            style={{
              width: 58, height: 58, borderRadius: 16,
              background: camActive ? 'rgba(155,89,182,0.14)' : 'rgba(155,89,182,0.05)',
              border: `1.5px solid ${camActive ? '#9b59b6' : '#9b59b644'}`,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: camActive ? '0 0 20px rgba(155,89,182,0.55)' : '0 0 8px rgba(155,89,182,0.15)',
              transition: 'all 0.25s ease', position: 'relative',
              backdropFilter: 'blur(8px)',
            }}
          >
            <VisionIcon active={camActive} />
            {camActive && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                width: 10, height: 10, borderRadius: '50%',
                background: '#ff3366', boxShadow: '0 0 8px #ff3366',
                animation: 'statusPulse 1s ease infinite',
              }} />
            )}
          </button>
          <span style={{ fontFamily: 'Inter', fontSize: 7, fontWeight: 600, color: '#9b59b6aa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {camActive ? 'CAM ON' : 'CAMÉRA'}
          </span>
          <span style={{ fontFamily: 'Inter', fontSize: 6, fontWeight: 400, color: '#9b59b666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {camActive ? 'LIVE' : 'VOIX+VUE'}
          </span>
        </div>
      </div>

      {/* ── AUDIO UNLOCK OVERLAY ── */}
      {!audioUnlocked && (
        <div
          onClick={e => { e.stopPropagation(); unlockAudio(); setAudioUnlocked(true); initMic(); }}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(12px)', cursor: 'pointer',
            animation: 'fadeIn 0.4s ease',
          }}
        >
          <div style={{ marginBottom: 28, opacity: 0.75 }}>
            <DzaryxRobot status="idle" visionActive={false} scale={0.55} />
          </div>
          <div style={{
            border: '1px solid rgba(0,212,255,0.2)', borderRadius: 22,
            padding: '22px 36px', textAlign: 'center',
            background: 'rgba(0,5,18,0.96)',
            boxShadow: '0 0 50px rgba(0,212,255,0.12), 0 0 100px rgba(0,212,255,0.05)',
          }}>
            <div style={{
              fontFamily: 'Orbitron', fontSize: 15, color: '#00d4ff',
              letterSpacing: '0.3em', fontWeight: 700, marginBottom: 6,
              textShadow: '0 0 18px #00d4ff, 0 0 36px rgba(0,212,255,0.4)',
            }}>ACTIVER DZARYX</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 400, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.18em', marginBottom: 16 }}>
              MICRO + AUDIO
            </div>
            {/* Tap indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid rgba(0,212,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'statusPulse 1.8s ease infinite' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </div>
              <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 500, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.12em' }}>APPUYER POUR DÉMARRER</span>
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE CAMERA PREVIEW — always in DOM so videoRef is ready ── */}
      <div style={{
        position: 'absolute', bottom: 108, right: 10, zIndex: 8,
        width: 90, height: 120, borderRadius: 10,
        border: `1.5px solid ${camActive ? '#9b59b6aa' : 'transparent'}`,
        overflow: 'hidden',
        boxShadow: camActive ? '0 0 16px #9b59b666' : 'none',
        opacity: camActive ? 1 : 0,
        pointerEvents: camActive ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {camActive && (
          <div style={{
            position: 'absolute', top: 4, left: 4,
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3366', boxShadow: '0 0 4px #ff3366', animation: 'statusPulse 1s ease infinite' }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 6, color: '#ff3366', letterSpacing: '0.1em' }}>LIVE</span>
          </div>
        )}
      </div>

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} pos={p} col={col} />)}
    </div>
  );
}

// ── DZARYX ROBOT SVG — Premium v2 ────────────────────────────────────────────

function DzaryxRobot({
  status, visionActive, scale = 1,
}: {
  status: DzaryxStatus;
  visionActive: boolean;
  scale?: number;
}) {
  const col         = STATE_COLOR[status];
  const isListening = status === 'listening';
  const isSpeaking  = status === 'speaking';
  const isThinking  = status === 'thinking';
  const eyeCol      = visionActive ? '#9b59b6' : col;
  const floatAnim   = isListening ? 'robotFloatListen' : 'robotFloat';

  const w = Math.round(290 * scale);
  const h = Math.round(380 * scale);

  // Eye helper — renders a premium multi-layer eye
  const Eye = ({ cx, cy, delay = '0s' }: { cx: number; cy: number; delay?: string }) => (
    <>
      {/* Socket shadow */}
      <circle cx={cx} cy={cy} r="28" fill="#000408" />
      {/* Outer chrome ring */}
      <circle cx={cx} cy={cy} r="26" fill="none" stroke={eyeCol} strokeWidth="1.5" strokeOpacity="0.35" />
      {/* Mid iris ring */}
      <circle cx={cx} cy={cy} r="22" fill="none" stroke={eyeCol} strokeWidth="0.7" strokeOpacity="0.2" />
      {/* Inner dark iris */}
      <circle cx={cx} cy={cy} r="19" fill="#000d1a" />
      {/* Iris fill glow */}
      <circle cx={cx} cy={cy} r="17" fill={eyeCol} opacity="0.88"
        filter="url(#glow6)" style={{ animation: `eyeGlow 2.4s ease-in-out infinite ${delay}` }} />
      {/* Iris rings detail */}
      <circle cx={cx} cy={cy} r="13" fill="none" stroke="white" strokeWidth="0.6" strokeOpacity="0.18" />
      <circle cx={cx} cy={cy} r="9"  fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.12" />
      {/* Pupil */}
      <circle cx={cx} cy={cy} r="5.5" fill="#000408" />
      {/* Pupil glow dot */}
      <circle cx={cx} cy={cy} r="3.5" fill={eyeCol} opacity="0.95" filter="url(#glow3)" />
      {/* Cross-hair lines */}
      <line x1={cx - 26} y1={cy} x2={cx - 20} y2={cy} stroke={eyeCol} strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1={cx + 20} y1={cy} x2={cx + 26} y2={cy} stroke={eyeCol} strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1={cx} y1={cy - 26} x2={cx} y2={cy - 20} stroke={eyeCol} strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1={cx} y1={cy + 20} x2={cx} y2={cy + 26} stroke={eyeCol} strokeWidth="0.8" strokeOpacity="0.4" />
      {/* Specular shine top-left */}
      <ellipse cx={cx - 7} cy={cy - 8} rx="6" ry="3.5" fill="white" opacity="0.32" />
      <ellipse cx={cx - 5} cy={cy - 6} rx="2.5" ry="1.5" fill="white" opacity="0.42" />
      {/* Scan beam when listening */}
      {isListening && (
        <line x1={cx - 26} y1={cy} x2={cx + 26} y2={cy} stroke={eyeCol} strokeWidth="1.5" strokeOpacity="0.6"
          filter="url(#glow3)" style={{ animation: `eyeGlow 0.6s ease-in-out infinite ${delay}` }} />
      )}
    </>
  );

  return (
    <svg
      width={w} height={h}
      viewBox="0 0 290 380"
      fill="none"
      style={{
        animation: `${floatAnim} 3.2s ease-in-out infinite`,
        filter: `drop-shadow(0 0 20px ${col}55) drop-shadow(0 0 40px ${col}1a)`,
        overflow: 'visible',
      }}
    >
      <defs>
        {/* Head chrome gradient */}
        <radialGradient id={`rg-hd-${status}`} cx="32%" cy="24%" r="74%">
          <stop offset="0%"   stopColor="#5a7a9a" />
          <stop offset="15%"  stopColor="#304860" />
          <stop offset="45%"  stopColor="#182840" />
          <stop offset="100%" stopColor="#03080f" />
        </radialGradient>
        {/* Head bottom shadow */}
        <radialGradient id="rg-hd-bot" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        {/* Ear gradient */}
        <radialGradient id="rg-ear" cx="38%" cy="32%" r="68%">
          <stop offset="0%"   stopColor="#243850" />
          <stop offset="100%" stopColor="#040c18" />
        </radialGradient>
        {/* Body gradient */}
        <radialGradient id="rg-bd" cx="36%" cy="22%" r="72%">
          <stop offset="0%"   stopColor="#223050" />
          <stop offset="45%"  stopColor="#0e1e34" />
          <stop offset="100%" stopColor="#03070f" />
        </radialGradient>
        {/* Chest core gradient */}
        <radialGradient id={`rg-core-${status}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={col}     stopOpacity="0.9" />
          <stop offset="50%"  stopColor={col}     stopOpacity="0.4" />
          <stop offset="100%" stopColor={col}     stopOpacity="0" />
        </radialGradient>
        {/* Glow filters */}
        <filter id="glow3" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow6" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="glow10" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── OUTER ORBIT RINGS ── */}
      <circle cx="145" cy="158" r="134"
        stroke={col} strokeWidth="0.6" strokeDasharray="6 26" strokeOpacity="0.16"
        style={{ transformOrigin: '145px 158px', animation: 'spinSlow 32s linear infinite' }} />
      <circle cx="145" cy="158" r="120"
        stroke={col} strokeWidth="0.4" strokeDasharray="3 20" strokeOpacity="0.1"
        style={{ transformOrigin: '145px 158px', animation: 'spinMed 22s linear infinite reverse' }} />

      {/* ── THINKING HALO ── */}
      {isThinking && (
        <circle cx="145" cy="158" r="122"
          stroke="#ffaa00" strokeWidth="2.5" strokeDasharray="8 12" strokeOpacity="0.9"
          filter="url(#glow6)"
          style={{ transformOrigin: '145px 158px', animation: 'thinkHalo 1.8s linear infinite' }} />
      )}

      {/* ── ANTENNA ── */}
      <line x1="145" y1="52" x2="145" y2="24" stroke={col} strokeWidth="1.5" strokeOpacity="0.5" />
      <line x1="145" y1="28" x2="132" y2="16" stroke={col} strokeWidth="1" strokeOpacity="0.3" />
      <line x1="145" y1="28" x2="158" y2="16" stroke={col} strokeWidth="1" strokeOpacity="0.3" />
      <circle cx="145" cy="22" r="5" fill={col} opacity="0.9" filter="url(#glow6)"
        style={{ animation: 'eyeGlow 1.8s ease-in-out infinite' }} />
      <circle cx="132" cy="14" r="3" fill={col} opacity="0.5" filter="url(#glow3)" />
      <circle cx="158" cy="14" r="3" fill={col} opacity="0.5" filter="url(#glow3)" />

      {/* ── LEFT EAR ── */}
      <circle cx="32" cy="160" r="38" fill={col} opacity={isListening ? 0.07 : 0.02} />
      <circle cx="32" cy="160" r="32" fill="url(#rg-ear)" />
      <circle cx="32" cy="160" r="32" fill="none" stroke={col}
        strokeWidth={isListening ? 1.8 : 0.9} strokeOpacity={isListening ? 0.7 : 0.28} />
      {/* Ear grille rings */}
      <circle cx="32" cy="160" r="24" fill="#030c18" />
      <circle cx="32" cy="160" r="24" fill="none" stroke={col} strokeWidth="0.6" strokeOpacity="0.25" />
      <circle cx="32" cy="160" r="17" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />
      <circle cx="32" cy="160" r="10" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity={isListening ? 0.4 : 0.12} />
      {/* Core LED */}
      <circle cx="32" cy="160" r="5" fill={col} opacity={isListening ? 0.95 : 0.35} filter="url(#glow3)" />
      {/* Grille segments */}
      {[0, 45, 90, 135].map(angle => {
        const rad = angle * Math.PI / 180;
        const x1 = 32 + Math.cos(rad) * 11; const y1 = 160 + Math.sin(rad) * 11;
        const x2 = 32 + Math.cos(rad) * 23; const y2 = 160 + Math.sin(rad) * 23;
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="0.5" strokeOpacity="0.2" />;
      })}
      {/* Audio bars */}
      {[13, 18, 23, 28, 33, 38, 43, 48].map((bx, i) => {
        const hArr = [4, 7, 11, 15, 14, 10, 7, 4];
        const bh = hArr[i] ?? 5;
        return (
          <rect key={i} x={bx} y={160 - bh / 2} width="2" height={bh} rx="1"
            fill={col} opacity={isListening ? 0.85 : 0.2}
            style={isListening ? { animation: `earBar${Math.min(i + 1, 5)} ${0.26 + (i % 5) * 0.05}s ease ${i * 0.035}s infinite` } : {}} />
        );
      })}
      <ellipse cx="20" cy="147" rx="8" ry="4" fill="white" opacity="0.05" />

      {/* ── RIGHT EAR ── */}
      <circle cx="258" cy="160" r="38" fill={col} opacity={isListening ? 0.07 : 0.02} />
      <circle cx="258" cy="160" r="32" fill="url(#rg-ear)" />
      <circle cx="258" cy="160" r="32" fill="none" stroke={col}
        strokeWidth={isListening ? 1.8 : 0.9} strokeOpacity={isListening ? 0.7 : 0.28} />
      <circle cx="258" cy="160" r="24" fill="#030c18" />
      <circle cx="258" cy="160" r="24" fill="none" stroke={col} strokeWidth="0.6" strokeOpacity="0.25" />
      <circle cx="258" cy="160" r="17" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />
      <circle cx="258" cy="160" r="10" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity={isListening ? 0.4 : 0.12} />
      <circle cx="258" cy="160" r="5" fill={col} opacity={isListening ? 0.95 : 0.35} filter="url(#glow3)" />
      {[0, 45, 90, 135].map(angle => {
        const rad = angle * Math.PI / 180;
        const x1 = 258 + Math.cos(rad) * 11; const y1 = 160 + Math.sin(rad) * 11;
        const x2 = 258 + Math.cos(rad) * 23; const y2 = 160 + Math.sin(rad) * 23;
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth="0.5" strokeOpacity="0.2" />;
      })}
      {[230, 235, 240, 245, 250, 255, 260, 265].map((bx, i) => {
        const hArr = [4, 7, 11, 15, 14, 10, 7, 4];
        const bh = hArr[i] ?? 5;
        return (
          <rect key={i} x={bx} y={160 - bh / 2} width="2" height={bh} rx="1"
            fill={col} opacity={isListening ? 0.85 : 0.2}
            style={isListening ? { animation: `earBar${5 - (i % 5)} ${0.26 + (i % 5) * 0.05}s ease ${i * 0.035}s infinite` } : {}} />
        );
      })}
      <ellipse cx="246" cy="147" rx="8" ry="4" fill="white" opacity="0.05" />

      {/* ── HEAD SPHERE ── */}
      <circle cx="145" cy="158" r="106" fill={col} opacity="0.04" />
      {/* Main head */}
      <circle cx="145" cy="158" r="100" fill={`url(#rg-hd-${status})`} />
      {/* Bottom shadow overlay */}
      <circle cx="145" cy="158" r="100" fill="url(#rg-hd-bot)" />
      {/* Chrome rim */}
      <circle cx="145" cy="158" r="100" fill="none" stroke={col} strokeWidth="1.8" strokeOpacity="0.28" />
      <circle cx="145" cy="158" r="97"  fill="none" stroke="white" strokeWidth="0.5" strokeOpacity="0.08" />
      {/* Panel seam lines on head */}
      <path d="M 145 58 Q 190 100 190 158" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.06" />
      <path d="M 145 58 Q 100 100 100 158" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.06" />
      <ellipse cx="145" cy="75"  rx="50" ry="8" fill="none" stroke={col} strokeWidth="0.4" strokeOpacity="0.1" />
      {/* Specular highlights */}
      <ellipse cx="106" cy="106" rx="36" ry="21" fill="white" opacity="0.085" />
      <ellipse cx="98"  cy="96"  rx="17" ry="10" fill="white" opacity="0.10" />
      <ellipse cx="92"  cy="90"  rx="8"  ry="5"  fill="white" opacity="0.08" />
      {/* Tech hex screws on head edge */}
      {[50, 130, 230, 310].map((deg, i) => {
        const r = 92, rad = deg * Math.PI / 180;
        const sx = 145 + Math.cos(rad) * r, sy = 158 + Math.sin(rad) * r;
        return <circle key={i} cx={sx} cy={sy} r="2" fill="none" stroke={col} strokeWidth="0.7" strokeOpacity="0.25" />;
      })}

      {/* ── FOREHEAD TECH STRIP ── */}
      <rect x="110" y="72" width="70" height="8" rx="4" fill="#0a1828" stroke={col} strokeWidth="0.6" strokeOpacity="0.3" />
      <rect x="114" y="74" width="12" height="4" rx="2" fill={col} opacity="0.6" />
      <rect x="129" y="74" width="6"  height="4" rx="2" fill={col} opacity="0.3" />
      <rect x="138" y="74" width="18" height="4" rx="2" fill={col} opacity="0.4" />
      <rect x="159" y="74" width="8"  height="4" rx="2" fill={col} opacity="0.25" />

      {/* ── FACE VISOR ── */}
      <ellipse cx="145" cy="164" rx="70" ry="74" fill="#000000" opacity="0.97" />
      <ellipse cx="145" cy="164" rx="70" ry="74" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.18" />
      {/* Visor top gloss */}
      <ellipse cx="145" cy="112" rx="44" ry="12" fill={col} opacity="0.045" />
      {/* HUD corner markers */}
      {[[82, 100], [208, 100], [82, 220], [208, 220]].map(([mx, my], i) => {
        const hLen = i % 2 === 0 ? 8 : -8;
        const vLen = i < 2 ? 8 : -8;
        return (
          <g key={i}>
            <line x1={mx} y1={my} x2={mx + hLen} y2={my} stroke={col} strokeWidth="1" strokeOpacity="0.35" />
            <line x1={mx} y1={my} x2={mx} y2={my + vLen} stroke={col} strokeWidth="1" strokeOpacity="0.35" />
          </g>
        );
      })}

      {/* ── EYES ── */}
      {visionActive ? (
        // Vision camera eyes — purple
        <>
          {[114, 176].map((ex, i) => (
            <g key={i}>
              <circle cx={ex} cy="152" r="28" fill="#08001a" />
              <circle cx={ex} cy="152" r="26" fill="none" stroke="#9b59b6" strokeWidth="2" strokeOpacity="0.8" filter="url(#glow3)" />
              <circle cx={ex} cy="152" r="20" fill="none" stroke="#9b59b6" strokeWidth="1" strokeOpacity="0.5" />
              <circle cx={ex} cy="152" r="13" fill="none" stroke="#9b59b6" strokeWidth="0.8" strokeOpacity="0.35" />
              <circle cx={ex} cy="152" r="7"  fill="#9b59b6" opacity="0.9" filter="url(#glow6)"
                style={{ animation: `eyeGlow 2s ease infinite ${i * 0.3}s` }} />
              <circle cx={ex} cy="152" r="3" fill="white" opacity="0.8" />
              <ellipse cx={ex - 8} cy="143" rx="6" ry="3.5" fill="white" opacity="0.2" />
              {/* Camera crosshair */}
              <line x1={ex - 26} y1="152" x2={ex + 26} y2="152" stroke="#9b59b6" strokeWidth="0.5" strokeOpacity="0.3" />
              <line x1={ex} y1="126" x2={ex} y2="178" stroke="#9b59b6" strokeWidth="0.5" strokeOpacity="0.3" />
            </g>
          ))}
        </>
      ) : (
        <>
          <Eye cx={114} cy={152} delay="0s" />
          <Eye cx={176} cy={152} delay="0.35s" />
        </>
      )}

      {/* ── NOSE SENSOR (small detail) ── */}
      <rect x="141" y="178" width="8" height="3" rx="1.5" fill={col} opacity="0.25" />

      {/* ── MOUTH ── */}
      {isSpeaking ? (
        // Speaking: multi-bar spectrum
        <g>
          {[108, 116, 124, 132, 140, 148, 156, 164, 172].map((bx, i) => {
            const heights = [4, 7, 10, 13, 15, 13, 10, 7, 4];
            const bh = heights[i] ?? 6;
            return (
              <rect key={i} x={bx} y={196 - bh / 2} width="5" height={bh} rx="2.5"
                fill={col} opacity="0.9" filter="url(#glow3)"
                style={{ animation: `earBar${(i % 5) + 1} ${0.2 + (i % 4) * 0.07}s ease ${i * 0.03}s infinite` }} />
            );
          })}
        </g>
      ) : (
        // Idle/Listening: curved smile with detail
        <>
          <path d="M 110 196 Q 145 218 180 196"
            stroke={col} strokeWidth="3" strokeLinecap="round" fill="none"
            opacity={status === 'idle' ? 0.55 : 0.8} filter="url(#glow3)" />
          {/* Teeth hint */}
          <path d="M 120 198 Q 145 208 170 198"
            stroke="white" strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.08" />
        </>
      )}

      {/* ── NECK — articulated ── */}
      <rect x="132" y="256" width="26" height="7"  rx="3.5" fill="#0c1a28" stroke={col} strokeWidth="0.6" strokeOpacity="0.3" />
      <rect x="128" y="261" width="34" height="7"  rx="3.5" fill="#0a1620" stroke={col} strokeWidth="0.5" strokeOpacity="0.25" />
      <rect x="132" y="266" width="26" height="6"  rx="3" fill="#080e18" stroke={col} strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="139" y1="256" x2="139" y2="272" stroke={col} strokeWidth="0.7" strokeOpacity="0.2" />
      <line x1="145" y1="256" x2="145" y2="272" stroke={col} strokeWidth="0.7" strokeOpacity="0.2" />
      <line x1="151" y1="256" x2="151" y2="272" stroke={col} strokeWidth="0.7" strokeOpacity="0.2" />

      {/* ── BODY ── */}
      <ellipse cx="145" cy="368" rx="72" ry="10" fill={col} opacity="0.09" filter="url(#glow10)" />
      <ellipse cx="145" cy="372" rx="46" ry="6"  fill={col} opacity="0.06" />

      {/* Shoulder pads — proper arm stubs */}
      <rect x="62" y="272" width="32" height="52" rx="16" fill="#0e1e30" stroke={col} strokeWidth="0.9" strokeOpacity="0.28" />
      <rect x="62" y="272" width="32" height="52" rx="16" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.05" />
      <rect x="67" y="285" width="22" height="4"  rx="2" fill={col} opacity="0.3" />
      <rect x="67" y="292" width="14" height="3"  rx="1.5" fill={col} opacity="0.2" />
      <circle cx="78" cy="308" r="7" fill="#060e18" stroke={col} strokeWidth="0.7" strokeOpacity="0.4" />
      <circle cx="78" cy="308" r="3.5" fill={col} opacity={isListening ? 0.8 : 0.3} filter="url(#glow3)" />

      <rect x="196" y="272" width="32" height="52" rx="16" fill="#0e1e30" stroke={col} strokeWidth="0.9" strokeOpacity="0.28" />
      <rect x="196" y="272" width="32" height="52" rx="16" fill="none" stroke="white" strokeWidth="0.3" strokeOpacity="0.05" />
      <rect x="201" y="285" width="22" height="4" rx="2" fill={col} opacity="0.3" />
      <rect x="209" y="292" width="14" height="3" rx="1.5" fill={col} opacity="0.2" />
      <circle cx="212" cy="308" r="7" fill="#060e18" stroke={col} strokeWidth="0.7" strokeOpacity="0.4" />
      <circle cx="212" cy="308" r="3.5" fill={col} opacity={isListening ? 0.8 : 0.3} filter="url(#glow3)" />

      {/* Body main — wider and taller */}
      <rect x="82" y="272" width="126" height="96" rx="26" fill="url(#rg-bd)" />
      <rect x="82" y="272" width="126" height="96" rx="26" fill="none" stroke={col} strokeWidth="1.4" strokeOpacity="0.32" />
      <rect x="82" y="272" width="126" height="96" rx="26" fill="none" stroke="white" strokeWidth="0.4" strokeOpacity="0.04" />

      {/* Body panel lines */}
      <line x1="96" y1="294" x2="194" y2="294" stroke={col} strokeWidth="0.6" strokeOpacity="0.18" />
      <line x1="96" y1="352" x2="194" y2="352" stroke={col} strokeWidth="0.5" strokeOpacity="0.13" />

      {/* LED strips on body edges */}
      {[282, 296, 310, 324, 338].map((ly, i) => (
        <rect key={i} x="86"  y={ly} width="5" height="3" rx="1.5"
          fill={col} opacity={isListening || isSpeaking ? 0.85 : 0.28}
          style={isListening || isSpeaking ? { animation: `earBar${(i % 5) + 1} ${0.28 + i * 0.05}s ease infinite` } : {}} />
      ))}
      {[282, 296, 310, 324, 338].map((ly, i) => (
        <rect key={i} x="199" y={ly} width="5" height="3" rx="1.5"
          fill={col} opacity={isListening || isSpeaking ? 0.85 : 0.28}
          style={isListening || isSpeaking ? { animation: `earBar${5 - (i % 5)} ${0.28 + i * 0.05}s ease infinite` } : {}} />
      ))}

      {/* Chest core — hexagonal power crystal, bigger */}
      <polygon
        points="145,300 158,308 158,324 145,332 132,324 132,308"
        fill={`url(#rg-core-${status})`} stroke={col} strokeWidth="1.4" strokeOpacity="0.75"
        filter="url(#glow6)" style={{ animation: 'eyeGlow 3s ease-in-out infinite' }}
      />
      <polygon
        points="145,307 154,312 154,320 145,325 136,320 136,312"
        fill={col} opacity="0.4" filter="url(#glow3)"
      />
      <circle cx="145" cy="316" r="4" fill="white" opacity="0.5" />

      {/* Circuit trace details */}
      <line x1="158" y1="316" x2="178" y2="316" stroke={col} strokeWidth="0.6" strokeOpacity="0.25" />
      <line x1="178" y1="316" x2="178" y2="308" stroke={col} strokeWidth="0.6" strokeOpacity="0.2" />
      <line x1="132" y1="316" x2="112" y2="316" stroke={col} strokeWidth="0.6" strokeOpacity="0.25" />
      <line x1="112" y1="316" x2="112" y2="308" stroke={col} strokeWidth="0.6" strokeOpacity="0.2" />

      {/* DZARYX text */}
      <text x="145" y="349" fill={col}
        fontFamily="Orbitron, Share Tech Mono, monospace" fontSize="8" fontWeight="700"
        textAnchor="middle" letterSpacing="5" opacity="0.8"
        filter="url(#glow3)">DZARYX</text>

      {/* Body specular */}
      <ellipse cx="108" cy="283" rx="26" ry="10" fill="white" opacity="0.04" />

      {/* ── WAVEFORM BARS ── */}
      {(isListening || isSpeaking) && (
        <g opacity="0.75">
          {Array.from({ length: 20 }, (_, i) => {
            const bx = 40 + i * 11;
            const baseH = 3 + Math.sin(i * 0.9) * 3.5;
            return (
              <rect key={i} x={bx} y={366 - baseH / 2} width="6" height={baseH} rx="3"
                fill={col} filter="url(#glow3)"
                style={{ animation: `earBar${(i % 5) + 1} ${0.22 + (i % 4) * 0.07}s ease ${i * 0.025}s infinite` }}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeParticles(n: number) {
  return Array.from({ length: n }, () => ({
    x: Math.random() * 400, y: Math.random() * 700,
    r: 0.5 + Math.random() * 1.5,
    vy: 0.2 + Math.random() * 0.4,
    life: Math.random(),
  }));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej; reader.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej; reader.readAsDataURL(file);
  });
}

function Corner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const s = 14, t = 1.5;
  const bT = pos.startsWith('t') ? `${t}px solid ${col}77` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}77` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}77` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}77` : 'none';
  const h  = pos.endsWith('l')   ? { left: 6 }  : { right: 6 };
  const v  = pos.startsWith('t') ? { top: 6 }   : { bottom: 6 };
  return (
    <div style={{ position: 'absolute', zIndex: 4, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />
  );
}

function VisionIcon({ active }: { active: boolean }) {
  const c = active ? '#9b59b6' : '#9b59b677';
  return (
    <svg width="22" height="18" viewBox="0 0 24 18" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9C4 3.5 8 1 12 1s8 2.5 11 8c-3 5.5-7 8-11 8S4 14.5 1 9z" />
      <circle cx="12" cy="9" r="3.5" fill={active ? '#9b59b622' : 'none'} />
      {active && <circle cx="12" cy="9" r="1.5" fill={c} />}
    </svg>
  );
}
