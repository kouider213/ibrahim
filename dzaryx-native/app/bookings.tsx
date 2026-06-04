import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, RefreshControl, Linking, Alert, TextInput, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchBookings, updateBookingField, fetchOperations, type Booking, type ClientOperation } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

type Filter = 'ALL' | 'ACTIVE' | 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'REJECTED';
type ResaMode = 'resa' | 'ops';

const OP_META: Record<string, { label: string; icon: string; color: string }> = {
  location_immo:      { label: 'LOCATION IMMO',  icon: '🏠', color: '#b06bff' },
  vente_immo:         { label: 'ACHAT IMMO',     icon: '🏠', color: '#00ff88' },
  vente_voiture:      { label: 'ACHAT VOITURE',  icon: '🚗', color: '#ff9f43' },
  demande_specifique: { label: 'DEMANDE SPÉCIALE', icon: '✨', color: '#ff5fa2' },
  demande:            { label: 'DEMANDE SPÉCIALE', icon: '✨', color: '#ff5fa2' },
};

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

function buildCalendar(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const days: string[] = [];
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function countBookingsOnDay(day: string, bookings: Booking[]): number {
  return bookings.filter(b =>
    ['ACTIVE', 'CONFIRMED', 'PENDING', 'COMPLETED'].includes(b.status) &&
    b.start_date <= day && b.end_date >= day,
  ).length;
}

function dayColor(count: number): string {
  if (count === 0) return '#0a0a0a';
  if (count === 1) return '#00ff8840';
  if (count === 2) return '#00ff8880';
  return '#00ff88cc';
}

export default function BookingsScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [mode,        setMode]        = useState<ResaMode>('resa');
  const [operations,  setOperations]  = useState<ClientOperation[]>([]);
  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [filter,      setFilter]      = useState<Filter>('ALL');
  const [search,      setSearch]      = useState('');
  const [showCalendar,setShowCalendar]= useState(false);
  const [calMonth,    setCalMonth]    = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [data, ops] = await Promise.all([
      fetchBookings(TOKEN, undefined, 200),
      fetchOperations(TOKEN),
    ]);
    setBookings(data);
    setOperations(ops);
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

  const markConfirmed = useCallback(async (b: Booking) => {
    const ok = await updateBookingField(b.id, { status: 'CONFIRMED' }, TOKEN);
    if (ok) setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'CONFIRMED' } : x));
    else Alert.alert('Erreur', 'Mise à jour échouée.');
  }, [TOKEN]);

  const markCompleted = useCallback(async (b: Booking) => {
    Alert.alert(
      'Marquer TERMINÉ',
      `${b.client_name} — ${(b.cars as { name: string } | null)?.name ?? ''}\nCette action marque la location comme terminée.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: '✓ TERMINÉ', onPress: async () => {
          const ok = await updateBookingField(b.id, { status: 'COMPLETED' }, TOKEN);
          if (ok) setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'COMPLETED' } : x));
          else Alert.alert('Erreur', 'Mise à jour échouée.');
        }},
      ],
    );
  }, [TOKEN]);

  const filtered = bookings.filter(b => {
    if (filter !== 'ALL' && b.status !== filter) return false;
    if (selectedDay) {
      if (b.start_date > selectedDay || b.end_date < selectedDay) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        b.client_name.toLowerCase().includes(q) ||
        (b.client_phone ?? '').includes(q) ||
        (b.cars as { name: string } | null)?.name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q.replace('#', ''))
      );
    }
    return true;
  });

  const handleExport = useCallback(async () => {
    if (filtered.length === 0) { Alert.alert('Rien à exporter'); return; }
    const lines = filtered.map(b => {
      const car = (b.cars as { name: string } | null)?.name ?? '?';
      const days = nbDays(b.start_date, b.end_date);
      return `${b.client_name} | ${car} | ${fmtDate(b.start_date)}→${fmtDate(b.end_date)} (${days}j) | ${b.final_price != null ? `${b.final_price}€` : '?'} | ${b.status} | ${b.payment_status ?? 'UNPAID'}`;
    });
    const text = `RÉSERVATIONS FIK CONCIERGERIE ORAN\n${new Date().toLocaleDateString('fr-FR')}\n${'─'.repeat(40)}\n${lines.join('\n')}`;
    await Share.share({ message: text, title: `Réservations Fik ${filter}` });
  }, [filtered, filter]);

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
        {mode === 'resa' && (
          <TouchableOpacity style={styles.calBtn} onPress={() => setShowCalendar(v => !v)}>
            <Text style={styles.calTxt}>{showCalendar ? '☰ LISTE' : '📅 CAL'}</Text>
          </TouchableOpacity>
        )}
        {mode === 'resa' && (
          <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <Text style={styles.exportTxt}>📤</Text>
          </TouchableOpacity>
        )}
        {mode === 'resa' && (
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/new-booking')}>
            <Text style={styles.addTxt}>+ CRÉER</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Segment: résa voiture / opérations */}
      <View style={styles.segRow}>
        {([['resa', '🚗 RÉSA VOITURE'], ['ops', '🏠 OPÉRATIONS']] as [ResaMode, string][]).map(([k, lbl]) => (
          <TouchableOpacity key={k} style={[styles.segBtn, mode === k && styles.segBtnActive]} onPress={() => setMode(k)}>
            <Text style={[styles.segTxt, mode === k && styles.segTxtActive]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick stats bar */}
      {mode === 'resa' && (
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
      )}

      {/* Calendar heatmap */}
      {mode === 'resa' && showCalendar && (() => {
        const days = buildCalendar(calMonth);
        const firstDow = new Date(calMonth + '-01').getDay(); // 0=Sun
        const blanks = Array(firstDow).fill(null);
        const today = new Date().toISOString().slice(0, 10);
        const [cy, cm] = calMonth.split('-').map(Number);
        const prevMonth = new Date(cy, cm - 2, 1).toISOString().slice(0, 7);
        const nextMonth = new Date(cy, cm, 1).toISOString().slice(0, 7);
        return (
          <View style={styles.calCard}>
            <View style={styles.calNavRow}>
              <TouchableOpacity onPress={() => setCalMonth(prevMonth)} style={styles.calNavBtn}>
                <Text style={styles.calNavTxt}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthTxt}>{new Date(calMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setCalMonth(nextMonth)} style={styles.calNavBtn}>
                <Text style={styles.calNavTxt}>▶</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calGrid}>
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                <Text key={i} style={styles.calDowTxt}>{d}</Text>
              ))}
              {blanks.map((_, i) => <View key={`b${i}`} style={styles.calCell} />)}
              {days.map(day => {
                const cnt      = countBookingsOnDay(day, bookings);
                const isToday  = day === today;
                const isSel    = day === selectedDay;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.calCell,
                      { backgroundColor: dayColor(cnt) },
                      isToday && styles.calCellToday,
                      isSel && styles.calCellSel,
                    ]}
                    onPress={() => setSelectedDay(prev => prev === day ? null : day)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.calDayTxt, isToday && { color: '#fff', fontWeight: '700' }, isSel && { color: '#00e5ff' }]}>{day.slice(8)}</Text>
                    {cnt > 0 && <Text style={styles.calCntTxt}>{cnt}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.calLegend}>
              {[{ col: '#0a0a0a', lbl: 'libre' }, { col: '#00ff8840', lbl: '1 résa' }, { col: '#00ff8880', lbl: '2 résa' }, { col: '#00ff88cc', lbl: '3+' }].map(l => (
                <View key={l.lbl} style={styles.calLegendItem}>
                  <View style={[styles.calLegendDot, { backgroundColor: l.col }]} />
                  <Text style={styles.calLegendLbl}>{l.lbl}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })()}

      {/* Filter tabs */}
      {mode === 'resa' && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'CONFIRMED', 'PENDING', 'COMPLETED', 'REJECTED'] as Filter[]).map(f => (
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
      )}

      {/* Day filter indicator */}
      {mode === 'resa' && selectedDay && (
        <View style={styles.dayFilterBar}>
          <Text style={styles.dayFilterTxt}>📅 {selectedDay} — {filtered.length} résa</Text>
          <TouchableOpacity onPress={() => setSelectedDay(null)}>
            <Text style={styles.dayFilterClear}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Search */}
      {mode === 'resa' && (
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="RECHERCHE CLIENT / TÉL / VOITURE..."
          placeholderTextColor="#1a1a1a"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      )}

      {/* List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
      >
        {loading && (
          <Text style={styles.emptyTxt}>CHARGEMENT...</Text>
        )}

        {/* OPÉRATIONS (immo / vente / demandes) */}
        {!loading && mode === 'ops' && (
          operations.length === 0
            ? <Text style={styles.emptyTxt}>AUCUNE OPÉRATION{'\n'}Dzaryx les enregistre quand tu marques un bien loué/vendu ou une voiture vendue.</Text>
            : operations.map(op => {
                const m = OP_META[op.deal_type] ?? { label: op.deal_type.toUpperCase(), icon: '•', color: '#888' };
                const cur = op.currency === 'DZD' ? 'DA' : (op.currency || '€');
                return (
                  <TouchableOpacity key={op.id} activeOpacity={0.8}
                    onPress={() => router.push({ pathname: '/client-detail', params: { name: op.client_name, phone: op.client_phone ?? '' } })}>
                    <View style={styles.card}>
                      <View style={styles.cardTop}>
                        <Text style={{ fontSize: 14 }}>{m.icon}</Text>
                        <Text style={styles.clientName}>{op.client_name.toUpperCase()}</Text>
                        <Text style={[styles.statusLabel, { color: m.color }]}>{m.label}</Text>
                      </View>
                      {op.item_label ? <Text style={styles.carName}>{op.item_label}</Text> : null}
                      <View style={styles.finRow}>
                        <Text style={styles.price}>{op.amount != null ? `${Number(op.amount).toLocaleString()} ${cur}` : '—'}</Text>
                        <Text style={styles.daysTxt}>{fmtDate(op.created_at)}</Text>
                        {op.status ? <Text style={[styles.payStatus, { color: '#888' }]}>{op.status.toUpperCase()}</Text> : null}
                      </View>
                      {op.client_phone && (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity style={styles.callBtn} onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${op.client_phone}`); }}>
                            <Text style={styles.callTxt}>📞</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
        )}

        {!loading && mode === 'resa' && filtered.length === 0 && (
          <Text style={styles.emptyTxt}>AUCUNE RÉSERVATION</Text>
        )}
        {!loading && mode === 'resa' && filtered.map(b => {
          const late    = isLate(b);
          const upcoming = isUpcoming(b);
          const color   = late ? '#ff4444' : (STATUS_COLOR[b.status] ?? '#555');
          const days    = nbDays(b.start_date, b.end_date);
          const car     = (b.cars as { name: string; category: string | null } | null);
          const hasMissingProfit = b.owner_price_per_day == null && ['ACTIVE', 'CONFIRMED', 'PENDING'].includes(b.status);

          return (
            <TouchableOpacity key={b.id} activeOpacity={0.8} onPress={() => router.push({ pathname: '/booking-detail', params: { id: b.id } })}>
            <View style={[styles.card, late && styles.cardLate]}>
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
                  {b.payment_status === 'PAID' ? 'PAYÉ' : b.payment_status === 'PARTIAL' ? 'ACOMPTE' : 'NON PAYÉ'}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.actionsRow}>
                {b.client_phone && (
                  <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${b.client_phone}`)}>
                    <Text style={styles.callTxt}>📞</Text>
                  </TouchableOpacity>
                )}
                {b.client_phone && (
                  <TouchableOpacity style={styles.waBtn} onPress={() => {
                    const phone = b.client_phone!.replace(/\s/g, '').replace(/^0+/, '213');
                    const car   = (b.cars as { name: string } | null)?.name ?? 'votre véhicule';
                    const msg   = encodeURIComponent(
                      `Bonjour ${b.client_name}, votre réservation ${car} est confirmée du ${fmtDate(b.start_date)} au ${fmtDate(b.end_date)}. Fik Conciergerie Oran.`
                    );
                    Linking.openURL(`https://wa.me/${phone}?text=${msg}`);
                  }}>
                    <Text style={styles.waTxt}>💬</Text>
                  </TouchableOpacity>
                )}
                {b.payment_status !== 'PAID' && ['ACTIVE','CONFIRMED','PENDING'].includes(b.status) && (
                  <TouchableOpacity style={styles.paidBtn} onPress={() => markPaid(b)}>
                    <Text style={styles.paidTxt}>💳 PAYÉ</Text>
                  </TouchableOpacity>
                )}
                {b.status === 'PENDING' && (
                  <TouchableOpacity style={styles.confirmBtn} onPress={() => markConfirmed(b)}>
                    <Text style={styles.confirmTxt}>✓ CONF</Text>
                  </TouchableOpacity>
                )}
                {(b.status === 'PENDING' || (b.status === 'CONFIRMED' && b.start_date <= new Date().toISOString().slice(0, 10))) && (
                  <TouchableOpacity style={styles.activeBtn} onPress={() => markActive(b)}>
                    <Text style={styles.activeTxt}>▶ ACTIF</Text>
                  </TouchableOpacity>
                )}
                {b.status === 'ACTIVE' && (
                  <TouchableOpacity style={styles.completeBtn} onPress={() => markCompleted(b)}>
                    <Text style={styles.completeTxt}>■ FIN</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.idTxt}>#{b.id.slice(-6).toUpperCase()}</Text>
              </View>
            </View>
            </TouchableOpacity>
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

  segRow:       { flexDirection: 'row', paddingHorizontal: 20, gap: 6, marginBottom: 12 },
  segBtn:       { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 9, alignItems: 'center' },
  segBtnActive: { borderColor: '#00e5ff', backgroundColor: '#00e5ff14' },
  segTxt:       { color: '#555', fontSize: 8, fontFamily: MONO, letterSpacing: 1, fontWeight: '700' },
  segTxtActive: { color: '#00e5ff' },

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

  calBtn:    { backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff33', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  calTxt:    { color: '#00e5ff', fontSize: 8, fontFamily: MONO, letterSpacing: 1 },
  exportBtn: { backgroundColor: '#ffffff08', borderWidth: 1, borderColor: '#ffffff11', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  exportTxt: { color: '#ffffff66', fontSize: 12 },

  calCard:      { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 12, padding: 12 },
  calNavRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNavBtn:    { padding: 6 },
  calNavTxt:    { color: '#00e5ff', fontSize: 14, fontFamily: MONO },
  calMonthTxt:  { color: '#fff', fontSize: 9, fontFamily: MONO, letterSpacing: 3 },
  calGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  calDowTxt:    { width: '12.5%', textAlign: 'center', color: '#333', fontSize: 7, fontFamily: MONO, marginBottom: 4 },
  calCell:      { width: '12.5%', aspectRatio: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#111' },
  calCellToday: { borderColor: '#00e5ff66' },
  calCellSel:   { borderColor: '#00e5ff', borderWidth: 2, backgroundColor: '#00e5ff15' },
  calDayTxt:    { color: '#555', fontSize: 8, fontFamily: MONO },
  calCntTxt:    { color: '#00ff88', fontSize: 6, fontFamily: MONO },
  calLegend:    { flexDirection: 'row', gap: 12, marginTop: 10, justifyContent: 'center' },
  calLegendItem:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  calLegendDot: { width: 8, height: 8, borderRadius: 2, borderWidth: 1, borderColor: '#222' },
  calLegendLbl: { color: '#333', fontSize: 7, fontFamily: MONO },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 2,
  },
  searchInput: {
    flex: 1, color: '#fff', fontSize: 9, fontFamily: MONO, letterSpacing: 2, paddingVertical: 10,
  },
  clearTxt:       { color: '#333', fontSize: 14, paddingHorizontal: 4 },
  dayFilterBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 6, backgroundColor: '#00e5ff0f', borderWidth: 1, borderColor: '#00e5ff22', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  dayFilterTxt:   { color: '#00e5ff', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  dayFilterClear: { color: '#00e5ff66', fontSize: 14, paddingHorizontal: 4 },

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
  waBtn:     { backgroundColor: '#25d36611', borderWidth: 1, borderColor: '#25d36622', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  waTxt:     { color: '#25d366', fontSize: 12 },
  paidBtn:   { backgroundColor: '#00ff8811', borderWidth: 1, borderColor: '#00ff8844', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  paidTxt:   { color: '#00ff88', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  confirmBtn:  { backgroundColor: '#00ff8811', borderWidth: 1, borderColor: '#00ff8844', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  confirmTxt:  { color: '#00ff88', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  activeBtn:   { backgroundColor: '#ffaa0011', borderWidth: 1, borderColor: '#ffaa0044', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  activeTxt:   { color: '#ffaa00', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  completeBtn: { backgroundColor: '#55555511', borderWidth: 1, borderColor: '#55555544', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  completeTxt: { color: '#777', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  idTxt:       { color: '#222', fontSize: 8, fontFamily: MONO, letterSpacing: 2, marginLeft: 'auto' },
});
