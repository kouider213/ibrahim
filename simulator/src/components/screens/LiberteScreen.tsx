import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, PageHeader, Screen, Card, SectionTitle, Btn, Sheet, Field, inputStyle, Kpi, KpiGrid, Badge } from '../ui/Kit.tsx';

// LIBERTÉ : programme pour arrêter complètement un médicament pris tous les jours (Kouider, privé).
// Tout vient du serveur (/api/liberte) — rien de personnel dans ce code (dépôt public).
// Mêmes actions que l'outil « liberte » de Dzaryx : ce qu'il note ici, Dzaryx le sait au chat, en appel et par Siri.

interface Step { from: string; max: number }
interface Log { at: string; kind: string; n?: number; score?: number; trigger?: string; symptoms?: string[]; note?: string }
interface Overview {
  state: null | {
    active: boolean; med: string; baseline: number; start: string; steps: Step[]; times: string[]; holdDays: number; doctorPlan?: boolean;
    doctor: { status: 'a_appeler' | 'rdv_pris' | 'vu'; date?: string; note?: string }; why: string[]; consequence?: string; finishedAt?: string;
    ifThen?: string[]; rewards?: Array<{ name: string; cost: number; at?: string }>; letter?: string;
  };
  today: string; hhmm: string; day: number; totalDays: number;
  allowed: number; taken: number; left: number; byNow: number;
  plan: Array<{ time: string; n: number }>; next: { time: string; n: number } | null;
  tomorrow: number; nextDrop: Step | null; zero: string;
  streak: number; zeroStreak: number; avoided: number;
  cravings: { total: number; resisted: number; week: number };
  lastSymptoms: Log | null; triggers: Array<{ trigger: string; n: number }>;
  week: Array<{ date: string; taken: number; allowed: number }>;
  recent: Log[]; sos: string[];
  bank: { earned: number; spent: number; balance: number; rate: number; days: Array<{ date: string; gain: number }> } | null;
  riskHours: number[];
  comeback: Array<{ week: number; energie?: number; desir?: number; joie?: number; clarte?: number }>;
  phq2: number | null;
}
const eur = (n: number) => `${n.toFixed(1).replace('.', ',').replace(',0', '')} €`;

const DOVE = '#7dd3fc';
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const demis = (n: number) => `${n} demi${n > 1 ? 's' : ''}`;
const TRIGGERS = ['réveil', 'stress', 'travail', 'fatigue', 'ennui', 'tristesse', 'douleur', 'dispute', 'habitude'];
const SYMPTOMS = ['fatigue', 'anxiété', 'insomnie', 'frissons', 'sueurs', 'diarrhée', 'nez qui coule', 'jambes agitées', 'douleurs', 'irritable', 'moral bas', 'fourmillements'];

