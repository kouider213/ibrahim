import { useState, useEffect } from 'react';
import { T, PageHeader } from '../ui/Kit.tsx';
import { getThemeMode, setThemeMode, type ThemeMode } from '../../services/theme.ts';
import { business, setSimActor, getSimActor, registerWebPush, notifStatus, changePassword, apiFetch } from '../../services/api.ts';
import CapacitesScreen from './CapacitesScreen.tsx';
import { Ico } from '../ui/Icon.tsx';

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
  { id: 1, rule: 'Acompte minimum 30% à la réservation pour les nouveaux clients', cat: 'BUSINESS',   priority: 9, col: '#e0304f' },
  { id: 2, rule: 'Vérifier disponibilité voiture avant de confirmer une résa',      cat: 'BUSINESS',   priority: 10, col: '#e0304f' },
  { id: 3, rule: 'Profit = (client_price - owner_price) × nb_jours. Jamais catalogue.', cat: 'PRICING', priority: 10, col: '#b86e00' },
  { id: 4, rule: 'Kouider préfère les réponses courtes et directes',                cat: 'COMM',       priority: 7, col: '#2f5bff' },
  { id: 5, rule: 'Houari gère les opérations terrain à Oran directement',           cat: 'OPÉRATIONS', priority: 8, col: '#7a3cff' },
  { id: 6, rule: 'Houari préfère le darija oranais pour communiquer',               cat: 'COMM',       priority: 9, col: '#7a3cff' },
];

