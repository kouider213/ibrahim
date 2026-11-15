import { useState, useEffect, useCallback } from 'react';
import { openClient } from '../ClientSheet.tsx';
import { business, type TodayItem, type Booking, type ProfitLedger } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, HeadBtn, Kpi, KpiGrid, SectionTitle, Row, Avatar, Badge, Empty, waLink, money, glass, CountUp } from '../ui/Kit.tsx';

const go = (p: string) => window.dispatchEvent(new CustomEvent('dz:go', { detail: p }));
const ymd = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Africa/Algiers' });
const dayN = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
const shortD = (x: string) => new Date(x).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

type Today = { date: string; departures: TodayItem[]; returns: TodayItem[]; toCollect: Array<TodayItem & { due: number }>; newDemands: number; pendingBookings: number };

const longDate = () => {
  const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'; };

function WaBtn({ phone }: { phone: string | null }) {
  const href = waLink(phone);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{
      minHeight: 40, padding: '0 12px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
      background: 'rgba(37,211,102,0.13)', border: '1px solid rgba(37,211,102,0.4)', color: '#25D366', fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>💬 WhatsApp</a>
  );
}

export default function CommandCenterScreen() {
  const [d, setD] = useState<Today | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<ProfitLedger | null>(null);
  const [monthCA, setMonthCA] = useState<number | null>(null);
  const [bks, setBks] = useState<Booking[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    business.fetchLedger().then(setLedger).catch(() => {});
    business.fetchFinanceReport(now.getFullYear(), now.getMonth() + 1).then(r => setMonthCA(r.grossCA)).catch(() => {});
    business.fetchBookings().then(r => setBks(r.bookings ?? [])).catch(() => {});
    try { setD(await business.insightsToday()); } catch { setD(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const due = d ? d.toCollect.reduce((s, x) => s + x.due, 0) : 0;
  const moves = d ? d.departures.length + d.returns.length : 0;

  const Section = ({ title, items, col, icon, empty, verb }: { title: string; items: Array<TodayItem & { due?: number }>; col: string; icon: string; empty: string; verb: string }) => (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle right={<Badge color={items.length ? col : T.faint}>{items.length}</Badge>}>{icon} {title}</SectionTitle>
      {items.length === 0 ? (
        <div style={{ fontSize: 14, color: T.faint, padding: '4px 2px' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <Row key={it.id} accent={col} onClick={() => openClient({ name: it.client, phone: it.phone })}
              left={<Avatar name={it.client} color={col} />}
              title={it.client}
              sub={<>{verb} · <span style={{ color: T.text }}>{it.car}</span>{it.due != null && <> · <b style={{ color: T.warn }}>{money(it.due)}</b></>}</>}
              right={<WaBtn phone={it.phone} />}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Screen header={
      <PageHeader eyebrow={longDate()} title={`${hello()} Kouider`}
        subtitle={loading ? 'Je prépare ta journée…' : !d ? 'Données indisponibles' : moves || due ? `${moves} mouvement${moves > 1 ? 's' : ''} de voiture aujourd'hui${due ? ` · ${money(due)} à encaisser` : ''}` : 'Journée calme : aucun départ ni retour.'}
        right={<HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} busy={loading} />} />
    }>
      {loading && !d ? <SkeletonCards count={4} /> : !d ? (
        <Empty icon="📡" title="Pas de connexion au serveur" text="Vérifie le réseau puis actualise." />
      ) : (
        <>
          {/* Carte argent : ce que je dois récupérer + CA du mois */}
          <div className="dz-press" onClick={() => go('revenue')} role="button" style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: '18px 18px 16px', marginBottom: 14, cursor: 'pointer',
            background: `radial-gradient(120% 120% at 100% 0%, ${tone(T.accent, 0.35)}, transparent 55%), radial-gradient(90% 90% at 0% 100%, ${tone(T.violet, 0.28)}, transparent 60%), linear-gradient(150deg, #1e1832, #121218)`,
            border: `1px solid ${tone(T.accent, 0.35)}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 22px 50px -24px ${tone(T.accent, 0.8)}` }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', animation: 'dzShine 6s ease-in-out infinite', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#e9e0ff', fontWeight: 700, letterSpacing: '0.04em' }}>💰 MON ARGENT <span style={{ marginLeft: 'auto', fontSize: 13, color: T.accent }}>Détails ›</span></div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}><CountUp value={ledger ? money(ledger.toCollect) : '—'} /></div>
                <div style={{ fontSize: 13, color: '#c9c1e3', marginTop: 5 }}>à récupérer{ledger ? ` · ${Math.round(ledger.toCollect * ledger.rate).toLocaleString('fr-FR')} DA` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}><CountUp value={monthCA != null ? money(monthCA) : '—'} /></div>
                <div style={{ fontSize: 12, color: '#c9c1e3' }}>CA ce mois</div>
              </div>
            </div>
            {ledger && <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12.5, color: '#c9c1e3' }}>
              <span>Gagné depuis le début <b style={{ color: '#fff' }}>{money(ledger.total)}</b></span>
              <span>Déjà récupéré <b style={{ color: T.ok }}>{money(ledger.collected)}</b></span>
            </div>}
          </div>

          {/* Raccourcis */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, marginBottom: 18 }}>
            {[{ i: '📋', l: 'Locations', p: 'bookings', c: T.accent }, { i: '👥', l: 'Clients', p: 'clients', c: T.ok }, { i: '🚗', l: 'Parc', p: 'fleet', c: T.warn }, { i: '🧮', l: 'Devis', p: 'devis', c: T.violet }].map(x => (
              <button key={x.p} onClick={() => go(x.p)} style={{ ...glass(x.c), borderRadius: 18, minHeight: 74, cursor: 'pointer', fontFamily: T.font, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.text }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `radial-gradient(circle at 35% 25%, ${tone(x.c, 0.45)}, ${tone(x.c, 0.1)} 70%)`, border: `1px solid ${tone(x.c, 0.5)}` }}>{x.i}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{x.l}</span>
              </button>
            ))}
          </div>

          {/* En ce moment : voitures dehors + arrivées des 7 prochains jours */}
          {(() => {
            const t = ymd();
            const live = bks.filter(b => /^(confirmed|accepted|active)$/i.test(b.status ?? ''));
            const out = live.filter(b => b.start_date.slice(0, 10) <= t && b.end_date.slice(0, 10) >= t);
            const soon = live.filter(b => b.start_date.slice(0, 10) > t && dayN(t, b.start_date) <= 7).sort((a, b) => a.start_date.localeCompare(b.start_date));
            if (!out.length && !soon.length) return null;
            return (
              <div style={{ marginBottom: 18 }}>
                <SectionTitle right={<Badge color={T.ok}>{out.length} dehors</Badge>}>🚗 En ce moment</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {out.map(b => {
                    const tot = Math.max(1, dayN(b.start_date, b.end_date)), done = Math.min(tot, Math.max(0, dayN(b.start_date, t)));
                    const left = dayN(t, b.end_date);
                    return (
                      <div key={b.id} className="dz-press" role="button" onClick={() => openClient({ name: b.client_name, phone: b.client_phone })} style={{ ...glass(T.ok), borderRadius: 20, padding: 14, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Avatar name={b.client_name} color={T.ok} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{b.client_name}</div>
                            <div style={{ fontSize: 13, color: T.muted }}>{b.cars?.name ?? 'Voiture'} · retour {shortD(b.end_date)}</div>
                          </div>
                          <Badge color={left <= 1 ? T.warn : T.ok}>{left <= 0 ? "Rend aujourd'hui" : left === 1 ? 'Rend demain' : `${left} j restants`}</Badge>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', marginTop: 12, overflow: 'hidden' }}>
                          <div style={{ width: `${(done / tot) * 100}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${tone(T.ok, 0.5)}, ${T.ok})`, boxShadow: `0 0 10px ${tone(T.ok, 0.7)}` }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 5 }}>Jour {done} sur {tot}</div>
                      </div>
                    );
                  })}
                  {soon.map(b => (
                    <Row key={b.id} accent={T.accent} onClick={() => openClient({ name: b.client_name, phone: b.client_phone })}
                      left={<Avatar name={b.client_name} color={T.accent} />} title={b.client_name}
                      sub={<>Arrive {shortD(b.start_date)} · <span style={{ color: T.text }}>{b.cars?.name ?? ''}</span></>}
                      right={<Badge color={T.accent}>dans {dayN(t, b.start_date)} j</Badge>} />
                  ))}
                </div>
              </div>
            );
          })()}

          <KpiGrid>
            <Kpi value={d.newDemands} label="Demandes (24 h)" color={T.accent2} sub={d.pendingBookings ? `${d.pendingBookings} résa à confirmer` : undefined} />
            <Kpi value={money(due)} label="À encaisser aujourd'hui" color={T.warn} sub={d.toCollect.length ? `${d.toCollect.length} client${d.toCollect.length > 1 ? 's' : ''}` : 'Tout est payé'} />
          </KpiGrid>

          {d.pendingBookings > 0 && (
            <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 14, background: tone(T.warn, 0.1), border: `1px solid ${tone(T.warn, 0.35)}`, fontSize: 14, color: T.text, lineHeight: 1.4 }}>
              ⏳ <b>{d.pendingBookings} réservation{d.pendingBookings > 1 ? 's' : ''}</b> en attente de confirmation — onglet <b>Demandes</b>.
            </div>
          )}

          {d.departures.length > 0 && <Section title="Départs aujourd'hui" items={d.departures} col={T.accent} icon="🚗" empty="" verb="Part avec" />}
          {d.returns.length > 0 && <Section title="Retours aujourd'hui" items={d.returns} col={T.violet} icon="↩️" empty="" verb="Rend" />}
          {d.toCollect.length > 0 && <Section title="À encaisser" items={d.toCollect} col={T.warn} icon="💰" empty="" verb="Location" />}
          {!d.departures.length && !d.returns.length && !d.toCollect.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 18, border: `1px dashed ${T.lineStrong}`, color: T.muted, fontSize: 14 }}>
              <span style={{ fontSize: 22 }}>✨</span> Aucun départ, aucun retour, rien à encaisser aujourd'hui.
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
