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
import { OrbIcon } from '../ui/Premium.tsx';

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
  const [selectedImages, setSelectedImages] = useState<{ base64: string; preview: string }[]>([]);
  const [search, setSearch]       = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef              = useRef<HTMLDivElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const docInputRef            = useRef<HTMLInputElement>(null);

  const analyzeDoc = async (file: File) => {
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onloadend = () => res((r.result as string).split(',')[1] ?? '');
      r.onerror = rej; r.readAsDataURL(file);
    });
    const uId = uid(); const aId = uid();
    setMsgs(ms => [...ms,
      { id: uId, role: 'user', text: `📎 ${file.name}`, ts: now(), status: 'done' },
      { id: aId, role: 'ai', text: '', ts: now(), status: 'sending' },
    ]);
    try {
      const r = await api.analyzeFile(b64, file.type || 'application/octet-stream', file.name, input.trim());
      setMsgs(ms => ms.map(m => m.id === aId ? { ...m, text: r.text || r.error || '❌ Analyse impossible', status: 'done', fresh: true } : m));
      setInput('');
    } catch {
      setMsgs(ms => ms.map(m => m.id === aId ? { ...m, text: '❌ Erreur analyse fichier', status: 'error' } : m));
    }
  };
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


  const didInitialScroll = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 1er rendu (historique chargé) : saut INSTANTANÉ tout en bas + plusieurs passes
    // (les images mettent du temps à prendre leur hauteur → on re-saute pour rester en bas).
    if (!didInitialScroll.current && msgs.length > 1) {
      didInitialScroll.current = true;
      const jump = () => { const e = scrollRef.current; if (e) e.scrollTop = e.scrollHeight; };
      jump();
      [80, 250, 600, 1200].forEach(d => setTimeout(jump, d));
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [msgs, streaming]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';
    for (const file of files) {
      try {
        const b64 = await compressImage(file, 1400, 0.78);
        setSelectedImages(prev => prev.length >= 15 ? prev : [...prev, { base64: b64, preview: `data:image/jpeg;base64,${b64}` }]);
      } catch { /* ignore */ }
    }
  }, []);

  // Détecte "enregistre ces photos pour la voiture X" (voiture EXISTANTE)
  const isStoreIntent = (t: string) => /\b(enregistre|range|sauvegarde|stocke|ajoute(?:r)?\s+(?:ces|les|la|au)?)\b/i.test(t) || /voici.*photo|photos?\s+(du|de|des|pour)/i.test(t);
  // Détecte "crée/ajoute une NOUVELLE annonce" (voiture location/vente, immo, pack)
  const isCreateIntent = (t: string) => /\b(cr[ée]e?r?|cree|nouvelle?\s+annonce|publie|met(?:s)?\s+en\s+ligne)\b/i.test(t)
    || /\b(ajoute|rajoute)\b.*\b(voiture|v[ée]hicule|annonce|appartement|villa|maison|local|studio|bien|pack|à\s+louer|à\s+vendre|flotte|location|vente)\b/i.test(t);

  const send = useCallback(async (forced?: string, forcedImg?: { base64: string; preview: string } | null) => {
    const text = (forced ?? input).trim();
    const hasForcedImg = forcedImg !== undefined;
    if ((!text && !selectedImages.length && !forcedImg) || status === 'thinking') return;

    // CAS SPÉCIAL — ranger plusieurs photos sur une voiture EXISTANTE (Supabase)
    if (selectedImages.length && isStoreIntent(text) && !isCreateIntent(text)) {
      const imgs = selectedImages;
      setMsgs(ms => [...ms,
        { id: uid(), role: 'user', text: `${text}  (${imgs.length} photo${imgs.length > 1 ? 's' : ''})`, ts: now(), status: 'done', imagePreview: imgs[0].preview },
        { id: uid(), role: 'ai', text: '', ts: now(), status: 'sending' },
      ]);
      const aiId = uid(); // not used as streamingMsgId here
      void aiId;
      setInput(''); setSelectedImages([]); setStatus('thinking');
      try {
        const r = await api.uploadCarPhotos(text, imgs.map(i => i.base64));
        setMsgs(ms => { const copy = [...ms]; for (let i = copy.length - 1; i >= 0; i--) { if (copy[i].role === 'ai' && copy[i].status === 'sending') { copy[i] = { ...copy[i], text: r.text, status: 'done' }; break; } } return copy; });
      } catch {
        setMsgs(ms => { const copy = [...ms]; for (let i = copy.length - 1; i >= 0; i--) { if (copy[i].role === 'ai' && copy[i].status === 'sending') { copy[i] = { ...copy[i], text: '⚠️ Erreur enregistrement photos', status: 'error' }; break; } } return copy; });
      } finally { setStatus('idle'); }
      return;
    }

    // CAS — créer une annonce AVEC photos jointes : on cache les photos pour la
    // session puis Dzaryx (add_car / create_property / ...) les attache à l'annonce.
    const creatingWithPhotos = selectedImages.length > 0 && isCreateIntent(text);
    const firstPreview = selectedImages[0]?.preview;
    // En création-avec-photos on n'envoie PAS l'image en vision (elles sont cachées côté session).
    const img = creatingWithPhotos ? null : (hasForcedImg ? forcedImg : (selectedImages[0] ?? null));
    const photosToCache = creatingWithPhotos ? selectedImages.map(i => i.base64) : [];

    const userMsg: Message = {
      id: uid(), role: 'user',
      text: creatingWithPhotos ? `${text}  (${selectedImages.length} photo${selectedImages.length > 1 ? 's' : ''})` : (text || '📷 Photo'),
      ts: now(), status: 'done',
      imagePreview: img?.preview ?? firstPreview,
    };
    const aiMsg: Message = { id: uid(), role: 'ai', text: '', ts: now(), status: 'sending' };
    setMsgs(ms => [...ms, userMsg, aiMsg]);
    streamingMsgId.current = aiMsg.id;
    setInput('');
    setSelectedImages([]);
    setStatus('thinking');

    // Upload + cache des photos AVANT d'appeler Dzaryx (sinon le tool create ne les voit pas)
    if (creatingWithPhotos) {
      try { await api.uploadSessionPhotos(sessionId.current, photosToCache); } catch { /* non bloquant */ }
    }

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
  }, [input, status, selectedImages]);

  // Régénérer (façon ChatGPT) : supprime la dernière réponse + le dernier message
  // utilisateur, puis le renvoie À L'IDENTIQUE (texte + image) pour une nouvelle réponse.
  const cleanMsgText = (t: string) => t.replace(/\s*\(\d+\s*photos?\)\s*$/i, '').replace(/^📷 Photo$/, '').trim();
  const imgFromMsg = (m: Message) => (m.imagePreview?.includes('base64,'))
    ? { base64: m.imagePreview.split('base64,')[1]!, preview: m.imagePreview } : null;
  const regenerate = useCallback(() => {
    if (status === 'thinking') return;
    let idx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { idx = i; break; } }
    if (idx < 0) return;
    const lastUser = msgs[idx];
    setMsgs(ms => ms.slice(0, idx));   // retire le dernier user + sa réponse
    void send(cleanMsgText(lastUser.text) || '📷 Photo', imgFromMsg(lastUser));
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Recherche dans l'historique */}
          <button onClick={() => { setShowSearch(s => !s); if (showSearch) setSearch(''); }} style={{
            background: showSearch ? `${col}1c` : 'rgba(255,255,255,0.04)', border: `1px solid ${showSearch ? col + '88' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '50%', width: 38, height: 38, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} aria-label="Rechercher">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showSearch ? col : 'rgba(255,255,255,0.6)'} strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
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
      </div>
      {showSearch && (
        <div style={{ padding: '0 16px 8px' }}>
          <input
            autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher dans la conversation…"
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '9px 13px', color: '#fff', fontFamily: 'Inter', fontSize: 14, outline: 'none' }}
          />
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 12px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {(search.trim()
          ? msgs.filter(m => m.text.toLowerCase().includes(search.trim().toLowerCase()))
          : msgs
        ).map((msg, i, arr) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            actorCol={actorCol}
            onRegenerate={(!search.trim() && i === arr.length - 1 && msg.role === 'ai' && msg.status === 'done') ? regenerate : undefined}
            onEdit={msg.role === 'user' ? () => {
              setInput(cleanMsgText(msg.text)); setShowSearch(false); setSearch('');
              const im = imgFromMsg(msg);
              setSelectedImages(im ? [im] : []);
              setMsgs(ms => { const k = ms.findIndex(m => m.id === msg.id); return k >= 0 ? ms.slice(0, k) : ms; });
            } : undefined}
          />
        ))}
        {search.trim() && !msgs.some(m => m.text.toLowerCase().includes(search.trim().toLowerCase())) && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', fontSize: 13, padding: 20 }}>Aucun résultat</div>
        )}
        {streaming && streamingMsgId.current && (
          <TypingIndicator actorCol={actorCol} />
        )}
      </div>

      {/* Zone de saisie — pill (façon Gemini) */}
      <div style={{ flexShrink: 0, background: '#000', padding: '8px 12px 14px' }}>
        {/* Aperçu photos (multiple) */}
        {selectedImages.length > 0 && (
          <div style={{ padding: '0 4px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {selectedImages.map((im, idx) => (
              <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                <img src={im.preview} alt="preview"
                  style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)' }} />
                <button onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))} style={{
                  position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.22)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>
                  <span style={{ fontSize: 10, color: '#fff', lineHeight: 1 }}>✕</span>
                </button>
              </div>
            ))}
            <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {selectedImages.length} photo{selectedImages.length > 1 ? 's' : ''} — dis "enregistre pour le [voiture]" pour les ranger
            </span>
          </div>
        )}

        {/* Hidden file input (multiple) */}
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImageSelect} />
        {/* Hidden doc input (PDF / Excel / CSV) */}
        <input ref={docInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void analyzeDoc(f); }} />

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
              background: selectedImages.length ? `${col}1c` : 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={selectedImages.length ? col : 'rgba(255,255,255,0.55)'} strokeWidth="1.8" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* 📎 Joindre un PDF / Excel à analyser */}
          <button
            onClick={() => docInputRef.current?.click()}
            aria-label="Joindre un document (PDF/Excel)"
            style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginBottom: 1, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={selectedImages.length ? 'Ajoute un message…' : 'Message à Dzaryx'}
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
            onClick={() => { unlockAudio(); if (input.trim() || selectedImages.length) send(); else onNavigateVoice(); }}
            disabled={status === 'thinking'}
            aria-label={(input.trim() || selectedImages.length) ? 'Envoyer' : 'Mode vocal'}
            style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: (input.trim() || selectedImages.length) ? col : 'rgba(255,255,255,0.10)',
              border: 'none', cursor: status === 'thinking' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            {status === 'thinking' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.2" strokeLinecap="round" style={{ animation: 'spin-slow 1s linear infinite' }}>
                <circle cx="12" cy="12" r="9" strokeOpacity="0.3" /><path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
            ) : (input.trim() || selectedImages.length) ? (
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
const CHART_COLORS = ['#C9A96E', '#52E3A1', '#10b981', '#E8C98A', '#ff8c5a', '#9b8cff', '#ff6b9d', '#7ad1c4'];

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

function MessageBubble({ msg, actorCol, onRegenerate, onEdit }: { msg: Message; actorCol: string; onRegenerate?: () => void; onEdit?: () => void }) {
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
                background: '#10b98122', border: '1px solid #10b98166', borderRadius: 10,
                color: '#10b981', fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
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

      <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-start', gap: 9, marginBottom: 12, animation: 'msg-in 0.22s ease' }}>
        {!isUser && (
          <div style={{ flexShrink: 0, marginTop: 2 }}><OrbIcon size={28} /></div>
        )}
        <div style={{
          maxWidth: isUser ? '82%' : '86%',
          background: isUser ? 'rgba(16,185,129,0.16)' : '#16161c',
          border: isUser ? '1px solid rgba(16,185,129,0.32)' : '1px solid rgba(255,255,255,0.07)',
          borderRadius: isUser ? '20px 20px 6px 20px' : '6px 18px 18px 18px',
          padding: '12px 14px',
          boxShadow: isUser ? 'none' : '0 2px 10px rgba(0,0,0,0.25)',
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
                        background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: 10, padding: '10px 14px', textDecoration: 'none',
                        color: '#10b981',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <div>
                        <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#10b981' }}>{filename}</div>
                        <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(16,185,129,0.55)', marginTop: 2 }}>
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
            {isUser && onEdit && (
              <button
                onClick={onEdit}
                aria-label="Éditer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 14, padding: '5px 12px', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Éditer
              </button>
            )}
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
