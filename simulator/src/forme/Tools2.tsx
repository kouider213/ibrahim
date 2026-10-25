import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { forme, errText, type Overview, type Profile, SHORT_DAYS, dayOf, DAYS, vibrate } from './api.ts';
import { F, Section, card, darkCard, btn, ghostBtn, input, Chip, Spinner, Bar } from './ui.tsx';
import { Ask, type ToolId } from './Tools.tsx';

// 10 outils de plus (Kouider 25/10) : jeûne, frigo vide, batch cooking, bilan médecin, rappels perso, sommeil, pas,
// IMC & tour de taille, anti-fringale, portions à la main. Tout ce qui est noté part au serveur → Dzaryx le voit.
export const MORE: ToolId[] = ['fasting', 'fridge', 'batch', 'doctor', 'reminders', 'sleep', 'steps', 'bmi', 'craving', 'portions'];

function Breath() {
  const [on, setOn] = useState(false);
  const [left, setLeft] = useState(120);
  const [phase, setPhase] = useState<'Inspire' | 'Bloque' | 'Expire'>('Inspire');
  useEffect(() => {
    if (!on) return;
    let s = 0;
    const t = setInterval(() => {
      s++; setLeft(l => { if (l <= 1) { setOn(false); vibrate(200); return 120; } return l - 1; });
      const c = s % 12; setPhase(c < 4 ? 'Inspire' : c < 6 ? 'Bloque' : 'Expire');
    }, 1000);
    return () => clearInterval(t);
  }, [on]);
  return (
    <div style={{ ...darkCard, textAlign: 'center' }}>
      <motion.div animate={on ? { scale: phase === 'Inspire' ? 1.35 : phase === 'Bloque' ? 1.35 : 0.85 } : { scale: 1 }} transition={{ duration: phase === 'Expire' ? 6 : 4, ease: 'easeInOut' }}
        style={{ width: 120, height: 120, borderRadius: 60, margin: '14px auto', background: `radial-gradient(circle, ${F.accent2}, ${F.accent})`, boxShadow: '0 0 40px rgba(255,122,69,0.5)' }} />
      <div style={{ fontSize: 22, fontWeight: 900 }}>{on ? phase : 'Respiration 4-2-6'}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 12px' }}>{on ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '2 minutes : la fringale passe souvent toute seule'}</div>
      <button onClick={() => setOn(o => !o)} style={{ ...btn, width: '100%' }}>{on ? 'Arrêter' : '▶ Commencer'}</button>
    </div>
  );
}

