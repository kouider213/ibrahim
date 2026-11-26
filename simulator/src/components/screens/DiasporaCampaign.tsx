// 16/11 : campagne diaspora. Les clients de Kouider vivent en Europe, les voitures sont à Oran : ils louent quand ils
// DESCENDENT (fêtes, Aïd, printemps, été). Donc on prépare chaque vague à l'avance, sur 3 canaux :
//  1. anciens clients → message WhatsApp perso (1 appui chacun, Kouider envoie lui-même) avec remise « réserve tôt » ;
//  2. leur famille / amis qui descendent aussi → code parrain dans le même message (nouveaux clients par le bouche-à-oreille) ;
//  3. nouveaux clients → bandeau en haut de fikconciergerie.com + légende TikTok prête (pubs = TikTok seulement).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api.ts';
import { T, tone, glass, Sheet, SectionTitle, Badge, Chips, inputStyle, btnStyle } from '../ui/Kit.tsx';
import { Icon } from '../ui/Icon.tsx';

type Car = { id: string; name: string; price: number | null; img: string | null };
type Wave = { id: string; name: string; short: string; from: string; to: string; note: string; days: number; deadline: string | null; cars: number; booked: number; lastYear: number; free: Car[] };
type Client = { name: string; phone: string; lang: string; trips: number; last: string; months: number[]; country: string; code: string | null };
type Data = { waves: Wave[]; clients: Client[]; unreachable: number; announcement: string };

const d = (x: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(x + 'T12:00:00').toLocaleDateString('fr-FR', o);
const first = (n: string) => (n.trim().split(/\s+/)[0] ?? '').replace(/^./, c => c.toUpperCase());
const SENT_K = (w: string) => `dz:camp:${w}`;
const readSent = (w: string): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SENT_K(w)) ?? '{}') as Record<string, number>; } catch { return {}; } };

function clientMsg(c: Client, w: Wave, pct: number, code: string | null): string {
  const remise = pct > 0 && w.deadline ? ` −${pct} % si tu réserves avant le ${d(w.deadline, { day: 'numeric', month: 'long' })}.` : '';
  if (c.lang === 'ar') {
    return `السلام عليكم ${first(c.name)} 👋 معاك قويدر من FIK Conciergerie. راك هابط لوهران في ${w.name} (${d(w.from)} – ${d(w.to)}) ؟ احجز طوموبيلك من دابا${pct > 0 && w.deadline ? ` : −${pct} % إلا حجزت قبل ${d(w.deadline)}` : ''}${w.free.length <= 5 ? `، بقاولنا ${w.free.length} طوموبيلات برك.` : '، الطوموبيلات يروحو بالخف فهاد الوقت.'}${code ? `\nعايلتك ولا صحابك هابطين تاني ؟ يعطونا الكود ${code} وتولي عندك الأولوية في الحجز في الصيف والعيد.` : ''}\nfikconciergerie.com`;
  }
  return `Salam ${first(c.name)} 👋 C'est Kouider, de FIK Conciergerie. Tu descends à Oran pour ${w.short} (${d(w.from)} – ${d(w.to)}) ? Réserve ta voiture dès maintenant :${remise || ''} ${w.free.length <= 5 ? `Il ne nous reste que ${w.free.length} voiture${w.free.length > 1 ? 's' : ''} libre${w.free.length > 1 ? 's' : ''} sur cette période` : 'Les voitures partent vite à cette période'}, tout est prêt à ton arrivée.${code ? `\n\nTa famille ou tes amis descendent aussi ? Qu'ils nous donnent ton code ${code} : tu auras la priorité pour réserver l'été, à l'Aïd et pendant les vacances.` : ''}\n\nRéserve sur fikconciergerie.com ou réponds-moi ici.`;
}
const siteText = (w: Wave, pct: number) => `${w.name} à Oran (${d(w.from)} – ${d(w.to)}) : ${pct > 0 && w.deadline ? `réservez votre voiture avant le ${d(w.deadline, { day: 'numeric', month: 'long' })} et profitez de −${pct} %` : 'réservez votre voiture dès maintenant'}. Places limitées.`;
const tiktokText = (w: Wave, pct: number) => `Tu descends à Oran pour ${w.short} ? 🇩🇿✈️\nTa voiture t'attend : ${w.free.slice(0, 4).map(c => c.name).join(', ')}${w.free.length > 4 ? '…' : ''}\n${pct > 0 && w.deadline ? `Réserve avant le ${d(w.deadline)} = −${pct} %` : 'Réserve tôt, les places partent vite'} 👉 lien en bio (fikconciergerie.com)\n\n#oran #wahran #diaspora #algerie #dz #locationvoiture #vacances #bladi`;

