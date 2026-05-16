import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../../lib/store';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const USERS = [
  { id: 'kouider' as const, name: 'KOUIDER', role: 'Gérant principal', color: '#00e5ff' },
  { id: 'houari'  as const, name: 'HOUARI',  role: 'Associé',          color: '#7c3aed' },
];

export default function LoginScreen() {
  const router   = useRouter();
  const setActor = useStore(s => s.setActor);

  const select = (id: 'kouider' | 'houari') => {
    setActor(id);
    router.replace('/chat');
  };

  return (
    <View style={styles.root}>
      <Text style={styles.logo}>DZARYX</Text>
      <Text style={styles.sub}>Fik Conciergerie Oran</Text>
      <Text style={styles.prompt}>Qui êtes-vous ?</Text>

      {USERS.map(u => (
        <TouchableOpacity key={u.id} style={[styles.card, { borderColor: u.color + '66' }]} onPress={() => select(u.id)}>
          <View style={[styles.dot, { backgroundColor: u.color }]} />
          <View>
            <Text style={[styles.name, { color: u.color }]}>{u.name}</Text>
            <Text style={styles.role}>{u.role}</Text>
          </View>
          <Text style={[styles.arrow, { color: u.color }]}>→</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.footer}>DZARYX · IA CONCIERGERIE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  logo:   { color: '#00e5ff', fontSize: 22, fontFamily: MONO, letterSpacing: 8, fontWeight: '700' },
  sub:    { color: '#2a2a2a', fontSize: 11, fontFamily: MONO, letterSpacing: 3, marginBottom: 8 },
  prompt: { color: '#3a3a3a', fontSize: 11, fontFamily: MONO, letterSpacing: 3, marginBottom: 8 },
  card: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#050505', borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 22, paddingVertical: 20,
  },
  dot:    { width: 10, height: 10, borderRadius: 5 },
  name:   { fontSize: 15, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },
  role:   { color: '#333', fontSize: 10, fontFamily: MONO, letterSpacing: 2, marginTop: 3 },
  arrow:  { marginLeft: 'auto', fontSize: 18, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 32, color: '#111', fontSize: 9, fontFamily: MONO, letterSpacing: 3 },
});
