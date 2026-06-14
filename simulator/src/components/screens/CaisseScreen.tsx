import { useState, useEffect, useCallback } from 'react';
import { business, type CashEntry } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', surface2: '#1d1d25', border: 'rgba(255,255,255,0.08)',
  green: '#10b981', red: '#ef4444', text: '#f5f5f7', muted: '#9b9ba6', gold: '#fbbf24',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const CATS = ['location', 'vente', 'immo', 'import', 'carburant', 'entretien', 'salaire', 'autre'];

export default function CaisseScreen() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [month, setMonth]     = useState<Record<string, { income: number; expense: number; balance: number }>>({});
  const [loading, setLoading] = useState(true);
  const [show, setShow]       = useState(false);
  const [busy, setBusy]       = useState('');
  const [toast, setToast]     = useState('');
  const empty = { kind: 'income', category: 'location', label: '', amount: '', currency: 'DZD' };
  const [f, setF] = useState(empty);
  const setFF = (k: keyof typeof empty, v: string) => setF(s => ({ ...s, [k]: v }));
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await business.cashList(); setEntries(r.entries ?? []); setMonth(r.month ?? {}); }
    catch { setEntries([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    const amount = Number(f.amount);
    if (!amount || amount <= 0) { flash('Montant requis'); return; }
    setBusy('add');
    try {
      await business.cashAdd({ kind: f.kind, category: f.category, label: f.label, amount, currency: f.currency });
      flash('✅ Mouvement ajouté'); setShow(false); setF(empty); await load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(''); }
  };

  const del = async (id: string) => {
    setBusy(id);
    try { await business.cashDelete(id); setEntries(xs => xs.filter(x => x.id !== id)); await load(); }
    catch { flash('Erreur suppression'); } finally { setBusy(''); }
  };

  const fmt = (n: number, cur = 'DZD') => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} ${cur === 'EUR' ? '€' : 'DA'}`;
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ margin: '-20px -16px 4px' }}><Hero eyebrow="Dzaryx · Caisse" title="Caisse & Compta" /></div>

      {/* Totaux du mois — séparés par devise (jamais mélangés) */}
      {(() => {
        const curs = Object.keys(month);
        if (curs.length === 0) curs.push('DZD');
        return curs.map(cur => {
          const m = month[cur] || { income: 0, expense: 0, balance: 0 };
          return (
            <div key={cur} style={{ marginBottom: 10 }}>
              {curs.length > 1 && <div style={{ fontSize: 10, color: C.muted, marginBottom: 5, fontWeight: 700 }}>{cur === 'EUR' ? 'EUROS' : 'DINARS'}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {[
                  { l: 'Entrées', v: m.income, c: C.green },
                  { l: 'Sorties', v: m.expense, c: C.red },
                  { l: 'Solde', v: m.balance, c: m.balance >= 0 ? C.gold : C.red },
                ].map(s => (
                  <StatCard key={s.l} value={fmt(s.v, cur)} label={`${s.l} (mois)`} color={s.c} />
                ))}
              </div>
            </div>
          );
        });
      })()}
      <div style={{ marginBottom: 4 }} />

      <button onClick={() => setShow(s => !s)} style={{ width: '100%', marginBottom: 12, padding: '12px', borderRadius: 12, border: 'none', background: C.green, color: '#06210f', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
        {show ? '✕ Fermer' : '＋ Ajouter un mouvement'}
      </button>

      {show && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            {(['income', 'expense'] as const).map(k => (
              <button key={k} onClick={() => setFF('kind', k)} style={{ flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: C.font, background: f.kind === k ? (k === 'income' ? C.green : C.red) : 'rgba(255,255,255,0.04)', color: f.kind === k ? '#fff' : C.muted, border: 'none' }}>{k === 'income' ? '➕ Entrée' : '➖ Sortie'}</button>
            ))}
          </div>
          <select value={f.category} onChange={e => setFF('category', e.target.value)} style={inp}>{CATS.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <input value={f.label} onChange={e => setFF('label', e.target.value)} placeholder="Libellé (optionnel)" style={inp} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.amount} onChange={e => setFF('amount', e.target.value)} placeholder="Montant" inputMode="numeric" style={{ ...inp, flex: 2 }} />
            <select value={f.currency} onChange={e => setFF('currency', e.target.value)} style={{ ...inp, flex: 1 }}><option value="DZD">DZD</option><option value="EUR">EUR</option></select>
          </div>
          <button disabled={busy === 'add'} onClick={() => void add()} style={{ padding: '11px', borderRadius: 11, border: 'none', background: C.gold, color: '#1a1300', fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{busy === 'add' ? 'Ajout…' : 'Enregistrer'}</button>
        </div>
      )}

      {/* Liste */}
      {loading ? <SkeletonCards count={5} />
        : entries.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun mouvement</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(e => {
              const isInc = e.kind === 'income';
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: '11px 13px' }}>
                  <span style={{ fontSize: 16 }}>{isInc ? '➕' : '➖'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label || e.category || (isInc ? 'Entrée' : 'Sortie')}</div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{e.category} · {(e.entry_date ?? '').slice(0, 10)}</div>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: isInc ? C.green : C.red }}>{isInc ? '+' : '−'}{fmt(Number(e.amount), e.currency || 'DZD')}</div>
                  <button onClick={() => void del(e.id)} disabled={busy === e.id} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.muted, padding: 2 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.15)', border: `1px solid ${C.green}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.green, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}
