import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio, stopAudio, isAudioPlaying,
  sendNativeAction, tryParseNativeAction,
  type DzaryxStatus,
} from '../../services/api.ts';

interface Props {
  onNavigateText: () => void;
  onWsStatus: (ok: boolean) => void;
  actor?: 'kouider' | 'houari';
  compact?: boolean;  // overlay barre fine (façon Gemini)
}

// Palette or Dzaryx — un seul hue, intensité varie selon l'état (calme façon Gemini)
const STATE_COLOR: Record<DzaryxStatus, string> = {
  idle:      '#C9A96E',
  listening: '#E8C98A',
  thinking:  '#D4B87A',
  speaking:  '#E8C98A',
};

const STATE_MSG: Record<DzaryxStatus, string> = {
  idle:      'Sur quoi puis-je vous aider ?',
  listening: 'Je vous écoute…',
  thinking:  'Un instant…',
  speaking:  'Dzaryx répond',
};

// VAD à 2 seuils — capture le DÉBUT du mot (sinon Whisper comprend de travers).
// ARM (bas) = on enregistre dès le 1er son → le début du mot n'est jamais coupé.
// SPEECH (haut) = on CONFIRME que c'est de la vraie voix ; sinon on JETTE (= bruit, pas envoyé à Whisper).
// Seuils calibrés sur le micro réel de Kouider :
//   ambiant (silence) ≈ 3.8 (rms 0.0038)  ·  voix ≈ 6-8 (rms 0.006-0.008)
// Le seuil de SILENCE doit être ENTRE l'ambiant et la voix, sinon :
//   - trop bas (< ambiant) → le système croit qu'on parle tout le temps → n'envoie jamais
//   - trop haut (> voix)   → la voix est prise pour du silence → jamais confirmée
const ARM_RMS       = 0.005;  // démarre l'enregistrement quand ça monte au-dessus de l'ambiant
const SPEECH_RMS    = 0.0058; // confirme une vraie parole (voix 6-8 passe largement)
const SILENCE_RMS   = 0.0048; // au-dessus de l'ambiant (3.8) → on détecte bien la fin de parole → on envoie
const SILENCE_DELAY = 1300;   // ms de silence après parole avant d'envoyer (laisse le temps de respirer/réfléchir entre les mots, sinon ça coupe)
const MIN_SPEECH_MS = 280;    // garde "oui/non/vas-y", jette les blips < 0,28s
const NO_SPEECH_MS  = 1500;   // armé par un bruit mais aucune vraie voix → on jette
const MAX_REC_MS    = 15000;

// Persiste l'état "audio débloqué" pour toute la session de page (survit aux
// changements d'onglet VOIX↔CHAT). Une fois l'utilisateur a tapé une fois,
// l'audio est débloqué au niveau navigateur → inutile de redemander à chaque
// retour sur l'écran Voix.
let sessionAudioUnlocked = false;

// Extrait les URLs d'images d'une réponse (ex: passeport/permis client envoyé
// par le backend) pour les afficher EN MODE VOIX aussi (avant: texte seul).
const IMG_URL_RE = /https?:\/\/[^\s\])"']+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?[^\s\])"']*)?/gi;
function imageUrlsFrom(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(IMG_URL_RE)) out.add(m[0]);
  return [...out];
}

// Stream micro partagé pour toute la session de page : on le garde ouvert quand on
// change d'onglet (VOIX↔CHAT) → pas de nouvel appel getUserMedia → iOS ne redemande
// PAS la permission à chaque retour. (Le re-prompt au lancement de l'app reste une
// limite iOS pour les sites web — installer en PWA / autoriser dans Réglages Safari.)
let sharedMicStream: MediaStream | null = null;

