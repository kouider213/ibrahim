import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchClientIntelligence, type ClientIntelligence } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const SCORE_COLOR: Record<string, string> = {
  VIP:      '#ffd700',
  FREQUENT: '#00e5ff',
  REGULAR:  '#00ff88',
  NEW:      '#555555',
};

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return d; }
}

export default function ClientDetailScreen() {
  const router = useRouter();
  const { name, phone } = useLocalSearchParams<{ name: string; phone?: string }>();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [intel,   setIntel]   = useState<ClientIntelligence | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await fetchClientIntelligence(TOKEN);
    const match = all.find(c =>
      c.client_name.toLowerCase() === (name ?? '').toLowerCase() ||
      (phone && c.client_phone === phone),
    );
    setIntel(match ?? null);
    setLoading(false);
  }, [TOKEN, name, phone]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#00e5ff" />
      </View>
    );
  }

  const scoreColor = intel ? (SCORE_COLOR[intel.score] ?? '#555') : '#555';
  const clientPhone = intel?.client_phone ?? phone ?? null;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{(name ?? '?').toUpperCase()}</Text>
        {intel && (
          <View style={[styles.scoreBadge, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreTxt, { color: scoreColor }]}>{intel.score}</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Contact actions */}
        {clientPhone && (
          <View style={styles.actionsCard}>
            <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${clientPhone}`)}>
              <Text style={styles.callTxt}>📞 APPELER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.waBtn} onPress={() => {
              const p = clientPhone.replace(/\s/g, '').replace(/^0+/, '213');
              Linking.openURL(`https://wa.me/${p}`);
            }}>
              <Text style={styles.waTxt}>💬 WHATSAPP</Text>
            </TouchableOpacity>
          </View>
        )}

        {!intel ? (
          <View style={styles.noIntelCard}>
            <Text style={styles.noIntelTitle}>AUCUN PROFIL IA</Text>
            <Text style={styles.noIntelSub}>
              Ce client n'a pas encore de profil intelligence.{'\n'}
              Allez dans Paramètres → BACKFILL INTELLIGENCE CLIENTS.
            </Text>
          </View>
        ) : (
          <>
            {/* Stats */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>STATISTIQUES</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{intel.total_bookings}</Text>
                  <Text style={styles.statLbl}>RÉSA</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: '#00ff88', fontSize: 16 }]}>{fmt(intel.total_spent)}</Text>
                  <Text style={styles.statLbl}>TOTAL</Text>
                </View>
                {intel.typical_duration_days != null && (
                  <View style={styles.statBox}>
                    <Text style={[styles.statNum, { color: '#00e5ff' }]}>{intel.typical_duration_days}j</Text>
                    <Text style={styles.statLbl}>DURÉE MOY</Text>
                  </View>
                )}
                {intel.avg_discount_asked > 0 && (
                  <View style={styles.statBox}>
                    <Text style={[styles.statNum, { color: '#ffaa00', fontSize: 16 }]}>{Math.round(intel.avg_discount_asked)}€</Text>
                    <Text style={styles.statLbl}>REMISE MOY</Text>
                  </View>
                )}
              </View>
              <Row label="DERNIÈRE RÉSA" value={fmtDate(intel.last_booking_date)} />
            </View>

            {/* Intelligence */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>PROFIL INTELLIGENCE</Text>
              {intel.preferred_cars.length > 0 && (
                <Row label="VOITURES PRÉFÉRÉES" value={intel.preferred_cars.join(', ')} color="#00e5ff" />
              )}
              <Row label="STYLE NÉGOCIATION"   value={intel.negotiation_style}   color="#ffaa00" />
              <Row label="FIABILITÉ PAIEMENT"  value={intel.payment_reliability} color={
                intel.payment_reliability === 'excellent' ? '#00ff88' :
                intel.payment_reliability === 'bon'       ? '#00e5ff' :
                intel.payment_reliability === 'moyen'     ? '#ffaa00' : '#ff4444'
              } />
              {intel.notes && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesLabel}>NOTES AI</Text>
                  <Text style={styles.notesTxt}>{intel.notes}</Text>
                </View>
              )}
            </View>

            {/* Phone */}
            {clientPhone && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>CONTACT</Text>
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${clientPhone}`)}>
                  <Row label="TÉLÉPHONE" value={`📞 ${clientPhone}`} color="#00e5ff" />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:    { paddingVertical: 8 },
  backTxt:    { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:      { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },
  scoreBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  scoreTxt:   { fontSize: 8, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },

  actionsCard: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  callBtn: { flex: 1, backgroundColor: '#00e5ff11', borderWidth: 1, borderColor: '#00e5ff33', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  callTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },
  waBtn:   { flex: 1, backgroundColor: '#25d36611', borderWidth: 1, borderColor: '#25d36633', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  waTxt:   { color: '#25d366', fontSize: 10, fontFamily: MONO, letterSpacing: 2, fontWeight: '700' },

  card: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 16, marginBottom: 12,
  },
  sectionTitle: { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1, minWidth: '22%', backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  statNum: { color: '#fff', fontSize: 20, fontFamily: MONO, fontWeight: '700' },
  statLbl: { color: '#333', fontSize: 7, fontFamily: MONO, letterSpacing: 2, marginTop: 4 },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  infoLabel: { color: '#333', fontSize: 9, fontFamily: MONO, letterSpacing: 2 },
  infoValue: { color: '#fff', fontSize: 10, fontFamily: MONO, letterSpacing: 1, textAlign: 'right', flex: 1, marginLeft: 12 },

  notesBox:   { marginTop: 12, backgroundColor: '#0a0a0a', borderRadius: 8, padding: 10 },
  notesLabel: { color: '#2a2a2a', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginBottom: 6 },
  notesTxt:   { color: '#666', fontSize: 10, fontFamily: MONO, lineHeight: 16 },

  noIntelCard: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 12, padding: 24, alignItems: 'center', marginTop: 20,
  },
  noIntelTitle: { color: '#444', fontSize: 12, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },
  noIntelSub:   { color: '#2a2a2a', fontSize: 10, fontFamily: MONO, letterSpacing: 1, lineHeight: 18, textAlign: 'center' },
});
