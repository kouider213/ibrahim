import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, getDeviceToken, setDeviceToken, loginDevice } from '../services/api.ts';
import { forme, errText, type Overview, type Profile, DAYS, vibrate, formeToken, FORME_TOKEN } from './api.ts';
import { applyLang, setTranslator } from './i18n.ts';
setTranslator(async texts => (await forme.translate(texts)).map);
import { F, Title, card, btn, ghostBtn, input, Sheet, Spinner, Toast, Chip } from './ui.tsx';
import SportScreen, { ProgramSport } from './Sport.tsx';
import BodyScreen from './Body.tsx';
import ScanScreen from './Scan.tsx';
import { LibraryScreen } from './Exercises.tsx';

// FORME — l'app SPORT de Kouider (31/10 : refaite au style de l'appli « Library » de sa vidéo, nourriture retirée).
// Marche seule (écran d'accueil : /ibrahim/forme/) ou dans l'app Dzaryx (page FORME, en iframe : même session).
// Onglets : Séance (programme du jour) · Exercices (bibliothèque) · Scanner (photo d'une machine) · Progrès (poids, photos).
type Tab = 'sport' | 'library' | 'scan' | 'body';
const TABS: Array<{ id: Tab; label: string; icon: (on: boolean) => JSX.Element }> = [
  { id: 'sport', label: 'Séance', icon: on => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round"><path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" /></svg> },
  { id: 'library', label: 'Exercices', icon: on => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg> },
  { id: 'scan', label: 'Scanner', icon: on => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><circle cx="12" cy="12" r="3.2" /></svg> },
  { id: 'body', label: 'Progrès', icon: on => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16M6 15l4-4 3 3 5-6" /></svg> },
];
const isTab = (t: string | null): t is Tab => !!t && TABS.some(x => x.id === t);
// Lien d'invitation de sa femme : ?invite=… → jeton FORME gardé sur son téléphone.
// iPhone : l'icône « Sur l'écran d'accueil » n'a PAS la mémoire de Safari → le jeton reste dans l'adresse
// et dans le manifeste (start_url), sinon l'icône s'ouvrait sur la connexion de Kouider (25/10).
function keepInvite(t: string) {
  const start = `${location.origin}${location.pathname}?invite=${encodeURIComponent(t)}`;
  if (new URLSearchParams(location.search).get('invite') !== t) history.replaceState(null, '', start);
  const abs = (u: string) => `${location.origin}${u}`;
  const m = { id: '/ibrahim/forme/?femme', name: 'Forme', short_name: 'Forme', start_url: start, scope: abs('/ibrahim/forme/'), display: 'standalone', orientation: 'portrait', background_color: '#fbf1ec', theme_color: '#fbf1ec', lang: 'ar', dir: 'rtl',
    icons: [{ src: abs('/ibrahim/icons/forme-192.png'), sizes: '192x192', type: 'image/png' }, { src: abs('/ibrahim/icons/forme-512.png'), sizes: '512x512', type: 'image/png' }] };
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(m))}`;
}
const inviteIn = (s: string) => { const m = /invite=([\w-]{20,})/.exec(s); return m ? m[1] : null; };
// Notification « Kouider t'invite à jouer » : ?jeu=folie → on ouvre directement le jeu (avec son jeton)
try {
  const jeu = new URLSearchParams(location.search).get('jeu');
  if (jeu && /^[a-z]+$/.test(jeu)) { const ft = new URLSearchParams(location.search).get('invite') ?? localStorage.getItem(FORME_TOKEN); location.replace(`/ibrahim/${jeu}/?hub=1${ft ? `&invite=${encodeURIComponent(ft)}` : ''}`); }
} catch { /* */ }
try {
  const t = new URLSearchParams(location.search).get('invite') ?? localStorage.getItem(FORME_TOKEN);
  if (t) { localStorage.setItem(FORME_TOKEN, t); keepInvite(t); }
} catch { /* */ }
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();

function Login({ onOk }: { onOk: () => void }) {
  const [u, setU] = useState('');
  // Sa femme colle son lien d'invitation dans le 1er champ → entrée directe dans SON appli
  const paste = (v: string) => { const t = inviteIn(v); if (!t) return setU(v); try { localStorage.setItem(FORME_TOKEN, t); keepInvite(t); } catch { /* */ } onOk(); }; const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div style={{ minHeight: '100dvh', background: `radial-gradient(140% 60% at 50% 0%, ${F.soft}, ${F.bg})`, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
      <div style={{ width: 70, height: 70, borderRadius: 22, background: F.accent, color: '#fff', fontSize: 38, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 30px rgba(31,99,240,0.35)' }}>F</div>
      <Title a="Bienvenue sur" b="FORME" sub="Connecte-toi avec ton compte Dzaryx : tes séances et ton suivi sont partagés avec lui." />
      <div style={{ ...card, marginBottom: 14, fontSize: 14, lineHeight: 1.5 }} dir="rtl">مرحبًا! إذا كنتِ زوجة قويدر، افتحي الرابط الذي أرسله لكِ، أو الصقي الرابط في الخانة الأولى هنا.</div>
      <input value={u} onChange={e => paste(e.target.value)} placeholder="Identifiant — ou colle le lien / الصقي الرابط" style={{ ...input, marginBottom: 8 }} autoCapitalize="none" />
      <input value={p} onChange={e => setP(e.target.value)} placeholder="Mot de passe" type="password" style={input} onKeyDown={e => { if (e.key === 'Enter') (document.getElementById('lg') as HTMLButtonElement)?.click(); }} />
      {err && <div style={{ color: F.red, fontWeight: 700, marginTop: 10 }}>{err}</div>}
      <button id="lg" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { const r = await loginDevice(u.trim(), p); setDeviceToken(r.token); onOk(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, marginTop: 14 }}>{busy ? 'Connexion…' : 'Se connecter'}</button>
    </div>
  );
}

async function enablePush(): Promise<string> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'Notifications : ajoute d\'abord FORME à ton écran d\'accueil (Partager → Sur l\'écran d\'accueil), puis réessaie depuis l\'icône.';
  if (await Notification.requestPermission() !== 'granted') return 'Notifications refusées dans les réglages.';
  const reg = await navigator.serviceWorker.register('/ibrahim/sw.js', { scope: '/ibrahim/' });
  await navigator.serviceWorker.ready;
  const { key } = await apiFetch<{ key: string }>('/api/push-token/vapid-public-key');
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
  await forme.push(sub.toJSON());
  return '🔔 Notifications activées';
}

function Invite({ o, toast }: { o: Overview; toast: (t: string) => void }) {
  const [name, setName] = useState(o.femme?.name ?? '');
  const [lang, setLang] = useState<'ar' | 'fr'>('ar');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const r = await forme.invite(name.trim(), lang); setLink(r.link);
      try { if (navigator.share) await navigator.share({ title: 'FORME', text: lang === 'ar' ? 'تطبيقكِ للرياضة 💪' : 'Ton appli sport 💪', url: r.link }); else { await navigator.clipboard.writeText(r.link); toast('Lien copié'); } } catch { /* partage annulé */ }
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ fontWeight: 800 }}>👫 L'appli de ma femme</div>
      <div style={{ fontSize: 13, color: F.muted, margin: '4px 0 10px', lineHeight: 1.4 }}>Elle a SA propre FORME (séances, exercices, scanner, photos, Wegovy), en arabe littéraire ou en français. Vous ne voyez pas le suivi de l'autre.{o.femme?.active ? ' ✅ Accès actif.' : ''}</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Son prénom" style={{ ...input, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}><Chip on={lang === 'ar'} onClick={() => setLang('ar')}>العربية (principale)</Chip><Chip on={lang === 'fr'} onClick={() => setLang('fr')}>Français</Chip></div>
      <button disabled={busy || !name.trim()} onClick={create} style={{ ...btn, width: '100%', opacity: name.trim() ? 1 : 0.5 }}>{o.femme?.active ? '🔗 Nouveau lien (coupe l\'ancien)' : '🔗 Créer et envoyer son lien'}</button>
      {link && <div style={{ fontSize: 12, wordBreak: 'break-all', color: F.muted, marginTop: 8 }}>{link}</div>}
      {o.femme?.active && <button onClick={async () => { if (!confirm('Couper son accès ?')) return; await forme.revoke(); toast('Accès coupé'); }} style={{ ...ghostBtn, width: '100%', marginTop: 8 }}>Couper son accès</button>}
    </div>
  );
}

function Settings({ o, open, onClose, onO, toast }: { o: Overview; open: boolean; onClose: () => void; onO: (o: Overview) => void; toast: (t: string) => void }) {
  const [p, setP] = useState<Profile>(o.profile);
  useEffect(() => { if (open) setP(o.profile); }, [open, o.profile]);
  const save = async (patch: Partial<Profile>) => {
    const next = { ...p, ...patch }; setP(next);
    try { await forme.profile(patch); onO(await forme.overview()); } catch (e) { toast(errText(e)); }
  };
  const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${F.line}` }}>
      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
      <button onClick={() => onChange(!on)} style={{ width: 50, height: 30, borderRadius: 15, border: 'none', background: on ? F.green : F.bg2, position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'left .2s', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }} /></button>
    </div>
  );
  const num = (label: string, k: 'weightKg' | 'targetKg' | 'age' | 'heightCm' | 'photoEveryDays' | 'sessionsPerWeek') => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}><span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
      <input inputMode="decimal" defaultValue={p[k]} key={`${k}-${open}`} onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v && v !== p[k]) void save({ [k]: v } as Partial<Profile>); }} style={{ ...input, width: 100, textAlign: 'right', padding: '9px 12px' }} /></label>
  );
  return (
    <Sheet open={open} onClose={onClose} title={<Title a="Mon" b="profil" size={26} />}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>{(['perte', 'recompo', 'muscle'] as const).map(g => <Chip key={g} on={p.goal === g} onClick={() => void save({ goal: g })}>{{ perte: 'Perdre', recompo: 'Les deux', muscle: 'Muscle' }[g]}</Chip>)}</div>
      <div style={{ ...card, padding: '6px 14px' }}>
        {num('Poids actuel (kg)', 'weightKg')}{num('Poids visé (kg)', 'targetKg')}{num('Âge', 'age')}{num('Taille (cm)', 'heightCm')}
        {num('Séances / semaine', 'sessionsPerWeek')}{num('Photo tous les … jours', 'photoEveryDays')}
      </div>
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>🌐 Langue · اللغة</div>
      <div style={{ display: 'flex', gap: 6 }}><Chip on={p.lang === 'ar'} onClick={() => void save({ lang: 'ar' })}>العربية</Chip><Chip on={p.lang === 'fr'} onClick={() => void save({ lang: 'fr' })}>Français</Chip></div>
      {o.uid === 'femme' && <div style={{ ...card, padding: '4px 14px', marginTop: 12 }}><Toggle on={p.shareWithDzaryx} onChange={v => void save({ shareWithDzaryx: v })} label="Partager mon suivi avec Dzaryx (l'assistant de Kouider)" /><div style={{ fontSize: 12.5, color: F.muted, padding: '6px 0 10px' }}>Désactivé : ton suivi, tes photos et ton traitement restent rien qu'à toi.</div></div>}
      {o.uid === 'kouider' && <Invite o={o} toast={toast} />}
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>🛌 Jours de repos (pas de sport)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[1, 2, 3, 4, 5, 6, 0].map(d => <Chip key={d} on={p.restDays.includes(d)} onClick={() => void save({ restDays: p.restDays.includes(d) ? p.restDays.filter(x => x !== d) : [...p.restDays, d] })}>{DAYS[d]!.slice(0, 3)}</Chip>)}</div>
      {o.uid === 'kouider' && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 6 }}>Tes séances à la salle restent calées par Dzaryx sur ton agenda Google.</div>}
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>💉 Wegovy</div>
      <div style={{ ...card, padding: '4px 14px' }}>
        <Toggle on={p.wegovy.on} onChange={v => void save({ wegovy: { ...p.wegovy, on: v } })} label="Traitement en cours" />
        <div style={{ display: 'flex', gap: 4, padding: '10px 0', flexWrap: 'wrap' }}>{[1, 2, 3, 4, 5, 6, 0].map(d => <Chip key={d} on={p.wegovy.day === d} onClick={() => void save({ wegovy: { ...p.wegovy, day: d } })}>{DAYS[d]!.slice(0, 3)}</Chip>)}</div>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}><span style={{ fontWeight: 600 }}>Heure du rappel</span><input type="time" defaultValue={p.wegovy.hour} key={`h-${open}`} onBlur={e => void save({ wegovy: { ...p.wegovy, hour: e.target.value } })} style={{ ...input, width: 120, padding: '9px 12px' }} /></label>
        <div style={{ padding: '6px 0 10px' }}><div style={{ fontWeight: 600, marginBottom: 8 }}>Dose prescrite</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{o.doses.map(d => <Chip key={d} on={p.wegovy.dose === d} onClick={() => void save({ wegovy: { ...p.wegovy, dose: d } })}>{d}</Chip>)}</div>
          {(p.wegovy.doses?.length ?? 0) > 0 && <div style={{ fontSize: 12.5, color: F.muted, marginTop: 8 }}>Historique : {p.wegovy.doses!.map(x => `${x.dose} (${x.date.slice(8)}/${x.date.slice(5, 7)})`).join(' → ')}</div>}</div>
      </div>
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>🔔 Notifications</div>
      <div style={{ ...card, padding: '4px 14px' }}>
        <Toggle on={p.notif.injection} onChange={v => void save({ notif: { ...p.notif, injection: v } })} label="Jour d'injection" />
        <Toggle on={p.notif.weigh} onChange={v => void save({ notif: { ...p.notif, weigh: v } })} label="Pesée du lundi" />
        <Toggle on={p.weighDaily} onChange={v => void save({ weighDaily: v })} label="… tous les matins" />
        <Toggle on={p.notif.photo} onChange={v => void save({ notif: { ...p.notif, photo: v } })} label="Photo de suivi" />
        {o.uid === 'kouider' && <Toggle on={p.notif.telegram !== false} onChange={v => void save({ notif: { ...p.notif, telegram: v } })} label="Aussi sur Telegram (Dzaryx)" />}
      </div>
      {!embedded && <button onClick={async () => { try { toast(await enablePush()); } catch (e) { toast(errText(e)); } }} style={{ ...btn, width: '100%', marginTop: 12 }}>🔔 Activer les notifications sur ce téléphone</button>}
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 10, lineHeight: 1.45 }}>{embedded ? 'Dans Dzaryx, les rappels arrivent dans les notifications de Dzaryx. ' : ''}Pour avoir FORME comme une vraie app : ouvre kouider213.github.io/ibrahim/forme dans Safari → Partager → « Sur l'écran d'accueil ».</div>
      <button onClick={() => { if (confirm('Refaire le questionnaire du début ?')) void save({ onboarded: false }); }} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>Refaire le questionnaire</button>
    </Sheet>
  );
}

