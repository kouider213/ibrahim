import { useState, useEffect, useCallback } from 'react';
import { business, type BlogPost } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#60a5fa', green: '#10b981', red: '#ef4444', text: '#f5f5f7', muted: '#9b9ba6', gold: '#fbbf24',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

export default function BlogScreen() {
  const [posts, setPosts]   = useState<BlogPost[]>([]);
  const [loading, setLoad]  = useState(true);
  const [show, setShow]     = useState(false);
  const [topic, setTopic]   = useState('');
  const [title, setTitle]   = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody]     = useState('');
  const [busy, setBusy]     = useState('');
  const [toast, setToast]   = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    setLoad(true);
    try { const r = await business.blogList(); setPosts(r.posts ?? []); } catch { setPosts([]); }
    finally { setLoad(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (!topic.trim()) { flash('Donne un sujet'); return; }
    setBusy('gen');
    try {
      const r = await business.blogGenerate(topic.trim());
      setTitle(r.article.title); setExcerpt(r.article.excerpt); setBody(r.article.body);
      flash('✅ Article rédigé — relis puis publie');
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur IA'); }
    finally { setBusy(''); }
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) { flash('Titre + contenu requis'); return; }
    setBusy('pub');
    try {
      await business.blogCreate({ title: title.trim(), excerpt: excerpt.trim(), body: body.trim(), published: true });
      flash('✅ Publié sur le site'); setShow(false); setTopic(''); setTitle(''); setExcerpt(''); setBody(''); await load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(''); }
  };

  const toggle = async (p: BlogPost) => {
    setBusy(p.id);
    try { await business.blogToggle(p.id, !p.published); setPosts(xs => xs.map(x => x.id === p.id ? { ...x, published: !p.published } : x)); }
    catch { flash('Erreur'); } finally { setBusy(''); }
  };
  const del = async (p: BlogPost) => {
    setBusy(p.id);
    try { await business.blogDelete(p.id); setPosts(xs => xs.filter(x => x.id !== p.id)); }
    catch { flash('Erreur'); } finally { setBusy(''); }
  };

  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: '11px 13px', color: C.text, fontFamily: C.font, fontSize: 14, outline: 'none' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Contenu</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Blog</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Rédige avec l'IA → publie sur le site (traduit auto à l'affichage)</div>

      <button onClick={() => setShow(s => !s)} style={{ width: '100%', marginBottom: 12, padding: '12px', borderRadius: 12, border: 'none', background: C.accent, color: '#06182e', fontFamily: C.font, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
        {show ? '✕ Fermer' : '✍️ Nouvel article'}
      </button>

      {show && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Sujet (ex: Louer une voiture à Oran)" style={{ ...inp, flex: 2 }} />
            <button disabled={busy === 'gen'} onClick={() => void generate()} style={{ flex: 1, padding: '11px', borderRadius: 11, border: 'none', background: C.gold, color: '#1a1300', fontFamily: C.font, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{busy === 'gen' ? '…' : '🤖 IA'}</button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre" style={inp} />
          <input value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Accroche" style={inp} />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Contenu (HTML accepté)" rows={8} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          <button disabled={busy === 'pub'} onClick={() => void publish()} style={{ padding: '12px', borderRadius: 11, border: 'none', background: C.green, color: '#06210f', fontFamily: C.font, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{busy === 'pub' ? 'Publication…' : '📤 Publier sur le site'}</button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Chargement…</div>
        : posts.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun article</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {posts.map(p => (
              <div key={p.id} style={{ background: C.surface, border: `1px solid ${p.published ? C.green + '33' : C.border}`, borderRadius: 13, padding: 12 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.title_fr || '(sans titre)'}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{(p.created_at ?? '').slice(0, 10)} · {p.published ? '🟢 publié' : '⚪ brouillon'}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                  <button disabled={busy === p.id} onClick={() => void toggle(p)} style={{ flex: 1, padding: '7px', borderRadius: 9, border: `1px solid ${p.published ? C.border : C.green + '55'}`, background: p.published ? 'transparent' : `${C.green}18`, color: p.published ? C.muted : C.green, fontFamily: C.font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p.published ? 'Dépublier' : 'Publier'}</button>
                  <button disabled={busy === p.id} onClick={() => { if (confirm('Supprimer cet article ?')) void del(p); }} style={{ flex: 1, padding: '7px', borderRadius: 9, border: `1px solid ${C.red}44`, background: `${C.red}12`, color: C.red, fontFamily: C.font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(96,165,250,0.15)', border: `1px solid ${C.accent}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap', maxWidth: '90%' }}>{toast}</div>}
    </div>
  );
}
