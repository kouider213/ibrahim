import { useState, useEffect, useCallback } from 'react';
import { business, type ProspectRow, type ProspectsOverview } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards, SearchPill } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', gold: '#fbbf24', blue: '#0a66c2', red: '#f87171', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

const SEGMENT: Record<string, string> = {
  grand_compte: '🏭 Grand compte', entreprise: '🏢 Entreprise', agence_voyage: '✈️ Agence de voyage',
  loueur_voitures: '🚗 Loueur voitures', proprietaire_appart: '🏠 Proprio appart', autre: '• Autre',
};
const STATUS: Record<string, { label: string; color: string }> = {
  a_contacter: { label: 'À contacter', color: C.muted },
  contacte:    { label: 'Contacté',    color: '#60a5fa' },
  a_repondu:   { label: 'A répondu',   color: C.gold },
  interesse:   { label: 'Intéressé',   color: C.accent },
  client:      { label: 'Client 🎉',   color: C.accent },
  refus:       { label: 'Pas intéressé', color: C.red },
  stop:        { label: 'STOP',        color: C.red },
};
type Filter = 'all' | 'replies' | 'linkedin' | 'grand_compte' | 'contacte' | 'a_contacter' | 'closed';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tout' }, { id: 'replies', label: '📩 Réponses' }, { id: 'linkedin', label: '🔗 LinkedIn' },
  { id: 'grand_compte', label: '🏭 Grands comptes' }, { id: 'contacte', label: 'Contactés' },
  { id: 'a_contacter', label: 'À contacter' }, { id: 'closed', label: 'Refus / STOP' },
];

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as const);

