import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Alert, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchFleetStats, triggerSchedulerJob, backfillClientIntelligence, clearBiCache, fetchSchedulerJobs, fetchValidations, decideValidation, BACKEND_URL as API_BACKEND_URL, type SchedulerJob, type Validation } from '../lib/api';

interface AiHealth {
  providers: Record<string, { available: boolean; calls_today: number; emoji: string }>;
  active_fallback: string | null;
  claude_failures_today: number;
  survival_status: string;
}

interface FinanceSummary {
  period:          string;
  totalBookings:   number;
  grossCA:         number;
  kouiderProfit:   number;
  encaisse:        number;
  aEncaisser:      number;
  missingOwnerPrice: number;
}

interface SystemHealth {
  redis:    { ok: boolean; ping_ms: number };
  supabase: { ok: boolean; ping_ms: number };
  process:  { uptime_s: number; memory_mb: number };
  claude:   { calls_today: number; tokens_in_today: number; tokens_out_today: number };
}

interface NexusStatus {
  connected: boolean;
  state:     string;
  last_seen: string | null;
  uptime_s:  number | null;
  mac:       string | null;
  ip:        string | null;
}

interface NexusSysinfo {
  cpu_percent?: number;
  ram_percent?: number;
  ram_total_mb?: number;
  ram_used_mb?: number;
  uptime_s?: number;
  hostname?: string;
}

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
  const [aiHealth,     setAiHealth]     = useState<AiHealth | null>(null);
  const [aiHealthLoad, setAiHealthLoad] = useState(false);
  const [showAiHealth, setShowAiHealth] = useState(false);
  const [sysHealth,    setSysHealth]    = useState<SystemHealth | null>(null);
  const [sysHealthLoad,setSysHealthLoad]= useState(false);
  const [showSysHealth,setShowSysHealth]= useState(false);
  const [nexusStatus,   setNexusStatus]   = useState<NexusStatus | null>(null);
  const [nexusSysinfo,  setNexusSysinfo]  = useState<NexusSysinfo | null>(null);
  const [nexusLoad,     setNexusLoad]     = useState(false);
  const [showNexus,     setShowNexus]     = useState(false);
  const [nexusMsg,      setNexusMsg]      = useState<string | null>(null);
  const [finYear,      setFinYear]      = useState(() => String(new Date().getFullYear()));
  const [finMonth,     setFinMonth]     = useState(() => String(new Date().getMonth() + 1));
  const [finData,      setFinData]      = useState<FinanceSummary | null>(null);
  const [finLoading,   setFinLoading]   = useState(false);

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

  const handleFinanceReport = useCallback(async () => {
    const y = Number(finYear);
    const m = Number(finMonth);
    if (isNaN(y) || y < 2020 || y > 2030) { Alert.alert('Année invalide'); return; }
    if (isNaN(m) || m < 1 || m > 12)      { Alert.alert('Mois invalide (1-12)'); return; }
    setFinLoading(true);
    setFinData(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/finance/report?year=${y}&month=${m}`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json() as FinanceSummary & { error?: string };
      if (!res.ok) { Alert.alert('Erreur', data.error ?? 'Rapport échoué'); }
      else setFinData(data);
    } catch { Alert.alert('Erreur', 'Timeout rapport finance'); }
    setFinLoading(false);
  }, [finYear, finMonth, MOBILE_TOKEN]);

  const handleShowSysHealth = useCallback(async () => {
    if (showSysHealth) { setShowSysHealth(false); return; }
    setShowSysHealth(true);
    if (sysHealth !== null) return;
    setSysHealthLoad(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/bi/health`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) setSysHealth(await res.json() as SystemHealth);
    } catch { /* ignore */ }
    setSysHealthLoad(false);
  }, [showSysHealth, sysHealth, MOBILE_TOKEN]);

  const handleShowAiHealth = useCallback(async () => {
    if (showAiHealth) { setShowAiHealth(false); return; }
    setShowAiHealth(true);
    if (aiHealth !== null) return;
    setAiHealthLoad(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/health-ai`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) setAiHealth(await res.json() as AiHealth);
    } catch { /* ignore */ }
    setAiHealthLoad(false);
  }, [showAiHealth, aiHealth, MOBILE_TOKEN]);

  const handleShowNexus = useCallback(async () => {
    if (showNexus) { setShowNexus(false); return; }
    setShowNexus(true);
    setNexusLoad(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/nexus/status`, {
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) setNexusStatus(await r.json() as NexusStatus);
    } catch { /* ignore */ }
    setNexusLoad(false);
  }, [showNexus, MOBILE_TOKEN]);

  const handleNexusSysinfo = useCallback(async () => {
    setNexusMsg('Récupération infos système...');
    try {
      const r = await fetch(`${BACKEND_URL}/api/nexus/sysinfo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const d = await r.json() as NexusSysinfo & { ok?: boolean };
        setNexusSysinfo(d);
        setNexusMsg(null);
      } else {
        setNexusMsg('❌ Nexus hors ligne');
        setTimeout(() => setNexusMsg(null), 3000);
      }
    } catch { setNexusMsg('❌ Timeout'); setTimeout(() => setNexusMsg(null), 3000); }
  }, [MOBILE_TOKEN]);

  const handleNexusScreenshot = useCallback(async () => {
    setNexusMsg('Capture d\'écran en cours...');
    try {
      const r = await fetch(`${BACKEND_URL}/api/nexus/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MOBILE_TOKEN}` },
        body: JSON.stringify({ caption: 'Screenshot depuis app mobile' }),
        signal: AbortSignal.timeout(40000),
      });
      const d = await r.json() as { ok?: boolean; error?: string; size_kb?: number };
      setNexusMsg(d.ok ? `✅ Envoyé sur Telegram (${d.size_kb ?? '?'}KB)` : `❌ ${d.error ?? 'Erreur'}`);
    } catch { setNexusMsg('❌ Timeout screenshot'); }
    setTimeout(() => setNexusMsg(null), 5000);
  }, [MOBILE_TOKEN]);

  const handleNexusWake = useCallback(async () => {
    setNexusMsg('Démarrage Nexus...');
    try {
      const r = await fetch(`${BACKEND_URL}/api/nexus/wake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      });
      const d = await r.json() as { ok?: boolean; message?: string; error?: string };
      setNexusMsg(d.ok ? `✅ ${d.message ?? 'Nexus démarré'}` : `❌ ${d.error ?? 'Erreur'}`);
    } catch { setNexusMsg('❌ Launcher hors ligne'); }
    setTimeout(() => setNexusMsg(null), 5000);
  }, [MOBILE_TOKEN]);

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
          <TouchableOpacity style={styles.triggerBtn} onPress={async () => {
            if (!MOBILE_TOKEN) return;
            setSchedStatus('Sync calendrier...');
            try {
              const res = await fetch(`${BACKEND_URL}/api/calendar/sync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${MOBILE_TOKEN}` },
                signal: AbortSignal.timeout(15000),
              });
              const data = await res.json() as { synced?: number; message?: string; error?: string };
              setSchedStatus(res.ok ? `✅ ${data.message ?? `${data.synced} synchros`}` : `❌ ${data.error}`);
            } catch { setSchedStatus('❌ Timeout calendrier'); }
            setTimeout(() => setSchedStatus(null), 4000);
          }}>
            <Text style={styles.triggerTxt}>📅 SYNC GOOGLE CALENDRIER</Text>
          </TouchableOpacity>
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

      {/* Monthly Finance Report */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RAPPORT MENSUEL FINANCE</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TextInput
              style={[styles.row, { flex: 1, paddingVertical: 10, color: '#fff', fontFamily: MONO, fontSize: 11 }]}
              value={finYear}
              onChangeText={setFinYear}
              keyboardType="numeric"
              placeholder="2026"
              placeholderTextColor="#333"
              maxLength={4}
            />
            <TextInput
              style={[styles.row, { flex: 1, paddingVertical: 10, color: '#fff', fontFamily: MONO, fontSize: 11 }]}
              value={finMonth}
              onChangeText={setFinMonth}
              keyboardType="numeric"
              placeholder="5"
              placeholderTextColor="#333"
              maxLength={2}
            />
          </View>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleFinanceReport} disabled={finLoading}>
            <Text style={styles.triggerTxt}>{finLoading ? 'GÉNÉRATION...' : '📊 GÉNÉRER RAPPORT'}</Text>
          </TouchableOpacity>
          {finData && (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.schedStatus, { color: '#00e5ff' }]}>PÉRIODE: {finData.period} · {finData.totalBookings} RÉSA</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { fontSize: 14, color: '#00e5ff' }]}>{Math.round(finData.grossCA)}€</Text>
                  <Text style={styles.statLbl}>CA BRUT</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { fontSize: 14, color: '#00ff88' }]}>{Math.round(finData.kouiderProfit)}€</Text>
                  <Text style={styles.statLbl}>PROFIT K.</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { fontSize: 14, color: '#ffaa00' }]}>{Math.round(finData.encaisse)}€</Text>
                  <Text style={styles.statLbl}>ENCAISSÉ</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { fontSize: 14, color: finData.aEncaisser > 0 ? '#ff4444' : '#555' }]}>{Math.round(finData.aEncaisser)}€</Text>
                  <Text style={styles.statLbl}>À ENCAISSER</Text>
                </View>
              </View>
              {finData.missingOwnerPrice > 0 && (
                <Text style={[styles.schedStatus, { color: '#ffaa00' }]}>⚠️ {finData.missingOwnerPrice} résa sans prix propriétaire</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* AI Health */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SANTÉ IA</Text>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleShowAiHealth}>
            <Text style={styles.triggerTxt}>{showAiHealth ? '▲ MASQUER' : '🧠 ÉTAT FOURNISSEURS IA'}</Text>
          </TouchableOpacity>
          {showAiHealth && (
            <View style={{ marginTop: 8 }}>
              {aiHealthLoad && <Text style={styles.schedStatus}>Chargement...</Text>}
              {!aiHealthLoad && aiHealth && (
                <>
                  <Text style={styles.schedStatus}>{aiHealth.survival_status}</Text>
                  {aiHealth.active_fallback && (
                    <Text style={[styles.schedStatus, { color: '#ffaa00' }]}>⚡ Fallback actif: {aiHealth.active_fallback}</Text>
                  )}
                  {aiHealth.claude_failures_today > 0 && (
                    <Text style={[styles.schedStatus, { color: '#ff4444' }]}>⚠️ {aiHealth.claude_failures_today} erreurs Claude aujourd'hui</Text>
                  )}
                  {Object.entries(aiHealth.providers).map(([name, p]) => (
                    <View key={name} style={styles.jobRow}>
                      <Text style={styles.jobName}>{p.emoji} {name.toUpperCase()}</Text>
                      <Text style={[styles.jobNext, { color: p.available ? '#00ff88' : '#ff4444' }]}>
                        {p.calls_today} appels · {p.available ? 'EN LIGNE' : 'HORS LIGNE'}
                      </Text>
                    </View>
                  ))}
                </>
              )}
              {!aiHealthLoad && !aiHealth && <Text style={styles.schedStatus}>❌ Impossible de charger</Text>}
            </View>
          )}
        </View>
      )}

      {/* BI System Health */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SYSTÈME BACKEND</Text>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleShowSysHealth}>
            <Text style={styles.triggerTxt}>{showSysHealth ? '▲ MASQUER' : '🖥 ÉTAT SYSTÈME'}</Text>
          </TouchableOpacity>
          {showSysHealth && (
            <View style={{ marginTop: 8 }}>
              {sysHealthLoad && <Text style={styles.schedStatus}>Chargement...</Text>}
              {!sysHealthLoad && sysHealth && (
                <>
                  <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                      <Text style={[styles.statNum, { fontSize: 14, color: sysHealth.redis.ok ? '#00ff88' : '#ff4444' }]}>
                        {sysHealth.redis.ok ? 'OK' : 'KO'}
                      </Text>
                      <Text style={styles.statLbl}>REDIS</Text>
                      <Text style={[styles.statLbl, { color: '#555', marginTop: 2 }]}>{sysHealth.redis.ping_ms}ms</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={[styles.statNum, { fontSize: 14, color: sysHealth.supabase.ok ? '#00ff88' : '#ff4444' }]}>
                        {sysHealth.supabase.ok ? 'OK' : 'KO'}
                      </Text>
                      <Text style={styles.statLbl}>SUPABASE</Text>
                      <Text style={[styles.statLbl, { color: '#555', marginTop: 2 }]}>{sysHealth.supabase.ping_ms}ms</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={[styles.statNum, { fontSize: 14, color: '#00e5ff' }]}>
                        {Math.floor(sysHealth.process.uptime_s / 3600)}h
                      </Text>
                      <Text style={styles.statLbl}>UPTIME</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={[styles.statNum, { fontSize: 14, color: '#ffaa00' }]}>
                        {Math.round(sysHealth.process.memory_mb)}
                      </Text>
                      <Text style={styles.statLbl}>RAM MB</Text>
                    </View>
                  </View>
                  <View style={[styles.jobRow, { marginTop: 8 }]}>
                    <Text style={styles.jobName}>🧠 CLAUDE APPELS</Text>
                    <Text style={styles.jobNext}>{sysHealth.claude.calls_today} aujourd'hui</Text>
                  </View>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobName}>📥 TOKENS IN</Text>
                    <Text style={styles.jobNext}>{sysHealth.claude.tokens_in_today.toLocaleString('fr-FR')}</Text>
                  </View>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobName}>📤 TOKENS OUT</Text>
                    <Text style={styles.jobNext}>{sysHealth.claude.tokens_out_today.toLocaleString('fr-FR')}</Text>
                  </View>
                </>
              )}
              {!sysHealthLoad && !sysHealth && <Text style={styles.schedStatus}>❌ Impossible de charger</Text>}
            </View>
          )}
        </View>
      )}

      {/* Nexus PC Control */}
      {actorId === 'kouider' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NEXUS — PC KOUIDER</Text>
          <TouchableOpacity style={styles.triggerBtn} onPress={handleShowNexus}>
            <Text style={styles.triggerTxt}>{showNexus ? '▲ MASQUER' : '🖥 ÉTAT NEXUS'}</Text>
          </TouchableOpacity>
          {showNexus && (
            <View style={{ marginTop: 8 }}>
              {nexusLoad && <Text style={styles.schedStatus}>Chargement...</Text>}
              {nexusMsg && <Text style={styles.schedStatus}>{nexusMsg}</Text>}
              {nexusStatus && (
                <>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobName}>ÉTAT</Text>
                    <Text style={[styles.jobNext, { color: nexusStatus.connected ? '#00ff88' : '#ff4444' }]}>
                      {nexusStatus.connected ? '🟢 EN LIGNE' : '🔴 HORS LIGNE'} · {nexusStatus.state}
                    </Text>
                  </View>
                  {nexusStatus.ip && (
                    <View style={styles.jobRow}>
                      <Text style={styles.jobName}>IP PUBLIC</Text>
                      <Text style={styles.jobNext}>{nexusStatus.ip}</Text>
                    </View>
                  )}
                  {nexusSysinfo && (
                    <>
                      <View style={styles.jobRow}>
                        <Text style={styles.jobName}>CPU</Text>
                        <Text style={[styles.jobNext, { color: (nexusSysinfo.cpu_percent ?? 0) > 80 ? '#ff4444' : '#00e5ff66' }]}>
                          {nexusSysinfo.cpu_percent ?? '?'}%
                        </Text>
                      </View>
                      <View style={styles.jobRow}>
                        <Text style={styles.jobName}>RAM</Text>
                        <Text style={styles.jobNext}>{nexusSysinfo.ram_used_mb ?? '?'} / {nexusSysinfo.ram_total_mb ?? '?'} MB</Text>
                      </View>
                      {nexusSysinfo.hostname && (
                        <View style={styles.jobRow}>
                          <Text style={styles.jobName}>MACHINE</Text>
                          <Text style={styles.jobNext}>{nexusSysinfo.hostname}</Text>
                        </View>
                      )}
                    </>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    {nexusStatus.connected && (
                      <>
                        <TouchableOpacity style={[styles.triggerBtn, { flex: 1, marginBottom: 0 }]} onPress={handleNexusSysinfo}>
                          <Text style={styles.triggerTxt}>💻 SYSINFO</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.triggerBtn, { flex: 1, marginBottom: 0 }]} onPress={handleNexusScreenshot}>
                          <Text style={styles.triggerTxt}>📸 SCREENSHOT</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {!nexusStatus.connected && (
                      <TouchableOpacity style={[styles.triggerBtn, { flex: 1, marginBottom: 0, borderColor: '#ffaa0022' }]} onPress={handleNexusWake}>
                        <Text style={[styles.triggerTxt, { color: '#ffaa0099' }]}>⚡ DÉMARRER NEXUS</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
              {!nexusLoad && !nexusStatus && <Text style={styles.schedStatus}>❌ Impossible de charger</Text>}
            </View>
          )}
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
        <TouchableOpacity style={styles.tasksBtn} onPress={() => router.push('/tasks')}>
          <Text style={styles.tasksTxt}>⚙️ TÂCHES IA</Text>
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

  tasksBtn: {
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#7c3aed33',
    borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 10,
  },
  tasksTxt: { color: '#7c3aed', fontSize: 11, fontFamily: MONO, letterSpacing: 4, fontWeight: '700' },

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
