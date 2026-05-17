import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Animated, Easing, Dimensions, Platform, AppState, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type CameraViewRef } from 'expo-camera';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as KeepAwake from 'expo-keep-awake';
import { io, type Socket } from 'socket.io-client';
import { useStore } from '../lib/store';
import { sendMessage, fetchHistory, registerPushToken, fetchNotifications, type UserLocation, type HistoryMessage } from '../lib/api';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

const { width: W } = Dimensions.get('window');
const BACKEND_URL  = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';

type JarvisState = 'idle' | 'listen' | 'think' | 'speak';
type Overlay     = 'none' | 'text' | 'camera' | 'content' | 'history';

interface ContentStatus {
  tiktok: {
    configured: boolean;
    pendingVideo: {
      id: string; title: string; caption: string;
      script: string; hashtags: string[]; createdAt: string;
    } | null;
  };
  whatsapp: { configured: boolean; from: string | null };
}

interface TikTokIntelligence {
  optimal_posting_windows?: Array<{ day: string; hour: number; label: string }>;
  viral_ideas?: Array<{ hook: string; style: string }>;
  virality_score?: number;
  best_posting_time?: string;
}

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
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

export default function JarvisScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { displayName, userId, businessName, actorId, mobileToken, sessionId: getSessionId } = useStore();
  const MOBILE_TOKEN = mobileToken();
  const sessionId    = getSessionId();

  const [js,        setJs]      = useState<JarvisState>('idle');
  const [overlay,   setOverlay] = useState<Overlay>('none');
  const [input,     setInput]   = useState('');
  const [lastTxt,   setLastTxt] = useState('');
  const [navLinks,  setNavLinks] = useState<{ waze?: string; maps?: string } | null>(null);
  const [histMsgs,  setHistMsgs] = useState<HistoryMessage[]>([]);
  const [histLoad,  setHistLoad] = useState(false);
  const [carMode,        setCarMode]       = useState(false);
  const [carCountdown,   setCarCountdown]  = useState<number | null>(null);
  const [contentStatus,  setContentStatus] = useState<ContentStatus | null>(null);
  const [tiktokIntel,    setTiktokIntel]   = useState<TikTokIntelligence | null>(null);
  const [unreadNotifs,   setUnreadNotifs]  = useState(0);
  const locationRef    = useRef<UserLocation | null>(null);
  const carTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCarListenRef = useRef<(() => void) | null>(null);

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
    const s = io(`${BACKEND_URL}/mobile`, {
      transports: ['websocket'],
      auth: { token: MOBILE_TOKEN },
    });
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
      // Car mode: auto-listen after response
      if (carModeRef.current) startCarListenRef.current?.();
    });
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && !s.connected) s.connect();
    });
    return () => { s.disconnect(); sub.remove(); };
  }, [sessionId]);

  // ── TTS ElevenLabs ────────────────────────────────────────────────
  const carModeRef = useRef(false);
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

  // ── Car mode toggle ───────────────────────────────────────────
  const toggleCarMode = useCallback(() => {
    setCarMode(prev => {
      const next = !prev;
      carModeRef.current = next;
      if (next) {
        KeepAwake.activateKeepAwakeAsync('car').catch(() => {});
      } else {
        KeepAwake.deactivateKeepAwake('car');
        if (carTimerRef.current)    clearTimeout(carTimerRef.current);
        if (carIntervalRef.current) clearInterval(carIntervalRef.current);
        setCarCountdown(null);
      }
      return next;
    });
  }, []);

  const stopRecordRef = useRef<(() => Promise<void>) | null>(null);

  // ── Content panel (TikTok + WhatsApp) ────────────────────────
  const openContent = useCallback(async () => {
    setOverlay('content');
    try {
      const [statusRes, tiktokRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/content/status`, { headers: { Authorization: `Bearer ${MOBILE_TOKEN}` } }),
        fetch(`${BACKEND_URL}/api/bi/tiktok`,       { headers: { Authorization: `Bearer ${MOBILE_TOKEN}` }, signal: AbortSignal.timeout(8000) }),
      ]);
      if (statusRes.ok) setContentStatus(await statusRes.json() as ContentStatus);
      if (tiktokRes.ok) setTiktokIntel(await tiktokRes.json() as TikTokIntelligence);
    } catch { /* show empty state */ }
  }, [MOBILE_TOKEN]);

  const approveVideo = useCallback(async (id: string) => {
    await fetch(`${BACKEND_URL}/api/content/tiktok/${id}/approve`, {
      method: 'POST', headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
    });
    setContentStatus(prev => prev ? { ...prev, tiktok: { ...prev.tiktok, pendingVideo: null } } : prev);
  }, [MOBILE_TOKEN]);

  const rejectVideo = useCallback(async (id: string) => {
    await fetch(`${BACKEND_URL}/api/content/tiktok/${id}/reject`, {
      method: 'POST', headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
    });
    setContentStatus(prev => prev ? { ...prev, tiktok: { ...prev.tiktok, pendingVideo: null } } : prev);
  }, [MOBILE_TOKEN]);

  const openHistory = useCallback(async () => {
    setOverlay('history');
    setHistLoad(true);
    const msgs = await fetchHistory(sessionId, MOBILE_TOKEN, 40);
    setHistMsgs(msgs);
    setHistLoad(false);
  }, [sessionId, MOBILE_TOKEN]);

  // ── Unread notification count (badge on bell button) ──────────────
  useEffect(() => {
    if (!MOBILE_TOKEN) return;
    fetchNotifications(MOBILE_TOKEN, 50)
      .then(notifs => setUnreadNotifs(notifs.filter(n => n.status !== 'sent').length))
      .catch(() => {});
  }, [MOBILE_TOKEN]);

  // ── Push token registration (once per app launch when user has token) ──
  useEffect(() => {
    if (!MOBILE_TOKEN) return;
    void (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          finalStatus = newStatus;
        }
        if (finalStatus !== 'granted') return;
        const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
        const projectId = extra?.eas?.projectId ?? '3536fdc5-6088-4fd4-9a4f-d443f0a52a1e';
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        await registerPushToken(tokenData.data, MOBILE_TOKEN);
      } catch { /* simulator or permission denied — silent fail */ }
    })();
  }, [MOBILE_TOKEN]);

  // ── Car mode auto-listen (wired after startRecord/stopRecord defined) ────
  useEffect(() => {
    startCarListenRef.current = async () => {
      if (!carModeRef.current) return;
      if (carTimerRef.current)    clearTimeout(carTimerRef.current);
      if (carIntervalRef.current) clearInterval(carIntervalRef.current);
      // Small pause before listening so TTS audio fully stops
      await new Promise(r => setTimeout(r, 800));
      if (!carModeRef.current) return;
      let remaining = 8;
      setCarCountdown(remaining);
      carIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) { clearInterval(carIntervalRef.current!); setCarCountdown(null); }
        else setCarCountdown(remaining);
      }, 1000);
      // Start recording
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setCarCountdown(null); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordRef.current = recording;
      setJs('listen');
      // Auto-stop after 8s — stopRecord will handle the rest
      carTimerRef.current = setTimeout(() => {
        clearInterval(carIntervalRef.current!);
        setCarCountdown(null);
        stopRecordRef.current?.();
      }, 8000);
    };
  });

  // ── Text send ────────────────────────────────────────────────────
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setLastTxt(''); setNavLinks(null); setOverlay('none'); setInput(''); setJs('think');
    try {
      await sendMessage(text.trim(), sessionId, undefined, locationRef.current ?? undefined, MOBILE_TOKEN);
    } catch {
      setLastTxt('⚠️ Erreur de connexion');
      setJs('idle');
    }
  }, [sessionId]);

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
    if (carTimerRef.current) { clearTimeout(carTimerRef.current); carTimerRef.current = null; }
    if (carIntervalRef.current) { clearInterval(carIntervalRef.current); carIntervalRef.current = null; }
    setCarCountdown(null);
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

  // Wire ref so car-mode auto-listen can call stopRecord without circular deps
  useEffect(() => { stopRecordRef.current = stopRecord; }, [stopRecord]);

  // ── Camera vision ─────────────────────────────────────────────────
  const handleVision = useCallback(async () => {
    if (!camPerm?.granted) { await requestCam(); return; }
    setOverlay('camera');
  }, [camPerm]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePicture({ base64: true, quality: 0.6 });
      setOverlay('none');
      setJs('think');
      await sendMessage("Que vois-tu sur cette image ? Décris précisément.", sessionId, photo.base64 ?? undefined, undefined, MOBILE_TOKEN);
    } catch { setJs('idle'); }
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

  // ── Push notification response listener (tap notification → speak) ──
  useEffect(() => {
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
          <CameraView ref={cameraRef as unknown as React.RefObject<CameraView>} style={StyleSheet.absoluteFillObject} facing="back" />
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={styles.actorBadge}>{(actorId ?? 'kouider').toUpperCase()}</Text>
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

      {/* Content panel — TikTok + WhatsApp */}
      {overlay === 'content' && (
        <View style={styles.contentOverlay}>
          <View style={styles.contentBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={styles.contentTitle}>CONTENU & CANAUX</Text>
              <TouchableOpacity onPress={() => setOverlay('none')}>
                <Text style={{ color: '#444', fontFamily: MONO, fontSize: 12 }}>✕ FERMER</Text>
              </TouchableOpacity>
            </View>

            {/* TikTok */}
            <View style={styles.contentSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={styles.contentIcon}>📱</Text>
                <Text style={styles.contentSectionTitle}>TIKTOK</Text>
                <View style={[styles.statusDot, { backgroundColor: contentStatus?.tiktok.configured ? '#00ff88' : '#444' }]} />
                <Text style={styles.statusLbl}>{contentStatus?.tiktok.configured ? 'ACTIF' : 'NON CONFIGURÉ'}</Text>
              </View>

              {contentStatus?.tiktok.pendingVideo ? (
                <View style={styles.pendingCard}>
                  <Text style={styles.pendingTitle}>🎬 {contentStatus.tiktok.pendingVideo.title}</Text>
                  <Text style={styles.pendingScript} numberOfLines={3}>{contentStatus.tiktok.pendingVideo.script}</Text>
                  <Text style={styles.pendingTags}>{contentStatus.tiktok.pendingVideo.hashtags.map(t => `#${t}`).join(' ')}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: '#00ff8866', backgroundColor: '#001a00' }]}
                      onPress={() => approveVideo(contentStatus.tiktok.pendingVideo!.id)}
                    >
                      <Text style={[styles.actionBtnTxt, { color: '#00ff88' }]}>✅ APPROUVER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: '#ff444466', backgroundColor: '#1a0000' }]}
                      onPress={() => rejectVideo(contentStatus.tiktok.pendingVideo!.id)}
                    >
                      <Text style={[styles.actionBtnTxt, { color: '#ff4444' }]}>❌ REJETER</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text style={styles.noContent}>{contentStatus ? 'Aucune vidéo en attente' : 'Chargement...'}</Text>
              )}
            </View>

            {/* TikTok Intelligence */}
            {tiktokIntel && (tiktokIntel.viral_ideas?.length ?? 0) > 0 && (
              <View style={[styles.contentSection, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Text style={styles.contentIcon}>🧠</Text>
                  <Text style={styles.contentSectionTitle}>IDÉES VIRALES IA</Text>
                  {tiktokIntel.virality_score != null && (
                    <Text style={[styles.statusLbl, { color: '#7c3aed' }]}>Score {tiktokIntel.virality_score}/10</Text>
                  )}
                </View>
                {tiktokIntel.best_posting_time && (
                  <Text style={[styles.noContent, { color: '#ffaa0088', marginBottom: 8 }]}>
                    ⏰ Meilleur horaire: {tiktokIntel.best_posting_time}
                  </Text>
                )}
                {tiktokIntel.viral_ideas?.slice(0, 3).map((idea, i) => (
                  <View key={i} style={{ backgroundColor: '#070707', borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed22', padding: 10, marginBottom: 6 }}>
                    <Text style={[styles.statusLbl, { color: '#7c3aed', marginBottom: 4 }]}>{idea.style?.toUpperCase()}</Text>
                    <Text style={styles.noContent}>{idea.hook}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* WhatsApp */}
            <View style={[styles.contentSection, { marginTop: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={styles.contentIcon}>💬</Text>
                <Text style={styles.contentSectionTitle}>WHATSAPP</Text>
                <View style={[styles.statusDot, { backgroundColor: contentStatus?.whatsapp.configured ? '#00ff88' : '#444' }]} />
                <Text style={styles.statusLbl}>{contentStatus?.whatsapp.configured ? 'ACTIF' : 'NON CONFIGURÉ'}</Text>
              </View>
              {contentStatus?.whatsapp.configured ? (
                <Text style={styles.noContent}>Confirmations + rappels auto actifs via {contentStatus.whatsapp.from}</Text>
              ) : (
                <Text style={styles.noContent}>Configurer TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN dans Railway pour activer</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* History overlay */}
      {overlay === 'history' && (
        <View style={styles.contentOverlay}>
          <View style={styles.contentBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={styles.contentTitle}>HISTORIQUE</Text>
              <TouchableOpacity onPress={() => setOverlay('none')}>
                <Text style={{ color: '#444', fontFamily: MONO, fontSize: 12 }}>✕ FERMER</Text>
              </TouchableOpacity>
            </View>
            {histLoad ? (
              <Text style={styles.noContent}>Chargement...</Text>
            ) : histMsgs.length === 0 ? (
              <Text style={styles.noContent}>Aucun historique</Text>
            ) : (
              <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
                {histMsgs.map((m, i) => (
                  <View key={i} style={[styles.histMsg, m.role === 'user' ? styles.histUser : styles.histBot]}>
                    <Text style={styles.histRole}>{m.role === 'user' ? (actorId ?? 'Kouider').toUpperCase() : 'DZARYX'}</Text>
                    <Text style={styles.histContent} numberOfLines={6}>{m.content}</Text>
                    <Text style={styles.histTime}>{new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}

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

      {/* Car mode countdown banner */}
      {carMode && carCountdown !== null && (
        <View style={styles.carCountdownBar}>
          <Text style={styles.carCountdownTxt}>🎤 PARLE... {carCountdown}s</Text>
        </View>
      )}

      {/* Car mode indicator strip */}
      {carMode && (
        <View style={styles.carModeBar}>
          <Text style={styles.carModeTxt}>🚗 MODE VOITURE ACTIF — MAINS LIBRES</Text>
        </View>
      )}

      {/* Quick commands */}
      {!carMode && overlay === 'none' && (
        <View style={styles.quickRow}>
          {[
            { label: 'Résa du jour',   cmd: "Montre-moi les réservations d'aujourd'hui" },
            { label: 'Parc véhicules', cmd: "État du parc véhicules" },
            { label: 'Impayés',        cmd: "Quels clients ont des paiements en attente ?" },
            { label: 'Météo Oran',     cmd: "Météo Oran aujourd'hui" },
            { label: 'Revenus mois',   cmd: "Revenus du mois en cours" },
            { label: 'Alertes',        cmd: "Quelles sont les alertes urgentes ?" },
          ].map(({ label, cmd }) => (
            <TouchableOpacity key={label} style={styles.quickBtn} onPress={() => handleSend(cmd)}>
              <Text style={styles.quickTxt}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.quickBtn, { borderColor: '#00ff8844', backgroundColor: '#00ff8808' }]} onPress={() => router.push('/new-booking')}>
            <Text style={[styles.quickTxt, { color: '#00ff8866' }]}>+ Résa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickBtn, { borderColor: '#00e5ff33', backgroundColor: '#00e5ff08' }]} onPress={() => router.push('/bookings')}>
            <Text style={[styles.quickTxt, { color: '#00e5ff55' }]}>📋 Liste</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 14 }]}>
        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={handleVision}>
            <Text style={styles.toolIco}>📷</Text>
            <Text style={styles.toolLbl}>VISION</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.micBtn, js === 'listen' && styles.micActive, carMode && styles.micBtnCar]}
          onPressIn={carMode ? undefined : startRecord}
          onPressOut={carMode ? undefined : stopRecord}
          onPress={carMode && js === 'listen' ? stopRecord : undefined}
        >
          <Text style={styles.micIco}>🎙</Text>
          {carMode && js === 'listen' && <Text style={styles.micCarLbl}>STOP</Text>}
        </TouchableOpacity>

        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={() => setOverlay(o => o === 'text' ? 'none' : 'text')}>
            <Text style={styles.toolIco}>⌨️</Text>
            <Text style={styles.toolLbl}>TEXTE</Text>
          </TouchableOpacity>
        )}

        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={openContent}>
            <Text style={styles.toolIco}>📱</Text>
            <Text style={styles.toolLbl}>CONTENU</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.toolBtn, carMode && { opacity: 1 }]}
          onPress={toggleCarMode}
        >
          <Text style={styles.toolIco}>🚗</Text>
          <Text style={[styles.toolLbl, carMode && { color: '#ffaa00' }]}>{carMode ? 'ARRÊTER' : 'VOITURE'}</Text>
        </TouchableOpacity>

        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={openHistory}>
            <Text style={styles.toolIco}>📜</Text>
            <Text style={styles.toolLbl}>HIST</Text>
          </TouchableOpacity>
        )}

        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={() => { setUnreadNotifs(0); router.push('/notifications'); }}>
            <View style={{ position: 'relative', alignItems: 'center' }}>
              <Text style={styles.toolIco}>🔔</Text>
              {unreadNotifs > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeTxt}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.toolLbl, unreadNotifs > 0 && { color: '#ff4444' }]}>ALERTES</Text>
          </TouchableOpacity>
        )}

        {!carMode && (
          <TouchableOpacity style={styles.toolBtn} onPress={() => router.push('/settings')}>
            <Text style={styles.toolIco}>⚙️</Text>
            <Text style={styles.toolLbl}>RÉGLAGES</Text>
          </TouchableOpacity>
        )}
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

  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 10 },
  title:       { color: '#00e5ff', fontSize: 15, fontFamily: MONO, letterSpacing: 7, fontWeight: '700' },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  status:      { fontSize: 10, fontFamily: MONO, letterSpacing: 2 },
  actorBadge:  { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },

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

  contentOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
  contentBox:        { backgroundColor: '#050505', borderTopWidth: 1, borderTopColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  contentTitle:      { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },
  contentSection:    { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', padding: 16 },
  contentSectionTitle:{ color: '#ffffff', fontSize: 11, fontFamily: MONO, letterSpacing: 3, fontWeight: '700' },
  contentIcon:       { fontSize: 16 },
  statusDot:         { width: 7, height: 7, borderRadius: 4 },
  statusLbl:         { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  pendingCard:       { backgroundColor: '#080808', borderRadius: 8, borderWidth: 1, borderColor: '#7c3aed44', padding: 14, marginTop: 4 },
  pendingTitle:      { color: '#e0e0e0', fontSize: 12, fontFamily: MONO, fontWeight: '700', marginBottom: 6 },
  pendingScript:     { color: '#555', fontSize: 11, fontFamily: MONO, lineHeight: 16 },
  pendingTags:       { color: '#7c3aed', fontSize: 10, fontFamily: MONO, marginTop: 6 },
  actionBtn:         { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  actionBtnTxt:      { fontSize: 10, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },
  noContent:         { color: '#333', fontSize: 10, fontFamily: MONO, lineHeight: 16 },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 18, justifyContent: 'center' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#1a4a1a', backgroundColor: '#050f05' },
  navIco: { fontSize: 16 },
  navLbl: { color: '#00ff88', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2, fontWeight: '700' },

  micBtnCar:       { width: 100, height: 100, borderRadius: 50 },
  carModeBar:      { backgroundColor: '#1a0d00', borderTopWidth: 1, borderTopColor: '#ff8c0033', paddingVertical: 5, alignItems: 'center' },
  carModeTxt:      { color: '#ffaa00', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2 },
  carCountdownBar: { backgroundColor: '#001a00', borderTopWidth: 1, borderTopColor: '#00ff0033', paddingVertical: 6, alignItems: 'center' },
  carCountdownTxt: { color: '#00ff88', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 2, fontWeight: '700' },
  toolBtnActive:   { opacity: 1 },
  micCarLbl:       { color: '#ff4444', fontSize: 7, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1, marginTop: 2 },

  quickRow:   { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#0a0f0f' },
  quickBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#1a2a2a', backgroundColor: '#040a0a' },
  quickTxt:   { color: '#2a6a6a', fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', letterSpacing: 1.5 },

  toolbar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#090f0f' },
  toolBtn:    { alignItems: 'center', gap: 5, width: 70 },
  toolIco:    { fontSize: 22 },
  toolLbl:    { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  micBtn:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#040404', borderWidth: 2, borderColor: '#00e5ff', alignItems: 'center', justifyContent: 'center', shadowColor: '#00e5ff', shadowOpacity: 0.55, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  micActive:  { borderColor: '#ff2d55', backgroundColor: '#180008', shadowColor: '#ff2d55' },
  micIco:     { fontSize: 26 },

  notifBadge:    { position: 'absolute', top: -4, right: -8, backgroundColor: '#ff4444', borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeTxt: { color: '#fff', fontSize: 7, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700' },

  histMsg:    { borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 10 },
  histUser:   { borderColor: '#0a2a3a', backgroundColor: '#050d12', alignSelf: 'flex-end' as const, marginLeft: 20 },
  histBot:    { borderColor: '#001a0a', backgroundColor: '#030a05', alignSelf: 'flex-start' as const, marginRight: 20 },
  histRole:   { color: '#2a4a5a', fontSize: 8, fontFamily: MONO, letterSpacing: 2, marginBottom: 4 },
  histContent:{ color: '#888', fontSize: 11, fontFamily: MONO, lineHeight: 16 },
  histTime:   { color: '#2a2a2a', fontSize: 8, fontFamily: MONO, marginTop: 4, textAlign: 'right' as const },
});