export default function LiberteScreen() {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'sos' | 'sym' | 'doc' | 'why' | 'plan' | 'bank' | 'back'>(null);

  const load = useCallback(async () => {
    try { setO(await apiFetch<Overview>('/api/liberte')); setErr(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur'); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3800); };

  const act = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const r = await apiFetch<{ message: string; overview: Overview }>('/api/liberte/action', { method: 'POST', body: JSON.stringify(body) });
      if (r.overview) setO(r.overview);
      say(r.message.startsWith('❌') || r.message.startsWith('⚠️') || r.message.startsWith('🚨') ? r.message.split('\n')[0]!.slice(0, 160) : ok ?? '✅ Noté');
      return r;
    } catch (e) { say(`❌ ${e instanceof Error ? e.message : 'Erreur'}`); return null; }
    finally { setBusy(false); }
  };

  const s = o?.state;
  const header = <PageHeader eyebrow="Dzaryx · privé" title="🕊️ Liberté" subtitle={!s ? 'Arrêter pour de bon, avec Dzaryx à côté' : s.finishedAt ? 'Tu l\'as fait. Vigilance 60 jours.' : `Jour ${o!.day} sur ${o!.totalDays} · zéro le ${fmt(o!.zero)}`} />;

  if (!o) return <Screen header={header}><Card>{err ? `❌ ${err}` : 'Chargement…'}</Card></Screen>;
  if (!s || !s.active) return <Screen header={header} toast={toast}><Setup onStart={async b => { await act({ action: 'start', restart: true, ...b }, '🕊️ C\'est parti. Dzaryx est avec toi.'); }} busy={busy} /><SosCard sos={o.sos} /></Screen>;

  const pct = Math.min(100, Math.round(((o.day - 1) / Math.max(1, o.totalDays - 1)) * 100));
  const over = o.taken > o.allowed;

  return (
    <Screen header={header} toast={toast}>
      {/* Aujourd'hui */}
      <Card accent={over ? T.bad : DOVE} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring taken={o.taken} allowed={o.allowed} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: T.muted }}>Aujourd'hui</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: over ? T.bad : T.text }}>{o.allowed ? `${o.taken} / ${demis(o.allowed)}` : s.finishedAt ? 'Libre 🕊️' : 'Zéro 💪'}</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
              {over ? 'Dépassé. Pas de honte : on note, on tient jusqu\'à demain.' : o.next ? `Prochaine prise autorisée : ${o.next.time} (${demis(o.next.n)})` : o.left ? 'C\'est l\'heure de ta prise.' : 'Plus rien aujourd\'hui. Tu tiens.'}
            </div>
          </div>
        </div>
        {o.allowed > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {(() => { let cum = 0; return o.plan.map(p => { cum += p.n; const done = p.n > 0 && o.taken >= cum; return (
              <div key={p.time} style={{ flex: '1 1 60px', textAlign: 'center', padding: '8px 4px', borderRadius: 12, background: p.n ? tone(done ? T.ok : DOVE, 0.12) : 'rgba(255,255,255,0.03)', border: `1px solid ${p.n ? tone(done ? T.ok : DOVE, 0.35) : T.line}`, opacity: p.n ? 1 : 0.45 }}>
                <div style={{ fontSize: 12, color: T.muted }}>{p.time}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{p.n ? `${done ? '✓ ' : ''}${p.n} × ½` : '—'}</div>
              </div>); }); })()}
          </div>
        )}
        <div className="lib-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <style>{'.lib-grid button{white-space:normal;padding:0 8px;line-height:1.2;width:100%;min-width:0}'}</style>
          <Btn variant="primary" color={DOVE} disabled={busy} onClick={() => act({ action: 'prise', n: 1 }, '✅ Noté. Merci de dire la vérité.')}>💊 J'ai pris ½</Btn>
          <Btn variant="danger" onClick={() => setSheet('sos')}>🔥 J'ai une envie</Btn>
          <Btn onClick={() => setSheet('sym')}>🤒 Mon état du jour</Btn>
          <Btn onClick={() => setSheet('why')}>❤️ Mes raisons</Btn>
        </div>
      </Card>

      {/* Médecin */}
      {s.doctor.status !== 'vu' && (
        <Card accent={T.warn} style={{ marginBottom: 12 }} onClick={() => setSheet('doc')}>
          <div style={{ fontWeight: 700 }}>🩺 {s.doctor.status === 'a_appeler' ? 'Étape 1 : appelle ton médecin' : `RDV médecin : ${s.doctor.date?.replace('T', ' à ') ?? 'pris'}`}</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>
            {s.doctor.status === 'a_appeler' ? 'Il valide le plan, peut soulager le manque, et s\'occupe de la fatigue, du moral et de la libido (prise de sang). Touche ici quand c\'est fait.' : 'Touche ici après la consultation pour noter ce qu\'il a dit.'}
          </div>
        </Card>
      )}

      {/* Chiffres */}
      <KpiGrid cols={3}>
        <Kpi value={o.streak} label="jours dans le plan" color={T.ok} />
        <Kpi value={o.avoided} label="demis évités" color={DOVE} />
        <Kpi value={`${o.cravings.resisted}/${o.cravings.total}`} label="envies tenues" color={T.violet} />
      </KpiGrid>

      {/* Cagnotte (gestion des contingences) */}
      {o.bank && (
        <Card accent={T.warn} style={{ margin: '12px 0' }} onClick={() => setSheet('bank')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 30 }}>💰</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.muted }}>Ta cagnotte Liberté</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{eur(o.bank.balance)}</div>
              <div style={{ fontSize: 12.5, color: T.muted }}>Demain, jour validé = +{eur(o.bank.rate)} · ça monte chaque jour</div>
            </div>
            <div style={{ fontSize: 12, color: T.accent }}>Récompenses ›</div>
          </div>
          {(() => { const next = s.rewards?.find(r => !r.at); return next ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 4 }}>🎁 {next.name} — {eur(Math.min(o.bank.balance, next.cost))} / {next.cost} €</div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}><div style={{ width: `${Math.min(100, (o.bank.balance / next.cost) * 100)}%`, height: '100%', borderRadius: 3, background: T.warn }} /></div>
            </div>) : null; })()}
        </Card>
      )}

      {/* Ce qui revient */}
      <Card style={{ marginBottom: 12 }} onClick={() => setSheet('back')}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>✨ Ce qui revient</div>
        {o.comeback.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {(['energie', 'desir', 'joie', 'clarte'] as const).map(k => { const a = o.comeback[0]![k], b = o.comeback[o.comeback.length - 1]![k]; return (
              <div key={k} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: b != null && a != null && b > a ? T.ok : T.text }}>{b ?? '—'}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{{ energie: 'énergie', desir: 'désir', joie: 'joie', clarte: 'clarté' }[k]}</div>
                {a != null && b != null && o.comeback.length > 1 && <div style={{ fontSize: 11, color: b >= a ? T.ok : T.bad }}>{b >= a ? '+' : ''}{Math.round((b - a) * 10) / 10}</div>}
              </div>); })}
          </div>
        ) : <div style={{ fontSize: 13, color: T.muted }}>Note chaque semaine ton énergie, ton désir, ta joie, ton esprit clair : tu verras ce que tu récupères. Touche ici.</div>}
      </Card>

      {/* Le chemin */}
      <SectionTitle right={<button onClick={() => setSheet('plan')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, cursor: 'pointer' }}>Détails</button>}>Le chemin</SectionTitle>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${DOVE}, ${T.ok})` }} />
        </div>
        <Stairs steps={s.steps} today={o.today} />
        <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>
          {o.nextDrop ? `Prochaine marche : ${fmt(o.nextDrop.from)} → ${o.nextDrop.max ? demis(o.nextDrop.max) : 'ZÉRO'} par jour` : `Au palier zéro depuis le ${fmt(o.zero)} · ${o.zeroStreak} jour(s) sans rien`}
          {s.holdDays ? ` · paliers allongés de ${s.holdDays} j` : ''}
        </div>
      </Card>

      {/* Semaine */}
      {o.week.length > 0 && <>
        <SectionTitle>Ta semaine</SectionTitle>
        <Card style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {o.week.map(d => {
            const max = Math.max(1, ...o.week.map(x => Math.max(x.taken, x.allowed)));
            return (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 11, color: T.muted }}>{d.taken}</div>
                <div style={{ width: '70%', height: `${(d.taken / max) * 70}%`, minHeight: 3, borderRadius: 4, background: d.taken > d.allowed ? T.bad : T.ok }} />
                <div style={{ fontSize: 11, color: T.faint }}>{fmt(d.date).split(' ')[0]}</div>
              </div>
            );
          })}
        </Card>
      </>}

      {o.riskHours.length > 0 && (
        <Card accent={T.warn} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>⏰ Tes heures à risque : {o.riskHours.map(h => `${h}h`).join(', ')}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>Dzaryx te prévient 15 min avant, avec tes plans « si… alors… ».</div>
        </Card>
      )}
      {o.triggers.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🎯 Ce qui déclenche tes envies</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{o.triggers.map(t => <Badge key={t.trigger} color={T.warn}>{t.trigger} · {t.n}</Badge>)}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>Dzaryx prépare ces moments-là à l'avance.</div>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 Ce qui revient quand tu arrêtes</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Les premiers jours après chaque marche peuvent être durs (fatigue, nervosité, sommeil). Puis, semaine après semaine : l'énergie, l'esprit clair, l'envie, le désir, le rire. Le corps se répare — laisse-lui quelques semaines.
        </div>
      </Card>

      <SosCard sos={o.sos} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {!s.finishedAt && o.allowed === 0 && <Btn color={T.ok} onClick={() => { if (confirm('Tu confirmes : c\'est bon, tu as arrêté complètement ?')) void act({ action: 'finish', confirm: true }, '🕊️ Bravo. Dzaryx reste en vigilance.'); }}>🏁 C'est bon, j'ai arrêté</Btn>}
        <Btn onClick={() => setSheet('plan')}>⚙️ Heures de prise</Btn>
        <Btn onClick={() => setSheet('doc')}>🩺 Médecin</Btn>
      </div>

      {sheet === 'sos' && <SosSheet why={s.why} busy={busy} onClose={() => setSheet(null)} onAct={async b => { await act(b, b['action'] === 'resiste' ? '💪 Tenue ! Chaque envie tenue rend la suivante plus faible.' : '✅ Noté'); }} />}
      {sheet === 'sym' && <SymSheet onClose={() => setSheet(null)} onSave={async b => { await act(b); setSheet(null); }} />}
      {sheet === 'doc' && <DocSheet status={s.doctor.status} onReport={() => void act({ action: 'rapport_medecin' }, '📋 Rapport envoyé sur Telegram')} onClose={() => setSheet(null)} onSave={async b => { await act({ action: 'medecin', ...b }); setSheet(null); }} />}
      {sheet === 'why' && <WhySheet why={s.why} consequence={s.consequence} ifThen={s.ifThen ?? []} letter={s.letter ?? ''} onIfThen={async t => { await act({ action: 'si_alors', text: t }, '✅ Plan gardé'); }} onLetter={async t => { await act({ action: 'lettre', text: t }, '✉️ Lettre gardée'); }} onClose={() => setSheet(null)} onAdd={async w => { await act({ action: 'pourquoi', why: w }, '❤️ Gardé. Dzaryx te le rappellera.'); }} onConsequence={async t => { await act({ action: 'consequence', text: t }); }} />}
      {sheet === 'bank' && <BankSheet o={o} onClose={() => setSheet(null)} onAct={async b => { await act({ action: 'recompense', ...b }); }} />}
      {sheet === 'back' && <BackSheet onClose={() => setSheet(null)} onSave={async b => { await act({ action: 'retour', ...b }, '✨ Noté. On compare chaque semaine.'); setSheet(null); }} />}
      {sheet === 'plan' && <PlanSheet o={o} onClose={() => setSheet(null)} onTimes={async t => { await act({ action: 'times', times: t }, '✅ Heures enregistrées'); }} />}
    </Screen>
  );
}

function Ring({ taken, allowed }: { taken: number; allowed: number }) {
  const r = 34, c = 2 * Math.PI * r, p = allowed ? Math.min(1, taken / allowed) : taken ? 1 : 0;
  const col = taken > allowed ? T.bad : DOVE;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="48" textAnchor="middle" fontSize="20" fontWeight="800" fill={T.text}>{allowed ? Math.max(0, allowed - taken) : '🕊'}</text>
    </svg>
  );
}

function Stairs({ steps, today }: { steps: Step[]; today: string }) {
  const top = Math.max(1, ...steps.map(s => s.max));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, marginTop: 12 }}>
      {steps.map((st, i) => {
        const cur = st.from <= today && (steps[i + 1]?.from ?? '9999') > today;
        const past = (steps[i + 1]?.from ?? '9999') <= today;
        return (
          <div key={st.from} title={`${fmt(st.from)} : ${st.max}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ fontSize: 10, color: cur ? DOVE : T.faint, marginBottom: 2 }}>{st.max || '🕊'}</div>
            <div style={{ width: '100%', height: `${Math.max(6, (st.max / top) * 52)}px`, borderRadius: 4, background: cur ? DOVE : past ? tone(T.ok, 0.5) : 'rgba(255,255,255,0.08)', boxShadow: cur ? `0 0 12px ${tone(DOVE, 0.6)}` : undefined }} />
          </div>
        );
      })}
    </div>
  );
}

