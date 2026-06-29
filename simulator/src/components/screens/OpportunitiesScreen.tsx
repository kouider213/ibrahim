import { useState, useEffect, useRef, type CSSProperties } from 'react';
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

export default function OpportunitiesScreen({ onAsk }: { onAsk?: (prompt: string) => void } = {}) {
  const [opps, setOpps] = useState<OpportunitiesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<Opportunity | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tries = useRef(0);
  const baseline = useRef<string | null>(null); // updated_at au moment du "Actualiser" → on poll jusqu'à ce qu'il change

  // ── Favoris (stockés localement) — "Actualiser" régénère tout SAUF ceux-ci ──
  const [favs, setFavs] = useState<Opportunity[]>(() => {
    try { return JSON.parse(localStorage.getItem('dz:opp_favs') || '[]') as Opportunity[]; } catch { return []; }
  });
  const oppKey  = (o: Opportunity) => `${o.category}|${o.title}`;
  const favKeys = new Set(favs.map(oppKey));
  const isFav   = (o: Opportunity) => favKeys.has(oppKey(o));
  const toggleFav = (o: Opportunity) => setFavs(prev => {
    const exists = prev.some(f => oppKey(f) === oppKey(o));
    const next = exists ? prev.filter(f => oppKey(f) !== oppKey(o)) : [{ ...o }, ...prev];
    try { localStorage.setItem('dz:opp_favs', JSON.stringify(next)); } catch { /* quota plein, ignore */ }
    return next;
  });

  const load = async (force = false) => {
    setLoading(true); setErr(false);
    if (force) { baseline.current = opps?.updated_at ?? null; tries.current = 0; setRefreshing(true); }
    try {
      const r = await business.fetchOpportunities(force);
      setOpps(r);
      if (pollRef.current) clearTimeout(pollRef.current);
      // On attend une NOUVELLE analyse tant que :
      //  - pending (1ʳᵉ fois, pas de cache), OU
      //  - refreshing (backend régénère après un force), OU
      //  - on a forcé et updated_at n'a pas encore bougé (régen en cours)
      const waitingNew = baseline.current !== null && r.updated_at === baseline.current;
      if ((r.pending || r.refreshing || waitingNew) && tries.current < 12) {
        tries.current += 1;
        pollRef.current = setTimeout(() => void load(false), 10000);
      } else {
        tries.current = 0; baseline.current = null; setRefreshing(false);
      }
    } catch { setErr(true); setRefreshing(false); } finally { setLoading(false); }
  };
  useEffect(() => {
    void load(false);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  const items = opps?.items ?? [];
  // Favoris épinglés en haut + items frais (hors favoris pour éviter les doublons).
  // "Actualiser" régénère `items` mais NE touche PAS aux favoris (gardés en local).
  const merged = [...favs, ...items.filter(o => !favKeys.has(oppKey(o)))];
  const shown  = filter === 'all' ? merged : merged.filter(o => o.category === filter);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, position: 'relative' }}>
      <Hero eyebrow="Dzaryx · Veille" title="Opportunités" accent={C.gold} subtitle="Tout le business algérien : auto · immo · devises · investissement · aides · lois" />

      {/* Carte synthèse + actualiser */}
      <div style={{ margin: '0 18px 12px', background: `linear-gradient(135deg, ${C.gold}1c, ${C.surface})`, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🔍 Veille business Oran</div>
          <button onClick={() => void load(true)} disabled={loading || refreshing} style={{ border: `1px solid ${C.border}`, background: C.surface2, color: C.goldSoft, borderRadius: 10, padding: '6px 12px', fontFamily: C.font, fontSize: 11.5, fontWeight: 600, cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.7 : 1 }}>{refreshing ? '🔎 Analyse…' : loading ? '…' : '↻ Actualiser'}</button>
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
          const count = f.id === 'all' ? merged.length : merged.filter(o => o.category === f.id).length;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 20, border: `1px solid ${active ? C.gold : C.border}`, background: active ? C.gold : C.surface, color: active ? '#fff' : C.muted, fontFamily: C.font, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div style={{ padding: '0 18px 24px' }}>
        {(loading && !opps) || opps?.pending ? (
          <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🔎</div>
            <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>Dzaryx analyse le marché algérien…</div>
            <div>La 1ʳᵉ analyse prend ~1 minute. La page se remplit toute seule, reste ici.</div>
          </div>
        ) : err && !opps ? (
          <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>
            <div style={{ marginBottom: 12 }}>⚠️ Analyse indisponible (réseau ou serveur lent).</div>
            <button onClick={() => void load(true)} disabled={loading} style={{ border: `1px solid ${C.border}`, background: C.surface2, color: C.goldSoft, borderRadius: 10, padding: '9px 18px', fontFamily: C.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>↻ Réessayer</button>
          </div>
        ) : merged.length === 0 ? (
          <Empty t="Aucune opportunité trouvée. Touche ↻ Actualiser." />
        ) : shown.length === 0 ? (
          <Empty t="Rien dans cet axe pour l'instant." />
        ) : shown.map((o, i) => {
          const m = OPP_META[o.category] ?? OPP_META.marche;
          const uc = URG_COL[o.urgency] ?? C.muted;
          return (
            <div key={i} onClick={() => setSel(o)} role="button" style={{ ...card, padding: 14, marginBottom: 10, cursor: 'pointer', ...(isFav(o) ? { border: `1px solid ${C.gold}66`, background: `${C.gold}0c` } : {}) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 17 }}>{m.icon}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, flex: 1 }}>{o.title}</span>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(o); }} title={isFav(o) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 17, padding: 0, lineHeight: 1, color: isFav(o) ? C.gold : C.muted }}>{isFav(o) ? '★' : '☆'}</button>
                <span style={{ fontSize: 9, fontWeight: 700, color: uc, background: `${uc}1f`, padding: '3px 8px', borderRadius: 20 }}>{URG_LABEL[o.urgency]}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.detail}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 9.5, color: C.muted }}>{isFav(o) ? '★ Favori · ' : ''}{m.label}</span>
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
            {onAsk && (
              <button onClick={() => { onAsk(buildAskPrompt(sel)); setSel(null); }} style={{ width: '100%', marginTop: 18, padding: 14, borderRadius: 13, border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.goldSoft})`, color: '#fff', fontFamily: C.font, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>🤖 Demander à Dzaryx d'approfondir</button>
            )}
            <button onClick={() => toggleFav(sel)} style={{ width: '100%', marginTop: 10, padding: 13, borderRadius: 13, border: `1px solid ${isFav(sel) ? C.gold : C.border}`, background: isFav(sel) ? `${C.gold}1a` : 'transparent', color: isFav(sel) ? C.goldSoft : C.muted, fontFamily: C.font, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{isFav(sel) ? '★ Retirer des favoris' : '☆ Mettre en favori'}</button>
            <button onClick={() => setSel(null)} style={{ width: '100%', marginTop: 10, padding: 13, borderRadius: 13, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 14, cursor: 'pointer' }}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ t }: { t: string }) {
  return <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>{t}</div>;
}

function buildAskPrompt(o: Opportunity): string {
  const cat = OPP_META[o.category]?.label ?? o.category;
  return `Analyse en profondeur cette opportunité (${cat}) pour mon business à Oran et dis-moi concrètement quoi faire, les chiffres, les risques et les étapes :\n\n"${o.title}"\n${o.detail}${o.action ? `\n\nPiste : ${o.action}` : ''}\n\nContexte : je fais location + achat/revente de voitures, import, et immobilier à Oran, j'ai du capital et du réseau.`;
}

const card: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' };
