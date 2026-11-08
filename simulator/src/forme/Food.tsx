import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, compressImage, vibrate, type FoodBudget, type FoodCfg, type MealLog, type FoodPart, type FoodDay } from './api.ts';
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
  // 02/11 : brûlé en direct → recalculé toutes les minutes et à chaque retour sur l'appli
  useEffect(() => { const t = setInterval(() => void load(), 60_000); const f = () => void load(); window.addEventListener('focus', f); return () => { clearInterval(t); window.removeEventListener('focus', f); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 02/11 : glucides / lipides avec fourchette min–max du jour (Kouider : « il me dit pas le max et min »)
  const range = (l: string, v: number, min: number, max: number, color: string) => {
    const st = v > max ? { t: `⚠️ +${v - max} g au-dessus`, c: '#ff8a80' } : v >= min ? { t: '✅ dans la fourchette', c: '#8ff0b8' } : { t: `encore ${min - v} à ${max - v} g`, c: 'rgba(255,255,255,0.65)' };
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{l}</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{v} g<span style={{ fontSize: 12, opacity: 0.6, fontWeight: 500 }}> / {min}–{max}</span></div>
        <div style={{ marginTop: 5 }}><Bar value={v} max={max} color={v > max ? '#ff8a80' : color} /></div>
        <div style={{ fontSize: 11, marginTop: 4, color: st.c, lineHeight: 1.3 }}>{st.t}</div>
      </div>
    );
  };

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
            <div style={{ opacity: 0.75 }}>{b.burnedNow != null ? <>Brûlé à {b.asOf} : <b style={{ color: '#ffb38a' }}>{b.burnedNow}</b> · journée ≈ {b.burn}</> : <>Dépense {b.burn} kcal</>}</div>
            <div style={{ opacity: 0.75 }}>{bulk ? `Surplus visé +${b.surplus} kcal (prise de masse)` : `Objectif : déficit d'au moins ${b.deficit} kcal`}</div>
            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: over || late ? (late ? '#ffd27a' : '#ff8a80') : near ? '#ffd27a' : '#8ff0b8' }}>{bulk ? (b.left <= 0 ? '✅ Objectif atteint : tu construis du muscle' : late ? `⚠️ Il te manque ${b.left} kcal ce soir — mange encore !` : `💪 Encore ${b.left} kcal à manger aujourd'hui`) : over ? '⚠️ Déficit dépassé' : near ? '⚠️ Bientôt la limite — garde de la place pour ce soir' : '✅ Tu es dans ton déficit'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {macro('Protéines', b.eaten.p, b.proteinGoal, '#7fb2ff')}
          {b.macros ? range('Glucides', b.eaten.c, b.macros.carbMin, b.macros.carbMax, '#ffd27a') : macro('Glucides', b.eaten.c, null, '#ffd27a')}
          {b.macros ? range('Lipides', b.eaten.f, b.macros.fatMin, b.macros.fatMax, '#ff9f80') : macro('Lipides', b.eaten.f, null, '#ff9f80')}
        </div>
        {b.macros && <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 8 }}>Fourchettes pour {b.target} kcal : lipides 0,8 g/kg à 35 % des kcal (jamais moins, hormones) · glucides = le reste.</div>}
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 12 }}>Base {b.bmr} + activité {b.active} kcal, {SRC[b.activeSource]}.</div>
      </div>

      {!bulk && <DeficitCard b={b} me={o.uid === 'kouider'} onRefresh={() => void load()} />}

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

      <WeekHistory onOpen={setOpen} />

      <MealSheet meal={open} onClose={() => setOpen(null)} onBudget={nb => { if (nb.date === b.date) setB(nb); else void load(); setOpen(null); toast('✅ Repas mis à jour'); }} />
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

