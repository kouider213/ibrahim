import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://ibrahim-backend-production.up.railway.app';
const APP_VERSION = '1.1.0 (build 2)';

type ConnStatus = 'checking' | 'online' | 'offline';

export default function SettingsScreen() {
  const router = useRouter();
  const { displayName, actorId, businessName, reset } = useStore();
  const [status, setStatus] = useState<ConnStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) })
      .then(r => { if (!cancelled) setStatus(r.ok ? 'online' : 'offline'); })
      .catch(() => { if (!cancelled) setStatus('offline'); });
    return () => { cancelled = true; };
  }, []);

  function handleLogout() {
    Alert.alert(
      'Déconnexion',
      'Tu vas être redirigé vers le choix du profil.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnexion', style: 'destructive', onPress: () => { reset(); router.replace('/auth/login'); } },
      ],
    );
  }

  const statusColor = status === 'online' ? '#00ff88' : status === 'offline' ? '#ff4444' : '#ffaa00';
  const statusLabel = status === 'online' ? 'EN LIGNE' : status === 'offline' ? 'HORS LIGNE' : 'VÉRIFICATION...';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PARAMÈTRES</Text>
      </View>

      {/* Actor info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PROFIL ACTIF</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: actorId === 'kouider' ? '#00e5ff' : '#7c3aed' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{(actorId ?? 'INCONNU').toUpperCase()}</Text>
            <Text style={styles.rowSub}>{businessName ?? 'Fik Conciergerie Oran'}</Text>
          </View>
        </View>
      </View>

      {/* Backend status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONNEXION BACKEND</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{BACKEND_URL}</Text>
          </View>
        </View>
      </View>

      {/* Version */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>VERSION</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>DZARYX {APP_VERSION}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowSub}>Fik Conciergerie Oran · IA Conciergerie</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIONS</Text>
        <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/auth/login')}>
          <Text style={styles.switchTxt}>CHANGER DE PROFIL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutTxt}>RÉINITIALISER L'APP</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },

  header:  { flexDirection: 'row', alignItems: 'center', marginBottom: 40, gap: 16 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { color: '#ffffff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },

  section:      { marginBottom: 32 },
  sectionTitle: { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 6,
  },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  rowTitle:{ color: '#ffffff', fontSize: 12, fontFamily: MONO, letterSpacing: 3, fontWeight: '700' },
  rowSub:  { color: '#333', fontSize: 10, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },

  switchBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff44',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  switchTxt: { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  logoutBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#ff444422',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center',
  },
  logoutTxt: { color: '#ff4444', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },
});
