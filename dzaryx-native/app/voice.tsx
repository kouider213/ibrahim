import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, ScrollView, Platform, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as KeepAwake from 'expo-keep-awake';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../lib/api';
import { useStore } from '../lib/store';

const { width: W, height: H } = Dimensions.get('window');

type State = 'idle' | 'listen' | 'think' | 'speak';

// ── Premium color palette ─────────────────────────────────────
const GOLD    = '#C9A96E';
const GOLD_DIM = '#C9A96E44';
const GOLD_HI  = '#E8C98A';
const WHITE   = '#FFFFFF';
const DIM     = '#FFFFFF33';
const BG      = '#000000';

const STATE_LABEL: Record<State, string> = {
  idle:   'EN ATTENTE',
  listen: 'ÉCOUTE',
  think:  'TRAITEMENT',
  speak:  'RÉPONSE',
};

// VAD constants
const SPEAK_DB    = -25;
const SILENCE_DB  = -40;
const SILENCE_END = 800;
const MIN_SPEECH  = 300;
const VAD_POLL    = 100;

export default function VoiceScreen() {
  const router = useRouter();

  const mobileToken  = useStore(s => s.mobileToken);
  const getSessionId = useStore(s => s.sessionId);

  const [appState, setAppState]    = useState<State>('idle');
  const [response, setResponse]    = useState('');
  const [hudText, setHud]          = useState('Système actif');
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

  stateRef.current = appState;

  // ── Animations ────────────────────────────────────────────────
  const orbScale   = useRef(new Animated.Value(1)).current;
  const orbOpacity = useRef(new Animated.Value(0.15)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Op    = useRef(new Animated.Value(0.5)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Op    = useRef(new Animated.Value(0.3)).current;
  const spinAnim   = useRef(new Animated.Value(0)).current;
  const waveAnim   = useRef(new Animated.Value(0)).current;

  // Idle: gentle pulse on orb
  const idleAnim = useRef<Animated.CompositeAnimation | null>(null);
  // Listen: rings expand
  const listenAnim = useRef<Animated.CompositeAnimation | null>(null);
  // Think: spin arc
  const thinkAnim = useRef<Animated.CompositeAnimation | null>(null);
  // Speak: wave bounce
  const speakAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    stopAllAnims();
    if (appState === 'idle') {
      idleAnim.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(orbScale,   { toValue: 1.06, duration: 2000, useNativeDriver: true }),
            Animated.timing(orbOpacity, { toValue: 0.25, duration: 2000, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(orbScale,   { toValue: 1.0, duration: 2000, useNativeDriver: true }),
            Animated.timing(orbOpacity, { toValue: 0.12, duration: 2000, useNativeDriver: true }),
          ]),
        ]),
      );
      idleAnim.current.start();
    } else if (appState === 'listen') {
      ring1Scale.setValue(1); ring1Op.setValue(0.6);
      ring2Scale.setValue(1); ring2Op.setValue(0.3);
      listenAnim.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring1Scale, { toValue: 1.6, duration: 900, useNativeDriver: true }),
            Animated.timing(ring1Scale, { toValue: 1.0, duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring1Op, { toValue: 0, duration: 900, useNativeDriver: true }),
            Animated.timing(ring1Op, { toValue: 0.6, duration: 900, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(ring2Scale, { toValue: 1.9, duration: 900, useNativeDriver: true }),
            Animated.timing(ring2Scale, { toValue: 1.0, duration: 900, useNativeDriver: true }),
          ]),
        ]),
      );
      listenAnim.current.start();
    } else if (appState === 'think') {
      spinAnim.setValue(0);
      thinkAnim.current = Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      );
      thinkAnim.current.start();
    } else if (appState === 'speak') {
      waveAnim.setValue(0);
      speakAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
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
    orbOpacity.setValue(0.15);
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
      if (d.toolLabel) setHud(d.toolLabel);
    });
    sock.on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text); setHud(d.text.slice(0, 100));
    });
    sock.on('Dzaryx:response', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text); setHud(d.text.slice(0, 100));
    });
    sock.on('Dzaryx:proactive', (d: { text: string }) => {
      setResponse(d.text); setHud(d.text.slice(0, 80));
    });
    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, []);

  // Microphone
  useEffect(() => {
    let alive = true;
    async function initMic() {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { setHud('Microphone refusé'); return; }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true,
      });
      if (alive) { startVADLoop(); setHud('Parlez naturellement…'); }
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
    setHud('Analyse en cours…');
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
      setHud(`"${text}"`);
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); setAppState('idle'); }
      }
    } catch (err) {
      console.error('[voice] processRecording:', err);
      setHud('Erreur — réessaie');
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
      setAppState('think'); setHud('Lecture document…');
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
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) { console.error('[scan]:', err); setHud('Erreur scan'); }
    finally { setAppState('idle'); setScan(false); }
  }, [mobileToken]);

  const handleVision = useCallback(async () => {
    setVision(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
      if (result.canceled || !result.assets[0]?.base64) { setVision(false); return; }
      const b64  = result.assets[0].base64;
      const mime = result.assets[0].mimeType ?? 'image/jpeg';
      setAppState('think'); setHud('Analyse visuelle…');
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
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) { console.error('[vision]:', err); setHud('Erreur vision'); }
    finally { setAppState('idle'); setVision(false); }
  }, [mobileToken]);

  // ── Computed animation values ─────────────────────────────────
  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const waveScale = waveAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });

  const isActive = appState !== 'idle';
  const orbGlow = appState === 'listen' ? GOLD
                : appState === 'think'  ? '#9B59B6'
                : appState === 'speak'  ? '#52E3A1'
                : '#4FC3F7';

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Top header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={[s.connDot, { backgroundColor: wsConnected ? '#52E3A1' : '#FF4444' }]} />
          <Text style={s.headerTitle}>DZARYX</Text>
        </View>
        <View style={s.stateBadge}>
          <Text style={[s.stateBadgeText, { color: isActive ? GOLD : DIM }]}>
            {STATE_LABEL[appState]}
          </Text>
        </View>
      </View>

      {/* ── Orb area ── */}
      <View style={s.orbArea}>

        {/* Outer expansion ring (listen) */}
        <Animated.View style={[
          s.ring, s.ringOuter,
          { borderColor: orbGlow + '33', transform: [{ scale: ring2Scale }], opacity: ring2Op },
        ]} />

        {/* Inner ring */}
        <Animated.View style={[
          s.ring, s.ringInner,
          { borderColor: orbGlow + '66', transform: [{ scale: ring1Scale }], opacity: ring1Op },
        ]} />

        {/* Think arc spinner */}
        {appState === 'think' && (
          <Animated.View style={[s.spinArc, { borderTopColor: GOLD, transform: [{ rotate: spinDeg }] }]} />
        )}

        {/* Main orb */}
        <Animated.View style={[
          s.orb,
          {
            shadowColor:     orbGlow,
            backgroundColor: orbGlow + '18',
            borderColor:     orbGlow + (isActive ? 'CC' : '44'),
            transform: [
              { scale: appState === 'speak' ? waveScale : orbScale },
            ],
            opacity: appState === 'idle' ? orbOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) : 1,
          },
        ]}>
          {/* D monogram */}
          <Text style={[s.orbMonogram, { color: orbGlow }]}>D</Text>
        </Animated.View>

        {/* Listen sound bars */}
        {appState === 'listen' && (
          <View style={s.soundBars}>
            {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8].map((h, i) => (
              <SoundBar key={i} heightRatio={h} delay={i * 80} color={GOLD} />
            ))}
          </View>
        )}
      </View>

      {/* ── HUD subtitle ── */}
      <Text style={s.hudText} numberOfLines={1}>{hudText}</Text>

      {/* ── Response area ── */}
      {response ? (
        <ScrollView
          style={s.responseBox}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.responseText}>{response}</Text>
        </ScrollView>
      ) : (
        <View style={s.responseBox}>
          <Text style={s.placeholderText}>Parlez naturellement…</Text>
        </View>
      )}

      {/* ── Bottom actions ── */}
      <View style={s.bottomBar}>
        {/* SCAN */}
        <TouchableOpacity
          style={[s.actionBtn, scanLoading && s.actionBtnActive]}
          onPress={handleScan}
          disabled={scanLoading}
        >
          <Text style={s.actionIcon}>⬡</Text>
          <Text style={s.actionLabel}>SCAN</Text>
        </TouchableOpacity>

        {/* Center mic — push to talk fallback */}
        <TouchableOpacity
          style={[s.micBtn, { shadowColor: orbGlow, borderColor: orbGlow + (isActive ? 'FF' : '55') }]}
          onPress={() => {
            if (appState === 'idle') setHud('Parlez maintenant…');
          }}
          activeOpacity={0.8}
        >
          <View style={[s.micBtnInner, { backgroundColor: isActive ? orbGlow + '33' : '#FFFFFF0D' }]}>
            <Text style={[s.micIcon, { color: isActive ? orbGlow : WHITE + '88' }]}>
              {appState === 'think' ? '◎' : appState === 'speak' ? '▶' : '◉'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* CAMERA */}
        <TouchableOpacity
          style={[s.actionBtn, visionLoading && s.actionBtnActive]}
          onPress={handleVision}
          disabled={visionLoading}
        >
          <Text style={s.actionIcon}>◈</Text>
          <Text style={s.actionLabel}>CAMÉRA</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom safe area spacer */}
      <View style={{ height: Platform.OS === 'android' ? 8 : 0 }} />
    </View>
  );
}

