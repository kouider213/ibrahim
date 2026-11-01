import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { forme, errText, vibrate, type Overview, type Profile, type Bulk, type BulkPlan } from './api.ts';
import { F, card, btn, ghostBtn, input, Sheet, Spinner } from './ui.tsx';

// 💪 QUESTIONNAIRE PRISE DE MASSE (01/11, pour son ami qui veut prendre du muscle, pas maigrir) :
// 7 questions → objectif « muscle » = SURPLUS calorique (au lieu du déficit) + plan chiffré et conseils.
// Le calcul est fait par le serveur (forme-food.ts → bulkPlan), sans IA : toujours disponible.

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function Choice<T extends string>({ v, set, opts }: { v: T; set: (x: T) => void; opts: Array<{ id: T; e: string; l: string; sub?: string }> }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {opts.map(o => (
        <button key={o.id} onClick={() => { set(o.id); vibrate(8); }} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', padding: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start', color: F.ink, border: v === o.id ? `2px solid ${F.accent}` : '2px solid transparent' }}>
          <span style={{ fontSize: 26 }}>{o.e}</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{o.l}</div>{o.sub && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 1 }}>{o.sub}</div>}</div>
          {v === o.id && <span style={{ color: F.accent, fontWeight: 800 }}>✓</span>}
        </button>
      ))}
    </div>
  );
}

export function BulkPlanView({ plan }: { plan: BulkPlan }) {
  const big = (v: ReactNode, l: string, c: string = F.ink) => <div style={{ ...card, padding: 12, flex: 1, minWidth: 0 }}><div style={{ fontSize: 22, fontWeight: 800, color: c, letterSpacing: '-0.02em' }}>{v}</div><div style={{ fontSize: 11.5, color: F.muted, fontWeight: 600 }}>{l}</div></div>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>{big(plan.kcal, 'kcal par jour', F.green)}{big(`${plan.prot} g`, 'protéines / jour', '#1f63f0')}{big(`+${String(plan.kgMonth).replace('.', ',')} kg`, 'par mois')}</div>
      <div style={{ ...card, padding: 14, fontSize: 14, lineHeight: 1.5 }}>
        Ta dépense ≈ <b>{plan.tdee} kcal</b>, on ajoute <b>+{plan.surplus} kcal</b> pour construire du muscle.
        {plan.toGain > 0 && plan.eta ? <> De {String(plan.weightKg).replace('.', ',')} à <b>{String(plan.targetKg).replace('.', ',')} kg</b> (+{String(plan.toGain).replace('.', ',')} kg) : environ <b>{plan.weeks} semaines</b>, vers le <b>{fmtDay(plan.eta)}</b>.</> : null}
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 13, color: F.muted }}><span>Glucides {plan.carb} g</span><span>Lipides {plan.fat} g</span><span>{plan.meals} repas/jour</span></div>
      </div>
      <div style={{ ...card, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Ton plan prise de masse</div>
        <div style={{ display: 'grid', gap: 10 }}>{plan.tips.map((t, i) => <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: 1.45 }}><span style={{ color: F.green, fontWeight: 800 }}>✓</span><span>{t}</span></div>)}</div>
      </div>
    </div>
  );
}

