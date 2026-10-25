import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { forme, errText, type Profile, type SwipeMeal, DAYS, vibrate } from './api.ts';
import { F, Title, btn, ghostBtn, card, darkCard, Spinner, Img } from './ui.tsx';

// Les 11 questions du départ (comme MacroSave), puis « On compose ta semaine ». Tout est modifiable ensuite dans Profil.
const EX = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const GOALS: Array<{ id: Profile['goal']; label: string; sub: string; img: string }> = [
  { id: 'perte', label: 'Perdre du poids', sub: 'en gardant le muscle', img: `${EX}/Walking_Treadmill/0.jpg` },
  { id: 'muscle', label: 'Prendre du muscle', sub: 'plus fort, plus large', img: `${EX}/Dumbbell_Bench_Press/1.jpg` },
  { id: 'recompo', label: 'Les deux', sub: 'sécher + se muscler', img: `${EX}/Dumbbell_Bicep_Curl/0.jpg` },
];
const GYMS = [
  { id: 'Basic-Fit', style: { background: '#ff6a00', color: '#fff', fontWeight: 900, fontStyle: 'italic' } },
  { id: 'Jims', style: { background: '#e30613', color: '#fff', fontWeight: 900 } },
  { id: 'Fitness Park', style: { background: '#111', color: '#fff', fontWeight: 900, fontStyle: 'italic' } },
  { id: 'Anytime Fitness', style: { background: '#5b2a86', color: '#fff', fontWeight: 800 } },
  { id: 'Salle de quartier', style: { background: '#fff', color: F.ink, fontWeight: 800 } },
  { id: 'À la maison', style: { background: '#fff', color: F.ink, fontWeight: 800 } },
];
const STORES = [
  { id: 'Colruyt', bg: '#e2001a', fg: '#fff' }, { id: 'Delhaize', bg: '#e4002b', fg: '#fff' }, { id: 'Aldi', bg: '#00205b', fg: '#fff' },
  { id: 'Lidl', bg: '#0050aa', fg: '#fff200' }, { id: 'Carrefour', bg: '#fff', fg: '#004e9e' }, { id: 'Albert Heijn', bg: '#00a0e2', fg: '#fff' },
  { id: 'Intermarché', bg: '#fff', fg: '#e2001a' }, { id: 'Boucherie halal', bg: '#0b6b3a', fg: '#fff' },
];