function SosCard({ sos }: { sos: string[] }) {
  return (
    <Card accent={T.bad} style={{ marginTop: 4 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>🆘 Si ça va vraiment mal</div>
      {sos.map(l => { const num = l.match(/\d[\d ]{2,}\d/)?.[0]?.replace(/\s/g, ''); return (
        <a key={l} href={num ? `tel:${num}` : undefined} style={{ display: 'block', fontSize: 13, color: T.text, textDecoration: 'none', padding: '5px 0', lineHeight: 1.4 }}>{l}</a>); })}
      <div style={{ fontSize: 12, color: T.faint, marginTop: 6 }}>Convulsion, malaise, idées noires, douleur dans la poitrine, hallucinations → 112 tout de suite.</div>
    </Card>
  );
}

function Setup({ onStart, busy }: { onStart: (b: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [base, setBase] = useState(7);
  const [med, setMed] = useState('');
  const [times, setTimes] = useState(['07:30', '11:30', '15:30', '19:30']);
  const [why, setWhy] = useState('');
  return (
    <Card accent={DOVE} style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>On commence ensemble</div>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>
        On ne s'arrête jamais d'un coup (dangereux). On descend d'un demi-comprimé toutes les quelques jours jusqu'à zéro, en environ un mois. Ton médecin valide le plan. Si le manque est trop fort, la marche dure plus longtemps — on ne remonte jamais.
      </div>
      <Field label="Combien de DEMI-comprimés par jour en ce moment ?" hint="Compte large : 1 comprimé entier = 2 demis. Mieux vaut partir de la vraie dose.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn onClick={() => setBase(b => Math.max(1, b - 1))}>−</Btn>
          <div style={{ fontSize: 26, fontWeight: 800, minWidth: 40, textAlign: 'center' }}>{base}</div>
          <Btn onClick={() => setBase(b => Math.min(30, b + 1))}>+</Btn>
          <div style={{ color: T.muted, fontSize: 13 }}>= {String(base / 2).replace('.', ',')} comprimé{base > 2 ? 's' : ''}</div>
        </div>
      </Field>
      <Field label="Le médicament (reste privé)"><input style={inputStyle} value={med} onChange={e => setMed(e.target.value)} placeholder="Nom" /></Field>
      <Field label="Tes heures de prise" hint="Pas au réveil : la première après l'eau, la douche, le sport.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {times.map((t, i) => <input key={i} type="time" style={{ ...inputStyle, padding: '0 6px' }} value={t} onChange={e => setTimes(ts => ts.map((x, j) => j === i ? e.target.value : x))} />)}
        </div>
      </Field>
      <Field label="Pourquoi tu arrêtes ?" hint="Dzaryx te le rappellera à chaque envie."><textarea style={{ ...inputStyle, minHeight: 80, padding: 12 }} value={why} onChange={e => setWhy(e.target.value)} placeholder="Ce que tu veux retrouver…" /></Field>
      <Btn variant="primary" color={DOVE} disabled={busy} style={{ width: '100%' }} onClick={() => onStart({ baseline: base, med: med || undefined, times: times.filter(Boolean), why: why || undefined })}>🕊️ Commencer mon plan</Btn>
    </Card>
  );
}

function SosSheet({ why, onClose, onAct, busy }: { why: string[]; onClose: () => void; onAct: (b: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [trigger, setTrigger] = useState('');
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [phase, setPhase] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);
  const start = async () => {
    await onAct({ action: 'envie', trigger: trigger || undefined });
    setStarted(Date.now());
    tick.current = setInterval(() => { setNow(Date.now()); setPhase(p => p + 1); }, 1000);
  };
  const left = started ? Math.max(0, 600 - Math.floor((now - started) / 1000)) : 600;
  const cycle = phase % 14, label = cycle < 4 ? 'Inspire…' : cycle < 8 ? 'Bloque…' : 'Souffle doucement…';
  const scale = cycle < 4 ? 0.6 + cycle * 0.1 : cycle < 8 ? 1 : 1 - (cycle - 8) * 0.066;
  return (
    <Sheet title="🔥 L'envie va passer" subtitle="Elle monte, atteint un pic, et redescend en 10 à 20 minutes." onClose={onClose} accent={T.bad} fixed z={90}
      footer={started ? <>
        <Btn variant="primary" color={T.ok} style={{ flex: 1 }} disabled={busy} onClick={async () => { await onAct({ action: 'resiste' }); onClose(); }}>💪 Passée, j'ai tenu</Btn>
        <Btn color={T.bad} disabled={busy} onClick={async () => { await onAct({ action: 'prise', n: 1, note: 'après une envie' }); onClose(); }}>J'ai craqué</Btn>
      </> : undefined}>
      {!started ? <>
        <div style={{ fontSize: 13.5, color: T.muted, marginBottom: 10 }}>Qu'est-ce qui la déclenche ?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {TRIGGERS.map(t => <Btn key={t} variant={trigger === t ? 'primary' : 'soft'} color={T.warn} onClick={() => setTrigger(t)}>{t}</Btn>)}
        </div>
        <Btn variant="danger" style={{ width: '100%' }} disabled={busy} onClick={start}>Démarrer les 10 minutes</Btn>
      </> : <>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 16px' }}>
          <div style={{ width: 150, height: 150, borderRadius: '50%', background: `radial-gradient(circle, ${tone(DOVE, 0.55)}, ${tone(DOVE, 0.08)})`, transform: `scale(${scale})`, transition: 'transform 1s linear', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 14 }}>{label}</div>
        </div>
        <Btn style={{ width: '100%', marginBottom: 8 }} disabled={busy} onClick={() => onAct({ action: 'ma_voix' })}>🎙️ Écouter ma propre voix (Telegram)</Btn>
        {['💧 Un grand verre d\'eau froide, lentement', '🚶 Marche 10 minutes, dehors si tu peux', '🔁 Change de pièce, mets ta musique', '📞 Dis à Dzaryx « appelle-moi »'].map(x => <div key={x} style={{ fontSize: 14, padding: '6px 0' }}>{x}</div>)}
        {why.length > 0 && <Card accent={DOVE} style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Pourquoi tu fais ça</div>
          {why.map(w => <div key={w} style={{ fontSize: 14, fontWeight: 600, padding: '3px 0' }}>❤️ {w}</div>)}
        </Card>}
      </>}
    </Sheet>
  );
}

function SymSheet({ onClose, onSave }: { onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const [score, setScore] = useState(3);
  const [mood, setMood] = useState(5);
  const [sel, setSel] = useState<string[]>([]);
  return (
    <Sheet title="🤒 Comment je me sens" onClose={onClose} fixed z={90} footer={<Btn variant="primary" color={DOVE} style={{ flex: 1 }} onClick={async () => { await onSave({ action: 'humeur', score: mood }); await onSave({ action: 'symptomes', score, symptoms: sel }); }}>Enregistrer</Btn>}>
      <Field label={`Manque : ${score}/10`}><input type="range" min={0} max={10} value={score} onChange={e => setScore(Number(e.target.value))} style={{ width: '100%' }} /></Field>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {SYMPTOMS.map(x => <Btn key={x} variant={sel.includes(x) ? 'primary' : 'soft'} color={T.warn} onClick={() => setSel(l => l.includes(x) ? l.filter(y => y !== x) : [...l, x])}>{x}</Btn>)}
      </div>
      <Field label={`Moral : ${mood}/10`}><input type="range" min={1} max={10} value={mood} onChange={e => setMood(Number(e.target.value))} style={{ width: '100%' }} /></Field>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>Manque fort 2 jours de suite → Dzaryx allonge la marche. On ne remonte jamais.</div>
    </Sheet>
  );
}

function DocSheet({ status, onClose, onSave, onReport }: { status: string; onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void>; onReport: () => void }) {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  return (
    <Sheet title="🩺 Mon médecin" onClose={onClose} fixed z={90}>
      <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>
        À lui dire : « Je veux arrêter. J'en prends environ X demis par jour depuis des années. Je suis tout le temps fatigué, sans moral, sans envie. » À lui demander : valider le plan, de l'aide pour le manque, un soutien pour le moral (psychologue de 1re ligne : 11 €, 1re séance gratuite), une prise de sang (fatigue, libido).
      </div>
      {status === 'a_appeler' && <>
        <Field label="RDV pris pour le…"><input type="datetime-local" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Btn variant="primary" color={DOVE} style={{ width: '100%', marginBottom: 14 }} disabled={!date} onClick={() => onSave({ status: 'rdv_pris', date })}>📅 J'ai pris RDV</Btn>
      </>}
      <Field label="Ce qu'il a dit (après la consultation)"><textarea style={{ ...inputStyle, minHeight: 70, padding: 12 }} value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Btn color={T.ok} style={{ width: '100%', marginBottom: 8 }} onClick={() => onSave({ status: 'vu', note })}>✅ Je l'ai vu</Btn>
      <Btn style={{ width: '100%' }} onClick={() => onReport()}>📋 Mon rapport pour le médecin (Telegram)</Btn>
    </Sheet>
  );
}

function WhySheet({ why, consequence, ifThen, letter, onClose, onAdd, onConsequence, onIfThen, onLetter }: { why: string[]; consequence?: string; ifThen: string[]; letter: string; onClose: () => void; onAdd: (w: string) => Promise<void>; onConsequence: (t: string) => Promise<void>; onIfThen: (t: string) => Promise<void>; onLetter: (t: string) => Promise<void> }) {
  const [w, setW] = useState('');
  const [c, setC] = useState(consequence ?? '');
  const [si, setSi] = useState('');
  const [l, setL] = useState(letter);
  return (
    <Sheet title="❤️ Mes raisons" subtitle="Ce que tu veux retrouver" onClose={onClose} fixed z={90}>
      {why.map(x => <Card key={x} accent={DOVE} pad={10} style={{ marginBottom: 6 }}>{x}</Card>)}
      <Field label="Ajouter une raison"><input style={inputStyle} value={w} onChange={e => setW(e.target.value)} placeholder="Jouer avec mon fils sans être crevé…" /></Field>
      <Btn variant="primary" color={DOVE} disabled={!w.trim()} style={{ width: '100%', marginBottom: 18 }} onClick={async () => { await onAdd(w.trim()); setW(''); }}>Ajouter</Btn>
      <Field label="Mon engagement si je dépasse" hint="Choisi par toi, Dzaryx te le rappellera (ex. 20 € à une association, pas de téléphone ce soir…)"><input style={inputStyle} value={c} onChange={e => setC(e.target.value)} /></Field>
      <Btn onClick={() => onConsequence(c.trim())} style={{ width: '100%', marginBottom: 18 }}>Enregistrer l'engagement</Btn>
      <SectionTitle>Mes plans « si… alors… »</SectionTitle>
      {ifThen.map(x => <Card key={x} pad={10} style={{ marginBottom: 6, fontSize: 13.5 }}>{x}</Card>)}
      <Field label="Nouveau plan" hint="Prouvé : décider à l'avance quoi faire double les chances de tenir."><input style={inputStyle} value={si} onChange={e => setSi(e.target.value)} placeholder="Si je me réveille avec l'envie, alors je bois 2 verres d'eau et je fais 20 pompes" /></Field>
      <Btn disabled={!si.trim()} style={{ width: '100%', marginBottom: 18 }} onClick={async () => { await onIfThen(si.trim()); setSi(''); }}>Ajouter le plan</Btn>
      <SectionTitle>Ma lettre à moi-même</SectionTitle>
      <Field label="Pour les moments durs" hint="Dzaryx te la relira au jour zéro et si tu craques."><textarea style={{ ...inputStyle, minHeight: 110, padding: 12 }} value={l} onChange={e => setL(e.target.value)} placeholder="Kouider, si tu lis ça…" /></Field>
      <Btn disabled={!l.trim()} style={{ width: '100%' }} onClick={() => onLetter(l.trim())}>Garder ma lettre</Btn>
    </Sheet>
  );
}

function PlanSheet({ o, onClose, onTimes }: { o: Overview; onClose: () => void; onTimes: (t: string[]) => Promise<void> }) {
  const s = o.state!;
  const [times, setTimes] = useState(s.times);
  return (
    <Sheet title="Le plan" subtitle={s.doctorPlan ? 'Plan donné par ton médecin' : 'À faire valider par ton médecin'} onClose={onClose} fixed z={90}>
      {s.steps.map((st, i) => {
        const cur = st.from <= o.today && (s.steps[i + 1]?.from ?? '9999') > o.today;
        return <div key={st.from} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${T.line}`, color: cur ? DOVE : T.text, fontWeight: cur ? 700 : 400 }}>
          <span>{st.max ? `Étape ${i + 1}` : '🏁 Jour zéro'} · {fmt(st.from)}</span><span>{st.max ? `${demis(st.max)} / jour` : 'plus rien'}</span>
        </div>;
      })}
      <SectionTitle>Heures de prise</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
        {times.map((t, i) => <input key={i} type="time" style={{ ...inputStyle, padding: '0 6px' }} value={t} onChange={e => setTimes(ts => ts.map((x, j) => j === i ? e.target.value : x))} />)}
      </div>
      <Btn variant="primary" color={DOVE} style={{ width: '100%' }} onClick={() => onTimes(times.filter(Boolean))}>Enregistrer les heures</Btn>
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12, lineHeight: 1.45 }}>Le médecin te donne un autre rythme ? Dis-le à Dzaryx (« mon médecin dit… ») : il remplace le plan.</div>
    </Sheet>
  );
}

function BankSheet({ o, onClose, onAct }: { o: Overview; onClose: () => void; onAct: (b: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const b = o.bank!, rewards = o.state?.rewards ?? [];
  return (
    <Sheet title="💰 Ta cagnotte" subtitle={`${eur(b.balance)} · ${eur(b.earned)} gagnés`} onClose={onClose} fixed z={90} accent={T.warn}>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>
        Chaque jour où tu notes ta vérité ET restes dans le plan rapporte plus que la veille (2 € → 10 €). Un écart remet le gain à 2 € ; 3 jours validés et tu retrouves ton niveau. C'est la méthode la plus prouvée pour arrêter. Mets ces euros de côté pour de vrai (c'est l'argent que tu ne mets plus dans les boîtes) et dépense-les pour toi et ta famille.
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 50, marginBottom: 14 }}>
        {b.days.map(d => <div key={d.date} title={`${d.date} +${d.gain}`} style={{ flex: 1, height: `${Math.max(4, d.gain * 4.5)}px`, borderRadius: 3, background: d.gain ? T.warn : T.bad }} />)}
      </div>
      {rewards.map(r => (
        <Card key={r.name} pad={10} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 14 }}>{r.at ? '✅' : '🎁'} {r.name} <span style={{ color: T.muted }}>· {r.cost} €</span></div>
          {!r.at && <Btn color={T.ok} disabled={b.balance < r.cost} onClick={() => onAct({ claim: true, text: r.name })}>{b.balance >= r.cost ? 'Je la prends' : `${Math.ceil(r.cost - b.balance)} € encore`}</Btn>}
        </Card>
      ))}
      <Field label="Nouvelle récompense"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Resto avec ma femme" /></Field>
      <Field label="Prix (€)"><input style={inputStyle} inputMode="numeric" value={cost} onChange={e => setCost(e.target.value.replace(/[^\d]/g, ''))} /></Field>
      <Btn variant="primary" disabled={!name.trim() || !Number(cost)} style={{ width: '100%' }} onClick={async () => { await onAct({ text: name.trim(), cost: Number(cost) }); setName(''); setCost(''); }}>Ajouter</Btn>
    </Sheet>
  );
}

function BackSheet({ onClose, onSave }: { onClose: () => void; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const [v, setV] = useState({ energie: 5, desir: 5, joie: 5, clarte: 5 });
  const labels = { energie: '⚡ Énergie', desir: '❤️‍🔥 Désir', joie: '😄 Joie', clarte: '🧠 Esprit clair' } as const;
  return (
    <Sheet title="✨ Ce qui revient" subtitle="Cette semaine, de 1 à 10" onClose={onClose} fixed z={90} footer={<Btn variant="primary" style={{ flex: 1 }} onClick={() => onSave(v)}>Enregistrer</Btn>}>
      {(Object.keys(labels) as Array<keyof typeof labels>).map(k => (
        <Field key={k} label={`${labels[k]} : ${v[k]}/10`}><input type="range" min={1} max={10} value={v[k]} onChange={e => setV(x => ({ ...x, [k]: Number(e.target.value) }))} style={{ width: '100%' }} /></Field>
      ))}
      <div style={{ fontSize: 12.5, color: T.muted }}>Ce que ce produit éteint revient en général sur plusieurs semaines. Ces notes te montreront la preuve.</div>
    </Sheet>
  );
}
