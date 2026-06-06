import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, ScrollView, Platform, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as KeepAwake from 'expo-keep-awake';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../lib/api';
import { useStore } from '../lib/store';

const { width: W, height: H } = Dimensions.get('window');

type State = 'idle' | 'listen' | 'think' | 'speak';

// ── Palette épurée (Gemini calm + or Dzaryx) ──────────────────
const GOLD     = '#C9A96E';
const GOLD_HI  = '#E8C98A';
const WHITE    = '#FFFFFF';
const BG       = '#000000';

const STATE_MSG: Record<State, string> = {
  idle:   'Appuyez ou parlez',
  listen: 'Je vous écoute…',
  think:  'Un instant…',
  speak:  'Dzaryx répond',
};

// VAD constants — seuils relevés pour ne plus déclencher sur le bruit de fond
const SPEAK_DB    = -22;
const SILENCE_DB  = -40;
const SILENCE_END = 800;
const MIN_SPEECH  = 300;
const VAD_POLL    = 100;

export default function VoiceScreen() {
  const router = useRouter();

  const mobileToken  = useStore(s => s.mobileToken);
  const getSessionId = useStore(s => s.sessionId);
  const displayName  = useStore(s => s.displayName);
  const actorId      = useStore(s => s.actorId);

  const firstName = displayName?.split(' ')[0]
    ?? (actorId ? actorId.charAt(0).toUpperCase() + actorId.slice(1) : 'Kouider');

  const [appState, setAppState]    = useState<State>('idle');
  const [response, setResponse]    = useState('');
  const [userText, setUserText]    = useState('');     // ce que TU as dit (live transcript)
  const [wsConnected, setWsConn]   = useState(false);
  const [visionLoading, setVision] = useState(false);
  const [scanLoading, setScan]     = useState(false);

  const socketRef    = useRef<Socket | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const vadTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartRef = useRef<number>(0);
  const isSpeakingRef  = useRef(false);
  const stateRef       = useRef<State>('idle');
  const sessionIdRef   = useRef(getSessionId());
  const chimeRef       = useRef<Audio.Sound | null>(null);

  stateRef.current = appState;

  // Précharge le petit son d'activation micro (façon Gemini)
  useEffect(() => {
    let mounted = true;
    Audio.Sound.createAsync(
      require('../assets/page1_voice_vision/audio/listening.wav'),
      { shouldPlay: false, volume: 0.5 },
    ).then(({ sound }) => {
      if (mounted) chimeRef.current = sound;
      else sound.unloadAsync().catch(() => {});
    }).catch(() => {});
    return () => { mounted = false; chimeRef.current?.unloadAsync().catch(() => {}); chimeRef.current = null; };
  }, []);

  function playChime() {
    chimeRef.current?.replayAsync().catch(() => {});
  }

  // ── Animations ────────────────────────────────────────────────
  const orbScale   = useRef(new Animated.Value(1)).current;
  const orbGlow    = useRef(new Animated.Value(0.35)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Op    = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Op    = useRef(new Animated.Value(0)).current;
  const spinAnim   = useRef(new Animated.Value(0)).current;
  const waveAnim   = useRef(new Animated.Value(0)).current;

  const idleAnim   = useRef<Animated.CompositeAnimation | null>(null);
  const listenAnim = useRef<Animated.CompositeAnimation | null>(null);
  const thinkAnim  = useRef<Animated.CompositeAnimation | null>(null);
  const speakAnim  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    stopAllAnims();
    if (appState === 'idle') {
      idleAnim.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(orbScale, { toValue: 1.05, duration: 2600, useNativeDriver: true }),
            Animated.timing(orbGlow,  { toValue: 0.55, duration: 2600, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(orbScale, { toValue: 1.0, duration: 2600, useNativeDriver: true }),
            Animated.timing(orbGlow,  { toValue: 0.35, duration: 2600, useNativeDriver: true }),
          ]),
        ]),
      );
      idleAnim.current.start();
    } else if (appState === 'listen') {
      ring1Scale.setValue(1); ring1Op.setValue(0.5);
      ring2Scale.setValue(1); ring2Op.setValue(0.25);
      orbGlow.setValue(0.7);
      listenAnim.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring1Scale, { toValue: 1.7, duration: 1400, useNativeDriver: true }),
            Animated.timing(ring1Scale, { toValue: 1.0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring1Op, { toValue: 0, duration: 1400, useNativeDriver: true }),
            Animated.timing(ring1Op, { toValue: 0.5, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(700),
            Animated.timing(ring2Scale, { toValue: 2.1, duration: 1400, useNativeDriver: true }),
            Animated.timing(ring2Scale, { toValue: 1.0, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(700),
            Animated.timing(ring2Op, { toValue: 0, duration: 1400, useNativeDriver: true }),
            Animated.timing(ring2Op, { toValue: 0.25, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      listenAnim.current.start();
    } else if (appState === 'think') {
      orbGlow.setValue(0.5);
      spinAnim.setValue(0);
      thinkAnim.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      );
      thinkAnim.current.start();
    } else if (appState === 'speak') {
      orbGlow.setValue(0.7);
      waveAnim.setValue(0);
      speakAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      speakAnim.current.start();
    }
  }, [appState]);

  function stopAllAnims() {
    idleAnim.current?.stop();
    listenAnim.current?.stop();
    thinkAnim.current?.stop();
    speakAnim.current?.stop();
    orbScale.setValue(1);
    ring1Scale.setValue(1);
    ring1Op.setValue(0);
    ring2Scale.setValue(1);
    ring2Op.setValue(0);
  }

  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => { KeepAwake.deactivateKeepAwake(); };
  }, []);

  // Socket.IO
  useEffect(() => {
    const sid = sessionIdRef.current;
    sessionIdRef.current = getSessionId();
    const sock = io(`${BACKEND_URL}/mobile`, {
      auth:              { token: mobileToken() },
      transports:        ['websocket', 'polling'],
      reconnection:      true,
      reconnectionDelay: 2000,
      timeout:           10000,
    });
    sock.on('connect',    () => setWsConn(true));
    sock.on('disconnect', () => setWsConn(false));
    sock.on('Dzaryx:status', (d: { status: string; sessionId?: string; toolLabel?: string | null }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setAppState(d.status as State);
    });
    sock.on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text);
    });
    sock.on('Dzaryx:response', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text);
    });
    sock.on('Dzaryx:proactive', (d: { text: string }) => {
      setResponse(d.text);
    });
    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, []);

  // Microphone
  useEffect(() => {
    let alive = true;
    async function initMic() {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { setResponse('Microphone refusé — autorise-le dans les réglages.'); return; }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true,
      });
      if (alive) { startVADLoop(); }
    }
    initMic();
    return () => { alive = false; stopVADLoop(); stopRecording().catch(() => {}); };
  }, []);

  function startVADLoop() {
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadTimerRef.current = setInterval(async () => {
      if (stateRef.current === 'think' || stateRef.current === 'speak') return;
      const rec = recordingRef.current;
      if (!rec) { await beginRecording(); return; }
      try {
        const status = await rec.getStatusAsync();
        const db = status.metering ?? -100;
        if (db > SPEAK_DB) {
          if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            speechStartRef.current = Date.now();
            playChime();
            setAppState('listen');
          }
        } else if (isSpeakingRef.current && !silenceRef.current) {
          silenceRef.current = setTimeout(() => {
            silenceRef.current = null;
            const dur = Date.now() - speechStartRef.current;
            if (dur > MIN_SPEECH) processRecording();
            else { isSpeakingRef.current = false; setAppState('idle'); restartRecording(); }
          }, SILENCE_END);
        }
      } catch { /* recording stopped */ }
    }, VAD_POLL);
  }

  function stopVADLoop() {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    if (silenceRef.current)  { clearTimeout(silenceRef.current);  silenceRef.current  = null; }
  }

  async function beginRecording() {
    try {
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
        android: { extension: '.m4a', outputFormat: Audio.AndroidOutputFormat.MPEG_4, audioEncoder: Audio.AndroidAudioEncoder.AAC, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 },
        ios:     { extension: '.m4a', audioQuality: Audio.IOSAudioQuality.HIGH, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
        web:     {},
      });
      await rec.startAsync();
      recordingRef.current = rec;
    } catch (err) { console.error('[voice] beginRecording:', err); }
  }

  async function stopRecording(): Promise<string | null> {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return null;
    try { await rec.stopAndUnloadAsync(); return rec.getURI() ?? null; } catch { return null; }
  }

  async function restartRecording() {
    await stopRecording();
    isSpeakingRef.current = false;
    await beginRecording();
  }

  async function processRecording() {
    if (stateRef.current === 'think' || stateRef.current === 'speak') return;
    isSpeakingRef.current = false;
    setAppState('think');
    const uri = await stopRecording();
    if (!uri) { setAppState('idle'); await beginRecording(); return; }
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const transcribeRes = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ audio: b64, mimeType: 'audio/m4a' }),
      });
      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { text } = await transcribeRes.json() as { text: string };
      if (!text?.trim()) { setAppState('idle'); await beginRecording(); return; }
      setUserText(text);
      setResponse('');
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); setAppState('idle'); }
      }
    } catch (err) {
      console.error('[voice] processRecording:', err);
      setResponse('Erreur — réessaie.');
      setAppState('idle');
    } finally {
      await beginRecording();
    }
  }

  const handleScan = useCallback(async () => {
    setScan(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
      if (result.canceled || !result.assets[0]?.base64) { setScan(false); return; }
      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType ?? 'image/jpeg';
      setAppState('think'); setUserText('Document scanné');
      const scanRes = await fetch(`${BACKEND_URL}/api/vision/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const scanData = await scanRes.json() as { description: string; type: string };
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: `[SCAN DOC - ${scanData.type}] ${scanData.description}`, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) { console.error('[scan]:', err); setResponse('Erreur scan'); }
    finally { setAppState('idle'); setScan(false); }
  }, [mobileToken]);

  const handleVision = useCallback(async () => {
    setVision(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      if (result.canceled || !result.assets[0]?.base64) { setVision(false); return; }
      const b64  = result.assets[0].base64;
      const mime = result.assets[0].mimeType ?? 'image/jpeg';
      setAppState('think'); setUserText('Analyse visuelle');
      const visionRes = await fetch(`${BACKEND_URL}/api/vision/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const visionData = await visionRes.json() as { description: string };
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: `[VISION] ${visionData.description}`, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) { console.error('[vision]:', err); setResponse('Erreur vision'); }
    finally { setAppState('idle'); setVision(false); }
  }, [mobileToken]);

  // ── Computed animation values ─────────────────────────────────
  const spinDeg   = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const waveScale = waveAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] });
  const coreScale = appState === 'speak' ? waveScale : orbScale;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Lueur ambiante bas (façon Gemini) */}
      <View pointerEvents="none" style={s.ambientGlow} />

      {/* ── Top minimal ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} hitSlop={12}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={s.connRow}>
          <View style={[s.connDot, { backgroundColor: wsConnected ? '#52E3A1' : '#FF5A5A' }]} />
          <Text style={s.connLabel}>Dzaryx</Text>
        </View>
        <View style={s.iconBtn} />
      </View>

      {/* ── Centre : étoile + texte (façon Gemini Live) ── */}
      <View style={s.center}>
        {/* étoile Dzaryx */}
        <View style={s.sparkleWrap}>
          <View style={[s.sparkle, { transform: [{ rotate: '0deg' }] }]} />
          <View style={[s.sparkle, { transform: [{ rotate: '45deg' }], opacity: 0.5 }]} />
        </View>

        {/* Texte */}
        <View style={s.textArea}>
          {response ? (
            <ScrollView
              style={s.responseScroll}
              contentContainerStyle={{ paddingVertical: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {!!userText && <Text style={s.userLine}>« {userText} »</Text>}
              <Text style={s.responseText}>{response}</Text>
            </ScrollView>
          ) : appState === 'idle' ? (
            <>
              <Text style={s.greeting}>Bonjour, {firstName}</Text>
              <Text style={s.subtle}>Sur quoi puis-je vous aider ?</Text>
            </>
          ) : (
            <>
              {!!userText && appState !== 'listen' && <Text style={s.userLine}>« {userText} »</Text>}
              <Text style={s.stateLine}>{STATE_MSG[appState]}</Text>
            </>
          )}
        </View>
      </View>

      {/* ── Bas : caméra · orbe pill · scan ── */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.ghostBtn, visionLoading && s.ghostBtnActive]}
          onPress={handleVision}
          disabled={visionLoading}
          activeOpacity={0.7}
        >
          <Text style={s.ghostIcon}>◎</Text>
        </TouchableOpacity>

        {/* Orbe pill — coeur lumineux, animé selon l'état */}
        <View style={s.pillWrap}>
          {/* halo lumineux */}
          <Animated.View style={[s.pillGlow, { opacity: orbGlow, transform: [{ scaleX: coreScale }] }]} />
          {/* arc de réflexion */}
          {appState === 'think' && (
            <Animated.View style={[s.pillSpin, { transform: [{ rotate: spinDeg }] }]} />
          )}
          {/* pill */}
          <Animated.View style={[s.pill, { transform: [{ scaleX: coreScale }] }]}>
            <View style={s.pillCore} />
          </Animated.View>
        </View>

        <TouchableOpacity
          style={[s.ghostBtn, scanLoading && s.ghostBtnActive]}
          onPress={handleScan}
          disabled={scanLoading}
          activeOpacity={0.7}
        >
          <Text style={s.ghostIcon}>⌑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Audio playback ────────────────────────────────────────────
async function playAudioBase64(b64: string): Promise<void> {
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mp3;base64,${b64}` },
      { shouldPlay: true },
    );
    await new Promise<void>(resolve => {
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          resolve();
        }
      });
    });
  } catch (err) { console.error('[audio]:', err); }
}

// ── Styles ────────────────────────────────────────────────────
const SANS = Platform.OS === 'ios' ? 'System' : 'sans-serif';
const SANS_LIGHT = Platform.OS === 'ios' ? 'System' : 'sans-serif-light';

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 28,
  },

  // Lueur ambiante bas
  ambientGlow: {
    position: 'absolute',
    bottom: -H * 0.18,
    alignSelf: 'center',
    width: W * 1.3,
    height: H * 0.45,
    borderRadius: W,
    backgroundColor: GOLD,
    opacity: 0.06,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  iconBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: {
    color: WHITE + 'AA',
    fontSize: 34,
    fontWeight: '300',
    marginTop: -4,
  },
  connRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connLabel: {
    color: WHITE + '99',
    fontSize: 15,
    fontWeight: '500',
    fontFamily: SANS,
    letterSpacing: 0.3,
  },

  // Centre
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleWrap: {
    width: 30, height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  sparkle: {
    position: 'absolute',
    width: 26, height: 26,
    backgroundColor: GOLD,
    borderRadius: 7,
    // losange à 4 branches (approx étoile Gemini)
    transform: [{ rotate: '0deg' }],
  },

  // Texte
  textArea: {
    width: W - 56,
    maxHeight: H * 0.26,
    marginTop: 44,
    alignItems: 'center',
  },
  greeting: {
    color: WHITE,
    fontSize: 30,
    fontWeight: '300',
    fontFamily: SANS_LIGHT,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtle: {
    color: WHITE + '40',
    fontSize: 15,
    fontFamily: SANS,
    textAlign: 'center',
    marginTop: 12,
  },
  stateLine: {
    color: WHITE + '80',
    fontSize: 19,
    fontWeight: '300',
    fontFamily: SANS_LIGHT,
    textAlign: 'center',
  },
  userLine: {
    color: GOLD_HI,
    fontSize: 15,
    fontFamily: SANS,
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  responseScroll: {
    width: '100%',
  },
  responseText: {
    color: WHITE + 'E6',
    fontSize: 18,
    lineHeight: 27,
    fontWeight: '300',
    fontFamily: SANS_LIGHT,
    textAlign: 'center',
  },

  // Bas
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: 24,
  },
  ghostBtn: {
    width: 52, height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: WHITE + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnActive: {
    borderColor: GOLD + '99',
    backgroundColor: GOLD + '14',
  },
  ghostIcon: {
    fontSize: 22,
    color: WHITE + '99',
  },

  // Orbe pill (centre du bas)
  pillWrap: {
    width: 116, height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGlow: {
    position: 'absolute',
    width: 104, height: 50,
    borderRadius: 25,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 18,
  },
  pillSpin: {
    position: 'absolute',
    width: 108, height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: GOLD_HI,
  },
  pill: {
    width: 96, height: 46,
    borderRadius: 23,
    backgroundColor: '#1a1408',
    borderWidth: 1,
    borderColor: GOLD + '66',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pillCore: {
    width: 64, height: 22,
    borderRadius: 11,
    backgroundColor: GOLD,
    opacity: 0.9,
  },
});
