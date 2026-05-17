import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchCars, checkCarAvailability, type Car, BACKEND_URL } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowStr(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function NewBookingScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [cars,        setCars]       = useState<Car[]>([]);
  const [carsLoading, setCarsLoading]= useState(true);
  const [selectedCar, setSelectedCar]= useState<Car | null>(null);
  const [showCarPicker, setShowCarPicker] = useState(false);

  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAge,   setClientAge]   = useState('');
  const [rentedBy,    setRentedBy]    = useState<'Kouider' | 'Houari'>('Kouider');
  const [startDate,   setStartDate]   = useState(todayStr());
  const [endDate,     setEndDate]     = useState(tomorrowStr());
  const [finalPrice,  setFinalPrice]  = useState('');
  const [clientPPD,   setClientPPD]   = useState('');
  const [ownerPPD,    setOwnerPPD]    = useState('');
  const [notes,       setNotes]       = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [availChecking,setAvailChecking]= useState(false);

  useEffect(() => {
    fetchCars(TOKEN).then(data => { setCars(data); setCarsLoading(false); });
  }, [TOKEN]);

  useEffect(() => {
    if (!selectedCar || !startDate || !endDate) { setAvailability(null); return; }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(startDate) || !dateRe.test(endDate)) return;
    setAvailChecking(true);
    checkCarAvailability(selectedCar.id, startDate, endDate, TOKEN)
      .then(a => setAvailability(a))
      .finally(() => setAvailChecking(false));
  }, [selectedCar, startDate, endDate, TOKEN]);

  const days = Math.max(1, Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
  ));
  const profit = clientPPD && ownerPPD
    ? Math.round((Number(clientPPD) - Number(ownerPPD)) * days * 100) / 100
    : null;

  const handleSubmit = useCallback(async () => {
    if (!selectedCar) { Alert.alert('Voiture requise', 'Sélectionne une voiture.'); return; }
    if (!clientName.trim()) { Alert.alert('Client requis', 'Entre le nom du client.'); return; }
    if (!clientPhone.trim() || clientPhone.trim().length < 6) { Alert.alert('Téléphone requis', 'Entre un numéro de téléphone valide (min 6 chiffres).'); return; }
    if (!finalPrice || isNaN(Number(finalPrice))) { Alert.alert('Prix requis', 'Entre un prix total valide.'); return; }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        car_id:               selectedCar.id,
        client_name:          clientName.trim(),
        client_phone:         clientPhone.trim() || undefined,
        client_email:         clientEmail.trim() || undefined,
        start_date:           startDate,
        end_date:             endDate,
        final_price:          Number(finalPrice),
        syncCalendar:         true,
        rented_by:            rentedBy,
      };
      if (clientAge.trim() && !isNaN(Number(clientAge))) body['client_age'] = Number(clientAge);
      if (notes.trim()) body['notes'] = notes.trim();
      if (clientPPD && !isNaN(Number(clientPPD))) body['client_price_per_day'] = Number(clientPPD);
      if (ownerPPD  && !isNaN(Number(ownerPPD)))  body['owner_price_per_day']  = Number(ownerPPD);

      const res = await fetch(`${BACKEND_URL}/api/bookings`, {
        method: 'POST',
        headers: authHeaders(TOKEN),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const json = await res.json() as { booking?: { id: string }; error?: string };
      if (!res.ok) {
        Alert.alert('Erreur', json.error ?? 'Création échouée');
        return;
      }

      Alert.alert(
        '✅ Réservation créée',
        `${clientName} — ${selectedCar.name}\n${startDate} → ${endDate}\n${finalPrice}€`,
        [{ text: 'OK', onPress: () => router.replace('/bookings') }],
      );
    } catch (err) {
      Alert.alert('Erreur réseau', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [selectedCar, clientName, clientPhone, clientEmail, startDate, endDate, finalPrice, clientPPD, ownerPPD, notes, TOKEN, router]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>NOUVELLE RÉSA</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Car picker */}
        <Text style={styles.label}>VOITURE *</Text>
        <TouchableOpacity
          style={[styles.input, styles.pickerBtn]}
          onPress={() => setShowCarPicker(v => !v)}
        >
          <Text style={[styles.inputTxt, !selectedCar && { color: '#333' }]}>
            {selectedCar ? selectedCar.name : (carsLoading ? 'CHARGEMENT...' : 'SÉLECTIONNER UNE VOITURE')}
          </Text>
          <Text style={styles.chevron}>{showCarPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showCarPicker && (
          <View style={styles.carList}>
            {cars.map(car => (
              <TouchableOpacity
                key={car.id}
                style={[styles.carItem, selectedCar?.id === car.id && styles.carItemActive]}
                onPress={() => {
                  setSelectedCar(car);
                  setShowCarPicker(false);
                  // Auto-fill price fields from car's base/resale prices
                  if (car.base_price != null && !clientPPD) setClientPPD(String(car.base_price));
                  if (car.resale_price != null && !ownerPPD)  setOwnerPPD(String(car.resale_price));
                }}
              >
                <View style={[styles.availDot, { backgroundColor: car.available ? '#00ff88' : '#ff4444' }]} />
                <Text style={styles.carItemTxt}>{car.name}</Text>
                {car.category && <Text style={styles.carItemCat}>{car.category}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Client info */}
        <Text style={styles.label}>CLIENT *</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor="#333"
          placeholder="NOM COMPLET"
          value={clientName}
          onChangeText={setClientName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>TÉLÉPHONE</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor="#333"
          placeholder="+213 xxx xxx xxx"
          value={clientPhone}
          onChangeText={setClientPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>EMAIL</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor="#333"
          placeholder="client@email.com"
          value={clientEmail}
          onChangeText={setClientEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>ÂGE CLIENT</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor="#333"
          placeholder="ex: 28"
          value={clientAge}
          onChangeText={setClientAge}
          keyboardType="numeric"
          maxLength={2}
        />
        {clientAge.trim() && Number(clientAge) < 35 && Number(clientAge) > 0 && (
          <Text style={styles.ageWarn}>⚠️ Politique Fik : refus si âge {'<'} 35 ans — confirmer avec Houari</Text>
        )}

        <Text style={styles.label}>GÉRÉ PAR</Text>
        <View style={styles.toggleRow}>
          {(['Kouider', 'Houari'] as const).map(actor => (
            <TouchableOpacity
              key={actor}
              style={[styles.toggleBtn, rentedBy === actor && styles.toggleBtnActive]}
              onPress={() => setRentedBy(actor)}
            >
              <Text style={[styles.toggleTxt, rentedBy === actor && styles.toggleTxtActive]}>{actor.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dates */}
        <View style={styles.row2}>
          <View style={styles.halfCol}>
            <Text style={styles.label}>DÉBUT *</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor="#333"
              placeholder="YYYY-MM-DD"
              value={startDate}
              onChangeText={setStartDate}
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.label}>FIN *</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor="#333"
              placeholder="YYYY-MM-DD"
              value={endDate}
              onChangeText={setEndDate}
            />
          </View>
        </View>

        <Text style={styles.durationHint}>{days} jour{days > 1 ? 's' : ''}</Text>
        {selectedCar && (
          availChecking ? (
            <Text style={styles.availChecking}>Vérification disponibilité...</Text>
          ) : availability === true ? (
            <Text style={styles.availOk}>✅ {selectedCar.name} disponible pour ces dates</Text>
          ) : availability === false ? (
            <Text style={styles.availErr}>⛔ {selectedCar.name} déjà réservé sur ces dates</Text>
          ) : null
        )}

        {/* Financial */}
        <Text style={styles.label}>PRIX TOTAL CLIENT (€) *</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor="#333"
          placeholder="ex: 350"
          value={finalPrice}
          onChangeText={setFinalPrice}
          keyboardType="numeric"
        />

        <View style={styles.row2}>
          <View style={styles.halfCol}>
            <Text style={styles.label}>PRIX CLIENT/JOUR</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor="#333"
              placeholder="ex: 70"
              value={clientPPD}
              onChangeText={setClientPPD}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.label}>PRIX PROPRIO/JOUR</Text>
            <TextInput
              style={styles.input}
              placeholderTextColor="#333"
              placeholder="ex: 45"
              value={ownerPPD}
              onChangeText={setOwnerPPD}
              keyboardType="numeric"
            />
          </View>
        </View>

        {profit !== null && (
          <View style={styles.profitRow}>
            <Text style={styles.profitLbl}>BÉNÉFICE ESTIMÉ:</Text>
            <Text style={[styles.profitVal, { color: profit >= 0 ? '#00ff88' : '#ff4444' }]}>
              {profit >= 0 ? '+' : ''}{profit}€
            </Text>
          </View>
        )}

        {/* Notes */}
        <Text style={styles.label}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholderTextColor="#333"
          placeholder="Remarques, conditions particulières..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitTxt}>
            {submitting ? 'CRÉATION EN COURS...' : '✅ CRÉER LA RÉSERVATION'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },

  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },

  scroll:       { flex: 1 },
  scrollContent:{ padding: 20 },

  label: { color: '#2a2a2a', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginBottom: 6, marginTop: 14 },

  input: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14,
    color: '#fff', fontSize: 12, fontFamily: MONO, letterSpacing: 2,
  },
  inputTxt: { color: '#fff', fontSize: 12, fontFamily: MONO, letterSpacing: 2, flex: 1 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  pickerBtn: { flexDirection: 'row', alignItems: 'center' },
  chevron:   { color: '#333', fontSize: 10, marginLeft: 8 },

  carList: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, marginTop: 4, overflow: 'hidden',
  },
  carItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  carItemActive: { backgroundColor: '#00e5ff11' },
  availDot:      { width: 7, height: 7, borderRadius: 3.5 },
  carItemTxt:    { flex: 1, color: '#fff', fontSize: 11, fontFamily: MONO, letterSpacing: 2 },
  carItemCat:    { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },

  row2:    { flexDirection: 'row', gap: 10 },
  halfCol: { flex: 1 },

  durationHint:  { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 2, marginTop: 6 },
  ageWarn:       { color: '#ffaa00', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginTop: 6, lineHeight: 14 },
  availChecking: { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginTop: 6 },
  availOk:       { color: '#00ff88', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginTop: 6 },
  availErr:      { color: '#ff4444', fontSize: 10, fontFamily: MONO, letterSpacing: 1, marginTop: 6, fontWeight: '700' },

  profitRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 8,
  },
  profitLbl: { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 3 },
  profitVal: { fontSize: 16, fontFamily: MONO, fontWeight: '700' },

  submitBtn: {
    backgroundColor: '#00ff8822', borderWidth: 1, borderColor: '#00ff88',
    borderRadius: 12, paddingVertical: 18, alignItems: 'center', marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitTxt: { color: '#00ff88', fontSize: 12, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  toggleRow:      { flexDirection: 'row', gap: 10 },
  toggleBtn:      { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#111', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  toggleBtnActive:{ borderColor: '#00e5ff44', backgroundColor: '#00e5ff11' },
  toggleTxt:      { color: '#333', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  toggleTxtActive:{ color: '#00e5ff' },
});
