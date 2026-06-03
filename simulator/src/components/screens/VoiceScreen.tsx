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

// VAD à 2 seuils — capture le DÉBUT du mot (sinon Whisper comprend de travers).
// ARM (bas) = on enregistre dès le 1er son → le début du mot n'est jamais coupé.
// SPEECH (haut) = on CONFIRME que c'est de la vraie voix ; sinon on JETTE (= bruit, pas envoyé à Whisper).
// Seuils calibrés bas : le micro de Kouider enregistre la voix à ~7-8 (rms ~0.0075).
// Avant SPEECH=0.014/SILENCE=0.009 → sa voix était traitée comme silence → jamais envoyée.
const ARM_RMS       = 0.0035; // démarre l'enregistrement très tôt (capture l'attaque du mot, voix douce)
const SPEECH_RMS    = 0.006;  // confirme une vraie parole (la voix ~0.0075 passe largement)
const SILENCE_RMS   = 0.0035; // sous ce niveau = silence (l'ambiant ~0.001-0.002 reste silence)
const SILENCE_DELAY = 750;    // ms de silence après parole avant d'envoyer
const MIN_SPEECH_MS = 280;    // garde "oui/non/vas-y", jette les blips < 0,28s
const NO_SPEECH_MS  = 1500;   // armé par un bruit mais aucune vraie voix → on jette
const MAX_REC_MS    = 15000;
const BUILD_TAG     = 'v12'; // marqueur build visible — confirme que la nouvelle version tourne

