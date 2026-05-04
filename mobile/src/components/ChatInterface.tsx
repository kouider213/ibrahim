import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket,
  playBase64Audio, enqueueAudioChunk, flushAudioChunks, clearAudioQueue,
  unlockAudio, stopAudio, iosFallbackSpeak, getOrCreateSessionId, isAudioPlaying,
  type IbrahimStatus,
} from '../services/api.js';

// ── Types ─────────────────────────────────────────────────────────
type JarvisState  = 'idle' | 'listen' | 'think' | 'speak';
type OverlayMode  = 'none' | 'text' | 'camera' | 'menu';

function toJarvis(s: IbrahimStatus): JarvisState {
  if (s === 'listening') return 'listen';
  if (s === 'thinking')  return 'think';
  if (s === 'speaking')  return 'speak';
  return 'idle';
}

// ── Speech recognition types ──────────────────────────────────────
interface SREvent { results: { [k: number]: { [k: number]: { transcript: string } } } }
interface SRL {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}

// ── 3D Sphere ─────────────────────────────────────────────────────
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

// ── Image resize helper ───────────────────────────────────────────
function resizeImageToBase64(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1]!);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── State display maps ────────────────────────────────────────────
const STATE_LABEL: Record<JarvisState, string> = {
  idle:   'EN ATTENTE',
  listen: 'ÉCOUTE ACTIVE',
  think:  'TRAITEMENT IA',
  speak:  'RÉPONSE',
};
const STATE_SUB: Record<JarvisState, string> = {
  idle:   'Appuyer pour démarrer',
  listen: 'Je vous écoute...',
  think:  'Analyse en cours...',
  speak:  'Dzaryx répond...',
};

// ── Mic SVG ───────────────────────────────────────────────────────
const MicSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="8"  y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ── Menu items ────────────────────────────────────────────────────
const MENU_ACTIONS = [
  { ico: '📋', label: 'Réservations',      cmd: 'Liste-moi les réservations actives' },
  { ico: '💰', label: 'Finances',           cmd: 'Rapport financier du mois' },
  { ico: '🚗', label: 'Flotte',             cmd: 'État de la flotte' },
  { ico: '📅', label: 'Agenda',             cmd: 'Agenda de la semaine' },
  { ico: '📊', label: 'Rapport',            cmd: 'Rapport complet de la journée' },
  { ico: '🔔', label: 'Rappels',            cmd: 'Rappels et tâches en attente' },
];

