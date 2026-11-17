// 17/11 Kouider : « quand je clique sur une partie du corps ça me propose un entraînement de cette partie ; tous les muscles possibles ;
// plusieurs muscles en même temps ; je note ce que je veux pour cette partie (ex. moins graisseuse) ; un programme adapté à mon corps ».
// Carte du corps (calques wger CC BY-SA) : chaque muscle se touche (test au pixel près sur le calque), couleur = récupération,
// bleu = choisi. Backend : backend/src/integrations/forme-zones.ts (/api/forme/zones*).
import { useEffect, useMemo, useRef, useState } from 'react';
import { get, postJson, errText, vibrate } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner, Img } from './ui.tsx';
import { Ico } from '../components/ui/Icon.tsx';

const BASE = '/ibrahim/muscles';
export type ZoneGoal = 'gras' | 'volume' | 'force' | 'dessin' | 'entretien';
export interface ZoneExercise { id: string; name: string; zone: string; img: string[]; sets: number; reps: string; rest: number; tip: string; known: boolean }
export interface ZoneSession { label: string; emoji: string; type: 'push' | 'pull' | 'legs' | 'cardio' | 'upper' | 'core'; zones: string[]; minutes: number; exercises: ZoneExercise[]; finisher: string | null; notes: string[] }
interface ZoneDef { id: string; label: string; group: string }
interface ZonesResp { zones: ZoneDef[]; goals: Record<ZoneGoal, { label: string; emoji: string }>; mine: Record<string, { goal: ZoneGoal; note?: string; at: number }> }
interface PlanResp { plan: { summary: string; seen: string; focus: { zones: string[]; why: string; split: string }; exercises: Array<{ id: string; name: string; sets: number; reps: string; why: string; img: string }>; eta: string; ideas: string[]; warning?: string } | null; adapt: string | null }

// calque wger → zone (vue de face / de dos) ; l'ordre compte : les petits muscles d'abord pour le toucher
const LAYERS: Record<'f' | 'b', Array<[number, string]>> = {
  f: [[13, 'biceps'], [1, 'biceps'], [3, 'obliques'], [2, 'epaules'], [4, 'pecs'], [14, 'obliques'], [6, 'abdos'], [10, 'quadriceps'], [15, 'mollets'], [7, 'mollets']],
  b: [[5, 'triceps'], [9, 'trapezes'], [2, 'epaules'], [4, 'milieu_dos'], [16, 'lombaires'], [12, 'dorsaux'], [8, 'fessiers'], [11, 'ischios'], [15, 'mollets'], [7, 'mollets']],
};
const GROUP_OF: Record<string, string> = { pecs: 'pecs', epaules: 'epaules', biceps: 'bras', triceps: 'bras', avantbras: 'bras', abdos: 'abdos', obliques: 'abdos', cou: 'abdos', trapezes: 'dos', dorsaux: 'dos', milieu_dos: 'dos', lombaires: 'dos', fessiers: 'jambes', quadriceps: 'jambes', ischios: 'jambes', mollets: 'jambes', adducteurs: 'jambes', abducteurs: 'jambes' };
const recColor = (pct: number) => pct >= 100 ? 'hue-rotate(115deg) saturate(0.9)' : pct >= 60 ? 'hue-rotate(40deg) saturate(1.8) brightness(1.2)' : 'none';
const SEL = 'hue-rotate(205deg) saturate(2.2) brightness(1.25)';

const imgs = new Map<number, HTMLImageElement>();
const layerImg = (n: number) => { let i = imgs.get(n); if (!i) { i = new Image(); i.src = `${BASE}/main/muscle-${n}.svg`; imgs.set(n, i); } return i; };

