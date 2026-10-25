import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, getDeviceToken, setDeviceToken, loginDevice } from '../services/api.ts';
import { forme, errText, type Overview, type Profile, DAYS, vibrate, formeToken, FORME_TOKEN } from './api.ts';
import { applyLang } from './i18n.ts';
import { F, Title, card, btn, ghostBtn, input, Sheet, Spinner, Toast, Chip } from './ui.tsx';
import Onboarding from './Onboarding.tsx';
import Home from './Home.tsx';
import WeekScreen from './Week.tsx';
import ShopScreen from './Shop.tsx';
import SportScreen, { ProgramSport } from './Sport.tsx';
import BodyScreen from './Body.tsx';
import ToolSheet, { type ToolId } from './Tools.tsx';

// FORME — l'app sport + nutrition de Kouider. Marche seule (écran d'accueil : /ibrahim/forme/) ou dans l'app Dzaryx
// (page FORME, en iframe : même session). Tout ce qu'elle note part au serveur, et Dzaryx le lit (formeText).
type Tab = 'home' | 'week' | 'shop' | 'sport' | 'body';
const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'home', icon: '🏠', label: 'Accueil' }, { id: 'week', icon: '🍽️', label: 'Semaine' }, { id: 'shop', icon: '🛒', label: 'Courses' },
  { id: 'sport', icon: '🏋️', label: 'Sport' }, { id: 'body', icon: '📸', label: 'Corps' },
];
// Lien d'invitation de sa femme : ?invite=… → jeton FORME gardé sur son téléphone, puis l'adresse est nettoyée
try {
  const inv = new URLSearchParams(location.search).get('invite');
  if (inv) { localStorage.setItem(FORME_TOKEN, inv); history.replaceState(null, '', location.pathname); }
} catch { /* */ }
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const STORE_LIST = ['Colruyt', 'Delhaize', 'Aldi', 'Lidl', 'Carrefour', 'Albert Heijn', 'Intermarché', 'Boucherie halal'];