export default function MoreTool({ id, o, onO, toast }: { id: ToolId; o: Overview; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const p = o.profile;
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState('');
  const [rem, setRem] = useState({ label: '', time: '09:00' });
  const [steps, setSteps] = useState('');
  const save = async (patch: Partial<Profile>, msg?: string) => {
    try { await forme.profile(patch); onO(await forme.overview()); if (msg) toast(msg); } catch (e) { toast(errText(e)); }
  };
  const log = async (kind: string, body: Record<string, unknown>, msg: string) => { try { onO(await forme.log(kind, body)); vibrate(25); toast(msg); } catch (e) { toast(errText(e)); } };
  const lastM = o.measures[o.measures.length - 1];
  const kg = o.weights[o.weights.length - 1]?.kg ?? p.weightKg;

  if (id === 'fasting') return (
    <div>
      <div style={{ fontSize: 14, color: F.muted, marginBottom: 12, lineHeight: 1.45 }}>Ta semaine de repas s'adapte : s'hour avant l'aube (protéines + fibres + eau) et iftar (dattes, eau, chorba puis plat léger). Avec le traitement, on évite les gros iftars gras qui donnent la nausée.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {([['off', '🍽️', 'Pas de jeûne', 'Repas normaux'], ['sunna', '🌗', 'Lundi et jeudi', 'Jeûne surérogatoire 2 jours / semaine'], ['ramadan', '🌙', 'Ramadan', "Tous les jours : s'hour + iftar"]] as const).map(([v, e, t, d]) => (
          <button key={v} onClick={() => void save({ fasting: v }, 'Mode jeûne enregistré')} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', border: p.fasting === v ? `3px solid ${F.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'start', fontFamily: 'inherit', color: F.ink }}>
            <span style={{ fontSize: 32 }}>{e}</span><span><b style={{ fontSize: 16 }}>{t}</b><br /><span style={{ fontSize: 13, color: F.muted }}>{d}</span></span>
          </button>))}
      </div>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await forme.makeWeek(true); onO(await forme.overview()); toast('🌙 Nouvelle semaine adaptée'); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%', marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8 }}>{busy ? <><Spinner size={16} color="#fff" /> Nouvelle semaine… (~1 min)</> : '🔄 Refaire ma semaine avec ce mode'}</button>
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 10, lineHeight: 1.45 }}>Jeûner sous traitement GLP-1 : parles-en à ton médecin (hydratation, hypoglycémie, jour d'injection).</div>
    </div>
  );

  if (id === 'fridge') return <Ask mode="fridge" intro="Dis ce qu'il te reste (frigo, placard) : 2 recettes halal rapides avec seulement ça." placeholder="ex. 3 œufs, 1 courgette, du riz, du thon"
    preset={['Œufs, tomates, oignon, pain', 'Poulet, riz, poivron', 'Thon, pâtes, crème légère', 'Lentilles, carottes, oignon', 'Skyr, flocons d\'avoine, banane']} />;

  if (id === 'batch') return <Ask mode="batch" intro="Le dimanche, 2 h de cuisine pour toute la semaine : l'ordre exact, ce qui se congèle, les boîtes à préparer (d'après TES recettes)." placeholder="Une précision ? (ex. j'ai 1 h seulement)"
    preset={['Fais mon plan de batch cooking', 'Version 1 heure', 'Que congeler pour jeudi-vendredi ?']} />;

  if (id === 'doctor') return (
    <div>
      <div style={{ fontSize: 14, color: F.muted, marginBottom: 12, lineHeight: 1.45 }}>À montrer à ton médecin au prochain contrôle : poids, IMC, tour de taille, doses et paliers, injections, effets ressentis.</div>
      {!doc && <button disabled={busy} onClick={async () => { setBusy(true); try { setDoc((await forme.doctor()).text); } catch (e) { toast(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%' }}>{busy ? 'Préparation…' : '🩺 Préparer mon bilan'}</button>}
      {doc && <>
        <div style={{ ...card, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, monospace' }}>{doc}</div>
        <button onClick={async () => { try { if (navigator.share) await navigator.share({ text: doc }); else { await navigator.clipboard.writeText(doc); toast('Bilan copié'); } } catch { /* */ } }} style={{ ...btn, width: '100%', marginTop: 10 }}>📤 Envoyer / copier</button>
      </>}
    </div>
  );

  if (id === 'reminders') return (
    <div>
      <div style={{ fontSize: 14, color: F.muted, marginBottom: 12 }}>Vitamine D (souvent conseillée en Belgique l'hiver), médicament, créatine, crème… FORME te le rappelle à l'heure.</div>
      <div style={{ ...card, padding: '4px 14px' }}>
        {p.reminders.length ? p.reminders.map(x => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${F.line}` }}>
            <b style={{ fontSize: 16 }}>{x.time}</b><span style={{ flex: 1 }}>{x.label}<br /><small style={{ color: F.muted }}>{x.days.length === 7 ? 'tous les jours' : x.days.map(d => DAYS[d]!.slice(0, 3)).join(', ')}</small></span>
            <button onClick={() => void save({ reminders: p.reminders.filter(y => y.id !== x.id) }, 'Rappel supprimé')} style={{ ...ghostBtn, padding: '4px 10px' }}>✕</button>
          </div>)) : <div style={{ padding: '12px 0', color: F.muted }}>Aucun rappel.</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <input value={rem.label} onChange={e => setRem({ ...rem, label: e.target.value })} placeholder="ex. Vitamine D" style={{ ...input, flex: 2 }} />
        <input type="time" value={rem.time} onChange={e => setRem({ ...rem, time: e.target.value })} style={{ ...input, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{['Vitamine D', 'Magnésium', 'Créatine', 'Médicament', 'Oméga 3', 'Crème hydratante'].map(x => <Chip key={x} onClick={() => setRem({ ...rem, label: x })}>{x}</Chip>)}</div>
      <button disabled={!rem.label.trim()} onClick={() => { void save({ reminders: [...p.reminders, { id: Date.now().toString(36), label: rem.label.trim(), time: rem.time, days: [0, 1, 2, 3, 4, 5, 6] }] }, '⏰ Rappel ajouté'); setRem({ label: '', time: rem.time }); }} style={{ ...btn, width: '100%', marginTop: 10, opacity: rem.label.trim() ? 1 : 0.5 }}>+ Ajouter le rappel</button>
    </div>
  );

  if (id === 'sleep') return (
    <div>
      <div style={{ fontSize: 14, color: F.muted, marginBottom: 12 }}>Moins de 7 h = plus de fringales et moins de muscle. Combien d'heures cette nuit ?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>{[5, 5.5, 6, 6.5, 7, 7.5, 8, 9].map(h => <button key={h} onClick={() => void log('sleep', { hours: h }, `😴 ${h} h notées`)} style={{ ...ghostBtn, padding: '14px 0', fontSize: 16, background: o.day.sleep === h ? F.violet : '#fff', color: o.day.sleep === h ? '#fff' : F.ink }}>{String(h).replace('.', ',')} h</button>)}</div>
      <Section a="7 dernières" b="nuits" />
      <div style={{ ...card, display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
        {o.week7.map(d => <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
          <small style={{ fontWeight: 800, color: (d.sleep ?? 0) >= 7 ? F.green : F.muted }}>{d.sleep ? `${d.sleep}` : ''}</small>
          <div style={{ width: '100%', height: `${Math.max(4, (d.sleep ?? 0) / 10 * 85)}%`, borderRadius: 8, background: (d.sleep ?? 0) >= 7 ? F.violet : '#d9d0ff' }} />
          <small style={{ fontSize: 10.5, color: F.muted, fontWeight: 800 }}>{SHORT_DAYS[dayOf(d.date)]!.slice(0, 1)}</small></div>)}
      </div>
    </div>
  );

  if (id === 'steps') {
    const today = o.day.steps ?? 0;
    return (
      <div>
        <div style={{ ...darkCard, textAlign: 'center' }}>
          <div style={{ fontSize: 44, fontWeight: 900, color: F.accent2 }}>{today.toLocaleString('fr-BE')}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>pas aujourd'hui · objectif {p.stepsGoal.toLocaleString('fr-BE')}</div>
          <div style={{ marginTop: 10 }}><Bar value={today} max={p.stepsGoal} color={F.green} h={10} /></div>
        </div>
        <div style={{ fontSize: 13, color: F.muted, margin: '12px 0 8px' }}>Recopie le chiffre de l'app Santé de ton iPhone (Santé → Pas).</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input inputMode="numeric" value={steps} onChange={e => setSteps(e.target.value)} placeholder="ex. 8450" style={input} />
          <button onClick={() => { const n = Number(steps.replace(/\D/g, '')); if (n >= 0) void log('steps', { steps: n }, '🚶 Pas notés'); setSteps(''); }} style={{ ...btn, padding: '0 18px' }}>OK</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{[6000, 8000, 10000, 12000].map(g => <Chip key={g} on={p.stepsGoal === g} onClick={() => void save({ stepsGoal: g })}>{`${g / 1000}k`}</Chip>)}</div>
        <div style={{ fontSize: 13, color: F.muted, marginTop: 12, lineHeight: 1.45 }}>Marcher 20-30 min après le repas aide la digestion et la glycémie, et brûle des graisses sans fatiguer les muscles de la salle.</div>
      </div>
    );
  }

  if (id === 'bmi') {
    const h = p.heightCm / 100, bmi = kg / (h * h);
    const waist = Number(lastM?.taille ?? 0), ratio = waist ? waist / p.heightCm : 0;
    const cat = bmi < 18.5 ? ['Maigreur', F.blue] : bmi < 25 ? ['Corpulence normale', F.green] : bmi < 30 ? ['Surpoids', F.gold] : ['Obésité', F.accent];
    return (
      <div>
        <div style={{ ...darkCard, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ fontSize: 46, fontWeight: 900, color: cat[1] }}>{bmi.toFixed(1)}</div>
          <div><b>IMC · {cat[0]}</b><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{kg} kg · {p.heightCm} cm · poids « normal » jusqu'à {(24.9 * h * h).toFixed(0)} kg</div></div>
        </div>
        <div style={{ ...card, marginTop: 12 }}>
          <b>Tour de taille / taille</b>
          {waist ? <><div style={{ fontSize: 30, fontWeight: 900, color: ratio < 0.5 ? F.green : ratio < 0.6 ? F.gold : F.accent, marginTop: 4 }}>{ratio.toFixed(2)}</div>
            <div style={{ fontSize: 13.5, color: F.muted }}>{waist} cm de tour de taille. Sous 0,50 = graisse du ventre dans la zone saine{ratio >= 0.5 ? ` : objectif ≈ ${(p.heightCm * 0.5).toFixed(0)} cm` : ' ✅'}.</div></>
            : <div style={{ fontSize: 13.5, color: F.muted, marginTop: 4 }}>Note ton tour de taille dans Corps → Mensurations : c'est le meilleur indicateur de la graisse du ventre (meilleur que l'IMC quand on prend du muscle).</div>}
        </div>
      </div>
    );
  }

  if (id === 'craving') return (
    <div>
      <Breath />
      <Section a="Avant de" b="craquer" />
      <div style={{ ...card }}>
        {['💧 Un grand verre d\'eau : la soif ressemble souvent à la faim', '🥚 Une collation protéinée : skyr, œuf dur, fromage blanc', '🦷 Te brosser les dents : le goût coupe l\'envie', '🚶 5 minutes dehors, ou appelle quelqu\'un', '🍫 Si tu craques : 2 carrés de chocolat noir, pas la tablette — et sans culpabiliser'].map(x => <div key={x} style={{ padding: '8px 0', fontSize: 14.5, lineHeight: 1.4 }}>{x}</div>)}
      </div>
      <div style={{ marginTop: 12 }}><Ask intro="" placeholder="Raconte : quelle envie, à quel moment ?" preset={['Envie de sucré le soir', 'Envie de grignoter devant la télé', 'Faim 1 h après manger']} /></div>
    </div>
  );

  if (id === 'portions') {
    const t = o.targets, meals = Math.max(2, p.mealsPerDay);
    const rows = [
      { e: '✋', t: 'Protéines = la paume', d: `${Math.round(t.p / meals)} g de protéines/repas ≈ ${p.sex === 'h' ? '1 à 2 paumes' : '1 paume'} de poulet, poisson, viande halal, œufs`, c: F.green },
      { e: '✊', t: 'Féculents = le poing', d: `${p.sex === 'h' ? '1 à 2 poings' : '1 poing'} de riz, pâtes, pommes de terre, semoule (cuits)`, c: F.gold },
      { e: '🤲', t: 'Légumes = 2 mains ouvertes', d: 'à volonté ou presque : la moitié de l\'assiette', c: '#3fae5a' },
      { e: '👍', t: 'Gras = le pouce', d: `${p.sex === 'h' ? '1 à 2 pouces' : '1 pouce'} d'huile d'olive, beurre, fromage, fruits secs`, c: F.blue },
    ];
    return (
      <div>
        <div style={{ fontSize: 14, color: F.muted, marginBottom: 12 }}>Pas de balance au resto ou chez la famille ? Ta main suffit (elle grandit avec toi).</div>
        {rows.map(x => <div key={x.t} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10, borderInlineStart: `6px solid ${x.c}` }}><span style={{ fontSize: 40 }}>{x.e}</span><div><b style={{ fontSize: 16 }}>{x.t}</b><div style={{ fontSize: 13.5, color: F.muted, marginTop: 2 }}>{x.d}</div></div></div>)}
        <div style={{ fontSize: 12.5, color: F.muted, lineHeight: 1.45 }}>Avec le traitement : commence par les protéines, puis les légumes, et arrête-toi dès que tu n'as plus faim même s'il en reste.</div>
      </div>
    );
  }
  return null;
}
