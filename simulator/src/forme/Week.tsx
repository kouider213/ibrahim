import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from './i18n.ts';
import { motion } from 'framer-motion';
import { forme, errText, type Overview, type Recipe, SHORT_DAYS, dayOf, fmtLong, vibrate } from './api.ts';
import { F, Title, Section, card, btn, darkBtn, ghostBtn, Sheet, Img, Spinner, input, Chip } from './ui.tsx';

const SLOT_COLOR: Record<string, string> = { 'petit-déj': F.gold, 'déjeuner': F.accent, 'collation': F.violet, 'dîner': F.blue };

export function MealRow({ r, slot, eaten, onToggle, onOpen }: { r: Recipe; slot: string; eaten: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: 10, marginBottom: 10, opacity: eaten ? 0.72 : 1 }}>
      <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}>
        <Img src={`${r.photo}/small`} style={{ width: 64, height: 64, borderRadius: 16, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: SLOT_COLOR[slot] ?? F.accent }}>{slot}</div>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textDecoration: eaten ? 'line-through' : 'none' }}>{r.title}</div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 3 }}>{r.minutes} min · {r.kcal} kcal · <b style={{ color: F.ink }}>{r.p} g prot.</b></div>
        </div>
      </button>
      <motion.button whileTap={{ scale: 0.85 }} aria-label={eaten ? 'Décocher' : "J'ai mangé"} onClick={() => { vibrate(20); onToggle(); }}
        style={{ width: 40, height: 40, borderRadius: 20, flexShrink: 0, border: eaten ? 'none' : `2px solid ${F.line}`, background: eaten ? F.green : '#fff', color: '#fff', fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>{eaten ? '✓' : ''}</motion.button>
    </div>
  );
}

// Quantités × portions (« 150 g » → « 300 g » pour 2) — pour cuisiner pour toute la famille
const scaleQty = (q: string, k: number) => k === 1 ? q : q.replace(/(\d+(?:[.,]\d+)?)/, n => { const v = Number(n.replace(',', '.')) * k; return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ','); });

function CookMode({ r, onClose }: { r: Recipe; onClose: () => void }) {
  const [i, setI] = useState(0);
  const ar = document.documentElement.lang === 'ar';
  const read = (t: string) => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = ar ? 'ar-SA' : 'fr-FR'; u.rate = 0.95; speechSynthesis.speak(u); } catch { /* */ } };
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    void (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); try { speechSynthesis.cancel(); } catch { /* */ } };
  }, []);
  useEffect(() => { read(tr(r.steps[i] ?? '')); }, [i]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: F.dark, color: '#fff', display: 'flex', flexDirection: 'column', padding: 'calc(16px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 800, color: F.accent2 }}>👩‍🍳 {i + 1} / {r.steps.length}</div>
        <button onClick={onClose} style={{ ...ghostBtn, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none' }}>✕</button>
      </div>
      <div style={{ fontSize: 15, opacity: 0.6, marginTop: 8 }}>{r.title}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800, lineHeight: 1.3 }}>{r.steps[i]}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <button disabled={i === 0} onClick={() => setI(i - 1)} style={{ ...ghostBtn, padding: '18px 0', fontSize: 18, opacity: i ? 1 : 0.4 }}>←</button>
        <button onClick={() => read(tr(r.steps[i] ?? ''))} style={{ ...ghostBtn, padding: '18px 0', fontSize: 18 }}>🔊</button>
        <button onClick={() => i < r.steps.length - 1 ? setI(i + 1) : onClose()} style={{ ...btn, padding: '18px 0', fontSize: 18 }}>{i < r.steps.length - 1 ? '→' : '✓'}</button>
      </div>
    </div>
  );
}