function Wheel({ values, value, onChange, suffix = '' }: { values: number[]; value: number; onChange: (v: number) => void; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const H = 44;
  useEffect(() => { const i = values.indexOf(value); if (ref.current && i >= 0) ref.current.scrollTop = i * H; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useRef<ReturnType<typeof setTimeout>>();
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <div style={{ position: 'absolute', left: 4, right: 4, top: H * 2, height: H, background: F.dark, borderRadius: 14, pointerEvents: 'none' }} />
      <div ref={ref} onScroll={e => {
        const el = e.currentTarget; clearTimeout(t.current);
        t.current = setTimeout(() => { const i = Math.round(el.scrollTop / H); const v = values[Math.max(0, Math.min(values.length - 1, i))]!; if (v !== value) { onChange(v); vibrate(8); } }, 60);
      }} style={{ height: H * 5, overflowY: 'scroll', scrollSnapType: 'y mandatory', position: 'relative', scrollbarWidth: 'none', maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)', WebkitMaskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)' }}>
        <div style={{ height: H * 2 }} />
        {values.map(v => <div key={v} style={{ height: H, scrollSnapAlign: 'start', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: v === value ? 22 : 17, fontWeight: 800, color: v === value ? '#fff' : F.muted, position: 'relative', transition: 'all .15s' }}>{v}{v === value ? suffix : ''}</div>)}
        <div style={{ height: H * 2 }} />
      </div>
    </div>
  );
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function SwipeDeck({ meals, onDone }: { meals: SwipeMeal[]; onDone: (likes: string[], dislikes: string[]) => void }) {
  const [i, setI] = useState(0);
  const likes = useRef<string[]>([]), dislikes = useRef<string[]>([]);
  const x = useMotionValue(0);
  const rot = useTransform(x, [-200, 200], [-14, 14]);
  const yes = useTransform(x, [20, 120], [0, 1]), no = useTransform(x, [-120, -20], [1, 0]);
  const m = meals[i];
  const vote = (ok: boolean) => {
    if (!m) return;
    vibrate(15);
    (ok ? likes : dislikes).current.push(m.id);
    x.set(0);
    if (i + 1 >= meals.length) onDone(likes.current, dislikes.current); else setI(i + 1);
  };
  if (!m) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>;
  return (
    <div>
      <div style={{ position: 'relative', height: 'min(58vh, 430px)' }}>
        {meals[i + 1] && <div style={{ ...card, position: 'absolute', inset: '10px 10px 0', padding: 0, overflow: 'hidden', opacity: 0.6, transform: 'scale(0.95)' }}><Img src={meals[i + 1]!.photo} style={{ width: '100%', height: '100%' }} /></div>}
        <motion.div key={m.id} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.9} style={{ x, rotate: rot, ...card, position: 'absolute', inset: 0, padding: 0, overflow: 'hidden', cursor: 'grab', touchAction: 'pan-y' }}
          onDragEnd={(_, info: PanInfo) => { if (info.offset.x > 110) vote(true); else if (info.offset.x < -110) vote(false); }}
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Img src={m.photo} style={{ width: '100%', height: '74%' }} />
          <motion.div style={{ opacity: yes, position: 'absolute', top: 20, left: 18, border: `3px solid ${F.green}`, color: F.green, padding: '4px 12px', borderRadius: 10, fontWeight: 900, fontSize: 22, transform: 'rotate(-12deg)', background: '#fff' }}>MIAM</motion.div>
          <motion.div style={{ opacity: no, position: 'absolute', top: 20, right: 18, border: `3px solid ${F.red}`, color: F.red, padding: '4px 12px', borderRadius: 10, fontWeight: 900, fontSize: 22, transform: 'rotate(12deg)', background: '#fff' }}>BOF</motion.div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: F.accent, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i + 1}/{meals.length} · {m.cat} · {m.area}</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>{m.name}</div>
          </div>
        </motion.div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginTop: 18 }}>
        <button aria-label="Je n'aime pas" onClick={() => vote(false)} style={{ ...ghostBtn, width: 64, height: 64, borderRadius: 32, fontSize: 24 }}>✕</button>
        <button aria-label="J'aime" onClick={() => vote(true)} style={{ ...btn, width: 64, height: 64, borderRadius: 32, fontSize: 26, padding: 0 }}>✓</button>
      </div>
    </div>
  );
}

const STEPS = 11;

