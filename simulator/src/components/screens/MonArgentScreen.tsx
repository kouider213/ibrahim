import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, PageHeader, Screen, SectionTitle, Btn, Sheet, Field, inputStyle, Badge, Empty, money, glass, CountUp, HeadBtn } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';
import { DepartCard } from './DepartPlan.tsx';

// MON ARGENT (27/11) : tout l'argent de Kouider hors salaire — snus (à la pièce), appartement (prix client − propriétaire),
// vente de voiture, autre / heures sup + bénéfice FIK automatique. Soldes, graphiques, départ pour Oran, 20 repères, conseiller.
// PRIVÉ : données sur le serveur (/api/mon-argent, compte Kouider seulement) — aucun chiffre dans ce code (dépôt public).
// Même journal que Telegram : « snus 150 » écrit à Dzaryx apparaît ici, et l'inverse.

interface Part { id: string; amount: number }
interface Src { id: string; label: string; amount: number }
export interface MonArgent {
  balances: { compte: number; cash: number; total: number; compteAt: string | null; cashAt: string | null };
  today: { total: number; bySource: Src[] }; week: { total: number };
  month: { total: number; prev: number; pace: number; bySource: Src[]; depenses: number }; year: { total: number; bySource: Src[] };
  snus: { today: number; todayEur: number; week: number; month: number; monthEur: number; avgUnit: number | null; costPiece: number | null; marginPiece: number | null; discount: number; perDay: number };
  depart: { moveAt: string | null; label: string | null; upfront: number; pct: number | null } | null;
  insights: Array<{ icon: string; title: string; text: string; tone: 'ok' | 'warn' | 'info' }>;
  bestDays: Array<{ d: string; amount: number; day: string }>;
  weekdays: Array<{ name: string; avg: number; n: number }>;
  last30: Array<{ d: string; amount: number; parts: Part[] }>;
  months6: Array<{ ym: string; label: string; amount: number; parts: Part[] }>;
  recent: Array<{ at: number; d: string; cat: string; label: string; amount: number; qty: number | null; unit: number | null }>;
  sources: Array<{ id: string; label: string; icon: string }>;
  tarifs: Array<{ id: string; label: string; hint: string }>;
}
export const SRC_COL: Record<string, string> = { fik: '#3d6bff', snus: '#12b76a', appartement: '#f97316', 'vente-voiture': '#8b5cf6', autre: '#f59e0b', cash: '#64748b' };
const SRC_NAME: Record<string, string> = { fik: 'FIK', snus: 'Snus', appartement: 'Appart', 'vente-voiture': 'Voiture', autre: 'Autre', cash: 'Cash' };
const dm = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const snusPrice = (qty: number, tarif: string) => { const unit = tarif === 'cinq' ? 5 : tarif === 'lot' ? (qty >= 10 ? 5 : 6) : 6; return { unit, amount: qty * unit }; };
export const addSnus = (qty: number, tarif: string) => apiFetch<{ message: string; overview: MonArgent }>('/api/mon-argent/add', { method: 'POST', body: JSON.stringify({ cat: 'snus', qty, tarif }) });

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
function Donut({ rows, size = 120 }: { rows: Src[]; size?: number }) {
  const tot = rows.reduce((s, r) => s + r.amount, 0);
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(var(--dz-ink-rgb),0.06)" strokeWidth={14} />
      {tot > 0 && rows.map(x => { const len = x.amount / tot * c; const el = <circle key={x.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SRC_COL[x.id] ?? T.accent} strokeWidth={14} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />; off += len; return el; })}
      <text x="50%" y="47%" textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.55}>ce mois</text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="16" fontWeight={800} fill="currentColor">{Math.round(tot)} €</text>
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
  const [sheet, setSheet] = useState<'' | 'appartement' | 'vente-voiture' | 'autre' | 'soldes' | 'conseil'>('');
  const [f, setF] = useState({ amount: '', client: '', owner: '', label: '', compte: '', cash: '', q: '' });
  const [answer, setAnswer] = useState('');
  const [showAll, setShowAll] = useState(false);
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
  const saveSnus = () => qty > 0 && void post('/api/mon-argent/add', { cat: 'snus', qty, tarif }, r => { setQty(0); flash(`✅ ${r.message}`); });
  const quickOne = (unit: 5 | 6) => void post('/api/mon-argent/add', { cat: 'snus', qty: 1, tarif: unit === 5 ? 'cinq' : 'six' }, r => flash(`✅ ${r.message}`));
  const saveOther = () => {
    if (!sheet) return;
    const body = sheet === 'appartement' ? { cat: sheet, client: Number(f.client), owner: Number(f.owner || 0), label: f.label } : { cat: sheet, amount: Number(f.amount), label: f.label || (sheet === 'autre' ? 'Heures sup' : '') };
    void post('/api/mon-argent/add', body, r => { setSheet(''); setF(s => ({ ...s, amount: '', client: '', owner: '', label: '' })); flash(`✅ ${r.message}`); });
  };
  const preview = qty > 0 ? snusPrice(qty, tarif) : null;
  const maxWd = Math.max(1, ...(o?.weekdays.map(w => w.avg) ?? [1]));
  const monthDiff = o && o.month.prev ? Math.round((o.month.pace - o.month.prev) / o.month.prev * 100) : null;

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Privé · toi seul" title="Mon argent" subtitle={o ? `${money(o.today.total)} aujourd'hui · ${money(o.month.total)} ce mois` : 'Tout ce que tu gagnes, hors salaire'}
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
          <div style={{ position: 'relative', fontFamily: T.display, fontSize: 50, fontWeight: 600, letterSpacing: '-0.055em', lineHeight: 1, color: '#fff', marginTop: 10, fontVariantNumeric: 'tabular-nums' }}><CountUp value={money(o.balances.total)} /></div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
            {[{ l: 'Compte', v: money(o.balances.compte) }, { l: 'Cash', v: money(o.balances.cash) }, { l: 'Gagné ce mois', v: money(o.month.total), c: '#9ef0c6' }].map(x => (
              <div key={x.l}><div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{x.l}</div>
                <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 800, color: x.c ?? '#fff', marginTop: 3, whiteSpace: 'nowrap' }}><CountUp value={x.v} /></div></div>
            ))}
          </div>
        </div>

        {/* Snus : compteur de pièces */}
        <div style={{ ...glass(SRC_COL.snus), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>🟢 Snus vendus</div>
            <div style={{ fontSize: 13, color: T.muted }}>aujourd'hui <b style={{ color: T.text }}>{o.snus.today} pièce{o.snus.today > 1 ? 's' : ''}</b> · {money(o.snus.todayEur)}</div>
          </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginTop: 8 }}>
            {([6, 5] as const).map(u => (
              <button key={u} disabled={busy} onClick={() => quickOne(u)} className="dz-press" style={{ padding: '12px 0', borderRadius: 14, border: `1px solid ${SRC_COL.snus}`, background: 'transparent', color: T.text, fontSize: 14.5, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>1 pièce à {u} € <span style={{ fontSize: 11.5, color: T.muted, fontWeight: 600 }}>· tout de suite</span></button>
            ))}
          </div>
          {preview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, fontSize: 14 }}><b>{qty} pièce{qty > 1 ? 's' : ''}</b> × {preview.unit} € = <b style={{ fontSize: 17 }}>{money(preview.amount)}</b></div>
              <button onClick={() => setQty(0)} style={{ background: 'none', border: 'none', color: T.bad, fontWeight: 700, cursor: 'pointer', fontFamily: T.font }}>Effacer</button>
              <Btn variant="primary" color={SRC_COL.snus} disabled={busy} onClick={saveSnus}>{busy ? '…' : 'Noter'}</Btn>
            </div>
          ) : <div style={{ fontSize: 12.5, color: T.muted, marginTop: 10 }}>Plusieurs pièces : +1, +2… puis « Noter » (prix normal 6 €, ou « Lot dès 10 » à 5 € la pièce). Ristourne client : « 1 pièce à 5 € ».</div>}
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

        {/* Ce mois : anneau + sources */}
        <SectionTitle right={monthDiff != null ? <Badge color={monthDiff >= 0 ? T.ok : T.bad}>{monthDiff >= 0 ? '▲ +' : '▼ '}{monthDiff} % vs mois dernier</Badge> : undefined}>Ce mois</SectionTitle>
        <div style={{ ...glass(T.accent), borderRadius: 22, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <Donut rows={o.month.bySource} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {o.month.bySource.length ? o.month.bySource.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 13.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: SRC_COL[s.id] ?? T.accent, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span><b>{money(s.amount)}</b>
              </div>)) : <div style={{ fontSize: 13, color: T.faint }}>Rien de noté ce mois.</div>}
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>À ce rythme : <b style={{ color: T.text }}>{money(o.month.pace)}</b> fin du mois</div>
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
        <DepartCard />

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

        {/* Jours */}
        <SectionTitle>Tes meilleurs jours</SectionTitle>
        <div style={{ ...glass(T.accent), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          {[1, 2, 3, 4, 5, 6, 0].map(i => o.weekdays[i]!).map(w => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 13 }}>
              <span style={{ width: 78, color: T.muted }}>{w.name}</span>
              <div style={{ flex: 1, height: 9, background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 5 }}><div style={{ height: '100%', width: `${w.avg / maxWd * 100}%`, background: `linear-gradient(90deg, ${tone(T.accent, 0.5)}, ${T.accent})`, borderRadius: 5 }} /></div>
              <span style={{ width: 60, textAlign: 'right', fontWeight: 700 }}>{w.n ? money(w.avg) : '—'}</span>
            </div>
          ))}
          {o.bestDays.length > 0 && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            {o.bestDays.slice(0, 3).map((b, i) => <div key={b.d} style={{ display: 'flex', fontSize: 14, marginBottom: 4 }}><span style={{ flex: 1 }}>{['🥇', '🥈', '🥉'][i]} {dm(b.d)}</span><b>{money(b.amount)}</b></div>)}
          </div>}
        </div>

        {/* Dernières notes */}
        {o.recent.length > 0 && <>
          <SectionTitle>Dernières ventes notées</SectionTitle>
          <div style={{ ...glass(), borderRadius: 22, padding: '4px 14px' }}>
            {o.recent.map(r => (
              <div key={r.at} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
                <Badge color={SRC_COL[r.cat] ?? T.accent}>{r.qty ? `${r.qty} × ${r.unit} €` : r.label}</Badge>
                <span style={{ flex: 1, fontSize: 13, color: T.muted }}>{dm(r.d)}</span>
                <b style={{ fontSize: 15 }}>+{money(r.amount)}</b>
                <button onClick={() => void post('/api/mon-argent/undo', { at: r.at }, () => flash('Ligne retirée'))} aria-label="Retirer" style={{ background: 'none', border: 'none', color: T.faint, fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        </>}
      </>}

      {(sheet === 'appartement' || sheet === 'vente-voiture' || sheet === 'autre') && (
        <Sheet title={sheet === 'appartement' ? '🏠 Location d\'appartement' : sheet === 'vente-voiture' ? '🚘 Vente de voiture' : '⏱️ Heures sup / autre'}
          subtitle={sheet === 'appartement' ? 'Ton bénéfice = prix payé par le client − prix du propriétaire' : 'Le montant que tu as gagné'}
          onClose={() => setSheet('')} footer={<Btn variant="primary" disabled={busy} onClick={saveOther} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer'}</Btn>}>
          {sheet === 'appartement' ? <>
            <Field label="Prix payé par le client (€)"><input inputMode="decimal" value={f.client} onChange={e => setFF('client', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
            <Field label="Prix du propriétaire (€)" hint={Number(f.client) > 0 ? `Ton bénéfice : ${money(Math.max(0, Number(f.client) - Number(f.owner || 0)))}` : undefined}><input inputMode="decimal" value={f.owner} onChange={e => setFF('owner', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>
          </> : <Field label="Montant gagné (€)"><input inputMode="decimal" value={f.amount} onChange={e => setFF('amount', e.target.value.replace(',', '.'))} style={inputStyle} /></Field>}
          <Field label="Note (facultatif)"><input value={f.label} placeholder={sheet === 'autre' ? 'Heures sup' : sheet === 'appartement' ? 'Quel appartement, quel client' : 'Quelle voiture'} onChange={e => setFF('label', e.target.value)} style={inputStyle} /></Field>
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
