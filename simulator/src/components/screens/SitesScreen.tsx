import { useState, useEffect, useCallback } from 'react';
import { business, type ClientSiteRow, type SitesOverview, type SiteMessage, type SiteTarifs, type SitePack } from '../../services/api.ts';
import { Hero, StatCard, SkeletonCards, SearchPill } from '../ui/Premium.tsx';

// Sites clients (FIK Sites) : démos depuis Google Maps → vrais sites, espace client du patron, abonnements payés à la
// main, noms de domaine, réservations/messages reçus par les sites. Mêmes actions que l'outil vocal manage_client_site.

const C = {
  bg: '#050a16', surface: '#0c1730', border: 'rgba(90,150,255,0.16)',
  accent: '#38d8f5', gold: '#fbbf24', blue: '#60a5fa', red: '#f87171', text: '#f5f5f7', muted: '#8ea3c8',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const btn = (bg: string, color: string) => ({ background: bg, color, border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.font } as const);
const input = { width: '100%', boxSizing: 'border-box', background: '#081024', color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 10px', fontSize: 13, fontFamily: C.font } as const;
const KIND: Record<string, string> = {
  restaurant: '🍽️ Restaurant', cafe: '☕ Café', bar: '🍸 Bar', coiffure: '💇 Coiffure', beaute: '💅 Beauté', garage: '🔧 Garage',
  vente_auto: '🚗 Vente auto', boutique: '🛍️ Boutique', librairie: '📚 Librairie', tabac: '🚬 Tabac', hotel: '🏨 Hôtel', sante: '🩺 Santé', autre: '🏪 Commerce',
};
const MSG_KIND = { table: '🍽️ Réservation', rdv: '📅 Rendez-vous', contact: '✉️ Message' } as const;

const money = (n: number, cur: string) => `${n.toLocaleString('fr-FR')} ${cur}`;
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtAt = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Algiers', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const packPrice = (p: SitePack) => p.once != null
  ? `${money(p.once, p.currency)} une fois + ${money(p.renewal ?? 0, p.currency)}/an`
  : `${money(p.monthly ?? 0, p.currency)}/mois · ${money(p.yearly ?? 0, p.currency)}/an`;
const PERIOD = { mois: 'au mois', an: 'à l\'année', unique: 'achat unique' } as const;
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : 'Erreur';
  try { return (JSON.parse(m.replace(/^API \d+: /, '')) as { error?: string }).error ?? m; } catch { return m; }
};

export default function SitesScreen() {
  const [data, setData] = useState<SitesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [link, setLink] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try { setData(await business.sitesOverview()); } catch { /* garde l'ancien affichage */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 5000); };
  const run = async (fn: () => Promise<{ message: string } | unknown>, ok?: string) => {
    try {
      const r = await fn() as { message?: string };
      say(ok ?? r?.message ?? 'OK');
      await load();
      return true;
    } catch (e) { say(`❌ ${errText(e)}`); return false; }
  };

  const st = data?.stats;
  const mrr = st ? Object.entries(st.mrr).map(([c, n]) => money(n, c)).join(' + ') : '';
  const demos = (data?.demos ?? []).filter(d => !d.converted);
  const ql = q.trim().toLowerCase();
  const sites = (data?.sites ?? []).filter(s => !ql || `${s.name} ${s.domain?.name ?? ''} ${s.account ?? ''}`.toLowerCase().includes(ql));

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 40px' }}>
      <div style={{ margin: '-20px -16px 0' }}>
        <Hero eyebrow="Dzaryx · FIK Sites" title="Sites clients" subtitle="Démos, vrais sites, abonnements, domaines et réservations" accent="#60a5fa" />
      </div>

      {loading ? <SkeletonCards count={5} /> : !data ? (
        <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 13 }}>Impossible de charger les sites. <button onClick={() => { setLoading(true); void load(); }} style={btn('rgba(255,255,255,0.08)', C.text)}>Réessayer</button></div>
      ) : (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 8 }}>
          <StatCard icon="🌐" value={String(st?.live ?? 0)} label="EN LIGNE" />
          <StatCard icon="⏸️" value={String(st?.paused ?? 0)} label="EN PAUSE" color={C.muted} />
          <StatCard icon="⏰" value={String(st?.late ?? 0)} label="RETARDS" color={C.red} />
          <StatCard icon="📨" value={String(st?.unread ?? 0)} label="MESSAGES" color={C.gold} />
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 16, textAlign: 'center' }}>💰 Revenus mensuels : <b style={{ color: C.accent }}>{mrr || '—'}</b></div>

        {data.tarifs && <TarifsSection t={data.tarifs} onEdit={changes => run(() => business.sitesTarifs(changes), '✅ Tarifs mis à jour')} />}

        {/* Nouvelle démo */}
        <Section title="➕ Nouvelle démo de site" hint="Colle le lien Google Maps du commerce (bouton « Partager »), ou son nom + sa ville. Le lien arrive sur Telegram en 1 à 2 minutes.">
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12 }}>
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…  ou  Garage Atlas Oran" style={input} />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Précisions (facultatif) : couleurs, ce qu'il faut mettre en avant…" style={{ ...input, marginTop: 7 }} />
            <button disabled={!link.trim()} onClick={() => run(() => business.sitesDemo(link.trim(), notes.trim())).then(ok => { if (ok) { setLink(''); setNotes(''); } })}
              style={{ ...btn(C.blue, '#04152b'), marginTop: 9, width: '100%', opacity: link.trim() ? 1 : 0.5 }}>🚀 Créer la démo</button>
          </div>
        </Section>

        {/* Démos pas encore transformées */}
        {demos.length > 0 && (
          <Section title={`🧪 Démos (${demos.length})`} hint="Le client a payé ? « Faire le vrai site » : choisis sa formule, Dzaryx fait tout, il ne restera que le nom de domaine.">
            {demos.slice(0, 20).map(d => <DemoCard key={d.slug} d={d} tarifs={data.tarifs} onCreate={(info, email, extra) => run(() => business.sitesCreate(d.name, info, email, extra))} />)}
          </Section>
        )}

        {/* Vrais sites */}
        <Section title={`🌐 Sites clients (${data.sites.length})`}>
          {data.sites.length > 3 && <div style={{ marginBottom: 9 }}><SearchPill value={q} onChange={setQ} placeholder="Chercher un site, un domaine, un e-mail…" /></div>}
          {sites.length === 0
            ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun vrai site pour l'instant. Fais une démo, puis « Faire le vrai site ».</div>
            : sites.map(s => <SiteCard key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
                act={(action, params, ok) => run(() => business.siteAction(s.id, action, params), ok)}
                onRead={() => run(() => business.siteMessagesRead(s.id), 'Messages marqués comme lus')} />)}
        </Section>
      </>)}

      {toast && <div style={{ position: 'fixed', left: 16, right: 16, bottom: 90, background: '#142342', border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 14px', fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', zIndex: 50, maxHeight: '45vh', overflowY: 'auto' }} onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em', marginBottom: hint ? 3 : 9 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 9, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, letterSpacing: '0.04em', marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

type CreateExtra = { pack?: string; period?: string; paid_amount?: number; country?: string };
function DemoCard({ d, tarifs, onCreate }: { d: SitesOverview['demos'][number]; tarifs?: SiteTarifs; onCreate: (info: string, email: string, extra: CreateExtra) => Promise<boolean> }) {
  const [form, setForm] = useState(false);
  const [info, setInfo] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<'DZ' | 'FR'>('DZ');
  const [pack, setPack] = useState('');
  const [period, setPeriod] = useState<'mois' | 'an'>('mois');
  const [paid, setPaid] = useState('');
  const chosen = tarifs?.packs.find(p => p.id === pack);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12, marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
          <div style={{ fontSize: 11, color: C.muted }}>démo du {fmtDay(d.createdAt.slice(0, 10))}</div>
        </div>
        <button onClick={() => window.open(d.url, '_blank')} style={btn('rgba(255,255,255,0.07)', C.text)}>Voir</button>
        <button onClick={() => setForm(!form)} style={btn('rgba(56,216,245,0.18)', C.accent)}>{form ? 'Fermer' : 'Faire le vrai site'}</button>
      </div>
      {form && (
        <div style={{ marginTop: 10 }}>
          <textarea value={info} onChange={e => setInfo(e.target.value)} rows={6} placeholder="Les vraies infos, même en vrac : vrai menu et prix, vraies prestations, autre téléphone, horaires… (vide = garder la démo telle quelle)" style={{ ...input, resize: 'vertical', lineHeight: 1.45 }} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="E-mail du patron (vide = celui du démarchage)" style={{ ...input, marginTop: 7 }} />
          {tarifs && (<div style={{ marginTop: 9 }}>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>Formule choisie par le client</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>{(['DZ', 'FR'] as const).map(c => <button key={c} onClick={() => { setCountry(c); setPack(''); }} style={btn(country === c ? C.blue : 'rgba(255,255,255,0.06)', country === c ? '#04152b' : C.text)}>{c === 'DZ' ? '🇩🇿 Algérie' : '🇫🇷 France'}</button>)}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{tarifs.packs.filter(p => p.country === country).map(p => <button key={p.id} onClick={() => setPack(pack === p.id ? '' : p.id)} style={btn(pack === p.id ? C.accent : 'rgba(255,255,255,0.06)', pack === p.id ? '#06210f' : C.text)}>{p.name}</button>)}</div>
            {chosen && <div style={{ fontSize: 11.5, color: C.accent, marginTop: 5 }}>{packPrice(chosen)}</div>}
            {chosen && chosen.once == null && <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>{(['mois', 'an'] as const).map(x => <button key={x} onClick={() => setPeriod(x)} style={btn(period === x ? C.blue : 'rgba(255,255,255,0.06)', period === x ? '#04152b' : C.text)}>{x === 'mois' ? 'Payé au mois' : 'Payé à l\'année'}</button>)}</div>}
            {chosen && <input value={paid} onChange={e => setPaid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder={`Montant déjà reçu (vide = pas encore payé, 0 = prix normal) en ${chosen.currency}`} style={{ ...input, marginTop: 6 }} />}
          </div>)}
          <button onClick={() => { void onCreate(info.trim(), email.trim(), chosen ? { pack: chosen.id, country, period: chosen.once != null ? 'unique' : period, ...(paid !== '' ? { paid_amount: Number(paid) } : {}) } : {}).then(ok => { if (ok) setForm(false); }); }} style={{ ...btn(C.accent, '#06210f'), marginTop: 8, width: '100%' }}>✅ Créer le vrai site</button>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Prêt en 1 à 2 min : site, abonnement, paiement et espace client. Dzaryx te prévient sur Telegram ; il ne restera que le nom de domaine.</div>
        </div>
      )}
    </div>
  );
}

type Act = (action: string, params?: Record<string, unknown>, ok?: string) => Promise<boolean>;

function SiteCard({ s, open, onToggle, act, onRead }: { s: ClientSiteRow; open: boolean; onToggle: () => void; act: Act; onRead: () => void }) {
  const b = s.billing;
  const late = b && b.late > 0;
  return (
    <div style={{ background: C.surface, border: `1px solid ${late ? 'rgba(248,113,113,0.4)' : C.border}`, borderRadius: 13, marginBottom: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'transparent', border: 'none', color: C.text, textAlign: 'left', cursor: 'pointer', fontFamily: C.font }}>
        {s.photo ? <img src={s.photo} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} />
          : <div style={{ width: 44, height: 44, borderRadius: 10, background: '#22222b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🌐</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
          <div style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {KIND[s.kind] ?? s.kind}{s.pack ? ` · ${s.pack.name}` : ''}{b ? ` · ${money(b.monthly, b.currency)}/mois` : ' · abonnement à régler'}{s.clientFor ? ` · client depuis ${s.clientFor}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Badge color={s.status === 'live' ? C.accent : C.muted}>{s.status === 'live' ? 'En ligne' : s.pausedReason === 'billing' ? 'Pause impayé' : 'En pause'}</Badge>
          {late ? <Badge color={C.red}>{b!.late} j de retard</Badge> : s.unread ? <Badge color={C.gold}>📨 {s.unread}</Badge> : null}
        </div>
      </button>
      {open && <SiteDetail s={s} act={act} onRead={onRead} />}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 13.5, fontWeight: 700, color, border: `1px solid ${color}55`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
}

function TarifsSection({ t, onEdit }: { t: SiteTarifs; onEdit: (changes: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<'DZ' | 'FR'>('DZ');
  const [changes, setChanges] = useState('');
  return (
    <Section title="💶 Mes tarifs FIK Sites" hint={`Ce que tu proposes aux clients. Grille du ${fmtDay(t.updatedAt)}.`}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 13, padding: 12 }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {(['DZ', 'FR'] as const).map(c => <button key={c} onClick={() => setCountry(c)} style={btn(country === c ? C.blue : 'rgba(255,255,255,0.06)', country === c ? '#04152b' : C.text)}>{c === 'DZ' ? '🇩🇿 Algérie' : '🇫🇷 France'}</button>)}
          <span style={{ flex: 1 }} />
          <button onClick={() => setOpen(!open)} style={btn('rgba(255,255,255,0.07)', C.text)}>{open ? 'Réduire' : 'Détails'}</button>
        </div>
        {t.packs.filter(p => p.country === country).map(p => (
          <div key={p.id} style={{ borderTop: `1px solid ${C.border}`, marginTop: 9, paddingTop: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b style={{ fontSize: 13.5 }}>{p.name}</b>
              <span style={{ fontSize: 12.5, color: C.accent, fontWeight: 700, textAlign: 'right' }}>{packPrice(p)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted }}>{p.for}</div>
            {open && p.includes.map((x, i) => <div key={i} style={{ fontSize: 12, marginTop: 2 }}>✓ {x}</div>)}
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 9, paddingTop: 9, fontSize: 12 }}>
          {t.options.filter(o => o.country === country).map(o => <div key={o.id}>➕ <b>{o.name}</b>{o.monthly ? ` +${money(o.monthly, o.currency)}/mois` : ''}{o.once ? ` ${money(o.once, o.currency)}` : ''} <span style={{ color: C.muted }}>— {o.note}</span></div>)}
          <div style={{ color: C.gold, marginTop: 6 }}>🎁 {t.offers[country]}</div>
        </div>
        {open && (<div style={{ marginTop: 10 }}>
          <input value={changes} onChange={e => setChanges(e.target.value)} placeholder="Changer un prix : « passe le Pro France à 45 € »" style={input} />
          <button disabled={!changes.trim()} onClick={() => { void onEdit(changes.trim()).then(ok => { if (ok) setChanges(''); }); }} style={{ ...btn(C.blue, '#04152b'), marginTop: 7, width: '100%', opacity: changes.trim() ? 1 : 0.5 }}>Mettre à jour les tarifs</button>
        </div>)}
      </div>
    </Section>
  );
}

function ClientFile({ s, act }: { s: ClientSiteRow; act: Act }) {
  const c = s.contact;
  const cur = s.billing?.currency ?? '';
  return (
    <Block title="👤 FICHE CLIENT">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12.5 }}>
        {c?.name && <><span style={{ color: C.muted }}>Contact</span><span>{c.name}</span></>}
        {c?.phone && <><span style={{ color: C.muted }}>Téléphone</span><a href={`tel:${c.phone.replace(/\s/g, '')}`} style={{ color: C.blue }}>{c.phone}</a></>}
        {(c?.email || s.account) && <><span style={{ color: C.muted }}>E-mail</span><a href={`mailto:${c?.email ?? s.account}`} style={{ color: C.blue, wordBreak: 'break-all' }}>{c?.email ?? s.account}</a></>}
        {s.address && <><span style={{ color: C.muted }}>Adresse</span><span>{s.address}</span></>}
        {s.clientSince && <><span style={{ color: C.muted }}>Client depuis</span><span><b>{s.clientFor}</b> (le {fmtDay(s.clientSince)})</span></>}
        <span style={{ color: C.muted }}>Formule</span><span>{s.pack ? `${s.pack.name} · ${PERIOD[s.pack.period]}` : 'pas encore choisie'}</span>
        <span style={{ color: C.muted }}>Il paie</span><span>{s.billing ? (s.pack?.period === 'unique' ? `${money(s.billing.monthly * 12, cur)}/an (hébergement)` : `${money(s.billing.monthly, cur)}/mois`) : '—'}</span>
        <span style={{ color: C.muted }}>Total payé</span><span style={{ color: C.accent, fontWeight: 700 }}>{money(s.totalPaid ?? 0, cur)}</span>
        <span style={{ color: C.muted }}>Services</span><span>{s.services?.length ? s.services.join(' · ') : '—'}</span>
      </div>
      <PackChanger s={s} act={act} />
    </Block>
  );
}

function PackChanger({ s, act }: { s: ClientSiteRow; act: Act }) {
  const [open, setOpen] = useState(false);
  const [pack, setPack] = useState(s.pack?.name.toLowerCase() ?? '');
  const [period, setPeriod] = useState<'mois' | 'an'>(s.pack?.period === 'an' ? 'an' : 'mois');
  if (!open) return <button onClick={() => setOpen(true)} style={{ ...btn('rgba(255,255,255,0.07)', C.text), marginTop: 8 }}>{s.pack ? 'Changer de formule' : 'Choisir sa formule'}</button>;
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      {['vitrine', 'pro', 'unique'].map(p => <button key={p} onClick={() => setPack(p)} style={btn(pack === p ? C.accent : 'rgba(255,255,255,0.06)', pack === p ? '#06210f' : C.text)}>{p === 'unique' ? 'Achat unique' : p[0]!.toUpperCase() + p.slice(1)}</button>)}
      {pack !== 'unique' && (['mois', 'an'] as const).map(x => <button key={x} onClick={() => setPeriod(x)} style={btn(period === x ? C.blue : 'rgba(255,255,255,0.06)', period === x ? '#04152b' : C.text)}>{x === 'mois' ? 'Au mois' : 'À l\'année'}</button>)}
      <button disabled={!pack} onClick={() => { void act('pack', { pack, period: pack === 'unique' ? 'unique' : period }).then(ok => { if (ok) setOpen(false); }); }} style={btn(C.accent, '#06210f')}>Valider</button>
    </div>
  );
}

function SiteDetail({ s, act, onRead }: { s: ClientSiteRow; act: Act; onRead: () => void }) {
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); };
  return (
    <div style={{ padding: '0 12px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => window.open(s.url, '_blank')} style={btn('rgba(96,165,250,0.18)', C.blue)}>🌐 Voir le site</button>
        <button onClick={() => window.open(s.adminUrl, '_blank')} style={btn('rgba(255,255,255,0.07)', C.text)}>🔧 Espace client</button>
        <button onClick={() => copy(s.adminUrl)} style={btn('rgba(255,255,255,0.07)', C.text)}>📋 Lien espace client</button>
        <OpenAsMe s={s} />
      </div>
      <ClientFile s={s} act={act} />
      <BillingBlock s={s} act={act} />
      <MessagesBlock s={s} onRead={onRead} />
      <EditBlock s={s} act={act} />
      <DomainBlock s={s} act={act} />
      <AccountBlock s={s} act={act} />
      {s.invented.length > 0 && (
        <Block title="✏️ ENCORE INVENTÉ (À REMPLACER)">
          {s.invented.map((t, i) => <div key={i} style={{ color: C.gold }}>• {t}</div>)}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Donne les vraies infos dans « Modifier le site ».</div>
        </Block>
      )}
      <Block title="ÉTAT DU SITE">
        <div style={{ color: C.muted, fontSize: 11.5, marginBottom: 7 }}>Créé le {fmtDay(s.createdAt.slice(0, 10))} · modifié le {fmtAt(s.updatedAt)}</div>
        {s.status === 'live'
          ? <ConfirmButton label="⏸️ Mettre en pause" confirm="Oui, mettre en pause" color={C.red} onGo={() => act('pause')} />
          : <button onClick={() => act('resume')} style={btn('rgba(56,216,245,0.18)', C.accent)}>▶️ Remettre en ligne</button>}
      </Block>
    </div>
  );
}

function ConfirmButton({ label, confirm, color, onGo }: { label: string; confirm: string; color: string; onGo: () => void }) {
  const [sure, setSure] = useState(false);
  return sure
    ? <span style={{ display: 'inline-flex', gap: 6 }}><button onClick={() => { setSure(false); onGo(); }} style={btn(color, '#fff')}>{confirm}</button><button onClick={() => setSure(false)} style={btn('rgba(255,255,255,0.07)', C.muted)}>Annuler</button></span>
    : <button onClick={() => setSure(true)} style={btn(`${color}26`, color)}>{label}</button>;
}

function BillingBlock({ s, act }: { s: ClientSiteRow; act: Act }) {
  const b = s.billing;
  const [edit, setEdit] = useState(!b);
  const [monthly, setMonthly] = useState(b ? String(b.monthly) : '');
  const [currency, setCurrency] = useState(b?.currency ?? 'DA');
  const [paidUntil, setPaidUntil] = useState(b?.paidUntil ?? '');
  const [autoPause, setAutoPause] = useState(b?.autoPause ?? false);
  const [grace, setGrace] = useState(String(b?.graceDays ?? 10));
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  return (
    <Block title="💳 ABONNEMENT">
      {b && !edit && (<>
        <div>{money(b.monthly, b.currency)} / mois · payé jusqu'au <b>{fmtDay(b.paidUntil)}</b></div>
        <div style={{ color: b.late > 0 ? C.red : b.late >= -7 ? C.gold : C.accent, fontWeight: 700 }}>
          {b.late > 0 ? `⏰ ${b.late} jour(s) de retard` : b.late === 0 ? 'À payer aujourd\'hui' : b.late >= -7 ? `À payer dans ${-b.late} jour(s)` : '✅ À jour'}
        </div>
        <div style={{ color: C.muted, fontSize: 11.5 }}>Pause automatique : {b.autoPause ? `oui, après ${b.graceDays} jours de retard` : 'non (Dzaryx te prévient seulement)'}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setPayOpen(!payOpen)} style={btn(C.accent, '#06210f')}>💰 Paiement reçu</button>
          <button onClick={() => setEdit(true)} style={btn('rgba(255,255,255,0.07)', C.text)}>Modifier</button>
        </div>
        {payOpen && (
          <div style={{ marginTop: 9, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
              {[1, 3, 6, 12].map(m => <button key={m} onClick={() => setMonths(m)} style={{ ...btn(months === m ? C.accent : 'rgba(255,255,255,0.06)', months === m ? '#06210f' : C.text), flex: 1 }}>{m} mois</button>)}
            </div>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={`Montant reçu (par défaut ${money(b.monthly * months, b.currency)})`} style={input} />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Comment : espèces, BaridiMob, virement…" style={{ ...input, marginTop: 6 }} />
            <button onClick={() => { void act('paid', { months, ...(amount ? { amount: Number(amount) } : {}), note }).then(ok => { if (ok) { setPayOpen(false); setAmount(''); setNote(''); } }); }}
              style={{ ...btn(C.accent, '#06210f'), marginTop: 8, width: '100%' }}>Noter le paiement</button>
          </div>
        )}
        {b.payments.length > 0 && (
          <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer', color: C.muted, fontSize: 11.5 }}>Historique ({b.payments.length})</summary>
            {b.payments.slice(0, 24).map((p, i) => <div key={i} style={{ fontSize: 11.5, color: C.muted }}>{fmtAt(p.at)} · {money(p.amount, b.currency)} · {p.months} mois{p.note ? ` · ${p.note}` : ''}</div>)}
          </details>
        )}
      </>)}
      {edit && (
        <div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={monthly} onChange={e => setMonthly(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Prix par mois" style={{ ...input, flex: 2 }} />
            <input value={currency} onChange={e => setCurrency(e.target.value)} placeholder="DA" style={{ ...input, flex: 1 }} />
          </div>
          <label style={{ display: 'block', fontSize: 11.5, color: C.muted, margin: '7px 0 3px' }}>Payé jusqu'au (vide = aujourd'hui)</label>
          <input type="date" value={paidUntil} onChange={e => setPaidUntil(e.target.value)} style={input} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={autoPause} onChange={e => setAutoPause(e.target.checked)} /> Mettre le site en pause tout seul en cas d'impayé
          </label>
          {autoPause && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5 }}>après <input value={grace} onChange={e => setGrace(e.target.value.replace(/\D/g, ''))} inputMode="numeric" style={{ ...input, width: 60 }} /> jours de retard</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <button disabled={!monthly} onClick={() => { void act('billing', { monthly: Number(monthly), currency: currency.trim() || 'DA', ...(paidUntil ? { paid_until: paidUntil } : {}), auto_pause: autoPause, grace_days: Number(grace) || 10 }).then(ok => { if (ok) setEdit(false); }); }}
              style={{ ...btn(C.accent, '#06210f'), flex: 1, opacity: monthly ? 1 : 0.5 }}>Enregistrer</button>
            {b && <button onClick={() => setEdit(false)} style={btn('rgba(255,255,255,0.07)', C.muted)}>Annuler</button>}
          </div>
        </div>
      )}
    </Block>
  );
}

function MessagesBlock({ s, onRead }: { s: ClientSiteRow; onRead: () => void }) {
  return (
    <Block title={`📨 RÉSERVATIONS ET MESSAGES (${s.messages.length})`}>
      {s.messages.length === 0 ? <div style={{ color: C.muted, fontSize: 12 }}>Aucun message reçu par le formulaire du site.</div> : (<>
        {s.messages.slice(0, 8).map((m: SiteMessage) => (
          <div key={m.id} style={{ background: m.read ? 'rgba(255,255,255,0.03)' : 'rgba(251,191,36,0.08)', border: `1px solid ${m.read ? C.border : 'rgba(251,191,36,0.35)'}`, borderRadius: 10, padding: 9, marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{MSG_KIND[m.mode]} · {m.name}</b><span style={{ color: C.muted, fontSize: 11 }}>{fmtAt(m.at)}</span></div>
            {m.date && <div>📅 {fmtDay(m.date)}{m.time ? ` à ${m.time}` : ''}{m.people ? ` · ${m.people} pers.` : ''}</div>}
            <div>📞 <a href={`tel:${m.phone.replace(/\s/g, '')}`} style={{ color: C.blue }}>{m.phone}</a>{m.email ? <> · ✉️ <a href={`mailto:${m.email}`} style={{ color: C.blue }}>{m.email}</a></> : null}</div>
            {m.message && <div style={{ color: '#d4d4d8', whiteSpace: 'pre-wrap', marginTop: 3 }}>{m.message}</div>}
          </div>
        ))}
        {s.unread > 0 && <button onClick={onRead} style={btn('rgba(255,255,255,0.07)', C.text)}>Tout marquer comme lu ({s.unread})</button>}
      </>)}
      <NotifyForm s={s} />
    </Block>
  );
}

function NotifyForm({ s }: { s: ClientSiteRow }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(s.notify.email ?? '');
  const [copy, setCopy] = useState(s.notify.kouider);
  const [msg, setMsg] = useState('');
  const save = async () => {
    try { setMsg((await business.siteAction(s.id, 'notify', { notify_email: email.trim(), copy_kouider: copy })).message); } catch (e) { setMsg(`❌ ${errText(e)}`); }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>Envoyés par e-mail à {s.notify.email ?? s.account ?? 'personne (ajoute un e-mail)'}{s.notify.kouider ? ' + copie pour toi sur Telegram' : ''}. <button onClick={() => setOpen(!open)} style={{ ...btn('transparent', C.blue), padding: 0, fontSize: 11.5 }}>{open ? 'Fermer' : 'Changer'}</button></div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder={`E-mail qui reçoit les messages (défaut : ${s.account ?? 'e-mail du compte'})`} style={input} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5 }}><input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)} /> Me mettre en copie sur Telegram</label>
          <button onClick={() => { void save(); }} style={{ ...btn('rgba(255,255,255,0.08)', C.text), marginTop: 6 }}>Enregistrer</button>
          {msg && <div style={{ fontSize: 11.5, marginTop: 5 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

function EditBlock({ s, act }: { s: ClientSiteRow; act: Act }) {
  const [changes, setChanges] = useState('');
  return (
    <Block title="✍️ MODIFIER LE SITE">
      <textarea value={changes} onChange={e => setChanges(e.target.value)} rows={3} placeholder="Ex. « change les horaires du samedi : 10h – 22h », « ajoute la pizza 4 fromages à 900 DA », « voici le vrai menu : … »" style={{ ...input, resize: 'vertical', lineHeight: 1.45 }} />
      <button disabled={!changes.trim()} onClick={() => { void act('edit', { changes: changes.trim() }).then(ok => { if (ok) setChanges(''); }); }}
        style={{ ...btn('rgba(96,165,250,0.18)', C.blue), marginTop: 7, opacity: changes.trim() ? 1 : 0.5 }}>Envoyer à Dzaryx</button>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Dzaryx modifie et remet en ligne en moins d'une minute (confirmation sur Telegram). Le patron peut aussi tout changer lui-même dans son espace client.</div>
    </Block>
  );
}

// Ouvre l'espace client du patron sans son mot de passe (session FIK de 2 h, le patron reste connecté).
function OpenAsMe({ s }: { s: ClientSiteRow }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    const w = window.open('', '_blank');   // ouvert tout de suite, sinon iOS bloque la fenêtre après l'attente
    setBusy(true); setErr('');
    try {
      const { url } = await business.siteOpenAdmin(s.id);
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e) { w?.close(); setErr(errText(e)); }
    finally { setBusy(false); }
  };
  return (<>
    <button disabled={busy} onClick={() => { void go(); }} style={{ ...btn('rgba(56,216,245,0.16)', C.accent), opacity: busy ? 0.6 : 1 }}>{busy ? '⏳ Ouverture…' : '🔓 Ouvrir son espace (moi)'}</button>
    {err && <div style={{ width: '100%', color: C.red, fontSize: 11.5 }}>❌ {err}</div>}
  </>);
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#081024', border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 6px 6px 10px', marginTop: 5 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: C.muted }}>{label}</div>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, wordBreak: 'break-all' }}>{value}</div>
      </div>
      <button onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
        style={{ ...btn(done ? 'rgba(56,216,245,0.2)' : 'rgba(96,165,250,0.18)', done ? C.accent : C.blue), flex: '0 0 auto' }}>{done ? '✓ Copié' : 'Copier'}</button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
      <div style={{ flex: '0 0 22px', height: 22, borderRadius: 11, background: 'rgba(96,165,250,0.18)', color: C.blue, fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {children && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{children}</div>}
      </div>
    </div>
  );
}

function DomainBlock({ s, act }: { s: ClientSiteRow; act: Act }) {
  const [domain, setDomain] = useState('');
  const [sent, setSent] = useState(false);
  const d = s.domain;
  const name = d?.name ?? (domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '') || 'son-domaine.com');
  const t = s.dnsTarget;
  // Message tout prêt si c'est le patron (ou son informaticien) qui règle le DNS chez son vendeur.
  const clientMsg = `Bonjour, pour que votre site s'affiche sur ${name}, il faut régler 2 lignes dans la « zone DNS » du domaine (chez OVH, GoDaddy, Hostinger…) :\n\n` +
    `1) Type A — Nom : @ (ou vide) — Valeur : ${t.a}\n2) Type CNAME — Nom : www — Valeur : ${t.cname}\n\n` +
    `Supprimez les autres lignes A, AAAA ou CNAME qui ont le nom @ ou www. C'est actif en quelques minutes à 24 h. Merci ! — FIK Conciergerie`;
  const copyMsg = () => { void navigator.clipboard?.writeText(clientMsg); setSent(true); setTimeout(() => setSent(false), 1500); };
  const dnsSteps = (
    <>
      <Step n={3} title="Régler le DNS chez le vendeur du domaine">
        Connecte-toi au compte du client (OVH, GoDaddy, Hostinger…) → le domaine → <b style={{ color: C.text }}>Zone DNS</b> (ou « Gérer le DNS »). Ajoute ou modifie ces 2 lignes :
      </Step>
      <div style={{ marginLeft: 31 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 7 }}>Ligne 1 — type <span style={{ color: C.blue }}>A</span></div>
        <CopyLine label="Nom / Hôte (chez OVH : laisser vide)" value="@" />
        <CopyLine label="Valeur / Pointe vers" value={t.a} />
        <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 9 }}>Ligne 2 — type <span style={{ color: C.blue }}>CNAME</span></div>
        <CopyLine label="Nom / Hôte" value="www" />
        <CopyLine label="Valeur / Cible" value={t.cname} />
        <div style={{ fontSize: 11.5, color: C.gold, marginTop: 7 }}>⚠️ Supprime les autres lignes A, AAAA ou CNAME qui ont le nom « @ » ou « www » (souvent une page « parking » du vendeur). Ne touche pas aux lignes MX (les e-mails).</div>
        <button onClick={copyMsg} style={{ ...btn(sent ? 'rgba(56,216,245,0.2)' : 'rgba(255,255,255,0.07)', sent ? C.accent : C.text), marginTop: 8 }}>{sent ? '✓ Message copié' : '💬 Copier le message pour le client'}</button>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Si c'est lui (ou son informaticien) qui fait le réglage : colle ce message sur WhatsApp, tout y est.</div>
      </div>
      <Step n={4} title="Attendre que ça devienne actif">
        De quelques minutes à 24 h. Dzaryx vérifie chaque jour et te prévient sur Telegram quand le site s'ouvre sur {name} avec le cadenas https.
      </Step>
    </>
  );
  return (
    <Block title="🔗 NOM DE DOMAINE">
      {!d ? (<>
        <div style={{ color: C.muted, fontSize: 12 }}>Adresse actuelle : {s.netlifyUrl.replace(/^https:\/\//, '')}. Pour avoir son propre nom (ex. restaurant-pralin.com) :</div>
        <Step n={1} title="Le client achète son domaine">
          Chez OVH, Hostinger, GoDaddy ou Namecheap, à son nom (environ 10 à 15 € par an pour un .com, à renouveler chaque année). Le mieux : qu'il te donne l'accès à ce compte, sinon il fera l'étape 3 avec ton message.
        </Step>
        <Step n={2} title="Brancher le domaine ici" />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, marginLeft: 31 }}>
          <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="restaurant-pralin.com" style={{ ...input, flex: 1 }} autoCapitalize="none" autoCorrect="off" />
          <button disabled={!domain.trim()} onClick={() => { void act('domain', { domain: domain.trim() }).then(ok => { if (ok) setDomain(''); }); }} style={{ ...btn('rgba(96,165,250,0.18)', C.blue), opacity: domain.trim() ? 1 : 0.5 }}>Brancher</button>
        </div>
        {dnsSteps}
      </>) : (<>
        <div><b>{d.name}</b> · {d.status === 'active' ? <span style={{ color: C.accent }}>✅ actif (https)</span> : <span style={{ color: C.gold }}>⏳ en attente du DNS</span>}</div>
        {d.status === 'pending' && <>
          <Step n={1} title="Domaine acheté" />
          <Step n={2} title={`Branché sur le site ✓`} />
          {dnsSteps}
        </>}
        {d.checkedAt && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Dernière vérification : {fmtAt(d.checkedAt)}</div>}
        <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
          {d.status === 'pending' && <button onClick={() => { void act('domain_check'); }} style={btn('rgba(96,165,250,0.18)', C.blue)}>🔄 Vérifier maintenant</button>}
          <ConfirmButton label="Retirer" confirm="Oui, retirer le domaine" color={C.red} onGo={() => { void act('domain_remove'); }} />
        </div>
      </>)}
    </Block>
  );
}

function AccountBlock({ s, act }: { s: ClientSiteRow; act: Act }) {
  const [email, setEmail] = useState(s.account ?? s.contact?.email ?? '');
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState(true);
  return (
    <Block title="🔑 QUI A ACCÈS À L'ESPACE ADMIN">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 12.5 }}>
        <span style={{ color: C.muted }}>Toi</span><span style={{ color: C.accent }}>✅ toujours (bouton « Ouvrir son espace »)</span>
        <span style={{ color: C.muted }}>Le patron</span>
        <span style={{ color: s.account ? C.accent : C.gold }}>{s.account ? `✅ ${s.account}` : '⛔ pas d\'accès'}</span>
      </div>
      {!open && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <button onClick={() => setOpen(true)} style={btn(s.account ? 'rgba(255,255,255,0.07)' : C.accent, s.account ? C.text : '#06210f')}>{s.account ? 'Nouveau mot de passe / autre e-mail' : 'Donner l\'accès au patron'}</button>
        {s.account && <ConfirmButton label="⛔ Couper son accès" confirm="Oui, couper" color={C.red} onGo={() => act('account_off')} />}
      </div>}
      {open && (<div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="E-mail du patron" style={{ ...input, flex: 1 }} />
          <button disabled={!email.trim()} onClick={() => { void act('account', { client_email: email.trim(), send_to_client: mail }).then(ok => { if (ok) setOpen(false); }); }} style={{ ...btn(C.accent, '#06210f'), opacity: email.trim() ? 1 : 0.5 }}>Valider</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginTop: 7, color: C.text }}>
          <input type="checkbox" checked={mail} onChange={e => setMail(e.target.checked)} /> Lui envoyer ses accès par e-mail
        </label>
        <button onClick={() => setOpen(false)} style={{ ...btn('rgba(255,255,255,0.07)', C.muted), marginTop: 6 }}>Annuler</button>
      </div>)}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Le mot de passe arrive toujours sur ton Telegram. Changer le mot de passe ou couper l'accès déconnecte le patron tout de suite.</div>
    </Block>
  );
}
