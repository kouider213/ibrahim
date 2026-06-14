import { useState, useEffect, useRef } from 'react';
import { business } from '../../services/api.ts';

const C = {
  bg: '#0a0a0c', surface: '#16161c', border: 'rgba(255,255,255,0.08)',
  accent: '#10b981', text: '#f5f5f7', muted: '#9b9ba6',
  font: '-apple-system, "Segoe UI", Roboto, sans-serif',
};
const TYPE_COL: Record<string, string> = {
  'Véhicule': '#00e676', 'Client/Résa': '#10b981', 'Bien': '#a78bfa', 'Dossier': '#8b5cf6', 'Import': '#06b6d4', 'Lead': '#f59e0b',
};
type R = { type: string; label: string; sub?: string; ref?: string };

export default function SearchScreen() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try { const r = await business.globalSearch(q.trim()); setResults(r.results ?? []); } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.bg, color: C.text, fontFamily: C.font, padding: '20px 16px 30px' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.18em', color: C.accent, fontWeight: 600, textTransform: 'uppercase' }}>Dzaryx · Recherche</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 14 }}>Tout chercher</div>

      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Nom client, voiture, réf dossier/import, bien…"
        style={{ width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 15px', color: C.text, fontFamily: C.font, fontSize: 15, outline: 'none', marginBottom: 16 }} />

      {loading ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Recherche…</div>
        : q.trim().length < 2 ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Tape au moins 2 lettres</div>
        : results.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Aucun résultat</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {results.map((r, i) => {
              const col = TYPE_COL[r.type] ?? C.muted;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: col, background: `${col}1f`, border: `1px solid ${col}44`, borderRadius: 7, padding: '3px 8px', flexShrink: 0 }}>{r.type}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                    {(r.sub || r.ref) && <div style={{ fontSize: 11, color: C.muted }}>{r.ref ? `${r.ref} · ` : ''}{r.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