// 🔥 Déficit RÉEL (Kouider 01/11 : « il me dit pas combien de calories je brûle, je sais pas si j'atteins mon déficit »)
// Brûlé (base + montre) − mangé = déficit réel, comparé au déficit visé ; s'il manque des kcal → circuit maison chiffré.
type BurnPlan = NonNullable<Awaited<ReturnType<typeof forme.foodBurn>>['plan']>;
function DeficitCard({ b, me, onRefresh }: { b: FoodBudget; me: boolean; onRefresh: () => void }) {
  const [plan, setPlan] = useState<BurnPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const real = b.burn - b.eaten.kcal, goal = b.deficit, missing = Math.max(0, goal - real), ok = missing <= 30;
  const now = b.burnedNow ?? b.burn, realNow = now - b.eaten.kcal;   // 02/11 : chiffres EN DIRECT ; « ok » reste jugé sur la journée entière
  const measured = b.activeSource === 'montre';
  useEffect(() => {   // retour du Raccourci Santé → on recharge
    const f = () => { if (document.visibilityState === 'visible') onRefresh(); };
    document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f);
  }, [onRefresh]);
  const showPlan = async () => { setBusy(true); try { setPlan((await forme.foodBurn()).plan); } catch { /* garde l'écran */ } finally { setBusy(false); } };
  const cell = (label: string, v: string, color?: string) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: F.muted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? F.ink }}>{v}</div>
    </div>
  );
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>🔥 Calories brûlées aujourd'hui{b.asOf ? <span style={{ fontSize: 12.5, fontWeight: 500, color: F.muted }}> · en direct {b.asOf}</span> : null}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {cell('Brûlé jusqu\'ici', String(now), '#e8590c')}
        <div style={{ color: F.muted, fontWeight: 700 }}>−</div>
        {cell('Mangé', String(b.eaten.kcal))}
        <div style={{ color: F.muted, fontWeight: 700 }}>=</div>
        {cell(`Déficit à ${b.asOf ?? 'maintenant'}`, realNow >= 0 ? String(realNow) : `+${-realNow}`, realNow >= 0 ? F.green : F.red)}
      </div>
      {b.burnedNow != null && b.eaten.kcal === 0 && (b.asOf ?? '99') < '12:00' && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>Normal le matin : même en dormant ton corps brûle ≈ {Math.round(b.bmr / 24)} kcal/h depuis minuit. Ce chiffre n'est pas ton déficit du jour : celui qui compte, c'est ce soir.</div>}
      <div style={{ marginTop: 10 }}><Bar value={Math.max(0, real)} max={Math.max(1, goal)} color={ok ? F.green : '#e8590c'} /></div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 8, color: ok ? F.green : F.red }}>
        {b.burnedNow != null && <div style={{ fontSize: 12.5, color: F.muted, fontWeight: 500, marginBottom: 2 }}>Ce soir si tu ne manges plus rien : {b.burn} brûlées − {b.eaten.kcal} mangées = {real >= 0 ? real : `+${-real}`} kcal de déficit</div>}
        {ok ? (b.left > 0 ? `✅ Objectif atteint. Si tu manges tes ${b.left} kcal restantes, ton déficit retombe à ${goal} kcal : c'est ton minimum, pile dans l'objectif.` : `✅ Déficit du jour : ${real} kcal (objectif ${goal})`) : real < 0 ? `⚠️ Tu as mangé ${-real} kcal de plus que ta dépense — il manque ${missing} kcal pour ton déficit` : `⚠️ Déficit ${real} / ${goal} kcal — il manque ${missing} kcal`}
      </div>
      <div style={{ fontSize: 12, color: F.muted, marginTop: 4 }}>{b.burnedNow != null ? `Jusqu'ici : ${b.burnedNow - (b.activeNow ?? 0)} kcal brûlées par ton corps seul depuis minuit (même en dormant) + ${b.activeNow ?? 0} d'activité (${b.nowSource === 'montre' ? 'montre ⌚' : 'estimée, la montre précise quand elle envoie'}). ` : ''}Journée : base {b.bmr} + activité {b.active} kcal — {measured ? 'mesurée par ta montre ⌚' : 'estimation : ta montre n\'a pas encore envoyé ta journée'}.</div>
      {me && !measured && <a href={`shortcuts://run-shortcut?name=${encodeURIComponent('Dzaryx Santé')}`} style={{ ...ghostBtn, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 10, color: F.ink }}>⌚ Mettre à jour avec ma montre</a>}
      {!ok && !plan && <button onClick={() => void showPlan()} disabled={busy} style={{ ...btn, width: '100%', marginTop: 10 }}>{busy ? '…' : '🏠 Exercices maison pour l\'atteindre'}</button>}
      {plan && (
        <div style={{ marginTop: 12, background: F.bg, borderRadius: 16, padding: 12 }}>
          <div style={{ fontWeight: 700 }}>{plan.rounds} tour{plan.rounds > 1 ? 's' : ''} de 5 min = {plan.minutes} min ≈ {plan.rounds * plan.perRound} kcal</div>
          {plan.circuit.map((c, i) => <div key={i} style={{ fontSize: 13.5, marginTop: 6 }}><b>{i + 1}. {c.name}</b><br /><span style={{ color: F.muted }}>{c.how}</span></div>)}
          <div style={{ fontSize: 13, marginTop: 8 }}>30 s pour boire entre deux tours. Ou : {plan.walkMin} min de marche rapide dehors.</div>
          {plan.capped && <div style={{ fontSize: 13, marginTop: 6, color: F.muted }}>Il manque plus que ce qu'on brûle raisonnablement ce soir : fais les {plan.minutes} min, le reste n'est pas grave, demain on reprend (ne saute pas de repas).</div>}
          <div style={{ fontSize: 12, marginTop: 6, color: F.muted }}>Douleur au dos ou vertige → stop.</div>
        </div>
      )}
    </div>
  );
}

