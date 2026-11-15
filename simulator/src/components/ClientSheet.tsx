// Fiche client complète (15/11) — s'ouvre depuis N'IMPORTE QUELLE page quand on touche le nom d'un client :
//   openClient({ name, phone })  →  évènement « dz:client »  →  Phone.tsx affiche cette fiche par-dessus la page.
// Tout vient des vraies données : réservations (même nom ou même téléphone), documents, profil appris par Dzaryx.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { business, type Booking, type ClientDetail, type ClientIntelligence } from '../services/api.ts';
import { T, tone, Avatar, Badge, ActionBtn, waLink, money } from './ui/Kit.tsx';

export interface ClientRef { name: string; phone?: string | null }

/** À appeler depuis n'importe quel écran pour ouvrir la fiche d'un client. */
export function openClient(c: ClientRef) {
  if (!c?.name?.trim() && !c?.phone) return;
  window.dispatchEvent(new CustomEvent<ClientRef>('dz:client', { detail: c }));
}

/** Nom de client cliquable (ouvre sa fiche) — à utiliser dans les listes. */
export function ClientName({ name, phone, style }: { name: string; phone?: string | null; style?: CSSProperties }) {
  return (
    <span role="button" tabIndex={0}
      onClick={e => { e.stopPropagation(); openClient({ name, phone }); }}
      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); openClient({ name, phone }); } }}
      style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: tone(T.accent, 0.45), textUnderlineOffset: 3, ...style }}>
      {name}
    </span>
  );
}