export function RecipeSheet({ r, monday, eaten, onToggle, onClose, onWeek, fav, onFav, padBottom }: { r: Recipe | null; monday: string; eaten?: boolean; onToggle?: () => void; onClose: () => void; onWeek: (w: NonNullable<Overview['week']>) => void; fav?: boolean; onFav?: () => void; padBottom?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [wish, setWish] = useState('');
  const [k, setK] = useState(1);
  const [cook, setCook] = useState(false);
  const swap = async () => {
    if (!r) return;
    setBusy(true);
    try { const { week } = await forme.swap(monday, r.id, wish); onWeek(week); setWish(''); } catch (e) { alert(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!r} onClose={onClose}>
      {r && <>
        <div style={{ position: 'relative', margin: '0 -18px', height: 250, overflow: 'hidden' }}>
          <Img src={r.photo} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 55%, rgba(0,0,0,0.55))' }} />
          <div style={{ position: 'absolute', left: 18, bottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['☪️ halal', ...r.tags].map(t => <span key={t} style={{ background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 700 }}>{t}</span>)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><div style={{ flex: 1 }}><Title a={r.title} size={24} /></div>{onFav && <button onClick={onFav} aria-label="Favori" style={{ ...ghostBtn, width: 46, height: 46, padding: 0, borderRadius: 23, fontSize: 22, marginTop: 6 }}>{fav ? '❤️' : '🤍'}</button>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[{ v: r.kcal, l: 'kcal', c: F.accent }, { v: `${r.p} g`, l: 'protéines', c: F.green }, { v: `${r.c} g`, l: 'glucides', c: F.gold }, { v: `${r.f} g`, l: 'lipides', c: F.blue }].map(x => (
            <div key={x.l} style={{ ...card, padding: '10px 6px', textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 900, color: x.c }}>{x.v}</div><div style={{ fontSize: 11, color: F.muted, fontWeight: 700 }}>{x.l}</div></div>
          ))}
        </div>
        {r.tip && <div style={{ ...card, marginTop: 12, background: F.soft, boxShadow: 'none', fontSize: 14, lineHeight: 1.45 }}>💡 {r.tip}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, alignItems: 'center' }}><span style={{ fontWeight: 800, fontSize: 14 }}>Pour</span>{[1, 2, 3, 4].map(n => <Chip key={n} on={k === n} onClick={() => setK(n)}>{n === 1 ? '1 pers.' : `${n} pers.`}</Chip>)}</div>
        <Section a="Ingrédients" right={`${r.minutes} min`} />
        <div style={{ ...card, padding: '4px 14px' }}>
          {r.ingredients.map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < r.ingredients.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14.5 }}><span>{x.name}</span><b>{scaleQty(x.qty, k)}</b></div>)}
        </div>
        <Section a="La" b="recette" />
        {r.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: F.dark, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.45, paddingTop: 4 }}>{s}</div>
          </div>
        ))}
        <button onClick={() => setCook(true)} style={{ ...darkBtn, width: '100%', marginTop: 6 }}>👩‍🍳 Mode cuisine (pas à pas, à voix haute)</button>
        {cook && <CookMode r={r} onClose={() => setCook(false)} />}
        {padBottom && <div style={{ height: 150 }} />}
        {onToggle && <button onClick={() => { onToggle(); onClose(); }} style={{ ...btn, width: '100%', marginTop: 10, background: eaten ? F.dark : F.accent }}>{eaten ? 'Décocher ce repas' : "✓ J'ai mangé ce repas"}</button>}
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>🔄 Pas envie ? Une autre recette, mêmes macros</div>
          <input value={wish} onChange={e => setWish(e.target.value)} placeholder="Envie de… (ex. poisson, épicé, rapide)" style={input} />
          <button disabled={busy} onClick={swap} style={{ ...ghostBtn, width: '100%', marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>{busy ? <><Spinner size={16} /> Claude cherche…</> : 'Remplacer cette recette'}</button>
        </div>
      </>}
    </Sheet>
  );
}

