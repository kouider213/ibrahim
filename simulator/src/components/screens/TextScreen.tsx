import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props { onNavigateVoice: () => void; }

interface Message {
  id: string; role: 'user' | 'ai'; text: string;
  ts: string; status?: 'sending' | 'done' | 'error';
}

const STATUS_COLOR: Record<DzaryxStatus, string> = {
  idle: '#00d4ff', listening: '#ff3366', thinking: '#9b59b6', speaking: '#00e676',
};

export default function TextScreen({ onNavigateVoice }: Props) {
  const [msgs, setMsgs]       = useState<Message[]>([{
    id: '0', role: 'ai', text: 'Salut, je suis Dzaryx. Comment puis-je t\'aider ?', ts: now(),
  }]);
  const [input, setInput]     = useState('');
  const [status, setStatus]   = useState<DzaryxStatus>('idle');
  const [streaming, setStream] = useState('');
  const [wsConn, setWsConn]   = useState(false);
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
      onProactive: (t) => {
        setMsgs(ms => [...ms, { id: uid(), role: 'ai', text: `📡 ${t}`, ts: now(), status: 'done' }]);
      },
    });
    sock.on('connect',    () => setWsConn(true));
    sock.on('disconnect', () => setWsConn(false));
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
        background: 'linear-gradient(180deg, #03050f 0%, #010208 100%)',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #00d4ff1a',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <button
          onClick={onNavigateVoice}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff88" strokeWidth="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,212,255,0.1)',
            border: `1.5px solid ${col}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 8px ${col}44`,
          }}>
            <span style={{ fontSize: 12 }}>D</span>
          </div>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: col, letterSpacing: '0.2em' }}>DZARYX</div>
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 7, color: '#ffffff33', letterSpacing: '0.1em' }}>
              {wsConn ? `${status.toUpperCase()} ●` : 'HORS LIGNE ○'}
            </div>
          </div>
        </div>
        {/* Voice mode button */}
        <button
          onClick={onNavigateVoice}
          style={{
            background: 'rgba(0,212,255,0.05)', border: '1px solid #00d4ff33',
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 8, color: '#00d4ff88' }}>VOCAL</span>
        </button>
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
        padding: '10px 12px',
        borderTop: '1px solid #00d4ff1a',
        display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Écris un message..."
          rows={1}
          style={{
            flex: 1, background: 'rgba(0,212,255,0.05)',
            border: `1px solid ${input ? col + '66' : '#00d4ff22'}`,
            borderRadius: 12, padding: '8px 12px',
            color: '#fff', fontFamily: 'Exo 2', fontSize: 11,
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
            background: input.trim() && status !== 'thinking'
              ? `linear-gradient(135deg, ${col}, ${col}88)`
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${input.trim() ? col + '88' : '#ffffff22'}`,
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke={input.trim() ? '#000' : '#ffffff33'} strokeWidth="2">
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
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: 6, alignItems: 'flex-end',
      }}
    >
      {!isUser && (
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(0,212,255,0.1)',
          border: '1px solid #00d4ff44',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9,
        }}>D</div>
      )}
      <div style={{
        maxWidth: '78%',
        background: isUser
          ? 'linear-gradient(135deg, rgba(255,107,0,0.15), rgba(255,107,0,0.08))'
          : 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(0,212,255,0.05))',
        border: `1px solid ${isUser ? '#ff6b0033' : '#00d4ff22'}`,
        borderRadius: isUser ? '14px 14px 2px 14px' : '2px 14px 14px 14px',
        padding: '7px 11px',
      }}>
        {msg.status === 'sending' && !msg.text ? (
          <span style={{ color: '#ffffff33', fontFamily: 'Share Tech Mono', fontSize: 10 }}>●●●</span>
        ) : (
          <p style={{
            fontFamily: 'Exo 2', fontSize: 11, lineHeight: 1.6, margin: 0,
            color: isUser ? '#ffb347' : '#a8e8ff',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{msg.text}</p>
        )}
        <span style={{
          display: 'block', textAlign: 'right', marginTop: 2,
          fontFamily: 'Share Tech Mono', fontSize: 7, color: '#ffffff22',
          letterSpacing: '0.05em',
        }}>{msg.ts}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(0,212,255,0.1)', border: '1px solid #00d4ff44',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
      }}>D</div>
      <div style={{
        background: 'rgba(0,212,255,0.05)',
        border: '1px solid #00d4ff22',
        borderRadius: '2px 14px 14px 14px',
        padding: '8px 14px', display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 4, height: 4, borderRadius: '50%', background: '#00d4ff66',
            animation: `floatUp 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function uid() { return Math.random().toString(36).slice(2); }
function now() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
