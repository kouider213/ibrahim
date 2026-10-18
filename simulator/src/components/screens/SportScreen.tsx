import { useState, useEffect, useRef, useCallback } from 'react';
import { business, type SportOverview, type SportSession, type SportExercise, type SportType } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards } from '../ui/Premium.tsx';

// « SPORT » : le coach sportif de Dzaryx dans la poche, à la salle. Séance du jour (calée sur l'agenda FIK),
// MODE SÉANCE plein écran (séries cochées, charges pré-remplies + progression, minuteur de repos qui parle et vibre,
// exercice de remplacement si la machine est prise, écran qui reste allumé), semaine modifiable, récupération des
// muscles, records et réglages des rappels (appel + point GPS au départ, « tu as oublié ? » si le GPS est loin).

const C = {
  surface: '#0c1730', border: 'rgba(90,150,255,0.16)', accent: '#fb7185', cyan: '#38d8f5', gold: '#fbbf24', green: '#34d399',
  text: '#f5f5f7', muted: '#8ea3c8', font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, marginBottom: 12 } as const;
const btn = (bg: string, color = '#050a16') => ({ background: bg, color, border: 'none', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: C.font } as const);
const ghost = { ...btn('rgba(255,255,255,0.06)', C.text), border: `1px solid ${C.border}` } as const;
const section = (t: string) => <div style={{ fontFamily: 'Orbitron', fontSize: 13, letterSpacing: '0.28em', color: C.accent, fontWeight: 600, margin: '18px 2px 10px' }}>{t}</div>;
const MUSCLE: Record<string, string> = { pecs: 'Pecs', dos: 'Dos', epaules: 'Épaules', bras: 'Bras', jambes: 'Jambes', abdos: 'Abdos', cardio: 'Cardio' };
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }).replace(':', 'h');
const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
const errText = (e: unknown) => { const m = e instanceof Error ? e.message : 'Erreur'; try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; } };
const topReps = (r: string) => Number(r.match(/(\d+)(?!.*\d)/)?.[1] ?? 10);
const timedSec = (r: string) => { const m = r.match(/(\d+)\s*(s|min)\b/); return m ? Number(m[1]) * (m[2] === 'min' ? 60 : 1) : 0; };

// ── Voix + bip + vibration (fin du repos) ────────────────────────────────────
function speak(text: string) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* pas de voix */ }
}
function beep() {
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.start(); o.stop(ctx.currentTime + 0.5);
  } catch { /* rien */ }
}

// ── Séance en cours (gardée sur le téléphone si l'app se ferme) ─────────────
interface LiveSet { kg: number | null; reps: number; done: boolean }
interface Live { date: string; type: SportType; startedAt: number; idx: number; sets: Record<string, LiveSet[]>; alt: Record<string, number> }
const LIVE_KEY = 'dz:sport:live';
const loadLive = (): Live | null => { try { return JSON.parse(localStorage.getItem(LIVE_KEY) ?? 'null') as Live | null; } catch { return null; } };
const saveLive = (l: Live | null) => { try { if (l) localStorage.setItem(LIVE_KEY, JSON.stringify(l)); else localStorage.removeItem(LIVE_KEY); } catch { /* ignore */ } };

function initLive(s: SportSession): Live {
  const sets: Record<string, LiveSet[]> = {};
  for (const e of s.exercises) sets[e.id] = Array.from({ length: e.sets }, () => ({ kg: e.suggestion.kg, reps: topReps(e.reps), done: false }));
  return { date: s.date, type: s.type, startedAt: Date.now(), idx: 0, sets, alt: {} };
}

