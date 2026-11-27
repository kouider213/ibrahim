import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, money, glass } from '../ui/Kit.tsx';
import { addSnus, snusPrice, SRC_COL, type MonArgent } from './MonArgentScreen.tsx';

// Carte « Mon argent » de la page Aujourd'hui (27/11) : total du jour, snus du jour, +1 / +5 / +10 pièces au prix normal (6 €), 1 à 6 € / 1 à 5 € en un appui.
// Privée : si le serveur refuse (autre compte que Kouider), la carte ne s'affiche pas.
const go = (p: string) => window.dispatchEvent(new CustomEvent('dz:go', { detail: p }));

export function MonArgentMini() {
  const [o, setO] = useState<MonArgent | null>(null);
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { apiFetch<MonArgent>('/api/mon-argent').then(setO).catch(() => setO(null)); }, []);
  if (!o) return null;
  const hide = localStorage.getItem('dz:argent:hide') === '1';
  const fm = (n: number) => (hide ? '•••• €' : money(n));
  const save = async () => {
    setBusy(true);
    try { const r = await addSnus(qty, 'normal', localStorage.getItem('dz:argent:pid') || undefined); setO(r.overview); setQty(0); setMsg(`✅ ${r.message}`); setTimeout(() => setMsg(''), 2200); }
    catch { setMsg('Erreur, réessaie'); }
    finally { setBusy(false); }
  };
  const one = async (u: 5 | 6) => {
    setBusy(true);
    try { const r = await addSnus(1, u === 5 ? 'cinq' : 'six', localStorage.getItem('dz:argent:pid') || undefined); setO(r.overview); setMsg(`✅ ${r.message}`); setTimeout(() => setMsg(''), 2200); }
    catch { setMsg('Erreur, réessaie'); }
    finally { setBusy(false); }
  };
  const p = qty ? snusPrice(qty, 'normal') : null;
  // 27/11 soir (Kouider : « pourquoi ici 99 € au lieu de 79 € ») : l'argent du jour = ventes − ce qu'il a pris dessus, comme MON ARGENT
  const day = o.today.day;
  const net = o.today.total - (day?.pris ?? 0);
  const last = day?.lines.length ? day.lines[day.lines.length - 1] : null;
  const post = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    try { const r = await apiFetch<{ message?: string; overview?: MonArgent }>(path, { method: 'POST', body: JSON.stringify(body) }); if (r.overview) setO(r.overview); setMsg(`✅ ${r.message && r.message !== 'OK' ? r.message : ok}`); setTimeout(() => setMsg(''), 2600); }
    catch { setMsg('Erreur, réessaie'); }
    finally { setBusy(false); }
  };
  const take = () => { const v = window.prompt('Combien tu as pris sur l\'argent d\'aujourd\'hui (€) ?', ''); const n = Number(String(v ?? '').replace(',', '.')); if (n > 0) void post('/api/mon-argent/prise', { amount: n }, 'Noté'); };
  const undoLast = () => { if (last && window.confirm(`Annuler « ${last.label} » (${last.time ?? ''}, ${money(Math.abs(last.amount))}) ?`)) void post('/api/mon-argent/undo', { key: last.key }, 'Annulé'); };
  const stockLow = (o.extras?.stock?.pieces ?? 99) <= 30;
  return (
    <div style={{ ...glass(SRC_COL.snus), borderRadius: 22, padding: 14, marginBottom: 18 }}>
      <div className="dz-press" role="button" onClick={() => go('argent')} style={{ display: 'flex', alignItems: 'baseline', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.muted }}>Mon argent · aujourd'hui</div>
          <div style={{ fontFamily: T.display, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 4 }}>{fm(net)}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{day?.pris ? <>ventes {fm(day.ventes)} − pris <b style={{ color: T.bad }}>{fm(day.pris)}</b></> : 'ventes du jour'}{last?.time ? ` · ${last.time}` : ''}{day?.readAt ? ` · lu à ${day.readAt}` : ''}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12.5, color: T.muted }}>
          <div>🟢 {o.snus.today} snus{o.extras?.stock ? <> · <span role="button" onClick={e => { e.stopPropagation(); go('stocksnus'); }} style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, color: stockLow ? T.bad : undefined, fontWeight: stockLow ? 800 : 700 }}>📦 stock {o.extras.stock.pieces}{stockLow ? ' ⚠️' : ''} ›</span></> : ''}</div><div>Ce mois <b style={{ color: T.text }}>{fm(o.month.total)}</b></div>
          <div style={{ color: T.accent, fontWeight: 700, marginTop: 2 }}>Détails ›</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {[1, 5, 10].map(n => (
          <button key={n} disabled={busy} onClick={() => setQty(q => q + n)} style={{ flex: 1, padding: '11px 0', borderRadius: 14, border: 'none', background: SRC_COL.snus, color: '#fff', fontSize: 16, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>+{n}</button>
        ))}
        {qty === 0 && ([6, 5] as const).map(u => <button key={u} disabled={busy} onClick={() => void one(u)} style={{ flex: 1.2, padding: '11px 0', borderRadius: 14, border: `1px solid ${SRC_COL.snus}`, background: 'transparent', color: T.text, fontSize: 13, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>1 à {u} €</button>)}
        {qty > 0 && <button disabled={busy} onClick={() => void save()} style={{ flex: 1.6, padding: '11px 0', borderRadius: 14, border: `1px solid ${SRC_COL.snus}`, background: 'transparent', color: T.text, fontSize: 13.5, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>{busy ? '…' : `Noter ${qty} = ${money(p!.amount)}`}</button>}
      </div>
      {qty === 0 && <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12.5, fontWeight: 700 }}>
        <span role="button" onClick={take} style={{ color: T.bad, cursor: 'pointer' }}>➖ J'ai pris dessus</span>
        {last && <span role="button" onClick={undoLast} style={{ color: T.muted, cursor: 'pointer' }}>↩ Annuler la dernière</span>}
      </div>}
      {msg ? <div style={{ fontSize: 12.5, color: T.ok, marginTop: 8 }}>{msg}</div>
        : qty > 0 ? <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>Prix normal : 6 € la pièce. Lot dès 10 à 5 € : dans « Détails ». <span role="button" onClick={() => setQty(0)} style={{ color: T.bad, fontWeight: 700, cursor: 'pointer' }}>Effacer</span></div> : null}
    </div>
  );
}
