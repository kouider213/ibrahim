import { useState, useEffect } from 'react';
import { ClientName } from '../ClientSheet.tsx';
import { business, apiFetch, type RevenueSummary, type FinancialReport, type FinancialBooking, type ProfitLedger } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, Segmented, Kpi, KpiGrid, Card, Row, Avatar, Badge, Btn, SectionTitle, Empty, money } from '../ui/Kit.tsx';
import { Ico } from '../ui/Icon.tsx';

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
  const [ledger, setLedger]             = useState<ProfitLedger | null>(null);
  const [loading, setLoad]        = useState(true);
  const [clearing, setClear]      = useState(false);
  const [msg, setMsg]             = useState('');
  const [tab, setTab]             = useState<'overview' | 'detail' | 'annual'>('overview');

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === (now.getMonth() + 1);

  const load = async () => {
    setLoad(true);
    setRev(null); setReport(null); setAnnualReport(null);
    try {
      if (!isHouari) business.fetchLedger().then(setLedger).catch(() => setLedger(null));
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
            {!isAtNow && <button onClick={goToNow} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 2, fontFamily: T.font }}><Ico e="↩" />Revenir à ce mois</button>}
          </div>
          <button onClick={nextMonth} disabled={isAtNow} aria-label="Mois suivant" style={navBtn(isAtNow)}>›</button>
        </div>
        <Segmented<'overview' | 'detail' | 'annual'> value={tab} onChange={setTab} items={[
          { id: 'overview', label: 'Mois' }, { id: 'detail', label: 'Réservations', count: report?.totalBookings || undefined }, { id: 'annual', label: `Année ${viewYear}` },
        ]} />
      </div>
    </>}>
      {!loading && !isHouari && ledger && tab === 'overview' && isCurrentMonth && (
        <LedgerCard ledger={ledger} fmt={fmt} onToggle={async (id, c) => {
          try { await business.setCollected(id, c); setLedger(await business.fetchLedger()); setMsg(c ? '✅ Noté comme récupéré' : 'Remis à récupérer'); setTimeout(() => setMsg(''), 1500); }
          catch { setMsg('Erreur — réessaie'); }
        }} />
      )}
      {loading ? <SkeletonCards count={4} height={110} /> : tab === 'overview' ? (
        <OverviewTab rev={rev} report={report} caMonth={caMonth} profitK={profitK} caHouari={caHouari}
          nbBookings={nbBookings} encaisse={encaisse} aEncaisser={aEncaisser} isCurrentMonth={isCurrentMonth} fmt={fmt} isHouari={isHouari} />
      ) : tab === 'detail' ? (
        <DetailTab report={report} fmt={fmt} />
      ) : (
        <AnnualTab report={annualReport} year={viewYear} fmt={fmt} isHouari={isHouari} />
      )}

      {!loading && report?.dzd && (isHouari || report.dzd.bookings > 0) && (
        <Card accent={T.violet} style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 800 }}><Ico e="💱" />En dinars</div>
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

