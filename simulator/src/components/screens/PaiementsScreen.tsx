import { useState, useEffect, useCallback } from 'react';
import { business, type BillingRow, type BillingOverview } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards } from '../ui/Premium.tsx';
import { Ico } from '../ui/Icon.tsx';
import { T, Toggle } from '../ui/Kit.tsx';

// « À PAYER » : tout ce qu'il faut payer pour garder Dzaryx actif. Railway et le domaine sont lus en direct,
// le reste se remplit ici (date, montant, solde après recharge). Dzaryx prévient à J-7, J-3, J-1, le jour J.

const C = {
  surface: 'var(--dz-surface)', border: 'rgba(var(--dz-ink-rgb),0.16)',
  accent: '#2f5bff', gold: '#b86e00', red: '#e0304f', text: 'var(--dz-text)', muted: 'var(--dz-muted)',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 9, padding: '8px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.font } as const);
/** Étiquette : ce qu'il faut VRAIMENT payer (Railway) vs facultatif ; gratuits indispensables à garder gratuits */
const badge = (r: BillingRow) => r.mandatory ? { label: 'OBLIGATOIRE', color: C.red }
  : r.kind === 'gratuit' ? (r.level === 'vital' ? { label: 'GRATUIT · INDISPENSABLE', color: C.accent } : { label: 'GRATUIT', color: C.accent })
  : { label: 'FACULTATIF', color: C.muted };
const STATE: Record<string, { icon: string; color: string }> = {
  ok: { icon: '🟢', color: C.accent }, soon: { icon: '🟠', color: C.gold }, late: { icon: '🔴', color: C.red },
  out: { icon: '🔴', color: C.red }, unknown: { icon: '⚪', color: C.muted },
};
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : 'Erreur';
  try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; }
};
/** « 9/11/2026 », « 09-11-2026 » ou « 2026-11-09 » → AAAA-MM-JJ */
function parseDate(v: string): string | null {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : null;
}

export default function PaiementsScreen() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showFree, setShowFree] = useState(false);

  const load = useCallback(async () => {
    try { setData(await business.billing()); } catch { /* garde l'ancien affichage */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };
  const act = async (fn: () => Promise<{ message?: string }>) => {
    try { const r = await fn(); say(r.message ?? 'Fait'); await load(); } catch (e) { say(`❌ ${errText(e)}`); }
  };

  const rows = data?.rows ?? [];
  const paid = rows.filter(r => r.kind !== 'gratuit').sort((a, b) => Number(!!b.mandatory) - Number(!!a.mandatory));
  const must = paid.filter(r => r.mandatory);
  const free = rows.filter(r => r.kind === 'gratuit');
  const urgent = paid.filter(r => r.state === 'late' || r.state === 'out' || r.state === 'soon');
  const unknown = paid.filter(r => r.state === 'unknown');

  return (
    <div style={{ height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--dz-bg)', color: C.text, fontFamily: C.font, paddingBottom: 110 }}>
      <Hero eyebrow="Dzaryx · Abonnements" title="À payer" subtitle="Tout ce qu'il faut payer pour garder Dzaryx actif" accent={C.gold} />
      <div style={{ padding: '0 14px' }}>
        {loading && !data ? <SkeletonCards /> : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 14 }}>
            <StatCard icon="⚠️" value={String(urgent.length)} label="À REGARDER" color={urgent.length ? C.red : C.accent} />
            <StatCard icon="❔" value={String(unknown.length)} label="DATE À REMPLIR" color={C.gold} />
            <StatCard icon="🧠" value={data?.claudeSpent7d != null ? `${data.claudeSpent7d.toFixed(1)} $` : '—'} label="CLAUDE 7 JOURS" color="#2f5bff" />
          </div>

          <div style={{ background: 'rgba(224,48,79,0.08)', border: '1px solid rgba(224,48,79,0.35)', borderRadius: 14, padding: 12, marginBottom: 10, fontSize: 12.5, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 4 }}><Ico e="💡" />Le minimum obligatoire</div>
            {must.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f04438', flexShrink: 0, alignSelf: 'center' }} /><span><b>{r.name}</b> — {r.amount ?? r.price}{r.due ? ` · le ${new Date(`${r.due}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}</span></div>)}
            <div style={{ color: C.muted, marginTop: 4 }}>C'est le seul paiement obligatoire pour garder Dzaryx en vie. Tout ce qui est marqué FACULTATIF peut être arrêté pour faire des économies : Dzaryx continue (en mode gratuit pour ce service).</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.45 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}><Ico e="🌱" />Mode économie Claude {data?.eco !== false ? 'activé' : 'coupé'}</div>
              <div style={{ color: C.muted }}>Les tâches de fond utilisent le modèle léger (≈ 20× moins cher). Le chat, les mails aux prospects, le conseiller et les inspections gardent le meilleur modèle.</div>
            </div>
            <Toggle on={data?.eco !== false} onChange={() => void act(() => business.billingEco(data?.eco === false))} colorOn={T.ok} colorOff="#64748b" />
          </div>

          <div style={{ background: 'rgba(47,91,255,0.08)', border: `1px solid rgba(47,91,255,0.25)`, borderRadius: 14, padding: 12, marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}><Ico e="🛡️" />Dzaryx ne meurt pas</div>
            {(data?.survival ?? []).map((l, i) => <div key={i}>• {l.replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, '')}</div>)}
            <div style={{ color: C.muted, marginTop: 4 }}><Ico e="🔔" />Dzaryx te prévient à J-7, J-3, la veille (appel pour Railway) et le jour J, et dès qu'un crédit est épuisé.</div>
          </div>

          {paid.map(r => <Card key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} act={act} />)}

          <button onClick={() => setShowFree(!showFree)} style={{ ...btn('rgba(var(--dz-ink-rgb),0.054)', C.text), width: '100%', marginTop: 4 }}>
            {showFree ? 'Masquer' : `Voir les services gratuits (${free.length})`}
          </button>
          {showFree && <div style={{ marginTop: 8 }}>{free.map(r => <Card key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} act={act} />)}</div>}
        </>)}
      </div>
      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 96, background: 'var(--dz-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 13, textAlign: 'center', zIndex: 50 }}>{toast}</div>}
    </div>
  );
}

