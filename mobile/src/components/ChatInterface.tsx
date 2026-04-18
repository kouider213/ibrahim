import { useState, useEffect, useRef, useCallback } from 'react';
import {
  api, connectSocket, playBase64Audio, iosFallbackSpeak,
  getOrCreateSessionId, type IbrahimStatus,
} from '../services/api.js';

// ── Animated SVG circle ───────────────────────────────────────

interface OrbProps { status: IbrahimStatus }

function Orb({ status }: OrbProps) {
  const colors: Record<IbrahimStatus, string> = {
    idle:      '#1a1a2e',
    listening: '#4a00e0',
    thinking:  '#8a2be2',
    speaking:  '#ffd700',
  };
  const glows: Record<IbrahimStatus, string> = {
    idle:      'none',
    listening: '0 0 60px 20px rgba(74,0,224,0.6)',
    thinking:  '0 0 80px 30px rgba(138,43,226,0.5)',
    speaking:  '0 0 80px 30px rgba(255,215,0,0.5)',
  };

  return (
    <div style={{
      width:         220,
      height:        220,
      borderRadius:  '50%',
      background:    `radial-gradient(circle at 35% 35%, ${colors[status]}, #000)`,
      boxShadow:     glows[status],
      display:       'flex',
      alignItems:    'center',
      justifyContent:'center',
      position:      'relative',
      transition:    'all 0.4s ease',
      animation:     status === 'listening' ? 'pulse 1.5s ease-in-out infinite'
                   : status === 'speaking'  ? 'wave 0.8s ease-in-out infinite alternate'
                   : status === 'thinking'  ? 'spin-slow 3s linear infinite'
                   : 'none',
    }}>
      {/* Inner ring */}
      <div style={{
        width:        160,
        height:       160,
        borderRadius: '50%',
        border:       `2px solid ${status === 'speaking' ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width:        100,
          height:       100,
          borderRadius: '50%',
          background:   `radial-gradient(circle, ${status === 'speaking' ? 'rgba(255,215,0,0.2)' : 'rgba(100,0,220,0.2)'}, transparent)`,
          border:       `1px solid rgba(255,255,255,0.05)`,
        }} />
      </div>

      {/* Particles when thinking */}
      {status === 'thinking' && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              position:  'absolute',
              width:     6,
              height:    6,
              borderRadius: '50%',
              background: '#8a2be2',
              top:        `${50 + 45 * Math.sin(i * Math.PI / 3)}%`,
              left:       `${50 + 45 * Math.cos(i * Math.PI / 3)}%`,
              animation:  `particle-orbit 3s linear ${i * 0.5}s infinite`,
              opacity:    0.8,
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Wave bars (speaking indicator) ───────────────────────────

function WaveBars({ active }: { active: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40 }}>
      {[...Array(7)].map((_, i) => (
        <div key={i} style={{
          width:        4,
          borderRadius: 2,
          background:   '#ffd700',
          height:       active ? `${20 + Math.random() * 20}px` : '6px',
          transition:   'height 0.15s ease',
          animation:    active ? `bar-wave 0.6s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          opacity:      active ? 1 : 0.3,
        }} />
      ))}
    </div>
  );
}

// ── Main ChatInterface ────────────────────────────────────────

