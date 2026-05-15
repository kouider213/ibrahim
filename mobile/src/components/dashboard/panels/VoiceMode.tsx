import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, connectSocket, getOrCreateSessionId, type IbrahimStatus } from '../../../services/api.js';

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const PHASE_COLORS: Record<Phase, string> = {
  idle:      '#06b6d4',
  listening: '#10b981',
  thinking:  '#8b5cf6',
  speaking:  '#f59e0b',
};

const PHASE_LABELS: Record<Phase, string> = {
  idle:      'EN ATTENTE',
  listening: 'ÉCOUTE…',
  thinking:  'RÉFLEXION…',
  speaking:  'PAROLE…',
};

function OrbParticles({ phase }: { phase: Phase }) {
  const count = 24;
  const color = PHASE_COLORS[phase];

  return (
    <div className="relative w-40 h-40">
      {Array.from({ length: count }).map((_, i) => {
        const angle  = (i / count) * 360;
        const radius = phase === 'idle' ? 56 : phase === 'listening' ? 64 : 72;
        const delay  = i * 0.04;
        const x = Math.cos((angle * Math.PI) / 180) * radius;
        const y = Math.sin((angle * Math.PI) / 180) * radius;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: phase === 'speaking' ? 4 : 3,
              height: phase === 'speaking' ? 4 : 3,
              background: color,
              left: '50%',
              top: '50%',
              marginLeft: -1.5,
              marginTop: -1.5,
              boxShadow: `0 0 6px ${color}`,
            }}
            animate={{
              x,
              y,
              opacity:  [0.4, 1, 0.4],
              scale:    phase === 'speaking' ? [1, 1.4, 1] : [1, 1.1, 1],
            }}
            transition={{
              duration: phase === 'thinking' ? 1.2 : 2,
              delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        );
      })}
      {/* Core */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ scale: phase !== 'idle' ? [1, 1.05, 1] : 1 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
            border: `1px solid ${color}44`,
            boxShadow: `0 0 30px ${color}33`,
          }}
        >
          <span style={{ color }} className="text-2xl">◎</span>
        </div>
      </motion.div>
    </div>
  );
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
    : null;

export default function VoiceMode() {
  const [phase, setPhase]     = useState<Phase>('idle');
  const [text, setText]       = useState('');
  const [reply, setReply]     = useState('');
  const [inputText, setInputText]   = useState('');
  const [sttSupported]        = useState(Boolean(SpeechRecognitionAPI));
  const [interim, setInterim] = useState('');
  const recognitionRef        = useRef<any>(null);
  const sessionId = getOrCreateSessionId();
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);

  useEffect(() => {
    const socket = connectSocket(sessionId, {
      onStatus: (s: IbrahimStatus) => setPhase(s as Phase),
      onAudio:         () => {},
      onAudioChunk:    () => {},
      onAudioComplete: () => {},
      onTextChunk:     (chunk) => setReply(prev => prev + chunk),
      onTextComplete:  (t) => { setReply(t); setPhase('idle'); },
      onResponse:      (t) => { setReply(t); setPhase('idle'); },
      onValidation:    () => {},
      onTaskUpdate:    () => {},
    });
    socketRef.current = socket;
    return () => { /* keep socket alive across nav */ };
  }, [sessionId]);

  const sendMessage = async (overrideText?: string) => {
    const msg = (overrideText ?? inputText).trim();
    if (!msg) return;
    setInputText('');
    setInterim('');
    setText(msg);
    setReply('');
    setPhase('thinking');
    try {
      const result = await api.chat(msg, sessionId, true);
      if (result.text) { setReply(result.text); setPhase('speaking'); setTimeout(() => setPhase('idle'), 3000); }
    } catch {
      setReply('Erreur de connexion à Dzaryx.');
      setPhase('idle');
    }
  };

  const startListening = () => {
    if (!SpeechRecognitionAPI || phase === 'thinking') return;
    if (recognitionRef.current) { recognitionRef.current.stop(); return; }

    const rec = new SpeechRecognitionAPI();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    recognitionRef.current = rec;
    setPhase('listening');
    setInterim('');

    rec.onresult = (e: any) => {
      let final = '';
      let inter = '';
      for (const result of Array.from(e.results) as any[]) {
        if (result.isFinal) final += result[0].transcript;
        else inter += result[0].transcript;
      }
      setInterim(inter || final);
      if (final) setInputText(final);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setInterim('');
      setPhase('idle');
      setInputText(prev => { if (prev.trim()) { sendMessage(prev.trim()); return ''; } return prev; });
    };

    rec.onerror = () => { recognitionRef.current = null; setPhase('idle'); setInterim(''); };

    rec.start();
  };

  const color = PHASE_COLORS[phase];

  return (
    <motion.div
      className="flex flex-col items-center space-y-6 min-h-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="text-cyan-400 font-mono text-lg font-bold tracking-widest uppercase self-start">Voice Mode</h2>

      {/* Jarvis orb */}
      <div className="flex flex-col items-center gap-4 py-4">
        <OrbParticles phase={phase} />
        <motion.div
          className="font-mono text-sm uppercase tracking-[0.3em]"
          style={{ color }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {PHASE_LABELS[phase]}
        </motion.div>
      </div>

      {/* Last message */}
      <AnimatePresence mode="wait">
        {text && (
          <motion.div
            key={text}
            className="dash-card p-3 w-full"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">Vous</p>
            <p className="text-sm text-gray-300">{text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {reply && (
          <motion.div
            key={reply.slice(0, 20)}
            className="dash-card p-3 w-full border border-cyan-500/20"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p className="text-xs text-cyan-600 uppercase tracking-wider mb-1">Dzaryx</p>
            <p className="text-sm text-gray-200 leading-relaxed">{reply}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interim transcript display */}
      {interim && (
        <p className="text-xs text-cyan-400/70 font-mono italic text-center px-4">{interim}</p>
      )}

      {/* Mic button */}
      {sttSupported && (
        <motion.button
          onClick={startListening}
          disabled={phase === 'thinking'}
          className="w-16 h-16 rounded-full flex items-center justify-center border transition-colors disabled:opacity-40"
          style={{
            borderColor: phase === 'listening' ? color : '#374151',
            background:  phase === 'listening' ? `${color}22` : 'transparent',
            boxShadow:   phase === 'listening' ? `0 0 20px ${color}44` : 'none',
          }}
          animate={{ scale: phase === 'listening' ? [1, 1.08, 1] : 1 }}
          transition={{ duration: 1, repeat: phase === 'listening' ? Infinity : 0 }}
          title={phase === 'listening' ? 'Arrêter' : 'Parler à Dzaryx'}
        >
          <span className="text-2xl">{phase === 'listening' ? '⏹' : '🎤'}</span>
        </motion.button>
      )}

      {!sttSupported && (
        <p className="text-[10px] text-gray-600 font-mono text-center">
          Micro non supporté — utilise Chrome/Android
        </p>
      )}

      {/* Text input */}
      <div className="flex gap-2 w-full mt-auto">
        <input
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
          placeholder={sttSupported ? 'Parle ou écris…' : 'Message texte à Dzaryx…'}
          disabled={phase === 'thinking'}
          className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage()}
          disabled={phase === 'thinking' || !inputText.trim()}
          className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 rounded-lg px-4 py-2 text-sm font-mono hover:bg-cyan-500/30 transition-colors disabled:opacity-40"
        >
          ↗
        </button>
      </div>
    </motion.div>
  );
}
