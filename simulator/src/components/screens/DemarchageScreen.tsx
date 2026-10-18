import { useState, useEffect, useCallback } from 'react';
import { business, type ProspectRow, type ProspectsOverview } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards, SearchPill } from '../ui/Premium.tsx';

const C = {
  bg: '#050a16', surface: '#0c1730', border: 'rgba(90,150,255,0.16)',
  accent: '#38d8f5', gold: '#fbbf24', blue: '#0a66c2', wa: '#25d366', red: '#f87171', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

const SEGMENT: Record<string, string> = {
  grand_compte: '🏭 Grand compte', entreprise: '🏢 Entreprise', agence_voyage: '✈️ Agence de voyage', organisme: '🎓 Organisme',
  site_web: '🌐 Sans site web', loueur_voitures: '🤝 Loueur voitures', proprietaire_appart: '🤝 Proprio appart', autre: '🤝 Résidence / immo',
};
const PARTNER = ['loueur_voitures', 'proprietaire_appart', 'autre'];
const LANG: Record<string, string> = { fr: 'Français', en: 'Anglais', ar: 'Arabe', es: 'Espagnol', it: 'Italien', de: 'Allemand', tr: 'Turc', pt: 'Portugais', nl: 'Néerlandais', zh: 'Chinois', ko: 'Coréen', ja: 'Japonais', ru: 'Russe' };
const STATUS: Record<string, { label: string; color: string }> = {
  a_contacter: { label: 'À contacter', color: C.muted },
  contacte:    { label: 'Contacté',    color: '#60a5fa' },
  a_repondu:   { label: 'A répondu',   color: C.gold },
  interesse:   { label: 'Intéressé',   color: C.accent },
  client:      { label: 'Client 🎉',   color: C.accent },
  refus:       { label: 'Pas intéressé', color: C.red },
  stop:        { label: 'STOP',        color: C.red },
};
type Filter = 'all' | 'sites' | 'clients' | 'partners' | 'replies' | 'visits' | 'linkedin' | 'whatsapp' | 'grand_compte' | 'contacte' | 'a_contacter' | 'closed';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tout' }, { id: 'sites', label: '🌐 Sites web' }, { id: 'clients', label: '🎯 Clients' }, { id: 'partners', label: '🤝 Partenaires' }, { id: 'replies', label: '📩 Réponses' },
  { id: 'visits', label: '👀 Visites' }, { id: 'linkedin', label: '👔 Décideurs' }, { id: 'whatsapp', label: '💬 WhatsApp' },
  { id: 'grand_compte', label: '🏭 Grands comptes' }, { id: 'contacte', label: 'Contactés' },
  { id: 'a_contacter', label: 'À contacter' }, { id: 'closed', label: 'Refus / STOP' },
];

const MODES: Array<{ id: 'sites' | 'conciergerie' | 'both'; label: string }> = [
  { id: 'sites', label: '🌐 Sites web' }, { id: 'conciergerie', label: '🏨 Conciergerie' }, { id: 'both', label: 'Les deux' },
];

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—';
const fmtSlot = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Algiers', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const DEVIS_LANG = (l: string | null) => (l === 'ar' || l === 'en' ? l : 'fr');

/** Ouvre la page Devis pré-remplie (client + lignes proposées par Dzaryx, montants à saisir). */
function openDevis(p: ProspectRow, onOpen?: (page: string) => void) {
  try {
    sessionStorage.setItem('devis_prefill', JSON.stringify({
      client_name: p.contact_name ? `${p.contact_name} — ${p.company}` : p.company, lang: DEVIS_LANG(p.lang), lines: p.quote_draft ?? [],
    }));
  } catch { /* stockage indisponible : la page Devis s'ouvre vide */ }
  onOpen?.('devis');
}
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' } as const);