export default function DiasporaCampaign() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<Wave | null>(null);
  useEffect(() => { apiFetch<Data>('/api/insights/waves').then(setData).catch(() => {}); }, []);
  if (!data || !data.waves.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <SectionTitle right={<Badge color="#f59e0b">clients en Europe</Badge>}>Prochains voyages de la diaspora</SectionTitle>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45, margin: '-4px 2px 10px' }}>Tes clients louent quand ils descendent à Oran. Prépare chaque période 1 à 2 mois avant : c'est là qu'ils prennent leurs billets.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {data.waves.map((w, i) => {
          const pct = w.cars ? Math.round(w.booked / w.cars * 100) : 0;
          const soon = i === 0;
          return (
            <button key={w.id} onClick={() => setOpen(w)} className="dz-press" style={{ ...glass(soon ? '#f59e0b' : undefined), borderRadius: 18, padding: '13px 14px', textAlign: 'left', color: T.text, fontFamily: T.font, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.015em' }}>{w.name}</div>
                  <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>{d(w.from)} → {d(w.to)} · {w.days > 0 ? `dans ${w.days} j` : 'en cours'}</div>
                </div>
                <Badge color={w.free.length ? '#f59e0b' : T.ok}>{w.free.length ? `${w.free.length} libres` : 'complet'}</Badge>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(var(--dz-ink-rgb),0.06)', marginTop: 10, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, pct)}%`, height: '100%', borderRadius: 3, background: T.ok }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: T.faint, marginTop: 5 }}>
                <span>{w.booked} / {w.cars} réservées</span>
                <span>{w.lastYear ? `l'an dernier : ${w.lastYear} location${w.lastYear > 1 ? 's' : ''}` : w.note}</span>
              </div>
              {soon && <div style={{ ...btnStyle('primary', '#f59e0b'), marginTop: 11, width: '100%', boxSizing: 'border-box', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="send" size={15} />Préparer la campagne</div>}
            </button>
          );
        })}
      </div>
      {open && <Campaign w={open} data={data} onClose={() => setOpen(null)} onAnn={a => setData(x => x ? { ...x, announcement: a } : x)} />}
    </div>
  );
}

function Campaign({ w, data, onClose, onAnn }: { w: Wave; data: Data; onClose: () => void; onAnn: (a: string) => void }) {
  const [pct, setPct] = useState<'0' | '5' | '10' | '15'>('10');
  const [withCode, setWithCode] = useState(true);
  const [sent, setSent] = useState<Record<string, number>>(() => readSent(w.id));
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(data.clients.filter(c => c.code).map(c => [c.phone, c.code!])));
  const [busy, setBusy] = useState('');
  const [ann, setAnn] = useState(siteText(w, 10));
  const [msg, setMsg] = useState('');
  const P = Number(pct);
  useEffect(() => { setAnn(siteText(w, P)); }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2600); };

  const send = async (c: Client) => {
    setBusy(c.phone);
    let code = codes[c.phone] ?? null;
    try {
      if (withCode && !code) {
        const r = await apiFetch<{ referral: { code: string } }>('/api/referrals', { method: 'POST', body: JSON.stringify({ referrer_name: c.name, referrer_phone: '+' + c.phone, reward: 'Priorité haute saison pour le parrain', note: `campagne ${w.name}` }) });
        code = r.referral.code; setCodes(x => ({ ...x, [c.phone]: code! }));
      }
    } catch { /* sans code : le message part quand même */ }
    const text = clientMsg(c, w, P, withCode ? code : null);
    const next = { ...sent, [c.phone]: Date.now() };
    setSent(next); try { localStorage.setItem(SENT_K(w.id), JSON.stringify(next)); } catch { /* */ }
    setBusy('');
    window.open(`https://wa.me/${c.phone}?text=${encodeURIComponent(text)}`, '_blank');
  };
  const putBanner = async (text: string) => {
    setBusy('site');
    try { await apiFetch('/api/insights/waves/announce', { method: 'POST', body: JSON.stringify({ text }) }); onAnn(text); flash(text ? 'Bandeau en ligne sur le site' : 'Bandeau retiré'); }
    catch { flash('Le site ne répond pas, réessaie'); } finally { setBusy(''); }
  };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); flash('Copié'); } catch { flash('Copie impossible'); } };
  const done = data.clients.filter(c => sent[c.phone]).length;

  return (
    <Sheet title={w.name} subtitle={`${d(w.from, { day: 'numeric', month: 'long' })} → ${d(w.to, { day: 'numeric', month: 'long' })} · ${w.free.length} voiture${w.free.length > 1 ? 's' : ''} libre${w.free.length > 1 ? 's' : ''}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, color: T.text, fontFamily: T.font }}>
        <Step n={1} title="Ton offre « réserve tôt »" sub={w.deadline ? `Valable jusqu'au ${d(w.deadline, { day: 'numeric', month: 'long' })}, 3 semaines avant le départ` : 'La période approche : pas de date limite'}>
          <Chips<'0' | '5' | '10' | '15'> value={pct} onChange={setPct} items={[{ id: '0', label: 'Sans remise' }, { id: '5', label: '−5 %' }, { id: '10', label: '−10 %' }, { id: '15', label: '−15 %' }]} />
          {w.free.length > 0 && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 9, lineHeight: 1.45 }}>Libres : {w.free.map(c => c.name).join(', ')}</div>}
        </Step>

        <Step n={2} title={`Tes anciens clients (${data.clients.length})`} sub="Un message perso sur WhatsApp, tu l'envoies toi-même. Ceux qui ont déjà réservé cette période ne sont pas dans la liste.">
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={withCode} onChange={e => setWithCode(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#f59e0b' }} />
            <span>Ajouter un <b>code parrain</b> : si sa famille ou ses amis louent avec, il a la priorité en haute saison (pas de remise)</span>
          </label>
          {data.clients.length === 0 && <div style={{ fontSize: 13, color: T.muted }}>Aucun ancien client avec un numéro WhatsApp valide.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.clients.map(c => (
              <div key={c.phone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 14, background: sent[c.phone] ? tone(T.ok, 0.08) : 'var(--dz-card)', border: `1px solid ${sent[c.phone] ? tone(T.ok, 0.3) : 'var(--dz-card-line)'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: T.muted }}>{[c.country, `${c.trips} location${c.trips > 1 ? 's' : ''}`, `dernière ${d(c.last, { month: 'short', year: 'numeric' })}`, codes[c.phone] ? `code ${codes[c.phone]}` : ''].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => void send(c)} disabled={!!busy} style={{ ...btnStyle(sent[c.phone] ? 'soft' : 'primary', '#25d366'), padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Icon name={sent[c.phone] ? 'check' : 'whatsapp'} size={15} />{busy === c.phone ? '…' : sent[c.phone] ? 'Envoyé' : 'Envoyer'}
                </button>
              </div>
            ))}
          </div>
          {data.unreachable > 0 && <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>{data.unreachable} location{data.unreachable > 1 ? 's' : ''} sans numéro valide (indicatif manquant ou numéro faux), à corriger dans Clients.</div>}
          {data.clients.length > 0 && <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{done} / {data.clients.length} prévenus</div>}
        </Step>

        <Step n={3} title="Nouveaux clients : le site" sub="Un bandeau en haut de fikconciergerie.com, visible par tous les visiteurs.">
          <textarea value={ann} onChange={e => setAnn(e.target.value)} rows={3} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 14, lineHeight: 1.4 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => void putBanner(ann.trim())} disabled={!!busy || !ann.trim()} style={{ ...btnStyle('primary', '#f59e0b'), flex: 1 }}>{busy === 'site' ? '…' : data.announcement === ann.trim() ? 'En ligne ✓' : 'Mettre en ligne'}</button>
            {data.announcement && <button onClick={() => void putBanner('')} disabled={!!busy} style={{ ...btnStyle('soft', T.muted) }}>Retirer</button>}
          </div>
          {data.announcement && data.announcement !== ann.trim() && <div style={{ fontSize: 12, color: T.faint, marginTop: 7 }}>Actuellement sur le site : « {data.announcement} »</div>}
        </Step>

        <Step n={4} title="Nouveaux clients : TikTok" sub="Filme les voitures libres (extérieur + intérieur, 10 à 15 s) et colle cette légende.">
          <div style={{ fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.45, padding: '10px 12px', borderRadius: 12, background: 'var(--dz-card)', border: '1px solid var(--dz-card-line)' }}>{tiktokText(w, P)}</div>
          <button onClick={() => void copy(tiktokText(w, P))} style={{ ...btnStyle('soft', T.accent), marginTop: 8, width: '100%' }}>Copier la légende</button>
        </Step>
        {msg && <div style={{ position: 'sticky', bottom: 8, alignSelf: 'center', padding: '8px 14px', borderRadius: 12, background: T.text, color: 'var(--dz-bg)', fontSize: 13.5, fontWeight: 600 }}>{msg}</div>}
      </div>
    </Sheet>
  );
}

function Step({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ ...glass(), borderRadius: 18, padding: '14px 15px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: 12, background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.4, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}
