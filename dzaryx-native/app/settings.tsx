import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchFleetStats, triggerSchedulerJob, backfillClientIntelligence, clearBiCache, fetchSchedulerJobs, fetchValidations, decideValidation, BACKEND_URL as API_BACKEND_URL, type SchedulerJob, type Validation } from '../lib/api';

const MONO       = Platform.OS === 'ios' ? 'Courier New' : 'monospace';
const BACKEND_URL = API_BACKEND_URL;
const APP_VERSION = '1.2.0 (build 3)';

type ConnStatus = 'checking' | 'online' | 'offline';

interface FleetStats {
  total:     number;
  available: number;
  active:    number;
  revenue:   string | null;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { displayName, actorId, businessName, mobileToken, reset } = useStore();
  const MOBILE_TOKEN = mobileToken();

  const [status,     setStatus]     = useState<ConnStatus>('checking');
  const [fleet,      setFleet]      = useState<FleetStats | null>(null);
  const [fleetLoad,  setFleetLoad]  = useState(false);
  const [schedStatus,  setSchedStatus]  = useState<string | null>(null);
  const [jobs,         setJobs]         = useState<SchedulerJob[] | null>(null);
  const [jobsLoading,  setJobsLoading]  = useState(false);
  const [showJobs,     setShowJobs]     = useState(false);
  const [validations,  setValidations]  = useState<Validation[]>([]);
  const [validLoad,    setValidLoad]    = useState(false);
  const [showValids,   setShowValids]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) })
      .then(r => { if (!cancelled) setStatus(r.ok ? 'online' : 'offline'); })
      .catch(() => { if (!cancelled) setStatus('offline'); });
    return () => { cancelled = true; };
  }, []);

  const loadFleetStats = useCallback(async () => {
    if (!MOBILE_TOKEN || fleetLoad) return;
    setFleetLoad(true);
    try {
      const data = await fetchFleetStats(MOBILE_TOKEN);
      if (!data) return;
      const revenue30 = (data.stats ?? []).reduce((s, c) => s + (c.revenue_30d ?? 0), 0);
      setFleet({
        total:     data.total_cars ?? 0,
        available: data.available_now_count ?? 0,
        active:    (data.total_cars ?? 0) - (data.available_now_count ?? 0),
        revenue:   revenue30 > 0 ? Math.round(revenue30).toString() : null,
      });
    } catch { /* ignore */ }
    finally { setFleetLoad(false); }
  }, [MOBILE_TOKEN, fleetLoad]);

  const triggerJob = useCallback(async (jobName: string) => {
    if (!MOBILE_TOKEN) return;
    setSchedStatus('Envoi...');
    const ok = await triggerSchedulerJob(jobName, MOBILE_TOKEN);
    setSchedStatus(ok ? '✅ Déclenché !' : '❌ Erreur');
    setTimeout(() => setSchedStatus(null), 3000);
  }, [MOBILE_TOKEN]);

  const handleBackfill = useCallback(async () => {
    if (!MOBILE_TOKEN) return;
    setSchedStatus('Backfill en cours...');
    const result = await backfillClientIntelligence(MOBILE_TOKEN);
    setSchedStatus(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
    setTimeout(() => setSchedStatus(null), 5000);
  }, [MOBILE_TOKEN]);

  const handleClearCache = useCallback(async () => {
    if (!MOBILE_TOKEN) return;
    setSchedStatus('Vidage cache...');
    const result = await clearBiCache(MOBILE_TOKEN);
    setSchedStatus(result.ok ? `✅ ${result.message}` : `❌ ${result.message}`);
    setTimeout(() => setSchedStatus(null), 3000);
  }, [MOBILE_TOKEN]);

  const handleBiReport = useCallback(async () => {
    if (!MOBILE_TOKEN) return;
    setSchedStatus('Génération rapport BI...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/bi/full`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) { setSchedStatus('❌ Erreur rapport BI'); return; }
      const data = await res.json() as { summary?: string; revenue_summary?: { month_revenue?: number; kouider_profit_month?: number } };
      const rev  = data.revenue_summary?.month_revenue ?? 0;
      const prof = data.revenue_summary?.kouider_profit_month ?? 0;
      setSchedStatus(`✅ CA mois: ${Math.round(rev)}€ · Profit: ${Math.round(prof)}€`);
    } catch { setSchedStatus('❌ Timeout rapport BI'); }
    setTimeout(() => setSchedStatus(null), 6000);
  }, [MOBILE_TOKEN]);

  const handleShowJobs = useCallback(async () => {
    if (showJobs) { setShowJobs(false); return; }
    setShowJobs(true);
    if (jobs !== null) return;
    setJobsLoading(true);
    const data = await fetchSchedulerJobs(MOBILE_TOKEN);
    setJobs(data.sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity)));
    setJobsLoading(false);
  }, [showJobs, jobs, MOBILE_TOKEN]);

  const handleShowValidations = useCallback(async () => {
    if (showValids) { setShowValids(false); return; }
    setShowValids(true);
    setValidLoad(true);
    const data = await fetchValidations(MOBILE_TOKEN);
    setValidations(data);
    setValidLoad(false);
  }, [showValids, MOBILE_TOKEN]);

  const handleDecide = useCallback(async (id: string, decision: 'approved' | 'rejected') => {
    const ok = await decideValidation(id, decision, undefined, MOBILE_TOKEN);
    if (ok) setValidations(prev => prev.filter(v => v.id !== id));
    else Alert.alert('Erreur', 'Décision échouée.');
  }, [MOBILE_TOKEN]);

  const handleUnpaid = useCallback(async () => {
    if (!MOBILE_TOKEN) return;
    setSchedStatus('Chargement impayés...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/finance/unpaid`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) { setSchedStatus('❌ Erreur'); return; }
      const data = await res.json() as { text?: string };
      setSchedStatus(null);
      Alert.alert('IMPAYÉS', data.text ?? 'Aucune donnée', [{ text: 'OK' }]);
    } catch { setSchedStatus('❌ Erreur impayés'); setTimeout(() => setSchedStatus(null), 3000); }
  }, [MOBILE_TOKEN]);

  function handleLogout() {
    Alert.alert(
      'Déconnexion',
      'Tu vas être redirigé vers le choix du profil.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Déconnexion', style: 'destructive', onPress: () => { reset(); router.replace('/auth/login'); } },
      ],
    );
  }

  const statusColor = status === 'online' ? '#00ff88' : status === 'offline' ? '#ff4444' : '#ffaa00';
  const statusLabel = status === 'online' ? 'EN LIGNE' : status === 'offline' ? 'HORS LIGNE' : 'VÉRIFICATION...';

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>PARAMÈTRES</Text>
      </View>

      {/* Actor info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PROFIL ACTIF</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: actorId === 'kouider' ? '#00e5ff' : '#7c3aed' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{(actorId ?? 'INCONNU').toUpperCase()}</Text>
            <Text style={styles.rowSub}>{displayName ?? businessName ?? 'Fik Conciergerie Oran'}</Text>
          </View>
        </View>
      </View>

      {/* Backend status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CONNEXION BACKEND</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: statusColor }]}>{statusLabel}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{BACKEND_URL}</Text>
          </View>
        </View>
      </View>

      {/* Fleet stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PARC VÉHICULES</Text>
        {fleet ? (
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{fleet.total}</Text>
              <Text style={styles.statLbl}>TOTAL</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: '#00ff88' }]}>{fleet.available}</Text>
              <Text style={styles.statLbl}>DISPO</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: '#ffaa00' }]}>{fleet.active}</Text>
              <Text style={styles.statLbl}>EN LOC</Text>
            </View>
            {fleet.revenue != null && (
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: '#00e5ff', fontSize: 14 }]}>{fleet.revenue}€</Text>
                <Text style={styles.statLbl}>CE MOIS</Text>
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.row} onPress={loadFleetStats}>
            <Text style={styles.rowTitle}>{fleetLoad ? 'CHARGEMENT...' : 'APPUIE POUR CHARGER'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Quick triggers (admin only) */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DÉCLENCHEURS RAPIDES</Text>
          {schedStatus && (
            <Text style={styles.schedStatus}>{schedStatus}</Text>
          )}
          {[
            { icon: '☀️', label: 'BRIEFING MATIN',         job: 'morning-briefing' },
            { icon: '📊', label: 'RAPPORT BI COMPLET',      job: 'bi-daily' },
            { icon: '💳', label: 'VÉRIF IMPAYÉS',           job: 'unpaid-reminder' },
            { icon: '🚗', label: 'RAPPORT PARC',            job: 'vehicle-utilization' },
            { icon: '📱', label: 'IDÉES TIKTOK',            job: 'tiktok-suggestion' },
            { icon: '🔔', label: 'RAPPELS J-1 WA',          job: 'wa-24h-reminders' },
            { icon: '🏁', label: 'RAPPELS RETOURS WA',      job: 'wa-return-reminders' },
            { icon: '🔍', label: 'DÉTECTION ANOMALIES',     job: 'check-anomalies' },
            { icon: '📅', label: 'RAPPORT HEBDO',           job: 'weekly-report' },
            { icon: '🏆', label: 'RELANCE CLIENTS',         job: 'client-relance' },
          ].map(({ icon, label, job }) => (
            <TouchableOpacity key={job} style={styles.triggerBtn} onPress={() => triggerJob(job)}>
              <Text style={styles.triggerTxt}>{icon} {label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.triggerBtn} onPress={handleBiReport}>
            <Text style={styles.triggerTxt}>📈 RAPPORT BI IMMÉDIAT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleUnpaid}>
            <Text style={styles.triggerTxt}>💳 LISTE IMPAYÉS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleBackfill}>
            <Text style={styles.triggerTxt}>🧠 BACKFILL INTELLIGENCE CLIENTS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleClearCache}>
            <Text style={styles.triggerTxt}>🗑 VIDER CACHE BI</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scheduler jobs */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROCHAINS JOBS SCHEDULER</Text>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleShowJobs}>
            <Text style={styles.triggerTxt}>{showJobs ? '▲ MASQUER' : '📅 VOIR PROCHAINS JOBS'}</Text>
          </TouchableOpacity>
          {showJobs && (
            <View style={{ marginTop: 8 }}>
              {jobsLoading && <Text style={styles.schedStatus}>Chargement...</Text>}
              {!jobsLoading && jobs?.map((j, i) => {
                const nextDate = j.next ? new Date(j.next).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                return (
                  <View key={i} style={styles.jobRow}>
                    <Text style={styles.jobName}>{j.name}</Text>
                    <Text style={styles.jobNext}>{nextDate}</Text>
                  </View>
                );
              })}
              {!jobsLoading && jobs?.length === 0 && <Text style={styles.schedStatus}>Aucun job trouvé</Text>}
            </View>
          )}
        </View>
      )}

      {/* Validations */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VALIDATIONS EN ATTENTE</Text>
          <TouchableOpacity style={[styles.triggerBtn, validations.length > 0 && { borderColor: '#ff444444' }]} onPress={handleShowValidations}>
            <Text style={[styles.triggerTxt, validations.length > 0 && { color: '#ff4444' }]}>
              {showValids ? '▲ MASQUER' : `⚡ VALIDATIONS${validations.length > 0 ? ` (${validations.length})` : ''}`}
            </Text>
          </TouchableOpacity>
          {showValids && (
            <View style={{ marginTop: 8 }}>
              {validLoad && <Text style={styles.schedStatus}>Chargement...</Text>}
              {!validLoad && validations.length === 0 && <Text style={styles.schedStatus}>✅ Aucune validation en attente</Text>}
              {!validLoad && validations.map(v => (
                <View key={v.id} style={styles.validCard}>
                  <Text style={styles.validType}>{v.type.toUpperCase()}</Text>
                  <Text style={styles.validCtx}>{JSON.stringify(v.context).slice(0, 120)}...</Text>
                  <View style={styles.validActions}>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleDecide(v.id, 'approved')}>
                      <Text style={styles.approveTxt}>✓ APPROUVER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectValidBtn} onPress={() => handleDecide(v.id, 'rejected')}>
                      <Text style={styles.rejectValidTxt}>✕ REFUSER</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Version */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>VERSION</Text>
        <View style={styles.row}>
          <Text style={styles.rowTitle}>DZARYX {APP_VERSION}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowSub}>Fik Conciergerie Oran · IA Conciergerie</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIONS</Text>
        <TouchableOpacity style={styles.bookingsBtn} onPress={() => router.push('/bookings')}>
          <Text style={styles.bookingsTxt}>📋 RÉSERVATIONS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fleetBtn} onPress={() => router.push('/fleet')}>
          <Text style={styles.fleetTxt}>🚗 PARC VÉHICULES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.revenueBtn} onPress={() => router.push('/revenue')}>
          <Text style={styles.revenueTxt}>💰 REVENUS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.remindersBtn} onPress={() => router.push('/reminders')}>
          <Text style={styles.remindersTxt}>🔔 RAPPELS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clientsBtn} onPress={() => router.push('/clients')}>
          <Text style={styles.clientsTxt}>👥 CLIENTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/auth/login')}>
          <Text style={styles.switchTxt}>CHANGER DE PROFIL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutTxt}>RÉINITIALISER L'APP</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 60 },

  header:  { flexDirection: 'row', alignItems: 'center', marginBottom: 40, gap: 16 },
  backBtn: { paddingVertical: 8 },
  backTxt: { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:   { color: '#ffffff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },

  section:      { marginBottom: 32 },
  sectionTitle: { color: '#2a2a2a', fontSize: 9, fontFamily: MONO, letterSpacing: 4, marginBottom: 12 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 6,
  },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  rowTitle:{ color: '#ffffff', fontSize: 12, fontFamily: MONO, letterSpacing: 3, fontWeight: '700' },
  rowSub:  { color: '#333', fontSize: 10, fontFamily: MONO, letterSpacing: 1, marginTop: 2 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  statBox: {
    flex: 1, minWidth: '22%',
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  statNum: { color: '#ffffff', fontSize: 20, fontFamily: MONO, fontWeight: '700' },
  statLbl: { color: '#333', fontSize: 8, fontFamily: MONO, letterSpacing: 3, marginTop: 4 },

  triggerBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff22',
    borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 8,
  },
  triggerTxt: { color: '#00e5ff99', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },

  schedStatus: {
    color: '#00ff88', fontSize: 11, fontFamily: MONO, letterSpacing: 2,
    textAlign: 'center', marginBottom: 12,
  },

  bookingsBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#00ff8844',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  bookingsTxt: { color: '#00ff88', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  fleetBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff44',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  fleetTxt: { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  revenueBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#ffaa0044',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  revenueTxt: { color: '#ffaa00', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  remindersBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#ff444433',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  remindersTxt: { color: '#ff4444', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  clientsBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#ffd70033',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  clientsTxt: { color: '#ffd700', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  switchBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#00e5ff44',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  switchTxt: { color: '#00e5ff', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  logoutBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#ff444422',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center',
  },
  logoutTxt: { color: '#ff4444', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

  jobRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0d0d0d' },
  jobName: { flex: 1, color: '#555', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },
  jobNext: { color: '#00e5ff66', fontSize: 9, fontFamily: MONO, letterSpacing: 1 },

  validCard: { backgroundColor: '#050505', borderWidth: 1, borderColor: '#ff444422', borderRadius: 10, padding: 12, marginBottom: 8 },
  validType: { color: '#ff4444', fontSize: 9, fontFamily: MONO, letterSpacing: 3, marginBottom: 4 },
  validCtx:  { color: '#444', fontSize: 8, fontFamily: MONO, lineHeight: 13, marginBottom: 10 },
  validActions: { flexDirection: 'row', gap: 8 },
  approveBtn:     { flex: 1, backgroundColor: '#00ff8811', borderWidth: 1, borderColor: '#00ff8844', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  approveTxt:     { color: '#00ff88', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
  rejectValidBtn: { flex: 1, backgroundColor: '#ff444411', borderWidth: 1, borderColor: '#ff444433', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  rejectValidTxt: { color: '#ff4444', fontSize: 8, fontFamily: MONO, letterSpacing: 2 },
});
