import { useState, useEffect, useCallback } from 'react';
import { openClient } from '../ClientSheet.tsx';
import { business, apiFetch, type TodayItem, type Booking, type ProfitLedger } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { MonArgentMini } from './MonArgentMini.tsx';
import type { MonArgent } from './MonArgentScreen.tsx';
import { T, tone, Screen, PageHeader, HeadBtn, SectionTitle, Row, Avatar, Badge, waLink, money, glass, CountUp } from '../ui/Kit.tsx';
import { Icon, Ico } from '../ui/Icon.tsx';
import MeCard from './MeCard.tsx';
import { InboxCard } from './InboxCard.tsx';
import { TachesCard } from './TachesCard.tsx';

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
      background: 'rgba(10,154,94,0.13)', border: '1px solid rgba(10,154,94,0.4)', color: '#25D366', fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}><Ico e="💬" />WhatsApp</a>
  );
}

type CalEv = { id?: string; summary: string; location?: string; source: string; start: { dateTime?: string; date?: string } };
const evDay = (e: CalEv) => e.start.dateTime ? new Date(e.start.dateTime).toLocaleDateString('sv-SE', { timeZone: 'Africa/Algiers' }) : (e.start.date ?? '');
const evTime = (e: CalEv) => e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : 'Journée';

type TkTask = { id: string; text: string; time?: string | null; done?: string | null };
type TkMove = { id: string; kind: 'arrivee' | 'retour'; client: string; time: string | null; date: string };
type Slot = { k: string; task?: boolean; time: string | null; icon: string; color: string; title: string; sub?: string; phone?: string | null; to?: () => void };
const nowHM = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' });

/** 27/11 soir (« améliore la page Aujourd'hui ») : TOUTE la journée dans l'ordre des heures — RDV agenda FIK, départs, retours,
 *  tâches à heure fixe, argent à encaisser — avec un repère « maintenant ». Avant, départs/retours/agenda étaient tout en bas. */
function DayCard({ d, evs, tasks, moves }: { d: Today | null; evs: CalEv[]; tasks: TkTask[]; moves: TkMove[] }) {
  const t = ymd();
  const mvTime = (client: string, kind: TkMove['kind']) => moves.find(m => m.kind === kind && m.date?.slice(0, 10) === t && m.client === client)?.time ?? null;
  const slots: Slot[] = [
    ...evs.map((e, i) => ({ k: `e${e.id ?? i}`, time: e.start.dateTime ? evTime(e) : null, icon: 'calendar', color: T.violet, title: e.summary, sub: e.location, to: () => go('calendar') })),
    ...(d?.departures ?? []).map(x => ({ k: `d${x.id}`, time: mvTime(x.client, 'arrivee'), icon: 'car', color: T.accent, title: `Départ · ${x.client}`, sub: x.car, phone: x.phone, to: () => openClient({ name: x.client, phone: x.phone }) })),
    ...(d?.returns ?? []).map(x => ({ k: `r${x.id}`, time: mvTime(x.client, 'retour'), icon: 'car', color: T.ok, title: `Retour · ${x.client}`, sub: x.car, phone: x.phone, to: () => openClient({ name: x.client, phone: x.phone }) })),
    ...tasks.filter(x => !x.done).map(x => ({ k: `t${x.id}`, time: x.time ?? null, icon: 'check', color: T.warn, title: x.text, sub: 'tâche', task: true })),
    ...(d?.toCollect ?? []).map(x => ({ k: `c${x.id}`, time: null, icon: 'wallet', color: T.warn, title: `Encaisser ${money(x.due)} · ${x.client}`, sub: x.car, phone: x.phone, to: () => openClient({ name: x.client, phone: x.phone }) })),
  ].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  if (!slots.length) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 18, border: `1px dashed ${T.lineStrong}`, color: T.muted, fontSize: 14, marginBottom: 18 }}>
      <Icon name="sparkles" size={20} /> Journée libre : aucun RDV, aucun départ ni retour, rien à encaisser.
    </div>);
  const now = nowHM();
  const nowAt = slots.findIndex(x => x.time && x.time > now);
  const nowIdx = nowAt === -1 ? slots.filter(x => x.time).length : nowAt;
  const NowLine = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 700, color: T.bad, minWidth: 48 }}>{now}</span>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: T.bad, boxShadow: `0 0 8px ${T.bad}` }} />
      <span style={{ flex: 1, height: 1.5, background: tone(T.bad, 0.5) }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: T.bad }}>maintenant</span>
    </div>);
  return (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle right={<Badge color={T.accent}>{slots.length}</Badge>}><Ico e="📅" />Ta journée</SectionTitle>
      <div style={{ ...glass(T.accent), borderRadius: 20, padding: '8px 14px' }}>
        {slots.map((x, i) => {
          const past = !!x.time && x.time <= now, late = past && x.task;
          return (
            <div key={x.k}>
              {i === nowIdx && i > 0 && <NowLine />}
              {x.time === null && (i === 0 || slots[i - 1].time !== null) && <div style={{ fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.faint, padding: '8px 0 2px', borderTop: i ? `1px solid ${T.line}` : 'none' }}>Dans la journée</div>}
              <div className={x.to ? 'dz-press' : undefined} role={x.to ? 'button' : undefined} onClick={x.to} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', cursor: x.to ? 'pointer' : 'default', opacity: past && !late ? 0.5 : 1 }}>
                {x.time !== null && <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: x.color, minWidth: 48 }}>{x.time}</span>}
                <span style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: x.color, background: tone(x.color, 0.14), flexShrink: 0 }}><Icon name={x.icon} size={15} stroke={2} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</div>
                  {x.sub && <div style={{ fontSize: 12.5, color: late ? T.bad : T.muted, fontWeight: late ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{late ? 'tâche en retard · pas encore faite' : x.sub}</div>}
                </div>
                {x.phone !== undefined && <WaBtn phone={x.phone} />}
              </div>
            </div>);
        })}
        {nowIdx === slots.length && slots.some(x => x.time) && <NowLine />}
      </div>
    </div>);
}