// Persiste l'état "audio débloqué" pour toute la session de page (survit aux
// changements d'onglet VOIX↔CHAT). Une fois l'utilisateur a tapé une fois,
// l'audio est débloqué au niveau navigateur → inutile de redemander à chaque
// retour sur l'écran Voix.
let sessionAudioUnlocked = false;

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
  const armStartRef     = useRef<number>(0);
  const realSpeechRef   = useRef(false);
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
  const [audioUnlocked, setAudioUnlocked] = useState(sessionAudioUnlocked);
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

  // Retour sur l'écran Voix après l'avoir déjà débloqué une fois cette session :
  // réactive le micro automatiquement (plus besoin de re-taper "ACTIVER DZARYX").
  useEffect(() => {
    if (sessionAudioUnlocked) { initMic(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (rms > ARM_RMS) {
        // 1er son → on enregistre TOUT DE SUITE (capture le début du mot, jamais coupé).
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (!isRecordingRef.current) { startRecording(true); armStartRef.current = Date.now(); }
        if (rms > SPEECH_RMS) {
          // Vraie voix confirmée → barge-in + on marque le tour de parole
          if (statusRef.current === 'speaking') { stopAudio(); setStatus('idle'); }
          if (!realSpeechRef.current) { realSpeechRef.current = true; speechStartRef.current = Date.now(); setStatus('listening'); }
        } else if (isRecordingRef.current && !realSpeechRef.current && Date.now() - armStartRef.current > NO_SPEECH_MS) {
          // Armé par un bruit, jamais de vraie voix → on jette (pas envoyé à Whisper)
          discardRecording();
        }
      } else {
        // Calme (sous ARM)
        if (isRecordingRef.current && realSpeechRef.current) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null;
              const dur = Date.now() - speechStartRef.current;
              if (dur > MIN_SPEECH_MS) stopRecordingAndProcess();
              else discardRecording();
            }, SILENCE_DELAY);
          }
        } else if (isRecordingRef.current && !realSpeechRef.current && Date.now() - armStartRef.current > 400) {
          // Armé par un blip puis calme, pas de vraie voix → jeter vite
          discardRecording();
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  // silent=true → armement VAD (on enregistre sans afficher "écoute" tant que la vraie voix n'est pas confirmée)
  function startRecording(silent = false) {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current) return;
    isRecordingRef.current = true;
    realSpeechRef.current  = !silent;       // démarrage manuel/wake = tour de parole confirmé d'office
    armStartRef.current    = Date.now();
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(100);
    recorderRef.current = rec;
    if (!silent) {
      speechStartRef.current = Date.now();
      setStatus('listening');
      setHud('ENREGISTREMENT EN COURS...');
    }
    setTimeout(() => {
      if (!isRecordingRef.current) return;
      if (realSpeechRef.current) stopRecordingAndProcess();
      else discardRecording();
    }, MAX_REC_MS);
  }

  // Jette l'enregistrement en cours sans le transcrire (bruit, pas de vraie voix)
  function discardRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') { try { rec.onstop = null; rec.stop(); } catch { /* ignore */ } }
    chunksRef.current = [];
    resetVAD();
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
    realSpeechRef.current  = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
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
              · SYSTÈME EN LIGNE · {BUILD_TAG}
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
          onClick={e => { e.stopPropagation(); sessionAudioUnlocked = true; unlockAudio(); setAudioUnlocked(true); initMic(); }}
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

// ── DZARYX ORB — premium voice core (no robot) ───────────────────────────────

function DzaryxRobot({
  status, visionActive, scale = 1,
}: {
  status: DzaryxStatus;
  visionActive: boolean;
  scale?: number;
}) {
  const col         = STATE_COLOR[status];
  const accent      = visionActive ? '#9b59b6' : col;
  const isListening = status === 'listening';
  const isThinking  = status === 'thinking';
  const isSpeaking  = status === 'speaking';

  const size = Math.round(300 * scale);
  const C = 150; // center

  // Orbital ring — elliptical, tilted, with a travelling particle
  const Ring = ({ rx, ry, rot, dur, reverse, op }: { rx: number; ry: number; rot: number; dur: number; reverse?: boolean; op: number }) => (
    <g style={{ transformOrigin: `${C}px ${C}px`, animation: `${reverse ? 'coreSpinR' : 'coreSpin'} ${dur}s linear infinite` }}>
      <g transform={`rotate(${rot} ${C} ${C})`}>
        <ellipse cx={C} cy={C} rx={rx} ry={ry} fill="none" stroke={accent} strokeWidth="0.8" strokeOpacity={op} />
        {/* travelling particle on the ring */}
        <circle cx={C + rx} cy={C} r="2.6" fill={accent} filter="url(#orbGlowS)" />
        <circle cx={C - rx} cy={C} r="1.6" fill={accent} fillOpacity="0.7" />
      </g>
    </g>
  );

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 300 300"
      fill="none"
      style={{
        overflow: 'visible',
        animation: 'orbFloat 4.5s ease-in-out infinite',
        filter: `drop-shadow(0 0 26px ${col}44) drop-shadow(0 0 60px ${col}18)`,
      }}
    >
      <defs>
        {/* Sphere body — glossy depth */}
        <radialGradient id={`orb-body-${status}`} cx="38%" cy="30%" r="72%">
          <stop offset="0%"   stopColor={accent} stopOpacity="0.95" />
          <stop offset="22%"  stopColor={accent} stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#0a1830" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#02060f" />
        </radialGradient>
        {/* Inner core glow */}
        <radialGradient id={`orb-core-${status}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="30%"  stopColor={accent}  stopOpacity="0.9" />
          <stop offset="70%"  stopColor={accent}  stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent}  stopOpacity="0" />
        </radialGradient>
        {/* Specular highlight */}
        <radialGradient id="orb-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Ambient halo */}
        <radialGradient id={`orb-halo-${status}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={col} stopOpacity="0.20" />
          <stop offset="60%"  stopColor={col} stopOpacity="0.05" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </radialGradient>
        <filter id="orbGlowS" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="orbGlowL" x="-140%" y="-140%" width="380%" height="380%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="orb-clip"><circle cx={C} cy={C} r="62" /></clipPath>
      </defs>

      {/* ── AMBIENT HALO ── */}
      <circle cx={C} cy={C} r="120" fill={`url(#orb-halo-${status})`}
        style={{ animation: 'corePulse 4s ease-in-out infinite' }} />

      {/* ── REACTIVE PULSE WAVES ── */}
      {(isListening || isSpeaking) && (
        <g style={{ transformOrigin: `${C}px ${C}px` }}>
          {[0, 1, 2].map(i => (
            <circle key={i} cx={C} cy={C} r="70" fill="none" stroke={col} strokeWidth="1.4"
              style={{
                transformOrigin: `${C}px ${C}px`,
                animation: `orbRipple ${isListening ? 1.5 : 2.2}s ease-out ${i * (isListening ? 0.5 : 0.73)}s infinite`,
              }} />
          ))}
        </g>
      )}

      {/* ── ORBITAL RINGS ── */}
      <Ring rx={132} ry={46}  rot={0}   dur={26} op={0.18} />
      <Ring rx={120} ry={120} rot={0}   dur={40} reverse op={0.10} />
      <Ring rx={108} ry={40}  rot={62}  dur={18} reverse op={0.22} />
      <Ring rx={96}  ry={36}  rot={-58} dur={14} op={0.20} />

      {/* ── THINKING COMET ARC ── */}
      {isThinking && (
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpin 1.4s linear infinite' }}>
          <path d={`M ${C} ${C - 84} A 84 84 0 0 1 ${C + 72} ${C - 42}`}
            fill="none" stroke={col} strokeWidth="3" strokeLinecap="round"
            filter="url(#orbGlowS)" strokeOpacity="0.9" />
          <circle cx={C} cy={C - 84} r="4" fill="#fff" filter="url(#orbGlowS)" />
        </g>
      )}

      {/* ── SPHERE ── */}
      <circle cx={C} cy={C} r="62" fill={`url(#orb-body-${status})`} stroke={accent} strokeWidth="0.8" strokeOpacity="0.4" />

      {/* Inner tech detail — clipped grid + rotating arcs */}
      <g clipPath="url(#orb-clip)" opacity="0.5">
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpin 30s linear infinite' }}>
          <ellipse cx={C} cy={C} rx="55" ry="20" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.4" />
          <ellipse cx={C} cy={C} rx="55" ry="40" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1={C - 60} y1={C} x2={C + 60} y2={C} stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
        </g>
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpinR 22s linear infinite' }}>
          <ellipse cx={C} cy={C} rx="20" ry="55" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
        </g>
      </g>

      {/* Core glow — pulsing */}
      <circle cx={C} cy={C} r="34" fill={`url(#orb-core-${status})`}
        style={{ animation: `corePulse ${isListening ? 0.8 : isSpeaking ? 1.1 : 2.6}s ease-in-out infinite` }} />

      {/* Bright nucleus */}
      <circle cx={C} cy={C} r={isListening ? 9 : isSpeaking ? 8 : 6} fill="#ffffff" filter="url(#orbGlowL)"
        style={{ animation: `corePulse ${isSpeaking ? 0.9 : 2}s ease-in-out infinite` }} />

      {/* Glossy specular highlight top-left */}
      <ellipse cx={C - 20} cy={C - 24} rx="20" ry="13" fill="url(#orb-spec)" opacity="0.5"
        style={{ animation: 'shimmer 5s ease-in-out infinite' }} />

      {/* Rim light bottom-right */}
      <path d={`M ${C + 44} ${C + 30} A 62 62 0 0 1 ${C - 10} ${C + 60}`}
        fill="none" stroke={accent} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
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
