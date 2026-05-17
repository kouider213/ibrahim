import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchReminders, type SmartReminder } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const TYPE_ICON: Record<string, string> = {
  arrival_tomorrow:  '✈️',
  missing_passport:  '🪪',
  missing_deposit:   '💳',
  return_soon:       '🔙',
  vehicle_prep:      '🚗',
  age_alert:         '⚠️',
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   '#ff4444',
  MEDIUM: '#ffaa00',
  LOW:    '#555555',
};

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }); }
  catch { return d; }
}

export default function RemindersScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [reminders,  setReminders]  = useState<SmartReminder[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await fetchReminders(TOKEN);
    setReminders(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const high   = reminders.filter(r => r.priority === 'HIGH');
  const medium = reminders.filter(r => r.priority === 'MEDIUM');
  const low    = reminders.filter(r => r.priority === 'LOW');

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>RAPPELS</Text>
        {reminders.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countTxt}>{reminders.length}</Text>
          </View>
        )}
      </View>

      {loading && !reminders.length ? (
        <View style={styles.center}>
          <ActivityIndicator color="#00e5ff" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
        >
          {reminders.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTxt}>AUCUN RAPPEL EN ATTENTE</Text>
              <Text style={styles.emptySubTxt}>Tout est sous contrôle.</Text>
            </View>
          )}

          {[
            { list: high,   label: 'PRIORITÉ HAUTE',   color: '#ff4444' },
            { list: medium, label: 'PRIORITÉ MOYENNE',  color: '#ffaa00' },
            { list: low,    label: 'PRIORITÉ BASSE',    color: '#555' },
          ].map(({ list, label, color }) => list.length > 0 && (
            <View key={label}>
              <Text style={[styles.sectionTitle, { color }]}>{label} ({list.length})</Text>
              {list.map((r, i) => (
                <View key={`${r.type}-${i}`} style={[styles.card, { borderLeftColor: PRIORITY_COLOR[r.priority] }]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.typeIcon}>{TYPE_ICON[r.type] ?? '🔔'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{r.client_name.toUpperCase()}</Text>
                      <Text style={styles.carName}>{r.car_name} · {fmtDate(r.date)}</Text>
                    </View>
                  </View>
                  <Text style={styles.message}>{r.message}</Text>
                  <View style={styles.actionBox}>
                    <Text style={styles.actionLabel}>ACTION :</Text>
                    <Text style={styles.actionTxt}>{r.action}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:    { paddingVertical: 8 },
  backTxt:    { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:      { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  countBadge: { backgroundColor: '#ff444422', borderWidth: 1, borderColor: '#ff4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  countTxt:   { color: '#ff4444', fontSize: 10, fontFamily: MONO, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },

  emptyBox:    { alignItems: 'center', marginTop: 80 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyTxt:    { color: '#00ff88', fontSize: 12, fontFamily: MONO, letterSpacing: 3 },
  emptySubTxt: { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2, marginTop: 8 },

  sectionTitle: { fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginBottom: 8, marginTop: 16 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderLeftWidth: 3, borderRadius: 10,
    padding: 14, marginBottom: 8,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  typeIcon:   { fontSize: 20 },
  clientName: { color: '#fff', fontSize: 12, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },
  carName:    { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },

  message:     { color: '#888', fontSize: 11, fontFamily: MONO, lineHeight: 17, marginBottom: 10 },

  actionBox:   { backgroundColor: '#0a0a0a', borderRadius: 6, padding: 10, flexDirection: 'row', gap: 6 },
  actionLabel: { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 2, paddingTop: 1 },
  actionTxt:   { color: '#00e5ff88', fontSize: 9, fontFamily: MONO, lineHeight: 14, flex: 1 },
});
