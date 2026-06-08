import { useState, useEffect } from 'react';
import { business, setSimActor, getSimActor } from '../../services/api.ts';
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
  { id: 4, rule: 'Kouider préfère les réponses courtes et directes',                cat: 'COMM',       priority: 7, col: '#00d4ff' },
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

  const shareLocation = () => {
    if (!navigator.geolocation) { setMsg('❌ Géolocalisation non supportée'); return; }
    setLocL(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await business.shareLocation(pos.coords.latitude, pos.coords.longitude);
          setLocData(r.location);
          const city = r.location.city ?? r.location.country;
          setMsg(`✅ Position partagée — ${city}`);
        } catch { setMsg('❌ Erreur partage position'); }
        setLocL(false);
        setTimeout(() => setMsg(''), 3000);
      },
      () => { setMsg('❌ Permission refusée ou timeout'); setLocL(false); setTimeout(() => setMsg(''), 3000); },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  useEffect(() => { void checkHealth(); void loadJobs(); void loadLocation(); }, []);

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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            RÉGLAGES
          </div>
          {msg && (
            <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00e676', letterSpacing: '0.1em' }}>{msg}</span>
          )}
        </div>
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Actor selector */}
        <Panel title="ACTEUR SIMULÉ">
          <div style={{ display: 'flex', gap: 8 }}>
            {ACTORS.map(a => {
              const active = actor === a.id;
              return (
                <button key={a.id} onClick={() => selectActor(a.id)} style={{
                  flex: 1, padding: '14px 8px', borderRadius: 12,
                  background: active ? `${a.col}18` : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${active ? a.col : '#ffffff10'}`,
                  cursor: 'pointer', textAlign: 'center',
                  boxShadow: active ? `0 0 14px ${a.col}22` : 'none',
                  transition: 'all 0.2s',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: active ? `${a.col}22` : '#ffffff08',
                    border: `1.5px solid ${active ? a.col : '#ffffff15'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 8px',
                    fontFamily: 'Orbitron', fontSize: 14, color: active ? a.col : '#ffffff44',
                    boxShadow: active ? `0 0 12px ${a.col}44` : 'none',
                  }}>{a.icon}</div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: active ? a.col : '#ffffff55', letterSpacing: '0.2em', textShadow: active ? `0 0 8px ${a.col}` : 'none' }}>
                    {a.label}
                  </div>
                  <div style={{ fontSize: 7, color: active ? `${a.col}77` : '#ffffff33', marginTop: 3 }}>{a.role}</div>
                </button>
              );
            })}
          </div>
        </Panel>

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
                <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: '#00e676' }}>
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
          <button onClick={shareLocation} disabled={locLoading} style={actionBtn('#00e676')}>
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
            <StatusPill label="UPTIME" val={fmtUptime(health?.uptime)} ok={!!health} col="#00d4ff" />
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
          <button onClick={() => void checkHealth()} disabled={loadingH} style={actionBtn('#00d4ff')}>
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
                    background: '#00d4ff18', border: '1px solid #00d4ff44', borderRadius: 6,
                    width: 28, height: 28, cursor: 'pointer', color: '#00d4ff',
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
                background: 'rgba(0,212,255,0.03)', borderRadius: 8,
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
                  <div style={{ fontSize: 6, color: r.col, marginTop: 2, letterSpacing: '0.1em', fontFamily: 'Orbitron' }}>
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
            style={{ width: '100%', textAlign: 'left', background: 'rgba(0,212,255,0.06)', border: '1px solid #00d4ff22', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', color: '#cfefff', fontFamily: 'Share Tech Mono', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>🤖 14 agents · ce que Dzaryx sait faire</span>
            <span style={{ color: '#00d4ff88' }}>{showCaps ? '▲' : '▼'}</span>
          </button>
          {showCaps && (
            <div style={{ marginTop: 10, height: 520, borderRadius: 10, overflow: 'hidden', border: '1px solid #00d4ff12' }}>
              <CapacitesScreen />
            </div>
          )}
        </Panel>

        {/* Version */}
        <div style={{ textAlign: 'center', padding: '8px 0 2px' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff15', letterSpacing: '0.3em' }}>
            DZARYX SIMULATOR v1.3 · GPS BRAIN · FIK CONCIERGERIE ORAN
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(0,212,255,0.03)', borderRadius: 12, padding: '12px', border: '1px solid #00d4ff12' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff55', letterSpacing: '0.3em', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function StatusPill({ label, val, ok, col }: { label: string; val: string; ok: boolean; col?: string }) {
  const c = col ?? (ok ? '#00e676' : '#ff3366');
  return (
    <div style={{ flex: 1, textAlign: 'center', background: `${c}0a`, borderRadius: 8, padding: '6px 6px', border: `1px solid ${c}2a` }}>
      <div style={{ fontSize: 6, color: `${c}77`, letterSpacing: '0.15em', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 8, color: c, fontFamily: 'Orbitron',
        textShadow: `0 0 6px ${c}66`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
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
    background: `${col}0d`, border: `1px solid ${col}44`, borderRadius: 8,
    padding: '8px 12px', fontFamily: 'Orbitron', fontSize: 7,
    color: `${col}cc`, cursor: 'pointer', letterSpacing: '0.15em',
    width: '100%', textAlign: 'center',
  };
}

function NexusRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 6, color: '#00e67644', letterSpacing: '0.1em' }}>{k}</span>
      <span style={{ fontSize: 7, color: '#00e676cc', fontFamily: 'Share Tech Mono' }}>{v}</span>
    </div>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = '#00d4ff';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
