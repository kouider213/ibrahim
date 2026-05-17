import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchAllCars, updateCar, fetchFleetStats, type Car, type FleetIntelligence } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function fuelIcon(fuel: string | null): string {
  if (!fuel) return '⛽';
  const f = fuel.toLowerCase();
  if (f.includes('elec')) return '⚡';
  if (f.includes('hybr')) return '🔋';
  if (f.includes('dies')) return '🛢️';
  return '⛽';
}

export default function FleetScreen() {
  const router  = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [cars,       setCars]       = useState<Car[]>([]);
  const [fleet,      setFleet]      = useState<FleetIntelligence | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling,   setToggling]   = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [c, f] = await Promise.all([fetchAllCars(TOKEN), fetchFleetStats(TOKEN)]);
    setCars(c);
    setFleet(f);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const toggleAvailability = useCallback(async (car: Car) => {
    const next = !car.available;
    const label = next ? 'disponible' : 'en location';
    Alert.alert(
      `Marquer ${next ? 'DISPONIBLE' : 'EN LOCATION'}`,
      `${car.name} sera marqué comme ${label}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: next ? '✓ DISPO' : '🔒 EN LOC',
          onPress: async () => {
            setToggling(car.id);
            const ok = await updateCar(car.id, { available: next }, TOKEN);
            setToggling(null);
            if (ok) setCars(prev => prev.map(c => c.id === car.id ? { ...c, available: next } : c));
            else Alert.alert('Erreur', 'Mise à jour échouée.');
          },
        },
      ],
    );
  }, [TOKEN]);

  const available = cars.filter(c => c.available).length;
  const rented    = cars.filter(c => !c.available).length;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PARC VÉHICULES</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statNum}>{cars.length}</Text>
          <Text style={styles.statLbl}>TOTAL</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#00ff88' }]}>{available}</Text>
          <Text style={styles.statLbl}>DISPO</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: '#ffaa00' }]}>{rented}</Text>
          <Text style={styles.statLbl}>EN LOC</Text>
        </View>
        {fleet?.occupancy_avg_pct != null && (
          <View style={styles.statPill}>
            <Text style={[styles.statNum, { color: '#00e5ff', fontSize: 16 }]}>
              {Math.round(fleet.occupancy_avg_pct)}%
            </Text>
            <Text style={styles.statLbl}>OCCUP</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
      >
        {loading && <ActivityIndicator color="#00e5ff" style={{ marginTop: 40 }} />}

        {!loading && cars.length === 0 && (
          <Text style={styles.emptyTxt}>AUCUN VÉHICULE</Text>
        )}

        {!loading && cars.map(car => {
          const fleetStat = fleet?.stats?.find(s => s.car_name === car.name);
          const isToggling = toggling === car.id;

          return (
            <View key={car.id} style={[styles.card, !car.available && styles.cardBusy]}>
              <View style={styles.cardTop}>
                <View style={[styles.availDot, { backgroundColor: car.available ? '#00ff88' : '#ffaa00' }]} />
                <Text style={styles.carName}>{car.name.toUpperCase()}</Text>
                <Text style={[styles.availLabel, { color: car.available ? '#00ff88' : '#ffaa00' }]}>
                  {car.available ? 'DISPO' : 'EN LOC'}
                </Text>
              </View>

              <View style={styles.metaRow}>
                {car.category && <Text style={styles.metaChip}>{car.category}</Text>}
                {car.fuel && <Text style={styles.metaChip}>{fuelIcon(car.fuel)} {car.fuel}</Text>}
                {car.seats && <Text style={styles.metaChip}>{car.seats} places</Text>}
                {car.transmission && <Text style={styles.metaChip}>{car.transmission}</Text>}
              </View>

              <View style={styles.priceRow}>
                {car.base_price != null && (
                  <Text style={styles.priceClient}>{car.base_price}€/j client</Text>
                )}
                {car.resale_price != null && (
                  <Text style={styles.priceOwner}>{car.resale_price}€/j proprio</Text>
                )}
              </View>

              {fleetStat && (
                <View style={styles.statsRow2}>
                  <Text style={styles.revenueLabel}>CA 30j :</Text>
                  <Text style={styles.revenueValue}>
                    {Math.round(fleetStat.revenue_30d)}€
                  </Text>
                  <Text style={styles.occLabel}>Occup :</Text>
                  <Text style={styles.occValue}>{Math.round(fleetStat.occupancy_pct)}%</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.toggleBtn, car.available ? styles.toggleBtnBusy : styles.toggleBtnDispo]}
                onPress={() => toggleAvailability(car)}
                disabled={isToggling}
              >
                {isToggling
                  ? <ActivityIndicator size="small" color={car.available ? '#ffaa00' : '#00ff88'} />
                  : <Text style={[styles.toggleTxt, { color: car.available ? '#ffaa00' : '#00ff88' }]}>
                      {car.available ? '🔒 MARQUER EN LOCATION' : '✓ MARQUER DISPONIBLE'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },

  statsRow:  { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  statPill:  { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statNum:   { color: '#fff', fontSize: 18, fontFamily: MONO, fontWeight: '700' },
  statLbl:   { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 2 },

  list:        { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyTxt:    { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 3, textAlign: 'center', marginTop: 60 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 16, marginBottom: 10,
  },
  cardBusy: { borderColor: '#ffaa0033' },

  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  availDot:    { width: 8, height: 8, borderRadius: 4 },
  carName:     { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },
  availLabel:  { fontSize: 9, fontFamily: MONO, letterSpacing: 2 },

  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  metaChip: { color: '#444', fontSize: 9, fontFamily: MONO, letterSpacing: 1, backgroundColor: '#0a0a0a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },

  priceRow:    { flexDirection: 'row', gap: 12, marginBottom: 8 },
  priceClient: { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 1 },
  priceOwner:  { color: '#7c3aed', fontSize: 11, fontFamily: MONO, letterSpacing: 1 },

  statsRow2:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  revenueLabel: { color: '#333', fontSize: 9, fontFamily: MONO },
  revenueValue: { color: '#00ff88', fontSize: 11, fontFamily: MONO, fontWeight: '700' },
  occLabel:     { color: '#333', fontSize: 9, fontFamily: MONO, marginLeft: 8 },
  occValue:     { color: '#00e5ff', fontSize: 11, fontFamily: MONO, fontWeight: '700' },

  toggleBtn: {
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1,
  },
  toggleBtnDispo: { borderColor: '#00ff8833', backgroundColor: '#00ff8811' },
  toggleBtnBusy:  { borderColor: '#ffaa0033', backgroundColor: '#ffaa0011' },
  toggleTxt: { fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
});
