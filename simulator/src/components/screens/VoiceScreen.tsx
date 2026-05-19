import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props {
  onNavigateText: () => void;
  onWsStatus: (ok: boolean) => void;
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

const SPEECH_RMS    = 0.004;
const SILENCE_RMS   = 0.008;
const SILENCE_DELAY = 1000;
const MIN_SPEECH_MS = 200;
const MAX_REC_MS    = 8000;

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
  const [particles]             = useState(() => makeParticles(25));
  const [hudMsg, setHud]        = useState('SYSTÈME DZARYX INITIALISÉ');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [rmsLevel, setRmsLevel] = useState(0);
  const rmsRef = useRef(0);

  const statusRef = useRef(status);
  statusRef.current = status;

  // ── Socket.IO ──────────────────────────────────────────────────────────────
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
      audioCtxRef.current?.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ── VAD ─────────────────────────────────────────────────────────────────────
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
    if (statusRef.current !== 'speaking' && statusRef.current !== 'thinking') setStatus('idle');
  }

  // ── Canvas — background particles + ambient rings ──────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    function frame(t: number) {
      animRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#020510';
      ctx.fillRect(0, 0, W, H);

      const rms   = rmsRef.current;
      const pulse = Math.sin(t * 0.002) * 0.5 + 0.5;
      const amp   = Math.max(rms * 3, pulse * 0.08);
      const col   = STATE_COLOR[statusRef.current];

      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, y, W, 2);
      }

      [0.92, 0.72, 0.52].forEach((f, i) => {
        const r = Math.min(cx, cy) * f + amp * 10;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(col, (0.07 - i * 0.02) * (0.5 + amp));
        ctx.lineWidth = 0.8;
        ctx.stroke();
      });

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.0006);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(cx, cy) * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(col, 0.06 + amp * 0.04);
      ctx.lineWidth = 0.6;
      ctx.setLineDash([4, 16]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      particles.forEach((p, idx) => {
        p.y -= p.vy * (1 + amp * 1.5);
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
        ctx.fillStyle = hexToRgba(col, p.life * 0.3);
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
      style={{ width: '100%', height: '100%', background: '#020510', position: 'relative', overflow: 'hidden' }}
    >
      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        width={347} height={704}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* ── HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
        padding: '12px 16px 8px',
        background: 'linear-gradient(180deg, rgba(2,5,16,0.96) 0%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          {/* Connection badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: wsConn ? '#00e676' : '#ff3366',
              boxShadow: `0 0 6px ${wsConn ? '#00e676' : '#ff3366'}`,
              animation: 'statusPulse 2s ease infinite',
            }} />
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: wsConn ? '#00e67699' : '#ff336699', letterSpacing: '0.12em' }}>
              {wsConn ? 'CONNECTÉ' : 'HORS LIGNE'}
            </span>
          </div>

          {/* DZARYX title */}
          <div style={{
            fontFamily: 'Orbitron', fontSize: 16, fontWeight: 900,
            color: '#00d4ff', letterSpacing: '0.4em',
            textShadow: '0 0 12px #00d4ff, 0 0 24px #00d4ff44',
          }}>DZARYX</div>

          {/* Mic indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: micErr ? '#ff336677' : '#00d4ff44', letterSpacing: '0.1em' }}>
              {micErr ? 'MIC ERR' : 'VAD'}
            </span>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: micErr ? '#ff3366' : (audioUnlocked ? '#00d4ff' : '#ffffff22'),
              boxShadow: micErr ? '0 0 4px #ff3366' : (audioUnlocked ? '0 0 4px #00d4ff' : 'none'),
            }} />
          </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff55', letterSpacing: '0.2em' }}>
            IA DE FIK CONCIERGERIE · ORAN
          </span>
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${col}66, transparent)` }} />
      </div>

      {/* ── STATUS BADGE ── */}
      <div style={{
        position: 'absolute', top: 80, left: 0, right: 0, zIndex: 6,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 14px', borderRadius: 20,
          border: `1px solid ${col}44`, background: `${col}0d`,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: col, boxShadow: `0 0 6px ${col}`,
            animation: 'statusPulse 1.5s ease infinite',
          }} />
          <span style={{
            fontFamily: 'Orbitron', fontSize: 9, fontWeight: 700,
            color: col, letterSpacing: '0.25em', textShadow: `0 0 8px ${col}`,
          }}>{labelFr}{toolLabel ? ` — ${toolLabel}` : ''}</span>
        </div>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: `${col}55`, letterSpacing: '0.3em' }}>
          {labelEn}
        </span>
      </div>

      {/* RMS bar */}
      {audioUnlocked && (
        <div style={{ position: 'absolute', top: 118, left: 20, right: 20, zIndex: 6, height: 2, background: '#ffffff08', borderRadius: 1 }}>
          <div style={{
            height: '100%', width: `${rmsLevel * 100}%`,
            background: rmsLevel > 0.05 ? '#ff3366' : rmsLevel > 0.01 ? col : '#ffffff0f',
            borderRadius: 1, transition: 'width 0.04s linear',
          }} />
        </div>
      )}

      {/* ── ROBOT ── */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -57%)',
        zIndex: 5,
      }}>
        <DzaryxRobot status={status} />
      </div>

      {/* HUD message */}
      <div style={{
        position: 'absolute', bottom: 162, left: 14, right: 14, zIndex: 6, textAlign: 'center',
      }}>
        <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: `${col}66`, letterSpacing: '0.15em' }}>
          {hudMsg}
        </span>
      </div>

      {/* Response text */}
      {displayText && (
        <div className="fade-in" style={{
          position: 'absolute', bottom: 98, left: 14, right: 14, zIndex: 6,
          background: 'rgba(0,3,12,0.88)', border: `1px solid ${col}33`,
          borderRadius: 8, padding: '8px 12px', maxHeight: 88, overflow: 'hidden',
        }}>
          {(['tl','tr','bl','br'] as const).map(p => <MiniCorner key={p} pos={p} col={col} />)}
          <p style={{
            fontFamily: 'Share Tech Mono', fontSize: 10,
            color: col, lineHeight: 1.55, margin: 0, textShadow: `0 0 6px ${col}44`,
          }}>{displayText}</p>
        </div>
      )}

      {/* ── BOTTOM BUTTONS ── */}
      <div style={{
        position: 'absolute', bottom: 14, left: 0, right: 0, zIndex: 6,
        display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
        padding: '0 12px',
      }}>
        {/* SCAN */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
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
              width: 48, height: 48, borderRadius: 12,
              background: scanActive ? '#0a0515' : 'rgba(0,0,0,0.75)',
              border: `1.5px solid ${scanActive ? '#ffaa00' : '#00d4ff33'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: scanActive ? '0 0 12px #ffaa0066' : '0 0 6px #00d4ff11',
              fontSize: 20, transition: 'all 0.2s ease',
            }}
          >{scanActive ? '⏳' : '📄'}</button>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#00d4ff66', letterSpacing: '0.15em' }}>SCAN</span>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 6, color: '#00d4ff33', letterSpacing: '0.1em' }}>DOCUMENT</span>
        </div>

        {/* MIC (center, bigger) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{
            width: 62, height: 62, borderRadius: '50%',
            border: `2px solid ${col}99`,
            background: `${col}0f`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 16px ${col}44, 0 0 32px ${col}1a`,
            fontSize: 26,
            animation: status === 'listening' ? 'neonPulse 1s ease infinite' : 'none',
          }}>🎙️</div>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: `${col}99`, letterSpacing: '0.15em' }}>MIC</span>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 6, color: `${col}55`, letterSpacing: '0.1em' }}>MAINTENIR</span>
        </div>

        {/* VISION */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <button
            onClick={handleVision}
            disabled={visionActive}
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: visionActive ? '#050a1a' : 'rgba(0,0,0,0.75)',
              border: `1.5px solid ${visionActive ? col : '#00d4ff33'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: visionActive ? `0 0 12px ${col}66` : '0 0 6px #00d4ff11',
              fontSize: 20, transition: 'all 0.2s ease',
            }}
          ><EyeIcon active={visionActive} col={col} /></button>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#00d4ff66', letterSpacing: '0.15em' }}>VISION IA</span>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 6, color: '#00d4ff33', letterSpacing: '0.1em' }}>CAMÉRA</span>
        </div>
      </div>

      {/* ── AUDIO UNLOCK OVERLAY ── */}
      {!audioUnlocked && (
        <div
          onClick={e => { e.stopPropagation(); unlockAudio(); setAudioUnlocked(true); initMic(); }}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)', cursor: 'pointer',
          }}
        >
          <div style={{
            border: '1.5px solid #00d4ff55', borderRadius: 20,
            padding: '28px 36px', textAlign: 'center',
            background: 'rgba(0,5,18,0.98)',
            boxShadow: '0 0 40px #00d4ff1a, 0 0 80px #00d4ff08',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
            <div style={{
              fontFamily: 'Orbitron', fontSize: 13, color: '#00d4ff',
              letterSpacing: '0.3em', fontWeight: 700, marginBottom: 8,
              textShadow: '0 0 12px #00d4ff',
            }}>ACTIVER DZARYX</div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 9, color: '#00d4ff55', letterSpacing: '0.2em' }}>
              MICRO + AUDIO
            </div>
          </div>
        </div>
      )}

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(p => <Corner key={p} pos={p} col={col} />)}
    </div>
  );
}

// ── Robot SVG ─────────────────────────────────────────────────────────────────

function DzaryxRobot({ status }: { status: DzaryxStatus }) {
  const col         = STATE_COLOR[status];
  const isListening = status === 'listening';
  const isSpeaking  = status === 'speaking';
  const isThinking  = status === 'thinking';
  const floatAnim   = isListening ? 'robotFloatListen' : 'robotFloat';

  return (
    <svg
      width="220" height="275"
      viewBox="0 0 240 300"
      fill="none"
      style={{
        animation: `${floatAnim} 3s ease-in-out infinite`,
        filter: `drop-shadow(0 0 10px ${col}44) drop-shadow(0 0 24px ${col}22)`,
        overflow: 'visible',
      }}
    >
      <defs>
        <radialGradient id="rg-head" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#1e3045" />
          <stop offset="55%" stopColor="#0d1e2e" />
          <stop offset="100%" stopColor="#04090f" />
        </radialGradient>
        <linearGradient id="rg-torso" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e1e30" />
          <stop offset="100%" stopColor="#040c18" />
        </linearGradient>
        <radialGradient id="rg-ear" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#152234" />
          <stop offset="100%" stopColor="#040c18" />
        </radialGradient>
        <linearGradient id="rg-neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d1e2e" />
          <stop offset="100%" stopColor="#060f1c" />
        </linearGradient>
        <linearGradient id="rg-shoulder" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0e1e30" />
          <stop offset="100%" stopColor="#040c18" />
        </linearGradient>
      </defs>

      {/* Outer rotating dashed rings */}
      <circle
        cx="120" cy="152" r="108"
        stroke={col} strokeWidth="0.6" strokeDasharray="5 20" strokeOpacity="0.18"
        style={{ transformOrigin: '120px 152px', animation: 'spinSlow 22s linear infinite' }}
      />
      <circle
        cx="120" cy="152" r="90"
        stroke={col} strokeWidth="0.5" strokeDasharray="3 15" strokeOpacity="0.12"
        style={{ transformOrigin: '120px 152px', animation: 'spinMed 16s linear infinite' }}
      />

      {/* Thinking halo */}
      {isThinking && (
        <circle
          cx="120" cy="148" r="84"
          stroke="#ffaa00" strokeWidth="1.5" strokeDasharray="4 8" strokeOpacity="0.7"
          style={{ transformOrigin: '120px 148px', animation: 'thinkHalo 2s linear infinite' }}
        />
      )}

      {/* ── SHOULDERS ── */}
      <path d="M 44 252 L 89 240 L 106 260 L 56 274 Z"
        fill="url(#rg-shoulder)" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="62" y1="254" x2="87" y2="248" stroke={col} strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="58" y1="263" x2="82" y2="257" stroke={col} strokeWidth="0.4" strokeOpacity="0.15" />

      <path d="M 196 252 L 151 240 L 134 260 L 184 274 Z"
        fill="url(#rg-shoulder)" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="178" y1="254" x2="153" y2="248" stroke={col} strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="182" y1="263" x2="158" y2="257" stroke={col} strokeWidth="0.4" strokeOpacity="0.15" />

      {/* ── TORSO ── */}
      <rect x="91" y="258" width="58" height="42" rx="5"
        fill="url(#rg-torso)" stroke={col} strokeWidth="0.8" strokeOpacity="0.4" />
      <line x1="97" y1="270" x2="143" y2="270" stroke={col} strokeWidth="0.4" strokeOpacity="0.2" />
      <line x1="97" y1="276" x2="143" y2="276" stroke={col} strokeWidth="0.3" strokeOpacity="0.12" />
      {/* Diamond */}
      <polygon points="120,262 124,267 120,272 116,267" fill={col} opacity="0.55" />
      {/* DZARYX label */}
      <text x="120" y="286" fill={col}
        fontFamily="Orbitron, monospace" fontSize="6" fontWeight="700"
        textAnchor="middle" letterSpacing="3" opacity="0.8">DZARYX</text>
      <line x1="99" y1="293" x2="141" y2="293" stroke={col} strokeWidth="0.4" strokeOpacity="0.18" />

      {/* ── NECK ── */}
      <rect x="106" y="222" width="28" height="22" rx="3"
        fill="url(#rg-neck)" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="106" y1="228" x2="134" y2="228" stroke={col} strokeWidth="0.4" strokeOpacity="0.28" />
      <line x1="106" y1="234" x2="134" y2="234" stroke={col} strokeWidth="0.4" strokeOpacity="0.22" />
      <line x1="106" y1="240" x2="134" y2="240" stroke={col} strokeWidth="0.4" strokeOpacity="0.16" />
      <rect x="110" y="224" width="4" height="3" rx="1" fill={col} opacity="0.15" />
      <rect x="116" y="224" width="4" height="3" rx="1" fill={col} opacity="0.1" />
      <rect x="126" y="224" width="4" height="3" rx="1" fill={col} opacity="0.15" />

      {/* ── HEAD (main) ── */}
      <ellipse cx="120" cy="148" rx="72" ry="76" fill="url(#rg-head)" />
      <ellipse cx="120" cy="148" rx="72" ry="76" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.35" />
      {/* Chrome highlight */}
      <ellipse cx="94" cy="98" rx="26" ry="15" fill="white" opacity="0.025" />
      {/* Panel lines */}
      <line x1="85" y1="82" x2="77" y2="100" stroke={col} strokeWidth="0.5" strokeOpacity="0.13" />
      <line x1="155" y1="82" x2="163" y2="100" stroke={col} strokeWidth="0.5" strokeOpacity="0.13" />
      <line x1="77" y1="178" x2="67" y2="202" stroke={col} strokeWidth="0.5" strokeOpacity="0.1" />
      <line x1="163" y1="178" x2="173" y2="202" stroke={col} strokeWidth="0.5" strokeOpacity="0.1" />
      {/* Top head plate */}
      <rect x="104" y="73" width="32" height="5" rx="2"
        fill="#0a1830" stroke={col} strokeWidth="0.6" strokeOpacity="0.28" />

      {/* ── ANTENNA ── */}
      <line x1="136" y1="77" x2="158" y2="46" stroke={col} strokeWidth="1.4" strokeOpacity="0.7" />
      <circle cx="146" cy="60" r="2" fill={col} opacity="0.35" />
      <circle cx="158" cy="43" r="8" fill={col} opacity="0.1"
        style={{ animation: 'antennaBlink 1.2s ease infinite' }} />
      <circle cx="158" cy="43" r="4" fill={col} opacity="0.9"
        style={{ animation: 'antennaBlink 1.2s ease infinite' }} />

      {/* ── VISOR (face dark area) ── */}
      <ellipse cx="120" cy="148" rx="54" ry="58" fill="#01080e" opacity="0.93" />
      <ellipse cx="120" cy="148" rx="54" ry="58" fill="none" stroke={col} strokeWidth="0.6" strokeOpacity="0.14" />

      {/* ── LEFT EAR ── */}
      <circle cx="48" cy="152" r="23" fill="url(#rg-ear)" />
      <circle cx="48" cy="152" r="23" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <circle cx="48" cy="152" r="15" fill="#010810" />
      <circle cx="48" cy="152" r="15" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />
      <circle cx="48" cy="152" r="9"  fill="none" stroke={col} strokeWidth="0.4" strokeOpacity="0.12" />
      {/* Left audio bars */}
      {[40, 44, 48, 52, 56].map((bx, i) => {
        const hArr = [4, 7, 5, 8, 3];
        const h = hArr[i] ?? 4;
        return (
          <rect key={i}
            x={bx} y={152 - h} width="2.5" height={h} rx="0.8"
            fill={col}
            opacity={isListening ? 0.85 : 0.28}
            style={isListening ? { animation: `earBar${i + 1} ${0.3 + i * 0.06}s ease ${i * 0.04}s infinite` } : {}}
          />
        );
      })}

      {/* ── RIGHT EAR ── */}
      <circle cx="192" cy="152" r="23" fill="url(#rg-ear)" />
      <circle cx="192" cy="152" r="23" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <circle cx="192" cy="152" r="15" fill="#010810" />
      <circle cx="192" cy="152" r="15" fill="none" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />
      <circle cx="192" cy="152" r="9"  fill="none" stroke={col} strokeWidth="0.4" strokeOpacity="0.12" />
      {/* Right audio bars */}
      {[184, 188, 192, 196, 200].map((bx, i) => {
        const hArr = [3, 8, 5, 7, 4];
        const h = hArr[i] ?? 4;
        return (
          <rect key={i}
            x={bx} y={152 - h} width="2.5" height={h} rx="0.8"
            fill={col}
            opacity={isListening ? 0.85 : 0.28}
            style={isListening ? { animation: `earBar${5 - i} ${0.3 + i * 0.06}s ease ${i * 0.04}s infinite` } : {}}
          />
        );
      })}

      {/* HUD scanline */}
      <rect x="68" y="147" width="104" height="1" fill={col} opacity="0.07" />

      {/* Cheekbone lines */}
      <line x1="72" y1="157" x2="83" y2="169" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="76" y1="154" x2="85" y2="164" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />
      <line x1="168" y1="157" x2="157" y2="169" stroke={col} strokeWidth="0.8" strokeOpacity="0.3" />
      <line x1="164" y1="154" x2="155" y2="164" stroke={col} strokeWidth="0.5" strokeOpacity="0.18" />

      {/* ── EYES ── */}
      {/* Left */}
      <circle cx="96" cy="136" r="14" fill="#000810" />
      <circle cx="96" cy="136" r="11" fill="none" stroke={col} strokeWidth="1.5" strokeOpacity="0.5" />
      <circle cx="96" cy="136" r="6" fill={col}
        style={{ animation: 'eyeGlow 2s ease-in-out infinite' }} />
      <ellipse cx="93" cy="132" rx="2.5" ry="1.5" fill="white" opacity="0.28" />

      {/* Right */}
      <circle cx="144" cy="136" r="14" fill="#000810" />
      <circle cx="144" cy="136" r="11" fill="none" stroke={col} strokeWidth="1.5" strokeOpacity="0.5" />
      <circle cx="144" cy="136" r="6" fill={col}
        style={{ animation: 'eyeGlow 2s ease-in-out infinite 0.3s' }} />
      <ellipse cx="141" cy="132" rx="2.5" ry="1.5" fill="white" opacity="0.28" />

      {/* ── NOSE ── */}
      <circle cx="120" cy="157" r="2.5" fill={col} opacity="0.55" />

      {/* ── MOUTH ── */}
      <rect x="94" y="167" width="52" height="14" rx="3"
        fill="#010810" stroke={col} strokeWidth="0.8" strokeOpacity="0.4" />
      {isSpeaking ? (
        <>
          <rect x="97"  y="170" width="9"  height="8" rx="1" fill={col} opacity="0.9"
            style={{ animation: 'mouthSeg1 0.4s ease infinite' }} />
          <rect x="109" y="170" width="6"  height="8" rx="1" fill={col} opacity="0.7"
            style={{ animation: 'mouthSeg2 0.4s ease infinite' }} />
          <rect x="118" y="170" width="9"  height="8" rx="1" fill={col} opacity="0.85"
            style={{ animation: 'mouthSeg3 0.4s ease infinite' }} />
          <rect x="130" y="170" width="6"  height="8" rx="1" fill={col} opacity="0.7"
            style={{ animation: 'mouthSeg2 0.4s ease infinite 0.1s' }} />
          <rect x="139" y="170" width="5"  height="8" rx="1" fill={col} opacity="0.6"
            style={{ animation: 'mouthSeg1 0.4s ease infinite 0.2s' }} />
        </>
      ) : (
        <rect x="97" y="173" width="46" height="2" rx="1"
          fill={col} opacity={status === 'idle' ? 0.4 : 0.65} />
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
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function Corner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const s = 14, t = 1.5;
  const bT = pos.startsWith('t') ? `${t}px solid ${col}88` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}88` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}88` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}88` : 'none';
  const h  = pos.endsWith('l')   ? { left: 6 }  : { right: 6 };
  const v  = pos.startsWith('t') ? { top: 6 }   : { bottom: 6 };
  return (
    <div style={{
      position: 'absolute', zIndex: 4, width: s, height: s,
      borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR,
      ...h, ...v,
    }} />
  );
}

function MiniCorner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const s = 8, t = 1;
  const bT = pos.startsWith('t') ? `${t}px solid ${col}66` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}66` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}66` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}66` : 'none';
  const h  = pos.endsWith('l')   ? { left: 0 }  : { right: 0 };
  const v  = pos.startsWith('t') ? { top: 0 }   : { bottom: 0 };
  return (
    <div style={{
      position: 'absolute', width: s, height: s,
      borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR,
      ...h, ...v,
    }} />
  );
}

function EyeIcon({ active, col }: { active: boolean; col: string }) {
  const c = active ? col : '#00d4ffaa';
  return (
    <svg width="18" height="14" viewBox="0 0 24 18" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9C4 3.5 8 1 12 1s8 2.5 11 8c-3 5.5-7 8-11 8S4 14.5 1 9z" />
      <circle cx="12" cy="9" r="3.5" fill={active ? `${col}22` : 'none'} />
      {active && <circle cx="12" cy="9" r="1.5" fill={c} />}
    </svg>
  );
}
