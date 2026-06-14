import { useState, useEffect } from 'react';
import { business } from '../../services/api.ts';
import { Hero } from '../ui/Premium.tsx';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', text: '#f5f5f7', muted: '#9b9ba6', gold: '#fbbf24',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

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

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ margin: '-20px -16px 0' }}><Hero eyebrow="Dzaryx · Marketing" title="Newsletter" /></div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
        {active == null ? 'Chargement…' : `${active} abonné${active !== 1 ? 's' : ''} actif${active !== 1 ? 's' : ''}`} · envoyé dans la langue de chaque abonné
      </div>

      {/* Liste des abonnés (emails) */}
      <button onClick={() => setShowList(v => !v)} style={{ width: '100%', marginBottom: 14, padding: '10px 14px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: C.font, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
        {showList ? '▾' : '▸'} Voir les abonnés ({subs.length})
      </button>
      {showList && (
        <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {subs.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12.5, color: C.muted }}>Aucun abonné. Les inscriptions se font via le formulaire du site (pied de page).</div>
          ) : subs.map((s, i) => (
            <div key={s.email + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: i < subs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ fontSize: 13 }}>{FLAG[s.lang || 'fr'] || '🌐'}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Objet de la campagne" style={inp} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Message (texte simple, traduit automatiquement par langue d'abonné)" rows={8} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
        <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Email de test" style={inp} />
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: -4 }}>« Test » envoie seulement à cet email. « À tous » envoie aux {active ?? 0} abonnés ci-dessus.</div>

        <button disabled={!!busy} onClick={() => void send(true)} style={{ padding: '12px', borderRadius: 12, border: `1px solid ${C.gold}55`, background: `${C.gold}14`, color: C.gold, fontFamily: C.font, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {busy === 'test' ? 'Envoi…' : '✉️ Envoyer un test'}
        </button>

        {!confirmAll ? (
          <button disabled={!!busy} onClick={() => setConfirmAll(true)} style={{ padding: '13px', borderRadius: 12, border: 'none', background: C.accent, color: '#06210f', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            📣 Envoyer à tous {active != null ? `(${active})` : ''}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={!!busy} onClick={() => setConfirmAll(false)} style={{ flex: 1, padding: '13px', borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
            <button disabled={!!busy} onClick={() => void send(false)} style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontFamily: C.font, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{busy === 'all' ? 'Envoi en cours…' : `Confirmer l'envoi à tous`}</button>
          </div>
        )}

        {result && <div style={{ marginTop: 6, padding: '10px 14px', borderRadius: 12, background: result.startsWith('✅') ? `${C.accent}14` : 'rgba(239,68,68,0.12)', border: `1px solid ${result.startsWith('✅') ? C.accent + '40' : 'rgba(239,68,68,0.4)'}`, fontSize: 12.5, color: result.startsWith('✅') ? C.accent : '#ef4444' }}>{result}</div>}
      </div>
    </div>
  );
}
