import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Animated, ScrollView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as KeepAwake from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../lib/api';
import { useStore } from '../lib/store';

const { width: W, height: H } = Dimensions.get('window');

type State = 'idle' | 'listen' | 'think' | 'speak';

const STATE_COLOR: Record<State, string> = {
  idle:   '#00d4e8',
  listen: '#ff3366',
  think:  '#9b59b6',
  speak:  '#00e676',
};

const STATE_LABEL: Record<State, string> = {
  idle:   'EN ATTENTE',
  listen: 'ÉCOUTE',
  think:  'RÉFLEXION',
  speak:  'PARLE',
};

// VAD constants
const SPEAK_DB    = -28;  // dB above = speaking
const SILENCE_DB  = -40;  // dB below = silence
const SILENCE_END = 1400; // ms silence to end utterance
const MIN_SPEECH  = 350;  // ms minimum speech
const VAD_POLL    = 150;  // ms poll interval

export default function VoiceScreen() {
  const router = useRouter();

  const mobileToken = useStore(s => s.mobileToken);
  const getSessionId = useStore(s => s.sessionId);

  const [appState, setAppState]     = useState<State>('idle');
  const [response, setResponse]     = useState('');
  const [hudText, setHud]           = useState('DZARYX — SYSTÈME ACTIF');
  const [wsConnected, setWsConn]    = useState(false);
  const [visionLoading, setVision]  = useState(false);
  const [scanLoading, setScan]      = useState(false);

  const socketRef      = useRef<Socket | null>(null);
  const recordingRef   = useRef<Audio.Recording | null>(null);
  const vadTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechStartRef = useRef<number>(0);
  const isSpeakingRef  = useRef(false);
  const stateRef       = useRef<State>('idle');
  const sessionIdRef   = useRef(getSessionId());

  stateRef.current = appState;

  // Ring animations
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const orbPulse = useRef(new Animated.Value(1)).current;
  const ring1Anim = useRef<Animated.CompositeAnimation | null>(null);
  const ring2Anim = useRef<Animated.CompositeAnimation | null>(null);
  const ring3Anim = useRef<Animated.CompositeAnimation | null>(null);
  const orbAnim   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    ring1Anim.current = Animated.loop(Animated.timing(ring1, { toValue: 1, duration: 5000, useNativeDriver: true }));
    ring2Anim.current = Animated.loop(Animated.timing(ring2, { toValue: 1, duration: 8000, useNativeDriver: true }));
    ring3Anim.current = Animated.loop(Animated.timing(ring3, { toValue: 1, duration: 12000, useNativeDriver: true }));
    ring1Anim.current.start();
    ring2Anim.current.start();
    ring3Anim.current.start();
    return () => {
      ring1Anim.current?.stop();
      ring2Anim.current?.stop();
      ring3Anim.current?.stop();
    };
  }, [ring1, ring2, ring3]);

  useEffect(() => {
    orbAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1.12, duration: 1200, useNativeDriver: true }),
        Animated.timing(orbPulse, { toValue: 1.0,  duration: 1200, useNativeDriver: true }),
      ])
    );
    orbAnim.current.start();
    return () => orbAnim.current?.stop();
  }, [orbPulse]);

  // Keep screen awake
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => { KeepAwake.deactivateKeepAwake(); };
  }, []);

  // Socket.IO
  useEffect(() => {
    const sid = sessionIdRef.current;
    sessionIdRef.current = getSessionId();
    const sock = io(`${BACKEND_URL}/mobile`, {
      auth:         { token: mobileToken() },
      transports:   ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    sock.on('connect',    () => { setWsConn(true); });
    sock.on('disconnect', () => { setWsConn(false); });

    sock.on('Dzaryx:status', (d: { status: string; sessionId?: string; toolLabel?: string | null }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      const s = d.status as State;
      setAppState(s);
      if (d.toolLabel) setHud(d.toolLabel);
    });

    sock.on('Dzaryx:text_complete', (d: { text: string; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text);
      setHud(d.text.slice(0, 100));
    });

    sock.on('Dzaryx:response', (d: { text: string; fallback?: boolean; sessionId?: string }) => {
      if (d.sessionId && d.sessionId !== sid) return;
      setResponse(d.text);
      setHud(d.text.slice(0, 100));
    });

    sock.on('Dzaryx:proactive', (d: { text: string }) => {
      setResponse(d.text);
      setHud(`📡 ${d.text.slice(0, 80)}`);
    });

    socketRef.current = sock;
    return () => { sock.disconnect(); socketRef.current = null; };
  }, []);

  // Microphone setup
  useEffect(() => {
    let alive = true;
    async function initMic() {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') { setHud('MICRO REFUSÉ — VÉRIFIE LES PERMISSIONS'); return; }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      if (alive) {
        startVADLoop();
        setHud('ÉCOUTE ACTIVE — PARLE-MOI');
      }
    }
    initMic();
    return () => {
      alive = false;
      stopVADLoop();
      stopRecording().catch(() => {});
    };
  }, []);

  function startVADLoop() {
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadTimerRef.current = setInterval(async () => {
      if (stateRef.current === 'think' || stateRef.current === 'speak') return;

      const rec = recordingRef.current;
      if (!rec) {
        // Not recording — start a monitoring recording
        await beginRecording();
        return;
      }

      try {
        const status = await rec.getStatusAsync();
        const db = status.metering ?? -100;

        if (db > SPEAK_DB) {
          // Speaking
          if (silenceRef.current) { clearTimeout(silenceRef.current); silenceRef.current = null; }
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            speechStartRef.current = Date.now();
            setAppState('listen');
          }
        } else if (isSpeakingRef.current && !silenceRef.current) {
          // Possible silence after speech
          silenceRef.current = setTimeout(() => {
            silenceRef.current = null;
            const dur = Date.now() - speechStartRef.current;
            if (dur > MIN_SPEECH) {
              processRecording();
            } else {
              isSpeakingRef.current = false;
              setAppState('idle');
              restartRecording();
            }
          }, SILENCE_END);
        }
      } catch { /* recording may have been stopped */ }
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
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {},
      });
      await rec.startAsync();
      recordingRef.current = rec;
    } catch (err) {
      console.error('[voice] beginRecording error:', err);
    }
  }

  async function stopRecording(): Promise<string | null> {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) return null;
    try {
      await rec.stopAndUnloadAsync();
      return rec.getURI() ?? null;
    } catch { return null; }
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
    setHud('TRAITEMENT EN COURS...');

    const uri = await stopRecording();
    if (!uri) { setAppState('idle'); await beginRecording(); return; }

    try {
      // Convert URI to base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const b64 = await blobToBase64(blob);

      // Transcribe
      const transcribeRes = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ audio: b64, mimeType: 'audio/m4a' }),
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { text } = await transcribeRes.json() as { text: string };
      if (!text?.trim()) { setAppState('idle'); await beginRecording(); return; }

      setHud(`"${text}"`);

      // Chat
      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current }),
      });

      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }

        if (data.audio) {
          setAppState('speak');
          await playAudioBase64(data.audio);
          setAppState('idle');
        }
      }
    } catch (err) {
      console.error('[voice] processRecording error:', err);
      setHud('ERREUR — RÉESSAIE');
      setAppState('idle');
    } finally {
      await beginRecording();
    }
  }

  // Scan OCR
  const handleScan = useCallback(async () => {
    setScan(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'], base64: true, quality: 0.8,
      });
      if (result.canceled || !result.assets[0]?.base64) { setScan(false); return; }
      const b64  = result.assets[0].base64;
      const mime = result.assets[0].mimeType ?? 'image/jpeg';

      setAppState('think');
      setHud('OCR — LECTURE DOCUMENT…');

      const scanRes = await fetch(`${BACKEND_URL}/api/vision/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const scanData = await scanRes.json() as { description: string; type: string; extractedData?: Record<string, unknown> };
      const scanText = `[SCAN DOC - ${scanData.type}] ${scanData.description}`;

      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: scanText, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) {
      console.error('[scan] error:', err);
      setHud('ERREUR SCAN');
    } finally {
      setAppState('idle');
      setScan(false);
    }
  }, [mobileToken]);

  // Vision
  const handleVision = useCallback(async () => {
    setVision(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.base64) { setVision(false); return; }

      const b64 = result.assets[0].base64;
      const mime = result.assets[0].mimeType ?? 'image/jpeg';

      setAppState('think');
      setHud('ANALYSE VISUELLE...');

      const visionRes = await fetch(`${BACKEND_URL}/api/vision/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ imageBase64: b64, mimeType: mime }),
      });
      const visionData = await visionRes.json() as { description: string };
      const desc = visionData.description ?? 'Analyse terminée';

      const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken()}` },
        body: JSON.stringify({ message: `[VISION] ${desc}`, sessionId: sessionIdRef.current }),
      });
      if (chatRes.ok) {
        const data = await chatRes.json() as { text?: string; audio?: string };
        if (data.text) { setResponse(data.text); setHud(data.text.slice(0, 80)); }
        if (data.audio) { setAppState('speak'); await playAudioBase64(data.audio); }
      }
    } catch (err) {
      console.error('[vision] error:', err);
      setHud('ERREUR VISION');
    } finally {
      setAppState('idle');
      setVision(false);
    }
  }, []);

  const col = STATE_COLOR[appState];
  const rot1 = ring1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rot2 = ring2.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });
  const rot3 = ring3.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.container}>
      {/* Corner brackets */}
      <Corner pos="tl" col={col} />
      <Corner pos="tr" col={col} />
      <Corner pos="bl" col={col} />
      <Corner pos="br" col={col} />

      {/* HUD top */}
      <View style={styles.hudTop}>
        <Text style={[styles.stateLabel, { color: col, textShadowColor: col, textShadowRadius: 8 }]}>
          {STATE_LABEL[appState]}
        </Text>
        <View style={[styles.stateLine, { backgroundColor: col, opacity: 0.6 }]} />
      </View>

      {/* Connection dot */}
      <View style={[styles.wsIndicator, { backgroundColor: wsConnected ? col : '#ff3366' }]} />

      {/* HUD message */}
      <Text style={styles.hudMsg} numberOfLines={2}>{hudText}</Text>

      {/* Orb area */}
      <View style={styles.orbArea}>
        {/* Ring 3 — outer hex-ish */}
        <Animated.View
          style={[styles.ring, styles.ring3, { borderColor: col + '22', transform: [{ rotate: rot3 }] }]}
        />
        {/* Ring 2 */}
        <Animated.View
          style={[styles.ring, styles.ring2, { borderColor: col + '44', transform: [{ rotate: rot2 }] }]}
        />
        {/* Ring 1 — inner */}
        <Animated.View
          style={[styles.ring, styles.ring1, { borderColor: col + '88', transform: [{ rotate: rot1 }] }]}
        />
        {/* Orb */}
        <Animated.View
          style={[
            styles.orb,
            {
              backgroundColor: col + '22',
              borderColor: col,
              shadowColor: col,
              transform: [{ scale: orbPulse }],
            },
          ]}
        >
          <Text style={[styles.orbLetter, { color: col }]}>D</Text>
        </Animated.View>
      </View>

      {/* Response text */}
      {response ? (
        <ScrollView
          style={styles.responseBox}
          contentContainerStyle={{ padding: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.responseText, { color: col }]}>{response}</Text>
        </ScrollView>
      ) : null}

      {/* Bottom controls */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.btn, { borderColor: visionLoading ? '#9b59b6' : col + '66' }]}
          onPress={handleVision}
          disabled={visionLoading}
        >
          <Text style={styles.btnIcon}>👁</Text>
          <Text style={[styles.btnLabel, { color: col + 'aa' }]}>VISION</Text>
        </TouchableOpacity>

        <View style={styles.micStatus}>
          <View style={[styles.micDot, { backgroundColor: col, shadowColor: col }]} />
          <Text style={styles.micTxt}>VAD</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, { borderColor: scanLoading ? '#9b59b666' : '#ffb34766' }]}
          onPress={handleScan}
          disabled={scanLoading}
        >
          <Text style={styles.btnIcon}>{scanLoading ? '⏳' : '📄'}</Text>
          <Text style={[styles.btnLabel, { color: '#ffb347aa' }]}>SCAN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, { borderColor: '#ff6b0066' }]}
          onPress={() => router.push('/text')}
        >
          <Text style={styles.btnIcon}>⌨️</Text>
          <Text style={[styles.btnLabel, { color: '#ff6b00aa' }]}>TEXTE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  } catch (err) {
    console.error('[audio] playback error:', err);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      res(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = rej;
    reader.readAsDataURL(blob);
  });
}

function Corner({ pos, col }: { pos: 'tl' | 'tr' | 'bl' | 'br'; col: string }) {
  const size = 18;
  return (
    <View style={{
      position: 'absolute', width: size, height: size,
      left:   pos.endsWith('l')  ? 10 : undefined,
      right:  pos.endsWith('r')  ? 10 : undefined,
      top:    pos.startsWith('t') ? 10 : undefined,
      bottom: pos.startsWith('b') ? 10 : undefined,
      borderColor: col + '66',
      borderTopWidth:    pos.startsWith('t') ? 1.5 : 0,
      borderBottomWidth: pos.startsWith('b') ? 1.5 : 0,
      borderLeftWidth:   pos.endsWith('l')   ? 1.5 : 0,
      borderRightWidth:  pos.endsWith('r')   ? 1.5 : 0,
    }} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 60, paddingBottom: Platform.OS === 'android' ? 20 : 34,
    position: 'relative',
  },
  hudTop: { alignItems: 'center', gap: 6 },
  stateLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11, fontWeight: '700', letterSpacing: 4,
  },
  stateLine: { width: 60, height: 1 },
  wsIndicator: {
    position: 'absolute', top: 55, right: 16,
    width: 6, height: 6, borderRadius: 3,
  },
  hudMsg: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 9, color: '#00d4e844', letterSpacing: 2,
    textAlign: 'center', paddingHorizontal: 30,
  },
  orbArea: {
    width: 260, height: 260,
    alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ring1: { width: 140, height: 140 },
  ring2: { width: 190, height: 190 },
  ring3: { width: 245, height: 245 },
  orb: {
    width: 90, height: 90, borderRadius: 45,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  orbLetter: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 28, fontWeight: '700',
  },
  responseBox: {
    width: W - 40, maxHeight: 150,
    backgroundColor: 'rgba(0,3,12,0.9)',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#00d4e822',
  },
  responseText: {
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    fontSize: 12, lineHeight: 20,
  },
  bottomRow: {
    flexDirection: 'row', width: W - 48,
    justifyContent: 'space-between', alignItems: 'center',
  },
  btn: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  btnIcon: { fontSize: 18 },
  btnLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 7, letterSpacing: 1,
  },
  micStatus: { alignItems: 'center', gap: 4 },
  micDot: {
    width: 8, height: 8, borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 4,
  },
  micTxt: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 7, color: '#ffffff33', letterSpacing: 1,
  },
});
