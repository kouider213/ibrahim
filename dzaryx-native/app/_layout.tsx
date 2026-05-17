import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function RootLayout() {
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
      </Stack>
    </>
  );
}
