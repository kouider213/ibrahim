import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, RefreshControl, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchBookings, updateBookingField, type Booking } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

type Filter = 'ALL' | 'ACTIVE' | 'CONFIRMED' | 'PENDING' | 'COMPLETED';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    '#00e5ff',
  CONFIRMED: '#00ff88',
  PENDING:   '#ffaa00',
  COMPLETED: '#555555',
  REJECTED:  '#ff4444',
};

function fmtDate(d: string): string {
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch { return d; }
}

function nbDays(start: string, end: string): number {
  try {
    return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
  } catch { return 1; }
}

function isUpcoming(b: Booking): boolean {
  return new Date(b.start_date) >= new Date();
}

function isLate(b: Booking): boolean {
  return ['ACTIVE', 'CONFIRMED'].includes(b.status) && new Date(b.end_date) < new Date();
}

export default function BookingsScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [bookings,   setBookings]   = useState<Booking[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<Filter>('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await fetchBookings(TOKEN, undefined, 60);
    setBookings(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const markPaid = useCallback(async (b: Booking) => {
    Alert.alert(
      'Marquer comme PAYÉ',
      `${b.client_name} — ${b.final_price}€`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'PAYÉ ✓', style: 'default', onPress: async () => {
          const ok = await updateBookingField(b.id, { payment_status: 'PAID', paid_amount: b.final_price }, TOKEN);
          if (ok) setBookings(prev => prev.map(x => x.id === b.id ? { ...x, payment_status: 'PAID', paid_amount: b.final_price } : x));
          else Alert.alert('Erreur', 'Mise à jour échouée.');
        }},
      ],
    );
  }, [TOKEN]);

  const markActive = useCallback(async (b: Booking) => {
    const ok = await updateBookingField(b.id, { status: 'ACTIVE' }, TOKEN);
    if (ok) setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'ACTIVE' } : x));
    else Alert.alert('Erreur', 'Mise à jour échouée.');
  }, [TOKEN]);

  const filtered = bookings.filter(b => {
    if (filter === 'ALL') return true;
    return b.status === filter;
  });

  const stats = {
    total:   bookings.length,
    active:  bookings.filter(b => b.status === 'ACTIVE').length,
    pending: bookings.filter(b => b.status === 'PENDING').length,
    late:    bookings.filter(b => isLate(b)).length,
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>RÉSERVATIONS</Text>
        {stats.late > 0 && (
          <View style={styles.lateBadge}>
            <Text style={styles.lateTxt}>{stats.late} EN RETARD</Text>
          </View>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/new-booking')}>
          <Text style={styles.addTxt}>+ CRÉER</Text>
        </TouchableOpacity>
      </View>

      {/* Quick stats bar */}
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLbl}>TOTAL</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#00e5ff' }]}>{stats.active}</Text>
          <Text style={styles.statLbl}>ACTIVES</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#ffaa00' }]}>{stats.pending}</Text>
          <Text style={styles.statLbl}>ATTENTE</Text>
        </View>
        {stats.late > 0 && (
          <View style={styles.statPill}>
            <Text style={[styles.statNum, { color: '#ff4444' }]}>{stats.late}</Text>
            <Text style={styles.statLbl}>RETARD</Text>
          </View>
        )}
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'CONFIRMED', 'PENDING', 'COMPLETED'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterTxt, filter === f && styles.filterTxtActive]}>
              {f === 'ALL' ? 'TOUT' : f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
      >
        {loading && (
          <Text style={styles.emptyTxt}>CHARGEMENT...</Text>
        )}
        {!loading && filtered.length === 0 && (
          <Text style={styles.emptyTxt}>AUCUNE RÉSERVATION</Text>
        )}
        {!loading && filtered.map(b => {
          const late    = isLate(b);
          const upcoming = isUpcoming(b);
          const color   = late ? '#ff4444' : (STATUS_COLOR[b.status] ?? '#555');
          const days    = nbDays(b.start_date, b.end_date);
          const car     = (b.cars as { name: string; category: string | null } | null);
          const hasMissingProfit = b.owner_price_per_day == null && ['ACTIVE', 'CONFIRMED', 'PENDING'].includes(b.status);

          return (
            <View key={b.id} style={[styles.card, late && styles.cardLate]}>
              {/* Card header */}
              <View style={styles.cardTop}>
                <View style={[styles.statusDot, { backgroundColor: color }]} />
                <Text style={styles.clientName}>{b.client_name.toUpperCase()}</Text>
                <View style={styles.cardTopRight}>
                  {late && <Text style={styles.latePill}>RETARD</Text>}
                  {upcoming && !late && <Text style={styles.upcomingPill}>À VENIR</Text>}
                  <Text style={[styles.statusLabel, { color }]}>{b.status}</Text>
                </View>
              </View>

              {/* Car + dates */}
              {car && (
                <Text style={styles.carName}>{car.name}{car.category ? ` · ${car.category}` : ''}</Text>
              )}
              <View style={styles.datesRow}>
                <Text style={styles.datesTxt}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</Text>
                <Text style={styles.daysTxt}>{days}j</Text>
              </View>

              {/* Financial row */}
              <View style={styles.finRow}>
                <Text style={styles.price}>{b.final_price != null ? `${b.final_price}€` : '—'}</Text>
                {b.profit_kouider != null
                  ? <Text style={[styles.profit, { color: b.profit_kouider >= 0 ? '#00ff88' : '#ff4444' }]}>+{b.profit_kouider}€ profit</Text>
                  : hasMissingProfit
                    ? <Text style={styles.profitWarn}>⚠️ prix proprio manquant</Text>
                    : null
                }
                <Text style={[
                  styles.payStatus,
                  { color: b.payment_status === 'PAID' ? '#00ff88' : b.payment_status === 'PARTIAL' ? '#ffaa00' : '#ff4444' },
                ]}>
                  {b.payment_status ?? 'UNPAID'}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.actionsRow}>
                {b.client_phone && (
                  <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${b.client_phone}`)}>
                    <Text style={styles.callTxt}>📞</Text>
                  </TouchableOpacity>
                )}
                {b.payment_status !== 'PAID' && ['ACTIVE','CONFIRMED','PENDING'].includes(b.status) && (
                  <TouchableOpacity style={styles.paidBtn} onPress={() => markPaid(b)}>
                    <Text style={styles.paidTxt}>💳 PAYÉ</Text>
                  </TouchableOpacity>
                )}
                {b.status === 'PENDING' && (
                  <TouchableOpacity style={styles.activeBtn} onPress={() => markActive(b)}>
                    <Text style={styles.activeTxt}>✓ ACTIVER</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.idTxt}>#{b.id.slice(-6).toUpperCase()}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },

  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  lateBadge: { backgroundColor: '#ff444422', borderWidth: 1, borderColor: '#ff4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  lateTxt:   { color: '#ff4444', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
  addBtn:    { backgroundColor: '#00ff8822', borderWidth: 1, borderColor: '#00ff88', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addTxt:    { color: '#00ff88', fontSize: 8, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  statsRow:  { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  statPill:  { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statNum:   { color: '#fff', fontSize: 18, fontFamily: MONO, fontWeight: '700' },
  statLbl:   { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 2 },

  filterScroll: { maxHeight: 44, marginBottom: 4 },
  filterRow:    { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterTab:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111' },
  filterTabActive: { borderColor: '#00e5ff', backgroundColor: '#00e5ff11' },
  filterTxt:    { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  filterTxtActive: { color: '#00e5ff' },

  list:        { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyTxt:    { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 3, textAlign: 'center', marginTop: 60 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 16, marginBottom: 10,
  },
  cardLate: { borderColor: '#ff444444' },

  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  statusDot:   { width: 7, height: 7, borderRadius: 3.5 },
  clientName:  { flex: 1, color: '#fff', fontSize: 12, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },
  cardTopRight:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusLabel: { fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
  latePill:    { backgroundColor: '#ff444422', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  upcomingPill: { backgroundColor: '#00e5ff11', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },

  carName:   { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 2, marginBottom: 6 },

  datesRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  datesTxt:  { color: '#888', fontSize: 10, fontFamily: MONO, letterSpacing: 1 },
  daysTxt:   { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },

  finRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  price:     { color: '#fff', fontSize: 14, fontFamily: MONO, fontWeight: '700' },
  profit:    { fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  profitWarn:{ color: '#ffaa00', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  payStatus: { fontSize: 9, fontFamily: MONO, letterSpacing: 2, marginLeft: 'auto' },

  actionsRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  callBtn:   { backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  callTxt:   { color: '#00e5ff', fontSize: 12 },
  paidBtn:   { backgroundColor: '#00ff8811', borderWidth: 1, borderColor: '#00ff8844', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  paidTxt:   { color: '#00ff88', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  activeBtn: { backgroundColor: '#ffaa0011', borderWidth: 1, borderColor: '#ffaa0044', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  activeTxt: { color: '#ffaa00', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  idTxt:     { color: '#222', fontSize: 8, fontFamily: MONO, letterSpacing: 2, marginLeft: 'auto' },
});
