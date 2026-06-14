import { useState, useEffect, useCallback } from 'react';
import { business, type SiteReview } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  green: '#10b981', red: '#ef4444', gold: '#fbbf24', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};

export default function ReviewsScreen() {
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [counts, setCounts]   = useState({ total: 0, approved: 0, pending: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'pending' | 'approved'>('all');
  const [busy, setBusy]       = useState('');
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

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px', position: 'relative' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.gold, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Réputation</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 14 }}>Avis clients</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { l: 'Note moyenne', v: counts.avg ? `${counts.avg}★` : '—', c: C.gold },
          { l: 'En attente', v: String(counts.pending), c: counts.pending ? C.red : C.muted },
          { l: 'Publiés', v: String(counts.approved), c: C.green },
        ].map(s => (
          <div key={s.l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['all', 'pending', 'approved'] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)} style={{ flex: 1, padding: '8px', borderRadius: 10, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: C.font, background: filter === k ? C.gold : 'rgba(255,255,255,0.04)', color: filter === k ? '#1a1300' : C.muted, border: 'none' }}>{k === 'all' ? 'Tous' : k === 'pending' ? 'En attente' : 'Publiés'}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Chargement…</div>
        : shown.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: C.muted, fontSize: 13 }}>Aucun avis</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map(r => (
              <div key={r.id} style={{ background: C.surface, border: `1px solid ${r.approved ? C.green + '33' : C.border}`, borderRadius: 14, padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.client_name || 'Client'}</div>
                  <div style={{ fontSize: 13, color: C.gold }}>{stars(r.rating)}</div>
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{(r.created_at ?? '').slice(0, 10)}{r.verified ? ' · ✓ vérifié' : ''}{r.approved ? ' · publié' : ' · en attente'}</div>
                {r.comment && <div style={{ fontSize: 12.5, color: '#d8d8de', marginTop: 8, lineHeight: 1.5, fontStyle: 'italic' }}>« {r.comment} »</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {!r.approved
                    ? <button disabled={busy === r.id} onClick={() => void setApproved(r, true)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${C.green}55`, background: `${C.green}18`, color: C.green, fontFamily: C.font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>✓ Publier</button>
                    : <button disabled={busy === r.id} onClick={() => void setApproved(r, false)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: C.font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🔒 Masquer</button>}
                  <button disabled={busy === r.id} onClick={() => { if (confirm('Supprimer cet avis ?')) void del(r); }} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${C.red}44`, background: `${C.red}12`, color: C.red, fontFamily: C.font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {toast && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(251,191,36,0.15)', border: `1px solid ${C.gold}40`, borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.gold, whiteSpace: 'nowrap' }}>{toast}</div>}
    </div>
  );
}
