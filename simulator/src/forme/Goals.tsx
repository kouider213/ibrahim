import { useEffect, useRef, useState } from 'react';
import { forme, errText, vibrate, type GoalsView, type GoalChallenge } from './api.ts';
import { F, card, darkCard, btn, darkBtn, ghostBtn, input, Sheet, Spinner, Bar, Chip, Kicker } from './ui.tsx';
import { GoalEvolution, GoalHero, GoalToday, GoalBody, GoalWeight, GoalJourney, GoalExercises, GoalTips, GoalBadges, GoalExSheet } from './GoalsVisual.tsx';

// 🎯 OBJECTIFS & DÉFIS (Kouider 02/11) — dans Progrès.
// Il choisit ce qu'il veut (pecs, bras, ventre plat + abdos…), le dit avec ses mots, met des muscles en PRIORITÉ ;
// le coach lit sa dernière photo → niveau par zone, priorités conseillées, délai, deadlines, exercices, image « toi à l'arrivée »,
// idées auxquelles il n'aurait pas pensé, défis. Tout se change à tout moment, ou en parlant au coach.
const fmt = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
const weeksLeft = (eta: string) => Math.max(0, Math.round((Date.parse(`${eta}T12:00:00Z`) - Date.now()) / 604_800_000));

export function GoalsCard({ toast }: { toast: (t: string) => void }) {
  const [g, setG] = useState<GoalsView | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { forme.goals().then(setG).catch(() => {}); }, [open]);
  const p = g?.state.plan;
  const active = g?.state.challenges.filter(c => !c.finished) ?? [];
  return <>
    <button onClick={() => setOpen(true)} style={{ ...darkCard, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', marginTop: 12, fontFamily: F.sans, display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Kicker color="rgba(255,255,255,0.6)">🎯 Mes objectifs & défis</Kicker>
        <span style={{ fontSize: 13, fontWeight: 700, color: F.accent2 }}>Ouvrir ›</span>
      </div>
      {p ? <>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>Arrivée ~{fmt(p.eta)} <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>· {weeksLeft(p.eta)} sem.</span></div>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {p.zones.slice(0, 4).map(z => <div key={z.id}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{g!.state.priority.includes(z.id) || p.focus?.zones.includes(z.id) ? '⭐ ' : ''}{z.label}</span><b>{z.now == null ? '?' : `${z.now}/100`}</b></div><Bar value={z.now ?? 0} max={100} color={(z.now ?? 0) >= 70 ? '#1f63f0' : (z.now ?? 0) >= 40 ? '#f5c400' : '#e5322d'} /></div>)}
        </div>
        {g?.pace && g.pace.status !== 'inconnu' && <div style={{ fontSize: 13, marginTop: 10, fontWeight: 700, color: g.pace.status === 'retard' ? '#ff8a80' : g.pace.status === 'avance' ? '#7ee2a8' : '#fff' }}>{g.pace.status === 'retard' ? '⚠️ En retard' : g.pace.status === 'avance' ? '🚀 En avance' : '✅ Dans les temps'}</div>}
        {g?.nextMilestone && <div style={{ fontSize: 13, marginTop: 10, color: 'rgba(255,255,255,0.8)' }}>⏳ Prochaine deadline {fmt(g.nextMilestone.date)} : {g.nextMilestone.title}</div>}
        {active.length > 0 && <div style={{ fontSize: 13, marginTop: 4, color: 'rgba(255,255,255,0.8)' }}>🏆 {active.length} défi{active.length > 1 ? 's' : ''} en cours</div>}
      </> : <div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 6, color: 'rgba(255,255,255,0.85)' }}>Pecs, bras, ventre plat avec abdos… Dis ce que tu veux : le coach lit ta dernière photo, te dit où tu en es, quoi faire, en combien de temps, et te montre à quoi tu ressembleras.</div>}
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="🎯 Mes objectifs">
      {g ? <Goals g={g} setG={setG} toast={toast} /> : <div style={{ padding: 30, textAlign: 'center' }}><Spinner /></div>}
    </Sheet>
  </>;
}

