import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, PageHeader, Screen, SectionTitle, Badge, Empty, glass, HeadBtn } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

// MON ANALYSE (27/11) : objectifs calculés sur ses données + 20 options « si tu fais ça → tu atteins ça au lieu de ça »
// + « Mon avis ». PRIVÉ : tout vient de /api/mon-argent/analyse (compte Kouider seulement).

interface Objectif { id: string; icon: string; title: string; now: string; target: string; pct: number | null; by: string | null; text: string; tone: 'ok' | 'warn' | 'info' }
interface OptionSi { id: string; icon: string; cat: string; si: string; alors: string; auLieu?: string; gain?: string; effort: 1 | 2 | 3 }
interface Sim { curve: number[]; need: number; nowYm: string; marge: number; fikDay: number; departLabel: string }
interface Analyse { today: string; objectifs: Objectif[]; options: OptionSi[]; depart: { label: string; best: string; slow: string; pct: number } | null;
  before: { date: string; items: Record<string, { now: string; by: string | null; pct: number | null }> } | null; engaged: Record<string, { at: string }>; sim: Sim | null }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ymL = (ym: string, k: number) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const CATS: Array<[string, string]> = [['tout', 'Tout'], ['snus', 'Snus'], ['argent', 'Argent'], ['fik', 'FIK'], ['corps', 'Corps'], ['sommeil', 'Sommeil'], ['famille', 'Famille'], ['depart', 'Départ']];
const toneC = (t: string) => (t === 'ok' ? T.ok : t === 'warn' ? T.warn : T.accent);
const EFFORT = ['', 'Facile', 'Moyen', 'Gros effort'];

