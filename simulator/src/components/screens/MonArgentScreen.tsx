import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, PageHeader, Screen, SectionTitle, Btn, Sheet, Field, inputStyle, Badge, Empty, money, glass, CountUp, HeadBtn } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';
import { DepartCard } from './DepartPlan.tsx';
import { ProdTag, type StockOv } from './StockScreen.tsx';

// MON ARGENT (27/11) : tout l'argent de Kouider hors salaire — snus (à la pièce), appartement (prix client − propriétaire),
// vente de voiture, autre / heures sup + bénéfice FIK automatique. Soldes, graphiques, départ pour Oran, 20 repères, conseiller.
// PRIVÉ : données sur le serveur (/api/mon-argent, compte Kouider seulement) — aucun chiffre dans ce code (dépôt public).
// Même journal que Telegram : « snus 150 » écrit à Dzaryx apparaît ici, et l'inverse.

interface Part { id: string; amount: number }
interface Src { id: string; label: string; amount: number }
export interface MonArgent {
  balances: { compte: number; cash: number; total: number; compteAt: string | null; cashAt: string | null };
  today: { total: number; bySource: Src[]; day?: DayMoney }; week: { total: number };
  month: { total: number; prev: number; pace: number; bySource: Src[]; depenses: number }; year: { total: number; bySource: Src[] };
  snus: { today: number; todayEur: number; week: number; month: number; monthEur: number; avgUnit: number | null; costPiece: number | null; marginPiece: number | null; discount: number; perDay: number };
  depart: { moveAt: string | null; label: string | null; upfront: number; pct: number | null } | null;
  insights: Array<{ icon: string; title: string; text: string; tone: 'ok' | 'warn' | 'info' }>;
  bestDays: Array<{ d: string; amount: number; day: string }>;
  weekdays: Array<{ name: string; avg: number; n: number }>;
  last30: Array<{ d: string; amount: number; parts: Part[] }>;
  months6: Array<{ ym: string; label: string; amount: number; parts: Part[] }>;
  recent: Array<{ key: string; at: number; time?: string | null; d: string; cat: string; label: string; amount: number; qty: number | null; unit: number | null; via: 'app' | 'telegram' }>;
  sources: Array<{ id: string; label: string; icon: string }>;
  tarifs: Array<{ id: string; label: string; hint: string }>;
  extras: null | {
    settings: { dayPieces?: number; monthEur?: number }; stock: { pieces: number; since: string } | null;
    yesterday: { total: number; pieces: number }; dayGoal: { target: number; done: number } | null;
    monthGoal: { target: number; done: number; perDayLeft: number } | null;
    expenses: { total: number; byCat: Array<{ id: string; label: string; icon: string; amount: number }>; saveRate: number | null };
    realCurve: Array<{ ym: string; v: number }>; balancesAge: number; rate: number | null; depCats: Array<{ id: string; label: string; icon: string }>;
  };
}
export const SRC_COL: Record<string, string> = { prise: '#ef4444', fik: '#3d6bff', snus: '#12b76a', appartement: '#f97316', 'vente-voiture': '#8b5cf6', autre: '#f59e0b', cash: '#64748b' };
// 27/11 soir : l'argent DU JOUR = ventes − ce qu'il a pris dessus, chaque ligne avec son heure
type DayMoney = { date: string; ventes: number; pris: number; net: number; last: string | null; readAt: string | null;
  lines: Array<{ key: string; at: number; time: string | null; kind: 'vente' | 'prise' | 'correction'; label: string; amount: number }> };
const SRC_NAME: Record<string, string> = { fik: 'FIK', snus: 'Snus', appartement: 'Appart', 'vente-voiture': 'Voiture', autre: 'Autre', cash: 'Cash' };
const dm = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const snusPrice = (qty: number, tarif: string) => { const unit = tarif === 'cinq' ? 5 : tarif === 'lot' ? (qty >= 10 ? 5 : 6) : 6; return { unit, amount: qty * unit }; };
export const addSnus = (qty: number, tarif: string, pid?: string) => apiFetch<{ message: string; overview: MonArgent }>('/api/mon-argent/add', { method: 'POST', body: JSON.stringify({ cat: 'snus', qty, tarif, ...(pid ? { pid } : {}) }) });

/** Barres empilées par source (mois ou jours). */
function Stacked({ cols, height = 120, labels }: { cols: Array<{ key: string; amount: number; parts: Part[]; label?: string; hi?: boolean }>; height?: number; labels?: boolean }) {
  const mx = Math.max(1, ...cols.map(c => c.amount));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: labels ? 8 : 3, height }}>
        {cols.map(c => (
          <div key={c.key} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
            {labels && <span style={{ fontSize: 10.5, fontWeight: 800, color: c.amount ? T.text : T.faint, whiteSpace: 'nowrap' }}>{c.amount ? `${Math.round(c.amount)}` : ''}</span>}
            <div title={`${c.label ?? c.key} : ${money(c.amount)}`} style={{ width: '100%', height: `${Math.max(c.amount ? 4 : 2, c.amount / mx * (labels ? 82 : 100))}%`, display: 'flex', flexDirection: 'column-reverse', borderRadius: 5, overflow: 'hidden', background: c.amount ? 'transparent' : T.line, opacity: c.hi === false ? 0.85 : 1 }}>
              {c.parts.map(p => <div key={p.id} style={{ flex: p.amount, background: SRC_COL[p.id] ?? T.accent }} />)}
            </div>
          </div>
        ))}
      </div>
      {labels && <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>{cols.map(c => <span key={c.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: c.hi ? T.text : T.faint, fontWeight: c.hi ? 800 : 500 }}>{c.label}</span>)}</div>}
    </div>
  );
}

