import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchRevenue, type RevenueSummary } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const SCORE_COLOR: Record<string, string> = {
  VIP:      '#ffd700',
  FREQUENT: '#00e5ff',
  REGULAR:  '#00ff88',
  NEW:      '#555555',
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
}

export default function RevenueScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [data,       setData]       = useState<RevenueSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const rev = await fetchRevenue(TOKEN);
    setData(rev);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>REVENUS</Text>
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color="#00e5ff" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
        >
          {!data ? (
            <Text style={styles.emptyTxt}>DONNÉES INDISPONIBLES</Text>
          ) : (
            <>
              {/* Revenue cards */}
              <Text style={styles.sectionTitle}>CHIFFRE D'AFFAIRES</Text>
              <View style={styles.revGrid}>
                <View style={[styles.revCard, styles.revCardToday]}>
                  <Text style={styles.revAmount}>{fmt(data.today_revenue)}</Text>
                  <Text style={styles.revLabel}>AUJOURD'HUI</Text>
                </View>
                <View style={[styles.revCard, styles.revCardWeek]}>
                  <Text style={styles.revAmount}>{fmt(data.week_revenue)}</Text>
                  <Text style={styles.revLabel}>CETTE SEMAINE</Text>
                </View>
                <View style={[styles.revCard, styles.revCardMonth]}>
                  <Text style={[styles.revAmount, styles.revAmountBig]}>{fmt(data.month_revenue)}</Text>
                  <Text style={styles.revLabel}>CE MOIS</Text>
                </View>
              </View>

              {/* Profit + Owner */}
              <Text style={styles.sectionTitle}>RÉPARTITION CE MOIS</Text>
              <View style={styles.splitRow}>
                <View style={styles.splitCard}>
                  <Text style={[styles.splitAmount, { color: '#00ff88' }]}>{fmt(data.kouider_profit_month)}</Text>
                  <Text style={styles.splitLabel}>PROFIT KOUIDER</Text>
                </View>
                <View style={styles.splitCard}>
                  <Text style={[styles.splitAmount, { color: '#7c3aed' }]}>{fmt(data.houari_revenue_month)}</Text>
                  <Text style={styles.splitLabel}>HOUARI (PROPRIO)</Text>
                </View>
              </View>

              {/* KPIs */}
              <Text style={styles.sectionTitle}>INDICATEURS</Text>
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiVal}>{data.total_bookings_month}</Text>
                  <Text style={styles.kpiLbl}>RÉSERVATIONS</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiVal}>{fmt(data.avg_booking_value)}</Text>
                  <Text style={styles.kpiLbl}>MOY/RÉSA</Text>
                </View>
                {data.missing_owner_price > 0 && (
                  <View style={[styles.kpiCard, styles.kpiWarn]}>
                    <Text style={[styles.kpiVal, { color: '#ffaa00' }]}>{data.missing_owner_price}</Text>
                    <Text style={styles.kpiLbl}>SANS PROPRIO ⚠️</Text>
                  </View>
                )}
              </View>

              {/* Top clients */}
              {data.top_clients?.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>TOP CLIENTS</Text>
                  {data.top_clients.map((c, i) => (
                    <View key={i} style={styles.clientRow}>
                      <View style={[styles.scoreBadge, { borderColor: SCORE_COLOR[c.score] ?? '#555' }]}>
                        <Text style={[styles.scoreTxt, { color: SCORE_COLOR[c.score] ?? '#555' }]}>{c.score}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.clientName}>{c.client_name}</Text>
                        {c.client_phone && (
                          <Text style={styles.clientPhone}>{c.client_phone}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.clientTotal}>{fmt(c.total_spent)}</Text>
                        <Text style={styles.clientCount}>{c.bookings_count} résa</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },

  emptyTxt: { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 3, textAlign: 'center', marginTop: 60 },

  sectionTitle: { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12, marginTop: 8 },

  revGrid: { gap: 8, marginBottom: 24 },
  revCard: {
    backgroundColor: '#050505', borderWidth: 1, borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  revCardToday: { borderColor: '#1a1a1a' },
  revCardWeek:  { borderColor: '#00e5ff22' },
  revCardMonth: { borderColor: '#00e5ff44', backgroundColor: '#00e5ff08' },
  revAmount:    { color: '#fff', fontSize: 24, fontFamily: MONO, fontWeight: '700' },
  revAmountBig: { fontSize: 32, color: '#00e5ff' },
  revLabel:     { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginTop: 4 },

  splitRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  splitCard: {
    flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  splitAmount: { fontSize: 20, fontFamily: MONO, fontWeight: '700' },
  splitLabel:  { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 4 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  kpiCard: {
    flex: 1, minWidth: '30%', backgroundColor: '#050505',
    borderWidth: 1, borderColor: '#111', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  kpiWarn: { borderColor: '#ffaa0022' },
  kpiVal:  { color: '#fff', fontSize: 18, fontFamily: MONO, fontWeight: '700' },
  kpiLbl:  { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 4 },

  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  scoreBadge: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  scoreTxt:     { fontSize: 7, fontFamily: MONO, letterSpacing: 1, fontWeight: '700' },
  clientName:   { color: '#fff', fontSize: 11, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  clientPhone:  { color: '#333', fontSize: 9, fontFamily: MONO, marginTop: 2 },
  clientTotal:  { color: '#00ff88', fontSize: 12, fontFamily: MONO, fontWeight: '700' },
  clientCount:  { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },
});
