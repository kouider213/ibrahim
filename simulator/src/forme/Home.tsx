import { useState } from 'react';
import { motion } from 'framer-motion';
import { type Overview, type Recipe, fmtLong, weekNo, SHORT_DAYS, dayOf } from './api.ts';
import { F, Title, Section, card, darkCard, Ring, Bar } from './ui.tsx';
import { MealRow, RecipeSheet } from './Week.tsx';
import { TOOLS, type ToolId } from './Tools.tsx';

export default function Home({ o, name, onLog, onWeek, openTool, go, onFav }: {
  o: Overview; name: string; onFav: (r: Recipe) => void; onLog: (kind: string, body: Record<string, unknown>) => void; onWeek: (w: NonNullable<Overview['week']>) => void;
  openTool: (t: ToolId) => void; go: (tab: 'week' | 'shop' | 'sport' | 'body') => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const t = o.targets, e = o.eaten, w = o.week;
  const plan = w?.days.find(d => d.date === o.today);
  const ticked = plan?.meals.filter(m => o.day.meals[`${m.recipe}:${m.slot}`]).length ?? 0;
  const inj = o.nextInjection;
  const opened = open && w ? w.recipes.find(r => r.id === open.split(':')[0]) ?? null : null;
  const maxK = Math.max(t.kcal, ...o.week7.map(d => d.kcal));
  return (
    <div style={{ padding: '6px 18px 0' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: F.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{fmtLong(o.today)} · semaine {weekNo(o.today)}</div>
      <Title a={`Salut ${name},`} b="on mange quoi ?" size={30} />
      <a href={(() => { try { const ft = localStorage.getItem('forme:token'); return `/ibrahim/jeux/${ft ? `?invite=${encodeURIComponent(ft)}` : ''}`; } catch { return '/ibrahim/jeux/'; } })()} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#fff', background: 'linear-gradient(120deg,#6f8dff,#ff7ab8)', borderRadius: 20, padding: '12px 16px', margin: '4px 0 14px', boxShadow: '0 8px 22px rgba(111,141,255,.35)' }}>
        <span style={{ fontSize: 30 }}>🎮</span><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 16 }}>Nos jeux</b><span style={{ fontSize: 12.5, opacity: 0.9 }}>La Grande Folie, Les Gardiens, L'Œil — seul ou à deux</span></span><span style={{ fontSize: 20 }}>›</span>
      </a>

      <motion.div data-tour="ring" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ ...darkCard }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring value={e.kcal} max={t.kcal} size={126} color={e.kcal > t.kcal * 1.08 ? F.gold : F.accent}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: F.accent, position: 'absolute', top: 2 }} />
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em' }}>{e.kcal}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>/ {t.kcal} kcal</div>
          </Ring>
          <div style={{ flex: 1, display: 'grid', gap: 12 }}>
            {[{ l: 'PROTÉINES', v: e.p, m: t.p, c: F.green }, { l: 'GLUCIDES', v: e.c, m: t.c, c: F.gold }, { l: 'LIPIDES', v: e.f, m: t.f, c: '#6aa8ff' }].map(x => (
              <div key={x.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 4 }}><span style={{ color: 'rgba(255,255,255,0.6)' }}>{x.l}</span><span><b style={{ color: '#fff' }}>{x.v}</b><span style={{ color: 'rgba(255,255,255,0.45)' }}> / {x.m} g</span></span></div>
                <Bar value={x.v} max={x.m} color={x.c} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>
          <span>{ticked} / {plan?.meals.length ?? 0} repas cochés</span><span>{o.streak > 1 ? `🔥 ${o.streak} jours de suivi` : 'Halal ☪️ · adapté Wegovy'}</span>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <button data-tour="agenda" onClick={() => openTool('agenda')} style={{ ...card, border: 'none', cursor: 'pointer', textAlign: 'start', padding: 14, fontFamily: 'inherit', color: F.ink }}>
          <div style={{ fontSize: 24 }}>📅</div><div style={{ fontWeight: 800, marginTop: 4 }}>Mon agenda</div><div style={{ fontSize: 12.5, color: F.muted }}>séances, repas, rappels</div>
        </button>
        <div data-tour="challenge" style={{ ...card, padding: 14 }}>
          <div style={{ fontSize: 24 }}>{o.challenge.e}</div><div style={{ fontWeight: 800, marginTop: 4, fontSize: 13.5, lineHeight: 1.25 }}>Défi : {o.challenge.text}</div>
          <div style={{ marginTop: 6 }}><Bar value={o.challenge.got} max={o.challenge.goal} color={o.challenge.got >= o.challenge.goal ? F.green : F.accent} track={F.bg2} /></div>
          <div style={{ fontSize: 12, color: F.muted, marginTop: 3 }}>{Math.min(o.challenge.got, o.challenge.goal)} / {o.challenge.goal}{o.challenge.got >= o.challenge.goal ? ' 🏆' : ''}</div>
        </div>
      </div>

      {o.profile.wegovy.on && inj && (
        <button data-tour="inj" onClick={() => openTool('wegovy')} style={{ ...card, width: '100%', border: inj.inDays === 0 && !o.day.injection ? `2px solid ${F.accent}` : 'none', marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left', fontFamily: F.sans, color: F.ink }}>
          <div style={{ width: 50, height: 50, borderRadius: 16, background: '#e8f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>💉</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>{o.day.injection ? 'Injection faite aujourd\'hui ✓' : inj.inDays === 0 ? `Wegovy ce soir · ${inj.hour}` : `Wegovy dans ${inj.inDays} jour${inj.inDays > 1 ? 's' : ''}`}</div>
            <div style={{ fontSize: 13, color: F.muted }}>{o.day.injection ? `Site : ${o.day.injection.site}. Repas doux demain.` : `${SHORT_DAYS[dayOf(inj.date)]} ${inj.date.slice(8)} · site conseillé : ${inj.site}`}</div>
          </div>
          <div style={{ color: F.accent, fontWeight: 900 }}>›</div>
        </button>
      )}

      <div data-tour="water" style={{ ...card, marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 24 }}>💧</div>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>
          {Array.from({ length: o.profile.waterGoal }, (_, i) => <motion.button whileTap={{ scale: 0.8 }} key={i} aria-label="verre d'eau" onClick={() => onLog('water', { delta: i < o.day.water ? -1 : 1 })} style={{ flex: 1, height: 30, borderRadius: 8, border: 'none', background: i < o.day.water ? F.blue : '#e3f4ff', cursor: 'pointer' }} />)}
        </div>
        <div style={{ fontWeight: 900, fontSize: 14, minWidth: 34, textAlign: 'right' }}>{o.day.water}/{o.profile.waterGoal}</div>
      </div>

      <Section a="Au" b="menu" right="Ma semaine ›" onRight={() => go('week')} />
      <div data-tour="menu">
      {plan?.meals.length ? plan.meals.map((m, i) => {
        const r = w!.recipes.find(x => x.id === m.recipe); if (!r) return null;
        const key = `${m.recipe}:${m.slot}`;
        return <MealRow key={key + i} r={r} slot={m.slot} eaten={!!o.day.meals[key]} onToggle={() => onLog('meal', { key, eaten: !o.day.meals[key] })} onOpen={() => setOpen(key)} />;
      }) : <div style={{ ...card, color: F.muted, fontSize: 14 }}>{w ? 'Rien de prévu aujourd\'hui dans ta semaine.' : 'Ta semaine n\'est pas encore composée.'} <button onClick={() => go('week')} style={{ border: 'none', background: 'none', color: F.accent, fontWeight: 800, cursor: 'pointer', padding: 0 }}>Voir la semaine ›</button></div>}
      </div>
      {o.day.extra.length > 0 && <div style={{ fontSize: 13, color: F.muted, margin: '-2px 4px 0' }}>+ {o.day.extra.length} ajout(s) : {o.day.extra.map(x => x.name).join(', ')}</div>}

      {w && (
        <button onClick={() => go('shop')} style={{ ...card, width: '100%', border: 'none', marginTop: 14, cursor: 'pointer', textAlign: 'left', fontFamily: F.sans, color: F.ink }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em', color: F.muted }}>COURSES DE LA SEMAINE</div><div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em' }}>{w.total.toFixed(2).replace('.', ',')} € <span style={{ fontSize: 14, color: F.muted, fontWeight: 600 }}>/ {w.budget} €</span></div></div>
            <span style={{ background: w.total <= w.budget ? '#e9f8ef' : '#ffe9e2', color: w.total <= w.budget ? F.green : F.red, borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 800 }}>{w.total <= w.budget ? '−' : '+'}{Math.abs(w.budget - w.total).toFixed(2).replace('.', ',')} €</span>
          </div>
          <div style={{ fontSize: 12.5, color: F.muted, marginTop: 2 }}>{w.shopping.length} articles · {[...new Set(w.shopping.map(s => s.store))].join(', ')}</div>
        </button>
      )}

      <Section a="Ta" b="semaine" />
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
          {o.week7.map(d => (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: d.p >= t.p ? F.green : F.muted }}>{d.p ? `${d.p}g` : ''}</div>
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(4, d.kcal / maxK * 78)}%` }} style={{ width: '100%', borderRadius: 8, background: d.date === o.today ? F.accent : d.kcal ? F.soft : F.bg }} />
              <div style={{ fontSize: 10.5, fontWeight: 800, color: d.date === o.today ? F.accent : F.muted }}>{SHORT_DAYS[dayOf(d.date)]!.slice(0, 1)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: F.muted, marginTop: 8 }}>Calories des 7 derniers jours · en vert = protéines atteintes</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <button onClick={() => go('sport')} style={{ ...darkCard, border: 'none', cursor: 'pointer', textAlign: 'left', padding: 14, fontFamily: F.sans }}>
          <div style={{ fontSize: 26 }}>🏋️</div><div style={{ fontWeight: 800, marginTop: 6 }}>Ma séance</div><div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>exercices + minuteur</div>
        </button>
        <button onClick={() => go('body')} style={{ ...card, border: o.photoDue ? `2px solid ${F.accent}` : 'none', cursor: 'pointer', textAlign: 'left', padding: 14, fontFamily: F.sans, color: F.ink }}>
          <div style={{ fontSize: 26 }}>📸</div><div style={{ fontWeight: 800, marginTop: 6 }}>{o.photoDue ? 'Photo à faire' : 'Mon évolution'}</div><div style={{ fontSize: 12.5, color: F.muted }}>{o.weights.length ? `${o.weights[o.weights.length - 1]!.kg} kg` : 'avant / après'}</div>
        </button>
      </div>

      <Section a="Tes" b="outils" />
      <div data-tour="tools" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {TOOLS.map((x, i) => (
          <motion.button key={x.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} whileTap={{ scale: 0.92 }} onClick={() => openTool(x.id)}
            style={{ background: x.color, border: 'none', borderRadius: 18, padding: '12px 2px 10px', cursor: 'pointer', fontFamily: F.sans, color: F.ink }}>
            <div style={{ fontSize: 26 }}>{x.emoji}</div><div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 4 }}>{x.label}</div>
          </motion.button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '16px -18px 0', padding: '0 18px' }}>
        {o.badges.map(b => <div key={b.id} title={b.label} style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 27, background: b.ok ? '#fff' : F.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, filter: b.ok ? 'none' : 'grayscale(1)', opacity: b.ok ? 1 : 0.45, boxShadow: b.ok ? '0 4px 12px rgba(120,60,40,0.12)' : 'none' }}>{b.emoji}</div>)}
      </div>

      {w && <RecipeSheet r={opened} monday={w.monday} onClose={() => setOpen(null)} onWeek={onWeek} fav={!!opened && o.favs.some(f => f.title === opened.title)} onFav={opened ? () => onFav(opened) : undefined} eaten={open ? !!o.day.meals[open] : false} onToggle={open ? () => onLog('meal', { key: open, eaten: !o.day.meals[open] }) : undefined} />}
    </div>
  );
}
