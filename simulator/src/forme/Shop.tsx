import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, type House, vibrate } from './api.ts';
import { F, Title, card, darkCard, Chip, Img, Bar, Spinner, btn, ghostBtn, input } from './ui.tsx';
import { tr } from './i18n.ts';

// COURSES DU FOYER : la liste de Kouider + celle de sa femme fusionnées. Une case cochée par l'un est cochée chez
// l'autre (rafraîchi toutes les 6 s pendant que l'écran est ouvert) → on n'achète jamais 2 fois la même chose.
const AISLE_EMOJI: Record<string, string> = { 'Ajouté à la main': '✍️', 'Fruits & légumes': '🥦', 'Boucherie halal': '🥩', 'Crèmerie': '🧀', 'Épicerie': '🥫', 'Surgelés': '🧊', 'Boulangerie': '🥖', 'Boissons': '💧' };
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export default function ShopScreen({ me, toast }: { me: string; toast: (t: string) => void }) {
  const [h, setH] = useState<House | null>(null);
  const [filter, setFilter] = useState<string>('Tout');
  const [err, setErr] = useState('');
  const [add, setAdd] = useState({ name: '', qty: '', store: 'Colruyt' });
  const load = useCallback(() => forme.shopping().then(x => { setH(x); setErr(''); }).catch(e => setErr(errText(e))), []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 6000);
    return () => clearInterval(t);
  }, [load]);
  if (err && !h) return <div style={{ padding: 18, color: F.red }}>❌ {err}</div>;
  if (!h) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  if (!h.items.length) return <div style={{ padding: 18 }}><Title a="Tes" b="courses" sub="Compose d'abord ta semaine (onglet Semaine)." /></div>;
  const items = h.items;
  const stores = ['Tout', ...new Set(items.map(s => s.store))];
  const shown = items.filter(s => filter === 'Tout' || s.store === filter);
  const aisles = [...new Set(shown.map(s => s.aisle))];
  const done = items.filter(s => s.checked).reduce((a, s) => a + s.price, 0);
  const toggle = async (key: string, checked: boolean) => {
    vibrate(12);
    setH({ ...h, items: h.items.map(i => i.key === key ? { ...i, checked, by: checked ? me : undefined } : i) });
    try { setH(await forme.shop(key, checked)); } catch (e) { toast(errText(e)); void load(); }
  };
  return (
    <div style={{ padding: '6px 18px 0' }}>
      <div style={{ ...darkCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11.5, letterSpacing: '0.1em', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{h.shared ? 'COURSES DU FOYER' : 'COURSES DE LA SEMAINE'}</div>
            <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', color: F.accent2 }}>{eur(h.total)}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{h.budget - h.total >= 0 ? `${eur(h.budget - h.total)} d'économie sur le budget` : `${eur(h.total - h.budget)} au-dessus du budget`} · prix estimés</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{items.filter(s => s.checked).length}<span style={{ fontSize: 15, opacity: 0.5 }}>/{items.length}</span></div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)' }}>dans le caddie</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}><Bar value={done} max={h.total} color={F.green} h={8} /></div>
        {h.shared && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>👫 Liste commune : ce que l'un coche est coché chez l'autre.</div>}
      </div>
      <div style={{ ...card, marginTop: 12, padding: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} placeholder="Ajouter un article (lait du petit, lessive…)" style={{ ...input, flex: 2 }} />
          <input value={add.qty} onChange={e => setAdd({ ...add, qty: e.target.value })} placeholder="Qté" style={{ ...input, flex: 0.7 }} />
          <button disabled={!add.name.trim()} onClick={async () => { try { setH(await forme.shopAdd(add.name.trim(), add.qty, add.store)); setAdd({ ...add, name: '', qty: '' }); vibrate(20); } catch (e) { toast(errText(e)); } }} style={{ ...btn, padding: '0 14px', opacity: add.name.trim() ? 1 : 0.4 }}>+</button>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8 }}>{['Colruyt', 'Delhaize', 'Aldi', 'Lidl', 'Boucherie halal', 'Pharmacie'].map(x => <Chip key={x} on={add.store === x} onClick={() => setAdd({ ...add, store: x })}>{x}</Chip>)}</div>
      </div>
      <button onClick={async () => {
        const todo = items.filter(i => !i.checked);
        const by = [...new Set(todo.map(i => i.store))].map(st => `🛒 ${st}\n${todo.filter(i => i.store === st).map(i => `▫️ ${i.label ?? i.name}${i.who.map(w => w.qty).filter(Boolean).length ? ` — ${i.who.map(w => w.qty).filter(Boolean).join(' + ')}` : ''}`).join('\n')}`).join('\n\n');
        const text = `${tr('Liste de courses')} (FORME)\n\n${by}`;
        try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast(tr('Liste copiée')); } } catch { /* annulé */ }
      }} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>📤 Envoyer la liste (WhatsApp…)</button>
      <Title a="Ta liste" b="de courses" size={26} />
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '-4px -18px 8px', padding: '0 18px 4px' }}>
        {stores.map(s => <Chip key={s} on={filter === s} onClick={() => setFilter(s)}>{s}{s !== 'Tout' ? ` · ${items.filter(x => x.store === s).reduce((a, x) => a + x.price, 0).toFixed(0)} €` : ''}</Chip>)}
      </div>
      {aisles.map(a => (
        <div key={a}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 2px 8px' }}>
            <div style={{ fontWeight: 800, fontSize: 15.5 }}><span style={{ marginInlineEnd: 6 }}>{AISLE_EMOJI[a] ?? '🛒'}</span>{a}</div>
            <div style={{ fontSize: 12, color: F.muted, fontWeight: 700 }}>{shown.filter(s => s.aisle === a).length} articles</div>
          </div>
          <div style={{ ...card, padding: '2px 12px' }}>
            {shown.filter(s => s.aisle === a).map((s, k, arr) => (
              <motion.button key={s.key} layout onClick={() => toggle(s.key, !s.checked)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', background: 'none', border: 'none', borderBottom: k < arr.length - 1 ? `1px solid ${F.line}` : 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, flexShrink: 0, border: s.checked ? 'none' : `2px solid ${F.line}`, background: s.checked ? F.green : '#fff', color: '#fff', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.checked ? '✓' : ''}</div>
                <Img src={s.img} style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, objectFit: 'contain', background: '#fff', border: `1px solid ${F.line}` }} />
                <div style={{ flex: 1, minWidth: 0, opacity: s.checked ? 0.45 : 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, textDecoration: s.checked ? 'line-through' : 'none', lineHeight: 1.25 }}>{s.label ?? s.name}{s.halal && /boucherie|viande/i.test(`${s.aisle} ${s.store}`) && <span style={{ marginInlineStart: 6, fontSize: 10.5, fontWeight: 900, color: F.green, border: `1px solid ${F.green}`, borderRadius: 6, padding: '1px 5px', verticalAlign: 'middle' }}>HALAL</span>}</div>
                  <div style={{ fontSize: 12, color: F.muted, marginTop: 2 }}>
                    {s.who.length > 1 ? s.who.map(w => `${w.name} ${w.qty}`).join(' + ') : s.who[0]?.qty}{s.brand ? ` · ${s.brand}` : ''}{filter === 'Tout' ? ` · ${s.store}` : ''}
                  </div>
                  {s.checked && s.by && <div style={{ fontSize: 11.5, color: F.green, fontWeight: 800, marginTop: 2 }}>✓ {s.by}</div>}
                </div>
                {s.key.startsWith('extra|') ? <span role="button" aria-label="Retirer" onClick={async e => { e.stopPropagation(); try { setH(await forme.shopDel(s.key)); } catch (er) { toast(errText(er)); } }} style={{ ...ghostBtn, padding: '4px 9px', fontSize: 12 }}>✕</span>
                  : <div style={{ fontWeight: 800, fontSize: 14, color: s.checked ? F.muted : F.ink }}>{eur(s.price)}</div>}
              </motion.button>
            ))}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: F.muted, textAlign: 'center', margin: '16px 8px 0', lineHeight: 1.4 }}>Photos produits : Open Food Facts (produits vendus en Belgique). Prix : estimations, vérifie en magasin. Viande : toujours le logo halal.</div>
    </div>
  );
}
