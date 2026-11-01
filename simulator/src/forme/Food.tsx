import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, compressImage, vibrate, type FoodBudget, type FoodCfg, type MealLog, type FoodPart } from './api.ts';
import { F, card, darkCard, btn, ghostBtn, input, Ring, Bar, Sheet, Spinner } from './ui.tsx';
import { BulkCard, BulkQuiz } from './Bulk.tsx';
import type { Overview } from './api.ts';

// 🍽️ REPAS (Kouider 31/10, « style Cal AI ») : photo du plat → chaque aliment, grammes, kcal, protéines.
// Le budget vient de sa montre (dépense − déficit) ; Dzaryx commente sur Telegram après chaque photo et toute la journée.
// Une photo reste une estimation (±15-20 %) → chaque aliment se corrige en grammes.
const STEPS = ['Je regarde ton assiette…', 'Je reconnais les aliments…', 'J\'estime les portions…', 'Je calcule les calories…', 'Je compare avec ta montre…'];
const SLOT: Record<MealLog['slot'], string> = { matin: 'Petit-déj', midi: 'Midi', collation: 'Collation', soir: 'Soir' };
const SRC: Record<FoodBudget['activeSource'], string> = { montre: 'mesurée par ta montre', moyenne: 'moyenne de ta montre (14 j)', estimation: 'estimée (pas encore de données montre)' };

