import { useState, useEffect, useCallback } from 'react';
import { business, type TodayItem } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import { T, tone, Screen, PageHeader, HeadBtn, Kpi, KpiGrid, SectionTitle, Row, Avatar, Badge, Empty, waLink, money } from '../ui/Kit.tsx';

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

  const load = useCallback(async () => {
    setLoading(true);
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
            <Row key={it.id} accent={col}
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
          <KpiGrid>
            <Kpi value={money(due)} label="À encaisser" color={T.warn} sub={d.toCollect.length ? `${d.toCollect.length} client${d.toCollect.length > 1 ? 's' : ''}` : 'Tout est payé'} />
            <Kpi value={d.newDemands} label="Demandes (24 h)" color={T.accent2} sub={d.pendingBookings ? `${d.pendingBookings} résa à confirmer` : undefined} />
            <Kpi value={d.departures.length} label="Départs" color={T.accent} />
            <Kpi value={d.returns.length} label="Retours" color={T.violet} />
          </KpiGrid>

          {d.pendingBookings > 0 && (
            <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 14, background: tone(T.warn, 0.1), border: `1px solid ${tone(T.warn, 0.35)}`, fontSize: 14, color: T.text, lineHeight: 1.4 }}>
              ⏳ <b>{d.pendingBookings} réservation{d.pendingBookings > 1 ? 's' : ''}</b> en attente de confirmation — onglet <b>Demandes</b>.
            </div>
          )}

          <Section title="Départs" items={d.departures} col={T.accent} icon="🚗" empty="Aucun départ aujourd'hui." verb="Part avec" />
          <Section title="Retours" items={d.returns} col={T.violet} icon="↩️" empty="Aucun retour aujourd'hui." verb="Rend" />
          <Section title="À encaisser" items={d.toCollect} col={T.warn} icon="💰" empty="Rien à encaisser." verb="Location" />
        </>
      )}
    </Screen>
  );
}