function Figure({ side, h, sel, rec, onTap }: { side: 'f' | 'b'; h: number; sel: string[]; rec: Record<string, number>; onTap: (zone: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { for (const [n] of LAYERS[side]) layerImg(n); }, [side]);
  const tap = (ev: React.MouseEvent) => {
    const el = box.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), hh = Math.round(r.height);
    const x = Math.round(ev.clientX - r.left), y = Math.round(ev.clientY - r.top);
    const c = document.createElement('canvas'); c.width = w; c.height = hh;
    const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return;
    // on cherche le muscle sous le doigt, puis de plus en plus loin (doigt ≈ 10 px)
    for (const rad of [0, 4, 8, 13]) {
      for (const [n, zone] of LAYERS[side]) {
        const im = layerImg(n); if (!im.complete) continue;
        g.clearRect(0, 0, w, hh); g.drawImage(im, 0, 0, w, hh);
        const pts = rad ? [[x - rad, y], [x + rad, y], [x, y - rad], [x, y + rad]] : [[x, y]];
        if (pts.some(([px, py]) => px! >= 0 && py! >= 0 && px! < w && py! < hh && g.getImageData(px!, py!, 1, 1).data[3]! > 30)) { vibrate(12); onTap(zone); return; }
      }
    }
  };
  return (
    <div ref={box} onClick={tap} style={{ position: 'relative', height: h, aspectRatio: '200 / 369', cursor: 'pointer', touchAction: 'manipulation' }}>
      <img src={`${BASE}/muscular_system_${side === 'f' ? 'front' : 'back'}.svg`} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      {LAYERS[side].map(([n, zone]) => (
        <img key={n} src={`${BASE}/main/muscle-${n}.svg`} alt="" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', filter: sel.includes(zone) ? SEL : recColor(rec[GROUP_OF[zone] ?? ''] ?? 100), opacity: sel.includes(zone) ? 1 : 0.8, transition: 'filter .2s' }} />
      ))}
      <div style={{ position: 'absolute', bottom: -2, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: F.muted, pointerEvents: 'none' }}>{side === 'f' ? 'Face' : 'Dos'}</div>
    </div>
  );
}

