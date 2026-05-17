import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator, TextInput, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchClients, type ClientSummary } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function scoreClient(count: number, spent: number): { label: string; color: string } {
  if (count >= 5 || spent >= 1000) return { label: 'VIP',      color: '#ffd700' };
  if (count >= 3 || spent >= 500)  return { label: 'FRÉQUENT', color: '#00e5ff' };
  if (count >= 2 || spent >= 200)  return { label: 'RÉGULIER', color: '#00ff88' };
  return { label: 'NOUVEAU', color: '#555' };
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return d; }
}

export default function ClientsScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [clients,    setClients]    = useState<ClientSummary[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await fetchClients(TOKEN);
    // Sort by totalSpent desc
    data.sort((a, b) => b.totalSpent - a.totalSpent || b.bookingCount - a.bookingCount);
    setClients(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const filtered = clients.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  });

  const vips = clients.filter(c => { const s = scoreClient(c.bookingCount, c.totalSpent); return s.label === 'VIP'; }).length;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CLIENTS</Text>
        {vips > 0 && (
          <View style={styles.vipBadge}>
            <Text style={styles.vipTxt}>{vips} VIP</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statNum}>{clients.length}</Text>
          <Text style={styles.statLbl}>CLIENTS</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#ffd700' }]}>{vips}</Text>
          <Text style={styles.statLbl}>VIP</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#00e5ff', fontSize: 16 }]}>
            {clients.reduce((s, c) => s + c.bookingCount, 0)}
          </Text>
          <Text style={styles.statLbl}>RÉSA TOTAL</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="RECHERCHE NOM / TÉLÉPHONE..."
          placeholderTextColor="#2a2a2a"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
      >
        {loading && <ActivityIndicator color="#00e5ff" style={{ marginTop: 40 }} />}
        {!loading && filtered.length === 0 && (
          <Text style={styles.emptyTxt}>AUCUN CLIENT</Text>
        )}
        {!loading && filtered.map((c, i) => {
          const score = scoreClient(c.bookingCount, c.totalSpent);
          return (
            <View key={`${c.phone ?? c.name}-${i}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.scoreBadge, { borderColor: score.color }]}>
                  <Text style={[styles.scoreTxt, { color: score.color }]}>{score.label}</Text>
                </View>
                <Text style={styles.clientName}>{c.name.toUpperCase()}</Text>
              </View>

              <View style={styles.statsLine}>
                <Text style={styles.statItem}>{c.bookingCount} résa</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={[styles.statItem, { color: '#00ff88' }]}>{Math.round(c.totalSpent)}€ total</Text>
                <Text style={styles.statDot}>·</Text>
                <Text style={styles.statItem}>Dernière : {fmtDate(c.lastBooking)}</Text>
              </View>

              {c.phone && (
                <TouchableOpacity style={styles.phoneRow} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                  <Text style={styles.phoneTxt}>📞 {c.phone}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:  { paddingVertical: 8 },
  backTxt:  { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:    { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  vipBadge: { backgroundColor: '#ffd70022', borderWidth: 1, borderColor: '#ffd700', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  vipTxt:   { color: '#ffd700', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  statPill: { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statNum:  { color: '#fff', fontSize: 18, fontFamily: MONO, fontWeight: '700' },
  statLbl:  { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 2 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4,
  },
  searchInput: {
    flex: 1, color: '#fff', fontSize: 10, fontFamily: MONO, letterSpacing: 2,
    paddingVertical: 10,
  },
  clearTxt: { color: '#333', fontSize: 14, paddingHorizontal: 4 },

  list:        { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyTxt:    { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 3, textAlign: 'center', marginTop: 60 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  scoreBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  scoreTxt:   { fontSize: 7, fontFamily: MONO, letterSpacing: 1, fontWeight: '700' },
  clientName: { color: '#fff', fontSize: 12, fontFamily: MONO, fontWeight: '700', letterSpacing: 2, flex: 1 },

  statsLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  statItem:  { color: '#444', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  statDot:   { color: '#222', fontSize: 10 },

  phoneRow: { flexDirection: 'row', alignItems: 'center' },
  phoneTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 1 },
});
