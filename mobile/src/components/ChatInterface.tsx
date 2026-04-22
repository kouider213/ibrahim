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

const ORB_ICON: Record<JarvisState, string> = {
  idle:   '◈',
  listen: '◉',
  think:  '⟳',
  speak:  '◈',
};

const WAVE_N = 18;

// ── Speech Recognition types ──────────────────
interface SREvent { results: { [k: number]: { [k: number]: { transcript: string } } } }
interface SRL {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}

export default function ChatInterface() {
  const [state,       setState]       = useState<JarvisState>('idle');
  const [responseText, setResponseText] = useState('');
  const [showResponse,  setShowResponse]  = useState(false);
  const [utcTime,      setUtcTime]      = useState('--:--:--');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [started,      setStarted]      = useState(false); // requires tap to unlock iOS mic

  const stateRef   = useRef<JarvisState>('idle');
  const sending    = useRef(false);
  const sessionId  = getOrCreateSessionId();
  const recRef     = useRef<SRL | null>(null);
  const loopActive = useRef(false);
  const audioFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elevenlabsReceivedRef = useRef(false);

  // ── Error display ────────────────────────────
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 3000);
  }, []);

  // ── State machine ────────────────────────────
  const applyState = useCallback((s: JarvisState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── Send text to Ibrahim ─────────────────────
  const sendText = useCallback(async (msg: string) => {
    if (!msg.trim() || sending.current) return;
    sending.current = true;
    unlockAudio();
    applyState('think');
    setShowResponse(false);

    try {
      const resp = await api.chat(msg, sessionId, false);
      if (resp?.text) {
        setResponseText(resp.text);
        setShowResponse(true);
        // TTS handled by socket onTextComplete
      }
    } catch {
      showError('Erreur de connexion');
      applyState('idle');
    } finally {
      sending.current = false;
    }
  }, [sessionId, applyState, showError]);

  // ── Start speech recognition ─────────────────
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

    if (!SR) {
      showError('Micro non supporté sur ce navigateur');
      applyState('idle');
      return;
    }

    try {
      const rec = new SR();
      rec.lang             = 'fr-FR';
      rec.interimResults   = false;
      rec.maxAlternatives  = 1;
      rec.continuous       = false;
      recRef.current       = rec;

      rec.onresult = (e: SREvent) => {
        const transcript = e.results[0]?.[0]?.transcript ?? '';
        recRef.current = null;
        if (transcript.trim()) {
          void sendText(transcript.trim());
        } else {
          applyState('idle');
          scheduleNextListen();
        }
      };

      rec.onerror = () => {
        recRef.current = null;
        applyState('idle');
        scheduleNextListen();
      };

      rec.onend = () => {
        if (stateRef.current === 'listen') {
          applyState('idle');
          scheduleNextListen();
        }
      };

      rec.start();
    } catch {
      applyState('idle');
      scheduleNextListen();
    }
  }, [applyState, sendText, showError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-relisten after Ibrahim finishes speaking ──
  const scheduleNextListen = useCallback(() => {
    if (!loopActive.current) return;
    setTimeout(() => {
      if (loopActive.current && stateRef.current === 'idle') {
        startListening();
      }
    }, 1200);
  }, [startListening]);

  // ── Socket events ────────────────────────────
  useEffect(() => {
    const socket = connectSocket(sessionId, {
      onStatus: (s) => {
        if (s === 'thinking') { setResponseText(''); setShowResponse(false); }
        // Don't go idle while audio is still playing
        if (s === 'idle' && (isAudioPlaying() || window.speechSynthesis?.speaking)) return;
        applyState(toJarvis(s));
      },
      onAudio: (b64) => {
        elevenlabsReceivedRef.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel();
        clearAudioQueue();
        playBase64Audio(b64);
        applyState('speak');
      },
      onAudioChunk: (b64) => {
        elevenlabsReceivedRef.current = true;
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        window.speechSynthesis?.cancel();
        enqueueAudioChunk(b64);
        applyState('speak');
      },
      onTextChunk: (chunk) => {
        setResponseText(prev => prev + chunk);
        setShowResponse(true);
      },
      onTextComplete: (text) => {
        setResponseText(text);
        setShowResponse(true);
        void flushAudioChunks();
        if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
        // iOS TTS fallback only if ElevenLabs sent zero audio (API failure)
        if (!elevenlabsReceivedRef.current) {
          audioFallbackTimer.current = setTimeout(() => {
            audioFallbackTimer.current = null;
            if (!isAudioPlaying()) {
              applyState('speak');
              iosFallbackSpeak(text, () => {
                applyState('idle');
                scheduleNextListen();
              });
            }
          }, 1500);
        }
        elevenlabsReceivedRef.current = false;
      },
      onResponse: (_text, _fallback) => {},
      onValidation: () => {
        // Validation request sent — Ibrahim already said so via audio. Resume listening after 3s.
        setTimeout(() => {
          if (loopActive.current) { applyState('idle'); scheduleNextListen(); }
        }, 3000);
      },
      onTaskUpdate: () => {},
    });

    // When ElevenLabs audio finishes playing → go idle and relisten
    const onAudioEnded = () => {
      if (audioFallbackTimer.current) { clearTimeout(audioFallbackTimer.current); audioFallbackTimer.current = null; }
      if (loopActive.current) {
        applyState('idle');
        scheduleNextListen();
      }
    };
    window.addEventListener('ibrahim:audioEnded', onAudioEnded);

    return () => {
      socket.disconnect();
      window.removeEventListener('ibrahim:audioEnded', onAudioEnded);
    };
  }, [sessionId, applyState, scheduleNextListen]);

  // ── Tap orb to start (required for iOS mic unlock) ──────────
  const handleOrbTap = useCallback(() => {
    if (started) {
      // Already running — tap stops/restarts listening
      if (stateRef.current === 'listen') {
        recRef.current?.stop();
        applyState('idle');
      } else if (stateRef.current === 'idle') {
        startListening();
      }
      return;
    }
    // First tap: unlock audio + speak local greeting + start loop
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

    setTimeout(() => {
      applyState('idle');
      scheduleNextListen();
    }, Math.max(2500, greetText.length * 65));
  }, [started, applyState, startListening, scheduleNextListen]);

  // ── Cleanup on unmount ────────────────────────
  useEffect(() => {
    return () => {
      loopActive.current = false;
      recRef.current?.stop();
      if (audioFallbackTimer.current) clearTimeout(audioFallbackTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── After Ibrahim finishes speaking → relisten (only when started) ──
  useEffect(() => {
    if (state === 'idle' && loopActive.current && started) {
      const t = setTimeout(() => {
        if (stateRef.current === 'idle' && loopActive.current) {
          startListening();
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [state, startListening, started]);

  // ── Clock ────────────────────────────────────
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
      <div className="jarvis-bg" />
      <div className="jarvis-scanlines" />

      {/* Corners */}
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

      {/* Orb */}
      <div className="jarvis-center">
        {/* Electric ring (thinking) */}
        <div className="electric-ring" />

        {/* Wave rings (speaking) */}
        <div className="wave-ring" />
        <div className="wave-ring" />
        <div className="wave-ring" />
        <div className="wave-ring" />

        {/* Listen rings */}
        <div className="listen-ring" />
        <div className="listen-ring" />
        <div className="listen-ring" />

        {/* Main orb — tap to start / toggle */}
        <div className="orb" onClick={handleOrbTap} style={{ cursor: 'pointer' }}>
          <div className="orb-inner">
            <span className="orb-symbol">{started ? ORB_ICON[state] : '▶'}</span>
          </div>
        </div>

        {/* Caption */}
        <div className="jarvis-caption">
          <div className="jarvis-caption-text">{started ? CAPTION[state] : 'APPUYER POUR DÉMARRER'}</div>
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
          <div className="readout-line">MODE · <span>JARVIS</span></div>
          <div className="readout-line">VER · <span>2.0</span></div>
          <div className="readout-line">SYS · <span>ACTIF</span></div>
        </div>
      </footer>

      {/* Error toast */}
      <div className={`jarvis-error${errorVisible ? ' show' : ''}`}>{errorMsg}</div>
    </div>
  );
}