export function BodyZones({ rec, onStart, toast }: { rec: Array<{ muscle: string; pct: number }>; onStart: (z: ZoneSession) => void; toast: (t: string) => void }) {
  const [defs, setDefs] = useState<ZonesResp | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [min, setMin] = useState(60);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<ZoneSession | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [plan, setPlan] = useState<PlanResp | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  useEffect(() => { get<ZonesResp>('/api/forme/zones').then(setDefs).catch(() => {}); }, []);
  const recBy = useMemo(() => Object.fromEntries(rec.map(r => [r.muscle, r.pct])), [rec]);
  const lab = (id: string) => defs?.zones.find(z => z.id === id)?.label.replace(/ \(.*\)$/, '') ?? id;
  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const create = async () => {
    setBusy('séance');
    try { const r = await postJson<{ session: ZoneSession }>('/api/forme/zones/workout', { zones: sel, minutes: min }); setPreview(r.session); }
    catch (e) { toast(errText(e)); } finally { setBusy(''); }
  };
  const tired = sel.filter(id => (recBy[GROUP_OF[id] ?? ''] ?? 100) < 60);
  const goals = defs?.mine ?? {};
  return (
    <>
      <div style={{ fontSize: 13, color: F.muted, margin: '-4px 2px 8px' }}>Touche un ou plusieurs muscles → je te fais la séance. Couleur = récupération, <b style={{ color: '#4f8dff' }}>bleu</b> = choisi.</div>
      <div style={{ ...card }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 22, direction: 'ltr', paddingBottom: 12 }}>
          <Figure side="f" h={230} sel={sel} rec={recBy} onTap={toggle} />
          <Figure side="b" h={230} sel={sel} rec={recBy} onTap={toggle} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: F.muted, marginTop: 4 }}>
          <span><b style={{ color: F.green }}>●</b> Prêt</span><span><b style={{ color: F.gold }}>●</b> Bientôt</span><span><b style={{ color: F.red }}>●</b> Fatigué</span><span><b style={{ color: '#4f8dff' }}>●</b> Choisi</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 12, color: F.muted }}>Tous les muscles</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {(defs?.zones ?? []).map(z => { const on = sel.includes(z.id); const g = goals[z.id]; return (
            <button key={z.id} onClick={() => { vibrate(8); toggle(z.id); }} style={{ border: 'none', borderRadius: 999, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: on ? '#2f6bff' : F.bg, color: on ? '#fff' : F.ink }}>
              {g ? `${defs!.goals[g.goal]?.emoji ?? ''} ` : ''}{z.label.replace(/ \(.*\)$/, '')}
            </button>); })}
        </div>
        {sel.length > 0 && <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: F.bg }}>
          <div style={{ fontWeight: 700 }}>{sel.map(lab).join(' + ')}</div>
          {tired.length > 0 && <div style={{ fontSize: 12.5, color: F.gold, marginTop: 4 }}>⚠️ {tired.map(lab).join(', ')} pas encore récupéré{tired.length > 1 ? 's' : ''} : vas-y plus léger ou choisis un autre muscle.</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{[30, 45, 60, 75].map(m => <button key={m} onClick={() => setMin(m)} style={{ flex: 1, border: 'none', borderRadius: 10, padding: '8px 0', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: min === m ? F.ink : 'var(--f-card)', color: min === m ? 'var(--f-bg)' : F.ink }}>{m} min</button>)}</div>
          <button onClick={() => void create()} disabled={!!busy} style={{ ...btn, width: '100%', marginTop: 10 }}>{busy === 'séance' ? <Spinner size={18} color="#fff" /> : <><Ico e="🎯" />Créer ma séance</>}</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setGoalOpen(true)} style={{ ...ghostBtn, flex: 1 }}><Ico e="📝" />Mon objectif ici</button>
            <button onClick={() => setSel([])} style={{ ...ghostBtn }}>Effacer</button>
          </div>
        </div>}
        {Object.keys(goals).length > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: F.muted }}>Ce que tu veux par zone</div>
          {Object.entries(goals).map(([id, g]) => <div key={id} style={{ fontSize: 13, marginTop: 4 }}>{defs?.goals[g.goal]?.emoji} <b>{lab(id)}</b> : {defs?.goals[g.goal]?.label.toLowerCase()}{g.note ? ` — « ${g.note} »` : ''}</div>)}
        </div>}
        <button onClick={() => setPlanOpen(true)} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}><Ico e="🧬" />Mon programme sur mesure (photos + objectifs)</button>
      </div>

      <GoalSheet open={goalOpen} zones={sel} defs={defs} lab={lab} onClose={() => setGoalOpen(false)} onSaved={mine => { setDefs(d => d ? { ...d, mine } : d); toast('✅ Objectif noté — tes séances et ton programme en tiennent compte'); }} toast={toast} />

      <Sheet open={!!preview} onClose={() => setPreview(null)} z={60} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>🎯 {preview?.label}</div>}>
        {preview && <>
          <div style={{ fontSize: 13, color: F.muted }}>{preview.exercises.length} exercices · ~{preview.minutes} min · les exercices que tu connais déjà passent en premier</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {preview.exercises.map((e, k) => (
              <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: F.bg, borderRadius: 14, padding: 8 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: '#fff', flexShrink: 0, overflow: 'hidden' }}><Img src={e.img[0]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{k + 1}. {e.name}</div>
                  <div style={{ fontSize: 12, color: F.muted }}>{lab(e.zone)} · {e.sets} × {e.reps} · repos {e.rest} s{e.known ? ' · ✓ déjà fait' : ''}</div>
                </div>
              </div>
            ))}
          </div>
          {preview.finisher && <div style={{ fontSize: 13.5, marginTop: 10, fontWeight: 600 }}>{preview.finisher}</div>}
          {preview.notes.map((n, i) => <div key={i} style={{ fontSize: 12.5, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>💡 {n}</div>)}
          <button onClick={() => { const z = preview; setPreview(null); onStart(z); }} style={{ ...btn, width: '100%', marginTop: 14 }}>▶ Démarrer cette séance</button>
          <button onClick={() => void create()} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>{busy ? '…' : '🔀 Autres exercices'}</button>
        </>}
      </Sheet>

      <Sheet open={planOpen} onClose={() => setPlanOpen(false)} z={60} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>🧬 Programme sur mesure</div>}>
        {!plan && busy !== 'plan' && <>
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>Je regarde tes dernières <b>photos de suivi</b> (Progrès → Photos), ton poids, tes séances et <b>ce que tu veux par zone</b>, puis je refais ton programme de la semaine (agenda + FORME).</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>Pour un résultat juste : photos de face, de dos et de profil récentes, même lumière. ~1 minute.</div>
          <button onClick={async () => { setBusy('plan'); try { setPlan(await postJson<PlanResp>('/api/forme/zones/program', {})); } catch (e) { toast(errText(e)); } finally { setBusy(''); } }} style={{ ...btn, width: '100%', marginTop: 14 }}>Faire mon programme</button>
        </>}
        {busy === 'plan' && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 30 }}><Spinner size={28} /><div style={{ fontWeight: 600 }}>J'analyse tes photos et tes objectifs…</div><div style={{ fontSize: 12.5, color: F.muted }}>~1 minute</div></div>}
        {plan?.plan && <>
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>{plan.plan.summary}</div>
          {plan.plan.warning && <div style={{ fontSize: 13, color: F.gold, marginTop: 8 }}>⚠️ {plan.plan.warning}</div>}
          <div style={{ fontWeight: 700, marginTop: 12 }}><Ico e="🎯" />Priorités</div>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>{plan.plan.focus.why}</div>
          <div style={{ fontWeight: 700, marginTop: 12 }}><Ico e="📅" />Ta semaine</div>
          <div style={{ fontSize: 13.5, marginTop: 4 }}>{plan.plan.focus.split}</div>
          <div style={{ fontWeight: 700, marginTop: 12 }}><Ico e="🏋️" />Exercices clés</div>
          {plan.plan.exercises.map(e => <div key={e.id} style={{ fontSize: 13, marginTop: 4 }}>• <b>{e.name}</b> {e.sets} × {e.reps} — {e.why}</div>)}
          {plan.plan.ideas.length > 0 && <><div style={{ fontWeight: 700, marginTop: 12 }}><Ico e="💡" />À savoir</div>{plan.plan.ideas.map((x, i) => <div key={i} style={{ fontSize: 13, marginTop: 4 }}>• {x}</div>)}</>}
          {plan.adapt && <div style={{ fontSize: 13, marginTop: 12, whiteSpace: 'pre-wrap', background: F.bg, borderRadius: 12, padding: 10 }}>{plan.adapt}</div>}
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 10 }}>Résultat visible vers le {plan.plan.eta.slice(8)}/{plan.plan.eta.slice(5, 7)} si tu suis le plan. Tout est aussi dans Progrès → Mes objectifs.</div>
        </>}
      </Sheet>
    </>
  );
}