const GOALS: Array<{ id: Profile['goal']; label: string; sub: string; e: string }> = [
  { id: 'perte', label: 'Perdre du ventre', sub: 'Brûler du gras, garder le muscle', e: '🔥' },
  { id: 'recompo', label: 'Les deux', sub: 'Sec et plus fort', e: '⚡' },
  { id: 'muscle', label: 'Prendre du muscle', sub: 'Pecs, dos, bras', e: '💪' },
];
/** 1re ouverture : 4 questions sport (plus rien sur la nourriture), puis l'appli. */
function Setup({ initial, onDone }: { initial: Profile; onDone: () => void }) {
  const [p, setP] = useState<Profile>(initial);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (patch: Partial<Profile>) => setP(x => ({ ...x, ...patch }));
  const n = (label: string, k: 'age' | 'heightCm' | 'weightKg' | 'targetKg') => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: `1px solid ${F.line}` }}><span style={{ fontWeight: 600 }}>{label}</span>
      <input inputMode="decimal" value={p[k] || ''} onChange={e => set({ [k]: Number(e.target.value.replace(',', '.')) || 0 } as Partial<Profile>)} style={{ ...input, width: 100, textAlign: 'right', padding: '9px 12px' }} /></label>
  );
  return (
    <div style={{ minHeight: '100dvh', background: F.bg, padding: 'calc(20px + env(safe-area-inset-top)) 18px 40px', boxSizing: 'border-box', fontFamily: F.sans, color: F.ink }}>
      <Title a="Bienvenue sur" b="FORME" sub="Ton coach de salle : séances, 800 exercices en images, et le scanner de machines." />
      <div style={{ fontWeight: 700, margin: '10px 2px 8px' }}>Ton objectif</div>
      <div style={{ display: 'grid', gap: 8 }}>{GOALS.map(g => <button key={g.id} onClick={() => set({ goal: g.id })} style={{ ...card, display: 'flex', gap: 14, alignItems: 'center', border: p.goal === g.id ? `2px solid ${F.accent}` : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'start', color: F.ink }}><span style={{ fontSize: 28 }}>{g.e}</span><div><div style={{ fontWeight: 700 }}>{g.label}</div><div style={{ fontSize: 13, color: F.muted }}>{g.sub}</div></div></button>)}</div>
      <div style={{ fontWeight: 700, margin: '18px 2px 8px' }}>Séances par semaine</div>
      <div style={{ display: 'flex', gap: 6 }}>{[2, 3, 4, 5, 6].map(x => <Chip key={x} on={p.sessionsPerWeek === x} onClick={() => set({ sessionsPerWeek: x })}>{x}</Chip>)}</div>
      <div style={{ fontWeight: 700, margin: '18px 2px 8px' }}>Toi</div>
      <div style={{ ...card, padding: '4px 14px' }}>{n('Âge', 'age')}{n('Taille (cm)', 'heightCm')}{n('Poids (kg)', 'weightKg')}{n('Poids visé (kg)', 'targetKg')}</div>
      {err && <div style={{ color: F.red, marginTop: 10 }}>{err}</div>}
      <button disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await forme.profile({ goal: p.goal, sessionsPerWeek: p.sessionsPerWeek, age: p.age, heightCm: p.heightCm, weightKg: p.weightKg, targetKg: p.targetKg, onboarded: true }); onDone(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } }} style={{ ...btn, width: '100%', marginTop: 20 }}>{busy ? 'Un instant…' : 'C\'est parti →'}</button>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getDeviceToken() || !!formeToken());
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('forme:tab'); return isTab(t) ? t : 'sport'; } catch { return 'sport'; } });
  const [settings, setSettings] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const standalone = (() => { try { return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; } })();
  const [notifState, setNotifState] = useState<string>(() => { try { if (localStorage.getItem('forme:notif-dismissed')) return 'dismissed'; } catch { /* */ } return typeof Notification !== 'undefined' ? Notification.permission : 'default'; });
  const toast = useCallback((t: string) => { setToastText(t); setTimeout(() => setToastText(x => x === t ? null : x), 2600); }, []);
  const load = useCallback(() => forme.overview().then(x => { setO(x); setErr(''); }).catch(e => { const raw = e instanceof Error ? e.message : ''; const m = errText(e);
    // On n'efface le lien de sa femme QUE si le serveur dit vraiment « Lien expiré » (401) — jamais sur une panne réseau/serveur
    if (formeToken() ? /^API 401/.test(raw) && /Lien expiré/.test(m) : /^API 40[13]/.test(raw)) { if (formeToken()) { try { localStorage.removeItem(FORME_TOKEN); history.replaceState(null, '', location.pathname); } catch { /* */ } } else setDeviceToken(null); setAuthed(false); setErr(m); } else setErr(m); }), []);
  useEffect(() => { if (authed) void load(); }, [authed, load]);
  // Abonnement aux notifications ré-envoyé à chaque ouverture depuis l'icône (le serveur garde toujours le bon)
  useEffect(() => { if (!o || embedded || !standalone) return; try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') void enablePush().catch(() => {}); } catch { /* */ } }, [o?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('forme:tab', tab); } catch { /* */ } window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible' && authed) void load(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [authed, load]);
  useEffect(() => { applyLang(o?.profile.lang ?? (formeToken() ? 'ar' : 'fr')); }, [o?.profile.lang]);

  if (!authed) return <Login onOk={() => setAuthed(true)} />;
  if (!o) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: F.bg, padding: 24, textAlign: 'center' }}>
      {err ? <><div style={{ color: F.red, fontWeight: 700 }}>❌ {err}</div><button onClick={() => void load()} style={btn}>Réessayer</button></> : <><div style={{ width: 64, height: 64, borderRadius: 20, background: F.accent, color: '#fff', fontSize: 34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>F</div><Spinner /></>}
    </div>
  );
  if (!o.profile.onboarded) return <Setup initial={o.profile} onDone={() => { void load(); setTab('sport'); }} />;

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(180deg, #f8f2fb 0px, ${F.bg} 320px)`, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))', fontFamily: F.sans, color: F.ink }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(8px + env(safe-area-inset-top)) 14px 8px', background: 'rgba(248,244,251,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
        {embedded && <button onClick={() => window.parent.postMessage({ type: 'forme:exit' }, '*')} aria-label="Retour à Dzaryx" style={{ width: 34, height: 34, border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: F.ink, padding: 0 }}>✕</button>}
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', flex: 1 }}>Forme</div>
        <button data-tour="profile" onClick={() => setSettings(true)} aria-label="Profil" style={{ width: 34, height: 34, borderRadius: 17, border: 'none', background: F.ink, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{(o.profile.name || 'K').slice(0, 1).toUpperCase()}</button>
      </header>
      {!embedded && notifState !== 'granted' && (notifState !== 'dismissed' || standalone) && (
        <div style={{ margin: '6px 14px 0', ...card, display: 'flex', gap: 12, alignItems: 'center', background: F.dark, color: '#fff' }}>
          <span style={{ fontSize: 24 }}>🔔</span>
          <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>{standalone ? 'Active les notifications : rappels de séance et de suivi.' : 'Pour les notifications : Partager → « Sur l\'écran d\'accueil », puis ouvre FORME depuis l\'icône.'}</div>
          {standalone ? <button onClick={async () => { try { toast(await enablePush()); } catch (e) { toast(errText(e)); } setNotifState(typeof Notification !== 'undefined' ? Notification.permission : 'default'); }} style={{ ...btn, padding: '10px 14px', fontSize: 13.5 }}>Activer</button>
            : <button onClick={() => { setNotifState('dismissed'); try { localStorage.setItem('forme:notif-dismissed', '1'); } catch { /* */ } }} style={{ ...ghostBtn, padding: '8px 12px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none' }}>OK</button>}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {tab === 'sport' && (o.uid === 'kouider' ? <SportScreen toast={toast} go={setTab} /> : <ProgramSport toast={toast} go={setTab} />)}
          {tab === 'library' && <LibraryScreen />}
          {tab === 'scan' && <ScanScreen toast={toast} />}
          {tab === 'body' && <BodyScreen o={o} onO={setO} toast={toast} />}
        </motion.main>
      </AnimatePresence>
      <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: 'rgba(250,248,253,0.94)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: `1px solid ${F.line}`, padding: '6px 6px calc(6px + env(safe-area-inset-bottom))', display: 'flex' }}>
        {TABS.map(t => (
          <button key={t.id} data-tour={`nav-${t.id}`} onClick={() => { vibrate(8); setTab(t.id); }} style={{ flex: 1, border: 'none', background: 'none', color: tab === t.id ? F.accent : '#8e899b', padding: '4px 0', cursor: 'pointer', fontFamily: F.sans, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {t.icon(tab === t.id)}
            <div style={{ fontSize: 10.5, fontWeight: tab === t.id ? 600 : 500 }}>{t.label}</div>
          </button>
        ))}
      </nav>
      <Settings o={o} open={settings} onClose={() => setSettings(false)} onO={setO} toast={toast} />
      <Toast text={toastText} />
    </div>
  );
}
