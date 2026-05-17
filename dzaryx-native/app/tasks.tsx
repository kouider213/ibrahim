import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { BACKEND_URL } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

interface Task {
  id:         string;
  type:       string;
  status:     string;
  input?:     Record<string, unknown>;
  output?:    Record<string, unknown>;
  error?:     string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending:   '#ffaa00',
  queued:    '#00e5ff',
  running:   '#7c3aed',
  completed: '#00ff88',
  failed:    '#ff4444',
  cancelled: '#555',
};

const STATUS_ICON: Record<string, string> = {
  pending:   '⏳',
  queued:    '📋',
  running:   '⚙️',
  completed: '✅',
  failed:    '❌',
  cancelled: '🚫',
};

function fmtTime(d: string): string {
  try {
    return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

type FilterStatus = 'all' | 'active' | 'completed' | 'failed';

export default function TasksScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<FilterStatus>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/tasks?limit=80`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] };
        setTasks(data.tasks ?? []);
      }
    } catch { /* ignore */ }
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const handleCancel = useCallback(async (id: string) => {
    Alert.alert('Annuler', 'Annuler cette tâche ?', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler tâche', style: 'destructive', onPress: async () => {
          const res = await fetch(`${BACKEND_URL}/api/tasks/${id}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${TOKEN}` },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'cancelled' } : t));
        },
      },
    ]);
  }, [TOKEN]);

  const displayed = tasks.filter(t => {
    if (filter === 'active')    return ['pending', 'queued', 'running'].includes(t.status);
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'failed')    return ['failed', 'cancelled'].includes(t.status);
    return true;
  });

  const activeCount = tasks.filter(t => ['pending', 'queued', 'running'].includes(t.status)).length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>TÂCHES IA</Text>
        {activeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{activeCount} ACTIVES</Text>
          </View>
        )}
      </View>

      <View style={styles.filterRow}>
        {(['all', 'active', 'completed', 'failed'] as FilterStatus[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTxt, filter === f && styles.filterTxtActive]}>
              {f === 'all' ? 'TOUT' : f === 'active' ? 'ACTIVES' : f === 'completed' ? 'DONE' : 'ECHEC'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !tasks.length ? (
        <View style={styles.center}><ActivityIndicator color="#00e5ff" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
        >
          {displayed.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTxt}>AUCUNE TÂCHE</Text>
            </View>
          )}
          {displayed.map(t => (
            <View key={t.id} style={[styles.card, { borderLeftColor: STATUS_COLOR[t.status] ?? '#333' }]}>
              <View style={styles.cardTop}>
                <Text style={styles.statusIcon}>{STATUS_ICON[t.status] ?? '🔄'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskType}>{t.type.replace(/_/g, ' ').toUpperCase()}</Text>
                  <Text style={styles.taskTime}>{fmtTime(t.created_at)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[t.status] ?? '#333') + '22', borderColor: (STATUS_COLOR[t.status] ?? '#333') + '55' }]}>
                  <Text style={[styles.statusTxt, { color: STATUS_COLOR[t.status] ?? '#555' }]}>{t.status.toUpperCase()}</Text>
                </View>
              </View>
              {t.error && (
                <Text style={styles.errorTxt}>⚠️ {t.error.slice(0, 120)}</Text>
              )}
              {t.output && Object.keys(t.output).length > 0 && (
                <Text style={styles.outputTxt} numberOfLines={2}>
                  {JSON.stringify(t.output).slice(0, 100)}
                </Text>
              )}
              {['pending', 'queued'].includes(t.status) && (
                <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(t.id)}>
                  <Text style={styles.cancelTxt}>✕ ANNULER</Text>
                </TouchableOpacity>
              )}
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

  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:   { paddingVertical: 8 },
  backTxt:   { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:     { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  badge:     { backgroundColor: '#7c3aed22', borderWidth: 1, borderColor: '#7c3aed', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt:  { color: '#7c3aed', fontSize: 8, fontFamily: MONO, fontWeight: '700' },

  filterRow:      { flexDirection: 'row', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  filterBtn:      { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a', alignItems: 'center' },
  filterBtnActive:{ borderColor: '#00e5ff44', backgroundColor: '#00e5ff0a' },
  filterTxt:      { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
  filterTxtActive:{ color: '#00e5ff' },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },

  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyTxt: { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 4 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderLeftWidth: 3, borderRadius: 10, padding: 14, marginBottom: 8,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  statusIcon: { fontSize: 18 },
  taskType:   { color: '#fff', fontSize: 11, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  taskTime:   { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },
  statusBadge:{ borderRadius: 5, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  statusTxt:  { fontSize: 7, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },
  errorTxt:   { color: '#ff444488', fontSize: 9, fontFamily: MONO, lineHeight: 14, marginBottom: 6 },
  outputTxt:  { color: '#2a4a3a', fontSize: 8, fontFamily: MONO, lineHeight: 13, marginBottom: 6 },
  cancelBtn:  { marginTop: 6, borderWidth: 1, borderColor: '#ff444422', borderRadius: 6, paddingVertical: 7, alignItems: 'center' },
  cancelTxt:  { color: '#ff444466', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
});