export default function FoodScreen({ toast, o, onO }: { toast: (t: string) => void; o: Overview; onO: (o: Overview) => void }) {
  const [quiz, setQuiz] = useState(false);
  const cam = useRef<HTMLInputElement>(null), lib = useRef<HTMLInputElement>(null);
  const [b, setB] = useState<FoodBudget | null>(null);
  const [cfg, setCfg] = useState<FoodCfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [last, setLast] = useState<{ meal: MealLog; message: string } | null>(null);
  const [open, setOpen] = useState<MealLog | null>(null);
  const [text, setText] = useState('');
  const [settings, setSettings] = useState(false);
  const [err, setErr] = useState('');
  const load = () => forme.food().then(r => { setB(r.budget); setCfg(r.cfg); }).catch(e => setErr(errText(e)));
  useEffect(() => { void load(); }, [o.profile.goal, o.profile.bulk?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (file?: File | null) => {
    if (!file) return;
    setErr(''); setLast(null); setBusy(true); setStep(0); vibrate(15);
    const tick = setInterval(() => setStep(s => Math.min(STEPS.length - 1, s + 1)), 3500);
    try {
      const [image, thumb] = await Promise.all([compressImage(file, 1280, 0.82), compressImage(file, 220, 0.6)]);
      setPreview(thumb);
      const r = await forme.foodPhoto(image, thumb, note.trim() || undefined);
      setB(r.budget); setLast({ meal: r.meal, message: r.message }); setNote(''); vibrate(60);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setErr(errText(e)); } finally { clearInterval(tick); setBusy(false); if (cam.current) cam.current.value = ''; if (lib.current) lib.current.value = ''; }
  };
  const byText = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(''); setStep(1);
    try { const r = await forme.foodText(text.trim()); setB(r.budget); setLast({ meal: r.meal, message: r.message }); setText(''); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  if (!b) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>{err ? <div style={{ color: F.red }}>{err}</div> : <Spinner />}</div>;
  const bulk = b.mode === 'surplus';
  // Prise de masse : dépasser = objectif atteint (vert) ; le soir, trop peu mangé = alerte
  const over = !bulk && b.left < 0, near = !bulk && !over && b.pct >= 75;
  const late = bulk && b.left > 0 && new Date().getHours() >= 18 && b.pct < 70;
  const ringColor = over ? F.red : near ? F.gold : bulk && b.left > 0 ? (late ? F.gold : '#5b8cff') : '#3ddc84';
  const macro = (l: string, v: number, goal: number | null, color: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{l}</div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{v} g{goal ? <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 500 }}> / {goal}</span> : null}</div>
      {goal ? <div style={{ marginTop: 5 }}><Bar value={v} max={goal} color={color} /></div> : null}
    </div>
  );

  return (
    <div style={{ padding: '0 14px', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', padding: '4px 2px' }}>Repas</div>
        <button onClick={() => setSettings(true)} aria-label="Réglages" style={{ ...ghostBtn, width: 40, height: 40, padding: 0, borderRadius: 20 }}>⚙️</button>
      </div>
      <div style={{ fontSize: 14, color: F.muted, margin: '0 2px 14px', lineHeight: 1.4 }}>{bulk ? 'Prends ton plat en photo : je compte les calories et les protéines, et je te dis ce qu\'il te reste à manger pour prendre du muscle.' : 'Prends ton plat en photo : je compte les calories et les protéines, et je te dis ce qu\'il te reste pour rester en déficit.'}</div>
      {o.profile.goal === 'muscle' && (o.uid !== 'kouider' || !!o.profile.bulk) && <BulkCard o={o} onO={onO} toast={toast} />}

      {/* Budget du jour */}
      <div style={{ ...darkCard, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Ring value={b.eaten.kcal} max={b.target} size={128} stroke={12} color={ringColor}>
            <div style={{ fontSize: 26, fontWeight: 800, color: over ? '#ff8a80' : '#fff' }}>{bulk && b.left <= 0 ? '✓' : Math.abs(b.left)}</div>
            <div style={{ fontSize: 11.5, opacity: 0.75 }}>{bulk ? (b.left > 0 ? 'kcal à manger' : 'objectif atteint') : over ? 'kcal en trop' : 'kcal restantes'}</div>
          </Ring>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            <div><b>{b.eaten.kcal}</b> / {b.target} kcal mangées</div>
            <div style={{ opacity: 0.75 }}>Dépense {b.burn} kcal</div>
            <div style={{ opacity: 0.75 }}>{bulk ? `Surplus visé +${b.surplus} kcal (prise de masse)` : `Déficit visé ${b.deficit} kcal`}</div>
            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: over || late ? (late ? '#ffd27a' : '#ff8a80') : near ? '#ffd27a' : '#8ff0b8' }}>{bulk ? (b.left <= 0 ? '✅ Objectif atteint : tu construis du muscle' : late ? `⚠️ Il te manque ${b.left} kcal ce soir — mange encore !` : `💪 Encore ${b.left} kcal à manger aujourd'hui`) : over ? '⚠️ Déficit dépassé' : near ? '⚠️ Bientôt la limite — garde de la place pour ce soir' : '✅ Tu es dans ton déficit'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {macro('Protéines', b.eaten.p, b.proteinGoal, '#7fb2ff')}
          {macro('Glucides', b.eaten.c, null, '#ffd27a')}
          {macro('Lipides', b.eaten.f, null, '#ff9f80')}
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 12 }}>Base {b.bmr} + activité {b.active} kcal, {SRC[b.activeSource]}.</div>
      </div>

      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => void go(e.target.files?.[0])} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={e => void go(e.target.files?.[0])} />

      {busy ? (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 24, marginBottom: 14 }}>
          {preview && <img src={preview} alt="" style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 18 }} />}
          <Spinner size={28} />
          <div style={{ fontWeight: 600 }}>{STEPS[step]}</div>
        </div>
      ) : (
        <>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => cam.current?.click()} style={{ width: '100%', border: 'none', cursor: 'pointer', borderRadius: 24, padding: '24px 20px', background: 'linear-gradient(160deg, #1f9d5c, #12795f)', color: '#fff', fontFamily: 'inherit', boxShadow: '0 16px 34px rgba(31,157,92,0.3)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: 30, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 30 }}>📸</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Photo de mon plat</div>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Vue d'en haut, toute l'assiette dans le cadre</div>
            </div>
          </motion.button>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Précision (facultatif) : « 200 g de riz », « sans huile »…" style={{ ...input, marginTop: 10, fontSize: 14 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => lib.current?.click()} style={{ ...ghostBtn, flex: 1 }}>🖼️ Galerie</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void byText(); }} placeholder="Ou écris : « 2 œufs et une tartine »" style={{ ...input, flex: 1, fontSize: 14 }} />
            <button onClick={() => void byText()} disabled={!text.trim()} style={{ ...btn, padding: '0 16px', opacity: text.trim() ? 1 : 0.5 }}>OK</button>
          </div>
        </>
      )}
      {err && <div style={{ ...card, color: F.red, fontWeight: 600, marginTop: 12 }}>{err}</div>}

      {last && (
        <div style={{ ...card, marginTop: 14, borderLeft: `4px solid ${F.green}` }}>
          <div style={{ fontSize: 12, color: F.muted, fontWeight: 600, marginBottom: 6 }}>DZARYX · aussi envoyé sur Telegram</div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{last.message}</div>
          <button onClick={() => setOpen(last.meal)} style={{ ...ghostBtn, marginTop: 10, width: '100%' }}>✏️ Corriger les grammes</button>
        </div>
      )}

      <div style={{ fontSize: 19, fontWeight: 700, margin: '22px 2px 10px' }}>Aujourd'hui</div>
      {!b.meals.length && <div style={{ ...card, color: F.muted, fontSize: 14 }}>Rien de noté pour l'instant. Ton premier plat en photo, et je m'occupe du reste.</div>}
      {[...b.meals].reverse().map(m => (
        <motion.button key={m.id} whileTap={{ scale: 0.99 }} onClick={() => setOpen(m)} style={{ ...card, width: '100%', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: F.ink, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, padding: 12 }}>
          {m.thumb ? <img src={m.thumb} alt="" style={{ width: 58, height: 58, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 58, height: 58, borderRadius: 14, background: F.tile, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>🍽️</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: F.muted }}>{SLOT[m.slot]} · {m.time}</div>
            <div style={{ fontWeight: 650, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
            <div style={{ fontSize: 12.5, color: F.muted }}>P {m.p} g · G {m.c} g · L {m.f} g</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, whiteSpace: 'nowrap' }}>{m.kcal}<span style={{ fontSize: 11, color: F.muted, fontWeight: 500 }}> kcal</span></div>
        </motion.button>
      ))}

      <MealSheet meal={open} onClose={() => setOpen(null)} onBudget={nb => { setB(nb); setOpen(null); toast('✅ Repas mis à jour'); }} />
      <Sheet open={settings} onClose={() => setSettings(false)} title="Réglages calories">
        {cfg && <Settings bulk={bulk} kouider={o.uid === 'kouider'} goalMuscle={o.profile.goal === 'muscle' && o.uid !== 'kouider'} onQuiz={() => { setSettings(false); setQuiz(true); }} cfg={cfg} onSave={async c => { try { const r = await forme.foodCfg(c); setCfg(r.cfg); setB(r.budget); toast('✅ Enregistré'); } catch (e) { toast(errText(e)); } }} />}
      </Sheet>
      <BulkQuiz open={quiz} onClose={() => setQuiz(false)} o={o} onO={onO} toast={toast} />
      <div style={{ height: 24 }} />
    </div>
  );
}

