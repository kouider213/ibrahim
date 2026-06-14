import { useState } from 'react';
import { business } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', pink: '#ec4899', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook'];

export default function SocialScreen() {
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [lang, setLang] = useState('fr');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const gen = async () => {
    if (!topic.trim()) { flash('Donne un sujet'); return; }
    setBusy(true);
    try {
      const r = await business.socialGenerate({ topic: topic.trim(), platform, lang });
      if (r.error || !r.caption) flash('❌ Échec génération');
      else { setCaption(r.caption); setHashtags(r.hashtags ?? ''); }
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };
  const copyAll = () => { navigator.clipboard?.writeText(`${caption}\n\n${hashtags}`).then(() => flash('Copié — colle dans Insta/TikTok')).catch(() => {}); };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.pink, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Marketing</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Contenu social</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Posts TikTok/Insta/Facebook + hashtags → visibilité Oran</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {PLATFORMS.map(p => (
            <button key={p} onClick={() => setPlatform(p)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: platform === p ? `${C.pink}22` : 'rgba(255,255,255,0.04)', color: platform === p ? C.pink : C.muted, border: `1px solid ${platform === p ? C.pink + '55' : 'transparent'}` }}>{p}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {(['fr', 'ar', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{ flex: 1, padding: '7px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: lang === l ? '#60a5fa' : 'rgba(255,255,255,0.04)', color: lang === l ? '#06182e' : C.muted, border: 'none' }}>{l === 'fr' ? '🇫🇷' : l === 'ar' ? '🇩🇿' : '🇬🇧'}</button>
          ))}
        </div>
        <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Sujet (ex: promo location été, nouvelle Clio, pack séjour Oran)" style={inp} />
        <button disabled={busy} onClick={() => void gen()} style={{ padding: '13px', borderRadius: 12, border: 'none', background: C.pink, color: '#fff', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Génération…' : '✨ Générer le post'}</button>
      </div>

      {caption && (
        <div style={{ marginTop: 16 }}>
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={6} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          <textarea value={hashtags} onChange={e => setHashtags(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', marginTop: 8, color: '#60a5fa', fontSize: 12.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => void gen()} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: C.font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🔄 Régénérer</button>
            <button onClick={copyAll} style={{ flex: 2, padding: '12px', borderRadius: 11, border: 'none', background: C.accent, color: '#06210f', fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>📋 Copier tout</button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(236,72,153,0.15)', border: `1px solid ${C.pink}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.pink, whiteSpace: 'nowrap', maxWidth: '90%' }}>{toast}</div>}
    </div>
  );
}