// ══════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════
export default function ChatInterface() {

  // ── Core state ────────────────────────────────────────────────
  const [state,        setState]        = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [overlay,      setOverlay]      = useState<OverlayMode>('none');
  const [textInput,    setTextInput]    = useState('');
  const [started,      setStarted]      = useState(false);

  // ── Camera state ───────────────────────────────────────────────
  const [liveVision,   setLiveVision]   = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [scanMode,     setScanMode]     = useState(false);
  const [scanResult,   setScanResult]   = useState<{ type: string } | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);

  // ── Error state ────────────────────────────────────────────────
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────
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
  const textInputRef       = useRef<HTMLInputElement>(null);

  // Canvas refs
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const rotYRef     = useRef(0);
  const rotXRef     = useRef(0.18);
  const ampRef      = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // ── Error helper ───────────────────────────────────────────────
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  // ── State machine ──────────────────────────────────────────────
  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Overlay helpers ────────────────────────────────────────────
  const openOverlay  = useCallback((m: OverlayMode) => setOverlay(m), []);
  const closeOverlay = useCallback(() => setOverlay('none'), []);

  // ── Live camera ────────────────────────────────────────────────
  const startLiveCamera = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
      setLiveVision(false);
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
        ? 'Permission caméra refusée' : 'Caméra non accessible';
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
      setResponseText(spoken); setShowResponse(true); applyState('speak');
      iosFallbackSpeak(spoken, () => applyState('idle'));
    } catch { showError('Erreur scan vision'); applyState('idle'); }
    finally { setScanning(false); }
  }, [scanning, captureFrame, applyState, showError]);

  const toggleScanMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setScanMode(prev => {
      if (prev && scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
      return !prev;
    });
  }, []);

  useEffect(() => {
    if (scanMode && liveVision && started) {
      handleScan();
      scanIntervalRef.current = setInterval(() => { if (stateRef.current === 'idle') handleScan(); }, 6000);
    } else {
      if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    }
    return () => { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, liveVision, started]);

  // ── Send message ───────────────────────────────────────────────
  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);
    elevenlabsReceived.current = false;
    const photo = pendingPhotoRef.current ?? (videoStreamRef.current ? { base64: captureFrame() ?? '', mime: 'image/jpeg' } : null);
    pendingPhotoRef.current = null;
    try {
      await api.chat(msg, sessionId, false, photo?.base64 || undefined, photo?.mime ?? 'image/jpeg');
    } catch { showError('Erreur de connexion'); applyState('idle'); }
    finally { sending.current = false; }
  }, [sessionId, applyState, showError, captureFrame]);

  // ── Text input overlay send ────────────────────────────────────
  const handleSendTextMsg = useCallback(() => {
    const msg = textInput.trim();
    if (!msg) return;
    setTextInput('');
    closeOverlay();
    if (!started) {
      setStarted(true);
      loopActive.current = true;
      unlockAudio();
    }
    void sendText(msg);
  }, [textInput, closeOverlay, started, sendText]);

  // ── Mic amplitude analyser ────────────────────────────────────
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

  // ── Speech recognition ─────────────────────────────────────────
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

  // ── 3D sphere canvas ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const COLORS: Record<JarvisState, { dot: string; line: string; glow: string }> = {
      idle:   { dot: 'rgba(0,229,255,',   line: 'rgba(0,180,220,',   glow: 'rgba(0,200,255,'  },
      listen: { dot: 'rgba(0,255,136,',   line: 'rgba(0,200,100,',   glow: 'rgba(0,255,136,'  },
      think:  { dot: 'rgba(168,85,247,',  line: 'rgba(130,60,200,',  glow: 'rgba(168,85,247,' },
      speak:  { dot: 'rgba(255,215,0,',   line: 'rgba(220,170,0,',   glow: 'rgba(255,220,50,' },
    };
    const SPEED: Record<JarvisState, number> = { idle: 0.003, listen: 0.01, think: 0.007, speak: 0.013 };

    function draw() {
      if (!ctx || !canvas) return;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        ampRef.current = Math.min(buf.reduce((a, b) => a + b, 0) / buf.length / 80, 1);
      } else { ampRef.current *= 0.9; }

      const s = stateRef.current;
      const speed = SPEED[s], amp = ampRef.current;
      const pulse = s === 'speak' ? 0.06 + amp * 0.12 : s === 'listen' ? 0.04 + amp * 0.14 : 0;
      rotYRef.current += speed + amp * 0.01;
      rotXRef.current += speed * 0.4;

      const W = canvas.width, H = canvas.height;
      const R = Math.min(W, H) * 0.30 * (1 + pulse);
      const CX = W / 2, CY = H / 2;
      const col = COLORS[s];
      ctx.clearRect(0, 0, W, H);

      const proj = BASE_PARTICLES.map(p => {
        const r1 = rotateY(p, rotYRef.current), r2 = rotateX(r1, rotXRef.current);
        return { sx: CX + r2.x * R, sy: CY + r2.y * R, depth: (r2.z + 1) / 2, visible: r2.z > -0.15 };
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
          const d2 = dx*dx + dy*dy + dz*dz;
          if (d2 > CONNECT_DIST * CONNECT_DIST) continue;
          const alpha = (1 - d2 / (CONNECT_DIST * CONNECT_DIST)) * 0.35 * a.depth * b.depth;
          ctx.beginPath();
          ctx.strokeStyle = `${col.line}${alpha.toFixed(2)})`;
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
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
      const burst = ctx.createRadialGradient(CX, CY, 0, CX, CY, burstR);
      const ba = s === 'idle' ? 0.55 : 0.9;
      burst.addColorStop(0, `rgba(255,255,255,${ba})`);
      burst.addColorStop(0.3, `${col.glow}${(ba * 0.5).toFixed(2)})`);
      burst.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(CX, CY, burstR, 0, Math.PI * 2);
      ctx.fillStyle = burst; ctx.fill();

      if (s === 'speak' || s === 'listen') {
        const nRays = 8;
        for (let i = 0; i < nRays; i++) {
          const angle = (i / nRays) * Math.PI * 2 + rotYRef.current * 0.5;
          const len = burstR * (1.5 + amp * 1.5);
          ctx.beginPath();
          ctx.moveTo(CX, CY);
          ctx.lineTo(CX + Math.cos(angle) * len, CY + Math.sin(angle) * len);
          ctx.strokeStyle = `${col.glow}${(0.15 + amp * 0.2).toFixed(2)})`;
          ctx.lineWidth = 1.2; ctx.stroke();
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

  // ── Socket events ──────────────────────────────────────────────
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
          }, 3000);
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

  // ── Relisten when idle ─────────────────────────────────────────
  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => { if (stateRef.current === 'idle' && loopActive.current) startListeningInner(); }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListeningInner, started]);

  // ── Text overlay auto-focus ────────────────────────────────────
  useEffect(() => {
    if (overlay === 'text') {
      setTimeout(() => textInputRef.current?.focus(), 300);
    }
  }, [overlay]);

  // ── Main tap / start ───────────────────────────────────────────
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
      setResponseText(greetText); setShowResponse(true);
      iosFallbackSpeak(greetText);
      setTimeout(() => { applyState('idle'); scheduleNextListen(); }, Math.max(2500, greetText.length * 65));
      return;
    }
    if (stateRef.current === 'listen') { recRef.current?.stop(); applyState('idle'); }
    else if (stateRef.current === 'idle') startListeningInner();
  }, [started, applyState, startListeningInner, scheduleNextListen, startMicAnalyser]);

  const handleVoiceBtn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void handleTap();
  }, [handleTap]);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAnalyzing(true);
    try {
      const base64 = await resizeImageToBase64(file, 1024);
      pendingPhotoRef.current = { base64, mime: 'image/jpeg' };
      setAnalyzing(false);
      closeOverlay();
      const prompt = 'Photo reçue. Posez votre question à voix haute ou par écrit.';
      setResponseText(prompt); setShowResponse(true); applyState('speak');
      iosFallbackSpeak(prompt, () => { applyState('idle'); if (loopActive.current) startListeningInner(); });
    } catch {
      setAnalyzing(false);
      showError('Impossible de lire la photo');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyState, showError, closeOverlay]);

  const handleMenuAction = useCallback((cmd: string) => {
    closeOverlay();
    if (!started) {
      setStarted(true);
      loopActive.current = true;
      unlockAudio();
    }
    void sendText(cmd);
  }, [closeOverlay, started, sendText]);

  // ── Cleanup ────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="dz-root" data-state={state}>

      {/* ── Top bar ── */}
      <div className="dz-topbar">
        <div className="dz-brand">DZARYX</div>
        <div className="dz-status-row">
          <div className="dz-status-dot" />
          <span className="dz-status-label">EN LIGNE</span>
        </div>
        <button className="dz-menu-icon" onClick={() => openOverlay('menu')} aria-label="Menu">
          <span/><span/><span/>
        </button>
      </div>

      {/* ── Error toast ── */}
      <div className={`dz-error${errorVisible ? ' visible' : ''}`} role="alert">{errorMsg}</div>

      {/* ── Orb section ── */}
      <section className="dz-orb-section">
        <div className="dz-orb">
          <div className="dz-ring dz-ring--3" aria-hidden />
          <div className="dz-ring dz-ring--2" aria-hidden />
          <div className="dz-ring dz-ring--1" aria-hidden />
          <canvas ref={canvasRef} className="dz-sphere-canvas" aria-hidden />
          <button
            className="dz-center-btn"
            onClick={handleVoiceBtn}
            aria-label={started ? (state === 'listen' ? 'Arrêter écoute' : 'Écouter') : 'Démarrer Dzaryx'}
          >
            <MicSVG />
          </button>
        </div>
        <div className="dz-orb-glow" aria-hidden />
      </section>

      {/* ── State text ── */}
      <div className="dz-state-section" aria-live="polite">
        <div className="dz-state-label">{STATE_LABEL[state]}</div>
        <div className="dz-state-sub">{started ? STATE_SUB[state] : 'Appuyer sur le micro pour démarrer'}</div>
      </div>

      {/* ── Response text ── */}
      <div className={`dz-response${showResponse ? ' visible' : ''}`} aria-live="polite">
        {responseText}
      </div>

      {/* ── Action bar ── */}
      <nav className="dz-action-bar">
        <button
          className={`dz-act-btn${overlay === 'camera' ? ' active' : ''}`}
          onClick={() => openOverlay('camera')}
          aria-label="Caméra"
        >
          <span className="dz-act-ico">📷</span>
          <span className="dz-act-lbl">CAMÉRA</span>
        </button>

        <button
          className={`dz-act-btn dz-act-btn--voice${state === 'listen' ? ' active' : ''}`}
          onClick={handleVoiceBtn}
          aria-label={state === 'listen' ? 'Arrêter' : 'Parler'}
        >
          <span className="dz-act-ico">🎤</span>
        </button>

        <button
          className={`dz-act-btn${overlay === 'text' ? ' active' : ''}`}
          onClick={() => openOverlay('text')}
          aria-label="Message texte"
        >
          <span className="dz-act-ico">⌨️</span>
          <span className="dz-act-lbl">TEXTE</span>
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          OVERLAYS
          ══════════════════════════════════════════════════════════ */}

      {/* ── Text input overlay ── */}
      <div className={`dz-overlay dz-text-overlay${overlay === 'text' ? ' open' : ''}`} role="dialog" aria-label="Message texte">
        <div className="dz-overlay-backdrop" onClick={closeOverlay} />
        <div className="dz-text-panel">
          <input
            ref={textInputRef}
            className="dz-text-input"
            type="text"
            placeholder="Écrivez votre message à Dzaryx..."
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendTextMsg(); if (e.key === 'Escape') closeOverlay(); }}
          />
          <button className="dz-text-send" onClick={handleSendTextMsg} aria-label="Envoyer">➤</button>
        </div>
      </div>

      {/* ── Camera overlay ── */}
      <div className={`dz-overlay dz-camera-overlay${overlay === 'camera' ? ' open' : ''}`} role="dialog" aria-label="Caméra">
        <div className="dz-camera-header">
          <button className="dz-camera-back" onClick={closeOverlay}>← RETOUR</button>
          <span className="dz-camera-title">VISION</span>
          <span style={{ width: 80 }} />
        </div>

        <div className="dz-camera-view">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={liveVideoRef}
            autoPlay playsInline muted
            className={`dz-live-video${liveVision ? ' active' : ''}`}
          />
          {!liveVision && (
            <div className="dz-camera-empty">
              <span className="dz-camera-empty-ico">◉</span>
              <span className="dz-camera-empty-txt">CAMÉRA INACTIVE</span>
              <span className="dz-camera-empty-hint">Appuyer sur LIVE pour activer</span>
            </div>
          )}
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
        </div>

        <div className="dz-camera-actions">
          <button
            className={`dz-cam-btn${liveVision ? ' danger' : ' primary'}`}
            onClick={startLiveCamera}
          >
            <span className="dz-cam-btn-ico">{liveVision ? '⏹' : '◉'}</span>
            <span className="dz-cam-btn-lbl">{liveVision ? 'STOP' : 'LIVE'}</span>
          </button>

          {liveVision && (
            <button
              className={`dz-cam-btn${scanMode ? ' primary' : ''}`}
              onClick={scanMode ? toggleScanMode : (e) => { e.stopPropagation(); void handleScan(); }}
              onDoubleClick={toggleScanMode}
            >
              <span className="dz-cam-btn-ico">{scanning ? '⟳' : '👁'}</span>
              <span className="dz-cam-btn-lbl">{scanning ? 'SCAN...' : scanMode ? 'AUTO ON' : 'SCANNER'}</span>
            </button>
          )}

          <label className={`dz-cam-btn${analyzing ? '' : pendingPhotoRef.current ? ' primary' : ''}`}>
            <span className="dz-cam-btn-ico">{analyzing ? '⏳' : pendingPhotoRef.current ? '✅' : '📷'}</span>
            <span className="dz-cam-btn-lbl">{analyzing ? 'LECTURE...' : pendingPhotoRef.current ? 'PRÊTE' : 'PHOTO'}</span>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
          </label>
        </div>
      </div>

      {/* ── Menu overlay ── */}
      <div className={`dz-overlay dz-menu-overlay${overlay === 'menu' ? ' open' : ''}`} role="dialog" aria-label="Menu Dzaryx">
        <div className="dz-overlay-backdrop" onClick={closeOverlay} />
        <div className="dz-menu-panel">
          <div className="dz-menu-handle" />
          <div className="dz-menu-head">— DZARYX —</div>

          {MENU_ACTIONS.map(item => (
            <button
              key={item.label}
              className="dz-menu-item"
              onClick={() => handleMenuAction(item.cmd)}
            >
              <span className="dz-menu-ico">{item.ico}</span>
              <span className="dz-menu-lbl">{item.label}</span>
              <span className="dz-menu-arr">›</span>
            </button>
          ))}

          <div className="dz-menu-item" style={{ cursor: 'default' }}>
            <span className="dz-menu-ico">✈️</span>
            <span className="dz-menu-lbl">Telegram</span>
            <span className="dz-menu-tag">CONNECTÉ</span>
          </div>

          <div className="dz-menu-item" style={{ cursor: 'default', marginTop: 8, opacity: .5 }}>
            <span className="dz-menu-ico">🔒</span>
            <span className="dz-menu-lbl" style={{ fontSize: 13 }}>Session: {sessionId.slice(0, 24)}…</span>
          </div>
        </div>
      </div>

    </div>
  );
}
