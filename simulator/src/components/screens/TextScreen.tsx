import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio,
  subscribeProactive, unsubscribeProactive, isSocketConnected,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props { onNavigateVoice: () => void; actor?: 'kouider' | 'houari'; }

interface Message {
  id: string; role: 'user' | 'ai'; text: string;
  ts: string; status?: 'sending' | 'done' | 'error';
  imagePreview?: string;
}

const ACTOR_GREETING: Record<'kouider' | 'houari', string> = {
  kouider: 'Bonjour Kouider. Je suis Dzaryx, ton assistant personnel Fik Conciergerie. Comment puis-je t\'aider ?',
  houari:  'Labès Houari. Ana Dzaryx, mساعدك الشخصي Fik Conciergerie. Waش nقدر nعاونك ?',
};

const ACTOR_LABEL: Record<'kouider' | 'houari', string> = {
  kouider: 'KOUIDER · PDG',
  houari:  'HOUARI · ASSOCIÉ',
};

const ACTOR_COLOR: Record<'kouider' | 'houari', string> = {
  kouider: '#00d4ff',
  houari:  '#7c3aed',
};

const STATUS_COLOR: Record<DzaryxStatus, string> = {
  idle: '#00d4ff', listening: '#ff3366', thinking: '#ffaa00', speaking: '#00e676',
};