export default function WeekScreen({ o, onLog, onWeek, onFav, onO, toast }: { o: Overview; onLog: (kind: string, body: Record<string, unknown>) => void; onWeek: (w: NonNullable<Overview['week']>) => void; onFav: (r: Recipe) => void; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const w = o.week;
  const [sel, setSel] = useState(() => w?.days.find(d => d.date === o.today)?.date ?? w?.days[0]?.date ?? o.today);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!w) return (
    <div style={{ padding: 18 }}>
      <Title a="Ta" b="semaine" sub="Aucune semaine composée pour l'instant." />
      <button disabled={busy} onClick={async () => { setBusy(true); try { onWeek((await forme.makeWeek(true)).week); } catch (e) { alert(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%' }}>{busy ? 'Composition… (~30 s)' : 'Composer ma semaine'}</button>
    </div>
  );
  const day = w.days.find(d => d.date === sel);
  const recipe = (id: string) => w.recipes.find(r => r.id === id);
  const tot = (day?.meals ?? []).reduce((a, m) => { const r = recipe(m.recipe); return r ? { kcal: a.kcal + r.kcal, p: a.p + r.p } : a; }, { kcal: 0, p: 0 });
  const opened = open ? recipe(open.split(':')[0]!) ?? null : null;
  const openedSlot = open?.split(':')[1] ?? '';
  return (
    <div style={{ padding: '6px 18px 0' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: F.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{w.recipes.length} recettes · {w.days.reduce((a, d) => a + d.meals.length, 0)} repas · {w.note}</div>
      <Title a="Ta" b="semaine" />
      {o.favs.length > 0 && <FavStrip o={o} onO={onO} onWeek={onWeek} onFav={onFav} toast={toast} />}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, margin: '0 -18px', padding: '0 18px 4px' }}>
        {w.days.map(d => {
          const on = d.date === sel, done = d.meals.length > 0 && d.meals.every(m => o.day && d.date === o.today ? o.day.meals[`${m.recipe}:${m.slot}`] : false);
          return (
            <button key={d.date} onClick={() => { vibrate(8); setSel(d.date); }} style={{ flexShrink: 0, width: 50, padding: '9px 0', borderRadius: 18, border: on ? `2px solid ${F.accent}` : `1px solid ${F.line}`, background: on ? F.dark : '#fff', color: on ? '#fff' : F.ink, cursor: 'pointer', fontFamily: F.sans }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, opacity: 0.7 }}>{SHORT_DAYS[dayOf(d.date)]}</div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{d.date.slice(8)}</div>
              <div style={{ width: 5, height: 5, borderRadius: 3, margin: '2px auto 0', background: d.date === o.today ? F.accent : done ? F.green : 'transparent' }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 2px 10px' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}><span style={{ textTransform: 'capitalize' }}>{fmtLong(sel).split(' ')[0]}</span> <span style={{ fontFamily: F.serif, fontStyle: 'italic', fontWeight: 400, color: F.accent }}>{sel === o.today ? "aujourd'hui" : fmtLong(sel).split(' ').slice(1).join(' ')}</span></div>
        <div style={{ fontSize: 12.5, color: F.muted, fontWeight: 700 }}>{tot.kcal} kcal · {tot.p} g prot.</div>
      </div>
      {(day?.meals ?? []).map((m, i) => {
        const r = recipe(m.recipe); if (!r) return null;
        const key = `${m.recipe}:${m.slot}`;
        return (
          <motion.div key={key + i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => setOpen(key)} style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 14, cursor: 'pointer' }}>
            <div style={{ position: 'relative', height: 190 }}>
              <Img src={r.photo} style={{ width: '100%', height: '100%' }} />
              <span style={{ position: 'absolute', top: 12, left: 12, background: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: SLOT_COLOR[m.slot] ?? F.accent }}>{m.slot}</span>
              {sel === o.today && o.day.meals[key] && <span style={{ position: 'absolute', top: 12, right: 12, background: F.green, color: '#fff', borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 800 }}>✓ mangé</span>}
            </div>
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>{r.title}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[`${r.minutes} min`, `${r.kcal} kcal`, `P ${r.p} g`, `G ${r.c} g`, `L ${r.f} g`].map(t => <span key={t} style={{ background: F.bg, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>{t}</span>)}
              </div>
            </div>
          </motion.div>
        );
      })}
      <button disabled={busy} onClick={async () => { if (!confirm('Refaire toute la semaine (nouvelles recettes + nouvelle liste de courses) ?')) return; setBusy(true); try { onWeek((await forme.makeWeek(true)).week); } catch (e) { alert(errText(e)); } finally { setBusy(false); } }} style={{ ...ghostBtn, width: '100%', marginTop: 4, display: 'flex', justifyContent: 'center', gap: 8 }}>{busy ? <><Spinner size={16} /> Nouvelle semaine… (~30 s)</> : '🔄 Nouvelle semaine de repas'}</button>
      <RecipeSheet r={opened} monday={w.monday} onClose={() => setOpen(null)} onWeek={onWeek} fav={!!opened && o.favs.some(f => f.title === opened.title)} onFav={opened ? () => onFav(opened) : undefined}
        eaten={sel === o.today && open ? !!o.day.meals[open] : undefined}
        onToggle={sel === o.today && open ? () => onLog('meal', { key: open, eaten: !o.day.meals[open], recipe: openedSlot }) : undefined} />
    </div>
  );
}

/** ❤️ Mes favoris : la recette complète, à refaire quand on veut (dans la journée ou à la place d'un repas de la semaine). */
export function FavSheet({ r, o, onO, onWeek, onClose, onFav, toast }: { r: (Recipe & { savedAt: number }) | null; o: Overview; onO: (o: Overview) => void; onWeek: (w: NonNullable<Overview['week']>) => void; onClose: () => void; onFav: (r: Recipe) => void; toast: (t: string) => void }) {
  const w = o.week;
  const [day, setDay] = useState(o.today);
  const [slot, setSlot] = useState('dîner');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <RecipeSheet r={r} monday={w?.monday ?? ''} onClose={onClose} onWeek={onWeek} fav onFav={r ? () => { onFav(r); onClose(); } : undefined} padBottom />
      {r && createPortal(
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: 'rgba(251,241,236,0.96)', backdropFilter: 'blur(10px)', boxShadow: '0 -8px 24px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>{(w?.days ?? []).map(d => <Chip key={d.date} on={day === d.date} onClick={() => setDay(d.date)}>{d.date === o.today ? "Aujourd'hui" : `${SHORT_DAYS[dayOf(d.date)]} ${d.date.slice(8)}`}</Chip>)}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>{['petit-déj', 'déjeuner', 'collation', 'dîner'].map(x => <Chip key={x} on={slot === x} onClick={() => setSlot(x)}>{x}</Chip>)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || !w} onClick={async () => { setBusy(true); try { onWeek((await forme.place(r.title, day, slot)).week); onO(await forme.overview()); toast('❤️ Remis dans ta semaine'); onClose(); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, flex: 2, padding: '13px 8px', fontSize: 14 }}>📅 Le mettre ce jour-là</button>
            <button onClick={async () => { try { onO(await forme.log('food', { name: r.title, kcal: r.kcal, p: r.p, c: r.c, f: r.f, src: 'favori' })); toast(`🍽️ ${r.kcal} kcal ajoutées`); onClose(); } catch (e) { toast(errText(e)); } }} style={{ ...darkBtn, flex: 1, padding: '13px 8px', fontSize: 14 }}>✓ Mangé</button>
          </div>
        </div>, document.body)}
    </>
  );
}

export function FavList({ o, onO, onWeek, onFav, toast }: { o: Overview; onO: (o: Overview) => void; onWeek: (w: NonNullable<Overview['week']>) => void; onFav: (r: Recipe) => void; toast: (t: string) => void }) {
  const [open, setOpen] = useState<(Recipe & { savedAt: number }) | null>(null);
  if (!o.favs.length) return <div style={{ ...card, color: F.muted, fontSize: 14, lineHeight: 1.45 }}>Aucun favori pour l'instant. Ouvre une recette et touche 🤍 : elle sera gardée ici en entier (photo, ingrédients, étapes) pour la refaire quand tu veux.</div>;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {o.favs.map(f => (
          <button key={f.title} onClick={() => setOpen(f)} style={{ ...card, padding: 0, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
            <Img src={`${f.photo}/small`} style={{ width: '100%', height: 110 }} />
            <div style={{ padding: '8px 10px 10px' }}><div style={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.25 }}>❤️ {f.title}</div><div style={{ fontSize: 12, color: F.muted, marginTop: 3 }}>{f.kcal} kcal · {f.p} g prot. · {f.minutes} min</div></div>
          </button>
        ))}
      </div>
      <FavSheet r={open} o={o} onO={onO} onWeek={onWeek} onClose={() => setOpen(null)} onFav={onFav} toast={toast} />
    </div>
  );
}

function FavStrip({ o, onO, onWeek, onFav, toast }: { o: Overview; onO: (o: Overview) => void; onWeek: (w: NonNullable<Overview['week']>) => void; onFav: (r: Recipe) => void; toast: (t: string) => void }) {
  const [open, setOpen] = useState<(Recipe & { savedAt: number }) | null>(null);
  return (
    <div style={{ margin: '0 -18px 14px', padding: '0 18px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>❤️ Mes favoris <span style={{ color: F.muted, fontWeight: 600, fontSize: 13 }}>· à refaire</span></div>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
        {o.favs.map(f => (
          <button key={f.title} onClick={() => setOpen(f)} style={{ flexShrink: 0, width: 130, ...card, padding: 0, overflow: 'hidden', border: 'none', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
            <Img src={`${f.photo}/small`} style={{ width: '100%', height: 80 }} />
            <div style={{ padding: '6px 8px 8px', fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, height: 34, overflow: 'hidden' }}>{f.title}</div>
          </button>
        ))}
      </div>
      <FavSheet r={open} o={o} onO={onO} onWeek={onWeek} onClose={() => setOpen(null)} onFav={onFav} toast={toast} />
    </div>
  );
}