function Goals({ g, setG, toast }: { g: GoalsView; setG: (g: GoalsView) => void; toast: (t: string) => void }) {
  const s = g.state, p = s.plan;
  const [zones, setZones] = useState<string[]>(s.zones);
  const [prio, setPrio] = useState<string[]>(s.priority);
  const [note, setNote] = useState(s.note);
  const [wantBy, setWantBy] = useState(s.wantBy ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState(!p);
  const dirty = zones.join() !== s.zones.join() || prio.join() !== s.priority.join() || note !== s.note || wantBy !== (s.wantBy ?? '');
  useEffect(() => { setZones(s.zones); setPrio(s.priority); setNote(s.note); setWantBy(s.wantBy ?? ''); }, [s.zones.join(), s.priority.join(), s.note, s.wantBy]);   // le coach a pu les changer
  // Image en cours → on revient voir toutes les 6 s
  useEffect(() => {
    if (s.vision?.status !== 'running') return;
    const t = setInterval(() => { forme.goals().then(setG).catch(() => {}); }, 6000);
    return () => clearInterval(t);
  }, [s.vision?.status]);
  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { toast(errText(e)); } finally { setBusy(null); } };
  const toggleZone = (id: string) => { setZones(z => z.includes(id) ? z.filter(x => x !== id) : [...z, id]); setPrio(pr => pr.filter(x => x !== id || !zones.includes(id))); };
  const plan = () => run('plan', async () => { setG(await forme.goalPlan({ zones, note: note.trim(), priority: prio, wantBy })); setEdit(false); vibrate(60); toast('🎯 Plan prêt'); });
  const savePrefs = () => run('prefs', async () => { setG(await forme.goalPrefs({ zones, note: note.trim(), priority: prio, wantBy })); toast('Enregistré — refais le plan pour le recalculer'); });

  return <div style={{ paddingBottom: 10 }}>
    {/* 1. Ce que je veux */}
    {edit || !p ? <div style={card}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Ce que je veux</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {g.zones.map(z => <Chip key={z.id} on={zones.includes(z.id)} onClick={() => toggleZone(z.id)}>{z.emoji} {z.label}</Chip>)}
      </div>
      {zones.length > 0 && <>
        <div style={{ fontWeight: 800, margin: '14px 0 4px' }}>⭐ À travailler plus souvent</div>
        <div style={{ fontSize: 12.5, color: F.muted, marginBottom: 6 }}>Facultatif. Si tu ne choisis rien, le coach décide d'après ta photo (ex. bras déjà dessinés → priorité aux abdos).</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {zones.map(id => { const z = g.zones.find(x => x.id === id)!; return <Chip key={id} color={F.gold} on={prio.includes(id)} onClick={() => setPrio(pr => pr.includes(id) ? pr.filter(x => x !== id) : [...pr, id])}>⭐ {z.label}</Chip>; })}
        </div>
      </>}
      <button onClick={() => { setZones(['dos', 'bras', 'pecs', 'abdos', 'jambes']); setPrio(['dos', 'bras', 'pecs', 'abdos']); setNote('D\'abord le haut du corps (dos, bras, pecs, ventre plat avec abdos). Quand le haut est bien entraîné, je commence le bas du corps.'); }} style={{ ...ghostBtn, width: '100%', marginTop: 12, fontSize: 13 }}>⚡ Raccourci : haut du corps d'abord, le bas ensuite</button>
      <div style={{ fontWeight: 800, margin: '14px 0 6px' }}>Avec tes mots</div>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Ex. je veux des pecs bien dessinés et un ventre plat avec les abdos pour l'été, sans perdre mes bras" style={{ ...input, resize: 'vertical', fontSize: 15 }} />
      <div style={{ fontWeight: 800, margin: '14px 0 6px' }}>📅 Je veux voir des résultats d'ici le</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="date" value={wantBy} min={new Date().toISOString().slice(0, 10)} onChange={e => setWantBy(e.target.value)} style={{ ...input, flex: 1 }} />
        {wantBy && <button onClick={() => setWantBy('')} style={{ ...ghostBtn, padding: '10px 12px' }}>✕</button>}
      </div>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>Facultatif. Le coach met une deadline à cette date et te dit franchement ce qui sera visible.</div>
      <div style={{ fontSize: 12.5, color: F.muted, margin: '8px 0 10px' }}>📸 Le plan part de ta dernière photo{g.latest ? ` (${fmt(g.latest.date)})` : ' — prends-en une de face dans Photos de suivi'}. Torse nu ou t-shirt moulant = analyse juste.</div>
      <button disabled={!zones.length || !!busy} onClick={plan} style={{ ...btn, width: '100%', opacity: zones.length ? 1 : 0.5 }}>{busy === 'plan' ? <><Spinner size={16} color="#fff" /> Le coach regarde ta photo… (~30 s)</> : p ? '🔄 Refaire mon plan' : '🎯 Créer mon plan'}</button>
      {p && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {dirty && <button disabled={!!busy} onClick={savePrefs} style={{ ...ghostBtn, flex: 1 }}>Enregistrer sans recalculer</button>}
        <button onClick={() => { setEdit(false); setZones(s.zones); setPrio(s.priority); setNote(s.note); }} style={{ ...ghostBtn, flex: 1 }}>Annuler</button>
      </div>}
    </div> : <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}>
        <b>{s.zones.map(id => `${s.priority.includes(id) ? '⭐' : ''}${g.zones.find(z => z.id === id)?.label ?? id}`).join(' · ')}</b>
        {s.note && <div style={{ color: F.muted, marginTop: 2 }}>« {s.note} »</div>}
        {s.wantBy && <div style={{ color: F.accent, marginTop: 2, fontWeight: 700 }}>📅 Résultats voulus d'ici le {fmt(s.wantBy)}</div>}
      </div>
      <button onClick={() => setEdit(true)} style={{ ...ghostBtn, padding: '8px 12px' }}>✏️ Changer</button>
    </div>}

    {g.recheck && p && !edit && <div style={{ ...card, marginTop: 10, background: '#eef9f1' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>📸 Nouvelle photo du {fmt(g.latest!.date)}</div>
      <div style={{ fontSize: 13, color: F.muted, margin: '4px 0 8px' }}>Fais le point : le coach compare avec ton plan du {fmt(p.photoDate)} et te dit si tu es en avance ou en retard.</div>
      <button disabled={!!busy} onClick={plan} style={{ ...btn, width: '100%', background: F.green }}>{busy === 'plan' ? <Spinner size={16} color="#fff" /> : '📊 Faire le point'}</button>
    </div>}

    {p && <Plan g={g} setG={setG} toast={toast} busy={busy} run={run} />}
    {p && <Tracking g={g} setG={setG} toast={toast} busy={busy} run={run} />}
    <Challenges g={g} setG={setG} toast={toast} />
    <Coach g={g} setG={setG} toast={toast} />
  </div>;
}

function Plan({ g, setG, toast, busy, run }: { g: GoalsView; setG: (g: GoalsView) => void; toast: (t: string) => void; busy: string | null; run: (k: string, f: () => Promise<void>) => Promise<void> }) {
  const s = g.state, p = s.plan!;
  const [applied, setApplied] = useState<{ date: string; text: string } | null>(null);
  const v = s.vision;
  const H = ({ t }: { t: string }) => <div style={{ fontSize: 17, fontWeight: 800, margin: '20px 2px 8px' }}>{t}</div>;
  const [exId, setExId] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const vision = () => run('vision', async () => { await forme.goalVision(); setG(await forme.goals()); });
  return <>
    <GoalHero g={g} onVision={vision} details={details} />
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <button disabled={v?.status === 'running' || !!busy} onClick={vision} style={{ ...ghostBtn, flex: 1, fontSize: 13 }}>{v?.status === 'running' ? '⏳ Image en cours…' : g.visionUrl ? '🔄 Refaire l\'image d\'arrivée' : '🔮 Me montrer à l\'arrivée'}</button>
    </div>
    {v?.status === 'error' && <div style={{ fontSize: 12.5, color: F.red, marginTop: 6 }}>{v.error}</div>}
    {(g.visionUrl || v?.status === 'running') && <div style={{ fontSize: 11.5, color: F.muted, marginTop: 4 }}>Image d'arrivée créée par IA à partir de ta photo : une projection pour te motiver, pas une promesse au muscle près.</div>}

    <GoalEvolution g={g} />
    <GoalBody g={g} onEx={setExId} details={details} />
    <GoalToday g={g} />
    <GoalWeight />

    {details && p.focus?.why && <><H t="⭐ Ce qu'on priorise" />
      <div style={card}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{(p.focus.zones.length ? p.focus.zones : s.priority).map(id => <span key={id} style={{ background: '#fff4dc', color: F.gold, borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 800 }}>⭐ {g.zones.find(z => z.id === id)?.label ?? id}</span>)}</div>
        <div style={{ fontSize: 14, lineHeight: 1.45 }}>{p.focus.why}</div>
        <button disabled={!!busy} onClick={() => run('apply', async () => { const r = await forme.goalApply(); setApplied(r); vibrate(60); toast('🏋️ Prochaine séance refaite'); })} style={{ ...darkBtn, width: '100%', marginTop: 12 }}>{busy === 'apply' ? <Spinner size={16} color="#fff" /> : '🏋️ Mettre ça dans ma prochaine séance'}</button>
        {applied && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 8, background: F.tile, borderRadius: 12, padding: 10 }}><b>Séance du {fmt(applied.date)}</b>{'\n'}{applied.text}</div>}
      </div></>}

    {p.milestones.length > 0 && <GoalJourney g={g} details={details} onToggle={(i, done) => run(`m${i}`, async () => { setG(await forme.goalMilestone(i, done)); if (done) { vibrate(80); toast('🏁 Bravo !'); } })} />}
    <GoalExercises g={g} onEx={setExId} details={details} />
    {details && <GoalTips g={g} />}

    {details && p.measures.length > 0 && <><H t="📏 Mensurations à viser" />
      <div style={{ ...card, display: 'grid', gap: 10 }}>
        {p.measures.map((m, i) => <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}><span>{m.what}</span><b>{m.now ? `${m.now} → ` : ''}{m.target} {m.unit}</b></div>
          {m.now ? <Bar value={Math.min(m.now, m.target)} max={Math.max(m.now, m.target)} color={F.accent} track={F.tile} h={6} /> : null}
        </div>)}
        {p.measures.some(m => !m.now) && <div style={{ fontSize: 12.5, color: F.accent, fontWeight: 700 }}>📏 Pas encore de mesure de départ : ces cibles sont indicatives. Mesure-toi d'abord pour suivre l'écart réel.</div>}
        <div style={{ fontSize: 12, color: F.muted }}>Mesure-toi toutes les 2 semaines (Progrès → mensurations) : le mètre ruban voit les progrès avant le miroir.</div>
      </div></>}
    <GoalBadges g={g} />
    <button onClick={() => setDetails(d => !d)} style={{ ...ghostBtn, width: '100%', marginTop: 16 }}>{details ? '🙈 Cacher les explications' : '📖 Voir les explications du coach'}</button>
    <GoalExSheet id={exId} onClose={() => setExId(null)} />
  </>;
}

