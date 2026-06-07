import { useRef, useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, BackHandler, Platform, Linking, View, Text,
  TouchableOpacity, ActivityIndicator, AppState, AppStateStatus, Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type WebViewRef from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as QuickActions from 'expo-quick-actions';

const APP_URL          = 'https://kouider213.github.io/ibrahim/';
const BACKEND_URL      = 'https://ibrahim-backend-production.up.railway.app';
const TOKEN_KEY        = 'mobile:push_registered_v4';
const FLEET_CACHE_KEY  = 'dzaryx:fleet_cache_v2';
const TOKEN_KOUIDER    = 'f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2';
const TOKEN_HOUARI     = '99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2';
const WAKE_TRIGGER_URL = 'dzaryx://voice';
const VOICE_NOTIF_ID   = 'dzaryx-voice-shortcut';
const RELOCK_DELAY_MS  = 5 * 60 * 1000; // 5 minutes background → relock

interface FleetCache {
  cars_available: number;
  cars_total: number;
  bookings_today: number;
  last_sync: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function sendDebug(step: string, detail?: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/push-token/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN_KOUIDER}` },
      body: JSON.stringify({ step, detail: detail ?? '', platform: Platform.OS, ts: Date.now() }),
    });
  } catch { /* silent */ }
}

async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('dzaryx_default', {
      name: 'Dzaryx — Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 300, 150, 300],
      enableVibrate: true,
      enableLights: true,
      lightColor: '#00d4ff',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  } catch (e) {
    console.warn('[channel] setup failed:', e);
  }
}

async function registerPushToken(): Promise<void> {
  await sendDebug('start');
  try {
    if (Platform.OS !== 'android') { await sendDebug('skip_not_android'); return; }
    const already = await AsyncStorage.getItem(TOKEN_KEY);
    if (already) { await sendDebug('already_registered', already.slice(0, 20)); return; }

    await setupNotificationChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') { await sendDebug('permission_denied', finalStatus); return; }

    const tokenObj = await Notifications.getDevicePushTokenAsync();
    await sendDebug('got_token', JSON.stringify(tokenObj).slice(0, 80));

    const fcmToken = tokenObj.data as string;
    if (!fcmToken) { await sendDebug('token_empty'); return; }

    const actorId     = (await AsyncStorage.getItem('actor_id')) ?? 'kouider';
    const mobileToken = actorId === 'houari' ? TOKEN_HOUARI : TOKEN_KOUIDER;

    const res = await fetch(`${BACKEND_URL}/api/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mobileToken}` },
      body: JSON.stringify({ token: fcmToken, actorId }),
    });

    if (res.ok) {
      await AsyncStorage.setItem(TOKEN_KEY, fcmToken);
      await sendDebug('success', fcmToken.slice(0, 30));
    } else {
      await sendDebug('backend_error', String(res.status));
    }
  } catch (e) {
    await sendDebug('exception', String(e));
  }
}

async function setupVoiceShortcut(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationCategoryAsync('dzaryx_voice', [
      {
        identifier: 'voice',
        buttonTitle: '🎤 Parler à Dzaryx',
        options: { opensAppToForeground: true },
      },
    ]);

    await Notifications.scheduleNotificationAsync({
      identifier: VOICE_NOTIF_ID,
      content: {
        title: '🤖 Dzaryx — Assistant actif',
        body: 'Tap sur "Parler à Dzaryx" pour activer le micro',
        categoryIdentifier: 'dzaryx_voice',
        data: { trigger: 'voice' },
        priority: Notifications.AndroidNotificationPriority.MIN,
        sticky: true,
        autoDismiss: false,
      } as Notifications.NotificationContentInput,
      trigger: null,
    });
  } catch (e) {
    console.warn('[voice-shortcut] setup failed:', e);
  }
}

async function handleNativeAction(data: string): Promise<void> {
  try {
    const action = JSON.parse(data) as Record<string, unknown>;
    if (action['__native_action'] === 'open_overlay' && Platform.OS === 'android') {
      // Ouvre l'overlay flottant Dzaryx par-dessus les autres apps
      await Linking.openURL('dzaryxoverlay://go');
      return;
    }
    if (action['__native_action'] === 'set_alarm' && Platform.OS === 'android') {
      const h = Number(action['hour']   ?? 0);
      const m = Number(action['minute'] ?? 0);
      const label = String(action['label'] ?? 'Dzaryx');
      const url = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${h};i.android.intent.extra.alarm.MINUTES=${m};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(label)};B.android.intent.extra.alarm.SKIP_UI=true;end`;
      await Linking.openURL(url);
    }
  } catch { /* ignore */ }
}

