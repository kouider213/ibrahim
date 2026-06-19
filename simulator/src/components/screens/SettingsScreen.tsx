import { useState, useEffect } from 'react';
import { business, setSimActor, getSimActor, registerWebPush, notifStatus } from '../../services/api.ts';
import CapacitesScreen from './CapacitesScreen.tsx';

interface StoredLocation { lat: number; lng: number; city?: string; country: string; updated_at: string; }

interface Job { name: string; cron: string; next: number | null; }
interface NexusInfo {
  nexus_online?: boolean; connected?: boolean;
  hostname?: string; cpu_percent?: number;
  ram_used_mb?: number; ram_total_mb?: number;
  uptime_s?: number; latency_ms?: number;
  os?: string;
}

const RULES = [
  { id: 1, rule: 'Acompte minimum 30% à la réservation pour les nouveaux clients', cat: 'BUSINESS',   priority: 9, col: '#ff3366' },
  { id: 2, rule: 'Vérifier disponibilité voiture avant de confirmer une résa',      cat: 'BUSINESS',   priority: 10, col: '#ff3366' },
  { id: 3, rule: 'Profit = (client_price - owner_price) × nb_jours. Jamais catalogue.', cat: 'PRICING', priority: 10, col: '#ffb347' },
  { id: 4, rule: 'Kouider préfère les réponses courtes et directes',                cat: 'COMM',       priority: 7, col: '#10b981' },
  { id: 5, rule: 'Houari gère les opérations terrain à Oran directement',           cat: 'OPÉRATIONS', priority: 8, col: '#7c3aed' },
  { id: 6, rule: 'Houari préfère le darija oranais pour communiquer',               cat: 'COMM',       priority: 9, col: '#7c3aed' },
];

const ACTORS = [
  { id: 'kouider' as const, label: 'KOUIDER', role: 'Gérant principal', col: '#00e5ff', icon: 'K' },
  { id: 'houari'  as const, label: 'HOUARI',  role: 'Associé',          col: '#7c3aed', icon: 'H' },
];