export default function VoiceScreen({ onNavigateText, onWsStatus, compact = false }: Props) {
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const animRef         = useRef<number>(0);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const chunksRef       = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const speechStartRef  = useRef<number>(0);
  const armStartRef     = useRef<number>(0);
  const realSpeechRef   = useRef(false);
  const isSpeechRef     = useRef(false);
  const isRecordingRef  = useRef(false);
  const sessionId       = useRef(getOrCreateSessionId());

  const [status, setStatus]     = useState<DzaryxStatus>('idle');
  const [, setLabel]            = useState<string | null>(null);
  const [response, setResp]     = useState('');
  const [respStream, setStream] = useState('');
  const [scanActive, setScanActive] = useState(false);
  const [micErr, setMicErr]     = useState(false);
  const [wsConn, setWsConn]     = useState(false);
  const [visionActive, setVision] = useState(false);
  const [camActive, setCamActive] = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const facingModeRef = useRef<'environment' | 'user'>('environment');
  facingModeRef.current = facingMode;
  const [particles]             = useState(() => makeParticles(30));
  const [, setHud]              = useState('SYSTÈME DZARYX INITIALISÉ');
  const [audioUnlocked, setAudioUnlocked] = useState(sessionAudioUnlocked);
  const [rmsLevel, setRmsLevel] = useState(0);
  const rmsRef = useRef(0);
  const [respExpanded, setRespExpanded] = useState(false);

  const [liveText, setLiveText] = useState('');   // transcription live (ce que TU dis)
  const srDictationRef = useRef(false);            // SpeechRecognition pilote la conversation (Android)
  const soundPlayedRef = useRef(false);            // son d'activation joué une fois
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRecRef       = useRef<any>(null);        // instance SpeechRecognition courante
  const srWantedRef    = useRef(false);            // on VEUT écouter (vrai tant qu'on est sur l'écran)
  const srSilenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null); // timer fin-de-tour
  const srLastTextRef  = useRef('');               // dernier interim (pour finaliser au silence)

  const statusRef = useRef(status);
  statusRef.current = status;

  // Son d'activation micro — chime synthétisé doux et pro (façon Gemini), via WebAudio
  function playChime(kind: 'open' | 'listen' = 'listen') {
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
      const AC = Ctx.AudioContext ?? Ctx.webkitAudioContext;
      if (!AC) return;
      const ctx = audioCtxRef.current && audioCtxRef.current.state !== 'closed' ? audioCtxRef.current : new AC();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime;
      // 2 notes douces ascendantes (sine) avec enveloppe lente = son premium
      const notes = kind === 'open' ? [523.25, 783.99] : [659.25, 987.77]; // C5→G5 / E5→B5
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const start = t0 + i * 0.085;
        const peak = 0.13;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(start); osc.stop(start + 0.34);
      });
    } catch { /* ignore */ }
  }
  function playActivationSound() { playChime('open'); }   // ouverture du mode vocal

  // Envoie un texte (dicté par SpeechRecognition) à Dzaryx + joue la réponse
  async function processUserText(text: string) {
    const t = text.trim();
    if (!t) return;
    if (statusRef.current === 'thinking') return;
    setLiveText('');
    setResp('');
    setStatus('thinking');
    try {
      const frame = captureFrame();
      const res = await api.chat(t, sessionId.current, frame, frame ? 'image/jpeg' : undefined);
      if (res.text) {
        const nativeAction = tryParseNativeAction(res.text);
        if (nativeAction) {
          sendNativeAction(nativeAction);
          const h = Number(nativeAction['hour'] ?? 0);
          const m = Number(nativeAction['minute'] ?? 0);
          setResp(`✅ Alarme créée pour ${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`);
        } else {
          setResp(res.text);
          if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
        }
      }
    } catch {
      setHud('Erreur — réessaie');
    } finally {
      if ((statusRef.current as string) === 'thinking') setStatus('idle');
    }
  }

  // SpeechRecognition (Google STT navigateur) = comme Gemini, mais avec gestion stricte des tours :
  // - écoute UNIQUEMENT quand Dzaryx ne parle/réfléchit pas (sinon il s'entend lui-même → croit que tu parles)
  // - fin de tour détectée par SILENCE (~1,1s sans nouveau mot) → il sait que t'as fini → il répond
  // Dispo Android (WebView Chrome). iOS WKWebView : indispo → fallback VAD+Whisper.
  function clearSrSilence() {
    if (srSilenceRef.current) { clearTimeout(srSilenceRef.current); srSilenceRef.current = null; }
  }

  function srFinalize(text: string) {
    clearSrSilence();
    const t = text.trim();
    srLastTextRef.current = '';
    setLiveText('');
    stopSR();                 // on coupe l'écoute pendant qu'il traite/parle
    if (t) void processUserText(t);
  }

  function startSRDictation(): boolean {
    // SpeechRecognition (Google) est CASSÉ dans la WebView Android de Kouider (aucun résultat,
    // pas d'erreur → micro gelé). On le DÉSACTIVE partout → VAD+Whisper (fiable, marchait avant).
    return false;
  }

  function beginSR() {
    if (!srWantedRef.current) return;
    if (srRecRef.current) return;                                   // déjà en écoute
    if (statusRef.current === 'thinking' || statusRef.current === 'speaking') return; // pas pendant qu'il parle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.continuous = true;
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.onstart = () => setWakeWordOn(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setWakeWordOn(false);
      // SpeechRecognition indisponible (fréquent dans la WebView overlay) → on BASCULE
      // définitivement sur le VAD+Whisper (sinon le micro reste gelé).
      const fatal = e && (e.error === 'not-allowed' || e.error === 'service-not-allowed'
        || e.error === 'audio-capture' || e.error === 'language-not-supported');
      if (fatal) {
        srWantedRef.current = false;
        srDictationRef.current = false; // réactive le VAD (tick) → écoute via Whisper
        stopSR();
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // Sécurité : si Dzaryx parle/réfléchit, on ignore (il ne doit pas s'entendre)
      if (statusRef.current === 'thinking' || statusRef.current === 'speaking') return;
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i]![0]!.transcript as string;
        if (e.results[i]!.isFinal) final += tr; else interim += tr;
      }
      if (final.trim()) { srFinalize(final); return; }
      if (interim.trim()) {
        setLiveText(interim);
        srLastTextRef.current = interim;
        if (statusRef.current === 'idle') setStatus('listening');
        // fin de tour par silence : plus aucun mot pendant 1,1s → on finalise
        clearSrSilence();
        srSilenceRef.current = setTimeout(() => srFinalize(srLastTextRef.current), 1100);
      }
    };
    rec.onend = () => {
      setWakeWordOn(false);
      srRecRef.current = null;
      // relance si on veut toujours écouter ET qu'il ne parle/réfléchit pas
      if (srWantedRef.current && statusRef.current !== 'thinking' && statusRef.current !== 'speaking') {
        setTimeout(() => beginSR(), 200);
      }
    };
    try { rec.start(); srRecRef.current = rec; } catch { /* ignore */ }
  }

  function stopSR() {
    clearSrSilence();
    const rec = srRecRef.current;
    srRecRef.current = null;
    if (rec) { try { rec.onend = null; rec.abort(); } catch { /* ignore */ } }
    setWakeWordOn(false);
  }

  // Conversation continue activée par DÉFAUT (comme Gemini Live) :
  // mains-libres = le VAD s'arme tout seul au son, sans toucher l'orbe ;
  // continu = re-écoute automatiquement après chaque réponse → vraie conversation.
  // App normale = conversation continue (SR Google). Overlay (compact) = push-to-talk
  // (tap micro → 1 tour → réponse) car le VAD continu flicke dans la WebView overlay.
  const [continuousMode, setContinuousMode] = useState(false);
  const continuousModeRef = useRef(false);
  continuousModeRef.current = continuousMode;
  const prevStatusRef = useRef<DzaryxStatus>('idle');

  const [handsFree, setHandsFree]         = useState(false);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;
  const [wakeWordOn, setWakeWordOn]       = useState(false);

  // ── Socket.IO ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const sock = connectSocket(sessionId.current, {
      onStatus:        (s, l) => { setStatus(s); setLabel(l ?? null); },
      onAudio:             b64 => playBase64Audio(b64),
      onAudioChunk:        b64 => enqueueChunk(b64),
      onAudioComplete:     ()  => flushChunks(),
      onAudioSentenceDone: ()  => flushChunks(),
      onTextChunk:     c   => setStream(s => s + c),
      onTextComplete:  t   => { setResp(t); setStream(''); },
      onResponse:      (t, _fb) => { setResp(t); setStream(''); },
      onProactive:     t   => { setHud(t); setResp(t); },
    });
    sock.on('connect',    () => { setWsConn(true);  onWsStatus(true); });
    sock.on('disconnect', () => { setWsConn(false); onWsStatus(false); });
    return () => disconnectSocket();
  }, [onWsStatus]);

  // ── Continuous voice mode — auto-restart after TTS completes ──────────────
  useEffect(() => {
    // Mode continu Whisper (fallback iOS uniquement) — quand SR pilote, c'est l'effet SR qui reprend l'écoute
    if (!srDictationRef.current && prevStatusRef.current === 'speaking' && status === 'idle' && continuousModeRef.current) {
      setTimeout(() => {
        if (statusRef.current === 'idle' && !isRecordingRef.current) {
          setHud('🔄 MODE CONTINU — J\'ÉCOUTE...');
          startRecording();
        }
      }, 400);
    }
    prevStatusRef.current = status;
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── SR : pause quand Dzaryx réfléchit/parle, reprend quand il a fini ──────────
  useEffect(() => {
    if (!srDictationRef.current) return;
    if (status === 'thinking' || status === 'speaking') {
      stopSR();                                   // il ne s'entend plus lui-même
    } else {
      setTimeout(() => beginSR(), 150);           // idle/listening → on (re)écoute
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Native wake word bridge (Porcupine via React Native injectJavaScript) ────
  useEffect(() => {
    const activate = (skipGreeting = false) => {
      if (statusRef.current === 'speaking') {
        stopAudio();
        setStatus('idle');
        setTimeout(() => startRecording(), 200);
        return;
      }
      if (statusRef.current !== 'idle' || isRecordingRef.current) return;
      setHud('🎤 DZARYX ACTIVÉ — J\'ÉCOUTE');
      if (skipGreeting || handsFreeRef.current) {
        startRecording();
        return;
      }
      try {
        const utter = new SpeechSynthesisUtterance('Je suis à ton écoute');
        utter.lang = 'fr-FR'; utter.rate = 1.15; utter.pitch = 1.0;
        utter.onend = () => startRecording();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {
        startRecording();
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__triggerWakeWord = () => activate(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__triggerWakeWordFast = () => activate(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__triggerVision = () => { unlockAudio(); toggleLiveCam(); };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__triggerWakeWord;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__triggerWakeWordFast;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__triggerVision;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic init ────────────────────────────────────────────────────────────────
  const micInitRef = useRef(false);

  async function initMic() {
    if (micInitRef.current) return;
    micInitRef.current = true;
    drawCanvas();
    try {
      // Réutilise le stream déjà ouvert cette session (pas de re-prompt iOS au
      // changement d'onglet). Sinon en demande un nouveau (déclenche la permission).
      let stream = sharedMicStream;
      const live = !!stream && stream.getAudioTracks().some(t => t.readyState === 'live');
      if (!live) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        sharedMicStream = stream;
      }
      if (!stream) throw new Error('Stream micro indisponible');
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
      if (!soundPlayedRef.current) { soundPlayedRef.current = true; playActivationSound(); }
      // Android (WebView Chrome) : SpeechRecognition pilote la conversation (comme Gemini).
      // iOS WKWebView : indispo → fallback wake word + VAD/Whisper.
      const srOk = startSRDictation();
      if (!srOk) startWakeWord();
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
      srWantedRef.current = false; srDictationRef.current = false; stopSR(); // stoppe l'écoute au changement d'onglet
      // NE PAS couper le micro partagé (sharedMicStream) au changement d'onglet :
      // on le garde ouvert pour éviter qu'iOS redemande la permission au retour.
      // On coupe seulement la caméra + l'AudioContext (recréé à la prochaine init).
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // Retour sur l'écran Voix après l'avoir déjà débloqué une fois cette session :
  // réactive le micro automatiquement (plus besoin de re-taper "ACTIVER DZARYX").
  useEffect(() => {
    if (sessionAudioUnlocked) { initMic(); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // OVERLAY : auto-activation (pas de tap). Micro ouvert direct + "Je suis à ton écoute".
  useEffect(() => {
    if (!compact) return;
    const t = setTimeout(() => {
      sessionAudioUnlocked = true;
      unlockAudio();
      setAudioUnlocked(true);
      initMic();
      // Push-to-talk : pas d'écoute auto (le VAD est off en overlay). Juste le greeting,
      // puis l'utilisateur tape le micro pour parler (tap = enregistre, re-tap = envoie).
      try {
        const u = new SpeechSynthesisUtterance('Je suis à ton écoute, appuie sur le micro pour me parler');
        u.lang = 'fr-FR'; u.rate = 1.1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(t);
  }, [compact]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Watchdog mains-libres : garde le micro vivant sans aucun bouton ──────────
  // Toutes les 3s : si "thinking" est bloqué trop longtemps → on débloque ;
  // si le micro a été coupé (track morte, iOS, interruption) → on le relance.
  const thinkingSinceRef = useRef(0);
  useEffect(() => {
    if (status === 'thinking') { if (!thinkingSinceRef.current) thinkingSinceRef.current = Date.now(); }
    else thinkingSinceRef.current = 0;
  }, [status]);
  useEffect(() => {
    const wd = setInterval(() => {
      if (!sessionAudioUnlocked) return; // pas encore activé une 1ère fois
      // 1) "thinking" figé > 22s → débloque (sinon micro gelé)
      if (statusRef.current === 'thinking' && thinkingSinceRef.current && Date.now() - thinkingSinceRef.current > 22_000) {
        setStatus('idle'); setHud('PRÊT — PARLE-MOI'); thinkingSinceRef.current = 0;
      }
      // 2) micro coupé (stream mort) alors qu'on est au repos → on relance
      const live = !!streamRef.current && streamRef.current.getAudioTracks().some(t => t.readyState === 'live');
      if (!live && statusRef.current !== 'speaking' && statusRef.current !== 'thinking') {
        micInitRef.current = false; // autorise une ré-init
        initMic();
      }
    }, 3000);
    return () => clearInterval(wd);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live camera ─────────────────────────────────────────────────────────────
  async function toggleLiveCam() {
    if (camActive) {
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamActive(false);
      setVision(false);
      setHud('CAMÉRA DÉSACTIVÉE');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingModeRef.current }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      setCamActive(true);
      setVision(true);
      setHud('CAMÉRA ACTIVE — PARLE PENDANT QUE TU FILMES');
    } catch {
      setHud('PERMISSION CAMÉRA REFUSÉE');
    }
  }

  // Bascule caméra avant ↔ arrière (comme Gemini)
  async function flipCam() {
    const next = facingModeRef.current === 'environment' ? 'user' : 'environment';
    facingModeRef.current = next;
    setFacingMode(next);
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
    } catch {
      setHud('Bascule caméra impossible');
    }
  }

  function captureFrame(): string | undefined {
    const video = videoRef.current;
    if (!video || !camStreamRef.current || video.readyState < 2) return undefined;
    const w = video.videoWidth || 640, h = video.videoHeight || 480;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  }

  // ── Wake word (SpeechRecognition API — browser fallback for Porcupine) ───────
  const WAKE_RE = /\b(dzaryx|dzari|hey dzaryx|ibrahim|hey ibrahim|dzarieks)\b/;
  function startWakeWord() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.continuous     = true;
    rec.lang           = 'fr-FR';
    rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onstart  = () => setWakeWordOn(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror  = () => setWakeWordOn(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i]![0]!.transcript as string).toLowerCase();
        if (WAKE_RE.test(t)) {
          if (statusRef.current === 'idle' && !isRecordingRef.current) {
            setHud('🎤 WAKE WORD — DZARYX ACTIVÉ');
            if (handsFreeRef.current) {
              startRecording();
            } else {
              try {
                const utter = new SpeechSynthesisUtterance('Je suis à ton écoute');
                utter.lang = 'fr-FR'; utter.rate = 1.15;
                utter.onend = () => startRecording();
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
              } catch { startRecording(); }
            }
          } else if (statusRef.current === 'speaking') {
            stopAudio();
            setStatus('idle');
            setTimeout(() => startRecording(), 100);
          }
        }
      }
    };
    rec.onend = () => {
      setWakeWordOn(false);
      setTimeout(() => { try { rec.start(); } catch { /* ignore */ } }, 300);
    };
    try { rec.start(); } catch { /* ignore */ }
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────
  function startVAD() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const timeBuf = new Uint8Array(analyser.fftSize);
    const a = analyser;
    function tick() {
      if (statusRef.current === 'thinking') {
        requestAnimationFrame(tick); return;
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
      // VAD désactivé par DÉFAUT (handsFree off) : trop instable sur ce micro (flicker arm/désarm).
      // → push-to-talk (tap micro = démarre, re-tap = envoie). Le VAD continu ne tourne QUE si
      // l'utilisateur active "Mains libres". On garde le RMS (calculé au-dessus) pour l'orbe.
      if (!handsFreeRef.current) { requestAnimationFrame(tick); return; }
      if (statusRef.current === 'idle' && !isRecordingRef.current) {
        const hint = handsFreeRef.current ? 'PARLE-MOI' : 'TAPE 🎤 POUR PARLER';
        setHud(`MIC: ${(rms * 1000).toFixed(1)} | SEUIL: ${(SPEECH_RMS * 1000).toFixed(1)} | ${hint}`);
      }
      if (rms > ARM_RMS) {
        // 1er son → on enregistre TOUT DE SUITE (capture le début du mot, jamais coupé).
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        // Auto-armement (écoute sans bouton) UNIQUEMENT en mode mains-libres.
        // Sinon (défaut) on n'enregistre QUE quand l'utilisateur tape MICRO → on ne
        // capte plus l'ambiant ni les autres voix → Dzaryx comprend bien ce qu'IL dit.
        if (!isRecordingRef.current && handsFreeRef.current) { startRecording(true); armStartRef.current = Date.now(); }
        if (rms > SPEECH_RMS) {
          // Vraie voix confirmée → BARGE-IN : si Dzaryx parle (ou audio en cours), on le COUPE
          // tout de suite (comme Gemini) — indépendant du statut, basé sur l'audio réellement joué.
          if (statusRef.current === 'speaking' || isAudioPlaying()) { stopAudio(); setStatus('idle'); }
          if (!realSpeechRef.current) { realSpeechRef.current = true; speechStartRef.current = Date.now(); setStatus('listening'); }
        } else if (isRecordingRef.current && !realSpeechRef.current && Date.now() - armStartRef.current > NO_SPEECH_MS) {
          // Armé par un bruit, jamais de vraie voix → on jette (pas envoyé à Whisper)
          discardRecording();
        }
      } else {
        // Calme (sous ARM)
        if (isRecordingRef.current && realSpeechRef.current) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null;
              const dur = Date.now() - speechStartRef.current;
              if (dur > MIN_SPEECH_MS) stopRecordingAndProcess();
              else discardRecording();
            }, SILENCE_DELAY);
          }
        } else if (isRecordingRef.current && !realSpeechRef.current && Date.now() - armStartRef.current > 400) {
          // Armé par un blip puis calme, pas de vraie voix → jeter vite
          discardRecording();
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  // silent=true → armement VAD (on enregistre sans afficher "écoute" tant que la vraie voix n'est pas confirmée)
  function startRecording(silent = false) {
    const stream = streamRef.current;
    if (!stream || isRecordingRef.current) return;
    isRecordingRef.current = true;
    realSpeechRef.current  = !silent;       // démarrage manuel/wake = tour de parole confirmé d'office
    armStartRef.current    = Date.now();
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.start(100);
    recorderRef.current = rec;
    if (!silent) {
      speechStartRef.current = Date.now();
      setStatus('listening');
      setHud('ENREGISTREMENT EN COURS...');
      playChime('listen');   // joli son à l'activation du micro (tap-to-talk)
    }
    setTimeout(() => {
      if (!isRecordingRef.current) return;
      if (realSpeechRef.current) stopRecordingAndProcess();
      else discardRecording();
    }, MAX_REC_MS);
  }

  // Jette l'enregistrement en cours sans le transcrire (bruit, pas de vraie voix)
  function discardRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== 'inactive') { try { rec.onstop = null; rec.stop(); } catch { /* ignore */ } }
    chunksRef.current = [];
    resetVAD();
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
      const frame = captureFrame();
      const res = await api.chat(text, sessionId.current, frame, frame ? 'image/jpeg' : undefined);
      if (frame) setHud(`📷 + 🎤 "${text.slice(0, 40)}"`);
      if (res.text) {
        const nativeAction = tryParseNativeAction(res.text);
        if (nativeAction) {
          sendNativeAction(nativeAction);
          const h = Number(nativeAction['hour'] ?? 0);
          const m = Number(nativeAction['minute'] ?? 0);
          const confirmText = `✅ Alarme créée pour ${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
          setResp(confirmText);
          setHud(confirmText);
        } else {
          setResp(res.text);
          setHud(res.text.slice(0, 80) + (res.text.length > 80 ? '…' : ''));
          if (res.audio) { unlockAudio(); await playBase64Audio(res.audio); }
        }
      }
    } catch (err) {
      console.error('[voice] error:', err);
      setStatus('idle');
      setHud('ERREUR — RÉESSAIE');
    } finally {
      // Toujours revenir à idle après traitement (sauf si Dzaryx parle encore).
      // Sinon le statut reste bloqué sur "thinking" → le VAD se fige → micro mort.
      if (statusRef.current === 'thinking') setStatus('idle');
    }
  }

  function resetVAD() {
    isRecordingRef.current = false;
    isSpeechRef.current    = false;
    realSpeechRef.current  = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (statusRef.current !== 'speaking' && statusRef.current !== 'thinking') setStatus('idle');
  }

  // ── Canvas background ───────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2;

    function frame(t: number) {
      animRef.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      const rms   = rmsRef.current;
      const pulse = Math.sin(t * 0.002) * 0.5 + 0.5;
      const amp   = Math.max(rms * 3, pulse * 0.06);
      const col   = STATE_COLOR[statusRef.current];

      // Lueur ambiante douce qui monte du bas (façon Gemini)
      const glow = ctx.createRadialGradient(cx, H * 1.02, 0, cx, H * 1.02, H * 0.6);
      glow.addColorStop(0, hexToRgba(col, 0.10 + amp * 0.06));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Particules très discrètes (poussière d'or)
      particles.forEach((p, idx) => {
        p.y -= p.vy * (1 + amp) * 0.6;
        p.x += Math.sin(t * 0.001 + idx) * 0.15;
        p.life -= 0.0015;
        if (p.life <= 0) {
          p.x = Math.random() * W;
          p.y = H + 10;
          p.life = 0.4 + Math.random() * 0.6;
          p.vy = 0.15 + Math.random() * 0.3;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(col, p.life * 0.12);
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
  const displayText = respStream || response;
  const isListening = status === 'listening';
  const isThinking  = status === 'thinking';
  const isSpeaking  = status === 'speaking';
  const orbActive   = isListening || isSpeaking || isThinking;
  const DIM = 'rgba(255,255,255,0.42)';

  // ── BARRE FINE (overlay façon Gemini) ─────────────────────────────────────
  if (compact) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/ibrahim/';
    const micTap = () => {
      if (status === 'idle' && !isRecordingRef.current) {
        unlockAudio();
        if (streamRef.current) { startRecording(); } else { setHud('Micro non activé'); }
      } else if (status === 'listening') {
        stopRecordingAndProcess();
      } else if (status === 'speaking') {
        stopAudio(); setStatus('idle');
      }
    };
    const barText = !audioUnlocked
      ? 'Appuyez pour activer'
      : (liveText || displayText || STATE_MSG[status]);
    const activate = () => {
      sessionAudioUnlocked = true; unlockAudio(); setAudioUnlocked(true); initMic();
    };
    return (
      <div style={{
        width: '100%', height: '100%', background: '#0a0a0a',
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 46px 0 12px',
        position: 'relative', overflow: 'hidden',
        borderBottom: `1px solid ${col}33`,
      }}>
        {/* halo bas */}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 140% at 50% 130%, ${col}1f, transparent 60%)`, pointerEvents: 'none' }} />

        {/* logo */}
        <img src={`${base}logo.png`} alt="Dzaryx"
          style={{ width: 34, height: 34, objectFit: 'contain', flexShrink: 0,
            filter: `drop-shadow(0 0 8px ${col}66)`,
            animation: orbActive ? 'corePulse 1.4s ease-in-out infinite' : 'none' }} />

        {/* texte (live / réponse / état) */}
        <div
          onClick={!audioUnlocked ? activate : undefined}
          style={{
            flex: 1, minWidth: 0, color: liveText ? '#E8C98A' : 'rgba(255,255,255,0.9)',
            fontFamily: 'Inter', fontSize: 13, fontWeight: 300, lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', cursor: !audioUnlocked ? 'pointer' : 'default',
          }}
        >
          {barText}
        </div>

        {/* caméra → ouvre l'app (racine = WebView, pas de route 404) en mode vision */}
        <button onClick={() => { window.location.href = 'dzaryx://?vision=1'; }} aria-label="Caméra"
          style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
          <svg width="18" height="14" viewBox="0 0 24 18" fill="none" stroke={col} strokeWidth="1.6" strokeLinecap="round">
            <path d="M1 9C4 3.5 8 1 12 1s8 2.5 11 8c-3 5.5-7 8-11 8S4 14.5 1 9z" />
            <circle cx="12" cy="9" r="3.5" />
          </svg>
        </button>

        {/* mic / état */}
        <button onClick={!audioUnlocked ? activate : micTap} aria-label="Micro"
          style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: orbActive ? `linear-gradient(180deg, ${col}44, ${col}18)` : `${col}1f`,
            border: `1px solid ${orbActive ? col : col + '66'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: isListening ? `0 0 ${14 + rmsLevel * 26}px ${col}aa` : `0 0 12px ${col}44`,
            transition: 'box-shadow 0.08s linear',
          }}>
          {isListening ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 18 }}>
              {[0.5, 0.9, 0.7].map((h, i) => (
                <div key={i} style={{ width: 3, borderRadius: 2, background: col,
                  height: `${Math.max(5, h * (0.4 + rmsLevel * 1.6) * 18)}px`, transition: 'height 0.08s linear' }} />
              ))}
            </div>
          ) : isThinking ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin-slow 1.2s linear infinite' }}>
              <circle cx="12" cy="12" r="9" strokeOpacity="0.25" /><path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" fill={col} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={col} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <line x1="12" y1="18" x2="12" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ width: '100%', height: '100%', background: '#000000', position: 'relative', overflow: 'hidden' }}
    >
      {/* Canvas background */}
      <canvas ref={canvasRef} width={347} height={704}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* ── HEADER (minimal, façon Gemini) ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
        padding: '14px 18px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Connexion + nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsConn ? '#52E3A1' : '#FF5A5A',
            boxShadow: `0 0 8px ${wsConn ? '#52E3A1' : '#FF5A5A'}`,
          }} />
          <span style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.01em' }}>
            Dzaryx
          </span>
          {wakeWordOn && (
            <span style={{ fontFamily: 'Inter', fontSize: 9, color: `${col}99`, letterSpacing: '0.08em', marginLeft: 2 }}>· à l'écoute</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Overlay flottant (par-dessus les autres apps) — natif Android uniquement */}
          {!(typeof location !== 'undefined' && location.search.includes('overlay')) && (
            <button
              onClick={() => sendNativeAction({ __native_action: 'open_overlay' })}
              title="Ouvrir en overlay par-dessus les autres apps"
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 16, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 13, fontWeight: 500,
                color: 'rgba(255,255,255,0.55)', transition: 'all 0.2s ease',
              }}
            >
              ⧉
            </button>
          )}

          {/* Mains-libres */}
          <button
            onClick={() => setHandsFree(h => !h)}
            style={{
              background: handsFree ? `${col}1c` : 'transparent',
              border: `1px solid ${handsFree ? col + '88' : 'rgba(255,255,255,0.14)'}`,
              borderRadius: 16, padding: '4px 12px', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
              color: handsFree ? col : 'rgba(255,255,255,0.4)',
              letterSpacing: '0.02em', transition: 'all 0.2s ease',
            }}
          >
            {handsFree ? 'Mains libres' : 'Manuel'}
          </button>
        </div>
      </div>

      {/* ── ÉTOILE DZARYX (centre, façon Gemini) ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '33%',
        display: 'flex', justifyContent: 'center', zIndex: 5, pointerEvents: 'none',
      }}>
        <Sparkle col={col} active={orbActive} />
      </div>

      {/* ── TEXTE CENTRAL (salutation / réponse) ── */}
      <div style={{
        position: 'absolute', top: '42%', left: 0, right: 0, zIndex: 6,
        padding: '0 26px', textAlign: 'center',
        maxHeight: '38%', display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {liveText ? (
          <div style={{
            fontFamily: 'Inter', fontSize: 21, fontWeight: 300,
            color: '#E8C98A', lineHeight: 1.4, letterSpacing: '0.01em', fontStyle: 'italic',
          }}>
            {liveText}
          </div>
        ) : displayText ? (
          <div
            onClick={() => setRespExpanded(e => !e)}
            style={{
              fontFamily: 'Inter', fontSize: 18, fontWeight: 300,
              color: 'rgba(255,255,255,0.92)',
              lineHeight: 1.55, letterSpacing: '0.01em',
              maxHeight: respExpanded ? 280 : 168,
              overflow: 'auto', cursor: 'pointer', width: '100%',
            }}
          >
            {displayText}
          </div>
        ) : (
          <div style={{
            fontFamily: 'Inter', fontSize: 27, fontWeight: 300,
            color: 'rgba(255,255,255,0.96)',
            lineHeight: 1.25, letterSpacing: '0.01em',
          }}>
            {STATE_MSG[status]}
          </div>
        )}

        {/* Images (passeport/permis/doc client) */}
        {imageUrlsFrom(displayText).slice(0, 3).map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '12px 0 0', width: '100%' }}>
            <img src={u} alt="document"
              style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 14, border: `1px solid ${col}33`, background: 'rgba(0,0,0,0.3)' }} />
          </a>
        ))}
      </div>

      {/* ── BARRE D'ACTIONS (façon Gemini Live) ── */}
      <div style={{
        position: 'absolute', bottom: 26, left: 0, right: 0, zIndex: 6,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22,
        padding: '0 18px',
      }}>
        {/* CAMÉRA / VISION */}
        <button
          onClick={toggleLiveCam}
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: camActive ? `${col}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${camActive ? col + '99' : 'rgba(255,255,255,0.14)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease', position: 'relative',
          }}
          aria-label="Caméra"
        >
          <VisionIcon active={camActive} />
          {camActive && (
            <div style={{
              position: 'absolute', top: -2, right: -2,
              width: 9, height: 9, borderRadius: '50%',
              background: '#FF5A5A', boxShadow: '0 0 6px #FF5A5A',
            }} />
          )}
        </button>

        {/* ORBE PILL — micro, coeur lumineux tappable */}
        <button
          onClick={() => {
            if (status === 'idle' && !isRecordingRef.current) {
              unlockAudio();
              if (streamRef.current) { startRecording(); setHud('Écoute…'); }
              else { setHud('Micro non activé'); }
            } else if (status === 'listening') {
              stopRecordingAndProcess();
            } else if (status === 'speaking') {
              stopAudio(); setStatus('idle');
            }
          }}
          disabled={isThinking}
          style={{
            position: 'relative',
            width: 118, height: 56, borderRadius: 28, padding: 0,
            background: orbActive
              ? `linear-gradient(180deg, ${col}33, ${col}14)`
              : 'rgba(20,16,8,0.9)',
            border: `1px solid ${orbActive ? col : col + '55'}`,
            cursor: isThinking ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isListening
              ? `0 0 ${22 + rmsLevel * 40}px ${col}aa, 0 0 70px ${col}33`
              : orbActive ? `0 0 26px ${col}77` : `0 0 16px ${col}33`,
            transition: 'box-shadow 0.08s linear, background 0.3s ease, border 0.3s ease',
            overflow: 'hidden',
          }}
          aria-label="Micro"
        >
          {isThinking ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin-slow 1.2s linear infinite' }}>
              <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
          ) : isListening ? (
            // barres d'onde réactives
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24 }}>
              {[0.5, 0.85, 1, 0.7, 0.9].map((h, i) => (
                <div key={i} style={{
                  width: 4, borderRadius: 2, background: col,
                  height: `${Math.max(6, (h * (0.4 + rmsLevel * 1.6)) * 24)}px`,
                  transition: 'height 0.08s linear',
                }} />
              ))}
            </div>
          ) : isSpeaking ? (
            <div style={{ width: 56, height: 18, borderRadius: 9, background: col, opacity: 0.9, animation: 'corePulse 1.1s ease-in-out infinite' }} />
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" fill={col} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={col} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <line x1="12" y1="18" x2="12" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* SCAN DOC */}
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
            width: 52, height: 52, borderRadius: '50%',
            background: scanActive ? `${col}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${scanActive ? col + '99' : 'rgba(255,255,255,0.14)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          aria-label="Scanner un document"
        >
          {scanActive ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" style={{ animation: 'spin-slow 1.2s linear infinite' }}>
              <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1" strokeOpacity="0.5" />
              <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.7" />
            </svg>
          )}
        </button>
      </div>

      {/* Mode continu — petit toggle discret */}
      <button
        onClick={() => setContinuousMode(m => !m)}
        style={{
          position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
          padding: '4px 14px', borderRadius: 14,
          background: continuousMode ? `${col}1c` : 'transparent',
          border: `1px solid ${continuousMode ? col + '88' : 'rgba(255,255,255,0.12)'}`,
          cursor: 'pointer', color: continuousMode ? col : 'rgba(255,255,255,0.4)',
          fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.02em',
          transition: 'all 0.2s ease',
        }}
      >
        {continuousMode ? 'Conversation continue' : 'Appui pour parler'}
      </button>

      {/* ── OVERLAY D'ACTIVATION (clean) ── */}
      {!audioUnlocked && (
        <div
          onClick={e => { e.stopPropagation(); sessionAudioUnlocked = true; unlockAudio(); setAudioUnlocked(true); initMic(); }}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(8px)', cursor: 'pointer',
            animation: 'fadeIn 0.4s ease', padding: '0 32px',
          }}
        >
          <Sparkle col={col} active={false} />
          <div style={{
            fontFamily: 'Inter', fontSize: 22, fontWeight: 300,
            color: 'rgba(255,255,255,0.95)', marginTop: 26, textAlign: 'center', lineHeight: 1.3,
          }}>
            Activer Dzaryx
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.4)', marginTop: 10, textAlign: 'center' }}>
            Appuyez pour démarrer le micro
          </div>
          <div style={{
            marginTop: 26, width: 44, height: 44, borderRadius: '50%',
            border: `1px solid ${col}66`, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${col}33`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" fill={col} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={col} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <line x1="12" y1="18" x2="12" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      )}

      {/* ── CAMÉRA PLEIN ÉCRAN (mode vision) — toujours en DOM pour videoRef ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        overflow: 'hidden',
        opacity: camActive ? 1 : 0,
        pointerEvents: camActive ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay playsInline muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        {/* dégradé bas pour lisibilité des contrôles */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 55%, rgba(0,0,0,0.85) 100%)' }} />
        {camActive && (
          <>
            <div style={{
              position: 'absolute', top: 56, left: 18,
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 12, background: 'rgba(0,0,0,0.4)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF5A5A', boxShadow: '0 0 6px #FF5A5A' }} />
              <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, color: '#fff', letterSpacing: '0.02em' }}>
                {visionActive ? 'Vision en direct' : 'Caméra'}
              </span>
            </div>
            {/* Flip caméra avant/arrière (comme avant) */}
            <button
              onClick={flipCam}
              aria-label="Changer de caméra"
              style={{
                position: 'absolute', top: 50, right: 18,
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.25)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" /><path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" /><path d="M3 21l7-7" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── DZARYX ORB — premium voice core (no robot) ───────────────────────────────

function DzaryxRobot({
  status, visionActive, scale = 1,
}: {
  status: DzaryxStatus;
  visionActive: boolean;
  scale?: number;
}) {
  const col         = STATE_COLOR[status];
  const accent      = visionActive ? '#9b59b6' : col;
  const isListening = status === 'listening';
  const isThinking  = status === 'thinking';
  const isSpeaking  = status === 'speaking';

  const size = Math.round(300 * scale);
  const C = 150; // center

  // Orbital ring — elliptical, tilted, with a travelling particle
  const Ring = ({ rx, ry, rot, dur, reverse, op }: { rx: number; ry: number; rot: number; dur: number; reverse?: boolean; op: number }) => (
    <g style={{ transformOrigin: `${C}px ${C}px`, animation: `${reverse ? 'coreSpinR' : 'coreSpin'} ${dur}s linear infinite` }}>
      <g transform={`rotate(${rot} ${C} ${C})`}>
        <ellipse cx={C} cy={C} rx={rx} ry={ry} fill="none" stroke={accent} strokeWidth="0.8" strokeOpacity={op} />
        {/* travelling particle on the ring */}
        <circle cx={C + rx} cy={C} r="2.6" fill={accent} filter="url(#orbGlowS)" />
        <circle cx={C - rx} cy={C} r="1.6" fill={accent} fillOpacity="0.7" />
      </g>
    </g>
  );

  return (
    <svg
      width={size} height={size}
      viewBox="0 0 300 300"
      fill="none"
      style={{
        overflow: 'visible',
        animation: 'orbFloat 4.5s ease-in-out infinite',
        filter: `drop-shadow(0 0 26px ${col}44) drop-shadow(0 0 60px ${col}18)`,
      }}
    >
      <defs>
        {/* Sphere body — glossy depth */}
        <radialGradient id={`orb-body-${status}`} cx="38%" cy="30%" r="72%">
          <stop offset="0%"   stopColor={accent} stopOpacity="0.95" />
          <stop offset="22%"  stopColor={accent} stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#0a1830" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#02060f" />
        </radialGradient>
        {/* Inner core glow */}
        <radialGradient id={`orb-core-${status}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="30%"  stopColor={accent}  stopOpacity="0.9" />
          <stop offset="70%"  stopColor={accent}  stopOpacity="0.25" />
          <stop offset="100%" stopColor={accent}  stopOpacity="0" />
        </radialGradient>
        {/* Specular highlight */}
        <radialGradient id="orb-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Ambient halo */}
        <radialGradient id={`orb-halo-${status}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={col} stopOpacity="0.20" />
          <stop offset="60%"  stopColor={col} stopOpacity="0.05" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </radialGradient>
        <filter id="orbGlowS" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="orbGlowL" x="-140%" y="-140%" width="380%" height="380%">
          <feGaussianBlur stdDeviation="8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="orb-clip"><circle cx={C} cy={C} r="62" /></clipPath>
      </defs>

      {/* ── AMBIENT HALO ── */}
      <circle cx={C} cy={C} r="120" fill={`url(#orb-halo-${status})`}
        style={{ animation: 'corePulse 4s ease-in-out infinite' }} />

      {/* ── REACTIVE PULSE WAVES ── */}
      {(isListening || isSpeaking) && (
        <g style={{ transformOrigin: `${C}px ${C}px` }}>
          {[0, 1, 2].map(i => (
            <circle key={i} cx={C} cy={C} r="70" fill="none" stroke={col} strokeWidth="1.4"
              style={{
                transformOrigin: `${C}px ${C}px`,
                animation: `orbRipple ${isListening ? 1.5 : 2.2}s ease-out ${i * (isListening ? 0.5 : 0.73)}s infinite`,
              }} />
          ))}
        </g>
      )}

      {/* ── ORBITAL RINGS ── */}
      <Ring rx={132} ry={46}  rot={0}   dur={26} op={0.18} />
      <Ring rx={120} ry={120} rot={0}   dur={40} reverse op={0.10} />
      <Ring rx={108} ry={40}  rot={62}  dur={18} reverse op={0.22} />
      <Ring rx={96}  ry={36}  rot={-58} dur={14} op={0.20} />

      {/* ── THINKING COMET ARC ── */}
      {isThinking && (
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpin 1.4s linear infinite' }}>
          <path d={`M ${C} ${C - 84} A 84 84 0 0 1 ${C + 72} ${C - 42}`}
            fill="none" stroke={col} strokeWidth="3" strokeLinecap="round"
            filter="url(#orbGlowS)" strokeOpacity="0.9" />
          <circle cx={C} cy={C - 84} r="4" fill="#fff" filter="url(#orbGlowS)" />
        </g>
      )}

      {/* ── SPHERE ── */}
      <circle cx={C} cy={C} r="62" fill={`url(#orb-body-${status})`} stroke={accent} strokeWidth="0.8" strokeOpacity="0.4" />

      {/* Inner tech detail — clipped grid + rotating arcs */}
      <g clipPath="url(#orb-clip)" opacity="0.5">
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpin 30s linear infinite' }}>
          <ellipse cx={C} cy={C} rx="55" ry="20" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.4" />
          <ellipse cx={C} cy={C} rx="55" ry="40" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1={C - 60} y1={C} x2={C + 60} y2={C} stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
        </g>
        <g style={{ transformOrigin: `${C}px ${C}px`, animation: 'coreSpinR 22s linear infinite' }}>
          <ellipse cx={C} cy={C} rx="20" ry="55" fill="none" stroke={accent} strokeWidth="0.5" strokeOpacity="0.3" />
        </g>
      </g>

      {/* Core glow — pulsing */}
      <circle cx={C} cy={C} r="34" fill={`url(#orb-core-${status})`}
        style={{ animation: `corePulse ${isListening ? 0.8 : isSpeaking ? 1.1 : 2.6}s ease-in-out infinite` }} />

      {/* Bright nucleus */}
      <circle cx={C} cy={C} r={isListening ? 9 : isSpeaking ? 8 : 6} fill="#ffffff" filter="url(#orbGlowL)"
        style={{ animation: `corePulse ${isSpeaking ? 0.9 : 2}s ease-in-out infinite` }} />

      {/* Glossy specular highlight top-left */}
      <ellipse cx={C - 20} cy={C - 24} rx="20" ry="13" fill="url(#orb-spec)" opacity="0.5"
        style={{ animation: 'shimmer 5s ease-in-out infinite' }} />

      {/* Rim light bottom-right */}
      <path d={`M ${C + 44} ${C + 30} A 62 62 0 0 1 ${C - 10} ${C + 60}`}
        fill="none" stroke={accent} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" />
    </svg>
  );
}

// ── Logo Dzaryx au centre (remplace l'étoile) ────────────────────────────────
function Sparkle({ col, active }: { col: string; active: boolean }) {
  const size = active ? 96 : 80;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/ibrahim/';
  return (
    <img
      src={`${base}logo.png`}
      alt="Dzaryx"
      style={{
        width: size, height: size, objectFit: 'contain',
        filter: `drop-shadow(0 0 18px ${col}77) drop-shadow(0 0 40px ${col}33)`,
        transition: 'all 0.3s ease',
        animation: active ? 'corePulse 1.6s ease-in-out infinite' : 'orbFloat 4.5s ease-in-out infinite',
      }}
    />
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
    x: Math.random() * 400, y: Math.random() * 700,
    r: 0.5 + Math.random() * 1.5,
    vy: 0.2 + Math.random() * 0.4,
    life: Math.random(),
  }));
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej; reader.readAsDataURL(blob);
  });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => res((reader.result as string).split(',')[1]!);
    reader.onerror = rej; reader.readAsDataURL(file);
  });
}

function Corner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const s = 14, t = 1.5;
  const bT = pos.startsWith('t') ? `${t}px solid ${col}77` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}77` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}77` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}77` : 'none';
  const h  = pos.endsWith('l')   ? { left: 6 }  : { right: 6 };
  const v  = pos.startsWith('t') ? { top: 6 }   : { bottom: 6 };
  return (
    <div style={{ position: 'absolute', zIndex: 4, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />
  );
}

function VisionIcon({ active }: { active: boolean }) {
  const c = active ? '#9b59b6' : '#9b59b677';
  return (
    <svg width="22" height="18" viewBox="0 0 24 18" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 9C4 3.5 8 1 12 1s8 2.5 11 8c-3 5.5-7 8-11 8S4 14.5 1 9z" />
      <circle cx="12" cy="9" r="3.5" fill={active ? '#9b59b622' : 'none'} />
      {active && <circle cx="12" cy="9" r="1.5" fill={c} />}
    </svg>
  );
}
