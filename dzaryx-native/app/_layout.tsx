import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useWakeWord } from '../lib/useWakeWord';

// Persistent "Dzaryx actif" notification in Android notification tray
async function setupPersistentNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.setNotificationChannelAsync('dzaryx-quick', {
      name: 'Dzaryx — Accès rapide',
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
      enableVibrate: false,
      enableLights: false,
    });

    // Fixed identifier — replaces any previous instance on re-launch (no duplicates)
    await Notifications.scheduleNotificationAsync({
      identifier: 'dzaryx-persistent',
      content: {
        title: 'Dzaryx actif',
        body: '🎙 Appuyez pour parler',
        sticky: true,
        data: { action: 'open_chat' },
        android: { channelId: 'dzaryx-quick', color: '#00e5ff' } as Record<string, unknown>,
      },
      trigger: null,
    });
  } catch { /* permission denied or simulator */ }
}

export default function RootLayout() {
  const router = useRouter();

  // Wake word "Dzaryx" (currently placeholder "porcupine") → ouvre écran voix auto
  const handleWakeWord = useCallback(() => {
    router.push('/voice');
  }, [router]);
  useWakeWord(handleWakeWord);

  useEffect(() => {
    void setupPersistentNotification();

    // Tap on any notification → navigate to chat
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as { action?: string } | undefined;
      if (data?.action === 'open_chat') {
        router.push('/chat');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#0a0a0a" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding/welcome" />
        <Stack.Screen name="onboarding/mode" />
        <Stack.Screen name="onboarding/personal" />
        <Stack.Screen name="onboarding/business" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="voice" />
        <Stack.Screen name="text" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="new-booking" />
        <Stack.Screen name="booking-detail" />
        <Stack.Screen name="fleet" />
        <Stack.Screen name="revenue" />
        <Stack.Screen name="reminders" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="client-detail" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="tasks" />
        <Stack.Screen name="documents" />
      </Stack>
    </>
  );
}
