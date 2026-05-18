import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, stopAudio, unlockAudio,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props {
  onNavigateText: () => void;
  onWsStatus: (ok: boolean) => void;
}

const STATE_COLOR: Record<DzaryxStatus, string> = {
  idle:      '#00d4ff',
  listening: '#ff3366',
  thinking:  '#9b59b6',
  speaking:  '#00e676',
};

const STATE_LABEL: Record<DzaryxStatus, string> = {
  idle:      'EN ATTENTE',
  listening: 'ÉCOUTE',
  thinking:  'RÉFLEXION',
  speaking:  'PARLE',
};

const SPEECH_RMS    = 0.008; // RMS above this = speech (0-1 scale)
const SILENCE_RMS   = 0.004; // RMS below this = silence
const SILENCE_DELAY = 1500;  // ms of silence to stop recording
const MIN_SPEECH_MS = 250;   // minimum speech duration

export default function VoiceScreen({ onNavigateText, onWsStatus }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const animRef        = useRef<number>(0);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const speechStartRef = useRef<number>(0);
  const isSpeechRef    = useRef(false);
  const isRecordingRef = useRef(false);
  const sessionId      = useRef(getOrCreateSessionId());

  const [status, setStatus]   = useState<DzaryxStatus>('idle');
  const [toolLabel, setLabel] = useState<string | null>(null);
  const [response, setResp]   = useState('');
  const [respStream, setStream] = useState('');
  const [micErr, setMicErr]   = useState(false);
  const [wsConn, setWsConn]   = useState(false);
  const [visionActive, setVision] = useState(false);
  const [particles]            = useState(() => makeParticles(25));
  const [hudMsg, setHud]       = useState('SYSTÈME DZARYX INITIALISÉ');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const statusRef = useRef(status);
  statusRef.current = status;

  // ── Socket.IO ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const sock = connectSocket(sessionId.current, {
      onStatus:        (s, l) => { setStatus(s); setLabel(l ?? null); },
      onAudio:         b64 => playBase64Audio(b64),
      onAudioChunk:    b64 => enqueueChunk(b64),
      onAudioComplete: ()  => flushChunks(),
      onTextChunk:     c   => setStream(s => s + c),
      onTextComplete:  t   => { setResp(t); setStream(''); },
      onResponse:      (t, _fb) => { setResp(t); setStream(''); },
      onProactive:     t   => { setHud(t); setResp(t); },
    });
    sock.on('connect',    () => { setWsConn(true);  onWsStatus(true); });
    sock.on('disconnect', () => { setWsConn(false); onWsStatus(false); });
    return () => disconnectSocket();
  }, [onWsStatus]);

  // ── Microphone + VAD ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function initMic() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source   = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Unlock playback AudioContext while we have user gesture context
        unlockAudio();

        startVAD();
        drawCanvas();
        setHud('MICROPHONE ACTIF — PARLE-MOI');
      } catch {
        setMicErr(true);
        setHud('MICRO INACCESSIBLE — MODE DÉGRADÉ');
        drawCanvas(); // still draw idle animation
      }
    }

    initMic();

    return () => {
      alive = false;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── VAD loop (RMS-based, much more reliable than freq average) ─────────────
  function startVAD() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const timeBuf = new Uint8Array(analyser.fftSize);
    const a = analyser;

    function tick() {
      if (statusRef.current === 'speaking' || statusRef.current === 'thinking') {
        requestAnimationFrame(tick);
        return;
      }

      // RMS from time domain — much more sensitive than freq average
      a.getByteTimeDomainData(timeBuf);
      let sq = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i]! - 128) / 128;
        sq += v * v;
      }
      const rms = Math.sqrt(sq / timeBuf.length);

      if (rms > SPEECH_RMS) {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (!isSpeechRef.current) {
          isSpeechRef.current = true;
          speechStartRef.current = Date.now();
        }
        if (!isRecordingRef.current) startRecording();
      } else if (rms < SILENCE_RMS && isSpeechRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          const dur = Date.now() - speechStartRef.current;
          if (dur > MIN_SPEECH_MS) {
            stopRecordingAndProcess();
          } else {
            resetVAD();
          }
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
  }

  async function stopRecordingAndProcess() {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') { resetVAD(); return; }

    await new Promise<void>(r => {
      rec.onstop = () => r();
      rec.stop();
    });
    recorderRef.current = null;
    resetVAD();

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    if (blob.size < 500) return; // too small, noise

    setStatus('thinking');
    setHud('TRANSCRIPTION EN COURS...');

    try {
      const b64 = await blobToBase64(blob);
      const { text } = await api.transcribe(b64, 'audio/webm');
      if (!text?.trim()) { setStatus('idle'); setHud('PARLE-MOI'); return; }

      setHud(`"${text}"`);
      const res = await api.chat(text, sessionId.current);
      if (res.text) {
        setResp(res.text);
        setHud(res.text.slice(0, 80) + (res.text.length > 80 ? '…' : ''));
        if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
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
    if (statusRef.current !== 'speaking' && statusRef.current !== 'thinking') {
      setStatus('idle');
    }
  }

  // ── Canvas visualizer ────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas  = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    function frame(t: number) {
      animRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      // Dark background
      ctx.fillStyle = '#03050f';
      ctx.fillRect(0, 0, W, H);

      // Get audio data
      let rms = 0;
      const analyser = analyserRef.current;
      if (analyser) {
        const buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let sq = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i]! - 128) / 128; sq += v * v; }
        rms = Math.sqrt(sq / buf.length);
      }

      const pulse = Math.sin(t * 0.002) * 0.5 + 0.5; // 0→1 idle animation
      const amp   = Math.max(rms * 3, pulse * 0.12);  // combine real + idle

      const col = STATE_COLOR[statusRef.current];

      // Scanlines
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(0, y, W, 2);
      }

      // Outer glow rings (3 rings)
      const rings = [0.75, 0.55, 0.35];
      rings.forEach((factor, i) => {
        const base = Math.min(cx, cy) * factor;
        const r = base + amp * 18 * (3 - i) / 3;
        const alpha = (0.6 - i * 0.15) * (0.5 + amp * 0.5);

        // Hex ring for outer
        if (i === 0) {
          drawHexRing(ctx, cx, cy, r, col, alpha * 0.6, t + i * 1000);
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(col, alpha);
        ctx.lineWidth = 1.5 - i * 0.3;
        ctx.stroke();
      });

      // Rotating dashed ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.0008);
      const dashR = Math.min(cx, cy) * 0.88;
      ctx.beginPath();
      ctx.arc(0, 0, dashR, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(col, 0.15 + amp * 0.1);
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Counter-rotating dashed ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-t * 0.0005);
      const dashR2 = Math.min(cx, cy) * 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, dashR2, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(col, 0.1 + amp * 0.08);
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 18]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Center orb glow
      const orbR = 30 + amp * 20;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 2);
      grad.addColorStop(0, hexToRgba(col, 0.7 + amp * 0.3));
      grad.addColorStop(0.3, hexToRgba(col, 0.3 + amp * 0.2));
      grad.addColorStop(1, hexToRgba(col, 0));
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 2, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(col, 0.9 + amp * 0.1);
      ctx.fill();

      // Data bars (bottom)
      if (rms > 0.006 && statusRef.current === 'listening') {
        const analyser = analyserRef.current!;
        const freqBuf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqBuf);
        const barCount = 40;
        const barW = W / barCount - 2;
        const barMaxH = 40;
        for (let i = 0; i < barCount; i++) {
          const freq = freqBuf[Math.floor(i * freqBuf.length / barCount)] ?? 0;
          const barH = (freq / 255) * barMaxH;
          const alpha = 0.4 + (freq / 255) * 0.4;
          ctx.fillStyle = hexToRgba(col, alpha);
          ctx.fillRect(
            i * (barW + 2) + 1,
            H - barH - 8,
            barW,
            barH,
          );
        }
      }

      // Particles
      particles.forEach((p, idx) => {
        p.y -= p.vy * (1 + amp * 2);
        p.x += Math.sin(t * 0.001 + idx) * 0.3;
        p.life -= 0.003;
        if (p.life <= 0) {
          p.x = Math.random() * W;
          p.y = H + 10;
          p.life = 0.5 + Math.random() * 0.5;
          p.vy = 0.3 + Math.random() * 0.5;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(col, p.life * 0.6);
        ctx.fill();
      });
    }

    frame(0);
  }, [particles]);

  // ── Vision ──────────────────────────────────────────────────────────────────
  async function handleVision() {
    setVision(true);
    setHud('ACTIVATION VISION...');
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
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
  const displayText = respStream || response;

  return (
    <div
      className="scanlines"
      onClick={() => { unlockAudio(); if (!audioUnlocked) setAudioUnlocked(true); }}
      style={{
        width: '100%', height: '100%',
        background: 'linear-gradient(180deg, #03050f 0%, #000 100%)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Canvas visualizer — full screen */}
      <canvas
        ref={canvasRef}
        width={347}
        height={704}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* Audio unlock overlay — Chrome autoplay policy */}
      {!audioUnlocked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          cursor: 'pointer',
        }}>
          <div style={{
            border: '1.5px solid #00d4ff66', borderRadius: 16,
            padding: '20px 28px', textAlign: 'center',
            background: 'rgba(0,10,20,0.9)',
            boxShadow: '0 0 30px #00d4ff22',
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔊</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00d4ff', letterSpacing: '0.25em', marginBottom: 6 }}>
              APPUYER POUR ACTIVER
            </div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#ffffff44', letterSpacing: '0.1em' }}>
              AUDIO + MICRO
            </div>
          </div>
        </div>
      )}

      {/* State indicator — top */}
      <div style={{
        position: 'absolute', top: 12, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        zIndex: 5,
      }}>
        <span style={{
          fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700,
          color: col, letterSpacing: '0.35em',
          textShadow: `0 0 10px ${col}`,
        }}>
          {STATE_LABEL[status]}{toolLabel ? ` — ${toolLabel}` : ''}
        </span>
        <div style={{
          width: 80, height: 1,
          background: `linear-gradient(90deg, transparent, ${col}, transparent)`,
        }} />
      </div>

      {/* Connection indicator */}
      {!wsConn && (
        <div style={{
          position: 'absolute', top: 46, right: 12, zIndex: 6,
          fontFamily: 'Share Tech Mono', fontSize: 8, color: '#ff336699',
          letterSpacing: '0.1em',
        }}>NO SIGNAL</div>
      )}

      {/* HUD text — scrolling top */}
      <div style={{
        position: 'absolute', top: 54, left: 12, right: 12, zIndex: 5,
        fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff44',
        letterSpacing: '0.15em', textAlign: 'center',
        overflow: 'hidden', whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}>
        {hudMsg}
      </div>

      {/* Response text — center bottom area */}
      {displayText && (
        <div
          className="fade-in"
          style={{
            position: 'absolute', bottom: 80, left: 16, right: 16, zIndex: 5,
            background: 'rgba(0,3,12,0.85)', borderRadius: 12,
            border: `1px solid ${col}33`,
            padding: '10px 14px',
            maxHeight: 180, overflow: 'hidden',
          }}
        >
          <p style={{
            fontFamily: 'Exo 2', fontSize: 11, color: col,
            lineHeight: 1.6, margin: 0,
            textShadow: `0 0 8px ${col}44`,
          }}>
            {displayText}
          </p>
        </div>
      )}

      {/* Bottom controls */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0, zIndex: 5,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 24px',
      }}>
        {/* Vision button */}
        <button
          onClick={handleVision}
          disabled={visionActive}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            border: `1.5px solid ${visionActive ? '#9b59b6' : '#00d4ff55'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: visionActive ? '0 0 15px #9b59b688' : '0 0 8px #00d4ff22',
            transition: 'all 0.2s ease',
          }}
          title="Vision IA"
        >
          <EyeIcon active={visionActive} />
        </button>

        {/* Mic status */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: micErr ? '#ff3366' : col,
            boxShadow: `0 0 6px ${micErr ? '#ff3366' : col}`,
          }} />
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#ffffff33', letterSpacing: '0.1em' }}>
            {micErr ? 'MIC ERR' : 'VAD ON'}
          </span>
        </div>

        {/* Text button */}
        <button
          onClick={onNavigateText}
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'rgba(0,0,0,0.7)',
            border: '1.5px solid #ff6b0055',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 8px #ff6b0022',
          }}
          title="Clavier"
        >
          <KeyboardIcon />
        </button>
      </div>

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} pos={p} col={col} />)}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function drawHexRing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  col: string, alpha: number, t: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.0003);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = hexToRgba(col, alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeParticles(n: number) {
  return Array.from({ length: n }, () => ({
    x: Math.random() * 400,
    y: Math.random() * 700,
    r: 0.5 + Math.random() * 1.5,
    vy: 0.3 + Math.random() * 0.5,
    life: Math.random(),
  }));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      res(dataUrl.split(',')[1]!);
    };
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      res(dataUrl.split(',')[1]!);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function Corner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const s = 14, t = 1.5;
  const bT = pos.startsWith('t') ? `${t}px solid ${col}88` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}88` : 'none';
  const bL = pos.endsWith('l')  ? `${t}px solid ${col}88` : 'none';
  const bR = pos.endsWith('r')  ? `${t}px solid ${col}88` : 'none';
  const h  = pos.endsWith('l') ? { left: 6 } : { right: 6 };
  const v  = pos.startsWith('t') ? { top: 6 } : { bottom: 6 };
  return (
    <div style={{
      position: 'absolute', zIndex: 4,
      width: s, height: s,
      borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR,
      ...h, ...v,
    }} />
  );
}

function EyeIcon({ active }: { active: boolean }) {
  const c = active ? '#9b59b6' : '#00d4ffaa';
  return (
    <svg width="18" height="14" viewBox="0 0 24 18" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9C4 3.5 8 1 12 1s8 2.5 11 8c-3 5.5-7 8-11 8S4 14.5 1 9z" />
      <circle cx="12" cy="9" r="3.5" fill={active ? '#9b59b622' : 'none'} />
      {active && <circle cx="12" cy="9" r="1.5" fill={c} />}
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 24 18" fill="none" stroke="#ff6b00aa" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="1" width="22" height="16" rx="2" />
      <line x1="5"  y1="6"  x2="5"  y2="6"  strokeWidth="2" />
      <line x1="9"  y1="6"  x2="9"  y2="6"  strokeWidth="2" />
      <line x1="13" y1="6"  x2="13" y2="6"  strokeWidth="2" />
      <line x1="17" y1="6"  x2="17" y2="6"  strokeWidth="2" />
      <line x1="5"  y1="11" x2="5"  y2="11" strokeWidth="2" />
      <line x1="9"  y1="11" x2="9"  y2="11" strokeWidth="2" />
      <line x1="13" y1="11" x2="13" y2="11" strokeWidth="2" />
      <line x1="17" y1="11" x2="17" y2="11" strokeWidth="2" />
      <line x1="7"  y1="15" x2="17" y2="15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
