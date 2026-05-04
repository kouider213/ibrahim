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
type ActiveTab = 'home' | 'telegram' | 'voice' | 'camera' | 'tools' | 'profile';

function toJarvis(s: IbrahimStatus): JarvisState {
  if (s === 'listening') return 'listen';
  if (s === 'thinking')  return 'think';
  if (s === 'speaking')  return 'speak';
  return 'idle';
}

// ── Speech Recognition types ──────────────────────────────────────
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

// ── Display maps ──────────────────────────────────────────────────
const MODULE_TITLE: Record<JarvisState, string> = {
  idle:   'EN ATTENTE',
  listen: 'ÉCOUTE ACTIVE',
  think:  'TRAITEMENT',
  speak:  'RÉPONSE ACTIVE',
};
const STATE_LABEL: Record<JarvisState, string> = {
  idle:   'En attente...',
  listen: 'Je vous écoute...',
  think:  'Analyse en cours...',
  speak:  'Réponse en cours...',
};

// ── SVG Icons ─────────────────────────────────────────────────────
const MicSVG = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="9" y="2" width="6" height="12" rx="3"/>
    <path d="M5 10a7 7 0 0 0 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <line x1="8"  y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────
function WaveMini() {
  return (
    <div className="dz-wave-mini">
      <span/><span/><span/><span/>
    </div>
  );
}

function WaveForm() {
  return (
    <div className="dz-waveform dz-waveform--left" aria-hidden>
      {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="dz-wave-bar"/>)}
    </div>
  );
}
function WaveFormRight() {
  return (
    <div className="dz-waveform dz-waveform--right" aria-hidden>
      {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="dz-wave-bar"/>)}
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 16, circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="dz-progress-ring">
      <svg width="40" height="40">
        <circle cx="20" cy="20" r={r} stroke="rgba(0,200,255,0.1)" strokeWidth="3" fill="none"/>
        <circle
          cx="20" cy="20" r={r}
          stroke="#00ccff" strokeWidth="3" fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: 'drop-shadow(0 0 3px rgba(0,200,255,0.6))' }}
        />
      </svg>
      <div className="dz-progress-ring-val">{value}%</div>
    </div>
  );
}

