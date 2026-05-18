import { useState, useEffect } from 'react';
import { business, setSimActor, getSimActor } from '../../services/api.ts';

interface Job { name: string; cron: string; next: number | null; }

const ACTORS = [
  { id: 'kouider' as const, label: 'KOUIDER', role: 'Gérant principal', col: '#00e5ff' },
  { id: 'houari'  as const, label: 'HOUARI',  role: 'Associé',          col: '#7c3aed' },
];

export default function SettingsScreen() {
  const [actor, setActorLocal]  = useState<'kouider' | 'houari'>(getSimActor());
  const [health, setHealth]     = useState<{ status: string; uptime?: number } | null>(null);
  const [nexus, setNexus]       = useState<{ connected: boolean } | null>(null);
  const [jobs, setJobs]         = useState<Job[]>([]);
  const [loadingH, setLH]       = useState(false);
  const [triggering, setTrig]   = useState<string | null>(null);
  const [clearing, setClear]    = useState(false);
  const [msg, setMsg]           = useState('');

  const checkHealth = async () => {
    setLH(true);
    const [h, n] = await Promise.all([
      business.health().catch(() => ({ status: 'error' })),
      business.nexus().catch(() => ({ connected: false })),
    ]);
    setHealth(h); setNexus(n); setLH(false);
  };

  const loadJobs = async () => {
    try { const r = await business.fetchJobs(); setJobs(r.jobs ?? []); } catch { setJobs([]); }
  };

  useEffect(() => { void checkHealth(); void loadJobs(); }, []);

  const selectActor = (id: 'kouider' | 'houari') => {
    setActorLocal(id);
    setSimActor(id);
    setMsg(`Acteur → ${id.toUpperCase()}`);
    setTimeout(() => setMsg(''), 2000);
  };

  const triggerJob = async (name: string) => {
    setTrig(name);
    const ok = await business.triggerJob(name).catch(() => false);
    setMsg(ok ? `✅ Job "${name}" déclenché` : `❌ Erreur job "${name}"`);
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #00d4ff15', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff', letterSpacing: '0.3em' }}>RÉGLAGES</span>
        {msg && <span style={{ marginLeft: 8, fontSize: 8, color: '#00e676' }}>{msg}</span>}
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Actor selector */}
        <Section title="ACTEUR">
          <div style={{ display: 'flex', gap: 8 }}>
            {ACTORS.map(a => (
              <button
                key={a.id}
                onClick={() => selectActor(a.id)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 10,
                  background: actor === a.id ? `${a.col}22` : '#0a1520',
                  border: `1px solid ${actor === a.id ? a.col : '#ffffff15'}`,
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'Orbitron', fontSize: 10, color: a.col, letterSpacing: '0.2em' }}>{a.label}</div>
                <div style={{ fontSize: 7, color: '#ffffff55', marginTop: 3 }}>{a.role}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* System health */}
        <Section title="SYSTÈME BACKEND">
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <StatPill label="API" val={health?.status ?? '…'} col={health?.status === 'ok' ? '#00e676' : '#ff3366'} />
            <StatPill label="NEXUS" val={nexus?.connected ? 'CONNECTÉ' : 'HORS LIGNE'} col={nexus?.connected ? '#00e676' : '#ff3366'} />
            <StatPill label="UPTIME" val={fmtUptime(health?.uptime)} col="#00d4ff" />
          </div>
          <button onClick={() => void checkHealth()} disabled={loadingH} style={actionBtn('#00d4ff')}>
            {loadingH ? 'TEST…' : '↻ TESTER'}
          </button>
        </Section>

        {/* Cache */}
        <Section title="CACHE">
          <button onClick={() => void clearCache()} disabled={clearing} style={actionBtn('#ffb347')}>
            {clearing ? 'VIDAGE…' : '⚡ VIDER CACHE BI (5 min → 0)'}
          </button>
        </Section>

        {/* Scheduler jobs */}
        {jobs.length > 0 && (
          <Section title="JOBS SCHEDULÉS">
            {jobs.map(j => (
              <div key={j.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</div>
                  <div style={{ fontSize: 7, color: '#ffffff44' }}>{j.cron} · prochain: {fmtNext(j.next)}</div>
                </div>
                <button
                  onClick={() => void triggerJob(j.name)}
                  disabled={triggering === j.name}
                  style={miniBtn}
                >
                  {triggering === j.name ? '…' : '▶'}
                </button>
              </div>
            ))}
          </Section>
        )}

        {/* Version */}
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff22', letterSpacing: '0.3em' }}>
            DZARYX SIMULATOR v1.1 · FIK CONCIERGERIE ORAN
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a1520', borderRadius: 10, padding: '10px 12px', border: '1px solid #ffffff08' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff44', letterSpacing: '0.25em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function StatPill({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', background: `${col}11`, borderRadius: 6, padding: '4px 6px', border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 7, color: `${col}88`, letterSpacing: '0.15em' }}>{label}</div>
      <div style={{ fontSize: 8, color: col, fontFamily: 'Orbitron', marginTop: 1 }}>{val}</div>
    </div>
  );
}

function actionBtn(col: string): React.CSSProperties {
  return {
    background: 'transparent', border: `1px solid ${col}66`, borderRadius: 6,
    padding: '6px 10px', fontFamily: 'Orbitron', fontSize: 7,
    color: `${col}cc`, cursor: 'pointer', letterSpacing: '0.15em', width: '100%',
  };
}

const miniBtn: React.CSSProperties = {
  background: '#00d4ff22', border: '1px solid #00d4ff44', borderRadius: 4,
  width: 24, height: 24, cursor: 'pointer', color: '#00d4ff', fontSize: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