export function BulkQuiz({ open, onClose, o, onO, toast }: { open: boolean; onClose: () => void; o: Overview; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const p: Profile = o.profile;
  const [i, setI] = useState(0);
  const [b, setB] = useState<Omit<Bulk, 'at'>>({ rate: 'moyen', level: 'debutant', appetite: 'normal', body: 'normal', job: 'assis', sports: '' });
  const [w, setW] = useState(String(p.weightKg)); const [tg, setTg] = useState(String(p.targetKg > p.weightKg ? p.targetKg : p.weightKg + 5));
  const [h, setH] = useState(String(p.heightCm)); const [age, setAge] = useState(String(p.age)); const [spw, setSpw] = useState(p.sessionsPerWeek);
  const [busy, setBusy] = useState(false); const [plan, setPlan] = useState<BulkPlan | null>(null);
  useEffect(() => { if (open) { setI(0); setPlan(null); if (p.bulk) setB({ ...p.bulk }); setW(String(p.weightKg)); setTg(String(p.targetKg > p.weightKg ? p.targetKg : p.weightKg + 5)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (x: Partial<typeof b>) => setB(v => ({ ...v, ...x }));
  const n = (v: string) => Number(v.replace(',', '.'));
  // rythme conseillé selon le physique et le niveau
  const advise = b.body === 'gras' ? 'lent' : b.body === 'maigre' || b.level === 'debutant' ? (b.body === 'maigre' ? 'rapide' : 'moyen') : 'lent';
  const steps: Array<{ q: string; sub?: string; body: ReactNode; ok?: boolean }> = [
    { q: 'Ton corps aujourd\'hui', sub: 'Pour calculer ta dépense de calories.', ok: n(w) >= 35 && n(h) >= 130 && n(age) >= 14, body: (
      <div style={{ ...card, padding: '4px 14px' }}>{([['Poids actuel (kg)', w, setW], ['Taille (cm)', h, setH], ['Âge', age, setAge]] as const).map(([l, v, s]) => (
        <label key={l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: `1px solid ${F.line}` }}><span style={{ fontWeight: 600 }}>{l}</span><input inputMode="decimal" value={v} onChange={e => s(e.target.value)} style={{ ...input, width: 100, textAlign: 'right', padding: '9px 12px' }} /></label>))}</div>) },
    { q: 'Combien veux-tu peser ?', sub: 'Le poids que tu vises. On peut le changer plus tard.', ok: n(tg) > n(w), body: (
      <div style={{ display: 'grid', gap: 10 }}>
        <input inputMode="decimal" value={tg} onChange={e => setTg(e.target.value)} style={{ ...input, fontSize: 28, fontWeight: 800, textAlign: 'center' }} />
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>{[3, 5, 8, 10].map(k => <button key={k} onClick={() => setTg(String(n(w) + k))} style={{ ...ghostBtn, padding: '8px 12px' }}>+{k} kg</button>)}</div>
        {n(tg) <= n(w) && <div style={{ color: F.red, fontSize: 13, textAlign: 'center' }}>Le poids visé doit être plus haut que ton poids actuel.</div>}
      </div>) },
    { q: 'Ton physique', sub: 'Ça change la vitesse à laquelle on peut monter sans prendre de gras.', body: <Choice v={b.body} set={x => set({ body: x })} opts={[
      { id: 'maigre', e: '🦴', l: 'Je suis mince, je ne grossis pas', sub: 'Même en mangeant, la balance ne bouge pas' },
      { id: 'normal', e: '🙂', l: 'Normal', sub: 'Ni l\'un ni l\'autre' },
      { id: 'gras', e: '🍩', l: 'Je prends vite du gras', sub: 'Surtout au ventre' }]} /> },
    { q: 'Depuis quand tu fais de la muscu ?', body: <Choice v={b.level} set={x => set({ level: x })} opts={[
      { id: 'debutant', e: '🌱', l: 'Moins d\'un an (ou jamais)', sub: 'C\'est là qu\'on prend le plus de muscle' },
      { id: 'inter', e: '💪', l: '1 à 3 ans' }, { id: 'confirme', e: '🏋️', l: 'Plus de 3 ans' }]} /> },
    { q: 'Ton appétit', body: <Choice v={b.appetite} set={x => set({ appetite: x })} opts={[
      { id: 'petit', e: '🥄', l: 'Petit mangeur', sub: 'J\'ai vite plus faim, j\'oublie de manger' },
      { id: 'normal', e: '🍽️', l: 'Normal' }, { id: 'gros', e: '🍔', l: 'Gros mangeur', sub: 'Manger beaucoup, pas de problème' }]} /> },
    { q: 'Ta semaine', sub: 'Pour ne pas sous-estimer ce que tu dépenses.', body: (
      <div style={{ display: 'grid', gap: 12 }}>
        <div><div style={{ fontWeight: 700, marginBottom: 8 }}>Séances de muscu par semaine</div><div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4, 5, 6].map(x => <button key={x} onClick={() => setSpw(x)} style={{ ...ghostBtn, flex: 1, padding: '10px 0', background: spw === x ? F.accent : '#fff', color: spw === x ? '#fff' : F.ink }}>{x}</button>)}</div></div>
        <div><div style={{ fontWeight: 700, marginBottom: 8 }}>Ton travail</div><Choice v={b.job} set={x => set({ job: x })} opts={[{ id: 'assis', e: '💺', l: 'Assis (bureau, voiture)' }, { id: 'debout', e: '🧍', l: 'Debout (magasin, service)' }, { id: 'physique', e: '🧱', l: 'Physique (chantier, port de charges)' }]} /></div>
        <div><div style={{ fontWeight: 700, marginBottom: 8 }}>Autre sport ? <span style={{ color: F.muted, fontWeight: 500 }}>(facultatif)</span></div><input value={b.sports} onChange={e => set({ sports: e.target.value })} placeholder="ex. foot 2×/semaine, footing" style={input} /></div>
      </div>) },
    { q: 'À quel rythme ?', sub: `Conseillé pour toi : ${({ lent: 'doux', moyen: 'normal', rapide: 'rapide' } as const)[advise]}.`, body: <Choice v={b.rate} set={x => set({ rate: x })} opts={[
      { id: 'lent', e: '🐢', l: 'Doux : +0,2 kg / semaine', sub: 'Prise propre, très peu de gras (+250 kcal/jour)' },
      { id: 'moyen', e: '🚶', l: 'Normal : +0,3 kg / semaine', sub: 'Le bon équilibre (+350 kcal/jour)' },
      { id: 'rapide', e: '🚀', l: 'Rapide : +0,45 kg / semaine', sub: 'Si tu es très mince et que tu « ne grossis pas » (+500 kcal/jour)' }]} /> },
  ];
  const last = i === steps.length - 1;
  const submit = async () => {
    setBusy(true);
    try { const r = await forme.saveBulk({ bulk: b, weightKg: n(w), targetKg: n(tg), heightCm: n(h), age: n(age), sessionsPerWeek: spw }); setPlan(r.plan); onO(r.overview); vibrate(80); }
    catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  const st = steps[i]!;
  return (
    <Sheet open={open} onClose={onClose} z={70} title={plan ? 'Ton plan 💪' : 'Prise de masse'}>
      {plan ? <><BulkPlanView plan={plan} /><div style={{ fontSize: 12.5, color: F.muted, margin: '12px 2px' }}>L'onglet Repas compte maintenant pour une PRISE DE MASSE : il te dit ce qu'il te reste à manger, plus de déficit.</div><button onClick={onClose} style={{ ...btn, width: '100%' }}>C'est parti</button></> : <>
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>{steps.map((_, k) => <div key={k} style={{ flex: 1, height: 5, borderRadius: 3, background: k <= i ? F.accent : F.bg2 }} />)}</div>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.18 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{st.q}</div>
            {st.sub && <div style={{ fontSize: 13.5, color: F.muted, margin: '4px 0 12px' }}>{st.sub}</div>}
            {!st.sub && <div style={{ height: 12 }} />}
            {st.body}
          </motion.div>
        </AnimatePresence>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {i > 0 && <button onClick={() => setI(i - 1)} style={{ ...ghostBtn, flex: 1 }}>Retour</button>}
          <button disabled={busy || st.ok === false} onClick={() => { if (last) void submit(); else { if (i === steps.length - 2 && !p.bulk) set({ rate: advise }); setI(i + 1); } }} style={{ ...btn, flex: 2, opacity: st.ok === false ? 0.5 : 1 }}>{busy ? <Spinner size={18} color="#fff" /> : last ? 'Voir mon plan' : 'Suivant'}</button>
        </div>
      </>}
    </Sheet>
  );
}

/** Carte de l'onglet Repas : le plan si le questionnaire est fait, sinon l'invitation à le faire */
export function BulkCard({ o, onO, toast }: { o: Overview; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const [open, setOpen] = useState(false); const [plan, setPlan] = useState<BulkPlan | null>(null); const [show, setShow] = useState(false);
  useEffect(() => { if (o.profile.bulk) void forme.bulk().then(r => setPlan(r.plan)).catch(() => {}); }, [o.profile.bulk?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {!o.profile.bulk ? (
        <button onClick={() => setOpen(true)} style={{ ...card, width: '100%', border: `2px solid ${F.green}`, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', fontFamily: F.sans, color: F.ink, textAlign: 'start', marginBottom: 14 }}>
          <span style={{ fontSize: 32 }}>💪</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Questionnaire prise de masse</div><div style={{ fontSize: 13, color: F.muted, lineHeight: 1.4 }}>7 questions (2 min) : combien manger pour prendre du muscle, à quel rythme, et comment y arriver.</div></div>
          <span style={{ color: F.green, fontWeight: 800, fontSize: 20 }}>›</span>
        </button>
      ) : plan && (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>💪</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 800 }}>Prise de masse</div><div style={{ fontSize: 13, color: F.muted }}>{plan.kcal} kcal · {plan.prot} g protéines · +{String(plan.kgMonth).replace('.', ',')} kg/mois{plan.eta ? ` · ${plan.targetKg} kg vers le ${new Date(`${plan.eta}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShow(true)} style={{ ...ghostBtn, flex: 1 }}>Mon plan</button>
            <button onClick={() => setOpen(true)} style={{ ...ghostBtn, flex: 1 }}>Refaire le questionnaire</button>
          </div>
        </div>
      )}
      <BulkQuiz open={open} onClose={() => setOpen(false)} o={o} onO={onO} toast={toast} />
      <Sheet open={show} onClose={() => setShow(false)} title="Ton plan 💪">{plan && <BulkPlanView plan={plan} />}</Sheet>
    </>
  );
}