export default function CommandCenterScreen() {
  const [d, setD] = useState<Today | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<ProfitLedger | null>(null);
  const [monthCA, setMonthCA] = useState<number | null>(null);
  // 27/11 soir : « il devrait me montrer tout l'argent cash, pas que des locations, et dire quoi est de quoi »
  // 27/11 (Kouider : « la 1re fois il reste à 127, il va pas direct au total ») : tant que /api/mon-argent n'avait pas répondu,
  // l'ancienne carte « À récupérer » (127 € chez Houari) s'affichait. → dernière réponse gardée sur le téléphone, affichée tout
  // de suite, et l'ancienne carte seulement si le serveur refuse (autre compte).
  const [ma, setMaState] = useState<MonArgent | null>(() => { try { return JSON.parse(localStorage.getItem('dz:ma:last') ?? 'null') as MonArgent | null; } catch { return null; } });
  const [maDenied, setMaDenied] = useState(false);
  const setMa = (v: MonArgent) => { setMaState(v); setMaDenied(false); try { localStorage.setItem('dz:ma:last', JSON.stringify({ balances: v.balances, today: v.today })); } catch { /* plein */ } };
  const [bks, setBks] = useState<Booking[]>([]);
  const [evs, setEvs] = useState<CalEv[]>([]);
  const [tick, setTick] = useState(0);
  const [tk, setTk] = useState<{ today: TkTask[]; moves: TkMove[] }>({ today: [], moves: [] });

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    business.fetchLedger().then(setLedger).catch(() => {});
    apiFetch<MonArgent>('/api/mon-argent').then(setMa).catch((e: unknown) => { if (/403|réservé/i.test(String((e as Error)?.message ?? e))) { setMaState(null); setMaDenied(true); } });
    business.fetchFinanceReport(now.getFullYear(), now.getMonth() + 1).then(r => setMonthCA(r.grossCA)).catch(() => {});
    business.fetchBookings().then(r => setBks(r.bookings ?? [])).catch(() => {});
    apiFetch<{ events: CalEv[] }>('/api/calendar/all?actor=kouider').then(r => { const t = ymd(); setEvs((r.events ?? []).filter(e => e.source === 'fik' && evDay(e) === t)); }).catch(() => {});
    apiFetch<{ today: TkTask[]; moves: TkMove[] }>('/api/taches').then(r => setTk({ today: r.today ?? [], moves: r.moves ?? [] })).catch(() => {});
    setTick(x => x + 1);
    try { setD(await business.insightsToday()); } catch { setD(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Retour dans l'app (ou sur l'onglet) → la page se remet à jour toute seule (max 1 fois / 2 min)
  useEffect(() => {
    let last = Date.now();
    const onShow = () => { if (document.visibilityState === 'visible' && Date.now() - last > 120_000) { last = Date.now(); void load(); } };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => { document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); };
  }, [load]);

  const due = d ? d.toCollect.reduce((s, x) => s + x.due, 0) : 0;
  const moves = d ? d.departures.length + d.returns.length : 0;
  const openTasks = tk.today.filter(x => !x.done).length;
  // 27/11 : le résumé du haut dit tout en une ligne (voitures, RDV, tâches, argent)
  const summary = [moves ? `${moves} voiture${moves > 1 ? 's' : ''} qui bouge${moves > 1 ? 'nt' : ''}` : '', evs.length ? `${evs.length} RDV` : '', openTasks ? `${openTasks} tâche${openTasks > 1 ? 's' : ''}` : '', due ? `${money(due)} à encaisser` : '']
    .filter(Boolean).join(' · ') || (d ? 'Journée calme : rien de prévu.' : 'Voitures indisponibles pour le moment.');

  // En ce moment : voitures dehors (sans celles qui partent / rentrent aujourd'hui : elles sont déjà plus bas) + arrivées 7 j
  const t = ymd();
  const shownToday = new Set([...(d?.departures ?? []), ...(d?.returns ?? [])].map(x => x.id));
  const live = bks.filter(b => /^(confirmed|accepted|active)$/i.test(b.status ?? ''));
  const out = live.filter(b => b.start_date.slice(0, 10) <= t && b.end_date.slice(0, 10) >= t && !shownToday.has(b.id));
  const soon = live.filter(b => b.start_date.slice(0, 10) > t && dayN(t, b.start_date) <= 7).sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <Screen header={
      <PageHeader eyebrow={longDate()} title={`${hello()} Kouider`}
        subtitle={loading && !d ? 'Je prépare ta journée…' : summary}
        right={<HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} busy={loading} />} />
    }>
      {loading && !d && !ma ? <SkeletonCards count={4} /> : (
        <>
          {/* 27/11 : si /api/insights/today tombe, le reste de la page (argent, messages, tâches) s'affiche quand même */}
          {!d && !loading && <div className="dz-press" role="button" onClick={() => void load()} style={{ cursor: 'pointer', marginBottom: 14, padding: '10px 14px', borderRadius: 14, background: tone(T.warn, 0.1), border: `1px solid ${tone(T.warn, 0.35)}`, fontSize: 13.5, color: T.text }}>
            <Ico e="📡" /> Départs et retours pas chargés — <b>toucher pour réessayer</b></div>}
          {/* 27/11 soir : TOUT son cash (en main + chez Houari), chaque morceau nommé — privé (Kouider seulement), sinon l'ancienne carte */}
          {ma && (() => {
            const hide = localStorage.getItem('dz:argent:hide') === '1', fm = (n: number) => (hide ? '•••• €' : money(n));
            const rec = ma.balances.aRecuperer ?? ledger?.toCollect ?? 0, day = ma.today.day;
            const rows = [{ l: 'Cash en main', v: fm(ma.balances.cash), sub: day && day.net ? `dont ${fm(day.net)} aujourd'hui` : 'snus, ventes…', to: 'argent', c: '#ffffff' },
              { l: 'Chez Houari', v: fm(rec), sub: 'locations FIK à récupérer', to: 'revenue', c: '#ffd78a' },
              { l: 'Aujourd\'hui', v: fm(day?.net ?? 0), sub: day?.last ? `dernière ligne ${day.last}` : 'rien noté', to: 'argent', c: '#5fe0a8' }];
            return (
              <div className="dz-press" onClick={() => go('argent')} role="button" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: '20px 20px 18px', marginBottom: 18, cursor: 'pointer',
                background: 'radial-gradient(120% 90% at 100% 0%, rgba(34,211,238,0.42), transparent 52%), radial-gradient(110% 90% at 0% 100%, rgba(139,92,246,0.6), transparent 58%), linear-gradient(145deg, #2442ff 0%, #2a1878 100%)', boxShadow: '0 24px 44px -24px rgba(var(--dz-shadow-rgb),0.7)' }}>
                <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>Tout mon cash <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#ffffff', background: 'rgba(255,255,255,0.14)', padding: '6px 12px', borderRadius: 99 }}>Détails ›</span></div>
                <div style={{ position: 'relative', fontFamily: T.display, fontSize: 52, fontWeight: 600, letterSpacing: '-0.055em', lineHeight: 1, color: '#ffffff', fontVariantNumeric: 'tabular-nums', marginTop: 10 }}><CountUp value={fm(ma.balances.cash + rec)} /></div>
                <div style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>cash en main + chez Houari{ledger && !hide ? ` · ${Math.round((ma.balances.cash + rec) * ledger.rate).toLocaleString('fr-FR')} DA` : ''}</div>
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                  {rows.map(x => (
                    <div key={x.l} onClick={e => { e.stopPropagation(); go(x.to); }} style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{x.l}</div>
                      <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 800, color: x.c, marginTop: 3, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}><CountUp value={x.v} /></div>
                      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 2, lineHeight: 1.25 }}>{x.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>FIK : CA ce mois {monthCA != null ? fm(monthCA) : '—'} · gagné en tout {ledger ? fm(ledger.total) : '—'} · déjà récupéré {ledger ? fm(ledger.collected) : '—'}</div>
              </div>);
          })()}
          {/* Carte argent (façon carte bancaire, à l'encre) : ce que je dois récupérer + CA du mois — pour les autres comptes */}
          {!ma && !maDenied && <div style={{ height: 250, borderRadius: 28, marginBottom: 18, background: 'linear-gradient(145deg, #2442ff 0%, #2a1878 100%)', opacity: 0.55 }} />}
          {!ma && maDenied && <>
          <div className="dz-press" onClick={() => go('revenue')} role="button" style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: '20px 20px 18px', marginBottom: 18, cursor: 'pointer',
            background: 'radial-gradient(120% 90% at 100% 0%, rgba(34,211,238,0.42), transparent 52%), radial-gradient(110% 90% at 0% 100%, rgba(139,92,246,0.6), transparent 58%), linear-gradient(145deg, #2442ff 0%, #2a1878 100%)', boxShadow: '0 24px 44px -24px rgba(var(--dz-shadow-rgb),0.7)' }}>
            <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -20, right: -100, width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>À récupérer <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#ffffff', background: 'rgba(255,255,255,0.14)', padding: '6px 12px', borderRadius: 99 }}>Détails ›</span></div>
            <div style={{ position: 'relative', fontFamily: T.display, fontSize: 52, fontWeight: 600, letterSpacing: '-0.055em', lineHeight: 1, color: '#ffffff', fontVariantNumeric: 'tabular-nums', marginTop: 10 }}><CountUp value={ledger ? money(ledger.toCollect) : '—'} /></div>
            <div style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{ledger ? `${Math.round(ledger.toCollect * ledger.rate).toLocaleString('fr-FR')} DA` : ' '}</div>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              {[{ l: 'CA ce mois', v: monthCA != null ? money(monthCA) : '—', c: '#ffffff' }, { l: 'Gagné en tout', v: ledger ? money(ledger.total) : '—', c: '#ffffff' }, { l: 'Déjà récupéré', v: ledger ? money(ledger.collected) : '—', c: '#5fe0a8' }].map(x => (
                <div key={x.l} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>{x.l}</div>
                  <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 800, color: x.c, marginTop: 3, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}><CountUp value={x.v} /></div>
                </div>
              ))}
            </div>
          </div>

          </>}

          <DayCard d={d} evs={evs} tasks={tk.today} moves={tk.moves} />

          {/* 27/11 À traiter : WhatsApp, TikTok, relances, réservations — avec les boutons (envoyer, dispo, complet, réécrire…) */}
          <InboxCard tick={tick} />

          {/* 27/11 Mes tâches : ce que je lui ai demandé de me rappeler (médecin, banque…) — cocher, demain, autre jour */}
          <TachesCard tick={tick} />

          {/* 27/11 Mon argent (privé, 403 pour un autre compte → caché) : snus +1 sans chercher la page */}
          <MonArgentMini />

          {/* 27/11 : ses pages perso à un geste (Kouider : « je veux une page où je vois mon stock de snus », analyse, voyages) */}
          {ma && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 18 }}>
            {([['📦', 'Stock snus', 'stocksnus', '#14b8a6'], ['🧭', 'Mon analyse', 'analyse', '#3d6bff'], ['🧳', 'Mes voyages', 'voyages', '#f59e0b']] as const).map(([i, l, p, c]) => (
              <button key={p} onClick={() => go(p)} className="dz-press" style={{ border: '1px solid var(--dz-card-line)', background: 'var(--dz-card)', borderRadius: 18, padding: '12px 6px', cursor: 'pointer', fontFamily: T.font, color: T.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, boxShadow: `${T.shadow}, 0 10px 24px -16px ${c}` }}>
                <span style={{ fontSize: 22 }}>{i}</span><span style={{ fontSize: 12.5, fontWeight: 700 }}>{l}</span>
                {p === 'stocksnus' && ma.extras?.stock && (() => { const pcs = ma.extras!.stock!.pieces, days = ma.snus?.perDay ? Math.floor(pcs / ma.snus.perDay) : null;
                  return <span style={{ fontSize: 11, fontWeight: 700, color: days !== null && days < 7 ? T.bad : T.muted }}>{pcs} pcs{days !== null ? ` · ≈ ${days} j` : ''}</span>; })()}
              </button>
            ))}
          </div>}

          {/* Raccourcis : ronds blancs, libellé dessous */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, marginBottom: 22 }}>
            {([{ i: 'calendar', l: 'Locations', p: 'bookings', c: '#3d6bff' }, { i: 'users', l: 'Clients', p: 'clients', c: '#8b5cf6' }, { i: 'car', l: 'Parc', p: 'fleet', c: '#22d3ee' }, { i: 'calc', l: 'Devis', p: 'devis', c: '#12b76a' }] as const).map(x => (
              <button key={x.p} onClick={() => go(x.p)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: T.font, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: T.text }}>
                <span style={{ width: 58, height: 58, borderRadius: 19, display: 'flex', alignItems: 'center', justifyContent: 'center', color: x.c, background: 'var(--dz-card)', border: '1px solid var(--dz-card-line)', boxShadow: `${T.shadow}, 0 10px 24px -14px ${x.c}` }}><Icon name={x.i} size={24} /></span>
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{x.l}</span>
              </button>
            ))}
          </div>

          {/* En ce moment : voitures dehors + arrivées des 7 prochains jours */}

          {(() => {
            if (!out.length && !soon.length) return null;
            return (
              <div style={{ marginBottom: 18 }}>
                <SectionTitle right={<Badge color={T.ok}>{out.length} dehors</Badge>}><Ico e="🚗" />En ce moment</SectionTitle>
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
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.053)', marginTop: 12, overflow: 'hidden' }}>
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

          <MeCard key={tick} />

          {/* 27/11 : agenda, départs, retours, à encaisser → carte « Ta journée » en haut ; résas à confirmer → « À traiter » */}
          {d && d.pendingBookings > 0 && (
            <div className="dz-press" role="button" onClick={() => go('leads')} style={{ cursor: 'pointer', marginBottom: 18, padding: '12px 14px', borderRadius: 14, background: tone(T.warn, 0.1), border: `1px solid ${tone(T.warn, 0.35)}`, fontSize: 14, color: T.text, lineHeight: 1.4 }}>
              <Ico e="⏳" /> <b>{d.pendingBookings} réservation{d.pendingBookings > 1 ? 's' : ''}</b> en attente de confirmation — <b>ouvrir Demandes ›</b>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
