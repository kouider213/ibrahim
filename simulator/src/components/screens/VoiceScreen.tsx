import { useEffect, useRef, useState, useCallback } from 'react';
import {
  api, connectSocket, disconnectSocket, getOrCreateSessionId,
  playBase64Audio, enqueueChunk, flushChunks, unlockAudio, stopAudio, isAudioPlaying,
  sendNativeAction, tryParseNativeAction, callApi, speakOnDevice,
  type DzaryxStatus,
} from '../../services/api.ts';
import { OrbIcon } from '../ui/Premium.tsx';
import { createDzaryxFace } from '../ui/dzaryxFace.ts';
import DzaryxIcon from '../ui/DzaryxLogo.tsx';

interface Props {
  onNavigateText: () => void;
  onWsStatus: (ok: boolean) => void;
  actor?: 'kouider' | 'houari';
  compact?: boolean;  // overlay barre fine (façon Gemini)
  // Appel en cours (Dzaryx a appelé, ou Kouider l'appelle) : mains libres + barre d'appel
  call?: { id?: string; incoming: boolean; key: number };
  onHangup?: () => void;
  onStartCall?: () => void;
}

const MAX_CALL_S = 15 * 60;   // un appel raccroche tout seul après 15 min (crédits ElevenLabs/Claude)

