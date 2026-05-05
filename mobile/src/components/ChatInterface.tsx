import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket,
  playBase64Audio, enqueueAudioChunk, flushAudioChunks, clearAudioQueue,
  unlockAudio, stopAudio, iosFallbackSpeak, getOrCreateSessionId, isAudioPlaying,
  type IbrahimStatus,
} from '../services/api.js';

type JarvisState = 'idle' | 'listen' | 'think' | 'speak' | 'error';
type OverlayMode = 'none' | 'text' | 'camera' | 'menu' | 'history';
type ConvMsg = { role: 'user' | 'ai'; text: string; time: string };

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

// ── SVG Icons ─────────────────────────────────────────────────────
const MicSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="8"  y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const CamSVG = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const ImgSVG = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const WaveIcon = () => (
  <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden>
    <polyline points="0,6 3,6 5,1 7,11 9,6 11,6 13,3 15,9 17,6 20,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SpeakIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>
  </svg>
);
const HexIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

// ── Menu ──────────────────────────────────────────────────────────
type MenuItem = { ico: string; label: string; cmd: string; tag?: string };
type MenuSection = { section: string; items: MenuItem[] };

const MENU_SECTIONS: MenuSection[] = [
  {
    section: 'ACTIONS RAPIDES',
    items: [
      { ico: '✏️', label: 'Écrire un message',   cmd: '__text__' },
      { ico: '💬', label: 'Historique',            cmd: '__history__' },
    ],
  },
  {
    section: 'BUSINESS',
    items: [
      { ico: '📋', label: 'Réservations actives',  cmd: 'Liste-moi les réservations actives' },
      { ico: '💰', label: 'Rapport financier',      cmd: 'Rapport financier du mois' },
      { ico: '🚗', label: 'État de la flotte',      cmd: 'État de la flotte' },
      { ico: '📅', label: 'Agenda semaine',         cmd: 'Agenda de la semaine' },
      { ico: '📊', label: 'Rapport du jour',        cmd: 'Rapport complet de la journée' },
      { ico: '🔔', label: 'Tâches & rappels',       cmd: 'Rappels et tâches en attente' },
      { ico: '⏱',  label: 'Retards de retour',     cmd: 'Quelles voitures ne sont pas encore rendues ?' },
    ],
  },
  {
    section: 'MARKETING',
    items: [
      { ico: '🎥', label: 'Vidéo TikTok',           cmd: 'Crée une vidéo marketing pour la Creta', tag: 'IA' },
      { ico: '🔍', label: 'Analyse concurrents',     cmd: 'Analyse la concurrence location voiture Oran' },
      { ico: '📈', label: 'Tendances TikTok',        cmd: 'Recherche les tendances TikTok location voiture Algérie' },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { ico: '🌤', label: 'Météo Oran',              cmd: 'Météo à Oran maintenant' },
      { ico: '🌍', label: 'Actualités Algérie',      cmd: "Actualités en Algérie aujourd'hui" },
      { ico: '🤖', label: 'Code Agent',              cmd: 'Qu\'est-ce que tu peux coder pour moi ?', tag: 'DEV' },
      { ico: '🧠', label: 'Ma mémoire',              cmd: 'Qu\'est-ce que tu te rappelles de moi ?' },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════
export default function ChatInterface() {

  const [state,        setState]        = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [overlay,      setOverlay]      = useState<OverlayMode>('none');
  const [textInput,    setTextInput]    = useState('');
  const [started,      setStarted]      = useState(false);
  const [toolLabel,    setToolLabel]    = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConvMsg[]>([]);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const [liveVision, setLiveVision] = useState(false);
  const [scanning,   setScanning]   = useState(false);
  const [scanMode,   setScanMode]   = useState(false);
  const [scanResult, setScanResult] = useState<{ type: string } | null>(null);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoPreviewUrlRef = useRef<string | null>(null);

  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const errorVisibleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingPhotoRef    = useRef<{ base64: string; mime: string } | null>(null);
  const scanIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const galleryInputRef    = useRef<HTMLInputElement>(null);
  const cameraInputRef     = useRef<HTMLInputElement>(null);
  const liveVideoRef       = useRef<HTMLVideoElement>(null);
  const videoStreamRef     = useRef<MediaStream | null>(null);
  const stateRef           = useRef<JarvisState>('idle');
  const sending            = useRef(false);
  const sessionId          = getOrCreateSessionId();
  const recRef             = useRef<SRL | null>(null);
  const loopActive         = useRef(false);
  const startingRef        = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceived = useRef(false);
  const textInputRef       = useRef<HTMLInputElement>(null);
  const errorTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const rotYRef     = useRef(0);
  const rotXRef     = useRef(0.18);
  const ampRef      = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef= useRef<MediaStream | null>(null);

  const clearPhotoPreview = useCallback(() => {
    if (photoPreviewUrlRef.current) { URL.revokeObjectURL(photoPreviewUrlRef.current); photoPreviewUrlRef.current = null; }
    setPhotoPreview(null);
    pendingPhotoRef.current = null;
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg); setErrorVisible(true);
    if (errorVisibleTimer.current) clearTimeout(errorVisibleTimer.current);
    errorVisibleTimer.current = setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s; setState(s);
    if (s !== 'think') setToolLabel(null);
    if (s === 'error') {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => { stateRef.current = 'idle'; setState('idle'); }, 2500);
    }
  }, []);

  const openOverlay  = useCallback((m: OverlayMode) => setOverlay(m), []);
  const closeOverlay = useCallback(() => setOverlay('none'), []);

  const startLiveCamera = useCallback(async (e: React.MouseEvent, facing?: 'environment' | 'user') => {
    e.stopPropagation();
    const mode = facing ?? facingMode;
    if (videoStreamRef.current && facing === undefined) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
      setLiveVision(false); return;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
      setLiveVision(false);
    }
    if (!navigator.mediaDevices?.getUserMedia) { showError('Caméra non supportée'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      videoStreamRef.current = stream;
      const video = liveVideoRef.current;
      if (video) { video.srcObject = stream; video.play().catch(() => {}); }
      setLiveVision(true);
    } catch (err) {
      showError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Permission caméra refusée' : 'Caméra non accessible');
    }
  }, [facingMode, showError]);

  const flipCamera = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (liveVision) await startLiveCamera(e, newMode);
  }, [facingMode, liveVision, startLiveCamera]);

  const captureFrame = useCallback((): string | null => {
    const video = liveVideoRef.current;
    if (!video || !videoStreamRef.current || video.readyState < 2) return null;
    const w = Math.min(video.videoWidth || 640, 640), h = Math.min(video.videoHeight || 480, 480);
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    tmp.getContext('2d')!.drawImage(video, 0, 0, w, h);
    return tmp.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
  }, []);

  const handleScan = useCallback(async () => {
    if (scanning) return;
    const frame = captureFrame();
    if (!frame) { showError('Caméra non prête'); return; }
    setScanning(true); applyState('think'); clearAudioQueue();
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
    setScanMode(prev => { if (prev && scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } return !prev; });
  }, []);

  useEffect(() => {
    if (scanMode && liveVision && started) {
      handleScan();
      scanIntervalRef.current = setInterval(() => { if (stateRef.current === 'idle') handleScan(); }, 6000);
    } else { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } }
    return () => { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, liveVision, started]);

  const nowTime = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true; unlockAudio(); applyState('think'); setShowResponse(false);
    elevenlabsReceived.current = false;
    setConversations(prev => [...prev, { role: 'user', text: msg, time: nowTime() }]);
    const photo = pendingPhotoRef.current ?? (videoStreamRef.current ? { base64: captureFrame() ?? '', mime: 'image/jpeg' } : null);
    pendingPhotoRef.current = null; clearPhotoPreview();
    try {
      await api.chat(msg, sessionId, false, photo?.base64 || undefined, photo?.mime ?? 'image/jpeg');
    } catch { showError('Erreur de connexion'); applyState('error'); }
    finally { sending.current = false; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, applyState, showError, captureFrame, clearPhotoPreview]);

  const startMicAnalyser = useCallback(async () => {
    if (analyserRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 32;
      src.connect(analyser); analyserRef.current = analyser;
    } catch { /* denied */ }
  }, []);

  const handleSendTextMsg = useCallback(() => {
    const msg = textInput.trim(); if (!msg) return;
    setTextInput(''); closeOverlay();
    if (!startingRef.current) { startingRef.current = true; setStarted(true); loopActive.current = true; unlockAudio(); void startMicAnalyser(); }
    void sendText(msg);
  }, [textInput, closeOverlay, sendText, startMicAnalyser]);

  const scheduleNextListen = useCallback(() => {
    if (!loopActive.current) return;
    setTimeout(() => { if (loopActive.current && stateRef.current === 'idle') startListeningInner(); }, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startListeningInner = useCallback(() => {
    if (stateRef.current === 'listen') return;
    stopAudio(); window.speechSynthesis?.cancel();
    if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
    applyState('listen'); unlockAudio();
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
        const t = e.results[0]?.[0]?.transcript ?? ''; recRef.current = null;
        if (t.trim()) void sendText(t.trim());
        else { applyState('idle'); scheduleNextListen(); }
      };
      rec.onerror = () => { clearTimeout(listenTimeout); recRef.current = null; applyState('idle'); scheduleNextListen(); };
      rec.onend   = () => { clearTimeout(listenTimeout); if (stateRef.current === 'listen') { applyState('idle'); scheduleNextListen(); } };
      rec.start();
    } catch { applyState('idle'); scheduleNextListen(); }
  }, [applyState, sendText, showError, scheduleNextListen]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const COLORS: Record<JarvisState, { dot: string; line: string; glow: string }> = {
      idle:   { dot: 'rgba(0,212,255,',   line: 'rgba(0,170,220,',   glow: 'rgba(0,212,255,'  },
      listen: { dot: 'rgba(0,255,135,',   line: 'rgba(0,200,100,',   glow: 'rgba(0,255,135,'  },
      think:  { dot: 'rgba(144,97,249,',  line: 'rgba(110,70,200,',  glow: 'rgba(144,97,249,' },
      speak:  { dot: 'rgba(255,171,0,',   line: 'rgba(220,140,0,',   glow: 'rgba(255,200,50,' },
      error:  { dot: 'rgba(255,68,68,',   line: 'rgba(220,50,50,',   glow: 'rgba(255,80,80,'  },
    };
    const SPEED: Record<JarvisState, number> = { idle: 0.003, listen: 0.01, think: 0.007, speak: 0.013, error: 0.016 };
    function draw() {
      if (!ctx || !canvas) return;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        ampRef.current = Math.min(buf.reduce((a, b) => a + b, 0) / buf.length / 80, 1);
      } else { ampRef.current *= 0.9; }
      const s = stateRef.current, speed = SPEED[s], amp = ampRef.current;
      const pulse = s === 'speak' ? 0.06 + amp * 0.12 : s === 'listen' ? 0.04 + amp * 0.14 : s === 'error' ? 0.05 : 0;
      rotYRef.current += speed + amp * 0.01; rotXRef.current += speed * 0.4;
      const W = canvas.width, H = canvas.height, R = Math.min(W, H) * 0.30 * (1 + pulse);
      const CX = W / 2, CY = H / 2, col = COLORS[s];
      ctx.clearRect(0, 0, W, H);
      const proj = BASE_PARTICLES.map(p => {
        const r1 = rotateY(p, rotYRef.current), r2 = rotateX(r1, rotXRef.current);
        return { sx: CX + r2.x * R, sy: CY + r2.y * R, depth: (r2.z + 1) / 2, visible: r2.z > -0.15 };
      });
      ctx.lineWidth = 0.6;
      for (let i = 0; i < N_PARTICLES; i++) {
        const a = proj[i]!; if (!a.visible) continue;
        for (let j = i + 1; j < N_PARTICLES; j++) {
          const b = proj[j]!; if (!b.visible) continue;
          const dx = BASE_PARTICLES[i]!.x - BASE_PARTICLES[j]!.x;
          const dy = BASE_PARTICLES[i]!.y - BASE_PARTICLES[j]!.y;
          const dz = BASE_PARTICLES[i]!.z - BASE_PARTICLES[j]!.z;
          const d2 = dx*dx + dy*dy + dz*dz;
          if (d2 > CONNECT_DIST * CONNECT_DIST) continue;
          const alpha = (1 - d2 / (CONNECT_DIST * CONNECT_DIST)) * 0.35 * a.depth * b.depth;
          ctx.beginPath(); ctx.strokeStyle = `${col.line}${alpha.toFixed(2)})`; ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }
      for (const p of proj) {
        if (!p.visible) continue;
        const r = (1.8 + p.depth * 2.2) * (1 + pulse * 0.5);
        ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `${col.dot}${(0.5 + p.depth * 0.5).toFixed(2)})`; ctx.fill();
      }
      const burstR = 18 + pulse * 30 + (s === 'speak' ? amp * 20 : 0);
      const burst = ctx.createRadialGradient(CX, CY, 0, CX, CY, burstR);
      const ba = s === 'idle' ? 0.55 : 0.9;
      burst.addColorStop(0, `rgba(255,255,255,${ba})`);
      burst.addColorStop(0.3, `${col.glow}${(ba * 0.5).toFixed(2)})`);
      burst.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(CX, CY, burstR, 0, Math.PI * 2); ctx.fillStyle = burst; ctx.fill();
      if (s === 'speak' || s === 'listen') {
        const nRays = 8;
        for (let i = 0; i < nRays; i++) {
          const angle = (i / nRays) * Math.PI * 2 + rotYRef.current * 0.5;
          const len = burstR * (1.5 + amp * 1.5);
          ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + Math.cos(angle) * len, CY + Math.sin(angle) * len);
          ctx.strokeStyle = `${col.glow}${(0.15 + amp * 0.2).toFixed(2)})`; ctx.lineWidth = 1.2; ctx.stroke();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = canvas.offsetWidth * devicePixelRatio; canvas.height = canvas.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }
    resize(); window.addEventListener('resize', resize); rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []); // eslint-disable-line

  useEffect(() => {
    connectSocket(sessionId, {
      onStatus: (s, label) => {
        if (s === 'thinking') {
          if (label === undefined) { setResponseText(''); setShowResponse(false); }
          if (label !== undefined) setToolLabel(label ?? null);
        }
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
        setConversations(prev => [...prev, { role: 'ai', text, time: nowTime() }]);
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

  useEffect(() => { if (overlay === 'text') setTimeout(() => textInputRef.current?.focus(), 300); }, [overlay]);

  useEffect(() => {
    if (overlay !== 'camera' && videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
      setLiveVision(false);
      setScanMode(false);
      setScanResult(null);
    }
  }, [overlay]);

  useEffect(() => {
    if (overlay === 'history') setTimeout(() => historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [conversations, overlay]);

  const handleTap = useCallback(async () => {
    if (!started && !startingRef.current) {
      startingRef.current = true;
      setStarted(true); loopActive.current = true; unlockAudio();
      await startMicAnalyser();
      const hour = new Date().getHours();
      const greet = hour < 12 ? 'Bonjour Kouider' : hour < 18 ? 'Bon après-midi Kouider' : 'Bonsoir Kouider';
      const greetText = `${greet}, Dzaryx est en ligne. Je vous écoute.`;
      applyState('speak'); setResponseText(greetText); setShowResponse(true);
      setConversations([{ role: 'ai', text: greetText, time: nowTime() }]);
      iosFallbackSpeak(greetText);
      setTimeout(() => { applyState('idle'); scheduleNextListen(); }, Math.max(2500, greetText.length * 65));
      return;
    }
    if (stateRef.current === 'listen') { recRef.current?.stop(); applyState('idle'); }
    else if (stateRef.current === 'idle') startListeningInner();
  }, [started, applyState, startListeningInner, scheduleNextListen, startMicAnalyser]);

  const handleVoiceBtn = useCallback((e: React.MouseEvent) => { e.stopPropagation(); void handleTap(); }, [handleTap]);

  const handlePhotoFile = useCallback(async (file: File) => {
    setAnalyzing(true);
    if (!startingRef.current) {
      startingRef.current = true;
      setStarted(true); loopActive.current = true; unlockAudio(); void startMicAnalyser();
    }
    try {
      const base64 = await resizeImageToBase64(file, 1024);
      if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      photoPreviewUrlRef.current = previewUrl; setPhotoPreview(previewUrl);
      pendingPhotoRef.current = { base64, mime: 'image/jpeg' };
      setAnalyzing(false); closeOverlay();
      const prompt = 'Photo chargée. Posez votre question à voix haute ou par écrit.';
      setResponseText(prompt); setShowResponse(true); applyState('speak');
      iosFallbackSpeak(prompt, () => { applyState('idle'); if (loopActive.current) startListeningInner(); });
    } catch { setAnalyzing(false); showError('Impossible de lire la photo'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyState, showError, closeOverlay, startMicAnalyser]);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''; await handlePhotoFile(file);
  }, [handlePhotoFile]);

  const handleMenuAction = useCallback((cmd: string) => {
    if (cmd === '__text__')    { setOverlay('text'); return; }
    if (cmd === '__history__') { setOverlay('history'); return; }
    closeOverlay();
    if (!startingRef.current) { startingRef.current = true; setStarted(true); loopActive.current = true; unlockAudio(); void startMicAnalyser(); }
    void sendText(cmd);
  }, [closeOverlay, sendText, startMicAnalyser]);

  useEffect(() => {
    return () => {
      loopActive.current = false; recRef.current?.stop();
      if (audioFallbackTimer.current) clearTimeout(audioFallbackTimer.current);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (errorVisibleTimer.current) clearTimeout(errorVisibleTimer.current);
      cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      void audioCtxRef.current?.close();
      videoStreamRef.current?.getTracks().forEach(t => t.stop());
      if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
    };
  }, []); // eslint-disable-line

  const STATE_SUB: Record<JarvisState, string> = {
    idle:   'En attente de vos instructions...',
    listen: 'Je vous écoute, Kouider...',
    think:  'Traitement en cours...',
    speak:  'Dzaryx répond...',
    error:  'Réessayez dans un instant',
  };

  const respContent = showResponse
    ? responseText
    : toolLabel && state === 'think'
    ? `⚙ ${toolLabel}...`
    : started
    ? STATE_SUB[state]
    : "Appuyez sur VOICE INPUT pour commencer";

  return (
    <div className="dz-root" data-state={state}>

      {/* HUD corners */}
      <div className="dz-hud-tl" aria-hidden/><div className="dz-hud-tr" aria-hidden/>
      <div className="dz-hud-bl" aria-hidden/><div className="dz-hud-br" aria-hidden/>

      {/* Header */}
      <header className="dz-header">
        <div className="dz-hud-panel" aria-hidden>
          <div className="dz-hud-panel-lbl">SYSTEM STATUS</div>
          <div className="dz-hud-panel-val">OPTIMAL</div>
          <svg className="dz-heartbeat-svg" viewBox="0 0 80 20" fill="none">
            <polyline points="0,10 12,10 16,2 20,18 24,10 28,10 34,5 38,15 42,10 80,10"
              stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className="dz-title-area">
          <div className="dz-brand">DZARYX</div>
          <div className="dz-brand-sub">AI COMMAND INTERFACE</div>
        </div>

        <div className="dz-hud-panel" aria-hidden>
          <div className="dz-hud-panel-lbl">CORE TEMP</div>
          <div className="dz-hud-panel-val">32.6°C</div>
          <div className="dz-temp-bars">
            {[...Array(8)].map((_, i) => <div key={i} className="dz-temp-bar"/>)}
          </div>
        </div>
      </header>

      {/* Floating menu */}
      <button className="dz-menu-btn" onClick={() => openOverlay('menu')} aria-label="Menu">☰</button>

      {/* Error toast */}
      <div className={`dz-error${errorVisible ? ' visible' : ''}`} role="alert">{errorMsg}</div>

      {/* Orb */}
      <section className="dz-orb-section">
        <div className="dz-orb-wrap">
          <div className="dz-arc dz-arc--1" aria-hidden/>
          <div className="dz-arc dz-arc--2" aria-hidden/>
          <div className="dz-orb">
            <div className="dz-ring dz-ring--3" aria-hidden/>
            <div className="dz-ring dz-ring--2" aria-hidden/>
            <div className="dz-ring dz-ring--1" aria-hidden/>
            <canvas ref={canvasRef} className="dz-sphere-canvas" aria-hidden/>
          </div>
        </div>
      </section>

      {/* AI Status indicators */}
      <div className="dz-status-box">
        <div className="dz-status-box-hdr">
          <span>AI STATUS</span>
          <div className="dz-status-dot"/>
        </div>
        <div className="dz-status-inds">
          <div className={`dz-ind${state === 'listen' ? ' dz-ind--active' : ''}`}>
            <WaveIcon/>
            <span className="dz-ind-lbl">LISTENING</span>
            <div className="dz-ind-dots"><i/><i/><i/><i/></div>
          </div>
          <div className={`dz-ind${state === 'speak' ? ' dz-ind--active' : ''}`}>
            <SpeakIcon/>
            <span className="dz-ind-lbl">SPEAKING</span>
            <div className="dz-ind-dots"><i/><i/><i/><i/></div>
          </div>
          <div className={`dz-ind${state === 'think' ? ' dz-ind--active' : ''}`}>
            <HexIcon/>
            <span className="dz-ind-lbl">ANALYZING</span>
            <div className="dz-ind-dots"><i/><i/><i/><i/></div>
          </div>
        </div>
      </div>

      {/* Photo preview */}
      {photoPreview && (
        <div className="dz-photo-badge">
          <img src={photoPreview} alt="Photo" className="dz-photo-thumb"/>
          <div className="dz-photo-info">
            <div>PHOTO PRÊTE</div>
            <div className="dz-photo-hint">Posez votre question</div>
          </div>
          <button className="dz-photo-close" onClick={clearPhotoPreview}>✕</button>
        </div>
      )}

      {/* Response panel — tap to type */}
      <div
        className={`dz-resp-panel${showResponse ? ' dz-resp-panel--lit' : ''}`}
        onClick={() => openOverlay('text')}
        role="button"
        aria-label="Répondre par texte"
      >
        <div className="dz-resp-wave" aria-hidden>
          {[...Array(7)].map((_, i) => <div key={i} className="dz-vbar"/>)}
        </div>
        <div className="dz-resp-text" aria-live="polite">{respContent}</div>
      </div>

      {/* 3 main action buttons */}
      <nav className="dz-action-btns">
        <div className="dz-round-wrap">
          <button
            className={`dz-round-btn${state === 'listen' ? ' dz-round-btn--glow' : ''}`}
            onClick={handleVoiceBtn}
            aria-label={state === 'listen' ? 'Arrêter' : 'Parler'}
          ><MicSVG/></button>
          <span className="dz-round-lbl">VOICE INPUT</span>
        </div>

        <div className="dz-round-wrap">
          <button className="dz-round-btn" onClick={() => openOverlay('camera')} aria-label="Caméra">
            <CamSVG/>
          </button>
          <span className="dz-round-lbl">LIVE CAMERA</span>
        </div>

        <div className="dz-round-wrap">
          <button
            className={`dz-round-btn${photoPreview ? ' dz-round-btn--glow' : ''}`}
            onClick={() => galleryInputRef.current?.click()}
            aria-label="Photo"
          >{analyzing ? <span style={{fontSize:22}}>⏳</span> : <ImgSVG/>}</button>
          <span className="dz-round-lbl">PHOTO UPLOAD</span>
          <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange}/>
        </div>
      </nav>

      {/* ── OVERLAYS ── */}

      {/* Text */}
      <div className={`dz-overlay dz-text-overlay${overlay === 'text' ? ' open' : ''}`} role="dialog">
        <div className="dz-overlay-backdrop" onClick={closeOverlay}/>
        <div className="dz-text-panel">
          <input ref={textInputRef} className="dz-text-input" type="text"
            placeholder="Écrivez votre message à Dzaryx..."
            value={textInput} onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendTextMsg(); if (e.key === 'Escape') closeOverlay(); }}/>
          <button className="dz-text-send" onClick={handleSendTextMsg} aria-label="Envoyer">➤</button>
        </div>
      </div>

      {/* Camera */}
      <div className={`dz-overlay dz-camera-overlay${overlay === 'camera' ? ' open' : ''}`} role="dialog">
        <div className="dz-camera-header">
          <button className="dz-camera-back" onClick={closeOverlay}>← RETOUR</button>
          <span className="dz-camera-title">VISION IA</span>
          <span style={{ width: 80 }}/>
        </div>
        <div className="dz-camera-view">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={liveVideoRef} autoPlay playsInline muted className={`dz-live-video${liveVision ? ' active' : ''}`}/>
          {!liveVision && (
            <div className="dz-camera-empty">
              <span className="dz-camera-empty-ico">◉</span>
              <span className="dz-camera-empty-txt">CAMÉRA INACTIVE</span>
              <span className="dz-camera-empty-hint">Appuyer sur LIVE pour activer</span>
            </div>
          )}
          {scanResult && liveVision && (
            <div className="dz-scan-badge">
              {scanResult.type === 'passport' && '🪪 PASSEPORT'}
              {scanResult.type === 'license'  && '🪪 PERMIS'}
              {scanResult.type === 'vehicle'  && '🚗 VÉHICULE'}
              {scanResult.type === 'arabic'   && '🔤 TEXTE ARABE'}
              {scanResult.type === 'receipt'  && '🧾 REÇU'}
              {scanResult.type === 'contract' && '📄 CONTRAT'}
            </div>
          )}
          {liveVision && (
            <button className="dz-cam-flip" onClick={flipCamera} aria-label="Retourner caméra">🔄</button>
          )}
        </div>
        <div className="dz-camera-actions">
          <button className={`dz-cam-btn${liveVision ? ' danger' : ' primary'}`} onClick={startLiveCamera}>
            <span className="dz-cam-btn-ico">{liveVision ? '⏹' : '◉'}</span>
            <span className="dz-cam-btn-lbl">{liveVision ? 'STOP' : 'LIVE'}</span>
          </button>
          {liveVision && (
            <button className={`dz-cam-btn${scanMode ? ' primary' : ''}`}
              onClick={scanMode ? toggleScanMode : (e) => { e.stopPropagation(); void handleScan(); }}
              onDoubleClick={toggleScanMode}>
              <span className="dz-cam-btn-ico">{scanning ? '⟳' : '👁'}</span>
              <span className="dz-cam-btn-lbl">{scanning ? 'SCAN...' : scanMode ? 'AUTO ON' : 'SCANNER'}</span>
            </button>
          )}
          <label className="dz-cam-btn">
            <span className="dz-cam-btn-ico">📷</span>
            <span className="dz-cam-btn-lbl">PHOTO</span>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoChange}/>
          </label>
        </div>
      </div>

      {/* History */}
      <div className={`dz-overlay dz-history-overlay${overlay === 'history' ? ' open' : ''}`} role="dialog">
        <div className="dz-overlay-backdrop" onClick={closeOverlay}/>
        <div className="dz-history-panel">
          <div className="dz-menu-handle"/>
          <div className="dz-history-header">
            <span className="dz-history-title">CONVERSATION</span>
            <button className="dz-history-close" onClick={closeOverlay}>FERMER</button>
          </div>
          <div className="dz-history-list">
            {conversations.length === 0
              ? <div className="dz-history-empty">Aucune conversation pour l'instant</div>
              : conversations.map((msg, i) => (
                <div key={i} className={`dz-conv-msg dz-conv-msg--${msg.role}`}>
                  <div className="dz-conv-bubble">{msg.text}</div>
                  <div className="dz-conv-time">{msg.time}</div>
                </div>
              ))}
            <div ref={historyEndRef}/>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className={`dz-overlay dz-menu-overlay${overlay === 'menu' ? ' open' : ''}`} role="dialog">
        <div className="dz-overlay-backdrop" onClick={closeOverlay}/>
        <div className="dz-menu-panel">
          <div className="dz-menu-handle"/>
          <div className="dz-menu-brand">— DZARYX —</div>
          {MENU_SECTIONS.map(sec => (
            <div key={sec.section}>
              <div className="dz-menu-section">{sec.section}</div>
              {sec.items.map(item => (
                <button key={item.label} className="dz-menu-item" onClick={() => handleMenuAction(item.cmd)}>
                  <span className="dz-menu-ico">{item.ico}</span>
                  <span className="dz-menu-lbl">{item.label}</span>
                  {item.tag && <span className="dz-menu-tag">{item.tag}</span>}
                  <span className="dz-menu-arr">›</span>
                </button>
              ))}
            </div>
          ))}
          <div className="dz-menu-section">SYSTÈME</div>
          <div className="dz-menu-item" style={{ cursor: 'default' }}>
            <span className="dz-menu-ico">✈️</span>
            <span className="dz-menu-lbl">Telegram</span>
            <span className="dz-menu-tag">CONNECTÉ</span>
          </div>
          <div className="dz-menu-item" style={{ cursor: 'default', opacity: .4 }}>
            <span className="dz-menu-ico">🔒</span>
            <span className="dz-menu-lbl" style={{ fontSize: 13 }}>Session: {sessionId.slice(0, 20)}…</span>
          </div>
        </div>
      </div>

    </div>
  );
}