export default function TextScreen({ onNavigateVoice, actor = 'kouider' }: Props) {
  const actorCol = ACTOR_COLOR[actor];
  const [msgs, setMsgs]       = useState<Message[]>([{
    id: '0', role: 'ai', text: ACTOR_GREETING[actor], ts: now(),
  }]);
  const historyLoaded = useRef(false);
  const [input, setInput]     = useState('');
  const [status, setStatus]   = useState<DzaryxStatus>('idle');
  const [streaming, setStream] = useState('');
  const [wsConn, setWsConn]   = useState(isSocketConnected);
  const [syncInfo, setSyncInfo] = useState<{ ok: boolean; time: string; count: number } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; preview: string } | null>(null);
  const scrollRef              = useRef<HTMLDivElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
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

  // Track timestamps + text snippets to deduplicate between real-time Socket.IO and polling
  const seenTimestamps = useRef<Set<string>>(new Set());
  const seenTexts      = useRef<Set<string>>(new Set());
  const textKey = (t: string) => t.replace(/^📡\s*/, '').slice(0, 80).toLowerCase().trim();

  // Filter out useless status/empty messages (for all actors)
  const isUsefulProactive = (text: string) => {
    const noise = /aucune alerte|tout est en ordre|rien à signaler|nothing to report|no alert|no high|no new|aucun impayé|aucun retard|tous les clients sont à jour|ont rendu leur véhicule à temps/i;
    return !noise.test(text);
  };

  // Houari: only truly actionable booking/client messages — no perso agenda, no status reports
  const isRelevantForActor = (text: string, type: string) => {
    if (actor === 'kouider') return true;
    // Block personal/agenda content regardless of other keywords
    const personal = /agenda|temps famille|travail belgique|trajet travail|soirée|famille|perso|couch|dodo|météo|vol\s+\d|billet/i;
    if (personal.test(text)) return false;
    // Allow only specific actionable booking events
    const actionable = /réservation|nouveau client|prise en charge|retour\s+(prévu|client|voiture|véhicule)|départ\s+(client|voiture|prévu|aujourd|demain)|impayé|acompte|solde\s+dû|arrive\s+(aujourd|demain)|location\s+(commence|termine|expire)/i;
    return actionable.test(text) || type === 'booking';
  };

  // Load conversation history from Supabase on first mount
  useEffect(() => {
    if (historyLoaded.current) return;
    historyLoaded.current = true;
    api.getChatHistory(sessionId.current, 20).then(({ history }) => {
      if (!history.length) return;
      const histMsgs: Message[] = history.map(h => ({
        id:     uid(),
        role:   h.role === 'user' ? 'user' : 'ai',
        text:   h.content,
        ts:     new Date(h.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        status: 'done' as const,
      }));
      // Replace greeting with history + keep greeting as first item
      setMsgs(ms => [ms[0], ...histMsgs]);
    }).catch(() => { /* pas d'historique disponible — on garde le message d'accueil */ });
  }, []);

  useEffect(() => {
    const loadProactives = (isInitial: boolean) => {
      api.getRecentProactives().then(({ messages }) => {
        setSyncInfo({ ok: true, time: now(), count: messages.length });
        const unseen = messages
          .filter(m => !seenTimestamps.current.has(m.timestamp))
          .filter(m => !seenTexts.current.has(textKey(m.text)))
          .filter(m => isUsefulProactive(m.text))
          .filter(m => isRelevantForActor(m.text, m.type));
        if (unseen.length === 0) return;
        unseen.forEach(m => {
          seenTimestamps.current.add(m.timestamp);
          seenTexts.current.add(textKey(m.text));
        });
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
      }).catch((err: unknown) => {
        setSyncInfo({ ok: false, time: now(), count: 0 });
        console.error('[proactive] fetch failed:', err);
      });
    };

    loadProactives(true);
    const poll = setInterval(() => loadProactives(false), 30_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    subscribeProactive((text) => {
      if (!isUsefulProactive(text) || !isRelevantForActor(text, '')) return;
      const key = textKey(text);
      if (seenTexts.current.has(key)) return;
      seenTexts.current.add(key);
      setMsgs(ms => [...ms, { id: uid(), role: 'ai', text: `📡 ${text}`, ts: now(), status: 'done' }]);
    });
    return () => unsubscribeProactive();
  }, []);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, streaming]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const b64 = await compressImage(file, 1200, 0.75);
      setSelectedImage({ base64: b64, preview: `data:image/jpeg;base64,${b64}` });
    } catch { /* ignore */ }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !selectedImage) || status === 'thinking') return;

    const img = selectedImage;
    const userMsg: Message = {
      id: uid(), role: 'user',
      text: text || '📷 Photo',
      ts: now(), status: 'done',
      imagePreview: img?.preview,
    };
    const aiMsg: Message = { id: uid(), role: 'ai', text: '', ts: now(), status: 'sending' };
    setMsgs(ms => [...ms, userMsg, aiMsg]);
    streamingMsgId.current = aiMsg.id;
    setInput('');
    setSelectedImage(null);
    setStatus('thinking');

    // Timeout: if Socket.IO never delivers response in 45s, show error
    const timeoutId = setTimeout(() => {
      if (streamingMsgId.current) {
        setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
          ? { ...m, text: '⚠️ Dzaryx ne répond pas — réessaie', status: 'error' } : m));
        streamingMsgId.current = null;
        setStatus('idle');
      }
    }, 45_000);

    try {
      const res = await api.chat(text || '📷 Photo', sessionId.current, img?.base64, img ? 'image/jpeg' : undefined);
      if (res.text && streamingMsgId.current) {
        clearTimeout(timeoutId);
        setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
          ? { ...m, text: res.text!, status: 'done' } : m));
        streamingMsgId.current = null;
        if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
      }
    } catch {
      clearTimeout(timeoutId);
      setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
        ? { ...m, text: '⚠️ Erreur réseau', status: 'error' } : m));
      streamingMsgId.current = null;
    }
  }, [input, status, selectedImage]);

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
        padding: '10px 14px 8px',
        borderBottom: `1px solid ${col}18`,
        flexShrink: 0,
        background: 'rgba(2,5,16,0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          {/* Back + connection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onNavigateVoice} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={`${actorCol}77`} strokeWidth="2" strokeLinecap="round">
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: wsConn ? '#00e676' : '#ff3366',
                boxShadow: `0 0 6px ${wsConn ? '#00e676' : '#ff3366'}`,
                animation: 'statusPulse 2s ease infinite',
              }} />
              <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 500, color: wsConn ? '#00e67688' : '#ff336688', letterSpacing: '0.06em' }}>
                {wsConn ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>
          </div>

          {/* DZARYX title + actor */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'Orbitron', fontSize: 15, fontWeight: 900,
              color: actorCol, letterSpacing: '0.4em',
              textShadow: `0 0 12px ${actorCol}, 0 0 24px ${actorCol}33`,
            }}>DZARYX</div>
            <div style={{
              fontFamily: 'Inter', fontSize: 8, fontWeight: 500,
              color: `${actorCol}88`, letterSpacing: '0.12em', marginTop: 1,
              textTransform: 'uppercase',
            }}>{ACTOR_LABEL[actor]}</div>
          </div>

          {/* Voice mode button */}
          <button onClick={onNavigateVoice} style={{
            background: `${col}0d`, border: `1px solid ${col}2a`,
            borderRadius: 10, padding: '5px 9px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            transition: 'all 0.2s ease',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={`${col}99`} strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3" fill={`${col}55`} stroke="none" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <line x1="8" y1="21" x2="16" y2="21" />
            </svg>
            <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 600, color: `${col}88`, letterSpacing: '0.06em' }}>VOCAL</span>
          </button>
        </div>

        {/* Subtitle + status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 400, color: `${actorCol}33`, letterSpacing: '0.06em' }}>
            {syncInfo
              ? syncInfo.ok
                ? `Sync · ${syncInfo.count} msg · ${syncInfo.time}`
                : `Sync erreur · ${syncInfo.time}`
              : 'Fik Conciergerie · Oran'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: col, opacity: 0.7 }} />
            <span style={{
              fontFamily: 'Inter', fontSize: 8, fontWeight: 600,
              color: col, letterSpacing: '0.1em', textTransform: 'uppercase',
              textShadow: `0 0 6px ${col}88`,
            }}>{status}</span>
          </div>
        </div>
        <div style={{ marginTop: 6, height: 1, background: `linear-gradient(90deg, transparent, ${col}44, transparent)` }} />
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 10px 6px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        {msgs.map(msg => (
          <MessageBubble key={msg.id} msg={msg} actorCol={actorCol} />
        ))}
        {streaming && streamingMsgId.current && (
          <TypingIndicator actorCol={actorCol} />
        )}
      </div>

      {/* Input area */}
      <div style={{
        borderTop: `1px solid ${col}18`,
        flexShrink: 0,
        background: 'rgba(2,5,16,0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        {/* Image preview strip */}
        {selectedImage && (
          <div style={{ padding: '8px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={selectedImage.preview} alt="preview"
                style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 10, border: `1px solid ${col}44` }} />
              <button onClick={() => setSelectedImage(null)} style={{
                position: 'absolute', top: -5, right: -5,
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(255,51,102,0.7)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}>
                <span style={{ fontSize: 9, color: '#fff', lineHeight: 1 }}>✕</span>
              </button>
            </div>
            <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 400, color: `${col}77` }}>Photo prête à envoyer</span>
          </div>
        )}

        <div style={{ padding: '8px 10px 10px', display: 'flex', gap: 7, alignItems: 'flex-end' }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
          {/* Camera button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Envoyer une photo"
            style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: selectedImage ? `${col}1a` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selectedImage ? col + '66' : '#ffffff12'}`,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: selectedImage ? `0 0 10px ${col}28` : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke={selectedImage ? col : 'rgba(255,255,255,0.3)'} strokeWidth="1.8" strokeLinecap="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={selectedImage ? 'Ajoute un message (optionnel)…' : 'Message…'}
            rows={1}
            style={{
              flex: 1,
              background: (input || selectedImage) ? `${col}0a` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${(input || selectedImage) ? col + '44' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 14, padding: '9px 13px',
              color: 'rgba(200,232,255,0.9)',
              fontFamily: 'Inter', fontSize: 13, fontWeight: 400,
              resize: 'none', outline: 'none',
              lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          />
          <button
            onClick={() => { unlockAudio(); send(); }}
            disabled={(!input.trim() && !selectedImage) || status === 'thinking'}
            style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: (input.trim() || selectedImage) && status !== 'thinking'
                ? `linear-gradient(135deg, ${col}33, ${col}18)`
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${(input.trim() || selectedImage) ? col + '66' : 'rgba(255,255,255,0.08)'}`,
              cursor: (input.trim() || selectedImage) && status !== 'thinking' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: (input.trim() || selectedImage) ? `0 0 14px ${col}33` : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {status === 'thinking' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`${col}66`} strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin-slow 1s linear infinite' }}>
                <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke={(input.trim() || selectedImage) ? col : 'rgba(255,255,255,0.18)'} strokeWidth="2" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22,2 15,22 11,13 2,9" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const MEDIA_RE = /^📹\s+(https?:\/\/\S+)$/;
const VIDEO_EXT = /\.(mp4|mov|webm|ogg)(\?.*)?$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;

function MessageBubble({ msg, actorCol }: { msg: Message; actorCol: string }) {
  const isUser = msg.role === 'user';

  const lines = msg.text.split('\n');
  const mediaUrls: string[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    const m = MEDIA_RE.exec(line);
    if (m) { mediaUrls.push(m[1]); }
    else { textLines.push(line); }
  }
  const displayText = textLines.join('\n').trim();

  return (
    <div
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 7, alignItems: 'flex-end', animation: 'msg-in 0.22s ease' }}
    >
      {!isUser && <RobotAvatar col={actorCol} />}
      <div style={{
        maxWidth: '76%',
        background: isUser
          ? 'linear-gradient(135deg, rgba(255,107,0,0.14), rgba(255,107,0,0.07))'
          : `linear-gradient(135deg, ${actorCol}14, ${actorCol}06)`,
        border: `1px solid ${isUser ? 'rgba(255,107,0,0.22)' : actorCol + '22'}`,
        borderRadius: isUser ? '16px 16px 3px 16px' : '3px 16px 16px 16px',
        padding: '9px 13px',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: isUser
          ? '0 2px 16px rgba(0,0,0,0.3)'
          : `0 2px 16px rgba(0,0,0,0.3), 0 0 20px ${actorCol}08`,
      }}>
        {msg.status === 'sending' && !msg.text ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: actorCol, opacity: 0.4,
                animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        ) : (
          <>
            {isUser && msg.imagePreview && (
              <img src={msg.imagePreview} alt="photo"
                style={{ display: 'block', marginBottom: displayText ? 7 : 0, width: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover' }} />
            )}
            {displayText && (
              <p style={{
                fontFamily: 'Inter', fontSize: 12, fontWeight: 400,
                lineHeight: 1.6, margin: 0,
                color: isUser ? 'rgba(255,180,100,0.9)' : 'rgba(185,225,255,0.88)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{displayText}</p>
            )}
            {mediaUrls.map((url, i) =>
              VIDEO_EXT.test(url) ? (
                <video key={i} src={url} controls playsInline
                  style={{ display: 'block', marginTop: 8, width: '100%', maxHeight: 280, borderRadius: 10, background: '#000' }} />
              ) : (
                <img key={i} src={url} alt="document"
                  style={{ display: 'block', marginTop: 8, width: '100%', maxHeight: 300, borderRadius: 10, objectFit: 'contain', background: 'rgba(0,0,0,0.2)' }} />
              )
            )}
          </>
        )}
        <span style={{
          display: 'block', textAlign: 'right', marginTop: 4,
          fontFamily: 'Inter', fontSize: 8, fontWeight: 400,
          color: isUser ? 'rgba(255,180,80,0.3)' : `${actorCol}33`,
          letterSpacing: '0.03em',
        }}>{msg.ts}</span>
      </div>
    </div>
  );
}

function TypingIndicator({ actorCol }: { actorCol: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <RobotAvatar col={actorCol} />
      <div style={{
        background: `linear-gradient(135deg, ${actorCol}10, ${actorCol}06)`,
        border: `1px solid ${actorCol}1a`,
        borderRadius: '3px 16px 16px 16px',
        padding: '10px 16px',
        display: 'flex', gap: 5, alignItems: 'center',
        backdropFilter: 'blur(10px)',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: actorCol, opacity: 0.5,
            animation: `pulse 1.1s ${i * 0.18}s ease-in-out infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function RobotAvatar({ col }: { col: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 40 40" fill="none"
      style={{ flexShrink: 0, filter: `drop-shadow(0 0 5px ${col}55)` }}>
      <defs>
        <radialGradient id="av-head" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1e3045" />
          <stop offset="100%" stopColor="#050c18" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="16" fill="url(#av-head)" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.35" />
      <ellipse cx="20" cy="21" rx="11" ry="11" fill="#01080e" opacity="0.92" />
      <circle cx="15" cy="18" r="3.5" fill="#000810" />
      <circle cx="15" cy="18" r="2.8" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.55" />
      <circle cx="15" cy="18" r="1.7" fill={col} style={{ animation: 'eyeGlow 2s ease-in-out infinite' }} />
      <circle cx="25" cy="18" r="3.5" fill="#000810" />
      <circle cx="25" cy="18" r="2.8" fill="none" stroke={col} strokeWidth="0.8" strokeOpacity="0.55" />
      <circle cx="25" cy="18" r="1.7" fill={col} style={{ animation: 'eyeGlow 2s ease-in-out infinite 0.3s' }} />
      <path d="M 14 25 Q 20 28.5 26 25" stroke={col} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <line x1="23" y1="5" x2="27" y2="1.5" stroke={col} strokeWidth="0.8" strokeOpacity="0.5" />
      <circle cx="27" cy="1.5" r="1.5" fill={col} opacity="0.8" style={{ animation: 'statusPulse 1.5s ease infinite' }} />
    </svg>
  );
}

function uid() { return Math.random().toString(36).slice(2); }
function now() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function compressImage(file: File, maxPx = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('compression failed')); return; }
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
