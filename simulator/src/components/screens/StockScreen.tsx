import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, PageHeader, Screen, SectionTitle, Btn, Sheet, Field, inputStyle, Badge, Empty, money, glass, HeadBtn } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

// STOCK & COMMANDES (27/11) : stock par modèle (noté en points), comptage, factures du fournisseur, ruptures et
// remplacements, commande conseillée, best-sellers, marge réelle (DHL + taxes compris). PRIVÉ : tout vient de
// /api/mon-argent/stock (compte Kouider seulement) — aucun nom de produit ni prix dans ce code (dépôt public).

export interface Prod { id: string; brand: string; name: string; points?: number; color?: string; cost: number; active: boolean; rupture?: boolean; remplace?: string; label: string;
  stock: number | null; sold30: number; eur30: number; perDay: number; daysLeft: number | null; realCost: number; marginPiece: number; profit30: number; lastBought: string | null }
interface Order { id: string; d: string; lines: Array<{ pid: string; qty: number; unit: number }>; shipping?: number; taxes?: number; total?: number; pieces: number }
export interface StockOv {
  products: Prod[]; unassigned: number; counted: string | null; totalStock: number | null; orders: Order[];
  rhythm: { every: number; last: string | null; nextOrder: string | null; lead: number };
  reorder: { urgent: boolean; minDays: number | null; cart: Array<{ pid: string; label: string; qty: number; note?: string }>; cartCost: number };
  perOrder: Array<{ d: string; pieces: number; total: number; fees: number; feePiece: number; costPiece: number }>;
  weekdays: Array<{ name: string; pieces: number }>; tips: Array<{ icon: string; title: string; text: string }>;
}
const dm = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Pastilles de « points » (force) : ● pleins / ○ vides sur 6. */
export function Points({ n, color = T.accent }: { n: number; color?: string }) {
  return <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ width: 7, height: 7, borderRadius: 4, background: i < n ? color : 'transparent', border: `1px solid ${i < n ? color : T.line}` }} />)}</span>;
}
/** Pastille produit : marque colorée + points ou nom court. */
export function ProdTag({ p, small }: { p: Pick<Prod, 'brand' | 'name' | 'points' | 'color'>; small?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: small ? 10.5 : 11.5, fontWeight: 900, letterSpacing: '0.04em', color: '#fff', background: p.color ?? T.accent, padding: small ? '2px 6px' : '3px 7px', borderRadius: 6 }}>{p.brand}</span>
      {p.points ? <><b style={{ fontSize: small ? 13 : 14 }}>{p.points}</b><Points n={p.points} color={p.color} /></> : <b style={{ fontSize: small ? 12.5 : 14 }}>{p.name}</b>}
    </span>
  );
}