export default function ChatInterface() {
  const [status, setStatus]     = useState<IbrahimStatus>('idle');
  const [isListening, setIsListening] = useState(false);
  const [textInput, setTextInput]     = useState('');
  const [showText, setShowText]       = useState(false);
  const sessionId                     = getOrCreateSessionId();
  const mediaRef                      = useRef<MediaRecorder | null>(null);
  const chunksRef                     = useRef<Blob[]>([]);
  const isSendingRef                  = useRef(false);

  useEffect(() => {
    const socket = connectSocket(sessionId, {
      onStatus:     setStatus,
      onAudio:      base64 => playBase64Audio(base64),
      onResponse:   (text, fallback) => { if (fallback) iosFallbackSpeak(text); },
      onValidation: () => {},
      onTaskUpdate: () => {},
    });
    return () => { socket.disconnect(); };
  }, [sessionId]);

  const sendText = useCallback(async (message: string) => {
    if (!message.trim() || isSendingRef.current) return;
    isSendingRef.current = true;
    setStatus('thinking');
    setTextInput('');
    try {
      const res = await api.chat(message, sessionId);
      if (res.audio) {
        setStatus('speaking');
        await playBase64Audio(res.audio);
        setStatus('idle');
      } else if (res.text) {
        setStatus('speaking');
        iosFallbackSpeak(res.text);
        setTimeout(() => setStatus('idle'), res.text.length * 60);
      }
    } catch (err) {
      console.error(err);
      setStatus('idle');
    } finally {
      isSendingRef.current = false;
    }
  }, [sessionId]);

  const startListening = useCallback(async () => {
    if (isListening) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);
        setStatus('thinking');
        // Fallback: use Web Speech API for transcription
        console.log('[voice] Audio captured, using Web Speech API...');
      };

      recorder.start();
      setIsListening(true);
      setStatus('listening');

      // Web Speech API for real-time transcription
      // Use Web Speech API for transcription (webkit prefix on iOS/Chrome)
      const w = window as Window & {
        webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; start: () => void };
        SpeechRecognition?:       new () => { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null; onerror: (() => void) | null; start: () => void };
      };
      const SR = w.webkitSpeechRecognition ?? w.SpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang          = 'fr-FR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (e) => {
          const transcript = e.results[0]?.[0]?.transcript ?? '';
          if (transcript) sendText(transcript);
          recorder.stop();
        };

        recognition.onerror = () => {
          recorder.stop();
          setStatus('idle');
        };

        recognition.start();
      }
    } catch {
      setStatus('idle');
    }
  }, [isListening, sendText]);

  const stopListening = useCallback(() => {
    mediaRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.08); }
        }
        @keyframes wave {
          0%   { transform: scale(1); }
          100% { transform: scale(1.05); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bar-wave {
          from { height: 8px; }
          to   { height: 36px; }
        }
        @keyframes particle-orbit {
          from { transform: rotate(0deg) translateX(90px); }
          to   { transform: rotate(360deg) translateX(90px); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .text-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 24px;
          color: #fff;
          font-size: 16px;
          outline: none;
          padding: 12px 20px;
          width: 100%;
          transition: border-color 0.2s;
        }
        .text-input:focus { border-color: rgba(138,43,226,0.6); }
        .text-input::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>

      <div style={{
        width:          '100vw',
        height:         '100dvh',
        background:     '#000',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '48px 24px 40px',
        fontFamily:     '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        userSelect:     'none',
        WebkitUserSelect: 'none',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', animation: 'fade-in 0.6s ease' }}>
          <div style={{ fontSize: 13, letterSpacing: 4, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6 }}>
            Fik Conciergerie
          </div>
          <div style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.85)', letterSpacing: 2 }}>
            Ibrahim
          </div>
        </div>

        {/* Central orb */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
          <Orb status={status} />
          <WaveBars active={status === 'speaking'} />
          <div style={{
            fontSize:    12,
            letterSpacing: 3,
            color:       status === 'listening' ? '#7b2fff'
                       : status === 'thinking'  ? '#8a2be2'
                       : status === 'speaking'  ? '#ffd700'
                       : 'rgba(255,255,255,0.2)',
            textTransform: 'uppercase',
            transition:  'color 0.3s ease',
            minHeight:   18,
          }}>
            {status === 'listening' ? '● écoute'
           : status === 'thinking'  ? '⬡ réflexion'
           : status === 'speaking'  ? '◈ parole'
           : ''}
          </div>
        </div>

        {/* Bottom controls */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>

          {/* Text input (toggle) */}
          {showText && (
            <div style={{ width: '100%', display: 'flex', gap: 10, animation: 'fade-in 0.2s ease' }}>
              <input
                className="text-input"
                type="text"
                placeholder="Écrire à Ibrahim..."
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendText(textInput); }}
                autoFocus
              />
              <button
                onClick={() => sendText(textInput)}
                style={{
                  width:        48,
                  height:       48,
                  borderRadius: '50%',
                  background:   '#4a00e0',
                  border:       'none',
                  color:        '#fff',
                  fontSize:     20,
                  cursor:       'pointer',
                  flexShrink:   0,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                }}
              >
                ↑
              </button>
            </div>
          )}

          {/* Mic button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <button
              onClick={() => setShowText(p => !p)}
              style={{
                width:        44,
                height:       44,
                borderRadius: '50%',
                background:   showText ? 'rgba(138,43,226,0.3)' : 'rgba(255,255,255,0.05)',
                border:       '1px solid rgba(255,255,255,0.1)',
                color:        'rgba(255,255,255,0.5)',
                fontSize:     18,
                cursor:       'pointer',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
              }}
            >
              ✎
            </button>

            <button
              onPointerDown={startListening}
              onPointerUp={stopListening}
              onPointerLeave={stopListening}
              style={{
                width:        88,
                height:       88,
                borderRadius: '50%',
                background:   isListening
                  ? 'radial-gradient(circle, #4a00e0, #2a0080)'
                  : 'radial-gradient(circle, #1c1c3a, #0d0d1f)',
                border:       `2px solid ${isListening ? '#7b2fff' : 'rgba(255,255,255,0.1)'}`,
                boxShadow:    isListening ? '0 0 40px rgba(74,0,224,0.5)' : 'none',
                cursor:       'pointer',
                transition:   'all 0.2s ease',
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                fontSize:     32,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              🎤
            </button>

            <div style={{ width: 44 }} />
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', letterSpacing: 1 }}>
            Maintenez pour parler
          </div>
        </div>
      </div>
    </>
  );
}