export default function DemarchageScreen({ onOpen }: { onOpen?: (page: string) => void }) {
  const [data, setData] = useState<ProspectsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<string | null>(null);

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
  const liTodo = rows.filter(r => r.linkedin_contacts.some(c => c.email && !c.sent_at));
  const waTodo = rows.filter(r => r.whatsapp_message && r.whatsapp_number && !r.whatsapp_sent_at && !['refus', 'stop', 'client'].includes(r.status));
  const visits = rows.filter(r => r.site_visit_at).sort((a, b) => (b.site_visit_at ?? '').localeCompare(a.site_visit_at ?? ''));
  const ql = q.trim().toLowerCase();
  const list = rows.filter(r => {
    if (ql && !`${r.company} ${r.email ?? ''} ${r.notes ?? ''}`.toLowerCase().includes(ql)) return false;
    switch (filter) {
      case 'sites':        return r.segment === 'site_web';
      case 'clients':      return !PARTNER.includes(r.segment) && r.segment !== 'site_web';
      case 'partners':     return PARTNER.includes(r.segment);
      case 'replies':      return !!r.last_reply_text || !!r.suggested_reply;
      case 'visits':       return !!r.site_visit_at;
      case 'linkedin':     return r.linkedin_contacts.length > 0;
      case 'whatsapp':     return !!r.whatsapp_message;
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
        <Hero eyebrow="Dzaryx · Prospection" title="Démarchage" subtitle="Sociétés trouvées, mails envoyés, réponses et décideurs" />
      </div>

      {loading ? <SkeletonCards count={5} /> : !data ? (
        <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Impossible de charger le démarchage. <button onClick={() => { setLoading(true); void load(); }} style={btn('rgba(255,255,255,0.08)', C.text)}>Réessayer</button></div>
      ) : (<>
        {/* Chiffres */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 14 }}>
          <StatCard icon="📤" value={String(st?.sent ?? 0)} label="MAILS ENVOYÉS" />
          <StatCard icon="📅" value={String(st?.sent_today ?? 0)} label="AUJOURD'HUI" color="#60a5fa" />
          <StatCard icon="📩" value={String(st?.replies ?? 0)} label="RÉPONSES" color={C.gold} />
          <StatCard icon="🔗" value={String(st?.linkedin_todo ?? 0)} label="DÉCIDEURS" color={C.blue} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: -7, marginBottom: 14 }}>
          <StatCard icon="👀" value={String(st?.visits ?? 0)} label="ONT VISITÉ LE SITE" color={C.accent} />
          <StatCard icon="🔁" value={String(st?.followups ?? 0)} label="RELANCES" color="#a78bfa" />
          <StatCard icon="💬" value={String(st?.whatsapp_todo ?? 0)} label="WHATSAPP" color={C.wa} />
        </div>

        {/* Pilote automatique */}
        {ap && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 13, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ap.enabled ? '✅ Démarchage auto actif' : '⏸️ Démarchage auto en pause'}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Chaque jour à 10h (Oran) · {ap.per_day} mail(s)/jour{(data.mode ?? 'sites') !== 'sites' ? ' + 1 grand compte' : ''}</div>
              </div>
              <button onClick={() => act(() => business.prospectsAutopilot({ enabled: !ap.enabled }), ap.enabled ? 'Démarchage mis en pause' : 'Démarchage réactivé')}
                style={btn(ap.enabled ? 'rgba(248,113,113,0.15)' : 'rgba(56,216,245,0.18)', ap.enabled ? C.red : C.accent)}>{ap.enabled ? 'Pause' : 'Activer'}</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Mails par jour</span>
              <button disabled={ap.per_day <= 1} onClick={() => act(() => business.prospectsAutopilot({ per_day: ap.per_day - 1 }), `${ap.per_day - 1} mails/jour`)} style={btn('rgba(255,255,255,0.06)', C.text)}>−</button>
              <span style={{ fontSize: 15, fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{ap.per_day}</span>
              <button disabled={ap.per_day >= 15} onClick={() => act(() => business.prospectsAutopilot({ per_day: ap.per_day + 1 }), `${ap.per_day + 1} mails/jour`)} style={btn('rgba(255,255,255,0.06)', C.text)}>+</button>
              <div style={{ flex: 1 }} />
              <button onClick={() => act(() => business.prospectsRun(), '🚀 Lancé — récap en notification dans quelques minutes')} style={btn(C.accent, '#06210f')}>🚀 Lancer maintenant</button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 12, marginBottom: 6 }}>Qui démarcher ?</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MODES.map(m => {
                const on = (data.mode ?? 'sites') === m.id;
                return <button key={m.id} onClick={() => !on && act(() => business.prospectsAutopilot({ mode: m.id }), `Mode : ${m.label}`)}
                  style={{ ...btn(on ? 'rgba(56,216,245,0.18)' : 'rgba(255,255,255,0.06)', on ? C.accent : C.text), flex: 1, border: on ? `1px solid ${C.accent}` : '1px solid transparent' }}>{m.label}</button>;
              })}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>
              {(data.mode ?? 'sites') === 'conciergerie'
                ? '🏨 Entreprises et partenaires FIK Conciergerie, mail avec le lien du site.'
                : '🌐 Commerces SANS site web (Google Maps) : le 1er mail propose une démo gratuite. La démo est faite et envoyée seulement s\'ils répondent oui.'
                  + ((data.mode ?? 'sites') === 'both' ? ' Moitié sites web, moitié conciergerie.' : '')}
              {st?.sites_sent ? ` · ${st.sites_sent} commerce(s) déjà contacté(s).` : ''}
            </div>
            {(data.mode ?? 'sites') !== 'conciergerie' && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.45 }}>📍 {(data.cities ?? []).join(' · ')}</div>
                <button onClick={() => {
                  const v = window.prompt('Villes à démarcher, séparées par des virgules (ex : Liège Belgique, Lyon France, Oran Algérie)',
                    (data.cities ?? []).map(c => c.replace(', ', ' ')).join(', '));
                  if (v === null) return;
                  const list = v.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
                  if (list.length) act(() => business.prospectsAutopilot({ cities: list }), `${list.length} ville(s) enregistrée(s)`);
                }} style={btn('rgba(255,255,255,0.06)', C.text)}>Villes</button>
              </div>
            )}
            <div style={{ fontSize: 11.5, color: data.sender_pro ? C.accent : C.gold, marginTop: 10, lineHeight: 1.4 }}>
              {data.sender_pro
                ? `✉️ Envoi depuis ${data.sender}`
                : `✉️ Envoi depuis ${data.sender} — contact@fikconciergerie.com pas encore relié à Gmail (« Envoyer en tant que »)`}
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>🔁 Relance automatique après 5 jours sans réponse (une seule fois)</div>
            <button onClick={() => { if (weekly) { setWeekly(null); return; } business.prospectsWeekly().then(r => setWeekly(r.report), () => say('❌ Bilan indisponible')); }}
              style={{ ...btn('rgba(255,255,255,0.06)', C.text), marginTop: 10, width: '100%' }}>{weekly ? 'Fermer le bilan' : '📊 Bilan de la semaine'}</button>
            {weekly && <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 10 }}>{weekly.replace(/\*/g, '')}</div>}
          </div>
        )}

        {/* Visites du site via le lien des mails */}
        {visits.length > 0 && (
          <Section title={`👀 Ont visité ton site (${visits.length})`} hint="Ils ont cliqué sur le lien de ton mail : c'est le bon moment pour les contacter. Touche une société pour voir sa fiche et le mail envoyé — ou demande à Dzaryx : « qui a visité mon site ? », « qu'est-ce qu'on a envoyé à Repsol ? ».">
            {visits.slice(0, 5).map(r => (
              <div key={r.id} style={{ background: C.surface, border: `1px solid ${open === `v-${r.id}` ? C.accent : C.border}`, borderRadius: 12, marginBottom: 7, overflow: 'hidden' }}>
                <div onClick={() => setOpen(open === `v-${r.id}` ? null : `v-${r.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.company} <span style={{ color: C.muted, fontWeight: 400, fontSize: 11 }}>{open === `v-${r.id}` ? '▲' : '▼ voir la fiche'}</span></div>
                    <div style={{ fontSize: 11.5, color: C.muted }}>{r.site_visits > 1 ? `${r.site_visits} visites · ` : ''}dernière le {r.site_visit_at ? fmtSlot(r.site_visit_at) : '—'}</div>
                  </div>
                  {r.phone && <a href={`tel:${r.phone}`} onClick={e => e.stopPropagation()} style={{ ...btn('rgba(56,216,245,0.18)', C.accent), textDecoration: 'none' }}>📞 Appeler</a>}
                </div>
                {open === `v-${r.id}` && <div style={{ paddingBottom: 10 }}><ProspectDetails p={r} mailOpen /></div>}
              </div>
            ))}
          </Section>
        )}

        {/* Réponses à valider */}
        {replies.length > 0 && (
          <Section title={`📩 Réponses à valider (${replies.length})`}>
            {replies.map(r => <ReplyCard key={r.id} p={r} onDevis={() => openDevis(r, onOpen)} onSend={(t) => act(() => business.prospectReply(r.id, t), `✅ Réponse envoyée à ${r.company}`)}
              onDismiss={() => act(() => business.prospectDismissReply(r.id), 'Réponse ignorée')} />)}
          </Section>
        )}

        {/* Décideurs (trouvés sur LinkedIn) avec leur email pro : écrire sur LinkedIn est payant → on passe par le mail */}
        {liTodo.length > 0 && (
          <Section title={`👔 Décideurs à contacter par mail (${st?.linkedin_todo ?? 0})`}
            hint="Dzaryx a trouvé leur email pro sur le web et préparé le mail. « Envoyer le mail » l'ouvre tout prêt dans ta messagerie, puis « ✓ Envoyé ». Sans email trouvé, Dzaryx ne te propose pas la personne.">
            {liTodo.map(r => r.linkedin_contacts.map((c, i) => c.sent_at || !c.email ? null : (
              <div key={`${r.id}-${i}`} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name} <span style={{ color: C.muted, fontWeight: 500 }}>· {r.company}</span></div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 12.5, marginBottom: 7 }}>✉️ <a href={`mailto:${c.email}`} style={{ color: '#7fb5ff', wordBreak: 'break-all' }}>{c.email}</a></div>
                {c.subject && <div style={{ fontSize: 12, color: C.gold, marginBottom: 4 }}>Objet : {c.subject}</div>}
                <div style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 9, marginBottom: 9 }}>{c.message}</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => window.open(`mailto:${c.email}?subject=${encodeURIComponent(c.subject ?? '')}&body=${encodeURIComponent(c.message)}`, '_self')} style={btn('rgba(56,216,245,0.18)', C.accent)}>✉️ Envoyer le mail</button>
                  <button onClick={() => { void navigator.clipboard?.writeText(c.email!).then(() => say('Email copié'), () => say('Copie impossible')); }} style={btn('rgba(255,255,255,0.08)', C.text)}>📋 Email</button>
                  <button onClick={() => { void navigator.clipboard?.writeText(c.message).then(() => say('Texte copié'), () => say('Copie impossible')); }} style={btn('rgba(255,255,255,0.08)', C.text)}>📋 Texte</button>
                  {c.url && <button onClick={() => window.open(c.url, '_blank')} style={btn('rgba(10,102,194,0.25)', '#7fb5ff')}>Profil</button>}
                  <button onClick={() => act(() => business.prospectLinkedinSent(r.id, c.idx ?? i, true), `Noté : mail envoyé à ${c.name}`)} style={btn('rgba(56,216,245,0.18)', C.accent)}>✓ Envoyé</button>
                </div>
              </div>
            )))}
          </Section>
        )}

        {/* WhatsApp à envoyer : partenaires d'Oran sans email, ou prospects qui ont répondu au mail (suite sur WhatsApp) */}
        {waTodo.length > 0 && (
          <Section title={`💬 Messages WhatsApp à envoyer (${waTodo.length})`}
            hint="Jamais de 1er contact automatique : ce sont des gens qui ont répondu à ton mail (ou des partenaires d'Oran sans email). « Envoyer » = Dzaryx l'envoie depuis ton WhatsApp Business ; « Ouvrir WhatsApp » = tu l'envoies toi-même.">
            {waTodo.map(r => (
              <div key={r.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.company} <span style={{ color: C.muted, fontWeight: 500 }}>· {SEGMENT[r.segment] ?? r.segment}</span></div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 7 }}>{r.phone}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 9, marginBottom: 9 }}>{r.whatsapp_message}</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {r.status !== 'a_contacter' && <button onClick={() => { if (window.confirm(`Envoyer ce message WhatsApp à ${r.company} (+${r.whatsapp_number}) ?`)) act(() => business.prospectWhatsappSend(r.id), `💬 Envoyé à ${r.company}`); }}
                    style={btn(C.wa, '#06210f')}>📤 Envoyer</button>}
                  <button onClick={() => window.open(`https://wa.me/${r.whatsapp_number}?text=${encodeURIComponent(r.whatsapp_message ?? '')}`, '_blank')} style={btn('rgba(37,211,102,0.2)', C.wa)}>Ouvrir WhatsApp</button>
                  <button onClick={() => act(() => business.prospectWhatsappSent(r.id, true), `Noté : message envoyé à ${r.company}`)} style={btn('rgba(56,216,245,0.18)', C.accent)}>✓ Envoyé</button>
                </div>
              </div>
            ))}
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

      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 90, background: '#142342', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 14px', fontSize: 13, textAlign: 'center', zIndex: 50 }}>{toast}</div>}
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

function ReplyCard({ p, onSend, onDismiss, onDevis }: { p: ProspectRow; onSend: (text: string) => void; onDismiss: () => void; onDevis: () => void }) {
  const [text, setText] = useState(p.suggested_reply ?? '');
  const [showMail, setShowMail] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ background: C.surface, border: `1px solid rgba(251,191,36,0.35)`, borderRadius: 13, padding: 12, marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.company} <span style={{ fontSize: 11, color: STATUS[p.status]?.color }}>{STATUS[p.status]?.label}</span></div>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>{p.email}</div>
      <button onClick={() => setShowMail(!showMail)} style={{ ...btn('transparent', C.gold), padding: 0, marginBottom: 8 }}>{showMail ? '▾ Cacher son mail' : '▸ Lire son mail'}</button>
      {showMail && <div style={{ fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 9, marginBottom: 9, maxHeight: 220, overflowY: 'auto' }}>{p.last_reply_text}</div>}
      {!!p.proposed_slots?.length && <div style={{ fontSize: 11.5, color: C.accent, marginBottom: 6 }}>📅 Créneaux libres proposés : {p.proposed_slots.map(fmtSlot).join(' · ')}</div>}
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>Réponse préparée par Dzaryx (tu peux la modifier) :</div>
      <textarea value={text} onChange={e => { setText(e.target.value); setConfirm(false); }} rows={7}
        style={{ width: '100%', boxSizing: 'border-box', background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: 9, fontSize: 12.5, fontFamily: C.font, lineHeight: 1.45, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
        {confirm
          ? <button onClick={() => onSend(text)} style={btn(C.accent, '#06210f')}>Oui, envoyer à {p.company}</button>
          : <button onClick={() => setConfirm(true)} style={btn('rgba(56,216,245,0.18)', C.accent)}>📤 Envoyer</button>}
        <button onClick={onDismiss} style={btn('rgba(255,255,255,0.06)', C.muted)}>Ne pas répondre</button>
      </div>
      {(p.status === 'interesse' || !!p.quote_draft?.length) && (
        <button onClick={onDevis} style={{ ...btn('rgba(251,191,36,0.15)', C.gold), marginTop: 8, width: '100%' }}>
          🧾 Préparer le devis{p.quote_draft?.length ? ` (${p.quote_draft.length} ligne${p.quote_draft.length > 1 ? 's' : ''} prête${p.quote_draft.length > 1 ? 's' : ''})` : ''}
        </button>
      )}
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
            {SEGMENT[p.segment] ?? p.segment}{p.lang && p.lang !== 'fr' ? ` · ${(LANG[p.lang] ?? p.lang).toLowerCase()}` : ''} · {p.last_contacted_at ? `contacté le ${fmtDate(p.last_contacted_at)}` : `trouvé le ${fmtDate(p.created_at)}`}
            {p.linkedin_contacts.length ? ` · 👔 ${p.linkedin_contacts.length}` : ''}
            {p.site_visit_at ? ` · 👀 ${p.site_visits || 1}` : ''}{p.followup_at ? ' · 🔁' : ''}
          </div>
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: s.color, border: `1px solid ${s.color}55`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>{s.label}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 12 }}>
          <ProspectDetails p={p} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '9px 13px 0' }}>
            {(['interesse', 'client', 'refus'] as const).filter(x => x !== p.status).map(x => (
              <button key={x} onClick={() => onStatus(x)} style={btn('rgba(255,255,255,0.06)', STATUS[x]!.color)}>→ {STATUS[x]!.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fiche d'une société : contacts, décideurs (email), mail envoyé, visites, réponse. */
function ProspectDetails({ p, mailOpen }: { p: ProspectRow; mailOpen?: boolean }) {
  return (
    <div style={{ padding: '0 13px 4px', fontSize: 12, lineHeight: 1.5 }}>
      {p.email && <div>✉️ <a href={`mailto:${p.email}`} style={{ color: '#7fb5ff' }}>{p.email}</a></div>}
      {p.phone && <div>📞 <a href={`tel:${p.phone}`} style={{ color: '#7fb5ff' }}>{p.phone}</a></div>}
      {p.website && <div>🌐 {p.website}</div>}
      {p.linkedin_contacts.map((c, i) => (
        <div key={i} style={{ marginTop: 4 }}>👔 <a href={c.url} target="_blank" rel="noreferrer" style={{ color: '#7fb5ff' }}>{c.name}</a> — {c.title}{c.email ? <> · <a href={`mailto:${c.email}`} style={{ color: '#7fb5ff' }}>{c.email}</a></> : ''} {c.sent_at ? <span style={{ color: C.accent }}>· envoyé</span> : ''}</div>
      ))}
      {p.lang && <div>🌐 Mail écrit en {LANG[p.lang] ?? p.lang}</div>}
      {p.last_subject && <div>📨 Objet : {p.last_subject}</div>}
      {p.followup_at && <div>🔁 Relancé le {fmtDate(p.followup_at)}</div>}
      {p.site_visit_at && <div style={{ color: C.accent }}>👀 A visité le site via ton mail{p.site_visits > 1 ? ` (${p.site_visits} fois)` : ''} — dernière fois le {fmtSlot(p.site_visit_at)}</div>}
      {p.whatsapp_sent_at && <div>💬 Message WhatsApp envoyé le {fmtDate(p.whatsapp_sent_at)}</div>}
      {p.last_sent_text && <details open={mailOpen} style={{ marginTop: 4 }}><summary style={{ cursor: 'pointer', color: C.gold }}>{mailOpen ? 'Le mail envoyé' : 'Voir le mail envoyé'}</summary>
        <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 8, maxHeight: 260, overflowY: 'auto' }}>{p.last_sent_text}</div></details>}
      {p.source && <div style={{ color: C.muted, wordBreak: 'break-all' }}>Source : {/^https?:/.test(p.source) ? <a href={p.source} target="_blank" rel="noreferrer" style={{ color: C.muted }}>{p.source}</a> : p.source}</div>}
      {p.last_reply_text && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: 8, maxHeight: 160, overflowY: 'auto' }}>{p.last_reply_text}</div>}
      {p.notes && <div style={{ marginTop: 6, color: C.muted, whiteSpace: 'pre-wrap' }}>{p.notes}</div>}
    </div>
  );
}
