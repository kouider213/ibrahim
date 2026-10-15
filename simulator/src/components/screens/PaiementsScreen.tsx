import { useState, useEffect, useCallback } from 'react';
import { business, type BillingRow, type BillingOverview } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards } from '../ui/Premium.tsx';

// « À PAYER » : tout ce qu'il faut payer pour garder Dzaryx actif. Railway et le domaine sont lus en direct,
// le reste se remplit ici (date, montant, solde après recharge). Dzaryx prévient à J-7, J-3, J-1, le jour J.

const C = {
  surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', red: '#f87171', text: '#f5f5f7', muted: '#9b9ba6',
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
    try { const r = await fn(); say(r.message ?? '✅'); await load(); } catch (e) { say(`❌ ${errText(e)}`); }
  };

  const rows = data?.rows ?? [];
  const paid = rows.filter(r => r.kind !== 'gratuit').sort((a, b) => Number(!!b.mandatory) - Number(!!a.mandatory));
  const must = paid.filter(r => r.mandatory);
  const free = rows.filter(r => r.kind === 'gratuit');
  const urgent = paid.filter(r => r.state === 'late' || r.state === 'out' || r.state === 'soon');
  const unknown = paid.filter(r => r.state === 'unknown');

  return (
    <div style={{ minHeight: '100%', background: '#0a0a0c', color: C.text, fontFamily: C.font, paddingBottom: 90 }}>
      <Hero eyebrow="Dzaryx · Abonnements" title="À payer" subtitle="Tout ce qu'il faut payer pour garder Dzaryx actif" accent={C.gold} />
      <div style={{ padding: '0 14px' }}>
        {loading && !data ? <SkeletonCards /> : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 14 }}>
            <StatCard icon="⚠️" value={String(urgent.length)} label="À REGARDER" color={urgent.length ? C.red : C.accent} />
            <StatCard icon="❔" value={String(unknown.length)} label="DATE À REMPLIR" color={C.gold} />
            <StatCard icon="🧠" value={data?.claudeSpent7d != null ? `${data.claudeSpent7d.toFixed(1)} $` : '—'} label="CLAUDE 7 JOURS" color="#a78bfa" />
          </div>

          <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 14, padding: 12, marginBottom: 10, fontSize: 12.5, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 4 }}>💡 Le minimum obligatoire</div>
            {must.map(r => <div key={r.id}>🔴 <b>{r.name}</b> — {r.amount ?? r.price}{r.due ? ` · le ${new Date(`${r.due}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}</div>)}
            <div style={{ color: C.muted, marginTop: 4 }}>C'est le seul paiement obligatoire pour garder Dzaryx en vie. Tout ce qui est marqué FACULTATIF peut être arrêté pour faire des économies : Dzaryx continue (en mode gratuit pour ce service).</div>
          </div>

          <div style={{ background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.25)`, borderRadius: 14, padding: 12, marginBottom: 14, fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>🛡️ Dzaryx ne meurt pas</div>
            {(data?.survival ?? []).map((l, i) => <div key={i}>• {l}</div>)}
            <div style={{ color: C.muted, marginTop: 4 }}>🔔 Dzaryx te prévient à J-7, J-3, la veille (appel pour Railway) et le jour J, et dès qu'un crédit est épuisé.</div>
          </div>

          {paid.map(r => <Card key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} act={act} />)}

          <button onClick={() => setShowFree(!showFree)} style={{ ...btn('rgba(255,255,255,0.06)', C.text), width: '100%', marginTop: 4 }}>
            {showFree ? 'Masquer' : `Voir les services gratuits (${free.length})`}
          </button>
          {showFree && <div style={{ marginTop: 8 }}>{free.map(r => <Card key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} act={act} />)}</div>}
        </>)}
      </div>
      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 96, background: '#1f1f27', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 13, textAlign: 'center', zIndex: 50 }}>{toast}</div>}
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
    <div style={{ background: C.surface, border: `1px solid ${r.state === 'late' || r.state === 'out' ? 'rgba(248,113,113,0.5)' : C.border}`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{st.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{r.name}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: lv.color, border: `1px solid ${lv.color}55`, borderRadius: 6, padding: '2px 6px' }}>{lv.label}</span>
        </div>
        <div style={{ fontSize: 12, color: st.color, marginTop: 5 }}>{r.status}{r.live ? ' · en direct' : ''}</div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{r.amount ?? r.price ?? ''}{r.period && (r.amount || r.price) ? ` · par ${r.period}` : ''}</div>
      </div>
      {open && (
        <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5 }}>
          <div>🧩 {r.what}</div>
          <div style={{ color: r.level === 'vital' ? C.red : C.muted }}>⚠️ Si pas payé : {r.ifUnpaid}</div>
          {r.note && <div style={{ color: C.muted }}>📝 {r.note}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {r.payUrl && <button onClick={() => window.open(r.payUrl, '_blank')} style={btn('rgba(251,191,36,0.18)', C.gold)}>💳 Payer</button>}
            {r.kind !== 'gratuit' && r.kind !== 'credits' && r.id !== 'railway' && r.id !== 'domain' && <button onClick={() => { if (window.confirm(`${r.name} payé ? (l'échéance passe au ${r.period === 'an' ? 'an' : 'mois'} suivant)`)) void act(() => business.billingUpdate(r.id, { paid: true })); }} style={btn('rgba(16,185,129,0.18)', C.accent)}>✓ Payé</button>}
            {r.kind === 'credits' && <button onClick={setBalance} style={btn('rgba(16,185,129,0.18)', C.accent)}>💰 J'ai rechargé</button>}
            {r.kind !== 'gratuit' && r.id !== 'railway' && r.id !== 'domain' && <button onClick={setDate} style={btn('rgba(255,255,255,0.06)', C.text)}>📅 Date</button>}
            {r.kind !== 'gratuit' && <button onClick={setAmount} style={btn('rgba(255,255,255,0.06)', C.text)}>Montant</button>}
          </div>
        </div>
      )}
    </div>
  );
}