// 04/11 : « Ma semaine » — les 7 derniers jours ; un appui = les plats de ce jour-là (modifiables comme aujourd'hui)
const DAYS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
function WeekHistory({ onOpen }: { onOpen: (m: MealLog) => void }) {
  const [w, setW] = useState<{ days: FoodDay[]; avgReal: number | null; logged: number } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealLog[] | null>(null);
  useEffect(() => { forme.foodWeek().then(setW).catch(() => setW(null)); }, []);
  useEffect(() => { setMeals(null); if (day) forme.food(day).then(r => setMeals(r.budget.meals)).catch(() => setMeals([])); }, [day]);
  if (!w) return null;
  const label = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${DAYS_FR[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`; };
  return (
    <>
      <div style={{ fontSize: 19, fontWeight: 700, margin: '22px 2px 10px' }}>Ma semaine</div>
      <div style={{ ...card, padding: 14 }}>
        {w.avgReal != null && <div style={{ fontSize: 13.5, marginBottom: 10 }}>Moyenne sur {w.logged} jour{w.logged > 1 ? 's' : ''} noté{w.logged > 1 ? 's' : ''} : <b style={{ color: w.avgReal >= 0 ? F.green : F.red }}>{w.avgReal >= 0 ? `déficit ${w.avgReal}` : `surplus ${-w.avgReal}`} kcal/jour</b></div>}
        {w.days.map(d => {
          const ok = d.mode === 'deficit' ? d.real >= d.goal : -d.real >= d.goal;
          return (
            <button key={d.date} onClick={() => d.meals && setDay(d.date)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', border: 'none', borderTop: `1px solid ${F.tile}`, background: 'none', fontFamily: 'inherit', color: F.ink, textAlign: 'left', cursor: d.meals ? 'pointer' : 'default' }}>
              <div style={{ width: 74, fontWeight: 650, fontSize: 14 }}>{d.today ? "Aujourd'hui" : label(d.date)}</div>
              {d.meals ? (
                <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: F.muted }}>mangé {d.eaten} · brûlé {d.burn}{d.measured ? ' ⌚' : ''}<br />protéines {d.p}/{d.proteinGoal} g · {d.meals} repas</div>
              ) : <div style={{ flex: 1, fontSize: 12.5, color: F.muted }}>aucun repas noté</div>}
              {d.meals > 0 && <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', color: d.today ? F.muted : ok ? F.green : F.red }}>{d.real >= 0 ? `−${d.real}` : `+${-d.real}`}</div>}
            </button>
          );
        })}
        <div style={{ fontSize: 11.5, color: F.muted, marginTop: 6 }}>Chiffre de droite : déficit (−) ou surplus (+) du jour. ⌚ = dépense mesurée par la montre, sinon estimée. Aujourd'hui = en cours.</div>
      </div>
      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? `Repas du ${label(day)}` : ''}>
        {!meals ? <Spinner /> : !meals.length ? <div style={{ color: F.muted }}>Aucun repas.</div> : meals.map(m => (
          <button key={m.id} onClick={() => { setDay(null); onOpen(m); }} style={{ ...card, width: '100%', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: F.ink, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, padding: 10 }}>
            {m.thumb ? <img src={m.thumb} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} /> : <div style={{ fontSize: 24 }}>🍽️</div>}
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, color: F.muted }}>{SLOT[m.slot]} · {m.time}</div><div style={{ fontWeight: 650, fontSize: 14.5 }}>{m.title}</div></div>
            <div style={{ fontWeight: 800 }}>{m.kcal}</div>
          </button>
        ))}
      </Sheet>
    </>
  );
}
