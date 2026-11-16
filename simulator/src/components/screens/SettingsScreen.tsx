import { useState, useEffect } from 'react';
import { T, PageHeader, glass, tone, Toggle, inputStyle, btnStyle } from '../ui/Kit.tsx';
import { getThemeMode, setThemeMode, type ThemeMode } from '../../services/theme.ts';
import { business, setSimActor, getSimActor, registerWebPush, notifStatus, changePassword, apiFetch } from '../../services/api.ts';
import CapacitesScreen from './CapacitesScreen.tsx';
import { Icon } from '../ui/Icon.tsx';

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

  const [version, setVersion] = useState('');
  const [openSec, setOpenSec] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/ibrahim/"}sw.js`, { cache: 'no-store' }).then(r => r.text())
      .then(t => { const m = /dzaryx-(v\d+)/.exec(t); if (m) setVersion(m[1]!); }).catch(() => {});
  }, []);
  const toggleSec = (k: string) => setOpenSec(o => o === k ? null : k);
  const flag = locData ? (locData.country === 'Algeria' ? '🇩🇿' : locData.country === 'Belgium' ? '🇧🇪' : locData.country === 'France' ? '🇫🇷' : '') : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
      <PageHeader eyebrow="Configuration" title="Réglages" subtitle={msg || undefined} />
      <div className="dz-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 130px' }}>
      <div className="dz-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

        {/* Carte profil */}
        <div style={{ ...glass(T.accent2), borderRadius: 24, padding: 16, display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -50, top: -60, width: 170, height: 170, borderRadius: '50%', background: T.grad, opacity: 0.2, filter: 'blur(28px)' }} />
          <div style={{ width: 58, height: 58, borderRadius: 20, background: T.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: T.display, fontSize: 24, fontWeight: 700, letterSpacing: '-0.04em', flexShrink: 0, boxShadow: '0 10px 30px -10px rgba(139,92,246,0.7)' }}>{actor === 'houari' ? 'H' : 'K'}</div>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ fontFamily: T.display, fontSize: 20, fontWeight: 650, letterSpacing: '-0.03em' }}>{actor === 'houari' ? 'Houari' : 'Kouider'}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{actor === 'houari' ? 'Associé' : 'Gérant'} · FIK Conciergerie</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <Pill ok={apiOk} label={health ? (apiOk ? 'Dzaryx en ligne' : 'Serveur injoignable') : 'Vérification…'} />
              {version && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, padding: '3px 8px', borderRadius: 8, background: 'var(--dz-track)' }}>{version}</span>}
            </div>
          </div>
        </div>

        <ThemePicker />

        <NotifPrefs />

        <Group title="Compte & sécurité">
          <SecurityPanel open={openSec === 'sec'} onToggle={() => toggleSec('sec')} devOpen={openSec === 'dev'} onDevToggle={() => toggleSec('dev')} />
        </Group>

        <Group title="Position" foot="Sert à calculer tes trajets et l'heure de départ pour les livraisons. Mise à jour automatique à l'ouverture.">
          <Item icon="pin" hue="#12b76a" title={locData ? `${flag ? flag + ' ' : ''}${locData.city ?? locData.country}` : 'Position non partagée'}
            sub={locData ? `Mise à jour à ${new Date(locData.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : 'Dzaryx ne peut pas calculer tes trajets'}
            right={<SmallBtn busy={locLoading} onClick={() => shareLocation()}>{locLoading ? '…' : 'Actualiser'}</SmallBtn>} />
        </Group>

        <Group title="État du système">
          <Item icon="cloud" hue="#3d6bff" title="Serveur Dzaryx" sub={health?.uptime ? `Allumé depuis ${fmtUptime(health.uptime)}` : undefined} right={<Pill ok={apiOk} label={health ? (apiOk ? 'OK' : 'Erreur') : '…'} />} />
          <Item icon="monitor" hue="#8b5cf6" title="Mon PC" sub={nexusOk && nexus ? [nexus.hostname, nexus.cpu_percent != null ? `CPU ${nexus.cpu_percent.toFixed(0)} %` : '', nexus.ram_used_mb ? `RAM ${fmtRam(nexus.ram_used_mb, nexus.ram_total_mb)}` : ''].filter(Boolean).join(' · ') : 'Éteint ou non connecté'} right={<Pill ok={nexusOk} label={nexusOk ? 'Connecté' : 'Hors ligne'} />} />
          <Item icon="refresh" hue="#22d3ee" title="Tester la connexion" onClick={() => void checkHealth()} right={loadingH ? <Spin /> : undefined} />
          <Item icon="bolt" hue="#f59e0b" title="Vider le cache des calculs" sub="Si un chiffre du CA te paraît pas à jour" onClick={() => void clearCache()} right={clearing ? <Spin /> : undefined} />
        </Group>

        {jobs.length > 0 && (
          <Group title="Tâches automatiques">
            <Item icon="clock" hue="#64748b" title={`${jobs.length} tâches programmées`} sub="Briefings, rappels, relances…" onClick={() => toggleSec('jobs')} right={<Chev open={openSec === 'jobs'} />} />
            {openSec === 'jobs' && jobs.map(j => (
              <Item key={j.name} title={<span style={{ fontSize: 14 }}>{j.name}</span>} sub={`Prochaine : ${fmtNext(j.next)}`}
                right={<SmallBtn busy={triggering === j.name} onClick={() => void triggerJob(j.name)}>{triggering === j.name ? '…' : 'Lancer'}</SmallBtn>} />
            ))}
          </Group>
        )}

        <Group title="Dzaryx">
          <Item icon="brain" hue="#ec4899" title="Règles apprises" sub={`${RULES.length} règles · dis « sauvegarde cette règle : … »`} onClick={() => toggleSec('rules')} right={<Chev open={openSec === 'rules'} />} />
          {openSec === 'rules' && RULES.map(r => (
            <Item key={r.id} title={<span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'normal', lineHeight: 1.4 }}>{r.rule}</span>} sub={r.cat.charAt(0) + r.cat.slice(1).toLowerCase()} />
          ))}
          <Item icon="bot" hue="#3d6bff" title="Capacités & agents" sub="Ce que Dzaryx sait faire" onClick={() => setShowCaps(s => !s)} right={<Chev open={showCaps} />} />
          {showCaps && (
            <div style={{ height: 520, overflow: 'hidden', borderTop: '1px solid var(--dz-line)' }}>
              <CapacitesScreen />
            </div>
          )}
        </Group>

        <div style={{ textAlign: 'center', padding: '4px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: T.grad, opacity: 0.9 }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Dzaryx {version}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.faint, letterSpacing: '0.12em' }}>FIK CONCIERGERIE · ORAN</div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Briques façon Réglages iPhone : groupe arrondi + lignes avec tuile d'icône colorée ──
function Group({ title, foot, children }: { title?: string; foot?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.muted, padding: '0 6px 8px' }}>{title}</div>}
      <div style={{ ...glass(), borderRadius: 20, overflow: 'hidden' }}>{children}</div>
      {foot && <div style={{ fontSize: 12.5, color: T.faint, padding: '8px 8px 0', lineHeight: 1.45 }}>{foot}</div>}
    </section>
  );
}

function Item({ icon, hue = T.accent, title, sub, right, onClick }: { icon?: string; hue?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} className={onClick ? 'dz-press' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 52, boxSizing: 'border-box', cursor: onClick ? 'pointer' : undefined, borderTop: '1px solid var(--dz-line)', marginTop: -1 }}>
      {icon && (
        <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(145deg, ${hue}, color-mix(in srgb, ${hue} 70%, #000))` }}>
          <Icon name={icon} size={17} stroke={2} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub != null && sub !== '' && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, lineHeight: 1.35 }}>{sub}</div>}
      </div>
      {right ?? (onClick ? <Icon name="chevronRight" size={16} color="var(--dz-faint)" stroke={2.2} /> : null)}
    </div>
  );
}

