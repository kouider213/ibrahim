import { useState, useEffect, type CSSProperties } from 'react';
import { business, type OpportunitiesReport, type Opportunity } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#0b0b0d', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.07)',
  gold: '#a78bfa', goldSoft: '#c4b5fd', text: '#f5f5f7', muted: '#9b9ba6',
  red: '#fb7185', green: '#34d399',
  font: '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const OPP_META: Record<string, { icon: string; label: string }> = {
  location: { icon: '🔑', label: 'Location' },
  vente:    { icon: '💰', label: 'Achat/Revente' },
  import:   { icon: '⛴️', label: 'Import' },
  immo:     { icon: '🏠', label: 'Immobilier' },
  change:   { icon: '💱', label: 'Devises' },
  invest:   { icon: '📈', label: 'Investissement' },
  aide:     { icon: '🏛️', label: 'Aides État' },
  business: { icon: '💡', label: 'Business' },
  loi:      { icon: '📜', label: 'Loi' },
  marche:   { icon: '📊', label: 'Marché' },
  modele:   { icon: '🆕', label: 'Nouveauté' },
};
const URG_COL: Record<string, string> = { urgent: '#fb7185', a_suivre: '#34d399', info: '#9b9ba6' };
const URG_LABEL: Record<string, string> = { urgent: 'URGENT', a_suivre: 'À suivre', info: 'Info' };

// Filtres affichés (ordre)
const FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all',      label: 'Tout' },
  { id: 'location', label: '🔑 Location' },
  { id: 'vente',    label: '💰 Achat/Revente' },
  { id: 'immo',     label: '🏠 Immo' },
  { id: 'import',   label: '⛴️ Import' },
  { id: 'change',   label: '💱 Devises' },
  { id: 'invest',   label: '📈 Investir' },
  { id: 'aide',     label: '🏛️ Aides' },
  { id: 'business', label: '💡 Business' },
  { id: 'loi',      label: '📜 Lois' },
];

export default function OpportunitiesScreen() {
  const [opps, setOpps] = useState<OpportunitiesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<Opportunity | null>(null);

  const load = async (force = false) => {
    setLoading(true); setErr(false);
    try { setOpps(await business.fetchOpportunities(force)); }
    catch { setErr(true); } finally { setLoading(false); }
  };
  useEffect(() => { void load(false); }, []);

  const items = opps?.items ?? [];
  const shown = filter === 'all' ? items : items.filter(o => o.category === filter);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      <Hero eyebrow="Dzaryx · Veille" title="Opportunités" accent={C.gold} subtitle="Tout le business algérien : auto · immo · devises · investissement · aides · lois" />

      {/* Carte synthèse + actualiser */}
      <div style={{ margin: '0 18px 12px', background: `linear-gradient(135deg, ${C.gold}1c, ${C.surface})`, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🔍 Veille business Oran</div>
          <button onClick={() => void load(true)} disabled={loading} style={{ border: `1px solid ${C.border}`, background: C.surface2, color: C.goldSoft, borderRadius: 10, padding: '6px 12px', fontFamily: C.font, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{loading ? '…' : '↻ Actualiser'}</button>
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.45 }}>
          {opps?.summary || 'Dzaryx surveille chaque jour TOUT le business algérien : auto, immobilier, devises (euro/dinar), investissement, aides de l\'État, lois & toute affaire intéressante. Touche une opportunité pour la lire en entier.'}
        </div>
        {opps?.updated_at && <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>🔄 Auto chaque jour · mis à jour : {new Date(opps.updated_at).toLocaleString('fr-FR')}</div>}
      </div>

      {/* Filtres par axe */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 18px 12px', WebkitOverflowScrolling: 'touch' }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const count = f.id === 'all' ? items.length : items.filter(o => o.category === f.id).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 20, border: `1px solid ${active ? C.gold : C.border}`, background: active ? C.gold : C.surface, color: active ? '#fff' : C.muted, fontFamily: C.font, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div style={{ padding: '0 18px 24px' }}>
        {loading && !opps ? (
          <Empty t="Dzaryx analyse le marché… (jusqu'à ~40s la 1ʳᵉ fois)" />
        ) : err && !opps ? (
          <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>⚠️ Analyse indisponible (réseau ou serveur lent).</div>
            <button onClick={() => void load(true)} disabled={loading} style={{ border: `1px solid ${C.border}`, background: C.surface2, color: C.goldSoft, borderRadius: 10, padding: '9px 18px', fontFamily: C.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>↻ Réessayer</button>
          </div>
        ) : items.length === 0 ? (
          <Empty t="Aucune opportunité trouvée. Touche ↻ Actualiser." />
        ) : shown.length === 0 ? (
          <Empty t="Rien dans cet axe pour l'instant." />
        ) : shown.map((o, i) => {
          const m = OPP_META[o.category] ?? OPP_META.marche;
          const uc = URG_COL[o.urgency] ?? C.muted;
          return (
            <div key={i} onClick={() => setSel(o)} role="button" style={{ ...card, padding: 14, marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 17 }}>{m.icon}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>{o.title}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: uc, background: `${uc}1f`, padding: '3px 8px', borderRadius: 20 }}>{URG_LABEL[o.urgency]}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.detail}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 9.5, color: C.muted }}>{m.label}</span>
                <span style={{ fontSize: 11, color: C.goldSoft, fontWeight: 600 }}>Lire →</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal lecture complète */}
      {sel && (
        <div onClick={() => setSel(null)} style={{ position: 'absolute', inset: 0, zIndex: 35, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: C.surface, borderRadius: '22px 22px 0 0', border: `1px solid ${C.border}`, padding: '20px 18px 28px', maxHeight: '88%', overflowY: 'auto' }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border, margin: '0 auto 16px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{(OPP_META[sel.category] ?? OPP_META.marche).icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: URG_COL[sel.urgency] ?? C.muted, background: `${URG_COL[sel.urgency] ?? C.muted}1f`, padding: '3px 9px', borderRadius: 20 }}>{URG_LABEL[sel.urgency]}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>{(OPP_META[sel.category] ?? OPP_META.marche).label}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 14, lineHeight: 1.3 }}>{sel.title}</div>
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{sel.detail}</div>
            {sel.action && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: `${C.gold}10`, border: `1px solid ${C.gold}33` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.goldSoft, marginBottom: 5 }}>👉 À FAIRE</div>
                <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{sel.action}</div>
              </div>
            )}
            <button onClick={() => setSel(null)} style={{ width: '100%', marginTop: 20, padding: 13, borderRadius: 13, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 14, cursor: 'pointer' }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>{t}</div>;
}

const card: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' };