function Card({ r, open, onToggle, act }: { r: BillingRow; open: boolean; onToggle: () => void; act: (fn: () => Promise<{ message?: string }>) => Promise<void> }) {
  const st = STATE[r.state] ?? STATE['unknown']!;
  const lv = badge(r);
  const setDate = () => {
    const v = window.prompt(`Prochain paiement de ${r.name} (JJ/MM/AAAA)`, r.due ? r.due.split('-').reverse().join('/') : '');
    if (v === null) return;
    const d = v.trim() ? parseDate(v) : '';
    if (d === null) { window.alert('Date non comprise. Exemple : 09/11/2026'); return; }
    void act(() => business.billingUpdate(r.id, { due: d }));
  };
  const setAmount = () => {
    const v = window.prompt(`Montant réel de ${r.name} (ex. 6 € / mois)`, r.amount ?? '');
    if (v !== null) void act(() => business.billingUpdate(r.id, { amount: v }));
  };
  const setBalance = () => {
    const v = window.prompt(`Crédit restant sur ${r.name} en $ (ex. après une recharge de 50 $ : 50)`);
    if (v === null) return;
    const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!(n >= 0)) { window.alert('Montant non compris'); return; }
    void act(() => business.billingUpdate(r.id, { balance: n }));
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${r.state === 'late' || r.state === 'out' ? 'rgba(224,48,79,0.5)' : C.border}`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.color, boxShadow: `0 0 8px ${st.color}`, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{r.name}</span>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: lv.color, border: `1px solid color-mix(in srgb, ${lv.color} 33%, transparent)`, borderRadius: 6, padding: '2px 6px' }}>{lv.label}</span>
        </div>
        <div style={{ fontSize: 12, color: st.color, marginTop: 5 }}>{r.status}{r.live ? ' · en direct' : ''}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{r.amount ?? r.price ?? ''}{r.period && (r.amount || r.price) ? ` · par ${r.period}` : ''}</div>
      </div>
      {open && (
        <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5 }}>
          <div>🧩 {r.what}</div>
          <div style={{ color: r.level === 'vital' ? C.red : C.muted }}><Ico e="⚠️" />Si pas payé : {r.ifUnpaid}</div>
          {r.note && <div style={{ color: C.muted }}>📝 {r.note}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {r.payUrl && <button onClick={() => window.open(r.payUrl, '_blank')} style={btn('rgba(184,110,0,0.18)', C.gold)}><Ico e="💳" />Payer</button>}
            {r.kind !== 'gratuit' && r.kind !== 'credits' && r.id !== 'railway' && r.id !== 'domain' && <button onClick={() => { if (window.confirm(`${r.name} payé ? (l'échéance passe au ${r.period === 'an' ? 'an' : 'mois'} suivant)`)) void act(() => business.billingUpdate(r.id, { paid: true })); }} style={btn('rgba(47,91,255,0.18)', C.accent)}>✓ Payé</button>}
            {r.kind === 'credits' && <button onClick={setBalance} style={btn('rgba(47,91,255,0.18)', C.accent)}><Ico e="💰" />J'ai rechargé</button>}
            {r.kind !== 'gratuit' && !((r.id === 'railway' || r.id === 'domain') && r.live) && <button onClick={setDate} style={btn('rgba(var(--dz-ink-rgb),0.054)', C.text)}><Ico e="📅" />Date</button>}
            {r.kind !== 'gratuit' && <button onClick={setAmount} style={btn('rgba(var(--dz-ink-rgb),0.054)', C.text)}>Montant</button>}
          </div>
        </div>
      )}
    </div>
  );
}
