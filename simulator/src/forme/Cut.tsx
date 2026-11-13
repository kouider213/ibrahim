import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { get, forme, errText, vibrate } from './api.ts';
import { F, card, darkCard, btn, ghostBtn, input, Ring, Bar, LineChart, Spinner } from './ui.tsx';

// 🔪 SÈCHE (Kouider 01/11) — remplace « Course » pour lui seul (son ami garde Course). Musculation + sèche, le meilleur de
// 20 applis (MacroFactor, Happy Scale, RP Diet, Carbon, Hevy, Strong, Alpha Progression, Whoop, Gravl, Fitbod…), calculé
// sur ses vraies données par /api/forme/cut (backend forme-cut.ts), sans IA.
export interface Cut {
  today: string; start: string; weeksIn: number; deficit: number;
  weight: { current: number; trend?: number; last: { date: string; kg: number } | null; goalKg: number | null; toLose: number; eta: string | null; rateWeek: number | null; ratePct: number | null; points: Array<{ date: string; kg: number; trend: number }>; loggedToday: boolean };
  adaptive: { tdee: number; vsWatch: number; days: number } | null; avgEaten: number | null; avgBurnWatch: number | null;
  week: Array<{ date: string; logged: boolean; deficitOk: boolean; proteinOk: boolean }>;
  lifts: Array<{ name: string; now: number; before: number | null; pct: number | null; date: string }>; dropping: string[];
  score: number; parts: Array<{ k: string; ok: boolean; pts: number; hint: string }>;
  decision: { text: string; deficit: number | null; level: 'ok' | 'up' | 'down' | 'wait' | 'break' };
  waist: Array<{ date: string; cm: number }>; protein: { goal: number; perKg: number };
  fat?: { pct: number; fatKg: number; leanKg: number; absKg: number; atFloorPct: number | null; absEta: string | null; neck: number } | null; neck?: number | null;
}
const H2 = ({ children }: { children: string }) => <div style={{ fontSize: 19, fontWeight: 700, margin: '22px 2px 10px' }}>{children}</div>;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dow = (d: string) => 'DLMMJVS'[new Date(`${d}T12:00:00Z`).getUTCDay()];

