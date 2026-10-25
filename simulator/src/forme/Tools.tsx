import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, compressImage, type Overview, type Barcode, type Product, type Food, DAYS, vibrate } from './api.ts';
import { F, Title, Section, card, darkCard, btn, ghostBtn, Sheet, Spinner, Img, input, Chip, Ring, Bar } from './ui.tsx';
import { RestTimer } from './Sport.tsx';
import MoreTool, { MORE } from './Tools2.tsx';
import Agenda from './Agenda.tsx';
import { FavList } from './Week.tsx';
import { SwipeDeck } from './Onboarding.tsx';
import type { SwipeMeal, Recipe } from './api.ts';

function Tastes({ onDone }: { onDone: (likes: string[], dislikes: string[]) => void }) {
  const [meals, setMeals] = useState<SwipeMeal[]>([]);
  useEffect(() => { void forme.swipe().then(r => setMeals(r.meals)).catch(() => {}); }, []);
  return <div><div style={{ fontSize: 14, color: F.muted, marginBottom: 10 }}>Glisse à droite ce qui te tente, à gauche sinon.</div><SwipeDeck meals={meals} onDone={onDone} /></div>;
}

// Les OUTILS de FORME (13) : chacun s'ouvre en feuille depuis l'accueil. Tout ce qui est noté part au serveur → Dzaryx le voit.
export type ToolId = 'wegovy' | 'sides' | 'protein' | 'water' | 'mealphoto' | 'scan' | 'products' | 'resto' | 'tdee' | 'coach' | 'timer' | 'badges' | 'settings'
  | 'fasting' | 'fridge' | 'batch' | 'doctor' | 'reminders' | 'sleep' | 'steps' | 'bmi' | 'craving' | 'portions' | 'agenda' | 'tastes' | 'favs';
export const TOOLS: Array<{ id: ToolId; emoji: string; label: string; color: string }> = [
  { id: 'agenda', emoji: '📅', label: 'Agenda', color: '#ffe9e2' },
  { id: 'favs', emoji: '❤️', label: 'Mes favoris', color: '#ffe3ea' },
  { id: 'wegovy', emoji: '💉', label: 'Wegovy', color: '#e8f0ff' },
  { id: 'mealphoto', emoji: '📷', label: 'Photo repas', color: '#ffe9e2' },
  { id: 'scan', emoji: '🔎', label: 'Scanner', color: '#e9f8ef' },
  { id: 'protein', emoji: '🥩', label: 'Protéines', color: '#fff1dc' },
  { id: 'water', emoji: '💧', label: 'Eau', color: '#e3f4ff' },
  { id: 'sides', emoji: '🤢', label: 'Effets', color: '#f1ecff' },
  { id: 'products', emoji: '🛒', label: 'Produits BE', color: '#ffe9e2' },
  { id: 'resto', emoji: '🍟', label: 'Resto & snack', color: '#fff6d6' },
  { id: 'coach', emoji: '💬', label: 'Coach', color: '#e8f0ff' },
  { id: 'timer', emoji: '⏱️', label: 'Minuteur', color: '#e9f8ef' },
  { id: 'tdee', emoji: '🧮', label: 'Mes besoins', color: '#f1ecff' },
  { id: 'badges', emoji: '🏆', label: 'Badges', color: '#fff1dc' },
  { id: 'fasting', emoji: '🌙', label: 'Jeûne', color: '#efe9ff' },
  { id: 'fridge', emoji: '🧊', label: 'Frigo vide', color: '#e3f4ff' },
  { id: 'batch', emoji: '🥡', label: 'Batch cooking', color: '#fff1dc' },
  { id: 'doctor', emoji: '🩺', label: 'Bilan médecin', color: '#e9f8ef' },
  { id: 'reminders', emoji: '⏰', label: 'Mes rappels', color: '#ffe9e2' },
  { id: 'sleep', emoji: '😴', label: 'Sommeil', color: '#efe9ff' },
  { id: 'steps', emoji: '🚶', label: 'Pas', color: '#e9f8ef' },
  { id: 'bmi', emoji: '📐', label: 'IMC & taille', color: '#fff6d6' },
  { id: 'craving', emoji: '🍫', label: 'Anti-fringale', color: '#ffe9e2' },
  { id: 'portions', emoji: '✋', label: 'Portions', color: '#e8f0ff' },
  { id: 'tastes', emoji: '😋', label: 'Mes goûts', color: '#e9f8ef' },
];