// Biometric auth — returns true if auth passed or device has no biometric
async function authenticate(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return true;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirme ton identité — Dzaryx',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
      biometricsSecurityLevel: 'weak',
    });
    return result.success;
  } catch {
    return true; // hardware error → let in rather than block
  }
}

// Cache fleet data from backend for offline display
async function fetchAndCacheFleet(): Promise<FleetCache | null> {
  try {
    const actorId     = (await AsyncStorage.getItem('actor_id')) ?? 'kouider';
    const mobileToken = actorId === 'houari' ? TOKEN_HOUARI : TOKEN_KOUIDER;
    const controller  = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BACKEND_URL}/api/bi/fleet`, {
      headers: { 'Authorization': `Bearer ${mobileToken}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const data = await res.json() as { total_cars?: number; available_now_count?: number };
    const total     = data.total_cars          ?? 0;
    const available = data.available_now_count ?? 0;
    const cache: FleetCache = {
      cars_available: available,
      cars_total:     total,
      bookings_today: total - available, // active rentals right now
      last_sync: new Date().toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }),
    };
    await AsyncStorage.setItem(FLEET_CACHE_KEY, JSON.stringify(cache));
    return cache;
  } catch {
    return null;
  }
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  return (
    <View style={lock.container}>
      {/* Corner brackets */}
      <View style={[lock.corner, lock.tl]} /><View style={[lock.corner, lock.tr]} />
      <View style={[lock.corner, lock.bl]} /><View style={[lock.corner, lock.br]} />

      {/* Logo */}
      <Image source={require('../assets/icon.png')} style={lock.logo} resizeMode="contain" />

      {/* Brand */}
      <Text style={lock.brand}>DZARYX</Text>
      <View style={lock.divider} />
      <Text style={lock.subtitle}>IDENTIFICATION REQUISE</Text>

      {/* Biometric button */}
      <TouchableOpacity style={lock.btn} onPress={onUnlock} activeOpacity={0.7}>
        <View style={lock.btnInner}>
          <Text style={lock.btnIcon}>⬡</Text>
          <Text style={lock.btnText}>DÉVERROUILLER</Text>
          <Text style={lock.btnSub}>Face ID · Empreinte</Text>
        </View>
      </TouchableOpacity>

      {/* Bottom status line */}
      <Text style={lock.status}>● SYSTÈME EN LIGNE</Text>
    </View>
  );
}

function OfflineScreen({ onRetry, cache }: { onRetry: () => void; cache: FleetCache | null }) {
  return (
    <View style={err.container}>
      <View style={[lock.corner, lock.tl]} /><View style={[lock.corner, lock.tr]} />
      <View style={[lock.corner, lock.bl]} /><View style={[lock.corner, lock.br]} />

      <Image source={require('../assets/icon.png')} style={err.logo} resizeMode="contain" />
      <Text style={err.title}>SIGNAL PERDU</Text>
      <View style={lock.divider} />

      {cache ? (
        <>
          <Text style={err.syncLabel}>DERNIÈRE SYNC — {cache.last_sync}</Text>
          <View style={err.cacheRow}>
            <View style={err.cacheStat}>
              <Text style={err.cacheNum}>{cache.cars_available}</Text>
              <Text style={err.cacheDen}>/{cache.cars_total}</Text>
              <Text style={err.cacheDesc}>DISPO</Text>
            </View>
            <View style={err.cacheDivider} />
            <View style={err.cacheStat}>
              <Text style={err.cacheNum}>{cache.bookings_today}</Text>
              <Text style={err.cacheDen}> </Text>
              <Text style={err.cacheDesc}>RÉSA ACTIVES</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={err.subtitle}>Vérifiez votre connexion réseau</Text>
      )}

      <TouchableOpacity style={err.btn} onPress={onRetry} activeOpacity={0.7}>
        <Text style={err.btnText}>↺  RÉESSAYER</Text>
      </TouchableOpacity>

      <Text style={lock.status}>● HORS LIGNE</Text>
    </View>
  );
}

