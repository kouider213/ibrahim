// 27/11 — BOÎTE DE RÉCEPTION de la page Aujourd'hui : WhatsApp, TikTok, relances, réservations et demandes du site,
// avec les boutons directement sur la carte (envoyer, accepter, refuser, réécrire, traduire, vocal, plus tard, conclu…).
// Rien ne part chez un client sans SON appui sur « Envoyer » (5 s pour annuler).
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { openClient } from '../ClientSheet.tsx';
import { T, tone, glass, Badge, SectionTitle, Btn, inputStyle, waLink } from '../ui/Kit.tsx';
import { Ico } from '../ui/Icon.tsx';

type Flag = { icon: string; label: string; tone: 'bad' | 'warn' | 'ok' | 'info' };
type Item = {
  id: string; kind: 'wa' | 'tt' | 'ttc' | 'rel' | 'booking' | 'lead'; sub?: string; channel: 'whatsapp' | 'tiktok' | 'site';
  name: string; chat?: string; phone?: string | null; text: string; draft?: string; why?: string; meta?: string; video?: string;
  at: string; flags: Flag[]; lang: string; prio: number; ask?: boolean; count?: number; note?: string; actions: string[];
};
type Stats = { sent: number; accepted: number; refused: number; waitMin: number; waitN: number; voice: number; waiting: number; oldestH: number; snoozed: number; lostTop: Array<{ reason: string; n: number }> };
type ActRes = { ok: boolean; message?: string; draft?: string; messages?: Array<{ me: boolean; text: string }>; client?: string; reply?: string; gone?: boolean };

