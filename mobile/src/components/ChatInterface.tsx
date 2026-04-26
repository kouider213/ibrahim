import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket,
  playBase64Audio, enqueueAudioChunk, flushAudioChunks, clearAudioQueue,
  unlockAudio, stopAudio, iosFallbackSpeak, getOrCreateSessionId, isAudioPlaying,
  type IbrahimStatus,
} from '../services/api.js';

type JarvisState = 'idle' | 'listen' | 'think' | 'speak';

function toJarvis(s: IbrahimStatus): JarvisState {
  if (s === 'listening') return 'listen';
  if (s === 'thinking')  return 'think';
  if (s === 'speaking')  return 'speak';
  return 'idle';
}

const CAPTION: Record<JarvisState, string> = {
  idle:   'EN ATTENTE',
  listen: "J'ÉCOUTE",
  think:  'JE RÉFLÉCHIS',
  speak:  'JE PARLE',
};

// ── Speech Recognition types ──────────────────
interface SREvent { results: { [k: number]: { [k: number]: { transcript: string } } } }
interface SRL {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}

// ── 3D Sphere ─────────────────────────────────
const N_PARTICLES = 140;
const CONNECT_DIST = 0.38; // max dot-product for line draw (cos of angle)

interface Particle { x: number; y: number; z: number }

function fibonacciSphere(n: number): Particle[] {
  const pts: Particle[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }
  return pts;
}

function rotateY(p: Particle, a: number): Particle {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos };
}

function rotateX(p: Particle, a: number): Particle {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos };
}

const BASE_PARTICLES = fibonacciSphere(N_PARTICLES);