function Login({ onOk }: { onOk: () => void }) {
  const [u, setU] = useState('kouider'); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div style={{ minHeight: '100dvh', background: `radial-gradient(140% 60% at 50% 0%, ${F.soft}, ${F.bg})`, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box' }}>
      <div style={{ width: 70, height: 70, borderRadius: 22, background: F.accent, color: '#fff', fontSize: 38, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 30px rgba(255,75,43,0.35)' }}>F</div>
      <Title a="Bienvenue sur" b="FORME" sub="Connecte-toi avec ton compte Dzaryx : tes repas, tes séances et ton suivi sont partagés avec lui." />
      <div style={{ ...card, marginBottom: 14, fontSize: 14, lineHeight: 1.5 }} dir="rtl">مرحبًا! إذا كنتِ زوجة قويدر، افتحي الرابط الذي أرسله لكِ لتدخلي إلى تطبيقكِ مباشرة.</div>
      <input value={u} onChange={e => setU(e.target.value)} placeholder="Identifiant" style={{ ...input, marginBottom: 8 }} autoCapitalize="none" />
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
      try { if (navigator.share) await navigator.share({ title: 'FORME', text: lang === 'ar' ? 'تطبيقكِ للرياضة والتغذية 💪' : 'Ton appli sport & nutrition 💪', url: r.link }); else { await navigator.clipboard.writeText(r.link); toast('Lien copié'); } } catch { /* partage annulé */ }
    } catch (e) { toast(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div style={{ ...card, marginTop: 14 }}>
      <div style={{ fontWeight: 800 }}>👫 L'appli de ma femme</div>
      <div style={{ fontSize: 13, color: F.muted, margin: '4px 0 10px', lineHeight: 1.4 }}>Elle a SA propre FORME (repas, suivi, photos, Wegovy), en arabe littéraire ou en français. Vous ne voyez pas le suivi de l'autre ; seule la liste de courses est commune.{o.femme?.active ? ' ✅ Accès actif.' : ''}</div>
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
  const num = (label: string, k: 'weightKg' | 'targetKg' | 'age' | 'heightCm' | 'budgetWeek' | 'waterGoal' | 'photoEveryDays' | 'sessionsPerWeek' | 'mealsPerDay') => (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}><span style={{ fontWeight: 600, fontSize: 14.5 }}>{label}</span>
      <input inputMode="decimal" defaultValue={p[k]} key={`${k}-${open}`} onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v && v !== p[k]) void save({ [k]: v } as Partial<Profile>); }} style={{ ...input, width: 100, textAlign: 'right', padding: '9px 12px' }} /></label>
  );
  return (
    <Sheet open={open} onClose={onClose} title={<Title a="Mon" b="profil" size={26} />}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>{(['perte', 'recompo', 'muscle'] as const).map(g => <Chip key={g} on={p.goal === g} onClick={() => void save({ goal: g })}>{{ perte: 'Perdre', recompo: 'Les deux', muscle: 'Muscle' }[g]}</Chip>)}</div>
      <div style={{ ...card, padding: '6px 14px' }}>
        {num('Poids actuel (kg)', 'weightKg')}{num('Poids visé (kg)', 'targetKg')}{num('Âge', 'age')}{num('Taille (cm)', 'heightCm')}
        {num('Séances / semaine', 'sessionsPerWeek')}{num('Repas / jour', 'mealsPerDay')}{num('Budget courses (€/sem.)', 'budgetWeek')}{num('Verres d\'eau / jour', 'waterGoal')}{num('Photo tous les … jours', 'photoEveryDays')}
      </div>
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>🌐 Langue · اللغة</div>
      <div style={{ display: 'flex', gap: 6 }}><Chip on={p.lang === 'ar'} onClick={() => void save({ lang: 'ar' })}>العربية</Chip><Chip on={p.lang === 'fr'} onClick={() => void save({ lang: 'fr' })}>Français</Chip></div>
      {o.uid === 'femme' && <div style={{ ...card, padding: '4px 14px', marginTop: 12 }}><Toggle on={p.shareWithDzaryx} onChange={v => void save({ shareWithDzaryx: v })} label="Partager mon suivi avec Dzaryx (l'assistant de Kouider)" /><div style={{ fontSize: 12.5, color: F.muted, padding: '6px 0 10px' }}>Désactivé : ton suivi, tes photos et ton traitement restent rien qu'à toi. Seule la liste de courses est commune.</div></div>}
      {o.uid === 'kouider' && <Invite o={o} toast={toast} />}
      <div style={{ fontWeight: 800, margin: '16px 2px 8px' }}>Mes magasins</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STORE_LIST.map(s => <Chip key={s} on={p.stores.includes(s)} onClick={() => void save({ stores: p.stores.includes(s) ? p.stores.filter(x => x !== s) : [...p.stores, s] })}>{s}</Chip>)}</div>
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
        <Toggle on={p.notif.meals} onChange={v => void save({ notif: { ...p.notif, meals: v } })} label="Repas (midi, soir)" />
        <Toggle on={p.notif.water} onChange={v => void save({ notif: { ...p.notif, water: v } })} label="Eau (15 h)" />
        <Toggle on={p.notif.weigh} onChange={v => void save({ notif: { ...p.notif, weigh: v } })} label="Pesée du lundi" />
        <Toggle on={p.weighDaily} onChange={v => void save({ weighDaily: v })} label="… tous les matins" />
        <Toggle on={p.notif.photo} onChange={v => void save({ notif: { ...p.notif, photo: v } })} label="Photo de suivi" />
      </div>
      {!embedded && <button onClick={async () => { try { toast(await enablePush()); } catch (e) { toast(errText(e)); } }} style={{ ...btn, width: '100%', marginTop: 12 }}>🔔 Activer les notifications sur ce téléphone</button>}
      <div style={{ fontSize: 12.5, color: F.muted, marginTop: 10, lineHeight: 1.45 }}>{embedded ? 'Dans Dzaryx, les rappels arrivent dans les notifications de Dzaryx. ' : ''}Pour avoir FORME comme une vraie app : ouvre kouider213.github.io/ibrahim/forme dans Safari → Partager → « Sur l'écran d'accueil ».</div>
      <button onClick={() => { if (confirm('Refaire le questionnaire du début ?')) void save({ onboarded: false }); }} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>Refaire le questionnaire</button>
    </Sheet>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getDeviceToken() || !!formeToken());
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('forme:tab') as Tab) || 'home'; } catch { return 'home'; } });
  const [tool, setTool] = useState<ToolId | null>(null);
  const [settings, setSettings] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const toast = useCallback((t: string) => { setToastText(t); setTimeout(() => setToastText(x => x === t ? null : x), 2600); }, []);
  const load = useCallback(() => forme.overview().then(x => { setO(x); setErr(''); }).catch(e => { const m = errText(e); if (/^API 40[13]|token|auth|Lien expiré/i.test(m)) { if (formeToken()) { try { localStorage.removeItem(FORME_TOKEN); } catch { /* */ } } else setDeviceToken(null); setAuthed(false); setErr(m); } else setErr(m); }), []);
  useEffect(() => { if (authed) void load(); }, [authed, load]);
  useEffect(() => { try { localStorage.setItem('forme:tab', tab); } catch { /* */ } window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible' && authed) void load(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, [authed, load]);

  const onLog = useCallback(async (kind: string, body: Record<string, unknown>) => {
    // Réponse immédiate à l'écran, puis la vérité du serveur
    setO(cur => {
      if (!cur) return cur;
      const day = { ...cur.day, meals: { ...cur.day.meals } };
      if (kind === 'meal') day.meals[String(body.key)] = !!body.eaten;
      if (kind === 'water') day.water = Math.max(0, day.water + Number(body.delta ?? 1));
      return { ...cur, day };
    });
    vibrate(15);
    try { setO(await forme.log(kind, body)); } catch (e) { toast(errText(e)); void load(); }
  }, [load, toast]);
  const onWeek = useCallback((week: NonNullable<Overview['week']>) => setO(cur => cur ? { ...cur, week } : cur), []);

  useEffect(() => { applyLang(o?.profile.lang ?? (formeToken() ? 'ar' : 'fr')); }, [o?.profile.lang]);
  if (!authed) return <Login onOk={() => setAuthed(true)} />;
  if (!o) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: F.bg, padding: 24, textAlign: 'center' }}>
      {err ? <><div style={{ color: F.red, fontWeight: 700 }}>❌ {err}</div><button onClick={() => void load()} style={btn}>Réessayer</button></> : <><div style={{ width: 64, height: 64, borderRadius: 20, background: F.accent, color: '#fff', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>F</div><Spinner /></>}
    </div>
  );
  if (!o.profile.onboarded) return <Onboarding initial={o.profile} onDone={() => { void load(); setTab('home'); }} />;

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(180deg, ${F.soft} 0px, ${F.bg} 260px)`, paddingBottom: 'calc(110px + env(safe-area-inset-bottom))' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: 'calc(10px + env(safe-area-inset-top)) 18px 10px', background: 'rgba(251,241,236,0.82)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
        {embedded && <button onClick={() => window.parent.postMessage({ type: 'forme:exit' }, '*')} aria-label="Retour à Dzaryx" style={{ ...ghostBtn, width: 38, height: 38, padding: 0, borderRadius: 19 }}>←</button>}
        <div style={{ width: 34, height: 34, borderRadius: 11, background: F.accent, color: '#fff', fontWeight: 900, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>F</div>
        <div style={{ fontWeight: 900, fontSize: 19, letterSpacing: '-0.02em', flex: 1 }}>Forme</div>
        <div style={{ background: '#fff', borderRadius: 999, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, boxShadow: '0 2px 8px rgba(120,60,40,0.08)' }}>{o.profile.stores.filter(s => s !== 'Boucherie halal')[0] ?? 'Halal'} · {o.profile.budgetWeek} €/sem</div>
        <button onClick={() => setSettings(true)} aria-label="Profil" style={{ width: 36, height: 36, borderRadius: 18, border: 'none', background: F.dark, color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{(o.profile.name || 'K').slice(0, 1).toUpperCase()}</button>
      </header>
      <AnimatePresence mode="wait">
        <motion.main key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {tab === 'home' && <Home o={o} name={o.profile.name || 'Kouider'} onLog={(k, b) => void onLog(k, b)} onWeek={onWeek} openTool={setTool} go={setTab} />}
          {tab === 'week' && <WeekScreen o={o} onLog={(k, b) => void onLog(k, b)} onWeek={onWeek} />}
          {tab === 'shop' && <ShopScreen me={o.profile.name || 'Kouider'} toast={toast} />}
          {tab === 'sport' && (o.uid === 'kouider' ? <SportScreen toast={toast} /> : <ProgramSport toast={toast} />)}
          {tab === 'body' && <BodyScreen o={o} onO={setO} toast={toast} />}
        </motion.main>
      </AnimatePresence>
      <nav style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(14px + env(safe-area-inset-bottom))', width: 'min(calc(100% - 28px), 460px)', zIndex: 30, background: F.dark, borderRadius: 26, padding: 6, display: 'flex', gap: 2, boxShadow: '0 14px 34px rgba(30,15,10,0.35)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { vibrate(8); setTab(t.id); }} style={{ flex: 1, position: 'relative', border: 'none', background: 'none', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.55)', padding: '8px 0 7px', cursor: 'pointer', fontFamily: F.sans, borderRadius: 20 }}>
            {tab === t.id && <motion.div layoutId="pill" style={{ position: 'absolute', inset: 0, background: F.accent, borderRadius: 20 }} transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
            <div style={{ position: 'relative', fontSize: 19 }}>{t.icon}</div>
            <div style={{ position: 'relative', fontSize: 11, fontWeight: 800, marginTop: 1 }}>{t.label}</div>
          </button>
        ))}
      </nav>
      <ToolSheet id={tool} o={o} onO={setO} onClose={() => setTool(null)} toast={toast} />
      <Settings o={o} open={settings} onClose={() => setSettings(false)} onO={setO} toast={toast} />
      <Toast text={toastText} />
    </div>
  );
}