function MealSheet({ meal, onClose, onBudget }: { meal: MealLog | null; onClose: () => void; onBudget: (b: FoodBudget) => void }) {
  const [items, setItems] = useState<FoodPart[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setItems(meal?.items ?? []); }, [meal]);
  if (!meal) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  // Grammes modifiés → kcal et macros recalculées au prorata (la valeur par gramme reste celle de l'analyse)
  const setG = (i: number, g: number) => setItems(list => list.map((x, k) => {
    if (k !== i) return x;
    const base = meal.items[i] ?? x, r = base.grams > 0 ? g / base.grams : 1;
    return { ...x, grams: g, kcal: Math.round(base.kcal * r), p: Math.round(base.p * r), c: Math.round(base.c * r), f: Math.round(base.f * r) };
  }));
  const tot = items.reduce((a, x) => a + x.kcal, 0);
  const save = async (del = false) => {
    setBusy(true);
    try { onBudget((await forme.foodEdit({ date: meal.date, id: meal.id, ...(del ? { del: true } : { items }) })).budget); } catch (e) { alert(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!meal} onClose={onClose} title={meal.title}>
      {meal.thumb && <img src={meal.thumb} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 18, margin: '8px 0 12px' }} />}
      <div style={{ fontSize: 13, color: F.muted, marginBottom: 10 }}>{SLOT[meal.slot]} · {meal.time} · estimation {meal.confidence}{meal.note ? ` · « ${meal.note} »` : ''}</div>
      {items.map((x, i) => (
        <div key={i} style={{ ...card, padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>{x.name}</div>
            <div style={{ fontSize: 12.5, color: F.muted }}>{x.kcal} kcal · P {x.p} · G {x.c} · L {x.f}</div>
          </div>
          <button onClick={() => setG(i, Math.max(0, x.grams - 10))} style={{ ...ghostBtn, width: 34, height: 34, padding: 0 }}>−</button>
          <input value={x.grams} inputMode="numeric" onChange={e => setG(i, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} style={{ ...input, width: 62, padding: '7px 6px', textAlign: 'center', fontSize: 15 }} />
          <span style={{ fontSize: 12, color: F.muted }}>g</span>
          <button onClick={() => setG(i, x.grams + 10)} style={{ ...ghostBtn, width: 34, height: 34, padding: 0 }}>+</button>
        </div>
      ))}
      <div style={{ fontWeight: 700, fontSize: 16, margin: '10px 2px' }}>Total : {tot} kcal</div>
      {meal.coach && <div style={{ ...card, fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{meal.coach}</div>}
      <button disabled={busy} onClick={() => void save()} style={{ ...btn, width: '100%' }}>{busy ? '…' : 'Enregistrer'}</button>
      <button disabled={busy} onClick={() => { if (confirm('Supprimer ce repas ?')) void save(true); }} style={{ ...ghostBtn, width: '100%', marginTop: 8, color: F.red }}>Supprimer ce repas</button>
    </Sheet>
  );
}

function Settings({ cfg, onSave, bulk, kouider, onQuiz, goalMuscle }: { cfg: FoodCfg; onSave: (c: Partial<FoodCfg>) => void; bulk: boolean; kouider: boolean; onQuiz: () => void; goalMuscle: boolean }) {
  const [d, setD] = useState(cfg.deficit);
  return (
    <div style={{ paddingTop: 8 }}>
      {bulk ? <div style={{ ...card, padding: 14, marginBottom: 12 }}><div style={{ fontWeight: 700 }}>💪 Mode prise de masse</div><div style={{ fontSize: 13, color: F.muted, margin: '4px 0 10px' }}>Ton objectif est « Prendre du muscle » : FORME vise un SURPLUS de calories, pas un déficit. Pour changer le rythme, refais le questionnaire.</div><button onClick={onQuiz} style={{ ...btn, width: '100%' }}>Questionnaire prise de masse</button></div> : <>
      {!goalMuscle && !kouider && <button onClick={onQuiz} style={{ ...card, width: '100%', border: 'none', textAlign: 'start', cursor: 'pointer', fontFamily: F.sans, color: F.ink, marginBottom: 12 }}><div style={{ fontWeight: 700 }}>💪 Tu veux prendre du poids / du muscle ?</div><div style={{ fontSize: 13, color: F.muted }}>Fais le questionnaire prise de masse : FORME passe en surplus au lieu du déficit.</div></button>}
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Déficit par jour : {d} kcal</div>
      <div style={{ fontSize: 13, color: F.muted, marginBottom: 8 }}>≈ {(d * 7 / 7700).toFixed(1).replace('.', ',')} kg perdu par semaine. Au-delà de 750 on perd du muscle.</div>
      <input type="range" min={0} max={750} step={50} value={d} onChange={e => setD(Number(e.target.value))} style={{ width: '100%' }} />
      <button onClick={() => onSave({ deficit: d })} style={{ ...btn, width: '100%', marginTop: 12 }}>Enregistrer le déficit</button>
      </>}
      {kouider && <label style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: 14 }}>
        <input type="checkbox" checked={cfg.telegram} onChange={e => onSave({ telegram: e.target.checked })} style={{ width: 22, height: 22 }} />
        <div><div style={{ fontWeight: 600 }}>Messages de Dzaryx sur Telegram</div><div style={{ fontSize: 12.5, color: F.muted }}>Après chaque plat, réveil (sommeil), collations, ce soir, avant de dormir.</div></div>
      </label>}
    </div>
  );
}