export default function CutScreen({ toast }: { toast: (t: string) => void }) {
  const [c, setC] = useState<Cut | null>(null);
  const [err, setErr] = useState('');
  const [kg, setKg] = useState('');
  const [cm, setCm] = useState('');
  const [neck, setNeck] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => get<Cut>('/api/forme/cut').then(setC).catch(e => setErr(errText(e)));
  useEffect(() => { void load(); }, []);

  const logW = async () => {
    const v = Number(kg.replace(',', '.')); if (!(v > 30 && v < 250)) return toast('Poids invalide');
    setBusy(true); try { await forme.log('weight', { kg: v }); setKg(''); vibrate(40); toast('⚖️ Pesée notée'); await load(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const logWaist = async () => {
    const v = Number(cm.replace(',', '.')); if (!(v > 40 && v < 200)) return toast('Tour de taille invalide');
    setBusy(true); try { await forme.log('measures', { measures: { taille: v } }); setCm(''); toast('📏 Tour de taille noté'); await load(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const logNeck = async () => {
    const v = Number(neck.replace(',', '.')); if (!(v > 25 && v < 60)) return toast('Tour de cou invalide (cm)');
    setBusy(true); try { await forme.log('measures', { measures: { cou: v } }); setNeck(''); toast('📏 Tour de cou noté'); await load(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const apply = async (d: number) => {
    setBusy(true);
    try { await forme.cutApply(d); toast(d ? `✅ Nouveau déficit : ${d} kcal/jour` : '✅ Semaine au maintien'); await load(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };

  if (!c) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>{err ? <div style={{ color: F.red }}>{err}</div> : <Spinner />}</div>;
  const w = c.weight;
  const sc = c.score >= 80 ? F.green : c.score >= 55 ? F.gold : F.red;
  const rateColor = w.ratePct == null ? F.muted : w.ratePct > 1.1 ? F.red : w.ratePct < 0.25 ? F.gold : F.green;
  const lvl = { ok: ['✅', F.green], up: ['🍽️', F.gold], down: ['📉', F.blue], wait: ['⏳', F.muted], break: ['🛑', F.violet] }[c.decision.level];

  return (
    <div style={{ padding: '0 14px', overflowX: 'hidden' }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', padding: '4px 2px' }}>Sèche</div>
      <div style={{ fontSize: 14, color: F.muted, margin: '0 2px 14px', lineHeight: 1.4 }}>Perdre le gras, garder (et monter) le muscle. Semaine {c.weeksIn + 1} · déficit {c.deficit} kcal/jour · {c.protein.goal} g de protéines ({c.protein.perKg} g/kg).</div>

      {/* Score du jour */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ ...darkCard, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Ring value={c.score} max={100} size={112} stroke={11} color={sc}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 30, fontWeight: 800 }}>{c.score}</div><div style={{ fontSize: 11, opacity: 0.7 }}>/ 100</div></div></Ring>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 5 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Ta journée de sèche</div>
          {c.parts.map(p => <div key={p.k} style={{ display: 'flex', gap: 6, fontSize: 12.5, alignItems: 'baseline' }}><span>{p.ok ? '✅' : '⬜'}</span><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{p.k}</span><span style={{ opacity: 0.65, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.hint}</span></div>)}
        </div>
      </motion.div>

      {/* Bilan / décision */}
      <div style={{ ...card, marginTop: 12, borderLeft: `4px solid ${lvl[1]}` }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{lvl[0]} Bilan de la semaine</div>
        <div style={{ fontSize: 14, lineHeight: 1.45 }}>{c.decision.text}</div>
        {c.decision.deficit != null && c.decision.deficit !== c.deficit && <button disabled={busy} onClick={() => void apply(c.decision.deficit!)} style={{ ...btn, marginTop: 10, width: '100%' }}>{c.decision.deficit ? `Appliquer : déficit ${c.decision.deficit} kcal` : 'Passer 1 semaine au maintien'}</button>}
        {c.decision.level === 'break' && c.deficit === 0 && <button disabled={busy} onClick={() => void apply(500)} style={{ ...ghostBtn, marginTop: 10, width: '100%' }}>Reprendre la sèche (500 kcal)</button>}
      </div>

      {/* Poids tendance */}
      <H2>Poids</H2>
      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* 02/11 : il se pèse 79,4 et voyait 80,1 (la tendance) en gros → le gros chiffre = SA pesée, la tendance en dessous */}
          <div><div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>{w.last?.kg ?? w.current}<span style={{ fontSize: 16, color: F.muted }}> kg</span></div><div style={{ fontSize: 12, color: F.muted }}>{w.last ? `pesée du ${fmt(w.last.date)} · tendance ${w.trend ?? w.current} kg (moyenne qui ignore l'eau du jour)` : 'tendance lissée'}</div></div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: rateColor }}>{w.rateWeek != null ? `${w.rateWeek > 0 ? '−' : '+'}${String(Math.abs(w.rateWeek)).replace('.', ',')} kg/sem` : '—'}</div>
            <div style={{ fontSize: 12, color: F.muted }}>{w.ratePct != null ? `${w.ratePct} %/sem · zone sûre 0,5-1 %` : '5 pesées sur 7 j pour la vitesse'}</div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><LineChart points={w.points.map(p => ({ x: p.date, y: p.kg ?? p.trend }))} trend={w.points.map(p => ({ x: p.date, y: p.trend }))} goal={w.goalKg ?? undefined} color={F.violet} digits={1} forecast={w.eta && w.goalKg ? { x: w.eta, y: w.goalKg } : null} /></div>
        {w.goalKg && <div style={{ marginTop: 6 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span>Objectif {w.goalKg} kg · encore {Math.max(0, Math.round(((w.last?.kg ?? w.current) - w.goalKg) * 10) / 10)} kg</span><b>{w.eta ? `vers le ${fmt(w.eta)}` : ''}</b></div><Bar value={Math.max(0, (w.points[0]?.trend ?? w.current) - w.current)} max={Math.max(0.1, (w.points[0]?.trend ?? w.current) - w.goalKg)} color={F.violet} track={F.bg2} /></div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={kg} onChange={e => setKg(e.target.value)} inputMode="decimal" placeholder={w.loggedToday ? 'Déjà pesé aujourd\'hui ✓' : 'Poids ce matin (kg)'} style={{ ...input, flex: 1 }} />
          <button disabled={busy || !kg} onClick={() => void logW()} style={{ ...btn, padding: '12px 18px' }}>⚖️</button>
        </div>
        <div style={{ fontSize: 12, color: F.muted, marginTop: 6 }}>Le matin, à jeun, après les toilettes. Le chiffre de la balance saute de ±1 kg (eau, sel) : on suit la tendance.</div>
      </div>

      {/* Vraie dépense */}
      <H2>Ta vraie dépense</H2>
      <div style={card}>
        {c.adaptive ? <>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{c.adaptive.tdee} <span style={{ fontSize: 15, color: F.muted }}>kcal/jour</span></div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 4 }}>Calculée sur {c.adaptive.days} jours : ce que tu as VRAIMENT mangé ({c.avgEaten} kcal en moyenne) + ce que ton poids a vraiment fait. Ta montre dit {c.avgBurnWatch} kcal → elle {c.adaptive.vsWatch >= 0 ? 'sous-estime' : 'surestime'} de {Math.abs(c.adaptive.vsWatch)} kcal.</div>
        </> : <div style={{ fontSize: 14, lineHeight: 1.45 }}>🧮 Après <b>10 jours de repas notés</b> + tes pesées, je calcule ta dépense RÉELLE (pas celle de la montre, qui se trompe souvent de 10-20 %) et j'ajuste ton objectif dessus. {c.avgBurnWatch ? `Pour l'instant : montre ≈ ${c.avgBurnWatch} kcal/jour.` : ''}</div>}
      </div>

      {/* 7 jours */}
      <H2>7 derniers jours</H2>
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {c.week.map(d => <div key={d.date} style={{ display: 'grid', gap: 4, fontSize: 11.5 }}>
          <div style={{ color: F.muted, fontWeight: 600 }}>{dow(d.date)}</div>
          <div title="Déficit" style={{ height: 26, borderRadius: 8, background: !d.logged ? F.bg2 : d.deficitOk ? '#d8f3e4' : '#fde2e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!d.logged ? '·' : d.deficitOk ? '🔥' : '✕'}</div>
          <div title="Protéines" style={{ height: 26, borderRadius: 8, background: !d.logged ? F.bg2 : d.proteinOk ? '#dfe8ff' : '#fff1d6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!d.logged ? '·' : d.proteinOk ? '🥩' : '—'}</div>
        </div>)}
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: F.muted, marginTop: 4 }}>🔥 déficit tenu · 🥩 protéines ≥ 90 % · « · » = repas pas notés</div>
      </div>

      {/* Force */}
      <H2>Ta force pendant la sèche</H2>
      <div style={card}>
        {c.lifts.length ? c.lifts.map(l => <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${F.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div><div style={{ fontSize: 12, color: F.muted }}>1RM estimé · {fmt(l.date)}</div></div>
          <div style={{ fontWeight: 800 }}>{l.now} kg</div>
          <div style={{ minWidth: 62, textAlign: 'right', fontSize: 13, fontWeight: 700, color: l.pct == null ? F.muted : l.pct <= -5 ? F.red : l.pct >= 0 ? F.green : F.gold }}>{l.pct == null ? 'nouveau' : `${l.pct > 0 ? '+' : ''}${l.pct} %`}</div>
        </div>) : <div style={{ fontSize: 14, color: F.muted }}>Note tes séries (kg × reps) pendant la séance : je surveille que tu ne perds pas de force.</div>}
        <div style={{ fontSize: 12, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>En sèche, garder ses charges = garder son muscle. Si un exo baisse de plus de 5 % en 2 semaines, je te le dis et on ajuste.</div>
      </div>

      {/* Tour de taille */}
      <H2>Tour de taille</H2>
      <div style={card}>
        {c.waist.length >= 2 ? <LineChart points={c.waist.map(x => ({ x: x.date, y: x.cm }))} unit="cm" color={F.green} /> : <div style={{ fontSize: 14, color: F.muted }}>{c.waist.length ? `${c.waist[0]!.cm} cm le ${fmt(c.waist[0]!.date)}.` : ''} Mesure-le 1 fois par semaine au nombril : c'est LE chiffre qui prouve que tu perds du gras et pas du muscle.</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={cm} onChange={e => setCm(e.target.value)} inputMode="decimal" placeholder="Tour de taille (cm)" style={{ ...input, flex: 1 }} />
          <button disabled={busy || !cm} onClick={() => void logWaist()} style={{ ...btn, padding: '12px 18px' }}>📏</button>
        </div>
      </div>

      {/* 13/11 : % de graisse (US Navy) + quand les abdos se voient */}
      <H2>Gras & abdos</H2>
      <div style={card}>
        {c.fat ? <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{String(c.fat.pct).replace('.', ',')} <span style={{ fontSize: 16, color: F.muted }}>% de gras</span></div>
            <div style={{ fontSize: 13, color: F.muted }}>{String(c.fat.fatKg).replace('.', ',')} kg de gras · {String(c.fat.leanKg).replace('.', ',')} kg de muscle, os, eau</div>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${F.green} 0%, ${F.green} 24%, #f5c542 24%, #f5c542 40%, #f08a5d 40%)`, position: 'relative', marginTop: 12 }}>
            <div style={{ position: 'absolute', left: `${Math.min(98, Math.max(0, c.fat.pct / 50 * 100))}%`, top: -4, width: 4, height: 18, borderRadius: 2, background: F.ink }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: F.muted, marginTop: 4 }}><span>abdos visibles ≤ 12 %</span><span>20 %</span><span>50 %</span></div>
          <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 10 }}>
            {c.fat.pct <= 12 ? '🔥 Abdos visibles : tu y es. Maintenant on construit (pecs, bras) sans reprendre de gras.'
              : c.fat.atFloorPct != null ? <>🎯 À <b>75 kg</b> (ton plancher) tu seras vers <b>{String(c.fat.atFloorPct).replace('.', ',')} %</b>. Pour descendre à 12 % sans passer sous 75 kg : <b>recomposition</b> — muscle en plus, gras en moins, à poids stable.</>
              : <>🎯 Abdos visibles (~12 %) vers <b>{String(c.fat.absKg).replace('.', ',')} kg</b>{c.fat.absEta ? <> — à ton rythme, vers le <b>{fmt(c.fat.absEta)}</b></> : ''}, si tu gardes tes charges.</>}
          </div>
          <div style={{ fontSize: 11.5, color: F.muted, marginTop: 6 }}>Estimation méthode US Navy (taille + cou + hauteur), précision ±3 %. Mesure taille au nombril, cou sous la pomme d'Adam.</div>
        </> : <div style={{ fontSize: 14, color: F.muted, lineHeight: 1.45 }}>{c.waist.length ? 'Il me manque ton tour de cou (sous la pomme d\'Adam) pour calculer ton % de gras et la date de tes abdos visibles.' : 'Note ton tour de taille ci-dessus et ton tour de cou ici : je calcule ton % de gras et quand tes abdos se verront.'}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={neck} onChange={e => setNeck(e.target.value)} inputMode="decimal" placeholder={c.neck ? `Tour de cou (dernier : ${c.neck} cm)` : 'Tour de cou (cm)'} style={{ ...input, flex: 1 }} />
          <button disabled={busy || !neck} onClick={() => void logNeck()} style={{ ...btn, padding: '12px 18px' }}>📏</button>
        </div>
      </div>

      {/* Règles */}
      <H2>Les 5 règles de ta sèche</H2>
      <div style={{ ...card, display: 'grid', gap: 8, fontSize: 14, lineHeight: 1.4 }}>
        <div>🏋️ <b>Charges lourdes</b> : garde tes poids, baisse le nombre de séries si tu es fatigué, jamais la charge.</div>
        <div>🥩 <b>{c.protein.goal} g de protéines</b> par jour, réparties sur 3-4 repas.</div>
        <div>🚶 <b>8 000 pas minimum</b> : c'est ce qui brûle le plus sans fatiguer tes séances.</div>
        <div>😴 <b>7 h de sommeil</b> : moins = plus de faim et moins de muscle.</div>
        <div>📸 <b>Photo de chaque repas</b> : sans ça, impossible de savoir ta vraie dépense.</div>
      </div>
    </div>
  );
}