const SITES = ['ventre gauche', 'ventre droit', 'cuisse gauche', 'cuisse droite', 'bras gauche', 'bras droit'];
const SIDE_LIST = [
  { id: 'nausée', emoji: '🤢', tip: 'Petites bouchées, arrête-toi avant d\'être plein, évite gras et frit, gingembre / citron, air frais. Pas allongé juste après le repas.' },
  { id: 'constipation', emoji: '🚽', tip: 'Eau (8-10 verres), fibres : légumes, lentilles, pruneaux, flocons d\'avoine. Marche 20 min.' },
  { id: 'fatigue', emoji: '😴', tip: 'Souvent pas assez mangé ou bu : vérifie protéines et eau. Couche-toi plus tôt.' },
  { id: 'brûlures', emoji: '🔥', tip: 'Évite épicé, café, tomate le soir ; dernier repas 3 h avant de dormir.' },
  { id: 'diarrhée', emoji: '💦', tip: 'Bois beaucoup (eau, bouillon), riz, banane, compote. Évite laitages et gras.' },
  { id: 'mal de tête', emoji: '🤕', tip: 'Souvent la déshydratation : un grand verre d\'eau, mange quelque chose.' },
];

function Scanner({ onCode }: { onCode: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stop = () => {};
    let done = false;
    const hit = (c: string) => { if (done) return; done = true; vibrate(80); onCode(c); };
    void (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (BD) {
          const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          stop = () => s.getTracks().forEach(t => t.stop());
          video.current!.srcObject = s; await video.current!.play();
          const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          const loop = async () => { if (done) return; try { const r = await det.detect(video.current!); if (r[0]) return hit(r[0].rawValue); } catch { /* */ } requestAnimationFrame(() => void loop()); };
          void loop();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const ctl = await new BrowserMultiFormatReader().decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current!, r => { if (r) hit(r.getText()); });
          stop = () => ctl.stop();
        }
      } catch (e) { setErr(e instanceof Error ? e.message : 'caméra indisponible'); }
    })();
    return () => { done = true; stop(); };
  }, [onCode]);
  return (
    <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
      <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <motion.div animate={{ top: ['25%', '72%', '25%'] }} transition={{ repeat: Infinity, duration: 2 }} style={{ position: 'absolute', left: '12%', right: '12%', height: 2, background: F.accent, boxShadow: `0 0 12px ${F.accent}` }} />
      <div style={{ position: 'absolute', inset: '22% 10%', border: '2px solid rgba(255,255,255,0.7)', borderRadius: 14 }} />
      {err && <div style={{ position: 'absolute', inset: 0, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>{err}</div>}
    </div>
  );
}

function FoodAdd({ base, onAdd }: { base: { name: string; per100: { kcal: number | null; p: number | null; c: number | null; f: number | null } }; onAdd: (f: Food) => void }) {
  const [g, setG] = useState('100');
  const k = (Number(g) || 0) / 100, n = (v: number | null) => Math.round((v ?? 0) * k);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
      <input inputMode="numeric" value={g} onChange={e => setG(e.target.value)} style={{ ...input, width: 90 }} /><span style={{ fontWeight: 700 }}>g</span>
      <button onClick={() => onAdd({ name: base.name, kcal: n(base.per100.kcal), p: n(base.per100.p), c: n(base.per100.c), f: n(base.per100.f), src: 'scan' })} style={{ ...btn, flex: 1, padding: '12px' }}>+ {n(base.per100.kcal)} kcal · {n(base.per100.p)} g prot.</button>
    </div>
  );
}