function ChallengeRow({ c, setG, toast }: { c: GoalChallenge; setG: (g: GoalsView) => void; toast: (t: string) => void }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (b: Parameters<typeof forme.goalChallenge>[0]) => { setBusy(true); try { setG(await forme.goalChallenge(b)); vibrate(40); } catch (e) { toast(errText(e)); } finally { setBusy(false); } };
  const doneToday = c.kind === 'record' ? false : c.today >= c.target;
  const color = c.progress >= 1 ? F.green : c.late ? F.red : F.accent;
  return <div style={{ ...card, padding: 12 }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div style={{ fontSize: 26 }}>{c.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14.5 }}>{c.title}</div>
        <div style={{ fontSize: 12, color: c.late ? F.red : F.muted }}>{c.finished ? `Terminé le ${fmt(c.end)}` : `Jour ${c.dayNo}/${c.days} · fin ${fmt(c.end)}`} · {c.label}{c.late ? ' · à rattraper' : ''}</div>
      </div>
      <button onClick={() => { if (confirm(`Supprimer « ${c.title} » ?`)) void act({ action: 'delete', id: c.id }); }} style={{ background: 'none', border: 'none', color: F.muted, fontSize: 16, cursor: 'pointer' }}>✕</button>
    </div>
    <div style={{ margin: '8px 0' }}><Bar value={c.progress} max={1} h={8} color={color} track={F.tile} /></div>
    {c.autoFill && !c.finished && <div style={{ fontSize: 11.5, color: F.green, marginBottom: 4 }}>🤖 Rempli tout seul avec {c.autoFill}{c.auto ? '' : ' (tu peux aussi ajouter à la main)'}</div>}
    {!c.finished && (c.auto ? <div style={{ fontSize: 12.5, color: F.muted }}>Aujourd'hui : {c.today.toLocaleString('fr-FR')}</div>
      : c.kind === 'check' ? <button disabled={busy} onClick={() => act({ action: 'log', id: c.id, value: doneToday ? 0 : 1 })} style={{ ...(doneToday ? ghostBtn : btn), width: '100%', padding: '10px' }}>{doneToday ? '✓ Fait aujourd\'hui (annuler)' : 'Fait aujourd\'hui'}</button>
      : <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, color: F.muted, flex: 1 }}>{c.kind === 'record' ? `Ton meilleur : ${Math.max(0, ...Object.values(c.log))} ${c.unit}` : `Aujourd'hui : ${c.today}${c.kind === 'daily' ? ` / ${c.target}` : ''} ${c.unit}`}</div>
        <input inputMode="numeric" value={val} onChange={e => setVal(e.target.value.replace(/\D/g, ''))} placeholder={c.kind === 'record' ? 'score' : '+'} style={{ ...input, width: 80, padding: '9px 10px' }} />
        <button disabled={busy || !val} onClick={async () => { await act({ action: 'log', id: c.id, value: Number(val) }); setVal(''); }} style={{ ...btn, padding: '10px 14px' }}>OK</button>
      </div>)}
  </div>;
}