function Chev({ open }: { open: boolean }) {
  return <Icon name="chevronDown" size={16} color="var(--dz-faint)" stroke={2.2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }} />;
}
function Spin() {
  return <Icon name="refresh" size={16} color={T.muted} style={{ animation: 'dzSpin 1s linear infinite' }} />;
}
function SmallBtn({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} disabled={busy} style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 10, border: '1px solid var(--dz-card-line)', background: 'var(--dz-track)', color: T.text, cursor: 'pointer', flexShrink: 0 }}>{children}</button>
  );
}
function Pill({ ok, label }: { ok: boolean; label: string }) {
  const c = ok ? T.ok : T.bad;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: c, padding: '3px 9px', borderRadius: 8, background: tone(c, 0.12), flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}` }} />{label}
    </span>
  );
}

function NotifPrefs() {
  const TYPES: Array<{ k: string; label: string; sub: string; icon: string; hue: string }> = [
    { k: 'morning', label: 'Briefing du matin', sub: 'Ta journée résumée au réveil', icon: 'sun', hue: '#f59e0b' },
    { k: 'alert', label: 'Alertes', sub: 'Retards, paiements, urgences', icon: 'alert', hue: '#f04438' },
    { k: 'reminder', label: 'Rappels', sub: 'Ce que tu as demandé de te rappeler', icon: 'bell', hue: '#8b5cf6' },
    { k: 'info', label: 'Infos & idées', sub: 'Dzaryx te prévient de lui-même', icon: 'sparkles', hue: '#3d6bff' },
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
    if (perm === 'granted')      setHint('Notifications activées');
    else if (perm === 'denied')  setHint('Refusé : autorise les notifications dans Réglages iOS pour Dzaryx');
    else if (perm === 'unsupported') setHint("Non supporté ici : ouvre l'app depuis l'écran d'accueil");
    else                          setHint('Demande fermée, réessaie');
    setBusy(false);
    setTimeout(() => setHint(''), 6000);
  };

  const granted = st.permission === 'granted';
  const needsInstall = !st.standalone && !granted && st.permission !== 'unsupported';

  return (
    <Group title="Notifications" foot={needsInstall ? "Sur iPhone : ouvre d'abord l'app depuis l'écran d'accueil (Partager → « Sur l'écran d'accueil »), puis active." : hint || undefined}>
      {granted
        ? <Item icon="checkCircle" hue="#12b76a" title="Activées sur ce téléphone" />
        : <Item icon="bell" hue="#3d6bff" title={busy ? 'Activation…' : 'Activer les notifications'} sub="Pour recevoir alertes et rappels" onClick={() => void enableNotifs()} />}
      {TYPES.map(t => (
        <Item key={t.k} icon={t.icon} hue={t.hue} title={t.label} sub={t.sub} right={<Toggle on={!!prefs[t.k]} onChange={() => toggle(t.k)} colorOn={T.ok} colorOff="#64748b" />} />
      ))}
    </Group>
  );
}

// Sécurité : le mot de passe est vérifié par le serveur ; chaque téléphone connecté a son propre jeton.
function SecurityPanel({ open, onToggle, devOpen, onDevToggle }: { open: boolean; onToggle: () => void; devOpen: boolean; onDevToggle: () => void }) {
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

  const ago = (iso: string | null) => {
    if (!iso) return 'jamais';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 2) return 'maintenant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d < 31 ? `il y a ${d} j` : `il y a ${Math.round(d / 30)} mois`;
  };
  const sorted = [...devices].sort((a, b) => String(b.last ?? b.created).localeCompare(String(a.last ?? a.created)));
  const active = sorted.filter(d => d.last && Date.now() - new Date(d.last).getTime() < 7 * 86400000).length;

  return (
    <>
      <Item icon="lock" hue="#64748b" title="Mot de passe" sub="Vérifié par le serveur" onClick={onToggle} right={<Chev open={open} />} />
      {open && (
        <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="password" placeholder="Mot de passe actuel" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" style={inputStyle} />
          <input type="password" placeholder="Nouveau (6 caractères min.)" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" style={inputStyle} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '4px 2px' }}>
            <span style={{ fontSize: 13.5, color: T.muted }}>Déconnecter mes autres appareils</span>
            <Toggle on={others} onChange={() => setOthers(o => !o)} colorOn={T.ok} colorOff="#64748b" />
          </div>
          <button onClick={() => void submit()} disabled={busy || !cur || !next} style={{ ...btnStyle('primary'), width: '100%', minHeight: 48, opacity: !cur || !next ? 0.5 : 1 }}>
            {busy ? 'Enregistrement…' : 'Changer mon mot de passe'}
          </button>
          {msg && <div style={{ fontSize: 13, color: msg.ok ? T.ok : T.bad }}>{msg.text}</div>}
        </div>
      )}
      <Item icon="smartphone" hue="#3d6bff" title="Appareils connectés" sub={devices.length ? `${devices.length} au total · ${active} actif${active > 1 ? 's' : ''} cette semaine` : 'Chargement…'} onClick={onDevToggle} right={<Chev open={devOpen} />} />
      {devOpen && sorted.map(d => (
        <Item key={d.id} title={<span style={{ fontSize: 14 }}>{d.actor === 'houari' ? 'Houari' : 'Kouider'} · {d.label.replace(/\s*—\s*\d{2}\/\d{2}\/\d{4}$/, '')}</span>}
          sub={`Vu ${ago(d.last)} · ajouté le ${new Date(d.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
          right={d.last && Date.now() - new Date(d.last).getTime() < 3600000 ? <Pill ok label="Actif" /> : undefined} />
      ))}
    </>
  );
}