function MiniGraph({ active }: { active: boolean }) {
  const pts = active
    ? '0,20 8,14 16,18 24,8 32,12 40,4 48,10'
    : '0,18 8,16 16,17 24,14 32,15 40,16 48,14';
  return (
    <svg className="dz-mini-graph" viewBox="0 0 48 28">
      <polyline points={pts} stroke={active ? '#00ccff' : 'rgba(0,200,255,0.4)'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Camera panel ──────────────────────────────────────────────────
interface CameraProps {
  liveVision: boolean;
  scanning: boolean;
  scanMode: boolean;
  scanResult: { type: string } | null;
  analyzing: boolean;
  pendingPhoto: boolean;
  onLiveCamera: (e: React.MouseEvent) => void;
  onScan: (e: React.MouseEvent) => void;
  onToggleScanMode: (e: React.MouseEvent) => void;
  onPhotoLabel: (e: React.MouseEvent) => void;
  liveVideoRef: React.RefObject<HTMLVideoElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  onPhotoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function CameraPanel(p: CameraProps) {
  return (
    <div className="dz-camera-panel">
      <div className="dz-camera-frame">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={p.liveVideoRef}
          autoPlay playsInline muted
          className={`dz-live-video${p.liveVision ? ' active' : ''}`}
        />
        {!p.liveVision && (
          <div className="dz-camera-empty">
            <span className="dz-camera-empty-icon">◉</span>
            <span>Caméra inactive</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>Appuie sur ACTIVER</span>
          </div>
        )}
        {p.scanResult && p.liveVision && (
          <div className="dz-scan-badge-overlay">
            {p.scanResult.type === 'passport' && '🪪 PASSEPORT DÉTECTÉ'}
            {p.scanResult.type === 'license'  && '🪪 PERMIS DÉTECTÉ'}
            {p.scanResult.type === 'vehicle'  && '🚗 VÉHICULE DÉTECTÉ'}
            {p.scanResult.type === 'arabic'   && '🔤 TEXTE ARABE'}
            {p.scanResult.type === 'receipt'  && '🧾 REÇU DÉTECTÉ'}
            {p.scanResult.type === 'contract' && '📄 CONTRAT DÉTECTÉ'}
          </div>
        )}
      </div>
      <div className="dz-camera-btns">
        <button
          className={`dz-btn${p.liveVision ? ' dz-btn--danger' : ' dz-btn--primary'}`}
          onClick={p.onLiveCamera}
          aria-label={p.liveVision ? 'Arrêter la caméra' : 'Activer la caméra live'}
        >
          <span className="dz-btn-icon">{p.liveVision ? '⏹' : '◉'}</span>
          <span className="dz-btn-body">
            <span className="dz-btn-label">{p.liveVision ? 'DÉSACTIVER' : 'ACTIVER LIVE'}</span>
            <span className="dz-btn-sub">{p.liveVision ? 'Arrêter le flux' : 'Ouvrir caméra'}</span>
          </span>
        </button>
        {p.liveVision ? (
          <button
            className={`dz-btn dz-btn--secondary${p.scanning ? ' active' : ''}`}
            onClick={p.scanMode ? p.onToggleScanMode : p.onScan}
            onDoubleClick={p.onToggleScanMode}
            aria-label="Scanner"
          >
            <span className="dz-btn-icon">{p.scanning ? '⟳' : p.scanMode ? '👁' : '👁'}</span>
            <span className="dz-btn-body">
              <span className="dz-btn-label">{p.scanning ? 'SCAN...' : p.scanMode ? 'AUTO ON' : 'SCANNER'}</span>
              <span className="dz-btn-sub">{p.scanMode ? 'Double-tap: off' : 'Tap: scan | 2x: auto'}</span>
            </span>
          </button>
        ) : (
          <label
            className={`dz-btn dz-btn--secondary${p.analyzing ? '' : p.pendingPhoto ? ' active' : ''}`}
            onClick={p.onPhotoLabel}
            aria-label="Prendre une photo"
          >
            <span className="dz-btn-icon">{p.analyzing ? '⏳' : p.pendingPhoto ? '✅' : '📷'}</span>
            <span className="dz-btn-body">
              <span className="dz-btn-label">{p.pendingPhoto ? 'PHOTO PRÊTE' : 'PHOTO'}</span>
              <span className="dz-btn-sub">{p.pendingPhoto ? 'Parlez maintenant' : 'Ouvrir galerie'}</span>
            </span>
            <input
              ref={p.cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="dz-hidden"
              onChange={p.onPhotoChange}
            />
          </label>
        )}
      </div>
    </div>
  );
}

// ── Telegram panel ────────────────────────────────────────────────
function TelegramPanel() {
  return (
    <div className="dz-telegram-panel">
      <div className="dz-tg-icon">✈️</div>
      <div className="dz-tg-title">TELEGRAM</div>
      <div className="dz-tg-sub">Connecté au canal Dzaryx. Écrivez directement sur Telegram pour commander votre assistant.</div>
      <div className="dz-tg-status">
        <div className="dz-tg-status-dot"/>
        <span className="dz-tg-status-txt">RÉSEAU STABLE · PING 18MS</span>
      </div>
      <div className="dz-tg-note">
        Les messages Telegram sont traités par Dzaryx en temps réel avec la même IA que l'interface vocale.
      </div>
    </div>
  );
}

// ── Tools panel ───────────────────────────────────────────────────
const TOOLS = [
  { icon: '📋', label: 'RÉSERVATIONS' },
  { icon: '💰', label: 'FINANCES' },
  { icon: '🚗', label: 'FLOTTE' },
  { icon: '📅', label: 'AGENDA' },
  { icon: '📱', label: 'TIKTOK' },
  { icon: '📊', label: 'RAPPORT' },
  { icon: '🔔', label: 'RAPPELS' },
  { icon: '📄', label: 'DOCUMENTS' },
  { icon: '⚙️', label: 'PARAMÈTRES' },
];

function ToolsPanel({ onRequest }: { onRequest: (tool: string) => void }) {
  return (
    <div className="dz-tools-panel">
      <div className="dz-tools-hdr">— OUTILS DZARYX —</div>
      <div className="dz-tools-grid">
        {TOOLS.map(t => (
          <button key={t.label} className="dz-tool-tile" onClick={() => onRequest(t.label)} aria-label={t.label}>
            <span className="dz-tool-ico">{t.icon}</span>
            <span className="dz-tool-lbl">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Profile panel ─────────────────────────────────────────────────
function ProfilePanel({ sessionId }: { sessionId: string }) {
  const rows = [
    { icon: '🏠', label: 'Fik Conciergerie', sub: 'Oran, Algérie' },
    { icon: '🛡️', label: 'Sécurité', sub: 'AES-256 · Chiffrement actif' },
    { icon: '🧠', label: 'Modèle IA', sub: 'Claude claude-sonnet-4-6 · Anthropic' },
    { icon: '📡', label: 'Connexion', sub: 'Socket.IO · Temps réel' },
    { icon: '🔔', label: 'Notifications', sub: 'Telegram + Pushover' },
    { icon: '📍', label: 'Localisation', sub: 'Oran, DZ · GPS actif' },
  ];
  return (
    <div className="dz-profile-panel">
      <div className="dz-profile-top">
        <div className="dz-profile-avatar">👤</div>
        <div className="dz-profile-name">KOUIDER</div>
        <div className="dz-profile-role">PROPRIÉTAIRE · FIK CONCIERGERIE</div>
        <div className="dz-profile-sid">{sessionId.slice(0, 32)}…</div>
      </div>
      <div className="dz-profile-list">
        {rows.map(r => (
          <div key={r.label} className="dz-profile-row">
            <span className="dz-profile-row-ico">{r.icon}</span>
            <span className="dz-profile-row-txt">
              <span className="dz-profile-row-lbl">{r.label}</span>
              <span className="dz-profile-row-sub">{r.sub}</span>
            </span>
            <span className="dz-profile-row-arr">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function ChatInterface() {
  // ── Existing state ─────────────────────────────────────────────
  const [state,        setState]        = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [started,      setStarted]      = useState(false);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [liveVision,   setLiveVision]   = useState(false);
  const [scanMode,     setScanMode]     = useState(false);
  const [scanning,     setScanning]     = useState(false);
  const [scanResult,   setScanResult]   = useState<{ type: string; data?: Record<string, unknown> } | null>(null);

  // ── New tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  const pendingPhotoRef = useRef<{ base64: string; mime: string } | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const liveVideoRef    = useRef<HTMLVideoElement>(null);
  const videoStreamRef  = useRef<MediaStream | null>(null);
  const stateRef        = useRef<JarvisState>('idle');
  const sending         = useRef(false);
  const sessionId       = getOrCreateSessionId();
  const recRef          = useRef<SRL | null>(null);
  const loopActive      = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceived = useRef(false);

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
  }, []);

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
        ? 'Permission caméra refusée — autorisez dans Réglages'
        : 'Caméra non accessible';
      showError(msg);
    }
  }, [showError]);

  const captureFrame = useCallback((): string | null => {
    const video = liveVideoRef.current;
    if (!video || !videoStreamRef.current || video.readyState < 2) return null;
    const w = Math.min(video.videoWidth  || 640, 640);
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
      setScanResult({ type: result.type, data: result.extractedData });
      const spoken = result.description || 'Je ne peux pas analyser cette image.';
      setResponseText(spoken);
      setShowResponse(true);
      applyState('speak');
      iosFallbackSpeak(spoken, () => { applyState('idle'); });
      if (result.extractedData && ['passport', 'license'].includes(result.type)) {
        const data = result.extractedData;
        const name = (data['name'] as string) || '';
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
      handleScan();
      scanIntervalRef.current = setInterval(() => { if (stateRef.current === 'idle') handleScan(); }, 6000);
    } else {
      if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    }
    return () => { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, liveVision, started]);

  // ── Send text ──────────────────────────────────────────────────
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

  // ── Mic amplitude ──────────────────────────────────────────────
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

  // ── Speech recognition loop ────────────────────────────────────
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

  // ── Canvas sphere ──────────────────────────────────────────────
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

    function draw(_ts: number) {
      if (!ctx || !canvas) return;
      if (analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        ampRef.current = Math.min(avg / 80, 1);
      } else { ampRef.current *= 0.9; }

      const s = stateRef.current;
      const speed = SPEED[s];
      const amp = ampRef.current;
      const pulse = s === 'speak' ? 0.06 + amp * 0.12 : s === 'listen' ? 0.04 + amp * 0.14 : 0.0;
      rotYRef.current += speed + amp * 0.01;
      rotXRef.current += speed * 0.4;

      const W = canvas.width; const H = canvas.height;
      const R = Math.min(W, H) * 0.30 * (1 + pulse);
      const CX = W / 2; const CY = H / 2;
      const col = COLORS[s];
      ctx.clearRect(0, 0, W, H);

      const proj = BASE_PARTICLES.map(p => {
        const r1 = rotateY(p, rotYRef.current);
        const r2 = rotateX(r1, rotXRef.current);
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
        const alpha = 0.5 + p.depth * 0.5;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `${col.dot}${alpha.toFixed(2)})`;
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
        const nRays = 8;
        for (let i = 0; i < nRays; i++) {
          const angle = (i / nRays) * Math.PI * 2 + rotYRef.current * 0.5;
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
      onResponse: (_t, _f) => {},
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
      setAnalyzing(false);
      const prompt = 'Photo reçue. Posez votre question à voix haute.';
      setResponseText(prompt); setShowResponse(true); applyState('speak');
      iosFallbackSpeak(prompt, () => { applyState('idle'); if (loopActive.current) startListeningInner(); });
    } catch {
      setAnalyzing(false);
      showError('Impossible de lire la photo');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyState, showError]);

  const handleToolRequest = useCallback((tool: string) => {
    // Activate listening and pre-fill with tool request
    if (!started) { void handleTap(); return; }
    void sendText(`${tool.toLowerCase()} — montre-moi les données`);
    setActiveTab('home');
  }, [started, handleTap, sendText]);

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

  // ── Derived display values ─────────────────────────────────────
  const isHomeOrVoice = activeTab === 'home' || activeTab === 'voice';
  const listenValue = state === 'listen' ? 95 : state === 'speak' ? 82 : 60;

  // ── Nav tab switch ─────────────────────────────────────────────
  const handleNav = useCallback((tab: ActiveTab) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tab === 'voice') {
      // Voice tab: just activate listening + go home
      setActiveTab('home');
      void handleTap();
    } else if (tab === 'camera') {
      setActiveTab('camera');
    } else {
      setActiveTab(tab);
    }
  }, [handleTap]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="dz-root" data-state={state} data-tab={activeTab}>

      {/* Background layers */}
      <div className="dz-grid" aria-hidden />
      <div className="dz-vignette" aria-hidden />

      {/* ── Top status bar ── */}
      <div className="dz-topbar">
        <div className="dz-badge dz-badge--online">
          <div className="dz-badge-dot" />
          ASSISTANT EN LIGNE
        </div>
        <div className="dz-badge dz-badge--system">
          SYSTÈME ACTIF
          <div className="dz-wave-tiny"><span/><span/><span/><span/></div>
        </div>
        <button className="dz-menu-btn" onClick={handleNav('tools')} aria-label="Menu outils">
          <span/><span/><span/>
        </button>
      </div>

      {/* ── Header ── */}
      <header className="dz-header">
        <h1 className="dz-title">DZARYX</h1>
        <p className="dz-subtitle">FIK CONCIERGERIE · ORAN</p>
      </header>

      {/* ── Main content (switches per tab) ── */}
      <main className="dz-main" onClick={isHomeOrVoice ? handleTap : undefined}>

        {isHomeOrVoice && (
          <div className="dz-home-content">
            {/* HUD Module */}
            <div className="dz-hud-module">
              <div className="dz-hud-corner-tr" aria-hidden />
              <div className="dz-hud-corner-bl" aria-hidden />

              {/* Module header */}
              <div className="dz-module-header">
                <span className="dz-module-title">{MODULE_TITLE[state]}</span>
                <WaveMini />
              </div>

              {/* Mic + sphere + waveforms */}
              <div className="dz-mic-area">
                <canvas ref={canvasRef} className="dz-sphere-canvas" aria-hidden />
                <WaveForm />
                <div className="dz-mic-circle">
                  <div className="dz-mic-ring dz-mic-ring--1" aria-hidden />
                  <div className="dz-mic-ring dz-mic-ring--2" aria-hidden />
                  <div className="dz-mic-ring dz-mic-ring--3" aria-hidden />
                  <button
                    className="dz-mic-btn"
                    onClick={handleVoiceBtn}
                    aria-label={started ? (state === 'listen' ? 'Arrêter écoute' : 'Activer écoute') : 'Démarrer Dzaryx'}
                  >
                    <MicSVG />
                  </button>
                </div>
                <WaveFormRight />

                {/* Floating response text */}
                <div className={`dz-response${showResponse ? ' visible' : ''}`} aria-live="polite">
                  {responseText}
                </div>
              </div>

              {/* Module footer: state label + indicators */}
              <div className="dz-module-footer">
                <div className="dz-state-main-text">
                  {started ? STATE_LABEL[state] : 'Appuyer pour démarrer'}
                </div>
                <div className="dz-state-caption">Je comprends en temps réel.</div>
                <div className="dz-indicators">
                  <div className={`dz-indicator dz-indicator--listen${state === 'listen' ? ' dz-indicator--active' : ''}`}>
                    <div className="dz-indicator-dot" />
                    VOIX DÉTECTÉE
                  </div>
                  <div className={`dz-indicator dz-indicator--think${state === 'think' ? ' dz-indicator--active' : ''}`}>
                    <div className="dz-indicator-dot" />
                    TRAITEMENT
                  </div>
                  <div className={`dz-indicator dz-indicator--speak${state === 'speak' ? ' dz-indicator--active' : ''}`}>
                    <div className="dz-indicator-dot" />
                    RÉPONSE PRÊTE
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="dz-actions" onClick={stopProp}>
              <button
                className={`dz-btn dz-btn--primary${state === 'listen' ? ' active' : ''}`}
                onClick={handleVoiceBtn}
                aria-label="Parler maintenant"
              >
                <span className="dz-btn-icon">🎤</span>
                <span className="dz-btn-body">
                  <span className="dz-btn-label">PARLER MAINTENANT</span>
                  <span className="dz-btn-sub">Maintenez pour parler</span>
                </span>
              </button>
              <button
                className="dz-btn dz-btn--secondary"
                onClick={handleNav('telegram')}
                aria-label="Chat Telegram"
              >
                <span className="dz-btn-icon">✈️</span>
                <span className="dz-btn-body">
                  <span className="dz-btn-label">CHAT TELEGRAM</span>
                  <span className="dz-btn-sub">Écrire sur Telegram</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'camera' && (
          <CameraPanel
            liveVision={liveVision}
            scanning={scanning}
            scanMode={scanMode}
            scanResult={scanResult}
            analyzing={analyzing}
            pendingPhoto={pendingPhotoRef.current !== null}
            onLiveCamera={startLiveCamera}
            onScan={(e) => { e.stopPropagation(); void handleScan(); }}
            onToggleScanMode={toggleScanMode}
            onPhotoLabel={stopProp}
            liveVideoRef={liveVideoRef}
            cameraInputRef={cameraInputRef}
            onPhotoChange={handlePhotoChange}
          />
        )}

        {activeTab === 'telegram' && <TelegramPanel />}

        {activeTab === 'tools' && (
          <ToolsPanel onRequest={handleToolRequest} />
        )}

        {activeTab === 'profile' && (
          <ProfilePanel sessionId={sessionId} />
        )}
      </main>

      {/* ── Stat cards (home/voice only) ── */}
      {isHomeOrVoice && (
        <div className="dz-stats">
          <div className="dz-stat-card">
            <div className="dz-stat-lbl">NIVEAU D'ÉCOUTE</div>
            <ProgressRing value={listenValue} />
            <div className="dz-stat-sub">{state === 'listen' ? 'OPTIMAL' : 'ACTIF'}</div>
          </div>
          <div className="dz-stat-card">
            <div className="dz-stat-lbl">COMPRÉHENSION</div>
            <div className="dz-brain-wrap">🧠</div>
            <div className="dz-stat-sub">TEMPS RÉEL</div>
          </div>
          <div className="dz-stat-card">
            <div className="dz-stat-lbl">ACTIVITÉ SYSTÈME</div>
            <MiniGraph active={state !== 'idle'} />
            <div className="dz-stat-sub">{state === 'idle' ? 'STABLE' : 'ACTIF'}</div>
          </div>
        </div>
      )}

      {/* ── Status strip ── */}
      <div className="dz-status-strip">
        <div className="dz-status-item">
          <div className="dz-status-dot dz-status-dot--on" />
          <div>
            <span className="dz-status-lbl">ORAN, DZ</span>
            <span className="dz-status-detail">GPS ACTIF</span>
          </div>
        </div>
        <div className="dz-status-item">
          <div className="dz-status-dot dz-status-dot--on" />
          <div>
            <span className="dz-status-lbl">SÉCURISÉ</span>
            <span className="dz-status-detail">AES-256</span>
          </div>
        </div>
        <div className="dz-status-item">
          <div className={`dz-status-dot dz-status-dot--on`} />
          <div>
            <span className="dz-status-lbl">TELEGRAM</span>
            <span className="dz-status-detail">CONNECTÉ</span>
          </div>
        </div>
      </div>

      {/* ── Bottom navbar ── */}
      <nav className="dz-navbar" onClick={stopProp}>
        <button className={`dz-nav-item${activeTab === 'home' ? ' active' : ''}`} onClick={handleNav('home')} aria-label="Accueil">
          <span className="dz-nav-icon">⌂</span>
          <span className="dz-nav-label">ACCUEIL</span>
        </button>
        <button className={`dz-nav-item${activeTab === 'telegram' ? ' active' : ''}`} onClick={handleNav('telegram')} aria-label="Telegram">
          <span className="dz-nav-icon">✈️</span>
          <span className="dz-nav-label">TELEGRAM</span>
        </button>
        <button
          className={`dz-nav-item dz-nav-item--voice${(activeTab === 'voice' || activeTab === 'home') && state === 'listen' ? ' active' : ''}`}
          onClick={handleNav('voice')}
          aria-label="Activer la voix"
        >
          <span className="dz-nav-voice-btn">🎤</span>
          <span className="dz-nav-label">VOICE</span>
        </button>
        <button className={`dz-nav-item${activeTab === 'camera' ? ' active' : ''}`} onClick={handleNav('camera')} aria-label="Caméra">
          <span className="dz-nav-icon">◉</span>
          <span className="dz-nav-label">CAMÉRA</span>
        </button>
        <button className={`dz-nav-item${activeTab === 'tools' ? ' active' : ''}`} onClick={handleNav('tools')} aria-label="Outils">
          <span className="dz-nav-icon">⊞</span>
          <span className="dz-nav-label">OUTILS</span>
        </button>
        <button className={`dz-nav-item${activeTab === 'profile' ? ' active' : ''}`} onClick={handleNav('profile')} aria-label="Profil">
          <span className="dz-nav-icon">◯</span>
          <span className="dz-nav-label">PROFIL</span>
        </button>
      </nav>

      {/* ── Error toast ── */}
      <div className={`dz-toast${errorVisible ? ' show' : ''}`} role="alert">{errorMsg}</div>
    </div>
  );
}