// Resize image to maxPx on longest side and return base64 JPEG string (no stack overflow)
function resizeImageToBase64(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve(dataUrl.split(',')[1]!);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function ChatInterface() {
  const [state,        setState]        = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [started,      setStarted]      = useState(false);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [liveVision,   setLiveVision]   = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const liveVideoRef   = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  const stateRef           = useRef<JarvisState>('idle');
  const sending            = useRef(false);
  const sessionId          = getOrCreateSessionId();
  const recRef             = useRef<SRL | null>(null);
  const loopActive         = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceived = useRef(false);

  // Canvas refs
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const rotYRef     = useRef(0);
  const rotXRef     = useRef(0.18);
  const ampRef      = useRef(0); // microphone amplitude 0..1
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // ── Error display ─────────────────────────────
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  // ── State machine ─────────────────────────────
  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Live camera: capture frame from video stream ─────────────
  const captureFrame = useCallback((): string | null => {
    const video = liveVideoRef.current;
    if (!video || !videoStreamRef.current || video.readyState < 2) return null;
    const w = Math.min(video.videoWidth  || 640, 640);
    const h = Math.min(video.videoHeight || 480, 480);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const c = tmp.getContext('2d');
    if (!c) return null;
    c.drawImage(video, 0, 0, w, h);
    const dataUrl = tmp.toDataURL('image/jpeg', 0.7);
    return dataUrl.split(',')[1] ?? null;
  }, []);

  // ── Live camera: start / stop stream ─────────────────────────
  const startLiveCamera = useCallback(async () => {
    if (videoStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      videoStreamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play().catch(() => {});
      }
      setLiveVision(true);
    } catch {
      showError('Caméra non accessible');
    }
  }, [showError]);

  const stopLiveCamera = useCallback(() => {
    videoStreamRef.current?.getTracks().forEach(t => t.stop());
    videoStreamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    setLiveVision(false);
  }, []);

  const toggleLiveVision = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liveVision) stopLiveCamera();
    else await startLiveCamera();
  }, [liveVision, startLiveCamera, stopLiveCamera]);

  // ── Send text ─────────────────────────────────
  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);
    elevenlabsReceived.current = false;

    const frame = videoStreamRef.current ? captureFrame() : null;

    try {
      await api.chat(msg, sessionId, false, frame ?? undefined, 'image/jpeg');
    } catch {
      showError('Erreur de connexion');
      applyState('idle');
    } finally {
      sending.current = false;
    }
  }, [sessionId, applyState, showError, captureFrame]);

  // ── Mic amplitude reader ──────────────────────
  const startMicAnalyser = useCallback(async () => {
    if (analyserRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx      = new AudioContext();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
    } catch { /* mic denied — amplitude stays 0 */ }
  }, []);

  // ── SpeechRecognition loop ────────────────────
  const scheduleNextListen = useCallback(() => {
    if (!loopActive.current) return;
    setTimeout(() => {
      if (loopActive.current && stateRef.current === 'idle') startListeningInner();
    }, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startListeningInner = useCallback(() => {
    if (stateRef.current === 'listen') return;
    stopAudio();
    window.speechSynthesis?.cancel();
    if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
    applyState('listen');
    unlockAudio();

    const w = window as Window & {
      webkitSpeechRecognition?: new () => SRL;
      SpeechRecognition?: new () => SRL;
    };
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) { showError('Micro non supporté'); applyState('idle'); return; }

    try {
      const rec = new SR();
      rec.lang            = 'fr-FR';
      rec.interimResults  = false;
      rec.maxAlternatives = 1;
      rec.continuous      = false;
      recRef.current      = rec;

      rec.onresult = (e: SREvent) => {
        const t = e.results[0]?.[0]?.transcript ?? '';
        recRef.current = null;
        if (t.trim()) void sendText(t.trim());
        else { applyState('idle'); scheduleNextListen(); }
      };
      rec.onerror = () => { recRef.current = null; applyState('idle'); scheduleNextListen(); };
      rec.onend   = () => { if (stateRef.current === 'listen') { applyState('idle'); scheduleNextListen(); } };
      rec.start();
    } catch { applyState('idle'); scheduleNextListen(); }
  }, [applyState, sendText, showError, scheduleNextListen]);

  // ── Canvas sphere animation ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS: Record<JarvisState, { dot: string; line: string; glow: string }> = {
      idle:   { dot: 'rgba(0,220,255,',   line: 'rgba(0,180,220,',  glow: 'rgba(0,200,255,' },
      listen: { dot: 'rgba(80,255,140,',  line: 'rgba(60,220,100,', glow: 'rgba(80,255,140,' },
      think:  { dot: 'rgba(80,160,255,',  line: 'rgba(60,120,220,', glow: 'rgba(80,160,255,' },
      speak:  { dot: 'rgba(255,200,40,',  line: 'rgba(220,160,30,', glow: 'rgba(255,210,60,' },
    };

    const SPEED: Record<JarvisState, number> = {
      idle: 0.003, listen: 0.009, think: 0.006, speak: 0.012,
    };

    function draw(_ts: number) {
      if (!ctx || !canvas) return;

      // Read mic amplitude
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        ampRef.current = Math.min(avg / 80, 1);
      } else {
        ampRef.current *= 0.9;
      }

      const s = stateRef.current;
      const speed = SPEED[s];
      const amp = ampRef.current;
      const pulse = s === 'speak' ? 0.06 + amp * 0.12 : s === 'listen' ? 0.04 + amp * 0.14 : 0.0;

      rotYRef.current += speed + amp * 0.01;
      rotXRef.current += speed * 0.4;

      const W = canvas.width;
      const H = canvas.height;
      const R = Math.min(W, H) * 0.32 * (1 + pulse);
      const CX = W / 2;
      const CY = H / 2;
      const col = COLORS[s];

      ctx.clearRect(0, 0, W, H);

      // Project all particles
      const proj = BASE_PARTICLES.map(p => {
        const r1 = rotateY(p, rotYRef.current);
        const r2 = rotateX(r1, rotXRef.current);
        const depth = (r2.z + 1) / 2; // 0..1
        return {
          sx: CX + r2.x * R,
          sy: CY + r2.y * R,
          depth,
          visible: r2.z > -0.15,
        };
      });

      // Draw connecting lines first (back to front via depth)
      ctx.lineWidth = 0.6;
      for (let i = 0; i < N_PARTICLES; i++) {
        const a = proj[i]!;
        if (!a.visible) continue;
        for (let j = i + 1; j < N_PARTICLES; j++) {
          const b = proj[j]!;
          if (!b.visible) continue;
          const dx = BASE_PARTICLES[i]!.x - BASE_PARTICLES[j]!.x;
          const dy = BASE_PARTICLES[i]!.y - BASE_PARTICLES[j]!.y;
          const dz = BASE_PARTICLES[i]!.z - BASE_PARTICLES[j]!.z;
          const dist2 = dx*dx + dy*dy + dz*dz;
          if (dist2 > CONNECT_DIST * CONNECT_DIST) continue;
          const alpha = (1 - dist2 / (CONNECT_DIST * CONNECT_DIST)) * 0.35 * a.depth * b.depth;
          ctx.beginPath();
          ctx.strokeStyle = `${col.line}${alpha.toFixed(2)})`;
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }

      // Draw dots
      for (const p of proj) {
        if (!p.visible) continue;
        const r = (1.8 + p.depth * 2.2) * (1 + pulse * 0.5);
        const alpha = 0.5 + p.depth * 0.5;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `${col.dot}${alpha.toFixed(2)})`;
        ctx.fill();
      }

      // Star burst center
      const burstR = 18 + pulse * 30 + (s === 'speak' ? amp * 20 : 0);
      const burstAlpha = s === 'idle' ? 0.55 : 0.9;
      const burst = ctx.createRadialGradient(CX, CY, 0, CX, CY, burstR);
      burst.addColorStop(0,   `rgba(255,255,255,${burstAlpha})`);
      burst.addColorStop(0.3, `${col.glow}${(burstAlpha * 0.5).toFixed(2)})`);
      burst.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(CX, CY, burstR, 0, Math.PI * 2);
      ctx.fillStyle = burst;
      ctx.fill();

      // Rays (speak state)
      if (s === 'speak' || s === 'listen') {
        const nRays = 8;
        for (let i = 0; i < nRays; i++) {
          const angle = (i / nRays) * Math.PI * 2 + rotYRef.current * 0.5;
          const len = burstR * (1.5 + amp * 1.5);
          const rayAlpha = 0.15 + amp * 0.2;
          ctx.beginPath();
          ctx.moveTo(CX, CY);
          ctx.lineTo(CX + Math.cos(angle) * len, CY + Math.sin(angle) * len);
          ctx.strokeStyle = `${col.glow}${rayAlpha.toFixed(2)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    function resize() {
      if (!canvas || !ctx) return;
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket events ─────────────────────────────
  useEffect(() => {
    connectSocket(sessionId, {
      onStatus: (s) => {
        if (s === 'thinking') { setResponseText(''); setShowResponse(false); }
        if (s === 'idle' && (isAudioPlaying() || window.speechSynthesis?.speaking)) return;
        applyState(toJarvis(s));
      },
      onAudio: (b64) => {
        elevenlabsReceived.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); clearAudioQueue(); playBase64Audio(b64); applyState('speak');
      },
      onAudioChunk: (b64) => {
        elevenlabsReceived.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); enqueueAudioChunk(b64); applyState('speak');
      },
      onAudioComplete: () => {
        void flushAudioChunks();
      },
      onTextChunk: (chunk) => { setResponseText(prev => prev + chunk); setShowResponse(true); },
      onTextComplete: (text) => {
        setResponseText(text); setShowResponse(true);
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        if (!elevenlabsReceived.current) {
          audioFallbackTimer.current = setTimeout(() => {
            audioFallbackTimer.current = null;
            if (!isAudioPlaying()) {
              applyState('speak');
              iosFallbackSpeak(text, () => { applyState('idle'); scheduleNextListen(); });
            }
          }, 1500);
        }
        elevenlabsReceived.current = false;
      },
      onResponse: (_t, _f) => {},
      onValidation: () => {
        setTimeout(() => { if (loopActive.current) { applyState('idle'); scheduleNextListen(); } }, 3000);
      },
      onTaskUpdate: () => {},
    });

    const onAudioEnded = () => {
      if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
      if (loopActive.current) { applyState('idle'); scheduleNextListen(); }
    };
    window.addEventListener('ibrahim:audioEnded', onAudioEnded);
    return () => { disconnectSocket(); window.removeEventListener('ibrahim:audioEnded', onAudioEnded); };
  }, [sessionId, applyState, scheduleNextListen]);

  // ── Relisten when idle + started ──────────────
  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => {
        if (stateRef.current === 'idle' && loopActive.current) startListeningInner();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListeningInner, started]);

  // ── Tap to start ──────────────────────────────
  const handleTap = useCallback(async () => {
    if (!started) {
      setStarted(true);
      loopActive.current = true;
      unlockAudio();
      await startMicAnalyser();

      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Bonjour Kouider' : hour < 18 ? 'Bon après-midi Kouider' : 'Bonsoir Kouider';
      const greetText = `${greet}, Ibrahim est prêt. Je vous écoute.`;
      applyState('speak');
      setResponseText(greetText);
      setShowResponse(true);
      iosFallbackSpeak(greetText);
      setTimeout(() => { applyState('idle'); scheduleNextListen(); }, Math.max(2500, greetText.length * 65));
      return;
    }
    // Tap again: toggle listen
    if (stateRef.current === 'listen') {
      recRef.current?.stop();
      applyState('idle');
    } else if (stateRef.current === 'idle') {
      startListeningInner();
    }
  }, [started, applyState, startListeningInner, scheduleNextListen, startMicAnalyser]);

  // ── Camera vision ────────────────────────────
  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setAnalyzing(true);
    try {
      // Resize to max 1024px before sending — keeps payload small and avoids call-stack overflow
      const base64 = await resizeImageToBase64(file, 1024);
      const mime   = 'image/jpeg';
      const result = await api.vision(base64, mime);
      const description = result.description ?? '';
      if (description) {
        await sendText(`[📷 Photo] ${description}`);
      } else {
        showError('Ibrahim ne peut pas analyser cette photo');
      }
    } catch {
      showError('Erreur analyse photo');
    } finally {
      setAnalyzing(false);
    }
  }, [sendText, showError]);

  // ── Cleanup ───────────────────────────────────
  useEffect(() => {
    return () => {
      loopActive.current = false;
      recRef.current?.stop();
      if (audioFallbackTimer.current) clearTimeout(audioFallbackTimer.current);
      cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      videoStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sphere-ui" data-state={state} onClick={handleTap}>

      {/* Perspective grid background */}
      <div className="hud-grid" />
      <div className="hud-vignette" />

      {/* 3D sphere canvas */}
      <canvas ref={canvasRef} className="sphere-canvas" />

      {/* Concentric rings */}
      <div className="ring ring-outer" />
      <div className="ring ring-mid" />
      <div className="ring ring-inner" />

      {/* Scan line */}
      <div className="scan-line" />

      {/* HUD corner brackets */}
      <div className="hud-corner hud-tl" />
      <div className="hud-corner hud-tr" />
      <div className="hud-corner hud-bl" />
      <div className="hud-corner hud-br" />

      {/* Telegram connection dot */}
      <div className="telegram-dot" title="Telegram connecté" />

      {/* Header */}
      <header className="sphere-header">
        <div className="sphere-title">IBRAHIM</div>
        <div className="sphere-subtitle">FIK CONCIERGERIE · ORAN</div>
      </header>

      {/* State label */}
      <div className="sphere-state">
        {started ? CAPTION[state] : 'APPUYER POUR DÉMARRER'}
      </div>

      {/* Status bar */}
      <div className="status-bar" />

      {/* Response text */}
      <div className={`sphere-response${showResponse ? ' visible' : ''}`}>
        <div className="sphere-response-text">{responseText}</div>
      </div>

      {/* Live vision toggle */}
      <button
        className={`live-vision-btn${liveVision ? ' active' : ''}`}
        onClick={toggleLiveVision}
        aria-label={liveVision ? 'Désactiver vision live' : 'Activer vision live'}
      >
        {liveVision ? '👁️' : '🎥'}
      </button>

      {/* Camera button — label wraps input directly so iOS Safari opens camera on first tap */}
      <label
        className={`camera-btn${analyzing ? ' analyzing' : ''}`}
        onClick={stopProp}
        aria-label="Prendre une photo"
      >
        {analyzing ? '⏳' : '📷'}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoChange}
        />
      </label>

      {/* Hidden live video — required by iOS to keep stream alive */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={liveVideoRef}
        autoPlay
        playsInline
        muted
        style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px' }}
      />

      {/* Error toast */}
      <div className={`sphere-error${errorVisible ? ' show' : ''}`}>{errorMsg}</div>
    </div>
  );
}