export default function Onboarding({ initial, onDone }: { initial: Profile; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>({ ...initial, stores: initial.stores.length ? initial.stores : ['Colruyt', 'Boucherie halal'] });
  const [swipe, setSwipe] = useState<SwipeMeal[]>([]);
  const [composing, setComposing] = useState<number>(-1);
  const [err, setErr] = useState('');
  const set = (patch: Partial<Profile>) => setP(x => ({ ...x, ...patch }));
  const next = () => { vibrate(10); setStep(s => s + 1); };
  useEffect(() => { void forme.swipe().then(r => setSwipe(r.meals)).catch(() => {}); }, []);

  const compose = async () => {
    setComposing(0); setErr('');
    const tick = setInterval(() => setComposing(c => Math.min(3, c + 1)), 6000);
    try {
      await forme.profile({ ...p, onboarded: true });
      await forme.makeWeek(true);
      setComposing(4); vibrate(60);
      setTimeout(onDone, 900);
    } catch (e) { setErr(errText(e)); setComposing(-1); } finally { clearInterval(tick); }
  };

  if (composing >= 0) {
    const items = ['Besoins caloriques calculés', 'Macros réparties sur ta semaine (halal, Wegovy)', 'Prix de tes magasins appliqués', 'Liste de courses prête'];
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: `radial-gradient(120% 60% at 50% 0%, ${F.soft}, ${F.bg})` }}>
        <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ width: 84, height: 84, borderRadius: 42, background: F.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 900, boxShadow: '0 14px 30px rgba(255,75,43,0.35)' }}>F</motion.div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', marginTop: 22, lineHeight: 1 }}>ON COMPOSE<br />TA SEMAINE</div>
        <div style={{ width: '100%', maxWidth: 360, marginTop: 26, display: 'grid', gap: 10 }}>
          {items.map((t, i) => (
            <motion.div key={t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: composing >= i ? 1 : 0.4, y: 0 }} transition={{ delay: i * 0.15 }} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              {composing > i ? <div style={{ width: 24, height: 24, borderRadius: 12, background: F.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 }}>✓</div> : composing === i ? <Spinner size={24} /> : <div style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${F.line}` }} />}
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t}</div>
            </motion.div>
          ))}
        </div>
        <div style={{ color: F.muted, fontSize: 13, marginTop: 18, textAlign: 'center' }}>Claude prépare tes recettes halal avec les produits de {p.stores.filter(s => s !== 'Boucherie halal').join(', ') || 'ton magasin'}… (~30 s)</div>
      </div>
    );
  }

  const q: Array<{ a: string; b: string; sub?: string; body: ReactNode; ok?: boolean; auto?: boolean }> = [
    { a: 'Quel physique', b: 'vises-tu ?', sub: 'On adapte tes repas et tes séances à ton objectif.', auto: true, body: (
      <div style={{ display: 'grid', gap: 12 }}>
        {GOALS.map(g => (
          <button key={g.id} onClick={() => { set({ goal: g.id }); next(); }} style={{ ...darkCard, padding: 0, height: 120, display: 'flex', overflow: 'hidden', border: p.goal === g.id ? `3px solid ${F.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: F.sans }}>
            <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}><div style={{ fontSize: 20, fontWeight: 800 }}>{g.label}</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{g.sub}</div></div>
            <Img src={g.img} style={{ width: 130, height: '100%', filter: 'grayscale(0.2) contrast(1.05)', maskImage: 'linear-gradient(90deg, transparent, #000 35%)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 35%)' }} />
          </button>
        ))}
      </div>) },
    { a: 'Où', b: "t'entraînes-tu ?", sub: 'Ta salle en Belgique (pour caler tes séances).', auto: true, body: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {GYMS.map(g => <button key={g.id} onClick={() => { set({ gym: g.id }); next(); }} style={{ ...card, ...g.style, height: 78, fontSize: 17, border: p.gym === g.id ? `3px solid ${F.accent}` : '3px solid transparent', cursor: 'pointer', fontFamily: F.sans }}>{g.id.toUpperCase()}</button>)}
      </div>) },
    { a: 'Où fais-tu', b: 'tes courses ?', sub: 'Plusieurs choix possibles. Les prix et produits suivent tes magasins belges.', ok: p.stores.length > 0, body: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {STORES.map(s => { const on = p.stores.includes(s.id); return (
          <button key={s.id} onClick={() => { vibrate(8); set({ stores: on ? p.stores.filter(x => x !== s.id) : [...p.stores, s.id] }); }} style={{ ...card, background: s.bg, color: s.fg, height: 70, fontSize: 16, fontWeight: 900, border: on ? `3px solid ${F.accent}` : `3px solid ${s.bg === '#fff' ? F.line : 'transparent'}`, cursor: 'pointer', fontFamily: F.sans, position: 'relative', opacity: on ? 1 : 0.75 }}>
            {s.id}{on && <span style={{ position: 'absolute', top: 6, right: 8, width: 20, height: 20, borderRadius: 10, background: F.accent, color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
          </button>); })}
      </div>) },
    { a: 'Combien de repas', b: 'par jour ?', sub: 'Avec le Wegovy, plusieurs petits repas passent souvent mieux.', auto: true, body: (
      <div style={{ display: 'grid', gap: 10 }}>
        {[{ n: 2, t: 'Déjeuner + dîner' }, { n: 3, t: 'Petit-déj + déjeuner + dîner' }, { n: 4, t: '3 repas + 1 collation protéinée' }].map(o => (
          <button key={o.n} onClick={() => { set({ mealsPerDay: o.n }); next(); }} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', border: p.mealsPerDay === o.n ? `3px solid ${F.accent}` : '3px solid transparent', fontFamily: F.sans, textAlign: 'left' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: F.accent, width: 40 }}>{o.n}</div><div style={{ fontSize: 15.5, fontWeight: 700 }}>{o.t}</div>
          </button>))}
      </div>) },
    { a: 'Un régime', b: 'particulier ?', sub: 'Halal pour tout, toujours : pas de porc, pas d\'alcool, viande halal uniquement.', body: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ ...card, border: `3px solid ${F.green}`, textAlign: 'center' }}><div style={{ fontSize: 30 }}>☪️</div><div style={{ fontWeight: 900, marginTop: 6 }}>HALAL</div><div style={{ fontSize: 12, color: F.green, fontWeight: 700 }}>toujours activé</div></div>
        <div style={{ ...card, border: `3px solid ${F.green}`, textAlign: 'center' }}><div style={{ fontSize: 30 }}>🚫🐖</div><div style={{ fontWeight: 900, marginTop: 6 }}>SANS PORC</div><div style={{ fontSize: 12, color: F.green, fontWeight: 700 }}>ni alcool</div></div>
        <button onClick={() => set({ vegetarian: false })} style={{ ...card, border: !p.vegetarian ? `3px solid ${F.accent}` : '3px solid transparent', cursor: 'pointer', fontFamily: F.sans }}><div style={{ fontSize: 30 }}>🍗</div><div style={{ fontWeight: 900, marginTop: 6 }}>JE MANGE DE TOUT</div><div style={{ fontSize: 12, color: F.muted }}>(halal)</div></button>
        <button onClick={() => set({ vegetarian: true })} style={{ ...card, border: p.vegetarian ? `3px solid ${F.accent}` : '3px solid transparent', cursor: 'pointer', fontFamily: F.sans }}><div style={{ fontSize: 30 }}>🥦</div><div style={{ fontWeight: 900, marginTop: 6 }}>VÉGÉTARIEN</div><div style={{ fontSize: 12, color: F.muted }}>œufs & laitages OK</div></button>
      </div>) },
    { a: 'Combien de séances', b: 'par semaine ?', sub: 'Muscu + cardio. Les séances sont calées sur ton agenda par Dzaryx.', body: (
      <div style={{ ...darkCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={{ fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>SÉANCES / SEMAINE</div><div style={{ fontFamily: F.serif, fontStyle: 'italic', color: F.accent2, fontSize: 22 }}>{['Repos', 'Léger', 'Léger', 'Régulier', 'Régulier', 'Intense', 'Intense', 'Athlète'][p.sessionsPerWeek]}</div></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, marginTop: 14 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(n => (
            <button key={n} onClick={() => { vibrate(8); set({ sessionsPerWeek: n }); }} style={{ flex: 1, height: `${22 + n * 13}%`, background: n <= p.sessionsPerWeek ? `linear-gradient(180deg, ${F.accent2}, ${F.accent})` : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6, fontFamily: F.sans }}>{n}</button>
          ))}
        </div>
      </div>) },
    { a: 'Ça te', b: 'tente ?', sub: 'Glisse à droite si ça te donne envie, à gauche sinon. Tout est déjà halal.', body: (
      <SwipeDeck meals={swipe} onDone={(likes, dislikes) => { set({ likes, dislikes }); next(); }} />) },
    { a: 'Ton âge, ta taille,', b: 'ton poids ?', sub: 'Pour calculer ton métabolisme. Dernière colonne : le poids que tu vises.', body: (
      <div>
        <div style={{ display: 'flex', fontSize: 11.5, fontWeight: 800, color: F.muted, letterSpacing: '0.08em', textAlign: 'center' }}>{['ÂGE', 'TAILLE', 'POIDS', 'OBJECTIF'].map(t => <div key={t} style={{ flex: 1 }}>{t}</div>)}</div>
        <div style={{ ...card, display: 'flex', padding: 6, marginTop: 6 }}>
          <Wheel values={range(16, 80)} value={p.age} onChange={v => set({ age: v })} />
          <Wheel values={range(140, 210)} value={p.heightCm} onChange={v => set({ heightCm: v })} />
          <Wheel values={range(45, 200)} value={Math.round(p.weightKg)} onChange={v => set({ weightKg: v })} />
          <Wheel values={range(45, 200)} value={Math.round(p.targetKg)} onChange={v => set({ targetKg: v })} />
        </div>
        <div style={{ textAlign: 'center', color: F.muted, fontSize: 13, marginTop: 10 }}>{p.age} ans · {p.heightCm} cm · {p.weightKg} kg → <b style={{ color: F.accent }}>{p.targetKg} kg</b> · IMC {(p.weightKg / (p.heightCm / 100) ** 2).toFixed(1)}</div>
      </div>) },
    { a: 'Qui', b: 'es-tu ?', sub: 'Pour ton métabolisme de base.', auto: true, body: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[{ id: 'h' as const, s: '♂', t: 'Homme' }, { id: 'f' as const, s: '♀', t: 'Femme' }].map(o => (
          <button key={o.id} onClick={() => { set({ sex: o.id }); next(); }} style={{ ...darkCard, height: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer', border: p.sex === o.id ? `3px solid ${F.accent}` : '3px solid transparent', fontFamily: F.sans }}>
            <div style={{ width: 60, height: 60, borderRadius: 30, background: 'rgba(255,75,43,0.18)', color: F.accent, fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{o.s}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{o.t}</div>
          </button>))}
      </div>) },
    { a: 'Ton budget', b: 'courses ?', sub: 'Par semaine, pour toi. On reste en dessous avec les marques distributeur.', body: (() => {
      const pct = (p.budgetWeek - 20) / 180, R = 92, C = 2 * Math.PI * R * 0.75;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 230, height: 230 }}>
            <svg width="230" height="230" style={{ transform: 'rotate(135deg)' }}>
              <circle cx="115" cy="115" r={R} fill="none" stroke={F.bg2} strokeWidth="16" strokeDasharray={`${C} 999`} strokeLinecap="round" />
              <circle cx="115" cy="115" r={R} fill="none" stroke={F.accent} strokeWidth="16" strokeDasharray={`${C * pct} 999`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .2s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ ...darkCard, width: 130, height: 130, borderRadius: 65, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', color: F.accent2 }}>PAR SEMAINE</div>
                <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em' }}>{p.budgetWeek}<span style={{ fontSize: 20 }}>€</span></div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{(p.budgetWeek / (7 * p.mealsPerDay)).toFixed(2)} € / repas</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
            <button onClick={() => set({ budgetWeek: Math.max(20, p.budgetWeek - 5) })} style={{ ...ghostBtn, width: 54, height: 54, borderRadius: 27, fontSize: 24 }}>−</button>
            <input type="range" min={20} max={200} step={5} value={p.budgetWeek} onChange={e => set({ budgetWeek: Number(e.target.value) })} style={{ width: 150, accentColor: F.accent }} />
            <button onClick={() => set({ budgetWeek: Math.min(200, p.budgetWeek + 5) })} style={{ ...btn, width: 54, height: 54, borderRadius: 27, fontSize: 24, padding: 0 }}>+</button>
          </div>
        </div>);
    })() },
    { a: 'Ton traitement', b: 'Wegovy', sub: 'L\'app te rappelle l\'injection, alterne les sites et adapte les repas (plus doux le lendemain). Elle ne touche jamais à ta dose : ça, c\'est ton médecin.', body: (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontWeight: 800 }}>Je suis sous Wegovy</div><div style={{ fontSize: 13, color: F.muted }}>sémaglutide, 1 injection / semaine</div></div>
          <button onClick={() => set({ wegovy: { ...p.wegovy, on: !p.wegovy.on } })} style={{ width: 56, height: 32, borderRadius: 16, border: 'none', background: p.wegovy.on ? F.green : F.bg2, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 3, left: p.wegovy.on ? 27 : 3, width: 26, height: 26, borderRadius: 13, background: '#fff', transition: 'left .2s', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} /></button>
        </div>
        {p.wegovy.on && <>
          <div style={{ fontSize: 13, fontWeight: 800, color: F.muted, letterSpacing: '0.08em' }}>JOUR DE L'INJECTION</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} onClick={() => set({ wegovy: { ...p.wegovy, day: d } })} style={{ ...ghostBtn, padding: '12px 0', fontSize: 12.5, background: p.wegovy.day === d ? F.accent : '#fff', color: p.wegovy.day === d ? '#fff' : F.ink, borderColor: p.wegovy.day === d ? F.accent : F.line }}>{DAYS[d]!.slice(0, 3)}</button>)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: F.muted, letterSpacing: '0.08em' }}>DOSE PRESCRITE PAR TON MÉDECIN</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['0,25 mg', '0,5 mg', '1 mg', '1,7 mg', '2,4 mg', '7,2 mg'].map(d => <button key={d} onClick={() => set({ wegovy: { ...p.wegovy, dose: d } })} style={{ ...ghostBtn, padding: '10px 12px', fontSize: 14, background: p.wegovy.dose === d ? F.accent : '#fff', color: p.wegovy.dose === d ? '#fff' : F.ink, borderColor: p.wegovy.dose === d ? F.accent : F.line }}>{d}</button>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: F.muted }}>Heure du rappel<input type="time" value={p.wegovy.hour} onChange={e => set({ wegovy: { ...p.wegovy, hour: e.target.value } })} style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, background: '#fff', border: `1px solid ${F.line}`, borderRadius: 14, padding: 12, fontSize: 16, fontFamily: F.sans }} /></label>
<div />
          </div>
        </>}
      </div>) },
  ];
  const cur = q[step]!;
  const last = step === STEPS - 1;
  if (last) cur.ok = !p.wegovy.on || !!p.wegovy.dose;
  return (
    <div style={{ minHeight: '100dvh', background: `radial-gradient(140% 50% at 50% 0%, ${F.soft}, ${F.bg} 60%)`, padding: 'calc(14px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button aria-label="Retour" disabled={step === 0} onClick={() => setStep(s => s - 1)} style={{ ...ghostBtn, width: 40, height: 40, padding: 0, borderRadius: 20, opacity: step ? 1 : 0.3 }}>←</button>
        <div style={{ fontWeight: 900, color: F.accent, fontSize: 15 }}>{String(step + 1).padStart(2, '0')}<span style={{ color: F.muted, fontSize: 11 }}>/{STEPS}</span></div>
        <div style={{ flex: 1, display: 'flex', gap: 4 }}>{q.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? F.accent : 'rgba(60,30,20,0.12)' }} />)}</div>
        <div style={{ width: 34, height: 34, borderRadius: 17, background: F.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>F</div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.22 }} style={{ flex: 1 }}>
          <Title a={cur.a} b={cur.b} sub={cur.sub} size={30} />
          {cur.body}
        </motion.div>
      </AnimatePresence>
      {err && <div style={{ color: F.red, fontWeight: 700, margin: '12px 0' }}>❌ {err}</div>}
      {!cur.auto && step !== 6 && <button disabled={cur.ok === false} onClick={last ? compose : next} style={{ ...btn, marginTop: 18, opacity: cur.ok === false ? 0.4 : 1 }}>{last ? 'Composer ma semaine →' : 'Continuer →'}</button>}
    </div>
  );
}
