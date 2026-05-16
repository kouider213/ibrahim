import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    async function checkSetup() {
      await new Promise(r => setTimeout(r, 1500)); // splash 1.5s
      const done = await AsyncStorage.getItem('onboarding_done');
      if (done === 'true') {
        router.replace('/chat');
      } else {
        router.replace('/onboarding/welcome');
      }
    }
    checkSetup();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Dzaryx</Text>
      <Text style={styles.sub}>Ton assistant IA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  sub: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
});
