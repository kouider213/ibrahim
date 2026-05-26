import { useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, BackHandler, Platform, Linking, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import type WebViewRef from 'react-native-webview';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_URL          = 'https://kouider213.github.io/ibrahim/';
const BACKEND_URL      = 'https://ibrahim-backend-production.up.railway.app';
const TOKEN_KEY        = 'mobile:push_registered_v4';
const TOKEN_KOUIDER    = 'f6214183be37ad5e3c593590870077db247a4047c7de3cd72ae008e0f8d447d2';
const TOKEN_HOUARI     = '99c3dba3359626a99f527dba6dd994a64049cc0984036933b7f96adddb41bfe2';
const WAKE_TRIGGER_URL = 'dzaryx://voice';
const VOICE_NOTIF_ID   = 'dzaryx-voice-shortcut';

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

// Persistent notification in the drawer — tap "🎤 Parler" to trigger voice
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

function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={err.container}>
      <Text style={err.icon}>📡</Text>
      <Text style={err.title}>Pas de connexion</Text>
      <Text style={err.subtitle}>Vérifiez votre connexion internet puis réessayez.</Text>
      <TouchableOpacity style={err.btn} onPress={onRetry}>
        <Text style={err.btnText}>↺  Réessayer</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const webviewRef = useRef<WebViewRef>(null);
  const canGoBack  = useRef(false);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const retryKey = useRef(0);
  const [webKey, setWebKey]   = useState(0);

  const handleRetry = useCallback(() => {
    retryKey.current += 1;
    setWebKey(retryKey.current);
    setOffline(false);
    setLoading(true);
  }, []);

  function triggerVoiceInWebView() {
    webviewRef.current?.injectJavaScript(
      'window.__triggerWakeWord && window.__triggerWakeWord(); void 0;'
    );
  }

  useEffect(() => {
    void registerPushToken();
    void setupVoiceShortcut();

    // Tap on notification action "🎤 Parler à Dzaryx"
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const isVoiceAction = response.actionIdentifier === 'voice'
        || (response.notification.request.content.data as any)?.trigger === 'voice';
      if (isVoiceAction) {
        setTimeout(() => triggerVoiceInWebView(), 500);
      }
    });

    // Deep link: dzaryx://voice (used by widget, shortcuts, etc.)
    Linking.getInitialURL().then(url => {
      if (url === WAKE_TRIGGER_URL) {
        setTimeout(() => triggerVoiceInWebView(), 2500);
      }
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url === WAKE_TRIGGER_URL) triggerVoiceInWebView();
    });

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { webviewRef.current?.goBack(); return true; }
      return false;
    });

    return () => {
      responseSub.remove();
      linkSub.remove();
      backSub.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      {loading && !offline && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00d4ff" />
        </View>
      )}
      {offline ? (
        <OfflineScreen onRetry={handleRetry} />
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

const err = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon:      { fontSize: 56, marginBottom: 20 },
  title:     { fontFamily: 'Orbitron', fontSize: 18, fontWeight: '900', color: '#00d4ff', marginBottom: 12, letterSpacing: 2 },
  subtitle:  { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn:       { paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(0,212,255,0.35)', backgroundColor: 'rgba(0,212,255,0.08)' },
  btnText:   { fontSize: 15, fontWeight: '700', color: '#00d4ff', letterSpacing: 1 },
});
