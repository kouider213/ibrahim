import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  Alert, TextInput, KeyboardAvoidingView, ActivityIndicator, Linking, Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';
import {
  fetchBookingById, updateBookingField, deleteBooking, fetchCars,
  type Booking, type Car,
} from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    '#00e5ff',
  CONFIRMED: '#00ff88',
  PENDING:   '#ffaa00',
  COMPLETED: '#555555',
  REJECTED:  '#ff4444',
};

const PAY_COLOR: Record<string, string> = {
  PAID:    '#00ff88',
  PARTIAL: '#ffaa00',
  UNPAID:  '#ff4444',
};

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return d; }
}

function nbDays(start: string, end: string): number {
  try { return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)); }
  catch { return 1; }
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [booking,  setBooking]  = useState<Booking | null>(null);
  const [cars,     setCars]     = useState<Car[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  // Edit state
  const [editStatus,    setEditStatus]    = useState('');
  const [editPay,       setEditPay]       = useState('');
  const [editNotes,     setEditNotes]     = useState('');
  const [editPrice,     setEditPrice]     = useState('');
  const [editOwnerPP,   setEditOwnerPP]   = useState('');
  const [editClientPP,  setEditClientPP]  = useState('');
  const [editPaidAmount,setEditPaidAmount]= useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [b, c] = await Promise.all([fetchBookingById(id, TOKEN), fetchCars(TOKEN)]);
    if (b) {
      setBooking(b);
      setEditStatus(b.status);
      setEditPay(b.payment_status ?? 'UNPAID');
      setEditNotes(b.notes ?? '');
      setEditPrice(b.final_price != null ? String(b.final_price) : '');
      setEditOwnerPP(b.owner_price_per_day != null ? String(b.owner_price_per_day) : '');
      setEditClientPP(b.client_price_per_day != null ? String(b.client_price_per_day) : '');
      setEditPaidAmount(b.paid_amount != null ? String(b.paid_amount) : '');
    }
    setCars(c);
    setLoading(false);
  }, [id, TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const saveEdits = useCallback(async () => {
    if (!booking) return;
    setSaving(true);
    const days = nbDays(booking.start_date, booking.end_date);
    const clientPP = editClientPP ? Number(editClientPP) : null;
    const ownerPP  = editOwnerPP  ? Number(editOwnerPP)  : null;
    const profit   = clientPP != null && ownerPP != null ? (clientPP - ownerPP) * days : null;

    const updates: Record<string, unknown> = {
      status:               editStatus,
      payment_status:       editPay,
      notes:                editNotes.trim() || null,
      final_price:          editPrice ? Number(editPrice) : booking.final_price,
      client_price_per_day: clientPP,
      owner_price_per_day:  ownerPP,
      profit_kouider:       profit,
    };

    if (editPaidAmount) {
      updates['paid_amount'] = Number(editPaidAmount);
    } else if (editPay === 'PAID' && !booking.paid_amount) {
      updates['paid_amount'] = updates['final_price'];
    }

    const ok = await updateBookingField(booking.id, updates, TOKEN);
    setSaving(false);
    if (ok) {
      setEditing(false);
      await load();
      Alert.alert('Mis à jour', 'Réservation sauvegardée.');
    } else {
      Alert.alert('Erreur', 'Mise à jour échouée.');
    }
  }, [booking, editStatus, editPay, editNotes, editPrice, editOwnerPP, editClientPP, editPaidAmount, TOKEN, load]);

  const handleShare = useCallback(async () => {
    if (!booking) return;
    const car   = booking.cars?.name ?? '?';
    const days  = nbDays(booking.start_date, booking.end_date);
    const text  = [
      `📋 Réservation Fik Conciergerie Oran`,
      `Client : ${booking.client_name}`,
      booking.client_phone ? `Tél    : ${booking.client_phone}` : null,
      `Voiture: ${car}`,
      `Du     : ${fmtDate(booking.start_date)}`,
      `Au     : ${fmtDate(booking.end_date)} (${days}j)`,
      `Prix   : ${booking.final_price != null ? `${booking.final_price}€` : 'Non défini'}`,
      `Statut : ${booking.status}`,
      `Paiement: ${booking.payment_status ?? 'UNPAID'}`,
      booking.notes ? `Notes  : ${booking.notes}` : null,
    ].filter(Boolean).join('\n');
    await Share.share({ message: text, title: `Résa ${booking.client_name}` });
  }, [booking]);

  const handleDelete = useCallback(() => {
    if (!booking) return;
    Alert.alert(
      'Supprimer la réservation',
      `${booking.client_name} — ${fmtDate(booking.start_date)} → ${fmtDate(booking.end_date)}\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'SUPPRIMER', style: 'destructive',
          onPress: async () => {
            const ok = await deleteBooking(booking.id, TOKEN);
            if (ok) { router.replace('/bookings'); }
            else Alert.alert('Erreur', 'Suppression échouée.');
          },
        },
      ],
    );
  }, [booking, TOKEN, router]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#00e5ff" />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyTxt}>RÉSERVATION INTROUVABLE</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[booking.status] ?? '#555';
  const payColor    = PAY_COLOR[booking.payment_status ?? 'UNPAID'] ?? '#ff4444';
  const days        = nbDays(booking.start_date, booking.end_date);
  const car         = booking.cars;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>RÉSERVATION</Text>
        <Text style={styles.idTxt}>#{booking.id.slice(-6).toUpperCase()}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Status + client */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.clientName}>{booking.client_name.toUpperCase()}</Text>
            <Text style={[styles.statusBadge, { color: statusColor }]}>{booking.status}</Text>
          </View>
          {car && <Text style={styles.carName}>{car.name}</Text>}

          <Row label="DATES"    value={`${fmtDate(booking.start_date)} → ${fmtDate(booking.end_date)} (${days}j)`} />
          {booking.client_phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${booking.client_phone}`)}>
              <Row label="TÉLÉPHONE" value={`📞 ${booking.client_phone}`} color="#00e5ff" />
            </TouchableOpacity>
          )}
          {booking.client_email && <Row label="EMAIL"    value={booking.client_email} />}
          {booking.client_age   && <Row label="ÂGE"      value={`${booking.client_age} ans`} />}
          {booking.rented_by    && <Row label="LOUÉ PAR" value={booking.rented_by} />}
        </View>

        {/* Financial */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>FINANCIER</Text>
          <Row label="TOTAL CLIENT"  value={booking.final_price != null ? `${booking.final_price}€` : '—'} />
          <Row label="PRIX/JOUR CLIENT" value={booking.client_price_per_day != null ? `${booking.client_price_per_day}€/j` : '—'} />
          <Row label="PRIX/JOUR PROPRIO" value={booking.owner_price_per_day != null ? `${booking.owner_price_per_day}€/j` : '⚠️ MANQUANT'} color={booking.owner_price_per_day == null ? '#ffaa00' : undefined} />
          <Row label="PROFIT KOUIDER" value={booking.profit_kouider != null ? `${booking.profit_kouider}€` : '—'} color={booking.profit_kouider != null ? (booking.profit_kouider >= 0 ? '#00ff88' : '#ff4444') : undefined} />
          <Row label="PAIEMENT"     value={booking.payment_status ?? 'UNPAID'} color={payColor} />
          {booking.paid_amount != null && <Row label="PAYÉ"       value={`${booking.paid_amount}€`} color="#00ff88" />}
        </View>

        {/* Notes */}
        {booking.notes ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={styles.notesTxt}>{booking.notes}</Text>
          </View>
        ) : null}

        {/* Edit panel */}
        {editing ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>MODIFIER</Text>

            <Text style={styles.fieldLabel}>STATUT</Text>
            <View style={styles.pillRow}>
              {(['PENDING','CONFIRMED','ACTIVE','COMPLETED','REJECTED'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.pill, editStatus === s && { borderColor: STATUS_COLOR[s], backgroundColor: `${STATUS_COLOR[s]}22` }]}
                  onPress={() => setEditStatus(s)}
                >
                  <Text style={[styles.pillTxt, editStatus === s && { color: STATUS_COLOR[s] }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>PAIEMENT</Text>
            <View style={styles.pillRow}>
              {(['UNPAID','PARTIAL','PAID'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pill, editPay === p && { borderColor: PAY_COLOR[p], backgroundColor: `${PAY_COLOR[p]}22` }]}
                  onPress={() => setEditPay(p)}
                >
                  <Text style={[styles.pillTxt, editPay === p && { color: PAY_COLOR[p] }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(editPay === 'PARTIAL' || editPay === 'PAID') && (
              <>
                <Text style={styles.fieldLabel}>MONTANT PAYÉ (€)</Text>
                <TextInput style={styles.input} value={editPaidAmount} onChangeText={setEditPaidAmount} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 200" />
              </>
            )}

            <Text style={styles.fieldLabel}>TOTAL CLIENT (€)</Text>
            <TextInput style={styles.input} value={editPrice} onChangeText={setEditPrice} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 450" />

            <Text style={styles.fieldLabel}>PRIX/JOUR CLIENT (€)</Text>
            <TextInput style={styles.input} value={editClientPP} onChangeText={setEditClientPP} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 90" />

            <Text style={styles.fieldLabel}>PRIX/JOUR PROPRIO (€)</Text>
            <TextInput style={styles.input} value={editOwnerPP} onChangeText={setEditOwnerPP} keyboardType="numeric" placeholderTextColor="#333" placeholder="ex: 60" />

            {editClientPP && editOwnerPP && (
              <Text style={styles.profitPreview}>
                Profit estimé : {((Number(editClientPP) - Number(editOwnerPP)) * days).toFixed(0)}€
              </Text>
            )}

            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
              numberOfLines={3}
              placeholderTextColor="#333"
              placeholder="Notes optionnelles..."
            />

            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelTxt}>ANNULER</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEdits} disabled={saving}>
                <Text style={styles.saveTxt}>{saving ? '...' : 'SAUVEGARDER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionsCard}>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editTxt}>✏️ MODIFIER</Text>
            </TouchableOpacity>
            {booking.client_phone && (
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${booking.client_phone}`)}>
                <Text style={styles.callTxt}>📞</Text>
              </TouchableOpacity>
            )}
            {booking.client_phone && (
              <TouchableOpacity style={styles.waBtn} onPress={() => {
                const phone = booking.client_phone!.replace(/\s/g, '').replace(/^0+/, '213');
                Linking.openURL(`https://wa.me/${phone}`);
              }}>
                <Text style={styles.waTxt}>💬 WA</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareTxt}>📤</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteTxt}>🗑</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:    { paddingVertical: 8 },
  backTxt:    { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:      { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  idTxt:      { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot:         { width: 8, height: 8, borderRadius: 4 },
  clientName:  { flex: 1, color: '#fff', fontSize: 14, fontFamily: MONO, fontWeight: '700', letterSpacing: 2 },
  statusBadge: { fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  carName:     { color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 2, marginBottom: 12 },

  sectionTitle: { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  infoLabel: { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  infoValue: { color: '#fff', fontSize: 10, fontFamily: MONO, letterSpacing: 1, textAlign: 'right', flex: 1, marginLeft: 12 },

  notesTxt: { color: '#666', fontSize: 11, fontFamily: MONO, lineHeight: 18 },
  emptyTxt: { color: '#222', fontSize: 11, fontFamily: MONO, letterSpacing: 3 },

  fieldLabel:   { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 13, fontFamily: MONO,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  pillTxt: { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 1 },

  profitPreview: { color: '#00ff88', fontSize: 11, fontFamily: MONO, letterSpacing: 2, marginVertical: 8, textAlign: 'center' },

  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cancelTxt: { color: '#555', fontSize: 10, fontFamily: MONO, letterSpacing: 2 },
  saveBtn:   { flex: 2, backgroundColor: '#00e5ff22', borderWidth: 1, borderColor: '#00e5ff44', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveTxt:   { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  actionsCard:  { flexDirection: 'row', gap: 8, marginBottom: 24 },
  editBtn:  { flex: 2, backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff33', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  editTxt:  { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 2 },
  callBtn:  { flex: 1, backgroundColor: '#00ff8811', borderWidth: 1, borderColor: '#00ff8833', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  callTxt:  { color: '#00ff88', fontSize: 10, fontFamily: MONO, letterSpacing: 2 },
  waBtn:    { flex: 1, backgroundColor: '#25d36611', borderWidth: 1, borderColor: '#25d36633', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  waTxt:    { color: '#25d366', fontSize: 10, fontFamily: MONO, letterSpacing: 1 },
  shareBtn: { flex: 1, backgroundColor: '#ffffff11', borderWidth: 1, borderColor: '#ffffff22', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  shareTxt: { color: '#ffffff99', fontSize: 10, fontFamily: MONO },
  deleteBtn:{ flex: 1, backgroundColor: '#ff444411', borderWidth: 1, borderColor: '#ff444433', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  deleteTxt:{ color: '#ff4444', fontSize: 10, fontFamily: MONO, letterSpacing: 2 },
});