/** Anneau des sources (SVG). */
function Donut({ rows, size = 120, label }: { rows: Src[]; size?: number; label: string }) {
  const tot = rows.reduce((s, r) => s + r.amount, 0);
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(var(--dz-ink-rgb),0.06)" strokeWidth={14} />
      {tot > 0 && rows.map(x => { const len = x.amount / tot * c; const el = <circle key={x.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SRC_COL[x.id] ?? T.accent} strokeWidth={14} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />; off += len; return el; })}
      <text x="50%" y="47%" textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.55}>ce mois</text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="14" fontWeight={800} fill="currentColor">{label}</text>
    </svg>
  );
}

export default function MonArgentScreen() {
  const [o, setO] = useState<MonArgent | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [qty, setQty] = useState(0);
  const [tarif, setTarif] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'' | 'appartement' | 'vente-voiture' | 'autre' | 'soldes' | 'conseil' | 'objectifs' | 'arrivage' | 'stock' | 'depense' | 'depot' | 'retrait' | 'prise' | 'jour'>('');
  const [f, setF] = useState({ amount: '', client: '', owner: '', label: '', compte: '', cash: '', q: '' });
  const [answer, setAnswer] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [histN, setHistN] = useState(20);
  const [hide, setHide] = useState(() => localStorage.getItem('dz:argent:hide') === '1');   // mode discret (montants masqués)
  const [da, setDa] = useState(() => localStorage.getItem('dz:argent:da') === '1');         // montants en dinars (taux square)
  const [filter, setFilter] = useState('');
  const [dayN, setDayN] = useState(6);
  const [g, setG] = useState({ dayPieces: '', monthEur: '', pieces: '', cost: '', amount: '', cat: 'courses', cash: true, why: '' });
  const setGG = (k: keyof typeof g, v: string | boolean) => setG(x => ({ ...x, [k]: v }));
  const rate = o?.extras?.rate ?? null;
  const fm = (n: number) => (hide ? '•••• €' : da && rate ? `${Math.round(n * rate).toLocaleString('fr-FR')} DA` : money(n));
  const toggle = (k: 'hide' | 'da') => { if (k === 'hide') { localStorage.setItem('dz:argent:hide', hide ? '0' : '1'); setHide(!hide); } else { localStorage.setItem('dz:argent:da', da ? '0' : '1'); setDa(!da); } };
  const x = o?.extras ?? null;
  // 27/11 : modèle vendu (catalogue privé) — gardé sur le téléphone
  const [stock, setStock] = useState<StockOv | null>(null);
  const [pid, setPid] = useState(() => localStorage.getItem('dz:argent:pid') ?? '');
  useEffect(() => { apiFetch<StockOv>('/api/mon-argent/stock').then(setStock).catch(() => setStock(null)); }, [o]);
  const pick = (id: string) => { setPid(id); localStorage.setItem('dz:argent:pid', id); };
  const go = (p: string) => window.dispatchEvent(new CustomEvent('dz:go', { detail: p }));
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); };
  const setFF = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    try { setO(await apiFetch<MonArgent>('/api/mon-argent')); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (path: string, body: unknown, ok: (r: { message?: string; overview?: MonArgent; answer?: string }) => void) => {
    setBusy(true);
    try { const r = await apiFetch<{ message?: string; overview?: MonArgent; answer?: string }>(path, { method: 'POST', body: JSON.stringify(body) }); if (r.overview) setO(r.overview); ok(r); }
    catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };
  const saveSnus = () => qty > 0 && void post('/api/mon-argent/add', { cat: 'snus', qty, tarif, ...(pid ? { pid } : {}) }, r => { setQty(0); flash(`✅ ${r.message}`); });
  const quickOne = (unit: 5 | 6) => void post('/api/mon-argent/add', { cat: 'snus', qty: 1, tarif: unit === 5 ? 'cinq' : 'six', ...(pid ? { pid } : {}) }, r => flash(`✅ ${r.message}`));
  const saveOther = () => {
    if (!sheet) return;
    const body = sheet === 'appartement' ? { cat: sheet, client: Number(f.client), owner: Number(f.owner || 0), label: f.label } : { cat: sheet, amount: Number(f.amount), label: f.label || (sheet === 'autre' ? 'Heures sup' : '') };
    void post('/api/mon-argent/add', body, r => { setSheet(''); setF(s => ({ ...s, amount: '', client: '', owner: '', label: '' })); flash(`✅ ${r.message}`); });
  };
  const preview = qty > 0 ? snusPrice(qty, tarif) : null;
  const maxWd = Math.max(1, ...(o?.weekdays.map(w => w.avg) ?? [1]));
  const monthDiff = o && o.month.prev ? Math.round((o.month.pace - o.month.prev) / o.month.prev * 100) : null;

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Privé · toi seul" title="Mon argent" subtitle={o ? `${fm(o.today.day?.net ?? o.today.total)} aujourd'hui · ${fm(o.month.total)} ce mois` : 'Tout ce que tu gagnes, hors salaire'}
      right={<HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} />} />}>
      {err ? <Empty icon="🔒" title="Indisponible" text={err} action={<Btn onClick={() => void load()}>Réessayer</Btn>} />
        : !o ? <SkeletonCards count={4} height={120} /> : <>

        {/* Carte principale (style Aujourd'hui) */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 28, padding: '20px 20px 18px', marginBottom: 16,
          background: 'radial-gradient(120% 90% at 100% 0%, rgba(95,224,168,0.45), transparent 52%), radial-gradient(110% 90% at 0% 100%, rgba(13,148,136,0.7), transparent 58%), linear-gradient(145deg, #0f7a4f 0%, #0b3b37 100%)', boxShadow: '0 24px 44px -24px rgba(var(--dz-shadow-rgb),0.7)' }}>
          <div style={{ position: 'absolute', top: -70, right: -50, width: 220, height: 220, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
            Tout ton argent
            <button onClick={() => { setF(s => ({ ...s, compte: String(o.balances.compte || ''), cash: String(o.balances.cash || '') })); setSheet('soldes'); }} style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.14)', padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: T.font }}>Modifier</button>
          </div>
          <div style={{ position: 'relative', fontFamily: T.display, fontSize: 50, fontWeight: 600, letterSpacing: '-0.055em', lineHeight: 1, color: '#fff', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}><CountUp value={fm(o.balances.total)} /></div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
            {[{ l: 'Compte', v: fm(o.balances.compte) }, { l: 'Cash', v: fm(o.balances.cash) }, { l: 'Gagné ce mois', v: fm(o.month.total), c: '#9ef0c6' }].map(x => (
              <div key={x.l}><div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{x.l}</div>
                <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 800, color: x.c ?? '#fff', marginTop: 3, whiteSpace: 'nowrap' }}><CountUp value={x.v} /></div></div>
            ))}
          </div>
        </div>

        {/* Discret / dinars / dépôt / retrait */}
        <div style={{ display: 'flex', gap: 6, marginTop: -6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[{ l: hide ? '👁 Afficher' : '🙈 Discret', f: () => toggle('hide') }, ...(rate ? [{ l: da ? '€ Euros' : 'DA Dinars', f: () => toggle('da') }] : []),
            { l: '🏦 Dépôt', f: () => setSheet('depot') }, { l: '💵 Retrait', f: () => setSheet('retrait') }].map(b => (
            <button key={b.l} onClick={b.f} style={{ flex: 1, minWidth: 74, padding: '9px 6px', borderRadius: 12, border: `1px solid ${T.line}`, background: 'var(--dz-card)', color: T.text, fontSize: 12.5, fontWeight: 700, fontFamily: T.font, cursor: 'pointer' }}>{b.l}</button>
          ))}
        </div>
        {x && x.balancesAge > 7 && <div onClick={() => setSheet('soldes')} style={{ ...glass(T.warn), borderRadius: 14, padding: '10px 12px', marginBottom: 12, fontSize: 13, cursor: 'pointer' }}>🧾 Tes soldes datent de {x.balancesAge} jours : touche pour les mettre à jour (ton plan de départ en dépend).</div>}

        {/* 27/11 soir : argent d'aujourd'hui — ventes − pris dessus, heures, modifiable */}
        {o.today.day && (() => { const dd = o.today.day!; return (
          <div style={{ ...glass(SRC_COL.snus), borderRadius: 22, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>💵 Argent d'aujourd'hui</div>
              <span style={{ fontSize: 11.5, color: T.faint }}>lu à {dd.readAt ?? '—'}</span>
            </div>
            <div style={{ fontFamily: T.display, fontSize: 38, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fm(dd.net)}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
              {dd.pris ? <>ventes {fm(dd.ventes)} − pris <b style={{ color: T.bad }}>{fm(dd.pris)}</b></> : <>ventes {fm(dd.ventes)}</>}{dd.last ? ` · dernière ligne à ${dd.last}` : ' · rien noté encore'}
            </div>
            {dd.lines.length > 0 && <div style={{ marginTop: 10, borderTop: `1px solid ${T.line}` }}>
              {[...dd.lines].reverse().slice(0, dayN).map(l => (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${T.line}` }}>
                  <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.muted, width: 42 }}>{l.time ?? '--:--'}</span>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
                  <b style={{ fontSize: 14, color: l.amount < 0 ? T.bad : T.text }}>{l.amount < 0 ? '−' : '+'}{fm(Math.abs(l.amount))}</b>
                  <button onClick={() => { if (window.confirm(`Supprimer cette ligne (${l.time ?? ''} ${fm(Math.abs(l.amount))}) ?`)) void post('/api/mon-argent/undo', { key: l.key }, () => flash('🗑️ Ligne supprimée')); }}
                    aria-label="Supprimer" style={{ background: 'none', border: 'none', color: T.faint, fontSize: 14, cursor: 'pointer', padding: 2 }}>✕</button>
                </div>
              ))}
              {dd.lines.length > dayN && <button onClick={() => setDayN(n => n + 20)} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: T.font, padding: '8px 0 0' }}>Voir les {dd.lines.length - dayN} autres</button>}
            </div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <Btn variant="ghost" onClick={() => { setG(v => ({ ...v, amount: '', why: '' })); setSheet('prise'); }} style={{ flex: 1 }}>➖ J'ai pris dessus</Btn>
              <Btn variant="ghost" onClick={() => { setG(v => ({ ...v, amount: String(dd.net) })); setSheet('jour'); }} style={{ flex: 1 }}>✏️ Modifier le montant</Btn>
            </div>
          </div>); })()}

        {/* Hier + objectifs */}
        {x && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
          <div style={{ ...glass(T.accent), borderRadius: 18, padding: 12 }}>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Hier</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fm(x.yesterday.total)}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{x.yesterday.pieces ? `${x.yesterday.pieces} pièces de snus` : 'rien noté en snus'}</div>
          </div>
          <div onClick={() => { setG(v => ({ ...v, dayPieces: String(x.settings.dayPieces ?? ''), monthEur: String(x.settings.monthEur ?? '') })); setSheet('objectifs'); }} style={{ ...glass(T.violet), borderRadius: 18, padding: 12, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Objectifs ✏️</div>
            {x.dayGoal || x.monthGoal ? <>
              {x.dayGoal && <><div style={{ fontSize: 13.5, fontWeight: 700 }}>{x.dayGoal.done}/{x.dayGoal.target} pièces aujourd'hui</div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.07)', margin: '4px 0 6px' }}><div style={{ height: '100%', width: `${Math.min(100, x.dayGoal.done / Math.max(1, x.dayGoal.target) * 100)}%`, background: SRC_COL.snus, borderRadius: 3 }} /></div></>}
              {x.monthGoal && <div style={{ fontSize: 12, color: T.muted }}>Mois : {fm(x.monthGoal.done)} / {fm(x.monthGoal.target)}{x.monthGoal.perDayLeft ? ` · encore ${fm(x.monthGoal.perDayLeft)}/jour` : ' ✅'}</div>}
            </> : <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>Fixe un nombre de pièces par jour et un objectif du mois</div>}
          </div>
        </div>}

        {/* Snus : compteur de pièces */}
        <div style={{ ...glass(SRC_COL.snus), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>🟢 Snus vendus</div>
            <div style={{ fontSize: 13, color: T.muted }}>aujourd'hui <b style={{ color: T.text }}>{o.snus.today} pièce{o.snus.today > 1 ? 's' : ''}</b> · {fm(o.snus.todayEur)}</div>
          </div>
          {stock && stock.products.some(p => p.active) && <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}><span style={{ flex: 1, fontSize: 12, color: T.muted, fontWeight: 800 }}>QUEL MODÈLE ?</span><button onClick={() => go('stocksnus')} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: T.font }}>Stock & commandes ›</button></div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
              {stock.products.filter(p => p.active).sort((a, b) => b.sold30 - a.sold30 || (a.brand + (a.points ?? 0)).localeCompare(b.brand + (b.points ?? 0))).map(p => (
                <button key={p.id} onClick={() => pick(pid === p.id ? '' : p.id)} style={{ flexShrink: 0, padding: '7px 9px', borderRadius: 12, border: `2px solid ${pid === p.id ? SRC_COL.snus : T.line}`, background: pid === p.id ? tone(SRC_COL.snus, 0.15) : 'transparent', color: T.text, cursor: 'pointer', fontFamily: T.font, opacity: p.rupture && !(p.stock ?? 0) ? 0.5 : 1 }}>
                  <ProdTag p={p} small />{p.stock != null && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>stock {p.stock}</div>}
                </button>
              ))}
            </div>
          </>}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {o.tarifs.map(t => (
              <button key={t.id} onClick={() => setTarif(t.id)} style={{ flex: 1, padding: '8px 4px', borderRadius: 12, fontFamily: T.font, cursor: 'pointer', border: `1px solid ${tarif === t.id ? SRC_COL.snus : T.line}`, background: tarif === t.id ? tone(SRC_COL.snus, 0.18) : 'transparent', color: T.text }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{t.label}</div><div style={{ fontSize: 11, color: T.muted }}>{t.hint}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
            {[1, 2, 5, 10].map(n => (
              <button key={n} disabled={busy} onClick={() => setQty(q => q + n)} className="dz-press" style={{ padding: '16px 0', borderRadius: 16, border: 'none', background: SRC_COL.snus, color: '#fff', fontSize: 20, fontWeight: 800, fontFamily: T.font, cursor: 'pointer', boxShadow: `0 10px 22px -12px ${SRC_COL.snus}` }}>+{n}</button>
            ))}
          </div>
          {preview ? (
            /* 27/11 : « je dois pouvoir valider la vente de 10 » → gros bouton bien visible juste sous les +N */
            <div style={{ marginTop: 10 }}>
              <button disabled={busy} onClick={saveSnus} className="dz-press" style={{ width: '100%', padding: '16px 12px', borderRadius: 16, border: 'none', background: `linear-gradient(135deg, ${SRC_COL.snus}, #0f7a4f)`, color: '#fff', fontFamily: T.font, cursor: 'pointer', boxShadow: `0 14px 28px -14px ${SRC_COL.snus}` }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{busy ? 'Enregistrement…' : `✅ Valider la vente : ${qty} pièce${qty > 1 ? 's' : ''}${pid && stock ? ` ${stock.products.find(p => p.id === pid)?.label ?? ''}` : ''}`}</div>
                <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 2 }}>{qty} × {preview.unit} € = {fm(preview.amount)}{tarif === 'lot' && qty < 10 ? ' (le lot à 5 € commence à 10)' : ''}</div>
              </button>
              <button onClick={() => setQty(0)} style={{ width: '100%', marginTop: 6, padding: 8, background: 'none', border: 'none', color: T.bad, fontWeight: 700, cursor: 'pointer', fontFamily: T.font, fontSize: 13.5 }}>Annuler ({qty} pièce{qty > 1 ? 's' : ''})</button>
            </div>
          ) : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 8 }}>
              {([6, 5] as const).map(u => (
                <button key={u} disabled={busy} onClick={() => quickOne(u)} className="dz-press" style={{ padding: '12px 0', borderRadius: 14, border: `1px solid ${SRC_COL.snus}`, background: 'transparent', color: T.text, fontSize: 14.5, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>1 pièce à {u} € <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>· tout de suite</span></button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 10 }}>Plusieurs pièces : appuie sur +1, +2, +5, +10 (ils s'additionnent), puis « Valider la vente ». Ristourne client : « 1 pièce à 5 € ».</div>
          </>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 13.5 }}>📦 Stock : {x?.stock ? <b style={{ color: x.stock.pieces <= 30 ? T.bad : T.text }}>{x.stock.pieces} pièces</b> : <span style={{ color: T.muted }}>pas compté</span>}</div>
            <button onClick={() => setSheet('arrivage')} style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${T.line}`, background: 'transparent', color: T.text, fontSize: 12.5, fontWeight: 700, fontFamily: T.font, cursor: 'pointer' }}>＋ Arrivage</button>
            <button onClick={() => setSheet('stock')} style={{ padding: '7px 10px', borderRadius: 10, border: `1px solid ${T.line}`, background: 'transparent', color: T.text, fontSize: 12.5, fontWeight: 700, fontFamily: T.font, cursor: 'pointer' }}>Compter</button>
          </div>
          {o.snus.marginPiece != null && <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: 12.5, color: T.muted, flexWrap: 'wrap' }}>
            <span>Ce mois <b style={{ color: T.text }}>{o.snus.month} pièces</b></span>
            <span>Prix moyen <b style={{ color: T.text }}>{o.snus.avgUnit?.toFixed(2)} €</b></span>
            <span>Marge <b style={{ color: T.ok }}>{o.snus.marginPiece.toFixed(2)} €/pièce</b></span>
          </div>}
        </div>

        {/* Autres sources */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 20 }}>
          {([['appartement', '🏠', 'Appartement'], ['vente-voiture', '🚘', 'Vente voiture'], ['autre', '⏱️', 'Heures sup / autre']] as const).map(([id, ic, l]) => (
            <button key={id} onClick={() => setSheet(id)} className="dz-press" style={{ ...glass(SRC_COL[id]), borderRadius: 18, padding: '14px 8px', cursor: 'pointer', fontFamily: T.font, color: T.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 24 }}>{ic}</span><span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}>{l}</span><span style={{ fontSize: 11, color: T.muted }}>+ ajouter</span>
            </button>
          ))}
        </div>

        {/* Dépenses */}
        <SectionTitle right={<button onClick={() => setSheet('depense')} style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>＋ Dépense</button>}>Tes dépenses ce mois</SectionTitle>
        <div style={{ ...glass(T.bad), borderRadius: 22, padding: 16, marginBottom: 16 }}>
          {x && x.expenses.byCat.length ? <>
            {x.expenses.byCat.map(c => <div key={c.id} style={{ display: 'flex', fontSize: 13.5, marginBottom: 6 }}><span style={{ flex: 1 }}>{c.icon} {c.label}</span><b>{fm(c.amount)}</b></div>)}
            <div style={{ display: 'flex', fontSize: 13, color: T.muted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}><span style={{ flex: 1 }}>Total {fm(x.expenses.total)}</span>{x.expenses.saveRate != null && <span>Tu gardes <b style={{ color: x.expenses.saveRate >= 30 ? T.ok : T.warn }}>{x.expenses.saveRate} %</b> de ce que tu gagnes en plus</span>}</div>
          </> : <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45 }}>Aucune dépense notée ce mois. Note les grosses (courses, essence, maison…) : ton plan de départ devient juste au lieu de supposer que tu dépenses tout.</div>}
        </div>

        {/* Ce mois : anneau + sources */}
        <SectionTitle right={monthDiff != null ? <Badge color={monthDiff >= 0 ? T.ok : T.bad}>{monthDiff >= 0 ? '▲ +' : '▼ '}{monthDiff} % vs mois dernier</Badge> : undefined}>Ce mois</SectionTitle>
        <div style={{ ...glass(T.accent), borderRadius: 22, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <Donut rows={o.month.bySource} label={fm(o.month.total)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {o.month.bySource.length ? o.month.bySource.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 13.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SRC_COL[s.id] ?? T.accent, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span><b>{fm(s.amount)}</b>
              </div>)) : <div style={{ fontSize: 13, color: T.faint }}>Rien de noté ce mois.</div>}
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>À ce rythme : <b style={{ color: T.text }}>{fm(o.month.pace)}</b> fin du mois</div>
          </div>
        </div>

        {/* 6 mois */}
        <SectionTitle>6 derniers mois</SectionTitle>
        <div style={{ ...glass(T.violet), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          <Stacked labels height={140} cols={o.months6.map((m, i) => ({ key: m.ym, amount: m.amount, parts: m.parts, label: m.label, hi: i === o.months6.length - 1 }))} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            {Object.keys(SRC_NAME).filter(k => o.months6.some(m => m.parts.some(p => p.id === k))).map(k => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={{ width: 8, height: 8, borderRadius: 2, background: SRC_COL[k] }} />{SRC_NAME[k]}</span>)}
          </div>
        </div>

        {/* 30 jours */}
        <SectionTitle>30 derniers jours</SectionTitle>
        <div style={{ ...glass(T.ok), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          <Stacked height={90} cols={o.last30.map(d => ({ key: d.d, amount: d.amount, parts: d.parts, label: dm(d.d) }))} />
          <div style={{ display: 'flex', fontSize: 11.5, color: T.faint, marginTop: 6 }}><span style={{ flex: 1 }}>{dm(o.last30[0]!.d)}</span><span>aujourd'hui</span></div>
        </div>

        {/* Départ : plan par étapes (DepartPlan.tsx) */}
        <SectionTitle>Ton départ pour Oran</SectionTitle>
        <DepartCard real={x?.realCurve ?? []} fm={fm} />

        {/* Repères */}
        {o.insights.length > 0 && <>
          <SectionTitle>{o.insights.length} repères pour toi</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {(showAll ? o.insights : o.insights.slice(0, 6)).map((x, i) => (
              <div key={i} style={{ ...glass(x.tone === 'ok' ? T.ok : x.tone === 'warn' ? T.warn : T.accent), borderRadius: 18, padding: '12px 14px', display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 22 }}>{x.icon}</span>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 800 }}>{x.title}</div><div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{x.text}</div></div>
              </div>
            ))}
            {o.insights.length > 6 && <Btn variant="ghost" onClick={() => setShowAll(v => !v)}>{showAll ? 'Moins' : `Voir les ${o.insights.length - 6} autres`}</Btn>}
          </div>
        </>}

        {/* Conseiller */}
        <SectionTitle>Ton conseiller</SectionTitle>
        <div className="dz-press" role="button" onClick={() => setSheet('conseil')} style={{ ...glass(T.violet), borderRadius: 22, padding: 16, marginBottom: 12, cursor: 'pointer' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>💡 Une idée, un achat, un nouveau business ?</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>Il connaît ton capital, ce que tu gagnes, que les voitures FIK sont à Houari et ton départ : il cherche les vrais prix, calcule, et te dit si ça avance ou recule ton départ.</div>
        </div>

        <Btn variant="ghost" disabled={busy} onClick={() => void post('/api/mon-argent/recap', {}, r => flash(r.message ?? 'Envoyé'))} style={{ width: '100%', marginBottom: 16 }}>📄 Recevoir le récap PDF du mois sur Telegram</Btn>

        {/* Jours */}
        <SectionTitle>Tes meilleurs jours</SectionTitle>
        <div style={{ ...glass(T.accent), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6, 0].map(i => o.weekdays[i]!).map(w => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 13 }}>
              <span style={{ width: 78, color: T.muted }}>{w.name}</span>
              <div style={{ flex: 1, height: 9, background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 5 }}><div style={{ height: '100%', width: `${w.avg / maxWd * 100}%`, background: `linear-gradient(90deg, ${tone(T.accent, 0.5)}, ${T.accent})`, borderRadius: 5 }} /></div>
              <span style={{ width: 60, textAlign: 'right', fontWeight: 700 }}>{w.n ? fm(w.avg) : '—'}</span>
            </div>
          ))}
          {o.bestDays.length > 0 && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            {o.bestDays.slice(0, 3).map((b, i) => <div key={b.d} style={{ display: 'flex', fontSize: 14, marginBottom: 4 }}><span style={{ flex: 1 }}>{['🥇', '🥈', '🥉'][i]} {dm(b.d)}</span><b>{fm(b.amount)}</b></div>)}
          </div>}
        </div>

        {/* 27/11 : historique de TOUTES ses ventes (app + Telegram), chacune supprimable */}
        {o.recent.length > 0 && <>
          <SectionTitle right={<span style={{ fontSize: 12, color: T.muted }}>{o.recent.length} ventes</span>}>Historique des ventes</SectionTitle>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {[['', 'Tout'], ['snus', 'Snus'], ['prise', 'Pris'], ['appartement', 'Appart'], ['vente-voiture', 'Voiture'], ['autre', 'Autre']].map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id!)} style={{ padding: '6px 12px', borderRadius: 99, border: `1px solid ${filter === id ? T.accent : T.line}`, background: filter === id ? tone(T.accent, 0.15) : 'transparent', color: T.text, fontSize: 12.5, fontWeight: 700, fontFamily: T.font, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <div style={{ ...glass(), borderRadius: 22, padding: '4px 14px' }}>
            {o.recent.filter(r => !filter || r.cat === filter).slice(0, histN).map((r, k, arr) => (
              <div key={r.key}>
                {(k === 0 || arr[k - 1]!.d !== r.d) && <div style={{ fontSize: 11.5, fontWeight: 800, color: T.faint, letterSpacing: '0.05em', padding: '10px 0 2px' }}>{dm(r.d).toUpperCase()}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: `1px solid ${T.line}` }}>
                  <Badge color={SRC_COL[r.cat] ?? T.accent}>{r.qty ? `${r.qty} × ${r.unit} €` : r.label}</Badge>
                  <span style={{ flex: 1, fontSize: 12, color: T.faint }}>{r.time ? `${r.time} · ` : ''}{r.via === 'telegram' ? 'Telegram' : ''}</span>
                  <b style={{ fontSize: 15, color: r.amount < 0 ? T.bad : undefined }}>{r.amount < 0 ? '−' : '+'}{fm(Math.abs(r.amount))}</b>
                  <button onClick={() => { if (window.confirm(`Supprimer cette vente (${fm(r.amount)}, ${dm(r.d)}) ?`)) void post('/api/mon-argent/undo', { key: r.key }, () => flash('🗑️ Vente supprimée')); }}
                    aria-label="Supprimer" style={{ background: tone(T.bad, 0.12), border: 'none', color: T.bad, width: 30, height: 30, borderRadius: 10, fontSize: 16, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
          {o.recent.length > histN && <Btn variant="ghost" onClick={() => setHistN(n => n + 30)} style={{ width: '100%', marginTop: 8 }}>Voir plus ({o.recent.length - histN})</Btn>}
        </>}
      </>}

      {sheet === 'prise' && (
        <Sheet title="➖ J'ai pris sur l'argent du jour" subtitle="Ça baisse l'argent d'aujourd'hui, pas ton cash global" onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy || !(Number(g.amount) > 0)} onClick={() => void post('/api/mon-argent/prise', { amount: Number(g.amount), why: g.why }, r => { setSheet(''); setG(v => ({ ...v, amount: '', why: '' })); flash(`✅ ${r.message}`); })} style={{ width: '100%' }}>Valider</Btn>}>
          <Field label="Montant pris (€)"><input inputMode="decimal" autoFocus value={g.amount} onChange={e => setG(v => ({ ...v, amount: e.target.value.replace(',', '.') }))} style={inputStyle} /></Field>
          <Field label="Pour quoi (facultatif)"><input value={g.why} placeholder="essence, manger…" onChange={e => setG(v => ({ ...v, why: e.target.value }))} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'jour' && o?.today.day && (
        <Sheet title="✏️ Montant d'aujourd'hui" subtitle={`Noté maintenant : ${fm(o.today.day.net)}. Mets ce que tu as vraiment, l'écart est ajouté comme correction (le stock ne bouge pas).`} onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy || g.amount === '' || !(Number(g.amount) >= 0)} onClick={() => void post('/api/mon-argent/jour', { amount: Number(g.amount) }, r => { setSheet(''); flash(`✅ ${r.message}`); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="J'ai vraiment aujourd'hui (€)" hint={g.amount !== '' && Number(g.amount) >= 0 ? `Écart : ${Number(g.amount) - o.today.day.net >= 0 ? '+' : '−'}${fm(Math.abs(Number(g.amount) - o.today.day.net))}` : undefined}>
            <input inputMode="decimal" autoFocus value={g.amount} onChange={e => setG(v => ({ ...v, amount: e.target.value.replace(',', '.') }))} style={inputStyle} /></Field>
        </Sheet>
      )}
      {(sheet === 'appartement' || sheet === 'vente-voiture' || sheet === 'autre') && (
        <Sheet title={sheet === 'appartement' ? '🏠 Location d\'appartement' : sheet === 'vente-voiture' ? '🚘 Vente de voiture' : '⏱️ Heures sup / autre'}
          subtitle={sheet === 'appartement' ? 'Ton bénéfice = prix payé par le client − prix du propriétaire' : 'Le montant que tu as gagné'}
          onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy} onClick={saveOther} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer'}</Btn>}>
          {sheet === 'appartement' ? <>
            <Field label="Prix payé par le client (€)"><input inputMode="decimal" value={f.client} onChange={e => setFF('client', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
            <Field label="Prix du propriétaire (€)" hint={Number(f.client) > 0 ? `Ton bénéfice : ${fm(Math.max(0, Number(f.client) - Number(f.owner || 0)))}` : undefined}><input inputMode="decimal" value={f.owner} onChange={e => setFF('owner', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
          </> : <Field label="Montant gagné (€)"><input inputMode="decimal" value={f.amount} onChange={e => setFF('amount', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>}
          <Field label="Note (facultatif)"><input value={f.label} placeholder={sheet === 'autre' ? 'Heures sup' : sheet === 'appartement' ? 'Quel appartement, quel client' : 'Quelle voiture'} onChange={e => setFF('label', e.target.value)} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'objectifs' && (
        <Sheet title="🎯 Tes objectifs" onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/settings', { dayPieces: Number(g.dayPieces || 0), monthEur: Number(g.monthEur || 0) }, () => { setSheet(''); flash('✅ Objectifs enregistrés'); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="Pièces de snus par jour" hint="0 = pas d'objectif"><input inputMode="numeric" value={g.dayPieces} onChange={e => setGG('dayPieces', e.target.value.replace(/\D/g, ''))} style={inputStyle} /></Field>
          <Field label="Gagné dans le mois (€, tout confondu hors salaire)" hint="0 = pas d'objectif"><input inputMode="numeric" value={g.monthEur} onChange={e => setGG('monthEur', e.target.value.replace(/\D/g, ''))} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'arrivage' && (
        <Sheet title="📦 Arrivage de snus" subtitle="Ce que tu viens de recevoir et ce que tu as payé" onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/arrivage', { pieces: Number(g.pieces), cost: Number(g.cost), cash: g.cash }, r => { setSheet(''); flash(`✅ ${r.message}`); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="Pièces reçues"><input inputMode="numeric" value={g.pieces} onChange={e => setGG('pieces', e.target.value.replace(/\D/g, ''))} style={inputStyle} /></Field>
          <Field label="Prix payé (€)" hint={Number(g.pieces) > 0 && Number(g.cost) > 0 ? `${(Number(g.cost) / Number(g.pieces)).toFixed(2)} € la pièce` : undefined}><input inputMode="decimal" value={g.cost} onChange={e => setGG('cost', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={g.cash} onChange={e => setGG('cash', e.target.checked)} /> Payé avec le cash (le cash baisse)</label>
        </Sheet>
      )}
      {sheet === 'stock' && (
        <Sheet title="📦 Compter mon stock" subtitle="Combien de pièces il te reste maintenant ? Ensuite chaque vente le fait baisser." onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/stock', { pieces: Number(g.pieces) }, () => { setSheet(''); flash('✅ Stock enregistré'); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="Pièces en stock"><input inputMode="numeric" value={g.pieces} onChange={e => setGG('pieces', e.target.value.replace(/\D/g, ''))} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'depense' && x && (
        <Sheet title="🧾 Nouvelle dépense" onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy || !(Number(g.amount) > 0)} onClick={() => void post('/api/mon-argent/depense', { cat: g.cat, amount: Number(g.amount), cash: g.cash, label: g.why }, r => { setSheet(''); setG(v => ({ ...v, amount: '', why: '' })); flash(`✅ ${r.message}`); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {x.depCats.map(c => <button key={c.id} onClick={() => setGG('cat', c.id)} style={{ padding: '8px 10px', borderRadius: 12, border: `1px solid ${g.cat === c.id ? T.accent : T.line}`, background: g.cat === c.id ? tone(T.accent, 0.15) : 'transparent', color: T.text, fontSize: 13, fontWeight: 700, fontFamily: T.font, cursor: 'pointer' }}>{c.icon} {c.label}</button>)}
          </div>
          <Field label="Montant (€)"><input inputMode="decimal" value={g.amount} onChange={e => setGG('amount', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
          <Field label="Note (facultatif)"><input value={g.why} onChange={e => setGG('why', e.target.value)} placeholder="ex. carrelage de la douche" style={inputStyle} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={g.cash} onChange={e => setGG('cash', e.target.checked)} /> Payé en cash (le cash baisse)</label>
        </Sheet>
      )}
      {(sheet === 'depot' || sheet === 'retrait') && (
        <Sheet title={sheet === 'depot' ? '🏦 Déposer du cash sur le compte' : '💵 Retirer du compte en cash'} subtitle={sheet === 'depot' ? 'Le cash baisse, le compte monte' : 'Le compte baisse, le cash monte'} onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy || !(Number(g.amount) > 0)} onClick={() => void post('/api/mon-argent/transfert', { kind: sheet, amount: Number(g.amount), why: g.why }, r => { setSheet(''); setG(v => ({ ...v, amount: '', why: '' })); flash(`✅ ${r.message}`); })} style={{ width: '100%' }}>Valider</Btn>}>
          <Field label="Montant (€)"><input inputMode="decimal" value={g.amount} onChange={e => setGG('amount', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
          <Field label="Pourquoi (facultatif)"><input value={g.why} onChange={e => setGG('why', e.target.value)} placeholder={sheet === 'retrait' ? 'ex. carrelage de la douche' : 'ex. surplus de la caisse'} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'soldes' && (
        <Sheet title="Mes soldes" subtitle="Ce que tu as maintenant sur ton compte et en cash" onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/balances', { ...(f.compte !== '' ? { compte: Number(f.compte) } : {}), ...(f.cash !== '' ? { cash: Number(f.cash) } : {}) }, () => { setSheet(''); flash('✅ Soldes mis à jour'); })} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="Sur le compte (€)"><input inputMode="decimal" value={f.compte} onChange={e => setFF('compte', e.target.value.replace(/[^\d.]/g, ''))} style={inputStyle} /></Field>
          <Field label="En cash (€)"><input inputMode="decimal" value={f.cash} onChange={e => setFF('cash', e.target.value.replace(/[^\d.]/g, ''))} style={inputStyle} /></Field>
        </Sheet>
      )}
      {sheet === 'conseil' && (
        <Sheet title="💡 Ton conseiller" subtitle="Ton idée, ton achat ou ta question d'argent" onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy || f.q.trim().length < 5} onClick={() => { setAnswer(''); void post('/api/mon-argent/advise', { question: f.q }, r => setAnswer(r.answer ?? '')); }} style={{ width: '100%' }}>{busy ? 'Il cherche et calcule… (≈ 1 min)' : 'Demander'}</Btn>}>
          <textarea value={f.q} onChange={e => setFF('q', e.target.value)} rows={4} placeholder="Ex. : acheter ma propre voiture pour la louer sur FIK, ça vaut le coup ? / lancer un lavage auto à Oran ? / acheter le terrain avant 2028 ?" style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
          {answer && <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{answer}</div>}
        </Sheet>
      )}
    </Screen>
  );
}
