import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio,
  subscribeProactive, unsubscribeProactive, isSocketConnected,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props { onNavigateVoice: () => void; }

interface Message {
  id: string; role: 'user' | 'ai'; text: string;
  ts: string; status?: 'sending' | 'done' | 'error';
}

const STATUS_COLOR: Record<DzaryxStatus, string> = {
  idle: '#00d4ff', listening: '#ff3366', thinking: '#ffaa00', speaking: '#00e676',
};

export default function TextScreen({ onNavigateVoice }: Props) {
  const [msgs, setMsgs]       = useState<Message[]>([{
    id: '0', role: 'ai', text: 'Salut, je suis Dzaryx. Comment puis-je t\'aider ?', ts: now(),
  }]);
  const [input, setInput]     = useState('');
  const [status, setStatus]   = useState<DzaryxStatus>('idle');
  const [streaming, setStream] = useState('');
  const [wsConn, setWsConn]   = useState(isSocketConnected);
  const scrollRef              = useRef<HTMLDivElement>(null);
  const sessionId              = useRef(getOrCreateSessionId());
  const streamingMsgId         = useRef<string | null>(null);

  useEffect(() => {
    const sock = connectSocket(sessionId.current, {
      onStatus:        (s) => setStatus(s),
      onAudio:         b64 => { unlockAudio(); playBase64Audio(b64); },
      onAudioChunk:    b64 => enqueueChunk(b64),
      onAudioComplete: ()  => flushChunks(),
      onTextChunk:     (c) => {
        setStream(s => {
          const next = s + c;
          if (streamingMsgId.current) {
            setMsgs(ms => ms.map(m => m.id === streamingMsgId.current ? { ...m, text: next } : m));
          }
          return next;
        });
      },
      onTextComplete: (t) => {
        if (streamingMsgId.current) {
          setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
            ? { ...m, text: t, status: 'done' } : m));
          streamingMsgId.current = null;
        }
        setStream('');
      },
      onResponse: (t, _fb) => {
        if (streamingMsgId.current) {
          setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
            ? { ...m, text: t, status: 'done' } : m));
          streamingMsgId.current = null;
        } else {
          const id = uid();
          setMsgs(ms => [...ms, { id, role: 'ai', text: t, ts: now(), status: 'done' }]);
        }
        setStream('');
      },
      onProactive: () => {},
    });
    sock.on('connect',    () => setWsConn(true));
    sock.on('disconnect', () => setWsConn(false));
  }, []);

  // Track timestamps already displayed to avoid duplicates across polls
  const seenTimestamps = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadProactives = (isInitial: boolean) => {
      api.getRecentProactives().then(({ messages }) => {
        const unseen = messages.filter(m => !seenTimestamps.current.has(m.timestamp));
        if (unseen.length === 0) return;
        unseen.forEach(m => seenTimestamps.current.add(m.timestamp));
        const newMsgs = unseen.map(m => ({
          id: uid(), role: 'ai' as const,
          text: `📡 ${m.text}`,
          ts: new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          status: 'done' as const,
        }));
        if (isInitial) {
          setMsgs(ms => [ms[0], ...newMsgs]);
        } else {
          setMsgs(ms => [...ms, ...newMsgs]);
        }
      }).catch(() => {});
    };

    loadProactives(true);
    const poll = setInterval(() => loadProactives(false), 30_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    subscribeProactive((text) => {
      setMsgs(ms => [...ms, { id: uid(), role: 'ai', text: `📡 ${text}`, ts: now(), status: 'done' }]);
    });
    return () => unsubscribeProactive();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'thinking') return;

    const userMsg: Message = { id: uid(), role: 'user', text, ts: now(), status: 'done' };
    const aiMsg: Message   = { id: uid(), role: 'ai',  text: '',  ts: now(), status: 'sending' };
    setMsgs(ms => [...ms, userMsg, aiMsg]);
    streamingMsgId.current = aiMsg.id;
    setInput('');
    setStatus('thinking');

    try {
      const res = await api.chat(text, sessionId.current);
      if (res.text && streamingMsgId.current) {
        setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
          ? { ...m, text: res.text!, status: 'done' } : m));
        streamingMsgId.current = null;
        if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
      }
    } catch {
      setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
        ? { ...m, text: '⚠️ Erreur réseau', status: 'error' } : m));
      streamingMsgId.current = null;
    }
  }, [input, status]);

  const col = STATUS_COLOR[status];

  return (
    <div
      className="scanlines"
      onClick={() => unlockAudio()}
      style={{
        width: '100%', height: '100%',
        background: '#020510',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px 8px',
        borderBottom: `1px solid ${col}1a`,
        flexShrink: 0,
        background: 'rgba(2,5,16,0.96)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          {/* Back + connection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onNavigateVoice} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff66" strokeWidth="2">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: wsConn ? '#00e676' : '#ff3366',
                boxShadow: `0 0 5px ${wsConn ? '#00e676' : '#ff3366'}`,
                animation: 'statusPulse 2s ease infinite',
              }} />
              <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: wsConn ? '#00e67677' : '#ff336677', letterSpacing: '0.1em' }}>
                {wsConn ? 'CONNECTÉ' : 'HORS LIGNE'}
              </span>
            </div>
          </div>

          {/* DZARYX title */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'Orbitron', fontSize: 14, fontWeight: 900,
              color: '#00d4ff', letterSpacing: '0.4em',
              textShadow: '0 0 10px #00d4ff, 0 0 20px #00d4ff33',
            }}>DZARYX</div>
          </div>

          {/* Voice mode button */}
          <button onClick={onNavigateVoice} style={{
            background: `${col}0d`, border: `1px solid ${col}33`,
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: `${col}99`, letterSpacing: '0.12em' }}>🎙️ VOCAL</span>
          </button>
        </div>

        {/* Subtitle + status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#00d4ff44', letterSpacing: '0.18em' }}>
            IA DE FIK CONCIERGERIE · ORAN
          </span>
          <span style={{
            fontFamily: 'Orbitron', fontSize: 7, color: col,
            letterSpacing: '0.2em', textShadow: `0 0 6px ${col}`,
          }}>{status.toUpperCase()}</span>
        </div>
        <div style={{ marginTop: 6, height: 1, background: `linear-gradient(90deg, transparent, ${col}55, transparent)` }} />
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 12px 0',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {msgs.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {streaming && streamingMsgId.current && (
          <TypingIndicator />
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: '8px 12px 10px',
        borderTop: `1px solid ${col}1a`,
        display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
        background: 'rgba(2,5,16,0.95)',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Écris un message..."
          rows={1}
          style={{
            flex: 1, background: `${col}08`,
            border: `1px solid ${input ? col + '55' : col + '1a'}`,
            borderRadius: 12, padding: '8px 12px',
            color: '#c8e8ff', fontFamily: 'Share Tech Mono', fontSize: 11,
            resize: 'none', outline: 'none',
            lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
            transition: 'border-color 0.2s ease',
          }}
        />
        <button
          onClick={() => { unlockAudio(); send(); }}
          disabled={!input.trim() || status === 'thinking'}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: input.trim() && status !== 'thinking' ? `${col}22` : 'rgba(255,255,255,0.03)',
            border: `1.5px solid ${input.trim() ? col + '88' : '#ffffff18'}`,
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: input.trim() ? `0 0 10px ${col}33` : 'none',
            transition: 'all 0.2s ease', flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={input.trim() ? col : '#ffffff22'} strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div
      className="bubble-in"
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-end' }}
    >
      {!isUser && <RobotAvatar />}
      <div style={{
        maxWidth: '78%',
        background: isUser
          ? 'linear-gradient(135deg, rgba(255,107,0,0.12), rgba(255,107,0,0.06))'
          : 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,212,255,0.04))',
        border: `1px solid ${isUser ? '#ff6b0030' : '#00d4ff22'}`,
        borderRadius: isUser ? '14px 14px 2px 14px' : '2px 14px 14px 14px',
        padding: '7px 11px',
      }}>
        {msg.status === 'sending' && !msg.text ? (
          <span style={{ color: '#00d4ff44', fontFamily: 'Share Tech Mono', fontSize: 10 }}>· · ·</span>
        ) : (
          <p style={{
            fontFamily: 'Share Tech Mono', fontSize: 10, lineHeight: 1.65, margin: 0,
            color: isUser ? '#ffb347cc' : '#a0e8ffcc',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{msg.text}</p>
        )}
        <span style={{
          display: 'block', textAlign: 'right', marginTop: 3,
          fontFamily: 'Share Tech Mono', fontSize: 7, color: '#ffffff1a', letterSpacing: '0.05em',
        }}>{msg.ts}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <RobotAvatar />
      <div style={{
        background: 'rgba(0,212,255,0.05)', border: '1px solid #00d4ff1a',
        borderRadius: '2px 14px 14px 14px', padding: '8px 14px',
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 4, height: 4, borderRadius: '50%', background: '#00d4ff55',
            animation: `floatUp 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function RobotAvatar() {
  return (
    <svg width="22" height="22" viewBox="0 0 40 40" fill="none"
      style={{ flexShrink: 0, filter: 'drop-shadow(0 0 4px #00d4ff44)' }}>
      <defs>
        <radialGradient id="av-head" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1e3045" />
          <stop offset="100%" stopColor="#050c18" />
        </radialGradient>
      </defs>
      {/* Head */}
      <ellipse cx="20" cy="20" rx="16" ry="16" fill="url(#av-head)" />
      <ellipse cx="20" cy="20" rx="16" ry="16" fill="none" stroke="#00d4ff" strokeWidth="0.8" strokeOpacity="0.4" />
      {/* Visor */}
      <ellipse cx="20" cy="21" rx="11" ry="11" fill="#01080e" opacity="0.9" />
      {/* Eyes */}
      <circle cx="15" cy="18" r="4" fill="#000810" />
      <circle cx="15" cy="18" r="3" fill="none" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="15" cy="18" r="1.8" fill="#00d4ff" style={{ animation: 'eyeGlow 2s ease-in-out infinite' }} />
      <circle cx="25" cy="18" r="4" fill="#000810" />
      <circle cx="25" cy="18" r="3" fill="none" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="25" cy="18" r="1.8" fill="#00d4ff" style={{ animation: 'eyeGlow 2s ease-in-out infinite 0.3s' }} />
      {/* Mouth */}
      <rect x="14" y="25" width="12" height="2.5" rx="1" fill="#00d4ff" opacity="0.5" />
      {/* Antenna */}
      <line x1="23" y1="5" x2="27" y2="1" stroke="#00d4ff" strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="27" cy="1" r="1.5" fill="#00d4ff" style={{ animation: 'antennaBlink 1.5s ease infinite' }} />
    </svg>
  );
}

function uid() { return Math.random().toString(36).slice(2); }
function now() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
