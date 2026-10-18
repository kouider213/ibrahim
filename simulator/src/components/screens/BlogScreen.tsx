import { useState, useEffect, useCallback } from 'react';
import { business, type BlogPost } from '../../services/api.ts';
import { T, Screen, PageHeader, HeadBtn, Sheet, Field, inputStyle, Btn, Card, Badge, Empty, KpiGrid, Kpi, SectionTitle } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';

export default function BlogScreen() {
  const [posts, setPosts]   = useState<BlogPost[]>([]);
  const [loading, setLoad]  = useState(true);
  const [show, setShow]     = useState(false);
  const [topic, setTopic]   = useState('');
  const [title, setTitle]   = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody]     = useState('');
  const [cover, setCover]   = useState('');
  const [busy, setBusy]     = useState('');
  const [confirmDel, setConfirmDel] = useState('');
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

  const uploadCover = async (file: File) => {
    setBusy('cover');
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(file); });
      const base64 = dataUrl.split(',')[1] || '';
      const out = await business.blogCover({ base64, fileName: file.name, mimeType: file.type });
      setCover(out.url); flash('✅ Affiche ajoutée');
    } catch (e) { flash(e instanceof Error ? e.message : 'Erreur image'); }
    finally { setBusy(''); }
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) { flash('Titre + contenu requis'); return; }
    setBusy('pub');
    try {
      await business.blogCreate({ title: title.trim(), excerpt: excerpt.trim(), body: body.trim(), cover_url: cover || undefined, published: true });
      flash('✅ Publié sur le site'); setShow(false); setTopic(''); setTitle(''); setExcerpt(''); setBody(''); setCover(''); await load();
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

  const area = { ...inputStyle, padding: '12px 14px', resize: 'vertical' as const, lineHeight: 1.5 };
  const live = posts.filter(p => p.published).length;
  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <Screen toast={toast} header={<PageHeader eyebrow="Contenu" title="Blog" subtitle="Dzaryx rédige, tu relis, c'est publié sur le site (traduit automatiquement)" right={<HeadBtn icon="✍️" label="Écrire" onClick={() => setShow(true)} />} />}>
      <KpiGrid cols={3}>
        <Kpi value={posts.length} label="Articles" />
        <Kpi value={live} label="En ligne" color={T.ok} />
        <Kpi value={posts.length - live} label="Brouillons" color={T.warn} />
      </KpiGrid>

      <SectionTitle>Articles</SectionTitle>
      {loading ? <SkeletonCards count={3} height={92} />
        : posts.length === 0 ? <Empty icon="📝" title="Aucun article" text="Un article de blog aide ton site à remonter sur Google." action={<Btn variant="primary" onClick={() => setShow(true)}>✍️ Écrire le premier</Btn>} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map(p => (
              <Card key={p.id} accent={p.published ? T.ok : T.warn}>
                {p.cover_url && <div style={{ margin: '-14px -14px 12px', aspectRatio: '16 / 7', background: `url(${p.cover_url}) center/cover` }} />}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{p.title_fr || '(sans titre)'}</div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{fmt(p.created_at)}</div>
                  </div>
                  <Badge color={p.published ? T.ok : T.warn}>{p.published ? 'En ligne' : 'Brouillon'}</Badge>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Btn variant={p.published ? 'ghost' : 'soft'} color={T.ok} disabled={busy === p.id} onClick={() => void toggle(p)} style={{ flex: 1 }}>{p.published ? 'Retirer du site' : '📤 Publier'}</Btn>
                  <Btn variant="danger" disabled={busy === p.id} onClick={() => { if (confirmDel === p.id) { void del(p); setConfirmDel(''); } else { setConfirmDel(p.id); setTimeout(() => setConfirmDel(c => c === p.id ? '' : c), 3000); } }} style={{ flex: 1, ...(confirmDel === p.id ? { background: T.bad, color: '#fff' } : {}) }}>{confirmDel === p.id ? 'Confirmer ?' : 'Supprimer'}</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}

      {show && (
        <Sheet title="Nouvel article" subtitle="Donne un sujet, Dzaryx écrit tout" onClose={() => setShow(false)}
          footer={<Btn variant="primary" disabled={busy === 'pub'} onClick={() => void publish()} style={{ width: '100%' }}>{busy === 'pub' ? 'Publication…' : '📤 Publier sur le site'}</Btn>}>
          <Field label="Sujet">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ex : Louer une voiture à Oran" style={{ ...inputStyle, flex: 1 }} />
              <Btn color={T.warn} disabled={busy === 'gen'} onClick={() => void generate()}>{busy === 'gen' ? '⏳' : '🤖 Rédiger'}</Btn>
            </div>
          </Field>
          <Field label="Titre"><input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} /></Field>
          <Field label="Accroche" hint="1 phrase qui donne envie de lire"><input value={excerpt} onChange={e => setExcerpt(e.target.value)} style={inputStyle} /></Field>
          <Field label="Contenu"><textarea value={body} onChange={e => setBody(e.target.value)} rows={9} style={area} /></Field>
          <Field label="Photo d'affiche">
            {cover && <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 13, background: `url(${cover}) center/cover`, border: `1px solid ${T.line}`, marginBottom: 8 }} />}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 13, border: `1px dashed ${T.lineStrong}`, color: T.accent, fontSize: 14, fontWeight: 700, cursor: busy === 'cover' ? 'wait' : 'pointer' }}>
              {busy === 'cover' ? 'Envoi…' : cover ? '🖼️ Changer la photo' : '🖼️ Ajouter une photo'}
              <input type="file" accept="image/*" disabled={busy === 'cover'} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.currentTarget.value = ''; }} />
            </label>
          </Field>
        </Sheet>
      )}
    </Screen>
  );
}