export default function DemarchageScreen() {
  const [data, setData] = useState<ProspectsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await business.prospectsOverview()); } catch { /* garde l'ancien affichage */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 3500); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); say(ok); await load(); } catch (e) { say(`❌ ${e instanceof Error ? e.message : 'Erreur'}`); }
  };

  const rows = data?.prospects ?? [];
  const replies = rows.filter(r => r.suggested_reply);
  const liTodo = rows.filter(r => r.linkedin_contacts.some(c => !c.sent_at));
  const ql = q.trim().toLowerCase();
  const list = rows.filter(r => {
    if (ql && !`${r.company} ${r.email ?? ''} ${r.notes ?? ''}`.toLowerCase().includes(ql)) return false;
    switch (filter) {
      case 'replies':      return !!r.last_reply_text || !!r.suggested_reply;
      case 'linkedin':     return r.linkedin_contacts.length > 0;
      case 'grand_compte': return r.segment === 'grand_compte';
      case 'contacte':     return r.status === 'contacte';
      case 'a_contacter':  return r.status === 'a_contacter';
      case 'closed':       return r.status === 'refus' || r.status === 'stop';
      default:             return true;
    }
  });
  const ap = data?.autopilot;
  const st = data?.stats;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 40px' }}>
      <div style={{ margin: '-20px -16px 0' }}>
        <Hero eyebrow="Dzaryx · Prospection" title="Démarchage" subtitle="Sociétés trouvées, mails envoyés, réponses et LinkedIn" />
      </div>

      {loading ? <SkeletonCards count={5} /> : !data ? (
        <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Impossible de charger le démarchage. <button onClick={() => { setLoading(true); void load(); }} style={btn('rgba(255,255,255,0.08)', C.text)}>Réessayer</button></div>
      ) : (<>
        {/* Chiffres */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 14 }}>
          <StatCard icon="📤" value={String(st?.sent ?? 0)} label="MAILS ENVOYÉS" />
          <StatCard icon="📅" value={String(st?.sent_today ?? 0)} label="AUJOURD'HUI" color="#60a5fa" />
          <StatCard icon="📩" value={String(st?.replies ?? 0)} label="RÉPONSES" color={C.gold} />
          <StatCard icon="🔗" value={String(st?.linkedin_todo ?? 0)} label="LINKEDIN" color={C.blue} />
        </div>

        {/* Pilote automatique */}
        {ap && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ap.enabled ? '✅ Démarchage auto actif' : '⏸️ Démarchage auto en pause'}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Chaque jour à 10h (Oran) · {ap.per_day} mail(s)/jour + 1 grand compte</div>
              </div>
              <button onClick={() => act(() => business.prospectsAutopilot({ enabled: !ap.enabled }), ap.enabled ? 'Démarchage mis en pause' : 'Démarchage réactivé')}
                style={btn(ap.enabled ? 'rgba(248,113,113,0.15)' : 'rgba(16,185,129,0.18)', ap.enabled ? C.red : C.accent)}>{ap.enabled ? 'Pause' : 'Activer'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Mails par jour</span>
              <button disabled={ap.per_day <= 1} onClick={() => act(() => business.prospectsAutopilot({ per_day: ap.per_day - 1 }), `${ap.per_day - 1} mails/jour`)} style={btn('rgba(255,255,255,0.06)', C.text)}>−</button>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{ap.per_day}</span>
              <button disabled={ap.per_day >= 15} onClick={() => act(() => business.prospectsAutopilot({ per_day: ap.per_day + 1 }), `${ap.per_day + 1} mails/jour`)} style={btn('rgba(255,255,255,0.06)', C.text)}>+</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => act(() => business.prospectsRun(), '🚀 Lancé — récap en notification dans quelques minutes')} style={btn(C.accent, '#06210f')}>🚀 Lancer maintenant</button>
            </div>
          </div>
        )}

        {/* Réponses à valider */}
        {replies.length > 0 && (
          <Section title={`📩 Réponses à valider (${replies.length})`}>
            {replies.map(r => <ReplyCard key={r.id} p={r} onSend={(t) => act(() => business.prospectReply(r.id, t), `✅ Réponse envoyée à ${r.company}`)}
              onDismiss={() => act(() => business.prospectDismissReply(r.id), 'Réponse ignorée')} />)}
          </Section>
        )}

        {/* LinkedIn à envoyer */}
        {liTodo.length > 0 && (
          <Section title={`🔗 Messages LinkedIn à envoyer (${st?.linkedin_todo ?? 0})`}
            hint="Dzaryx prépare, toi tu envoies : copie le message, ouvre le profil, « Se connecter » → « Ajouter une note ».">
            {liTodo.map(r => r.linkedin_contacts.map((c, i) => c.sent_at ? null : (
              <div key={`${r.id}-${i}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name} <span style={{ color: C.muted, fontWeight: 500 }}>· {r.company}</span></div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 7 }}>{c.title}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 9, marginBottom: 9 }}>{c.message}</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => { void navigator.clipboard?.writeText(c.message).then(() => say('Message copié'), () => say('Copie impossible')); }} style={btn('rgba(255,255,255,0.08)', C.text)}>📋 Copier</button>
                  <button onClick={() => window.open(c.url, '_blank')} style={btn('rgba(10,102,194,0.25)', '#7fb5ff')}>Ouvrir le profil</button>
                  <button onClick={() => act(() => business.prospectLinkedinSent(r.id, i, true), `Noté : message envoyé à ${c.name}`)} style={btn('rgba(16,185,129,0.18)', C.accent)}>✓ Envoyé</button>
                </div>
              </div>
            )))}
          </Section>
        )}

        {/* Toutes les sociétés */}
        <Section title={`🏢 Sociétés (${rows.length})`}>
          <div style={{ marginBottom: 9 }}><SearchPill value={q} onChange={setQ} placeholder="Chercher une société, un email…" /></div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 6 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{ ...btn(filter === f.id ? C.accent : 'rgba(255,255,255,0.05)', filter === f.id ? '#06210f' : C.muted), whiteSpace: 'nowrap', padding: '6px 11px', fontSize: 11.5 }}>{f.label}</button>
            ))}
          </div>
          {list.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucune société ici pour l'instant.</div> : list.map(r => (
            <ProspectCard key={r.id} p={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)}
              onStatus={(s) => act(() => business.prospectStatus(r.id, s), `${r.company} → ${STATUS[s]?.label ?? s}`)} />
          ))}
        </Section>
      </>)}

      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 90, background: '#1f1f27', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 14px', fontSize: 13, textAlign: 'center', zIndex: 50 }}>{toast}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', marginBottom: hint ? 3 : 9 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9 }}>{hint}</div>}
      {children}
    </div>
  );
}

function ReplyCard({ p, onSend, onDismiss }: { p: ProspectRow; onSend: (text: string) => void; onDismiss: () => void }) {
  const [text, setText] = useState(p.suggested_reply ?? '');
  const [showMail, setShowMail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background: C.surface, border: `1px solid rgba(251,191,36,0.35)`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.company} <span style={{ fontSize: 11, color: STATUS[p.status]?.color }}>{STATUS[p.status]?.label}</span></div>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>{p.email}</div>
      <button onClick={() => setShowMail(!showMail)} style={{ ...btn('transparent', C.gold), padding: 0, marginBottom: 8 }}>{showMail ? '▾ Cacher son mail' : '▸ Lire son mail'}</button>
      {showMail && <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 9, marginBottom: 9, maxHeight: 220, overflowY: 'auto' }}>{p.last_reply_text}</div>}
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Réponse préparée par Dzaryx (tu peux la modifier) :</div>
      <textarea value={text} onChange={e => { setText(e.target.value); setConfirm(false); }} rows={7}
        style={{ width: '100%', boxSizing: 'border-box', background: '#0f0f14', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: 9, fontSize: 12.5, fontFamily: C.font, lineHeight: 1.45, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
        {confirm
          ? <button onClick={() => onSend(text)} style={btn(C.accent, '#06210f')}>Oui, envoyer à {p.company}</button>
          : <button onClick={() => setConfirm(true)} style={btn('rgba(16,185,129,0.18)', C.accent)}>📤 Envoyer</button>}
        <button onClick={onDismiss} style={btn('rgba(255,255,255,0.06)', C.muted)}>Ne pas répondre</button>
      </div>
    </div>
  );
}

function ProspectCard({ p, open, onToggle, onStatus }: { p: ProspectRow; open: boolean; onToggle: () => void; onStatus: (s: string) => void }) {
  const s = STATUS[p.status] ?? { label: p.status, color: C.muted };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, marginBottom: 7, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'transparent', border: 'none', color: C.text, textAlign: 'left', cursor: 'pointer', fontFamily: C.font }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.company}</div>
          <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {SEGMENT[p.segment] ?? p.segment} · {p.last_contacted_at ? `contacté le ${fmtDate(p.last_contacted_at)}` : `trouvé le ${fmtDate(p.created_at)}`}
            {p.linkedin_contacts.length ? ` · 🔗 ${p.linkedin_contacts.length}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, border: `1px solid ${s.color}55`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>{s.label}</span>
      </button>
      {open && (
        <div style={{ padding: '0 13px 12px', fontSize: 12, lineHeight: 1.5 }}>
          {p.email && <div>✉️ <a href={`mailto:${p.email}`} style={{ color: '#7fb5ff' }}>{p.email}</a></div>}
          {p.phone && <div>📞 <a href={`tel:${p.phone}`} style={{ color: '#7fb5ff' }}>{p.phone}</a></div>}
          {p.website && <div>🌐 {p.website}</div>}
          {p.last_subject && <div>📨 Objet : {p.last_subject}</div>}
          {p.source && <div style={{ color: C.muted, wordBreak: 'break-all' }}>Source : {/^https?:/.test(p.source) ? <a href={p.source} target="_blank" rel="noreferrer" style={{ color: C.muted }}>{p.source}</a> : p.source}</div>}
          {p.linkedin_contacts.map((c, i) => (
            <div key={i} style={{ marginTop: 4 }}>🔗 <a href={c.url} target="_blank" rel="noreferrer" style={{ color: '#7fb5ff' }}>{c.name}</a> — {c.title} {c.sent_at ? <span style={{ color: C.accent }}>· envoyé</span> : ''}</div>
          ))}
          {p.last_reply_text && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 8, maxHeight: 160, overflowY: 'auto' }}>{p.last_reply_text}</div>}
          {p.notes && <div style={{ marginTop: 6, color: C.muted, whiteSpace: 'pre-wrap' }}>{p.notes}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
            {(['interesse', 'client', 'refus'] as const).filter(x => x !== p.status).map(x => (
              <button key={x} onClick={() => onStatus(x)} style={btn('rgba(255,255,255,0.06)', STATUS[x]!.color)}>→ {STATUS[x]!.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
