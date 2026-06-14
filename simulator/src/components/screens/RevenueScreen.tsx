import { useState, useEffect } from 'react';
import { business, type RevenueSummary, type FinancialReport } from '../../services/api.ts';

const SCORE_COL: Record<string, string> = {
  VIP: '#ffd700', FREQUENT: '#10b981', FRÉQUENT: '#10b981',
  REGULAR: '#00e676', RÉGULIER: '#00e676', NEW: '#ffffff66', NOUVEAU: '#ffffff66',
};
const MONTH_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];

export default function RevenueScreen({ actor = 'kouider' }: { actor?: string }) {
  const isHouari = actor === 'houari';
  const now = new Date();
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [rev, setRev]                   = useState<RevenueSummary | null>(null);
  const [report, setReport]             = useState<FinancialReport | null>(null);
  const [annualReport, setAnnualReport] = useState<FinancialReport | null>(null);
  const [loading, setLoad]        = useState(true);
  const [clearing, setClear]      = useState(false);
  const [msg, setMsg]             = useState('');
  const [tab, setTab]             = useState<'overview' | 'detail' | 'annual'>('overview');

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === (now.getMonth() + 1);

  const load = async () => {
    setLoad(true);
    setRev(null); setReport(null); setAnnualReport(null);
    try {
      const [revRes, repRes, annRes] = await Promise.allSettled([
        isCurrentMonth ? business.fetchRevenue() : Promise.resolve(null),
        business.fetchFinanceReport(viewYear, viewMonth),
        business.fetchFinanceReport(viewYear),
      ]);
      if (revRes.status === 'fulfilled' && revRes.value) setRev(revRes.value);
      if (repRes.status === 'fulfilled') setReport(repRes.value);
      if (annRes.status === 'fulfilled') setAnnualReport(annRes.value);
    } catch { /* keep null */ }
    finally { setLoad(false); }
  };

  useEffect(() => { void load(); }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    const ny = viewMonth === 12 ? viewYear + 1 : viewYear;
    const nm = viewMonth === 12 ? 1 : viewMonth + 1;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setViewYear(ny); setViewMonth(nm);
  };
  const goToNow = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth() + 1); };

  const clearCache = async () => {
    setClear(true);
    try {
      await business.clearCache();
      setMsg('Cache vidé — rechargement…');
      setTimeout(() => { setMsg(''); void load(); }, 1000);
    } catch { setMsg('Erreur cache'); }
    finally { setClear(false); }
  };

  const fmt = (n: number | null | undefined) => {
    if (n == null) return '—';
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${Math.round(n)}€`;
  };

  const isAtNow = isCurrentMonth;

  // Data to display (use report for historical, rev for current month overview)
  const caMonth    = isCurrentMonth && rev ? rev.month_revenue    : (report?.grossCA ?? 0);
  const profitK    = isCurrentMonth && rev ? rev.kouider_profit_month : (report?.kouiderProfit ?? 0);
  const caHouari   = isCurrentMonth && rev ? rev.houari_revenue_month : (report?.ownerTotal ?? 0);
  const nbBookings = isCurrentMonth && rev ? rev.total_bookings_month : (report?.totalBookings ?? 0);
  const encaisse   = report?.encaisse ?? 0;
  const aEncaisser = report?.aEncaisser ?? 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#fff', fontFamily: 'Inter, sans-serif', position: 'relative', overflow: 'hidden' }}>
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Header premium (cohérent avec les autres écrans) */}
      <div style={{ padding: '16px 16px 6px', flexShrink: 0, background: 'rgba(10,10,12,0.97)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Finances</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, background: 'linear-gradient(120deg, #fff, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Revenus</div>
          </div>
          {msg && <span style={{ fontSize: 10, color: '#00e676', fontWeight: 600 }}>{msg}</span>}
        </div>

        {/* Month navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#10b981', letterSpacing: '0.15em' }}>
              {MONTH_FR[viewMonth - 1].toUpperCase()} {viewYear}
            </span>
            {!isAtNow && (
              <button onClick={goToNow} style={{ marginLeft: 8, background: '#10b98118', border: '1px solid #10b98144', borderRadius: 4,
                fontFamily: 'Inter, sans-serif', fontSize: 6, color: '#10b981aa', cursor: 'pointer', padding: '2px 6px' }}>
                ↩ CE MOIS
              </button>
            )}
          </div>
          <button onClick={nextMonth} disabled={isAtNow} style={{ ...navBtn, opacity: isAtNow ? 0.3 : 1 }}>›</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { id: 'overview', label: '◉ MOIS'    },
            { id: 'detail',   label: '≡ RÉSAS'   },
            { id: 'annual',   label: '📊 ANNÉE'  },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '5px', borderRadius: 6,
              background: tab === t.id ? 'rgba(16,185,129,0.15)' : 'transparent',
              border: `1px solid ${tab === t.id ? '#10b98155' : '#ffffff0f'}`,
              fontFamily: 'Inter, sans-serif', fontSize: 6, color: tab === t.id ? '#10b981' : '#ffffff33',
              cursor: 'pointer', letterSpacing: '0.12em',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 6, height: 1, background: 'linear-gradient(90deg, transparent, #10b98144, transparent)' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {report?.dzd && (isHouari || report.dzd.bookings > 0) && (
          <div style={{ borderRadius: 12, border: '1px solid #10b98144', background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(10,10,12,0.6))', padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#10b981', letterSpacing: '0.15em' }}>💱 EN DINARS (DA)</span>
              <span style={{ fontSize: 7, color: '#10b98199' }}>{report.dzd.bookings} location{report.dzd.bookings > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
              {[
                { l: 'CA', v: report.dzd.ca, c: '#10b981' },
                { l: 'ENCAISSÉ', v: report.dzd.encaisse, c: '#00e676' },
                { l: 'À ENCAISSER', v: report.dzd.aEncaisser, c: '#ffb347' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: s.c }}>{Math.round(s.v).toLocaleString('fr-FR')}</div>
                  <div style={{ fontSize: 6, color: `${s.c}88`, letterSpacing: '0.08em', marginTop: 1 }}>{s.l} (DA)</div>
                </div>
              ))}
            </div>
            {/* Détail par associé en dinars */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8, paddingTop: 7, borderTop: '1px solid #ffffff10' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#7c3aed' }}>{Math.round(report.dzd.houariCA).toLocaleString('fr-FR')}</div>
                <div style={{ fontSize: 6, color: '#7c3aed88', letterSpacing: '0.08em' }}>HOUARI CA (DA)</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#00e5ff' }}>{Math.round(report.dzd.kouiderProfit ?? 0).toLocaleString('fr-FR')}</div>
                <div style={{ fontSize: 6, color: '#00e5ff88', letterSpacing: '0.08em' }}>KOUIDER BÉNÉF. (DA)</div>
              </div>
            </div>
            <div style={{ fontSize: 6.5, color: '#ffffff33', textAlign: 'center', marginTop: 7 }}>Séparé du CA en euros · Houari = CA complet, Kouider = bénéfice net (CA − prix proprio)</div>
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#10b98133', letterSpacing: '0.25em' }}>
            CHARGEMENT…
          </div>
        ) : tab === 'overview' ? (
          <OverviewTab
            rev={rev} report={report}
            caMonth={caMonth} profitK={profitK} caHouari={caHouari}
            nbBookings={nbBookings} encaisse={encaisse} aEncaisser={aEncaisser}
            isCurrentMonth={isCurrentMonth} fmt={fmt}
          />
        ) : tab === 'detail' ? (
          <DetailTab report={report} fmt={fmt} />
        ) : (
          <AnnualTab report={annualReport} year={viewYear} fmt={fmt} />
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => void load()} style={{ ...aBtn('#10b981'), flex: 1 }}>↻ ACTUALISER</button>
          {isCurrentMonth && (
            <button onClick={() => void clearCache()} disabled={clearing} style={{ ...aBtn('#ff6b00'), flex: 1 }}>
              {clearing ? '…' : '⚡ CACHE'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ rev, report, caMonth, profitK, caHouari, nbBookings, encaisse, aEncaisser, isCurrentMonth, fmt }: {
  rev: RevenueSummary | null; report: FinancialReport | null;
  caMonth: number; profitK: number; caHouari: number;
  nbBookings: number; encaisse: number; aEncaisser: number;
  isCurrentMonth: boolean; fmt: (n: number | null | undefined) => string;
}) {
  const vsLast     = rev?.month_vs_last_pct ?? 0;
  const vsLastCol  = vsLast >= 0 ? '#00e676' : '#ff3366';
  const vsLastSign = vsLast >= 0 ? '+' : '';

  return (
    <>
      {/* CA + variation */}
      <div style={{ textAlign: 'center', background: 'rgba(16,185,129,0.05)', borderRadius: 12, padding: '14px', border: '1px solid #10b9811a' }}>
        <div style={{ fontSize: 7, color: '#10b98155', letterSpacing: '0.25em', fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>CA TOTAL</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 32, color: '#10b981', textShadow: '0 0 20px #10b98155' }}>
          {fmt(caMonth)}
        </div>
        {isCurrentMonth && vsLast !== 0 && (
          <div style={{ marginTop: 4, fontSize: 7, color: vsLastCol, fontFamily: 'Inter, sans-serif', letterSpacing: '0.1em' }}>
            {vsLastSign}{Math.round(vsLast)}% vs mois précédent ({fmt(rev?.last_month_revenue)})
          </div>
        )}
        {isCurrentMonth && rev && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9b59b6' }}>{fmt(rev.today_revenue)}</div>
              <div style={{ fontSize: 6, color: '#9b59b666', letterSpacing: '0.1em' }}>AUJOURD'HUI</div>
            </div>
            <div style={{ width: 1, background: '#ffffff12' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#7c3aed' }}>{fmt(rev.week_revenue)}</div>
              <div style={{ fontSize: 6, color: '#7c3aed66', letterSpacing: '0.1em' }}>SEMAINE</div>
            </div>
          </div>
        )}
      </div>

      {/* Kouider / Houari split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ background: 'rgba(0,229,255,0.07)', borderRadius: 10, padding: '10px', border: '1px solid #00e5ff22' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#00e5ff18', border: '1.5px solid #00e5ff44',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#00e5ff' }}>K</div>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#00e5ffaa', letterSpacing: '0.15em' }}>KOUIDER</span>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, color: '#00e5ff', textShadow: '0 0 10px #00e5ff44' }}>
            {fmt(profitK)}
          </div>
          <div style={{ fontSize: 6, color: '#00e5ff44', marginTop: 2 }}>bénéfice net</div>
          {report && (
            <div style={{ fontSize: 6, color: '#ffffff22', marginTop: 4 }}>
              {report.kouiderBookings} résas · {fmt(report.encaisse)} encaissé
            </div>
          )}
        </div>

        <div style={{ background: 'rgba(124,58,237,0.07)', borderRadius: 10, padding: '10px', border: '1px solid #7c3aed22' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#7c3aed18', border: '1.5px solid #7c3aed44',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#7c3aed' }}>H</div>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#7c3aedaa', letterSpacing: '0.15em' }}>HOUARI</span>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, color: '#7c3aed', textShadow: '0 0 10px #7c3aed44' }}>
            {fmt(caHouari)}
          </div>
          <div style={{ fontSize: 6, color: '#7c3aed44', marginTop: 2 }}>CA véhicules</div>
          {report && (
            <div style={{ fontSize: 6, color: '#ffffff22', marginTop: 4 }}>
              {report.houariBookings} résas
            </div>
          )}
        </div>
      </div>

      {/* Payment stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <StatMini label="RÉSAS" val={String(nbBookings)} col="#10b981" />
        <StatMini label="ENCAISSÉ" val={fmt(encaisse)} col="#00e676" />
        <StatMini label="À ENCAISSER" val={fmt(aEncaisser)} col="#ff3366" />
      </div>

      {/* Warnings */}
      {(report?.missingOwnerPrice ?? 0) > 0 && (
        <WarningBar icon="⚠️" text={`${report!.missingOwnerPrice} résa(s) sans prix propriétaire`} col="#ffb347" />
      )}
      {isCurrentMonth && (rev?.total_unpaid_receivables ?? 0) > 0 && (
        <WarningBar icon="💸" text={`Créances impayées: ${fmt(rev!.total_unpaid_receivables)}`} col="#ff3366" />
      )}

      {/* Per-vehicle breakdown from report */}
      {(report?.bookings ?? []).length > 0 && (
        <VehicleBreakdown bookings={report!.bookings} fmt={fmt} />
      )}

      {/* Top clients (current month only) */}
      {isCurrentMonth && (rev?.top_clients?.length ?? 0) > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px', border: '1px solid #ffffff0a' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#ffffff44', letterSpacing: '0.25em', marginBottom: 10 }}>TOP CLIENTS</div>
          {rev!.top_clients.slice(0, 5).map((c, i) => {
            const scoreCol = SCORE_COL[c.score?.toUpperCase() ?? ''] ?? '#ffffff44';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#ffffff22', minWidth: 14 }}>{i + 1}</span>
                <div style={{ padding: '2px 5px', borderRadius: 4, fontSize: 6, background: `${scoreCol}18`, color: scoreCol,
                  fontFamily: 'Inter, sans-serif', letterSpacing: '0.1em', minWidth: 28, textAlign: 'center' }}>
                  {(c.score ?? 'NEW').slice(0, 4).toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 10, color: '#c8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.client_name}</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#ffd700', flexShrink: 0 }}>{fmt(c.total_spent)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Detail Tab ───────────────────────────────────────────────────────────────

function DetailTab({ report, fmt }: { report: FinancialReport | null; fmt: (n: number | null | undefined) => string }) {
  if (!report) return (
    <div style={{ textAlign: 'center', padding: 20, fontSize: 8, color: '#ffffff22' }}>Aucune donnée</div>
  );

  const STATUS_COL: Record<string, string> = {
    CONFIRMED: '#00e676', PENDING: '#ffb347', ACTIVE: '#10b981',
    COMPLETED: '#ffffff55', REJECTED: '#ff3366',
  };
  const PAID_COL: Record<string, string> = {
    PAID: '#00e676', PARTIAL: '#ffb347', UNPAID: '#ff3366', PENDING: '#ffffff44',
  };

  return (
    <>
      {/* Summary row */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px', border: '1px solid #ffffff08',
        display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <InfoChip label="Résas" val={String(report.totalBookings)} col="#10b981" />
        <InfoChip label="CA brut" val={fmt(report.grossCA)} col="#00e676" />
        <InfoChip label="Profit K" val={fmt(report.kouiderProfit)} col="#ffd700" />
        <InfoChip label="À encaisser" val={fmt(report.aEncaisser)} col="#ff3366" />
      </div>

      {/* Per-booking list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {report.bookings.map(b => {
          const sc = STATUS_COL[b.status] ?? '#ffffff44';
          const pc = PAID_COL[b.payment_status] ?? '#ffffff44';
          const rentCol = b.rented_by === 'Houari' ? '#7c3aed' : '#00e5ff';
          return (
            <div key={b.id} style={{ borderRadius: 10, border: `1px solid ${sc}1a`, background: `${sc}05`, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#e8f4ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                  {b.client_name}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 6, color: rentCol, fontFamily: 'Inter, sans-serif', background: `${rentCol}14`, padding: '2px 5px', borderRadius: 3 }}>
                    {b.rented_by.slice(0, 1).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 6, color: sc, fontFamily: 'Inter, sans-serif', background: `${sc}14`, padding: '2px 5px', borderRadius: 3 }}>
                    {b.status.slice(0, 4)}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 7, color: '#ffffff44', marginBottom: 3 }}>
                {b.car_name} · {b.start_date.slice(5)} → {b.end_date.slice(5)} ({b.nb_days}j)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {b.client_price_per_day != null && (
                  <span style={{ fontSize: 7, color: '#10b98166' }}>{b.client_price_per_day}€/j</span>
                )}
                {b.kouider_profit != null && (
                  <span style={{ fontSize: 7, color: '#ffd70088' }}>profit: {fmt(b.kouider_profit)}</span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 6, color: pc, fontFamily: 'Inter, sans-serif', background: `${pc}14`, padding: '2px 5px', borderRadius: 3 }}>
                  {b.payment_status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Annual Tab ───────────────────────────────────────────────────────────────

function AnnualTab({ report, year, fmt }: {
  report: FinancialReport | null; year: number;
  fmt: (n: number | null | undefined) => string;
}) {
  if (!report) return (
    <div style={{ textAlign: 'center', padding: 20, fontSize: 8, color: '#ffffff22' }}>Aucune donnée annuelle</div>
  );

  // Per-vehicle annual breakdown
  const byVehicle: Record<string, { ca: number; profitK: number; caH: number; count: number }> = {};
  for (const b of report.bookings) {
    if (b.status === 'REJECTED') continue;
    const v = b.car_name || '—';
    if (!byVehicle[v]) byVehicle[v] = { ca: 0, profitK: 0, caH: 0, count: 0 };
    byVehicle[v].ca     += b.final_price ?? 0;
    byVehicle[v].count  += 1;
    if (b.rented_by === 'Kouider') byVehicle[v].profitK += b.kouider_profit ?? 0;
    if (b.rented_by === 'Houari')  byVehicle[v].caH     += b.owner_total ?? 0;
  }
  const vehicles = Object.entries(byVehicle).sort((a, b) => b[1].ca - a[1].ca);
  const maxCA = Math.max(...vehicles.map(v => v[1].ca), 1);

  return (
    <>
      {/* Year header */}
      <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#10b98155', letterSpacing: '0.3em', marginBottom: 2 }}>
        BILAN {year}
      </div>

      {/* Big annual CA */}
      <div style={{ textAlign: 'center', background: 'rgba(16,185,129,0.05)', borderRadius: 12, padding: '14px', border: '1px solid #10b9811a' }}>
        <div style={{ fontSize: 7, color: '#10b98144', letterSpacing: '0.25em', fontFamily: 'Inter, sans-serif', marginBottom: 4 }}>CA ANNUEL TOTAL</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 34, color: '#10b981', textShadow: '0 0 20px #10b98155', lineHeight: 1 }}>
          {fmt(report.grossCA)}
        </div>
        <div style={{ marginTop: 6, fontSize: 7, color: '#ffffff33' }}>
          {report.totalBookings} réservations · {report.encaisse > 0 ? `${fmt(report.encaisse)} encaissé` : ''}
        </div>
        {report.aEncaisser > 0 && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,179,71,0.12)', border: '1px solid #ffb34744', borderRadius: 9, padding: '6px 12px' }}>
            <span style={{ fontSize: 11 }}>💸</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#ffb347' }}>Reste à encaisser :</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ffb347', fontWeight: 700 }}>{fmt(report.aEncaisser)}</span>
          </div>
        )}
      </div>

      {/* K / H annual split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {/* Kouider annual */}
        <div style={{ background: 'rgba(0,229,255,0.07)', borderRadius: 12, padding: '12px', border: '1px solid #00e5ff22' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#00e5ff18', border: '1.5px solid #00e5ff55',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#00e5ff' }}>K</div>
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#00e5ffaa', letterSpacing: '0.2em' }}>KOUIDER</div>
              <div style={{ fontSize: 6, color: '#ffffff22' }}>{report.kouiderBookings} résas</div>
            </div>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, color: '#00e5ff', textShadow: '0 0 12px #00e5ff44' }}>
            {fmt(report.kouiderProfit)}
          </div>
          <div style={{ fontSize: 6, color: '#00e5ff44', marginTop: 3 }}>bénéfice net annuel</div>
          <div style={{ marginTop: 6, height: 1, background: '#00e5ff10' }} />
          <div style={{ fontSize: 6, color: '#ffffff22', marginTop: 5 }}>
            Encaissé: {fmt(report.encaisse)}
          </div>
        </div>

        {/* Houari annual */}
        <div style={{ background: 'rgba(124,58,237,0.07)', borderRadius: 12, padding: '12px', border: '1px solid #7c3aed22' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#7c3aed18', border: '1.5px solid #7c3aed55',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#7c3aed' }}>H</div>
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#7c3aedaa', letterSpacing: '0.2em' }}>HOUARI</div>
              <div style={{ fontSize: 6, color: '#ffffff22' }}>{report.houariBookings} résas</div>
            </div>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, color: '#7c3aed', textShadow: '0 0 12px #7c3aed44' }}>
            {fmt(report.ownerTotal)}
          </div>
          <div style={{ fontSize: 6, color: '#7c3aed44', marginTop: 3 }}>CA véhicules annuel</div>
          <div style={{ marginTop: 6, height: 1, background: '#7c3aed10' }} />
          <div style={{ fontSize: 6, color: '#ffffff22', marginTop: 5 }}>
            À encaisser: {fmt(report.aEncaisser)}
          </div>
        </div>
      </div>

      {/* Warnings */}
      {report.missingOwnerPrice > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 8,
          background: 'rgba(255,179,71,0.07)', border: '1px solid #ffb34722' }}>
          <span style={{ fontSize: 12 }}>⚠️</span>
          <span style={{ fontSize: 8, color: '#ffb347aa', lineHeight: 1.4 }}>
            {report.missingOwnerPrice} résa(s) sans prix propriétaire — profit partiel
          </span>
        </div>
      )}

      {/* Per-vehicle annual breakdown */}
      {vehicles.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px', border: '1px solid #ffffff08' }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#ffffff33', letterSpacing: '0.25em', marginBottom: 10 }}>
            PAR VÉHICULE — {year}
          </div>
          {vehicles.map(([name, stats]) => (
            <div key={name} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#c8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {name}
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: '#10b981', flexShrink: 0, marginLeft: 8 }}>
                  {fmt(stats.ca)}
                </span>
              </div>
              <div style={{ height: 4, background: '#ffffff08', borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                <div style={{ height: '100%', width: `${(stats.ca / maxCA) * 100}%`,
                  background: 'linear-gradient(90deg, #10b98155, #10b981)', borderRadius: 2 }} />
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 6, color: '#ffffff22' }}>
                <span>{stats.count} résa(s)</span>
                {stats.profitK > 0 && <span style={{ color: '#00e5ff33' }}>K: {fmt(stats.profitK)}</span>}
                {stats.caH    > 0 && <span style={{ color: '#7c3aed44' }}>H: {fmt(stats.caH)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Per-vehicle breakdown ────────────────────────────────────────────────────

function VehicleBreakdown({ bookings, fmt }: { bookings: FinancialReport['bookings']; fmt: (n: number | null | undefined) => string }) {
  const byVehicle: Record<string, { ca: number; profit: number; count: number }> = {};
  for (const b of bookings) {
    if (b.status === 'REJECTED') continue;
    const v = b.car_name || '—';
    if (!byVehicle[v]) byVehicle[v] = { ca: 0, profit: 0, count: 0 };
    byVehicle[v].ca     += b.final_price ?? 0;
    byVehicle[v].profit += b.kouider_profit ?? 0;
    byVehicle[v].count  += 1;
  }
  const vehicles = Object.entries(byVehicle).sort((a, b) => b[1].ca - a[1].ca);
  if (!vehicles.length) return null;
  const maxCA = Math.max(...vehicles.map(v => v[1].ca), 1);

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px', border: '1px solid #ffffff08' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 7, color: '#ffffff33', letterSpacing: '0.25em', marginBottom: 10 }}>
        PAR VÉHICULE
      </div>
      {vehicles.map(([name, stats]) => (
        <div key={name} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 9, color: '#c8e8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, color: '#10b981', flexShrink: 0, marginLeft: 8 }}>{fmt(stats.ca)}</span>
          </div>
          <div style={{ height: 3, background: '#ffffff0a', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(stats.ca / maxCA) * 100}%`, background: 'linear-gradient(90deg, #10b98188, #10b981)', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 6, color: '#ffffff22', marginTop: 1 }}>
            {stats.count} résa(s) · profit: {fmt(stats.profit)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function StatMini({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ background: '#16161c', borderRadius: 14, padding: '12px 6px', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, fontWeight: 800, color: col }}>{val}</div>
      <div style={{ fontSize: 10, color: '#9b9ba6', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function InfoChip({ label, val, col }: { label: string; val: string; col: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 10, color: '#9b9ba6' }}>{label}</div>
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

const navBtn: React.CSSProperties = {
  background: 'rgba(16,185,129,0.08)', border: '1px solid #10b98122', borderRadius: 6,
  width: 26, height: 26, cursor: 'pointer', color: '#10b981aa',
  fontFamily: 'Inter, sans-serif', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function aBtn(col: string): React.CSSProperties {
  return {
    background: `${col}0f`, border: `1px solid ${col}44`, borderRadius: 8,
    padding: '7px 10px', fontFamily: 'Inter, sans-serif', fontSize: 7,
    color: `${col}cc`, cursor: 'pointer', letterSpacing: '0.15em',
  };
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 12, t = 1.5, col = 'transparent';
  const bT = pos.startsWith('t') ? `${t}px solid ${col}33` : 'none';
  const bB = pos.startsWith('b') ? `${t}px solid ${col}33` : 'none';
  const bL = pos.endsWith('l')   ? `${t}px solid ${col}33` : 'none';
  const bR = pos.endsWith('r')   ? `${t}px solid ${col}33` : 'none';
  const h  = pos.endsWith('l')   ? { left: 4 }  : { right: 4 };
  const v  = pos.startsWith('t') ? { top: 4 }   : { bottom: 4 };
  return <div style={{ position: 'absolute', zIndex: 1, width: s, height: s, borderTop: bT, borderBottom: bB, borderLeft: bL, borderRight: bR, ...h, ...v }} />;
}
