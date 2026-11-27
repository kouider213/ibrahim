import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, PageHeader, Screen, Card, SectionTitle, Btn, Sheet, Field, inputStyle, Badge, Empty, money } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

// MON ARGENT (27/11) : tout l'argent de Kouider hors salaire — snus, appartement, vente de voiture, autre + bénéfice FIK.
// Boutons +1 / +5 / +10… pour noter une vente en une seconde, soldes compte + cash, meilleurs jours, ce qui rapporte le plus.
// PRIVÉ : données sur le serveur (/api/mon-argent, compte Kouider seulement) — aucun chiffre dans ce code (dépôt public).
// Même journal que Telegram : « snus 150 » écrit à Dzaryx apparaît ici, et l'inverse.

interface Src { id: string; label: string; amount: number }
interface Overview {
  balances: { compte: number; cash: number; total: number; compteAt: string | null; cashAt: string | null };
  today: { total: number; bySource: Src[] }; week: { total: number };
  month: { total: number; bySource: Src[] }; year: { total: number; bySource: Src[] };
  bestDays: Array<{ d: string; amount: number; day: string }>;
  weekdays: Array<{ name: string; avg: number; n: number }>;
  last30: Array<{ d: string; amount: number }>;
  recent: Array<{ at: number; d: string; cat: string; label: string; amount: number }>;
  sources: Array<{ id: string; label: string; icon: string }>;
}
const SRC_COL: Record<string, string> = { fik: '#3d6bff', snus: '#12b76a', appartement: '#f97316', 'vente-voiture': '#8b5cf6', autre: '#64748b', cash: '#64748b' };
const STEPS = [1, 5, 10, 20, 50, 100];
const dm = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function MonArgentScreen() {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [cat, setCat] = useState('snus');
  const [pending, setPending] = useState(0);      // montant en cours de saisie (+1 +10… s'additionnent)
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState('');
  const [editBal, setEditBal] = useState(false);
  const [bal, setBal] = useState({ compte: '', cash: '' });
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const load = useCallback(async () => {
    try { setO(await apiFetch<Overview>('/api/mon-argent')); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (amount: number) => {
    if (!(amount > 0)) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ message: string; overview: Overview }>('/api/mon-argent/add', { method: 'POST', body: JSON.stringify({ cat, amount }) });
      setO(r.overview); setPending(0); setOther(''); flash(`✅ ${r.message}`);
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };
  const undo = async (at: number) => {
    try { const r = await apiFetch<{ ok: boolean; overview: Overview }>('/api/mon-argent/undo', { method: 'POST', body: JSON.stringify({ at }) }); setO(r.overview); flash(r.ok ? 'Ligne retirée' : 'Introuvable'); }
    catch { flash('Erreur'); }
  };
  const saveBalances = async () => {
    try {
      const body = { ...(bal.compte !== '' ? { compte: Number(bal.compte) } : {}), ...(bal.cash !== '' ? { cash: Number(bal.cash) } : {}) };
      const r = await apiFetch<{ overview: Overview }>('/api/mon-argent/balances', { method: 'POST', body: JSON.stringify(body) });
      setO(r.overview); setEditBal(false); flash('✅ Soldes mis à jour');
    } catch { flash('Erreur'); }
  };

  const src = o?.sources.find(s => s.id === cat);
  const maxWd = Math.max(1, ...(o?.weekdays.map(w => w.avg) ?? [1]));
  const max30 = Math.max(1, ...(o?.last30.map(d => d.amount) ?? [1]));
  const topWd = o ? [...o.weekdays].filter(w => w.n > 0).sort((a, b) => b.avg - a.avg)[0] : undefined;

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Privé" title="Mon argent" subtitle="Tout ce que tu gagnes, hors salaire — visible par toi seul" />}>
      {err ? <Empty icon="🔒" title="Indisponible" text={err} action={<Btn onClick={() => void load()}>Réessayer</Btn>} />
        : !o ? <SkeletonCards count={4} height={110} /> : <>

        {/* Soldes */}
        <Card style={{ marginBottom: 12, padding: '18px 16px', background: `radial-gradient(120% 120% at 100% 0%, ${tone(T.ok, 0.18)}, transparent 60%), linear-gradient(160deg, ${T.surface2}, ${T.surface})` }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: 13, color: T.muted, fontWeight: 600 }}>Tout ton argent</div>
            <button onClick={() => { setBal({ compte: String(o.balances.compte || ''), cash: String(o.balances.cash || '') }); setEditBal(true); }}
              style={{ background: 'none', border: 'none', color: T.accent, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: T.font }}>Modifier</button>
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 4 }}>{money(o.balances.total)}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}`, fontSize: 13, color: T.muted }}>
            <span>Compte <b style={{ color: T.text, fontSize: 15 }}>{money(o.balances.compte)}</b></span>
            <span>Cash <b style={{ color: T.text, fontSize: 15 }}>{money(o.balances.cash)}</b></span>
          </div>
        </Card>

        {/* Noter une vente */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Noter une vente</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {o.sources.map(s => (
              <button key={s.id} onClick={() => { setCat(s.id); setPending(0); }} style={{ padding: '8px 12px', borderRadius: 999, fontFamily: T.font, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${cat === s.id ? SRC_COL[s.id] : T.line}`, background: cat === s.id ? tone(SRC_COL[s.id] ?? T.accent, 0.18) : 'transparent', color: cat === s.id ? T.text : T.muted }}>{s.icon} {s.label}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {STEPS.map(n => (
              <button key={n} disabled={busy} onClick={() => setPending(p => p + n)} style={{ padding: '14px 0', borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface2, color: T.text, fontSize: 18, fontWeight: 800, fontFamily: T.font, cursor: 'pointer' }}>+{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input inputMode="decimal" placeholder="Autre montant" value={other} onChange={e => setOther(e.target.value.replace(',', '.'))} style={{ ...inputStyle, flex: 1 }} />
            <Btn variant="primary" disabled={busy || !(pending > 0 || Number(other) > 0)} onClick={() => void save(Number(other) > 0 ? Number(other) : pending)}>
              {busy ? '…' : `Noter ${Number(other) > 0 ? money(Number(other)) : pending > 0 ? money(pending) : ''}`}
            </Btn>
          </div>
          {pending > 0 && !(Number(other) > 0) && <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, fontSize: 13, color: T.muted }}>
            <span style={{ flex: 1 }}>{src?.icon} {src?.label} : <b style={{ color: T.text }}>+{money(pending)}</b> (appuie sur Noter)</span>
            <button onClick={() => setPending(0)} style={{ background: 'none', border: 'none', color: T.bad, fontWeight: 700, cursor: 'pointer', fontFamily: T.font }}>Effacer</button>
          </div>}
        </Card>

        {/* Résumé */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 12 }}>
          {[{ l: "Aujourd'hui", v: o.today.total }, { l: 'Cette semaine', v: o.week.total }, { l: 'Ce mois', v: o.month.total }].map(x => (
            <Card key={x.l} pad={12}><div style={{ fontSize: 18, fontWeight: 800 }}>{money(x.v)}</div><div style={{ fontSize: 12, color: T.muted }}>{x.l}</div></Card>
          ))}
        </div>

        {/* Ce qui rapporte le plus */}
        <SectionTitle>Ce qui rapporte le plus</SectionTitle>
        <Card style={{ marginBottom: 12 }}>
          {([['Ce mois', o.month.bySource], ['12 derniers mois', o.year.bySource]] as const).map(([t, rows]) => {
            const mx = Math.max(1, ...rows.map(r => r.amount));
            return <div key={t} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700, marginBottom: 6 }}>{t.toUpperCase()}</div>
              {rows.length ? rows.map(r => (
                <div key={r.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', fontSize: 14 }}><span style={{ flex: 1, fontWeight: 600 }}>{r.label}</span><b>{money(r.amount)}</b></div>
                  <div style={{ height: 6, background: 'rgba(var(--dz-ink-rgb),0.045)', borderRadius: 3, marginTop: 4 }}><div style={{ height: '100%', width: `${r.amount / mx * 100}%`, background: SRC_COL[r.id] ?? T.accent, borderRadius: 3 }} /></div>
                </div>)) : <div style={{ fontSize: 13, color: T.faint }}>Rien de noté.</div>}
            </div>;
          })}
          <div style={{ fontSize: 12, color: T.faint }}>Locations FIK = ton bénéfice sur chaque réservation (automatique).</div>
        </Card>

        {/* 30 derniers jours */}
        <SectionTitle>30 derniers jours</SectionTitle>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
            {o.last30.map(d => <div key={d.d} title={`${dm(d.d)} : ${money(d.amount)}`} style={{ flex: 1, height: `${Math.max(2, d.amount / max30 * 100)}%`, background: d.amount ? T.ok : T.line, borderRadius: 3 }} />)}
          </div>
          <div style={{ display: 'flex', fontSize: 11.5, color: T.faint, marginTop: 6 }}><span style={{ flex: 1 }}>{dm(o.last30[0]!.d)}</span><span>aujourd'hui</span></div>
        </Card>

        {/* Meilleurs jours */}
        <SectionTitle>Tes meilleurs jours</SectionTitle>
        <Card style={{ marginBottom: 12 }}>
          {topWd && <div style={{ fontSize: 14, marginBottom: 10 }}>📈 En moyenne, c'est le <b>{topWd.name.toLowerCase()}</b> qui rapporte le plus ({money(topWd.avg)} par {topWd.name.toLowerCase()} noté).</div>}
          {o.weekdays.map(w => (
            <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
              <span style={{ width: 78, color: T.muted }}>{w.name}</span>
              <div style={{ flex: 1, height: 8, background: 'rgba(var(--dz-ink-rgb),0.045)', borderRadius: 4 }}><div style={{ height: '100%', width: `${w.avg / maxWd * 100}%`, background: T.accent, borderRadius: 4 }} /></div>
              <span style={{ width: 60, textAlign: 'right', fontWeight: 700 }}>{w.n ? money(w.avg) : '—'}</span>
            </div>
          ))}
          {o.bestDays.length > 0 && <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 12.5, color: T.muted, fontWeight: 700, marginBottom: 6 }}>RECORDS</div>
            {o.bestDays.map((b, i) => <div key={b.d} style={{ display: 'flex', fontSize: 14, marginBottom: 4 }}><span style={{ flex: 1 }}>{['🥇', '🥈', '🥉', '4.', '5.'][i]} {dm(b.d)}</span><b>{money(b.amount)}</b></div>)}
          </div>}
        </Card>

        {/* Dernières notes */}
        {o.recent.length > 0 && <>
          <SectionTitle>Dernières ventes notées</SectionTitle>
          <Card>
            {o.recent.map(r => (
              <div key={r.at} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.line}` }}>
                <Badge color={SRC_COL[r.cat] ?? T.accent}>{r.label}</Badge>
                <span style={{ flex: 1, fontSize: 13, color: T.muted }}>{dm(r.d)}</span>
                <b style={{ fontSize: 15 }}>+{money(r.amount)}</b>
                <button onClick={() => void undo(r.at)} aria-label="Retirer" style={{ background: 'none', border: 'none', color: T.faint, fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </Card>
        </>}
      </>}

      {editBal && (
        <Sheet title="Mes soldes" subtitle="Ce que tu as maintenant sur ton compte et en cash" onClose={() => setEditBal(false)}
          footer={<Btn variant="primary" onClick={() => void saveBalances()} style={{ width: '100%' }}>Enregistrer</Btn>}>
          <Field label="Sur le compte (€)"><input inputMode="decimal" value={bal.compte} onChange={e => setBal(b => ({ ...b, compte: e.target.value.replace(/[^\d.]/g, '') }))} style={inputStyle} /></Field>
          <Field label="En cash (€)"><input inputMode="decimal" value={bal.cash} onChange={e => setBal(b => ({ ...b, cash: e.target.value.replace(/[^\d.]/g, '') }))} style={inputStyle} /></Field>
        </Sheet>
      )}
    </Screen>
  );
}
