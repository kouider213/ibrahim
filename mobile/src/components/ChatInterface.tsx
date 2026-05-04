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

interface SREvent { results: { [k: number]: { [k: number]: { transcript: string } } } }
interface SRL {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}

const N_PARTICLES = 140;
const CONNECT_DIST = 0.38;
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
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]!);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const STATE_LABEL: Record<JarvisState, string> = {
  idle:   'EN ATTENTE',
  listen: 'ÉCOUTE ACTIVE',
  think:  'TRAITEMENT EN COURS',
  speak:  'RÉPONSE ACTIVE',
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="dz-orb-svg">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="8"  y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="dz-tb-svg">
      <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14"/>
      <rect x="2" y="7" width="13" height="10" rx="2"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="dz-tb-svg">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="dz-tb-svg">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dz-tb-svg">
      <path d="M9 12l2 2 4-4M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0z" strokeLinecap="round"/>
    </svg>
  );
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
  const [scanning,     setScanning]     = useState(false);
  const [scanMode,     setScanMode]     = useState(false);
  const [scanResult,   setScanResult]   = useState<{ type: string } | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState(false);

  const pendingPhotoRef    = useRef<{ base64: string; mime: string } | null>(null);
  const scanIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraInputRef     = useRef<HTMLInputElement>(null);
  const liveVideoRef       = useRef<HTMLVideoElement>(null);
  const videoStreamRef     = useRef<MediaStream | null>(null);
  const stateRef           = useRef<JarvisState>('idle');
  const sending            = useRef(false);
  const sessionId          = getOrCreateSessionId();
  const recRef             = useRef<SRL | null>(null);
  const loopActive         = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceived = useRef(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const rotYRef     = useRef(0);
  const rotXRef     = useRef(0.18);
  const ampRef      = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const toggleLiveCamera = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
      setLiveVision(false);
      setScanMode(false);
      setScanResult(null);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { showError('Caméra non supportée'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      videoStreamRef.current = stream;
      const video = liveVideoRef.current;
      if (video) { video.srcObject = stream; video.play().catch(() => {}); }
      setLiveVision(true);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Permission caméra refusée'
        : 'Caméra non accessible';
      showError(msg);
    }
  }, [showError]);

  const captureFrame = useCallback((): string | null => {
    const video = liveVideoRef.current;
    if (!video || !videoStreamRef.current || video.readyState < 2) return null;
    const w = Math.min(video.videoWidth || 640, 640);
    const h = Math.min(video.videoHeight || 480, 480);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.drawImage(video, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
  }, []);

  const handleScan = useCallback(async () => {
    if (scanning) return;
    const frame = captureFrame();
    if (!frame) { showError('Caméra non prête'); return; }
    setScanning(true);
    applyState('think');
    clearAudioQueue();
    try {
      const result = await api.scan(frame, 'image/jpeg');
      setScanResult({ type: result.type });
      const spoken = result.description || 'Je ne peux pas analyser cette image.';
      setResponseText(spoken);
      setShowResponse(true);
      applyState('speak');
      iosFallbackSpeak(spoken, () => { applyState('idle'); });
      if (result.extractedData && ['passport', 'license'].includes(result.type)) {
        const name = (result.extractedData['name'] as string) || '';
        if (name) setTimeout(() => { pendingPhotoRef.current = { base64: frame, mime: 'image/jpeg' }; }, 500);
      }
    } catch { showError('Erreur scan vision'); applyState('idle'); }
    finally { setScanning(false); }
  }, [scanning, captureFrame, applyState, showError]);

  const toggleScanMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setScanMode(prev => {
      const next = !prev;
      if (!next && scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
      return next;
    });
  }, []);

  useEffect(() => {
    if (scanMode && liveVision && started) {
      void handleScan();
      scanIntervalRef.current = setInterval(() => { if (stateRef.current === 'idle') void handleScan(); }, 6000);
    } else {
      if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    }
    return () => { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, liveVision, started]);

  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);
    elevenlabsReceived.current = false;
    const photo = pendingPhotoRef.current ?? (videoStreamRef.current ? { base64: captureFrame() ?? '', mime: 'image/jpeg' } : null);
    pendingPhotoRef.current = null;
    setPendingPhoto(false);
    try {
      await api.chat(msg, sessionId, false, photo?.base64 || undefined, photo?.mime ?? 'image/jpeg');
    } catch { showError('Erreur de connexion'); applyState('idle'); }
    finally { sending.current = false; }
  }, [sessionId, applyState, showError, captureFrame]);

  const startMicAnalyser = useCallback(async () => {
    if (analyserRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
    } catch { /* mic denied */ }
  }, []);

  const scheduleNextListen = useCallback(() => {
    if (!loopActive.current) return;
    setTimeout(() => { if (loopActive.current && stateRef.current === 'idle') startListeningInner(); }, 200);
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
    const w = window as Window & { webkitSpeechRecognition?: new () => SRL; SpeechRecognition?: new () => SRL };
    const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!SR) { showError('Micro non supporté'); applyState('idle'); return; }
    try {
      const rec = new SR();
      rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
      recRef.current = rec;
      const listenTimeout = setTimeout(() => {
        if (stateRef.current === 'listen') { recRef.current?.stop(); recRef.current = null; applyState('idle'); scheduleNextListen(); }
      }, 25_000);
      rec.onresult = (e: SREvent) => {
        clearTimeout(listenTimeout);
        const t = e.results[0]?.[0]?.transcript ?? '';
        recRef.current = null;
        if (t.trim()) void sendText(t.trim());
        else { applyState('idle'); scheduleNextListen(); }
      };
      rec.onerror = () => { clearTimeout(listenTimeout); recRef.current = null; applyState('idle'); scheduleNextListen(); };
      rec.onend   = () => { clearTimeout(listenTimeout); if (stateRef.current === 'listen') { applyState('idle'); scheduleNextListen(); } };
      rec.start();
    } catch { applyState('idle'); scheduleNextListen(); }
  }, [applyState, sendText, showError, scheduleNextListen]);

  // Canvas sphere animation
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
    const SPEED: Record<JarvisState, number> = { idle: 0.003, listen: 0.009, think: 0.006, speak: 0.012 };

    function draw() {
      if (!ctx || !canvas) return;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        ampRef.current = Math.min(buf.reduce((a, b) => a + b, 0) / buf.length / 80, 1);
      } else { ampRef.current *= 0.9; }

      const s = stateRef.current;
      const speed = SPEED[s];
      const amp = ampRef.current;
      const pulse = s === 'speak' ? 0.06 + amp * 0.12 : s === 'listen' ? 0.04 + amp * 0.14 : 0.0;
      rotYRef.current += speed + amp * 0.01;
      rotXRef.current += speed * 0.4;

      const W = canvas.width, H = canvas.height;
      const R = Math.min(W, H) * 0.32 * (1 + pulse);
      const CX = W / 2, CY = H / 2;
      const col = COLORS[s];
      ctx.clearRect(0, 0, W, H);

      const proj = BASE_PARTICLES.map(p => {
        const r2 = rotateX(rotateY(p, rotYRef.current), rotXRef.current);
        const depth = (r2.z + 1) / 2;
        return { sx: CX + r2.x * R, sy: CY + r2.y * R, depth, visible: r2.z > -0.15 };
      });

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
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }
      for (const p of proj) {
        if (!p.visible) continue;
        const r = (1.8 + p.depth * 2.2) * (1 + pulse * 0.5);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `${col.dot}${(0.5 + p.depth * 0.5).toFixed(2)})`;
        ctx.fill();
      }
      const burstR = 18 + pulse * 30 + (s === 'speak' ? amp * 20 : 0);
      const burstAlpha = s === 'idle' ? 0.55 : 0.9;
      const burst = ctx.createRadialGradient(CX, CY, 0, CX, CY, burstR);
      burst.addColorStop(0, `rgba(255,255,255,${burstAlpha})`);
      burst.addColorStop(0.3, `${col.glow}${(burstAlpha * 0.5).toFixed(2)})`);
      burst.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(CX, CY, burstR, 0, Math.PI * 2);
      ctx.fillStyle = burst; ctx.fill();
      if (s === 'speak' || s === 'listen') {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + rotYRef.current * 0.5;
          const len = burstR * (1.5 + amp * 1.5);
          ctx.beginPath();
          ctx.moveTo(CX, CY);
          ctx.lineTo(CX + Math.cos(angle) * len, CY + Math.sin(angle) * len);
          ctx.strokeStyle = `${col.glow}${(0.15 + amp * 0.2).toFixed(2)})`;
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
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket events
  useEffect(() => {
    connectSocket(sessionId, {
      onStatus: (s, toolLabel) => {
        if (s === 'thinking' && toolLabel === undefined) { setResponseText(''); setShowResponse(false); }
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
      onAudioComplete: () => { void flushAudioChunks(); },
      onTextChunk: (chunk) => { setResponseText(prev => prev + chunk); setShowResponse(true); },
      onTextComplete: (text) => {
        setResponseText(text); setShowResponse(true);
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        if (!elevenlabsReceived.current) {
          audioFallbackTimer.current = setTimeout(() => {
            audioFallbackTimer.current = null;
            if (!isAudioPlaying() && !elevenlabsReceived.current) {
              applyState('speak');
              iosFallbackSpeak(text, () => { applyState('idle'); scheduleNextListen(); });
            }
          }, 600);
        }
        elevenlabsReceived.current = false;
      },
      onResponse: () => {},
      onValidation: () => { setTimeout(() => { if (loopActive.current) { applyState('idle'); scheduleNextListen(); } }, 3000); },
      onTaskUpdate: () => {},
    });
    const onAudioEnded = () => {
      if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
      if (loopActive.current) { applyState('idle'); scheduleNextListen(); }
    };
    window.addEventListener('Dzaryx:audioEnded', onAudioEnded);
    return () => { disconnectSocket(); window.removeEventListener('Dzaryx:audioEnded', onAudioEnded); };
  }, [sessionId, applyState, scheduleNextListen]);

  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => { if (stateRef.current === 'idle' && loopActive.current) startListeningInner(); }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListeningInner, started]);

  const handleTap = useCallback(async () => {
    if (!started) {
      setStarted(true);
      loopActive.current = true;
      unlockAudio();
      await startMicAnalyser();
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Bonjour Kouider' : hour < 18 ? 'Bon après-midi Kouider' : 'Bonsoir Kouider';
      const greetText = `${greet}, Dzaryx est prêt. Je vous écoute.`;
      applyState('speak');
      setResponseText(greetText);
      setShowResponse(true);
      iosFallbackSpeak(greetText);
      setTimeout(() => { applyState('idle'); scheduleNextListen(); }, Math.max(2500, greetText.length * 65));
      return;
    }
    if (stateRef.current === 'listen') { recRef.current?.stop(); applyState('idle'); }
    else if (stateRef.current === 'idle') { startListeningInner(); }
  }, [started, applyState, startListeningInner, scheduleNextListen, startMicAnalyser]);

  const handleVoiceBtn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void handleTap();
  }, [handleTap]);

  const stopProp = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAnalyzing(true);
    try {
      const base64 = await resizeImageToBase64(file, 1024);
      pendingPhotoRef.current = { base64, mime: 'image/jpeg' };
      setPendingPhoto(true);
      setAnalyzing(false);
      const prompt = 'Photo reçue. Parlez maintenant.';
      setResponseText(prompt); setShowResponse(true); applyState('speak');
      iosFallbackSpeak(prompt, () => { applyState('idle'); if (loopActive.current) startListeningInner(); });
    } catch {
      setAnalyzing(false);
      showError('Impossible de lire la photo');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyState, showError]);

  const handlePhotoBtn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cameraInputRef.current?.click();
  }, []);

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
    <div className="dz-root" data-state={state}>
      {/* Background layers */}
      <div className="dz-grid" aria-hidden />
      <div className="dz-scanline" aria-hidden />
      <div className="dz-vignette" aria-hidden />

      {/* Top bar */}
      <div className="dz-topbar">
        <div className="dz-badge dz-badge--online">
          <div className="dz-badge-dot" />
          ASSISTANT EN LIGNE
        </div>
        <div className="dz-badge dz-badge--ai">
          AI · CLAUDE SONNET
        </div>
        <div className="dz-badge dz-badge--system">
          SYSTÈME ACTIF
          <div className="dz-wave-tiny"><span/><span/><span/><span/></div>
        </div>
      </div>

      {/* Title */}
      <header className="dz-header">
        <div className="dz-title-row">
          <div className="dz-title-line" aria-hidden />
          <h1 className="dz-title">DZARYX</h1>
          <div className="dz-title-line" aria-hidden />
        </div>
        <p className="dz-subtitle">FIK CONCIERGERIE · ORAN · ALGÉRIE</p>
      </header>

      {/* Main orb */}
      <main className="dz-main" onClick={handleTap}>
        <div className="dz-orb-wrap">
          {/* HUD corner brackets */}
          <div className="dz-hud-c dz-hud-c--tl" aria-hidden />
          <div className="dz-hud-c dz-hud-c--tr" aria-hidden />
          <div className="dz-hud-c dz-hud-c--bl" aria-hidden />
          <div className="dz-hud-c dz-hud-c--br" aria-hidden />

          {/* Camera feed */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={liveVideoRef}
            autoPlay playsInline muted
            className={`dz-cam-video${liveVision ? ' active' : ''}`}
          />

          {/* Scan result badge */}
          {scanResult && liveVision && (
            <div className="dz-scan-badge">
              {scanResult.type === 'passport' && '🪪 PASSEPORT DÉTECTÉ'}
              {scanResult.type === 'license'  && '🪪 PERMIS DÉTECTÉ'}
              {scanResult.type === 'vehicle'  && '🚗 VÉHICULE DÉTECTÉ'}
              {scanResult.type === 'arabic'   && '🔤 TEXTE ARABE'}
              {scanResult.type === 'receipt'  && '🧾 REÇU DÉTECTÉ'}
              {scanResult.type === 'contract' && '📄 CONTRAT DÉTECTÉ'}
            </div>
          )}

          {/* 3D sphere (hidden when camera active) */}
          <canvas ref={canvasRef} className={`dz-sphere${liveVision ? ' hidden' : ''}`} aria-hidden />

          {/* Rotating arc rings */}
          <div className="dz-ring dz-ring--1" aria-hidden />
          <div className="dz-ring dz-ring--2" aria-hidden />
          <div className="dz-ring dz-ring--3" aria-hidden />

          {/* Scan mode toggle (camera active) */}
          {liveVision && (
            <button
              className={`dz-scan-toggle${scanMode ? ' active' : ''}`}
              onClick={toggleScanMode}
              onDoubleClick={(e) => { e.stopPropagation(); void handleScan(); }}
              aria-label="Scanner"
            >
              {scanning ? '⟳ ANALYSE' : scanMode ? '👁 AUTO ON' : '👁 SCANNER'}
            </button>
          )}

          {/* Center orb button */}
          <button
            className="dz-orb-btn"
            onClick={handleVoiceBtn}
            aria-label={started ? (state === 'listen' ? 'Arrêter' : 'Parler') : 'Démarrer Dzaryx'}
          >
            <div className="dz-orb-pulse" aria-hidden />
            <div className="dz-orb-inner">
              {!started && <span className="dz-orb-tap">TAP</span>}
              {started && state === 'idle'   && <MicIcon />}
              {started && state === 'listen' && <div className="dz-listen-bars"><span/><span/><span/><span/><span/></div>}
              {started && state === 'think'  && <div className="dz-think-dots"><span/><span/><span/></div>}
              {started && state === 'speak'  && <div className="dz-speak-wave"><span/><span/><span/><span/><span/><span/><span/></div>}
            </div>
          </button>

          {/* State label */}
          <div className="dz-state-lbl">
            {started ? STATE_LABEL[state] : 'TOUCHER POUR ACTIVER'}
          </div>

          {/* Response text overlay */}
          <div
            className={`dz-response${showResponse ? ' visible' : ''}`}
            aria-live="polite"
            onClick={stopProp}
          >
            <div className="dz-response-bar" aria-hidden />
            {responseText}
          </div>
        </div>
      </main>

      {/* 3 action buttons */}
      <div className="dz-trio" onClick={stopProp}>
        {/* Live camera */}
        <button
          className={`dz-tb dz-tb--left${liveVision ? ' active' : ''}`}
          onClick={(e) => void toggleLiveCamera(e)}
          aria-label={liveVision ? 'Arrêter caméra' : 'Caméra live'}
        >
          <div className="dz-tb-icon">{liveVision ? <StopIcon /> : <CamIcon />}</div>
          <span className="dz-tb-label">{liveVision ? 'ARRÊTER' : 'LIVE CAM'}</span>
        </button>

        {/* Voice (center, elevated) */}
        <button
          className={`dz-tb dz-tb--center${state === 'listen' ? ' active' : ''}`}
          onClick={handleVoiceBtn}
          aria-label="Parler"
        >
          <div className="dz-tb-center-ring" aria-hidden />
          <div className="dz-tb-icon"><MicIcon /></div>
          <span className="dz-tb-label">PARLER</span>
        </button>

        {/* Photo */}
        <button
          className={`dz-tb dz-tb--right${pendingPhoto ? ' active' : ''}`}
          onClick={handlePhotoBtn}
          aria-label="Envoyer photo"
        >
          <div className="dz-tb-icon">
            {analyzing ? <div className="dz-tb-spinner" /> : pendingPhoto ? <CheckIcon /> : <PhotoIcon />}
          </div>
          <span className="dz-tb-label">{pendingPhoto ? 'PRÊTE' : 'PHOTO'}</span>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            className="dz-hidden"
            onChange={handlePhotoChange}
          />
        </button>
      </div>

      {/* Thin status strip */}
      <div className="dz-status-strip">
        <span><span className="dz-dot" />ORAN · GPS</span>
        <span><span className="dz-dot" />SÉCURISÉ</span>
        <span><span className="dz-dot" />TELEGRAM</span>
        <span><span className="dz-dot" />IA ACTIVE</span>
      </div>

      {/* Error toast */}
      <div className={`dz-toast${errorVisible ? ' show' : ''}`} role="alert">{errorMsg}</div>
    </div>
  );
}
