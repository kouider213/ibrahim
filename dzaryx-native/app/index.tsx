import { useRef, useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, BackHandler, Platform, Linking, View, Text,
  TouchableOpacity, ActivityIndicator, AppState, AppStateStatus,
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

async function registerPushToken(): Promise<void> {
  await sendDebug('start');
  try {
    if (Platform.OS !== 'android') { await sendDebug('skip_not_android'); return; }
    const already = await AsyncStorage.getItem(TOKEN_KEY);
    if (already) { await sendDebug('already_registered', already.slice(0, 20)); return; }

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
      <Text style={lock.hex}>⬡</Text>
      <Text style={lock.brand}>DZARYX</Text>
      <Text style={lock.subtitle}>Identificación requerida</Text>
      <TouchableOpacity style={lock.btn} onPress={onUnlock} activeOpacity={0.75}>
        <Text style={lock.btnIcon}>☉</Text>
        <Text style={lock.btnText}>Déverrouiller</Text>
      </TouchableOpacity>
    </View>
  );
}

function OfflineScreen({ onRetry, cache }: { onRetry: () => void; cache: FleetCache | null }) {
  return (
    <View style={err.container}>
      <Text style={err.icon}>📡</Text>
      <Text style={err.title}>Pas de connexion</Text>
      {cache ? (
        <>
          <Text style={err.cacheLabel}>Dernière sync — {cache.last_sync}</Text>
          <View style={err.cacheRow}>
            <View style={err.cacheStat}>
              <Text style={err.cacheNum}>{cache.cars_available}/{cache.cars_total}</Text>
              <Text style={err.cacheDesc}>Voitures dispo</Text>
            </View>
            <View style={err.cacheDivider} />
            <View style={err.cacheStat}>
              <Text style={err.cacheNum}>{cache.bookings_today}</Text>
              <Text style={err.cacheDesc}>Résa aujourd'hui</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={err.subtitle}>Vérifiez votre connexion puis réessayez.</Text>
      )}
      <TouchableOpacity style={err.btn} onPress={onRetry}>
        <Text style={err.btnText}>↺  Réessayer</Text>
      </TouchableOpacity>
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

  function triggerVoiceInWebView() {
    webviewRef.current?.injectJavaScript(
      'window.__triggerWakeWord && window.__triggerWakeWord(); void 0;'
    );
  }

  function routeQuickAction(actionId: string) {
    // Inject JS event so the simulator web app can navigate to the right section
    const js = `
      window.dispatchEvent(new CustomEvent('dzaryx:action', {
        detail: { type: 'navigate', target: ${JSON.stringify(actionId)} }
      }));
      void 0;
    `;
    setTimeout(() => webviewRef.current?.injectJavaScript(js), 800);
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

    // Refresh fleet cache in background
    void fetchAndCacheFleet().then(c => { if (c) setFleetCache(c); });

    // Notification response listener
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const isVoiceAction = response.actionIdentifier === 'voice'
        || (response.notification.request.content.data as Record<string, unknown>)?.['trigger'] === 'voice';
      if (isVoiceAction) setTimeout(() => triggerVoiceInWebView(), 500);
    });

    // Deep links
    Linking.getInitialURL().then(url => {
      if (url === WAKE_TRIGGER_URL) setTimeout(() => triggerVoiceInWebView(), 2500);
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url === WAKE_TRIGGER_URL) triggerVoiceInWebView();
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
          <ActivityIndicator size="large" color="#00d4ff" />
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
          onLoadEnd={() => setLoading(false)}
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

const styles = StyleSheet.create({
  webview:        { flex: 1, backgroundColor: '#000000' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
});

const lock = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center', padding: 40 },
  hex:       { fontSize: 64, color: '#00d4ff', marginBottom: 16 },
  brand:     { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 6, marginBottom: 8 },
  subtitle:  { fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, marginBottom: 56 },
  btn:       { paddingVertical: 18, paddingHorizontal: 48, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.5)', backgroundColor: 'rgba(0,212,255,0.1)', alignItems: 'center' },
  btnIcon:   { fontSize: 28, marginBottom: 6 },
  btnText:   { fontSize: 15, fontWeight: '700', color: '#00d4ff', letterSpacing: 2 },
});

const err = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon:        { fontSize: 56, marginBottom: 20 },
  title:       { fontSize: 18, fontWeight: '900', color: '#00d4ff', marginBottom: 12, letterSpacing: 2 },
  subtitle:    { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  cacheLabel:  { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginBottom: 20 },
  cacheRow:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,212,255,0.2)', borderRadius: 14, paddingVertical: 20, paddingHorizontal: 32, marginBottom: 32, backgroundColor: 'rgba(0,212,255,0.05)' },
  cacheStat:   { alignItems: 'center', flex: 1 },
  cacheDivider:{ width: 1, height: 40, backgroundColor: 'rgba(0,212,255,0.2)' },
  cacheNum:    { fontSize: 28, fontWeight: '900', color: '#00d4ff', marginBottom: 4 },
  cacheDesc:   { fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  btn:         { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.35)', backgroundColor: 'rgba(0,212,255,0.08)' },
  btnText:     { fontSize: 15, fontWeight: '700', color: '#00d4ff', letterSpacing: 1 },
});