export default function SettingsScreen() {
  const [actor, setActorLocal] = useState<'kouider' | 'houari'>(getSimActor());
  const [health, setHealth]    = useState<{ status: string; uptime?: number } | null>(null);
  const [nexus, setNexus]      = useState<NexusInfo | null>(null);
  const [jobs, setJobs]        = useState<Job[]>([]);
  const [loadingH, setLH]      = useState(false);
  const [triggering, setTrig]  = useState<string | null>(null);
  const [clearing, setClear]   = useState(false);
  const [showCaps, setShowCaps] = useState(false);
  const [msg, setMsg]          = useState('');
  const [locData, setLocData]  = useState<StoredLocation | null>(null);
  const [locLoading, setLocL]  = useState(false);

  const checkHealth = async () => {
    setLH(true);
    const [h, n] = await Promise.all([
      business.health().catch(() => ({ status: 'error' })),
      business.nexus().catch(() => ({ connected: false })),
    ]);
    setHealth(h); setNexus(n); setLH(false);
  };

  const loadJobs = async () => {
    try { setJobs((await business.fetchJobs()).jobs ?? []); } catch { setJobs([]); }
  };

  const loadLocation = async () => {
    try {
      const r = await business.getMyLocation();
      setLocData(r.location);
    } catch { setLocData(null); }
  };

  // silent = détection auto en arrière-plan (pas de toast ni spinner).
  const shareLocation = (silent = false) => {
    if (!navigator.geolocation) { if (!silent) setMsg('❌ Géolocalisation non supportée'); return; }
    if (!silent) setLocL(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await business.shareLocation(pos.coords.latitude, pos.coords.longitude);
          setLocData(r.location);
          if (!silent) { const city = r.location.city ?? r.location.country; setMsg(`✅ Position partagée — ${city}`); }
        } catch { if (!silent) setMsg('❌ Erreur partage position'); }
        setLocL(false);
        if (!silent) setTimeout(() => setMsg(''), 3000);
      },
      () => { if (!silent) { setMsg('❌ Permission refusée ou timeout'); setTimeout(() => setMsg(''), 3000); } setLocL(false); },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  useEffect(() => { void checkHealth(); void loadJobs(); void loadLocation(); }, []);

  // Détection GPS AUTOMATIQUE : si la permission est déjà accordée, on rafraîchit
  // la position en silence à l'ouverture (plus besoin de cliquer à chaque fois).
  // Le fuseau horaire des rappels suit déjà le device via l'en-tête X-Timezone.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const np = navigator.permissions;
    if (!np?.query) { shareLocation(true); return; } // pas d'API permissions → tente quand même
    np.query({ name: 'geolocation' as PermissionName })
      .then(p => { if (p.state === 'granted') shareLocation(true); })
      .catch(() => {});
  }, []);

  const selectActor = (id: 'kouider' | 'houari') => {
    setActorLocal(id); setSimActor(id);
    setMsg(`ACTEUR → ${id.toUpperCase()}`);
    setTimeout(() => setMsg(''), 2000);
  };

  const triggerJob = async (name: string) => {
    setTrig(name);
    const ok = await business.triggerJob(name).catch(() => false);
    setMsg(ok ? `✅ "${name}" déclenché` : `❌ Erreur: "${name}"`);
    setTimeout(() => setMsg(''), 3000);
    setTrig(null);
  };

  const clearCache = async () => {
    setClear(true);
    try { const r = await business.clearCache(); setMsg(`✅ Cache vidé (${r.deleted ?? 0} clés)`); }
    catch { setMsg('❌ Erreur cache'); }
    setTimeout(() => setMsg(''), 3000);
    setClear(false);
  };

  const fmtUptime = (s?: number) => {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h${m}m`;
  };

  const fmtNext = (next: number | null) => {
    if (!next) return '—';
    try { return new Date(next).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  };

  const apiOk   = health?.status === 'ok';
  const nexusOk = nexus?.nexus_online ?? nexus?.connected ?? false;

  const fmtRam = (used?: number, total?: number) => {
    if (!used) return '—';
    return total ? `${Math.round(used / 1024)}/${Math.round(total / 1024)}GB` : `${Math.round(used / 1024)}GB`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 8px', flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.22em', color: '#10b981', fontWeight: 700, textTransform: 'uppercase' }}>Dzaryx · Réglages</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 26, color: '#fff', letterSpacing: '-0.02em', fontWeight: 800, lineHeight: 1.05, background: 'linear-gradient(120deg, #fff, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Réglages</div>
          </div>
          {msg && (
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#00e676', fontWeight: 600 }}>{msg}</span>
          )}
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #10b98144, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Notifications */}
        <NotifPrefs />

        {/* GPS Location */}
        <Panel title="LOCALISATION GPS">
          {locData ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#00e676',
                  boxShadow: '0 0 8px #00e676', flexShrink: 0,
                  animation: 'statusPulse 2s ease infinite',
                }} />
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: '#00e676' }}>
                  {locData.country === 'Algeria' ? '🇩🇿' : locData.country === 'Belgium' ? '🇧🇪' : locData.country === 'France' ? '🇫🇷' : '🌍'}{' '}
                  {locData.city ?? locData.country}
                </div>
              </div>
              <div style={{ fontSize: 7, color: '#ffffff33', marginBottom: 3 }}>
                {locData.lat.toFixed(5)}, {locData.lng.toFixed(5)}
              </div>
              <div style={{ fontSize: 7, color: '#ffffff22' }}>
                Mis à jour: {new Date(locData.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 8, color: '#ffffff33', marginBottom: 10 }}>
              Position non partagée — Dzaryx ne peut pas calculer tes trajets.
            </div>
          )}
          <button onClick={() => shareLocation()} disabled={locLoading} style={actionBtn('#00e676')}>
            {locLoading ? 'LOCALISATION EN COURS…' : '📍 PARTAGER MA POSITION'}
          </button>
          <div style={{ fontSize: 6, color: '#ffffff22', textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
            Dzaryx utilise ta position pour calculer tes trajets · Rappels livraison intelligents · 24h TTL
          </div>
        </Panel>

        {/* System health */}
        <Panel title="SYSTÈME BACKEND">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <StatusPill label="API" val={health?.status?.toUpperCase() ?? '…'} ok={apiOk} />
            <StatusPill label="NEXUS" val={nexusOk ? 'CONNECTÉ' : 'HORS LIGNE'} ok={nexusOk} />
            <StatusPill label="UPTIME" val={fmtUptime(health?.uptime)} ok={!!health} col="#10b981" />
          </div>
          {nexusOk && nexus && (
            <div style={{
              background: 'rgba(0,230,118,0.04)', border: '1px solid #00e67610',
              borderRadius: 8, padding: '7px 10px', marginBottom: 8,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px',
            }}>
              {nexus.hostname && <NexusRow k="HOST" v={nexus.hostname} />}
              {nexus.latency_ms != null && <NexusRow k="PING" v={`${nexus.latency_ms}ms`} />}
              {nexus.cpu_percent != null && <NexusRow k="CPU" v={`${nexus.cpu_percent.toFixed(1)}%`} />}
              {(nexus.ram_used_mb != null) && <NexusRow k="RAM" v={fmtRam(nexus.ram_used_mb, nexus.ram_total_mb)} />}
              {nexus.uptime_s != null && <NexusRow k="UPTIME" v={fmtUptime(nexus.uptime_s)} />}
              {nexus.os && <NexusRow k="OS" v={nexus.os.slice(0, 14)} />}
            </div>
          )}
          <button onClick={() => void checkHealth()} disabled={loadingH} style={actionBtn('#10b981')}>
            {loadingH ? 'TEST EN COURS…' : '↻ TESTER LA CONNEXION'}
          </button>
        </Panel>

        {/* Cache */}
        <Panel title="CACHE BI">
          <div style={{ fontSize: 8, color: '#ffffff44', marginBottom: 8, lineHeight: 1.6 }}>
            Vide le cache des calculs de revenus. TTL normal: 5 minutes.
          </div>
          <button onClick={() => void clearCache()} disabled={clearing} style={actionBtn('#ffb347')}>
            {clearing ? 'VIDAGE EN COURS…' : '⚡ VIDER CACHE (0 → 5 min)'}
          </button>
        </Panel>

        {/* Scheduled jobs */}
        {jobs.length > 0 && (
          <Panel title="JOBS SCHEDULÉS">
            {jobs.map(j => (
              <div key={j.name} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7,
                padding: '6px 8px', borderRadius: 7,
                background: 'rgba(255,255,255,0.02)', border: '1px solid #ffffff08',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: '#e0f0ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
                  <div style={{ fontSize: 7, color: '#ffffff33', marginTop: 1 }}>
                    {j.cron} · prochain: {fmtNext(j.next)}
                  </div>
                </div>
                <button
                  onClick={() => void triggerJob(j.name)}
                  disabled={triggering === j.name}
                  style={{
                    background: '#10b98118', border: '1px solid #10b98144', borderRadius: 6,
                    width: 28, height: 28, cursor: 'pointer', color: '#10b981',
                    fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, opacity: triggering === j.name ? 0.5 : 1,
                  }}
                >
                  {triggering === j.name ? '…' : '▶'}
                </button>
              </div>
            ))}
          </Panel>
        )}

        {/* Règles apprises — Phase 8 */}
        <Panel title="RÈGLES APPRISES (PHASE 8)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {RULES.map(r => (
              <div key={r.id} style={{
                background: 'rgba(16,185,129,0.03)', borderRadius: 8,
                border: `1px solid ${r.col}22`, padding: '7px 10px',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <div style={{
                  flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
                  background: r.col, boxShadow: `0 0 5px ${r.col}`,
                  marginTop: 4,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 8, color: '#c8e8ff', lineHeight: 1.5 }}>{r.rule}</div>
                  <div style={{ fontSize: 6, color: r.col, marginTop: 2, letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}>
                    {r.cat} · PRIORITÉ {r.priority}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 7, color: '#ffffff22', textAlign: 'center', letterSpacing: '0.1em' }}>
            Dzaryx apprend de chaque conversation · "sauvegarde cette règle: …"
          </div>
        </Panel>

        {/* Capacités & Agents Dzaryx (déplacé ici depuis l'onglet DZARYX) */}
        <Panel title="CAPACITÉS & AGENTS DZARYX">
          <button
            onClick={() => setShowCaps(s => !s)}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(16,185,129,0.06)', border: '1px solid #10b98122', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', color: '#cfefff', fontFamily: 'Inter, sans-serif', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>🤖 14 agents · ce que Dzaryx sait faire</span>
            <span style={{ color: '#10b98188' }}>{showCaps ? '▲' : '▼'}</span>
          </button>
          {showCaps && (
            <div style={{ marginTop: 10, height: 520, borderRadius: 10, overflow: 'hidden', border: '1px solid #10b98112' }}>
              <CapacitesScreen />
            </div>
          )}
        </Panel>

        {/* Version */}
        <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#ffffff15', letterSpacing: '0.3em' }}>
            DZARYX SIMULATOR v1.3 · GPS BRAIN · FIK CONCIERGERIE ORAN
          </div>
        </div>
      </div>
    </div>
  );
}

function NotifPrefs() {
  const TYPES: Array<{ k: string; label: string; icon: string }> = [
    { k: 'morning', label: 'Briefing du matin', icon: '☀️' },
    { k: 'alert', label: 'Alertes', icon: '🚨' },
    { k: 'reminder', label: 'Rappels', icon: '🔔' },
    { k: 'info', label: 'Infos / proactif', icon: '📱' },
  ];
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ morning: true, alert: true, reminder: true, info: true });
  const [st, setSt] = useState(notifStatus());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  useEffect(() => { business.pushPrefsGet().then(r => setPrefs(r.prefs)).catch(() => {}); }, []);
  const toggle = (k: string) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    business.pushPrefsSet({ [k]: next[k] }).catch(() => {});
  };

  // iOS : la demande de permission DOIT partir d'un tap direct (ce handler).
  const enableNotifs = async () => {
    setBusy(true); setHint('');
    const perm = await registerWebPush();
    setSt(notifStatus());
    if (perm === 'granted')      setHint('✅ Notifications activées');
    else if (perm === 'denied')  setHint('❌ Refusé — autorise les notifs dans Réglages iOS pour ce site/app');
    else if (perm === 'unsupported') setHint('⚠️ Non supporté ici — ouvre l\'app depuis l\'écran d\'accueil');
    else                          setHint('Demande fermée — réessaie');
    setBusy(false);
    setTimeout(() => setHint(''), 6000);
  };

  const granted = st.permission === 'granted';
  // iOS web push n'existe qu'en PWA installée (écran d'accueil). Si pas standalone → guider.
  const needsInstall = !st.standalone && !granted && st.permission !== 'unsupported';

  return (
    <Panel title="NOTIFICATIONS">
      {!granted && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => void enableNotifs()} disabled={busy} style={actionBtn('#10b981')}>
            {busy ? 'ACTIVATION…' : '🔔 ACTIVER LES NOTIFICATIONS'}
          </button>
          {needsInstall && (
            <div style={{ fontSize: 9, color: '#ffb347', marginTop: 8, lineHeight: 1.5 }}>
              📲 Sur iPhone : ouvre d'abord l'app depuis l'écran d'accueil (Partager → « Sur l'écran d'accueil »), puis touche ce bouton.
            </div>
          )}
          {hint && <div style={{ fontSize: 10, color: '#cfefff', marginTop: 8 }}>{hint}</div>}
        </div>
      )}
      {granted && (
        <div style={{ fontSize: 10, color: '#00e676', marginBottom: 12 }}>● Notifications activées sur cet appareil</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TYPES.map(t => (
          <div key={t.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: '#e8e8ee' }}>{t.icon} {t.label}</span>
            <button onClick={() => toggle(t.k)} style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: prefs[t.k] ? '#10b981' : 'rgba(255,255,255,0.12)', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 3, left: prefs[t.k] ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: '#ffffff33', marginTop: 10 }}>Coupe un type pour ne plus recevoir ces notifications push.</div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#16161c', borderRadius: 16, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#9b9ba6', letterSpacing: '0.04em', marginBottom: 12, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  );
}

function StatusPill({ label, val, ok, col }: { label: string; val: string; ok: boolean; col?: string }) {
  const c = col ?? (ok ? '#00e676' : '#ff3366');
  return (
    <div style={{ flex: 1, textAlign: 'center', background: '#1d1d25', borderRadius: 12, padding: '10px 6px', border: `1px solid ${c}33` }}>
      <div style={{ fontSize: 9, color: '#9b9ba6', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 700, color: c, fontFamily: 'Inter, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%', background: c,
          boxShadow: `0 0 5px ${c}`,
          animation: ok ? 'statusPulse 2s ease infinite' : 'none',
          flexShrink: 0,
        }} />
        {val}
      </div>
    </div>
  );
}

function actionBtn(col: string): React.CSSProperties {
  return {
    background: `${col}14`, border: `1px solid ${col}55`, borderRadius: 12,
    padding: '12px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
    color: col, cursor: 'pointer', letterSpacing: '0.01em',
    width: '100%', textAlign: 'center',
  };
}

function NexusRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 6, color: '#00e67644', letterSpacing: '0.1em' }}>{k}</span>
      <span style={{ fontSize: 7, color: '#00e676cc', fontFamily: 'Inter, sans-serif' }}>{v}</span>
    </div>
  );
}