export default function App() {
  const webviewRef  = useRef<WebViewRef>(null);
  const canGoBack   = useRef(false);
  const [offline, setOffline]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const retryKey    = useRef(0);
  const [webKey, setWebKey]         = useState(0);
  const [isLocked, setIsLocked]     = useState(true);
  const [fleetCache, setFleetCache] = useState<FleetCache | null>(null);
  const appStateRef      = useRef<AppStateStatus>('active');
  const lastBgTimeRef    = useRef<number | null>(null);
  const pendingAction    = useRef<string | null>(null);
  const webviewReady     = useRef(false);

  const handleRetry = useCallback(() => {
    retryKey.current += 1;
    setWebKey(retryKey.current);
    setOffline(false);
    setLoading(true);
  }, []);

  const handleUnlock = useCallback(async () => {
    const ok = await authenticate();
    if (ok) setIsLocked(false);
  }, []);

  function injectOrQueue(js: string) {
    if (webviewReady.current) {
      webviewRef.current?.injectJavaScript(js);
    } else {
      pendingAction.current = js;
    }
  }

  function triggerVoiceInWebView() {
    injectOrQueue('window.__triggerWakeWord && window.__triggerWakeWord(); void 0;');
  }

  function triggerVisionInWebView() {
    injectOrQueue('window.__triggerVision && window.__triggerVision(); void 0;');
  }


  function routeQuickAction(actionId: string) {
    const js = `
      window.dispatchEvent(new CustomEvent('dzaryx:action', {
        detail: { type: 'navigate', target: ${JSON.stringify(actionId)} }
      }));
      void 0;
    `;
    setTimeout(() => injectOrQueue(js), 600);
  }

  useEffect(() => {
    // Load cached fleet data for offline display
    AsyncStorage.getItem(FLEET_CACHE_KEY).then(raw => {
      if (raw) {
        try { setFleetCache(JSON.parse(raw) as FleetCache); } catch { /* ignore */ }
      }
    });

    // Initial biometric unlock
    void handleUnlock();

    // Register push token + voice shortcut
    void registerPushToken();
    void setupVoiceShortcut();

    // Démarre le service wake word "Zaria" (écoute fond → ouvre la barre overlay)
    if (Platform.OS === 'android') {
      setTimeout(() => { Linking.openURL('dzaryxwake://start').catch(() => {}); }, 1500);
    }

    // Refresh fleet cache in background
    void fetchAndCacheFleet().then(c => { if (c) setFleetCache(c); });

    // Notification response listener — handles tap from locked screen
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const isVoice  = response.actionIdentifier === 'voice' || data?.['trigger'] === 'voice';
      const navTarget = data?.['navigate'] as string | undefined;
      if (isVoice) {
        Linking.openURL('dzaryxoverlay://go').catch(() => {});
      } else if (navTarget) {
        setTimeout(() => routeQuickAction(navTarget), 1000);
      }
    });

    // Deep links
    Linking.getInitialURL().then(url => {
      if (url === WAKE_TRIGGER_URL) setTimeout(() => triggerVoiceInWebView(), 2500);
      else if (url && url.includes('vision')) setTimeout(() => triggerVisionInWebView(), 2500);
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url === WAKE_TRIGGER_URL) triggerVoiceInWebView();
      else if (url && url.includes('vision')) triggerVisionInWebView();
    });

    // Hardware back button
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { webviewRef.current?.goBack(); return true; }
      return false;
    });

    // AppState — relock after 5 min background
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
        lastBgTimeRef.current = Date.now();
      }
      if (nextState === 'active' && lastBgTimeRef.current !== null) {
        const elapsed = Date.now() - lastBgTimeRef.current;
        if (elapsed >= RELOCK_DELAY_MS) setIsLocked(true);
        lastBgTimeRef.current = null;
      }
      appStateRef.current = nextState;
    });

    // App shortcuts — long-press on icon
    if (Platform.OS === 'android') {
      QuickActions.setItems([
        { title: 'Chat Dzaryx',          id: 'chat',    params: { target: 'chat' } },
        { title: 'Nouvelle réservation', id: 'booking', params: { target: 'bookings' } },
        { title: 'État de la flotte',    id: 'fleet',   params: { target: 'fleet' } },
      ]).catch(() => {});
    }

    const quickSub = QuickActions.addListener(action => {
      const target = action.params?.['target'] as string | undefined;
      if (target) routeQuickAction(target);
    });

    return () => {
      responseSub.remove();
      linkSub.remove();
      backSub.remove();
      appStateSub.remove();
      quickSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {loading && !offline && (
        <View style={styles.loadingOverlay}>
          <Image source={require('../assets/icon.png')} style={styles.loadingLogo} resizeMode="contain" />
          <ActivityIndicator size="large" color="#00d4ff" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>INITIALISATION…</Text>
        </View>
      )}
      {offline ? (
        <OfflineScreen onRetry={handleRetry} cache={fleetCache} />
      ) : (
        <WebView
          key={webKey}
          ref={webviewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          originWhitelist={['*']}
          onLoadEnd={() => {
            setLoading(false);
            webviewReady.current = true;
            if (pendingAction.current) {
              webviewRef.current?.injectJavaScript(pendingAction.current);
              pendingAction.current = null;
            }
          }}
          onError={e => {
            const code = e.nativeEvent.code;
            if (code !== -10) { setOffline(true); setLoading(false); }
          }}
          onHttpError={e => { if (e.nativeEvent.statusCode >= 500) { setOffline(true); setLoading(false); } }}
          onShouldStartLoadWithRequest={req => {
            const url = req.url;
            if (url.startsWith('https://') || url.startsWith('http://')) return true;
            Linking.openURL(url).catch(() => {});
            return false;
          }}
          onNavigationStateChange={nav => { canGoBack.current = nav.canGoBack; }}
          onMessage={e => void handleNativeAction(e.nativeEvent.data)}
        />
      )}
    </View>
  );
}

