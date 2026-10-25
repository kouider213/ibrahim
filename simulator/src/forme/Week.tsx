import { useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, type Overview, type Recipe, SHORT_DAYS, dayOf, fmtLong, vibrate } from './api.ts';
import { F, Title, Section, card, btn, ghostBtn, Sheet, Img, Spinner, input } from './ui.tsx';

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

export function RecipeSheet({ r, monday, eaten, onToggle, onClose, onWeek }: { r: Recipe | null; monday: string; eaten?: boolean; onToggle?: () => void; onClose: () => void; onWeek: (w: NonNullable<Overview['week']>) => void }) {
  const [busy, setBusy] = useState(false);
  const [wish, setWish] = useState('');
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
        <Title a={r.title} size={24} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[{ v: r.kcal, l: 'kcal', c: F.accent }, { v: `${r.p} g`, l: 'protéines', c: F.green }, { v: `${r.c} g`, l: 'glucides', c: F.gold }, { v: `${r.f} g`, l: 'lipides', c: F.blue }].map(x => (
            <div key={x.l} style={{ ...card, padding: '10px 6px', textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 900, color: x.c }}>{x.v}</div><div style={{ fontSize: 11, color: F.muted, fontWeight: 700 }}>{x.l}</div></div>
          ))}
        </div>
        {r.tip && <div style={{ ...card, marginTop: 12, background: F.soft, boxShadow: 'none', fontSize: 14, lineHeight: 1.45 }}>💡 {r.tip}</div>}
        <Section a="Ingrédients" right={`${r.minutes} min`} />
        <div style={{ ...card, padding: '4px 14px' }}>
          {r.ingredients.map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < r.ingredients.length - 1 ? `1px solid ${F.line}` : 'none', fontSize: 14.5 }}><span>{x.name}</span><b>{x.qty}</b></div>)}
        </div>
        <Section a="La" b="recette" />
        {r.steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: F.dark, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.45, paddingTop: 4 }}>{s}</div>
          </div>
        ))}
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

export default function WeekScreen({ o, onLog, onWeek }: { o: Overview; onLog: (kind: string, body: Record<string, unknown>) => void; onWeek: (w: NonNullable<Overview['week']>) => void }) {
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
      <RecipeSheet r={opened} monday={w.monday} onClose={() => setOpen(null)} onWeek={onWeek}
        eaten={sel === o.today && open ? !!o.day.meals[open] : undefined}
        onToggle={sel === o.today && open ? () => onLog('meal', { key: open, eaten: !o.day.meals[open], recipe: openedSlot }) : undefined} />
    </div>
  );
}
