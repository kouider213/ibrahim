import { useState, useEffect } from 'react';
import { business, type RevenueSummary, type FinancialReport } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, Segmented, Kpi, KpiGrid, Card, Row, Avatar, Badge, Btn, SectionTitle, Empty, money } from '../ui/Kit.tsx';

const SCORE_COL: Record<string, string> = {
  VIP: T.warn, FREQUENT: T.accent, FRÉQUENT: T.accent, A: T.accent,
  REGULAR: T.ok, RÉGULIER: T.ok, B: T.ok, NEW: T.muted, NOUVEAU: T.muted,
};
const MONTH_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const K_COL = T.accent, H_COL = T.violet;
type Fmt = (n: number | null | undefined) => string;

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

  const fmt: Fmt = (n) => money(n);

  const isAtNow = isCurrentMonth;

  // Data to display (use report for historical, rev for current month overview)
  const caMonth    = isCurrentMonth && rev ? rev.month_revenue    : (report?.grossCA ?? 0);
  const profitK    = isCurrentMonth && rev ? rev.kouider_profit_month : (report?.kouiderProfit ?? 0);
  const caHouari   = isCurrentMonth && rev ? rev.houari_revenue_month : (report?.ownerTotal ?? 0);
  const nbBookings = isCurrentMonth && rev ? rev.total_bookings_month : (report?.totalBookings ?? 0);
  const encaisse   = report?.encaisse ?? 0;
  const aEncaisser = report?.aEncaisser ?? 0;

  const navBtn = (dis: boolean): React.CSSProperties => ({ width: 44, height: 44, borderRadius: 13, border: `1px solid ${T.line}`, background: T.surface, color: dis ? T.faint : T.accent, fontSize: 22, cursor: dis ? 'default' : 'pointer', opacity: dis ? 0.4 : 1, flexShrink: 0 });

  return (
    <Screen toast={msg} header={<>
      <PageHeader eyebrow="Finances" title="Chiffre d'affaires" subtitle={isHouari ? 'Tes locations et ton CA' : 'Ma marge, la part de Houari, ce qui reste à encaisser'} />
      <div style={{ padding: '0 16px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={prevMonth} aria-label="Mois précédent" style={navBtn(false)}>‹</button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{MONTH_FR[viewMonth - 1]} {viewYear}</div>
            {!isAtNow && <button onClick={goToNow} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 2, fontFamily: T.font }}>↩ Revenir à ce mois</button>}
          </div>
          <button onClick={nextMonth} disabled={isAtNow} aria-label="Mois suivant" style={navBtn(isAtNow)}>›</button>
        </div>
        <Segmented<'overview' | 'detail' | 'annual'> value={tab} onChange={setTab} items={[
          { id: 'overview', label: 'Mois' }, { id: 'detail', label: 'Réservations', count: report?.totalBookings || undefined }, { id: 'annual', label: `Année ${viewYear}` },
        ]} />
      </div>
    </>}>
      {loading ? <SkeletonCards count={4} height={110} /> : tab === 'overview' ? (
        <OverviewTab rev={rev} report={report} caMonth={caMonth} profitK={profitK} caHouari={caHouari}
          nbBookings={nbBookings} encaisse={encaisse} aEncaisser={aEncaisser} isCurrentMonth={isCurrentMonth} fmt={fmt} isHouari={isHouari} />
      ) : tab === 'detail' ? (
        <DetailTab report={report} fmt={fmt} />
      ) : (
        <AnnualTab report={annualReport} year={viewYear} fmt={fmt} />
      )}

      {!loading && report?.dzd && (isHouari || report.dzd.bookings > 0) && (
        <Card accent={T.violet} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>💱 En dinars</div>
            <Badge color={T.violet}>{report.dzd.bookings} location{report.dzd.bookings > 1 ? 's' : ''}</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {[{ l: 'CA', v: report.dzd.ca, c: T.text }, { l: 'Encaissé', v: report.dzd.encaisse, c: T.ok }, { l: 'À encaisser', v: report.dzd.aEncaisser, c: T.warn }].map(x => (
              <div key={x.l}><div style={{ fontSize: 16, fontWeight: 800, color: x.c }}>{money(x.v, 'DZD')}</div><div style={{ fontSize: 12, color: T.muted }}>{x.l}</div></div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            <div><div style={{ fontSize: 15, fontWeight: 800, color: H_COL }}>{money(report.dzd.houariCA, 'DZD')}</div><div style={{ fontSize: 12, color: T.muted }}>CA Houari</div></div>
            <div><div style={{ fontSize: 15, fontWeight: 800, color: K_COL }}>{money(report.dzd.kouiderProfit ?? 0, 'DZD')}</div><div style={{ fontSize: 12, color: T.muted }}>Bénéfice Kouider</div></div>
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 10, lineHeight: 1.4 }}>Séparé du CA en euros · Houari = CA complet, Kouider = bénéfice net (CA − prix proprio).</div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Btn onClick={() => void load()} style={{ flex: 1 }}>↻ Actualiser</Btn>
        {isCurrentMonth && <Btn variant="ghost" onClick={() => void clearCache()} disabled={clearing} style={{ flex: 1 }}>{clearing ? '…' : '⚡ Recalculer'}</Btn>}
      </div>
    </Screen>
  );
}

// ─── Petites briques ──────────────────────────────────────────────────────────

function PartnerCard({ who, value, label, sub }: { who: 'K' | 'H'; value: string; label: string; sub?: string }) {
  const c = who === 'K' ? K_COL : H_COL;
  return (
    <Card accent={c}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Avatar name={who} color={c} size={30} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c }}>{who === 'K' ? 'Kouider' : 'Houari'}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function Alert({ icon, text, col }: { icon: string; text: string; col: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 14, background: tone(col, 0.1), border: `1px solid ${tone(col, 0.32)}`, fontSize: 14, color: T.text, marginBottom: 10 }}>
      <span style={{ fontSize: 18 }}>{icon}</span><span style={{ lineHeight: 1.35 }}>{text}</span>
    </div>
  );
}

