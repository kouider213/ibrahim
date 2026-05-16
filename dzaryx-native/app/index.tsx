import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../lib/store';

export default function SplashScreen() {
  const router   = useRouter();
  const setActor = useStore(s => s.setActor);

  useEffect(() => {
    async function checkSetup() {
      await new Promise(r => setTimeout(r, 1200));

      const [done, savedActor] = await Promise.all([
        AsyncStorage.getItem('onboarding_done'),
        AsyncStorage.getItem('actor_id'),
      ]);

      if (savedActor === 'kouider' || savedActor === 'houari') {
        setActor(savedActor);
        router.replace('/chat');
      } else if (done === 'true') {
        router.replace('/auth/login');
      } else {
        router.replace('/onboarding/welcome');
      }
    }
    checkSetup();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Dzaryx</Text>
      <Text style={styles.sub}>Fik Conciergerie Oran</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  logo:      { fontSize: 48, fontWeight: '800', color: '#ffffff', letterSpacing: -1 },
  sub:       { fontSize: 14, color: '#444', marginTop: 8 },
});
