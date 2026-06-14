import { useState } from 'react';
import { business } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', blue: '#60a5fa', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const TONES = [
  { id: 'professionnel et chaleureux', label: 'Pro & chaleureux' },
  { id: 'court et direct', label: 'Court' },
  { id: 'très commercial et persuasif', label: 'Commercial' },
];

export default function ReponseScreen() {
  const [phone, setPhone]   = useState('');
  const [lang, setLang]     = useState('fr');
  const [tone, setTone]     = useState(TONES[0].id);
  const [clientMsg, setMsg] = useState('');
  const [context, setCtx]   = useState('');
  const [reply, setReply]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [toast, setToast]   = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const draft = async () => {
    if (!clientMsg.trim() && !context.trim()) { flash('Colle le message client ou un contexte'); return; }
    setBusy(true);
    try {
      const r = await business.whatsappDraft({ clientMessage: clientMsg, context, lang, tone });
      if (r.error || !r.reply) flash(r.error ? `❌ ${r.error.slice(0, 40)}` : '❌ Échec');
      else setReply(r.reply);
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(false); }
  };

  const send = () => {
    if (!reply.trim()) { flash('Rédige d’abord la réponse'); return; }
    const ph = phone.replace(/\D/g, '');
    const txt = encodeURIComponent(reply);
    window.open(ph ? `https://wa.me/${ph}?text=${txt}` : `https://wa.me/?text=${txt}`, '_blank');
  };

  const copy = () => { navigator.clipboard?.writeText(reply).then(() => flash('Copié')).catch(() => {}); };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Assistant" title="Réponse client" /></div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Dzaryx rédige la réponse dans la langue du client → tu valides → WhatsApp</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Téléphone client (WhatsApp)" style={inp} />
        <div style={{ display: 'flex', gap: 7 }}>
          {(['fr', 'ar', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, background: lang === l ? C.blue : 'rgba(255,255,255,0.04)', color: lang === l ? '#06182e' : C.muted, border: 'none' }}>{l === 'fr' ? '🇫🇷 FR' : l === 'ar' ? '🇩🇿 Darija' : '🇬🇧 EN'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {TONES.map(tn => (
            <button key={tn.id} onClick={() => setTone(tn.id)} style={{ flex: 1, padding: '8px 4px', borderRadius: 10, cursor: 'pointer', fontSize: 10.5, fontWeight: 700, background: tone === tn.id ? `${C.accent}22` : 'rgba(255,255,255,0.04)', color: tone === tn.id ? C.accent : C.muted, border: `1px solid ${tone === tn.id ? C.accent + '55' : 'transparent'}` }}>{tn.label}</button>
          ))}
        </div>
        <textarea value={clientMsg} onChange={e => setMsg(e.target.value)} placeholder="Colle le message du client (ce qu'il a écrit)…" rows={3} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
        <input value={context} onChange={e => setCtx(e.target.value)} placeholder="Contexte / infos (ex: Clio dispo en août, 35€/j)" style={inp} />

        <button disabled={busy} onClick={() => void draft()} style={{ padding: '13px', borderRadius: 12, border: 'none', background: C.accent, color: '#06210f', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>{busy ? 'Rédaction…' : '🤖 Rédiger la réponse'}</button>
      </div>

      {reply && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Réponse (modifiable)</div>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={6} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontSize: 14.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={copy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: C.font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📋 Copier</button>
            <button onClick={() => void draft()} disabled={busy} style={{ flex: 1, padding: '12px', borderRadius: 11, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontFamily: C.font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🔄 Régénérer</button>
            <button onClick={send} style={{ flex: 2, padding: '12px', borderRadius: 11, border: 'none', background: '#25D366', color: '#06210f', fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>💬 Envoyer WhatsApp</button>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.15)', border: `1px solid ${C.accent}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap', maxWidth: '90%' }}>{toast}</div>}
    </div>
  );
}
