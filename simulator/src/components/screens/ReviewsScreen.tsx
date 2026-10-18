import { useState, useEffect, useCallback } from 'react';
import { business, type SiteReview } from '../../services/api.ts';
import { T, Screen, PageHeader, HeadBtn, Sheet, Field, inputStyle, Btn, Card, Badge, Empty, KpiGrid, Kpi, SectionTitle, Segmented, Chips, Avatar, tone } from '../ui/Kit.tsx';
import { SkeletonCards } from '../ui/Premium.tsx';


export default function ReviewsScreen() {
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [counts, setCounts]   = useState({ total: 0, approved: 0, pending: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'pending' | 'approved'>('all');
  const [busy, setBusy]       = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [toast, setToast]     = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await business.reviewsList(); setReviews(r.reviews ?? []); setCounts(r.counts ?? { total: 0, approved: 0, pending: 0, avg: 0 }); }
    catch { setReviews([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setApproved = async (r: SiteReview, approved: boolean) => {
    setBusy(r.id);
    try { await business.reviewSetApproved(r.id, approved); await load(); flash(approved ? '✅ Publié' : '🔒 Masqué'); }
    catch { flash('Erreur'); } finally { setBusy(''); }
  };
  const del = async (r: SiteReview) => {
    setBusy(r.id);
    try { await business.reviewDelete(r.id); setReviews(xs => xs.filter(x => x.id !== r.id)); await load(); }
    catch { flash('Erreur'); } finally { setBusy(''); }
  };

  const shown = reviews.filter(r => filter === 'all' || (filter === 'approved' ? r.approved : !r.approved));
  const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, Math.round(n)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n))));

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const FILTERS = [{ id: 'all' as const, label: 'Tous', count: counts.total }, { id: 'pending' as const, label: 'À valider', count: counts.pending }, { id: 'approved' as const, label: 'Publiés', count: counts.approved }];

  return (
    <Screen toast={toast} header={<>
      <PageHeader eyebrow="Réputation" title="Avis clients" subtitle="Les avis laissés sur le site : tu choisis ceux qui s'affichent" />
      <div style={{ padding: '0 16px 10px' }}><Segmented items={FILTERS} value={filter} onChange={setFilter} /></div>
    </>}>
      <KpiGrid cols={3}>
        <Kpi value={counts.avg ? <span>{counts.avg}<span style={{ color: T.warn }}> ★</span></span> : '—'} label="Note moyenne" color={T.warn} />
        <Kpi value={counts.pending} label="À valider" color={counts.pending ? T.bad : T.muted} />
        <Kpi value={counts.approved} label="Sur le site" color={T.ok} />
      </KpiGrid>
      {loading ? <SkeletonCards count={5} height={92} />
        : shown.length === 0 ? <Empty icon="⭐" title={filter === 'pending' ? 'Rien à valider' : 'Aucun avis'} text="Les avis arrivent après chaque location (lien envoyé au client)." />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map(r => (
              <Card key={r.id} accent={r.approved ? T.ok : T.warn}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={r.client_name || 'Client'} color={r.rating >= 4 ? T.ok : r.rating >= 3 ? T.warn : T.bad} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{r.client_name || 'Client'}{r.verified && <span style={{ color: T.ok, fontSize: 12.5, fontWeight: 600 }}> · ✓ vérifié</span>}</div>
                    <div style={{ fontSize: 15, color: T.warn, letterSpacing: 1 }}>{stars(r.rating)}</div>
                  </div>
                  <Badge color={r.approved ? T.ok : T.warn}>{r.approved ? 'Publié' : 'À valider'}</Badge>
                </div>
                {r.comment && <div style={{ fontSize: 14.5, color: '#dbe4f5', marginTop: 10, lineHeight: 1.55, fontStyle: 'italic' }}>« {r.comment} »</div>}
                <div style={{ fontSize: 12.5, color: T.faint, marginTop: 8 }}>{fmt(r.created_at)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {!r.approved
                    ? <Btn color={T.ok} disabled={busy === r.id} onClick={() => void setApproved(r, true)} style={{ flex: 1 }}>✓ Publier</Btn>
                    : <Btn variant="ghost" disabled={busy === r.id} onClick={() => void setApproved(r, false)} style={{ flex: 1 }}>🔒 Masquer</Btn>}
                  <Btn variant="danger" disabled={busy === r.id} onClick={() => { if (confirmDel === r.id) { void del(r); setConfirmDel(''); } else { setConfirmDel(r.id); setTimeout(() => setConfirmDel(c => c === r.id ? '' : c), 3000); } }} style={{ flex: 1, ...(confirmDel === r.id ? { background: T.bad, color: '#fff' } : {}) }}>{confirmDel === r.id ? 'Confirmer ?' : 'Supprimer'}</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
    </Screen>
  );
}