function Bars({ rows, fmt }: { rows: Array<{ name: string; ca: number; sub: string }>; fmt: Fmt }) {
  const max = Math.max(...rows.map(r => r.ca), 1);
  return (
    <Card>
      {rows.map((r, i) => (
        <div key={r.name} style={{ marginBottom: i < rows.length - 1 ? 14 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
            <span style={{ fontSize: 15, fontWeight: 800, marginLeft: 8 }}>{fmt(r.ca)}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(r.ca / max) * 100}%`, background: `linear-gradient(90deg, ${tone(T.accent, 0.45)}, ${T.accent})`, borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>{r.sub}</div>
        </div>
      ))}
    </Card>
  );
}

// ─── Mois ─────────────────────────────────────────────────────────────────────

function OverviewTab({ rev, report, caMonth, profitK, caHouari, nbBookings, encaisse, aEncaisser, isCurrentMonth, fmt, isHouari }: {
  rev: RevenueSummary | null; report: FinancialReport | null;
  caMonth: number; profitK: number; caHouari: number;
  nbBookings: number; encaisse: number; aEncaisser: number;
  isCurrentMonth: boolean; fmt: Fmt; isHouari: boolean;
}) {
  const vsLast = rev?.month_vs_last_pct ?? 0;

  // Par véhicule (hors réservations refusées)
  const byVehicle: Record<string, { ca: number; profit: number; count: number }> = {};
  for (const b of report?.bookings ?? []) {
    if (b.status === 'REJECTED') continue;
    const v = b.car_name || '—';
    if (!byVehicle[v]) byVehicle[v] = { ca: 0, profit: 0, count: 0 };
    byVehicle[v].ca += b.final_price ?? 0; byVehicle[v].profit += b.kouider_profit ?? 0; byVehicle[v].count += 1;
  }
  const vehicles = Object.entries(byVehicle).sort((a, b) => b[1].ca - a[1].ca)
    .map(([name, st]) => ({ name, ca: st.ca, sub: `${st.count} résa${st.count > 1 ? 's' : ''}${!isHouari ? ` · ma marge ${fmt(st.profit)}` : ''}` }));

  return (
    <>
      {/* CA du mois */}
      <Card style={{ marginBottom: 12, padding: '18px 16px', background: `radial-gradient(120% 120% at 100% 0%, ${tone(T.accent, 0.18)}, transparent 60%), linear-gradient(160deg, ${T.surface2}, ${T.surface})` }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>CA total du mois</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{fmt(caMonth)}</div>
          {isCurrentMonth && vsLast !== 0 && <Badge color={vsLast >= 0 ? T.ok : T.bad}>{vsLast >= 0 ? '▲ +' : '▼ '}{Math.round(vsLast)} % vs mois dernier</Badge>}
        </div>
        {isCurrentMonth && rev && (
          <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}`, fontSize: 13, color: T.muted }}>
            <span>Aujourd'hui <b style={{ color: T.text, fontSize: 15 }}>{fmt(rev.today_revenue)}</b></span>
            <span>Semaine <b style={{ color: T.text, fontSize: 15 }}>{fmt(rev.week_revenue)}</b></span>
            {rev.last_month_revenue > 0 && <span>Mois dernier <b style={{ color: T.text, fontSize: 15 }}>{fmt(rev.last_month_revenue)}</b></span>}
          </div>
        )}
      </Card>

      {/* Kouider / Houari */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
        <PartnerCard who="K" value={fmt(profitK)} label="Bénéfice net" sub={report ? `${report.kouiderBookings} résas` : undefined} />
        <PartnerCard who="H" value={fmt(caHouari)} label="CA véhicules" sub={report ? `${report.houariBookings} résas` : undefined} />
      </div>

      <KpiGrid cols={3}>
        <Kpi value={nbBookings} label="Réservations" color={T.accent} />
        <Kpi value={fmt(encaisse)} label="Encaissé" color={T.ok} />
        <Kpi value={fmt(aEncaisser)} label="À encaisser" color={aEncaisser > 0 ? T.bad : T.ok} />
      </KpiGrid>

      {(report?.missingOwnerPrice ?? 0) > 0 && <Alert icon="⚠️" col={T.warn} text={`${report!.missingOwnerPrice} réservation${report!.missingOwnerPrice > 1 ? 's' : ''} sans prix propriétaire : marge incomplète.`} />}
      {isCurrentMonth && (rev?.total_unpaid_receivables ?? 0) > 0 && <Alert icon="💸" col={T.bad} text={`Créances impayées au total : ${fmt(rev!.total_unpaid_receivables)}.`} />}

      {vehicles.length > 0 && <>
        <SectionTitle>Par véhicule</SectionTitle>
        <div style={{ marginBottom: 16 }}><Bars rows={vehicles} fmt={fmt} /></div>
      </>}

      {isCurrentMonth && (rev?.top_clients?.length ?? 0) > 0 && <>
        <SectionTitle>Meilleurs clients</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rev!.top_clients.slice(0, 5).map((c, i) => {
            const col = SCORE_COL[c.score?.toUpperCase() ?? ''] ?? T.muted;
            return <Row key={i} left={<Avatar name={c.client_name} color={col} size={38} />} title={c.client_name}
              sub={<Badge color={col}>{c.score || 'Nouveau'}</Badge>}
              right={<span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(c.total_spent)}</span>} />;
          })}
        </div>
      </>}
    </>
  );
}