// Palette holographique (style Nexus) — la sphère change de teinte selon l'état
const STATE_COLOR: Record<DzaryxStatus, string> = {
  idle:      '#38d8f5',
  listening: '#5ef0df',
  thinking:  '#a78bfa',
  speaking:  '#4aa3ff',
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
// Seuils ADAPTATIFS : les valeurs ci-dessus = calibrage pour un ambiant de 3.8.
// Dans un autre endroit (voiture, dehors, haut-parleur en appel) l'ambiant change :
// fixes, les seuils faisaient soit tout jeter (voix jamais « confirmée »), soit
// enregistrer sans fin. On garde les mêmes RATIOS au-dessus du bruit mesuré.
const CALIB_FLOOR   = 0.0038;
const MIN_FLOOR     = 0.0015;
const MAX_FLOOR     = 0.03;

// Persiste l'état "audio débloqué" pour toute la session de page (survit aux
// changements d'onglet VOIX↔CHAT). Une fois l'utilisateur a tapé une fois,
// l'audio est débloqué au niveau navigateur → inutile de redemander à chaque
// retour sur l'écran Voix.
let sessionAudioUnlocked = false;
// Appel Telegram de Dzaryx en cours (24/10) : sur iPhone, la bannière d'appel laisse l'app au premier plan (pas de
// visibilitychange) → elle gardait le micro et Telegram n'envoyait que du silence. Le serveur le signale, on lâche le micro.
let tgCallLive = false;
const TG_LIVE_POLL_MS = 4000;

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
let sharedMicPromise: Promise<MediaStream> | null = null;

/**
 * À appeler DANS le tap « Décrocher » / « Appeler » : iOS n'autorise le son et le
 * micro qu'à la suite d'un geste. Débloque l'audio et ouvre le micro tout de suite.
 */
export function prepareCallAudio(): void {
  sessionAudioUnlocked = true;
  unlockAudio();
  const live = !!sharedMicStream && sharedMicStream.getAudioTracks().some(t => t.readyState === 'live');
  if (live || !navigator.mediaDevices?.getUserMedia) return;
  sharedMicPromise = navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  sharedMicPromise.then(st => { sharedMicStream = st; }).catch(() => {}).finally(() => { sharedMicPromise = null; });
}

export default function VoiceScreen({ onNavigateText, onWsStatus, compact = false, call, onHangup, onStartCall }: Props) {
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
  const bargeFramesRef  = useRef(0);   // frames consécutives de vraie voix pendant que Dzaryx parle → barge-in
  const bargeRecordingRef = useRef(false); // l'enregistrement courant vient d'un barge-in/tap → auto-envoi au silence même en mode manuel
  const vadGenRef       = useRef(0);   // chaque startVAD tue la boucle précédente (sinon une boucle « zombie » sur l'ancien micro lit du silence et jette tes phrases)
  const noiseFloorRef   = useRef(CALIB_FLOOR);
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
  const [particles]             = useState(() => makeParticles(40));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRecRef     = useRef<any>(null);        // écoute du mot « Dzaryx » (arrêtée quand l'app passe en arrière-plan)
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

  // ── Appel (dans l'app, sans numéro) ─────────────────────────────────────────
  const callRef = useRef(false);
  callRef.current = !!call;
  const [callSecs, setCallSecs] = useState(0);

  useEffect(() => {
    if (!call) return;
    let cancelled = false;
    sessionAudioUnlocked = true;
    unlockAudio();
    setAudioUnlocked(true);
    // Mains libres = VAD : il t'écoute sans bouton, comme au téléphone.
    // (Pas le mode continu : il enregistrerait le silence → Whisper inventerait des phrases.)
    setHandsFree(true);
    setContinuousMode(false);
    setResp(''); setStream('');
    setCallSecs(0);
    void initMic();
    setStatus('thinking');
    callApi.answer(call.id)
      .then(r => {
        if (cancelled) return;
        setResp(r.text);
        setStatus('idle');
        if (r.audio) void playBase64Audio(r.audio); else speakOnDevice(r.text);
      })
      .catch(() => { if (!cancelled) { setStatus('idle'); setResp('Je t\'écoute.'); speakOnDevice('Je t\'écoute.'); } });
    const timer = setInterval(() => setCallSecs(s => s + 1), 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [call?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  function hangUp() {
    callRef.current = false;
    stopAudio();
    discardRecording();
    setHandsFree(false);
    setStatus('idle');
    setHud('APPEL TERMINÉ');
    onHangup?.();
  }

  useEffect(() => {
    if (call && callSecs >= MAX_CALL_S) hangUp();
  }, [callSecs]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (document.hidden && !callRef.current) return;   // en arrière-plan : le micro est à Telegram (voir releaseMic)
    if (tgCallLive && !callRef.current) return;         // appel Telegram en cours : le micro est à lui
    micInitRef.current = true;
    drawCanvas();
    try {
      // Réutilise le stream déjà ouvert cette session (pas de re-prompt iOS au
      // changement d'onglet). Sinon en demande un nouveau (déclenche la permission).
      if (sharedMicPromise) { try { await sharedMicPromise; } catch { /* re-demandé juste après */ } }
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
      // Ancien contexte (ré-init par le watchdog) → fermé, sinon il fuit et garde un analyseur mort
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(() => {});
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      // Pas d'await : sans geste utilisateur, resume() peut rester en attente indéfiniment
      // → startVAD() n'était jamais appelé → micro sourd. Le watchdog relance resume().
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
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
      vadGenRef.current++;   // stoppe la boucle VAD
      srWantedRef.current = false; srDictationRef.current = false; stopSR(); // stoppe l'écoute au changement d'onglet
      // NE PAS couper le micro partagé (sharedMicStream) au changement d'onglet :
      // on le garde ouvert pour éviter qu'iOS redemande la permission au retour.
      // On coupe seulement la caméra + l'AudioContext (recréé à la prochaine init).
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // App en arrière-plan (Dzaryx t'appelle sur Telegram, écouteurs, autre app) → on REND le micro.
  // Avant (20/10) : micro partagé + mot-clé + watchdog le reprenaient sans arrêt même en arrière-plan →
  // l'iPhone envoyait du silence à l'appel Telegram (« volume max 0 »). Retour dans l'app → micro relancé.
  // Exception : appel DANS l'app en cours (écran verrouillé pendant l'appel).
  useEffect(() => {
    const releaseMic = () => {
      if (callRef.current) return;
      vadGenRef.current++;
      const w = wakeRecRef.current; wakeRecRef.current = null;
      if (w) { try { w.onend = null; w.abort(); } catch { /* ignore */ } }
      srWantedRef.current = false; stopSR();
      discardRecording();
      isRecordingRef.current = false;
      sharedMicStream?.getTracks().forEach(t => t.stop());
      sharedMicStream = null;
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      micInitRef.current = false;
    };
    const onVis = () => {
      if (document.hidden) releaseMic();
      else if (sessionAudioUnlocked) void initMic();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', releaseMic);
    // Micro ouvert au premier plan : toutes les 4 s, un appel Telegram a-t-il commencé ?
    const tgPoll = setInterval(() => {
      if (document.hidden || callRef.current || (!micInitRef.current && !tgCallLive)) return;
      callApi.tgLive().then(r => {
        if (r.live && !tgCallLive) { tgCallLive = true; releaseMic(); }
        else if (!r.live && tgCallLive) { tgCallLive = false; if (sessionAudioUnlocked) void initMic(); }
      }).catch(() => {});
    }, TG_LIVE_POLL_MS);
    return () => {
      clearInterval(tgPoll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', releaseMic);
      const w = wakeRecRef.current; wakeRecRef.current = null;
      if (w) { try { w.onend = null; w.abort(); } catch { /* ignore */ } }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (document.hidden && !callRef.current) return; // arrière-plan : surtout ne pas reprendre le micro
      // 1) "thinking" figé > 12s → débloque (sinon micro gelé)
      if (statusRef.current === 'thinking' && thinkingSinceRef.current && Date.now() - thinkingSinceRef.current > 12_000) {
        setStatus('idle'); setHud('PRÊT — PARLE-MOI'); thinkingSinceRef.current = 0;
        isRecordingRef.current = false;  // débloque un enregistrement coincé
      }
      // 2) AudioContext suspendu/interrompu (iOS après une lecture audio, retour d'arrière-plan)
      //    → l'analyseur ne renvoie que du silence → le VAD ne t'entend plus. On le réveille.
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
      // 3) micro coupé (stream mort) alors qu'on est au repos → on relance
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
      if (wakeRecRef.current !== rec || document.hidden) return;
      setTimeout(() => { if (wakeRecRef.current === rec) try { rec.start(); } catch { /* ignore */ } }, 300);
    };
    try { wakeRecRef.current?.abort(); } catch { /* ignore */ }
    wakeRecRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }

  // ── VAD ─────────────────────────────────────────────────────────────────────
  function startVAD() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const timeBuf = new Uint8Array(analyser.fftSize);
    const a = analyser;
    const gen = ++vadGenRef.current;
    function tick() {
      if (gen !== vadGenRef.current) return;   // boucle remplacée par une ré-init → on s'arrête
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

      // Plancher de bruit : mesuré seulement au repos (pas pendant ta voix ni celle de Dzaryx).
      // Descend vite, monte lentement (~3s) → suit l'ambiant sans « apprendre » ta voix.
      if (!isRecordingRef.current && statusRef.current === 'idle' && !isAudioPlaying()) {
        const f = noiseFloorRef.current;
        noiseFloorRef.current = Math.min(MAX_FLOOR, Math.max(MIN_FLOOR,
          rms < f ? f * 0.9 + rms * 0.1 : f * 0.995 + rms * 0.005));
      }
      const k = noiseFloorRef.current / CALIB_FLOOR;
      const armRms = ARM_RMS * k, speechRms = SPEECH_RMS * k;

      // ── BARGE-IN VOCAL — UNIQUEMENT en MAINS-LIBRES ─────────────────────────
      // En manuel, Dzaryx ne se coupe JAMAIS tout seul : il s'arrête seulement quand
      // tu appuies sur le micro (évite les coupures parasites sur écho/bruit).
      // En mains-libres, on garde le barge-in (seuil ×2 + 5 frames d'affilée = vraie voix,
      // pas l'écho de Dzaryx) pour une vraie conversation continue.
      if (handsFreeRef.current && (statusRef.current === 'speaking' || isAudioPlaying()) && rms > speechRms * 2) {
        bargeFramesRef.current++;
        if (bargeFramesRef.current >= 5) {
          bargeFramesRef.current = 0;
          stopAudio();
          setStatus('idle');
          if (!isRecordingRef.current) { bargeRecordingRef.current = true; startRecording(); }
        }
      } else if (bargeFramesRef.current > 0) {
        bargeFramesRef.current = 0;
      }

      // En appel, le haut-parleur renvoie la voix de Dzaryx dans le micro : pendant qu'il parle,
      // seul le barge-in ci-dessus (voix forte, 5 frames) peut l'interrompre — pas l'armement VAD.
      if (callRef.current && (statusRef.current === 'speaking' || isAudioPlaying())) { requestAnimationFrame(tick); return; }

      // VAD désactivé par DÉFAUT (handsFree off) : trop instable sur ce micro (flicker arm/désarm).
      // → push-to-talk (tap micro = démarre, re-tap = envoie). Le VAD continu ne tourne QUE si
      // l'utilisateur active "Mains libres". On garde le RMS (calculé au-dessus) pour l'orbe.
      // En mode manuel on saute le VAD continu SAUF si l'enregistrement vient d'un barge-in/tap :
      // dans ce cas on veut l'auto-envoi au silence pour répondre à la nouvelle question.
      if (!handsFreeRef.current && !bargeRecordingRef.current) { requestAnimationFrame(tick); return; }
      if (statusRef.current === 'idle' && !isRecordingRef.current) {
        const hint = handsFreeRef.current ? 'PARLE-MOI' : 'TAPE 🎤 POUR PARLER';
        setHud(`MIC: ${(rms * 1000).toFixed(1)} | SEUIL: ${(speechRms * 1000).toFixed(1)} | ${hint}`);
      }
      if (rms > armRms) {
        // 1er son → on enregistre TOUT DE SUITE (capture le début du mot, jamais coupé).
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        // Auto-armement (écoute sans bouton) UNIQUEMENT en mode mains-libres.
        // Sinon (défaut) on n'enregistre QUE quand l'utilisateur tape MICRO → on ne
        // capte plus l'ambiant ni les autres voix → Dzaryx comprend bien ce qu'IL dit.
        if (!isRecordingRef.current && handsFreeRef.current) { startRecording(true); armStartRef.current = Date.now(); }
        if (rms > speechRms) {
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

  // RESET DUR + écoute : débloque TOUT état coincé (recorder mort, statut figé,
  // audio suspendu, flux iOS coupé) puis réécoute. → plus jamais besoin de fermer l'app.
  async function ensureMicThenRecord() {
    unlockAudio();
    // 1. tuer un enregistrement bloqué
    try { const r = recorderRef.current; if (r && r.state !== 'inactive') { r.onstop = null; r.stop(); } } catch { /* ignore */ }
    recorderRef.current = null;
    isRecordingRef.current = false;
    realSpeechRef.current  = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    try { stopAudio(); } catch { /* ignore */ }
    // 2. réveiller l'AudioContext s'il est suspendu
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') { try { await audioCtxRef.current.resume(); } catch { /* ignore */ } }
    // 3. micro vivant ? sinon réinit complet
    const live = !!streamRef.current && streamRef.current.getAudioTracks().some(t => t.readyState === 'live');
    const ctxDead = !audioCtxRef.current || audioCtxRef.current.state === 'closed';
    if (!live || ctxDead) { micInitRef.current = false; try { await initMic(); } catch { /* ignore */ } }
    // 4. repartir propre
    setStatus('idle');
    setTimeout(() => {
      if (streamRef.current && !isRecordingRef.current) { startRecording(); setHud('Écoute…'); }
      else { setMicErr(true); setHud('Micro inaccessible — autorise le micro dans les réglages'); }
    }, 80);
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
    bargeRecordingRef.current = false;
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (statusRef.current !== 'speaking' && statusRef.current !== 'thinking') setStatus('idle');
  }

  // ── Canvas background : sphère neuronale holographique (style Nexus) ─────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelAnimationFrame(animRef.current);
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    function fit() {
      const r = canvas!.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas!.width = Math.round(W * dpr); canvas!.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    fit();
    let smooth = 0;
    const drawFace = createDzaryxFace();

    function frame(t: number) {
      animRef.current = requestAnimationFrame(frame);
      const r = canvas!.getBoundingClientRect();
      if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) fit();
      const cx = W / 2, cy = H * 0.34;
      const st  = statusRef.current;
      const col = STATE_COLOR[st];
      smooth += (rmsRef.current - smooth) * 0.25;
      const amp = Math.min(1, smooth * 4);
      const R   = Math.min(W * 0.27, H * 0.17) * (1 + amp * 0.12 + (st === 'speaking' ? Math.sin(t * 0.012) * 0.03 : 0));

      // Fond bleu nuit + halo
      ctx.fillStyle = '#03060f'; ctx.fillRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.6);
      halo.addColorStop(0, hexToRgba(col, 0.16 + amp * 0.12));
      halo.addColorStop(0.5, 'rgba(20,50,110,0.10)');
      halo.addColorStop(1, 'rgba(3,6,15,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

      // Grille de sol en perspective (bas de l'écran)
      ctx.strokeStyle = 'rgba(74,163,255,0.07)'; ctx.lineWidth = 1;
      const hz = H * 0.62;
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(cx + i * 14, hz); ctx.lineTo(cx + i * W * 0.22, H); ctx.stroke();
      }
      const off = (t * 0.02) % 1;
      for (let j = 0; j < 9; j++) {
        const k = (j + off) / 9, y = hz + (H - hz) * k * k;
        ctx.globalAlpha = k; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Visage animé de Dzaryx (le même petit bonhomme qu'en appel Telegram) à la place de la sphère — Kouider 27/10
      {
        const talk = st === 'speaking' ? 0.3 + 0.7 * Math.abs(Math.sin(t * 0.017) * Math.sin(t * 0.029 + 1.3)) : 0;
        drawFace(ctx, cx, cy - R * 0.1, R * 1.15, t, { talk, listen: st === 'listening' ? amp : 0, thinking: st === 'thinking' });
      }

      // Anneaux HUD (graduations + arcs qui tournent)
      const ring = (rad: number, rot: number, alpha: number, dash: number[]) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = hexToRgba(col, alpha); ctx.setLineDash(dash);
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); ctx.setLineDash([]);
      };
      ctx.lineWidth = 1;
      ring(R * 1.32, t * 0.0002, 0.22, [2, 6]);
      ring(R * 1.55, -t * 0.00012, 0.12, [24, 10, 4, 10]);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (st === 'thinking' ? 0.004 : 0.0009));
      ctx.strokeStyle = hexToRgba(col, 0.75); ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, R * 1.43, 0, Math.PI * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 1.43, Math.PI, Math.PI * 1.18); ctx.stroke();
      ctx.restore();
      // Onde vocale circulaire quand il écoute / parle
      if (st === 'listening' || st === 'speaking') {
        ctx.strokeStyle = hexToRgba(col, 0.5); ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let k = 0; k <= 96; k++) {
          const ang = (k / 96) * Math.PI * 2;
          const rr = R * 1.18 + Math.sin(ang * 6 + t * 0.01) * (2 + amp * 10) + Math.sin(ang * 11 - t * 0.017) * amp * 6;
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      // Particules qui montent (données)
      particles.forEach((p, idx) => {
        p.y -= p.vy * (1 + amp * 2) * 0.6;
        p.x += Math.sin(t * 0.001 + idx) * 0.15;
        p.life -= 0.0015;
        if (p.life <= 0 || p.y < -5) {
          p.x = Math.random() * W; p.y = H + 10;
          p.life = 0.4 + Math.random() * 0.6; p.vy = 0.15 + Math.random() * 0.3;
        }
        ctx.fillStyle = hexToRgba(col, p.life * 0.25);
        ctx.fillRect(p.x, p.y, p.r, p.r * 3);
      });
    }
    animRef.current = requestAnimationFrame(frame);
  }, [particles]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

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
    const micTap = () => {
      if (status === 'idle' && !isRecordingRef.current) {
        void ensureMicThenRecord();
      } else if (status === 'listening') {
        stopRecordingAndProcess();
      } else if (status === 'speaking' || status === 'thinking') {
        // Coupe Dzaryx + reset dur + réécoute (débloque tout état coincé)
        void ensureMicThenRecord();
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
        <div style={{ flexShrink: 0, animation: orbActive ? 'corePulse 1.4s ease-in-out infinite' : 'none' }}><OrbIcon size={32} /></div>

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

  // Micro principal : écoute / envoie / coupe Dzaryx (1 seul tap)
  const micTapMain = () => {
    if (status === 'idle' && !isRecordingRef.current) {
      void ensureMicThenRecord();
    } else if (status === 'listening') {
      stopRecordingAndProcess();
    } else if (status === 'speaking') {
      // Coupe Dzaryx ET se met à écouter ta nouvelle question (1 seul tap, façon Gemini)
      stopAudio(); bargeFramesRef.current = 0; setStatus('idle');
      setTimeout(() => { if (!isRecordingRef.current && streamRef.current) { bargeRecordingRef.current = true; startRecording(); } }, 60);
    } else {
      // statut figé (thinking bloqué…) → reset dur + réécoute
      void ensureMicThenRecord();
    }
  };

  const pickScan = () => {
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
  };

  const glass: React.CSSProperties = {
    background: 'rgba(10,18,38,0.62)', border: '1px solid rgba(90,150,255,0.18)',
    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
  };
  const STATE_TAG: Record<DzaryxStatus, string> = {
    idle: 'EN VEILLE', listening: 'ÉCOUTE', thinking: 'ANALYSE', speaking: 'RÉPONSE',
  };
  const showChips = !displayText && !liveText && status === 'idle' && !call;

  return (
    <div
      style={{ width: '100%', height: '100%', background: '#03060f', position: 'relative', overflow: 'hidden' }}
    >
      {/* Fond holographique (sphère neuronale Nexus, réagit à la voix) */}
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* ── HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
        padding: '12px 14px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 14, height: 30, padding: '0 11px' }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: wsConn ? '#34d399' : '#f87171',
            boxShadow: `0 0 6px ${wsConn ? '#34d399' : '#f87171'}`,
          }} />
          <span style={{ fontFamily: 'Share Tech Mono', fontSize: 13.5, color: '#8ea3c8', letterSpacing: '0.12em' }}>
            {wsConn ? 'EN LIGNE' : 'HORS LIGNE'}{wakeWordOn ? ' · À L\'ÉCOUTE' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Overlay flottant (par-dessus les autres apps) — natif Android uniquement */}
          {!(typeof location !== 'undefined' && location.search.includes('overlay')) && (
            <button
              onClick={() => sendNativeAction({ __native_action: 'open_overlay' })}
              title="Ouvrir en overlay par-dessus les autres apps"
              style={{
                ...glass, borderRadius: 14, width: 32, height: 30, cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 13, color: '#8ea3c8',
              }}
            >
              ⧉
            </button>
          )}

          {/* Appeler Dzaryx (conversation mains libres, comme au téléphone) */}
          {onStartCall && !call && (
            <button
              onClick={onStartCall}
              title="Appeler Dzaryx"
              style={{
                background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.5)',
                borderRadius: 14, height: 30, padding: '0 11px', cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: '#34d399',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#34d399"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
              Appeler
            </button>
          )}

          {/* Mains-libres */}
          <button
            onClick={() => setHandsFree(h => !h)}
            style={{
              ...glass,
              background: handsFree ? `${col}1f` : glass.background,
              border: `1px solid ${handsFree ? col + '99' : 'rgba(90,150,255,0.18)'}`,
              borderRadius: 14, height: 30, padding: '0 11px', cursor: 'pointer',
              fontFamily: 'Inter', fontSize: 11, fontWeight: 500,
              color: handsFree ? col : '#8ea3c8', transition: 'all 0.2s ease',
            }}
          >
            {handsFree ? 'Mains libres' : 'Manuel'}
          </button>
        </div>
      </div>

      {/* ── BARRE D'APPEL (par-dessus l'en-tête) ── */}
      {call && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 7,
          padding: '12px 16px', background: 'linear-gradient(180deg, #03060f 70%, rgba(3,6,15,0))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34C759', boxShadow: '0 0 8px #34C759' }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>En appel avec Dzaryx</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                {String(Math.floor(callSecs / 60)).padStart(2, '0')}:{String(callSecs % 60).padStart(2, '0')}
                {' · '}{status === 'speaking' ? 'il parle' : status === 'thinking' ? 'il réfléchit' : status === 'listening' ? 'il t\'écoute' : 'parle quand tu veux'}
              </div>
            </div>
          </div>
          <button onClick={hangUp} title="Raccrocher" style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#FF3B30', boxShadow: '0 4px 16px rgba(255,59,48,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" style={{ transform: 'rotate(135deg)' }}>
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            </svg>
          </button>
        </div>
      )}

      {/* ── ÉTAT (sous la sphère) ── */}
      <div style={{
        position: 'absolute', top: '51%', left: 0, right: 0, zIndex: 6,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 18, height: 1, background: `${col}66` }} />
          <span style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 600, color: col, letterSpacing: '0.34em', textShadow: `0 0 10px ${col}88` }}>
            {STATE_TAG[status]}
          </span>
          <div style={{ width: 18, height: 1, background: `${col}66` }} />
        </div>
      </div>

      {/* ── TEXTE (salutation / ce que tu dis / réponse) ── */}
      <div style={{
        position: 'absolute', top: '56%', left: 0, right: 0, bottom: 150, zIndex: 6,
        padding: '0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {liveText ? (
          <div style={{
            fontFamily: 'Inter', fontSize: 19, fontWeight: 300, textAlign: 'center',
            color: '#bfe9ff', lineHeight: 1.4, fontStyle: 'italic', padding: '4px 10px',
          }}>
            « {liveText} »
          </div>
        ) : displayText ? (
          <div
            onClick={() => setRespExpanded(e => !e)}
            style={{
              ...glass, borderRadius: 18, width: '100%', boxSizing: 'border-box',
              borderColor: `${col}33`, boxShadow: `0 0 30px ${col}14, inset 0 1px 0 rgba(255,255,255,0.05)`,
              padding: '12px 14px', cursor: 'pointer', overflow: 'auto',
              maxHeight: respExpanded ? '100%' : 150, animation: 'fadeIn 0.3s ease',
            }}
          >
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: 13, color: '#4f6288', letterSpacing: '0.16em', marginBottom: 6 }}>
              DZARYX ▸
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 400, color: '#e8f0ff', lineHeight: 1.55 }}>
              {displayText}
            </div>
            {/* Images (passeport/permis/doc client) */}
            {imageUrlsFrom(displayText).slice(0, 3).map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', margin: '10px 0 0' }}>
                <img src={u} alt="document"
                  style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 12, border: `1px solid ${col}33`, background: 'rgba(0,0,0,0.3)' }} />
              </a>
            ))}
          </div>
        ) : (
          <div style={{
            fontFamily: 'Inter', fontSize: 23, fontWeight: 300, textAlign: 'center',
            color: '#e8f0ff', lineHeight: 1.25,
          }}>
            {STATE_MSG[status]}
          </div>
        )}

        {/* Raccourcis rapides */}
        {showChips && audioUnlocked && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 16 }}>
            {[
              ['📅', 'Mon agenda', 'Qu\'est-ce que j\'ai aujourd\'hui dans l\'agenda ?'],
              ['✉️', 'Mes mails', 'Résume-moi mes nouveaux mails importants'],
              ['🚗', 'Réservations', 'Quelles sont les prochaines réservations ?'],
              ['🖥️', 'Mon PC', 'Montre-moi l\'état de mon PC sur Nexus'],
            ].map(([ic, label, q]) => (
              <button key={label} onClick={() => void processUserText(q)} style={{
                ...glass, borderRadius: 16, padding: '7px 12px', cursor: 'pointer',
                fontFamily: 'Inter', fontSize: 12, color: '#c8d8f5',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: 13 }}>{ic}</span>{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode continu — petit toggle discret */}
      <button
        onClick={() => setContinuousMode(m => !m)}
        style={{
          position: 'absolute', bottom: 116, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
          padding: '4px 14px', borderRadius: 14,
          background: continuousMode ? `${col}1c` : 'transparent',
          border: `1px solid ${continuousMode ? col + '88' : 'rgba(90,150,255,0.18)'}`,
          cursor: 'pointer', color: continuousMode ? col : '#8ea3c8',
          fontFamily: 'Inter', fontSize: 13.5, fontWeight: 500, letterSpacing: '0.02em',
          transition: 'all 0.2s ease', whiteSpace: 'nowrap',
        }}
      >
        {continuousMode ? 'Conversation continue' : 'Appui pour parler'}
      </button>

      {/* ── DOCK (caméra · micro · scan) ── */}
      <div style={{
        position: 'absolute', bottom: 18, left: 16, right: 16, zIndex: 6,
        ...glass, borderRadius: 30, height: 84,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        {/* CAMÉRA / VISION */}
        <button
          onClick={toggleLiveCam}
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: camActive ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${camActive ? '#a78bfa' : 'rgba(90,150,255,0.2)'}`,
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
              background: '#f87171', boxShadow: '0 0 6px #f87171',
            }} />
          )}
        </button>

        {/* MICRO — cœur lumineux avec anneau réactif */}
        <button
          onClick={micTapMain}
          style={{
            position: 'relative', width: 70, height: 70, borderRadius: '50%', padding: 0,
            marginTop: -26,
            background: orbActive
              ? `radial-gradient(circle at 50% 35%, ${col}55, ${col}18 70%)`
              : 'radial-gradient(circle at 50% 35%, #12305a, #071229 75%)',
            border: `1.5px solid ${orbActive ? col : col + '77'}`,
            cursor: isThinking ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isListening
              ? `0 0 ${22 + rmsLevel * 46}px ${col}bb, 0 0 70px ${col}44`
              : orbActive ? `0 0 28px ${col}88` : `0 0 18px ${col}44, 0 8px 24px rgba(0,0,0,0.6)`,
            transition: 'box-shadow 0.08s linear, background 0.3s ease, border 0.3s ease',
          }}
          aria-label="Micro"
        >
          <div style={{
            position: 'absolute', inset: -7, borderRadius: '50%', pointerEvents: 'none',
            border: `1px dashed ${col}55`,
            animation: `spinSlow ${orbActive ? 4 : 14}s linear infinite`,
          }} />
          {isThinking ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin-slow 1.2s linear infinite' }}>
              <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
              <path d="M12 3a9 9 0 0 1 9 9" />
            </svg>
          ) : isListening ? (
            // barres d'onde réactives
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 26 }}>
              {[0.5, 0.85, 1, 0.7, 0.9].map((h, i) => (
                <div key={i} style={{
                  width: 4, borderRadius: 2, background: col,
                  height: `${Math.max(6, (h * (0.4 + rmsLevel * 1.6)) * 26)}px`,
                  transition: 'height 0.08s linear',
                }} />
              ))}
            </div>
          ) : isSpeaking ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill={col}><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="11" rx="3" fill={col} />
              <path d="M5 11a7 7 0 0 0 14 0" stroke={col} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <line x1="12" y1="18" x2="12" y2="21" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* SCAN DOC */}
        <button
          onClick={pickScan}
          disabled={scanActive}
          style={{
            width: 48, height: 48, borderRadius: '50%',
            background: scanActive ? `${col}1c` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${scanActive ? col + '99' : 'rgba(90,150,255,0.2)'}`,
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9fc4ff" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1" strokeOpacity="0.5" />
              <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.7" />
            </svg>
          )}
        </button>
      </div>

      {/* ── OVERLAY D'ACTIVATION (clean) ── */}
      {!audioUnlocked && (
        <div
          onClick={e => { e.stopPropagation(); sessionAudioUnlocked = true; unlockAudio(); setAudioUnlocked(true); initMic(); }}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse at 50% 35%, rgba(10,30,70,0.97), rgba(3,6,15,0.98) 70%)', backdropFilter: 'blur(8px)', cursor: 'pointer',
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

// ── Logo Dzaryx au centre : emblème + anneaux HUD qui tournent ───────────────
function Sparkle({ col, active }: { col: string; active: boolean }) {
  const size = active ? 104 : 92;
  const box = size + 76;
  const ring = (inset: number, dash: string, anim: string, op: number) => (
    <svg width={box - inset * 2} height={box - inset * 2} viewBox="0 0 100 100"
      style={{ position: 'absolute', top: inset, left: inset, animation: anim, opacity: op }}>
      <circle cx="50" cy="50" r="48" fill="none" stroke={col} strokeWidth="1.1" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
  return (
    <div style={{ position: 'relative', width: box, height: box, animation: active ? 'corePulse 1.6s ease-in-out infinite' : 'orbFloat 4.5s ease-in-out infinite' }}>
      <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: `radial-gradient(circle, ${col}22 0%, transparent 70%)` }} />
      {ring(0, '2 6', 'spin-slow 26s linear infinite', 0.45)}
      {ring(12, '40 14 8 14', 'spin-rev 14s linear infinite', 0.6)}
      <div style={{ position: 'absolute', top: (box - size) / 2, left: (box - size) / 2 }}>
        <DzaryxIcon size={size} glow />
      </div>
    </div>
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
