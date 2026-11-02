import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, Card, SectionTitle, Btn, Kpi, KpiGrid, Badge, Empty, inputStyle } from '../ui/Kit.tsx';

// COACH › 🔥 Vitalité (Kouider 02/11) : désir, couple, testostérone, sommeil, médicament — PRIVÉ (route /api/vitalite,
// Kouider seulement ; jamais visible avec un lien FORME invité). Rien d'inventé : chiffres = ce qu'il a noté / la montre / la prise de sang.
interface Lever { k: string; title: string; why: string; todo: string; fact: string }
interface State {
  today: string; goal: [number, number];
  weeks: Array<{ from: string; rapports: number }>; thisWeek: number; avg4: number | null;
  desir: { last: number | null; trend: number[] }; iief: { score: number | null; date: string | null; prev: number | null };
  matins: { last: number | null }; testoTxt: string; labo: unknown;
  sleep: { avg7: number | null; debt: number } | null;
  med: { allowed: number; taken: number; zero: string } | null;
  levers: Lever[]; missing: string[];
}
interface Fact { id: string; theme: string; fait: string; source: string }

const n10 = (v: number | null, max = 10) => (v == null ? '—' : `${v}/${max}`);

export default function VitaliteTab() {
  const [s, setS] = useState<State | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [form, setForm] = useState<'none' | 'bilan' | 'iief' | 'labo'>('none');
  const [f, setF] = useState<Record<string, string>>({});
  const [showFacts, setShowFacts] = useState(false);

  useEffect(() => { apiFetch<{ state: State; facts: Fact[] }>('/api/vitalite').then(r => { setS(r.state); setFacts(r.facts); }).catch(() => setMsg('Impossible de charger.')); }, []);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { const r = await apiFetch<{ message: string; state: State }>('/api/vitalite/action', { method: 'POST', body: JSON.stringify(body) }); setS(r.state); setMsg(r.message); setForm('none'); setF({}); }
    catch { setMsg('Échec, réessaie.'); } finally { setBusy(false); }
  };
  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true); setAnswer('…');
    try { const r = await apiFetch<{ answer: string }>('/api/vitalite/ask', { method: 'POST', body: JSON.stringify({ question }) }); setAnswer(r.answer); }
    catch { setAnswer('Échec, réessaie.'); } finally { setBusy(false); }
  };
  const num = (k: string) => (f[k] ? Number(f[k].replace(',', '.')) : undefined);
  const inp = (k: string, ph: string) => <input inputMode="decimal" placeholder={ph} value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />;
  const pick = (k: string, label: string, opts: string[]) => (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 13, color: T.muted }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${opts.length}, 1fr)`, gap: 6 }}>
        {opts.map((o, i) => <Btn key={o} variant={f[k] === String(i + 1) ? 'primary' : 'soft'} onClick={() => setF({ ...f, [k]: String(i + 1) })} style={{ fontSize: 11.5, padding: '8px 2px' }}>{i + 1}<br />{o}</Btn>)}
      </div>
    </div>
  );

  if (!s) return <Empty icon="🔥" title={msg || 'Chargement…'} />;
  const maxW = Math.max(s.goal[1], ...s.weeks.map(w => w.rapports), 1);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card accent={T.warn}><div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45 }}>🔒 Que toi. Ni ta femme, ni FORME, ni personne d'autre ne voit cette page. Chaque chiffre vient de toi, de ta montre ou d'une prise de sang — rien n'est inventé.</div></Card>

      <KpiGrid>
        <Kpi value={`${s.thisWeek}`} label="Rapports cette semaine" sub={`objectif ${s.goal[0]}-${s.goal[1]} · moy. ${s.avg4 ?? '—'}`} color={s.thisWeek >= s.goal[0] ? T.ok : T.warn} />
        <Kpi value={n10(s.iief.score)} label="Désir (questionnaire)" sub={s.iief.prev != null ? `avant ${s.iief.prev}/10` : s.desir.last != null ? `ta note ${s.desir.last}/10` : 'à mesurer'} />
        <Kpi value={s.matins.last != null ? `${s.matins.last}/7` : '—'} label="Érections du matin" sub="sur la semaine" />
        <Kpi value={s.sleep?.avg7 != null ? `${s.sleep.avg7} h` : '—'} label="Sommeil (montre)" sub={s.sleep ? `dette ${s.sleep.debt} h` : ''} color={(s.sleep?.avg7 ?? 0) >= 7 ? T.ok : T.warn} />
      </KpiGrid>

      <Card>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>🧪 Testostérone</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{s.testoTxt}</div>
        {s.med && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>💊 Médicament aujourd'hui : {s.med.taken}/{s.med.allowed} demis · zéro le {s.med.zero.split('-').reverse().join('/')}</div>}
      </Card>

      <Btn variant="primary" disabled={busy} onClick={() => act({ action: 'rapport' })}>❤️ On l'a fait (aujourd'hui)</Btn>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <Btn onClick={() => setForm(form === 'bilan' ? 'none' : 'bilan')}>📝 Ma semaine</Btn>
        <Btn onClick={() => setForm(form === 'iief' ? 'none' : 'iief')}>🧠 Test désir</Btn>
        <Btn onClick={() => setForm(form === 'labo' ? 'none' : 'labo')}>🧪 Prise de sang</Btn>
      </div>

      {form === 'bilan' && <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {inp('desir', 'Désir /10')}{inp('matins', 'Matins érection /7')}{inp('energie', 'Énergie /10')}{inp('rapports', 'Rapports semaine')}
        </div>
        <Btn variant="primary" disabled={busy} style={{ marginTop: 10, width: '100%' }} onClick={() => act({ action: 'bilan', desir: num('desir'), matins: num('matins'), energie: num('energie'), rapports: num('rapports') })}>Enregistrer</Btn>
      </Card>}
      {form === 'iief' && <Card>
        <div style={{ display: 'grid', gap: 12 }}>
          {pick('q1', 'Sur les 4 dernières semaines, à quelle fréquence as-tu ressenti du désir ?', ['presque jamais', 'quelques fois', 'la moitié', 'souvent', 'presque toujours'])}
          {pick('q2', 'Comment notes-tu ton niveau de désir ?', ['très bas', 'bas', 'moyen', 'élevé', 'très élevé'])}
          <div style={{ fontSize: 11.5, color: T.faint }}>Questionnaire international IIEF (domaine désir), validé en français.</div>
          <Btn variant="primary" disabled={busy || !f['q1'] || !f['q2']} onClick={() => act({ action: 'iief', q1: num('q1'), q2: num('q2') })}>Calculer mon score</Btn>
        </div>
      </Card>}
      {form === 'labo' && <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {inp('testo', 'Testostérone totale')}
          <select value={f['unit'] ?? 'ng/dL'} onChange={e => setF({ ...f, unit: e.target.value })} style={{ ...inputStyle, minWidth: 0 }}><option>ng/dL</option><option>nmol/L</option></select>
          <input type="date" value={f['date'] ?? ''} onChange={e => setF({ ...f, date: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
          <input type="time" value={f['heure'] ?? ''} onChange={e => setF({ ...f, heure: e.target.value })} style={{ ...inputStyle, minWidth: 0 }} />
          {inp('shbg', 'SHBG (option)')}{inp('lh', 'LH (option)')}{inp('prolactine', 'Prolactine (option)')}{inp('vitd', 'Vitamine D (option)')}
        </div>
        <Btn variant="primary" disabled={busy || !f['testo']} style={{ marginTop: 10, width: '100%' }} onClick={() => act({ action: 'labo', testo: num('testo'), unit: f['unit'] ?? 'ng/dL', date: f['date'] || undefined, heure: f['heure'] || undefined, shbg: num('shbg'), lh: num('lh'), prolactine: num('prolactine'), vitd: num('vitd') })}>Enregistrer les résultats</Btn>
      </Card>}
      {msg && <Card><div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{msg}</div></Card>}

      <SectionTitle>📅 8 dernières semaines</SectionTitle>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, alignItems: 'end', height: 90 }}>
          {s.weeks.map((w, i) => (
            <div key={w.from} style={{ display: 'grid', gap: 4, justifyItems: 'center', alignSelf: 'end' }}>
              <span style={{ fontSize: 11, color: T.muted }}>{w.rapports}</span>
              <div style={{ width: '70%', height: Math.max(3, (w.rapports / maxW) * 56), borderRadius: 4, background: w.rapports >= s.goal[0] ? T.ok : i === s.weeks.length - 1 ? T.accent : T.lineStrong }} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>Vert = objectif atteint. La dernière barre = cette semaine.</div>
      </Card>

      <SectionTitle>🎯 Ce qui freine et quoi faire</SectionTitle>
      {s.levers.map((l, i) => (
        <Card key={l.k} accent={i === 0 ? T.warn : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ fontSize: 14 }}>{i + 1}. {l.title}</b>{i === 0 && <Badge color={T.warn}>priorité</Badge>}</div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>{l.why}</div>
          <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.4 }}>👉 {l.todo}</div>
        </Card>
      ))}
      {s.missing.length > 0 && <div style={{ fontSize: 12.5, color: T.muted }}>Il me manque : {s.missing.join(' · ')}</div>}

      <SectionTitle>💬 Demande à ton coach</SectionTitle>
      <Card>
        <textarea value={q} onChange={e => setQ(e.target.value)} rows={3} placeholder="Ex. ma libido est à combien ? qu'est-ce que je dois manger ? pourquoi j'ai plus envie ?" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <Btn onClick={() => ask('Ma libido et ma testostérone sont à combien, et elles devraient être à combien pour mon âge ?')}>Mes niveaux ?</Btn>
          <Btn onClick={() => ask('Qu\'est-ce que je dois manger et prendre pour booster ma libido et ma testostérone, sans danger avec mon traitement ?')}>Manger / prendre ?</Btn>
          <Btn onClick={() => ask('Comment retrouver une vie de couple avec 1 à 2 rapports par semaine ? Donne-moi aussi des choses auxquelles je n\'aurais pas pensé.')}>Mon couple ?</Btn>
          <Btn variant="primary" disabled={busy || !q.trim()} onClick={() => ask(q)}>Demander</Btn>
        </div>
        {answer && <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 12 }}>{answer.replace(/\*\*/g, '')}</div>}
      </Card>

      <Btn onClick={() => setShowFacts(!showFacts)}>📚 {showFacts ? 'Cacher' : 'Voir'} les faits et leurs sources ({facts.length})</Btn>
      {showFacts && facts.map(x => (
        <Card key={x.id}><div style={{ fontSize: 13, lineHeight: 1.45 }}>{x.fait}</div><div style={{ fontSize: 11.5, color: T.faint, marginTop: 6 }}>{x.source}</div></Card>
      ))}
    </div>
  );
}
