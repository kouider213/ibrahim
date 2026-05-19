import { useState, useEffect } from 'react';
import { business, type RevenueSummary } from '../../services/api.ts';

const SCORE_COL: Record<string, string> = {
  VIP: '#ffd700', FREQUENT: '#00d4ff', FRÉQUENT: '#00d4ff',
  REGULAR: '#00e676', RÉGULIER: '#00e676', NEW: '#ffffff66', NOUVEAU: '#ffffff66',
};

export default function RevenueScreen() {
  const [rev, setRev]        = useState<RevenueSummary | null>(null);
  const [loading, setLoad]   = useState(true);
  const [clearing, setClear] = useState(false);
  const [msg, setMsg]        = useState('');

  const load = async () => {
    setLoad(true);
    try { setRev(await business.fetchRevenue()); }
    catch { setRev(null); }
    finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, []);

  const clearCache = async () => {
    setClear(true);
    try {
      await business.clearCache();
      setMsg('Cache vidé — rechargement…');
      setTimeout(() => { setMsg(''); void load(); }, 1000);
    } catch { setMsg('Erreur cache'); }
    finally { setClear(false); }
  };

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020810' }}>
      <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#00d4ff33', letterSpacing: '0.25em' }}>CHARGEMENT…</span>
    </div>
  );

  if (!rev) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020810', gap: 12 }}>
      <span style={{ fontSize: 9, color: '#ff336688', fontFamily: 'Share Tech Mono' }}>Erreur de chargement</span>
      <button onClick={() => void load()} style={aBtn('#ff3366')}>RÉESSAYER</button>
    </div>
  );

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;
  const maxCA = Math.max(rev.today_revenue, rev.week_revenue / 7, rev.month_revenue / 30, 1);
  const vsLast = rev.month_vs_last_pct ?? 0;
  const vsLastCol = vsLast >= 0 ? '#00e676' : '#ff3366';
  const vsLastSign = vsLast >= 0 ? '+' : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#020810', color: '#fff', fontFamily: 'Share Tech Mono', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #00d4ff12', flexShrink: 0, background: 'rgba(2,8,16,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 11, color: '#00d4ff', letterSpacing: '0.3em', fontWeight: 700, textShadow: '0 0 12px #00d4ff55' }}>
            REVENUS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {vsLast !== 0 && (
              <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: vsLastCol, letterSpacing: '0.1em',
                background: `${vsLastCol}14`, padding: '2px 6px', borderRadius: 4 }}>
                {vsLastSign}{Math.round(vsLast)}% vs mois-1
              </span>
            )}
          </div>
        </div>
        {msg && <div style={{ fontSize: 8, color: '#00e676', letterSpacing: '0.1em' }}>{msg}</div>}
        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #00d4ff44, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Big 3 CA cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <CACard label="AUJOURD'HUI" val={fmt(rev.today_revenue)} col="#00d4ff" />
          <CACard label="SEMAINE" val={fmt(rev.week_revenue)} col="#9b59b6" />
          <CACard label="MOIS" val={fmt(rev.month_revenue)} col="#00e676" />
        </div>

        {/* Kouider vs Houari breakdown */}
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px', border: '1px solid #ffffff08' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff33', letterSpacing: '0.25em', marginBottom: 10 }}>
            RÉPARTITION CE MOIS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {/* Kouider block */}
            <div style={{ background: 'rgba(0,229,255,0.07)', borderRadius: 10, padding: '10px', border: '1px solid #00e5ff22' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#00e5ff18', border: '1.5px solid #00e5ff44',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Orbitron', fontSize: 9, color: '#00e5ff' }}>K</div>
                <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00e5ffaa', letterSpacing: '0.15em' }}>KOUIDER</span>
              </div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#00e5ff', textShadow: '0 0 10px #00e5ff44', marginBottom: 2 }}>
                {fmt(rev.kouider_profit_month)}
              </div>
              <div style={{ fontSize: 6, color: '#00e5ff55' }}>bénéfice net</div>
              <div style={{ marginTop: 5, height: 1, background: '#00e5ff12' }} />
              <div style={{ fontSize: 6, color: '#ffffff33', marginTop: 4 }}>
                CA mois: {fmt(rev.month_revenue)}
              </div>
            </div>

            {/* Houari block */}
            <div style={{ background: 'rgba(124,58,237,0.07)', borderRadius: 10, padding: '10px', border: '1px solid #7c3aed22' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#7c3aed18', border: '1.5px solid #7c3aed44',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Orbitron', fontSize: 9, color: '#7c3aed' }}>H</div>
                <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#7c3aedaa', letterSpacing: '0.15em' }}>HOUARI</span>
              </div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 16, color: '#7c3aed', textShadow: '0 0 10px #7c3aed44', marginBottom: 2 }}>
                {fmt(rev.houari_revenue_month ?? 0)}
              </div>
              <div style={{ fontSize: 6, color: '#7c3aed55' }}>CA véhicules Houari</div>
              <div style={{ marginTop: 5, height: 1, background: '#7c3aed12' }} />
              <div style={{ fontSize: 6, color: '#ffffff33', marginTop: 4 }}>
                {rev.total_bookings_month} résas ce mois
              </div>
            </div>
          </div>
        </div>

        {/* Chart bars */}
        <div style={{ background: 'rgba(0,212,255,0.04)', borderRadius: 12, padding: '12px', border: '1px solid #00d4ff18' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#00d4ff55', letterSpacing: '0.2em', marginBottom: 10 }}>
            CA COMPARATIF (JOUR MOYEN)
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 60 }}>
            {[
              { label: "AUJ.", val: rev.today_revenue, col: '#00d4ff' },
              { label: "SEM/7", val: rev.week_revenue / 7, col: '#9b59b6' },
              { label: "MOIS/30", val: rev.month_revenue / 30, col: '#00e676' },
              { label: "MOIS-1", val: (rev.last_month_revenue ?? 0) / 30, col: '#ffffff33' },
            ].map(({ label, val, col }) => {
              const pct = Math.min(val / maxCA, 1);
              return (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 7, color: col, textShadow: col !== '#ffffff33' ? `0 0 6px ${col}` : 'none' }}>
                    {Math.round(val)}€
                  </span>
                  <div style={{ width: '100%', height: 40, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{
                      width: '100%', height: `${Math.max(pct * 40, 4)}px`,
                      background: `linear-gradient(180deg, ${col}, ${col}44)`,
                      borderRadius: '3px 3px 0 0',
                      boxShadow: col !== '#ffffff33' ? `0 0 8px ${col}55` : 'none',
                    }} />
                  </div>
                  <span style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.1em' }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <StatCard
            label="BÉNÉFICE KOUIDER"
            val={fmt(rev.kouider_profit_month)}
            sub="ce mois"
            col="#ffd700"
            icon="💰"
          />
          <StatCard
            label="RÉSERVATIONS"
            val={String(rev.total_bookings_month)}
            sub={rev.avg_booking_value ? `moy: ${fmt(rev.avg_booking_value)}` : 'ce mois'}
            col="#00d4ff"
            icon="📋"
          />
        </div>

        {/* Warnings */}
        {((rev.missing_owner_price ?? 0) > 0 || (rev.total_unpaid_receivables ?? 0) > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(rev.missing_owner_price ?? 0) > 0 && (
              <WarningBar
                icon="⚠️"
                text={`${rev.missing_owner_price} résa(s) sans prix propriétaire — profit non calculé`}
                col="#ffb347"
              />
            )}
            {(rev.total_unpaid_receivables ?? 0) > 0 && (
              <WarningBar
                icon="💸"
                text={`Créances impayées: ${fmt(rev.total_unpaid_receivables)}`}
                col="#ff3366"
              />
            )}
            {(rev.rejected_count ?? 0) > 0 && (
              <WarningBar
                icon="🚫"
                text={`${rev.rejected_count} résas rejetées — CA perdu: ${fmt(rev.rejected_revenue_lost ?? 0)}`}
                col="#ff336688"
              />
            )}
          </div>
        )}

        {/* Top clients */}
        {rev.top_clients?.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px', border: '1px solid #ffffff0a' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 7, color: '#ffffff44', letterSpacing: '0.25em', marginBottom: 10 }}>
              TOP CLIENTS
            </div>
            {rev.top_clients.slice(0, 5).map((c, i) => {
              const scoreCol = SCORE_COL[c.score?.toUpperCase() ?? ''] ?? '#ffffff44';
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 8, color: '#ffffff22', minWidth: 14 }}>
                    {i + 1}
                  </span>
                  <div style={{
                    padding: '2px 5px', borderRadius: 4, fontSize: 6,
                    background: `${scoreCol}18`, color: scoreCol,
                    fontFamily: 'Orbitron', letterSpacing: '0.1em', minWidth: 28, textAlign: 'center',
                  }}>
                    {(c.score ?? 'NEW').slice(0, 4).toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: 10, color: '#c8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.client_name}
                  </span>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 9, color: '#ffd700', flexShrink: 0, textShadow: '0 0 8px #ffd70044' }}>
                    {fmt(c.total_spent)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => void load()} style={{ ...aBtn('#00d4ff'), flex: 1 }}>↻ ACTUALISER</button>
          <button onClick={() => void clearCache()} disabled={clearing} style={{ ...aBtn('#ff6b00'), flex: 1 }}>
            {clearing ? '…' : '⚡ VIDER CACHE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CACard({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ background: `${col}0a`, borderRadius: 10, padding: '10px 8px', border: `1px solid ${col}2a`, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 14, color: col, textShadow: `0 0 10px ${col}55` }}>{val}</div>
      <div style={{ fontSize: 6, color: `${col}66`, letterSpacing: '0.12em', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function StatCard({ label, val, sub, col, icon }: { label: string; val: string; sub: string; col: string; icon: string }) {
  return (
    <div style={{ background: `${col}06`, borderRadius: 12, padding: '12px', border: `1px solid ${col}22`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 18, opacity: 0.12 }}>{icon}</div>
      <div style={{ fontSize: 7, color: `${col}77`, letterSpacing: '0.2em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Orbitron', fontSize: 20, color: col, textShadow: `0 0 12px ${col}66` }}>
        {val}
      </div>
      <div style={{ fontSize: 7, color: '#ffffff2a', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function WarningBar({ icon, text, col }: { icon: string; text: string; col: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 8,
      background: `${col}0a`, border: `1px solid ${col}22` }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 8, color: `${col}cc`, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function aBtn(col: string): React.CSSProperties {
  return {
    background: `${col}0f`, border: `1px solid ${col}44`, borderRadius: 8,
    padding: '7px 10px', fontFamily: 'Orbitron', fontSize: 7,
    color: `${col}cc`, cursor: 'pointer', letterSpacing: '0.15em',
  };
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
