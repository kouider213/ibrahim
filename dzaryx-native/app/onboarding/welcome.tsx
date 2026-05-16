import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../lib/store';

export default function WelcomeScreen() {
  const router = useRouter();
  const setMode = useStore(s => s.setMode);

  function choose(mode: 'personal' | 'business') {
    setMode(mode);
    if (mode === 'personal') {
      router.push('/onboarding/personal');
    } else {
      router.push('/onboarding/business');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Dzaryx</Text>
        <Text style={styles.subtitle}>Comment tu veux l'utiliser ?</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity style={styles.card} onPress={() => choose('personal')}>
          <Text style={styles.cardEmoji}>👤</Text>
          <Text style={styles.cardTitle}>Personnel</Text>
          <Text style={styles.cardDesc}>
            Planning chargé, agenda, rappels.{'\n'}
            Assistant 24/7 pour toi.
          </Text>
          <Text style={styles.cardExample}>
            Ministres, entrepreneurs, sportifs, étudiants…
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.cardActive]} onPress={() => choose('business')}>
          <Text style={styles.cardEmoji}>🏢</Text>
          <Text style={styles.cardTitle}>Business</Text>
          <Text style={styles.cardDesc}>
            Gérer ton business au quotidien.{'\n'}
            Clients, finances, réservations.
          </Text>
          <Text style={styles.cardExample}>
            Location, restaurant, salon, freelance…
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>200€ / mois · Annulation à tout moment</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 24,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: { alignItems: 'center' },
  title: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  subtitle: { fontSize: 18, color: '#888', marginTop: 8, textAlign: 'center' },
  cards: { gap: 16 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardActive: {
    borderColor: '#4f46e5',
    borderWidth: 1.5,
  },
  cardEmoji: { fontSize: 36, marginBottom: 12 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  cardDesc: { fontSize: 15, color: '#aaa', lineHeight: 22, marginBottom: 8 },
  cardExample: { fontSize: 13, color: '#555', fontStyle: 'italic' },
  footer: { textAlign: 'center', color: '#444', fontSize: 13 },
});
