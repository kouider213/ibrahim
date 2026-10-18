import { useState, useEffect, useCallback, useRef } from 'react';
import { business, type CoachOverview } from '../../services/api.ts';
import { SkeletonCards } from '../ui/Premium.tsx';
import SportScreen from './SportScreen.tsx';

// « COACH » : tous les coachs de Dzaryx au même endroit — 🏋️ sport (séances de l'agenda, mode séance),
// 🧠 mental (objectif du jour, humeur, respiration guidée, gratitude, coucher — aussi dans l'agenda) et 🎮 progrès (points, niveaux, badges, quêtes, courbes des charges et du poids).
// Chaque action cochée rapporte des points : le jeu est recalculé par le serveur depuis l'historique.

const C = {
  surface: '#0c1730', border: 'rgba(90,150,255,0.16)', accent: '#fb7185', cyan: '#38d8f5', gold: '#fbbf24', green: '#34d399', violet: '#a78bfa',
  text: '#f5f5f7', muted: '#8ea3c8', font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 } as const;
const btn = (bg: string, color = '#050a16') => ({ background: bg, color, border: 'none', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const ghost = { ...btn('rgba(255,255,255,0.06)', C.text), border: `1px solid ${C.border}` } as const;
const h = (t: string, color = C.accent) => <div style={{ fontFamily: 'Orbitron', fontSize: 9.5, letterSpacing: '0.26em', color, fontWeight: 600, margin: '16px 2px 10px' }}>{t}</div>;
const errText = (e: unknown) => { const m = e instanceof Error ? e.message : 'Erreur'; try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; } };
const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
function speak(text: string) { try { const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* */ } }

// Pas d'onglet nutrition : Kouider n'en veut pas (2026-10-18).
type Tab = 'sport' | 'mind' | 'game';
const TABS: Array<{ id: Tab; label: string; color: string }> = [
  { id: 'sport', label: '🏋️ Sport', color: C.accent },
  { id: 'mind', label: '🧠 Mental', color: C.violet }, { id: 'game', label: '🎮 Progrès', color: C.gold },
];

export default function CoachScreen() {
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('dz:coach:tab') as Tab; return TABS.some(x => x.id === t) ? t : 'sport'; } catch { return 'sport'; } });
  const [data, setData] = useState<CoachOverview | null>(null);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [pop, setPop] = useState<{ text: string; key: number } | null>(null);
  const load = useCallback(() => business.coach().then(setData).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { try { localStorage.setItem('dz:coach:tab', tab); } catch { /* */ } if (tab !== 'sport') void load(); }, [tab, load]);

  // Toute action renvoie l'écran à jour + les points gagnés → petite animation « +10 pts »
  const run = useCallback(async (p: Promise<CoachOverview>) => {
    try {
      const prev = data?.game.level;
      const r = await p; setData(r);
      if (r.gained) {
        try { navigator.vibrate?.(40); } catch { /* */ }
        setPop({ text: r.game.level > (prev ?? r.game.level) ? `🎉 NIVEAU ${r.game.level} — ${r.game.title} !` : `+${r.gained} pts`, key: Date.now() });
        if (r.game.level > (prev ?? r.game.level)) speak(`Bravo ! Niveau ${r.game.level}, ${r.game.title}.`);
      }
      return r;
    } catch (e) { alert(errText(e)); return null; }
  }, [data]);
  useEffect(() => { if (!pop) return; const t = setTimeout(() => setPop(null), 1800); return () => clearTimeout(t); }, [pop]);

  const g = data?.game;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(120% 50% at 50% 0%, #2a0b1d 0%, #050a16 55%)', color: C.text, fontFamily: C.font }}>
      {!live && (
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} onClick={() => setTab('game')}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(140deg, #fbbf24, #fb7185)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#1a0710', flexShrink: 0 }}>
              <div style={{ fontSize: 8.5, fontWeight: 900 }}>NIV.</div><div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1 }}>{g?.level ?? '–'}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.24em', color: C.accent }}>COACH DZARYX</div>
              <div style={{ fontSize: 17, fontWeight: 900 }}>{g ? g.title : 'Chargement…'} <span style={{ fontSize: 12, color: C.gold }}>{g ? `${g.total.toLocaleString('fr-FR')} pts` : ''}</span></div>
              <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginTop: 5, overflow: 'hidden' }}>
                <div style={{ width: `${g?.pct ?? 0}%`, height: '100%', background: 'linear-gradient(90deg, #fbbf24, #fb7185)', borderRadius: 4, transition: 'width .6s' }} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{g ? `Aujourd'hui +${g.today} pts · ${g.next - g.total} pts avant le niveau ${g.level + 1}${g.streakDays > 1 ? ` · 🔥 ${g.streakDays} jours actifs` : ''}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, 1fr)`, gap: 5, marginTop: 12 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ ...ghost, padding: '9px 2px', fontSize: 11.5, background: tab === t.id ? t.color : 'rgba(255,255,255,0.05)', color: tab === t.id ? '#050a16' : C.text, border: `1px solid ${tab === t.id ? t.color : C.border}` }}>{t.label}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: tab === 'sport' ? 'hidden' : 'auto' }}>
        {tab === 'sport' && <SportScreen embedded onLive={setLive} />}
        {tab !== 'sport' && err && <div style={{ ...card, margin: 14, color: '#f87171' }}>❌ {err}</div>}
        {tab !== 'sport' && !data && !err && <div style={{ padding: 14 }}><SkeletonCards count={4} height={80} /></div>}
        {tab === 'mind' && data && <MindTab d={data} run={run} />}
        {tab === 'game' && data && <GameTab d={data} run={run} />}
      </div>
      {pop && <div key={pop.key} style={{ position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 80, pointerEvents: 'none',
        fontSize: pop.text.startsWith('🎉') ? 22 : 30, fontWeight: 900, color: C.gold, textShadow: '0 0 20px rgba(251,191,36,0.7)', animation: 'dzPop 1.8s ease-out forwards', whiteSpace: 'nowrap' }}>{pop.text}</div>}
      <style>{`@keyframes dzPop { 0% { opacity: 0; transform: translate(-50%, -30%) scale(.6) } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1) } 70% { opacity: 1 } 100% { opacity: 0; transform: translate(-50%, -110%) scale(1) } }`}</style>
    </div>
  );
}