// ── Sound bar component ───────────────────────────────────────
function SoundBar({ heightRatio, delay, color }: { heightRatio: number; delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: heightRatio, duration: 300 + delay, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0.2,         duration: 300 + delay, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      width: 3, marginHorizontal: 2,
      borderRadius: 2,
      backgroundColor: color,
      height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 28] }),
      opacity: 0.9,
    }} />
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
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 12,
  },

  // Header
  header: {
    width: W - 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  headerTitle: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  stateBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD_DIM,
    backgroundColor: GOLD + '0A',
  },
  stateBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // Orb
  orbArea: {
    width: 280, height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ringOuter: { width: 240, height: 240 },
  ringInner: { width: 180, height: 180 },
  spinArc: {
    position: 'absolute',
    width: 144, height: 144,
    borderRadius: 72,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: GOLD,
  },
  orb: {
    width: 120, height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 32,
    elevation: 12,
  },
  orbMonogram: {
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif-light',
  },
  soundBars: {
    position: 'absolute',
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
  },

  // HUD
  hudText: {
    color: WHITE + '50',
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    paddingHorizontal: 24,
    textAlign: 'center',
    marginBottom: 4,
  },

  // Response
  responseBox: {
    width: W - 32,
    flex: 1,
    maxHeight: H * 0.22,
    backgroundColor: '#FFFFFF07',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOLD + '22',
    marginVertical: 8,
    justifyContent: 'center',
  },
  responseText: {
    color: WHITE,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  placeholderText: {
    color: WHITE + '1A',
    fontSize: 13,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    paddingVertical: 20,
  },

  // Bottom bar
  bottomBar: {
    width: W - 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  actionBtn: {
    width: 64, height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: WHITE + '18',
    backgroundColor: WHITE + '06',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionBtnActive: {
    borderColor: GOLD + '88',
    backgroundColor: GOLD + '12',
  },
  actionIcon: {
    fontSize: 20,
    color: WHITE + 'AA',
  },
  actionLabel: {
    color: WHITE + '55',
    fontSize: 8,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  micBtn: {
    width: 80, height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 8,
  },
  micBtnInner: {
    flex: 1,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 28,
  },
});