export function Ask({ preset, placeholder, intro, mode = '' }: { preset: string[]; placeholder: string; intro: ReactNode; mode?: string }) {
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const ar = document.documentElement.lang === 'ar';
  // Dicter la question (arabe ou français) : reconnaissance vocale de Safari
  const dictate = () => {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; start: () => void } }).webkitSpeechRecognition
      ?? (window as unknown as { SpeechRecognition?: never }).SpeechRecognition;
    if (!SR) { alert(ar ? 'استعملي ميكروفون لوحة المفاتيح 🎤' : 'Utilise le micro du clavier 🎤'); return; }
    const rec = new SR(); rec.lang = ar ? 'ar-SA' : 'fr-FR'; rec.interimResults = false;
    rec.onresult = e => { const t = e.results[0]?.[0]?.transcript ?? ''; if (t) { setQ(t); void ask(t); } };
    rec.onend = () => setListening(false);
    setListening(true); rec.start();
  };
  const read = (t: string) => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/[*#_]/g, '')); u.lang = ar ? 'ar-SA' : 'fr-FR'; u.rate = 0.95; speechSynthesis.speak(u); } catch { /* */ } };
  const [a, setA] = useState<Array<{ q: string; a: string }>>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true); setQ('');
    try { const r = await forme.ask(text, mode); setA(x => [...x, { q: text, a: r.answer }]); } catch (e) { setA(x => [...x, { q: text, a: `❌ ${errText(e)}` }]); } finally { setBusy(false); }
  };
  return (
    <div>
      <div style={{ fontSize: 14, color: F.muted, marginBottom: 10 }}>{intro}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{preset.map(p => <Chip key={p} onClick={() => void ask(p)}>{p}</Chip>)}</div>
      {a.map((x, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ marginLeft: 'auto', maxWidth: '85%', background: F.dark, color: '#fff', borderRadius: '18px 18px 4px 18px', padding: '10px 14px', fontSize: 14, width: 'fit-content' }}>{x.q}</div>
          <div style={{ ...card, marginTop: 6, borderRadius: '18px 18px 18px 4px', fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{x.a}<div><button onClick={() => read(x.a)} aria-label="Écouter" style={{ ...ghostBtn, padding: '4px 10px', marginTop: 8, fontSize: 13 }}>🔊</button></div></div>
        </div>
      ))}
      {busy && <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: F.muted, margin: '8px 0' }}><Spinner size={16} /> Le coach réfléchit…</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ask(q); }} placeholder={placeholder} style={input} />
        <button onClick={dictate} aria-label="Parler" style={{ ...ghostBtn, padding: '0 14px', background: listening ? F.accent : '#fff', color: listening ? '#fff' : F.ink }}>🎤</button>
        <button onClick={() => void ask(q)} style={{ ...btn, padding: '0 16px' }}>↑</button>
      </div>
    </div>
  );
}