type Run = (p: Promise<CoachOverview>) => Promise<CoachOverview | null>;

// ── 🧠 MENTAL ────────────────────────────────────────────────────────────────

const MOODS = ['😫', '😣', '😞', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩'];
const BREATH = [{ t: 'Inspire', s: 4 }, { t: 'Bloque', s: 4 }, { t: 'Expire', s: 4 }, { t: 'Bloque', s: 4 }];

function MindTab({ d, run }: { d: CoachOverview; run: Run }) {
  const [grat, setGrat] = useState('');
  const [busy, setBusy] = useState(false);
  const gen = async (day: 'today' | 'tomorrow') => { setBusy(true); await run(business.coachGenerate(day)); setBusy(false); };
  const [breath, setBreath] = useState<{ start: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const sent = useRef(false);
  const todayMood = d.evolution.moods.find(m => m.date === d.today)?.mood ?? null;
  const CYCLES = 4, total = CYCLES * 16;
  useEffect(() => { if (!breath) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, [breath]);
  const el = breath ? (now - breath.start) / 1000 : 0;
  const phase = BREATH[Math.floor(el / 4) % 4]!;
  const phaseIdx = Math.floor(el / 4);
  useEffect(() => { if (breath && el < total) speak(phase.t); }, [phaseIdx]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (breath && el >= total && !sent.current) { sent.current = true; setBreath(null); speak('Bravo. Tu es calme et prêt.'); void run(business.coachCheck('breath')); }
  }, [el, breath, total, run]);
  const scale = !breath ? 0.6 : phase.t === 'Inspire' ? 0.6 + 0.4 * ((el % 4) / 4) : phase.t === 'Expire' ? 1 - 0.4 * ((el % 4) / 4) : phaseIdx % 4 === 1 ? 1 : 0.6;

  return (
    <div style={{ padding: '4px 14px 30px' }}>
      {h('OBJECTIF DU JOUR', C.violet)}
      <div style={{ ...card, background: 'linear-gradient(150deg, #24154a, #0c1730 70%)', borderColor: `${C.violet}55` }}>
        {d.day ? <>
          <div style={{ fontSize: 18, fontWeight: 900 }}>🎯 {d.day.mental.goal}</div>
          <div style={{ fontSize: 13, color: '#d5c8ff', marginTop: 8, lineHeight: 1.5 }}>✨ {d.day.mental.action}</div>
        </> : <>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Ton objectif du jour n'est pas encore prêt.</div>
          <button style={{ ...btn(C.violet), width: '100%' }} disabled={busy} onClick={() => void gen('today')}>{busy ? '⏳ Dzaryx prépare ta journée…' : '✨ Préparer ma journée (objectif + coucher)'}</button>
        </>}
      </div>
      {d.day && <div style={card}><div style={{ fontSize: 14, fontWeight: 800 }}>😴 Au lit à {d.day.sleep.time.replace(':', 'h')}</div><div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{d.day.sleep.why}</div></div>}
      {d.day && <button style={{ ...ghost, width: '100%', marginBottom: 4 }} disabled={busy} onClick={() => void gen('today')}>{busy ? '⏳…' : '🔄 Refaire ma journée (et l\'agenda)'}</button>}

      {h('COMMENT TU TE SENS ? (+15 PTS)', C.violet)}
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {MOODS.map((m, i) => (
            <button key={i} onClick={() => void run(business.coachCheck('mood', i + 1))} style={{ ...ghost, padding: '8px 0', fontSize: 22,
              background: todayMood === i + 1 ? C.violet : 'rgba(255,255,255,0.05)' }}>{m}<div style={{ fontSize: 10, fontWeight: 800, color: todayMood === i + 1 ? '#050a16' : C.muted }}>{i + 1}</div></button>
          ))}
        </div>
        {todayMood != null && todayMood <= 4 && <div style={{ fontSize: 12, color: '#d5c8ff', marginTop: 10, lineHeight: 1.5 }}>
          Merci de me l'avoir dit. Parle-moi dans le chat ou appelle-moi, je suis là. Et si c'est lourd, tu peux appeler gratuitement le 0800 32 123 (24 h/24) ou ton médecin.</div>}
        {d.evolution.moods.length > 1 && <div style={{ marginTop: 12 }}><LineChart points={d.evolution.moods.slice(-30).map(m => ({ x: m.date, y: m.mood }))} color={C.violet} unit="/10" min={1} max={10} /></div>}
      </div>

      {h('RESPIRATION GUIDÉE (+15 PTS)', C.violet)}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 170, height: 170, borderRadius: '50%', transform: `scale(${scale})`, transition: 'transform .25s linear',
            background: `radial-gradient(circle, ${C.violet}cc, ${C.cyan}33 70%)`, boxShadow: `0 0 40px ${C.violet}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, transform: `scale(${1 / scale})` }}>{breath ? phase.t : '🌬️'}</div>
          </div>
        </div>
        {breath ? <div style={{ fontSize: 12, color: C.muted }}>Cycle {Math.min(CYCLES, Math.floor(el / 16) + 1)}/{CYCLES} · {Math.max(0, Math.ceil(total - el))} s</div>
          : <button style={{ ...btn(C.violet), width: '100%' }} onClick={() => { sent.current = false; setBreath({ start: Date.now() }); }}>▶ 1 minute de respiration carrée</button>}
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>4 s inspire · 4 s bloque · 4 s expire · 4 s bloque — idéal avant la salle, un RDV ou pour dormir.</div>
      </div>

      {h('3 CHOSES POSITIVES AUJOURD\'HUI (+10 PTS CHACUNE)', C.violet)}
      <div style={card}>
        {d.checks.gratitude.map((t, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>🙏 {t}</div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <input value={grat} onChange={e => setGrat(e.target.value)} placeholder="Ex. mon fils a rigolé ce matin"
            style={{ flex: 1, background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontFamily: C.font }} />
          <button style={btn(C.violet)} disabled={!grat.trim()} onClick={() => { void run(business.coachCheck('gratitude', grat)); setGrat(''); }}>+</button>
        </div>
      </div>
    </div>
  );
}

// ── 🎮 PROGRÈS ───────────────────────────────────────────────────────────────

function GameTab({ d, run }: { d: CoachOverview; run: Run }) {
  const g = d.game;
  const exIds = Object.keys(d.evolution.exercises);
  const [ex, setEx] = useState(exIds[0] ?? '');
  const [kg, setKg] = useState('');
  const [target, setTarget] = useState(d.evolution.target ? String(d.evolution.target) : '');
  const series = d.evolution.exercises[ex];
  const w = d.evolution.weights;
  const weighedToday = w.some(x => x.date === d.today);
  return (
    <div style={{ padding: '4px 14px 30px' }}>
      {h('QUÊTES DE LA SEMAINE', C.gold)}
      <div style={card}>
        {g.quests.map(q => (
          <div key={q.name} style={{ margin: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{q.done ? '✅' : q.icon} {q.name}</span><b style={{ color: q.done ? C.green : C.gold }}>{q.done ? 'réussie' : `${q.have}/${q.need}`} · +{q.xp}</b>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginTop: 5 }}>
              <div style={{ width: `${Math.min(100, q.have / q.need * 100)}%`, height: '100%', borderRadius: 3, background: q.done ? C.green : C.gold }} />
            </div>
          </div>
        ))}
      </div>

      {h('MON POIDS (+15 PTS PAR PESÉE)', C.gold)}
      <div style={card}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder={last(w) ? `${last(w)!.kg} kg` : 'ton poids en kg'}
            style={{ flex: 1, background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 11, fontSize: 15, fontFamily: C.font }} />
          <button style={btn(C.gold)} disabled={!kg} onClick={() => { const v = parseFloat(kg.replace(',', '.')); if (v > 30) { void run(business.coachWeight(v)); setKg(''); } }}>⚖️ Noter{weighedToday ? '' : ' +15'}</button>
        </div>
        {w.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted, margin: '10px 0 4px' }}>
          <span>Dernière pesée : <b style={{ color: C.text }}>{last(w)!.kg} kg</b> ({dm(last(w)!.date)})</span>
          {w.length > 1 && <span>{(last(w)!.kg - w[0]!.kg) >= 0 ? '+' : ''}{(last(w)!.kg - w[0]!.kg).toFixed(1)} kg depuis le {dm(w[0]!.date)}</span>}
        </div>}
        {w.length > 1 ? <LineChart points={w.map(x => ({ x: x.date, y: x.kg }))} color={C.gold} unit=" kg" target={d.evolution.target} /> : <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Note ton poids 2 fois pour voir ta courbe.</div>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: C.muted }}>🎯 Objectif</span>
          <input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="kg"
            style={{ width: 80, background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, fontSize: 13, fontFamily: C.font }} />
          <button style={{ ...ghost, padding: '8px 12px', fontSize: 12 }} onClick={() => void run(business.coachTarget(parseFloat(target.replace(',', '.')) || null))}>Enregistrer</button>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>Les points récompensent la régularité de la pesée, pas les kilos : on avance doucement et sainement.</div>
      </div>

      {h('CHARGES SOULEVÉES', C.gold)}
      <div style={card}>
        {exIds.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Termine une séance en mode séance (onglet Sport) : chaque exercice aura sa courbe de progression ici.</div> : <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
            {exIds.map(id => <button key={id} onClick={() => setEx(id)} style={{ ...ghost, flexShrink: 0, padding: '6px 10px', fontSize: 11.5,
              background: ex === id ? C.gold : 'rgba(255,255,255,0.05)', color: ex === id ? '#050a16' : C.text }}>{d.evolution.exercises[id]!.name}</button>)}
          </div>
          {series && <>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{series.points.length > 1
              ? <>De <b style={{ color: C.text }}>{series.points[0]!.kg} kg</b> à <b style={{ color: C.text }}>{last(series.points)!.kg} kg</b> ({last(series.points)!.kg - series.points[0]!.kg >= 0 ? '+' : ''}{(last(series.points)!.kg - series.points[0]!.kg).toFixed(1)} kg)</>
              : <>Première fois : <b style={{ color: C.text }}>{series.points[0]!.kg} kg</b></>}</div>
            <LineChart points={series.points.map(p => ({ x: p.date, y: p.kg }))} color={C.accent} unit=" kg" />
          </>}
        </>}
      </div>

      {h(`BADGES · ${g.badges.filter(b => b.ok).length}/${g.badges.length}`, C.gold)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {g.badges.map(b => (
          <div key={b.id} title={b.how} style={{ ...card, marginBottom: 0, padding: '10px 4px', textAlign: 'center', opacity: b.ok ? 1 : 0.38, filter: b.ok ? 'none' : 'grayscale(1)', borderColor: b.ok ? `${C.gold}88` : C.border }}>
            <div style={{ fontSize: 26 }}>{b.icon}</div>
            <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 3, lineHeight: 1.15 }}>{b.name}</div>
            <div style={{ fontSize: 8.5, color: C.muted, marginTop: 2, lineHeight: 1.15 }}>{b.how}</div>
          </div>
        ))}
      </div>

      {h('DERNIERS POINTS GAGNÉS', C.gold)}
      <div style={card}>
        {g.feed.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>Termine une séance, respire ou note ton humeur : tes premiers points arrivent ici.</div>
          : g.feed.map((f, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderTop: i ? `1px solid ${C.border}` : 'none' }}>
            <span>{f.label} <span style={{ color: C.muted, fontSize: 10.5 }}>{dm(f.date)}</span></span><b style={{ color: C.gold }}>+{f.xp}</b></div>)}
      </div>

      {h('BARÈME DES POINTS', C.gold)}
      <div style={{ ...card, fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
        🏋️ Séance terminée <b style={{ color: C.text }}>+{g.xpRules['session']}</b> · série cochée <b style={{ color: C.text }}>+{g.xpRules['set']}</b> · record <b style={{ color: C.text }}>+{g.xpRules['pr']}</b> · arrivé à la salle <b style={{ color: C.text }}>+{g.xpRules['arrival']}</b> · 3 séances d'affilée <b style={{ color: C.text }}>+{g.xpRules['streak']}</b><br />
        ⚖️ pesée <b style={{ color: C.text }}>+{g.xpRules['weigh']}</b><br />
        🧠 Humeur <b style={{ color: C.text }}>+{g.xpRules['mood']}</b> · 🌬️ respiration <b style={{ color: C.text }}>+{g.xpRules['breath']}</b> · 🙏 gratitude <b style={{ color: C.text }}>+{g.xpRules['gratitude']}</b> · ⭐ journée parfaite <b style={{ color: C.text }}>+{g.xpRules['perfect']}</b> · badge <b style={{ color: C.text }}>+{g.xpRules['badge']}</b>
      </div>
    </div>
  );
}

/** Courbe simple (une série), points survolables. */
function LineChart({ points, color, unit, min, max, target }: { points: Array<{ x: string; y: number }>; color: string; unit: string; min?: number; max?: number; target?: number | null }) {
  const W = 320, H = 130, P = { l: 30, r: 8, t: 10, b: 20 };
  const ys = points.map(p => p.y).concat(target ? [target] : []);
  let lo = min ?? Math.min(...ys), hi = max ?? Math.max(...ys);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const xAt = (i: number) => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : i / (points.length - 1) * (W - P.l - P.r));
  const yAt = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {[lo, (lo + hi) / 2, hi].map((v, i) => <g key={i}><line x1={P.l} x2={W - P.r} y1={yAt(v)} y2={yAt(v)} stroke="rgba(255,255,255,0.07)" />
        <text x={P.l - 4} y={yAt(v) + 3} textAnchor="end" fontSize="9" fill={C.muted}>{fmt(v)}</text></g>)}
      {target && <g><line x1={P.l} x2={W - P.r} y1={yAt(target)} y2={yAt(target)} stroke={C.green} strokeDasharray="4 4" strokeWidth="1.5" />
        <text x={W - P.r} y={yAt(target) - 4} textAnchor="end" fontSize="9" fill={C.green}>objectif {fmt(target)}{unit}</text></g>}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={xAt(i)} cy={yAt(p.y)} r={4} fill={color} stroke="#0c1730" strokeWidth="2"><title>{dm(p.x)} : {fmt(p.y)}{unit}</title></circle>)}
      <text x={P.l} y={H - 5} fontSize="9" fill={C.muted}>{dm(points[0]!.x)}</text>
      {points.length > 1 && <text x={W - P.r} y={H - 5} textAnchor="end" fontSize="9" fill={C.muted}>{dm(last(points)!.x)}</text>}
    </svg>
  );
}