function GoalSheet({ open, zones, defs, lab, onClose, onSaved, toast }: { open: boolean; zones: string[]; defs: ZonesResp | null; lab: (id: string) => string; onClose: () => void; onSaved: (m: ZonesResp['mine']) => void; toast: (t: string) => void }) {
  const [goal, setGoal] = useState<ZoneGoal | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { const g = zones.map(z => defs?.mine[z]).find(Boolean); setGoal(g?.goal ?? null); setNote(g?.note ?? ''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (gl: ZoneGoal | null) => {
    setBusy(true);
    try { const r = await postJson<{ mine: ZonesResp['mine'] }>('/api/forme/zones/goals', { zones, goal: gl, note }); onSaved(r.mine); onClose(); } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} z={65} title={<div style={{ fontSize: 20, fontWeight: 700, paddingTop: 6 }}>📝 Ce que tu veux : {zones.map(lab).join(' + ')}</div>}>
      <div style={{ display: 'grid', gap: 8 }}>
        {defs && (Object.entries(defs.goals) as Array<[ZoneGoal, { label: string; emoji: string }]>).map(([id, g]) => (
          <button key={id} onClick={() => setGoal(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, border: goal === id ? `2px solid ${F.accent}` : `1px solid ${F.line}`, background: 'var(--f-card)', color: F.ink, fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start' }}>
            <span style={{ fontSize: 20 }}>{g.emoji}</span>{g.label}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Avec tes mots (ex. « je veux que le ventre soit plat », « bras plus épais »)" rows={2} style={{ ...input, marginTop: 12, resize: 'none' }} />
      {goal === 'gras' && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>💡 Le gras ne part pas d'une seule zone en la travaillant : il part partout avec le déficit (repas, pas, cardio). Tes séances de cette zone auront plus de répétitions + un finisher cardio, et le muscle dessous sera prêt quand le gras partira.</div>}
      <button disabled={!goal || busy} onClick={() => void save(goal)} style={{ ...btn, width: '100%', marginTop: 12, opacity: goal ? 1 : 0.5 }}>{busy ? '…' : 'Enregistrer'}</button>
      {zones.some(z => defs?.mine[z]) && <button onClick={() => void save(null)} style={{ ...ghostBtn, width: '100%', marginTop: 8, color: F.red }}>Retirer l'objectif</button>}
    </Sheet>
  );
}
