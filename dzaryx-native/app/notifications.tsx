import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '../lib/store';
import { fetchNotifications, markNotificationRead, type AppNotification } from '../lib/api';

const MONO = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

const TYPE_ICON: Record<string, string> = {
  briefing:       '☀️',
  reminder:       '🔔',
  payment:        '💳',
  booking:        '📋',
  alert:          '⚠️',
  tiktok:         '📱',
  whatsapp:       '💬',
  report:         '📊',
  unpaid:         '🔴',
  vehicle:        '🚗',
};

function fmtTime(d: string): string {
  try {
    const date = new Date(d);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000)   return 'À l\'instant';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000)return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch { return d; }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { mobileToken } = useStore();
  const TOKEN = mobileToken();

  const [notifs,     setNotifs]     = useState<AppNotification[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await fetchNotifications(TOKEN, 60);
    setNotifs(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  }, [TOKEN]);

  useEffect(() => { void load(); }, [load]);

  const handleRead = useCallback(async (n: AppNotification) => {
    if (n.status === 'sent') return;
    await markNotificationRead(n.id, TOKEN);
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, status: 'sent' } : x));
  }, [TOKEN]);

  const unreadCount = notifs.filter(n => n.status !== 'sent').length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backTxt}>← RETOUR</Text>
        </TouchableOpacity>
        <Text style={styles.title}>NOTIFICATIONS</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#00e5ff" /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#00e5ff" />}
        >
          {notifs.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTxt}>AUCUNE NOTIFICATION</Text>
              <Text style={styles.emptySub}>Les alertes proactives de Dzaryx apparaîtront ici.</Text>
            </View>
          ) : (
            notifs.map(n => {
              const icon    = TYPE_ICON[n.type ?? ''] ?? '🔔';
              const isUnread = n.status !== 'sent';
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.card, isUnread && styles.cardUnread]}
                  onPress={() => handleRead(n)}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardIcon}>{icon}</Text>
                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    {n.title ? (
                      <Text style={[styles.cardTitle, isUnread && { color: '#fff' }]}>{n.title}</Text>
                    ) : null}
                    {n.body ? (
                      <Text style={styles.cardBody} numberOfLines={4}>{n.body}</Text>
                    ) : null}
                    {n.type ? (
                      <Text style={styles.cardType}>{n.type.toUpperCase()}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.cardTime}>{fmtTime(n.created_at)}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, gap: 12 },
  backBtn:  { paddingVertical: 8 },
  backTxt:  { color: '#00e5ff', fontSize: 10, fontFamily: MONO, letterSpacing: 3 },
  title:    { flex: 1, color: '#fff', fontSize: 13, fontFamily: MONO, letterSpacing: 6, fontWeight: '700' },
  badge:    { backgroundColor: '#ff444422', borderWidth: 1, borderColor: '#ff4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  badgeTxt: { color: '#ff4444', fontSize: 10, fontFamily: MONO, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: 16, paddingBottom: 60 },

  emptyBox:  { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTxt:  { color: '#333', fontSize: 12, fontFamily: MONO, letterSpacing: 3 },
  emptySub:  { color: '#1a1a1a', fontSize: 9, fontFamily: MONO, letterSpacing: 1, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 },

  card: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#050505', borderWidth: 1, borderColor: '#111',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  cardUnread: { borderColor: '#00e5ff22', backgroundColor: '#00e5ff05' },
  cardLeft:   { alignItems: 'center', gap: 4, width: 28 },
  cardIcon:   { fontSize: 18 },
  unreadDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00e5ff' },
  cardTitle:  { color: '#aaa', fontSize: 11, fontFamily: MONO, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  cardBody:   { color: '#555', fontSize: 10, fontFamily: MONO, lineHeight: 15 },
  cardType:   { color: '#1a2a3a', fontSize: 7, fontFamily: MONO, letterSpacing: 3, marginTop: 4 },
  cardTime:   { color: '#2a2a2a', fontSize: 8, fontFamily: MONO, letterSpacing: 1, marginLeft: 6 },
});
