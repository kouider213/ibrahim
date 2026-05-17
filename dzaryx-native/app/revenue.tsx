import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchRevenue, fetchFleetStats, BACKEND_URL, type RevenueSummary, type FleetIntelligence } from '../lib/api';

interface HeatDay { date: string; count: number }

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
  const [fleet,      setFleet]      = useState<FleetIntelligence | null>(null);
  const [heatmap,    setHeatmap]    = useState<HeatDay[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHeatmap = useCallback(async (): Promise<HeatDay[]> => {
    try {
      const r = await fetch(`${BACKEND_URL}/api/bi/heatmap`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      return r.ok ? (await r.json() as HeatDay[]) : [];
    } catch { return []; }
  }, [TOKEN]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [rev, fl, heat] = await Promise.all([fetchRevenue(TOKEN), fetchFleetStats(TOKEN), fetchHeatmap()]);
    setData(rev);
    setFleet(fl);
    setHeatmap(heat);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN, fetchHeatmap]);

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

              {/* Last month comparison */}
              {data.last_month_revenue != null && data.last_month_revenue > 0 && (
                <View style={styles.compareRow}>
                  <View style={styles.compareCard}>
                    <Text style={styles.compareVal}>{fmt(data.last_month_revenue)}</Text>
                    <Text style={styles.compareLbl}>MOIS PRÉCÉDENT</Text>
                  </View>
                  {data.month_vs_last_pct != null && (
                    <View style={[styles.compareCard, { borderColor: (data.month_vs_last_pct ?? 0) >= 0 ? '#00ff8844' : '#ff444444' }]}>
                      <Text style={[styles.compareVal, { color: (data.month_vs_last_pct ?? 0) >= 0 ? '#00ff88' : '#ff4444' }]}>
                        {(data.month_vs_last_pct ?? 0) >= 0 ? '+' : ''}{data.month_vs_last_pct}%
                      </Text>
                      <Text style={styles.compareLbl}>VS MOIS PRÉCÉDENT</Text>
                    </View>
                  )}
                </View>
              )}

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
                {(data.total_unpaid_receivables ?? 0) > 0 && (
                  <View style={[styles.kpiCard, styles.kpiDanger]}>
                    <Text style={[styles.kpiVal, { color: '#ff4444', fontSize: 14 }]}>{fmt(data.total_unpaid_receivables!)}</Text>
                    <Text style={styles.kpiLbl}>CRÉANCES 🔴</Text>
                  </View>
                )}
                {(data.rejected_count ?? 0) > 0 && (
                  <View style={[styles.kpiCard, { borderColor: '#33333322' }]}>
                    <Text style={[styles.kpiVal, { color: '#555' }]}>{data.rejected_count}</Text>
                    <Text style={styles.kpiLbl}>REFUSÉES</Text>
                  </View>
                )}
              </View>

              {/* Per-car breakdown */}
              {fleet?.stats && fleet.stats.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>PAR VÉHICULE (30 JOURS)</Text>
                  {[...fleet.stats]
                    .sort((a, b) => (b.revenue_30d ?? 0) - (a.revenue_30d ?? 0))
                    .map((s, i) => {
                      const bar = Math.min(100, Math.round(s.occupancy_pct ?? 0));
                      return (
                        <View key={i} style={styles.carRevRow}>
                          <View style={styles.carRevLeft}>
                            <Text style={styles.carRevName}>{s.car_name.toUpperCase()}</Text>
                            <View style={styles.occBarBg}>
                              <View style={[styles.occBarFill, { width: `${bar}%` as unknown as number }]} />
                            </View>
                            <Text style={styles.carRevOcc}>{bar}% occupé</Text>
                          </View>
                          <Text style={styles.carRevAmt}>{fmt(s.revenue_30d ?? 0)}</Text>
                        </View>
                      );
                    })}
                </>
              )}

              {/* Booking heatmap (60 days) */}
              {heatmap.length > 0 && (() => {
                const countMap: Record<string, number> = {};
                for (const d of heatmap) countMap[d.date] = d.count;
                const days: Array<{ date: string; count: number }> = [];
                for (let i = 59; i >= 0; i--) {
                  const d = new Date(Date.now() - i * 86_400_000);
                  const k = d.toISOString().slice(0, 10);
                  days.push({ date: k, count: countMap[k] ?? 0 });
                }
                const maxCount = Math.max(...days.map(d => d.count), 1);
                const rows: Array<typeof days> = [];
                for (let i = 0; i < days.length; i += 10) rows.push(days.slice(i, i + 10));
                return (
                  <>
                    <Text style={styles.sectionTitle}>ACTIVITÉ 60 JOURS</Text>
                    <View style={styles.heatWrap}>
                      {rows.map((row, ri) => (
                        <View key={ri} style={styles.heatRow}>
                          {row.map((d, ci) => {
                            const intensity = d.count === 0 ? 0 : Math.max(0.15, d.count / maxCount);
                            const bg = d.count === 0 ? '#0a0a0a' : `rgba(0,229,255,${intensity})`;
                            return <View key={ci} style={[styles.heatCell, { backgroundColor: bg }]} />;
                          })}
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <Text style={styles.heatLbl}>IL Y A 60J</Text>
                        <Text style={styles.heatLbl}>AUJOURD'HUI</Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {/* Top clients */}
              {data.top_clients?.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>TOP CLIENTS</Text>
                  {data.top_clients.map((c, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.clientRow}
                      activeOpacity={0.8}
                      onPress={() => router.push({ pathname: '/client-detail', params: { name: c.client_name, phone: c.client_phone ?? '' } })}
                    >
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
                      {c.client_phone && (
                        <View style={styles.clientActions}>
                          <TouchableOpacity style={styles.miniCallBtn} onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${c.client_phone}`); }}>
                            <Text style={styles.miniCallTxt}>📞</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.miniWaBtn} onPress={(e) => {
                            e.stopPropagation();
                            const phone = c.client_phone!.replace(/\s/g, '').replace(/^0+/, '213');
                            Linking.openURL(`https://wa.me/${phone}`);
                          }}>
                            <Text style={styles.miniWaTxt}>💬</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
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

  compareRow:  { flexDirection: 'row', gap: 8, marginBottom: 16 },
  compareCard: { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  compareVal:  { color: '#fff', fontSize: 18, fontFamily: MONO, fontWeight: '700' },
  compareLbl:  { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 4 },

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
  kpiWarn:   { borderColor: '#ffaa0022' },
  kpiDanger: { borderColor: '#ff444422' },
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

  carRevRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  carRevLeft:   { flex: 1 },
  carRevName:   { color: '#fff', fontSize: 10, fontFamily: MONO, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  occBarBg:     { height: 3, backgroundColor: '#111', borderRadius: 2, marginBottom: 4 },
  occBarFill:   { height: 3, backgroundColor: '#00e5ff', borderRadius: 2 },
  carRevOcc:    { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 1 },
  carRevAmt:    { color: '#00ff88', fontSize: 16, fontFamily: MONO, fontWeight: '700', marginLeft: 12 },

  clientActions: { flexDirection: 'row', gap: 6, marginLeft: 6 },
  miniCallBtn:   { backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  miniCallTxt:   { fontSize: 12 },
  miniWaBtn:     { backgroundColor: '#25d36611', borderWidth: 1, borderColor: '#25d36622', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6 },
  miniWaTxt:     { fontSize: 12 },

  heatWrap: { backgroundColor: '#050505', borderRadius: 10, borderWidth: 1, borderColor: '#111', padding: 12, marginBottom: 24 },
  heatRow:  { flexDirection: 'row', gap: 3, marginBottom: 3 },
  heatCell: { width: 24, height: 16, borderRadius: 3 },
  heatLbl:  { color: '#1a1a1a', fontSize: 8, fontFamily: MONO, letterSpacing: 1 },
});
