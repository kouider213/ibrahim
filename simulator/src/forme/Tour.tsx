import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { F, btn, ghostBtn } from './ui.tsx';
import { tr, isAr } from './i18n.ts';

// GUIDE INTERACTIF (Kouider 25/10) : à la première ouverture, chaque partie de l'écran est mise en lumière une par une
// avec une bulle d'explication, lue à voix haute (en arabe pour sa femme). Revoir : Profil → « Revoir le guide ».
interface Step { sel?: string; text: string }
const STEPS = (name: string, kouider: boolean): Step[] => [
  { text: `Bienvenue ${name} ! Je te montre comment marche FORME en 1 minute. Touche « Suivant ».` },
  { sel: 'ring', text: 'Ici : tes calories et tes protéines du jour. Le cercle se remplit quand tu coches tes repas.' },
  { sel: 'agenda', text: 'Ton agenda : tes séances, tes repas, ton injection et tes rappels de la semaine.' },
  { sel: 'challenge', text: 'Le défi de la semaine : réussis-le pour gagner un badge.' },
  { sel: 'inj', text: 'Ton injection : le jour, l\'heure et l\'endroit conseillé. Touche ici pour la noter quand c\'est fait.' },
  { sel: 'water', text: 'Touche un carré à chaque verre d\'eau bu.' },
  { sel: 'menu', text: 'Tes repas du jour. Touche la photo pour voir la recette, et le rond pour dire « j\'ai mangé ».' },
  { sel: 'tools', text: 'Tous tes outils : photo de l\'assiette, scanner de produits, coach (tu peux lui parler 🎤), jeûne, rappels, favoris…' },
  { sel: 'nav-week', text: 'Semaine : tous tes repas, tous différents. Touche 🤍 sur une recette pour la garder dans « Mes favoris ».' },
  { sel: 'nav-shop', text: kouider ? 'Courses : la liste commune avec ta femme. Ce que l\'un coche est coché chez l\'autre.' : 'Courses : la liste commune avec Kouider. Ce que l\'un coche est coché chez l\'autre.' },
  { sel: 'nav-sport', text: 'Sport : ta séance du jour avec les exercices en images et le minuteur de repos.' },
  { sel: 'nav-body', text: 'Corps : ton poids, tes photos avant/après, et « ce que je veux perdre » pour adapter ta séance de demain.' },
  { sel: 'profile', text: 'Ton profil : langue, jours de repos, dose, notifications. Tu peux revoir ce guide ici à tout moment.' },
  { text: 'C\'est parti ! Bonne route 💪' },
];

function speak(t: string) {
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t.replace(/[🎤🤍💪]/gu, '')); u.lang = isAr() ? 'ar-SA' : 'fr-FR'; u.rate = 0.95; speechSynthesis.speak(u); } catch { /* */ }
}

export default function Tour({ name, kouider, onDone }: { name: string; kouider: boolean; onDone: () => void }) {
  const steps = STEPS(name, kouider).filter(s => !s.sel || document.querySelector(`[data-tour="${s.sel}"]`));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [voice, setVoice] = useState(true);
  const st = steps[i]!;
  useLayoutEffect(() => {
    setRect(null);
    const el = st.sel ? document.querySelector(`[data-tour="${st.sel}"]`) as HTMLElement | null : null;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setRect(el.getBoundingClientRect()), 420);
    return () => clearTimeout(t);
  }, [i, st.sel]);
  useEffect(() => { if (voice) speak(tr(st.text)); }, [i, voice, st.text]);
  useEffect(() => () => { try { speechSynthesis.cancel(); } catch { /* */ } }, []);
  const end = () => { try { speechSynthesis.cancel(); } catch { /* */ } onDone(); };
  const pad = 8, H = innerHeight;
  const below = rect ? rect.bottom + 230 < H : true;
  const bubbleTop = rect ? (below ? rect.bottom + pad + 12 : Math.max(12, rect.top - pad - 12 - 210)) : H / 2 - 120;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      {rect ? (
        <motion.div layout initial={false} animate={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          style={{ position: 'fixed', borderRadius: 20, boxShadow: '0 0 0 9999px rgba(20,10,8,0.66)', pointerEvents: 'none' }}>
          <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.9, 0.4, 0.9] }} transition={{ repeat: Infinity, duration: 1.4 }} style={{ position: 'absolute', inset: -4, borderRadius: 24, border: `3px solid ${F.accent2}` }} />
        </motion.div>
      ) : <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,8,0.66)' }} />}
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', left: 16, right: 16, top: bubbleTop, maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 22, padding: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.35)', fontFamily: 'inherit', color: F.ink }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: F.accent, color: '#fff', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>F</div>
            <div style={{ fontSize: 16, lineHeight: 1.5, fontWeight: 600 }}>{st.text}</div>
          </div>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', margin: '12px 0' }}>{steps.map((_, k) => <span key={k} style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 4, background: k <= i ? F.accent : F.bg2, transition: 'all .2s' }} />)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={end} style={{ ...ghostBtn, padding: '10px 12px', fontSize: 13.5 }}>Passer</button>
            <button onClick={() => setVoice(v => { if (v) { try { speechSynthesis.cancel(); } catch { /* */ } } return !v; })} aria-label="Voix" style={{ ...ghostBtn, padding: '10px 12px' }}>{voice ? '🔊' : '🔇'}</button>
            <div style={{ flex: 1 }} />
            {i > 0 && <button onClick={() => setI(i - 1)} style={{ ...ghostBtn, padding: '10px 14px' }}>←</button>}
            <button onClick={() => (i < steps.length - 1 ? setI(i + 1) : end())} style={{ ...btn, padding: '10px 18px', fontSize: 15 }}>{i < steps.length - 1 ? 'Suivant →' : 'Terminer ✓'}</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
