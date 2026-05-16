import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Animated, Easing, Dimensions, Platform, AppState, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type CameraViewRef } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { io, type Socket } from 'socket.io-client';
import { useStore } from '../lib/store';
import { sendMessage, type UserLocation } from '../lib/api';

const { width: W } = Dimensions.get('window');
const BACKEND_URL  = process.env.EXPO_PUBLIC_BACKEND_URL  ?? 'https://ibrahim-backend-production.up.railway.app';
const MOBILE_TOKEN = process.env.EXPO_PUBLIC_MOBILE_TOKEN ?? '';

type JarvisState = 'idle' | 'listen' | 'think' | 'speak';
type Overlay     = 'none' | 'text' | 'camera';

const LABEL: Record<JarvisState, string> = {
  idle: 'EN ATTENTE', listen: 'ÉCOUTE ACTIVE', think: 'ANALYSE IA', speak: 'DZARYX PARLE',
};
const SUB: Record<JarvisState, string> = {
  idle:   'Maintenir le micro pour parler',
  listen: "J'enregistre...",
  think:  'Traitement en cours...',
  speak:  'Réponse en cours...',
};
const HUD = 'SYS ONLINE · AI ACTIVE · CAM STANDBY · FIK CONCIERGERIE · NEXUS LINK · VOICE ON · ';
const ORB_COLOR: Record<JarvisState, string> = {
  idle: '#00e5ff', listen: '#ff2d55', think: '#7c3aed', speak: '#00ffaa',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export default function JarvisScreen() {
  const insets = useSafeAreaInsets();
  const { displayName, userId, businessName } = useStore();
  const sessionId = `mobile_${userId ?? 'anonymous'}`;

  const [js,        setJs]      = useState<JarvisState>('idle');
  const [overlay,   setOverlay] = useState<Overlay>('none');
  const [input,     setInput]   = useState('');
  const [lastTxt,   setLastTxt] = useState('');
  const [navLinks,  setNavLinks] = useState<{ waze?: string; maps?: string } | null>(null);
  const locationRef = useRef<UserLocation | null>(null);

  const socketRef   = useRef<Socket | null>(null);
  const cameraRef   = useRef<CameraViewRef>(null);
  const soundRef    = useRef<Audio.Sound | null>(null);
  const recordRef   = useRef<Audio.Recording | null>(null);
  const [camPerm, requestCam] = useCameraPermissions();

  // ── Animations ────────────────────────────────────────────────────
  const pulse   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  const spin    = useRef(new Animated.Value(0)).current;
  const hudX    = useRef(new Animated.Value(0)).current;
  const txtFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(hudX, { toValue: -W * 2, duration: 20000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(txtFade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(txtFade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    pulse.stopAnimation(); opacity.stopAnimation(); spin.stopAnimation(); spin.setValue(0);

    if (js === 'idle') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse,   { toValue: 1.06, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse,   { toValue: 0.94, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9,  duration: 2000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 2000, useNativeDriver: true }),
      ])).start();
    } else if (js === 'listen') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.2, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.85, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])).start();
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (js === 'think') {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })).start();
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.98, duration: 500, useNativeDriver: true }),
      ])).start();
    } else if (js === 'speak') {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 250, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 250, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.1,  duration: 200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.96, duration: 200, useNativeDriver: true }),
      ])).start();
    }
  }, [js]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const color   = ORB_COLOR[js];

  // ── Socket.IO ─────────────────────────────────────────────────────
  useEffect(() => {
    const s = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current = s;
    // Proactive push from backend (morning briefing, alerts, reminders)
    s.on('Dzaryx:proactive', async (d: { text: string; type: string }) => {
      setNavLinks(null);
      setLastTxt(d.text);
      setJs('speak');
      await playTTS(d.text);
      setJs('idle');
    });

    s.on('Dzaryx:text_complete', async (d: { sessionId: string; text: string }) => {
      if (d.sessionId !== sessionId) return;
      // Extract navigation links from response
      const wazeMatch = d.text.match(/https?:\/\/waze\.com\/ul\?[^\s\)]+/);
      const mapsMatch = d.text.match(/https?:\/\/maps\.google\.com\/\?[^\s\)]+/);
      if (wazeMatch || mapsMatch) {
        setNavLinks({ waze: wazeMatch?.[0], maps: mapsMatch?.[0] });
      } else {
        setNavLinks(null);
      }
      // Clean text for display (remove raw URLs)
      const cleanText = d.text.replace(/https?:\/\/[^\s]+/g, '').replace(/\n{3,}/g, '\n\n').trim();
      setLastTxt(cleanText || d.text);
      setJs('speak');
      await playTTS(cleanText || d.text);
      setJs('idle');
    });
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && !s.connected) s.connect();
    });
    return () => { s.disconnect(); sub.remove(); };
  }, [sessionId]);

  // ── TTS ElevenLabs ────────────────────────────────────────────────
  async function playTTS(text: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOBILE_TOKEN}` },
        body: JSON.stringify({ text: text.slice(0, 300) }),
      });
      if (!res.ok) throw new Error('tts');
      const { audio } = await res.json() as { audio: string };
      await soundRef.current?.unloadAsync().catch(() => {});
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mpeg;base64,${audio}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      await new Promise<void>(r => {
        sound.setOnPlaybackStatusUpdate(s => { if (s.isLoaded && s.didJustFinish) r(); });
      });
      sound.unloadAsync().catch(() => {});
    } catch {
      Speech.speak(text.slice(0, 200), { language: 'fr-FR' });
    }
  }

  // ── Voice recording (hold mic) ────────────────────────────────────
  const startRecord = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordRef.current = recording;
      setJs('listen');
    } catch { setJs('idle'); }
  }, []);

  const stopRecord = useCallback(async () => {
    try {
      if (!recordRef.current) return;
      await recordRef.current.stopAndUnloadAsync();
      const uri = recordRef.current.getURI();
      recordRef.current = null;
      if (!uri) { setJs('idle'); return; }
      setJs('think');

      // Read file as base64
      const response = await fetch(uri);
      const blob     = await response.blob();
      const reader   = new FileReader();
      const base64: string = await new Promise((res, rej) => {
        reader.onload  = () => res((reader.result as string).split(',')[1] ?? '');
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

      // Send to Groq Whisper via backend
      const tr = await fetch(`${BACKEND_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOBILE_TOKEN}` },
        body: JSON.stringify({ audio: base64, mimeType: 'audio/m4a' }),
      });
      if (!tr.ok) throw new Error('transcribe failed');
      const { text } = await tr.json() as { text: string };
      if (text.trim()) {
        setLastTxt(text); setNavLinks(null);
        await handleSend(text);
      } else {
        setJs('idle');
      }
    } catch { setJs('idle'); }
  }, [handleSend]);

  // ── Camera vision ─────────────────────────────────────────────────
  const handleVision = useCallback(async () => {
    if (!camPerm?.granted) { await requestCam(); return; }
    setOverlay('camera');
  }, [camPerm]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      setOverlay('none');
      setJs('think');
      await sendMessage("Que vois-tu sur cette image ? Décris précisément.", sessionId, photo.base64 ?? undefined);
    } catch { setJs('idle'); }
  }, [sessionId]);

  // ── Text send ────────────────────────────────────────────────────
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setLastTxt(''); setNavLinks(null); setOverlay('none'); setInput(''); setJs('think');
    try {
      await sendMessage(text.trim(), sessionId, undefined, locationRef.current ?? undefined);
    } catch {
      setLastTxt('⚠️ Erreur de connexion');
      setJs('idle');
    }
  }, [sessionId]);

  // ── Location (background watch) ───────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 100 },
        loc => {
          locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
        },
      );
    })();
    return () => { sub?.remove(); };
  }, []);

  // ── Push notifications ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId: '3536fdc5-6088-4fd4-9a4f-d443f0a52a1e' })).data;
      // Register token with backend so proactive push works when app is closed
      fetch(`${BACKEND_URL}/api/push-token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOBILE_TOKEN}` },
        body:    JSON.stringify({ token }),
      }).catch(() => {});
    })();

    // When user taps a proactive notification → speak it
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as { text?: string } | undefined;
      const text = data?.text ?? response.notification.request.content.body ?? '';
      if (text) {
        setLastTxt(text);
        setJs('speak');
        playTTS(text).then(() => setJs('idle')).catch(() => setJs('idle'));
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Camera full-screen */}
      {overlay === 'camera' && (
        <View style={StyleSheet.absoluteFillObject}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
          <View style={styles.camUI}>
            <Text style={styles.camTitle}>VISION IA</Text>
            <TouchableOpacity style={styles.shutterBtn} onPress={takePhoto}>
              <View style={styles.shutterCore} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOverlay('none')}>
              <Text style={styles.camCancel}>✕ ANNULER</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* HUD bar */}
      <View style={styles.hudBar}>
        <Animated.Text style={[styles.hudText, { transform: [{ translateX: hudX }] }]}>
          {HUD.repeat(10)}
        </Animated.Text>
      </View>

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cTL]} />
      <View style={[styles.corner, styles.cBR]} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>DZARYX</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={[styles.status, { color }]}>EN LIGNE</Text>
        </View>
      </View>

      {/* Orb */}
      <View style={styles.center}>
        <Animated.View style={[styles.orbOuter, {
          borderColor: color, shadowColor: color,
          transform: [{ scale: pulse }, { rotate: spinDeg }],
        }]}>
          <View style={[styles.orbMid, { borderColor: color }]}>
            <Animated.View style={[styles.orbCore, { backgroundColor: color, opacity }]} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.stateBox, { opacity: txtFade }]}>
          <Text style={[styles.stateLabel, { color }]}>{LABEL[js]}</Text>
          <Text style={styles.stateSub} numberOfLines={5}>{lastTxt || SUB[js]}</Text>
        </Animated.View>

        {/* Navigation buttons */}
        {navLinks && (
          <View style={styles.navRow}>
            {navLinks.waze && (
              <TouchableOpacity style={styles.navBtn} onPress={() => Linking.openURL(navLinks!.waze!)}>
                <Text style={styles.navIco}>🗺️</Text>
                <Text style={styles.navLbl}>WAZE</Text>
              </TouchableOpacity>
            )}
            {navLinks.maps && (
              <TouchableOpacity style={[styles.navBtn, { borderColor: '#00e5ff55' }]} onPress={() => Linking.openURL(navLinks!.maps!)}>
                <Text style={styles.navIco}>📍</Text>
                <Text style={[styles.navLbl, { color: '#00e5ff' }]}>MAPS</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.navBtn, { borderColor: '#333' }]} onPress={() => setNavLinks(null)}>
              <Text style={[styles.navLbl, { color: '#555' }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Text overlay */}
      {overlay === 'text' && (
        <View style={styles.textOverlay}>
          <View style={[styles.textBox, { borderColor: color + '55' }]}>
            <TextInput
              style={styles.textInput}
              placeholder="Écris à Dzaryx..."
              placeholderTextColor="#2a2a2a"
              value={input}
              onChangeText={setInput}
              multiline
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => handleSend(input)}
            />
            <TouchableOpacity style={[styles.sendBtn, { borderColor: color }]} onPress={() => handleSend(input)}>
              <Text style={[styles.sendIcon, { color }]}>↑</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setOverlay('none')} style={{ alignSelf: 'center', marginTop: 10 }}>
            <Text style={styles.cancelTxt}>✕ FERMER</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity style={styles.toolBtn} onPress={handleVision}>
          <Text style={styles.toolIco}>📷</Text>
          <Text style={styles.toolLbl}>VISION</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.micBtn, js === 'listen' && styles.micActive]}
          onPressIn={startRecord}
          onPressOut={stopRecord}
        >
          <Text style={styles.micIco}>🎙</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolBtn} onPress={() => setOverlay(o => o === 'text' ? 'none' : 'text')}>
          <Text style={styles.toolIco}>⌨️</Text>
          <Text style={styles.toolLbl}>TEXTE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },

  hudBar:  { height: 34, overflow: 'hidden', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#001818' },
  hudText: { color: '#00e5ff', fontSize: 9, fontFamily: MONO, letterSpacing: 1.5, width: W * 18 },

  corner: { position: 'absolute', width: 20, height: 20 },
  cTL:    { top: 44, left: 12, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#00e5ff' },
  cBR:    { bottom: 106, right: 12, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#00e5ff' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 10 },
  title:  { color: '#00e5ff', fontSize: 15, fontFamily: MONO, letterSpacing: 7, fontWeight: '700' },
  dot:    { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 10, fontFamily: MONO, letterSpacing: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  orbOuter: {
    width: 186, height: 186, borderRadius: 93, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.85, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 20,
  },
  orbMid:  { width: 144, height: 144, borderRadius: 72, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  orbCore: { width: 70, height: 70, borderRadius: 35 },

  stateBox:  { alignItems: 'center', marginTop: 32, paddingHorizontal: 30 },
  stateLabel:{ fontSize: 13, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },
  stateSub:  { color: '#3a3a3a', fontSize: 12, fontFamily: MONO, marginTop: 10, textAlign: 'center', lineHeight: 20 },

  camUI:      { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 60, gap: 18 },
  camTitle:   { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 4 },
  shutterBtn: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: '#00e5ff', alignItems: 'center', justifyContent: 'center' },
  shutterCore:{ width: 54, height: 54, borderRadius: 27, backgroundColor: '#00e5ff' },
  camCancel:  { color: '#444', fontSize: 11, fontFamily: MONO, letterSpacing: 2 },

  textOverlay:{ position: 'absolute', bottom: 108, left: 14, right: 14 },
  textBox:    { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#070707', borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  textInput:  { flex: 1, color: '#e0e0e0', fontSize: 14, maxHeight: 100, fontFamily: MONO },
  sendBtn:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sendIcon:   { fontSize: 16, fontWeight: '700' },
  cancelTxt:  { color: '#222', fontSize: 10, fontFamily: MONO, letterSpacing: 2 },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 18, justifyContent: 'center' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1a4a1a', backgroundColor: '#050f05' },
  navIco: { fontSize: 16 },
  navLbl: { color: '#00ff88', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2, fontWeight: '700' },

  toolbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#090f0f' },
  toolBtn:    { alignItems: 'center', gap: 5, width: 70 },
  toolIco:    { fontSize: 22 },
  toolLbl:    { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  micBtn:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#040404', borderWidth: 2, borderColor: '#00e5ff', alignItems: 'center', justifyContent: 'center', shadowColor: '#00e5ff', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  micActive:  { borderColor: '#ff2d55', backgroundColor: '#180008', shadowColor: '#ff2d55' },
  micIco:     { fontSize: 26 },
});
