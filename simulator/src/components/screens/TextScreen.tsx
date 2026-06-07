import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import html2canvas from 'html2canvas';
import {
  api, connectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio,
  subscribeProactive, unsubscribeProactive, isSocketConnected,
  sendNativeAction, tryParseNativeAction,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props { onNavigateVoice: () => void; actor?: 'kouider' | 'houari'; }

interface Message {
  id: string; role: 'user' | 'ai'; text: string;
  ts: string; status?: 'sending' | 'done' | 'error';
  imagePreview?: string;
  fresh?: boolean;  // réponse fraîche → effet "écriture" (streaming typewriter)
}

const ACTOR_GREETING: Record<'kouider' | 'houari', string> = {
  kouider: 'Bonjour Kouider. Je suis Dzaryx, ton assistant personnel Fik Conciergerie. Comment puis-je t\'aider ?',
  houari:  'Labès Houari. Ana Dzaryx, mساعدك الشخصي Fik Conciergerie. Waش nقدر nعاونك ?',
};

const ACTOR_COLOR: Record<'kouider' | 'houari', string> = {
  kouider: '#C9A96E',
  houari:  '#B9935A',
};

const STATUS_COLOR: Record<DzaryxStatus, string> = {
  idle: '#C9A96E', listening: '#E8C98A', thinking: '#D4B87A', speaking: '#E8C98A',
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
  const [, setSyncInfo] = useState<{ ok: boolean; time: string; count: number } | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ base64: string; preview: string } | null>(null);
  const scrollRef              = useRef<HTMLDivElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const sessionId              = useRef(getOrCreateSessionId());
  const streamingMsgId         = useRef<string | null>(null);

  // Dictée vocale dans le chat
  const [recording, setRecording] = useState(false);
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);

  const toggleDictation = useCallback(async () => {
    if (recording) {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        await new Promise<void>(r => { rec.onstop = () => r(); rec.stop(); });
      }
      recorderRef.current = null;
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      chunksRef.current = [];
      if (blob.size < 500) return;
      try {
        const b64: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onloadend = () => res((r.result as string).split(',')[1] ?? '');
          r.onerror = rej; r.readAsDataURL(blob);
        });
        const { text } = await api.transcribe(b64, 'audio/webm');
        if (text?.trim()) setInput(prev => (prev ? prev + ' ' : '') + text.trim());
      } catch { /* ignore */ }
      return;
    }
    try {
      unlockAudio();
      const stream = micStreamRef.current ?? await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(100);
      recorderRef.current = rec;
      setRecording(true);
    } catch { /* micro refusé */ }
  }, [recording]);

  useEffect(() => {
    const sock = connectSocket(sessionId.current, {
      onStatus:        (s) => setStatus(s),
      onAudio:         b64 => { unlockAudio(); playBase64Audio(b64); },
      onAudioChunk:        b64 => enqueueChunk(b64),
      onAudioComplete:     ()  => flushChunks(),
      onAudioSentenceDone: ()  => flushChunks(),
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

  // Load chat history + proactives together on first mount — single setMsgs to avoid race condition
  useEffect(() => {
    if (historyLoaded.current) return;
    historyLoaded.current = true;

    Promise.all([
      api.getChatHistory(sessionId.current, 60).catch(() => ({ history: [] as Array<{ role: 'user' | 'assistant'; content: string; created_at: string }> })),
      api.getRecentProactives().catch(() => ({ messages: [] as Array<{ text: string; type: string; timestamp: string }> })),
    ]).then(([{ history }, { messages }]) => {
      // On combine historique conversation + proactifs utiles, puis on TRIE par date
      // (sinon les proactifs anciens s'affichaient après les messages récents = ordre cassé).
      type Item = { role: 'user' | 'ai'; text: string; at: number };
      const items: Item[] = [];

      for (const h of history) {
        items.push({ role: h.role === 'user' ? 'user' : 'ai', text: h.content, at: new Date(h.created_at).getTime() });
      }

      const usefulProactives = messages
        .filter(m => isUsefulProactive(m.text))
        .filter(m => isRelevantForActor(m.text, m.type));
      usefulProactives.forEach(m => {
        seenTimestamps.current.add(m.timestamp);
        seenTexts.current.add(textKey(m.text));
      });
      for (const m of usefulProactives) {
        items.push({ role: 'ai', text: `📡 ${m.text}`, at: new Date(m.timestamp).getTime() });
      }

      items.sort((a, b) => a.at - b.at); // chronologique (plus ancien → plus récent)
      const restored: Message[] = items.map(it => ({
        id: uid(), role: it.role, text: it.text,
        ts: new Date(it.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        status: 'done',
      }));

      setSyncInfo({ ok: true, time: now(), count: messages.length });
      if (restored.length > 0) setMsgs(ms => [ms[0], ...restored]);
    }).catch(() => setSyncInfo({ ok: false, time: now(), count: 0 }));
  }, []);

  // 30s poll for NEW proactives arriving after initial load
  useEffect(() => {
    const poll = setInterval(() => {
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
        setMsgs(ms => [...ms, ...unseen.map(m => ({
          id: uid(), role: 'ai' as const,
          text: `📡 ${m.text}`,
          ts: new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          status: 'done' as const,
        }))]);
      }).catch(() => setSyncInfo({ ok: false, time: now(), count: 0 }));
    }, 30_000);
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

  const send = useCallback(async (forced?: string) => {
    const text = (forced ?? input).trim();
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
      const res = await api.chat(text || '📷 Photo', sessionId.current, img?.base64, img ? 'image/jpeg' : undefined, true);
      if (res.text && streamingMsgId.current) {
        clearTimeout(timeoutId);
        const nativeAction = tryParseNativeAction(res.text);
        if (nativeAction) {
          sendNativeAction(nativeAction);
          const h = Number(nativeAction['hour'] ?? 0);
          const m = Number(nativeAction['minute'] ?? 0);
          const confirmText = `✅ Alarme créée pour ${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
          setMsgs(ms => ms.map(msg => msg.id === streamingMsgId.current
            ? { ...msg, text: confirmText, status: 'done' } : msg));
        } else {
          setMsgs(ms => ms.map(m => m.id === streamingMsgId.current
            ? { ...m, text: res.text!, status: 'done', fresh: true } : m));
        }
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

  // Régénérer : renvoie le dernier message utilisateur
  const regenerate = useCallback(() => {
    if (status === 'thinking') return;
    const lastUser = [...msgs].reverse().find(m => m.role === 'user');
    if (lastUser) void send(lastUser.text);
  }, [msgs, status, send]);

  const col = STATUS_COLOR[status];

  return (
    <div
      onClick={() => unlockAudio()}
      style={{
        width: '100%', height: '100%',
        background: '#000000',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Header minimal (façon Gemini) */}
      <div style={{
        padding: '14px 16px 10px',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Connexion + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsConn ? '#52E3A1' : '#FF5A5A',
            boxShadow: `0 0 8px ${wsConn ? '#52E3A1' : '#FF5A5A'}`,
          }} />
          <span style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.01em' }}>
            Dzaryx
          </span>
          <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 400, color: `${actorCol}88`, letterSpacing: '0.02em' }}>
            {actor === 'kouider' ? 'PDG' : 'Associé'}
          </span>
        </div>

        {/* Bouton vocal */}
        <button onClick={onNavigateVoice} style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '50%', width: 38, height: 38, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
        }} aria-label="Mode vocal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round">
            <rect x="9" y="2" width="6" height="11" rx="3" fill={`${col}44`} stroke="none" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 12px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {msgs.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            actorCol={actorCol}
            onRegenerate={(i === msgs.length - 1 && msg.role === 'ai' && msg.status === 'done') ? regenerate : undefined}
          />
        ))}
        {streaming && streamingMsgId.current && (
          <TypingIndicator actorCol={actorCol} />
        )}
      </div>

      {/* Zone de saisie — pill (façon Gemini) */}
      <div style={{ flexShrink: 0, background: '#000', padding: '8px 12px 14px' }}>
        {/* Aperçu image */}
        {selectedImage && (
          <div style={{ padding: '0 4px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={selectedImage.preview} alt="preview"
                style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)' }} />
              <button onClick={() => setSelectedImage(null)} style={{
                position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}>
                <span style={{ fontSize: 10, color: '#fff', lineHeight: 1 }}>✕</span>
              </button>
            </div>
            <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Photo prête</span>
          </div>
        )}

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

        {/* Pill */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 6,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 26, padding: '5px 5px 5px 12px',
        }}>
          {/* + (ajouter photo) */}
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Ajouter une photo"
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginBottom: 1,
              background: selectedImage ? `${col}1c` : 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selectedImage ? col : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={selectedImage ? 'Ajoute un message…' : 'Message à Dzaryx'}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              padding: '8px 0', color: 'rgba(255,255,255,0.92)',
              fontFamily: 'Inter', fontSize: 15, fontWeight: 400,
              resize: 'none', outline: 'none', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
            }}
          />

          {/* Dictée vocale (parler au lieu de taper) */}
          <button
            onClick={toggleDictation}
            aria-label="Dictée vocale"
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginBottom: 1,
              background: recording ? '#FF5A5A22' : 'transparent',
              border: recording ? '1px solid #FF5A5A' : 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: recording ? 'statusPulse 1s ease infinite' : 'none',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={recording ? '#FF5A5A' : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="11" rx="3" fill={recording ? '#FF5A5A' : 'rgba(255,255,255,0.3)'} stroke="none" />
              <path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>

          {/* Envoyer (flèche si texte, micro sinon) */}
          <button
            onClick={() => { unlockAudio(); if (input.trim() || selectedImage) send(); else onNavigateVoice(); }}
            disabled={status === 'thinking'}
            aria-label={(input.trim() || selectedImage) ? 'Envoyer' : 'Mode vocal'}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: (input.trim() || selectedImage) ? col : 'rgba(255,255,255,0.10)',
              border: 'none', cursor: status === 'thinking' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            {status === 'thinking' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" style={{ animation: 'spin-slow 1s linear infinite' }}>
                <circle cx="12" cy="12" r="9" strokeOpacity="0.3" /><path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
            ) : (input.trim() || selectedImage) ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5,12 12,5 19,12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round">
                <rect x="9" y="2" width="6" height="11" rx="3" fill="rgba(255,255,255,0.45)" stroke="none" />
                <path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const VIDEO_EXT = /\.(mp4|mov|webm|ogg)(\?.*)?$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|avif)(\?.*)?$/i;
const DOC_EXT   = /\.(xlsx|xls|pdf|docx|doc|csv|zip)(\?.*)?$/i;
const URL_RE    = /(https?:\/\/[^\s\])"']+)/g;
// Non-global anchored test — split() parts are exact URLs or plain text.
// Using URL_RE.test() (global flag) is stateful via lastIndex → flaky detection.
const URL_IS    = /^https?:\/\/[^\s\])"']+$/;

type MediaItem = { url: string; kind: 'image' | 'video' | 'doc' };

function parseMessage(text: string): { displayText: string; media: MediaItem[] } {
  const lines = text.split('\n');
  const media: MediaItem[] = [];
  const textLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // 📹 prefix → média : détecte image / vidéo / doc selon l'extension.
    // (Un passeport est une IMAGE, pas une vidéo — sinon <video src=image.jpg> = boîte noire.)
    const mv = /^📹\s+(https?:\/\/\S+)$/.exec(trimmed);
    if (mv) {
      const u = mv[1]!;
      if (VIDEO_EXT.test(u))      media.push({ url: u, kind: 'video' });
      else if (IMAGE_EXT.test(u)) media.push({ url: u, kind: 'image' });
      else if (DOC_EXT.test(u))   media.push({ url: u, kind: 'doc' });
      else                         media.push({ url: u, kind: 'image' }); // défaut: image (passeport/permis signés)
      continue;
    }
    // 🔗 URL inline (emoji + space + url on same line)
    const linkv = /^🔗\s+(https?:\/\/\S+)$/.exec(trimmed);
    if (linkv) {
      const u = linkv[1]!;
      if (VIDEO_EXT.test(u))     media.push({ url: u, kind: 'video' });
      else if (DOC_EXT.test(u))  media.push({ url: u, kind: 'doc' });
      else                        media.push({ url: u, kind: IMAGE_EXT.test(u) ? 'image' : 'doc' });
      continue;
    }
    // Standalone URL line
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      if (VIDEO_EXT.test(trimmed))     media.push({ url: trimmed, kind: 'video' });
      else if (DOC_EXT.test(trimmed))  media.push({ url: trimmed, kind: 'doc'   });
      else if (IMAGE_EXT.test(trimmed) || trimmed.includes('cloudinary') || trimmed.includes('supabase'))
        media.push({ url: trimmed, kind: 'image' });
      else media.push({ url: trimmed, kind: 'doc' }); // unknown URL → treat as download
      continue;
    }
    textLines.push(line);
  }
  return { displayText: textLines.join('\n').trim(), media };
}

// Render text with clickable URLs — doc URLs (.pdf/.xlsx) = bouton téléchargement
function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split(URL_RE);
  return (
    <p style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 300, lineHeight: 1.65, margin: 0, color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {parts.map((part, i) => {
        if (!URL_IS.test(part)) return part;
        const isDoc = DOC_EXT.test(part);
        if (isDoc) {
          const fname = part.split('/').pop()?.split('?')[0] ?? 'fichier';
          const isExcel = /\.xlsx?$/i.test(fname);
          const icon = isExcel ? '📊' : '📄';
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" download={fname}
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.35)',
                borderRadius: 8, padding: '5px 10px', textDecoration: 'none',
                color: '#C9A96E', fontFamily: 'Inter', fontSize: 11, fontWeight: 600,
                marginTop: 4, wordBreak: 'break-all',
              }}>
              {icon} {fname} ⬇
            </a>
          );
        }
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            style={{ color: '#C9A96E', textDecoration: 'underline', wordBreak: 'break-all' }}
            onClick={e => e.stopPropagation()}>
            {part.length > 50 ? part.slice(0, 50) + '…' : part}
          </a>
        );
      })}
    </p>
  );
}

// Graphique (barres / camembert) — rendu maison, thème sombre + or
type ChartSpec = { type?: 'bar' | 'pie' | 'line'; title?: string; data?: Array<{ label: string; value: number }>; unit?: string };
const CHART_COLORS = ['#C9A96E', '#52E3A1', '#00d4ff', '#E8C98A', '#ff8c5a', '#9b8cff', '#ff6b9d', '#7ad1c4'];

function Chart({ spec }: { spec: ChartSpec }) {
  const data = (spec.data ?? []).filter(d => d && typeof d.value === 'number');
  if (!data.length) return null;
  const unit = spec.unit ?? '';
  const fmt = (v: number) => `${v.toLocaleString('fr-FR')}${unit ? ' ' + unit : ''}`;

  const cardRef = useRef<HTMLDivElement>(null);
  const saveChart = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#141414', scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rn = (window as any).ReactNativeWebView;
      if (rn?.postMessage) {
        sendNativeAction({ __native_action: 'save_image_data', data: dataUrl });
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = 'graphique-dzaryx.png'; a.click();
      }
    } catch { /* ignore */ }
  };

  const card = (children: React.ReactNode) => (
    <div ref={cardRef} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: '14px 14px 12px', margin: '8px 0', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        {spec.title ? <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: '#fff' }}>{spec.title}</div> : <span />}
        <button onClick={saveChart} title="Télécharger le graphique" data-html2canvas-ignore="true"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '4px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 13, flexShrink: 0 }}>
          ⤓
        </button>
      </div>
      {children}
    </div>
  );

  if (spec.type === 'pie') {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    let acc = 0; const R = 52, C = 64, cir = 2 * Math.PI * R;
    return card(
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <svg width={C * 2} height={C * 2} viewBox={`0 0 ${C * 2} ${C * 2}`}>
          {data.map((d, i) => {
            const frac = Math.max(0, d.value) / total;
            const dash = frac * cir;
            const el = (
              <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={22} strokeDasharray={`${dash} ${cir - dash}`} strokeDashoffset={-acc * cir}
                transform={`rotate(-90 ${C} ${C})`} />
            );
            acc += frac; return el;
          })}
        </svg>
        <div style={{ flex: 1, minWidth: 120 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.85)', flex: 1 }}>{d.label}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: '#fff', fontWeight: 600 }}>{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // bar (défaut, + 'line' traité comme barres)
  const max = Math.max(...data.map(d => d.value), 1);
  return card(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{d.label}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 12, color: '#fff', fontWeight: 600 }}>{fmt(d.value)}</span>
          </div>
          <div style={{ height: 9, background: 'rgba(255,255,255,0.07)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max(2, (d.value / max) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 5, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Effet "écriture" (streaming) — révèle le texte puis bascule en markdown complet
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const step = Math.max(2, Math.round(text.length / 110));
    const id = setInterval(() => {
      i += step;
      if (i >= text.length) { setN(text.length); clearInterval(id); }
      else setN(i);
    }, 16);
    return () => clearInterval(id);
  }, [text]);
  if (n >= text.length) return <Markdown text={text} />;
  return (
    <div className="dz-md" style={{ whiteSpace: 'pre-wrap' }}>
      {text.slice(0, n)}<span style={{ opacity: 0.5 }}>▍</span>
    </div>
  );
}

// Rendu Markdown (gras, listes, titres, tableaux, code, GRAPHIQUES) — façon ChatGPT/Claude
function Markdown({ text }: { text: string }) {
  return (
    <div className="dz-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          code: ({ node, className, children, ...p }: any) => {
            if (/language-chart/.test(className || '')) {
              try {
                const spec = JSON.parse(String(children).trim()) as ChartSpec;
                return <Chart spec={spec} />;
              } catch { /* JSON invalide → code normal */ }
            }
            return <code className={className} {...p}>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({ msg, actorCol, onRegenerate }: { msg: Message; actorCol: string; onRegenerate?: () => void }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { displayText, media } = parseMessage(msg.text);

  const downloadFile = (url: string) => {
    // Dans l'app native → vraie sauvegarde dans la galerie (via expo-media-library).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rn = (window as any).ReactNativeWebView;
    if (rn?.postMessage) {
      sendNativeAction({ __native_action: 'save_image', url });
    } else {
      // navigateur web → ouvre dans un onglet (appui long → enregistrer)
      window.open(url, '_blank');
    }
  };

  return (
    <>
      {/* Lightbox fullscreen image */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}
        >
          <img src={lightbox} alt="fullscreen"
            style={{ maxWidth: '95vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 12 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={e => { e.stopPropagation(); downloadFile(lightbox); }}
              style={{
                background: '#00d4ff22', border: '1px solid #00d4ff66', borderRadius: 10,
                color: '#00d4ff', fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                padding: '8px 20px', cursor: 'pointer',
              }}
            >⬇ Enregistrer</button>
            <button
              onClick={() => setLightbox(null)}
              style={{
                background: '#ff336622', border: '1px solid #ff336666', borderRadius: 10,
                color: '#ff3366', fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                padding: '8px 20px', cursor: 'pointer',
              }}
            >✕ Fermer</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-start', animation: 'msg-in 0.22s ease' }}>
        <div style={{
          maxWidth: isUser ? '82%' : '95%',
          background: isUser ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: 'none',
          borderRadius: isUser ? '20px 20px 6px 20px' : 0,
          padding: isUser ? '10px 14px' : '2px 0',
        }}>
          {msg.status === 'sending' && !msg.text ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: actorCol, opacity: 0.4, animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite` }} />
              ))}
            </div>
          ) : (
            <>
              {isUser && msg.imagePreview && (
                <img src={msg.imagePreview} alt="photo"
                  onClick={() => setLightbox(msg.imagePreview!)}
                  style={{ display: 'block', marginBottom: displayText ? 7 : 0, width: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover', cursor: 'zoom-in' }} />
              )}
              {displayText && (
                isUser
                  ? <RichText text={displayText} color="rgba(255,255,255,0.92)" />
                  : (msg.fresh ? <Typewriter text={displayText} /> : <Markdown text={displayText} />)
              )}
              {media.map((item, i) => {
                if (item.kind === 'video') return (
                  <video key={i} src={item.url} controls playsInline
                    style={{ display: 'block', marginTop: 8, width: '100%', maxHeight: 280, borderRadius: 10, background: '#000' }} />
                );
                if (item.kind === 'image') return (
                  <div key={i} style={{ marginTop: 8, position: 'relative' }}>
                    <img src={item.url} alt="document"
                      onClick={() => setLightbox(item.url)}
                      style={{ display: 'block', width: '100%', maxHeight: 300, borderRadius: 10, objectFit: 'contain', background: 'rgba(0,0,0,0.2)', cursor: 'zoom-in' }} />
                    <button
                      onClick={() => downloadFile(item.url)}
                      style={{
                        position: 'absolute', bottom: 6, right: 6,
                        background: 'rgba(0,0,0,0.65)', border: '1px solid #ffffff33',
                        borderRadius: 8, color: '#fff', fontFamily: 'Inter', fontSize: 10,
                        padding: '4px 10px', cursor: 'pointer',
                      }}
                    >⬇ Enregistrer</button>
                  </div>
                );
                // doc / excel / pdf
                const filename = item.url.split('/').pop()?.split('?')[0] ?? 'fichier';
                const isExcel = /\.xlsx?$/i.test(filename);
                const isPdf   = /\.pdf$/i.test(filename);
                const icon = isExcel ? '📊' : isPdf ? '📄' : '📎';
                return (
                  <div key={i} style={{ marginTop: 8 }}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={filename}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)',
                        borderRadius: 10, padding: '10px 14px', textDecoration: 'none',
                        color: '#00d4ff',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <div>
                        <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#00d4ff' }}>{filename}</div>
                        <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(0,212,255,0.55)', marginTop: 2 }}>
                          Appuyer pour télécharger
                        </div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: 16 }}>⬇</span>
                    </a>
                  </div>
                );
              })}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 400, color: isUser ? 'rgba(255,180,80,0.3)' : `${actorCol}33`, letterSpacing: '0.03em' }}>{msg.ts}</span>
            <div style={{ display: 'flex', gap: 6 }}>
            {!isUser && onRegenerate && (
              <button
                onClick={onRegenerate}
                aria-label="Régénérer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 14, padding: '5px 12px', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Régénérer
              </button>
            )}
            {!isUser && msg.text && msg.status === 'done' && (
              <button
                onClick={() => { void navigator.clipboard.writeText(parseMessage(msg.text).displayText || msg.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: copied ? `${actorCol}22` : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${copied ? actorCol : 'rgba(255,255,255,0.14)'}`,
                  borderRadius: 14, padding: '5px 12px', cursor: 'pointer',
                  color: copied ? actorCol : 'rgba(255,255,255,0.7)',
                  fontFamily: 'Inter', fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                }}
              >
                {copied ? (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={actorCol} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copié</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copier</>
                )}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TypingIndicator({ actorCol }: { actorCol: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: actorCol, opacity: 0.5,
          animation: `pulse 1.1s ${i * 0.18}s ease-in-out infinite`,
        }} />
      ))}
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