const CH: Record<Item['channel'], { icon: string; color: string; label: string }> = {
  whatsapp: { icon: '💬', color: '#25D366', label: 'WhatsApp' },
  tiktok: { icon: '🎵', color: '#ff2e63', label: 'TikTok' },
  site: { icon: '🌐', color: T.accent, label: 'Site' },
};
const FLAG_C = { bad: T.bad, warn: T.warn, ok: T.ok, info: T.accent } as const;
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`;
};
const LOST = ['Prix', 'Âge < 35', 'Dates complètes', 'Plus de réponse', 'Parti ailleurs', 'Autre'];
const REWRITES: Array<[string, string]> = [['court', '✂️ Plus court'], ['chaleureux', '🤝 Chaleureux'], ['pro', '👔 Pro'], ['darija', '🇩🇿 Darija'], ['fr', '🇫🇷 Français'], ['en', '🇬🇧 English'], ['arabe', 'ع عربي'], ['datesage', '📆 + dates & âge'], ['aeroport', '✈️ + aéroport']];
const QUICK: Array<[string, string]> = [['verif', '🔎 On vérifie'], ['datesage', '📆 Dates + âge ?'], ['complet', '⛔ Complet'], ['rappel', '📞 Je t\'appelle'], ['merci', '🙏 Merci']];
const vibrate = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* iPhone : rien */ } };

function Chip({ children, onClick, active, color = T.accent, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; color?: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={e => { e.stopPropagation(); onClick(); }} style={{
      flexShrink: 0, minHeight: 34, padding: '0 11px', borderRadius: 99, fontFamily: T.font, fontSize: 12.5, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap',
      border: `1px solid ${active ? color : 'var(--dz-card-line)'}`, background: active ? tone(color, 0.14) : 'var(--dz-card)', color: active ? color : T.text, opacity: disabled ? 0.45 : 1,
    }}>{children}</button>
  );
}
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginTop: 8, scrollbarWidth: 'none' }}>{children}</div>;

function Card({ it, onGone, onToast }: { it: Item; onGone: (id: string) => void; onToast: (m: string) => void }) {
  const ch = CH[it.channel];
  const [draft, setDraft] = useState(it.draft ?? '');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<'' | 'more' | 'snooze' | 'lost' | 'accept' | 'note'>('');
  const [car, setCar] = useState('');
  const [note, setNote] = useState(it.note ?? '');
  const [tr, setTr] = useState<{ client?: string; reply?: string } | null>(null);
  const [hist, setHist] = useState<ActRes['messages'] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [undo, setUndo] = useState<{ left: number; to?: string; voice?: boolean; own?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const has = (a: string) => it.actions.includes(a);
  const sendable = has('send') && it.kind !== 'ttc';
  const nums = it.ask ? guess(it.chat ?? it.phone ?? '') : [];

  const act = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action + String(extra['how'] ?? ''));
    try {
      const r = await apiFetch<ActRes>('/api/inbox/act', { method: 'POST', body: JSON.stringify({ id: it.id, action, text: draft, ...extra }) });
      if (r.draft != null) setDraft(r.draft);
      if (r.client != null || r.reply != null) setTr({ client: r.client, reply: r.reply });
      if (r.messages) setHist(r.messages);
      if (r.message) onToast(r.message);
      if (r.gone) { vibrate(r.ok ? 30 : 0); onGone(it.id); }
      return r;
    } catch (e) { onToast(e instanceof Error ? e.message : 'Erreur'); return null; }
    finally { setBusy(''); }
  }, [it.id, draft, onGone, onToast]);

  // Envoi avec 5 s pour annuler (un appui de trop ne part jamais)
  const startSend = (o: { to?: string; voice?: boolean; own?: boolean } = {}) => {
    if (!draft.trim()) { onToast('Écris ou prépare la réponse d\'abord.'); return; }
    vibrate(15);
    setUndo({ left: 5, ...o });
    timer.current = setInterval(() => setUndo(u => {
      if (!u) return u;
      if (u.left <= 1) { if (timer.current) clearInterval(timer.current); void act(u.voice ? 'voice' : 'send', { to: u.to, own: u.own }); return null; }
      return { ...u, left: u.left - 1 };
    }), 1000);
  };
  const cancelSend = () => { if (timer.current) clearInterval(timer.current); setUndo(null); onToast('Envoi annulé.'); };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const copy = async () => { try { await navigator.clipboard.writeText(draft); onToast('Réponse copiée 📋'); } catch { onToast('Copie impossible'); } };
  const wa = waLink(it.phone ?? null);
  const waWithText = wa && draft ? `${wa}${wa.includes('?') ? '&' : '?'}text=${encodeURIComponent(draft)}` : wa;
  const b = (k: string) => busy.startsWith(k);

  return (
    <div style={{ ...glass(ch.color), borderRadius: 20, padding: 14 }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, background: tone(ch.color, 0.14), flexShrink: 0 }}>{it.kind === 'booking' ? '📅' : ch.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }} role="button" onClick={() => openClient({ name: it.name, phone: it.phone ?? null })}>
          <div style={{ fontSize: 15, fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
          <div style={{ fontSize: 12, color: T.muted }}>{it.meta ?? ch.label}{it.kind !== 'rel' ? ` · ${ago(it.at)}` : ''}{it.lang ? ` · ${it.lang}` : ''}</div>
        </div>
        {it.phone && <a href={`tel:${it.phone.replace(/[^\d+]/g, '')}`} onClick={e => e.stopPropagation()} style={{ width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', background: 'var(--dz-card)', border: '1px solid var(--dz-card-line)', fontSize: 16 }}>📞</a>}
      </div>

      {/* Repères */}
      {it.flags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
        {it.flags.map((f, i) => <span key={i} style={{ fontSize: 11.5, fontWeight: 650, padding: '3px 8px', borderRadius: 99, color: FLAG_C[f.tone], background: tone(FLAG_C[f.tone], 0.12) }}>{f.icon} {f.label}</span>)}
      </div>}

      {/* Message du client */}
      <div role="button" onClick={() => setExpanded(x => !x)} style={{ marginTop: 10, padding: '9px 12px', borderRadius: '4px 14px 14px 14px', background: 'rgba(var(--dz-ink-rgb),0.05)', fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', cursor: 'pointer',
        ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }) }}>{it.kind === 'rel' ? `🔁 ${it.text}` : it.text}</div>
      {tr?.client && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 5 }}>🇫🇷 {tr.client.replace(/^🇫🇷\s*(Traduction\s*:?\s*)?/i, '')}</div>}
      {it.note && <div style={{ fontSize: 12.5, color: T.warn, marginTop: 6 }}>📝 {it.note}</div>}

      {/* Discussion complète */}
      {hist && <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, padding: 8, borderRadius: 12, border: `1px solid ${T.line}` }}>
        {hist.map((m, i) => <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '85%', fontSize: 12.5, padding: '5px 9px', borderRadius: 10, background: m.me ? tone(ch.color, 0.16) : 'rgba(var(--dz-ink-rgb),0.06)' }}>{m.text}</div>)}
        <button onClick={() => setHist(null)} style={{ alignSelf: 'center', marginTop: 4, background: 'none', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer' }}>Fermer la discussion</button>
      </div>}

      {/* Réservation du site */}
      {it.kind === 'booking' ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn variant="primary" disabled={!!busy} onClick={() => void act('accept')} style={{ flex: 1 }}><Ico e="✅" />{b('accept') ? '…' : 'Accepter'}</Btn>
          <Btn variant="danger" disabled={!!busy} onClick={() => { if (confirm(`Refuser la réservation de ${it.name} ?`)) void act('refuse'); }} style={{ flex: 1 }}>{b('refuse') ? '…' : 'Refuser'}</Btn>
        </div>
      ) : (
        <>
          {/* Réponse (modifiable) */}
          {(draft || has('draft')) && (
            draft ? <>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 42)))} style={{ ...inputStyle, marginTop: 10, width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.4, resize: 'vertical', borderColor: tone(ch.color, 0.45) }} />
              {tr?.reply && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 4 }}>🇫🇷 {tr.reply.replace(/^🇫🇷\s*(Traduction\s*:?\s*)?/i, '')}</div>}
            </> : <Btn variant="soft" disabled={!!busy} onClick={() => void act('draft')} style={{ width: '100%', marginTop: 10 }}>{b('draft') ? 'Je lis la discussion et je prépare…' : '✍️ Préparer la réponse'}</Btn>
          )}

          {/* Actions principales */}
          {undo ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 650 }}>{undo.voice ? 'Vocal' : 'Envoi'} dans {undo.left} s…</div>
              <Btn variant="danger" onClick={cancelSend}>Annuler</Btn>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {sendable && !it.ask && <Btn variant="primary" color={ch.color} disabled={!!busy || !draft} onClick={() => startSend()} style={{ flex: 2, minWidth: 120 }}><Ico e="➤" />{b('send') ? 'Envoi…' : 'Envoyer'}</Btn>}
              {sendable && it.ask && nums.map(n => <Btn key={n} variant="primary" disabled={!!busy || !draft} onClick={() => startSend({ to: n })} style={{ flex: 1 }}>{n.startsWith('+33') ? '🇫🇷' : '🇩🇿'} {n.slice(0, 4)}</Btn>)}
              {it.kind === 'ttc' && draft && <Btn variant="primary" color={ch.color} onClick={() => void copy()} style={{ flex: 2 }}>📋 Copier la réponse</Btn>}
              {has('accept') && <Btn variant="soft" color={T.ok} disabled={!!busy} onClick={() => setOpen(o => o === 'accept' ? '' : 'accept')} style={{ flex: 1 }}>✅ Dispo</Btn>}
              {has('refuse') && <Btn variant="soft" color={T.bad} disabled={!!busy} onClick={() => void act('refuse')} style={{ flex: 1 }}>{b('refuse') ? '…' : '⛔ Complet'}</Btn>}
              {has('ignore') && <Btn variant="ghost" disabled={!!busy} onClick={() => void act('repondu')} style={{ flexBasis: '100%' }}>{b('repondu') ? '…' : '✓ Déjà répondu — retirer'}</Btn>}
            </div>
          )}

          {open === 'accept' && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 14, background: tone(T.ok, 0.08) }}>
              <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 6 }}>Tu confirmes que c'est dispo pour ses dates. Quelle voiture ? (vide = « on a des voitures », je lui demande ses préférences)</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={car} onChange={e => setCar(e.target.value)} placeholder="ex. Clio 5, Creta…" style={{ ...inputStyle, flex: 1, minHeight: 40 }} />
                <Btn variant="primary" color={T.ok} disabled={!!busy} onClick={() => { setOpen(''); void act('accept', { car }); }}>{b('accept') ? '…' : 'Préparer'}</Btn>
              </div>
              <div style={{ marginTop: 6 }}><Chip onClick={() => { setOpen(''); void act('refuse', { how: 'autresdates' }); }} color={T.warn}>📆 Complet → proposer d'autres dates</Chip></div>
            </div>
          )}

          {/* Réécrire / réponses rapides */}
          {draft && has('rewrite') && <Row>{REWRITES.map(([k, l]) => <Chip key={k} disabled={!!busy} active={b('rewrite' + k)} onClick={() => void act('rewrite', { how: k })}>{b('rewrite' + k) ? '…' : l}</Chip>)}</Row>}
          {has('quick') && <Row>{QUICK.map(([k, l]) => <Chip key={k} disabled={!!busy} color={T.violet} active={b('quick' + k)} onClick={() => void act('quick', { how: k })}>{l}</Chip>)}</Row>}
        </>
      )}

      {/* Outils */}
      <Row>
        {has('translate') && <Chip disabled={!!busy} onClick={() => void act('translate').then(r => { if (r && !r.client && !r.reply) onToast('Déjà en français.'); })}>{b('translate') ? '…' : '🇫🇷 Traduire'}</Chip>}
        {has('history') && <Chip disabled={!!busy} onClick={() => void act('history')}>{b('history') ? 'Lecture…' : '💬 Discussion'}</Chip>}
        {has('voice') && draft && <Chip disabled={!!busy || !!undo} onClick={() => startSend({ voice: true, own: true })}>🎙️ Vocal (ta voix)</Chip>}
        {it.channel !== 'tiktok' && waWithText && <a href={waWithText} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ flexShrink: 0, minHeight: 34, padding: '0 11px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 650, textDecoration: 'none', color: '#25D366', border: '1px solid rgba(37,211,102,0.45)' }}>↗ Ouvrir WhatsApp</a>}
        {draft && it.kind !== 'ttc' && <Chip onClick={() => void copy()}>📋 Copier</Chip>}
        <Chip active={open === 'snooze'} onClick={() => setOpen(o => o === 'snooze' ? '' : 'snooze')}>⏰ Plus tard</Chip>
        <Chip active={open === 'note'} onClick={() => setOpen(o => o === 'note' ? '' : 'note')}>📝 Note</Chip>
        {has('conclu') && <Chip color={T.ok} disabled={!!busy} onClick={() => void act('conclu')}>🎉 Conclu</Chip>}
        {has('perdu') && <Chip color={T.bad} active={open === 'lost'} onClick={() => setOpen(o => o === 'lost' ? '' : 'lost')}>✕ Perdu</Chip>}
        {has('ignore') && <Chip disabled={!!busy} onClick={() => void act('ignore')}>🗂 Ranger</Chip>}
      </Row>
      {open === 'snooze' && <Row>{([[1, '1 h'], [3, '3 h'], [hoursToEvening(), 'Ce soir'], [hoursToTomorrow(), 'Demain matin']] as Array<[number, string]>).map(([h, l]) => <Chip key={l} color={T.warn} onClick={() => { setOpen(''); void act('snooze', { hours: h }); }}>{l}</Chip>)}</Row>}
      {open === 'lost' && <Row>{LOST.map(r => <Chip key={r} color={T.bad} onClick={() => { setOpen(''); void act('perdu', { reason: r }); }}>{r}</Chip>)}</Row>}
      {open === 'note' && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="ex. veut une automatique, rappelle après 18h" style={{ ...inputStyle, flex: 1, minHeight: 40 }} />
        <Btn variant="primary" onClick={() => { setOpen(''); void act('note', { text: note }); }}>OK</Btn>
      </div>}
    </div>
  );
}

function guess(raw: string): string[] {
  const d = raw.replace(/\D/g, '');
  return /^0[67]\d{8}$/.test(d) ? [`+33${d.slice(1)}`, `+213${d.slice(1)}`] : [];
}
const hoursToEvening = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return Math.max(1, (h < 18.5 ? 18.5 : 24 + 18.5) - h); };
const hoursToTomorrow = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return Math.max(1, 24 + 8 - h); };

/** Carte « À traiter » de la page Aujourd'hui. */
export function InboxCard({ tick }: { tick: number }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [all, setAll] = useState(false);
  const [focus, setFocus] = useState(() => localStorage.getItem('dz:inbox:focus') === '1');
  const [filter, setFilter] = useState<'' | 'whatsapp' | 'tiktok' | 'site'>('');
  const [toast, setToast] = useState('');
  const lastCount = useRef(-1);

  const load = useCallback(() => {
    apiFetch<{ items: Item[]; stats: Stats }>('/api/inbox').then(r => {
      if (lastCount.current >= 0 && r.items.length > lastCount.current) vibrate([40, 60, 40]);   // nouveau message arrivé pendant que la page est ouverte
      lastCount.current = r.items.length;
      setItems(r.items); setStats(r.stats);
    }).catch(() => setItems(x => x ?? []));
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  // La page reste ouverte → remise à jour toute seule chaque minute
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000); return () => clearInterval(t); }, [load]);

  const onToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);
  const onGone = useCallback((id: string) => { setItems(x => (x ?? []).filter(i => i.id !== id)); lastCount.current = Math.max(0, lastCount.current - 1); setTimeout(load, 1500); }, [load]);

  if (items === null) return null;   // pas Kouider (403) ou en chargement : rien
  const shown = items.filter(i => !filter || i.channel === filter);
  const count = (c: Item['channel']) => items.filter(i => i.channel === c).length;
  const avg = stats && stats.waitN ? Math.round(stats.waitMin / stats.waitN) : null;

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionTitle right={<Badge color={items.length ? T.accent2 : T.ok}>{items.length ? `${items.length} à traiter` : 'Tout est fait'}</Badge>}><Ico e="📥" />À traiter</SectionTitle>

      {/* Compteurs du jour */}
      {stats && (stats.sent > 0 || items.length > 0) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: T.muted, margin: '-4px 2px 8px' }}>
        {stats.sent > 0 && <span>✅ {stats.sent} réponse{stats.sent > 1 ? 's' : ''} envoyée{stats.sent > 1 ? 's' : ''} aujourd'hui</span>}
        {avg != null && <span>· ⏱ {avg < 60 ? `${avg} min` : `${Math.round(avg / 60)} h`} en moyenne</span>}
        {stats.accepted > 0 && <span>· {stats.accepted} acceptée{stats.accepted > 1 ? 's' : ''}</span>}
        {stats.snoozed > 0 && <span>· ⏰ {stats.snoozed} pour plus tard</span>}
        {stats.oldestH >= 2 && <span style={{ color: T.warn }}>· le plus ancien attend depuis {stats.oldestH} h</span>}
      </div>}

      {items.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 18, border: `1px dashed ${T.lineStrong}`, color: T.muted, fontSize: 14 }}>
          <span style={{ fontSize: 22 }}>✨</span> Aucun client n'attend de réponse. Les nouveaux messages WhatsApp et TikTok arrivent ici tout seuls.
        </div>
      ) : (
        <>
          <Row>
            <Chip active={!filter} onClick={() => setFilter('')}>Tout {items.length}</Chip>
            {count('whatsapp') > 0 && <Chip color="#25D366" active={filter === 'whatsapp'} onClick={() => setFilter('whatsapp')}>💬 {count('whatsapp')}</Chip>}
            {count('tiktok') > 0 && <Chip color="#ff2e63" active={filter === 'tiktok'} onClick={() => setFilter('tiktok')}>🎵 {count('tiktok')}</Chip>}
            {count('site') > 0 && <Chip active={filter === 'site'} onClick={() => setFilter('site')}>🌐 {count('site')}</Chip>}
            <Chip color={T.violet} active={focus} onClick={() => { const v = !focus; setFocus(v); localStorage.setItem('dz:inbox:focus', v ? '1' : '0'); }}>🎯 Un par un</Chip>
          </Row>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {(focus ? shown.slice(0, 1) : all ? shown : shown.slice(0, 4)).map(it => <Card key={it.id} it={it} onGone={onGone} onToast={onToast} />)}
          </div>
          {focus && shown.length > 1 && <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8, textAlign: 'center' }}>Puis {shown.length - 1} autre{shown.length > 2 ? 's' : ''} : la suivante s'affiche dès que tu as traité celle-ci.</div>}
          {!focus && shown.length > 4 && <button onClick={() => setAll(x => !x)} style={{ marginTop: 8, width: '100%', minHeight: 40, borderRadius: 12, border: `1px solid ${T.line}`, background: 'transparent', color: T.text, fontFamily: T.font, fontSize: 13.5, fontWeight: 650, cursor: 'pointer' }}>{all ? 'Réduire' : `Voir les ${shown.length - 4} autres`}</button>}
        </>
      )}
      {stats && stats.lostTop.length > 0 && <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>Clients perdus, pourquoi : {stats.lostTop.map(l => `${l.reason} (${l.n})`).join(' · ')}</div>}
      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 96, zIndex: 50, padding: '12px 14px', borderRadius: 14, background: T.ink, color: T.onInk, fontSize: 14, fontWeight: 600, textAlign: 'center', boxShadow: T.shadow }}>{toast}</div>}
    </div>
  );
}