export default function StockScreen() {
  const [o, setO] = useState<StockOv | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'' | 'count' | 'order' | 'prod'>('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [ord, setOrd] = useState<{ d: string; lines: Record<string, { qty: string; unit: string }>; shipping: string; taxes: string; total: string }>({ d: '', lines: {}, shipping: '', taxes: '', total: '' });
  const [prod, setProd] = useState<Prod | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); };

  const load = useCallback(async () => { try { setO(await apiFetch<StockOv>('/api/mon-argent/stock')); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const post = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    try { setO(await apiFetch<StockOv>(path, { method: 'POST', body: JSON.stringify(body) })); setSheet(''); flash(ok); }
    catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };
  const openCount = () => { setCounts(Object.fromEntries((o?.products ?? []).map(p => [p.id, p.stock != null ? String(p.stock) : '']))); setSheet('count'); };
  const openOrder = () => { setOrd({ d: new Date().toISOString().slice(0, 10), lines: Object.fromEntries((o?.products ?? []).map(p => [p.id, { qty: '', unit: String(p.cost) }])), shipping: '', taxes: '', total: '' }); setSheet('order'); };
  const prods = o?.products ?? [];
  const byId = (id?: string) => prods.find(p => p.id === id);
  const maxWd = Math.max(1, ...(o?.weekdays.map(w => w.pieces) ?? [1]));

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Privé · toi seul" title="Stock & commandes" subtitle={o ? `${o.totalStock != null ? `${o.totalStock} pièces en stock` : 'stock pas encore compté'} · commande tous les ${o.rhythm.every} j` : 'Ton stock modèle par modèle'}
      right={<HeadBtn icon="↻" label="Actualiser" onClick={() => void load()} />} />}>
      {err ? <Empty icon="🔒" title="Indisponible" text={err} /> : !o ? <SkeletonCards count={4} height={110} /> : <>

        {/* Recommande */}
        <div style={{ ...glass(o.reorder.urgent ? T.bad : T.accent), borderRadius: 22, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{o.reorder.urgent ? '📦 C\'est le moment de recommander' : '📦 Prochaine commande'}</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
            {o.rhythm.nextOrder ? `Prévue vers le ${dm(o.rhythm.nextOrder)} (tous les ${o.rhythm.every} j, dernière le ${dm(o.rhythm.last!)})` : 'Ajoute tes factures pour connaître ton rythme'}{o.reorder.minDays != null ? ` · un modèle tient encore ≈ ${o.reorder.minDays} j` : ''}
          </div>
          {o.reorder.cart.length ? <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 800, marginBottom: 6 }}>COMMANDE CONSEILLÉE (couvre {o.rhythm.every + o.rhythm.lead} jours)</div>
            {o.reorder.cart.map(c => { const p = byId(c.pid); return (
              <div key={c.pid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.line}` }}>
                {p ? <ProdTag p={p} small /> : <span>{c.label}</span>}
                <span style={{ flex: 1, fontSize: 11.5, color: T.muted }}>{c.note ?? ''}</span><b>× {c.qty}</b>
              </div>); })}
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 6 }}>≈ {money(o.reorder.cartCost)} d'articles (+ DHL et taxes)</div>
          </div> : <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{o.counted ? 'Rien d\'urgent : ton stock couvre le prochain cycle.' : 'Compte ton stock pour avoir une commande conseillée modèle par modèle.'}</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, marginBottom: 16 }}>
          <Btn variant="primary" onClick={openCount}>🧮 Compter mon stock</Btn>
          <Btn variant="soft" onClick={openOrder}>🧾 Nouvelle facture</Btn>
        </div>

        {/* Modèles */}
        <SectionTitle right={o.counted ? <span style={{ fontSize: 12, color: T.muted }}>compté le {dm(o.counted)}</span> : undefined}>Tes modèles</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {prods.filter(p => p.active).map(p => (
            <div key={p.id} onClick={() => { setProd(p); setSheet('prod'); }} style={{ ...glass(p.color ?? T.accent), borderRadius: 18, padding: 12, cursor: 'pointer', opacity: p.rupture ? 0.85 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProdTag p={p} />
                <span style={{ flex: 1 }} />
                {p.rupture && <Badge color={T.bad}>rupture{p.remplace ? ` → ${byId(p.remplace)?.label ?? ''}` : ''}</Badge>}
                <b style={{ fontSize: 17, color: p.stock != null && p.daysLeft != null && p.daysLeft <= 5 && !p.rupture ? T.bad : T.text }}>{p.stock ?? '—'}</b>
              </div>
              {p.points ? <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{p.name}</div> : null}
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: T.muted, flexWrap: 'wrap' }}>
                <span>Vendu 30 j : <b style={{ color: T.text }}>{p.sold30}</b></span>
                {p.daysLeft != null && <span>Reste ≈ <b style={{ color: T.text }}>{p.daysLeft} j</b></span>}
                <span>Coût réel <b style={{ color: T.text }}>{p.realCost.toFixed(2)} €</b></span>
                <span>Marge <b style={{ color: T.ok }}>{p.marginPiece.toFixed(2)} €</b></span>
              </div>
            </div>
          ))}
          {o.unassigned > 0 && <div style={{ fontSize: 12.5, color: T.muted }}>+ {o.unassigned} pièces vendues ces 30 jours sans modèle (anciennes ventes).</div>}
        </div>

        {/* Best-sellers */}
        {prods.some(p => p.sold30 > 0) && <>
          <SectionTitle>Best-sellers (30 jours)</SectionTitle>
          <div style={{ ...glass(T.ok), borderRadius: 22, padding: 16, marginBottom: 16 }}>
            {[...prods].filter(p => p.sold30 > 0).sort((a, b) => b.sold30 - a.sold30).map((p, i, arr) => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><ProdTag p={p} small /><span style={{ flex: 1 }} /><b>{p.sold30} pcs</b><span style={{ color: T.ok, fontWeight: 700 }}>+{money(p.profit30)}</span></div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.06)', marginTop: 4 }}><div style={{ height: '100%', width: `${p.sold30 / arr[0]!.sold30 * 100}%`, background: p.color ?? T.accent, borderRadius: 3 }} /></div>
              </div>
            ))}
          </div>
        </>}

        {/* Conseils */}
        {o.tips.length > 0 && <>
          <SectionTitle>Conseils</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {o.tips.map((x, i) => <div key={i} style={{ ...glass(T.violet), borderRadius: 16, padding: '10px 12px', display: 'flex', gap: 10 }}><span style={{ fontSize: 20 }}>{x.icon}</span><div><div style={{ fontSize: 13.5, fontWeight: 800 }}>{x.title}</div><div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>{x.text}</div></div></div>)}
          </div>
        </>}

        {/* Meilleurs jours (pièces) */}
        <SectionTitle>Quels jours tu vends le plus (60 j)</SectionTitle>
        <div style={{ ...glass(T.accent), borderRadius: 22, padding: 16, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6, 0].map(i => o.weekdays[i]!).map(w => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
              <span style={{ width: 78, color: T.muted }}>{w.name}</span>
              <div style={{ flex: 1, height: 9, background: 'rgba(var(--dz-ink-rgb),0.05)', borderRadius: 5 }}><div style={{ height: '100%', width: `${w.pieces / maxWd * 100}%`, background: T.accent, borderRadius: 5 }} /></div>
              <span style={{ width: 40, textAlign: 'right', fontWeight: 700 }}>{w.pieces || '—'}</span>
            </div>
          ))}
        </div>

        {/* Factures */}
        <SectionTitle>Tes commandes</SectionTitle>
        <div style={{ ...glass(), borderRadius: 22, padding: '4px 14px' }}>
          {o.orders.map(x => { const po = o.perOrder.find(p => p.d === x.d); return (
            <div key={x.id} style={{ padding: '10px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ flex: 1, fontSize: 14 }}>{dm(x.d)}</b>
                <span style={{ fontSize: 13 }}>{x.pieces ? `${x.pieces} pcs` : ''}{x.total ? ` · ${money(x.total)}` : ''}</span>
                <button onClick={() => { if (window.confirm(`Supprimer la commande du ${dm(x.d)} ?`)) void post('/api/mon-argent/stock/order/delete', { id: x.id }, '🗑️ Commande supprimée'); }} style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer' }}>🗑</button>
              </div>
              {x.lines.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>{x.lines.map(l => { const p = byId(l.pid); return <span key={l.pid} style={{ fontSize: 12 }}>{p ? <ProdTag p={p} small /> : l.pid} ×{l.qty}</span>; })}</div>}
              {po && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>{po.costPiece.toFixed(2)} € la pièce tout compris · DHL + taxes {money(po.fees)} ({po.feePiece.toFixed(2)} €/pièce)</div>}
              {!x.lines.length && <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>date seulement (détail pas saisi)</div>}
            </div>); })}
        </div>
      </>}

      {sheet === 'count' && o && (
        <Sheet title="🧮 Compter mon stock" subtitle="Ce que tu as en main maintenant, modèle par modèle. Ensuite chaque vente et chaque arrivage le mettent à jour." onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/stock/count', { counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v || 0)])) }, '✅ Stock enregistré')} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer'}</Btn>}>
          {prods.filter(p => p.active).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ flex: 1 }}><ProdTag p={p} small />{p.points ? <div style={{ fontSize: 11.5, color: T.muted }}>{p.name}</div> : null}</div>
              <input inputMode="numeric" value={counts[p.id] ?? ''} onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value.replace(/\D/g, '') }))} placeholder="0" style={{ ...inputStyle, width: 90, textAlign: 'right' }} />
            </div>
          ))}
        </Sheet>
      )}
      {sheet === 'order' && o && (
        <Sheet title="🧾 Nouvelle facture" subtitle="Les quantités et prix de ta facture fournisseur" onClose={() => setSheet('')}
          footer={<Btn variant="primary" disabled={busy} onClick={() => void post('/api/mon-argent/stock/order', { d: ord.d, lines: Object.entries(ord.lines).filter(([, l]) => Number(l.qty) > 0).map(([pid, l]) => ({ pid, qty: Number(l.qty), unit: Number(l.unit) })), shipping: Number(ord.shipping || 0), taxes: Number(ord.taxes || 0), total: Number(ord.total || 0) }, '✅ Facture ajoutée (stock + coût mis à jour)')} style={{ width: '100%' }}>{busy ? '…' : 'Enregistrer la facture'}</Btn>}>
          <Field label="Date de la facture"><input type="date" value={ord.d} onChange={e => setOrd(v => ({ ...v, d: e.target.value }))} style={inputStyle} /></Field>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 800, margin: '8px 0 6px' }}>QUANTITÉ · PRIX DE LA PIÈCE</div>
          {prods.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}><ProdTag p={p} small /></div>
              <input inputMode="numeric" placeholder="qté" value={ord.lines[p.id]?.qty ?? ''} onChange={e => setOrd(v => ({ ...v, lines: { ...v.lines, [p.id]: { ...v.lines[p.id]!, qty: e.target.value.replace(/\D/g, '') } } }))} style={{ ...inputStyle, width: 64, textAlign: 'right' }} />
              <input inputMode="decimal" value={ord.lines[p.id]?.unit ?? ''} onChange={e => setOrd(v => ({ ...v, lines: { ...v.lines, [p.id]: { ...v.lines[p.id]!, unit: e.target.value.replace(',', '.') } } }))} style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6, marginTop: 8 }}>
            <Field label="Livraison"><input inputMode="decimal" value={ord.shipping} onChange={e => setOrd(v => ({ ...v, shipping: e.target.value.replace(',', '.') }))} style={inputStyle} /></Field>
            <Field label="Taxes"><input inputMode="decimal" value={ord.taxes} onChange={e => setOrd(v => ({ ...v, taxes: e.target.value.replace(',', '.') }))} style={inputStyle} /></Field>
            <Field label="Total payé"><input inputMode="decimal" value={ord.total} onChange={e => setOrd(v => ({ ...v, total: e.target.value.replace(',', '.') }))} style={inputStyle} /></Field>
          </div>
        </Sheet>
      )}
      {sheet === 'prod' && prod && (
        <Sheet title={prod.label} subtitle={prod.name} onClose={() => setSheet('')}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Stock : <b>{prod.stock ?? 'pas compté'}</b>{prod.daysLeft != null ? ` · ≈ ${prod.daysLeft} jours` : ''}<br />
            Vendu 30 jours : <b>{prod.sold30}</b> pièces ({money(prod.eur30)}) · bénéfice {money(prod.profit30)}<br />
            Coût réel (DHL + taxes compris) : <b>{prod.realCost.toFixed(2)} €</b> · marge {prod.marginPiece.toFixed(2)} € par pièce<br />
            {prod.lastBought ? `Dernier achat : ${dm(prod.lastBought)}` : ''}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 14 }}>
            <input type="checkbox" checked={!!prod.rupture} onChange={e => { const v = e.target.checked; setProd({ ...prod, rupture: v }); void post('/api/mon-argent/stock/product', { id: prod.id, rupture: v }, v ? 'Marqué en rupture' : 'Plus en rupture'); }} /> En rupture chez le fournisseur
          </label>
          {prod.rupture && <Field label="En attendant, je le remplace par">
            <select value={prod.remplace ?? ''} onChange={e => void post('/api/mon-argent/stock/product', { id: prod.id, remplace: e.target.value }, '✅ Remplacement enregistré')} style={inputStyle}>
              <option value="">— aucun —</option>
              {prods.filter(x => x.id !== prod.id && !x.rupture).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 10 }}>
            <input type="checkbox" checked={prod.active} onChange={e => void post('/api/mon-argent/stock/product', { id: prod.id, active: e.target.checked }, e.target.checked ? 'Modèle affiché' : 'Modèle caché')} /> Je vends ce modèle
          </label>
        </Sheet>
      )}
    </Screen>
  );
}