const C = '#00d4ff';
const BG = '#020810';

const styles = StyleSheet.create({
  webview:        { flex: 1, backgroundColor: BG },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  loadingLogo:    { width: 120, height: 120, opacity: 0.9 },
  loadingText:    { marginTop: 12, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 11, color: `${C}66`, letterSpacing: 4 },
  wakeIndicator:  { position: 'absolute', bottom: 12, right: 12, zIndex: 20 },
  wakeDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00e676', opacity: 0.7 },
});

const CORNER_SIZE = 18;
const CORNER_W = 2;

const lock = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  corner: {
    position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE,
  },
  tl: { top: 20, left: 20, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: `${C}55` },
  tr: { top: 20, right: 20, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: `${C}55` },
  bl: { bottom: 20, left: 20, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: `${C}55` },
  br: { bottom: 20, right: 20, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: `${C}55` },
  logo:     { width: 140, height: 140, marginBottom: 28 },
  brand:    { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 26, fontWeight: '900', color: C, letterSpacing: 10, marginBottom: 14 },
  divider:  { width: 120, height: 1, backgroundColor: `${C}33`, marginBottom: 14 },
  subtitle: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9, color: `${C}55`, letterSpacing: 4, marginBottom: 56 },
  btn: {
    borderWidth: 1.5, borderColor: `${C}55`, borderRadius: 20,
    backgroundColor: `${C}0d`, paddingHorizontal: 56, paddingVertical: 6,
    shadowColor: C, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 18,
  },
  btnInner: { alignItems: 'center', paddingVertical: 14 },
  btnIcon:  { fontSize: 32, color: C, marginBottom: 8 },
  btnText:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 14, fontWeight: '700', color: C, letterSpacing: 4 },
  btnSub:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9, color: `${C}66`, letterSpacing: 2, marginTop: 6 },
  status:   { position: 'absolute', bottom: 36, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 8, color: `${C}44`, letterSpacing: 3 },
});

const err = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo:      { width: 110, height: 110, marginBottom: 24, opacity: 0.7 },
  title:     { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 18, fontWeight: '900', color: '#ff3366', letterSpacing: 6, marginBottom: 14 },
  syncLabel: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 9, color: `${C}44`, letterSpacing: 2, marginBottom: 24 },
  subtitle:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  cacheRow:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: `${C}22`, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 36, marginBottom: 36, backgroundColor: `${C}07` },
  cacheStat: { alignItems: 'center', flex: 1 },
  cacheDivider: { width: 1, height: 44, backgroundColor: `${C}22` },
  cacheNum:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 32, fontWeight: '900', color: C },
  cacheDen:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 14, color: `${C}55` },
  cacheDesc: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 8, color: `${C}55`, letterSpacing: 2, marginTop: 4 },
  btn:       { borderWidth: 1.5, borderColor: `${C}44`, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, backgroundColor: `${C}0a` },
  btnText:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 13, fontWeight: '700', color: C, letterSpacing: 3 },
});
