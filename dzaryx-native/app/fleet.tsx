import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, Alert, ActivityIndicator, TextInput, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchAllCars, fetchBookings, updateCar, createCar, fetchFleetStats, type Car, type Booking, type FleetIntelligence } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
  catch { return d; }
}

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

  const [cars,        setCars]       = useState<Car[]>([]);
  const [fleet,       setFleet]      = useState<FleetIntelligence | null>(null);
  const [activeBookings,  setActiveBookings]  = useState<Booking[]>([]);
  const [arrivalsToday,   setArrivalsToday]   = useState<Booking[]>([]);
  const [returnsToday,    setReturnsToday]    = useState<Booking[]>([]);
  const [nextBookings,    setNextBookings]    = useState<Record<string, Booking>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling,   setToggling]   = useState<string | null>(null);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editClient, setEditClient] = useState('');
  const [editOwner,  setEditOwner]  = useState('');
  const [savingId,   setSavingId]   = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [newName,    setNewName]    = useState('');
  const [newCat,     setNewCat]     = useState('');
  const [newPPD,     setNewPPD]     = useState('');
  const [newOwnerPPD,setNewOwnerPPD]= useState('');
  const [newSeats,   setNewSeats]   = useState('');
  const [newFuel,    setNewFuel]    = useState('');
  const [newTrans,   setNewTrans]   = useState('');
  const [addingCar,  setAddingCar]  = useState(false);
  const [historyCarId,    setHistoryCarId]    = useState<string | null>(null);
  const [allBooksCache,   setAllBooksCache]   = useState<Booking[] | null>(null);
  const [historyLoading,  setHistoryLoading]  = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [c, f, booksActive, booksConfirmed, booksPending] = await Promise.all([
      fetchAllCars(TOKEN),
      fetchFleetStats(TOKEN),
      fetchBookings(TOKEN, 'ACTIVE', 100),
      fetchBookings(TOKEN, 'CONFIRMED', 100),
      fetchBookings(TOKEN, 'PENDING', 100),
    ]);
    setCars(c);
    setFleet(f);
    const all = [...booksActive, ...booksConfirmed];
    setActiveBookings(all.filter(b => b.start_date <= today && b.end_date >= today));
    setArrivalsToday(all.filter(b => b.start_date === today));
    setReturnsToday(all.filter(b => b.end_date === today));
    // Next booking per car (earliest future confirmed or pending)
    const future = [...booksConfirmed, ...booksPending].filter(b => b.start_date > today);
    const nextMap: Record<string, Booking> = {};
    for (const b of future) {
      if (!b.car_id) continue;
      if (!nextMap[b.car_id] || b.start_date < nextMap[b.car_id].start_date) nextMap[b.car_id] = b;
    }
    setNextBookings(nextMap);
    if (isRefresh) { setRefreshing(false); setAllBooksCache(null); } else setLoading(false);
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

  const savePrices = useCallback(async (car: Car) => {
    setSavingId(car.id);
    const updates: Partial<Pick<Car, 'base_price' | 'resale_price'>> = {};
    if (editClient.trim() && !isNaN(Number(editClient))) updates.base_price   = Number(editClient);
    if (editOwner.trim()  && !isNaN(Number(editOwner)))  updates.resale_price = Number(editOwner);
    const ok = await updateCar(car.id, updates, TOKEN);
    setSavingId(null);
    if (ok) {
      setCars(prev => prev.map(c => c.id === car.id ? { ...c, ...updates } : c));
      setEditingId(null);
    } else {
      Alert.alert('Erreur', 'Mise à jour prix échouée.');
    }
  }, [editClient, editOwner, TOKEN]);

  const handleAddCar = useCallback(async () => {
    if (!newName.trim()) { Alert.alert('Nom requis'); return; }
    const ppd = Number(newPPD);
    if (!newPPD || isNaN(ppd) || ppd < 0) { Alert.alert('Prix client/jour requis'); return; }
    setAddingCar(true);
    const result = await createCar({
      name:         newName.trim(),
      category:     newCat.trim() || undefined,
      base_price:   ppd,
      resale_price: newOwnerPPD ? Number(newOwnerPPD) : 0,
      seats:        newSeats ? Number(newSeats) : undefined,
      fuel:         newFuel.trim() || undefined,
      transmission: newTrans.trim() || undefined,
    }, TOKEN);
    setAddingCar(false);
    if (result.ok) {
      setShowAddCar(false);
      setNewName(''); setNewCat(''); setNewPPD(''); setNewOwnerPPD(''); setNewSeats(''); setNewFuel(''); setNewTrans('');
      await load();
      Alert.alert('✅ Ajouté', `${result.car?.name ?? ''} ajouté au parc.`);
    } else {
      Alert.alert('Erreur', result.error ?? 'Ajout échoué');
    }
  }, [newName, newCat, newPPD, newOwnerPPD, newSeats, newFuel, newTrans, TOKEN, load]);

  const handleToggleHistory = useCallback(async (carId: string) => {
    if (historyCarId === carId) { setHistoryCarId(null); return; }
    setHistoryCarId(carId);
    if (allBooksCache) return;
    setHistoryLoading(true);
    const all = await fetchBookings(TOKEN, undefined, 500);
    setAllBooksCache(all);
    setHistoryLoading(false);
  }, [historyCarId, allBooksCache, TOKEN]);

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
        <TouchableOpacity style={styles.addCarBtn} onPress={() => setShowAddCar(v => !v)}>
          <Text style={styles.addCarTxt}>{showAddCar ? '✕' : '+ VOITURE'}</Text>
        </TouchableOpacity>
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
        {/* Today's arrivals & returns */}
        {(arrivalsToday.length > 0 || returnsToday.length > 0) && (
          <View style={styles.todayCard}>
            {arrivalsToday.length > 0 && (
              <>
                <Text style={styles.todayTitle}>✈️ ARRIVÉES AUJOURD'HUI ({arrivalsToday.length})</Text>
                {arrivalsToday.map((b, i) => {
                  const car = (b.cars as { name: string } | null)?.name ?? '?';
                  return (
                    <TouchableOpacity key={i} style={styles.todayRow} onPress={() => router.push({ pathname: '/booking-detail', params: { id: b.id } })}>
                      <Text style={styles.todayClient}>{b.client_name}</Text>
                      <Text style={styles.todayCar}>{car}</Text>
                      {b.client_phone && (
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${b.client_phone}`); }}>
                          <Text style={styles.todayPhone}>📞</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            {arrivalsToday.length > 0 && returnsToday.length > 0 && <View style={styles.todayDivider} />}
            {returnsToday.length > 0 && (
              <>
                <Text style={[styles.todayTitle, { color: '#ffaa00' }]}>🔙 RETOURS AUJOURD'HUI ({returnsToday.length})</Text>
                {returnsToday.map((b, i) => {
                  const car = (b.cars as { name: string } | null)?.name ?? '?';
                  return (
                    <TouchableOpacity key={i} style={styles.todayRow} onPress={() => router.push({ pathname: '/booking-detail', params: { id: b.id } })}>
                      <Text style={styles.todayClient}>{b.client_name}</Text>
                      <Text style={styles.todayCar}>{car}</Text>
                      {b.client_phone && (
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${b.client_phone}`); }}>
                          <Text style={styles.todayPhone}>📞</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}

        {loading && <ActivityIndicator color="#00e5ff" style={{ marginTop: 40 }} />}

        {!loading && cars.length === 0 && (
          <Text style={styles.emptyTxt}>AUCUN VÉHICULE</Text>
        )}

        {!loading && cars.map(car => {
          const fleetStat     = fleet?.stats?.find(s => s.car_name === car.name);
          const isToggling    = toggling === car.id;
          const currentRenter = activeBookings.find(b => b.car_id === car.id);

          return (
            <View key={car.id} style={[styles.card, !car.available && styles.cardBusy]}>
              <View style={styles.cardTop}>
                <View style={[styles.availDot, { backgroundColor: car.available ? '#00ff88' : '#ffaa00' }]} />
                <Text style={styles.carName}>{car.name.toUpperCase()}</Text>
                <Text style={[styles.availLabel, { color: car.available ? '#00ff88' : '#ffaa00' }]}>
                  {car.available ? 'DISPO' : 'EN LOC'}
                </Text>
              </View>

              {currentRenter && (
                <TouchableOpacity style={styles.renterRow} onPress={() => router.push({ pathname: '/booking-detail', params: { id: currentRenter.id } })}>
                  <Text style={styles.renterIcon}>👤</Text>
                  <Text style={styles.renterName}>{currentRenter.client_name}</Text>
                  <Text style={styles.renterDates}>→ {currentRenter.end_date.slice(5)}</Text>
                  {currentRenter.client_phone && (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${currentRenter.client_phone}`); }}>
                      <Text style={styles.renterPhone}>📞</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}
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

              {editingId === car.id ? (
                <View style={styles.priceEditBox}>
                  <View style={styles.priceEditRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.priceEditLbl}>PRIX CLIENT/JOUR (€)</Text>
                      <TextInput
                        style={styles.priceEditInput}
                        value={editClient}
                        onChangeText={setEditClient}
                        keyboardType="numeric"
                        placeholder={car.base_price != null ? String(car.base_price) : 'ex: 80'}
                        placeholderTextColor="#333"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.priceEditLbl}>PRIX PROPRIO/JOUR (€)</Text>
                      <TextInput
                        style={styles.priceEditInput}
                        value={editOwner}
                        onChangeText={setEditOwner}
                        keyboardType="numeric"
                        placeholder={car.resale_price != null ? String(car.resale_price) : 'ex: 50'}
                        placeholderTextColor="#333"
                      />
                    </View>
                  </View>
                  <View style={styles.priceEditActions}>
                    <TouchableOpacity style={styles.cancelPriceBtn} onPress={() => setEditingId(null)}>
                      <Text style={styles.cancelPriceTxt}>ANNULER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.savePriceBtn}
                      onPress={() => savePrices(car)}
                      disabled={savingId === car.id}
                    >
                      <Text style={styles.savePriceTxt}>{savingId === car.id ? '...' : 'SAUVEGARDER'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.editPriceBtn} onPress={() => {
                  setEditingId(car.id);
                  setEditClient(car.base_price != null ? String(car.base_price) : '');
                  setEditOwner(car.resale_price != null ? String(car.resale_price) : '');
                }}>
                  <Text style={styles.editPriceTxt}>✏️ MODIFIER LES PRIX</Text>
                </TouchableOpacity>
              )}

              {/* Next booking for available cars */}
              {car.available && nextBookings[car.id] && (() => {
                const nb = nextBookings[car.id];
                return (
                  <TouchableOpacity style={styles.nextBkRow} onPress={() => router.push({ pathname: '/booking-detail', params: { id: nb.id } })}>
                    <Text style={styles.nextBkLabel}>📅 PROCHAINE RÉSA</Text>
                    <Text style={styles.nextBkClient}>{nb.client_name}</Text>
                    <Text style={styles.nextBkDates}>{fmtDate(nb.start_date)} → {fmtDate(nb.end_date)}</Text>
                    <View style={[styles.nextBkStatus, { borderColor: nb.status === 'CONFIRMED' ? '#00ff8844' : '#ffaa0044' }]}>
                      <Text style={[styles.nextBkStatusTxt, { color: nb.status === 'CONFIRMED' ? '#00ff88' : '#ffaa00' }]}>{nb.status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {/* History toggle */}
              <TouchableOpacity style={styles.histBtn} onPress={() => handleToggleHistory(car.id)}>
                <Text style={styles.histBtnTxt}>
                  {historyCarId === car.id ? '▲ MASQUER HISTORIQUE' : '▼ VOIR HISTORIQUE'}
                </Text>
              </TouchableOpacity>

              {/* History panel */}
              {historyCarId === car.id && (
                <View style={styles.histPanel}>
                  {historyLoading ? (
                    <ActivityIndicator color="#00e5ff" style={{ marginVertical: 10 }} />
                  ) : (() => {
                    const carBks = (allBooksCache ?? [])
                      .filter(b => b.car_id === car.id)
                      .sort((a, b) => b.start_date.localeCompare(a.start_date))
                      .slice(0, 15);
                    if (carBks.length === 0) return <Text style={styles.histEmpty}>AUCUN HISTORIQUE</Text>;
                    return carBks.map((b, i) => (
                      <TouchableOpacity key={i} style={styles.histRow} onPress={() => router.push({ pathname: '/booking-detail', params: { id: b.id } })}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.histClient}>{b.client_name}</Text>
                          <Text style={styles.histDates}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.histPrice}>{b.final_price != null ? `${b.final_price}€` : '—'}</Text>
                          <Text style={[styles.histStatus, { color: b.status === 'COMPLETED' ? '#555' : b.status === 'REJECTED' ? '#ff4444' : '#00e5ff' }]}>
                            {b.status}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ));
                  })()}
                </View>
              )}
            </View>
          );
        })}

        {/* Add car form */}
        {showAddCar && (
          <View style={styles.addCarCard}>
            <Text style={styles.addCarTitle}>NOUVEAU VÉHICULE</Text>

            <Text style={styles.addCarLbl}>NOM *</Text>
            <TextInput style={styles.addCarInput} value={newName} onChangeText={setNewName} placeholderTextColor="#333" placeholder="ex: Renault Clio 4" autoCapitalize="words" />

            <Text style={styles.addCarLbl}>CATÉGORIE</Text>
            <TextInput style={styles.addCarInput} value={newCat} onChangeText={setNewCat} placeholderTextColor="#333" placeholder="ex: Citadine" autoCapitalize="sentences" />

            <View style={styles.addCarRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCarLbl}>PRIX CLIENT/J (€) *</Text>
                <TextInput style={styles.addCarInput} value={newPPD} onChangeText={setNewPPD} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 80" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCarLbl}>PRIX PROPRIO/J (€)</Text>
                <TextInput style={styles.addCarInput} value={newOwnerPPD} onChangeText={setNewOwnerPPD} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 50" />
              </View>
            </View>

            <View style={styles.addCarRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCarLbl}>PLACES</Text>
                <TextInput style={styles.addCarInput} value={newSeats} onChangeText={setNewSeats} keyboardType="numeric" placeholderTextColor="#333" placeholder="5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCarLbl}>CARBURANT</Text>
                <TextInput style={styles.addCarInput} value={newFuel} onChangeText={setNewFuel} placeholderTextColor="#333" placeholder="essence" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addCarLbl}>BOÎTE</Text>
                <TextInput style={styles.addCarInput} value={newTrans} onChangeText={setNewTrans} placeholderTextColor="#333" placeholder="manuelle" autoCapitalize="none" />
              </View>
            </View>

            <TouchableOpacity style={styles.addCarSubmit} onPress={handleAddCar} disabled={addingCar}>
              <Text style={styles.addCarSubmitTxt}>{addingCar ? '...' : '+ AJOUTER AU PARC'}</Text>
            </TouchableOpacity>
          </View>
        )}
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

  renterRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, backgroundColor: '#ffaa0011', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  renterIcon:  { fontSize: 12 },
  renterName:  { flex: 1, color: '#ffaa00', fontSize: 10, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  renterDates: { color: '#555', fontSize: 9, fontFamily: MONO },
  renterPhone: { fontSize: 14 },

  todayCard:    { backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff22', borderRadius: 12, padding: 14, marginBottom: 10 },
  todayTitle:   { color: '#00e5ff', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginBottom: 8 },
  todayRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  todayClient:  { flex: 1, color: '#fff', fontSize: 10, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  todayCar:     { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginRight: 8 },
  todayPhone:   { fontSize: 14 },
  todayDivider: { height: 1, backgroundColor: '#111', marginVertical: 10 },

  addCarBtn:  { backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff33', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addCarTxt:  { color: '#00e5ff', fontSize: 8, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  addCarCard:  { backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff22', borderRadius: 12, padding: 16, marginBottom: 10 },
  addCarTitle: { color: '#00e5ff', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },
  addCarLbl:   { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginBottom: 4, marginTop: 8 },
  addCarInput: {
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    color: '#fff', fontSize: 12, fontFamily: MONO,
  },
  addCarRow:   { flexDirection: 'row', gap: 8 },
  addCarSubmit:{ backgroundColor: '#00e5ff22', borderWidth: 1, borderColor: '#00e5ff44', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  addCarSubmitTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  editPriceBtn:  { marginTop: 8, borderWidth: 1, borderColor: '#ffffff11', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  editPriceTxt:  { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },

  priceEditBox:    { marginTop: 10, backgroundColor: '#0a0a0a', borderRadius: 10, padding: 12 },
  priceEditRow:    { flexDirection: 'row', gap: 10, marginBottom: 10 },
  priceEditLbl:    { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginBottom: 4 },
  priceEditInput:  {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    color: '#fff', fontSize: 12, fontFamily: MONO,
  },
  priceEditActions:{ flexDirection: 'row', gap: 8 },
  cancelPriceBtn:  { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  cancelPriceTxt:  { color: '#555', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
  savePriceBtn:    { flex: 2, backgroundColor: '#00e5ff22', borderWidth: 1, borderColor: '#00e5ff44', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  savePriceTxt:    { color: '#00e5ff', fontSize: 8, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  nextBkRow:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, backgroundColor: '#00ff8808', borderWidth: 1, borderColor: '#00ff8822', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  nextBkLabel:     { color: '#00ff8888', fontSize: 7, fontFamily: MONO, letterSpacing: 1 },
  nextBkClient:    { color: '#00ff88', fontSize: 9, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  nextBkDates:     { color: '#555', fontSize: 8, fontFamily: MONO },
  nextBkStatus:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  nextBkStatusTxt: { fontSize: 7, fontFamily: MONO, letterSpacing: 1 },

  histBtn:         { marginTop: 6, paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#111' },
  histBtnTxt:      { color: '#2a2a2a', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },

  histPanel:       { marginTop: 4, backgroundColor: '#030303', borderRadius: 8, padding: 10 },
  histEmpty:       { color: '#222', fontSize: 9, fontFamily: MONO, letterSpacing: 2, textAlign: 'center', paddingVertical: 10 },
  histRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  histClient:      { color: '#888', fontSize: 9, fontFamily: MONO, fontWeight: '700', letterSpacing: 1 },
  histDates:       { color: '#333', fontSize: 8, fontFamily: MONO, marginTop: 2 },
  histPrice:       { color: '#fff', fontSize: 10, fontFamily: MONO, fontWeight: '700' },
  histStatus:      { fontSize: 7, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },
});
