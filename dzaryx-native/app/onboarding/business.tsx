import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore, type BusinessType } from '../../lib/store';

const BUSINESS_TYPES: { key: BusinessType; label: string; emoji: string }[] = [
  { key: 'car_rental',  label: 'Location voiture',  emoji: '🚗' },
  { key: 'restaurant',  label: 'Restaurant / Café',  emoji: '🍽️' },
  { key: 'salon',       label: 'Salon coiffure/beauté', emoji: '💇' },
  { key: 'freelance',   label: 'Freelance / Consultant', emoji: '💻' },
  { key: 'retail',      label: 'Commerce / Boutique', emoji: '🛍️' },
  { key: 'custom',      label: 'Autre business',     emoji: '⚡' },
];

export default function BusinessSetupScreen() {
  const router = useRouter();
  const { setBusiness, setUser, completeOnboarding } = useStore();
  const [selected, setSelected]   = useState<BusinessType>(null);
  const [name, setName]           = useState('');
  const [city, setCity]           = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [loading, setLoading]     = useState(false);

  const canContinue = selected && name.trim() && city.trim() && ownerName.trim();

  async function handleContinue() {
    if (!canContinue) return;
    setLoading(true);
    setUser(Date.now().toString(), ownerName.trim());
    setBusiness(selected, name.trim(), city.trim());
    completeOnboarding();
    router.replace('/auth/login');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Ton business</Text>
        <Text style={styles.subtitle}>Dzaryx va s'adapter à ton activité.</Text>

        <Text style={styles.label}>Type de business</Text>
        <View style={styles.grid}>
          {BUSINESS_TYPES.map(bt => (
            <TouchableOpacity
              key={bt.key}
              style={[styles.typeCard, selected === bt.key && styles.typeCardSelected]}
              onPress={() => setSelected(bt.key)}
            >
              <Text style={styles.typeEmoji}>{bt.emoji}</Text>
              <Text style={[styles.typeLabel, selected === bt.key && styles.typeLabelSelected]}>
                {bt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Ton prénom</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Karim"
            placeholderTextColor="#444"
            value={ownerName}
            onChangeText={setOwnerName}
          />

          <Text style={styles.label}>Nom du business</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Fik Conciergerie"
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Ville</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Oran, Alger, Annaba…"
            placeholderTextColor="#444"
            value={city}
            onChangeText={setCity}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, !canContinue && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || loading}
        >
          <Text style={styles.btnText}>{loading ? 'Chargement…' : 'Lancer Dzaryx →'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  back: { marginBottom: 24 },
  backText: { color: '#666', fontSize: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 28 },
  label: { color: '#888', fontSize: 13, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  typeCard: {
    width: '47%',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  typeCardSelected: { borderColor: '#4f46e5', backgroundColor: '#1e1b4b' },
  typeEmoji: { fontSize: 28, marginBottom: 6 },
  typeLabel: { fontSize: 13, color: '#888', textAlign: 'center' },
  typeLabelSelected: { color: '#a5b4fc' },
  form: { gap: 18, marginBottom: 32 },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  btn: { backgroundColor: '#4f46e5', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
