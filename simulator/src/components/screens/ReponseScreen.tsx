import { useState } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Segmented, Field, inputStyle, Btn, Card, SectionTitle } from '../ui/Kit.tsx';

const LANGS = [{ id: 'fr', label: '🇫🇷 Français' }, { id: 'ar', label: '🇩🇿 Darija' }, { id: 'en', label: '🇬🇧 Anglais' }];
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

  const area = { ...inputStyle, padding: '12px 14px', resize: 'vertical' as const, lineHeight: 1.5 };

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Assistant" title="Réponse client" subtitle="Dzaryx rédige dans la langue du client → tu relis → WhatsApp" />}>
      <Card>
        <Field label="Message du client" hint="Colle ce qu'il a écrit (WhatsApp, mail, Facebook…)">
          <textarea value={clientMsg} onChange={e => setMsg(e.target.value)} placeholder="Bonjour, la Clio est dispo du 3 au 7 août ?" rows={4} style={area} />
        </Field>
        <Field label="Infos utiles (facultatif)">
          <input value={context} onChange={e => setCtx(e.target.value)} placeholder="Ex : Clio dispo en août, 35 €/jour" style={inputStyle} />
        </Field>
        <Field label="Langue"><Segmented items={LANGS} value={lang} onChange={setLang} /></Field>
        <Field label="Ton"><Segmented items={TONES} value={tone} onChange={setTone} /></Field>
        <Field label="Téléphone du client (facultatif)" hint="Pour ouvrir WhatsApp directement sur sa conversation">
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+213 …" style={inputStyle} />
        </Field>
        <Btn variant="primary" disabled={busy} onClick={() => void draft()} style={{ width: '100%' }}>{busy ? 'Rédaction…' : '🤖 Rédiger la réponse'}</Btn>
      </Card>

      {reply && (
        <div style={{ marginTop: 18 }}>
          <SectionTitle>Réponse proposée</SectionTitle>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={7} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ ...area, fontSize: 15, lineHeight: 1.6, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Btn variant="ghost" onClick={copy} style={{ flex: 1 }}>📋 Copier</Btn>
            <Btn variant="ghost" onClick={() => void draft()} disabled={busy} style={{ flex: 1 }}>🔄 Autre version</Btn>
          </div>
          <Btn onClick={send} style={{ width: '100%', background: '#25D366', color: '#04210f', border: 'none' }}>💬 Envoyer sur WhatsApp</Btn>
          <div style={{ fontSize: 12, color: T.faint, marginTop: 8, textAlign: 'center' }}>Rien ne part sans toi : WhatsApp s'ouvre avec le texte prêt.</div>
        </div>
      )}
    </Screen>
  );
}