function Challenges({ g, setG, toast }: { g: GoalsView; setG: (g: GoalsView) => void; toast: (t: string) => void }) {
  const [more, setMore] = useState(false);
  const s = g.state;
  const add = async (b: { preset?: number; fromPlan?: number }) => { try { setG(await forme.goalChallenge({ action: 'add', ...b })); vibrate(60); toast('🏆 Défi lancé !'); } catch (e) { toast(errText(e)); } };
  const running = new Set(s.challenges.filter(c => !c.finished).map(c => c.title));
  const forMe = g.presets.map((p, i) => ({ p, i })).filter(({ p }) => !running.has(p.title) && (more || !s.zones.length || p.for.some(z => s.zones.includes(z))));
  const fromPlan = (s.plan?.challenges ?? []).map((p, i) => ({ p, i })).filter(({ p }) => !running.has(p.title));
  const kindTxt = (k: GoalChallenge['kind'], t: number, u: string, d: number) => k === 'daily' ? `${t} ${u}/jour · ${d} j` : k === 'total' ? `${t} ${u} en ${d} j` : k === 'record' ? `objectif ${t} ${u} · ${d} j` : `chaque jour · ${d} j`;
  return <>
    <div style={{ fontSize: 17, fontWeight: 800, margin: '20px 2px 8px' }}>🏆 Défis</div>
    <div style={{ display: 'grid', gap: 8 }}>
      {s.challenges.filter(c => !c.finished).map(c => <ChallengeRow key={c.id} c={c} setG={setG} toast={toast} />)}
      {s.challenges.filter(c => c.finished).slice(-3).map(c => <div key={c.id} style={{ ...card, padding: 10, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>{c.progress >= 1 ? '🏅' : '🏳️'} {c.title}</span><span style={{ color: F.muted }}>{c.label}</span></div>)}
    </div>
    {fromPlan.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, margin: '12px 2px 6px', color: F.muted }}>PROPOSÉS PAR TON COACH</div>}
    <div style={{ display: 'grid', gap: 6 }}>
      {fromPlan.map(({ p, i }) => <button key={`p${i}`} onClick={() => add({ fromPlan: i })} style={{ ...card, padding: 10, border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', fontFamily: F.sans, color: F.ink }}><span style={{ fontSize: 22 }}>{p.emoji}</span><span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{p.title}</b><br /><span style={{ fontSize: 12, color: F.muted }}>{kindTxt(p.kind, p.target, p.unit, p.days)}</span></span><span style={{ color: F.accent, fontWeight: 800 }}>+ Lancer</span></button>)}
    </div>
    {forMe.length > 0 && <div style={{ fontSize: 13, fontWeight: 800, margin: '12px 2px 6px', color: F.muted }}>{more ? 'TOUS LES DÉFIS' : 'POUR TES OBJECTIFS'}</div>}
    <div style={{ display: 'grid', gap: 6 }}>
      {forMe.map(({ p, i }) => <button key={i} onClick={() => add({ preset: i })} style={{ ...card, padding: 10, border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', fontFamily: F.sans, color: F.ink }}><span style={{ fontSize: 22 }}>{p.emoji}</span><span style={{ flex: 1 }}><b style={{ fontSize: 14 }}>{p.title}</b><br /><span style={{ fontSize: 12, color: F.muted }}>{kindTxt(p.kind, p.target, p.unit, p.days)}</span></span><span style={{ color: F.accent, fontWeight: 800 }}>+ Lancer</span></button>)}
    </div>
    {!more && <button onClick={() => setMore(true)} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>Voir tous les défis</button>}
  </>;
}

function Coach({ g, setG, toast }: { g: GoalsView; setG: (g: GoalsView) => void; toast: (t: string) => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const chat = g.state.chat;
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length]);
  const send = async (text = msg) => {
    if (!text.trim()) return;
    setBusy(true); setMsg('');
    try { const r = await forme.goalChat(text.trim()); setG(r.overview); if (r.changed) { vibrate(60); toast('✅ Objectif mis à jour'); } } catch (e) { toast(errText(e)); setMsg(text); } finally { setBusy(false); }
  };
  const ideas = ['Qu\'est-ce que je dois prioriser ?', 'Je veux surtout les abdos, change mon plan', 'Je peux aller plus vite ?', 'J\'ai mal à l\'épaule, j\'adapte comment ?'];
  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 2px 8px' }}>
      <div style={{ fontSize: 17, fontWeight: 800 }}>💬 Parle à ton coach</div>
      {chat.length > 0 && <button onClick={async () => { try { setG((await forme.goalChat('', true)).overview); } catch (e) { toast(errText(e)); } }} style={{ background: 'none', border: 'none', color: F.muted, fontSize: 12.5, cursor: 'pointer' }}>Effacer</button>}
    </div>
    <div style={{ ...card, padding: 10 }}>
      <div style={{ fontSize: 12.5, color: F.muted, marginBottom: 8 }}>Demande n'importe quoi, ou change ton objectif en parlant (« priorise les abdos », « ajoute les épaules », « je veux être prêt pour août »).</div>
      <div style={{ display: 'grid', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {chat.map((m, i) => <div key={i} style={{ alignSelf: m.role === 'moi' ? 'end' : 'start', justifySelf: m.role === 'moi' ? 'end' : 'start', maxWidth: '86%', background: m.role === 'moi' ? F.accent : F.tile, color: m.role === 'moi' ? '#fff' : F.ink, borderRadius: 14, padding: '8px 11px', fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{m.text}</div>)}
        {busy && <div style={{ justifySelf: 'start' }}><Spinner size={16} /></div>}
        <div ref={end} />
      </div>
      {!chat.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{ideas.map(x => <Chip key={x} onClick={() => void send(x)}>{x}</Chip>)}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void send(); }} placeholder="Écris au coach…" style={input} />
        <button disabled={busy || !msg.trim()} onClick={() => void send()} style={{ ...btn, padding: '0 16px' }}>➤</button>
      </div>
    </div>
  </>;
}

function Tracking({ g, setG, toast, busy, run }: { g: GoalsView; setG: (g: GoalsView) => void; toast: (t: string) => void; busy: string | null; run: (k: string, f: () => Promise<void>) => Promise<void> }) {
  const pc = g.pace, s = g.state;
  const log = [...(s.log ?? [])].reverse().slice(0, 4);
  const col = pc?.status === 'retard' ? F.red : pc?.status === 'avance' ? F.green : pc?.status === 'ok' ? F.accent : F.muted;
  return <div style={{ ...card, marginTop: 12, borderLeft: `4px solid ${col}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 800, color: col }}>{pc?.status === 'retard' ? '⚠️ En retard sur tes deadlines' : pc?.status === 'avance' ? '🚀 En avance sur tes deadlines' : pc?.status === 'ok' ? '✅ Dans les temps' : '📊 Suivi automatique'}</div>
    </div>
    {pc && <div style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 4 }}>{pc.text}</div>}
    {pc?.next?.projected != null && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 4 }}>Projection au {fmt(pc.next.date)} : {pc.next.projected} kg (objectif {pc.next.target} kg)</div>}
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 10 }}>
      <input type="checkbox" checked={s.autoAdjust !== false} onChange={e => run('auto', async () => setG(await forme.goalPrefs({ autoAdjust: e.target.checked })))} />
      Si je prends du retard, ajuster tout seul ma séance et mon déficit (bilan chaque dimanche 19h)
    </label>
    <button disabled={!!busy} onClick={() => run('check', async () => { const r = await forme.goalCheck(); setG(r.overview); toast(r.entry.changes.length ? '🤖 Ajusté' : 'Vérifié'); })} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>{busy === 'check' ? <Spinner size={14} /> : '🔎 Vérifier maintenant'}</button>
    {log.length > 0 && <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: F.muted }}>DERNIERS BILANS</div>
      {log.map((e, i) => <div key={i} style={{ fontSize: 12.5, background: F.tile, borderRadius: 10, padding: 8 }}>
        <b>{fmt(e.date)} · {e.status === 'retard' ? 'retard' : e.status === 'avance' ? 'avance' : e.status === 'ok' ? 'dans les temps' : 'pas assez de données'}</b>
        {e.changes.map((c, j) => <div key={j}>🤖 {c}</div>)}
      </div>)}
    </div>}
  </div>;
}
