import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../lib/store';

export default function PersonalSetupScreen() {
  const router = useRouter();
  const { setPersonal, setUser, completeOnboarding } = useStore();
  const [name, setName]     = useState('');
  const [city, setCity]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!name.trim() || !city.trim()) return;
    setLoading(true);
    setUser(Date.now().toString(), name.trim());
    setPersonal(city.trim());
    completeOnboarding();
    router.replace('/chat');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Ton assistant personnel</Text>
        <Text style={styles.subtitle}>Dis-moi qui tu es pour que je m'adapte.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Ton prénom</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Karim"
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.label}>Ta ville</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Oran, Alger, Bruxelles…"
            placeholderTextColor="#444"
            value={city}
            onChangeText={setCity}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, (!name || !city) && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!name || !city || loading}
        >
          <Text style={styles.btnText}>{loading ? 'Chargement…' : 'Commencer →'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { flex: 1, padding: 24, paddingTop: 60 },
  back: { marginBottom: 32 },
  backText: { color: '#666', fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 40 },
  form: { gap: 20, marginBottom: 40 },
  label: { color: '#888', fontSize: 13, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  btn: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
