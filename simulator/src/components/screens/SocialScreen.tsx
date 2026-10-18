import { useState } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Segmented, Field, inputStyle, Btn, Card, SectionTitle } from '../ui/Kit.tsx';

const PLATFORMS = [{ id: 'Instagram', label: 'Instagram' }, { id: 'TikTok', label: 'TikTok' }, { id: 'Facebook', label: 'Facebook' }];
const LANGS = [{ id: 'fr', label: '🇫🇷 Français' }, { id: 'ar', label: '🇩🇿 Arabe' }, { id: 'en', label: '🇬🇧 Anglais' }];

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

  const area = { ...inputStyle, padding: '12px 14px', resize: 'vertical' as const, lineHeight: 1.5 };

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Marketing" title="Contenu social" subtitle="Dzaryx écrit le post + les hashtags, tu copies et tu publies" />}>
      <Card>
        <Field label="Réseau"><Segmented items={PLATFORMS} value={platform} onChange={setPlatform} /></Field>
        <Field label="Langue du post"><Segmented items={LANGS} value={lang} onChange={setLang} /></Field>
        <Field label="Sujet" hint="Ex : promo location été, nouvelle Clio, pack séjour Oran">
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="De quoi parle le post ?" style={inputStyle} />
        </Field>
        <Btn variant="primary" disabled={busy} onClick={() => void gen()} style={{ width: '100%' }}>{busy ? 'Génération…' : '✨ Générer le post'}</Btn>
      </Card>

      {caption && (
        <div style={{ marginTop: 18 }}>
          <SectionTitle>Ton post {platform}</SectionTitle>
          <Field label="Texte (modifiable)"><textarea value={caption} onChange={e => setCaption(e.target.value)} rows={7} style={area} /></Field>
          <Field label="Hashtags"><textarea value={hashtags} onChange={e => setHashtags(e.target.value)} rows={3} style={{ ...area, color: T.accent2, fontSize: 14 }} /></Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => void gen()} disabled={busy} style={{ flex: 1 }}>🔄 Régénérer</Btn>
            <Btn variant="primary" onClick={copyAll} style={{ flex: 2 }}>📋 Copier tout</Btn>
          </div>
        </div>
      )}
    </Screen>
  );
}