export default function AnalyseScreen() {
  const [a, setA] = useState<Analyse | null>(null);
  const [err, setErr] = useState('');
  const [avis, setAvis] = useState<string | null>(null);
  const [cat, setCat] = useState('tout');
  const [loading, setLoading] = useState(true);
  const [sim, setSim] = useState({ pieces: 0, cut: 0, fik: 0, extra: 0 });

  const load = useCallback(async (force = false) => {
    setLoading(true); setErr('');
    try { setA(await apiFetch<Analyse>('/api/mon-argent/analyse')); } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
    apiFetch<{ text: string }>(`/api/mon-argent/analyse/avis${force ? '?force=1' : ''}`).then(r => setAvis(r.text || '')).catch(() => setAvis(''));
  }, []);
  useEffect(() => { void load(); }, [load]);
  // « Je le fais » = engagement gardé sur le serveur : Dzaryx le voit et t'encourage dessus
  const toggle = (id: string) => {
    if (!a) return; const on = !a.engaged[id];
    setA({ ...a, engaged: on ? { ...a.engaged, [id]: { at: a.today } } : Object.fromEntries(Object.entries(a.engaged).filter(([k]) => k !== id)) });
    void apiFetch('/api/mon-argent/analyse/engage', { method: 'POST', body: JSON.stringify({ id, on }) }).catch(() => {});
  };
  const tried = a?.engaged ?? {};

  const opts = (a?.options ?? []).filter(o => cat === 'tout' || o.cat === cat);
  return (
    <Screen header={<PageHeader eyebrow="Avec tout ce que je sais" title="🧭 Mon analyse" subtitle="Tes objectifs, et ce que chaque choix change — calculé sur tes vrais chiffres."
      right={<HeadBtn icon="↻" label="Actualiser" onClick={() => void load(true)} busy={loading} />} />}>
      {loading && !a ? <SkeletonCards count={4} /> : !a ? <Empty icon="📡" title="Analyse indisponible" text={err || 'Réessaie dans un instant.'} /> : <>
        {/* Mon avis */}
        <div style={{ borderRadius: 24, padding: '16px 18px', marginBottom: 18, color: '#fff', background: 'linear-gradient(145deg, #2442ff 0%, #2a1878 100%)', boxShadow: '0 20px 40px -24px rgba(36,66,255,0.7)' }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', opacity: 0.75 }}>💬 Mon avis</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 8, whiteSpace: 'pre-wrap' }}>{avis === null ? 'Je réfléchis…' : avis || 'Avis pas disponible pour le moment (les calculs ci-dessous restent justes).'}</div>
        </div>

        <SectionTitle right={<Badge>{a.objectifs.length}</Badge>}>🎯 Tes objectifs</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {a.objectifs.map(o => (
            <div key={o.id} style={{ ...glass(toneC(o.tone)), borderRadius: 20, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{o.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{o.title}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>{o.now} → <b style={{ color: T.text }}>{o.target}</b>{o.by ? ` · ${o.by}` : ''}</div>
                </div>
                {o.pct != null && <b style={{ fontSize: 15, color: toneC(o.tone) }}>{o.pct} %</b>}
              </div>
              {o.pct != null && <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.07)', marginTop: 10 }}><div style={{ height: '100%', width: `${Math.max(2, o.pct)}%`, borderRadius: 3, background: toneC(o.tone) }} /></div>}
              <div style={{ fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.45 }}>{o.text}</div>
              {a.before?.items[o.id] && (a.before.items[o.id]!.now !== o.now || a.before.items[o.id]!.by !== o.by) && <div style={{ fontSize: 12, color: T.faint, marginTop: 6 }}>📅 Le {a.before.date.slice(8, 10)}/{a.before.date.slice(5, 7)} : {a.before.items[o.id]!.now}{a.before.items[o.id]!.by && a.before.items[o.id]!.by !== o.by ? ` · ${a.before.items[o.id]!.by}` : ''}</div>}
            </div>
          ))}
        </div>

        {a.sim && (() => {
          const x = a.sim!, perMonth = sim.pieces * x.marge * 26 + sim.cut + sim.fik * x.fikDay + sim.extra;
          let i: number | null = null; for (let k = 0; k < x.curve.length; k++) if (x.curve[k]! + perMonth * k >= x.need) { i = k; break; }
          let i0: number | null = null; for (let k = 0; k < x.curve.length; k++) if (x.curve[k]! >= x.need) { i0 = k; break; }
          const label = i === null ? 'pas avant 15 ans' : ymL(x.nowYm, i), gain = i !== null && i0 !== null ? i0 - i : null;
          const rows: Array<[keyof typeof sim, string, number, number, string]> = [['pieces', 'Pièces de snus en plus / jour', 0, 15, 'pcs'], ['cut', 'Dépenses en moins / mois', 0, 800, '€'], ['fik', 'Jours de location FIK en plus / mois', 0, 60, 'j'], ['extra', 'Autre revenu en plus / mois', 0, 1000, '€']];
          return (
            <div style={{ ...glass(T.violet), borderRadius: 22, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>🧪 Et si… (simulateur de départ)</div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>Bouge les curseurs : même calcul que ton plan de départ.</div>
              {rows.map(([k, l, min, max, u]) => (
                <div key={k} style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', fontSize: 13 }}><span style={{ flex: 1 }}>{l}</span><b>+{sim[k]} {u}</b></div>
                  <input type="range" min={min} max={max} step={k === 'cut' || k === 'extra' ? 50 : 1} value={sim[k]} onChange={e => setSim({ ...sim, [k]: Number(e.target.value) })} style={{ width: '100%', touchAction: 'none', accentColor: T.violet }} />
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 16, background: 'rgba(var(--dz-ink-rgb),0.05)' }}>
                <div style={{ fontSize: 12.5, color: T.muted }}>+{Math.round(perMonth)} € par mois →</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginTop: 2 }}>Départ {label}</div>
                <div style={{ fontSize: 13, color: gain && gain > 0 ? T.ok : T.muted, fontWeight: 700, marginTop: 2 }}>{gain && gain > 0 ? `${gain} mois plus tôt que ${x.departLabel}` : `Aujourd'hui : ${x.departLabel}`}</div>
              </div>
            </div>);
        })()}

        <SectionTitle right={<Badge color={T.violet}>{a.options.length}</Badge>}>💡 Si tu fais ça…</SectionTitle>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 6 }}>
          {CATS.filter(([id]) => id === 'tout' || a.options.some(o => o.cat === id)).map(([id, l]) => (
            <button key={id} onClick={() => setCat(id)} style={{ flexShrink: 0, border: 'none', borderRadius: 99, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
              background: cat === id ? T.accent : 'var(--dz-card)', color: cat === id ? '#fff' : T.text }}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {opts.map(o => (
            <div key={o.id} onClick={() => toggle(o.id)} role="button" style={{ ...glass(tried[o.id] ? T.ok : undefined), borderRadius: 18, padding: '12px 14px', cursor: 'pointer', opacity: tried[o.id] ? 0.85 : 1 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{o.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: T.text, fontWeight: 600 }}><span style={{ color: T.faint }}>{a.options.indexOf(o) + 1}. </span>Si {o.si.charAt(0).toLowerCase() + o.si.slice(1)}</div>
                  <div style={{ fontSize: 14, color: T.ok, fontWeight: 700, marginTop: 4 }}>→ {o.alors}</div>
                  {o.auLieu && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2 }}>au lieu de {o.auLieu}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {o.gain && <Badge color={T.ok}>{o.gain}</Badge>}
                    <Badge color={o.effort === 1 ? T.accent : o.effort === 2 ? T.warn : T.bad}>{EFFORT[o.effort]}</Badge>
                    {tried[o.id] && <Badge color={T.ok} solid>✓ Engagé depuis le {tried[o.id]!.at.slice(8, 10)}/{tried[o.id]!.at.slice(5, 7)}</Badge>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: T.faint, textAlign: 'center', marginBottom: 24 }}>Touche une option pour t'engager : Dzaryx s'en souvient et t'encourage dessus. Sur Telegram : « je m'engage sur la 3 ».</div>
      </>}
    </Screen>
  );
}
