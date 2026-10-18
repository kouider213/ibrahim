import { useState, useEffect } from 'react';
import { business } from '../../services/api.ts';
import { T, Screen, PageHeader, Field, inputStyle, Btn, Card, KpiGrid, Kpi, SectionTitle, tone } from '../ui/Kit.tsx';

export default function NewsletterScreen() {
  const [active, setActive]   = useState<number | null>(null);
  const [subs, setSubs]       = useState<Array<{ email: string; lang?: string }>>([]);
  const [showList, setShowList] = useState(false);
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [testEmail, setTestEmail] = useState('doubakouider@gmail.com');
  const [busy, setBusy]       = useState('');
  const [result, setResult]   = useState('');
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    business.newsletterStats().then(r => setActive(r.active)).catch(() => setActive(null));
    business.newsletterList().then(r => setSubs(r.subscribers ?? [])).catch(() => setSubs([]));
  }, []);
  const FLAG: Record<string, string> = { fr: '🇫🇷', ar: '🇩🇿', en: '🇬🇧' };

  const send = async (test: boolean) => {
    if (!title.trim() || !body.trim()) { setResult('❌ Titre + message requis'); return; }
    setBusy(test ? 'test' : 'all'); setResult('');
    try {
      const r = await business.newsletterSend({ title: title.trim(), body: body.trim(), test, testEmail });
      if (r.error) setResult(`❌ ${r.error}`);
      else if (test) setResult(`✅ Test envoyé à ${r.dest || testEmail}`);
      else setResult(`✅ Envoyé à ${r.sent ?? 0}/${r.total ?? 0} abonnés`);
    } catch (e) { setResult(`❌ ${e instanceof Error ? e.message : 'Erreur'}`); }
    finally { setBusy(''); setConfirmAll(false); }
  };

  const area = { ...inputStyle, padding: '12px 14px', resize: 'vertical' as const, lineHeight: 1.5 };
  const byLang = (l: string) => subs.filter(s => (s.lang || 'fr') === l).length;
  const ok = result.startsWith('✅');

  return (
    <Screen header={<PageHeader eyebrow="Marketing" title="Newsletter" subtitle="Un mail à tous tes abonnés, traduit dans la langue de chacun" />}>
      <KpiGrid cols={3}>
        <Kpi value={active ?? '—'} label="Abonnés actifs" />
        <Kpi value={byLang('fr')} label="🇫🇷 Français" color={T.accent2} />
        <Kpi value={byLang('ar') + byLang('en')} label="🇩🇿 🇬🇧 Autres" color={T.violet} />
      </KpiGrid>

      <SectionTitle>Nouvelle campagne</SectionTitle>
      <Card>
        <Field label="Objet du mail"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex : -15 % sur les locations d'été" style={inputStyle} /></Field>
        <Field label="Message" hint="Texte simple — traduit automatiquement pour chaque abonné">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={area} />
        </Field>
        <Field label="Adresse pour le test"><input value={testEmail} onChange={e => setTestEmail(e.target.value)} type="email" style={inputStyle} /></Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn color={T.warn} disabled={!!busy} onClick={() => void send(true)} style={{ width: '100%' }}>{busy === 'test' ? 'Envoi…' : '✉️ M\'envoyer un test d\'abord'}</Btn>
          {!confirmAll ? (
            <Btn variant="primary" disabled={!!busy} onClick={() => setConfirmAll(true)} style={{ width: '100%' }}>📣 Envoyer à tous {active != null ? `(${active})` : ''}</Btn>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" disabled={!!busy} onClick={() => setConfirmAll(false)} style={{ flex: 1 }}>Annuler</Btn>
              <Btn disabled={!!busy} onClick={() => void send(false)} style={{ flex: 2, background: T.bad, color: '#fff', border: 'none' }}>{busy === 'all' ? 'Envoi en cours…' : `Oui, envoyer à ${active ?? 0}`}</Btn>
            </div>
          )}
        </div>
        {result && <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 13, fontSize: 14, background: tone(ok ? T.ok : T.bad, 0.12), border: `1px solid ${tone(ok ? T.ok : T.bad, 0.4)}`, color: ok ? T.ok : T.bad }}>{result}</div>}
      </Card>

      <div style={{ marginTop: 18 }}>
        <SectionTitle right={<button onClick={() => setShowList(v => !v)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>{showList ? 'Masquer' : `Voir (${subs.length})`}</button>}>Abonnés</SectionTitle>
        {showList && (
          <Card pad={0}>
            {subs.length === 0 ? (
              <div style={{ padding: 14, fontSize: 14, color: T.muted }}>Aucun abonné. Les inscriptions se font via le formulaire en bas du site.</div>
            ) : subs.map((s, i) => (
              <div key={s.email + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i < subs.length - 1 ? `1px solid ${T.line}` : 'none' }}>
                <span style={{ fontSize: 16 }}>{FLAG[s.lang || 'fr'] || '🌐'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Screen>
  );
}