const norm = (s?: string | null) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const digits = (s?: string | null) => String(s ?? '').replace(/\D/g, '').slice(-9);
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Algiers' });
const live = (st?: string | null) => /^(confirmed|accepted|active|completed)$/i.test(st ?? '');
/** Règles Kouider 15/11 : voiture récupérée = tout payé ; « Payé » = payé en entier. */
const paidOf = (b: Booking) => {
  const fp = b.final_price ?? 0;
  const picked = (b.start_date ?? '').slice(0, 10) <= today() && live(b.status);
  return (b.payment_status ?? '').toUpperCase() === 'PAID' || picked ? Math.max(fp, b.paid_amount ?? 0) : (b.paid_amount ?? 0);
};
const ST: Record<string, [string, string]> = { active: ['En cours', T.ok], confirmed: ['Confirmée', T.accent], accepted: ['Confirmée', T.accent], completed: ['Terminée', T.faint], pending: ['En attente', T.warn], rejected: ['Refusée', T.bad], cancelled: ['Annulée', T.bad] };
const dShort = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
const dLong = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export default function ClientSheet({ client, onClose, actor }: { client: ClientRef; onClose: () => void; actor: string }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [intel, setIntel] = useState<ClientIntelligence | null>(null);
  const [realProfit, setRealProfit] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    let off = false;
    const first = client.name.trim().split(' ')[0] || client.name;
    business.fetchBookings(first, actor === 'houari' ? 'Houari' : undefined).then(r => {
      if (off) return;
      const n = norm(client.name), p = digits(client.phone);
      const mine = (r.bookings ?? []).filter(b => (p && digits(b.client_phone) === p) || norm(b.client_name) === n);
      setBookings(mine.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '')));
    }).catch(() => !off && setBookings([]));
    if (actor !== 'houari') business.fetchLedger().then(l => { if (!off) setRealProfit(new Map(l.rows.map(x => [x.id, x.eur]))); }).catch(() => {});
    business.fetchClientIntel().then(r => { if (!off) setIntel((r.clients ?? []).find(c => norm(c.client_name) === norm(client.name)) ?? null); }).catch(() => {});
    return () => { off = true; };
  }, [client.name, client.phone, actor]);

  const list = bookings ?? [];
  const phone = client.phone || list.find(b => b.client_phone)?.client_phone || null;
  useEffect(() => {
    if (!phone) return;
    let off = false;
    business.fetchClientDetail(phone).then(d => { if (!off) setDetail(d); }).catch(() => {});
    return () => { off = true; };
  }, [phone]);

  // Escape / geste retour ferment la fiche
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const pick = <K extends keyof Booking>(k: K) => list.find(b => b[k] != null && b[k] !== '')?.[k] ?? null;
  const email = pick('client_email') as string | null;
  const age = pick('client_age') as number | null;
  const passport = pick('client_passport') as string | null;
  const passExp = pick('passport_expiry') as string | null;
  const lang = pick('client_lang') as string | null;
  const real = list.filter(b => live(b.status));
  const eurReal = real.filter(b => (b.currency ?? 'EUR') !== 'DZD');
  const spent = eurReal.reduce((s, b) => s + (b.final_price ?? 0), 0);
  const due = eurReal.reduce((s, b) => s + Math.max(0, (b.final_price ?? 0) - paidOf(b)), 0);
  // même bénéfice que l'écran CA et le site (bénéfice réel noté à la main, sinon prix client − prix proprio)
  const margin = eurReal.reduce((s, b) => s + (realProfit?.get(b.id) ?? (b.client_price_per_day != null && b.owner_price_per_day != null ? (b.client_price_per_day - b.owner_price_per_day) * (b.nb_days ?? 0) : 0)), 0);
  const days = real.reduce((s, b) => s + (b.nb_days ?? 0), 0);
  const now = real.find(b => (b.start_date ?? '').slice(0, 10) <= today() && (b.end_date ?? '').slice(0, 10) >= today());
  const next = real.filter(b => (b.start_date ?? '').slice(0, 10) > today()).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const since = real.length ? real[real.length - 1]!.start_date : null;
  const notes = [...new Set(list.map(b => (b.notes ?? '').trim()).filter(Boolean))];
  const docs = detail?.documents ?? [];
  const expSoon = passExp ? (Date.parse(passExp) - Date.now()) / 86_400_000 : null;
  const vip = detail?.isVip || /vip/i.test(intel?.score ?? '');
  const wa = waLink(phone);

  const askDzaryx = () => {
    try { localStorage.setItem('dz:ask_prompt', `Fais-moi le point complet sur le client ${client.name}${phone ? ` (${phone})` : ''} : ses locations, ce qu'il a payé, ses habitudes, et ce que je devrais lui proposer.`); } catch { /* ignore */ }
    onClose();
    window.dispatchEvent(new CustomEvent('dz:go', { detail: 'text' }));
  };

  const box: CSSProperties = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: '13px 14px', marginBottom: 12 };
  const h = (t: string, right?: ReactNode) => <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><div style={{ flex: 1, fontSize: 11.5, color: T.faint, fontWeight: 800, letterSpacing: '0.1em' }}>{t}</div>{right}</div>;
  const kv = (k: string, v: ReactNode, c?: string) => v == null || v === '' ? null : (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 14.5, borderTop: `1px solid ${tone('#6ea0ff', 0.07)}` }}>
      <span style={{ color: T.muted, flexShrink: 0 }}>{k}</span>
      <span style={{ flex: 1, textAlign: 'right', fontWeight: 650, color: c ?? T.text, wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
  const stat = (v: ReactNode, l: string, c: string = T.text) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '10px 4px', background: tone('#ffffff', 0.025), borderRadius: 12, border: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, letterSpacing: '-0.02em' }}>{v}</div>
      <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{l}</div>
    </div>
  );

  const body = (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(2,6,16,0.74)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: T.font, animation: 'fadeIn .18s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '94%', display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg, ${T.surface2}, ${T.bg} 60%)`, borderRadius: '26px 26px 0 0', border: `1px solid ${T.lineStrong}`, borderBottom: 'none', boxShadow: `0 -24px 70px -20px ${tone(T.accent, 0.4)}` }}>
        {/* En-tête */}
        <div style={{ padding: '10px 18px 14px', flexShrink: 0, position: 'relative', overflow: 'hidden', borderRadius: '26px 26px 0 0' }}>
          <div style={{ position: 'absolute', top: -120, right: -80, width: 300, height: 300, background: `radial-gradient(circle, ${tone(T.accent, 0.2)}, transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 14px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={client.name} color={vip ? T.warn : T.accent} size={58} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.accent, fontWeight: 800, letterSpacing: '0.16em' }}>FICHE CLIENT</div>
              <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {vip && <Badge color={T.warn}>⭐ VIP</Badge>}
                {now && <Badge color={T.ok}>🚗 En location</Badge>}
                {!now && next && <Badge color={T.accent}>Arrive le {dShort(next.start_date)}</Badge>}
                {since && <Badge color={T.faint}>Client depuis {new Date(since).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</Badge>}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ alignSelf: 'flex-start', width: 38, height: 38, borderRadius: 12, border: `1px solid ${T.line}`, background: 'rgba(255,255,255,0.05)', color: T.muted, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 8, marginTop: 14 }}>
            {phone && <ActionBtn icon="📞" label="Appeler" onClick={() => { window.location.href = `tel:${phone}`; }} />}
            {wa && <ActionBtn icon="💬" label="WhatsApp" color="#25D366" onClick={() => window.open(wa, '_blank')} />}
            {email && <ActionBtn icon="✉️" label="E-mail" color={T.accent2} onClick={() => { window.location.href = `mailto:${email}`; }} />}
            <ActionBtn icon="🧠" label="Dzaryx" color={T.violet} onClick={askDzaryx} />
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '2px 16px 40px', WebkitOverflowScrolling: 'touch' }}>
          {bookings == null ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.muted, fontSize: 14 }}>Chargement de la fiche…</div>
          ) : (<>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {stat(real.length, real.length > 1 ? 'locations' : 'location', T.accent)}
              {stat(money(spent), 'dépensé')}
              {stat(due > 0 ? money(due) : '0 €', due > 0 ? 'à encaisser' : 'tout payé', due > 0 ? T.bad : T.ok)}
              {actor !== 'houari' && stat(money(margin), 'ma marge', T.warn)}
            </div>

            <div style={box}>
              {h('COORDONNÉES')}
              {kv('Téléphone', phone ? <a href={`tel:${phone}`} style={{ color: T.accent, textDecoration: 'none' }}>{phone}</a> : <span style={{ color: T.faint }}>non renseigné</span>)}
              {kv('E-mail', email ? <a href={`mailto:${email}`} style={{ color: T.accent, textDecoration: 'none' }}>{email}</a> : null)}
              {kv('Âge', age ? `${age} ans` : null)}
              {kv('Langue', lang ? ({ fr: 'Français', ar: 'Arabe', en: 'Anglais' } as Record<string, string>)[lang] ?? lang.toUpperCase() : null)}
              {kv('Passeport', passport)}
              {kv('Expire le', passExp ? dLong(passExp) : null, expSoon != null && expSoon < 180 ? T.bad : undefined)}
              {kv('Jours loués', days ? `${days} jour${days > 1 ? 's' : ''}` : null)}
            </div>

            {(intel && (intel.preferred_cars?.length || intel.typical_duration_days || intel.notes)) ? (
              <div style={box}>
                {h('CE QUE DZARYX SAIT DE LUI')}
                {kv('Voitures préférées', intel.preferred_cars?.length ? intel.preferred_cars.join(', ') : null)}
                {kv('Durée habituelle', intel.typical_duration_days ? `${intel.typical_duration_days} jours` : null)}
                {kv('Négociation', intel.negotiation_style ? ({ normal: 'Normale', never_negotiates: 'Ne négocie jamais', always_negotiates: 'Négocie toujours', hard: 'Négocie dur', soft: 'Négocie un peu' } as Record<string, string>)[intel.negotiation_style] ?? intel.negotiation_style : null)}
                {intel.notes && <div style={{ fontSize: 13.5, color: T.text, marginTop: 6, lineHeight: 1.45 }}>{intel.notes}</div>}
              </div>
            ) : null}

            <div style={box}>
              {h(`LOCATIONS (${list.length})`)}
              {list.length === 0 && <div style={{ fontSize: 14, color: T.muted }}>Aucune location trouvée.</div>}
              {list.map((b, i) => {
                const [stL, stC] = ST[(b.status ?? '').toLowerCase()] ?? [b.status, T.faint];
                const ccy = b.currency === 'DZD' ? 'DZD' : '€';
                const dead = /rejected|cancelled/i.test(b.status ?? '');
                const rest = dead ? 0 : Math.max(0, (b.final_price ?? 0) - paidOf(b));
                return (
                  <div key={b.id} style={{ padding: '11px 0', borderTop: i ? `1px solid ${T.line}` : 'none', opacity: dead ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: T.text }}>🚗 {b.cars?.name ?? 'Voiture'}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{money(b.final_price, ccy)}</div>
                    </div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{dShort(b.start_date)} → {dShort(b.end_date)} · {b.nb_days ?? '?'} j{b.client_price_per_day ? ` · ${money(b.client_price_per_day, ccy)}/j` : ''}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge color={stC}>{stL}</Badge>
                      {!dead && <Badge color={rest > 0 ? T.bad : T.ok}>{rest > 0 ? `Reste ${money(rest, ccy)}` : 'Payé'}</Badge>}
                      {(b.rented_by ?? '').toLowerCase().startsWith('h') && <Badge color={T.violet}>Houari</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>

            {docs.length > 0 && (
              <div style={box}>
                {h(`DOCUMENTS (${docs.length})`)}
                {docs.map(d => (
                  <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid ${T.line}`, color: T.text, textDecoration: 'none', fontSize: 14.5, fontWeight: 600 }}>
                    <span style={{ fontSize: 20 }}>{({ passport: '🛂', license: '🪪', contract: '📄' } as Record<string, string>)[d.type] ?? '📎'}</span>
                    <span style={{ flex: 1 }}>{({ passport: 'Passeport', license: 'Permis', contract: 'Contrat' } as Record<string, string>)[d.type] ?? 'Document'}{d.notes ? <span style={{ color: T.muted, fontWeight: 500 }}> · {d.notes}</span> : null}</span>
                    <span style={{ color: T.accent }}>Ouvrir ›</span>
                  </a>
                ))}
              </div>
            )}

            {notes.length > 0 && (
              <div style={box}>
                {h('INFOS & NOTES')}
                {notes.map((n, i) => <div key={i} style={{ fontSize: 13.5, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.5, padding: '6px 0', borderTop: i ? `1px solid ${T.line}` : 'none' }}>{n}</div>)}
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