export default function ToolSheet({ id, o, onO, onClose, toast, onFav }: { id: ToolId | null; o: Overview; onO: (o: Overview) => void; onClose: () => void; toast: (t: string) => void; onFav: (r: Recipe) => void }) {
  const [busy, setBusy] = useState(false);
  const [meal, setMeal] = useState<(Food & { items: string[]; advice: string; halalNote: string; img: string }) | null>(null);
  const [code, setCode] = useState<Barcode | null>(null);
  const [scanning, setScanning] = useState(true);
  const [pq, setPq] = useState(''); const [pStore, setPStore] = useState(o.profile.stores[0] ?? 'Colruyt'); const [prods, setProds] = useState<Product[] | null>(null);
  const [timer, setTimer] = useState<number | null>(null);
  const [site, setSite] = useState(o.nextInjection?.site ?? SITES[0]!);
  const file = useRef<HTMLInputElement>(null);
  const t = o.targets;
  const log = async (kind: string, body: Record<string, unknown>, msg: string) => {
    try { onO(await forme.log(kind, body)); vibrate(25); toast(msg); } catch (e) { toast(errText(e)); }
  };
  useEffect(() => { if (id !== 'scan') { setCode(null); setScanning(true); } if (id !== 'mealphoto') setMeal(null); }, [id]);
  const titles: Record<ToolId, [string, string]> = {
    wegovy: ['Ton', 'Wegovy'], sides: ['Effets', 'secondaires'], protein: ['Compteur', 'protéines'], water: ['Ton', 'eau'], mealphoto: ['Photo', 'de ton assiette'],
    scan: ['Scanner', 'un produit'], products: ['Produits', 'belges'], resto: ['Resto,', 'snack & friterie'], tdee: ['Tes', 'besoins'], coach: ['Ton', 'coach'],
    timer: ['Minuteur', 'de repos'], badges: ['Tes', 'badges'], settings: ['Réglages', 'FORME'],
    fasting: ['Mode', 'jeûne'], fridge: ['Frigo', 'vide ?'], batch: ['Batch cooking', 'du dimanche'], doctor: ['Bilan', 'pour le médecin'], reminders: ['Mes', 'rappels'],
    agenda: ['Ton', 'agenda'], favs: ['Mes', 'favoris'], tastes: ['Mes', 'goûts'],
    sleep: ['Ton', 'sommeil'], steps: ['Tes', 'pas'], bmi: ['IMC &', 'tour de taille'], craving: ['Stop', 'fringale'], portions: ['Portions', 'à la main'],
  };
  const eatenP = o.eaten.p;
  return (
    <Sheet open={!!id} onClose={onClose} title={id ? <Title a={titles[id][0]} b={titles[id][1]} size={26} /> : null}>
      {id === 'wegovy' && <>
        {o.nextInjection ? (
          <div style={{ ...darkCard }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', color: F.accent2 }}>PROCHAINE INJECTION</div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', marginTop: 4 }}>{o.nextInjection.inDays === 0 ? "Aujourd'hui" : o.nextInjection.inDays === 1 ? 'Demain' : `Dans ${o.nextInjection.inDays} jours`}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>{DAYS[o.profile.wegovy.day]} à {o.nextInjection.hour}{o.profile.wegovy.dose ? ` · ${o.profile.wegovy.dose}` : ''}{o.nextInjection.last ? ` · dernière le ${o.nextInjection.last.date.slice(8)}/${o.nextInjection.last.date.slice(5, 7)} (${o.nextInjection.last.site})` : ''}</div>
          </div>
        ) : <div style={{ ...card }}>Wegovy désactivé dans tes réglages.</div>}
        <Section a="Où" b="piquer ?" />
        <div style={{ fontSize: 13.5, color: F.muted, marginBottom: 10 }}>On alterne pour éviter les bleus et les bosses. Conseillé aujourd'hui : <b style={{ color: F.accent }}>{o.nextInjection?.site}</b>.</div>
        <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center' }}>
          <svg viewBox="0 0 120 200" style={{ width: 110, flexShrink: 0 }}>
            <g fill={F.bg2} stroke={F.muted} strokeWidth="1"><circle cx="60" cy="20" r="14" /><path d="M40 38 Q60 32 80 38 L86 105 L78 105 L76 60 L74 110 L72 192 L62 192 L60 120 L58 192 L48 192 L46 110 L44 60 L42 105 L34 105 Z" /></g>
            {[{ s: 'ventre gauche', x: 52, y: 92 }, { s: 'ventre droit', x: 68, y: 92 }, { s: 'cuisse gauche', x: 52, y: 140 }, { s: 'cuisse droite', x: 68, y: 140 }, { s: 'bras gauche', x: 38, y: 70 }, { s: 'bras droit', x: 82, y: 70 }].map(p => (
              <circle key={p.s} cx={120 - p.x} cy={p.y} r={site === p.s ? 8 : 6} fill={site === p.s ? F.accent : p.s === o.nextInjection?.last?.site ? F.muted : '#fff'} stroke={F.accent} strokeWidth="2" onClick={() => setSite(p.s)} style={{ cursor: 'pointer' }} />
            ))}
          </svg>
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>{SITES.map(s => <button key={s} onClick={() => setSite(s)} style={{ ...ghostBtn, padding: '8px 10px', fontSize: 13, textAlign: 'left', background: site === s ? F.accent : '#fff', color: site === s ? '#fff' : F.ink }}>{s}{s === o.nextInjection?.last?.site ? ' (dernière)' : ''}</button>)}</div>
        </div>
        {o.day.injection ? <div style={{ ...card, marginTop: 12, background: '#e9f8ef' }}>✅ Injection notée aujourd'hui ({o.day.injection.site}). <button onClick={() => void log('injection-del', {}, 'Injection retirée')} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12, marginLeft: 6 }}>annuler</button></div>
          : <button onClick={() => void log('injection', { site, dose: o.profile.wegovy.dose }, '💉 Injection notée — Dzaryx est au courant')} style={{ ...btn, width: '100%', marginTop: 12 }}>💉 J'ai fait mon injection</button>}
        <Section a="Historique" />
        <div style={{ ...card, padding: '4px 14px' }}>{o.injections.length ? [...o.injections].reverse().map(i => <div key={i.date} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${F.line}`, fontSize: 14 }}><span>{i.date.slice(8)}/{i.date.slice(5, 7)}</span><span style={{ color: F.muted }}>{i.site}{i.dose ? ` · ${i.dose}` : ''}</span></div>) : <div style={{ padding: '10px 0', color: F.muted }}>Aucune injection notée.</div>}</div>
        <div style={{ fontSize: 12.5, color: F.muted, marginTop: 12, lineHeight: 1.45 }}>L'app ne modifie jamais ta dose : toute question sur le dosage, un oubli de plus de 5 jours ou un effet qui t'inquiète → ton médecin ou ton pharmacien. Douleur au ventre forte et persistante, vomissements répétés → 112.</div>
      </>}

      {id === 'sides' && <>
        <div style={{ fontSize: 14, color: F.muted, marginBottom: 12 }}>Note ce que tu ressens : l'app adapte les repas (plus doux) et Dzaryx suit ça avec toi.</div>
        {SIDE_LIST.map(s => (
          <div key={s.id} style={{ ...card, marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>{s.emoji}</span><div style={{ flex: 1, fontWeight: 800, textTransform: 'capitalize' }}>{s.id}</div>
              {[1, 2, 3].map(l => <button key={l} onClick={() => void log('side', { what: s.id, level: l }, `Noté : ${s.id} ${['léger', 'moyen', 'fort'][l - 1]}`)} style={{ ...ghostBtn, padding: '7px 9px', fontSize: 12 }}>{['léger', 'moyen', 'fort'][l - 1]}</button>)}
            </div>
            <div style={{ fontSize: 13, color: F.muted, marginTop: 8, lineHeight: 1.4 }}>💡 {s.tip}</div>
          </div>
        ))}
        {o.sides.length > 0 && <><Section a="Derniers jours" /><div style={{ ...card, padding: '4px 14px' }}>{o.sides.map(s => <div key={s.at} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${F.line}`, fontSize: 14 }}><span>{s.date.slice(8)}/{s.date.slice(5, 7)} · {s.what}</span><span style={{ color: [F.green, F.gold, F.accent][s.level - 1], fontWeight: 800 }}>{['léger', 'moyen', 'fort'][s.level - 1]}</span></div>)}</div></>}
      </>}

      {id === 'protein' && <>
        <div style={{ ...darkCard, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring value={eatenP} max={t.p} size={104} color={eatenP >= t.p ? F.green : F.accent}><div style={{ fontSize: 24, fontWeight: 900 }}>{eatenP}</div><div style={{ fontSize: 11, opacity: 0.6 }}>/ {t.p} g</div></Ring>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,0.8)' }}>Sous Wegovy, les protéines sont ta priorité n°1 : c'est ce qui garde ton muscle pendant que tu perds du gras. {eatenP >= t.p ? '✅ Objectif atteint !' : `Encore ${t.p - eatenP} g.`}</div>
        </div>
        <Section a="Ajout" b="rapide" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[{ n: 'Skyr 150 g', p: 16 }, { n: '2 œufs', p: 13 }, { n: 'Shake whey', p: 24 }, { n: 'Poulet 150 g', p: 34 }, { n: 'Thon boîte', p: 25 }, { n: 'Fromage blanc 200 g', p: 16 }, { n: 'Lentilles 200 g cuites', p: 18 }, { n: 'Mozzarella light', p: 20 }].map(x => (
            <button key={x.n} onClick={() => void log('protein', { name: x.n, p: x.p }, `+${x.p} g de protéines`)} style={{ ...card, border: 'none', cursor: 'pointer', textAlign: 'left', padding: 12, fontFamily: F.sans }}><div style={{ fontSize: 20, fontWeight: 900, color: F.accent }}>+{x.p} g</div><div style={{ fontSize: 13, fontWeight: 700 }}>{x.n}</div></button>
          ))}
        </div>
        {o.day.extra.length > 0 && <><Section a="Ajouté" b="aujourd'hui" /><div style={{ ...card, padding: '4px 14px' }}>{o.day.extra.map((e, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${F.line}`, fontSize: 14 }}><span style={{ flex: 1 }}>{e.name}</span><span style={{ color: F.muted }}>{e.kcal} kcal · {e.p} g</span><button onClick={() => void log('food-del', { index: i }, 'Retiré')} style={{ ...ghostBtn, padding: '2px 8px', fontSize: 12 }}>✕</button></div>)}</div></>}
      </>}

      {id === 'water' && <>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 54, fontWeight: 900, letterSpacing: '-0.04em', color: F.blue }}>{o.day.water}<span style={{ fontSize: 22, color: F.muted }}>/{o.profile.waterGoal}</span></div>
          <div style={{ color: F.muted, fontSize: 14 }}>verres de 25 cl · {(o.day.water * 0.25).toFixed(2).replace('.', ',')} L</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, margin: '18px 0' }}>
          {Array.from({ length: Math.max(o.profile.waterGoal, o.day.water) }, (_, i) => (
            <motion.button whileTap={{ scale: 0.85 }} key={i} onClick={() => void log('water', { delta: i < o.day.water ? -1 : 1 }, i < o.day.water ? 'Un verre en moins' : '💧 +1 verre')} style={{ height: 74, borderRadius: 16, border: `2px solid ${F.blue}33`, background: i < o.day.water ? `linear-gradient(180deg, #8ecbff, ${F.blue})` : '#fff', fontSize: 28, cursor: 'pointer' }}>{i < o.day.water ? '💧' : ''}</motion.button>
          ))}
        </div>
        <button onClick={() => void log('water', { delta: 1 }, '💧 +1 verre')} style={{ ...btn, width: '100%', background: F.blue, boxShadow: 'none' }}>+ 1 verre</button>
        <div style={{ fontSize: 13, color: F.muted, marginTop: 12, lineHeight: 1.45 }}>Avec le Wegovy, bien boire limite la nausée, la constipation et la fatigue. Astuce : un verre en te levant, un avant chaque repas.</div>
      </>}

      {id === 'mealphoto' && <>
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return; setBusy(true); setMeal(null);
          try { const img = await compressImage(f, 1024); const r = await forme.mealPhoto(img); setMeal({ ...r, img }); } catch (er) { toast(errText(er)); } finally { setBusy(false); e.target.value = ''; }
        }} />
        {!meal && <button disabled={busy} onClick={() => file.current?.click()} style={{ ...darkCard, width: '100%', border: 'none', cursor: 'pointer', padding: 30, textAlign: 'center', fontFamily: F.sans }}>
          {busy ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}><Spinner color="#fff" /> Claude regarde ton assiette…</div> : <><div style={{ fontSize: 50 }}>📷</div><div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>Prends ton assiette en photo</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>calories + protéines estimées en 5 secondes</div></>}
        </button>}
        {meal && <>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <img src={meal.img} alt="" style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{meal.name}</div>
              <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>{[`${meal.kcal} kcal`, `P ${meal.p} g`, `G ${meal.c} g`, `L ${meal.f} g`].map(x => <span key={x} style={{ background: F.bg, borderRadius: 999, padding: '4px 10px', fontSize: 12.5, fontWeight: 800 }}>{x}</span>)}</div>
              {meal.items.map(x => <div key={x} style={{ fontSize: 13.5, color: F.muted, padding: '2px 0' }}>• {x}</div>)}
              {meal.advice && <div style={{ background: F.soft, borderRadius: 12, padding: 10, fontSize: 13.5, marginTop: 8 }}>💡 {meal.advice}</div>}
              {meal.halalNote && <div style={{ background: '#e9f8ef', borderRadius: 12, padding: 10, fontSize: 13.5, marginTop: 6 }}>☪️ {meal.halalNote}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setMeal(null)} style={{ ...ghostBtn, flex: 1 }}>Refaire</button>
            <button onClick={() => { void log('food', { name: meal.name, kcal: meal.kcal, p: meal.p, c: meal.c, f: meal.f, src: 'photo' }, `🍽️ ${meal.kcal} kcal ajoutées`); setMeal(null); onClose(); }} style={{ ...btn, flex: 2 }}>Ajouter à ma journée</button>
          </div>
        </>}
      </>}

      {id === 'scan' && <>
        {scanning && <Scanner onCode={async c => { setScanning(false); setBusy(true); try { setCode(await forme.barcode(c)); } catch (e) { toast(errText(e)); setScanning(true); } finally { setBusy(false); } }} />}
        {busy && <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>}
        {code && <div style={{ ...card, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Img src={code.img} style={{ width: 90, height: 110, borderRadius: 12, objectFit: 'contain', background: '#fff', border: `1px solid ${F.line}` }} />
            <div><div style={{ fontWeight: 800, fontSize: 17 }}>{code.name}</div><div style={{ fontSize: 13, color: F.muted }}>{code.brand}{code.quantity ? ` · ${code.quantity}` : ''}</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: code.haram ? F.red : F.green }}>{code.haram ? '⛔ ' : '☪️ '}{code.halal}</div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>{[['kcal', code.per100.kcal], ['prot.', code.per100.p], ['gluc.', code.per100.c], ['lip.', code.per100.f]].map(([l, v]) => <div key={String(l)} style={{ background: F.bg, borderRadius: 12, padding: 8, textAlign: 'center' }}><div style={{ fontWeight: 900 }}>{v ?? '—'}</div><div style={{ fontSize: 11, color: F.muted }}>{l} /100 g</div></div>)}</div>
          {!code.haram && code.per100.kcal != null && <FoodAdd base={code} onAdd={f => { void log('food', { ...f }, `+${f.kcal} kcal`); onClose(); }} />}
          <button onClick={() => { setCode(null); setScanning(true); }} style={{ ...ghostBtn, width: '100%', marginTop: 10 }}>Scanner un autre produit</button>
        </div>}
        <div style={{ fontSize: 12.5, color: F.muted, marginTop: 10 }}>Base Open Food Facts. Le verdict halal repère les ingrédients interdits (porc, gélatine, alcool, carmin E120…) ; pour la viande, seul le logo de certification compte.</div>
      </>}

      {id === 'products' && <>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>{['Colruyt', 'Delhaize', 'Aldi', 'Lidl', 'Carrefour'].map(s => <Chip key={s} on={pStore === s} onClick={() => setPStore(s)}>{s}</Chip>)}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={pq} onChange={e => setPq(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter') { setBusy(true); try { setProds((await forme.products(pq, pStore)).products); } finally { setBusy(false); } } }} placeholder="skyr, riz, thon, wraps…" style={input} />
          <button onClick={async () => { setBusy(true); try { setProds((await forme.products(pq, pStore)).products); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, padding: '0 16px' }}>🔎</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{['skyr', 'blanc de poulet', 'thon', 'flocons d\'avoine', 'wraps complets', 'fromage blanc'].map(x => <Chip key={x} onClick={async () => { setPq(x); setBusy(true); try { setProds((await forme.products(x, pStore)).products); } finally { setBusy(false); } }}>{x}</Chip>)}</div>
        {busy && <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>}
        {prods && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          {prods.map(p => <div key={p.code} style={{ ...card, padding: 10 }}><Img src={p.img} style={{ width: '100%', height: 110, objectFit: 'contain', background: '#fff', borderRadius: 10 }} /><div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 6, lineHeight: 1.25 }}>{p.name}</div><div style={{ fontSize: 12, color: F.muted }}>{p.brand}{p.stores.length ? ` · ${p.stores.slice(0, 2).join(', ')}` : ''}</div>{p.p != null && <div style={{ fontSize: 12.5, fontWeight: 800, color: F.accent, marginTop: 4 }}>{p.kcal ?? '?'} kcal · {p.p} g prot. /100 g</div>}</div>)}
          {!prods.length && <div style={{ color: F.muted }}>Rien trouvé.</div>}
        </div>}
      </>}

      {id === 'resto' && <Ask intro="Tu manges dehors ? Le coach te dit quoi prendre, halal et compatible Wegovy." placeholder="ex. je suis au Quick, je prends quoi ?"
        preset={['Je suis au Quick', 'Snack kebab halal', 'Friterie : que prendre ?', 'Resto turc / libanais', 'Pizza entre potes', 'Repas de famille algérien', 'Station-service sur la route']} />}
      {id === 'coach' && <Ask intro="Pose n'importe quelle question : faim, envie de sucre, nausée, plateau, séance… Le coach connaît ton suivi." placeholder="Ta question…"
        preset={['J\'ai envie de sucre', 'Je n\'ai pas faim du tout', 'Je stagne sur la balance', 'Collation avant la salle ?', 'Idée de petit-déj rapide', 'Ramadan avec le Wegovy ?']} />}

      {id === 'timer' && <>
        {timer ? <RestTimer key={timer} seconds={timer} onDone={() => { setTimer(null); toast('⏱️ C\'est reparti !'); }} onSkip={() => setTimer(null)} />
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>{[30, 45, 60, 90, 120, 180].map(s => <button key={s} onClick={() => setTimer(s)} style={{ ...card, border: 'none', cursor: 'pointer', padding: '22px 0', fontSize: 22, fontWeight: 900, fontFamily: F.sans, color: F.ink }}>{s < 60 ? `${s}s` : `${s / 60}${s % 60 ? ',5' : ''} min`}</button>)}</div>}
        <div style={{ fontSize: 13, color: F.muted, marginTop: 12 }}>Bip + vibration à la fin. Force : 2-3 min · hypertrophie : 60-90 s · gainage : 30-45 s.</div>
      </>}

      {id === 'tdee' && <>
        <div style={{ ...darkCard }}>
          <div style={{ fontSize: 12, letterSpacing: '0.1em', fontWeight: 800, color: F.accent2 }}>TA CIBLE PAR JOUR</div>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-0.04em' }}>{t.kcal} <span style={{ fontSize: 18 }}>kcal</span></div>
          {[{ l: 'Protéines', v: t.p, c: F.green }, { l: 'Glucides', v: t.c, c: F.gold }, { l: 'Lipides', v: t.f, c: F.blue }].map(x => <div key={x.l} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px', alignItems: 'center', gap: 10, marginTop: 8 }}><span style={{ fontSize: 13 }}>{x.l}</span><Bar value={x.v * (x.l === 'Lipides' ? 9 : 4)} max={t.kcal} color={x.c} /><b style={{ textAlign: 'right' }}>{x.v} g</b></div>)}
        </div>
        <div style={{ ...card, marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          Métabolisme de base : <b>{t.bmr} kcal</b><br />Dépense avec {o.profile.sessionsPerWeek} séances : <b>{t.tdee} kcal</b><br />Objectif « {o.profile.goal} » → <b>{t.kcal} kcal</b> ({t.kcal - t.tdee > 0 ? '+' : ''}{t.kcal - t.tdee} kcal/jour)<br />Fibres : <b>{t.fiber} g</b> · Eau : <b>{t.waterL} L</b>
        </div>
        <div style={{ fontSize: 13, color: F.muted, marginTop: 10, lineHeight: 1.45 }}>Avec le Wegovy tu auras souvent moins faim que ça : ce n'est pas grave de manger un peu moins, mais garde toujours tes protéines. On ne descend jamais sous 1 500 kcal pour protéger ton muscle et ton énergie.</div>
      </>}

      {id && MORE.includes(id) && <MoreTool id={id} o={o} onO={onO} toast={toast} />}
      {id === 'agenda' && <Agenda toast={toast} />}
      {id === 'favs' && <FavList o={o} onO={onO} onWeek={w => onO({ ...o, week: w })} onFav={onFav} toast={toast} />}
      {id === 'tastes' && <Tastes onDone={async (likes, dislikes) => { try { await forme.profile({ likes: [...new Set([...o.profile.likes, ...likes])].slice(-40), dislikes: [...new Set([...o.profile.dislikes, ...dislikes])].slice(-40) }); onO(await forme.overview()); toast('😋 Goûts enregistrés : la prochaine semaine en tiendra compte'); onClose(); } catch (e) { toast(errText(e)); } }} />}

      {id === 'badges' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {o.badges.map(b => <div key={b.id} style={{ ...card, textAlign: 'center', padding: 16, opacity: b.ok ? 1 : 0.4, filter: b.ok ? 'none' : 'grayscale(1)' }}><div style={{ fontSize: 40 }}>{b.emoji}</div><div style={{ fontWeight: 800, marginTop: 4 }}>{b.label}</div><div style={{ fontSize: 12, color: b.ok ? F.green : F.muted, fontWeight: 700 }}>{b.ok ? 'débloqué' : 'à débloquer'}</div></div>)}
        <div style={{ ...card, gridColumn: '1 / -1', textAlign: 'center' }}>🔥 Série de suivi : <b>{o.streak} jour{o.streak > 1 ? 's' : ''}</b></div>
      </div>}
    </Sheet>
  );
}
