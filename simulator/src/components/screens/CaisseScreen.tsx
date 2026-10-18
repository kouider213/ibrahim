import { useState, useEffect, useCallback } from 'react';
import { business, type CashEntry } from '../../services/api.ts';
import { T, Screen, PageHeader, HeadBtn, Sheet, Field, inputStyle, Btn, Card, Badge, Empty, KpiGrid, Kpi, SectionTitle, Segmented, Chips, Avatar, tone } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

const CATS = ['location', 'vente', 'immo', 'import', 'carburant', 'entretien', 'salaire', 'autre'];
const CAT_ICON: Record<string, string> = { location: '🚗', vente: '🏷️', immo: '🏠', import: '🚢', carburant: '⛽', entretien: '🔧', salaire: '👷', autre: '📌' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CaisseScreen() {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [month, setMonth]     = useState<Record<string, { income: number; expense: number; balance: number }>>({});
  const [loading, setLoading] = useState(true);
  const [show, setShow]       = useState(false);
  const [busy, setBusy]       = useState('');
  const [toast, setToast]     = useState('');
  const [confirmDel, setConfirmDel] = useState('');
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
  const curs = Object.keys(month).length ? Object.keys(month) : ['DZD'];
  const moisNom = new Date().toLocaleDateString('fr-FR', { month: 'long' });

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Caisse" title="Caisse & compta" subtitle={`Entrées et sorties d'argent — ${moisNom}`} right={<HeadBtn icon="＋" label="Ajouter" onClick={() => setShow(true)} />} />}>
      {curs.map(cur => {
        const m = month[cur] || { income: 0, expense: 0, balance: 0 };
        return (
          <div key={cur}>
            {curs.length > 1 && <SectionTitle>{cur === 'EUR' ? 'En euros' : 'En dinars'}</SectionTitle>}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: T.muted }}>Solde du mois</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: m.balance >= 0 ? T.text : T.bad, marginTop: 2 }}>{m.balance >= 0 ? '' : '−'}{fmt(Math.abs(m.balance), cur)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 13, background: tone(T.ok, 0.1), border: `1px solid ${tone(T.ok, 0.25)}` }}>
                  <div style={{ fontSize: 12, color: T.ok, fontWeight: 600 }}>↗ Entrées</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{fmt(m.income, cur)}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 13, background: tone(T.bad, 0.1), border: `1px solid ${tone(T.bad, 0.25)}` }}>
                  <div style={{ fontSize: 12, color: T.bad, fontWeight: 600 }}>↘ Sorties</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{fmt(m.expense, cur)}</div>
                </div>
              </div>
            </Card>
          </div>
        );
      })}

      <SectionTitle>Mouvements</SectionTitle>
      {loading ? <SkeletonCards count={5} />
        : entries.length === 0 ? <Empty icon="💰" title="Aucun mouvement" text="Note chaque entrée ou sortie d'argent pour suivre ton solde." action={<Btn variant="primary" onClick={() => setShow(true)}>＋ Ajouter</Btn>} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map(e => {
              const isInc = e.kind === 'income';
              const col = isInc ? T.ok : T.bad;
              return (
                <Card key={e.id} pad={12} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar icon={CAT_ICON[e.category ?? ''] ?? (isInc ? '➕' : '➖')} color={col} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label || cap(e.category || (isInc ? 'Entrée' : 'Sortie'))}</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{cap(e.category || '')} · {e.entry_date ? new Date(e.entry_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: col, whiteSpace: 'nowrap' }}>{isInc ? '+' : '−'}{fmt(Number(e.amount), e.currency || 'DZD')}</div>
                    <button disabled={busy === e.id} onClick={() => { if (confirmDel === e.id) { void del(e.id); setConfirmDel(''); } else { setConfirmDel(e.id); setTimeout(() => setConfirmDel(c => c === e.id ? '' : c), 3000); } }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: confirmDel === e.id ? T.bad : T.faint, padding: '6px 0 0', minHeight: 28 }}>{confirmDel === e.id ? 'Confirmer ?' : 'Supprimer'}</button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {show && (
        <Sheet title="Nouveau mouvement" onClose={() => setShow(false)}
          footer={<Btn variant="primary" disabled={busy === 'add'} onClick={() => void add()} style={{ width: '100%' }}>{busy === 'add' ? 'Ajout…' : 'Enregistrer'}</Btn>}>
          <Field label="Type"><Segmented items={[{ id: 'income', label: '↗ Entrée' }, { id: 'expense', label: '↘ Sortie' }]} value={f.kind} onChange={k => setFF('kind', k)} /></Field>
          <Field label="Catégorie"><Chips items={CATS.map(c => ({ id: c, label: `${CAT_ICON[c]} ${cap(c)}` }))} value={f.category} onChange={k => setFF('category', k)} /></Field>
          <Field label="Montant">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={f.amount} onChange={e => setFF('amount', e.target.value)} placeholder="0" inputMode="numeric" style={{ ...inputStyle, flex: 2, fontSize: 20, fontWeight: 700 }} />
              <div style={{ flex: 1.2 }}><Segmented items={[{ id: 'DZD', label: 'DA' }, { id: 'EUR', label: '€' }]} value={f.currency} onChange={k => setFF('currency', k)} /></div>
            </div>
          </Field>
          <Field label="Libellé (facultatif)"><input value={f.label} onChange={e => setFF('label', e.target.value)} placeholder="Ex : Clio — Karim" style={inputStyle} /></Field>
        </Sheet>
      )}
    </Screen>
  );
}