type BarItem = { id: string; title: string; sub: string; right: string };
/** Barres par véhicule — 27/11 : touche une voiture → ses locations (client, dates, prix, ta marge). */
function Bars({ rows, fmt }: { rows: Array<{ name: string; ca: number; sub: string; items?: BarItem[] }>; fmt: Fmt }) {
  const max = Math.max(...rows.map(r => r.ca), 1);
  const [open, setOpen] = useState('');
  return (
    <Card>
      {rows.map((r, i) => (
        <div key={r.name} style={{ marginBottom: i < rows.length - 1 ? 14 : 0 }}>
          <div onClick={() => r.items?.length && setOpen(o => (o === r.name ? '' : r.name))} style={{ cursor: r.items?.length ? 'pointer' : 'default' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: 15, fontWeight: 800, marginLeft: 8 }}>{fmt(r.ca)}</span>
              {!!r.items?.length && <span style={{ marginLeft: 8, color: T.faint, fontSize: 13, transform: open === r.name ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>}
            </div>
            <div style={{ height: 6, background: 'rgba(var(--dz-ink-rgb),0.045)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(r.ca / max) * 100}%`, background: `linear-gradient(90deg, ${tone(T.accent, 0.45)}, ${T.accent})`, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>{r.sub}</div>
          </div>
          {open === r.name && r.items && (
            <div style={{ marginTop: 8, padding: '4px 10px', borderRadius: 12, background: 'rgba(var(--dz-ink-rgb),0.035)' }}>
              {r.items.map((it, k) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: k < r.items!.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{it.sub}</div>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, textAlign: 'right', whiteSpace: 'pre-line' }}>{it.right}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
const dShort = (x: string) => new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
/** Locations d'une voiture pour le détail (plus récentes d'abord). */
function carItems(bookings: FinancialBooking[], car: string, fmt: Fmt, isHouari: boolean): BarItem[] {
  return bookings.filter(b => (b.car_name || '—') === car && b.status !== 'REJECTED').sort((a, b) => b.start_date.localeCompare(a.start_date))
    .map(b => ({ id: b.id, title: b.client_name || 'Client', sub: `${dShort(b.start_date)} → ${dShort(b.end_date)} · ${b.nb_days} j${b.status ? ` · ${b.status.toLowerCase()}` : ''}`,
      right: `${fmt(b.final_price ?? 0)}${!isHouari && b.kouider_profit != null ? `\nmarge ${fmt(b.kouider_profit)}` : ''}` }));
}

// ─── Mon bénéfice : déjà récupéré / à récupérer (même source que le tableau de bord du site) ───

function LedgerCard({ ledger, fmt, onToggle }: { ledger: ProfitLedger; fmt: Fmt; onToggle: (id: string, collected: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const da = (n: number) => money(Math.round(n * ledger.rate), 'DZD');
  const pending = ledger.rows.filter(r => !r.collected);
  const done = ledger.rows.filter(r => r.collected).slice().reverse();
  const act = async (id: string, c: boolean) => { setBusy(id); try { await onToggle(id, c); } finally { setBusy(''); } };
  const d = (x: string) => new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const line = (r: ProfitLedger['rows'][number], c: boolean) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ClientName name={r.client} /></div>
        <div style={{ fontSize: 12, color: T.muted }}>{r.car} · {d(r.start)} → {d(r.end)}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: c ? T.muted : T.warn }}>{fmt(r.eur)}</div>
        <div style={{ fontSize: 11.5, color: T.faint }}>{money(r.da, 'DZD')}</div>
      </div>
      <button onClick={() => void act(r.id, !c)} disabled={busy === r.id} style={{ border: `1px solid ${c ? T.line : tone(T.ok, 0.5)}`, background: c ? 'transparent' : tone(T.ok, 0.12), color: c ? T.faint : T.ok, borderRadius: 10, padding: '7px 9px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, whiteSpace: 'nowrap' }}>
        {busy === r.id ? '…' : c ? '↺ Annuler' : '✓ Récupéré'}
      </button>
    </div>
  );
  return (
    <Card accent={T.ok} style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}><Ico e="💰" />Mon bénéfice</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {[{ l: 'Gagné depuis le début', v: ledger.total, c: T.text }, { l: 'Déjà récupéré', v: ledger.collected, c: T.ok }, { l: 'À récupérer', v: ledger.toCollect, c: ledger.toCollect > 0 ? T.warn : T.ok }].map(x => (
          <div key={x.l}>
            <div style={{ fontSize: 18, fontWeight: 800, color: x.c, letterSpacing: '-0.02em' }}>{fmt(x.v)}</div>
            <div style={{ fontSize: 11.5, color: T.faint }}>{da(x.v)}</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.25 }}>{x.l}</div>
          </div>
        ))}
      </div>
      {pending.length > 0 ? <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700, marginBottom: 2 }}>À RÉCUPÉRER</div>
        {pending.map(r => line(r, false))}
        {pending.length > 1 && <Btn onClick={() => void act('all', true)} disabled={!!busy} style={{ width: '100%', marginTop: 8 }}>{busy === 'all' ? '…' : `✓ J'ai tout récupéré (${fmt(ledger.toCollect)})`}</Btn>}
      </div> : <div style={{ marginTop: 12, fontSize: 13.5, color: T.ok }}><Ico e="✅" />Tout est récupéré.</div>}
      {done.length > 0 && <div style={{ marginTop: 10 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: T.font }}>{open ? '▾' : '▸'} Déjà récupéré ({done.length} locations)</button>
        {open && <div style={{ marginTop: 4 }}>{done.map(r => line(r, true))}</div>}
      </div>}
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
    const w = b.share ?? 1;   // même prorata que le total du mois (location à cheval sur 2 mois)
    byVehicle[v].ca += (b.final_price ?? 0) * w; byVehicle[v].profit += (b.kouider_profit ?? 0) * w; byVehicle[v].count += 1;
  }
  const vehicles = Object.entries(byVehicle).sort((a, b) => b[1].ca - a[1].ca)
    .map(([name, st]) => ({ name, ca: st.ca, sub: `${st.count} résa${st.count > 1 ? 's' : ''}${!isHouari ? ` · ma marge ${fmt(st.profit)}` : ''}`, items: carItems(report?.bookings ?? [], name, fmt, isHouari) }));

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
        <PartnerCard who="K" value={fmt(profitK)} label="Mon bénéfice ce mois" sub={report ? `${report.kouiderBookings} résas` : undefined} />
        <PartnerCard who="H" value={fmt(caHouari)} label="Sa part (location de ses voitures)" sub={report ? `${report.kouiderBookings} résas` : undefined} />
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
        <Kpi value={fmt(report.kouiderProfit)} label="Ma marge (part du mois)" color={T.warn} />
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
                  <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><ClientName name={b.client_name} /></div>
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
              {b.share != null && b.share < 1 && (
                <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>À cheval sur 2 mois : ce mois-ci compte {fmt((b.final_price ?? 0) * b.share)} de CA et {fmt((b.kouider_profit ?? 0) * b.share)} de marge, le reste est sur l'autre mois.</div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ─── Année ────────────────────────────────────────────────────────────────────

function AnnualTab({ report, year, fmt, isHouari }: { report: FinancialReport | null; year: number; fmt: Fmt; isHouari: boolean }) {
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
    .map(([name, st]) => ({ name, ca: st.ca, sub: [`${st.count} résa${st.count > 1 ? 's' : ''}`, st.profitK > 0 ? `Kouider ${fmt(st.profitK)}` : '', st.caH > 0 ? `Houari ${fmt(st.caH)}` : ''].filter(Boolean).join(' · '), items: carItems(report.bookings, name, fmt, isHouari) }));

  return (
    <>
      <Card style={{ marginBottom: 12, padding: '18px 16px', background: `radial-gradient(120% 120% at 100% 0%, ${tone(T.violet, 0.18)}, transparent 60%), linear-gradient(160deg, ${T.surface2}, ${T.surface})` }}>
        <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>CA {year}</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 4 }}>{fmt(report.grossCA)}</div>
        <div style={{ fontSize: 13.5, color: T.muted, marginTop: 8 }}>{report.totalBookings} réservations{report.encaisse > 0 ? ` · ${fmt(report.encaisse)} encaissé` : ''}</div>
        {report.aEncaisser > 0 && <div style={{ marginTop: 10 }}><Badge color={T.warn}><Ico e="💸" />Reste à encaisser : {fmt(report.aEncaisser)}</Badge></div>}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10, marginBottom: 12 }}>
        <PartnerCard who="K" value={fmt(report.kouiderProfit)} label="Bénéfice net annuel" sub={`${report.kouiderBookings} résas`} />
        <PartnerCard who="H" value={fmt(report.ownerTotal)} label="Sa part sur l'année" sub={`${report.kouiderBookings} résas`} />
      </div>
      {report.missingOwnerPrice > 0 && <Alert icon="⚠️" col={T.warn} text={`${report.missingOwnerPrice} réservation${report.missingOwnerPrice > 1 ? 's' : ''} sans prix propriétaire : marge partielle.`} />}
      <Evolution bookings={report.bookings} year={year} fmt={fmt} />
      {!isHouari && <ClientTiming />}
      {vehicles.length > 0 && <>
        <SectionTitle>Par véhicule — {year}</SectionTitle>
        <Bars rows={vehicles} fmt={fmt} />
      </>}
    </>
  );
}

// ─── 27/11 : évolution mois par mois + quand les clients écrivent ─────────────
const MOIS3 = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function Evolution({ bookings, year, fmt }: { bookings: FinancialBooking[]; year: number; fmt: Fmt }) {
  const nowM = new Date().getFullYear() === year ? new Date().getMonth() : 11;
  const months = Array.from({ length: nowM + 1 }, (_, i) => {
    const bs = bookings.filter(b => b.status !== 'REJECTED' && b.start_date.startsWith(`${year}-${String(i + 1).padStart(2, '0')}`));
    return { i, n: bs.length, ca: bs.reduce((s, b) => s + (b.final_price ?? 0), 0) };
  });
  const mx = Math.max(1, ...months.map(m => m.n));
  const cur = months[nowM], prev3 = months[nowM - 2];
  const diff = cur && prev3 ? cur.n - prev3.n : 0;
  return (<>
    <SectionTitle>Évolution — réservations par mois</SectionTitle>
    <Card style={{ marginBottom: 12 }}>
      {cur && prev3 && <div style={{ fontSize: 14, marginBottom: 12 }}>{diff > 0 ? '📈' : diff < 0 ? '📉' : '➖'} {MOIS3[prev3.i]} : <b>{prev3.n}</b> → {MOIS3[cur.i]} : <b>{cur.n}</b> réservation{cur.n > 1 ? 's' : ''}{diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110 }}>
        {months.map(m => (
          <div key={m.i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: m.n ? T.text : T.faint }}>{m.n || ''}</span>
            <div title={fmt(m.ca)} style={{ width: '100%', height: `${Math.max(3, m.n / mx * 80)}%`, background: m.i === nowM ? T.accent : tone(T.accent, 0.45), borderRadius: 4 }} />
            <span style={{ fontSize: 10.5, color: T.faint }}>{MOIS3[m.i]}</span>
          </div>
        ))}
      </div>
    </Card>
  </>);
}

interface Insights { contacts: number; matched: number; medianDelayH: number | null; byWeekday: Array<{ name: string; n: number }>; byHour: Array<{ h: number; n: number }>; bestWeekday: string | null; bestSlot: string | null }
function ClientTiming() {
  const [d, setD] = useState<Insights | null>(null);
  useEffect(() => { apiFetch<Insights>('/api/mon-argent/fik-insights').then(setD).catch(() => setD(null)); }, []);
  if (!d || !d.contacts) return null;
  const mx = Math.max(1, ...d.byWeekday.map(w => w.n));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const delay = d.medianDelayH == null ? null : d.medianDelayH < 1 ? `${Math.round(d.medianDelayH * 60)} min` : d.medianDelayH < 48 ? `${Math.round(d.medianDelayH)} h` : `${Math.round(d.medianDelayH / 24)} jours`;
  return (<>
    <SectionTitle>Quand les clients écrivent</SectionTitle>
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, marginBottom: 10, lineHeight: 1.45 }}>
        Sur {d.contacts} premiers contacts (WhatsApp, TikTok, site) : le jour le plus fort est le <b>{(d.bestWeekday ?? '—').toLowerCase()}</b>{d.bestSlot ? <>, surtout l'<b>{d.bestSlot}</b></> : null}.
        {delay ? <> Entre le 1er message et la réservation : <b>{delay}</b> en moyenne ({d.matched} client{d.matched > 1 ? 's' : ''}).</> : <> Délai message → réservation : pas encore assez de données (les messages WhatsApp ne sont suivis que depuis le 24/11).</>}
      </div>
      {order.map(i => d.byWeekday[i]!).map(w => (
        <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ width: 78, color: T.muted }}>{w.name}</span>
          <div style={{ flex: 1, height: 8, background: 'rgba(var(--dz-ink-rgb),0.045)', borderRadius: 4 }}><div style={{ height: '100%', width: `${w.n / mx * 100}%`, background: T.violet, borderRadius: 4 }} /></div>
          <span style={{ width: 28, textAlign: 'right', fontWeight: 700 }}>{w.n}</span>
        </div>
      ))}
    </Card>
  </>);
}