// ─── Réservations du mois ─────────────────────────────────────────────────────

function DetailTab({ report, fmt }: { report: FinancialReport | null; fmt: Fmt }) {
  if (!report || !report.bookings.length) return <Empty icon="📋" title="Aucune réservation ce mois-ci" />;
  const ST: Record<string, [string, string]> = { CONFIRMED: ['Confirmée', T.ok], PENDING: ['En attente', T.warn], ACTIVE: ['En cours', T.accent], COMPLETED: ['Terminée', T.faint], REJECTED: ['Refusée', T.bad] };
  const PAY: Record<string, [string, string]> = { PAID: ['Payé', T.ok], PARTIAL: ['Acompte', T.warn], UNPAID: ['À payer', T.bad], PENDING: ['À payer', T.bad] };
  const d = (x: string) => new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <>
      <KpiGrid>
        <Kpi value={fmt(report.grossCA)} label="CA brut" color={T.accent} />
        <Kpi value={fmt(report.kouiderProfit)} label="Ma marge" color={T.warn} />
      </KpiGrid>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {report.bookings.map(b => {
          const [stL, stC] = ST[b.status?.toUpperCase()] ?? [b.status, T.faint];
          const [pL, pC] = PAY[b.payment_status?.toUpperCase()] ?? [b.payment_status, T.faint];
          const isH = (b.rented_by ?? '').toLowerCase().startsWith('h');
          return (
            <Card key={b.id} accent={stC}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={b.client_name} color={isH ? H_COL : K_COL} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.client_name}</div>
                  <div style={{ fontSize: 13, color: T.muted }}>{b.car_name} · {d(b.start_date)} → {d(b.end_date)} · {b.nb_days} j</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{fmt(b.final_price)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                <Badge color={pC}>{pL}</Badge>
                <Badge color={stC}>{stL}</Badge>
                {b.client_price_per_day != null && <span style={{ fontSize: 12.5, color: T.muted }}>{b.client_price_per_day} €/j</span>}
                {b.kouider_profit != null && <span style={{ marginLeft: 'auto', fontSize: 13, color: T.ok, fontWeight: 700 }}>marge {fmt(b.kouider_profit)}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ─── Année ────────────────────────────────────────────────────────────────────

function AnnualTab({ report, year, fmt }: { report: FinancialReport | null; year: number; fmt: Fmt }) {
  if (!report) return <Empty icon="📊" title="Aucune donnée pour l'année" />;
  const byVehicle: Record<string, { ca: number; profitK: number; caH: number; count: number }> = {};
  for (const b of report.bookings) {
    if (b.status === 'REJECTED') continue;
    const v = b.car_name || '—';
    if (!byVehicle[v]) byVehicle[v] = { ca: 0, profitK: 0, caH: 0, count: 0 };
    byVehicle[v].ca += b.final_price ?? 0; byVehicle[v].count += 1;
    if (b.rented_by === 'Kouider') byVehicle[v].profitK += b.kouider_profit ?? 0;
    if (b.rented_by === 'Houari')  byVehicle[v].caH     += b.owner_total ?? 0;
  }
  const vehicles = Object.entries(byVehicle).sort((a, b) => b[1].ca - a[1].ca)
    .map(([name, st]) => ({ name, ca: st.ca, sub: [`${st.count} résa${st.count > 1 ? 's' : ''}`, st.profitK > 0 ? `Kouider ${fmt(st.profitK)}` : '', st.caH > 0 ? `Houari ${fmt(st.caH)}` : ''].filter(Boolean).join(' · ') }));

  return (
    <>
      <Card style={{ marginBottom: 12, padding: '18px 16px', background: `radial-gradient(120% 120% at 100% 0%, ${tone(T.violet, 0.18)}, transparent 60%), linear-gradient(160deg, ${T.surface2}, ${T.surface})` }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>CA {year}</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 4 }}>{fmt(report.grossCA)}</div>
        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 8 }}>{report.totalBookings} réservations{report.encaisse > 0 ? ` · ${fmt(report.encaisse)} encaissé` : ''}</div>
        {report.aEncaisser > 0 && <div style={{ marginTop: 10 }}><Badge color={T.warn}>💸 Reste à encaisser : {fmt(report.aEncaisser)}</Badge></div>}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
        <PartnerCard who="K" value={fmt(report.kouiderProfit)} label="Bénéfice net annuel" sub={`${report.kouiderBookings} résas`} />
        <PartnerCard who="H" value={fmt(report.ownerTotal)} label="CA véhicules annuel" sub={`${report.houariBookings} résas`} />
      </div>
      {report.missingOwnerPrice > 0 && <Alert icon="⚠️" col={T.warn} text={`${report.missingOwnerPrice} réservation${report.missingOwnerPrice > 1 ? 's' : ''} sans prix propriétaire : marge partielle.`} />}
      {vehicles.length > 0 && <>
        <SectionTitle>Par véhicule — {year}</SectionTitle>
        <Bars rows={vehicles} fmt={fmt} />
      </>}
    </>
  );
}