const ACTORS = [
  { id: 'kouider' as const, label: 'KOUIDER', role: 'Gérant principal', col: '#2f5bff', icon: 'K' },
  { id: 'houari'  as const, label: 'HOUARI',  role: 'Associé',          col: '#7a3cff', icon: 'H' },
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
      <PageHeader eyebrow="Configuration" title="Réglages" subtitle={msg || 'Notifications, sécurité, position, état du système'} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 130px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Apparence : clair / sombre / auto */}
        <ThemePicker />

        {/* Notifications */}
        <NotifPrefs />

        {/* Mot de passe + appareils connectés */}
        <SecurityPanel />

        {/* GPS Location */}
        <Panel title="Localisation GPS">
          {locData ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#0a9a5e',
                  boxShadow: '0 0 8px #0a9a5e', flexShrink: 0,
                  animation: 'statusPulse 2s ease infinite',
                }} />
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: '#0a9a5e' }}>
                  {locData.country === 'Algeria' ? '🇩🇿' : locData.country === 'Belgium' ? '🇧🇪' : locData.country === 'France' ? '🇫🇷' : '🌍'}{' '}
                  {locData.city ?? locData.country}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--dz-muted)', marginBottom: 3 }}>
                {locData.lat.toFixed(5)}, {locData.lng.toFixed(5)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--dz-faint)' }}>
                Mis à jour: {new Date(locData.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--dz-muted)', marginBottom: 10 }}>
              Position non partagée — Dzaryx ne peut pas calculer tes trajets.
            </div>
          )}
          <button onClick={() => shareLocation()} disabled={locLoading} style={actionBtn('#0a9a5e')}>
            {locLoading ? 'LOCALISATION EN COURS…' : '📍 PARTAGER MA POSITION'}
          </button>
          <div style={{ fontSize: 11.5, color: 'var(--dz-faint)', textAlign: 'center', marginTop: 6, lineHeight: 1.5 }}>
            Dzaryx utilise ta position pour calculer tes trajets · Rappels livraison intelligents · 24h TTL
          </div>
        </Panel>

        {/* System health */}
        <Panel title="État du système">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <StatusPill label="API" val={health?.status?.toUpperCase() ?? '…'} ok={apiOk} />
            <StatusPill label="NEXUS" val={nexusOk ? 'CONNECTÉ' : 'HORS LIGNE'} ok={nexusOk} />
            <StatusPill label="UPTIME" val={fmtUptime(health?.uptime)} ok={!!health} col="#2f5bff" />
          </div>
          {nexusOk && nexus && (
            <div style={{
              background: 'rgba(10,154,94,0.04)', border: '1px solid #0a9a5e10',
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
          <button onClick={() => void checkHealth()} disabled={loadingH} style={actionBtn('#2f5bff')}>
            {loadingH ? 'TEST EN COURS…' : '↻ TESTER LA CONNEXION'}
          </button>
        </Panel>

        {/* Cache */}
        <Panel title="Cache des calculs">
          <div style={{ fontSize: 12.5, color: 'var(--dz-muted)', marginBottom: 8, lineHeight: 1.6 }}>
            Vide le cache des calculs de revenus. TTL normal: 5 minutes.
          </div>
          <button onClick={() => void clearCache()} disabled={clearing} style={actionBtn('#b86e00')}>
            {clearing ? 'VIDAGE EN COURS…' : '⚡ VIDER CACHE (0 → 5 min)'}
          </button>
        </Panel>

        {/* Scheduled jobs */}
        {jobs.length > 0 && (
          <Panel title="Tâches programmées">
            {jobs.map(j => (
              <div key={j.name} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7,
                padding: '6px 8px', borderRadius: 7,
                background: 'rgba(var(--dz-ink-rgb),0.015)', border: '1px solid rgba(var(--dz-ink-rgb),0.03)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--dz-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--dz-muted)', marginTop: 1 }}>
                    {j.cron} · prochain: {fmtNext(j.next)}
                  </div>
                </div>
                <button
                  onClick={() => void triggerJob(j.name)}
                  disabled={triggering === j.name}
                  style={{
                    background: '#2f5bff18', border: '1px solid #2f5bff44', borderRadius: 6,
                    width: 28, height: 28, cursor: 'pointer', color: '#2f5bff',
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
        <Panel title="Règles apprises">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {RULES.map(r => (
              <div key={r.id} style={{
                background: 'rgba(47,91,255,0.03)', borderRadius: 8,
                border: `1px solid color-mix(in srgb, ${r.col} 13%, transparent)`, padding: '7px 10px',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <div style={{
                  flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
                  background: r.col, boxShadow: `0 0 5px ${r.col}`,
                  marginTop: 4,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--dz-text)', lineHeight: 1.5 }}>{r.rule}</div>
                  <div style={{ fontSize: 11.5, color: r.col, marginTop: 2, letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}>
                    {r.cat} · PRIORITÉ {r.priority}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--dz-faint)', textAlign: 'center', letterSpacing: '0.1em' }}>
            Dzaryx apprend de chaque conversation · "sauvegarde cette règle: …"
          </div>
        </Panel>

        {/* Capacités & Agents Dzaryx (déplacé ici depuis l'onglet DZARYX) */}
        <Panel title="Capacités & agents Dzaryx">
          <button
            onClick={() => setShowCaps(s => !s)}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(47,91,255,0.06)', border: '1px solid #2f5bff22', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', color: 'var(--dz-text)', fontFamily: 'Inter, sans-serif', fontSize: 13.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span><Ico e="🤖" />14 agents · ce que Dzaryx sait faire</span>
            <span style={{ color: '#2f5bff88' }}>{showCaps ? '▲' : '▼'}</span>
          </button>
          {showCaps && (
            <div style={{ marginTop: 10, height: 520, borderRadius: 10, overflow: 'hidden', border: '1px solid #2f5bff12' }}>
              <CapacitesScreen />
            </div>
          )}
        </Panel>

        {/* Version */}
        <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--dz-faint)', letterSpacing: '0.3em' }}>
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
    <Panel title="Notifications">
      {!granted && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => void enableNotifs()} disabled={busy} style={actionBtn('#2f5bff')}>
            {busy ? 'Activation…' : '🔔 Activer les notifications'}
          </button>
          {needsInstall && (
            <div style={{ fontSize: 13, color: '#b86e00', marginTop: 8, lineHeight: 1.5 }}>
              📲 Sur iPhone : ouvre d'abord l'app depuis l'écran d'accueil (Partager → « Sur l'écran d'accueil »), puis touche ce bouton.
            </div>
          )}
          {hint && <div style={{ fontSize: 13.5, color: 'var(--dz-text)', marginTop: 8 }}>{hint}</div>}
        </div>
      )}
      {granted && (
        <div style={{ fontSize: 13.5, color: '#0a9a5e', marginBottom: 12 }}>● Notifications activées sur cet appareil</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {TYPES.map(t => (
          <div key={t.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'var(--dz-text)' }}>{t.icon} {t.label}</span>
            <button onClick={() => toggle(t.k)} style={{ width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: prefs[t.k] ? '#2f5bff' : 'rgba(var(--dz-ink-rgb),0.09)', transition: 'background .2s' }}>
              <div style={{ position: 'absolute', top: 3, left: prefs[t.k] ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'var(--dz-surface)', transition: 'left .2s' }} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--dz-muted)', marginTop: 10 }}>Coupe un type pour ne plus recevoir ces notifications push.</div>
    </Panel>
  );
}

// Sécurité : le mot de passe est vérifié par le serveur ; chaque téléphone connecté a son propre jeton.
function SecurityPanel() {
  const [cur, setCur]   = useState('');
  const [next, setNext] = useState('');
  const [others, setOthers] = useState(true);
  const [msg, setMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; actor: string; label: string; last: string | null; created: string }>>([]);

  useEffect(() => {
    apiFetch<{ devices: typeof devices }>('/api/auth/devices').then(d => setDevices(d.devices ?? [])).catch(() => {});
  }, [msg]);

  const submit = async () => {
    if (next.length < 6) { setMsg({ ok: false, text: 'Au moins 6 caractères.' }); return; }
    setBusy(true);
    const r = await changePassword(cur, next, others).catch(() => ({ error: 'Réseau indisponible' } as { error: string; ok?: boolean; loggedOut?: number }));
    setBusy(false);
    if (r.ok) {
      setCur(''); setNext('');
      setMsg({ ok: true, text: `Mot de passe changé${r.loggedOut ? ` · ${r.loggedOut} autre(s) appareil(s) déconnecté(s)` : ''}.` });
    } else setMsg({ ok: false, text: r.error ?? 'Échec' });
  };

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--dz-surface)', border: '1px solid rgba(var(--dz-ink-rgb),0.1)',
    borderRadius: 10, padding: '10px 12px', color: 'var(--dz-text)', fontFamily: 'Inter, sans-serif', fontSize: 13, marginBottom: 8,
  };
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Panel title="Sécurité">
      <input type="password" placeholder="Mot de passe actuel" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" style={input} />
      <input type="password" placeholder="Nouveau mot de passe (6 caractères min.)" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" style={input} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'var(--dz-muted)', marginBottom: 10 }}>
        <input type="checkbox" checked={others} onChange={e => setOthers(e.target.checked)} />
        Déconnecter mes autres appareils
      </label>
      <button onClick={() => void submit()} disabled={busy || !cur || !next} style={actionBtn('#2f5bff')}>
        {busy ? 'Enregistrement…' : '🔐 Changer mon mot de passe'}
      </button>
      {msg && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, marginTop: 8, color: msg.ok ? '#0a9a5e' : '#e0304f' }}>{msg.text}</div>}
      {devices.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--dz-muted)', marginBottom: 6 }}>Appareils connectés</div>
          {devices.map(d => (
            <div key={d.id} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--dz-text)', padding: '6px 0', borderTop: '1px solid rgba(var(--dz-ink-rgb),0.05)' }}>
              {d.actor === 'houari' ? '👤 Houari' : '👤 Kouider'} · {d.label}
              <div style={{ fontSize: 13.5, color: 'var(--dz-faint)' }}>Connecté le {fmt(d.created)} · vu {fmt(d.last)}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ThemePicker() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const opts: Array<{ id: ThemeMode; label: string; icon: string }> = [
    { id: 'light', label: 'Clair', icon: '☀️' }, { id: 'dark', label: 'Sombre', icon: '🌙' }, { id: 'auto', label: 'Auto', icon: '📱' },
  ];
  return (
    <Panel title="Apparence">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {opts.map(o => {
          const on = mode === o.id;
          return (
            <button key={o.id} aria-pressed={on} onClick={() => { setMode(o.id); setThemeMode(o.id); }} style={{
              minHeight: 64, borderRadius: 16, cursor: 'pointer', fontFamily: T.font, fontSize: 13, fontWeight: 700,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: on ? T.ink : T.surface, color: on ? T.onInk : T.text,
              border: `1px solid ${on ? T.ink : T.lineStrong}`,
            }}><span style={{ fontSize: 20 }}>{o.icon}</span>{o.label}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>Auto suit le réglage de ton iPhone (sombre le soir si tu l'as activé).</div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: `linear-gradient(160deg, ${T.surface2}, ${T.surface})`, borderRadius: T.radius, padding: '16px', border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 12, letterSpacing: '-0.01em' }}>{title}</div>
      {children}
    </div>
  );
}

function StatusPill({ label, val, ok, col }: { label: string; val: string; ok: boolean; col?: string }) {
  const c = col ?? (ok ? '#0a9a5e' : '#e0304f');
  return (
    <div style={{ flex: 1, textAlign: 'center', background: 'var(--dz-surface)', borderRadius: 12, padding: '10px 6px', border: `1px solid color-mix(in srgb, ${c} 20%, transparent)` }}>
      <div style={{ fontSize: 13, color: 'var(--dz-muted)', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
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
    background: `color-mix(in srgb, ${col} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${col} 33%, transparent)`, borderRadius: 12,
    minHeight: 46, padding: '0 14px', fontFamily: T.font, fontSize: 14, fontWeight: 700,
    color: col, cursor: 'pointer', letterSpacing: '0.01em',
    width: '100%', textAlign: 'center',
  };
}

function NexusRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11.5, color: '#0a9a5e44', letterSpacing: '0.1em' }}>{k}</span>
      <span style={{ fontSize: 12, color: '#0a9a5ecc', fontFamily: 'Inter, sans-serif' }}>{v}</span>
    </div>
  );
}