export default function SportScreen({ embedded = false, onLive }: { embedded?: boolean; onLive?: (live: boolean) => void } = {}) {
  const [data, setData] = useState<SportOverview | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [live, setLive] = useState<Live | null>(loadLive);
  const [sheet, setSheet] = useState<string | null>(null);           // date du jour à modifier
  const [demo, setDemo] = useState<SportExercise | null>(null);
  useEffect(() => { onLive?.(!!live); }, [live, onLive]);
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 4000); };
  const load = useCallback(() => business.sport().then(setData).catch(e => setErr(errText(e))), []);
  useEffect(() => { void load(); }, [load]);

  const act = async (p: Promise<SportOverview>, msg: string) => { try { setData(await p); say(msg); } catch (e) { say(`❌ ${errText(e)}`); } };
  const setting = async (k: 'callBefore' | 'gymCheck', v: boolean) => {
    try { const r = await business.sportSettings({ [k]: v }); setData(d => d && { ...d, settings: r.settings }); } catch (e) { say(`❌ ${errText(e)}`); }
  };

  const session = data ? (live ? [data.today, data.next].find(s => s?.date === live.date && s.type === live.type) ?? data.today : data.today) : null;
  if (live && session) {
    return <LiveWorkout s={session} live={live} onChange={l => { setLive(l); saveLive(l); }}
      onQuit={() => { setLive(null); saveLive(null); }}
      onDone={(msg) => { setLive(null); saveLive(null); say(msg); void load(); }} />;
  }

  const s = data?.today ?? data?.next ?? null;
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: embedded ? 'transparent' : 'radial-gradient(120% 60% at 50% 0%, #2a0b1d 0%, #050a16 55%)', color: C.text, fontFamily: C.font, paddingBottom: 30, paddingTop: embedded ? 12 : 0 }}>
      {!embedded && <Hero eyebrow="Coach sportif · Dzaryx" title="SPORT" accent={C.accent}
        subtitle={data ? `🔥 ${data.stats.streak} séance(s) d'affilée · ${data.stats.monthSessions} ce mois` : 'Ton programme calé sur ton agenda'} />}
      <div style={{ padding: '0 14px' }}>
        {err && <div style={{ ...card, color: '#f87171' }}>❌ {err}</div>}
        {!data && !err && <SkeletonCards count={4} height={90} />}
        {data && <>
          {/* ── Séance du jour / prochaine ── */}
          {s ? (
            <div style={{ ...card, padding: 16, background: 'linear-gradient(150deg, #3a0f27, #0c1730 70%)', border: `1px solid ${C.accent}55` }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>{s.date === data.week[0]?.date ? "AUJOURD'HUI" : `PROCHAINE SÉANCE · ${dayName(s.date).toUpperCase()}`} · {hm(s.start)}–{hm(s.end)}</div>
              <div style={{ fontSize: 30, fontWeight: 900, margin: '6px 0 2px', letterSpacing: '-0.02em' }}>{s.emoji} {s.label}</div>
              <div style={{ fontSize: 13, color: '#fda4af' }}>{s.focus}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
                <span style={pill}>⏱ ~{s.estMin} min</span>
                <span style={pill}>🏋️ {s.exercises.length} exercices</span>
                {s.minutes < 60 && <span style={{ ...pill, color: C.gold }}>⚡ version courte ({s.minutes} min libres)</span>}
                {s.arrived && <span style={{ ...pill, color: C.green }}>✅ arrivé à {hm(new Date(s.arrived).toISOString())}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7 }}>
                {s.exercises.map(e => <div key={e.id} onClick={() => setDemo(e)} style={{ cursor: 'pointer' }}>{e.demo.length ? '🎬' : '•'} {e.name} <b style={{ color: C.text }}>{e.sets}×{e.reps}</b>{e.suggestion.kg != null && <span style={{ color: e.suggestion.up ? C.green : C.cyan }}> · {e.suggestion.kg} kg{e.suggestion.up ? ' ⬆️' : ''}</span>}</div>)}
                {s.finisher && <div>🏁 {s.finisher}</div>}
                <div style={{ fontSize: 13.5, marginTop: 4 }}>👆 Touche un exercice pour voir la démo et la vidéo</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 14 }}>
                <button style={{ ...btn(C.accent), fontSize: 15, padding: 14 }} onClick={() => { const l = initLive(s); setLive(l); saveLive(l); }}>▶ COMMENCER</button>
                {'lat' in data.gym && data.gym.lat != null
                  ? <a href={`https://waze.com/ul?ll=${data.gym.lat},${data.gym.lng}&navigate=yes`} target="_blank" rel="noreferrer" style={{ ...ghost, textAlign: 'center', textDecoration: 'none', padding: 14 }}>🧭 Y aller</a>
                  : <span />}
              </div>
              {data.gym.distanceKm != null && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>📍 Tu es à {data.gym.distanceKm} km de la salle</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={{ ...ghost, flex: 1, padding: 9, fontSize: 12 }} onClick={() => setSheet(s.date)}>🔄 Changer</button>
                <button style={{ ...ghost, flex: 1, padding: 9, fontSize: 12 }} onClick={() => void act(business.sportSkip(s.date, 'repos'), '😴 Séance décalée au prochain créneau — pas d\'appel ce jour-là')}>😴 Pas aujourd'hui</button>
              </div>
            </div>
          ) : <div style={card}>😴 Aucun créneau sport dans les 7 prochains jours. Ajoute « 🏋️ Sport » dans l'agenda ou dis à Dzaryx « mets-moi du sport demain à 7h ».</div>}

          {/* ── Semaine ── */}
          {section('TA SEMAINE (AGENDA FIK)')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
            {data.week.map(w => (
              <button key={w.date} onClick={() => setSheet(w.date)} style={{
                background: w.status === 'done' ? 'rgba(52,211,153,0.14)' : w.type ? 'rgba(251,113,133,0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${w.status === 'done' ? C.green : w.type ? `${C.accent}55` : C.border}`, borderRadius: 12, padding: '8px 2px',
                color: C.text, cursor: 'pointer', fontFamily: C.font, minHeight: 78,
              }}>
                <div style={{ fontSize: 13.5, color: C.muted, textTransform: 'capitalize' }}>{dayName(w.date)}</div>
                <div style={{ fontSize: 20, margin: '4px 0' }}>{w.status === 'done' ? '✅' : w.skip ? '😴' : w.emoji ?? '·'}</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.15 }}>{w.skip ? 'REPOS' : w.label?.replace(' DAY', '').replace(' & MOBILITÉ', '') ?? ''}</div>
                {w.start && <div style={{ fontSize: 12.5, color: C.muted }}>{hm(w.start)}</div>}
              </button>
            ))}
          </div>

          {/* ── Récupération ── */}
          {section('RÉCUPÉRATION DES MUSCLES')}
          <div style={card}>
            {data.recovery.map(r => (
              <div key={r.muscle} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }} title={`${MUSCLE[r.muscle]} : ${r.pct}% récupéré`}>
                <span style={{ width: 62, fontSize: 12, color: C.muted }}>{MUSCLE[r.muscle]}</span>
                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${r.pct}%`, height: '100%', borderRadius: 4, background: r.pct >= 90 ? C.green : r.pct >= 50 ? C.gold : C.accent }} />
                </div>
                <span style={{ width: 70, fontSize: 11, textAlign: 'right' }}>{r.pct >= 90 ? '✅ prêt' : r.pct >= 50 ? '🟡 ' : '🔴 '}{r.pct < 90 ? `${r.pct}%` : ''}</span>
              </div>
            ))}
            <div style={{ fontSize: 13.5, color: C.muted, marginTop: 6 }}>Calculé d'après tes séances notées (gros muscles 72 h, petits 48 h).</div>
          </div>

          {/* ── Progrès ── */}
          {section('PROGRÈS')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <StatCard icon="🔥" value={String(data.stats.streak)} label="D'AFFILÉE" color={C.accent} />
            <StatCard icon="📅" value={String(data.stats.monthSessions)} label="CE MOIS" color={C.cyan} />
            <StatCard icon="🏆" value={String(data.stats.prs.length)} label="RECORDS" color={C.gold} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Volume soulevé par semaine (kg)</div>
            <VolumeBars weeks={data.stats.weeks} />
            {data.stats.prs.length > 0 && <div style={{ marginTop: 12 }}>
              {data.stats.prs.map(p => <div key={p.ex} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderTop: `1px solid ${C.border}` }}>
                <span>🏆 {p.ex}</span><b>{p.kg} kg{p.reps ? ` × ${p.reps}` : ''}</b></div>)}
            </div>}
          </div>
          {data.recent.length > 0 && <div style={card}>
            {data.recent.map(r => <div key={r.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
              <span>{dayName(r.date)} {r.date.slice(8)}/{r.date.slice(5, 7)} · {r.label}</span>
              <span style={{ color: C.muted }}>{r.sets} séries{r.volume ? ` · ${r.volume} kg` : ''}{r.durationMin ? ` · ${r.durationMin} min` : ''}</span></div>)}
          </div>}

          {/* ── Rappels ── */}
          {section('RAPPELS DE DZARYX')}
          <div style={card}>
            <Toggle on={data.settings.callBefore} onChange={v => void setting('callBefore', v)} title="📞 Appel au moment de partir"
              sub="Dzaryx t'appelle quand il faut partir (trafic réel), t'envoie le point GPS de la salle et ta séance sur Telegram." />
            <Toggle on={data.settings.gymCheck} onChange={v => void setting('gymCheck', v)} title="📍 « Tu as oublié le sport ? »"
              sub="10 min après le début, si ta position est loin de la salle : appel + point GPS. Arrivé à la salle : ta séance arrive toute seule." />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>Pour que Dzaryx voie ta position : partage ta position en direct dans le chat Telegram de Dzaryx (📎 → Position → « jusqu'à désactivation »).</div>
          </div>
          <button style={{ ...ghost, width: '100%' }} onClick={() => business.sportSync().then(r => say(`✅ ${r.message}`)).catch(e => say(`❌ ${errText(e)}`))}>🗓️ Réécrire les séances dans l'agenda</button>
        </>}
      </div>

      {/* ── Feuille : changer la séance d'un jour ── */}
      {sheet && data && (
        <div onClick={() => setSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#0a1428', borderRadius: '20px 20px 0 0', padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 800, marginBottom: 10, textTransform: 'capitalize' }}>{new Date(`${sheet}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            {!data.week.find(w => w.date === sheet)?.start && !data.week.find(w => w.date === sheet)?.skip
              ? <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Pas de créneau sport ce jour-là dans l'agenda. Demande à Dzaryx : « ajoute du sport ce jour-là à 18h ».</div>
              : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(Object.keys(data.sessions) as SportType[]).map(t => (
                  <button key={t} style={{ ...ghost, textAlign: 'left' }} onClick={() => { setSheet(null); void act(business.sportSwap(sheet, t), `✅ ${data.sessions[t].label} (agenda mis à jour)`); }}>
                    {data.sessions[t].emoji} {data.sessions[t].label}<div style={{ fontSize: 13.5, color: C.muted, fontWeight: 500 }}>{data.sessions[t].focus}</div>
                  </button>))}
              </div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {data.week.find(w => w.date === sheet)?.skip
                ? <button style={{ ...btn(C.green), flex: 1 }} onClick={() => { setSheet(null); void act(business.sportSkip(sheet, null), '✅ Sport remis'); }}>💪 Remettre le sport</button>
                : <button style={{ ...ghost, flex: 1 }} onClick={() => { setSheet(null); void act(business.sportSkip(sheet, 'repos'), '😴 Repos noté'); }}>😴 Repos ce jour-là</button>}
              <button style={{ ...ghost, flex: 1 }} onClick={() => setSheet(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {demo && (
        <div onClick={() => setDemo(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 55, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#0a1428', borderRadius: '20px 20px 0 0', padding: 16, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>{demo.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{demo.sets} × {demo.reps} · repos {demo.rest ? `${demo.rest} s` : '—'} · {MUSCLE[demo.muscle]}</div>
            <ExerciseDemo e={demo} />
            <div style={{ fontSize: 12.5, color: '#fda4af', margin: '10px 0', lineHeight: 1.5 }}>💡 {demo.tip}</div>
            {demo.alt.length > 0 && <div style={{ fontSize: 11.5, color: C.muted }}>Remplacement : {demo.alt.join(' · ')}</div>}
            <button style={{ ...ghost, width: '100%', marginTop: 12 }} onClick={() => setDemo(null)}>Fermer</button>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 90, background: '#111c36', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 13, zIndex: 60 }}>{toast}</div>}
    </div>
  );
}

/** Démo animée (2 positions qui alternent) + bouton vidéo YouTube. */
export function ExerciseDemo({ e, height = 190 }: { e: SportExercise; height?: number }) {
  const [f, setF] = useState(0);
  const [ok, setOk] = useState(true);
  useEffect(() => { const t = setInterval(() => setF(x => (x + 1) % 2), 900); return () => clearInterval(t); }, []);
  return (
    <div>
      {e.demo.length > 0 && ok && (
        <div style={{ position: 'relative', height, background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
          {e.demo.map((src, i) => <img key={src} src={src} alt={e.name} onError={() => setOk(false)} loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: f === i ? 1 : 0, transition: 'opacity .35s' }} />)}
          <span style={{ position: 'absolute', left: 8, bottom: 6, fontSize: 13, color: '#667', background: 'rgba(255,255,255,0.8)', borderRadius: 6, padding: '1px 5px' }}>démo · {f === 0 ? 'départ' : 'arrivée'}</span>
        </div>
      )}
      <a href={e.video} target="_blank" rel="noreferrer" style={{ ...btn('#ef4444', '#fff'), display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 8, padding: 10 }}>▶ Voir la vidéo de l'exercice</a>
    </div>
  );
}

const pill = { fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', fontWeight: 700 } as const;

function Toggle({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sub}</div></div>
      <button onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 50, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', background: on ? C.green : 'rgba(255,255,255,0.15)', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </button>
    </div>
  );
}

function VolumeBars({ weeks }: { weeks: SportOverview['stats']['weeks'] }) {
  const max = Math.max(1, ...weeks.map(w => w.volume));
  if (!weeks.some(w => w.volume)) return <div style={{ fontSize: 12, color: C.muted }}>Termine une séance en mode séance : ton volume apparaîtra ici.</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90 }}>
      {weeks.map((w, i) => (
        <div key={w.from} title={`Semaine du ${w.from.slice(8)}/${w.from.slice(5, 7)} : ${w.volume} kg · ${w.sessions} séance(s)`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '70%', height: `${Math.max(2, w.volume / max * 70)}px`, background: i === weeks.length - 1 ? C.accent : '#7f4a63', borderRadius: '4px 4px 0 0' }} />
          <span style={{ fontSize: 13, color: C.muted }}>{i === weeks.length - 1 ? 'cette' : `S-${weeks.length - 1 - i}`}</span>
        </div>
      ))}
    </div>
  );
}

