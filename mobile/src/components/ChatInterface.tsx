import './ChatInterface.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket,
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
  listen: 'J\'ÉCOUTE',
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

// ── Neural Brain Canvas ───────────────────────
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number; opacity: number;
}

function BrainCanvas({ state }: { state: JarvisState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const rotationRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const CX = W / 2;
    const CY = H / 2;
    const R = Math.min(W, H) * 0.38;

    // Generate brain-shaped particles using spherical coordinates with noise
    const N = 320;
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      // Brain deformation: flatten top, add lobes
      const lobeNoise = 1 + 0.18 * Math.sin(theta * 2) * Math.sin(phi * 2);
      const r = R * lobeNoise * (0.7 + Math.random() * 0.3);
      particles.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi) * 0.85, // flatten vertically
        z: r * Math.sin(phi) * Math.sin(theta),
        vx: (Math.random() - 0.5) * 0.003,
        vy: (Math.random() - 0.5) * 0.003,
        vz: (Math.random() - 0.5) * 0.003,
        size: 1.5 + Math.random() * 2,
        opacity: 0.4 + Math.random() * 0.6,
      });
    }
    particlesRef.current = particles;

    const getColor = (s: JarvisState) => {
      if (s === 'listen') return { r: 100, g: 220, b: 100 };
      if (s === 'think')  return { r: 30,  g: 200, b: 255 };
      if (s === 'speak')  return { r: 201, g: 162, b: 39  };
      return { r: 0, g: 220, b: 255 };
    };

    let currentState = state;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      rotationRef.current += 0.003;
      const rot = rotationRef.current;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const col = getColor(currentState);
      const pts: Array<{ sx: number; sy: number; depth: number; p: Particle }> = [];

      // Project 3D → 2D with Y-axis rotation
      for (const p of particlesRef.current) {
        const x3 = p.x * cosR - p.z * sinR;
        const z3 = p.x * sinR + p.z * cosR;
        const depth = (z3 + R) / (2 * R); // 0..1
        const scale = 0.6 + depth * 0.4;
        pts.push({
          sx: CX + x3 * scale,
          sy: CY + p.y * scale,
          depth,
          p,
        });
      }

      // Sort by depth (back to front)
      pts.sort((a, b) => a.depth - b.depth);

      // Draw connections
      const maxDist = 72;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].sx - pts[j].sx;
          const dy = pts[i].sy - pts[j].sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.35 * pts[i].depth * pts[j].depth;
            ctx.beginPath();
            ctx.moveTo(pts[i].sx, pts[i].sy);
            ctx.lineTo(pts[j].sx, pts[j].sy);
            ctx.strokeStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const { sx, sy, depth, p } of pts) {
        const alpha = p.opacity * (0.4 + depth * 0.6);
        const size  = p.size * (0.5 + depth * 0.7);
        // Glow
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 4);
        grad.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${alpha})`);
        grad.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
        ctx.beginPath();
        ctx.arc(sx, sy, size * 4, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // Core dot
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col.r},${col.g},${col.b},${alpha})`;
        ctx.fill();
      }

      // Central starburst
      const flareAlpha = currentState === 'speak' ? 0.9 : currentState === 'listen' ? 0.7 : 0.6;
      const flareGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, 40);
      flareGrad.addColorStop(0,    `rgba(255,255,255,${flareAlpha})`);
      flareGrad.addColorStop(0.15, `rgba(${col.r},${col.g},${col.b},${flareAlpha * 0.8})`);
      flareGrad.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(CX, CY, 40, 0, Math.PI * 2);
      ctx.fillStyle = flareGrad;
      ctx.fill();

      // Star rays
      const rays = 8;
      const rayLen = currentState === 'speak' ? 55 : 40;
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(rotationRef.current * 0.5);
      for (let r = 0; r < rays; r++) {
        const angle = (r / rays) * Math.PI * 2;
        const grad2 = ctx.createLinearGradient(0, 0, Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
        grad2.addColorStop(0, `rgba(255,255,255,${flareAlpha * 0.7})`);
        grad2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * rayLen, Math.sin(angle) * rayLen);
        ctx.strokeStyle = grad2;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      animRef.current = requestAnimationFrame(draw);
    };

    // Allow state updates inside the animation loop
    (canvasRef.current as HTMLCanvasElement & { _setState?: (s: JarvisState) => void })._setState = (s: JarvisState) => {
      currentState = s;
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update color when state changes
  useEffect(() => {
    const c = canvasRef.current as (HTMLCanvasElement & { _setState?: (s: JarvisState) => void }) | null;
    c?._setState?.(state);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      className="brain-canvas"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

const WAVE_N = 18;

export default function ChatInterface() {
  const [state,        setState]       = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse, setShowResponse] = useState(false);
  const [utcTime,      setUtcTime]     = useState('--:--:--');
  const [errorMsg,     setErrorMsg]    = useState('');
  const [errorVisible, setErrorVisible]= useState(false);
  const [started,      setStarted]     = useState(false);

  const stateRef   = useRef<JarvisState>('idle');
  const sending    = useRef(false);
  const sessionId  = getOrCreateSessionId();
  const recRef     = useRef<SRL | null>(null);
  const loopActive = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceivedRef = useRef(false);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);
    elevenlabsReceivedRef.current = false;
    try {
      await api.chat(msg, sessionId, false);
    } catch {
      showError('Erreur de connexion');
      applyState('idle');
    } finally {
      sending.current = false;
    }
  }, [sessionId, applyState, showError]);

  const startListening = useCallback(() => {
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
    if (!SR) { showError('Micro non supporté sur ce navigateur'); applyState('idle'); return; }

    try {
      const rec = new SR();
      rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
      recRef.current = rec;
      rec.onresult = (e: SREvent) => {
        const transcript = e.results[0]?.[0]?.transcript ?? '';
        recRef.current = null;
        if (transcript.trim()) { void sendText(transcript.trim()); }
        else { applyState('idle'); scheduleNextListen(); }
      };
      rec.onerror = () => { recRef.current = null; applyState('idle'); scheduleNextListen(); };
      rec.onend   = () => { if (stateRef.current === 'listen') { applyState('idle'); scheduleNextListen(); } };
      rec.start();
    } catch { applyState('idle'); scheduleNextListen(); }
  }, [applyState, sendText, showError]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleNextListen = useCallback(() => {
    if (!loopActive.current) return;
    setTimeout(() => { if (loopActive.current && stateRef.current === 'idle') startListening(); }, 1200);
  }, [startListening]);

  useEffect(() => {
    const socket = connectSocket(sessionId, {
      onStatus: (s) => {
        if (s === 'thinking') { setResponseText(''); setShowResponse(false); }
        if (s === 'idle' && (isAudioPlaying() || window.speechSynthesis?.speaking)) return;
        applyState(toJarvis(s));
      },
      onAudio: (b64) => {
        elevenlabsReceivedRef.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); clearAudioQueue(); playBase64Audio(b64); applyState('speak');
      },
      onAudioChunk: (b64) => {
        elevenlabsReceivedRef.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel(); enqueueAudioChunk(b64); applyState('speak');
      },
      onTextChunk: (chunk) => { setResponseText(prev => prev + chunk); setShowResponse(true); },
      onTextComplete: (text) => {
        setResponseText(text); setShowResponse(true); void flushAudioChunks();
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        if (!elevenlabsReceivedRef.current) {
          audioFallbackTimer.current = setTimeout(() => {
            audioFallbackTimer.current = null;
            if (!isAudioPlaying()) {
              applyState('speak');
              iosFallbackSpeak(text, () => { applyState('idle'); scheduleNextListen(); });
            }
          }, 1500);
        }
        elevenlabsReceivedRef.current = false;
      },
      onResponse: (_text, _fallback) => {},
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
    return () => { socket.disconnect(); window.removeEventListener('ibrahim:audioEnded', onAudioEnded); };
  }, [sessionId, applyState, scheduleNextListen]);

  const handleOrbTap = useCallback(() => {
    if (started) {
      if (stateRef.current === 'listen') { recRef.current?.stop(); applyState('idle'); }
      else if (stateRef.current === 'idle') { startListening(); }
      return;
    }
    setStarted(true);
    loopActive.current = true;
    unlockAudio();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bonjour Kouider' : hour < 18 ? 'Bon après-midi Kouider' : 'Bonsoir Kouider';
    const greetText = `${greeting}, Ibrahim est prêt. Je vous écoute.`;
    applyState('speak');
    setResponseText(greetText);
    setShowResponse(true);
    iosFallbackSpeak(greetText);
    setTimeout(() => { applyState('idle'); scheduleNextListen(); }, Math.max(2500, greetText.length * 65));
  }, [started, applyState, startListening, scheduleNextListen]);

  useEffect(() => {
    return () => {
      loopActive.current = false;
      recRef.current?.stop();
      if (audioFallbackTimer.current) clearTimeout(audioFallbackTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => {
        if (stateRef.current === 'idle' && loopActive.current) startListening();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListening, started]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setUtcTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="jarvis" data-state={state}>
      {/* Ambient background */}
      <div className="jarvis-bg" />

      {/* Neural Brain Canvas — full screen */}
      <div className="brain-wrapper">
        <BrainCanvas state={state} />
      </div>

      {/* Corner accents */}
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />

      {/* Header */}
      <header className="jarvis-header">
        <div>
          <div className="jarvis-title">IBRAHIM</div>
          <div className="jarvis-subtitle">FIK CONCIERGERIE · ORAN</div>
        </div>
        <div className="jarvis-status-badge">
          <div className="jarvis-online">EN LIGNE · KOUIDER</div>
          <div className="jarvis-state-label">{CAPTION[state]}</div>
        </div>
      </header>

      {/* Tap zone — centered over brain */}
      <div className="jarvis-center">
        <div className="orb-tap" onClick={handleOrbTap}>
          {!started && (
            <div className="start-hint">
              <span className="start-icon">▶</span>
              <span className="start-label">APPUYER POUR DÉMARRER</span>
            </div>
          )}
        </div>
        <div className="jarvis-caption">
          <div className="jarvis-caption-text">{started ? CAPTION[state] : ''}</div>
        </div>
      </div>

      {/* Response text */}
      <div className={`jarvis-response${showResponse ? ' visible' : ''}`}>
        <div className="jarvis-response-text">{responseText}</div>
      </div>

      {/* Footer */}
      <footer className="jarvis-footer">
        <div className="jarvis-readout">
          <div className="readout-line">NODE · <span>IBR-01</span></div>
          <div className="readout-line">LOC · <span>ORAN · DZ</span></div>
          <div className="readout-line">UTC · <span>{utcTime}</span></div>
        </div>

        <div className="jarvis-wave">
          {Array.from({ length: WAVE_N }, (_, i) => (
            <i
              key={i}
              style={{
                ['--dur' as string]: `${(0.5 + (i % 5) * 0.12).toFixed(2)}s`,
                ['--del' as string]: `${((-(Math.sin(i * 0.7) * 0.5 + 0.5)) * 0.8).toFixed(2)}s`,
                ['--h'   as string]: `${8 + Math.round(Math.abs(Math.sin(i * 0.9)) * 18)}px`,
              }}
            />
          ))}
        </div>

        <div className="jarvis-readout" style={{ alignItems: 'flex-end' }}>
          <div className="readout-line">MODE · <span>NEURAL</span></div>
          <div className="readout-line">VER · <span>3.0</span></div>
          <div className="readout-line">SYS · <span>ACTIF</span></div>
        </div>
      </footer>

      {/* Error toast */}
      <div className={`jarvis-error${errorVisible ? ' show' : ''}`}>{errorMsg}</div>
    </div>
  );
}
