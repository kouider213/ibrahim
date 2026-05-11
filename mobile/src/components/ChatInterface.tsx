import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket,
  playBase64Audio, enqueueAudioChunk, flushAudioChunks, clearAudioQueue,
  unlockAudio, stopAudio, iosFallbackSpeak, getOrCreateSessionId, isAudioPlaying,
  type IbrahimStatus,
} from '../services/api.js';

// ── Types ─────────────────────────────────────────────────────────
type JarvisState = 'idle' | 'listen' | 'think' | 'speak';
type OverlayMode = 'none' | 'text' | 'camera' | 'menu';

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
  think:  'ANALYSE IA',
  speak:  'RÉPONSE VOCALE',
};
const STATE_SUB: Record<JarvisState, string> = {
  idle:   'Appuyer sur le micro pour démarrer',
  listen: 'Je vous écoute, Kouider...',
  think:  'Traitement en cours...',
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

// ── Capability chips (shown in idle) ─────────────────────────────
const CAPS = [
  { ico: '🚗', label: 'Réservations',  cmd: 'Liste-moi les réservations actives' },
  { ico: '💰', label: 'Finances',      cmd: 'Rapport financier du mois' },
  { ico: '🎥', label: 'TikTok',        cmd: 'Crée une vidéo marketing pour la Creta' },
  { ico: '🌤', label: 'Météo',         cmd: 'Météo à Oran maintenant' },
  { ico: '📸', label: 'Vision',        cmd: 'Analyse vision' },
  { ico: '📊', label: 'Rapport',       cmd: 'Rapport complet de la journée' },
];

// ── Menu items with sections ──────────────────────────────────────
type MenuItem = { ico: string; label: string; cmd: string; tag?: string };
type MenuSection = { section: string; items: MenuItem[] };

const MENU_SECTIONS: MenuSection[] = [
  {
    section: 'BUSINESS',
    items: [
      { ico: '📋', label: 'Réservations actives',   cmd: 'Liste-moi les réservations actives' },
      { ico: '💰', label: 'Rapport financier',       cmd: 'Rapport financier du mois' },
      { ico: '🚗', label: 'État de la flotte',       cmd: 'État de la flotte' },
      { ico: '📅', label: 'Agenda semaine',          cmd: 'Agenda de la semaine' },
      { ico: '📊', label: 'Rapport du jour',         cmd: 'Rapport complet de la journée' },
      { ico: '🔔', label: 'Tâches & rappels',        cmd: 'Rappels et tâches en attente' },
      { ico: '⏱',  label: 'Retards de retour',      cmd: 'Quelles voitures ne sont pas encore rendues ?' },
    ],
  },
  {
    section: 'MARKETING',
    items: [
      { ico: '🎥', label: 'Vidéo TikTok',            cmd: 'Crée une vidéo marketing pour la Creta', tag: 'IA' },
      { ico: '🔍', label: 'Analyse concurrents',      cmd: 'Analyse la concurrence location voiture Oran' },
      { ico: '📈', label: 'Tendances TikTok',         cmd: 'Recherche les tendances TikTok location voiture Algérie' },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { ico: '🌤', label: 'Météo Oran',               cmd: 'Météo à Oran maintenant' },
      { ico: '🌍', label: 'Actualités Algérie',       cmd: 'Actualités en Algérie aujourd\'hui' },
      { ico: '🤖', label: 'Code Agent',               cmd: 'Qu\'est-ce que tu peux coder pour moi ?', tag: 'DEV' },
      { ico: '🧠', label: 'Ma mémoire',               cmd: 'Qu\'est-ce que tu te rappelles de moi ?' },
    ],
  },
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
  const [toolLabel,    setToolLabel]    = useState<string | null>(null);

  // ── Camera state ───────────────────────────────────────────────
  const [liveVision,   setLiveVision]   = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [scanMode,     setScanMode]     = useState(false);
  const [scanResult]                    = useState<{ type: string } | null>(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [pcRelay,      setPcRelay]      = useState(false);
  const pcRelayRef                      = useRef(false);
  const pcRelayTimer                    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Nexus status ───────────────────────────────────────────────
  const [nexusOnline,  setNexusOnline]  = useState<boolean | null>(null);
  const [showHealth,   setShowHealth]   = useState(false);
  const [healthData,   setHealthData]   = useState<{ apis: Record<string, string> } | null>(null);

  // ── Error state ────────────────────────────────────────────────
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [debugMsg,     setDebugMsg]     = useState('');

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
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const rafRef       = useRef<number>(0);
  const rotYRef      = useRef(0);
  const rotXRef      = useRef(0.18);
  const ampRef       = useRef(0);
  const analyserRef  = useRef<AnalyserNode | null>(null);
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
    if (s !== 'think') setToolLabel(null);
  }, []);

  // ── Overlay helpers ────────────────────────────────────────────
  const openOverlay = useCallback((m: OverlayMode) => setOverlay(m), []);

  const stopPcRelay = useCallback(() => {
    pcRelayRef.current = false;
    setPcRelay(false);
    if (pcRelayTimer.current) { clearInterval(pcRelayTimer.current); pcRelayTimer.current = null; }
  }, []);

  const startPcRelay = useCallback(() => {
    if (pcRelayRef.current) { stopPcRelay(); return; }
    pcRelayRef.current = true;
    setPcRelay(true);
    pcRelayTimer.current = setInterval(() => {
      if (!pcRelayRef.current) return;
      const video = liveVideoRef.current;
      if (!video || video.readyState < 2) return;
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 320, 240);
      const data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      const _e = ((import.meta as unknown) as { env?: Record<string, string> }).env ?? {};
      const apiUrl = _e['VITE_BACKEND_URL'] ?? '';
      const token  = _e['VITE_ACCESS_TOKEN'] ?? '';
      fetch(`${apiUrl}/api/vision/relay-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ data }),
      }).catch(() => {});
    }, 500);
  }, [stopPcRelay]);

  const stopCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    setLiveVision(false);
    setScanMode(false);
    stopPcRelay();
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
  }, [stopPcRelay]);

  const closeOverlay = useCallback(() => {
    stopCamera();
    setOverlay('none');
  }, [stopCamera]);

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

  const captureFrameWithRetry = useCallback(async (): Promise<string | null> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const video = liveVideoRef.current;
      if (!video || !videoStreamRef.current) {
        console.warn(`[VISION_UI] captureFrame attempt=${attempt + 1} no_video_or_stream`);
        await new Promise<void>(r => setTimeout(r, 300));
        continue;
      }
      const readyState = video.readyState;
      const w = video.videoWidth, h = video.videoHeight;
      console.log(`[VISION_UI] video_ready width=${w} height=${h} readyState=${readyState}`);
      if (readyState < 2 || w === 0 || h === 0) {
        console.warn(`[VISION_UI] not_ready attempt=${attempt + 1} readyState=${readyState} w=${w} h=${h}`);
        await new Promise<void>(r => setTimeout(r, 300));
        continue;
      }
      const cw = Math.min(w, 640), ch = Math.min(h, 480);
      const tmp = document.createElement('canvas');
      tmp.width = cw; tmp.height = ch;
      tmp.getContext('2d')!.drawImage(video, 0, 0, cw, ch);
      const base64 = tmp.toDataURL('image/jpeg', 0.7).split(',')[1] ?? null;
      if (!base64 || base64.length < 1000) {
        console.warn(`[VISION_UI] canvas_capture_fail attempt=${attempt + 1} base64_length=${base64?.length ?? 0}`);
        await new Promise<void>(r => setTimeout(r, 300));
        continue;
      }
      console.log(`[VISION_UI] canvas_capture_ok base64_length=${base64.length}`);
      return base64;
    }
    console.error('[VISION_UI] captureFrame failed after 3 attempts');
    return null;
  }, []);

  const handleScan = useCallback(async () => {
    if (scanning) return;
    console.log('[VISION_UI] scanner_clicked');
    setDebugMsg('Capture en cours…');

    const frame = await captureFrameWithRetry();
    if (!frame) {
      setDebugMsg('');
      showError('Image non capturée — caméra non prête');
      return;
    }

    setScanning(true);
    applyState('think');
    clearAudioQueue();
    unlockAudio();

    // Close overlay so socket.io response text is visible in main UI
    closeOverlay();
    setDebugMsg('');

    console.log(`[VISION_UI] sending_to_api endpoint=/api/chat image_length=${frame.length}`);
    try {
      await api.chat(
        'Décris précisément ce que tu vois sur cette image en 2-3 phrases en français.',
        sessionId, false, frame, 'image/jpeg',
      );
      console.log('[VISION_UI] api_response status=202_accepted');
    } catch (err) {
      console.error('[VISION_UI] api_response status=error', err);
      showError('Erreur vision — connexion impossible');
      applyState('idle');
    } finally {
      setScanning(false);
    }
  }, [scanning, captureFrameWithRetry, applyState, showError, sessionId, closeOverlay]);

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

  // Auto-start camera when Vision overlay opens
  useEffect(() => {
    if (overlay === 'camera' && !videoStreamRef.current && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
      }).then(stream => {
        videoStreamRef.current = stream;
        const video = liveVideoRef.current;
        if (video) { video.srcObject = stream; video.play().catch(() => {}); }
        setLiveVision(true);
      }).catch(() => showError('Permission caméra refusée'));
    }
    if (overlay !== 'camera') stopCamera();
  }, [overlay, showError, stopCamera]);

  // ── Send message ───────────────────────────────────────────────
  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);
    elevenlabsReceived.current = false;
    const rawPhoto = pendingPhotoRef.current ?? (videoStreamRef.current ? { base64: captureFrame() ?? '', mime: 'image/jpeg' } : null);
    pendingPhotoRef.current = null;
    // Guard: only attach image if base64 is non-empty (captureFrame may return null if camera not ready)
    const photo = rawPhoto?.base64 ? rawPhoto : null;
    if (rawPhoto && !photo) console.warn('[vision] captureFrame returned empty — sending text-only');
    try {
      await api.chat(msg, sessionId, false, photo?.base64, photo?.mime ?? 'image/jpeg');
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
      idle:   { dot: 'rgba(0,212,255,',   line: 'rgba(0,170,220,',   glow: 'rgba(0,212,255,'  },
      listen: { dot: 'rgba(0,255,135,',   line: 'rgba(0,200,100,',   glow: 'rgba(0,255,135,'  },
      think:  { dot: 'rgba(144,97,249,',  line: 'rgba(110,70,200,',  glow: 'rgba(144,97,249,' },
      speak:  { dot: 'rgba(255,171,0,',   line: 'rgba(220,140,0,',   glow: 'rgba(255,200,50,' },
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
      onStatus: (s, label) => {
        if (s === 'thinking') {
          if (label === undefined) { setResponseText(''); setShowResponse(false); }
          if (label !== undefined) setToolLabel(label ?? null);
        }
        if (s === 'idle' && (isAudioPlaying() || window.speechSynthesis?.speaking)) return;
        applyState(toJarvis(s));
      },
      onAudio: (b64) => {
        console.log('[VISION_UI] tts_start provider=elevenlabs_full');
        elevenlabsReceived.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); clearAudioQueue(); playBase64Audio(b64); applyState('speak');
      },
      onAudioChunk: (b64) => {
        console.log('[VISION_UI] tts_start provider=elevenlabs_chunk');
        elevenlabsReceived.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); enqueueAudioChunk(b64); applyState('speak');
      },
      onAudioComplete: () => { void flushAudioChunks(); },
      onTextChunk: (chunk) => { setResponseText(prev => prev + chunk); setShowResponse(true); },
      onTextComplete: (text) => {
        console.log(`[VISION_UI] text_complete chars=${text.length}`);
        setResponseText(text); setShowResponse(true);
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        if (!elevenlabsReceived.current) {
          audioFallbackTimer.current = setTimeout(() => {
            audioFallbackTimer.current = null;
            if (!isAudioPlaying() && !elevenlabsReceived.current) {
              console.log('[VISION_UI] tts_start provider=browser_fallback');
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

  // ── Relisten when idle ─────────────────────────────────────────
  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => { if (stateRef.current === 'idle' && loopActive.current) startListeningInner(); }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListeningInner, started]);

  // ── Nexus status polling ───────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await api.nexusStatus();
        setNexusOnline(r.connected);
      } catch {
        setNexusOnline(false);
      }
    };
    poll();
    const iv = setInterval(poll, 10_000);
    return () => clearInterval(iv);
  }, []);

  const handleHealthCheck = useCallback(async () => {
    setShowHealth(true);
    try {
      const data = await api.healthCheck();
      setHealthData(data as { apis: Record<string, string> });
    } catch {
      setHealthData(null);
    }
  }, []);

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
      const greetText = `${greet}, Dzaryx est en ligne. Je vous écoute.`;
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

  const handleCapAction = useCallback((cmd: string) => {
    if (cmd === 'Analyse vision') { openOverlay('camera'); return; }
    if (!started) {
      setStarted(true);
      loopActive.current = true;
      unlockAudio();
    }
    void sendText(cmd);
  }, [started, sendText, openOverlay]);

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

  // ── Status label ───────────────────────────────────────────────
  const statusLabel = state === 'idle' ? 'EN LIGNE'
    : state === 'listen' ? 'ÉCOUTE'
    : state === 'think'  ? 'ANALYSE'
    : 'PARLE';

  const showCaps = started && state === 'idle' && !showResponse;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="dz-root" data-state={state}>

      {/* Scanlines */}
      <div className="dz-scan"  aria-hidden />
      <div className="dz-scan2" aria-hidden />

      {/* ── HUD corners ── */}
      <div className="dz-hud-tl" aria-hidden />
      <div className="dz-hud-tr" aria-hidden />
      <div className="dz-hud-bl" aria-hidden />
      <div className="dz-hud-br" aria-hidden />

      {/* Corner data panels */}
      <div className="dz-corner-data dz-corner-data--tl" aria-hidden>
        <span className="dz-cd-hi">SYS STATUS</span>
        <span>CORE ···· <span className="dz-cd-blink">ONLINE</span></span>
        <span>AI ·············· ON</span>
        <div className="dz-data-bar"><div className="dz-data-bar-fill"/><span>87%</span></div>
      </div>
      <div className="dz-corner-data dz-corner-data--tr" aria-hidden>
        <span className="dz-cd-hi">TARGETING</span>
        <span>35.6976° N</span>
        <span>00.6369° E</span>
        <span className="dz-cd-blink">ORAN · LOCK</span>
      </div>
      <div className="dz-corner-data dz-corner-data--bl" aria-hidden>
        <span className="dz-cd-hi">POWER CORE</span>
        <span>ARC ········ 100%</span>
        <span>VOICE ········· ON</span>
        <span>CAM ··· STANDBY</span>
      </div>
      <div className="dz-corner-data dz-corner-data--br" aria-hidden>
        <span className="dz-cd-hi">NEXUS LINK</span>
        <span>PC ···· {nexusOnline === null ? 'CHECK…' : nexusOnline ? 'ONLINE' : 'OFFLINE'}</span>
        <span className={nexusOnline ? 'dz-cd-blink' : ''}>
          {nexusOnline ? '● CONNECTÉ' : nexusOnline === false ? '○ DÉCONNECTÉ' : '· · ·'}
        </span>
        <span>FIK CONCIERG</span>
      </div>

      {/* ── Top bar ── */}
      <div className="dz-topbar">
        <div className="dz-brand">DZARYX</div>
        <div className="dz-status-pill">
          <div className="dz-status-dot" />
          <span className="dz-status-lbl">{statusLabel}</span>
        </div>
        <button className="dz-menu-btn" onClick={() => openOverlay('menu')} aria-label="Menu">
          <span/><span/><span/>
        </button>
      </div>

      {/* ── Error toast ── */}
      <div className={`dz-error${errorVisible ? ' visible' : ''}`} role="alert">{errorMsg}</div>

      {/* ── Orb section ── */}
      <section className="dz-orbital-section">
        <div className="dz-stage">
          {/* Sweeping arcs */}
          <div className="dz-orbit dz-orbit--1" aria-hidden />
          <div className="dz-orbit dz-orbit--2" aria-hidden />

          {/* Power indicator bars */}
          <div className="dz-power-bars dz-power-bars--l" aria-hidden>
            {([5,9,13,9,5] as number[]).map((h,i) => <div key={i} className="dz-power-bar" style={{height:h}}/>)}
          </div>
          <div className="dz-power-bars dz-power-bars--r" aria-hidden>
            {([5,9,13,9,5] as number[]).map((h,i) => <div key={i} className="dz-power-bar" style={{height:h}}/>)}
          </div>

          <div className="dz-nucleus">
            <div className="dz-orbit dz-orbit--4" aria-hidden />
            <div className="dz-orbit dz-orbit--3" aria-hidden />

            {/* Rotating tick-mark ring */}
            <svg className="dz-ticks-svg" viewBox="0 0 200 200" aria-hidden>
              {(Array.from({length:36}) as unknown[]).map((_,i) => {
                const a = (i * 10) * Math.PI / 180;
                const major = i % 3 === 0;
                const r1 = 96, r2 = major ? 88 : 92;
                return <line key={i}
                  x1={100+r1*Math.cos(a)} y1={100+r1*Math.sin(a)}
                  x2={100+r2*Math.cos(a)} y2={100+r2*Math.sin(a)}
                  className={major ? 'dz-tick-major' : 'dz-tick-minor'}
                  strokeWidth={major ? 1.4 : 0.8}/>;
              })}
            </svg>

            <canvas ref={canvasRef} className="dz-sphere-canvas" aria-hidden />
            <div className="dz-core-ring" aria-hidden />
            <div className="dz-core-ring2" aria-hidden />
            <button
              className="dz-core-btn"
              onClick={handleVoiceBtn}
              aria-label={started ? (state === 'listen' ? 'Arrêter écoute' : 'Écouter') : 'Démarrer Dzaryx'}
            >
              <span className="dz-core-ico"><MicSVG /></span>
            </button>
          </div>
        </div>
        <div className="dz-orb-glow" aria-hidden />
      </section>

      {/* ── State section ── */}
      <div className="dz-state-zone" aria-live="polite">
        <div className="dz-state-lbl">{STATE_LABEL[state]}</div>
        {toolLabel && state === 'think' ? (
          <div className="dz-tool-badge">{toolLabel}</div>
        ) : (
          <div className="dz-state-sub">{started ? STATE_SUB[state] : STATE_SUB.idle}</div>
        )}
      </div>

      {/* ── Response text ── */}
      <div className={`dz-response${showResponse ? ' visible' : ''}`} aria-live="polite">
        {responseText}
      </div>

      {/* ── Capability chips (idle only) ── */}
      {showCaps && (
        <div className="dz-caps">
          {CAPS.map(c => (
            <button key={c.label} className="dz-cap" onClick={() => handleCapAction(c.cmd)}>
              <span className="dz-cap-ico">{c.ico}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Action bar ── */}
      <nav className="dz-actions">
        <button
          className={`dz-btn${overlay === 'camera' ? ' on' : ''}`}
          onClick={() => openOverlay('camera')}
          aria-label="Caméra"
        >
          <span className="dz-btn-ico">📷</span>
          <span className="dz-btn-lbl">VISION</span>
        </button>

        <button
          className="dz-btn-voice"
          onClick={handleVoiceBtn}
          aria-label={state === 'listen' ? 'Arrêter' : 'Parler'}
        >
          <MicSVG />
        </button>

        <button
          className={`dz-btn${overlay === 'text' ? ' on' : ''}`}
          onClick={() => openOverlay('text')}
          aria-label="Message texte"
        >
          <span className="dz-btn-ico">⌨️</span>
          <span className="dz-btn-lbl">TEXTE</span>
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          OVERLAYS
          ══════════════════════════════════════════════════════════ */}

      {/* ── Text input overlay ── */}
      <div className={`dz-overlay dz-text-overlay${overlay === 'text' ? ' open' : ''}`} role="dialog" aria-label="Message texte">
        <div className="dz-overlay-bg" onClick={closeOverlay} />
        <div className="dz-text-panel">
          <input
            ref={textInputRef}
            className="dz-text-inp"
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
      <div className={`dz-overlay dz-cam-overlay${overlay === 'camera' ? ' open' : ''}`} role="dialog" aria-label="Vision IA">
        <div className="dz-cam-header">
          <button type="button" className="dz-cam-back" onClick={closeOverlay}>← RETOUR</button>
          <span className="dz-cam-title">VISION IA</span>
          <span style={{ width: 80 }} />
        </div>

        <div className={`dz-cam-view${scanning ? ' scanning-active' : ''}`}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={liveVideoRef}
            autoPlay playsInline muted
            className={`dz-live-vid${liveVision ? ' on' : ''}`}
          />
          {liveVision && <div className="dz-cam-scanline" />}
          {!liveVision && (
            <div className="dz-cam-empty">
              <span className="dz-cam-empty-ico">◉</span>
              <span className="dz-cam-empty-txt">ACTIVATION EN COURS...</span>
              <span className="dz-cam-empty-hint">AUTORISER L'ACCÈS CAMÉRA</span>
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

        <div className="dz-cam-status">
          <span className={`dz-cam-status-dot${liveVision ? ' live' : ''}`} />
          <span>{debugMsg || (liveVision ? (scanning ? 'ANALYSE EN COURS' : 'CAMÉRA ACTIVE') : 'EN ATTENTE')}</span>
        </div>

        <div className="dz-cam-actions">
          <button
            type="button"
            className={`dz-cam-btn${liveVision ? ' danger' : ''}`}
            onClick={startLiveCamera}
          >
            <span className="dz-cam-btn-ico">{liveVision ? '⏹' : '◉'}</span>
            <span className="dz-cam-btn-lbl">{liveVision ? 'STOP' : 'LIVE'}</span>
          </button>

          <button
            type="button"
            className={`dz-cam-btn${scanning ? ' active' : scanMode ? ' active' : ''}`}
            onClick={scanMode ? toggleScanMode : (e) => { e.stopPropagation(); void handleScan(); }}
            onDoubleClick={toggleScanMode}
            disabled={!liveVision}
          >
            <span className="dz-cam-btn-ico">{scanning ? '⟳' : '👁'}</span>
            <span className="dz-cam-btn-lbl">{scanning ? 'SCAN...' : scanMode ? 'AUTO ON' : 'SCANNER'}</span>
          </button>

          <button
            type="button"
            className={`dz-cam-btn${pcRelay ? ' danger' : ''}`}
            onClick={startPcRelay}
            disabled={!liveVision}
            title="Envoyer le live sur le PC NEXUS"
          >
            <span className="dz-cam-btn-ico">{pcRelay ? '📡' : '🖥️'}</span>
            <span className="dz-cam-btn-lbl">{pcRelay ? 'PC ON' : 'PC'}</span>
          </button>

          <label className={`dz-cam-btn${analyzing ? ' active' : pendingPhotoRef.current ? ' active' : ''}`}>
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
        <div className="dz-overlay-bg" onClick={closeOverlay} />
        <div className="dz-menu-panel">
          <div className="dz-menu-handle" />
          <div className="dz-menu-brand">— DZARYX —</div>

          {MENU_SECTIONS.map(sec => (
            <div key={sec.section}>
              <div className="dz-menu-sec">{sec.section}</div>
              {sec.items.map(item => (
                <button
                  key={item.label}
                  className="dz-menu-item"
                  onClick={() => handleMenuAction(item.cmd)}
                >
                  <span className="dz-menu-ico">{item.ico}</span>
                  <span className="dz-menu-lbl">{item.label}</span>
                  {item.tag && <span className="dz-menu-tag">{item.tag}</span>}
                  <span className="dz-menu-arr">›</span>
                </button>
              ))}
            </div>
          ))}

          <div className="dz-menu-sec">SYSTÈME</div>
          <button className="dz-menu-item" onClick={() => { closeOverlay(); void handleHealthCheck(); }}>
            <span className="dz-menu-ico">🔍</span>
            <span className="dz-menu-lbl">Health Check</span>
            <span className="dz-menu-tag">TEST</span>
            <span className="dz-menu-arr">›</span>
          </button>
          <button className="dz-menu-item" onClick={() => handleMenuAction('ping nexus')}>
            <span className="dz-menu-ico">🖥️</span>
            <span className="dz-menu-lbl">Ping NEXUS</span>
            <span className={`dz-menu-tag${nexusOnline ? '' : ' dz-menu-tag--off'}`}>
              {nexusOnline === null ? '···' : nexusOnline ? 'ONLINE' : 'OFF'}
            </span>
            <span className="dz-menu-arr">›</span>
          </button>
          <div className="dz-menu-item" style={{ cursor: 'default' }}>
            <span className="dz-menu-ico">✈️</span>
            <span className="dz-menu-lbl">Telegram</span>
            <span className="dz-menu-tag">CONNECTÉ</span>
          </div>
          <div className="dz-menu-item" style={{ cursor: 'default', opacity: .45 }}>
            <span className="dz-menu-ico">🔒</span>
            <span className="dz-menu-lbl" style={{ fontSize: 13 }}>Session: {sessionId.slice(0, 20)}…</span>
          </div>
        </div>
      </div>

      {/* ── Health check modal ── */}
      {showHealth && (
        <div className="dz-overlay dz-menu-overlay open" role="dialog" aria-label="Health Check">
          <div className="dz-overlay-bg" onClick={() => setShowHealth(false)} />
          <div className="dz-menu-panel">
            <div className="dz-menu-handle" />
            <div className="dz-menu-brand">— HEALTH CHECK —</div>
            <div className="dz-menu-sec">SERVICES</div>
            {healthData ? (
              Object.entries(healthData.apis ?? {}).map(([k, v]) => (
                <div key={k} className="dz-menu-item" style={{ cursor: 'default' }}>
                  <span className="dz-menu-ico">{v === '🟢' ? '✅' : '❌'}</span>
                  <span className="dz-menu-lbl">{k}</span>
                  <span className="dz-menu-tag">{v === '🟢' ? 'OK' : 'FAIL'}</span>
                </div>
              ))
            ) : (
              <div className="dz-menu-item" style={{ cursor: 'default' }}>
                <span className="dz-menu-ico">⏳</span>
                <span className="dz-menu-lbl">Test en cours…</span>
              </div>
            )}
            <div className="dz-menu-sec">NEXUS</div>
            <div className="dz-menu-item" style={{ cursor: 'default' }}>
              <span className="dz-menu-ico">{nexusOnline ? '✅' : '❌'}</span>
              <span className="dz-menu-lbl">NEXUS PC Agent</span>
              <span className="dz-menu-tag">{nexusOnline ? 'ONLINE' : 'OFF'}</span>
            </div>
            <button className="dz-menu-item" onClick={() => setShowHealth(false)}
              style={{ marginTop: 16, color: 'var(--dz-cyan, #00d4ff)' }}>
              <span className="dz-menu-ico">←</span>
              <span className="dz-menu-lbl">Fermer</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