// ── MODE SÉANCE ──────────────────────────────────────────────────────────────

function LiveWorkout({ s, live, onChange, onQuit, onDone }: { s: SportSession; live: Live; onChange: (l: Live) => void; onQuit: () => void; onDone: (msg: string) => void }) {
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState<{ until: number; total: number; next: string } | null>(null);
  const [work, setWork] = useState<{ until: number; total: number } | null>(null);     // exercice chronométré (gainage…)
  const [finish, setFinish] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [saving, setSaving] = useState(false);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => {   // écran allumé pendant la séance
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then(l => { lock.current = l; }).catch(() => {});
    return () => { void lock.current?.release().catch(() => {}); };
  }, []);
  useEffect(() => {
    if (rest && now >= rest.until) { setRest(null); beep(); try { navigator.vibrate?.([300, 120, 300]); } catch { /* */ } speak(`Repos terminé. ${rest.next}`); }
    if (work && now >= work.until) { setWork(null); beep(); try { navigator.vibrate?.([500]); } catch { /* */ } speak('Temps ! Bravo.'); }
  }, [now, rest, work]);

  const e: SportExercise | undefined = s.exercises[live.idx];
  const sets = e ? live.sets[e.id] ?? [] : [];
  const allSets = s.exercises.flatMap(x => live.sets[x.id] ?? []);
  const doneCount = allSets.filter(x => x.done).length;
  const elapsed = Math.floor((now - live.startedAt) / 1000);
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`;
  const altName = e ? (live.alt[e.id] ? e.alt[(live.alt[e.id]! - 1) % e.alt.length] : null) : null;
  const name = e ? altName ?? e.name : '';

  const update = (i: number, patch: Partial<LiveSet>) => {
    if (!e) return;
    onChange({ ...live, sets: { ...live.sets, [e.id]: sets.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
  };
  const validate = (i: number) => {
    if (!e) return;
    const was = sets[i]!.done;
    update(i, { done: !was });
    if (was) return;
    const remaining = sets.filter((x, j) => !x.done && j !== i).length;
    const nextEx = remaining ? e : s.exercises[live.idx + 1];
    const nextSet = remaining ? sets.findIndex((x, j) => !x.done && j !== i) + 1 : 1;
    const nextKg = remaining ? sets[nextSet - 1]?.kg : nextEx ? live.sets[nextEx.id]?.[0]?.kg : null;
    const next = nextEx ? `Série ${nextSet}, ${remaining ? name : nextEx.name}${nextKg ? `, ${nextKg} kilos` : ''}.` : 'Séance terminée, bravo champion !';
    if (e.rest > 0) setRest({ until: Date.now() + e.rest * 1000, total: e.rest, next });
    if (!remaining && live.idx < s.exercises.length - 1) setTimeout(() => onChange({ ...loadLive()!, idx: live.idx + 1 }), 400);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = s.exercises.flatMap(x => (live.sets[x.id] ?? []).filter(st => st.done).map(st => ({ ex: x.id, ...(st.kg != null ? { kg: st.kg } : {}), reps: st.reps })));
      const r = await business.sportLog({ date: live.date, type: live.type, sets: payload, durationMin: Math.round(elapsed / 60), rpe });
      speak(r.prs.length ? `Nouveau record ! ${r.prs[0]}. Bravo !` : 'Séance enregistrée. Bravo champion !');
      onDone(`${r.levelUp ? `🎉 NIVEAU ${r.level} ! ` : ''}+${r.gained} pts 🎮 — ${r.prs.length ? `🏆 Record : ${r.prs.join(', ')}` : 'séance enregistrée, bravo !'}`);
    } catch (err) { alert(errText(err)); setSaving(false); }
  };

  const volume = s.exercises.reduce((a, x) => a + (live.sets[x.id] ?? []).filter(st => st.done).reduce((b, st) => b + (st.kg ?? 0) * st.reps, 0), 0);
  const ring = (frac: number, size: number, color: string, label: string, sub: string) => (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * (size / 2 - 8)} strokeDashoffset={2 * Math.PI * (size / 2 - 8) * (1 - frac)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: size / 4, fontWeight: 900 }}>{label}</div><div style={{ fontSize: 12, color: C.muted }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'radial-gradient(120% 50% at 50% 0%, #3a0f27 0%, #050a16 60%)', color: C.text, fontFamily: C.font, padding: '14px 14px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ ...ghost, padding: '7px 11px', fontSize: 12 }} onClick={() => { if (confirm('Quitter la séance sans l\'enregistrer ?')) onQuit(); }}>✕</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 13.5, letterSpacing: '0.2em', color: C.accent }}>{s.emoji} {s.label}</div>
          <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{mmss(elapsed)}</div>
          <div style={{ fontSize: 13.5, color: C.gold, fontWeight: 800 }}>🎮 +{100 + doneCount * 5} pts en jeu</div>
        </div>
        <button style={{ ...btn(C.green), padding: '7px 11px', fontSize: 12 }} onClick={() => setFinish(true)}>Fin ✓</button>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, margin: '12px 0' }}>
        <div style={{ width: `${allSets.length ? doneCount / allSets.length * 100 : 0}%`, height: '100%', background: C.accent, borderRadius: 3, transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 6 }}>
        {s.exercises.map((x, i) => {
          const d = (live.sets[x.id] ?? []).every(st => st.done);
          return <button key={x.id} onClick={() => onChange({ ...live, idx: i })} style={{ flexShrink: 0, ...ghost, padding: '6px 10px', fontSize: 11,
            background: i === live.idx ? C.accent : d ? 'rgba(52,211,153,0.18)' : 'rgba(255,255,255,0.05)', color: i === live.idx ? '#050a16' : C.text }}>{d ? '✓' : i + 1}</button>;
        })}
      </div>

      {rest ? (
        <div style={{ ...card, textAlign: 'center', padding: 24, marginTop: 10 }}>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>REPOS</div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
            {ring(Math.max(0, (rest.until - now) / 1000 / rest.total), 190, C.cyan, mmss(Math.ceil((rest.until - now) / 1000)), 'respire')}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Ensuite : {rest.next}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...ghost, flex: 1 }} onClick={() => setRest({ ...rest, until: rest.until + 15000, total: rest.total + 15 })}>+15 s</button>
            <button style={{ ...btn(C.cyan), flex: 1 }} onClick={() => setRest(null)}>Passer ⏭</button>
          </div>
        </div>
      ) : e ? (
        <div style={{ ...card, marginTop: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>EXERCICE {live.idx + 1}/{s.exercises.length} · {MUSCLE[e.muscle]?.toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: 900, margin: '4px 0 6px', lineHeight: 1.15 }}>{name}</div>
          <div style={{ fontSize: 13 }}><b>{e.sets} × {e.reps}</b> · repos {e.rest ? `${e.rest} s` : '—'}</div>
          <div style={{ fontSize: 12, color: '#fda4af', margin: '8px 0', lineHeight: 1.45 }}>💡 {e.tip}</div>
          {!work && <ExerciseDemo e={e} height={150} />}
          {e.suggestion.last && <div style={{ fontSize: 11.5, color: C.muted }}>La dernière fois : {e.suggestion.last}{e.suggestion.up ? <b style={{ color: C.green }}> → on monte à {e.suggestion.kg} kg ⬆️</b> : ''}</div>}
          {e.alt.length > 0 && <button style={{ ...ghost, padding: '6px 10px', fontSize: 11.5, marginTop: 8 }} onClick={() => onChange({ ...live, alt: { ...live.alt, [e.id]: ((live.alt[e.id] ?? 0) + 1) % (e.alt.length + 1) } })}>
            🔁 Machine prise ? {altName ? '(retour à l\'original au bout de la liste)' : `→ ${e.alt[0]}`}</button>}

          {work ? (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>{ring(Math.max(0, (work.until - now) / 1000 / work.total), 170, C.gold, mmss(Math.ceil((work.until - now) / 1000)), 'tiens bon')}</div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {sets.map((st, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: `1px solid ${C.border}`, opacity: st.done ? 0.55 : 1 }}>
                  <span style={{ width: 22, fontWeight: 800, color: C.muted }}>{i + 1}</span>
                  {e.timed ? (
                    <button style={{ ...ghost, flex: 1, padding: 8, fontSize: 12 }} onClick={() => { const sec = timedSec(e.reps); if (sec) { setWork({ until: Date.now() + sec * 1000, total: sec }); speak('Go !'); } }}>▶ Chrono {e.reps}</button>
                  ) : (<>
                    <Stepper value={st.kg} unit="kg" step={e.step && e.step > 0 ? e.step : 2.5} onChange={v => update(i, { kg: v })} />
                    <Stepper value={st.reps} unit="reps" step={1} onChange={v => update(i, { reps: v ?? 0 })} />
                  </>)}
                  <button onClick={() => validate(i)} style={{ width: 44, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 18, fontWeight: 900,
                    background: st.done ? C.green : 'rgba(255,255,255,0.1)', color: st.done ? '#050a16' : C.text }}>✓</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={{ ...ghost, flex: 1 }} disabled={live.idx === 0} onClick={() => onChange({ ...live, idx: live.idx - 1 })}>◀ Précédent</button>
            {live.idx < s.exercises.length - 1
              ? <button style={{ ...ghost, flex: 1 }} onClick={() => onChange({ ...live, idx: live.idx + 1 })}>Suivant ▶</button>
              : <button style={{ ...btn(C.green), flex: 1 }} onClick={() => setFinish(true)}>Terminer ✓</button>}
          </div>
        </div>
      ) : null}
      {s.finisher && <div style={{ ...card, fontSize: 12.5 }}>🏁 Pour finir : {s.finisher}</div>}

      {finish && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ width: '100%', background: '#0a1428', borderRadius: '20px 20px 0 0', padding: 18, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>🎉 Séance terminée</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '14px 0' }}>
              <StatCard icon="⏱" value={mmss(elapsed)} label="DURÉE" color={C.cyan} />
              <StatCard icon="✓" value={`${doneCount}/${allSets.length}`} label="SÉRIES" color={C.green} />
              <StatCard icon="🏋️" value={`${Math.round(volume)}`} label="KG SOULEVÉS" color={C.accent} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>C'était dur comment ? (1 = facile · 10 = à fond)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} onClick={() => setRpe(n)} style={{ ...ghost, padding: '8px 0', fontSize: 12, background: rpe === n ? C.accent : 'rgba(255,255,255,0.05)', color: rpe === n ? '#050a16' : C.text }}>{n}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={{ ...ghost, flex: 1 }} onClick={() => setFinish(false)}>Continuer</button>
              <button style={{ ...btn(C.green), flex: 2 }} disabled={saving} onClick={() => void save()}>{saving ? '…' : '💾 Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ value, unit, step, onChange }: { value: number | null; unit: string; step: number; onChange: (v: number | null) => void }) {
  const b = { width: 30, height: 36, border: 'none', borderRadius: 9, background: 'rgba(255,255,255,0.08)', color: C.text, fontSize: 17, fontWeight: 800, cursor: 'pointer' } as const;
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
      <button style={b} onClick={() => onChange(Math.max(0, Math.round(((value ?? 0) - step) * 10) / 10))}>−</button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <input inputMode="decimal" value={value ?? ''} placeholder="—" onChange={ev => { const v = parseFloat(ev.target.value.replace(',', '.')); onChange(Number.isFinite(v) ? v : null); }}
          style={{ width: '100%', background: 'transparent', border: 'none', color: C.text, fontSize: 17, fontWeight: 900, textAlign: 'center', fontFamily: C.font, outline: 'none' }} />
        <div style={{ fontSize: 16, color: C.muted, marginTop: -2 }}>{unit}</div>
      </div>
      <button style={b} onClick={() => onChange(Math.round(((value ?? 0) + step) * 10) / 10)}>+</button>
    </div>
  );
}