function ThemePicker() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const opts: Array<{ id: ThemeMode; label: string; icon: string; bg: string; fg: string }> = [
    { id: 'light', label: 'Clair', icon: 'sun', bg: 'linear-gradient(160deg,#ffffff,#eef1f6)', fg: '#0b0d12' },
    { id: 'dark', label: 'Sombre', icon: 'moon', bg: 'linear-gradient(160deg,#1a1d26,#050608)', fg: '#ffffff' },
    { id: 'auto', label: 'Auto', icon: 'smartphone', bg: 'linear-gradient(115deg,#ffffff 0%,#eef1f6 49%,#14171f 51%,#050608 100%)', fg: '#7c8597' },
  ];
  return (
    <Group title="Apparence" foot="Auto suit le réglage de ton iPhone.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 14 }}>
        {opts.map(o => {
          const on = mode === o.id;
          return (
            <button key={o.id} aria-pressed={on} onClick={() => { setMode(o.id); setThemeMode(o.id); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: T.font, color: T.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '100%', aspectRatio: '1 / 1.15', borderRadius: 16, background: o.bg, border: on ? `2px solid ${T.accent}` : '1px solid var(--dz-line-strong)', boxShadow: on ? `0 0 0 4px ${tone(T.accent, 0.2)}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: o.fg, boxSizing: 'border-box' }}>
                <Icon name={o.icon} size={22} />
              </div>
              <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? T.text : T.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', border: on ? 'none' : '1.5px solid var(--dz-line-strong)', background: on ? T.accent : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon name="check" size={11} color="#fff" stroke={3} />}</span>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </Group>
  );
}
